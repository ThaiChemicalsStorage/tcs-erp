import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for the "รออนุมัติ" notification the shared approval engine sends on
 * `POST /:id/submit-approval` (2026-08-31). The owner asked for it on 2026-08-28:
 * *"ทำแจ้งเตือนให้ด้วยถ้ามีคนกดขอส่งอนุมัติ ให้แจ้งเตือนคนที่มีสิทธิ์อนุมัติ"*.
 *
 * Before this, all six documents on `api/_lib/documentApproval.ts` wrote an audit entry and
 * nothing else — submitting was invisible to the person who had to act on it.
 *
 * What is pinned:
 *
 *   1. **Recipients come from the approve permission, not a department.** The owner's stated reason
 *      for wanting this was *"เฮดคนนึงต้องอนุมัติหลายแผนก"* — one head approving across
 *      departments — so "who can approve this" is the only correct recipient set.
 *   2. **The submitter never notifies themselves**, even holding the approve permission.
 *   3. **A deep-link field is always attached.** Four of the six document types had no
 *      `related*Id` field on `Notification` at all until this change; without one the bell shows a
 *      notification that goes nowhere when clicked.
 *   4. **Failure to notify never fails the submission.** It is best-effort by design, the same as
 *      the post-approval hand-off — the status change must land regardless.
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let submitterCookie: string;
let approverId: string;
let submitterId: string;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: submitterCookie, ...(init.headers ?? {}) },
  });
}

type NotificationDoc = {
  recipientUserId: string; type: string; title: string; description: string; module: string;
  relatedPurchaseRequestId?: string; relatedPurchaseOrderId?: string;
};

async function notificationsFor(userId: string): Promise<NotificationDoc[]> {
  const { notificationsCollection } = await import("../../api/_lib/collections.js");
  const col = await notificationsCollection();
  return (await col.find({ recipientUserId: userId }).toArray()) as unknown as NotificationDoc[];
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
    body: JSON.stringify({ employeeId: "E001", fullName: "Somchai Submitter", username: "submitter", email: "s@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "submitter", password: "correct-horse-1" }),
  });
  submitterCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  submitterId = ((await login.json()) as { user: { id: string } }).user.id;

  // A second active user on the seeded `administrator` role, which holds every `:finalize`
  // permission this test exercises. Inserted straight into the collection like
  // sendDocumentNotifications.test.ts does — the user API would need its own permission dance.
  const { usersCollection } = await import("../../api/_lib/collections.js");
  const users = await usersCollection();
  const now = new Date().toISOString();
  const inserted = await users.insertOne({
    employeeId: "E002", fullName: "Anong Approver", username: "approver", email: "a@test.local",
    passwordHash: "x", roleKey: "administrator", status: "active", department: "ฝ่ายจัดซื้อ",
    createdAt: now, updatedAt: now,
  } as never);
  approverId = inserted.insertedId.toString();
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("แจ้งเตือนผู้มีสิทธิ์อนุมัติตอนกดส่งขออนุมัติ", () => {
  it("ใบขอซื้อ: คนที่อนุมัติได้ได้รับแจ้งเตือน พร้อม deep-link กลับมาที่ใบ", async () => {
    const created = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
    expect(created.status).toBe(201);
    const pr = (await created.json()) as { purchaseRequest: { id: string } };

    const submitted = await api(`/api/purchase-requests/${pr.purchaseRequest.id}/submit-approval`, { method: "POST" });
    expect(submitted.status).toBe(200);

    const got = (await notificationsFor(approverId)).filter((n) => n.type === "purchase_request_submitted");
    expect(got).toHaveLength(1);
    expect(got[0].title).toBe("ใบขอซื้อรออนุมัติ");
    expect(got[0].module).toBe("ใบขอซื้อ");
    expect(got[0].description).toContain("Somchai Submitter");
    expect(got[0].description).toContain(pr.purchaseRequest.id);
    // ถ้าไม่มีฟิลด์นี้ กระดิ่งจะโชว์แจ้งเตือนที่กดแล้วไปไหนไม่ได้
    expect(got[0].relatedPurchaseRequestId).toBe(pr.purchaseRequest.id);
  });

  it("คนกดส่งไม่ได้แจ้งเตือนจากการกดของตัวเอง แม้จะมีสิทธิ์อนุมัติเองก็ตาม", async () => {
    const got = await notificationsFor(submitterId);
    expect(got.filter((n) => n.type === "purchase_request_submitted")).toHaveLength(0);
  });

  it("ใบสั่งซื้อ: แจ้งเตือนคนละชนิดกัน และแนบ deep-link ของตัวเอง", async () => {
    const created = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({}) });
    expect(created.status).toBe(201);
    const po = (await created.json()) as { purchaseOrder: { id: string } };

    const submitted = await api(`/api/purchase-orders/${po.purchaseOrder.id}/submit-approval`, { method: "POST" });
    expect(submitted.status).toBe(200);

    const got = (await notificationsFor(approverId)).filter((n) => n.type === "purchase_order_submitted");
    expect(got).toHaveLength(1);
    expect(got[0].title).toBe("ใบสั่งซื้อรออนุมัติ");
    expect(got[0].relatedPurchaseOrderId).toBe(po.purchaseOrder.id);
  });

  it("ถอนแล้วส่งใหม่ = แจ้งเตือนรอบใหม่ ผู้อนุมัติจะได้รู้ว่าใบกลับมาแล้ว", async () => {
    const created = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
    const pr = (await created.json()) as { purchaseRequest: { id: string } };
    const id = pr.purchaseRequest.id;

    await api(`/api/purchase-requests/${id}/submit-approval`, { method: "POST" });
    await api(`/api/purchase-requests/${id}/withdraw-approval`, { method: "POST" });
    await api(`/api/purchase-requests/${id}/submit-approval`, { method: "POST" });

    const got = (await notificationsFor(approverId)).filter((n) => n.relatedPurchaseRequestId === id);
    expect(got).toHaveLength(2);
  });

  it("ไม่มีผู้รับเลยก็ยังส่งขออนุมัติสำเร็จ — แจ้งเตือนเป็น best-effort", async () => {
    const { usersCollection } = await import("../../api/_lib/collections.js");
    const users = await usersCollection();
    // ปิดผู้อนุมัติคนเดียวที่มีชั่วคราว เหลือแต่คนกดส่งซึ่งถูกตัดออกจากผู้รับอยู่แล้ว
    await users.updateOne({ username: "approver" }, { $set: { status: "inactive" } });
    try {
      const created = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
      const pr = (await created.json()) as { purchaseRequest: { id: string } };
      const submitted = await api(`/api/purchase-requests/${pr.purchaseRequest.id}/submit-approval`, { method: "POST" });
      expect(submitted.status).toBe(200);
      expect((await submitted.json()).purchaseRequest.status).toBe("PendingApproval");
    } finally {
      await users.updateOne({ username: "approver" }, { $set: { status: "active" } });
    }
  });
});
