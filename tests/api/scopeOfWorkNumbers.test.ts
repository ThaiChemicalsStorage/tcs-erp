import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * เลขใบเสนอราคา/เลข PO หลายเลขต่อหนึ่ง Scope of Work (2026-08-31)
 *
 * เจ้าของเจองานจริงที่ใบเดียวกินสองใบเสนอราคาและสอง PO · เก็บเป็น "เลขหลัก + รายการเพิ่มเติม"
 * แทนที่จะเปลี่ยนช่องเดิมเป็นอาร์เรย์ ซึ่งดูสะอาดกว่าแต่พังเงียบ ๆ สามที่ (ดู MODULES/ScopeOfWork.md)
 *
 * เทสต์ชุดนี้ตรึงพฤติกรรมฝั่งเซิร์ฟเวอร์ที่พังแล้วจะไม่มีอะไรฟ้อง:
 *  - เอกสารที่บันทึกไว้**ก่อน**มีฟิลด์นี้ต้องอ่านออกมาเป็น `[]` ไม่ใช่ `undefined` (ไม่มี migration
 *    หน้าจอที่เผลอ `.map()` ทับ `undefined` = จอขาวทั้งหน้า เคยเกิดมาแล้วกับ `toListItem()`)
 *  - เลข PO เพิ่มเติมต้องแก้ได้แม้เอกสารอนุมัติแล้ว (อยู่ใน `FOLLOW_UP_FIELDS`) แต่เลขใบเสนอราคา
 *    เพิ่มเติม**ต้องแก้ไม่ได้** — เป็นเนื้อหาเอกสาร ไม่ใช่ข้อมูลติดตามผล
 *  - ปุ่มทวง PO ต้องนับเลขเพิ่มเติมด้วย ไม่งั้นใบที่มี PO แล้วยังโดนทวงอยู่
 *  - "อัปเดตข้อมูลจากใบเสนอราคา" ต้อง**ไม่ลบ**เลขที่คนพิมพ์เพิ่มเอง
 */

const PASSWORD = "TestPassw0rd!";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let quotesHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;

let cookie = "";

interface CapturedResponse { statusCode: number; body: unknown; headers: Record<string, string> }

function makeReqRes(method: string, url: string, body: unknown, reqCookie: string) {
  const captured: CapturedResponse = { statusCode: 0, body: undefined, headers: {} };
  const query = Object.fromEntries(new URLSearchParams(url.split("?")[1] ?? ""));
  const req = {
    method, url, body, query,
    headers: { "x-forwarded-for": "10.0.0.1", cookie: reqCookie },
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
  const { req, res, captured } = makeReqRes(method, url, body, cookie);
  await quotesHandler(req, res);
  return captured;
}

const scopeOf = (body: unknown) => (body as { scopeOfWork: Record<string, unknown> }).scopeOfWork;

/** ใบเสนอราคาขั้นต่ำที่ `POST /api/scope-of-works` ต้องการ */
async function insertQuote(id: string, poRef: string): Promise<void> {
  await db.collection("quotes").insertOne({
    _id: id, customerName: "Test Co.", contactName: "", contactPhone: "", contactEmail: "",
    address: "", taxId: "", deliveryMethod: "", deliveryAddress: "", project: "", poRef,
    paymentTerms: "ชำระภายใน 30 วัน", issueDate: "2026-08-31", expiryDate: "", salesperson: "",
    jobTypeCode: "LI", jobTypeName: "FRP Lining", lines: [], remarks: "", revisionNote: "",
    status: "อนุมัติแล้ว", amount: 0, discount: 0, discountMode: "percent", vat: 0,
    approvalHistory: [], isPotentialOpportunity: false, followUpDate: "", interest: "",
    createdAt: "", updatedAt: "", createdBy: "", updatedBy: "", isDeleted: false,
  } as never);
}

/** สร้าง Scope of Work ผ่าน API จริง แล้วคืน id */
async function createScope(quotationId: string, scopeNumber: string): Promise<string> {
  const created = await call("POST", "/api/scope-of-works", { quotationId, scopeNumber });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
  return (scopeOf(created.body) as { id: string }).id;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  db = client.db("tcs_erp");
  authHandler = (await import("../../api/handlers/auth.js")).default;
  quotesHandler = (await import("../../api/handlers/quotes.js")).default;

  const setup = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Sales Person", username: "sales", email: "sales@test.local", password: PASSWORD,
  }, "");
  await authHandler(setup.req, setup.res);
  expect(setup.captured.statusCode).toBe(201);
  cookie = setup.captured.headers["set-cookie"].split(";")[0];
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("Scope of Work — เลขใบเสนอราคา/เลข PO หลายเลข", () => {
  it("ใบที่สร้างใหม่มีทั้งสองฟิลด์เป็นรายการว่าง ไม่ใช่ undefined", async () => {
    await insertQuote("Q-NEW-01", "PO-FIRST");
    const id = await createScope("Q-NEW-01", "SOW-NEW-01");
    const loaded = await call("GET", `/api/scope-of-works/${id}`);
    expect(loaded.statusCode).toBe(200);
    expect(scopeOf(loaded.body).customerPoNumber).toBe("PO-FIRST");
    expect(scopeOf(loaded.body).additionalPoNumbers).toEqual([]);
    expect(scopeOf(loaded.body).additionalQuotationNumbers).toEqual([]);
  });

  it("บันทึกเลขเพิ่มเติมแล้วอ่านกลับได้ครบ ตามลำดับเดิม", async () => {
    await insertQuote("Q-SAVE-01", "PO-A");
    const id = await createScope("Q-SAVE-01", "SOW-SAVE-01");
    const saved = await call("PATCH", `/api/scope-of-works/${id}`, {
      additionalPoNumbers: ["PO-B", "PO-C"],
      additionalQuotationNumbers: ["Q-OTHER-01"],
    });
    expect(saved.statusCode, JSON.stringify(saved.body)).toBe(200);
    expect(scopeOf(saved.body).additionalPoNumbers).toEqual(["PO-B", "PO-C"]);
    expect(scopeOf(saved.body).additionalQuotationNumbers).toEqual(["Q-OTHER-01"]);

    const reloaded = await call("GET", `/api/scope-of-works/${id}`);
    expect(scopeOf(reloaded.body).additionalPoNumbers).toEqual(["PO-B", "PO-C"]);
  });

  it("แถวว่างที่เกิดจากการกด \"เพิ่ม\" แล้วไม่พิมพ์อะไร ไม่ถูกเก็บ", async () => {
    await insertQuote("Q-BLANK-01", "PO-A");
    const id = await createScope("Q-BLANK-01", "SOW-BLANK-01");
    const saved = await call("PATCH", `/api/scope-of-works/${id}`, {
      additionalPoNumbers: ["  PO-B  ", "", "   "],
    });
    expect(saved.statusCode).toBe(200);
    expect(scopeOf(saved.body).additionalPoNumbers).toEqual(["PO-B"]);
  });

  it("ส่งเลขเกินเพดาน 10 เลข ถูกปฏิเสธด้วย 400 ไม่ใช่เก็บไว้ทั้งหมด", async () => {
    await insertQuote("Q-CAP-01", "");
    const id = await createScope("Q-CAP-01", "SOW-CAP-01");
    const rejected = await call("PATCH", `/api/scope-of-works/${id}`, {
      additionalPoNumbers: Array.from({ length: 11 }, (_, i) => `PO-${i}`),
    });
    expect(rejected.statusCode).toBe(400);
  });

  it("เอกสารเก่าที่ไม่มีฟิลด์นี้ในฐานข้อมูลเลย อ่านออกมาเป็น [] ทั้งใน GET และหน้ารายการ", async () => {
    // เขียนตรงเข้า MongoDB โดยไม่ผ่าน API เพื่อจำลองเอกสารที่บันทึกไว้ก่อน 2026-08-31 จริง ๆ
    const legacy = await db.collection("scope_of_works").insertOne({
      scopeNumber: "SOW-LEGACY-01", yearMonth: "", jobSequence: 0, secondaryCode: "",
      quotationId: "Q-LEGACY-01", quotationNumber: "Q-LEGACY-01", jobTypeCode: "LI", jobTypeName: "FRP Lining",
      quotationSalesperson: "", issueDate: "2026-08-01", deliveryDate: "", drawingCode: "",
      customerPoNumber: "PO-LEGACY",
      customerSnapshot: { companyName: "Legacy Co.", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" },
      deliveryLocation: "", shippingContact: "", shippingPhone: "", billingContact: "", billingPhone: "",
      checklistGroups: [], items: [],
      paymentConditions: { installments: [], description: "", notes: "" },
      documentRecipients: {}, documentRecipientMessage: "", revisionNote: "", remarks: "",
      seller: { name: "", userId: "", date: "" }, approver: { name: "", userId: "", date: "" },
      attachments: [], status: "Draft", version: 1,
      createdAt: "", updatedAt: "", createdBy: "", updatedBy: "", isDeleted: false,
    } as never);
    const legacyId = legacy.insertedId.toString();

    const loaded = await call("GET", `/api/scope-of-works/${legacyId}`);
    expect(loaded.statusCode).toBe(200);
    expect(scopeOf(loaded.body).additionalPoNumbers).toEqual([]);
    expect(scopeOf(loaded.body).additionalQuotationNumbers).toEqual([]);

    const listed = await call("GET", "/api/scope-of-works");
    expect(listed.statusCode).toBe(200);
    const row = (listed.body as { scopeOfWorks: Record<string, unknown>[] }).scopeOfWorks
      .find((s) => s.id === legacyId);
    expect(row?.additionalPoNumbers).toEqual([]);
    expect(row?.additionalQuotationNumbers).toEqual([]);
  });

  it("\"อัปเดตข้อมูลจากใบเสนอราคา\" ไม่ลบเลขที่พิมพ์เพิ่มเอง (ปุ่มนี้ไม่ได้ชื่อว่าลบ)", async () => {
    await insertQuote("Q-REFRESH-01", "PO-FROM-QUOTE");
    const id = await createScope("Q-REFRESH-01", "SOW-REFRESH-01");
    await call("PATCH", `/api/scope-of-works/${id}`, {
      additionalPoNumbers: ["PO-TYPED-BY-HAND"],
      additionalQuotationNumbers: ["Q-TYPED-BY-HAND"],
    });

    const refreshed = await call("POST", `/api/scope-of-works/${id}/refresh`);
    expect(refreshed.statusCode, JSON.stringify(refreshed.body)).toBe(200);
    expect(scopeOf(refreshed.body).additionalPoNumbers).toEqual(["PO-TYPED-BY-HAND"]);
    expect(scopeOf(refreshed.body).additionalQuotationNumbers).toEqual(["Q-TYPED-BY-HAND"]);
    // เลขหลักยังถูกดึงใหม่จากใบเสนอราคาเหมือนเดิม
    expect(scopeOf(refreshed.body).customerPoNumber).toBe("PO-FROM-QUOTE");
  });

  it("ปุ่มทวง PO ถูกปฏิเสธเมื่อมีเพียงเลขเพิ่มเติม — ใบนั้นมี PO แล้ว", async () => {
    await insertQuote("Q-CHASE-01", "");
    const id = await createScope("Q-CHASE-01", "SOW-CHASE-01");
    // ยังไม่มีเลขไหนเลย → ทวงได้ (ผ่านด่านนี้ไป แม้จะไปตกที่ขั้นหาพนักงานขายทีหลังก็ตาม)
    const noneYet = await call("POST", `/api/scope-of-works/${id}/chase-po`);
    expect(noneYet.statusCode).not.toBe(400);

    await call("PATCH", `/api/scope-of-works/${id}`, { additionalPoNumbers: ["PO-ONLY-EXTRA"] });
    const blocked = await call("POST", `/api/scope-of-works/${id}/chase-po`);
    expect(blocked.statusCode).toBe(400);
    expect(String((blocked.body as { error?: string }).error)).toContain("PO-ONLY-EXTRA");
  });

  it("เอกสารที่อนุมัติแล้ว: เลข PO เพิ่มเติมยังบันทึกได้ แต่เลขใบเสนอราคาเพิ่มเติมถูกล็อก", async () => {
    await insertQuote("Q-FINAL-01", "");
    const id = await createScope("Q-FINAL-01", "SOW-FINAL-01");
    await db.collection("scope_of_works").updateOne(
      { scopeNumber: "SOW-FINAL-01" },
      { $set: { status: "Final" } },
    );

    const poSaved = await call("PATCH", `/api/scope-of-works/${id}`, { additionalPoNumbers: ["PO-AFTER-APPROVAL"] });
    expect(poSaved.statusCode, JSON.stringify(poSaved.body)).toBe(200);
    expect(scopeOf(poSaved.body).additionalPoNumbers).toEqual(["PO-AFTER-APPROVAL"]);

    const quotationBlocked = await call("PATCH", `/api/scope-of-works/${id}`, { additionalQuotationNumbers: ["Q-TOO-LATE"] });
    expect(quotationBlocked.statusCode).toBe(400);
  });
});
