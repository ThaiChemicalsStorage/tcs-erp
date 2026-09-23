import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ใบรับสินค้า (RR) + ตั้งหนี้ — เจ้าของสั่งไว้ว่ารับบางส่วนได้ รับหลายรอบในใบเดียว และการรับของ
 * ครั้งเดียวต้องได้ทั้งสต๊อก ทะเบียนเจ้าหนี้ และทะเบียนภาษีซื้อ
 *
 * สิ่งที่ตรึงไว้ คือจุดที่พังแล้วตัวเลขจะเดินคนละทางโดยไม่มีอะไรฟ้อง:
 *  - รับเกินยอดค้างรับต้องไม่ผ่าน และต้อง **ไม่เขียนอะไรเลย** (ไม่ใช่เขียนไปครึ่งเดียวแล้วค่อย error)
 *  - หนึ่งใบสั่งซื้อมีใบรับสินค้าได้ใบเดียว — กดสร้างซ้ำต้องได้ id เดิมกลับไปเปิดต่อ
 *  - ยกเลิกรอบต้องย้อน **ทั้ง** สต๊อกและหนี้ ถ้าย้อนอย่างเดียวทะเบียนกับคลังจะไม่ตรงกันตลอดไป
 *  - รอบที่บันทึกจ่ายเงินแล้วต้องยกเลิกไม่ได้
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let cookie: string;
let productId: string;
let purchaseOrderId: string;
let rrId: string;
let lineIds: string[] = [];

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

async function productStock(): Promise<{ stockQty: number; avgCost: number }> {
  const p = await client.db("tcs_erp").collection("products").findOne({ _id: new ObjectId(productId) });
  return { stockQty: p?.stockQty ?? 0, avgCost: p?.avgCost ?? 0 };
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
  productId = (await db.collection("products").insertOne({
    code: "ST-01", name: "เหล็กแผ่น", categoryId: "", unit: "แผ่น", defaultPrice: 0, description: "", specifications: "",
    archived: false, stockQty: 0, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
  })).insertedId.toString();

  /**
   * ผู้ขายต้องอยู่ในทะเบียนและผ่านบัญชีแล้ว ใบสั่งซื้อจึงจะอนุมัติได้ (2026-09-21) — ด่านอยู่ที่
   * `beforeApprove` ของใบสั่งซื้อ ดู api/_lib/purchaseOrderHandler.ts
   */
  const vendorRes = await api("POST", "/api/vendors", { name: "บริษัท เหล็กดี จำกัด", taxId: "0105500000001" });
  expect(vendorRes.status, JSON.stringify(vendorRes.body)).toBe(201);
  const vendorId = vendorRes.body.vendor.id;
  expect((await api("POST", `/api/vendors/${vendorId}/submit-approval`)).status).toBe(200);
  expect((await api("POST", `/api/vendors/${vendorId}/approve`)).status).toBe(200);

  // ใบสั่งซื้อ: 10 แผ่น ราคา 100 + 1 บรรทัดพิมพ์เอง (ไม่มีรหัสสินค้า) 5 หน่วย ราคา 20 · VAT 7%
  const created = await api("POST", "/api/purchase-orders", {});
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  purchaseOrderId = created.body.purchaseOrder.id;
  const patched = await api("PATCH", `/api/purchase-orders/${purchaseOrderId}`, {
    vendorId, vendorName: "บริษัท เหล็กดี จำกัด", vendorTaxId: "0105500000001", vatRate: 7,
    lines: [
      { productId, qty: 10, unitPrice: 100 },
      { productCode: "MISC", description: "ค่าขนส่ง", unit: "เที่ยว", qty: 5, unitPrice: 20 },
    ],
  });
  expect(patched.status, JSON.stringify(patched.body)).toBe(200);
  lineIds = patched.body.purchaseOrder.lines.map((l: { id: string }) => l.id);
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

describe("ใบรับสินค้า", () => {
  it("สร้างจากใบสั่งซื้อที่ยังไม่อนุมัติไม่ได้", async () => {
    const res = await api("POST", "/api/receiving-reports", { purchaseOrderId });
    expect(res.status).toBe(400);
  });

  it("อนุมัติใบสั่งซื้อแล้วสร้างได้ เลขที่เป็น RR-YYYYMM-NNNN และบรรทัดถูกก๊อปมาครบ", async () => {
    expect((await api("POST", `/api/purchase-orders/${purchaseOrderId}/submit-approval`)).status).toBe(200);
    expect((await api("POST", `/api/purchase-orders/${purchaseOrderId}/approve`)).status).toBe(200);

    const res = await api("POST", "/api/receiving-reports", { purchaseOrderId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const rr = res.body.receivingReport;
    rrId = rr.id;
    expect(rr.id).toMatch(/^RR-\d{6}-\d{4}$/);
    expect(rr.documentNumber).toBe(rr.id);
    expect(rr.status).toBe("Open");
    expect(rr.lines).toHaveLength(2);
    expect(rr.lines[0]).toMatchObject({ productId, qtyOrdered: 10, unitPriceOrdered: 100 });
    expect(rr.lines[1].productId).toBeNull();
    expect(rr.lines.map((l: { poLineId: string }) => l.poLineId)).toEqual(lineIds);
  });

  it("หนึ่งใบสั่งซื้อ = หนึ่งใบรับสินค้า — กดสร้างซ้ำได้ 409 พร้อม id เดิม", async () => {
    const res = await api("POST", "/api/receiving-reports", { purchaseOrderId });
    expect(res.status).toBe(409);
    // `details` ถูก spread แบนลงมาที่ตัว body โดย sendError() — หน้าจอใช้ค่านี้พาไปเปิดใบเดิม
    expect(res.body.receivingReportId).toBe(rrId);
  });

  it("รับเกินยอดค้างรับไม่ผ่าน และไม่เขียนสต๊อกแม้แต่แถวเดียว", async () => {
    const before = await productStock();
    const res = await api("POST", `/api/receiving-reports/${rrId}/receipts`, {
      invoiceNumber: "INV-001", receivedDate: "2026-09-03", vatRate: 7,
      lines: [{ lineId: "", qty: 1, unitPrice: 1 }],
    });
    expect(res.status).toBe(400);

    const doc = (await api("GET", `/api/receiving-reports/${rrId}`)).body.receivingReport;
    const overRun = await api("POST", `/api/receiving-reports/${rrId}/receipts`, {
      invoiceNumber: "INV-001", receivedDate: "2026-09-03", vatRate: 7,
      lines: [{ lineId: doc.lines[0].id, qty: 99, unitPrice: 100 }],
    });
    expect(overRun.status).toBe(400);
    expect(await productStock()).toEqual(before);
    expect(await client.db("tcs_erp").collection("ap_entries").countDocuments()).toBe(0);
  });

  it("ไม่มีเลขที่ใบกำกับภาษี บันทึกไม่ได้ — ทะเบียนภาษีซื้อต้องมีคอลัมน์นี้เสมอ", async () => {
    const doc = (await api("GET", `/api/receiving-reports/${rrId}`)).body.receivingReport;
    const res = await api("POST", `/api/receiving-reports/${rrId}/receipts`, {
      invoiceNumber: "", vatRate: 7, lines: [{ lineId: doc.lines[0].id, qty: 1, unitPrice: 100 }],
    });
    expect(res.status).toBe(400);
  });

  it("รับรอบแรกบางส่วน — สต๊อกเพิ่มตามที่รับ ตั้งหนี้หนึ่งแถว ค้างรับถูก", async () => {
    const doc = (await api("GET", `/api/receiving-reports/${rrId}`)).body.receivingReport;
    const res = await api("POST", `/api/receiving-reports/${rrId}/receipts`, {
      invoiceNumber: "INV-001", invoiceDate: "2026-09-03", receivedDate: "2026-09-03", vatRate: 7,
      lines: [
        { lineId: doc.lines[0].id, qty: 4, unitPrice: 100 },
        { lineId: doc.lines[1].id, qty: 0, unitPrice: 20 },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rr = res.body.receivingReport;
    expect(rr.status).toBe("Open");
    expect(rr.batches).toHaveLength(1);
    expect(rr.batches[0]).toMatchObject({ seq: 1, invoiceNumber: "INV-001", subtotal: 400, vatAmt: 28, total: 428 });
    // บรรทัดที่ส่ง qty 0 มาไม่ถูกบันทึกเป็นรายการรับ
    expect(rr.batches[0].lines).toHaveLength(1);

    expect(await productStock()).toEqual({ stockQty: 4, avgCost: 100 });

    const aps = await client.db("tcs_erp").collection("ap_entries").find({}).toArray();
    expect(aps).toHaveLength(1);
    expect(aps[0]).toMatchObject({ entryType: "RR", invoiceNumber: "INV-001", subtotal: 400, vatAmt: 28, total: 428, status: "Unpaid", vendorName: "บริษัท เหล็กดี จำกัด" });
  });

  it("รับรอบสองจนครบ — ใบปิดเอง ต้นทุนถัวเฉลี่ยถูก บรรทัดพิมพ์เองตั้งหนี้แต่ไม่เขียนสต๊อก", async () => {
    const doc = (await api("GET", `/api/receiving-reports/${rrId}`)).body.receivingReport;
    const res = await api("POST", `/api/receiving-reports/${rrId}/receipts`, {
      invoiceNumber: "INV-002", invoiceDate: "2026-09-10", receivedDate: "2026-09-10", vatRate: 7,
      lines: [
        { lineId: doc.lines[0].id, qty: 6, unitPrice: 120 },
        { lineId: doc.lines[1].id, qty: 5, unitPrice: 20 },
      ],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const rr = res.body.receivingReport;
    expect(rr.status, "รับครบทุกบรรทัดแล้วต้องปิดใบเอง").toBe("Closed");
    expect(rr.batches).toHaveLength(2);
    expect(rr.batches[1]).toMatchObject({ seq: 2, subtotal: 820, total: 877.4 });

    // ถัวเฉลี่ย: (4×100 + 6×120) / 10 = 112 · บรรทัดพิมพ์เอง 5 หน่วยไม่เข้าสต๊อก
    expect(await productStock()).toEqual({ stockQty: 10, avgCost: 112 });

    const movements = await client.db("tcs_erp").collection("stock_movements").find({ sourceType: "receiving_report" }).toArray();
    expect(movements).toHaveLength(2);
    expect(movements.map((m) => m.delta)).toEqual([4, 6]);
    expect(movements[1]).toMatchObject({ kind: "receive", unitCost: 120, sourceId: rrId });
  });

  it("ใบที่ปิดแล้วรับเพิ่มไม่ได้", async () => {
    const doc = (await api("GET", `/api/receiving-reports/${rrId}`)).body.receivingReport;
    const res = await api("POST", `/api/receiving-reports/${rrId}/receipts`, {
      invoiceNumber: "INV-003", vatRate: 7, lines: [{ lineId: doc.lines[0].id, qty: 1, unitPrice: 100 }],
    });
    expect(res.status).toBe(400);
  });

  it("ทะเบียนภาษีซื้อรวมยอดของเดือนถูก และทะเบียนเจ้าหนี้จัดกลุ่มตามผู้ขาย", async () => {
    const list = await api("GET", "/api/ap-entries?month=2026-09");
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.apEntries).toHaveLength(2);
    expect(list.body.apEntries.map((e: { invoiceNumber: string }) => e.invoiceNumber)).toEqual(["INV-001", "INV-002"]);

    const summary = (await api("GET", "/api/ap-entries/summary?month=2026-09")).body.summary;
    expect(summary).toMatchObject({ subtotal: 1220, vatAmt: 85.4, total: 1305.4, unpaidTotal: 1305.4 });
    expect(summary.vendors).toEqual([{ vendorName: "บริษัท เหล็กดี จำกัด", entryCount: 2, unpaidTotal: 1305.4, paidTotal: 0 }]);

    // เดือนอื่นต้องไม่ติดมาด้วย และรูปแบบเดือนผิดต้อง 400
    expect((await api("GET", "/api/ap-entries?month=2026-08")).body.apEntries).toHaveLength(0);
    expect((await api("GET", "/api/ap-entries?month=2026-9")).status).toBe(400);
  });

  it("รอบที่บันทึกจ่ายเงินแล้ว ยกเลิกไม่ได้", async () => {
    const entries = (await api("GET", "/api/ap-entries?month=2026-09")).body.apEntries;
    const last = entries[1];
    const paid = await api("PATCH", `/api/ap-entries/${last.id}`, { status: "Paid", paymentRef: "CHQ-9001" });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);
    expect(paid.body.apEntry).toMatchObject({ status: "Paid", paymentRef: "CHQ-9001" });

    const doc = (await api("GET", `/api/receiving-reports/${rrId}`)).body.receivingReport;
    const res = await api("DELETE", `/api/receiving-reports/${rrId}/receipts/${doc.batches[1].id}`);
    expect(res.status).toBe(409);

    // ยกเลิกการจ่ายแล้วยกเลิกรอบได้
    expect((await api("PATCH", `/api/ap-entries/${last.id}`, { status: "Unpaid" })).status).toBe(200);
  });

  it("ยกเลิกได้เฉพาะรอบล่าสุด — และย้อนทั้งสต๊อกและหนี้", async () => {
    const doc = (await api("GET", `/api/receiving-reports/${rrId}`)).body.receivingReport;
    const notLast = await api("DELETE", `/api/receiving-reports/${rrId}/receipts/${doc.batches[0].id}`);
    expect(notLast.status).toBe(400);

    const res = await api("DELETE", `/api/receiving-reports/${rrId}/receipts/${doc.batches[1].id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.receivingReport.batches).toHaveLength(1);
    expect(res.body.receivingReport.status, "ยกเลิกรอบแล้วใบต้องกลับมาเปิด").toBe("Open");

    expect((await productStock()).stockQty).toBe(4);
    const aps = await client.db("tcs_erp").collection("ap_entries").find({}).toArray();
    expect(aps).toHaveLength(1);
    expect(aps[0].invoiceNumber).toBe("INV-001");
  });

  it("ลบใบที่ยังมีรอบการรับค้างอยู่ไม่ได้", async () => {
    expect((await api("DELETE", `/api/receiving-reports/${rrId}`)).status).toBe(400);
  });
});

/**
 * ใบเปล่าและรหัสรับเข้า (2026-09-23) — เจ้าของสั่งว่าใบรับสินค้าต้องสร้างได้โดยไม่มีใบสั่งซื้อ และเลือกรหัส
 * RR (ซื้อเชื่อ-วัตถุดิบ) / RX (โรงงาน) / RI (โครงการ) ได้ทั้งใบที่มีและไม่มีใบสั่งซื้อ
 *
 * จุดที่ตรึง: ใบเปล่าหลายใบต้องไม่ชน unique index ของ "1 ใบสั่งซื้อ = 1 ใบรับ", รหัสเป็นตัวนับแยกและเป็นประเภทหนี้,
 * รายการที่รับของไปแล้วต้องลบ/ลดต่ำกว่าที่รับไม่ได้, และใบที่มาจากใบสั่งซื้อยังแก้ผู้ขาย/รายการไม่ได้
 */
describe("ใบรับสินค้าแบบใบเปล่า + รหัสรับเข้า", () => {
  let blankId = "";
  let blankLineId = "";

  it("สร้างใบเปล่าได้หลายใบ เลขที่ขึ้นต้นด้วยรหัสและนับแยกกัน", async () => {
    const a = await api("POST", "/api/receiving-reports", { receiveCode: "RX" });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    const b = await api("POST", "/api/receiving-reports", { receiveCode: "RX" });
    expect(b.status, JSON.stringify(b.body)).toBe(201);
    expect(a.body.receivingReport.id).toMatch(/^RX-\d{6}-0001$/);
    expect(b.body.receivingReport.id).toMatch(/^RX-\d{6}-0002$/);
    expect(a.body.receivingReport.purchaseOrderId).toBe("");
    expect(a.body.receivingReport.receiveCode).toBe("RX");
    blankId = a.body.receivingReport.id;
  });

  it("รหัสที่ไม่รู้จักถูกปฏิเสธ", async () => {
    expect((await api("POST", "/api/receiving-reports", { receiveCode: "RZ" })).status).toBe(400);
  });

  it("รับของก่อนใส่ผู้ขายไม่ได้", async () => {
    const res = await api("PATCH", `/api/receiving-reports/${blankId}`, {
      lines: [{ id: "new", productId, description: "", qtyOrdered: 5, unitPriceOrdered: 200 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    blankLineId = res.body.receivingReport.lines[0].id;
    // รหัส/ชื่อ/หน่วย อ่านจากทะเบียนสินค้า ไม่ใช่จากที่หน้าจอส่งมา
    expect(res.body.receivingReport.lines[0]).toMatchObject({ productCode: "ST-01", description: "เหล็กแผ่น", unit: "แผ่น" });
    const recv = await api("POST", `/api/receiving-reports/${blankId}/receipts`, {
      invoiceNumber: "INV-B1", lines: [{ lineId: blankLineId, qty: 2, unitPrice: 200 }],
    });
    expect(recv.status).toBe(400);
  });

  it("ใส่ผู้ขายแล้วรับของได้ — สต๊อกเพิ่ม และหนี้เป็นประเภทตามรหัส (RX)", async () => {
    const before = await productStock();
    expect((await api("PATCH", `/api/receiving-reports/${blankId}`, { vendorName: "ร้านเหล็กหน้าโรงงาน", vendorTaxId: "0105500000009" })).status).toBe(200);
    const recv = await api("POST", `/api/receiving-reports/${blankId}/receipts`, {
      invoiceNumber: "INV-B1", vatRate: 7, lines: [{ lineId: blankLineId, qty: 2, unitPrice: 200 }],
    });
    expect(recv.status, JSON.stringify(recv.body)).toBe(200);
    expect((await productStock()).stockQty).toBe(before.stockQty + 2);
    const ap = await client.db("tcs_erp").collection("ap_entries").findOne({ receivingReportId: blankId });
    expect(ap).toMatchObject({ entryType: "RX", vendorName: "ร้านเหล็กหน้าโรงงาน", subtotal: 400, total: 428 });
  });

  it("รายการที่รับของไปแล้ว ลบไม่ได้ และลดจำนวนต่ำกว่าที่รับไม่ได้", async () => {
    expect((await api("PATCH", `/api/receiving-reports/${blankId}`, { lines: [] })).status).toBe(400);
    expect((await api("PATCH", `/api/receiving-reports/${blankId}`, {
      lines: [{ id: blankLineId, productId, qtyOrdered: 1, unitPriceOrdered: 200 }],
    })).status).toBe(400);
    // เพิ่มรายการพิมพ์เองต่อท้ายได้ และขยายจำนวนของเดิมได้
    const ok = await api("PATCH", `/api/receiving-reports/${blankId}`, {
      lines: [
        { id: blankLineId, productId, qtyOrdered: 8, unitPriceOrdered: 200 },
        { id: "new", productCode: "", description: "ค่าขนส่ง", unit: "เที่ยว", qtyOrdered: 1, unitPriceOrdered: 300 },
      ],
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.receivingReport.lines).toHaveLength(2);
    expect(ok.body.receivingReport.lines[0].id).toBe(blankLineId);
  });

  it("ใบที่มาจากใบสั่งซื้อแก้ผู้ขายหรือรายการไม่ได้", async () => {
    expect((await api("PATCH", `/api/receiving-reports/${rrId}`, { vendorName: "อื่น" })).status).toBe(400);
  });

  it("ใบจากใบสั่งซื้อเลือกรหัสได้ — ใบสั่งซื้อใบใหม่ด้วยรหัส RI", async () => {
    const created = await api("POST", "/api/purchase-orders", {});
    const poId = created.body.purchaseOrder.id;
    const vendors = await api("GET", "/api/vendors");
    const vendor = vendors.body.vendors[0];
    expect((await api("PATCH", `/api/purchase-orders/${poId}`, {
      vendorId: vendor.id, vendorName: vendor.name, vendorTaxId: vendor.taxId, vatRate: 7,
      lines: [{ productId, qty: 1, unitPrice: 50 }],
    })).status).toBe(200);
    expect((await api("POST", `/api/purchase-orders/${poId}/submit-approval`)).status).toBe(200);
    expect((await api("POST", `/api/purchase-orders/${poId}/approve`)).status).toBe(200);
    const rr = await api("POST", "/api/receiving-reports", { purchaseOrderId: poId, receiveCode: "RI" });
    expect(rr.status, JSON.stringify(rr.body)).toBe(201);
    expect(rr.body.receivingReport.id).toMatch(/^RI-\d{6}-0001$/);
    expect(rr.body.receivingReport.receiveCode).toBe("RI");
  });

  it("ใบเก่าที่ไม่มีฟิลด์รหัส อ่านเป็น RR", async () => {
    const res = await api("GET", `/api/receiving-reports/${rrId}`);
    expect(res.body.receivingReport.receiveCode).toBe("RR");
  });
});
