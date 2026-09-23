import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ใบรับวางบิลของสโตร์ (2026-09-23) — ใบนี้เก็บแค่ id ของหนี้ ยอดทุกตัวอ่านจากทะเบียนเจ้าหนี้
 *
 * ตรึงไว้: เลือกได้เฉพาะหนี้ที่ยังไม่จ่ายและยังไม่อยู่ในใบอื่น · หนี้หนึ่งก้อนอยู่ได้ใบเดียว · ต้องเป็นผู้ขายรายเดียวกับหัวใบ ·
 * "จ่ายแล้ว" ตามทะเบียนเจ้าหนี้ทันที · วันครบกำหนด = วันที่ใบกำกับ + เครดิต · รอบรับที่อยู่ในใบยกเลิกไม่ได้ ·
 * ลบใบแล้วหนี้กลับมาเลือกได้
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let cookie: string;
let productId = "";
const VENDOR_A = "บริษัท วาเทค อุตสาหกรรม จำกัด";
const VENDOR_B = "ร้านเหล็กหน้าโรงงาน";
let rrA1 = "";
let rrA2 = "";
let billId = "";

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

/** ใบรับสินค้าเปล่า (RX) ของผู้ขายรายหนึ่ง + รับของตามรายการใบกำกับ */
async function receive(vendorName: string, invoices: { no: string; date: string; price: number }[]): Promise<string> {
  const created = await api("POST", "/api/receiving-reports", { receiveCode: "RX" });
  const id = created.body.receivingReport.id;
  const patched = await api("PATCH", `/api/receiving-reports/${id}`, {
    vendorName, vendorTaxId: "0105532077281", vendorAddress: "141/21-22 ถ.สุรวงศ์",
    lines: [{ id: "new", productId, qtyOrdered: 100, unitPriceOrdered: 100 }],
  });
  const lineId = patched.body.receivingReport.lines[0].id;
  for (const inv of invoices) {
    const r = await api("POST", `/api/receiving-reports/${id}/receipts`, {
      invoiceNumber: inv.no, invoiceDate: inv.date, receivedDate: inv.date, vatRate: 7,
      lines: [{ lineId, qty: 1, unitPrice: inv.price }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  }
  return id;
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
  productId = (await client.db("tcs_erp").collection("products").insertOne({
    code: "MA-RE-01", name: "เรซิน", categoryId: "", unit: "กิโล", defaultPrice: 0, description: "", specifications: "",
    archived: false, stockQty: 0, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
  })).insertedId.toString();

  rrA1 = await receive(VENDOR_A, [{ no: "9900062849", date: "2026-09-22", price: 96000 }, { no: "9900062850", date: "2026-09-22", price: 14500 }]);
  rrA2 = await receive(VENDOR_A, [{ no: "9900062900", date: "2026-09-23", price: 1000 }]);
  await receive(VENDOR_B, [{ no: "B-1", date: "2026-09-20", price: 500 }]);
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

describe("ใบรับวางบิล", () => {
  it("ตัวเลือก: หนี้ที่ยังไม่จ่ายทุกผู้ขาย หรือกรองตามผู้ขาย", async () => {
    const all = await api("GET", "/api/vendor-bills/candidates");
    expect(all.status).toBe(200);
    expect(all.body.candidates).toHaveLength(4);
    const a = await api("GET", `/api/vendor-bills/candidates?vendor=${encodeURIComponent(VENDOR_A)}`);
    expect(a.body.candidates.map((c: { invoiceNumber: string }) => c.invoiceNumber)).toEqual(["9900062849", "9900062850", "9900062900"]);
  });

  it("สร้างใบของผู้ขาย — ติ๊กหนี้ค้างทั้งหมดให้ เลข BR- และใบรับที่รับหลายรอบมี /รอบ ต่อท้าย", async () => {
    expect((await api("POST", "/api/vendor-bills", {})).status).toBe(400);
    const res = await api("POST", "/api/vendor-bills", { vendorName: VENDOR_A });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    billId = res.body.vendorBill.id;
    expect(billId).toMatch(/^BR-\d{6}-0001$/);
    expect(res.body.vendorBill).toMatchObject({ vendorName: VENDOR_A, vendorTaxId: "0105532077281" });
    expect(res.body.rows.map((r: { receivingReportNumber: string }) => r.receivingReportNumber)).toEqual([`${rrA1}/1`, `${rrA1}/2`, rrA2]);
    expect(res.body.rows.map((r: { amount: number }) => r.amount)).toEqual([102720, 15515, 1070]);
    // ไม่เหลือหนี้ให้เปิดใบที่สองของผู้ขายรายเดียวกัน
    expect((await api("POST", "/api/vendor-bills", { vendorName: VENDOR_A })).status).toBe(400);
  });

  it("วันครบกำหนด = วันที่ใบกำกับ + เครดิต (ใบรับสินค้าเปล่าไม่มีใบสั่งซื้อ ใช้เครดิตหัวใบ)", async () => {
    const res = await api("PATCH", `/api/vendor-bills/${billId}`, { creditDays: 90, paymentDate: "2027-01-10", remarks: "นัดรับเช็ค" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.rows[0].dueDate).toBe("2026-12-21");
    expect(res.body.vendorBill).toMatchObject({ creditDays: 90, paymentDate: "2027-01-10" });
  });

  it("หนี้ของผู้ขายรายอื่นใส่ไม่ได้ และหนี้หนึ่งก้อนอยู่ได้ใบเดียว", async () => {
    const b = await api("GET", `/api/vendor-bills/candidates?vendor=${encodeURIComponent(VENDOR_B)}`);
    const bill = (await api("GET", `/api/vendor-bills/${billId}`)).body.vendorBill;
    expect((await api("PATCH", `/api/vendor-bills/${billId}`, { apEntryIds: [...bill.apEntryIds, b.body.candidates[0].apEntryId] })).status).toBe(400);

    // เอาใบรับ rrA2 ออก → ไปอยู่อีกใบ → ใส่กลับใบแรกไม่ได้แล้ว
    const removed = bill.apEntryIds.slice(0, 2);
    const back = bill.apEntryIds[2];
    expect((await api("PATCH", `/api/vendor-bills/${billId}`, { apEntryIds: removed })).status).toBe(200);
    const second = await api("POST", "/api/vendor-bills", { vendorName: VENDOR_A });
    expect(second.status).toBe(201);
    expect(second.body.vendorBill.apEntryIds).toEqual([back]);
    expect((await api("PATCH", `/api/vendor-bills/${billId}`, { apEntryIds: [...removed, back] })).status).toBe(409);
    // ลบใบที่สอง → หนี้กลับมาเลือกได้
    expect((await api("DELETE", `/api/vendor-bills/${second.body.vendorBill.id}`)).status).toBe(204);
    expect((await api("PATCH", `/api/vendor-bills/${billId}`, { apEntryIds: [...removed, back] })).status).toBe(200);
  });

  it("บัญชีบันทึกจ่ายแล้ว → คอลัมน์จ่ายแล้ว/คงค้างขยับตามทันที", async () => {
    const bill = await api("GET", `/api/vendor-bills/${billId}`);
    const first = bill.body.rows[0];
    expect((await api("PATCH", `/api/ap-entries/${first.apEntryId}`, { status: "Paid", paymentRef: "CHQ-1" })).status).toBe(200);
    const after = await api("GET", `/api/vendor-bills/${billId}`);
    expect(after.body.rows[0]).toMatchObject({ paid: 102720, outstanding: 0 });
    const list = await api("GET", "/api/vendor-bills");
    expect(list.body.vendorBills[0]).toMatchObject({ id: billId, rowCount: 3, total: 119305, outstanding: 16585 });
  });

  it("รอบการรับที่อยู่ในใบรับวางบิลยกเลิกไม่ได้ — เอาออกจากใบก่อน", async () => {
    const rr = await api("GET", `/api/receiving-reports/${rrA2}`);
    const batchId = rr.body.receivingReport.batches[0].id;
    const blocked = await api("DELETE", `/api/receiving-reports/${rrA2}/receipts/${batchId}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error ?? blocked.body.message ?? JSON.stringify(blocked.body)).toContain(billId);
    const bill = (await api("GET", `/api/vendor-bills/${billId}`)).body.vendorBill;
    expect((await api("PATCH", `/api/vendor-bills/${billId}`, { apEntryIds: bill.apEntryIds.slice(0, 2) })).status).toBe(200);
    expect((await api("DELETE", `/api/receiving-reports/${rrA2}/receipts/${batchId}`)).status).toBe(200);
  });

  it("พิมพ์ได้ (บันทึก audit)", async () => {
    expect((await api("POST", `/api/vendor-bills/${billId}/print`)).status).toBe(204);
  });
});
