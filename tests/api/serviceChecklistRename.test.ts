import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ServiceReport } from "../../src/lib/serviceReports";
import type { ServiceChecklistSectionDef } from "../../src/lib/serviceTemplates";

/**
 * Integration test for renaming a checklist item/group in place while filling out a Service Report
 * (added 2026-08-07). The headline claim is that a rename is an EDIT, not a replace: the key
 * survives, so already-recorded status/abnormalDetail/photos survive with it — which is exactly
 * what the old delete-and-re-add workaround destroyed. Also pins the isolation guarantee: the
 * master `service_templates` document must never change.
 */

const PASSWORD = "correct-horse-1";

let mongod: MongoMemoryServer;
let client: MongoClient;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let customersHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let sessionCookie = "";
let reportId = "";
let templateId = "";
let originalItemLabel = "";
let path = { sectionKey: "", groupKey: "", itemKey: "" };

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

async function getReport(): Promise<ServiceReport> {
  const r = await callApi("GET", `/api/service-reports/${reportId}`);
  expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
  return (r.body as { serviceReport: ServiceReport }).serviceReport;
}

async function patch(body: unknown): Promise<CapturedResponse> {
  return callApi("PATCH", `/api/service-reports/${reportId}`, body);
}

/** The client's rename: same structure, same keys, one label swapped — nothing else. */
function withRenamedItem(sections: ServiceChecklistSectionDef[], label: string): ServiceChecklistSectionDef[] {
  return sections.map((s) => (s.key !== path.sectionKey ? s : {
    ...s,
    groups: s.groups.map((g) => (g.key !== path.groupKey ? g : {
      ...g, items: g.items.map((it) => (it.key === path.itemKey ? { ...it, label } : it)),
    })),
  }));
}

function findItem(report: ServiceReport) {
  const section = report.templateSnapshot.sections.find((s) => s.key === path.sectionKey)!;
  const group = section.groups.find((g) => g.key === path.groupKey)!;
  return group.items.find((it) => it.key === path.itemKey)!;
}

function findItemValue(report: ServiceReport) {
  const section = report.checklist.find((s) => s.key === path.sectionKey)!;
  const group = section.groups.find((g) => g.key === path.groupKey)!;
  return group.items.find((it) => it.key === path.itemKey)!;
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

  const section = report.templateSnapshot.sections[0];
  const group = section.groups[0];
  const item = group.items.find((it) => it.kind === "normalAbnormal") ?? group.items[0];
  path = { sectionKey: section.key, groupKey: group.key, itemKey: item.key };
  originalItemLabel = item.label;
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("renaming a checklist item in place", () => {
  it("keeps the item's key and every value already recorded against it", async () => {
    // Record real data first — this is what delete-and-re-add used to throw away.
    const before = await getReport();
    const checklist = before.checklist.map((s) => (s.key !== path.sectionKey ? s : {
      ...s,
      groups: s.groups.map((g) => (g.key !== path.groupKey ? g : {
        ...g,
        items: g.items.map((it) => (it.key === path.itemKey
          ? { ...it, status: "abnormal" as const, abnormalDetail: "พบรอยรั่วที่ปั๊ม" }
          : it)),
      })),
    }));
    expect((await patch({ checklist })).statusCode).toBe(200);

    // Now rename it, sending only the structure — exactly what the editor does.
    const renamed = await patch({ templateSections: withRenamedItem(before.templateSnapshot.sections, "Blower Problems") });
    expect(renamed.statusCode, JSON.stringify(renamed.body)).toBe(200);

    const after = (renamed.body as { serviceReport: ServiceReport }).serviceReport;
    const item = findItem(after);
    expect(item.label).toBe("Blower Problems");
    expect(item.key, "a rename must not mint a new key").toBe(path.itemKey);

    const value = findItemValue(after);
    expect(value.status, "recorded status must survive the rename").toBe("abnormal");
    expect(value.abnormalDetail).toBe("พบรอยรั่วที่ปั๊ม");
  });

  it("does not touch the master template — other reports on it are unaffected", async () => {
    const master = await client.db("tcs_erp").collection("service_templates").findOne({});
    const masterItem = master?.sections
      ?.find((s: ServiceChecklistSectionDef) => s.key === path.sectionKey)?.groups
      ?.find((g: { key: string }) => g.key === path.groupKey)?.items
      ?.find((it: { key: string }) => it.key === path.itemKey);
    expect(masterItem?.label, "the rename was per-report only").toBe(originalItemLabel);
  });

  it("renames a group heading the same way, leaving its items intact", async () => {
    const before = await getReport();
    const sections = before.templateSnapshot.sections.map((s) => (s.key !== path.sectionKey ? s : {
      ...s, groups: s.groups.map((g) => (g.key === path.groupKey ? { ...g, title: "หัวข้อที่แก้ชื่อแล้ว" } : g)),
    }));
    const r = await patch({ templateSections: sections });
    expect(r.statusCode).toBe(200);

    const after = (r.body as { serviceReport: ServiceReport }).serviceReport;
    const group = after.templateSnapshot.sections.find((s) => s.key === path.sectionKey)!.groups.find((g) => g.key === path.groupKey)!;
    expect(group.title).toBe("หัวข้อที่แก้ชื่อแล้ว");
    expect(group.items.length).toBe(before.templateSnapshot.sections.find((s) => s.key === path.sectionKey)!.groups.find((g) => g.key === path.groupKey)!.items.length);
    expect(findItemValue(after).status, "still holding its recorded value").toBe("abnormal");
  });

  it("rejects a blank label through the existing sanitizer, not a parallel one", async () => {
    const before = await getReport();
    const r = await patch({ templateSections: withRenamedItem(before.templateSnapshot.sections, "   ") });
    expect(r.statusCode).toBe(400);
  });

  it("rejects an over-long label at the shared MAX_CHECKLIST_ITEM_LABEL_LENGTH", async () => {
    const before = await getReport();
    const r = await patch({ templateSections: withRenamedItem(before.templateSnapshot.sections, "x".repeat(301)) });
    expect(r.statusCode).toBe(400);
  });

  it("a rejected rename leaves the stored label untouched", async () => {
    const after = await getReport();
    expect(findItem(after).label).toBe("Blower Problems");
  });
});
