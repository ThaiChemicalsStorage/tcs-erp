import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import type { ApiRequest, ApiResponse } from "../../api/_lib/httpTypes.js";
import { lockedContentKeys, POST_SUBMIT_EDITABLE_FIELDS, QUOTE_CONTENT_FIELDS } from "../../api/_lib/quoteWorkflow.js";

/**
 * ใบเสนอราคาล็อกหลังส่งขออนุมัติ (2026-09-30 — เจ้าของอนุมัติพร้อมดีไซน์ใหม่)
 *
 * สิ่งที่ตรึงไว้:
 *  1. พ้น "ร่าง" แล้ว PATCH ที่แตะเนื้อหา (ลูกค้า รายการ ราคา ส่วนลด เงื่อนไข ...) ได้ 409 `QUOTE_LOCKED` และไม่มีอะไรถูกเขียน
 *  2. ของที่ต้องทำได้หลังอนุมัติยังทำได้: ความสนใจ เลข PO วันที่ติดตาม โอกาสในการขาย
 *  3. workflow หลัง "ร่าง" ห้ามพ่วงเนื้อหามาเปลี่ยน (ส่ง `draft` ว่างผ่าน) · การส่งขออนุมัติจากร่างยังพ่วงการแก้ล่าสุดได้
 *  4. ทางแก้มีสองทาง: ปฏิเสธกลับเป็นร่าง แล้วแก้ได้อีก · กด "แก้ไข" ออกใบ -R ใหม่ที่เป็นร่าง
 */

const PASSWORD = "TestPassw0rd!";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let authHandler: (req: ApiRequest, res: ApiResponse) => Promise<void>;
let quotesHandler: (req: ApiRequest, res: ApiResponse) => Promise<void>;
let cookie = "";

interface CapturedResponse { statusCode: number; body: unknown; headers: Record<string, string> }

function makeReqRes(method: string, url: string, body: unknown, reqCookie: string) {
  const captured: CapturedResponse = { statusCode: 0, body: undefined, headers: {} };
  const query = Object.fromEntries(new URLSearchParams(url.split("?")[1] ?? ""));
  const req = {
    method, url, body, query,
    headers: { "x-forwarded-for": "10.0.0.1", cookie: reqCookie },
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as ApiRequest;
  const res = {
    status(code: number) { captured.statusCode = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
    setHeader(name: string, value: string) { captured.headers[name.toLowerCase()] = value; return this; },
    end() { return this; },
  } as unknown as ApiResponse;
  return { req, res, captured };
}

async function call(method: string, url: string, body?: unknown): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes(method, url, body, cookie);
  await quotesHandler(req, res);
  return captured;
}

type QuoteOut = {
  id: string; status: string; client: string; remarks: string; poRef: string; followUpDate: string;
  isPotentialOpportunity: boolean; interest: string | null; amount: number;
  lines: { description: string; unitPrice: number }[];
};
const quoteOf = (body: unknown) => (body as { quote: QuoteOut }).quote;
const path = (id: string, suffix = "") => `/api/quotes/${encodeURIComponent(id)}${suffix}`;

const LINE = { id: 1, description: "ถัง FRP", unit: "ใบ", qty: 1, unitPrice: 1000, discount: 0, tags: [], subDetails: [] };

async function createDraft(): Promise<QuoteOut> {
  const res = await call("POST", "/api/quotes", { client: "ลูกค้าทดสอบ", jobTypeCode: "LI", lines: [LINE], discount: 0, remarks: "เดิม" });
  expect(res.statusCode, JSON.stringify(res.body)).toBe(201);
  return quoteOf(res.body);
}

async function workflow(id: string, action: string, draft: Record<string, unknown> = {}, comment = "") {
  return call("POST", path(id, "/workflow"), { action, comment, draft });
}

async function submitted(): Promise<QuoteOut> {
  const q = await createDraft();
  const res = await workflow(q.id, "submitted");
  expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
  return quoteOf(res.body);
}

async function stored(id: string) {
  return db.collection("quotes").findOne({ _id: id as never });
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

  // ผู้ใช้คนแรกจาก Setup Wizard ได้บทบาทผู้ดูแลระบบ — มีทั้งสิทธิ์สร้าง แก้ และอนุมัติ ครบในคนเดียว
  const setup = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Sales Person", username: "sales", email: "sales@test.local", password: PASSWORD,
  }, "");
  await authHandler(setup.req, setup.res);
  expect(setup.captured.statusCode).toBe(201);
  cookie = setup.captured.headers["set-cookie"].split(";")[0];

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

describe("lockedContentKeys — กฎล้วน", () => {
  it("ร่างแก้ได้ทุกอย่าง · สถานะอื่นทุกสถานะล็อกเนื้อหา", () => {
    expect(lockedContentKeys("ร่าง", { client: "x", lines: [] })).toEqual([]);
    for (const status of ["รออนุมัติ", "อนุมัติแล้ว", "ส่งให้ลูกค้าแล้ว", "ลูกค้ายอมรับ", "ปิดการขายสำเร็จ", "ลูกค้าปฏิเสธ", "เสียโอกาส", "ยกเลิก"] as const) {
      expect(lockedContentKeys(status, { client: "x", lines: [], poRef: "PO-1" }), status).toEqual(["client", "lines"]);
    }
  });

  it("ช่องติดตามการขายไม่อยู่ในรายการเนื้อหาที่ล็อก และคีย์ที่เซิร์ฟเวอร์ไม่เขียนอยู่แล้ว (status/amount) ไม่ถูกนับ", () => {
    for (const k of POST_SUBMIT_EDITABLE_FIELDS) expect(QUOTE_CONTENT_FIELDS).not.toContain(k);
    expect(lockedContentKeys("อนุมัติแล้ว", { status: "อนุมัติแล้ว", amount: 5, interest: "น่าสนใจ" })).toEqual([]);
  });
});

describe("PATCH /api/quotes/:id หลังส่งขออนุมัติ", () => {
  it("แก้เนื้อหาใบที่รออนุมัติ → 409 QUOTE_LOCKED และไม่มีอะไรถูกเขียน", async () => {
    const q = await submitted();
    expect(q.status).toBe("รออนุมัติ");
    for (const body of [
      { client: "ลูกค้าใหม่" },
      { lines: [{ ...LINE, unitPrice: 1 }] },
      { discount: 10, discountMode: "percent" },
      { remarks: "แก้เงื่อนไข" },
      { paymentTerms: "ชำระทันที" },
      { customerId: "" },
      // client เก่าที่ส่งทั้งฟอร์มมา (รวมช่องที่แก้ได้) ต้องถูกปฏิเสธทั้งก้อน ไม่ใช่เขียนบางส่วน
      { poRef: "PO-9", client: "ลูกค้าทดสอบ" },
    ]) {
      const res = await call("PATCH", path(q.id), body);
      expect(res.statusCode, JSON.stringify(body)).toBe(409);
      expect((res.body as { code: string }).code).toBe("QUOTE_LOCKED");
    }
    const after = await stored(q.id);
    expect(after?.client).toBe("ลูกค้าทดสอบ");
    expect(after?.remarks).toBe("เดิม");
    expect(after?.poRef).toBe("");
    expect((after?.lines as QuoteOut["lines"])[0].unitPrice).toBe(1000);
  });

  it("ความสนใจ เลข PO วันที่ติดตาม และโอกาสในการขาย ยังแก้ได้", async () => {
    const q = await submitted();
    const interest = await call("PATCH", path(q.id), { interest: "น่าสนใจ" });
    expect(interest.statusCode, JSON.stringify(interest.body)).toBe(200);
    const followUp = await call("PATCH", path(q.id), { poRef: "PO-2569-001", followUpDate: "2026-10-15", isPotentialOpportunity: true });
    expect(followUp.statusCode, JSON.stringify(followUp.body)).toBe(200);
    const out = quoteOf(followUp.body);
    expect(out).toMatchObject({ interest: "น่าสนใจ", poRef: "PO-2569-001", followUpDate: "2026-10-15", isPotentialOpportunity: true });
    expect(out.amount).toBe(q.amount);
  });

  it("ใบร่างยังแก้เนื้อหาได้ตามปกติ", async () => {
    const q = await createDraft();
    const res = await call("PATCH", path(q.id), { client: "ลูกค้าแก้แล้ว", lines: [{ ...LINE, unitPrice: 2000 }] });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(quoteOf(res.body).client).toBe("ลูกค้าแก้แล้ว");
  });

  it("บันทึกอัตโนมัติบนใบที่พ้นร่างยังได้ 409 เหมือนเดิม (แม้จะส่งแค่ช่องติดตามการขาย)", async () => {
    const q = await submitted();
    const res = await call("PATCH", `${path(q.id)}?autoSave=1`, { followUpDate: "2026-10-20" });
    expect(res.statusCode).toBe(409);
  });
});

describe("POST /api/quotes/:id/workflow กับเนื้อหาที่ล็อก", () => {
  it("ส่งขออนุมัติจากร่างพ่วงการแก้ล่าสุดได้", async () => {
    const q = await createDraft();
    const res = await workflow(q.id, "submitted", { remarks: "แก้ก่อนส่ง" });
    expect(res.statusCode, JSON.stringify(res.body)).toBe(200);
    expect(quoteOf(res.body)).toMatchObject({ status: "รออนุมัติ", remarks: "แก้ก่อนส่ง" });
  });

  it("อนุมัติพร้อมเนื้อหาที่แก้ → 409 และสถานะไม่เปลี่ยน · อนุมัติด้วย draft ว่าง → ผ่าน", async () => {
    const q = await submitted();
    const blocked = await workflow(q.id, "approved", { client: "แอบเปลี่ยนลูกค้า" });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.body as { code: string }).code).toBe("QUOTE_LOCKED");
    expect((await stored(q.id))?.status).toBe("รออนุมัติ");

    const ok = await workflow(q.id, "approved");
    expect(ok.statusCode, JSON.stringify(ok.body)).toBe(200);
    expect(quoteOf(ok.body)).toMatchObject({ status: "อนุมัติแล้ว", client: "ลูกค้าทดสอบ" });

    const sent = await workflow(q.id, "sent_to_customer", { lines: [] });
    expect(sent.statusCode).toBe(409);
    const sentOk = await workflow(q.id, "sent_to_customer");
    expect(sentOk.statusCode, JSON.stringify(sentOk.body)).toBe(200);
    expect(quoteOf(sentOk.body).lines).toHaveLength(1);
  });

  it("หลังอนุมัติ แก้เนื้อหาไม่ได้ แต่ใส่เลข PO ได้", async () => {
    const q = await submitted();
    expect((await workflow(q.id, "approved")).statusCode).toBe(200);
    expect((await call("PATCH", path(q.id), { expiryDate: "2027-01-01" })).statusCode).toBe(409);
    const po = await call("PATCH", path(q.id), { poRef: "PO-777" });
    expect(po.statusCode, JSON.stringify(po.body)).toBe(200);
    expect(quoteOf(po.body).poRef).toBe("PO-777");
  });

  it("ปฏิเสธกลับเป็นร่าง → แก้เนื้อหาได้อีกครั้ง", async () => {
    const q = await submitted();
    const rejected = await workflow(q.id, "rejected", {}, "ราคาสูงไป");
    expect(rejected.statusCode, JSON.stringify(rejected.body)).toBe(200);
    expect(quoteOf(rejected.body).status).toBe("ร่าง");
    const edit = await call("PATCH", path(q.id), { lines: [{ ...LINE, unitPrice: 900 }] });
    expect(edit.statusCode, JSON.stringify(edit.body)).toBe(200);
    expect(quoteOf(edit.body).lines[0].unitPrice).toBe(900);
  });

  it("กด \"แก้ไข\" บนใบที่อนุมัติแล้ว → ได้ใบ -R1 เป็นร่างที่แก้ได้ ส่วนใบเดิมยังล็อก", async () => {
    const q = await submitted();
    expect((await workflow(q.id, "approved")).statusCode).toBe(200);
    const rewrite = await call("POST", path(q.id, "/rewrite"));
    expect(rewrite.statusCode, JSON.stringify(rewrite.body)).toBe(201);
    const r1 = quoteOf(rewrite.body);
    expect(r1.id).toBe(`${q.id}-R1`);
    expect(r1.status).toBe("ร่าง");
    expect((await call("PATCH", path(r1.id), { client: "ลูกค้าในใบแก้ไข" })).statusCode).toBe(200);
    expect((await call("PATCH", path(q.id), { client: "ลูกค้าในใบแก้ไข" })).statusCode).toBe(409);
  });
});
