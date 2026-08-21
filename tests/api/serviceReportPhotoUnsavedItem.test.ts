import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ServiceReport } from "../../src/lib/serviceReports";
import type { ServiceChecklistSectionDef } from "../../src/lib/serviceTemplates";

/**
 * Pins the server contract that `ServiceReportEditor`'s photo upload has to work around
 * (added 2026-08-21, after a user report: "กดเพิ่มอะไรไปแล้วจะเพิ่มรูป มันเพิ่มไม่ได้").
 *
 * A checklist item added while filling out a report exists only in the editor's local state until
 * the draft is saved. `handlePhotoUpload()` resolves its target with
 * `findChecklistItemPath(doc.checklist, …)` against the **saved** document, so a photo attached to
 * a not-yet-saved item 404s with "ไม่พบรายการตรวจเช็ค" — an error that reads as breakage and gives
 * no hint that pressing "บันทึกร่าง" first would fix it.
 *
 * The fix is client-side ordering (`handleUploadPhoto` now PATCHes the draft before uploading), so
 * what is worth pinning here is the server behaviour that fix depends on, in both directions:
 * unsaved item → 404, and the same upload → 201 once the item has actually been saved. If someone
 * later makes the upload route lenient, or changes what a PATCH persists, this test says why the
 * save-first ordering exists.
 */

const PASSWORD = "correct-horse-1";
// 1×1 transparent GIF — smallest thing that passes the image/* + non-empty-bytes checks.
const TINY_GIF_BASE64 = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

let mongod: MongoMemoryServer;
let client: MongoClient;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let customersHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let sessionCookie = "";
let reportId = "";
let templateId = "";
let sectionKey = "";
let groupKey = "";

const NEW_ITEM_KEY = "locally-added-item";

interface CapturedResponse { statusCode: number; body: unknown; headers: Record<string, string> }

function makeReqRes(method: string, url: string, body?: unknown): { req: VercelRequest; res: VercelResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 0, body: undefined, headers: {} };
  const req = {
    method, url, body,
    headers: { "x-forwarded-for": "10.0.0.1", cookie: sessionCookie },
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as VercelRequest;
  const res = {
    status(code: number) { captured.statusCode = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
    setHeader(name: string, value: string) { captured.headers[name.toLowerCase()] = value; return this; },
    end() { return this; },
  } as unknown as VercelResponse;
  return { req, res, captured };
}

async function callApi(method: string, url: string, body?: unknown): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes(method, url, body);
  await customersHandler(req, res);
  return captured;
}

function uploadPhoto(itemKey: string): Promise<CapturedResponse> {
  return callApi("POST", `/api/service-reports/${reportId}/photos`, {
    sectionKey, groupKey, itemKey,
    fileName: "หน้างาน.gif",
    contentType: "image/gif",
    dataBase64: TINY_GIF_BASE64,
  });
}

async function getReport(): Promise<ServiceReport> {
  const r = await callApi("GET", `/api/service-reports/${reportId}`);
  expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
  return (r.body as { serviceReport: ServiceReport }).serviceReport;
}

/** What the editor sends when the user adds an item to a group: same structure, one item appended. */
function withAddedItem(sections: ServiceChecklistSectionDef[]): ServiceChecklistSectionDef[] {
  return sections.map((s) => (s.key !== sectionKey ? s : {
    ...s,
    groups: s.groups.map((g) => (g.key !== groupKey ? g : {
      ...g,
      items: [...g.items, { key: NEW_ITEM_KEY, label: "จุดตรวจเพิ่มหน้างาน", kind: "normalAbnormal" as const }],
    })),
  }));
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  authHandler = (await import("../../api/handlers/auth.js")).default;
  customersHandler = (await import("../../api/handlers/customers.js")).default;

  const setup = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: PASSWORD,
  });
  await authHandler(setup.req, setup.res);
  expect(setup.captured.statusCode).toBe(201);
  sessionCookie = setup.captured.headers["set-cookie"].split(";")[0];

  const templates = await callApi("GET", "/api/service-templates");
  templateId = (templates.body as { serviceTemplates: { id: string }[] }).serviceTemplates[0].id;

  const created = await callApi("POST", "/api/service-reports", {
    templateId,
    customerSnapshot: { companyName: "ลูกค้าทดสอบ", contactName: "ผู้ติดต่อ", phone: "021234567" },
  });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
  const report = (created.body as { serviceReport: ServiceReport }).serviceReport;
  reportId = report.id;
  sectionKey = report.templateSnapshot.sections[0].key;
  groupKey = report.templateSnapshot.sections[0].groups[0].key;
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("attaching a photo to a checklist item that has not been saved yet", () => {
  it("rejects the upload while the item exists only on the client", async () => {
    const res = await uploadPhoto(NEW_ITEM_KEY);
    expect(res.statusCode, "an item the saved document has never seen must not resolve").toBe(404);
    expect((res.body as { error?: string }).error).toBe("ไม่พบรายการตรวจเช็ค");
  });

  it("accepts the same upload once the draft has been saved — this is what save-first buys", async () => {
    const before = await getReport();
    const saved = await callApi("PATCH", `/api/service-reports/${reportId}`, {
      templateSections: withAddedItem(before.templateSnapshot.sections),
    });
    expect(saved.statusCode, JSON.stringify(saved.body)).toBe(200);

    const res = await uploadPhoto(NEW_ITEM_KEY);
    // 200, not 201: the route returns the updated report rather than creating a new addressable
    // resource of its own — the photo is a field on the report, reachable through its own
    // capability URL rather than a REST child the caller can POST to again.
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);

    const after = (res.body as { serviceReport: ServiceReport }).serviceReport;
    const group = after.checklist.find((s) => s.key === sectionKey)!.groups.find((g) => g.key === groupKey)!;
    const item = group.items.find((it) => it.key === NEW_ITEM_KEY)!;
    expect(item.photos, "the photo must land on the item it was attached to").toHaveLength(1);
    expect(item.photos[0].fileName).toBe("หน้างาน.gif");
  });

  it("still rejects an item key that was never added at all", async () => {
    const res = await uploadPhoto("no-such-item-anywhere");
    expect(res.statusCode).toBe(404);
  });
});
