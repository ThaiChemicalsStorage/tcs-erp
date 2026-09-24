import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ใบเบิกของสโตร์ (รหัสจ่าย 15 ตัว) + ใบรับคืน/รับเข้าคลัง (รหัสรับ 15 ตัว) — 2026-09-23
 *
 * ตรึงไว้ตลอดวงจร: เลขขึ้นต้นด้วยรหัสและนับแยก, ใบเบิกสโตร์คืนของในตัวใบไม่ได้ (ต้องผ่านใบคืน), ใบคืนเลือกได้
 * เฉพาะใบเบิกรหัสคู่กัน, คืนเกินที่จ่ายไม่ได้ทั้งตอนแก้และตอนรับเข้าคลัง, รับเข้าคลังแล้วยอดคืนในใบเบิกต้นทาง
 * ขยับตาม, รับเข้าคลังซ้ำไม่ได้, รับสินค้าสำเร็จรูปถัวต้นทุน และปรับยอดตั้งยอดตามที่นับได้
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let cookie: string;
let resinId = "";
let boltId = "";
let issueId = "";
let issueLineId = "";

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}
async function stock(id: string) {
  const p = await client.db("tcs_erp").collection("products").findOne({ _id: new ObjectId(id) });
  return { qty: p?.stockQty ?? 0, avg: p?.avgCost ?? 0 };
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
  resinId = (await db.collection("products").insertOne({ ...base, code: "RS-01", name: "เรซิน", unit: "ถัง", stockQty: 20, avgCost: 100 })).insertedId.toString();
  boltId = (await db.collection("products").insertOne({ ...base, code: "BT-12", name: "สลัก", unit: "ตัว", stockQty: 50, avgCost: 10 })).insertedId.toString();
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

describe("ใบเบิกของสโตร์", () => {
  it("ต้องระบุรหัสการจ่าย และเลขที่ขึ้นต้นด้วยรหัส", async () => {
    expect((await api("POST", "/api/material-requisitions", { ownerDepartment: "store" })).status).toBe(400);
    const res = await api("POST", "/api/material-requisitions", { ownerDepartment: "store", issueCode: "PD" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.materialRequisition).toMatchObject({ ownerDepartment: "store", issueCode: "PD" });
    expect(res.body.materialRequisition.id).toMatch(/^PD-\d{6}-0001$/);
    issueId = res.body.materialRequisition.id;
  });

  it("แก้รหัสงาน/เลขอ้างอิงได้ อนุมัติ แล้วสโตร์จ่ายของ — สต๊อกลด", async () => {
    const patched = await api("PATCH", `/api/material-requisitions/${issueId}`, {
      jobCode: "PQ2609-77", storeReference: "PDO-202609-0007",
      lines: [{ productId: resinId, category: "chemical", plannedQty: 5 }],
    });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body.materialRequisition).toMatchObject({ jobCode: "PQ2609-77", storeReference: "PDO-202609-0007" });
    issueLineId = patched.body.materialRequisition.lines[0].id;
    await approve(`/api/material-requisitions/${issueId}`);
    const issued = await api("POST", `/api/material-requisitions/${issueId}/issues`, { lines: [{ lineId: issueLineId, qty: 5 }] });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect((await stock(resinId)).qty).toBe(15);
  });

  it("คืนของในตัวใบเบิกสโตร์ไม่ได้ — ต้องผ่านใบรับคืน", async () => {
    const res = await api("POST", `/api/material-requisitions/${issueId}/return`, { lines: [{ id: issueLineId, returnQty: 1 }] });
    expect(res.status).toBe(400);
  });

  it("รายการใบเบิกของสโตร์แยกจากฝ่ายอื่น และอยู่ในคิวตัดของรวม", async () => {
    const store = await api("GET", "/api/material-requisitions?ownerDepartment=store");
    expect(store.body.materialRequisitions.map((m: { id: string }) => m.id)).toContain(issueId);
    const project = await api("GET", "/api/material-requisitions?ownerDepartment=project");
    expect(project.body.materialRequisitions.map((m: { id: string }) => m.id)).not.toContain(issueId);
  });
});

describe("ใบรับคืน / รับเข้าคลัง", () => {
  let jdId = "";

  it("ใบคืน JD เลือกได้เฉพาะใบเบิก PD ที่ยังมีของค้างคืน", async () => {
    const created = await api("POST", "/api/store-receipts", { receiptCode: "JD" });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    jdId = created.body.storeReceipt.id;
    expect(jdId).toMatch(/^JD-\d{6}-0001$/);
    const candidates = await api("GET", "/api/store-receipts/source-requisitions?receiptCode=JD");
    expect(candidates.body.requisitions.map((r: { id: string }) => r.id)).toEqual([issueId]);
    // ใบร่างยังเป็นต้นทางของใบคืนไม่ได้ (ตั้งแต่ 2026-09-23 ไม่จำกัดรหัสคู่แล้ว แต่ต้องอนุมัติแล้ว)
    const draftMr = await api("POST", "/api/material-requisitions", { ownerDepartment: "store", issueCode: "PP" });
    const other = await api("POST", "/api/store-receipts", { receiptCode: "JP" });
    const res = await api("PATCH", `/api/store-receipts/${other.body.storeReceipt.id}`, { sourceRequisitionId: draftMr.body.materialRequisition.id });
    expect(res.status).toBe(400);
  });

  it("เลือกใบเบิกแล้ว หัวใบและรายการตั้งตามใบเบิก — คืนเกินที่จ่ายไม่ได้", async () => {
    const set = await api("PATCH", `/api/store-receipts/${jdId}`, { sourceRequisitionId: issueId });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.storeReceipt).toMatchObject({ sourceRequisitionNumber: issueId, jobCode: "PQ2609-77" });
    const line = set.body.storeReceipt.lines[0];
    expect(set.body.sourceLines[0]).toMatchObject({ issued: 5, returned: 0 });
    expect((await api("PATCH", `/api/store-receipts/${jdId}`, { lines: [{ ...line, qty: 6 }] })).status).toBe(400);
    const ok = await api("PATCH", `/api/store-receipts/${jdId}`, { lines: [{ ...line, qty: 2 }] });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it("เลขที่ใบคืน = รหัสรับ + เลขเดียวกับใบเบิก · คืนจากใบเบิกเดียวกันซ้ำต่อท้าย /2 (2026-09-23)", async () => {
    const suffix = issueId.slice(issueId.indexOf("-") + 1);
    expect((await api("GET", `/api/store-receipts/${jdId}`)).body.storeReceipt.documentNumber).toBe(`JD-${suffix}`);

    // ใบคืนใบที่สอง เลขรันของตัวนับไม่ตรงกับใบเบิก — พอเลือกใบเบิกแล้วเลขที่ต้องตามใบเบิก
    const second = await api("POST", "/api/store-receipts", { receiptCode: "JD" });
    const secondId = second.body.storeReceipt.id;
    expect(secondId).not.toBe(`JD-${suffix}`);
    const paired = await api("PATCH", `/api/store-receipts/${secondId}`, { documentNumber: secondId, sourceRequisitionId: issueId });
    expect(paired.status, JSON.stringify(paired.body)).toBe(200);
    expect(paired.body.storeReceipt.documentNumber).toBe(`JD-${suffix}/2`);
    // บันทึกอัตโนมัติส่งเลขเดิมกลับมาทุกครั้ง — ต้องไม่ชนและไม่ถูกเปลี่ยนกลับ
    const again = await api("PATCH", `/api/store-receipts/${secondId}?autoSave=1`, { documentNumber: `JD-${suffix}/2`, reason: "" });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect(again.body.storeReceipt.documentNumber).toBe(`JD-${suffix}/2`);
    // เลขที่ใบที่ผูกใบเบิกแล้วค้นเจอด้วยทางลัดเลขที่เอกสาร
    const search = await api("GET", `/api/search?q=${encodeURIComponent(`JD-${suffix}/2`)}`);
    expect(search.body.exact?.document?.id).toBe(secondId);
    expect((await api("DELETE", `/api/store-receipts/${secondId}`)).status).toBe(204);
  });

  it("รับเข้าคลังได้หลังอนุมัติเท่านั้น — สต๊อกคืน และยอดคืนในใบเบิกต้นทางขยับตาม", async () => {
    expect((await api("POST", `/api/store-receipts/${jdId}/post`)).status).toBe(400);
    await approve(`/api/store-receipts/${jdId}`);
    const posted = await api("POST", `/api/store-receipts/${jdId}/post`);
    expect(posted.status, JSON.stringify(posted.body)).toBe(200);
    expect(posted.body.storeReceipt.postedAt).not.toBe("");
    expect((await stock(resinId)).qty).toBe(17);
    const mr = await api("GET", `/api/material-requisitions/${issueId}`);
    expect(mr.body.materialRequisition.lines[0].returnQty).toBe(2);
    const moves = await client.db("tcs_erp").collection("stock_movements").find({ sourceId: jdId }).toArray();
    expect(moves.map((m) => [m.kind, m.delta, m.sourceType])).toEqual([["return", 2, "store_receipt"]]);
    expect((await api("POST", `/api/store-receipts/${jdId}/post`)).status).toBe(400);
    expect((await api("DELETE", `/api/store-receipts/${jdId}`)).status).toBe(400);
  });

  it("กดพิมพ์ได้ต้นทุนต่อหน่วยของใบ — ลงสต๊อกแล้วใช้ต้นทุนจริง ยังไม่ลงใช้ต้นทุนปัจจุบัน (ใบพิมพ์แบบโปรแกรมเดิม)", async () => {
    const products = client.db("tcs_erp").collection("products");
    // ต้นทุนเฉลี่ยเปลี่ยนหลังจ่าย/รับคืนไปแล้ว — ใบที่ลงสต๊อกแล้วต้องยังพิมพ์ต้นทุนตอนลง (100) ไม่ใช่ค่าใหม่
    await products.updateOne({ _id: new ObjectId(resinId) }, { $set: { avgCost: 999 } });
    try {
      const mrPrint = await api("POST", `/api/material-requisitions/${issueId}/print`);
      expect(mrPrint.status).toBe(200);
      expect(mrPrint.body.unitCostByProduct[resinId]).toBe(100);
      const jdPrint = await api("POST", `/api/store-receipts/${jdId}/print`);
      expect(jdPrint.status).toBe(200);
      expect(jdPrint.body.unitCostByProduct[resinId]).toBe(100);

      const draft = await api("POST", "/api/store-receipts", { receiptCode: "JU" });
      const draftId = draft.body.storeReceipt.id;
      await api("PATCH", `/api/store-receipts/${draftId}`, { reason: "ทดสอบ", lines: [{ id: "srline_print_1", productId: resinId, qty: 17 }] });
      const draftPrint = await api("POST", `/api/store-receipts/${draftId}/print`);
      expect(draftPrint.body.unitCostByProduct[resinId]).toBe(999);
      await api("DELETE", `/api/store-receipts/${draftId}`);
    } finally {
      await products.updateOne({ _id: new ObjectId(resinId) }, { $set: { avgCost: 100 } });
    }
  });

  it("รับสินค้าสำเร็จรูป (FG) พร้อมต้นทุน — ถัวต้นทุนเฉลี่ยใหม่", async () => {
    const created = await api("POST", "/api/store-receipts", { receiptCode: "FG" });
    const id = created.body.storeReceipt.id;
    const patched = await api("PATCH", `/api/store-receipts/${id}`, { reference: "PDO-202609-0007", lines: [{ id: "srline_fg_1", productId: boltId, qty: 50, unitCost: 30 }] });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    await approve(`/api/store-receipts/${id}`);
    expect((await api("POST", `/api/store-receipts/${id}/post`)).status).toBe(200);
    const s = await stock(boltId);
    expect(s.qty).toBe(100);
    expect(s.avg).toBeCloseTo(20); // (50×10 + 50×30) / 100
  });

  it("ปรับยอดจากการตรวจนับ (TK) — ต้องมีเหตุผล และตั้งยอดตามที่นับได้", async () => {
    const created = await api("POST", "/api/store-receipts", { receiptCode: "TK" });
    const id = created.body.storeReceipt.id;
    expect((await api("PATCH", `/api/store-receipts/${id}`, { lines: [{ id: "srline_tk_1", productId: resinId, qty: 10 }] })).status).toBe(200);
    expect((await api("POST", `/api/store-receipts/${id}/submit-approval`)).status).toBe(200);
    expect((await api("POST", `/api/store-receipts/${id}/approve`)).status).toBe(400);
    expect((await api("POST", `/api/store-receipts/${id}/withdraw-approval`)).status).toBe(200);
    expect((await api("PATCH", `/api/store-receipts/${id}`, { reason: "ตรวจนับประจำเดือน" })).status).toBe(200);
    await approve(`/api/store-receipts/${id}`);
    expect((await api("POST", `/api/store-receipts/${id}/post`)).status).toBe(200);
    expect((await stock(resinId)).qty).toBe(10);
  });

  it("ใบรับคืนที่รออนุมัติอยู่ในกล่องเอกสารรออนุมัติ", async () => {
    const created = await api("POST", "/api/store-receipts", { receiptCode: "JU" });
    const id = created.body.storeReceipt.id;
    await api("PATCH", `/api/store-receipts/${id}`, { reason: "แก้ยอด", lines: [{ id: "srline_ju_1", productId: boltId, qty: 99 }] });
    expect((await api("POST", `/api/store-receipts/${id}/submit-approval`)).status).toBe(200);
    const inbox = await api("GET", "/api/pending-approvals");
    expect(inbox.body.items.some((it: { kind: string; id: string }) => it.kind === "storeReceipt" && it.id === id)).toBe(true);
  });
});

/**
 * สโตร์จ่ายของ/รับคืนแทนแผนก (2026-09-23) — เจ้าของ: *"อยากให้มันขึ้นเลขใบเบิกของแผนกอื่นมาให้หมด … สโตร์ก็จะมาจ่ายของ
 * คืนของในหน้านี้แทน แผนกอื่นไม่สามารถคืนของเองได้"* · ใบจ่ายอ้างใบเบิกแผนก → จ่ายแล้วยอดของแผนกลดตาม · ใบคืนอ้างใบเบิกแผนก
 * · เลขที่ทั้งสองใบตามเลขใบเบิก
 */
describe("ใบจ่าย/ใบคืนของสโตร์ อ้างใบเบิกของแผนก", () => {
  let deptId = "";
  let deptLineId = "";
  let slipId = "";
  let slipBatchId = "";
  const suffixOf = (id: string) => id.slice(id.indexOf("-") + 1);

  it("ใบเบิกแผนกที่อนุมัติแล้วขึ้นให้ใบจ่ายเลือก — เลือกแล้วรายการที่ค้างและเลขที่ใบตามใบเบิก", async () => {
    // เลขรันของใบเบิกแผนก (MR-) กับของใบสโตร์ (PD-) ใช้ช่วงเลขเดียวกัน — ขยับเลขใบเบิกแผนกให้พ้นเลขที่ใบสโตร์ในไฟล์นี้ใช้ไปแล้ว
    // ไม่งั้นเลขที่ตามใบเบิกจะชนแล้วถูกต่อท้าย /2 (พฤติกรรมที่ถูกต้อง แต่ไม่ใช่สิ่งที่ข้อนี้ตรวจ)
    for (let i = 0; i < 3; i++) await api("POST", "/api/material-requisitions", {});
    const created = await api("POST", "/api/material-requisitions", {});
    deptId = created.body.materialRequisition.id;
    const patched = await api("PATCH", `/api/material-requisitions/${deptId}`, { lines: [{ productId: boltId, category: "chemical", plannedQty: 4 }] });
    deptLineId = patched.body.materialRequisition.lines[0].id;
    await approve(`/api/material-requisitions/${deptId}`);

    const sources = await api("GET", "/api/material-requisitions/store-sources");
    expect(sources.status).toBe(200);
    expect(sources.body.requisitions.map((r: { id: string }) => r.id)).toContain(deptId);

    const slip = await api("POST", "/api/material-requisitions", { ownerDepartment: "store", issueCode: "PD" });
    slipId = slip.body.materialRequisition.id;
    const set = await api("PATCH", `/api/material-requisitions/${slipId}`, { documentNumber: slipId, sourceRequisitionId: deptId });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.materialRequisition).toMatchObject({ sourceRequisitionId: deptId, documentNumber: `PD-${suffixOf(deptId)}` });
    expect(set.body.materialRequisition.lines).toHaveLength(1);
    expect(set.body.materialRequisition.lines[0]).toMatchObject({ productId: boltId, plannedQty: 4, sourceLineId: deptLineId });
  });

  it("สโตร์จ่ายจากใบจ่าย → สต๊อกลด และใบเบิกแผนกเห็นยอดจ่าย (ไม่ตัดสต๊อกซ้ำ)", async () => {
    await approve(`/api/material-requisitions/${slipId}`);
    const slip = (await api("GET", `/api/material-requisitions/${slipId}`)).body.materialRequisition;
    const before = (await stock(boltId)).qty;
    const issued = await api("POST", `/api/material-requisitions/${slipId}/issues`, { lines: [{ lineId: slip.lines[0].id, qty: 3 }] });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    slipBatchId = issued.body.materialRequisition.issues[0].id;
    expect((await stock(boltId)).qty).toBe(before - 3);
    const dept = (await api("GET", `/api/material-requisitions/${deptId}`)).body.materialRequisition;
    expect(dept.lines[0].withdrawal1Qty).toBe(3);
    expect(dept.issues[0]).toMatchObject({ storeSlipId: slipId, stockMovementIds: [] });
    // ใบเบิกแผนกยกเลิกรอบที่มาจากใบจ่ายเองไม่ได้
    expect((await api("DELETE", `/api/material-requisitions/${deptId}/issues/${dept.issues[0].id}`)).status).toBe(400);
  });

  it("ใบจ่ายใบที่สองจากใบเบิกเดียวกัน — เลขต่อท้าย /2 และจ่ายเกินที่แผนกยังค้างได้", async () => {
    const slip2 = await api("POST", "/api/material-requisitions", { ownerDepartment: "store", issueCode: "PD" });
    const id2 = slip2.body.materialRequisition.id;
    const set = await api("PATCH", `/api/material-requisitions/${id2}`, { sourceRequisitionId: deptId });
    expect(set.body.materialRequisition.documentNumber).toBe(`PD-${suffixOf(deptId)}/2`);
    expect(set.body.materialRequisition.lines[0].plannedQty).toBe(1);
    const line = set.body.materialRequisition.lines[0];
    await api("PATCH", `/api/material-requisitions/${id2}`, { lines: [{ ...line, plannedQty: 5 }] });
    await approve(`/api/material-requisitions/${id2}`);
    // จ่ายเกินที่แผนกยังค้างได้แล้ว (2026-09-24) — ยอดเกินบันทึกลงใบเบิกแผนกด้วย ค้างเบิกเป็นศูนย์ไม่ติดลบ
    const over = await api("POST", `/api/material-requisitions/${id2}/issues`, { lines: [{ lineId: line.id, qty: 2 }] });
    expect(over.status, JSON.stringify(over.body)).toBe(200);
    const dept = (await api("GET", `/api/material-requisitions/${deptId}`)).body.materialRequisition;
    expect(dept.lines[0].withdrawal1Qty + (dept.lines[0].withdrawal2Qty ?? 0)).toBe(5);
    // ยกเลิกรอบที่เกินไว้ ให้ข้อถัดไปเริ่มจากยอดเดิม
    expect((await api("DELETE", `/api/material-requisitions/${id2}/issues/${over.body.materialRequisition.issues[0].id}`)).status).toBe(200);
  });

  it("ใบคืนอ้างใบเบิกของแผนกได้ เลขที่ตามใบเบิก — รับเข้าคลังแล้วยอดคืนลงใบเบิกแผนก", async () => {
    const candidates = await api("GET", "/api/store-receipts/source-requisitions?receiptCode=JD");
    const ids = candidates.body.requisitions.map((r: { id: string }) => r.id);
    expect(ids).toContain(deptId);
    expect(ids).not.toContain(slipId); // ใบจ่ายที่อ้างใบเบิกแผนก ให้คืนที่ใบเบิกแผนกแทน
    const receipt = await api("POST", "/api/store-receipts", { receiptCode: "JD" });
    const rid = receipt.body.storeReceipt.id;
    const set = await api("PATCH", `/api/store-receipts/${rid}`, { sourceRequisitionId: deptId });
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body.storeReceipt.documentNumber).toBe(`JD-${suffixOf(deptId)}`);
    const line = set.body.storeReceipt.lines[0];
    await api("PATCH", `/api/store-receipts/${rid}`, { lines: [{ ...line, qty: 1 }] });
    await approve(`/api/store-receipts/${rid}`);
    expect((await api("POST", `/api/store-receipts/${rid}/post`)).status).toBe(200);
    const dept = (await api("GET", `/api/material-requisitions/${deptId}`)).body.materialRequisition;
    expect(dept.lines[0].returnQty).toBe(1);
  });

  it("ยกเลิกรอบจ่ายของใบจ่ายไม่ได้ถ้าแผนกคืนของไปแล้วเกินที่จะเหลือ", async () => {
    const res = await api("DELETE", `/api/material-requisitions/${slipId}/issues/${slipBatchId}`);
    expect(res.status).toBe(400);
  });
});
