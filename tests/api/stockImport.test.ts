import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * นำเข้ายอดสต๊อกจาก Excel (2026-09-23) — ยอดในไฟล์คือยอดที่ควรเป็น ระบบลงส่วนต่างเป็นความเคลื่อนไหว
 * ตรึงไว้: ไฟล์ที่มีแถวผิดต้องไม่เขียนอะไรเลย, ยอดเพิ่มพร้อมต้นทุนถัวค่าเฉลี่ย, ยอดลดเป็น adjust, ยอดเท่าเดิมข้าม,
 * และทุกแถวของครั้งเดียวกันผูกเลขชุด SI- เดียวกัน
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let cookie: string;
const ids: Record<string, string> = {};

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}
async function product(code: string) {
  return client.db("tcs_erp").collection("products").findOne({ _id: new ObjectId(ids[code]) });
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
  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Store Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const db = client.db("tcs_erp");
  const base = { categoryId: "", unit: "ชิ้น", defaultPrice: 0, description: "", specifications: "", archived: false, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" };
  for (const [code, stockQty, avgCost] of [["RS-01", 4, 100], ["BT-12", 50, 10], ["NC-9", 7, 5]] as const) {
    ids[code] = (await db.collection("products").insertOne({ ...base, code, name: code, stockQty, avgCost })).insertedId.toString();
  }
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

describe("นำเข้ายอดสต๊อกจาก Excel", () => {
  it("มีรหัสที่ไม่รู้จักแถวเดียว ทั้งไฟล์ไม่ถูกเขียน", async () => {
    const res = await api("POST", "/api/stock-movements/import", { rows: [{ code: "RS-01", qty: 10 }, { code: "NOPE", qty: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("NOPE");
    expect((await product("RS-01"))?.stockQty).toBe(4);
  });

  it("ตั้งยอดตามไฟล์ — เพิ่มพร้อมต้นทุน = รับเข้าถัวเฉลี่ย, ลด = ปรับยอด, เท่าเดิม = ข้าม", async () => {
    const res = await api("POST", "/api/stock-movements/import", {
      rows: [{ code: "rs-01", qty: 10, unitCost: 200 }, { code: "BT-12", qty: 45 }, { code: "NC-9", qty: 7 }],
      note: "ยอดยกมา",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ changed: 2, unchanged: 1 });
    expect(res.body.batchLabel).toMatch(/^SI-\d{6}-0001$/);
    const rs = await product("RS-01");
    expect(rs?.stockQty).toBe(10);
    // (4×100 + 6×200) / 10 = 160
    expect(rs?.avgCost).toBeCloseTo(160);
    expect((await product("BT-12"))?.stockQty).toBe(45);
    const moves = await client.db("tcs_erp").collection("stock_movements").find({ sourceId: res.body.batchLabel }).toArray();
    expect(moves.map((m) => [m.productCode, m.kind, m.delta]).sort()).toEqual([["BT-12", "adjust", -5], ["RS-01", "receive", 6]]);
    expect(moves.every((m) => m.sourceType === "stock_import")).toBe(true);
  });

  it("ยอดติดลบถูกปฏิเสธ", async () => {
    expect((await api("POST", "/api/stock-movements/import", { rows: [{ code: "RS-01", qty: -1 }] })).status).toBe(400);
  });
});
