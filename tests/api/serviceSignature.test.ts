import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ServiceReport } from "../../src/lib/serviceReports";

/**
 * Integration test for customer sign-off on Service Reports (added 2026-08-07), against the real
 * handler and a throwaway in-memory MongoDB. Signing is an evidentiary artifact, so the properties
 * that matter are: the image is validated, the timestamp is stamped by the SERVER (never accepted
 * from the client, so a sign-off can't be backdated), and clearing really clears.
 */

const PASSWORD = "correct-horse-1";
// A real 1×1 PNG — must satisfy validateImageDataUrl()'s data-URL pattern, not just look like one.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let mongod: MongoMemoryServer;
let client: MongoClient;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let customersHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let sessionCookie = "";
let reportId = "";

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

async function patch(body: unknown): Promise<ServiceReport> {
  const r = await callApi("PATCH", `/api/service-reports/${reportId}`, body);
  expect(r.statusCode, JSON.stringify(r.body)).toBe(200);
  return (r.body as { serviceReport: ServiceReport }).serviceReport;
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

  // GET lazily seeds the two real checklist templates — cheaper and truer than hand-rolling one.
  const templates = await callApi("GET", "/api/service-templates");
  expect(templates.statusCode).toBe(200);
  const templateId = (templates.body as { serviceTemplates: { id: string }[] }).serviceTemplates[0].id;

  const created = await callApi("POST", "/api/service-reports", {
    templateId,
    serviceLocation: "Site A",
    customerSnapshot: { companyName: "ลูกค้าทดสอบ", contactName: "ผู้ติดต่อ", phone: "021234567" },
  });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
  reportId = (created.body as { serviceReport: ServiceReport }).serviceReport.id;
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("customer sign-off on a Service Report", () => {
  it("a new report starts unsigned with a null timestamp", async () => {
    const r = await callApi("GET", `/api/service-reports/${reportId}`);
    const report = (r.body as { serviceReport: ServiceReport }).serviceReport;
    expect(report.customerSignatureDataUrl).toBe("");
    expect(report.customerSignedName).toBe("");
    expect(report.customerSignedAt).toBeNull();
  });

  it("stores the signature and stamps the timestamp server-side", async () => {
    const report = await patch({ customerSignatureDataUrl: PNG, customerSignedName: "คุณสมชาย ใจดี" });
    expect(report.customerSignatureDataUrl).toBe(PNG);
    expect(report.customerSignedName).toBe("คุณสมชาย ใจดี");
    expect(report.customerSignedAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(report.customerSignedAt!))).toBe(false);

    const stored = await client.db("tcs_erp").collection("service_reports").findOne({ _id: reportId as never });
    expect(stored?.customerSignatureDataUrl).toBe(PNG);
  });

  it("ignores a client-supplied customerSignedAt — a sign-off cannot be backdated", async () => {
    const before = await callApi("GET", `/api/service-reports/${reportId}`);
    const existing = (before.body as { serviceReport: ServiceReport }).serviceReport.customerSignedAt;

    const report = await patch({ customerSignedAt: "1999-01-01T00:00:00.000Z", customerSignedName: "คุณสมชาย ใจดี" });
    expect(report.customerSignedAt).toBe(existing);
  });

  it("editing only the signer's name leaves the recorded signing time alone", async () => {
    const before = await callApi("GET", `/api/service-reports/${reportId}`);
    const existing = (before.body as { serviceReport: ServiceReport }).serviceReport.customerSignedAt;

    const report = await patch({ customerSignedName: "คุณสมหญิง รักงาน" });
    expect(report.customerSignedName).toBe("คุณสมหญิง รักงาน");
    expect(report.customerSignedAt, "the signature image didn't change, so neither should its time").toBe(existing);
  });

  it("rejects a non-image payload through the shared validateImageDataUrl()", async () => {
    const r = await callApi("PATCH", `/api/service-reports/${reportId}`, {
      customerSignatureDataUrl: "data:text/html;base64,PHNjcmlwdD4=",
    });
    expect(r.statusCode).toBe(400);
    expect((r.body as { error: string }).error).toContain("รูปภาพ");
  });

  it("clearing the signature also clears the name and the timestamp", async () => {
    const report = await patch({ customerSignatureDataUrl: "" });
    expect(report.customerSignatureDataUrl).toBe("");
    expect(report.customerSignedName, "a name with no signature attached to it is meaningless").toBe("");
    expect(report.customerSignedAt).toBeNull();
  });

  it("signing does not block, or get blocked by, completion — the report completes unsigned", async () => {
    const completed = await callApi("POST", `/api/service-reports/${reportId}/status`, { action: "complete" });
    // Either it completes (checklist happens to be satisfiable) or it fails ONLY on checklist
    // completeness — never on the absent signature, which is what this asserts.
    if (completed.statusCode !== 200) {
      expect(completed.statusCode).toBe(422);
      expect(JSON.stringify(completed.body)).not.toContain("ลายเซ็น");
    }
  });

  it("a report predating sign-off reads back as unsigned, not as a broken signature", async () => {
    await client.db("tcs_erp").collection("service_reports").updateOne(
      { _id: reportId as never },
      { $unset: { customerSignatureDataUrl: "", customerSignedName: "", customerSignedAt: "" } },
    );
    const r = await callApi("GET", `/api/service-reports/${reportId}`);
    const report = (r.body as { serviceReport: ServiceReport }).serviceReport;
    expect(report.customerSignatureDataUrl).toBe("");
    expect(report.customerSignedName).toBe("");
    expect(report.customerSignedAt).toBeNull();
  });
});
