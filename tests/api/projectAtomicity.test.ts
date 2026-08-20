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
  // Both real runtimes (Vercel and the Express server) always populate `req.query`; handlers read it
  // directly, so the mock has to as well or a query-string route crashes here but works in prod.
  const query = Object.fromEntries(new URLSearchParams(url.split("?")[1] ?? ""));
  const req = {
    method,
    url,
    body,
    query,
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

  it("approving a Job Order advances the parent item to fulfilled", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;

    const joRes = await call("POST", "/api/job-orders", { projectId: project.id, itemId });
    expect(joRes.statusCode, JSON.stringify(joRes.body)).toBe(201);
    const jobOrder = (joRes.body as { jobOrder: { id: string } }).jobOrder;

    // As of 2026-08-20 approval is a two-step workflow (Draft -> PendingApproval -> Final), so a
    // straight finalize on a Draft is refused — the item only becomes fulfilled on real approval.
    const tooEarly = await call("POST", `/api/job-orders/${jobOrder.id}/finalize`);
    expect(tooEarly.statusCode, "cannot approve straight from Draft").toBe(400);

    expect((await call("POST", `/api/job-orders/${jobOrder.id}/submit-approval`)).statusCode).toBe(200);
    const fin = await call("POST", `/api/job-orders/${jobOrder.id}/approve`);
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

/**
 * ขั้นตอนอนุมัติร่วม (ร่าง → รออนุมัติ → อนุมัติ) เพิ่ม 2026-08-20 ตามคำสั่งเจ้าของ
 * "ใบที่ต้องมีการอนุมัติต้องมีปุ่มอนุมัติด้วย" — ทำงานเหมือน Scope of Work ทุกประการ
 *
 * Exercised through Material Requisition; Job Order and Purchase Request share the exact same
 * generic helper (api/_lib/documentApproval.ts), so this pins the shared semantics rather than
 * triplicating near-identical cases.
 */
describe("shared document approval workflow (Draft -> PendingApproval -> Final)", () => {
  const createMr = async (): Promise<string> => {
    const project = await createProject();
    const res = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId: project.items[0].id });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    return (res.body as { materialRequisition: { id: string } }).materialRequisition.id;
  };
  const statusOf = async (id: string): Promise<string> => {
    const res = await call("GET", `/api/material-requisitions/${id}`);
    return (res.body as { materialRequisition: { status: string } }).materialRequisition.status;
  };

  it("submit -> approve stamps the approver and reaches Final", async () => {
    const id = await createMr();
    expect(await statusOf(id)).toBe("Draft");

    expect((await call("POST", `/api/material-requisitions/${id}/submit-approval`)).statusCode).toBe(200);
    expect(await statusOf(id)).toBe("PendingApproval");

    const approved = await call("POST", `/api/material-requisitions/${id}/approve`);
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(200);
    const doc = (approved.body as { materialRequisition: { status: string; approvedBy: string; approvedByUserId: string; approvedAt: string } }).materialRequisition;
    expect(doc.status).toBe("Final");
    // approvedBy was blank, so the approving user's name fills the printed form field
    expect(doc.approvedBy).toBe("Admin");
    expect(doc.approvedByUserId, "the real approver is recorded server-side").not.toBe("");
    expect(doc.approvedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reject requires a reason, sends it back to Draft, and the reason clears on resubmit", async () => {
    const id = await createMr();
    await call("POST", `/api/material-requisitions/${id}/submit-approval`);

    const noReason = await call("POST", `/api/material-requisitions/${id}/reject`, {});
    expect(noReason.statusCode, "a rejection must say why").toBe(400);

    const rejected = await call("POST", `/api/material-requisitions/${id}/reject`, { comment: "จำนวนไม่ตรงกับหน้างาน" });
    expect(rejected.statusCode, JSON.stringify(rejected.body)).toBe(200);
    const back = (rejected.body as { materialRequisition: { status: string; rejectionComment: string } }).materialRequisition;
    expect(back.status).toBe("Draft");
    expect(back.rejectionComment).toBe("จำนวนไม่ตรงกับหน้างาน");

    const resubmitted = await call("POST", `/api/material-requisitions/${id}/submit-approval`);
    expect((resubmitted.body as { materialRequisition: { rejectionComment: string } }).materialRequisition.rejectionComment,
      "a stale rejection reason must not linger after resubmission").toBe("");
  });

  it("withdraw returns it to Draft, and an already-approved document cannot be re-approved", async () => {
    const id = await createMr();
    await call("POST", `/api/material-requisitions/${id}/submit-approval`);
    expect((await call("POST", `/api/material-requisitions/${id}/withdraw-approval`)).statusCode).toBe(200);
    expect(await statusOf(id)).toBe("Draft");

    await call("POST", `/api/material-requisitions/${id}/submit-approval`);
    await call("POST", `/api/material-requisitions/${id}/approve`);
    const again = await call("POST", `/api/material-requisitions/${id}/approve`);
    expect(again.statusCode).toBe(400);
  });
});

/**
 * ใบสั่งผลิต (Production Order, FM-PD-02) — เพิ่ม 2026-08-20 สำหรับฝ่ายผลิต
 *
 * Differs from the other three Project-family documents: created straight from an approved Scope of
 * Work (no Project item), and numbered SC-{Gregorian year}-{month}-{seq} per the real form rather
 * than the Buddhist-year scheme everything else uses. Both pinned here so a future "consistency"
 * refactor can't quietly change them.
 */
describe("Production Order", () => {
  const createPo = async (): Promise<{ id: string; jobCode: string }> => {
    const res = await call("POST", "/api/production-orders", { scopeOfWorkId });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    return (res.body as { productionOrder: { id: string; jobCode: string } }).productionOrder;
  };

  it("is created from an approved Scope of Work and numbered SC-YYYY-MM-NNN", async () => {
    const po = await createPo();
    expect(po.id).toMatch(/^SC-\d{4}-\d{2}-\d{3}$/);
    // Gregorian year, deliberately NOT the Buddhist year the other documents use
    expect(po.id.slice(3, 7)).toBe(String(new Date().getFullYear()));
    expect(po.jobCode).toBe("TEST-SOW-01");
  });

  it("refuses a Scope of Work that is not approved", async () => {
    const db = client.db("tcs_erp");
    const draft = await db.collection("scope_of_works").insertOne({
      scopeNumber: "PO-GATE-DRAFT", quotationId: "", quotationNumber: "", jobTypeCode: "", jobTypeName: "",
      customerSnapshot: { companyName: "X", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" },
      items: [], checklistGroups: [], paymentConditions: { installments: [], description: "", notes: "" },
      documentRecipients: {}, seller: { name: "", userId: "", date: "" }, approver: { name: "", userId: "", date: "" },
      status: "Draft", isDeleted: false, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
    });
    const res = await call("POST", "/api/production-orders", { scopeOfWorkId: draft.insertedId.toString() });
    expect(res.statusCode).toBe(400);
    expect(String((res.body as { error?: string }).error)).toContain("ยังไม่ได้รับการอนุมัติ");
  });

  it("keeps section-header rows free of qty/unit, and stamps the approver signatory on approval", async () => {
    const po = await createPo();
    const patched = await call("PATCH", `/api/production-orders/${po.id}`, {
      productName: "FRP Vertical Tank 8 Cu.m.",
      lines: [
        // a header row that wrongly carries qty/unit — the server must strip them
        { isSectionHeader: true, description: "ชิ้นส่วน", qty: 99, unit: "ชุด" },
        { isSectionHeader: false, description: "ก้นถัง(Bottom) Dia.2,000 mm.", subDetails: ["หนา 7 mm. 1(V)+2(M4)/S901", "   "], qty: 1, unit: "ก้น" },
      ],
    });
    expect(patched.statusCode, JSON.stringify(patched.body)).toBe(200);
    const lines = (patched.body as { productionOrder: { lines: { isSectionHeader: boolean; qty: number | null; unit: string; subDetails: string[] }[] } }).productionOrder.lines;
    expect(lines[0].qty, "a header row cannot carry a quantity").toBeNull();
    expect(lines[0].unit).toBe("");
    expect(lines[1].subDetails, "blank sub-details are dropped").toEqual(["หนา 7 mm. 1(V)+2(M4)/S901"]);

    await call("POST", `/api/production-orders/${po.id}/submit-approval`);
    const approved = await call("POST", `/api/production-orders/${po.id}/approve`);
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(200);
    const doc = (approved.body as { productionOrder: { status: string; approver: { name: string; date: string } } }).productionOrder;
    expect(doc.status).toBe("Final");
    expect(doc.approver.name).toBe("Admin");
    expect(doc.approver.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("cannot be edited once approved", async () => {
    const po = await createPo();
    await call("POST", `/api/production-orders/${po.id}/submit-approval`);
    await call("POST", `/api/production-orders/${po.id}/approve`);
    const res = await call("PATCH", `/api/production-orders/${po.id}`, { productName: "changed" });
    expect(res.statusCode).toBe(400);
  });
});

/**
 * แยกเอกสารตามแผนกเจ้าของ — ฝ่ายโครงการกับฝ่ายผลิตใช้ใบเบิก-คืนวัสดุ/ใบขอซื้อ "ชนิดเดียวกัน" แต่
 * ต่างคนต่างเห็นของตัวเอง (ยืนยันกับเจ้าของ 2026-08-20)
 *
 * The important half is the back-compat one: documents created before ownerDepartment existed have
 * no such field at all, and must keep showing up for the Project department rather than vanishing.
 */
describe("Material Requisition / Purchase Request are separated by owning department", () => {
  it("a production-owned requisition is invisible to the project list and vice versa, and legacy rows stay with Project", async () => {
    const db = client.db("tcs_erp");

    // ของฝ่ายโครงการ (ผ่านรายการในโครงการตามปกติ)
    const project = await createProject();
    const projectMr = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId: project.items[0].id });
    expect(projectMr.statusCode, JSON.stringify(projectMr.body)).toBe(201);
    const projectMrId = (projectMr.body as { materialRequisition: { id: string } }).materialRequisition.id;

    // ของฝ่ายผลิต (ออกจากใบสั่งผลิต)
    const po = await call("POST", "/api/production-orders", { scopeOfWorkId });
    const poId = (po.body as { productionOrder: { id: string } }).productionOrder.id;
    const prodMr = await call("POST", "/api/material-requisitions", { productionOrderId: poId });
    expect(prodMr.statusCode, JSON.stringify(prodMr.body)).toBe(201);
    const prodMrDoc = (prodMr.body as { materialRequisition: { id: string; ownerDepartment: string; projectId: string; productionOrderId: string } }).materialRequisition;
    expect(prodMrDoc.ownerDepartment).toBe("production");
    expect(prodMrDoc.projectId, "a production requisition has no project item to hang off").toBe("");
    expect(prodMrDoc.productionOrderId).toBe(poId);

    // เอกสารเก่าที่ไม่มีฟิลด์ ownerDepartment เลย — ต้องยังนับเป็นของฝ่ายโครงการ
    await db.collection("material_requisitions").insertOne({
      _id: "MR-LEGACY-0001", projectId: project.id, scopeOfWorkId, jobCode: "TEST-SOW-01",
      customerName: "Test Co.", jobOrderId: null, jobOrderCode: "", productName: "legacy",
      responsibleEmployee: "", productionStartDate: "", lines: [], status: "Draft",
      preparedBy: "", preparedAt: "", approvedBy: "", approvedAt: "", storeDeptBy: "", storeDeptAt: "",
      costDeptBy: "", costDeptAt: "", returnedBy: "", returnReceivedBy: "", returnedAt: "",
      createdAt: "", updatedAt: "", createdBy: "", updatedBy: "", isDeleted: false,
    } as never);

    const projectList = await call("GET", "/api/material-requisitions?ownerDepartment=project");
    const projectIds = (projectList.body as { materialRequisitions: { id: string }[] }).materialRequisitions.map((m) => m.id);
    expect(projectIds).toContain(projectMrId);
    expect(projectIds, "a pre-ownerDepartment document must not disappear").toContain("MR-LEGACY-0001");
    expect(projectIds, "production documents must not leak into the project list").not.toContain(prodMrDoc.id);

    const productionList = await call("GET", "/api/material-requisitions?ownerDepartment=production");
    const productionIds = (productionList.body as { materialRequisitions: { id: string }[] }).materialRequisitions.map((m) => m.id);
    expect(productionIds).toContain(prodMrDoc.id);
    expect(productionIds).not.toContain(projectMrId);
    expect(productionIds).not.toContain("MR-LEGACY-0001");
  });

  it("a purchase request can also be raised straight from a production order", async () => {
    const po = await call("POST", "/api/production-orders", { scopeOfWorkId });
    const poId = (po.body as { productionOrder: { id: string } }).productionOrder.id;
    const res = await call("POST", "/api/purchase-requests", { productionOrderId: poId });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const doc = (res.body as { purchaseRequest: { ownerDepartment: string; productionOrderId: string } }).purchaseRequest;
    expect(doc.ownerDepartment).toBe("production");
    expect(doc.productionOrderId).toBe(poId);
  });
});
