import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for per-user Gmail App Password settings (2026-08-07):
 *   - PATCH /api/users/:id { emailAppPassword } — self-only (403 even for a super admin), "" clears
 *   - the credential never leaks: responses expose only the derived `hasEmailAppPassword` boolean
 *   - POST /api/users/:id/email-test — self-only, 400 when unconfigured
 * Same in-memory MongoDB + real-HTTP harness as expressServer.test.ts. nodemailer is mocked so no
 * real SMTP connection is ever attempted.
 */

const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock, close: vi.fn() })) },
}));

const APP_PASSWORD = "abcd efgh ijkl mnop";

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let adminId: string;
let otherId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  process.env.EMAIL_CRED_SECRET = "test-only-email-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const setup = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  expect(setup.status).toBe(201);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const { user } = (await login.json()) as { user: { id: string } };
  adminId = user.id;

  const roles = await fetch(`${baseUrl}/api/roles`, { headers: { cookie: adminCookie } });
  const roleList = ((await roles.json()) as { roles: { key: string }[] }).roles;
  const created = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      employeeId: "E002", fullName: "Other", username: "other", email: "other@test.local",
      password: "correct-horse-2", roleKey: roleList[roleList.length - 1].key,
    }),
  });
  expect(created.status).toBe(201);
  otherId = ((await created.json()) as { user: { id: string } }).user.id;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("PATCH /api/users/:id emailAppPassword", () => {
  it("self-set works, exposes only hasEmailAppPassword, never the credential", async () => {
    const r = await fetch(`${baseUrl}/api/users/${adminId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ emailAppPassword: APP_PASSWORD }),
    });
    expect(r.status).toBe(200);
    const bodyText = await r.text();
    expect(bodyText).not.toContain("emailAppPasswordEnc");
    expect(bodyText).not.toContain("abcdefghijklmnop");
    const { user } = JSON.parse(bodyText) as { user: { hasEmailAppPassword: boolean } };
    expect(user.hasEmailAppPassword).toBe(true);
  });

  it("the full directory (GET /api/users) leaks nothing either", async () => {
    const r = await fetch(`${baseUrl}/api/users`, { headers: { cookie: adminCookie } });
    const bodyText = await r.text();
    expect(bodyText).not.toContain("emailAppPasswordEnc");
    expect(bodyText).not.toContain("passwordHash");
    const { users } = JSON.parse(bodyText) as { users: { id: string; hasEmailAppPassword: boolean }[] };
    expect(users.find((u) => u.id === adminId)?.hasEmailAppPassword).toBe(true);
    expect(users.find((u) => u.id === otherId)?.hasEmailAppPassword).toBe(false);
  });

  it("rejects a malformed App Password with 400", async () => {
    const r = await fetch(`${baseUrl}/api/users/${adminId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ emailAppPassword: "too-short-1" }),
    });
    expect(r.status).toBe(400);
  });

  it("setting someone else's credential is 403 even for a super admin", async () => {
    const r = await fetch(`${baseUrl}/api/users/${otherId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ emailAppPassword: APP_PASSWORD }),
    });
    expect(r.status).toBe(403);
  });
});

describe("POST /api/users/:id/email-test", () => {
  it("sends to one's own address through the mocked transport", async () => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue(undefined);
    const r = await fetch(`${baseUrl}/api/users/${adminId}/email-test`, { method: "POST", headers: { cookie: adminCookie } });
    expect(r.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const args = sendMailMock.mock.calls[0][0] as { from: { address: string }; to: string };
    expect(args.from.address).toBe("admin@test.local");
    expect(args.to).toBe("admin@test.local");
  });

  it("is self-only (403 for another user's id)", async () => {
    const r = await fetch(`${baseUrl}/api/users/${otherId}/email-test`, { method: "POST", headers: { cookie: adminCookie } });
    expect(r.status).toBe(403);
  });

  it("maps a Gmail auth rejection (EAUTH) to a 400 with a Thai hint", async () => {
    sendMailMock.mockReset();
    sendMailMock.mockRejectedValue(Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 }));
    const r = await fetch(`${baseUrl}/api/users/${adminId}/email-test`, { method: "POST", headers: { cookie: adminCookie } });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("App Password");
  });

  it("clearing with \"\" flips hasEmailAppPassword back to false and email-test becomes 400", async () => {
    const clear = await fetch(`${baseUrl}/api/users/${adminId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ emailAppPassword: "" }),
    });
    expect(clear.status).toBe(200);
    expect(((await clear.json()) as { user: { hasEmailAppPassword: boolean } }).user.hasEmailAppPassword).toBe(false);

    const r = await fetch(`${baseUrl}/api/users/${adminId}/email-test`, { method: "POST", headers: { cookie: adminCookie } });
    expect(r.status).toBe(400);
  });
});
