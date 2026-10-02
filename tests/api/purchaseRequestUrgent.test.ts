import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ใบขอซื้อ — งานด่วน · เวลาถึงจัดซื้อ · รหัสงานของใบที่ไม่มีเอกสารต้นทาง (เจ้าของสั่ง 2026-10-02)
 *
 * สิ่งที่ตรึงไว้:
 *   1. ติ๊กงานด่วนแล้วไม่มีเหตุผล → ส่งขออนุมัติไม่ได้ (บันทึกร่างได้ตามปกติ)
 *   2. `submittedAt` ถูกเขียนตอนส่งขอ · `purchasingReceivedAt` ถูกเขียนตอนสโตร์ส่งต่อ/จัดซื้อดึงมา
 *      และไม่เลื่อนเมื่อสโตร์เช็คซ้ำ
 *   3. รหัสงานพิมพ์เองได้เฉพาะใบ `general` — ใบจากโครงการ/ใบสั่งผลิตส่งมาก็ไม่รับ
 *   4. หน้ารายการได้วันที่ออกใบสั่งซื้อครบ (หยุดนับ) เมื่อทุกบรรทัดมีใบสั่งซื้อ
 *   5. Rewrite ไม่พาเวลาเริ่มนับของฉบับเดิมไป แต่สืบทอดงานด่วน
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

type Pr = {
  id: string; status: string; jobCode: string; ownerDepartment?: string;
  urgent?: boolean; urgentReason?: string; submittedAt?: string; purchasingReceivedAt?: string;
};
type Summary = Pr & { purchaseState?: string; purchasingCompletedAt?: string };

const enc = encodeURIComponent;

async function createStandalone(): Promise<Pr> {
  const res = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
  expect(res.status).toBe(201);
  return (await json<{ purchaseRequest: Pr }>(res)).purchaseRequest;
}
async function patch(id: string, body: Record<string, unknown>): Promise<Response> {
  return api(`/api/purchase-requests/${enc(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}
const LINES = [
  { id: "l1", productId: null, productCode: "", description: "ปั๊มเคมี", subDetails: [], unit: "ตัว", qtyRequested: 2 },
  { id: "l2", productId: null, productCode: "", description: "ท่อ PVC", subDetails: [], unit: "เส้น", qtyRequested: 10 },
];
async function submitAndApprove(id: string): Promise<void> {
  expect((await api(`/api/purchase-requests/${enc(id)}/submit-approval`, { method: "POST" })).status).toBe(200);
  expect((await api(`/api/purchase-requests/${enc(id)}/approve`, { method: "POST" })).status).toBe(200);
}
async function storeReview(id: string): Promise<Pr> {
  const res = await api(`/api/purchase-requests/${enc(id)}/store-review`, {
    method: "POST",
    body: JSON.stringify({ lines: [{ lineId: "l1", decision: "purchase" }, { lineId: "l2", decision: "purchase" }] }),
  });
  expect(res.status).toBe(200);
  return (await json<{ purchaseRequest: Pr }>(res)).purchaseRequest;
}
async function listAll(): Promise<Summary[]> {
  const res = await api("/api/purchase-requests?ownerDepartment=all");
  expect(res.status).toBe(200);
  return (await json<{ purchaseRequests: Summary[] }>(res)).purchaseRequests;
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

describe("งานด่วน", () => {
  it("ติ๊กด่วนแต่ไม่ใส่เหตุผล: บันทึกได้ แต่ส่งขออนุมัติไม่ได้ · ใส่เหตุผลแล้วส่งได้ และแจ้งเตือนมีคำว่าด่วน", async () => {
    const pr = await createStandalone();
    const saved = await patch(pr.id, { lines: LINES, urgent: true, urgentReason: "" });
    expect(saved.status).toBe(200);
    expect((await json<{ purchaseRequest: Pr }>(saved)).purchaseRequest.urgent).toBe(true);

    const blocked = await api(`/api/purchase-requests/${enc(pr.id)}/submit-approval`, { method: "POST" });
    expect(blocked.status).toBe(400);
    expect((await json<{ error: string }>(blocked)).error).toContain("เหตุผลที่ด่วน");

    expect((await patch(pr.id, { urgentReason: "เครื่องจักรหยุด" })).status).toBe(200);
    const ok = await api(`/api/purchase-requests/${enc(pr.id)}/submit-approval`, { method: "POST" });
    expect(ok.status).toBe(200);
    const doc = (await json<{ purchaseRequest: Pr }>(ok)).purchaseRequest;
    expect(doc.status).toBe("PendingApproval");
    expect(doc.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const summary = (await listAll()).find((p) => p.id === pr.id);
    expect(summary?.urgent).toBe(true);
    expect(summary?.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ใบเก่าที่ไม่มีฟิลด์ urgent อ่านเป็นไม่ด่วน", async () => {
    const pr = await createStandalone();
    expect(pr.urgent).toBe(false);
    expect(pr.urgentReason).toBe("");
  });
});

describe("เวลาที่ใบถึงจัดซื้อ (จุดเริ่มนับ)", () => {
  it("สโตร์ส่งต่อ = วันที่ถึงจัดซื้อ · เช็คซ้ำไม่เลื่อนวันเริ่มนับ", async () => {
    const pr = await createStandalone();
    expect((await patch(pr.id, { lines: LINES })).status).toBe(200);
    await submitAndApprove(pr.id);
    const before = (await listAll()).find((p) => p.id === pr.id);
    expect(before?.purchasingReceivedAt).toBe("");

    const forwarded = await storeReview(pr.id);
    expect(forwarded.purchasingReceivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const { purchaseRequestsCollection } = await import("../../api/_lib/collections.js");
    const col = await purchaseRequestsCollection();
    await col.updateOne({ _id: pr.id }, { $set: { purchasingReceivedAt: "2026-09-01" } });
    const again = await storeReview(pr.id);
    expect(again.purchasingReceivedAt).toBe("2026-09-01");
  });

  it("จัดซื้อกดดึงมาเอง = วันที่ถึงจัดซื้อ", async () => {
    const pr = await createStandalone();
    expect((await patch(pr.id, { lines: LINES })).status).toBe(200);
    await submitAndApprove(pr.id);
    const res = await api(`/api/purchase-requests/${enc(pr.id)}/pull-to-purchasing`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await json<{ purchaseRequest: Pr }>(res)).purchaseRequest.purchasingReceivedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ออกใบสั่งซื้อครบทุกบรรทัด → หน้ารายการได้วันที่หยุดนับ · ครบแค่บางบรรทัดยังว่าง", async () => {
    const pr = await createStandalone();
    expect((await patch(pr.id, { lines: LINES })).status).toBe(200);
    await submitAndApprove(pr.id);
    await storeReview(pr.id);
    expect((await api(`/api/purchase-requests/${enc(pr.id)}/purchasing-approve`, { method: "POST" })).status).toBe(200);

    expect((await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ purchaseRequestId: pr.id, lineIds: ["l1"] }) })).status).toBe(201);
    const partial = (await listAll()).find((p) => p.id === pr.id);
    expect(partial?.purchaseState).toBe("partial");
    expect(partial?.purchasingCompletedAt).toBe("");

    expect((await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ purchaseRequestId: pr.id, lineIds: ["l2"] }) })).status).toBe(201);
    const full = (await listAll()).find((p) => p.id === pr.id);
    expect(full?.purchaseState).toBe("full");
    expect(full?.purchasingCompletedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const one = await json<{ purchaseOrders: { documentNumber: string; createdAt: string }[]; purchasingCompletedAt: string }>(
      await api(`/api/purchase-requests/${enc(pr.id)}`));
    expect(one.purchaseOrders).toHaveLength(2);
    expect(one.purchasingCompletedAt).toBe(full?.purchasingCompletedAt);
  });
});

describe("รหัสงานของใบที่ไม่มีเอกสารต้นทาง", () => {
  it("ใบ general พิมพ์รหัสงานเองได้ และเว้นว่างได้", async () => {
    const pr = await createStandalone();
    const res = await patch(pr.id, { jobCode: "PQ202609-015-TK-02" });
    expect(res.status).toBe(200);
    expect((await json<{ purchaseRequest: Pr }>(res)).purchaseRequest.jobCode).toBe("PQ202609-015-TK-02");
    const cleared = await patch(pr.id, { jobCode: "" });
    expect((await json<{ purchaseRequest: Pr }>(cleared)).purchaseRequest.jobCode).toBe("");
  });

  it("ใบที่มีเอกสารต้นทาง ส่ง jobCode มาก็ไม่รับ", async () => {
    const pr = await createStandalone();
    const { purchaseRequestsCollection } = await import("../../api/_lib/collections.js");
    const col = await purchaseRequestsCollection();
    await col.updateOne({ _id: pr.id }, { $set: { ownerDepartment: "production", jobCode: "SRC-001" } });
    const res = await patch(pr.id, { jobCode: "HACKED" });
    expect(res.status).toBe(200);
    expect((await json<{ purchaseRequest: Pr }>(res)).purchaseRequest.jobCode).toBe("SRC-001");
  });

  it("GET /job-codes ตอบรายการรหัสงาน (ว่างได้)", async () => {
    const res = await api("/api/purchase-requests/job-codes");
    expect(res.status).toBe(200);
    expect(Array.isArray((await json<{ jobCodes: unknown[] }>(res)).jobCodes)).toBe(true);
  });
});

describe("Rewrite", () => {
  it("ฉบับแก้ไขสืบทอดงานด่วน แต่ไม่พาเวลาส่งขอ/เวลาถึงจัดซื้อของฉบับเดิมไป", async () => {
    const pr = await createStandalone();
    expect((await patch(pr.id, { lines: LINES, urgent: true, urgentReason: "ด่วนจริง" })).status).toBe(200);
    await submitAndApprove(pr.id);
    await storeReview(pr.id);
    const res = await api(`/api/purchase-requests/${enc(pr.id)}/rewrite`, { method: "POST" });
    expect(res.status).toBe(201);
    const rev = (await json<{ purchaseRequest: Pr }>(res)).purchaseRequest;
    expect(rev.urgent).toBe(true);
    expect(rev.urgentReason).toBe("ด่วนจริง");
    expect(rev.submittedAt).toBe("");
    expect(rev.purchasingReceivedAt).toBe("");
  });
});
