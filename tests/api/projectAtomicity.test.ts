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
let linkProjectItemsToSubDocument: typeof import("../../api/_lib/projectHandler.js")["linkProjectItemsToSubDocument"];
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
    // route ดาวน์โหลดไฟล์แนบส่ง Buffer ผ่าน send() ไม่ใช่ json()
    send(payload: unknown) { captured.body = payload; return this; },
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
  linkProjectItemsToSubDocument = (await import("../../api/_lib/projectHandler.js")).linkProjectItemsToSubDocument;

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
  const createPo = async (): Promise<{ id: string; documentNumber: string; jobCode: string }> => {
    const res = await call("POST", "/api/production-orders", { scopeOfWorkId });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    return (res.body as { productionOrder: { id: string; documentNumber: string; jobCode: string } }).productionOrder;
  };

  it("is created from an approved Scope of Work and numbered SC-YYYY-MM-NNN", async () => {
    const po = await createPo();
    expect(po.id).toMatch(/^SC-\d{4}-\d{2}-\d{3}$/);
    // Gregorian year, deliberately NOT the Buddhist year the other documents use
    expect(po.id.slice(3, 7)).toBe(String(new Date().getFullYear()));
    expect(po.jobCode).toBe("TEST-SOW-01");
  });

  /**
   * เดิมเคยบังคับว่า Scope of Work ต้อง Final ก่อน (2026-08-20) — ปลดออกเมื่อ 2026-08-27 ตามที่
   * ฝ่ายผลิตขอในการประชุม เทสต์นี้กลับด้านโดยตั้งใจ เพื่อเป็นหลักฐานว่าการปลดด่านเป็นเจตนา ไม่ใช่ด่านหายไปเอง
   */
  it("accepts a Scope of Work that is not approved yet", async () => {
    const db = client.db("tcs_erp");
    const draft = await db.collection("scope_of_works").insertOne({
      scopeNumber: "PO-GATE-DRAFT", quotationId: "", quotationNumber: "", jobTypeCode: "", jobTypeName: "",
      customerSnapshot: { companyName: "X", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" },
      items: [], checklistGroups: [], paymentConditions: { installments: [], description: "", notes: "" },
      documentRecipients: {}, seller: { name: "", userId: "", date: "" }, approver: { name: "", userId: "", date: "" },
      status: "Draft", isDeleted: false, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
    });
    const res = await call("POST", "/api/production-orders", { scopeOfWorkId: draft.insertedId.toString() });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  });

  /**
   * เลขที่ที่พิมพ์บนฟอร์ม (documentNumber) แก้เองได้ แต่ _id แก้ไม่ได้ — ฝ่ายผลิตขอไว้
   * 2026-08-27 ว่า "แก้ไขเลขที่ได้ แต่ยังรันปกติ" — สองอย่างนี้ต้องจริงพร้อมกัน จึงปักทั้งคู่ไว้ที่นี่
   */
  it("lets the printed number be edited while the running counter is untouched", async () => {
    const first = await createPo();
    expect(first.documentNumber, "ตอนสร้าง เลขที่พิมพ์เท่ากับเลขที่ระบบรัน").toBe(first.id);

    const renamed = await call("PATCH", `/api/production-orders/${first.id}`, { documentNumber: "SC-ทดสอบ-001" });
    expect(renamed.statusCode, JSON.stringify(renamed.body)).toBe(200);
    const doc = (renamed.body as { productionOrder: { id: string; documentNumber: string } }).productionOrder;
    expect(doc.documentNumber).toBe("SC-ทดสอบ-001");
    expect(doc.id, "_id ต้องไม่ขยับ ไม่งั้นใบเบิก/ใบขอซื้อที่อ้างอยู่จะหลุด").toBe(first.id);

    // ตัวนับเดินต่อตามปกติ — ใบถัดไปต้องได้เลขลำดับถัดจากของเดิม ไม่ใช่เลขที่เพิ่งแก้ไป
    const second = await createPo();
    const seqOf = (id: string) => Number(id.slice(-3));
    expect(seqOf(second.id)).toBe(seqOf(first.id) + 1);

    // เลขซ้ำกับใบอื่นต้องถูกปฏิเสธ
    const clash = await call("PATCH", `/api/production-orders/${second.id}`, { documentNumber: "SC-ทดสอบ-001" });
    expect(clash.statusCode, "เลขที่ซ้ำต้อง 409").toBe(409);

    // ตั้งเลขเดิมของตัวเองซ้ำได้ ไม่นับเป็นการชน
    const noop = await call("PATCH", `/api/production-orders/${second.id}`, { documentNumber: second.documentNumber });
    expect(noop.statusCode, JSON.stringify(noop.body)).toBe(200);

    // เลขที่ว่างไม่ได้
    const blank = await call("PATCH", `/api/production-orders/${second.id}`, { documentNumber: "   " });
    expect(blank.statusCode).toBe(400);
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
  /**
   * Rewrite ของใบสั่งผลิต — `_id` คือเลขที่เอกสาร จึงต่อท้าย -R{n} ทั้ง `_id` และ `documentNumber`
   * เทสต์นี้คุมสองอย่างที่พังเงียบได้ง่าย: (1) ช่องเซ็นต้องถูกล้าง ไม่ให้ลายเซ็นของฉบับเก่าติดมา
   * (2) เลขที่ที่ผู้ใช้แก้เองต้องต่อ -R จาก "รากของตัวมันเอง" ไม่ใช่จากรากของ _id
   */
  it("creates a -R revision, clearing signatories and keeping the two numbers independent", async () => {
    const source = await createPo();
    await call("PATCH", `/api/production-orders/${source.id}`, { documentNumber: "เลขของฉัน-99", productName: "ถังทดสอบ" });
    await call("POST", `/api/production-orders/${source.id}/submit-approval`);
    const approved = await call("POST", `/api/production-orders/${source.id}/approve`);
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(200);

    const res = await call("POST", `/api/production-orders/${source.id}/rewrite`);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const rev = (res.body as { productionOrder: {
      id: string; documentNumber: string; status: string; productName: string; revisionNote: string;
      approver: { name: string; date: string }; orderedBy: { name: string };
    } }).productionOrder;

    expect(rev.id).toBe(`${source.id}-R1`);
    // เลขที่พิมพ์ต่อ -R จากรากของตัวเอง ("เลขของฉัน-99") ไม่ใช่จาก _id
    expect(rev.documentNumber).toBe("เลขของฉัน-99-R1");
    expect(rev.status).toBe("Draft");
    expect(rev.productName, "เนื้อหาต้องถูกคัดลอกมา").toBe("ถังทดสอบ");
    expect(rev.approver.name, "ลายเซ็นผู้อนุมัติของฉบับเก่าต้องไม่ติดมา").toBe("");
    expect(rev.approver.date).toBe("");
    expect(rev.revisionNote, "หมายเหตุการแก้ไขไม่สืบทอด").toBe("");

    // ฉบับเดิมยังอยู่ ไม่ถูกแตะต้อง
    const original = await call("GET", `/api/production-orders/${source.id}`);
    expect(original.statusCode).toBe(200);
    expect((original.body as { productionOrder: { status: string } }).productionOrder.status).toBe("Final");
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
describe("Job Order covering several project items", () => {
  /**
   * ฝ่ายโครงการขอไว้ 2026-08-27 ว่าใบสั่งงาน "ติ๊กเลือกได้ว่าจะเอาตัวไหน" — หนึ่งใบจึงครอบคลุมหลายรายการ
   * จุดที่พังเงียบที่สุดคือการอนุมัติ/ลบ: ถ้าตัวช่วยยังคืนแค่รายการแรก รายการที่เหลือจะค้างสถานะเดิมตลอดไป
   * โดยไม่มี error ที่ไหนเลย
   */
  /**
   * fixture หลักของไฟล์นี้มีรายการเดียว — เทสต์ชุดนี้ต้องการอย่างน้อยสองรายการ ไม่งั้น "ติ๊กหลายรายการ"
   * จะถูกทดสอบด้วยรายการเดียวและผ่านไปทั้งที่โค้ดอาจรองรับแค่ตัวแรก (พลาดแบบนี้มาแล้วตอนเขียนครั้งแรก)
   * เพิ่มรายการที่สองเข้าไปในโครงการโดยตรง — เร็วกว่าและไม่กระทบ fixture ที่เทสต์อื่นใช้ร่วมกัน
   */
  async function projectWithItems(): Promise<ProjectJson> {
    const project = await createProject();
    await client.db("tcs_erp").collection("projects").updateOne(
      { _id: new ObjectId(project.id) },
      {
        $push: {
          items: {
            id: `item-2-${project.id}`,
            name: "Recirculating pump",
            specifications: ["SUS316", "3 kW"],
            quantity: 2,
            unit: "Set",
            sourcingMethod: "unassigned",
            itemStatus: "pending",
            materialRequisitionId: "", jobOrderId: "", purchaseRequestId: "",
          },
        },
      } as never,
    );
    const reloaded = await call("GET", `/api/projects/${project.id}`);
    const full = (reloaded.body as { project: ProjectJson }).project;
    expect(full.items.length, "ต้องมีอย่างน้อย 2 รายการเพื่อทดสอบการติ๊กหลายรายการจริง").toBeGreaterThanOrEqual(2);
    return full;
  }

  it("links every ticked item to the one job order, and copies them in as lines", async () => {
    const project = await projectWithItems();
    const itemIds = project.items.slice(0, 2).map((it) => it.id);
    const res = await call("POST", "/api/job-orders", { projectId: project.id, itemIds });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const jo = (res.body as { jobOrder: { id: string; lines: { description: string }[] } }).jobOrder;

    expect(jo.lines, "รายการที่ติ๊กต้องถูกคัดลอกมาเป็นรายการในเอกสาร").toHaveLength(itemIds.length);

    const after = await call("GET", `/api/projects/${project.id}`);
    const items = (after.body as { project: ProjectJson }).project.items;
    for (const id of itemIds) {
      const item = items.find((it) => it.id === id)!;
      expect(item.jobOrderId, `รายการ ${id} ต้องผูกกับใบนี้`).toBe(jo.id);
      expect(item.sourcingMethod).toBe("jobOrder");
      expect(item.itemStatus).toBe("documentCreated");
    }
  });

  it("fulfils every linked item on approval, not just the first", async () => {
    const project = await projectWithItems();
    const itemIds = project.items.slice(0, 2).map((it) => it.id);
    const created = await call("POST", "/api/job-orders", { projectId: project.id, itemIds });
    const id = (created.body as { jobOrder: { id: string } }).jobOrder.id;

    await call("POST", `/api/job-orders/${id}/submit-approval`);
    const approved = await call("POST", `/api/job-orders/${id}/approve`);
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(200);

    const after = await call("GET", `/api/projects/${project.id}`);
    const items = (after.body as { project: ProjectJson }).project.items;
    for (const itemId of itemIds) {
      const item = items.find((it) => it.id === itemId) as unknown as { itemStatus: string };
      expect(item.itemStatus, `รายการ ${itemId} ต้องถูกปิดงานด้วย` ).toBe("fulfilled");
    }
  });

  it("releases every linked item when the job order is deleted", async () => {
    const project = await projectWithItems();
    const itemIds = project.items.slice(0, 2).map((it) => it.id);
    const created = await call("POST", "/api/job-orders", { projectId: project.id, itemIds });
    const id = (created.body as { jobOrder: { id: string } }).jobOrder.id;

    const del = await call("DELETE", `/api/job-orders/${id}`);
    expect(del.statusCode, JSON.stringify(del.body)).toBe(200);

    const after = await call("GET", `/api/projects/${project.id}`);
    const items = (after.body as { project: ProjectJson }).project.items;
    for (const itemId of itemIds) {
      const item = items.find((it) => it.id === itemId)!;
      expect(item.jobOrderId, `รายการ ${itemId} ต้องถูกปลดลิงก์`).toBe("");
      expect(item.sourcingMethod).toBe("unassigned");
      expect(item.itemStatus).toBe("pending");
    }
  });

  it("refuses the whole request when any ticked item is already taken", async () => {
    const project = await projectWithItems();
    const [first, second] = project.items.slice(0, 2).map((it) => it.id);
    await call("POST", "/api/job-orders", { projectId: project.id, itemIds: [first] });

    // ติ๊กทั้งตัวที่ถูกจองไปแล้วและตัวที่ยังว่าง — ต้องปฏิเสธทั้งคำขอ ไม่ใช่สร้างเฉพาะตัวที่ว่าง
    const clash = await call("POST", "/api/job-orders", { projectId: project.id, itemIds: [first, second] });
    expect(clash.statusCode).toBe(400);

    // ตัวที่ว่างต้องไม่ถูกแตะเลย — ไม่งั้นจะเหลือรายการที่ผูกกับเอกสารที่ไม่เคยถูกสร้าง
    const after = await call("GET", `/api/projects/${project.id}`);
    const item = (after.body as { project: ProjectJson }).project.items.find((it) => it.id === second)!;
    expect(item.itemStatus).toBe("pending");
    expect(item.jobOrderId).toBe("");
  });

  /**
   * ด่านสุดท้ายของ invariant "ห้ามมีเอกสารลูกที่ผูกกับรายการที่ไม่มีอยู่จริง" — ตัว filter ของ
   * `linkProjectItemsToSubDocument()` ใช้ `$all` ไม่ใช่ `$in` เพราะ `$in` ผ่านเมื่อมีสักรายการเดียวตรง
   * แล้วจะผูกให้แค่ตัวที่เหลือ กลายเป็นเอกสารที่ผูกครึ่ง ๆ กลาง ๆ โดยไม่มีอะไรฟ้อง
   *
   * ยิงตรงเข้าตัวช่วย เพราะเส้นทางปกติมี `loadPendingProjectItemsOrThrow()` กันไว้ก่อนแล้ว —
   * ด่านนี้คือด่านที่สอง ไว้กันกรณีรายการถูกลบไประหว่างที่คำขอกำลังทำงาน
   */
  it("refuses to link when any requested item no longer exists", async () => {
    const project = await projectWithItems();
    const realId = project.items[0].id;
    await expect(
      linkProjectItemsToSubDocument(project.id, [realId, "item-ที่ถูกลบไปแล้ว"], "jobOrder", "jobOrderId", "JO-GHOST"),
    ).rejects.toThrow();

    // และต้องไม่ผูกตัวที่มีอยู่จริงทิ้งไว้ครึ่ง ๆ กลาง ๆ
    const after = await call("GET", `/api/projects/${project.id}`);
    const item = (after.body as { project: ProjectJson }).project.items.find((it) => it.id === realId)!;
    expect(item.jobOrderId, "รายการที่มีอยู่จริงต้องไม่ถูกผูกกับเอกสารที่ไม่ควรถูกสร้าง").toBe("");
    expect(item.itemStatus).toBe("pending");
  });

  it("still accepts the old single-item body shape", async () => {
    const project = await projectWithItems();
    const res = await call("POST", "/api/job-orders", { projectId: project.id, itemId: project.items[0].id });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    expect((res.body as { jobOrder: { lines: unknown[] } }).jobOrder.lines).toHaveLength(1);
  });
});

describe("Product requests", () => {
  /**
   * หัวใจของฟีเจอร์นี้คือ "ใครตั้งรหัสได้" — ที่ประชุมขอไว้ว่า "ขอเพิ่มสินค้าได้แต่ตั้งรหัสไม่ได้"
   * การซ่อนช่องบนหน้าจอไม่พอ — คนที่ยิง API ตรงๆ ต้องตั้งรหัสไม่ได้ด้วย เทสต์นี้จึงยิงค่า code เข้าไปตรงๆ
   */
  async function anyCategoryId(): Promise<string> {
    const db = client.db("tcs_erp");
    const existing = await db.collection("categories").findOne({});
    if (existing) return existing._id.toString();
    const created = await db.collection("categories").insertOne({ name: "หมวดทดสอบ", createdAt: "", updatedAt: "" });
    return created.insertedId.toString();
  }

  it("ignores any product code the requester tries to send", async () => {
    const res = await call("POST", "/api/product-requests", {
      name: "น็อตทดสอบ M12",
      unit: "ตัว",
      reason: "งานทดสอบ",
      // คนขอพยายามตั้งรหัสเอง — ต้องถูกเมินเฉย
      code: "รหัสที่ฉันตั้งเอง",
      assignedProductCode: "ก็อันนี้ด้วย",
      status: "Approved",
    });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const pr = (res.body as { productRequest: { assignedProductCode: string; assignedProductId: string; status: string } }).productRequest;
    expect(pr.assignedProductCode, "รหัสต้องว่างจนกว่าสโตร์จะตั้งให้").toBe("");
    expect(pr.assignedProductId).toBe("");
    expect(pr.status, "สถานะต้องเริ่มที่ Pending เสมอ แม้ client ส่ง Approved มา").toBe("Pending");
  });

  it("creates a real catalog product on approval and reports the code back", async () => {
    const categoryId = await anyCategoryId();
    const created = await call("POST", "/api/product-requests", { name: "เรซิ่นทดสอบ", unit: "กก.", reason: "งาน A" });
    const id = (created.body as { productRequest: { id: string } }).productRequest.id;

    const approved = await call("POST", `/api/product-requests/${id}/approve`, { code: "pr-test-01", categoryId });
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(200);
    const pr = (approved.body as { productRequest: { status: string; assignedProductCode: string; assignedProductId: string } }).productRequest;
    expect(pr.status).toBe("Approved");
    // รหัสถูกทำเป็นตัวพิมพ์ใหญ่ เหมือนหน้าเพิ่มสินค้าปกติ
    expect(pr.assignedProductCode).toBe("PR-TEST-01");
    expect(pr.assignedProductId).not.toBe("");

    const product = await client.db("tcs_erp").collection("products").findOne({ code: "PR-TEST-01" });
    expect(product, "ต้องมีสินค้าจริงในคลัง").not.toBeNull();
    expect(product?.name).toBe("เรซิ่นทดสอบ");
    expect(product?.stockQty, "สินค้าใหม่เริ่มที่สต็อก 0 เสมอ").toBe(0);
  });

  it("leaves the request Pending when the code collides, so it can be retried", async () => {
    const categoryId = await anyCategoryId();
    await client.db("tcs_erp").collection("products").insertOne({
      code: "DUP-CODE-01", name: "ของเดิม", categoryId: "", unit: "", defaultPrice: 0,
      description: "", specifications: [], archived: false, stockQty: 0,
      createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
    });
    const created = await call("POST", "/api/product-requests", { name: "ชนรหัส", unit: "ตัว", reason: "ทดสอบ" });
    const id = (created.body as { productRequest: { id: string } }).productRequest.id;

    const clash = await call("POST", `/api/product-requests/${id}/approve`, { code: "DUP-CODE-01", categoryId });
    expect(clash.statusCode).toBe(409);

    const after = await call("GET", `/api/product-requests/${id}`);
    expect((after.body as { productRequest: { status: string } }).productRequest.status,
      "รหัสซ้ำแล้วคำขอต้องยังแก้ได้ ไม่ใช่กลายเป็น Approved ที่ไม่มีสินค้า").toBe("Pending");

    // แก้รหัสแล้วกดใหม่ต้องผ่าน
    const retry = await call("POST", `/api/product-requests/${id}/approve`, { code: "DUP-CODE-02", categoryId });
    expect(retry.statusCode, JSON.stringify(retry.body)).toBe(200);
  });

  it("requires a reason to reject, and records it", async () => {
    const created = await call("POST", "/api/product-requests", { name: "ของที่จะถูกปฏิเสธ", unit: "ตัว", reason: "-" });
    const id = (created.body as { productRequest: { id: string } }).productRequest.id;

    const noReason = await call("POST", `/api/product-requests/${id}/reject`, { comment: "   " });
    expect(noReason.statusCode).toBe(400);

    const rejected = await call("POST", `/api/product-requests/${id}/reject`, { comment: "มีของเทียบเท่าอยู่แล้ว" });
    expect(rejected.statusCode, JSON.stringify(rejected.body)).toBe(200);
    const pr = (rejected.body as { productRequest: { status: string; rejectionComment: string } }).productRequest;
    expect(pr.status).toBe("Rejected");
    expect(pr.rejectionComment).toBe("มีของเทียบเท่าอยู่แล้ว");
  });

  it("refuses to review a request twice", async () => {
    const categoryId = await anyCategoryId();
    const created = await call("POST", "/api/product-requests", { name: "กดสองรอบ", unit: "ตัว", reason: "-" });
    const id = (created.body as { productRequest: { id: string } }).productRequest.id;
    await call("POST", `/api/product-requests/${id}/approve`, { code: "TWICE-01", categoryId });
    const again = await call("POST", `/api/product-requests/${id}/approve`, { code: "TWICE-02", categoryId });
    expect(again.statusCode).toBe(400);
  });
});

describe("Job Order attachments", () => {
  /**
   * ตรรกะความปลอดภัยของไฟล์แนบทำให้ถูกยาก และตอนนี้ถูกยกมาไว้ที่เดียว (documentAttachments.ts)
   * เทสต์ชุดนี้คุมข้อที่พังแล้วจะไม่มีใครสังเกต: เพดานจำนวนไฟล์, charset ของ base64, และ capability key
   */
  const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

  async function createJobOrder(): Promise<string> {
    const project = await createProject();
    const res = await call("POST", "/api/job-orders", { projectId: project.id, itemId: project.items[0].id });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    return (res.body as { jobOrder: { id: string } }).jobOrder.id;
  }

  it("attaches a file, exposes it through a capability URL, and removes it again", async () => {
    const id = await createJobOrder();
    const up = await call("POST", `/api/job-orders/${id}/attachments`, {
      fileName: "แบบงาน.pdf", contentType: "application/pdf", dataBase64: b64("hello-drawing"),
    });
    expect(up.statusCode, JSON.stringify(up.body)).toBe(200);
    const attachments = (up.body as { jobOrder: { attachments: { id: string; fileName: string; size: number; url: string }[] } }).jobOrder.attachments;
    expect(attachments).toHaveLength(1);
    expect(attachments[0].fileName).toBe("แบบงาน.pdf");
    expect(attachments[0].size).toBe("hello-drawing".length);

    // URL ต้องพาไปดาวน์โหลดได้จริง โดยไม่ต้องแก้อะไรเพิ่ม
    const dl = await call("GET", attachments[0].url.replace("/api", "/api"));
    expect(dl.statusCode).toBe(200);
    expect(Buffer.isBuffer(dl.body) ? dl.body.toString("utf8") : String(dl.body)).toBe("hello-drawing");
    expect(dl.headers["x-content-type-options"]).toBe("nosniff");

    const del = await call("DELETE", `/api/job-orders/${id}/attachments/${attachments[0].id}`);
    expect(del.statusCode, JSON.stringify(del.body)).toBe(200);
    expect((del.body as { jobOrder: { attachments: unknown[] } }).jobOrder.attachments).toHaveLength(0);
  });

  it("refuses a download without the right key", async () => {
    const id = await createJobOrder();
    const up = await call("POST", `/api/job-orders/${id}/attachments`, {
      fileName: "a.txt", contentType: "text/plain", dataBase64: b64("secret"),
    });
    const a = (up.body as { jobOrder: { attachments: { id: string; url: string }[] } }).jobOrder.attachments[0];
    const noKey = await call("GET", `/api/job-orders/${id}/attachments/${a.id}/download`);
    expect(noKey.statusCode, "ไม่มี key ต้อง 404").toBe(404);
    const wrongKey = await call("GET", `/api/job-orders/${id}/attachments/${a.id}/download?key=not-the-key`);
    expect(wrongKey.statusCode, "key ผิดต้อง 404").toBe(404);
  });

  it("serves a script-capable type as a plain download, never inline", async () => {
    const id = await createJobOrder();
    const up = await call("POST", `/api/job-orders/${id}/attachments`, {
      fileName: "evil.html", contentType: "text/html", dataBase64: b64("<script>alert(1)</script>"),
    });
    const a = (up.body as { jobOrder: { attachments: { url: string }[] } }).jobOrder.attachments[0];
    const dl = await call("GET", a.url);
    expect(dl.statusCode).toBe(200);
    expect(dl.headers["content-type"], "HTML ต้องไม่ถูกส่งกลับเป็น text/html").toBe("application/octet-stream");
    expect(dl.headers["content-disposition"]).toContain("attachment;");
  });

  it("rejects a base64 payload with invalid characters instead of storing it truncated", async () => {
    const id = await createJobOrder();
    const res = await call("POST", `/api/job-orders/${id}/attachments`, {
      fileName: "broken.bin", contentType: "application/octet-stream", dataBase64: "not valid base64!!",
    });
    expect(res.statusCode).toBe(400);
  });

  it("enforces the per-document file cap", async () => {
    const id = await createJobOrder();
    for (let i = 0; i < 5; i++) {
      const ok = await call("POST", `/api/job-orders/${id}/attachments`, {
        fileName: `f${i}.txt`, contentType: "text/plain", dataBase64: b64(`file-${i}`),
      });
      expect(ok.statusCode, `ไฟล์ที่ ${i + 1} ควรแนบได้: ${JSON.stringify(ok.body)}`).toBe(200);
    }
    const sixth = await call("POST", `/api/job-orders/${id}/attachments`, {
      fileName: "f5.txt", contentType: "text/plain", dataBase64: b64("one-too-many"),
    });
    expect(sixth.statusCode, "ไฟล์ที่หกต้องถูกปฏิเสธ").toBe(400);
  });
});

describe("Material Requisition rewrite", () => {
  /**
   * จุดที่พังเงียบที่สุดของ Rewrite ใบเบิก: ฉบับใหม่มี `_id` ใหม่ ถ้าไม่ย้ายลิงก์ `ProjectItem`
   * มาชี้ฉบับใหม่ หน้าโครงการจะยังชี้ฉบับเก่าตลอดไป แล้วผู้ใช้กดจากโครงการเข้าไปเจอใบที่เลิกใช้แล้ว
   * — ไม่มีอะไรฟ้อง ไม่ error ทั้ง tsc/lint/build จึงต้องมีเทสต์คุมไว้
   */
  it("moves the ProjectItem link onto the new revision", async () => {
    const project = await createProject();
    const itemId = project.items[0].id;
    const created = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId });
    expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
    const source = (created.body as { materialRequisition: { id: string } }).materialRequisition;

    const rewritten = await call("POST", `/api/material-requisitions/${source.id}/rewrite`);
    expect(rewritten.statusCode, JSON.stringify(rewritten.body)).toBe(201);
    const rev = (rewritten.body as { materialRequisition: { id: string; status: string; revisionNote: string } }).materialRequisition;
    expect(rev.id).toBe(`${source.id}-R1`);
    expect(rev.status).toBe("Draft");
    expect(rev.revisionNote).toBe("");

    const after = await call("GET", `/api/projects/${project.id}`);
    const item = (after.body as { project: ProjectJson }).project.items.find((it) => it.id === itemId)!;
    expect(item.materialRequisitionId, "โครงการต้องชี้ฉบับแก้ไขใหม่ ไม่ใช่ฉบับเดิม").toBe(rev.id);
    expect(item.sourcingMethod).toBe("requisition");
    expect(item.itemStatus).toBe("documentCreated");
  });

  /** ยอดเบิก/ยอดคืนไม่สืบทอด — ฉบับใหม่ต้องเริ่มเหมือนใบที่ยังไม่ได้เบิกจริง */
  it("does not inherit withdrawal or return quantities", async () => {
    const project = await createProject();
    const created = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId: project.items[0].id });
    const source = (created.body as { materialRequisition: { id: string; lines: unknown[] } }).materialRequisition;
    // ใบเบิกบังคับว่าทุกบรรทัดต้องอ้างสินค้าจริงในคลัง — ใส่สินค้าทดสอบลงฐานข้อมูลตรง ๆ
    const productId = (await client.db("tcs_erp").collection("products").insertOne({
      code: "RW-TEST-01", name: "สินค้าทดสอบ Rewrite", categoryId: "", unit: "ชิ้น",
      defaultPrice: 0, description: "", specifications: [], archived: false, stockQty: 0,
      createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
    })).insertedId.toString();
    await call("PATCH", `/api/material-requisitions/${source.id}`, {
      lines: [{ productId, category: "other", plannedQty: 10, withdrawal1Qty: 4, returnQty: 1, actualUsedQty: 3 }],
    });

    const rewritten = await call("POST", `/api/material-requisitions/${source.id}/rewrite`);
    const lines = (rewritten.body as { materialRequisition: { lines: { plannedQty: number | null; withdrawal1Qty: number | null; returnQty: number | null }[] } }).materialRequisition.lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].plannedQty, "จำนวนที่วางแผนไว้ยังอยู่").toBe(10);
    expect(lines[0].withdrawal1Qty, "ยอดเบิกต้องล้าง").toBeNull();
    expect(lines[0].returnQty, "ยอดคืนต้องล้าง").toBeNull();
  });
});

describe("Material Requisition / Purchase Request are separated by owning department", () => {
  /**
   * ใบเบิก/ใบขอซื้อของฝ่ายผลิตออกจากใบสั่งผลิตที่ "อนุมัติแล้ว" เท่านั้น จึงต้องเดินขั้นตอนจริงให้ครบ
   * (ร่าง → รออนุมัติ → อนุมัติ) แทนที่จะยัดสถานะลงฐานข้อมูลตรง ๆ — จะได้ทดสอบเส้นทางที่ผู้ใช้เดินจริง
   */
  async function createApprovedProductionOrder(): Promise<string> {
    const po = await call("POST", "/api/production-orders", { scopeOfWorkId });
    expect(po.statusCode, JSON.stringify(po.body)).toBe(201);
    const poId = (po.body as { productionOrder: { id: string } }).productionOrder.id;
    await call("POST", `/api/production-orders/${poId}/submit-approval`);
    const approved = await call("POST", `/api/production-orders/${poId}/approve`);
    expect(approved.statusCode, JSON.stringify(approved.body)).toBe(200);
    return poId;
  }

  it("raises a requisition from a production order that is still a draft", async () => {
    // เดิมปฏิเสธ 400 ตั้งแต่ 2026-08-20 ("A Draft order must not be able to spend materials")
    // เจ้าของสั่งปลดเมื่อ 2026-08-27 เพื่อให้ฝ่ายผลิตเบิกของตั้งแต่ยังไม่อนุมัติได้
    const po = await call("POST", "/api/production-orders", { scopeOfWorkId });
    const poId = (po.body as { productionOrder: { id: string } }).productionOrder.id;
    const mr = await call("POST", "/api/material-requisitions", { productionOrderId: poId });
    expect(mr.statusCode, JSON.stringify(mr.body)).toBe(201);
  });

  it("a production-owned requisition is invisible to the project list and vice versa, and legacy rows stay with Project", async () => {
    const db = client.db("tcs_erp");

    // ของฝ่ายโครงการ (ผ่านรายการในโครงการตามปกติ)
    const project = await createProject();
    const projectMr = await call("POST", "/api/material-requisitions", { projectId: project.id, itemId: project.items[0].id });
    expect(projectMr.statusCode, JSON.stringify(projectMr.body)).toBe(201);
    const projectMrId = (projectMr.body as { materialRequisition: { id: string } }).materialRequisition.id;

    // ของฝ่ายผลิต (ออกจากใบสั่งผลิตที่อนุมัติแล้ว)
    const poId = await createApprovedProductionOrder();
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
    const poId = await createApprovedProductionOrder();
    const res = await call("POST", "/api/purchase-requests", { productionOrderId: poId });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const doc = (res.body as { purchaseRequest: { ownerDepartment: string; productionOrderId: string } }).purchaseRequest;
    expect(doc.ownerDepartment).toBe("production");
    expect(doc.productionOrderId).toBe(poId);
  });
});
