import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ฝ่ายจัดซื้ออนุมัติใบขอซื้อ**รายบรรทัด** (เจ้าของสั่ง 2026-10-02 — *"อนุมัติได้แค่จัดซื้อ · ติ๊กแค่ 3 อันก็เอา 3 อันนั้น
 * ไปเปิด PO ก่อนได้"*)
 *
 *   1. อนุมัติบางบรรทัด → ใบยังอยู่ขั้นตรวจ แต่เปิดใบสั่งซื้อให้บรรทัดที่อนุมัติได้ทันที · บรรทัดที่ยังไม่อนุมัติเปิดไม่ได้
 *   2. ไม่อนุมัติต้องมีเหตุผล · บรรทัดที่ไม่อนุมัติไม่ถูกลอกไปใบสั่งซื้อ และไม่นับในการ "ออกครบ"
 *   3. ตัดสินครบทุกบรรทัด → ใบเป็น "จัดซื้ออนุมัติแล้ว" และลงชื่อช่องจัดซื้อ
 *   4. ระหว่างตรวจ แก้บรรทัดที่ตัดสินแล้วไม่ได้ แก้บรรทัดที่ยังไม่ตัดสินได้
 *   5. ถอนการอนุมัติล้างผลรายบรรทัด (เมื่อยังไม่มีใบสั่งซื้อ) · ปุ่มอนุมัติทั้งใบแบบเดิมยังใช้ได้
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;
const enc = encodeURIComponent;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
type Line = { id: string; description: string; qtyRequested: number | null; purchasingApproval?: string; purchasingRejectReason?: string; purchasingDecidedByName?: string };
type Pr = { id: string; status: string; purchasingStage?: string; purchasingDeptBy?: string; lines: Line[] };
type Po = { id: string; lines: { sourcePrLineId?: string; description: string }[] };

const LINES = [
  { id: "l1", productId: "", productCode: "", description: "ปั๊มเคมี", subDetails: [], unit: "ตัว", qtyRequested: 2 },
  { id: "l2", productId: "", productCode: "", description: "หน้าแปลน", subDetails: [], unit: "ชิ้น", qtyRequested: 16 },
  { id: "l3", productId: "", productCode: "", description: "ประเก็น", subDetails: [], unit: "ชิ้น", qtyRequested: 32 },
];

/** ใบที่ถึงจัดซื้อแล้ว (ขั้นตรวจ) 3 บรรทัด */
async function atPurchasing(): Promise<Pr> {
  const created = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
  const pr = (await json<{ purchaseRequest: Pr }>(created)).purchaseRequest;
  expect((await api(`/api/purchase-requests/${enc(pr.id)}`, { method: "PATCH", body: JSON.stringify({ lines: LINES }) })).status).toBe(200);
  expect((await api(`/api/purchase-requests/${enc(pr.id)}/submit-approval`, { method: "POST" })).status).toBe(200);
  expect((await api(`/api/purchase-requests/${enc(pr.id)}/approve`, { method: "POST" })).status).toBe(200);
  const res = await api(`/api/purchase-requests/${enc(pr.id)}/pull-to-purchasing`, { method: "POST" });
  expect(res.status).toBe(200);
  const doc = (await json<{ purchaseRequest: Pr }>(res)).purchaseRequest;
  expect(doc.purchasingStage).toBe("review");
  return doc;
}
async function approveLines(id: string, lineIds?: string[]): Promise<Response> {
  return api(`/api/purchase-requests/${enc(id)}/purchasing-approve`, { method: "POST", body: JSON.stringify(lineIds ? { lineIds } : {}) });
}
async function rejectLines(id: string, lineIds: string[], reason: string): Promise<Response> {
  return api(`/api/purchase-requests/${enc(id)}/purchasing-reject-lines`, { method: "POST", body: JSON.stringify({ lineIds, reason }) });
}
async function createPo(purchaseRequestId: string, lineIds?: string[]): Promise<Response> {
  return api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ purchaseRequestId, ...(lineIds ? { lineIds } : {}) }) });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin Buyer", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("จัดซื้ออนุมัติรายบรรทัด", () => {
  it("อนุมัติ 2 ใน 3 บรรทัด → ยังอยู่ขั้นตรวจ · เปิดใบสั่งซื้อได้เฉพาะ 2 บรรทัดนั้น", async () => {
    const pr = await atPurchasing();
    expect((await createPo(pr.id)).status).toBe(400); // ยังไม่มีบรรทัดไหนอนุมัติ

    const res = await approveLines(pr.id, ["l1", "l2"]);
    expect(res.status).toBe(200);
    const doc = (await json<{ purchaseRequest: Pr }>(res)).purchaseRequest;
    expect(doc.purchasingStage).toBe("review");
    expect(doc.lines.map((l) => l.purchasingApproval ?? "")).toEqual(["approved", "approved", ""]);
    expect(doc.lines[0].purchasingDecidedByName).toBe("Admin Buyer");

    const notYet = await createPo(pr.id, ["l3"]);
    expect(notYet.status).toBe(400);
    expect((await json<{ error: string }>(notYet)).error).toContain("ยังไม่ได้อนุมัติ");

    const po = await createPo(pr.id); // ไม่ระบุ = ทุกบรรทัดที่อนุมัติแล้วและยังไม่ได้ซื้อ
    expect(po.status).toBe(201);
    expect((await json<{ purchaseOrder: Po }>(po)).purchaseOrder.lines.map((l) => l.sourcePrLineId)).toEqual(["l1", "l2"]);

    // อนุมัติตัวที่เหลือ → ครบ → ใบล็อก + ลงชื่อ · เปิดใบที่สองให้บรรทัดนั้น (ผู้ขายอีกราย)
    const rest = await approveLines(pr.id, ["l3"]);
    const done = (await json<{ purchaseRequest: Pr }>(rest)).purchaseRequest;
    expect(done.purchasingStage).toBe("approved");
    expect(done.purchasingDeptBy).toBe("Admin Buyer");
    const po2 = await createPo(pr.id, ["l3"]);
    expect(po2.status).toBe(201);

    const list = await json<{ purchaseRequests: { id: string; purchaseState?: string; purchasingCompletedAt?: string }[] }>(
      await api("/api/purchase-requests?ownerDepartment=all"));
    const row = list.purchaseRequests.find((p) => p.id === pr.id);
    expect(row?.purchaseState).toBe("full");
    expect(row?.purchasingCompletedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ไม่อนุมัติต้องมีเหตุผล · บรรทัดที่ไม่อนุมัติไม่ถูกลอกไป และไม่นับในการออกครบ", async () => {
    const pr = await atPurchasing();
    expect((await rejectLines(pr.id, ["l3"], "")).status).toBe(400);
    const rej = await rejectLines(pr.id, ["l3"], "ยกเลิกงานส่วนนี้แล้ว");
    expect(rej.status).toBe(200);
    expect((await json<{ purchaseRequest: Pr }>(rej)).purchaseRequest.lines[2].purchasingRejectReason).toBe("ยกเลิกงานส่วนนี้แล้ว");

    expect((await createPo(pr.id, ["l3"])).status).toBe(400);
    expect((await approveLines(pr.id, ["l3"])).status).toBe(400); // ตัดสินไปแล้ว

    const all = await approveLines(pr.id); // ที่เหลือทั้งหมด (l1, l2)
    expect((await json<{ purchaseRequest: Pr }>(all)).purchaseRequest.purchasingStage).toBe("approved");
    const po = await createPo(pr.id);
    expect((await json<{ purchaseOrder: Po }>(po)).purchaseOrder.lines.map((l) => l.sourcePrLineId)).toEqual(["l1", "l2"]);

    const list = await json<{ purchaseRequests: { id: string; purchaseState?: string }[] }>(await api("/api/purchase-requests?ownerDepartment=all"));
    expect(list.purchaseRequests.find((p) => p.id === pr.id)?.purchaseState).toBe("full");
  });

  it("ระหว่างตรวจ: แก้บรรทัดที่อนุมัติแล้วไม่ได้ · แก้บรรทัดที่ยังไม่ตัดสินได้", async () => {
    const pr = await atPurchasing();
    expect((await approveLines(pr.id, ["l1"])).status).toBe(200);
    const changedApproved = LINES.map((l) => (l.id === "l1" ? { ...l, qtyRequested: 99 } : l));
    const bad = await api(`/api/purchase-requests/${enc(pr.id)}`, { method: "PATCH", body: JSON.stringify({ lines: changedApproved }) });
    expect(bad.status).toBe(400);
    const removeApproved = LINES.filter((l) => l.id !== "l1");
    expect((await api(`/api/purchase-requests/${enc(pr.id)}`, { method: "PATCH", body: JSON.stringify({ lines: removeApproved }) })).status).toBe(400);

    const changedOpen = LINES.map((l) => (l.id === "l2" ? { ...l, description: "หน้าแปลน SUS316" } : l));
    const ok = await api(`/api/purchase-requests/${enc(pr.id)}`, { method: "PATCH", body: JSON.stringify({ lines: changedOpen }) });
    expect(ok.status).toBe(200);
    const doc = (await json<{ purchaseRequest: Pr }>(ok)).purchaseRequest;
    expect(doc.lines[1].description).toBe("หน้าแปลน SUS316");
    expect(doc.lines[0].purchasingApproval).toBe("approved"); // PATCH ไม่ล้างผลการตัดสิน
  });

  it("ถอนการอนุมัติล้างผลรายบรรทัดเมื่อยังไม่มีใบสั่งซื้อ · มีใบสั่งซื้อแล้วถอนไม่ได้", async () => {
    const pr = await atPurchasing();
    expect((await approveLines(pr.id, ["l1"])).status).toBe(200);
    const reopened = await api(`/api/purchase-requests/${enc(pr.id)}/purchasing-reopen`, { method: "POST" });
    expect(reopened.status).toBe(200);
    expect((await json<{ purchaseRequest: Pr }>(reopened)).purchaseRequest.lines.every((l) => !l.purchasingApproval)).toBe(true);

    expect((await approveLines(pr.id, ["l1"])).status).toBe(200);
    expect((await createPo(pr.id)).status).toBe(201);
    expect((await api(`/api/purchase-requests/${enc(pr.id)}/purchasing-reopen`, { method: "POST" })).status).toBe(400);
  });

  it("ปุ่มอนุมัติทั้งใบแบบเดิม (ไม่ส่ง lineIds) อนุมัติทุกบรรทัดและล็อกใบ", async () => {
    const pr = await atPurchasing();
    const res = await approveLines(pr.id);
    const doc = (await json<{ purchaseRequest: Pr }>(res)).purchaseRequest;
    expect(doc.purchasingStage).toBe("approved");
    expect(doc.lines.every((l) => l.purchasingApproval === "approved")).toBe(true);
  });
});
