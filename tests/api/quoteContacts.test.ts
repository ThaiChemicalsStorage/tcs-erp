import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * ผู้ติดต่อหลายคนในใบเสนอราคา — ฝั่งเซิร์ฟเวอร์ (2026-09-07)
 *
 * สิ่งที่ตรึงไว้ เพราะพลาดแล้วจะไม่มีอะไรฟ้อง:
 *  1. สามช่องเดิม `contactName/contactPhone/contactEmail` และ `customerSnapshot` ต้องเท่ากับ `contacts[0]` เสมอ
 *     ไม่ว่าคำขอจะส่ง `contacts` มาหรือส่งแค่สามช่องเดิมแบบ client เก่า
 *  2. PATCH สามช่องเดิมบนใบที่มี `contacts` ต้องแก้ `contacts[0]` ตาม ไม่ปล่อยให้สองที่เห็นคนละคน
 *  3. ใบเก่าที่ไม่มี key `contacts` ต้องไม่ถูกยัด `contacts` เข้ามาเพราะแก้ช่องอื่น (ไม่มี migration แอบแฝง)
 *  4. เพดาน 10 คน · แถวว่างถูกตัด · Duplicate ได้ id ใหม่ทุกแถว
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

type Contact = { id: string; name: string; position: string; phone: string; email: string };
type QuoteOut = {
  id: string; contactName: string; contactPhone: string; contactEmail: string; contacts?: Contact[];
  customerSnapshot?: { contactName: string; phone: string; email: string };
};
const quoteOf = (body: unknown) => (body as { quote: QuoteOut }).quote;

const A = { name: "คุณเอ", position: "จัดซื้อ", phone: "081-000-0001", email: "a@cust.co.th" };
const B = { name: "คุณบี", position: "วิศวกร", phone: "081-000-0002", email: "b@cust.co.th" };

async function createQuote(extra: Record<string, unknown>): Promise<QuoteOut> {
  const res = await call("POST", "/api/quotes", { client: "ลูกค้าทดสอบ", jobTypeCode: "LI", lines: [], discount: 0, ...extra });
  expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  return quoteOf(res.body);
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

  // POST /api/quotes บังคับประเภทงานที่มีจริงในทะเบียน — Setup Wizard seed ประเภทงานตั้งต้นให้แล้ว
  // (มี "LI" อยู่) จึง upsert แทน insert กันชน unique index
  await db.collection("job_types").updateOne(
    { code: "LI" },
    { $setOnInsert: { code: "LI", name: "FRP Lining", isActive: true, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" } },
    { upsert: true },
  );
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("POST /api/quotes — รับ contacts[] และกระจกสามช่องเดิม", () => {
  it("ส่ง contacts สองคน → สามช่องเดิมและ snapshot เท่ากับคนแรก ทุกแถวมี id", async () => {
    const q = await createQuote({ contacts: [A, B] });
    expect(q.contacts).toHaveLength(2);
    expect(q.contacts?.every((c) => typeof c.id === "string" && c.id.length > 0)).toBe(true);
    expect(q.contacts?.[1]).toMatchObject(B);
    expect(q).toMatchObject({ contactName: A.name, contactPhone: A.phone, contactEmail: A.email });
    expect(q.customerSnapshot).toMatchObject({ contactName: A.name, phone: A.phone, email: A.email });
  });

  it("client เก่าส่งแค่สามช่องเดิม → contacts มีคนเดียวเท่ากับสามช่องนั้น", async () => {
    const q = await createQuote({ contactName: "คุณซี", contactPhone: "02-111", contactEmail: "c@x.com" });
    expect(q.contacts).toHaveLength(1);
    expect(q.contacts?.[0]).toMatchObject({ name: "คุณซี", phone: "02-111", email: "c@x.com", position: "" });
    expect(q.contactName).toBe("คุณซี");
  });

  it("ไม่ส่งอะไรเลย → contacts ว่างและสามช่องว่าง", async () => {
    const q = await createQuote({});
    expect(q.contacts).toEqual([]);
    expect(q.contactName).toBe("");
  });

  it("เกิน 10 คน → 400 · แถวว่างถูกตัดเงียบ ๆ", async () => {
    const tooMany = await call("POST", "/api/quotes", {
      client: "x", jobTypeCode: "LI", lines: [], discount: 0,
      contacts: Array.from({ length: 11 }, (_, i) => ({ ...A, name: `p${i}` })),
    });
    expect(tooMany.statusCode).toBe(400);
    const q = await createQuote({ contacts: [{ name: "", position: "", phone: "", email: "" }, B] });
    expect(q.contacts?.map((c) => c.name)).toEqual([B.name]);
    expect(q.contactName).toBe(B.name);
  });

  it("contacts ไม่ใช่ array → 400", async () => {
    const res = await call("POST", "/api/quotes", { client: "x", jobTypeCode: "LI", lines: [], discount: 0, contacts: "นาย ก" });
    expect(res.statusCode).toBe(400);
  });
});

describe("PATCH /api/quotes/:id — กระจกทั้งสองทิศ", () => {
  it("PATCH contactName บนใบที่มี contacts → contacts[0] เปลี่ยนตาม แถวอื่นอยู่ครบ snapshot ตาม", async () => {
    const q = await createQuote({ contacts: [A, B] });
    const res = await call("PATCH", `/api/quotes/${q.id}`, { contactName: "คุณเอ (แก้)" });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const after = quoteOf(res.body);
    expect(after.contacts?.[0]).toMatchObject({ name: "คุณเอ (แก้)", phone: A.phone, position: A.position });
    expect(after.contacts?.[1]).toMatchObject(B);
    expect(after.customerSnapshot?.contactName).toBe("คุณเอ (แก้)");
  });

  it("PATCH contacts: [] → สามช่องเดิมว่าง snapshot ว่าง", async () => {
    const q = await createQuote({ contacts: [A] });
    const res = await call("PATCH", `/api/quotes/${q.id}`, { contacts: [] });
    expect(res.statusCode).toBe(200);
    const after = quoteOf(res.body);
    expect(after.contacts).toEqual([]);
    expect(after).toMatchObject({ contactName: "", contactPhone: "", contactEmail: "" });
    expect(after.customerSnapshot?.contactName).toBe("");
  });

  it("PATCH contacts พร้อมสามช่องเดิมที่ขัดกัน → เชื่อ contacts", async () => {
    const q = await createQuote({ contacts: [A] });
    const res = await call("PATCH", `/api/quotes/${q.id}`, { contacts: [B], contactName: "ชื่อปลอม" });
    expect(res.statusCode).toBe(200);
    expect(quoteOf(res.body).contactName).toBe(B.name);
  });

  it("ใบเก่าที่ไม่มี key contacts → PATCH ช่องอื่นไม่ยัด contacts เข้ามา สามช่องเดิมคงอยู่", async () => {
    await db.collection("quotes").insertOne({
      _id: "QT-LEGACY-01", client: "เก่า", date: "", valid: "", amount: 0, status: "ร่าง", salesperson: "", interest: null,
      lines: [], discount: 0, contactName: "คุณเก่า", contactPhone: "02-000", contactEmail: "old@x.com",
      address: "", taxId: "", deliveryMethod: "", deliveryAddress: "", project: "", poRef: "", paymentTerms: "",
      issueDate: "", expiryDate: "", remarks: "", revisionNote: "", jobTypeCode: "LI", jobTypeName: "FRP Lining",
      isPotentialOpportunity: false, followUpDate: "", createdByUserId: "", updatedBy: "", approvalHistory: [],
    } as never);
    const res = await call("PATCH", "/api/quotes/QT-LEGACY-01", { remarks: "แก้หมายเหตุ" });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    const after = quoteOf(res.body);
    expect("contacts" in after).toBe(false);
    expect(after.contactName).toBe("คุณเก่า");
  });
});

describe("POST /api/quotes/:id/duplicate", () => {
  it("คัดลอกผู้ติดต่อครบ แต่ id ใหม่ทุกแถว", async () => {
    const q = await createQuote({ contacts: [A, B] });
    const res = await call("POST", `/api/quotes/${q.id}/duplicate`);
    expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
    const copy = quoteOf(res.body);
    expect(copy.contacts?.map((c) => c.name)).toEqual([A.name, B.name]);
    const sourceIds = new Set(q.contacts?.map((c) => c.id));
    expect(copy.contacts?.some((c) => sourceIds.has(c.id))).toBe(false);
  });
});
