import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * หน้าประวัติความเคลื่อนไหวสต๊อก (2026-09-23) — เจ้าของขอ "ค้นหาดูได้ว่าของชิ้นนี้ตัดไปกับงานไหนบ้าง เข้ายังไงบ้าง"
 *
 * สิ่งที่ตรึงไว้: คำค้นเลขงานต้องเจอแถวสต๊อกที่ไม่มีเลขงานในตัว (เลขงานอยู่บนใบเบิก), ทุกแถวบอกที่มา (`link`),
 * ยอดรวม/สรุปนับจากทั้งชุดที่กรอง ไม่ใช่แค่หน้าปัจจุบัน, และช่วงวันที่คิดตามเวลาไทย
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let cookie: string;

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

function row(over: Record<string, unknown>) {
  return {
    productId: "p1", productCode: "RS-01", productName: "เรซิน", kind: "deduct", delta: -1, balanceAfter: 0,
    reason: "", sourceType: "manual", createdAt: "2026-09-10T03:00:00.000Z", createdBy: "", ...over,
  };
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
  const admin = await db.collection("users").findOne({ username: "admin" });
  await db.collection("material_requisitions").insertOne({ _id: "MR-202609-0001" as never, jobCode: "PQ2609-77-TA", jobOrderCode: "JO-202609-0003", ownerDepartment: "project" });
  await db.collection("receiving_reports").insertOne({ _id: "RX-202609-0001" as never, purchaseOrderNumber: "PO-202609-0009", vendorName: "ร้านเรซินดี", jobCode: "", receiveCode: "RX" });
  await db.collection("stock_movements").insertMany([
    row({ kind: "receive", delta: 10, amount: 1000, sourceType: "receiving_report", sourceId: "RX-202609-0001", sourceLabel: "RX-202609-0001", createdAt: "2026-09-01T02:00:00.000Z", createdBy: String(admin?._id) }),
    row({ kind: "deduct", delta: -3, amount: 300, sourceType: "material_requisition", sourceId: "MR-202609-0001", sourceLabel: "MR-202609-0001", createdAt: "2026-09-05T02:00:00.000Z" }),
    row({ kind: "deduct", delta: -2, amount: 200, sourceType: "material_requisition", sourceId: "MR-202609-0001", sourceLabel: "MR-202609-0001", createdAt: "2026-09-06T02:00:00.000Z" }),
    // 2026-09-30 23:30 เวลาไทย = 16:30 UTC — ต้องนับเป็นวันที่ 30 ไม่ใช่ 1 ต.ค.
    row({ kind: "adjust", delta: -1, amount: 100, reason: "นับสต๊อก", createdAt: "2026-09-30T16:30:00.000Z" }),
    row({ productId: "p2", productCode: "BT-12", productName: "สลักเกลียว", kind: "receive", delta: 50, amount: 500, createdAt: "2026-10-02T02:00:00.000Z" }),
  ]);
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

describe("ประวัติความเคลื่อนไหวสต๊อก", () => {
  it("ค้นด้วยเลขงานเจอแถวที่ตัดไปกับงานนั้น และแต่ละแถวบอกที่มา", async () => {
    const res = await api("GET", "/api/stock-movements/history?q=PQ2609-77");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.movements.every((m: { link: { jobCode: string } }) => m.link.jobCode === "PQ2609-77-TA")).toBe(true);
    expect(res.body.movements[0].link.jobOrderCode).toBe("JO-202609-0003");
  });

  it("ค้นด้วยใบสั่งซื้อ/ผู้ขายเจอแถวรับเข้า พร้อมชื่อผู้ทำรายการ", async () => {
    const res = await api("GET", "/api/stock-movements/history?q=" + encodeURIComponent("ร้านเรซิน"));
    expect(res.body.total).toBe(1);
    expect(res.body.movements[0].link).toMatchObject({ purchaseOrderNumber: "PO-202609-0009", vendorName: "ร้านเรซินดี", code: "RX" });
    expect(res.body.movements[0].createdByName).toBe("Store Admin");
  });

  it("กรองตามประเภท + สรุปนับจากทั้งชุด ไม่ใช่แค่หน้าปัจจุบัน", async () => {
    const res = await api("GET", "/api/stock-movements/history?productId=p1&limit=1");
    expect(res.body.movements).toHaveLength(1);
    expect(res.body.total).toBe(4);
    const deduct = res.body.summary.find((s: { kind: string }) => s.kind === "deduct");
    expect(deduct).toMatchObject({ count: 2, amount: 500 });
    const only = await api("GET", "/api/stock-movements/history?kind=receive");
    expect(only.body.total).toBe(2);
  });

  it("ช่วงวันที่คิดตามเวลาไทย", async () => {
    const sept = await api("GET", "/api/stock-movements/history?from=2026-09-30&to=2026-09-30");
    expect(sept.body.total).toBe(1);
    expect(sept.body.movements[0].reason).toBe("นับสต๊อก");
    const oct = await api("GET", "/api/stock-movements/history?from=2026-10-01");
    expect(oct.body.total).toBe(1);
  });

  it("แบ่งหน้าได้ — ข้ามแถวแล้วได้แถวถัดไป เรียงจากล่าสุด", async () => {
    const p1 = await api("GET", "/api/stock-movements/history?limit=2");
    const p2 = await api("GET", "/api/stock-movements/history?limit=2&skip=2");
    expect(p1.body.movements[0].productCode).toBe("BT-12");
    expect(p2.body.movements.map((m: { id: string }) => m.id)).not.toContain(p1.body.movements[1].id);
  });

  it("ค่าตัวกรองที่ไม่รู้จักถูกปฏิเสธ", async () => {
    expect((await api("GET", "/api/stock-movements/history?kind=steal")).status).toBe(400);
    expect((await api("GET", "/api/stock-movements/history?from=30-09-2026")).status).toBe(400);
  });
});
