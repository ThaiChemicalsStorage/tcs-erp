import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Integration test for the Project module's CRITICAL invariant (Stage 3, added 2026-08-18):
 * creating a sub-document (Material Requisition/Job Order/Purchase Request) against a Project item
 * must atomically update that item's `sourcingMethod`/`itemStatus`/link field — server-derived,
 * never trusted from client input. Runs the real handlers (api/handlers/quotes.ts, which dispatches
 * to projectHandler.ts/materialRequisitionHandler.ts/jobOrderHandler.ts) against a throwaway
 * in-memory MongoDB, same `makeReqRes()`-over-the-real-handler-function pattern
 * tests/api/roleDependencies.test.ts already established.
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
  const req = {
    method,
    url,
    body,
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

async function call(method: string, url: string, body?: unknown): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes(method, url, body);
  await quotesHandler(req, res);
  return captured;
}

interface ProjectItemJson {
  id: string;
  sourcingMethod: string;
  itemStatus: string;
  materialRequisitionId: string;
  jobOrderId: string;
  purchaseRequestId: string;
}
interface ProjectJson {
  id: string;
  items: ProjectItemJson[];
}

async function createProject(): Promise<ProjectJson> {
  const created = await call("POST", "/api/projects", { scopeOfWorkId });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
  return (created.body as { project: ProjectJson }).project;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  authHandler = (await import("../../api/handlers/auth.js")).default;
  quotesHandler = (await import("../../api/handlers/quotes.js")).default;

  // Setup Wizard creates the one Super Admin, who holds every permission implicitly — no custom
  // role setup needed for this test.
  const { req, res, captured } = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: PASSWORD,
  });
  await authHandler(req, res);
  expect(captured.statusCode).toBe(201);
  sessionCookie = captured.headers["set-cookie"].split(";")[0];

  // A minimal real Scope of Work, inserted directly (bypassing the full Quotation -> Scope of Work
  // creation chain, which isn't what this test is about) — same fixture-insertion approach
  // tests/api/visibility.test.ts already uses for its own out-of-scope dependencies.
  const db = client.db("tcs_erp");
  const result = await db.collection("scope_of_works").insertOne({
    scopeNumber: "TEST-SOW-01", yearMonth: "", jobSequence: 0, secondaryCode: "",
    quotationId: "Q-TEST-01", quotationNumber: "Q-TEST-01", jobTypeCode: "LI", jobTypeName: "FRP Lining",
    quotationSalesperson: "", issueDate: "2026-08-18", deliveryDate: "", drawingCode: "", customerPoNumber: "",
    customerSnapshot: { companyName: "Test Co.", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" },
    deliveryLocation: "", shippingContact: "", shippingPhone: "", billingContact: "", billingPhone: "",
    checklistGroups: [],
    items: [{ id: "item-1", name: "FRP Tank Installation", specifications: [], quantity: 1, unit: "ชุด", isSectionHeader: false }],
    paymentConditions: { installments: [], description: "", notes: "" },
    documentRecipients: {}, documentRecipientMessage: "", revisionNote: "", remarks: "",
    seller: { name: "", userId: "", date: "" }, approver: { name: "", userId: "", date: "" },
    // "Final" (อนุมัติแล้ว) is required by handleCreate() as of 2026-08-20 — a Draft/PendingApproval
    // scope can no longer open a project. These tests are about the item<->sub-document link, not
    // the approval gate (which has its own test below), so the fixture starts already approved.
    status: "Final", version: 1,
    createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z", createdBy: "", updatedBy: "", isDeleted: false,
  });
  scopeOfWorkId = result.insertedId.toString();
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("Project item <-> sub-document atomic link", () => {
  it("creating a Material Requisition against a Project item atomically updates the item's sourcingMethod/itemStatus/materialRequisitionId", async () => {
    const project = await createProject();
    expect(project.items).toHaveLength(1);
    const itemId = project.items[0].id;
    expect(project.items[0].sourcingMethod).toBe("unassigned");
    expect(project.items[0].itemStatus).toBe("pending");
    expect(project.items[0].materialRequisitionId).toBe("");

    const mrRes = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId });
    expect(mrRes.statusCode, JSON.stringify(mrRes.body)).toBe(201);
    const mr = (mrRes.body as { materialRequisition: { id: string } }).materialRequisition;

    // Assert via the API — the response reflects a fresh read, not an echo of client input.
    const after = await call("GET", `/api/projects/${project.id}`);
    expect(after.statusCode).toBe(200);
    const itemAfter = (after.body as { project: ProjectJson }).project.items.find((it) => it.id === itemId)!;
    expect(itemAfter.sourcingMethod).toBe("requisition");
    expect(itemAfter.itemStatus).toBe("documentCreated");
    expect(itemAfter.materialRequisitionId).toBe(mr.id);
    expect(itemAfter.jobOrderId).toBe("");
    expect(itemAfter.purchaseRequestId).toBe("");

    // ...and genuinely persisted in MongoDB, not just present in the handler's own response.
    const stored = await client.db("tcs_erp").collection("projects").findOne({ _id: new ObjectId(project.id) });
    const storedItems = stored?.items as ProjectItemJson[] | undefined;
    const storedItem = storedItems?.find((it) => it.id === itemId);
    expect(storedItem?.sourcingMethod).toBe("requisition");
    expect(storedItem?.itemStatus).toBe("documentCreated");
    expect(storedItem?.materialRequisitionId).toBe(mr.id);
  });

  it("rejects creating a second sub-document against an item that already has one (client cannot fabricate a link by racing two creates)", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;

    const first = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId });
    expect(first.statusCode, JSON.stringify(first.body)).toBe(201);

    const second = await call("POST", "/api/job-orders", { projectId: project.id, itemId });
    expect(second.statusCode, JSON.stringify(second.body)).toBe(400);

    // The first link is untouched by the rejected second attempt.
    const after = await call("GET", `/api/projects/${project.id}`);
    const itemAfter = (after.body as { project: ProjectJson }).project.items.find((it) => it.id === itemId)!;
    expect(itemAfter.sourcingMethod).toBe("requisition");
    expect(itemAfter.jobOrderId).toBe("");
  });

  it("deleting the sub-document unlinks the parent item back to unassigned/pending", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;

    const mrRes = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId });
    const mr = (mrRes.body as { materialRequisition: { id: string } }).materialRequisition;

    const del = await call("DELETE", `/api/material-requisitions/${mr.id}`);
    expect(del.statusCode, JSON.stringify(del.body)).toBe(200);

    const after = await call("GET", `/api/projects/${project.id}`);
    const itemAfter = (after.body as { project: ProjectJson }).project.items.find((it) => it.id === itemId)!;
    expect(itemAfter.sourcingMethod).toBe("unassigned");
    expect(itemAfter.itemStatus).toBe("pending");
    expect(itemAfter.materialRequisitionId).toBe("");
  });

  it("finalizing a Job Order advances the parent item to fulfilled", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;

    const joRes = await call("POST", "/api/job-orders", { projectId: project.id, itemId });
    expect(joRes.statusCode, JSON.stringify(joRes.body)).toBe(201);
    const jobOrder = (joRes.body as { jobOrder: { id: string } }).jobOrder;

    const fin = await call("POST", `/api/job-orders/${jobOrder.id}/finalize`);
    expect(fin.statusCode, JSON.stringify(fin.body)).toBe(200);

    const after = await call("GET", `/api/projects/${project.id}`);
    const itemAfter = (after.body as { project: ProjectJson }).project.items.find((it) => it.id === itemId)!;
    expect(itemAfter.itemStatus).toBe("fulfilled");
    expect(itemAfter.sourcingMethod).toBe("jobOrder");
  });

  it("PATCH /api/projects/:id/items/:itemId (branch pre-assignment) is rejected once a sub-document already exists", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;
    await call("POST", "/api/purchase-requests", { projectId: project.id, itemId });

    const reassign = await call("PATCH", `/api/projects/${project.id}/items/${itemId}`, { sourcingMethod: "requisition" });
    expect(reassign.statusCode, JSON.stringify(reassign.body)).toBe(400);
  });
});

/**
 * Regression test for a real bug found 2026-08-18 during the Project module's Stage 6 live-browser
 * walkthrough: all 3 sub-document types seed their signatory timestamp (Material Requisition's
 * `preparedAt`, Job Order/Purchase Request's `requestedAt`) from the full ISO datetime returned by
 * `nowIso()` (e.g. "2026-08-18T06:48:08.443Z"), but the frontend's editor round-trips that same
 * value back on every save, and the server's own `validateIsoDateOrEmpty()` requires strict
 * YYYY-MM-DD — so every single save after creation failed with a 400, permanently, for every
 * document of all 3 types. Fixed by seeding `now.slice(0, 10)` instead of the full timestamp. This
 * test creates each type and immediately re-saves it with no other changes (the exact shape the
 * frontend's own "Save Draft" button sends) — before the fix, all 3 assertions below would fail.
 */
describe("Material Requisition/Job Order/Purchase Request: immediate re-save after creation", () => {
  it("a freshly-created Material Requisition can be saved (PATCH) without editing preparedAt", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;
    const created = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId });
    const mr = (created.body as { materialRequisition: { id: string; preparedAt: string } }).materialRequisition;
    expect(mr.preparedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const saved = await call("PATCH", `/api/material-requisitions/${mr.id}`, { lines: [] });
    expect(saved.statusCode, JSON.stringify(saved.body)).toBe(200);
  });

  it("a freshly-created Job Order can be saved (PATCH) without editing requestedAt", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;
    const created = await call("POST", "/api/job-orders", { projectId: project.id, itemId });
    const jobOrder = (created.body as { jobOrder: { id: string; requestedAt: string } }).jobOrder;
    expect(jobOrder.requestedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const saved = await call("PATCH", `/api/job-orders/${jobOrder.id}`, { lines: [] });
    expect(saved.statusCode, JSON.stringify(saved.body)).toBe(200);
  });

  it("a freshly-created Purchase Request can be saved (PATCH) without editing requestedAt", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;
    const created = await call("POST", "/api/purchase-requests", { projectId: project.id, itemId });
    const purchaseRequest = (created.body as { purchaseRequest: { id: string; requestedAt: string } }).purchaseRequest;
    expect(purchaseRequest.requestedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const saved = await call("PATCH", `/api/purchase-requests/${purchaseRequest.id}`, { lines: [] });
    expect(saved.statusCode, JSON.stringify(saved.body)).toBe(200);
  });
});

/**
 * เปิดโครงการได้เฉพาะ Scope of Work ที่อนุมัติแล้ว (Final) — ตามคำสั่งเจ้าของ 2026-08-20
 * "ให้ scope of work อนุมัติผ่านก่อนถึงจะกดสร้างโครงการได้"
 *
 * The picker (ProjectSourcePickers.tsx) also disables non-Final rows, but that is presentation
 * only — this asserts the server-side gate, which is what actually holds.
 */
describe("a project can only be opened from an approved (Final) Scope of Work", () => {
  const insertScopeWithStatus = async (status: string, scopeNumber: string): Promise<string> => {
    const db = client.db("tcs_erp");
    const { insertedId } = await db.collection("scope_of_works").insertOne({
      scopeNumber, yearMonth: "", jobSequence: 0, secondaryCode: "",
      quotationId: "Q-GATE-01", quotationNumber: "Q-GATE-01", jobTypeCode: "LI", jobTypeName: "FRP Lining",
      quotationSalesperson: "", issueDate: "2026-08-20", deliveryDate: "", drawingCode: "", customerPoNumber: "",
      customerSnapshot: { companyName: "Gate Co.", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" },
      deliveryLocation: "", shippingContact: "", shippingPhone: "", billingContact: "", billingPhone: "",
      checklistGroups: [],
      items: [{ id: "g-1", name: "Item", specifications: [], quantity: 1, unit: "ชุด", isSectionHeader: false }],
      paymentConditions: { installments: [], description: "", notes: "" },
      documentRecipients: {}, documentRecipientMessage: "", revisionNote: "", remarks: "",
      seller: { name: "", userId: "", date: "" }, approver: { name: "", userId: "", date: "" },
      status, version: 1,
      createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z", createdBy: "", updatedBy: "", isDeleted: false,
    });
    return insertedId.toString();
  };

  it("refuses a Draft Scope of Work", async () => {
    const id = await insertScopeWithStatus("Draft", "GATE-DRAFT-01");
    const res = await call("POST", "/api/projects", { scopeOfWorkId: id });
    expect(res.statusCode).toBe(400);
    expect(String((res.body as { error?: string }).error)).toContain("ยังไม่ได้รับการอนุมัติ");
  });

  it("refuses a PendingApproval Scope of Work", async () => {
    const id = await insertScopeWithStatus("PendingApproval", "GATE-PENDING-01");
    const res = await call("POST", "/api/projects", { scopeOfWorkId: id });
    expect(res.statusCode).toBe(400);
  });

  it("allows a Final Scope of Work", async () => {
    const id = await insertScopeWithStatus("Final", "GATE-FINAL-01");
    const res = await call("POST", "/api/projects", { scopeOfWorkId: id });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  });
});
