import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration test for the standalone Express server (server/app.ts) — real HTTP requests through
 * real routing, JSON body parsing, and cookie round-trips, against the same in-memory MongoDB
 * harness as loginRateLimit.test.ts. This is what guards the Vercel → Express migration: it proves
 * the unchanged api/ handlers behave identically when mounted under Express.
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  // Import AFTER the env vars point at the memory server (api/_lib/mongodb.ts connects lazily,
  // but late-importing keeps the ordering airtight) — same pattern as loginRateLimit.test.ts.
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("standalone Express server", () => {
  let sessionCookie: string;

  it("routes /api/auth and parses JSON bodies: setup then login over real HTTP", async () => {
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
    expect(login.status).toBe(200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("tcs_erp_session=");
    sessionCookie = setCookie.split(";")[0];
  });

  it("an authenticated request flows through: GET /api/quotes with the session cookie", async () => {
    const r = await fetch(`${baseUrl}/api/quotes`, { headers: { cookie: sessionCookie } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ quotes: [] });
  });

  it("RBAC still guards routes: GET /api/quotes without a cookie is 401", async () => {
    const r = await fetch(`${baseUrl}/api/quotes`);
    expect(r.status).toBe(401);
    expect(((await r.json()) as { error: string }).error).toBe("Not authenticated");
  });

  it("sub-paths keep the full URL (multi-resource handlers dispatch on raw pathname)", async () => {
    // /api/scope-of-works is served by the quotes handler via its raw-pathname dispatch — if the
    // Express mount stripped req.url, this would fall through to quotes logic and not 401 cleanly.
    const r = await fetch(`${baseUrl}/api/scope-of-works`);
    expect(r.status).toBe(401);
  });

  it("unknown /api resources are a JSON 404, not the SPA fallback", async () => {
    const r = await fetch(`${baseUrl}/api/no-such-resource`);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: string }).error).toBe("Not found");
  });

  it("query strings reach handlers as plain strings: GET /api/search?q=", async () => {
    const r = await fetch(`${baseUrl}/api/search?q=test`, { headers: { cookie: sessionCookie } });
    expect(r.status).toBe(200);
  });

  it("an oversized JSON body is rejected with a JSON 413, not an HTML error page", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "x".repeat(26 * 1024 * 1024) }),
    });
    expect(r.status).toBe(413);
    expect(r.headers.get("content-type")).toContain("application/json");
  });
});
