import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for `GET /api/pending-approvals` (2026-08-31) — the cross-department inbox the
 * owner asked for on 2026-08-28: *"เพิ่มหน้าเอกสารรออนุมัติทุกอย่าง เพราะแบบเฮดคนนึงต้องอนุมัติหลายแผนก"*.
 *
 * The four things worth pinning:
 *
 *   1. **Three status vocabularies, one list.** "รออนุมัติ" is spelled `PendingApproval` by eight
 *      document types, `รออนุมัติ` by quotations and `Pending` by product requests, because the
 *      three modules were built months apart. A regression here shows up as a silently missing
 *      category, which nobody would notice until an approval sat for a week.
 *   2. **Gating is by approve permission, not view permission.** A user who can read a document but
 *      not approve it must not see it in their own inbox.
 *   3. **Only pending documents appear.** Drafts and approved documents must never leak in — this
 *      is the first route in the app that filters by `status` at all.
 *   4. **The route is mounted in server/app.ts**, not just `vercel.json`.
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

type Item = {
  kind: string; id: string; docNumber: string; party: string;
  lineage: string; submittedBy: string; waitingSince: string;
  ownerDepartment?: string;
};

async function pending(cookie = adminCookie): Promise<Item[]> {
  const res = await fetch(`${baseUrl}/api/pending-approvals`, { headers: { cookie } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: Item[] }).items;
}

/** ส่งขออนุมัติแล้วคืน id — ใบเปล่าพอ เพราะที่ทดสอบคือการรวมรายการ ไม่ใช่เนื้อในเอกสาร */
async function submittedPurchaseRequest(): Promise<string> {
  const created = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
  expect(created.status).toBe(201);
  const { purchaseRequest } = (await created.json()) as { purchaseRequest: { id: string } };
  const submitted = await api(`/api/purchase-requests/${purchaseRequest.id}/submit-approval`, { method: "POST" });
  expect(submitted.status).toBe(200);
  return purchaseRequest.id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
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

describe("เอกสารรออนุมัติ — เส้นทาง", () => {
  it("ถูก map ใน Express จริง (ไม่มีคุกกี้ = 401 ไม่ใช่ 404)", async () => {
    const res = await fetch(`${baseUrl}/api/pending-approvals`);
    expect(res.status).toBe(401);
  });

  it("รับเฉพาะ GET", async () => {
    const res = await api("/api/pending-approvals", { method: "POST", body: "{}" });
    expect(res.status).toBe(405);
  });

  it("ยังไม่มีใบไหนรออนุมัติ = รายการว่าง ไม่ใช่ error", async () => {
    expect(await pending()).toEqual([]);
  });
});

describe("เอกสารรออนุมัติ — เก็บเฉพาะใบที่รออยู่จริง", () => {
  it("ใบร่างไม่ขึ้น ใบที่ส่งขออนุมัติแล้วขึ้น และอนุมัติแล้วหายไป", async () => {
    // ใบร่างที่ไม่ได้ส่ง — ต้องไม่ขึ้นเลย
    const draft = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
    const draftId = ((await draft.json()) as { purchaseRequest: { id: string } }).purchaseRequest.id;

    const submittedId = await submittedPurchaseRequest();

    const items = await pending();
    expect(items.map((i) => i.id)).toContain(submittedId);
    expect(items.map((i) => i.id)).not.toContain(draftId);
    const row = items.find((i) => i.id === submittedId)!;
    expect(row.kind).toBe("purchaseRequest");
    expect(row.docNumber).toBe(submittedId);
    // ใบขอซื้อเปล่าที่ไม่มีเอกสารต้นทางเป็นของ "ทุกฝ่าย" — ตัวนี้บอกหน้าจอว่าให้เปิดหน้าไหน
    expect(row.ownerDepartment).toBe("general");
    expect(row.waitingSince).not.toBe("");

    const approved = await api(`/api/purchase-requests/${submittedId}/approve`, { method: "POST" });
    expect(approved.status).toBe(200);
    expect((await pending()).map((i) => i.id)).not.toContain(submittedId);
  });

  it("ใบสั่งซื้อที่รออนุมัติขึ้นในรายการเดียวกัน คนละ kind", async () => {
    const created = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({}) });
    const po = ((await created.json()) as { purchaseOrder: { id: string } }).purchaseOrder;
    await api(`/api/purchase-orders/${po.id}/submit-approval`, { method: "POST" });

    const row = (await pending()).find((i) => i.id === po.id);
    expect(row?.kind).toBe("purchaseOrder");
  });

  it("ถอนการขออนุมัติแล้วใบหลุดออกจากรายการ", async () => {
    const id = await submittedPurchaseRequest();
    expect((await pending()).map((i) => i.id)).toContain(id);
    await api(`/api/purchase-requests/${id}/withdraw-approval`, { method: "POST" });
    expect((await pending()).map((i) => i.id)).not.toContain(id);
  });

  it("เรียงจากใบที่รอนานที่สุดขึ้นก่อน", async () => {
    const items = await pending();
    const dates = items.map((i) => i.waitingSince);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("เอกสารรออนุมัติ — สถานะที่สะกดคนละแบบ", () => {
  it("ใบเสนอราคาใช้คำไทย 'รออนุมัติ' และยังถูกเก็บมาได้", async () => {
    const { quotesCollection } = await import("../../api/_lib/collections.js");
    const col = await quotesCollection();
    const now = new Date().toISOString();
    await col.insertOne({
      _id: "QT-TEST-PENDING", client: "ACME Co.", project: "ถังเก็บสารเคมี",
      status: "รออนุมัติ", salesperson: "Somsak", issueDate: "2026-08-20", date: "2026-08-20",
      lines: [], isDeleted: false,
      approvalHistory: [{ id: "h1", userId: "u1", userName: "Somsak", roleName: "Sales", action: "submitted", comment: "", createdAt: now }],
    } as never);

    const row = (await pending()).find((i) => i.id === "QT-TEST-PENDING");
    expect(row?.kind).toBe("quotation");
    expect(row?.party).toBe("ACME Co.");
    expect(row?.lineage).toBe("ถังเก็บสารเคมี");
    // ใบเสนอราคาเป็นชนิดเดียวที่รู้เวลากดส่งจริง เพราะเก็บ approvalHistory ไว้
    expect(row?.waitingSince).toBe(now);
  });

  it("คำขอเพิ่มสินค้าใช้คำว่า 'Pending' และก็ยังถูกเก็บมาได้", async () => {
    const { productRequestsCollection } = await import("../../api/_lib/collections.js");
    const col = await productRequestsCollection();
    const now = new Date().toISOString();
    const inserted = await col.insertOne({
      name: "ปั๊มเคมี ขนาด 2 นิ้ว", specifications: "", reason: "",
      status: "Pending", requestedBy: "u1", requestedByName: "Somsak",
      isDeleted: false, createdAt: now, updatedAt: now,
    } as never);

    const row = (await pending()).find((i) => i.id === inserted.insertedId.toString());
    expect(row?.kind).toBe("productRequest");
    // คำขอได้รหัสสินค้าตอนอนุมัติ ใบที่รออยู่จึงไม่มีเลขที่เสมอ — ชื่อสินค้าเป็นตัวระบุแทน
    expect(row?.docNumber).toBe("");
    expect(row?.party).toBe("ปั๊มเคมี ขนาด 2 นิ้ว");
    expect(row?.submittedBy).toBe("Somsak");
  });
});

describe("เอกสารรออนุมัติ — เปิดด้วยสิทธิ์อนุมัติ ไม่ใช่สิทธิ์ดู", () => {
  it("คนที่ดูใบขอซื้อได้แต่อนุมัติไม่ได้ ไม่เห็นใบขอซื้อในกล่องของตัวเอง", async () => {
    const id = await submittedPurchaseRequest();
    const { rolesCollection, usersCollection } = await import("../../api/_lib/collections.js");
    const roles = await rolesCollection();
    const users = await usersCollection();
    const now = new Date().toISOString();
    // บทบาทที่ดูได้อย่างเดียว ไม่มี :finalize สักตัว
    await roles.insertOne({
      key: "viewer-only", name: "Viewer", description: "", isSuperAdmin: false, isSystem: false,
      permissions: ["purchaseRequest:view", "purchaseRequest:viewAll", "purchaseOrder:view"],
      createdAt: now, updatedAt: now,
    } as never);
    await users.insertOne({
      employeeId: "E003", fullName: "Viewer", username: "viewer", email: "v@test.local",
      // bcrypt hash ของ "correct-horse-1" — ตัวเดียวกับที่ setup สร้างให้ผู้ใช้คนแรก
      passwordHash: (await users.findOne({ username: "admin" }))!.passwordHash,
      roleKey: "viewer-only", status: "active", createdAt: now, updatedAt: now,
    } as never);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "viewer", password: "correct-horse-1" }),
    });
    expect(login.status).toBe(200);
    const viewerCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

    expect((await pending(adminCookie)).map((i) => i.id)).toContain(id);
    expect(await pending(viewerCookie)).toEqual([]);
  });
});
