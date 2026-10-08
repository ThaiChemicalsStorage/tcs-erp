import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHmac } from "node:crypto";

/**
 * LINE แจ้งเตือนพนักงาน (2026-10-08, Tuhmo #50) — ผูกบัญชีด้วยรหัส · เว็บฮุคตรวจลายเซ็น · ส่งเฉพาะประเภทที่ต้องลงมือ
 * ถึงเฉพาะคนที่ผูกไว้ · LINE พังต้องไม่ทำให้งานหลักพัง · `lineUserId` ต้องไม่หลุดไปกับรายชื่อพนักงาน
 *
 * LINE API ถูกแทนด้วย fetch ปลอม (ส่งผ่านคำขออื่น ๆ ไปเซิร์ฟเวอร์จริงตามปกติ) — ไม่มีข้อความออกไปที่ LINE จริง
 */

const SECRET = "test-staff-secret";
let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let cookie: string;
let adminId: string;
const realFetch = globalThis.fetch;
let lineCalls: { path: string; body: any }[] = [];
let lineFails = false;

async function api(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const res = await realFetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }), ...extraHeaders },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

function signed(payload: unknown): { raw: string; headers: Record<string, string> } {
  const raw = JSON.stringify(payload);
  return { raw, headers: { "x-line-signature": createHmac("sha256", SECRET).update(raw).digest("base64"), "content-type": "application/json" } };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  process.env.LINE_STAFF_CHANNEL_ACCESS_TOKEN = "test-staff-token";
  process.env.LINE_STAFF_CHANNEL_SECRET = SECRET;
  process.env.APP_URL = "https://erp.test";
  client = new MongoClient(mongod.getUri());
  await client.connect();

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://api.line.me/")) return realFetch(input, init);
    const path = url.replace("https://api.line.me/v2/bot", "");
    lineCalls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (lineFails) return new Response("quota", { status: 429 });
    if (path === "/info") return new Response(JSON.stringify({ displayName: "Huma-ERP แจ้งเตือน", basicId: "@129test" }), { status: 200 });
    return new Response("{}", { status: 200 });
  });

  const { createApp } = await import("../../server/app.js");
  await new Promise<void>((resolve) => { server = createApp().listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await realFetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin One", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await realFetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  adminId = (await client.db("tcs_erp").collection("users").findOne({ username: "admin" }))!._id.toString();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

beforeEach(() => { lineCalls = []; lineFails = false; });

describe("LINE แจ้งเตือนพนักงาน — ผูกบัญชี", () => {
  it("ออกรหัสได้ · เว็บฮุคลายเซ็นผิดได้ 403 · พิมพ์รหัส (ตัวเล็ก/มีช่องว่าง) แล้วผูกสำเร็จและตอบกลับ", async () => {
    const issued = await api("POST", "/api/line/staff/pairing");
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    const code: string = issued.body.pairing.code;
    expect(code).toMatch(/^TCS-[A-Z0-9]{5}$/);
    expect(issued.body).toMatchObject({ configured: true, linked: false, oaBasicId: "@129test", addFriendUrl: "https://line.me/R/ti/p/%40129test" });

    const bad = await api("POST", "/api/line/webhook/staff", JSON.stringify({ events: [] }), { "x-line-signature": "nope", "content-type": "application/json" });
    expect(bad.status).toBe(403);

    const typed = code.toLowerCase().replace("-", " ");
    const { raw, headers } = signed({ events: [{ type: "message", replyToken: "r1", source: { userId: "Uline-admin" }, message: { type: "text", text: typed } }] });
    const hook = await api("POST", "/api/line/webhook/staff", raw, headers);
    expect(hook.status).toBe(200);
    const me = await api("GET", "/api/line/staff/me");
    expect(me.body).toMatchObject({ linked: true, pairing: null });
    expect(lineCalls.some((c) => c.path === "/message/reply" && c.body.replyToken === "r1")).toBe(true);
  });

  it("lineUserId / รหัสผูกบัญชี ไม่หลุดไปกับรายชื่อพนักงานและ /auth/me", async () => {
    const list = await api("GET", "/api/users");
    const meRow = list.body.users.find((u: { id: string }) => u.id === adminId);
    expect(meRow).toBeDefined();
    expect(meRow).not.toHaveProperty("lineUserId");
    expect(meRow).not.toHaveProperty("linePairing");
    const authMe = await api("GET", "/api/auth/me");
    expect(JSON.stringify(authMe.body)).not.toContain("Uline-admin");
  });
});

describe("LINE แจ้งเตือนพนักงาน — ส่งตามแจ้งเตือน", () => {
  it("ส่งเฉพาะประเภทที่ต้องลงมือ ถึงเฉพาะคนที่ผูก LINE · ปุ่มชี้แจ้งเตือนของคนนั้น", async () => {
    const users = client.db("tcs_erp").collection("users");
    const other = await users.insertOne({ username: "u2", fullName: "Two", status: "active", roleKey: "viewer", email: "u2@x", employeeId: "E2" } as never);
    const { insertNotifications } = await import("../../api/_lib/notificationDelivery.js");
    const now = new Date().toISOString();
    await insertNotifications([
      { recipientUserId: adminId, type: "quotation_submitted", title: "ใบเสนอราคารออนุมัติ", description: "Q#1", module: "ใบเสนอราคา", createdAt: now, read: false, relatedQuoteId: "Q#1" },
      { recipientUserId: adminId, type: "quotation_approved", title: "อนุมัติแล้ว", description: "Q#1", module: "ใบเสนอราคา", createdAt: now, read: false },
      { recipientUserId: other.insertedId.toString(), type: "quotation_submitted", title: "รออนุมัติ", description: "Q#1", module: "ใบเสนอราคา", createdAt: now, read: false },
    ]);
    const pushes = lineCalls.filter((c) => c.path === "/message/push");
    expect(pushes, "ส่งแค่ 1: คนที่ผูก LINE + ประเภทรออนุมัติ").toHaveLength(1);
    expect(pushes[0].body.to).toBe("Uline-admin");
    const saved = await client.db("tcs_erp").collection("notifications").findOne({ recipientUserId: adminId, type: "quotation_submitted" });
    const uri = pushes[0].body.messages[0].contents.footer.contents[0].action.uri;
    expect(uri).toBe(`https://erp.test/?n=${saved!._id.toString()}`);
    // แจ้งเตือนทั้ง 3 ยังอยู่ในกระดิ่งครบ
    expect(await client.db("tcs_erp").collection("notifications").countDocuments({})).toBeGreaterThanOrEqual(3);
  });

  it("LINE ตอบ error (เช่นโควต้าเต็ม) — แจ้งเตือนในกระดิ่งยังบันทึก และไม่ throw", async () => {
    lineFails = true;
    const { insertNotifications } = await import("../../api/_lib/notificationDelivery.js");
    const before = await client.db("tcs_erp").collection("notifications").countDocuments({});
    await expect(insertNotifications([
      { recipientUserId: adminId, type: "purchase_request_submitted", title: "ใบขอซื้อรออนุมัติ", description: "PR-1", module: "ใบขอซื้อ", createdAt: new Date().toISOString(), read: false },
    ])).resolves.toBeUndefined();
    expect(await client.db("tcs_erp").collection("notifications").countDocuments({})).toBe(before + 1);
  });

  it("บล็อก OA (unfollow) = เลิกผูก · เลิกเชื่อมเองจากหน้าตั้งค่าได้", async () => {
    const { raw, headers } = signed({ events: [{ type: "unfollow", source: { userId: "Uline-admin" } }] });
    expect((await api("POST", "/api/line/webhook/staff", raw, headers)).status).toBe(200);
    expect((await api("GET", "/api/line/staff/me")).body.linked).toBe(false);

    await client.db("tcs_erp").collection("users").updateOne({ _id: new ObjectId(adminId) }, { $set: { lineUserId: "Uline-admin" } });
    const unlinked = await api("DELETE", "/api/line/staff/me");
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.linked).toBe(false);
  });
});
