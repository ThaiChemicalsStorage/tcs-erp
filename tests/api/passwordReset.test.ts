import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * กู้รหัสผ่านผ่าน Super Admin (2026-09-24) — สิ่งที่ตรึงไว้คือจุดที่พังแล้วกลายเป็นช่องโหว่หรือกลายเป็นฟีเจอร์ที่ไม่มีใครเห็น:
 *  - หน้าลืมรหัสผ่านตอบเหมือนกันทุกกรณี (ไม่บอกว่าชื่อผู้ใช้มีจริงไหม) และจำกัดจำนวนครั้งต่อ IP
 *  - คำขอถึง Super Admin (แจ้งเตือน) ขอซ้ำไม่สร้างแถว/แจ้งเตือนซ้ำ
 *  - มีแต่ Super Admin ที่ดู/ออกรหัสได้ — บทบาทที่มี `users:manage` แต่ไม่ใช่ Super Admin ก็ไม่ได้
 *  - รหัสชั่วคราวใช้เข้าได้ รหัสเดิมใช้ไม่ได้ เซสชันเดิมถูกตัด ต้องตั้งรหัสใหม่ และตัวรหัสไม่ไปโผล่ใน audit log
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let adminCookie = "";
let bobCookie = "";

function cookieOf(res: Response): string {
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function call(method: string, path: string, body?: unknown, cookie = adminCookie, ip = "10.0.0.1") {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, "x-forwarded-for": ip, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, res };
}

async function login(identifier: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.9.9" },
    body: JSON.stringify({ identifier, password }),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined, cookie: cookieOf(res) };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const setup = await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Super Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  adminCookie = cookieOf(setup);
  const created = await call("POST", "/api/users", {
    employeeId: "E002", fullName: "Bob Store", username: "bob", email: "bob@test.local", password: "old-pass-1", roleKey: "viewer",
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  // administrator มี users:manage แต่ไม่ใช่ Super Admin
  expect((await call("POST", "/api/users", {
    employeeId: "E003", fullName: "Ann Admin", username: "ann", email: "ann@test.local", password: "ann-pass-1", roleKey: "administrator",
  })).status).toBe(201);
  bobCookie = (await login("bob", "old-pass-1")).cookie;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await client.close();
  await mongod.stop();
});

describe("กู้รหัสผ่านผ่าน Super Admin", () => {
  let requestId = "";

  it("ขอกู้รหัสได้โดยไม่ต้องล็อกอิน · ชื่อที่ไม่มีในระบบได้คำตอบเดียวกัน", async () => {
    const ok = await call("POST", "/api/auth/forgot-password", { identifier: "BOB", note: "โทร 081" }, "");
    expect(ok.status).toBe(200);
    const ghost = await call("POST", "/api/auth/forgot-password", { identifier: "nobody" }, "");
    expect(ghost.status).toBe(200);
    expect(ghost.body).toEqual(ok.body);
    expect((await call("POST", "/api/auth/forgot-password", { identifier: "" }, "")).status).toBe(400);
  });

  it("Super Admin ได้แจ้งเตือนหนึ่งครั้ง และขอซ้ำไม่สร้างแถวใหม่", async () => {
    expect((await call("POST", "/api/auth/forgot-password", { identifier: "bob@test.local" }, "")).status).toBe(200);
    const list = await call("GET", "/api/users/password-resets");
    expect(list.status).toBe(200);
    expect(list.body.requests).toHaveLength(1);
    expect(list.body.requests[0]).toMatchObject({ username: "bob", status: "pending", requestCount: 2, note: "โทร 081" });
    requestId = list.body.requests[0].id;
    const notifs = await client.db("tcs_erp").collection("notifications").find({ type: "password_reset_requested" }).toArray();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].relatedPasswordResetRequestId).toBe(requestId);
  });

  it("เฉพาะ Super Admin — ผู้ใช้ทั่วไปและ administrator ที่มี users:manage ก็ไม่ได้", async () => {
    expect((await call("GET", "/api/users/password-resets", undefined, bobCookie)).status).toBe(403);
    const ann = await login("ann", "ann-pass-1");
    expect((await call("GET", "/api/users/password-resets", undefined, ann.cookie)).status).toBe(403);
    expect((await call("POST", `/api/users/password-resets/${requestId}/issue`, undefined, ann.cookie)).status).toBe(403);
  });

  it("ออกรหัสชั่วคราว: รหัสเดิมใช้ไม่ได้ · เซสชันเดิมหลุด · รหัสใหม่เข้าได้และต้องเปลี่ยนรหัส · ไม่อยู่ใน audit log", async () => {
    const issued = await call("POST", `/api/users/password-resets/${requestId}/issue`);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const temp: string = issued.body.temporaryPassword;
    expect(temp).toMatch(/^[A-Za-z2-9]{10}$/);
    expect(issued.body.request.status).toBe("resolved");

    expect((await call("GET", "/api/auth/session", undefined, bobCookie)).body.user).toBeNull();
    expect((await login("bob", "old-pass-1")).status).toBe(401);
    const fresh = await login("bob", temp);
    expect(fresh.status).toBe(200);
    expect(fresh.body.user.mustChangePassword).toBe(true);

    const audit = await client.db("tcs_erp").collection("audit_log").find({}).toArray();
    expect(JSON.stringify(audit)).not.toContain(temp);
    expect(audit.some((a) => a.action === "Password Reset Issued")).toBe(true);

    const changed = await call("PATCH", `/api/users/${fresh.body.user.id}`, { password: "brand-new-1", currentPassword: temp }, fresh.cookie);
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
  });

  it("คำขอที่จบแล้วกดซ้ำไม่ได้", async () => {
    expect((await call("POST", `/api/users/password-resets/${requestId}/issue`)).status).toBe(409);
    expect((await call("POST", `/api/users/password-resets/${requestId}/dismiss`)).status).toBe(409);
  });

  // รีวิวโค้ด 2026-09-24: เดิมเช็คสถานะแล้วค่อยเขียน — สองคนกดพร้อมกันได้รหัสสองชุด ชุดแรกที่แจ้งผู้ใช้ไปใช้ไม่ได้
  it("Super Admin สองคนกดออกรหัสพร้อมกัน — ได้รหัสชุดเดียว และรหัสนั้นใช้เข้าได้จริง", async () => {
    expect((await call("POST", "/api/auth/forgot-password", { identifier: "ann" }, "", "10.3.3.3")).status).toBe(200);
    const list = await call("GET", "/api/users/password-resets");
    const annReq = list.body.requests.find((r: { username: string; status: string }) => r.username === "ann" && r.status === "pending");
    expect(annReq).toBeTruthy();
    const both = await Promise.all([
      call("POST", `/api/users/password-resets/${annReq.id}/issue`),
      call("POST", `/api/users/password-resets/${annReq.id}/issue`),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = both.find((r) => r.status === 200)!;
    expect((await login("ann", winner.body.temporaryPassword)).status).toBe(200);
  });

  it("จำกัด 5 ครั้งต่อ IP ต่อ 15 นาที", async () => {
    const ip = "10.7.7.7";
    for (let i = 0; i < 5; i += 1) {
      expect((await call("POST", "/api/auth/forgot-password", { identifier: "someone" }, "", ip)).status).toBe(200);
    }
    expect((await call("POST", "/api/auth/forgot-password", { identifier: "someone" }, "", ip)).status).toBe(429);
    expect((await call("POST", "/api/auth/forgot-password", { identifier: "someone" }, "", "10.7.7.8")).status).toBe(200);
  });
});
