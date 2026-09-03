import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ใบเบิก: สต๊อกตัดตอนสโตร์จ่ายของจริง ไม่ใช่ตอนอนุมัติ (เจ้าของเลือก 2026-09-03) — ยิง route จริงผ่าน
 * Express บน MongoDB ในหน่วยความจำ · ใบเบิกถูกใส่ลงฐานข้อมูลตรง ๆ ในสถานะที่ต้องการ เพราะการสร้างผ่าน
 * API ต้องมี Scope of Work → โครงการ → รายการ ซึ่งไม่ใช่สิ่งที่เทสต์นี้ตรวจ
 *
 * สิ่งที่ตรึงไว้ เพราะพลาดแล้วตัวเลขสต๊อกจะโกหกเงียบ ๆ:
 *   1. อนุมัติได้แม้สต๊อกเป็นศูนย์ และการอนุมัติไม่แตะสต๊อกเลย
 *   2. จ่ายของตัดตาม**ส่วนต่าง** — บันทึกซ้ำด้วยตัวเลขเดิมไม่ตัดซ้ำ แก้เลขลงได้ของกลับเข้าคลัง
 *   3. จ่ายเกินที่ขอ / ของไม่พอ → 400 และไม่เขียนอะไรครึ่งเดียว
 *   4. คืนของเกินที่จ่าย → 400 · คืนแล้วเคลียร์ช่องเป็นว่าง → สต๊อกย้อนกลับ (บั๊ก union ที่แก้)
 *   5. ทุก movement ประทับแผนก/ทีม และของคืนเป็น kind `return`
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let productA: string;
let productB: string;
let departmentId: string;
let teamId: string;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}

type Line = { id: string; productId: string; plannedQty: number | null; withdrawal1Qty: number | null; withdrawal2Qty: number | null; returnQty: number | null };
type Doc = { id: string; documentNumber: string; status: string; lines: Line[]; chargeDepartmentName: string; chargeTeamName: string; storeDeptBy: string };

async function stockOf(productId: string): Promise<number> {
  const { ObjectId } = await import("mongodb");
  const p = await client.db("tcs_erp").collection("products").findOne({ _id: new ObjectId(productId) });
  return (p?.stockQty as number) ?? 0;
}
async function movementsOf(id: string) {
  return client.db("tcs_erp").collection("stock_movements").find({ sourceId: id }).sort({ createdAt: 1 }).toArray();
}

let seq = 0;
/** ใส่ใบเบิกลงฐานข้อมูลตรง ๆ — สองบรรทัด สินค้า A ขอ 10, สินค้า B ขอ 5 */
async function seedRequisition(status: "Draft" | "PendingApproval" | "Final", lines?: Partial<Line>[]): Promise<string> {
  seq += 1;
  const id = `MR-TEST-${String(seq).padStart(4, "0")}`;
  const base: Line[] = [
    { id: "l1", productId: productA, plannedQty: 10, withdrawal1Qty: null, withdrawal2Qty: null, returnQty: null },
    { id: "l2", productId: productB, plannedQty: 5, withdrawal1Qty: null, withdrawal2Qty: null, returnQty: null },
  ];
  await client.db("tcs_erp").collection("material_requisitions").insertOne({
    _id: id as never, documentNumber: id, projectId: "", scopeOfWorkId: "", jobCode: "TEST-JOB", customerName: "ลูกค้าทดสอบ",
    ownerDepartment: "production", productionOrderId: "", jobOrderId: null, jobOrderCode: "",
    productName: "งานทดสอบ", responsibleEmployee: "", productionStartDate: "",
    chargeDepartmentId: departmentId, chargeDepartmentName: "ฝ่ายผลิต", chargeTeamId: teamId, chargeTeamName: "ทีม A",
    chargeWorkTypeCode: "STEEL", chargeWorkTypeName: "งานเหล็ก",
    lines: (lines ?? base).map((l, i) => ({ ...base[i], ...l, productCode: `P${i}`, productName: `สินค้า ${i}`, unit: "ชิ้น", category: "other", actualUsedQty: null })),
    status, revisionNote: "",
    preparedBy: "ผู้จัดทำ", preparedAt: "2026-09-03", approvedBy: "", approvedAt: "",
    storeDeptBy: "", storeDeptAt: "", costDeptBy: "", costDeptAt: "",
    returnedBy: "", returnReceivedBy: "", returnedAt: "",
    createdAt: "2026-09-03T00:00:00.000Z", updatedAt: "2026-09-03T00:00:00.000Z", createdBy: "", updatedBy: "", isDeleted: false,
  });
  return id;
}

async function setStock(productId: string, qty: number) {
  const { ObjectId } = await import("mongodb");
  await client.db("tcs_erp").collection("products").updateOne({ _id: new ObjectId(productId) }, { $set: { stockQty: qty } });
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
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const db = client.db("tcs_erp");
  const productBase = { categoryId: "", unit: "ชิ้น", defaultPrice: 0, description: "", specifications: "", archived: false, reorderPoint: 0, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" };
  productA = (await db.collection("products").insertOne({ ...productBase, code: "ISS-A", name: "สินค้า A", stockQty: 0 })).insertedId.toString();
  productB = (await db.collection("products").insertOne({ ...productBase, code: "ISS-B", name: "สินค้า B", stockQty: 100 })).insertedId.toString();
  departmentId = (await db.collection("departments").insertOne({ name: "ฝ่ายผลิต", code: "PROD", isActive: true, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" })).insertedId.toString();
  teamId = (await db.collection("teams").insertOne({ name: "ทีม A", departmentId, isActive: true, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" })).insertedId.toString();
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

describe("อนุมัติใบเบิก — ไม่แตะสต๊อก", () => {
  it("อนุมัติได้แม้สินค้าคงเหลือ 0 และไม่มี movement เกิดขึ้น", async () => {
    await setStock(productA, 0);
    const id = await seedRequisition("PendingApproval");
    const res = await api(`/api/material-requisitions/${id}/approve`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { materialRequisition: Doc }).materialRequisition.status).toBe("Final");
    expect(await stockOf(productA)).toBe(0);
    expect(await movementsOf(id)).toHaveLength(0);
  });

  it("GET ส่ง stockByProduct ของทุกสินค้าในใบมาด้วย", async () => {
    await setStock(productA, 7);
    const id = await seedRequisition("Final");
    const body = (await (await api(`/api/material-requisitions/${id}`)).json()) as { stockByProduct: Record<string, number>; materialRequisition: Doc };
    expect(body.stockByProduct[productA]).toBe(7);
    expect(body.stockByProduct[productB]).toBe(100);
    expect(body.materialRequisition.documentNumber).toBe(id);
  });
});

describe("POST /:id/issue — สโตร์จ่ายของ", () => {
  it("ใบที่ยังไม่อนุมัติจ่ายไม่ได้", async () => {
    const id = await seedRequisition("Draft");
    const res = await api(`/api/material-requisitions/${id}/issue`, { method: "POST", body: JSON.stringify({ lines: [{ id: "l1", withdrawal1Qty: 1 }] }) });
    expect(res.status).toBe(400);
  });

  it("จ่ายบางส่วนตัดสต๊อกเท่าที่จ่าย ค้างเบิกที่เหลือ และประทับแผนก/ทีม/ประเภทงาน", async () => {
    await setStock(productA, 20);
    const id = await seedRequisition("Final");
    const res = await api(`/api/material-requisitions/${id}/issue`, {
      method: "POST", body: JSON.stringify({ lines: [{ id: "l1", withdrawal1Qty: 4, withdrawal2Qty: null }], storeDeptBy: "คนสโตร์" }),
    });
    expect(res.status).toBe(200);
    const doc = ((await res.json()) as { materialRequisition: Doc }).materialRequisition;
    expect(doc.lines[0].withdrawal1Qty).toBe(4);
    expect(doc.storeDeptBy).toBe("คนสโตร์");
    expect(await stockOf(productA)).toBe(16);
    const moves = await movementsOf(id);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ kind: "deduct", delta: -4, departmentId, departmentName: "ฝ่ายผลิต", teamId, teamName: "ทีม A", workTypeCode: "STEEL", sourceLabel: id });
  });

  it("บันทึกซ้ำด้วยตัวเลขเดิมไม่ตัดซ้ำ · เพิ่มครั้งที่ 2 ตัดเฉพาะส่วนเพิ่ม · แก้เลขลงของกลับเข้าคลัง", async () => {
    await setStock(productA, 20);
    const id = await seedRequisition("Final");
    const issue = (lines: unknown[]) => api(`/api/material-requisitions/${id}/issue`, { method: "POST", body: JSON.stringify({ lines }) });
    expect((await issue([{ id: "l1", withdrawal1Qty: 4 }])).status).toBe(200);
    expect((await issue([{ id: "l1", withdrawal1Qty: 4 }])).status).toBe(200);
    expect(await stockOf(productA), "ยิงซ้ำต้องไม่ตัดซ้ำ").toBe(16);
    expect((await issue([{ id: "l1", withdrawal1Qty: 4, withdrawal2Qty: 3 }])).status).toBe(200);
    expect(await stockOf(productA), "ครั้งที่ 2 ตัดเพิ่มแค่ 3").toBe(13);
    expect((await issue([{ id: "l1", withdrawal1Qty: 2, withdrawal2Qty: 3 }])).status).toBe(200);
    expect(await stockOf(productA), "แก้ครั้งที่ 1 จาก 4 เป็น 2 → ของกลับ 2").toBe(15);
    const moves = await movementsOf(id);
    expect(moves.map((m) => [m.kind, m.delta])).toEqual([["deduct", -4], ["deduct", -3], ["return", 2]]);
  });

  it("จ่ายเกินที่ขอเบิก → 400 และสต๊อกไม่เปลี่ยน", async () => {
    await setStock(productA, 50);
    const id = await seedRequisition("Final");
    const res = await api(`/api/material-requisitions/${id}/issue`, { method: "POST", body: JSON.stringify({ lines: [{ id: "l1", withdrawal1Qty: 8, withdrawal2Qty: 3 }] }) });
    expect(res.status).toBe(400);
    expect(await stockOf(productA)).toBe(50);
  });

  it("ของไม่พอ → 400 ก่อนเขียนอะไรเลย แม้อีกบรรทัดจะพอ", async () => {
    await setStock(productA, 2);
    await setStock(productB, 100);
    const id = await seedRequisition("Final");
    const res = await api(`/api/material-requisitions/${id}/issue`, {
      method: "POST", body: JSON.stringify({ lines: [{ id: "l2", withdrawal1Qty: 5 }, { id: "l1", withdrawal1Qty: 5 }] }),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("ไม่พอ");
    expect(await stockOf(productB), "บรรทัดที่พอต้องไม่ถูกตัดไปก่อน").toBe(100);
    expect(await movementsOf(id)).toHaveLength(0);
  });

  it("สโตร์เปลี่ยนแผนก/ทีมที่ตัดให้ตอนจ่ายได้ และชื่อถูกเติมจากทะเบียน ไม่รับจาก client", async () => {
    await setStock(productA, 20);
    const id = await seedRequisition("Final");
    const db = client.db("tcs_erp");
    const otherDept = (await db.collection("departments").insertOne({ name: "ฝ่ายโครงการ", code: "PJ", isActive: true, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" })).insertedId.toString();
    const res = await api(`/api/material-requisitions/${id}/issue`, {
      method: "POST",
      body: JSON.stringify({ lines: [{ id: "l1", withdrawal1Qty: 1 }], chargeDepartmentId: otherDept, chargeDepartmentName: "ชื่อปลอม", chargeTeamId: "", chargeWorkTypeCode: "fab", chargeWorkTypeName: "งานโรงงาน" }),
    });
    expect(res.status).toBe(200);
    const doc = ((await res.json()) as { materialRequisition: Doc & { chargeWorkTypeCode: string } }).materialRequisition;
    expect(doc.chargeDepartmentName).toBe("ฝ่ายโครงการ");
    expect(doc.chargeTeamName).toBe("");
    expect(doc.chargeWorkTypeCode).toBe("FAB");
    const [move] = await movementsOf(id);
    expect(move).toMatchObject({ departmentId: otherDept, departmentName: "ฝ่ายโครงการ", workTypeCode: "FAB", workTypeName: "งานโรงงาน" });
    expect(move.teamId).toBeUndefined();
  });
});

describe("POST /:id/return — คืนของ", () => {
  it("คืนเกินที่จ่ายไปแล้ว → 400", async () => {
    await setStock(productA, 20);
    const id = await seedRequisition("Final");
    await api(`/api/material-requisitions/${id}/issue`, { method: "POST", body: JSON.stringify({ lines: [{ id: "l1", withdrawal1Qty: 4 }] }) });
    const res = await api(`/api/material-requisitions/${id}/return`, { method: "POST", body: JSON.stringify({ lines: [{ id: "l1", returnQty: 5 }] }) });
    expect(res.status).toBe(400);
    expect(await stockOf(productA)).toBe(16);
  });

  it("คืนตามส่วนต่าง ลงเป็น kind return · เคลียร์ช่องเป็นว่างแล้วสต๊อกย้อนกลับ", async () => {
    await setStock(productA, 20);
    const id = await seedRequisition("Final");
    await api(`/api/material-requisitions/${id}/issue`, { method: "POST", body: JSON.stringify({ lines: [{ id: "l1", withdrawal1Qty: 6 }] }) });
    const ret = (lines: unknown[]) => api(`/api/material-requisitions/${id}/return`, { method: "POST", body: JSON.stringify({ lines, returnedBy: "ช่าง", returnReceivedBy: "สโตร์" }) });
    expect((await ret([{ id: "l1", returnQty: 2 }])).status).toBe(200);
    expect(await stockOf(productA)).toBe(16);
    expect((await ret([{ id: "l1", returnQty: 2 }])).status).toBe(200);
    expect(await stockOf(productA), "บันทึกซ้ำไม่รับคืนซ้ำ").toBe(16);
    expect((await ret([{ id: "l1", returnQty: null }])).status).toBe(200);
    expect(await stockOf(productA), "เคลียร์ช่องคืน = ของออกจากคลังอีกครั้ง").toBe(14);
    const kinds = (await movementsOf(id)).map((m) => [m.kind, m.delta]);
    expect(kinds).toEqual([["deduct", -6], ["return", 2], ["deduct", -2]]);
  });

  it("ใบที่ยังไม่อนุมัติบันทึกคืนไม่ได้ — ของยังไม่เคยถูกจ่าย", async () => {
    const id = await seedRequisition("Draft");
    const res = await api(`/api/material-requisitions/${id}/return`, { method: "POST", body: JSON.stringify({ lines: [{ id: "l1", returnQty: 1 }] }) });
    expect(res.status).toBe(400);
  });
});

describe("PATCH — เลขบนฟอร์มและช่องของสโตร์", () => {
  it("client ยัดเบิกครั้งที่ 1/2 หรือคืนของผ่าน PATCH ไม่ได้ — ค่าเดิมของบรรทัดถูกคงไว้", async () => {
    const id = await seedRequisition("Draft");
    const res = await api(`/api/material-requisitions/${id}`, {
      method: "PATCH", body: JSON.stringify({ lines: [{ id: "l1", productId: productA, category: "other", plannedQty: 12, withdrawal1Qty: 9, returnQty: 3 }] }),
    });
    expect(res.status).toBe(200);
    const doc = ((await res.json()) as { materialRequisition: Doc }).materialRequisition;
    expect(doc.lines[0].plannedQty).toBe(12);
    expect(doc.lines[0].withdrawal1Qty).toBeNull();
    expect(doc.lines[0].returnQty).toBeNull();
  });

  it("พิมพ์เลขบนฟอร์มทับได้ตอนร่าง ห้ามซ้ำ และว่างแล้วถอยกลับเป็นเลขรัน", async () => {
    const a = await seedRequisition("Draft");
    const b = await seedRequisition("Draft");
    const patch = (id: string, documentNumber: string) => api(`/api/material-requisitions/${id}`, { method: "PATCH", body: JSON.stringify({ documentNumber }) });
    expect((await patch(a, "SC-2026-09-001-MR1")).status).toBe(200);
    expect((await patch(b, "SC-2026-09-001-MR1")).status, "ซ้ำกับใบ a").toBe(409);
    const cleared = (await patch(a, "")).status;
    expect(cleared).toBe(200);
    const doc = (await (await api(`/api/material-requisitions/${a}`)).json()) as { materialRequisition: Doc };
    expect(doc.materialRequisition.documentNumber).toBe(a);
  });

  it("ใบอนุมัติแล้วเปลี่ยนเลขบนฟอร์มไม่ได้", async () => {
    const id = await seedRequisition("Final");
    const res = await api(`/api/material-requisitions/${id}`, { method: "PATCH", body: JSON.stringify({ documentNumber: "X-1" }) });
    expect(res.status).toBe(400);
  });
});

describe("รายการใบเบิก", () => {
  it("summary บอกว่าใบไหนยังค้างเบิก", async () => {
    await setStock(productA, 20);
    const id = await seedRequisition("Final");
    await api(`/api/material-requisitions/${id}/issue`, { method: "POST", body: JSON.stringify({ lines: [{ id: "l1", withdrawal1Qty: 10 }, { id: "l2", withdrawal1Qty: 2 }] }) });
    const list = (await (await api("/api/material-requisitions?ownerDepartment=production")).json()) as { materialRequisitions: { id: string; hasOutstanding: boolean; chargeTeamName: string }[] };
    const row = list.materialRequisitions.find((m) => m.id === id);
    expect(row?.hasOutstanding, "สินค้า B ขอ 5 จ่าย 2").toBe(true);
    expect(row?.chargeTeamName).toBe("ทีม A");
  });
});
