import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for "1 user เข้าใช้ได้ทีละเครื่องเดียว" (2026-08-31), asked for by the owner on
 * 2026-08-28. Auth was pure JWT before this: the token carried `{ sub }` and nothing else, so a
 * cookie could not be revoked at all until it expired seven days later.
 *
 * The five things pinned here are the ones that would silently undo the feature:
 *
 *   1. **A second login kills the first session, in one request.** Not on the next token refresh,
 *      not after `exp` — the check sits next to the existing `status !== "active"` lookup, which is
 *      why deactivating a user already takes effect immediately.
 *   2. **The `sid` claim survives the rolling refresh.** `refreshSessionCookie()` re-signs the
 *      cookie on *every* request; if it dropped `sid`, the very next request would look like a
 *      legacy token and log the user out with no explanation. This is the trap `docs/TODO.md`
 *      flagged before the work started, so it gets a test that walks two requests, not one.
 *   3. **The kicked-out device is told why.** `GET /api/auth/session` reports
 *      `signedOutReason: "superseded"`, which is what separates "someone else signed in" from
 *      "your session expired" for a person who has no idea why they were thrown out.
 *   4. **Logout revokes the row too**, not just the cookie — otherwise a copied cookie outlives the
 *      logout that was supposed to end it.
 *   5. **A token with no `sid` is refused.** Cookies issued before this change cannot be honoured
 *      without leaving the restriction bypassable for a week.
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;

function cookieOf(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function login(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  expect(res.status).toBe(200);
  return cookieOf(res);
}

async function session(cookie: string): Promise<{ user: unknown; needsSetup: boolean; signedOutReason: string | null }> {
  const res = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return (await res.json()) as { user: unknown; needsSetup: boolean; signedOutReason: string | null };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("1 user เข้าใช้ได้ทีละเครื่องเดียว", () => {
  it("เข้าสู่ระบบจากเครื่องที่สอง เตะเครื่องแรกออกทันทีในหนึ่ง request", async () => {
    const first = await login();
    expect((await session(first)).user).not.toBeNull();

    const second = await login();
    expect((await session(second)).user).not.toBeNull();

    // ไม่ต้องรอ token หมดอายุ ไม่ต้องรอ refresh — request ถัดไปของเครื่องแรกเห็นผลเลย
    expect((await session(first)).user).toBeNull();
    const guarded = await fetch(`${baseUrl}/api/quotes`, { headers: { cookie: first } });
    expect(guarded.status).toBe(401);
  });

  it("เครื่องที่โดนเตะรู้ว่าโดนเตะ ไม่ใช่แค่ 'เซสชันหมดอายุ'", async () => {
    const first = await login();
    await login();
    expect((await session(first)).signedOutReason).toBe("superseded");
  });

  it("เครื่องที่ยังใช้ได้อยู่ไม่มีเหตุผลอะไรติดมา", async () => {
    const current = await login();
    const s = await session(current);
    expect(s.user).not.toBeNull();
    expect(s.signedOutReason ?? null).toBeNull();
  });

  it("ไม่เคยล็อกอินเลย ก็ไม่ได้แปลว่าโดนเตะ", async () => {
    const s = await session("");
    expect(s.user).toBeNull();
    expect(s.signedOutReason ?? null).toBeNull();
  });

  it("🔴 `sid` ต้องไม่หายไปกับการ re-sign คุกกี้ทุก request", async () => {
    const cookie = await login();
    // request แรกทำให้เซิร์ฟเวอร์ re-sign คุกกี้ (rolling expiration)
    const first = await fetch(`${baseUrl}/api/quotes`, { headers: { cookie } });
    expect(first.status).toBe(200);
    const refreshed = cookieOf(first);
    expect(refreshed).not.toBe("");

    // ใช้คุกกี้ที่ถูก re-sign มาแล้วต่อ — ถ้า `sid` หายไป request นี้จะเป็น 401
    const second = await fetch(`${baseUrl}/api/quotes`, { headers: { cookie: refreshed } });
    expect(second.status).toBe(200);
    expect((await session(refreshed)).user).not.toBeNull();
  });

  it("กดออกจากระบบแล้วคุกกี้ใบเดิมใช้ไม่ได้อีก แม้จะยังไม่หมดอายุ", async () => {
    const cookie = await login();
    const out = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie } });
    expect(out.status).toBe(204);
    // คุกกี้ก้อนเดิมยังอยู่ในมือ แต่แถวเซสชันถูกยกเลิกไปแล้ว
    expect((await session(cookie)).user).toBeNull();
    // และไม่ใช่ "โดนเตะ" — กดออกเอง ไม่ต้องอธิบายอะไร
    expect((await session(cookie)).signedOutReason ?? null).toBeNull();
  });

  it("token ที่ไม่มี `sid` (คุกกี้เก่าก่อน 2026-08-31) ใช้ไม่ได้", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const { usersCollection } = await import("../../api/_lib/collections.js");
    const users = await usersCollection();
    const admin = (await users.findOne({ username: "admin" }))!;
    const legacy = jwt.sign({ sub: admin._id.toString() }, "test-only-secret", { expiresIn: "7d" });
    const res = await fetch(`${baseUrl}/api/quotes`, { headers: { cookie: `tcs_erp_session=${legacy}` } });
    expect(res.status).toBe(401);
  });

  it("เซสชันที่ถูกแทนที่ถูกทำเครื่องหมายไว้ ไม่ได้ลบทิ้ง — ไม่งั้นบอกสาเหตุไม่ได้", async () => {
    // ล็อกอินในเทสต์นี้เอง เพราะเทสต์ก่อนหน้าปิดเซสชันสุดท้ายทิ้งไปแล้ว
    await login();
    const { sessionsCollection } = await import("../../api/_lib/collections.js");
    const sessions = await sessionsCollection();
    const rows = await sessions.find({}).toArray();
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.some((r) => r.revokedReason === "superseded")).toBe(true);
    // มีเซสชันที่ยังใช้ได้ได้แค่ใบเดียวต่อผู้ใช้หนึ่งคน — นั่นคือทั้งหมดที่ฟีเจอร์นี้พูด
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    // `expiresAt` ต้องเป็น Date จริง ไม่ใช่ข้อความ ไม่งั้น TTL index ไม่เคยลบอะไรเลย
    expect(rows[0].expiresAt).toBeInstanceOf(Date);
  });
});
