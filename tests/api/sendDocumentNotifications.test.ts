import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ObjectId } from "mongodb";

/**
 * Integration tests for POST /api/scope-of-works/:id/send-documents after the 2026-08-07
 * person-to-person rewrite: the email goes out from the acting user's own Gmail (stored App
 * Password), `additional` recipients send with zero checked departments, threading persists, and
 * an all-EAUTH fan-out surfaces as a 400 instead of {ok:true, sentCount:0}. nodemailer is mocked.
 */

const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock, close: vi.fn() })) },
}));

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let adminId: string;
let recipientAId: string;
let recipientBId: string;

/** Minimal scope_of_works document — MongoDB enforces no schema; only the fields the send handler
 * actually reads need to exist (normalizers default the rest). scopeNumber has a unique index,
 * so each insert gets its own. */
let scopeSeq = 0;
async function insertScope(fields: Record<string, unknown>): Promise<string> {
  const { scopeOfWorksCollection } = await import("../../api/_lib/collections.js");
  const col = await scopeOfWorksCollection();
  scopeSeq += 1;
  const base = {
    scopeNumber: `SOW-TEST-${scopeSeq}`, quotationId: "QT-TEST-1", quotationNumber: "QT-TEST-1",
    jobTypeCode: "TA", jobTypeName: "FRP Tank", deliveryDate: "",
    customerSnapshot: { companyName: "ACME Co." },
    documentRecipientMessage: "", attachments: [],
    status: "Final", isDeleted: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...fields,
  };
  const result = await col.insertOne(base as never);
  return (result.insertedId as ObjectId).toString();
}

async function sendDocuments(scopeId: string) {
  return fetch(`${baseUrl}/api/scope-of-works/${scopeId}/send-documents`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
}

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

  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin Sender", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  adminId = ((await login.json()) as { user: { id: string } }).user.id;

  const roles = await fetch(`${baseUrl}/api/roles`, { headers: { cookie: adminCookie } });
  const roleKey = ((await roles.json()) as { roles: { key: string }[] }).roles.at(-1)!.key;
  const mkUser = async (n: number, email: string) => {
    const r = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        employeeId: `E00${n}`, fullName: `Recipient ${n}`, username: `user${n}`, email,
        password: "correct-horse-2", roleKey, department: "Purchase",
      }),
    });
    return ((await r.json()) as { user: { id: string } }).user.id;
  };
  recipientAId = await mkUser(2, "a@test.local");
  recipientBId = await mkUser(3, "b@test.local");
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("POST /api/scope-of-works/:id/send-documents", () => {
  it("400 with a settings hint when the sender has no App Password configured", async () => {
    const scopeId = await insertScope({ documentRecipients: { additional: [recipientAId] } });
    const r = await sendDocuments(scopeId);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("App Password");
  });

  it("sends one email per recipient from the sender's own address; `additional` needs no checked department", async () => {
    // Configure the sender's App Password (self-only PATCH)
    const patch = await fetch(`${baseUrl}/api/users/${adminId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ emailAppPassword: "abcd efgh ijkl mnop" }),
    });
    expect(patch.status).toBe(200);

    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue(undefined);
    // No checklistGroups at all → defaults, nothing checked — only `additional` carries recipients
    const scopeId = await insertScope({ documentRecipients: { purchase: [recipientBId], additional: [recipientAId] } });
    const r = await sendDocuments(scopeId);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean; sentCount: number; recipientCount: number };
    // purchase is NOT checked in the checklist, so only the additional recipient is emailed
    expect(body).toMatchObject({ ok: true, sentCount: 1, recipientCount: 1 });
    const args = sendMailMock.mock.calls[0][0] as { from: { name: string; address: string }; to: string; subject: string };
    expect(args.from.address).toBe("admin@test.local");
    expect(args.from.name).toBe("Admin Sender");
    expect(args.to).toBe("a@test.local");
    expect(args.subject).not.toMatch(/^Re:/);
  });

  it("a checked department AND additional both send; repeat send threads with Re: + inReplyTo", async () => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue(undefined);
    const { buildDefaultChecklistGroups } = await import("../../src/lib/documentRequirements.js");
    const groups = buildDefaultChecklistGroups("TA").map((g) =>
      g.key === "documentsToSend"
        ? { ...g, options: g.options.map((o) => (o.key === "purchase" ? { ...o, checked: true } : o)) }
        : g,
    );
    const scopeId = await insertScope({
      checklistGroups: groups,
      documentRecipients: { purchase: [recipientBId], additional: [recipientAId] },
    });

    const first = await sendDocuments(scopeId);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { sentCount: number }).sentCount).toBe(2);
    const firstArgs = sendMailMock.mock.calls.map((c) => c[0] as { to: string; messageId?: string; references?: string });
    expect(new Set(firstArgs.map((a) => a.to))).toEqual(new Set(["a@test.local", "b@test.local"]));
    expect(firstArgs[0].messageId).toMatch(/^<sow-/);
    expect(firstArgs[0].references).toBe(firstArgs[0].messageId);

    sendMailMock.mockClear();
    const second = await sendDocuments(scopeId);
    expect(second.status).toBe(200);
    const secondArgs = sendMailMock.mock.calls[0][0] as { subject: string; inReplyTo?: string; references?: string; messageId?: string };
    expect(secondArgs.subject).toMatch(/^Re: /);
    expect(secondArgs.inReplyTo).toBe(firstArgs[0].messageId);
    expect(secondArgs.references).toBe(firstArgs[0].messageId);
    expect(secondArgs.messageId).toBeUndefined();
  });

  it("an all-EAUTH fan-out is a 400 (bad stored App Password), not ok:true with sentCount 0", async () => {
    sendMailMock.mockReset();
    sendMailMock.mockRejectedValue(Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 }));
    const scopeId = await insertScope({ documentRecipients: { additional: [recipientAId, recipientBId] } });
    const r = await sendDocuments(scopeId);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("App Password");
  });

  it("400 when no recipient is effectively selected (unchecked department only)", async () => {
    const scopeId = await insertScope({ documentRecipients: { purchase: [recipientBId] } });
    const r = await sendDocuments(scopeId);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("ผู้รับเพิ่มเติม");
  });
});
