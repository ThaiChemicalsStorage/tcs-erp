import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ObjectId } from "mongodb";

/**
 * Integration tests for POST /api/scope-of-works/:id/send-documents after the 2026-08-07
 * email removal: the endpoint is in-app-notification-only. Every resolved recipient gets a
 * `scope_of_work_document_sent` bell notification; `additional` recipients resolve with zero
 * checked departments; an unchecked department's picks are excluded; empty selection is a 400.
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let recipientAId: string;
let recipientBId: string;

/** Minimal scope_of_works document — MongoDB enforces no schema; only the fields the send handler
 * actually reads need to exist (normalizers default the rest). scopeNumber has a unique index,
 * so each insert gets its own. */
let scopeSeq = 0;
async function insertScope(fields: Record<string, unknown>): Promise<string> {
  const { scopeOfWorksCollection } = await import("../../api/_lib/collections.js");
  const col = await scopeOfWorksCollection();
  scopeSeq += 1;
  const base = {
    scopeNumber: `SOW-TEST-${scopeSeq}`, quotationId: "QT-TEST-1", quotationNumber: "QT-TEST-1",
    jobTypeCode: "TA", jobTypeName: "FRP Tank", deliveryDate: "",
    customerSnapshot: { companyName: "ACME Co." },
    documentRecipientMessage: "", attachments: [],
    status: "Final", isDeleted: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...fields,
  };
  const result = await col.insertOne(base as never);
  return (result.insertedId as ObjectId).toString();
}

async function sendDocuments(scopeId: string) {
  return fetch(`${baseUrl}/api/scope-of-works/${scopeId}/send-documents`, {
    method: "POST",
    headers: { cookie: adminCookie },
  });
}

async function notificationCountFor(userId: string): Promise<number> {
  const { notificationsCollection } = await import("../../api/_lib/collections.js");
  const col = await notificationsCollection();
  return col.countDocuments({ recipientUserId: userId, type: "scope_of_work_document_sent" });
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
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin Sender", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const roles = await fetch(`${baseUrl}/api/roles`, { headers: { cookie: adminCookie } });
  const roleKey = ((await roles.json()) as { roles: { key: string }[] }).roles.at(-1)!.key;
  const mkUser = async (n: number, email: string) => {
    const r = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        employeeId: `E00${n}`, fullName: `Recipient ${n}`, username: `user${n}`, email,
        password: "correct-horse-2", roleKey, department: "Purchase",
      }),
    });
    return ((await r.json()) as { user: { id: string } }).user.id;
  };
  recipientAId = await mkUser(2, "a@test.local");
  recipientBId = await mkUser(3, "b@test.local");
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("POST /api/scope-of-works/:id/send-documents", () => {
  it("notifies only `additional` recipients when no department is checked", async () => {
    // No checklistGroups at all → defaults, nothing checked — only `additional` carries recipients
    const scopeId = await insertScope({ documentRecipients: { purchase: [recipientBId], additional: [recipientAId] } });
    const r = await sendDocuments(scopeId);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean; sentCount: number; failedCount: number; recipientCount: number };
    // purchase is NOT checked in the checklist, so only the additional recipient is notified
    expect(body).toMatchObject({ ok: true, sentCount: 1, failedCount: 0, recipientCount: 1 });
    expect(await notificationCountFor(recipientAId)).toBe(1);
    expect(await notificationCountFor(recipientBId)).toBe(0);
  });

  it("a checked department AND additional both get the bell notification", async () => {
    const { buildDefaultChecklistGroups } = await import("../../src/lib/documentRequirements.js");
    const groups = buildDefaultChecklistGroups("TA").map((g) =>
      g.key === "documentsToSend"
        ? { ...g, options: g.options.map((o) => (o.key === "purchase" ? { ...o, checked: true } : o)) }
        : g,
    );
    const scopeId = await insertScope({
      checklistGroups: groups,
      documentRecipients: { purchase: [recipientBId], additional: [recipientAId] },
    });

    const beforeA = await notificationCountFor(recipientAId);
    const beforeB = await notificationCountFor(recipientBId);
    const r = await sendDocuments(scopeId);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { sentCount: number }).sentCount).toBe(2);
    expect(await notificationCountFor(recipientAId)).toBe(beforeA + 1);
    expect(await notificationCountFor(recipientBId)).toBe(beforeB + 1);

    const { notificationsCollection } = await import("../../api/_lib/collections.js");
    const col = await notificationsCollection();
    const notif = await col.findOne({ recipientUserId: recipientBId, type: "scope_of_work_document_sent" });
    expect(notif).toMatchObject({ relatedScopeId: scopeId, read: false });
    expect(String((notif as { description?: string })?.description)).toContain("Admin Sender");
  });

  it("400 when no recipient is effectively selected (unchecked department only)", async () => {
    const scopeId = await insertScope({ documentRecipients: { purchase: [recipientBId] } });
    const r = await sendDocuments(scopeId);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toContain("ผู้รับเพิ่มเติม");
  });
});
