import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { PurchasingLeadTime } from "../../src/lib/departmentDashboard";

/**
 * KPI ระยะเวลาออกใบสั่งซื้อบนแท็บจัดซื้อของแดชบอร์ด (เจ้าของสั่ง 2026-10-02)
 *
 * ตรึงไว้: นับวันทำการ จ.–ศ. จากวันที่ใบถึงจัดซื้อจนวันที่ออกใบสั่งซื้อครบ · ใบที่ออกไม่ครบนับเป็น "รออยู่" ·
 * ทันเป้า = ไม่เกิน 7 (ปกติ) / 3 (ด่วน) วันทำการ · คิวเรียงงานด่วนก่อน · แยกตามฝ่าย
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
const LINES = [
  { id: "l1", productId: "", productCode: "", description: "ปั๊ม", subDetails: [], unit: "ตัว", qtyRequested: 1 },
  { id: "l2", productId: "", productCode: "", description: "ท่อ", subDetails: [], unit: "เส้น", qtyRequested: 2 },
];

/** ใบที่ถึงจัดซื้อและจัดซื้ออนุมัติแล้ว — ตั้งวันที่ถึงจัดซื้อย้อนหลังได้ */
async function readyPr(urgent: boolean, receivedAt: string): Promise<string> {
  const created = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
  const { purchaseRequest } = (await created.json()) as { purchaseRequest: { id: string } };
  const id = purchaseRequest.id;
  await api(`/api/purchase-requests/${enc(id)}`, { method: "PATCH", body: JSON.stringify({ lines: LINES, urgent, urgentReason: urgent ? "ด่วน" : "" }) });
  await api(`/api/purchase-requests/${enc(id)}/submit-approval`, { method: "POST" });
  await api(`/api/purchase-requests/${enc(id)}/approve`, { method: "POST" });
  await api(`/api/purchase-requests/${enc(id)}/pull-to-purchasing`, { method: "POST" });
  await api(`/api/purchase-requests/${enc(id)}/purchasing-approve`, { method: "POST", body: "{}" });
  const { purchaseRequestsCollection } = await import("../../api/_lib/collections.js");
  await (await purchaseRequestsCollection()).updateOne({ _id: id }, { $set: { purchasingReceivedAt: receivedAt } });
  return id;
}
async function orderAll(id: string, createdAt: string): Promise<void> {
  const res = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ purchaseRequestId: id }) });
  expect(res.status).toBe(201);
  const { purchaseOrder } = (await res.json()) as { purchaseOrder: { id: string } };
  const { purchaseOrdersCollection } = await import("../../api/_lib/collections.js");
  await (await purchaseOrdersCollection()).updateOne({ _id: purchaseOrder.id }, { $set: { createdAt } });
}
async function leadTime(): Promise<PurchasingLeadTime> {
  const res = await api("/api/dashboard/departments?dept=purchasing");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { blocks: { purchasing: { detail: { leadTime: PurchasingLeadTime } } } };
  return body.blocks.purchasing.detail.leadTime;
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

describe("KPI ระยะเวลาออกใบสั่งซื้อ", () => {
  it("นับวันทำการ แยกด่วน/ปกติ ทันเป้า คิว และแยกฝ่าย", async () => {
    // ปกติ: ถึง พ. 2026-09-23 → ออกครบ จ. 2026-09-28 = 3 วันทำการ (ทันเป้า 7)
    const normalDone = await readyPr(false, "2026-09-23");
    await orderAll(normalDone, "2026-09-28T03:00:00.000Z");
    // ด่วน: ถึง ศ. 2026-09-18 → ออกครบ ศ. 2026-09-25 = 5 วันทำการ (เกินเป้า 3)
    const urgentLate = await readyPr(true, "2026-09-18");
    await orderAll(urgentLate, "2026-09-25T03:00:00.000Z");
    // รออยู่: ด่วนหนึ่งใบ ปกติหนึ่งใบ (ถึงเมื่อนานแล้ว = เกินเป้าแน่นอน)
    const waitingUrgent = await readyPr(true, "2026-08-03");
    const waitingNormal = await readyPr(false, "2026-07-01");

    const lt = await leadTime();
    expect(lt.targets).toEqual({ normal: 7, urgent: 3 });
    expect(lt.completed.count).toBe(2);
    expect(lt.completed.avgNormal).toBe(3);
    expect(lt.completed.avgUrgent).toBe(5);
    expect(lt.completed.avgDays).toBe(4);
    expect(lt.completed.onTime).toBe(1);
    expect(lt.completed.onTimeUrgent).toBe(0);

    const bucket = (key: string) => lt.distribution.find((b) => b.key === key);
    expect(bucket("3")?.normal).toBe(1);
    expect(bucket("4-5")?.urgent).toBe(1);

    expect(lt.waiting.count).toBe(2);
    expect(lt.waiting.urgent).toBe(1);
    expect(lt.waiting.over).toBe(2);
    expect(lt.queue.map((q) => q.id)).toEqual([waitingUrgent, waitingNormal]); // ด่วนก่อน แม้ค้างน้อยกว่า
    expect(lt.waiting.oldestId).toBe(waitingNormal);

    expect(lt.byDepartment.find((d) => d.dept === "general")?.count).toBe(2);
    const sept = lt.avgByMonth.find((m) => m.month === "2026-09");
    if (sept) expect(sept.avgDays).toBe(4); // อยู่ในหน้าต่าง 12 เดือนเมื่อรันเทสต์ภายในปีนั้น
    expect(lt.avgByMonth.some((m) => m.avgDays === null)).toBe(true); // เดือนที่ไม่มีข้อมูลเป็น null ไม่ใช่ 0
  });

  it("ช่วงวันที่กรองตามวันที่ออกใบสั่งซื้อครบ", async () => {
    const res = await api("/api/dashboard/departments?dept=purchasing&from=2026-09-26&to=2026-09-30");
    const body = (await res.json()) as { blocks: { purchasing: { detail: { leadTime: PurchasingLeadTime } } } };
    expect(body.blocks.purchasing.detail.leadTime.completed.count).toBe(1);
    expect(body.blocks.purchasing.detail.leadTime.completed.avgDays).toBe(3);
  });
});
