import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Integration test for the Work Handover Note API (added 2026-08-19) — the 4th Project-module
 * document type, generated from a Project directly (not a ProjectItem, unlike Material
 * Requisition/Job Order/Purchase Request). Same `makeReqRes()`-over-the-real-handler-function
 * pattern tests/api/projectAtomicity.test.ts already established. Covers the 3 things unique to
 * this document type: `documentCode` is never invented (always null), the customer's signature is
 * required before `:sign` succeeds, and signing locks the document (no Draft/Final pattern here —
 * `isSigned` is the sole source of truth).
 */

const PASSWORD = "correct-horse-1";
let mongod: MongoMemoryServer;
let client: MongoClient;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let quotesHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let sessionCookie = "";
let scopeOfWorkId = "";

interface CapturedResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

function makeReqRes(method: string, url: string, body?: unknown): { req: VercelRequest; res: VercelResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 0, body: undefined, headers: {} };
  // The real server populates req.query via Express's "simple" query parser (server/app.ts) — this
  // bare mock never went through that pipeline, so it must be replicated here for handlers (like
  // handleList below) that read req.query rather than a path segment.
  const query = Object.fromEntries(new URL(url, "http://localhost").searchParams);
  const req = {
    method,
    url,
    query,
    body,
    headers: { "x-forwarded-for": "10.0.0.2", cookie: sessionCookie },
    socket: { remoteAddress: "10.0.0.2" },
  } as unknown as VercelRequest;
  const res = {
    status(code: number) { captured.statusCode = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
    setHeader(name: string, value: string) { captured.headers[name.toLowerCase()] = value; return this; },
    end() { return this; },
  } as unknown as VercelResponse;
  return { req, res, captured };
}

async function call(method: string, url: string, body?: unknown): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes(method, url, body);
  await quotesHandler(req, res);
  return captured;
}

interface ProjectJson {
  id: string;
  scopeOfWorkId: string;
  scopeNumber: string;
}
interface WorkHandoverJson {
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  jobCode: string;
  documentCode: string | null;
  customerName: string;
  preparedAt: string;
  customerSignatureDataUrl: string;
  customerSignedName: string;
  isSigned: boolean;
  signedAt: string | null;
}

async function createProject(): Promise<ProjectJson> {
  const created = await call("POST", "/api/projects", { scopeOfWorkId });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
  return (created.body as { project: ProjectJson }).project;
}

async function createWorkHandover(projectId: string): Promise<WorkHandoverJson> {
  const created = await call("POST", "/api/work-handovers", { projectId });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
  return (created.body as { workHandover: WorkHandoverJson }).workHandover;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  authHandler = (await import("../../api/handlers/auth.js")).default;
  quotesHandler = (await import("../../api/handlers/quotes.js")).default;

  // Setup Wizard creates the one Super Admin, who holds every permission implicitly.
  const { req, res, captured } = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: PASSWORD,
  });
  await authHandler(req, res);
  expect(captured.statusCode).toBe(201);
  sessionCookie = captured.headers["set-cookie"].split(";")[0];

  // A minimal real Scope of Work, inserted directly — same fixture approach projectAtomicity.test.ts uses.
  const db = client.db("tcs_erp");
  const result = await db.collection("scope_of_works").insertOne({
    scopeNumber: "TEST-SOW-WH-01", yearMonth: "", jobSequence: 0, secondaryCode: "",
    quotationId: "Q-TEST-WH-01", quotationNumber: "Q-TEST-WH-01", jobTypeCode: "LI", jobTypeName: "FRP Lining",
    quotationSalesperson: "", issueDate: "2026-08-19", deliveryDate: "", drawingCode: "", customerPoNumber: "",
    customerSnapshot: { companyName: "Test Handover Co.", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" },
    deliveryLocation: "", shippingContact: "", shippingPhone: "", billingContact: "", billingPhone: "",
    checklistGroups: [],
    items: [{ id: "item-1", name: "FRP Tank Installation", specifications: [], quantity: 1, unit: "ชุด", isSectionHeader: false }],
    paymentConditions: { installments: [], description: "", notes: "" },
    documentRecipients: {}, documentRecipientMessage: "", revisionNote: "", remarks: "",
    seller: { name: "", userId: "", date: "" }, approver: { name: "", userId: "", date: "" },
    status: "Draft", version: 1,
    createdAt: "2026-08-19T00:00:00.000Z", updatedAt: "2026-08-19T00:00:00.000Z", createdBy: "", updatedBy: "", isDeleted: false,
  });
  scopeOfWorkId = result.insertedId.toString();
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("Work Handover Note: created from a Project directly (not a ProjectItem)", () => {
  it("snapshots scopeOfWorkId/jobCode/customerName from the Project, and leaves documentCode null", async () => {
    const project = await createProject();
    const wh = await createWorkHandover(project.id);

    expect(wh.projectId).toBe(project.id);
    expect(wh.scopeOfWorkId).toBe(project.scopeOfWorkId);
    expect(wh.jobCode).toBe(project.scopeNumber);
    expect(wh.customerName).toBe("Test Handover Co.");
    // Never invent a form code — see docs/MODULES/Project.md "Work Handover Note (first draft, unverified)".
    expect(wh.documentCode).toBeNull();
    expect(wh.isSigned).toBe(false);
    expect(wh.signedAt).toBeNull();
  });

  it("preparedAt seeds as a date-only string (YYYY-MM-DD), so an immediate re-save doesn't 400 — same bug class as the other 3 document types", async () => {
    const project = await createProject();
    const wh = await createWorkHandover(project.id);
    expect(wh.preparedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const saved = await call("PATCH", `/api/work-handovers/${wh.id}`, { lines: [] });
    expect(saved.statusCode, JSON.stringify(saved.body)).toBe(200);
  });

  it("multiple Work Handover Notes can exist for the same Project (no existence-check enforcement, unlike Project<->Scope of Work)", async () => {
    const project = await createProject();
    const first = await createWorkHandover(project.id);
    const second = await createWorkHandover(project.id);
    expect(first.id).not.toBe(second.id);

    const list = await call("GET", `/api/work-handovers?projectId=${project.id}`);
    expect(list.statusCode).toBe(200);
    expect((list.body as { workHandovers: unknown[] }).workHandovers).toHaveLength(2);
  });
});

describe("Work Handover Note: signing is the state transition, not \"finalize\"", () => {
  it("rejects POST /:id/sign until the customer's signature has been saved", async () => {
    const project = await createProject();
    const wh = await createWorkHandover(project.id);

    const sign = await call("POST", `/api/work-handovers/${wh.id}/sign`);
    expect(sign.statusCode, JSON.stringify(sign.body)).toBe(400);

    const after = await call("GET", `/api/work-handovers/${wh.id}`);
    expect((after.body as { workHandover: WorkHandoverJson }).workHandover.isSigned).toBe(false);
  });

  it("succeeds once the customer's signature is saved, setting isSigned/signedAt/customerSignedAt", async () => {
    const project = await createProject();
    const wh = await createWorkHandover(project.id);

    const withSignature = await call("PATCH", `/api/work-handovers/${wh.id}`, {
      customerSignatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      customerSignedName: "Somchai Test",
    });
    expect(withSignature.statusCode, JSON.stringify(withSignature.body)).toBe(200);

    const signed = await call("POST", `/api/work-handovers/${wh.id}/sign`);
    expect(signed.statusCode, JSON.stringify(signed.body)).toBe(200);
    const body = (signed.body as { workHandover: WorkHandoverJson }).workHandover;
    expect(body.isSigned).toBe(true);
    expect(body.signedAt).toBeTruthy();
    expect(body.customerSignedName).toBe("Somchai Test");
  });

  it("rejects any further PATCH once signed — no editing after customer acceptance", async () => {
    const project = await createProject();
    const wh = await createWorkHandover(project.id);
    await call("PATCH", `/api/work-handovers/${wh.id}`, {
      customerSignatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      customerSignedName: "Somchai Test",
    });
    await call("POST", `/api/work-handovers/${wh.id}/sign`);

    const editAfterSign = await call("PATCH", `/api/work-handovers/${wh.id}`, { siteDescription: "changed" });
    expect(editAfterSign.statusCode, JSON.stringify(editAfterSign.body)).toBe(400);
  });

  it("rejects signing twice", async () => {
    const project = await createProject();
    const wh = await createWorkHandover(project.id);
    await call("PATCH", `/api/work-handovers/${wh.id}`, {
      customerSignatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      customerSignedName: "Somchai Test",
    });
    await call("POST", `/api/work-handovers/${wh.id}/sign`);

    const secondSign = await call("POST", `/api/work-handovers/${wh.id}/sign`);
    expect(secondSign.statusCode, JSON.stringify(secondSign.body)).toBe(400);
  });
});

describe("Work Handover Note: deleting does not touch the Project", () => {
  it("delete is a soft-delete (isDeleted) and does not require/touch a ProjectItem link", async () => {
    const project = await createProject();
    const wh = await createWorkHandover(project.id);

    const del = await call("DELETE", `/api/work-handovers/${wh.id}`);
    expect(del.statusCode, JSON.stringify(del.body)).toBe(200);

    const after = await call("GET", `/api/work-handovers/${wh.id}`);
    expect(after.statusCode).toBe(404);
  });
});
