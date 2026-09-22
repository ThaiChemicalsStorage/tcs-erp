import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createHmac } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for the Service Report customer-approval flow (2026-08-10):
 *   - POST /api/service-reports/:id/send-approval creates a pending approval + a working link
 *   - the public GET/respond endpoints honor the capability key (opaque 404 on a wrong key),
 *     require a signature to approve / a reason to reject, and answer only once
 *   - the approval tokenHash never leaks through any authenticated response
 *   - POST /api/customers/:id/line-pairing + the signed LINE webhook link a customer's lineUserId
 * LINE push is NOT exercised (no LINE_CHANNEL_ACCESS_TOKEN in env → sentViaLine stays false and
 * no network call is attempted); the webhook test sets only LINE_CHANNEL_SECRET, whose reply
 * calls are skipped for the same reason.
 */

// A tiny 1x1 transparent PNG — a syntactically valid image data URL for the signature field.
const SIGNATURE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let customerId: string;

let reportSeq = 0;
async function insertReport(fields: Record<string, unknown> = {}): Promise<string> {
  const { serviceReportsCollection } = await import("../../api/_lib/collections.js");
  const col = await serviceReportsCollection();
  reportSeq += 1;
  const id = `SR-TEST-${String(reportSeq).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const sections = [{
    key: "core", title: "ระบบหลัก", isOptionalAddon: false,
    groups: [{ key: "blower", title: "Blower", items: [{ key: "vibration", label: "แรงสั่นสะเทือน", kind: "normalAbnormal" }] }],
  }];
  await col.insertOne({
    _id: id,
    customerId, customerSnapshot: { companyName: "ACME Co.", contactName: "คุณสมชาย", address: "", taxId: "", phone: "02-000-0000", email: "", projectName: "" },
    serviceLocation: "โรงงาน A", projectOrJobCode: "", serviceSystemName: "Wet Scrubber", serviceType: "PM",
    templateId: "tpl-test", templateSnapshot: { templateId: "tpl-test", templateCode: "T1", templateName: "T1", version: "1", sections, sourceHash: "", capturedAt: now },
    checklist: [{ key: "core", included: true, groups: [{ key: "blower", items: [{ key: "vibration", status: "normal", abnormalDetail: "", measurementValue: "", photos: [] }] }] }],
    inspectionDate: "2026-08-01", reportDate: "2026-08-02", nextPmDate: "",
    assignedServiceEngineerId: "", additionalInspectorNames: [],
    onSiteContactName: "", onSiteContactPhone: "",
    overallCustomerSummary: "เรียบร้อยดี", overallRemark: "",
    customerSignatureDataUrl: "", customerSignedName: "", customerSignedAt: null,
    status: "Completed", isDeleted: false,
    createdAt: now, updatedAt: now, createdBy: "", updatedBy: "",
    ...fields,
  } as never);
  return id;
}

function keyFromUrl(approvalUrl: string): string {
  return new URL(approvalUrl).searchParams.get("key") ?? "";
}

async function sendApproval(reportId: string) {
  const r = await fetch(`${baseUrl}/api/service-reports/${reportId}/send-approval`, {
    method: "POST", headers: { cookie: adminCookie },
  });
  expect(r.status).toBe(200);
  return (await r.json()) as { approvalUrl: string; sentViaLine: boolean };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  process.env.APP_URL = "https://erp.test.local";
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  process.env.LINE_CHANNEL_SECRET = "test-line-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin Sender", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const created = await fetch(`${baseUrl}/api/customers`, {
    method: "POST", headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ companyName: "ACME Co.", contactName: "คุณสมชาย", phone: "02-000-0000" }),
  });
  customerId = ((await created.json()) as { customer: { id: string } }).customer.id;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("service report customer approval", () => {
  it("send-approval creates a pending approval whose tokenHash never reaches the client", async () => {
    const id = await insertReport();
    const { approvalUrl, sentViaLine } = await sendApproval(id);
    expect(approvalUrl).toContain(`/approve?report=${id}&key=`);
    expect(sentViaLine).toBe(false); // no LINE token configured

    const get = await fetch(`${baseUrl}/api/service-reports/${id}`, { headers: { cookie: adminCookie } });
    const bodyText = await get.text();
    expect(bodyText).toContain('"customerApproval"');
    expect(bodyText).toContain('"status":"pending"');
    expect(bodyText).not.toContain("tokenHash");
  });

  it("public GET honors the key; a wrong key is an opaque 404", async () => {
    const id = await insertReport();
    const { approvalUrl } = await sendApproval(id);
    const key = keyFromUrl(approvalUrl);

    const ok = await fetch(`${baseUrl}/api/service-reports/${id}/approval?key=${key}`);
    expect(ok.status).toBe(200);
    const data = (await ok.json()) as { report: { id: string; customerSnapshot: { companyName: string } }; approval: { status: string } };
    expect(data.report.id).toBe(id);
    expect(data.report.customerSnapshot.companyName).toBe("ACME Co.");
    expect(data.approval.status).toBe("pending");

    const bad = await fetch(`${baseUrl}/api/service-reports/${id}/approval?key=wrong-key`);
    expect(bad.status).toBe(404);
  });

  // บั๊ก 2026-09-22: รูปที่อัปโหลดผ่านระบบกลางชี้ไป /api/files/:id ซึ่งบังคับล็อกอิน ลูกค้าบนหน้า
  // /approve จึงเห็นรูปแตกทุกรูป — รูปต้องเปิดได้ด้วยกุญแจของลิงก์อนุมัติเพียงอย่างเดียว
  it("checklist photos open with the approval key alone, no session", async () => {
    const id = await insertReport({ status: "Draft" }); // แนบรูปได้เฉพาะร่าง แล้วค่อยปิดงานก่อนส่งลิงก์
    const up = await fetch(`${baseUrl}/api/service-reports/${id}/photos`, {
      method: "POST", headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({
        sectionKey: "core", groupKey: "blower", itemKey: "vibration",
        fileName: "หน้างาน.gif", contentType: "image/gif",
        dataBase64: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      }),
    });
    expect(up.status).toBe(200);
    const { serviceReportsCollection } = await import("../../api/_lib/collections.js");
    await (await serviceReportsCollection()).updateOne({ _id: id }, { $set: { status: "Completed" } });
    const { approvalUrl } = await sendApproval(id);
    const key = keyFromUrl(approvalUrl);

    const page = await fetch(`${baseUrl}/api/service-reports/${id}/approval?key=${key}`);
    const data = (await page.json()) as { report: { checklist: { groups: { items: { photos: { url: string; fileId?: string }[] }[] }[] }[] } };
    const photo = data.report.checklist[0].groups[0].items[0].photos[0];
    expect(photo.url.startsWith(`/api/service-reports/${id}/approval/photos/`)).toBe(true);
    expect(photo.fileId).toBeUndefined();

    const img = await fetch(`${baseUrl}${photo.url}`); // no cookie — the customer has no account
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toMatch(/^image\//);

    const wrongKey = await fetch(`${baseUrl}${photo.url.replace(/key=[^&]+/, "key=wrong-key")}`);
    expect(wrongKey.status).toBe(404);
    const notThisReport = await fetch(`${baseUrl}/api/service-reports/${id}/approval/photos/not-a-photo?key=${key}`);
    expect(notThisReport.status).toBe(404);
  });

  it("approve requires a signature, writes the sign-off fields, and answers only once", async () => {
    const id = await insertReport();
    const key = keyFromUrl((await sendApproval(id)).approvalUrl);

    const noSig = await fetch(`${baseUrl}/api/service-reports/${id}/approval/respond`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, decision: "approved", signatureDataUrl: "", signedName: "คุณสมชาย" }),
    });
    expect(noSig.status).toBe(400);

    const ok = await fetch(`${baseUrl}/api/service-reports/${id}/approval/respond`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, decision: "approved", signatureDataUrl: SIGNATURE_DATA_URL, signedName: "คุณสมชาย" }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { approval: { status: string } }).approval.status).toBe("approved");

    const { serviceReportsCollection } = await import("../../api/_lib/collections.js");
    const doc = await (await serviceReportsCollection()).findOne({ _id: id });
    expect(doc?.customerSignatureDataUrl).toBe(SIGNATURE_DATA_URL);
    expect(doc?.customerSignedName).toBe("คุณสมชาย");
    expect(doc?.customerApproval?.status).toBe("approved");

    const again = await fetch(`${baseUrl}/api/service-reports/${id}/approval/respond`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, decision: "rejected", rejectReason: "เปลี่ยนใจ", signedName: "x" }),
    });
    expect(again.status).toBe(400);
  });

  it("reject requires a reason and notifies the sender", async () => {
    const id = await insertReport();
    const key = keyFromUrl((await sendApproval(id)).approvalUrl);

    const noReason = await fetch(`${baseUrl}/api/service-reports/${id}/approval/respond`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, decision: "rejected", rejectReason: "  ", signedName: "" }),
    });
    expect(noReason.status).toBe(400);

    const ok = await fetch(`${baseUrl}/api/service-reports/${id}/approval/respond`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, decision: "rejected", rejectReason: "รายการที่ 3 ยังไม่เรียบร้อย", signedName: "คุณสมชาย" }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { approval: { status: string; rejectReason: string } }).approval.rejectReason).toContain("รายการที่ 3");

    const { notificationsCollection } = await import("../../api/_lib/collections.js");
    const notif = await (await notificationsCollection()).findOne({ type: "service_report_customer_rejected", relatedServiceReportId: id });
    expect(notif).toBeTruthy();
  });

  it("an expired link reads as expired and refuses a response with 410", async () => {
    const id = await insertReport();
    const key = keyFromUrl((await sendApproval(id)).approvalUrl);
    const { serviceReportsCollection } = await import("../../api/_lib/collections.js");
    await (await serviceReportsCollection()).updateOne(
      { _id: id },
      { $set: { "customerApproval.expiresAt": new Date(Date.now() - 1000).toISOString() } },
    );

    const get = await fetch(`${baseUrl}/api/service-reports/${id}/approval?key=${key}`);
    expect(((await get.json()) as { approval: { expired: boolean } }).approval.expired).toBe(true);

    const respond = await fetch(`${baseUrl}/api/service-reports/${id}/approval/respond`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, decision: "approved", signatureDataUrl: SIGNATURE_DATA_URL, signedName: "x" }),
    });
    expect(respond.status).toBe(410);
  });

  it("line pairing + signed webhook message links the customer's lineUserId", async () => {
    const issued = await fetch(`${baseUrl}/api/customers/${customerId}/line-pairing`, {
      method: "POST", headers: { cookie: adminCookie },
    });
    expect(issued.status).toBe(200);
    const { code } = (await issued.json()) as { code: string };
    expect(code).toMatch(/^TCS-/);

    const webhookBody = JSON.stringify({
      events: [{ type: "message", replyToken: "rt-1", source: { userId: "U-test-line-user" }, message: { type: "text", text: code.toLowerCase() } }],
    });
    const signature = createHmac("sha256", "test-line-secret").update(Buffer.from(webhookBody)).digest("base64");

    const badSig = await fetch(`${baseUrl}/api/line/webhook`, {
      method: "POST", headers: { "content-type": "application/json", "x-line-signature": "not-the-signature" },
      body: webhookBody,
    });
    expect(badSig.status).toBe(403);

    const ok = await fetch(`${baseUrl}/api/line/webhook`, {
      method: "POST", headers: { "content-type": "application/json", "x-line-signature": signature },
      body: webhookBody,
    });
    expect(ok.status).toBe(200);

    const { customersCollection } = await import("../../api/_lib/collections.js");
    const { toObjectId } = await import("../../api/_lib/collections.js");
    const doc = await (await customersCollection()).findOne({ _id: toObjectId(customerId) });
    expect(doc?.lineUserId).toBe("U-test-line-user");
    expect(doc?.linePairing).toBeUndefined();

    // The customers API exposes lineUserId but never the pairing code
    const list = await fetch(`${baseUrl}/api/customers`, { headers: { cookie: adminCookie } });
    const listText = await list.text();
    expect(listText).toContain("U-test-line-user");
    expect(listText).not.toContain("linePairing");
  });
});
