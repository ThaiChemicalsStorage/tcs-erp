import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * สินค้าชุด (2026-09-29) — เจ้าของ: ชุดน๊อต M6x30 = สกรู 1 + แหวน 2 + หัวน็อต 1 · *"ถ้าเบิกน็อตชุดไปแล้วจะตัดพวกนี้ออกไป"*
 * เลือกแล้ว: รับเข้าแยกชิ้น · ไม่ต้องกดประกอบชุด (ตัดชิ้นส่วนตอนเบิก) · ใช้ทุกที่ · สูตรล็อกเมื่อเบิกแล้ว · ตั้งสูตรได้เมื่อชุดไม่มีสต๊อก
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let cookie: string;
let screwId = "";
let washerId = "";
let nutId = "";
let kitId = "";
let slipId = "";
let slipLineId = "";

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}
async function qty(id: string): Promise<number> {
  const p = await client.db("tcs_erp").collection("products").findOne({ _id: new ObjectId(id) });
  return p?.stockQty ?? 0;
}
async function approve(path: string) {
  expect((await api("POST", `${path}/submit-approval`)).status).toBe(200);
  const res = await api("POST", `${path}/approve`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
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
  const base = { categoryId: "", defaultPrice: 0, description: "", specifications: "", archived: false, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" };
  screwId = (await db.collection("products").insertOne({ ...base, code: "SC-M6-30", name: "สกรู M6x30", unit: "ตัว", stockQty: 10, avgCost: 2 })).insertedId.toString();
  washerId = (await db.collection("products").insertOne({ ...base, code: "WS-M6", name: "แหวน M6", unit: "ตัว", stockQty: 30, avgCost: 0.5 })).insertedId.toString();
  nutId = (await db.collection("products").insertOne({ ...base, code: "NT-M6", name: "หัวน็อต M6", unit: "ตัว", stockQty: 20, avgCost: 1 })).insertedId.toString();
  kitId = (await db.collection("products").insertOne({ ...base, code: "ชุด-M6-30", name: "ชุดน๊อต M6x30", unit: "ชุด", stockQty: 0, avgCost: 0 })).insertedId.toString();
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

const recipe = () => [{ productId: screwId, qty: 1 }, { productId: washerId, qty: 2 }, { productId: nutId, qty: 1 }];

describe("สูตรชุด", () => {
  it("ตั้งสูตร → ชื่อ/รหัส/หน่วยชิ้นส่วนจากทะเบียน · รายการสินค้าโชว์ยอดชุดที่เบิกได้จากชิ้นส่วน", async () => {
    const res = await api("PATCH", `/api/products/${kitId}`, { kitComponents: recipe() });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.product.kitComponents).toEqual([
      { productId: screwId, code: "SC-M6-30", name: "สกรู M6x30", unit: "ตัว", qty: 1 },
      { productId: washerId, code: "WS-M6", name: "แหวน M6", unit: "ตัว", qty: 2 },
      { productId: nutId, code: "NT-M6", name: "หัวน็อต M6", unit: "ตัว", qty: 1 },
    ]);
    const list = await api("GET", "/api/products");
    const kit = list.body.products.find((p: { id: string }) => p.id === kitId);
    expect(kit.stockQty).toBe(10); // สกรู 10 / แหวน 30÷2 = 15 / หัวน็อต 20 → 10 ชุด
    expect(await qty(kitId)).toBe(0); // ในฐานข้อมูลไม่เคยถูกเขียน
    const kits = await api("GET", "/api/products/kits");
    expect(kits.body.kits.map((k: { id: string }) => k.id)).toEqual([kitId]);
  });

  it("กติกาสูตร: ตัวเอง / ชุดซ้อน / ซ้ำ / จำนวน 0 / ชุดที่มีสต๊อก / เครื่องมือ → 400", async () => {
    const other = (await api("POST", "/api/products", { code: "ชุด-X", name: "ชุดทดสอบ", categoryId: "c1", unit: "ชุด" })).body.product.id;
    expect((await api("PATCH", `/api/products/${other}`, { kitComponents: [{ productId: other, qty: 1 }] })).status).toBe(400);
    expect((await api("PATCH", `/api/products/${other}`, { kitComponents: [{ productId: kitId, qty: 1 }] })).status).toBe(400);
    expect((await api("PATCH", `/api/products/${other}`, { kitComponents: [{ productId: screwId, qty: 1 }, { productId: screwId, qty: 2 }] })).status).toBe(400);
    expect((await api("PATCH", `/api/products/${other}`, { kitComponents: [{ productId: screwId, qty: 0 }] })).status).toBe(400);
    expect((await api("PATCH", `/api/products/${other}`, { isTool: true, kitComponents: [{ productId: screwId, qty: 1 }] })).status).toBe(400);
    // ชิ้นส่วนของชุดอื่นเป็นชุดเองไม่ได้
    expect((await api("PATCH", `/api/products/${screwId}`, { kitComponents: [{ productId: nutId, qty: 1 }] })).status).toBe(400);
    // สินค้าที่มีสต๊อกอยู่ตั้งเป็นชุดไม่ได้
    await client.db("tcs_erp").collection("products").updateOne({ _id: new ObjectId(other) }, { $set: { stockQty: 5 } });
    expect((await api("PATCH", `/api/products/${other}`, { kitComponents: [{ productId: screwId, qty: 1 }] })).status).toBe(400);
    // ชิ้นส่วนของชุดลบไม่ได้
    expect((await api("DELETE", `/api/products/${nutId}`)).status).toBe(400);
  });

  it("รับเข้า/ปรับยอด/นำเข้ายอดเป็นชุดไม่ได้ — ให้ทำที่ชิ้นส่วน", async () => {
    expect((await api("POST", "/api/stock-movements", { productId: kitId, kind: "receive", qty: 5, reason: "x" })).status).toBe(400);
    expect((await api("POST", "/api/stock-movements", { productId: kitId, kind: "adjust", delta: 5, reason: "x" })).status).toBe(400);
    const imp = await api("POST", "/api/stock-movements/import", { rows: [{ code: "ชุด-M6-30", qty: 5 }] });
    expect(imp.status).toBe(400);
    expect(imp.body.error ?? imp.body.message ?? JSON.stringify(imp.body)).toContain("สินค้าชุด");
    expect(await qty(screwId)).toBe(10);
  });
});

describe("เบิกชุด = ตัดชิ้นส่วน", () => {
  it("ใบจ่ายของสโตร์: จ่าย 3 ชุด → สกรู −3 แหวน −6 หัวน็อต −3 · แถวสต๊อกบอกว่ามาจากชุด · ใบเก็บ id ทุกแถว", async () => {
    slipId = (await api("POST", "/api/material-requisitions", { ownerDepartment: "store", issueCode: "PD" })).body.materialRequisition.id;
    const patched = await api("PATCH", `/api/material-requisitions/${slipId}`, { lines: [{ productId: kitId, category: "hardware", plannedQty: 5 }] });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    slipLineId = patched.body.materialRequisition.lines[0].id;
    expect((await api("GET", `/api/material-requisitions/${slipId}`)).body.stockByProduct[kitId]).toBe(10);
    await approve(`/api/material-requisitions/${slipId}`);
    const res = await api("POST", `/api/material-requisitions/${slipId}/issues`, { lines: [{ lineId: slipLineId, qty: 3 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect([await qty(screwId), await qty(washerId), await qty(nutId), await qty(kitId)]).toEqual([7, 24, 17, 0]);
    expect(res.body.materialRequisition.issues[0].stockMovementIds).toHaveLength(3);
    expect(res.body.stockByProduct[kitId]).toBe(7);
    const moves = await client.db("tcs_erp").collection("stock_movements").find({ sourceId: slipId }).toArray();
    expect(moves.map((m) => [m.productId, m.delta, m.kitProductId, m.kitQty])).toEqual([
      [screwId, -3, kitId, 3], [washerId, -6, kitId, 3], [nutId, -3, kitId, 3],
    ]);
    expect(new Set(moves.map((m) => m.kitGroupId)).size).toBe(1);
  });

  it("ของไม่พอ: เช็คที่ชิ้นส่วน และบอกว่าเป็นชิ้นส่วนของชุดไหน · ไม่มีอะไรถูกตัด", async () => {
    const res = await api("POST", `/api/material-requisitions/${slipId}/issues`, { lines: [{ lineId: slipLineId, qty: 8 }] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("ชิ้นส่วนของชุด");
    expect([await qty(screwId), await qty(washerId), await qty(nutId)]).toEqual([7, 24, 17]);
  });

  it("สูตรล็อกเมื่อชุดถูกเบิกแล้ว", async () => {
    const res = await api("PATCH", `/api/products/${kitId}`, { kitComponents: [{ productId: screwId, qty: 2 }] });
    expect(res.status).toBe(400);
    // ส่งสูตรเดิมกลับมา (หน้าจอบันทึกทั้งฟอร์ม) ต้องไม่โดนด่านล็อก
    expect((await api("PATCH", `/api/products/${kitId}`, { name: "ชุดน๊อต M6x30 mm.", kitComponents: recipe() })).status).toBe(200);
  });

  it("กดพิมพ์ได้ต้นทุนต่อชุด = มูลค่าชิ้นส่วนรวม ÷ จำนวนชุด", async () => {
    const res = await api("POST", `/api/material-requisitions/${slipId}/print`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const costs = res.body.unitCostByProduct ?? res.body.costs ?? res.body;
    expect(costs[kitId]).toBe(4); // 2 + 0.5×2 + 1
  });

  it("คืนชุดผ่านใบรับคืน → ชิ้นส่วนกลับเข้าคลัง", async () => {
    const rid = (await api("POST", "/api/store-receipts", { receiptCode: "JD" })).body.storeReceipt.id;
    const set = await api("PATCH", `/api/store-receipts/${rid}`, { sourceRequisitionId: slipId });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    const line = set.body.storeReceipt.lines[0];
    await api("PATCH", `/api/store-receipts/${rid}`, { lines: [{ ...line, qty: 1 }] });
    await approve(`/api/store-receipts/${rid}`);
    const posted = await api("POST", `/api/store-receipts/${rid}/post`);
    expect(posted.status, JSON.stringify(posted.body)).toBe(200);
    expect([await qty(screwId), await qty(washerId), await qty(nutId)]).toEqual([8, 26, 18]);
    expect(posted.body.storeReceipt.stockMovementIds).toHaveLength(3);
  });

  it("ยกเลิกรอบจ่ายของชุด → ชิ้นส่วนกลับเข้าคลังครบ", async () => {
    // รอบใหม่ที่ยังไม่มีการคืน แล้วยกเลิก
    const issued = await api("POST", `/api/material-requisitions/${slipId}/issues`, { lines: [{ lineId: slipLineId, qty: 2 }] });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect([await qty(screwId), await qty(washerId), await qty(nutId)]).toEqual([6, 22, 16]);
    const batch = issued.body.materialRequisition.issues[1];
    const cancel = await api("DELETE", `/api/material-requisitions/${slipId}/issues/${batch.id}`);
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
    expect([await qty(screwId), await qty(washerId), await qty(nutId)]).toEqual([8, 26, 18]);
  });

  it("รับเข้าคลัง (FG) เป็นชุดไม่ได้ — ปฏิเสธก่อนลงบรรทัดแรก", async () => {
    const rid = (await api("POST", "/api/store-receipts", { receiptCode: "FG" })).body.storeReceipt.id;
    const set = await api("PATCH", `/api/store-receipts/${rid}`, { reason: "x", lines: [{ productId: screwId, qty: 1 }, { productId: kitId, qty: 1 }] });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    await approve(`/api/store-receipts/${rid}`);
    const posted = await api("POST", `/api/store-receipts/${rid}/post`);
    expect(posted.status).toBe(400);
    expect(await qty(screwId)).toBe(8);
  });
});
