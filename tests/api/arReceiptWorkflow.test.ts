import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Integration test for the RE (ใบเสร็จรับเงิน) workflow transitions added 2026-08-18 — issuing a
 * receipt against a non-deposit milestone closes it ("จบ"), cancelling that receipt reopens it, and
 * the same routes must survive a receipt whose principal is a MANUAL tax invoice, which has no
 * Scope of Work / milestone at all (`scopeOfWorkId`/`milestoneId` are both `""`, and
 * `toObjectId("")` throws). Runs the real handler (api/handlers/quotes.ts -> arHandler.ts) against
 * a throwaway in-memory MongoDB, same `makeReqRes()` pattern tests/api/projectAtomicity.test.ts
 * established. docs/CLAUDE.md standing rule 8: workflow transitions get a test in the same task.
 */

const PASSWORD = "correct-horse-1";
let mongod: MongoMemoryServer;
let client: MongoClient;
let quotesHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let sessionCookie = "";

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

async function call(method: string, url: string, body?: unknown): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes(method, url, body);
  await quotesHandler(req, res);
  return captured;
}

/** A minimal already-issued tax invoice, inserted directly — the milestone-billing chain that
 * normally produces one isn't what these transitions are about. */
function taxInvoiceFixture(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    scopeOfWorkId: "", milestoneId: "", docType: "IV", docNo: "IV6908001",
    docDate: "2026-08-18", dueDate: "2026-08-18", paymentType: "",
    customerSnapshot: { companyName: "Test Co.", address: "", taxId: "", branch: "", contactName: "", phone: "", email: "" },
    reference: "", lines: [{ seq: 1, description: "งานทดสอบ", qty: 1, unit: "งาน", unitPrice: 100, amount: 100 }],
    subtotal: 100, discount: 0, valueAmount: 100, vatRate: 7, vatAmount: 7, netTotal: 107,
    amountTextTh: "", remarks: [], stockDeducted: false, isManual: false, status: "issued",
    createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z", createdBy: "", updatedBy: "",
    ...overrides,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  const authHandler = (await import("../../api/handlers/auth.js")).default;
  quotesHandler = (await import("../../api/handlers/quotes.js")).default;

  // Setup Wizard creates the one Super Admin, who holds every permission implicitly.
  const { req, res, captured } = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: PASSWORD,
  });
  await authHandler(req, res);
  expect(captured.statusCode).toBe(201);
  sessionCookie = captured.headers["set-cookie"].split(";")[0];
});

beforeEach(async () => {
  const db = client.db("tcs_erp");
  await db.collection("ar_documents").deleteMany({});
  await db.collection("ar_milestones").deleteMany({});
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("RE issue/cancel <-> milestone billingStatus", () => {
  it("issuing a receipt for a non-deposit milestone closes it, and cancelling that receipt reopens it", async () => {
    const db = client.db("tcs_erp");
    const milestoneId = new ObjectId();
    await db.collection("ar_milestones").insertOne({
      _id: milestoneId, scopeOfWorkId: "sow-1", installmentId: "pi-1", isDownPayment: false,
      billingStatus: "work_open", checklistState: {}, attachmentIds: [],
      pct: 100, label: "After Job Complete", paymentType: "Credit", days: 30,
      totalContractValueExVat: 100, workClassification: "goods",
      createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
    });
    const invoice = await db.collection("ar_documents").insertOne(
      taxInvoiceFixture({ scopeOfWorkId: "sow-1", milestoneId: milestoneId.toString() }),
    );

    const issued = await call("POST", `/api/ar-documents/${invoice.insertedId.toString()}/receipt`);
    expect(issued.statusCode, JSON.stringify(issued.body)).toBe(201);
    const receipt = (issued.body as { document: { id: string; docNo: string; netTotal: number } }).document;
    expect(receipt.docNo).toMatch(/^RE\d{7}$/);
    expect(receipt.netTotal, "the receipt records the VAT-inclusive amount received").toBe(107);
    expect((await db.collection("ar_milestones").findOne({ _id: milestoneId }))?.billingStatus).toBe("closed");

    const cancelled = await call("POST", `/api/ar-documents/${receipt.id}/cancel`, { reason: "ออกผิด" });
    expect(cancelled.statusCode, JSON.stringify(cancelled.body)).toBe(200);
    expect(
      (await db.collection("ar_milestones").findOne({ _id: milestoneId }))?.billingStatus,
      "the job must not stay 'จบ' with no active receipt backing it",
    ).toBe("work_open");
  });

  it("a deposit milestone stays 'billed' — only the final milestone is closed by its receipt", async () => {
    const db = client.db("tcs_erp");
    const milestoneId = new ObjectId();
    await db.collection("ar_milestones").insertOne({
      _id: milestoneId, scopeOfWorkId: "sow-2", installmentId: "pi-1", isDownPayment: true,
      billingStatus: "billed", checklistState: {}, attachmentIds: [],
      pct: 40, label: "Down Payment", paymentType: "Cash", days: null,
      totalContractValueExVat: 100, workClassification: "goods",
      createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
    });
    const invoice = await db.collection("ar_documents").insertOne(
      taxInvoiceFixture({ docType: "AR", docNo: "AR6908001", scopeOfWorkId: "sow-2", milestoneId: milestoneId.toString() }),
    );

    expect((await call("POST", `/api/ar-documents/${invoice.insertedId.toString()}/receipt`)).statusCode).toBe(201);
    expect((await db.collection("ar_milestones").findOne({ _id: milestoneId }))?.billingStatus).toBe("billed");
  });

  it("a receipt for a MANUAL invoice (no Scope of Work/milestone) issues and cancels cleanly", async () => {
    const db = client.db("tcs_erp");
    // scopeOfWorkId/milestoneId are both "" — toObjectId("") throws, so every milestone lookup on
    // these two routes has to be skipped entirely rather than erroring the request out.
    const invoice = await db.collection("ar_documents").insertOne(taxInvoiceFixture({ isManual: true }));

    const issued = await call("POST", `/api/ar-documents/${invoice.insertedId.toString()}/receipt`);
    expect(issued.statusCode, JSON.stringify(issued.body)).toBe(201);
    const receipt = (issued.body as { document: { id: string; isManual: boolean } }).document;
    expect(receipt.isManual, "the receipt inherits its principal's manual flag").toBe(true);

    const cancelled = await call("POST", `/api/ar-documents/${receipt.id}/cancel`, { reason: "ออกผิด" });
    expect(cancelled.statusCode, JSON.stringify(cancelled.body)).toBe(200);
    expect((cancelled.body as { document: { status: string } }).document.status).toBe("cancelled");
  });

  it("refuses a second receipt while the first is still active, and allows one again after it's cancelled", async () => {
    const db = client.db("tcs_erp");
    const invoice = await db.collection("ar_documents").insertOne(taxInvoiceFixture({}));
    const invoiceId = invoice.insertedId.toString();

    const first = await call("POST", `/api/ar-documents/${invoiceId}/receipt`);
    expect(first.statusCode).toBe(201);
    expect((await call("POST", `/api/ar-documents/${invoiceId}/receipt`)).statusCode).toBe(400);

    const firstId = (first.body as { document: { id: string } }).document.id;
    expect((await call("POST", `/api/ar-documents/${firstId}/cancel`, { reason: "ออกผิด" })).statusCode).toBe(200);
    expect(
      (await call("POST", `/api/ar-documents/${invoiceId}/receipt`)).statusCode,
      "a cancelled receipt must not keep blocking a re-issue",
    ).toBe(201);
  });

  it("refuses a receipt against a BI, an RE, or a cancelled invoice", async () => {
    const db = client.db("tcs_erp");
    const bi = await db.collection("ar_documents").insertOne(taxInvoiceFixture({ docType: "BI", docNo: "BI6908001" }));
    const cancelledInvoice = await db.collection("ar_documents").insertOne(
      taxInvoiceFixture({ docNo: "IV6908009", status: "cancelled" }),
    );

    expect((await call("POST", `/api/ar-documents/${bi.insertedId.toString()}/receipt`)).statusCode).toBe(400);
    expect((await call("POST", `/api/ar-documents/${cancelledInvoice.insertedId.toString()}/receipt`)).statusCode).toBe(400);
  });
});

/**
 * งวดมัดจำไม่ต้องแนบใบส่งมอบงาน — Flow การทำงานของบัญชี-รับ เคสที่ 1 ออกบิลมัดจำได้ทันทีหลังได้ Scope of
 * Work จากฝ่ายขาย ยังไม่มีการส่งมอบให้ลูกค้าเซ็นรับ ส่วนเคสงานฝ่ายผลิต/ฝ่ายโครงการยังบังคับเหมือนเดิม
 *
 * `checklistIsComplete()` runs before `loadScopeOrThrow()`, so these assert on WHICH error comes
 * back rather than on a full successful issue: the deposit case must get past the checklist gate
 * (failing later on the deliberately-absent Scope of Work), while the non-deposit case must still
 * be stopped by the gate itself. That distinction is exactly the rule under test.
 */
describe("deposit milestones are exempt from the signed-delivery-note checklist item", () => {
  const milestoneFixture = (isDownPayment: boolean) => ({
    scopeOfWorkId: "sow-missing-on-purpose", installmentId: "pi-1", isDownPayment,
    pct: 30, label: isDownPayment ? "Down Payment" : "Final", paymentType: "Cash", days: null,
    totalContractValueExVat: 100000, workClassification: "goods" as const, retentionPct: 0,
    // สำเนา PO ติ๊กแล้ว แต่ใบส่งมอบงานยังไม่ได้ติ๊ก — จุดต่างที่การทดสอบนี้สนใจ
    checklistState: { poCopy: true, deliveryNote: false },
    attachmentIds: [], billingStatus: "not_billed" as const,
    createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z", createdBy: "", updatedBy: "",
  });

  it("lets a deposit milestone past the checklist gate without a signed delivery note", async () => {
    const db = client.db("tcs_erp");
    const { insertedId } = await db.collection("ar_milestones").insertOne(milestoneFixture(true));
    const result = await call("POST", "/api/ar-documents", { milestoneId: insertedId.toString() });
    expect((result.body as { code?: string }).code, "must not be blocked by the checklist").not.toBe("CHECKLIST_INCOMPLETE");
  });

  it("still blocks a non-deposit milestone that has no signed delivery note", async () => {
    const db = client.db("tcs_erp");
    const { insertedId } = await db.collection("ar_milestones").insertOne(milestoneFixture(false));
    const result = await call("POST", "/api/ar-documents", { milestoneId: insertedId.toString() });
    expect(result.statusCode).toBe(400);
    expect((result.body as { code?: string }).code).toBe("CHECKLIST_INCOMPLETE");
  });
});
