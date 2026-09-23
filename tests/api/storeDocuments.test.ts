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
    const wrongPair = await api("POST", "/api/store-receipts", { receiptCode: "JP" });
    const res = await api("PATCH", `/api/store-receipts/${wrongPair.body.storeReceipt.id}`, { sourceRequisitionId: issueId });
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
