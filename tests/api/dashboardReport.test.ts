import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { computeQuoteAmountBeforeVat, computeQuoteAmountWithVat } from "../../src/lib/quoteMath";

/**
 * ส่วนที่ `GET /api/dashboard` เพิ่มให้ไฟล์ Excel แบบละเอียด (2026-09-07):
 *  - `statusBySalesperson` และ `closingProbability` ตอบเสมอ · `quotations` ตอบเฉพาะ `?include=quotations`
 *  - รายการใบต้องผ่าน dedupe revision chain และคิดยอดตามโหมด VAT เดียวกับทุก aggregate
 *  - คนที่ไม่มี viewAll เห็นเฉพาะใบของตัวเอง ทั้งในรายการและในเมทริกซ์รายเซลล์
 */

const PASSWORD = "TestPassw0rd!";

let mongod: MongoMemoryServer;
let client: MongoClient;
let db: Db;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let dashboardHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let adminCookie = "";
let adminUserId = "";

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

type Stats = {
  kpis: { totalQuotations: number };
  statusBySalesperson: { salesperson: string; total: { count: number; value: number }; cells: { status: string; count: number }[] }[];
  closingProbability: { closedSampleSize: number; minSampleSize: number; stages: { stage: string; probability: number | null; source: string }[]; totalOpenCount: number };
  quotations?: { id: string; amount: number; salesperson: string; isOpen: boolean; stageProbability: number | null; daysOpen: number | null }[];
};

async function dashboard(url: string, cookie = adminCookie): Promise<Stats> {
  const { req, res, captured } = makeReqRes("GET", url, undefined, cookie);
  await dashboardHandler(req, res);
  expect(captured.statusCode, JSON.stringify(captured.body).slice(0, 300)).toBe(200);
  return captured.body as Stats;
}

const LINES = [{ id: 1, description: "งาน", unit: "งาน", qty: 1, unitPrice: 1000, discount: 0, tags: [], subDetails: [] }];
const hist = (...actions: string[]) => actions.map((action, i) => ({ id: `h${i}`, userId: "", userName: "", roleName: "", action, comment: "", createdAt: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z` }));

async function seedQuote(id: string, extra: Record<string, unknown>): Promise<void> {
  await db.collection("quotes").insertOne({
    _id: id, client: "ลูกค้า", date: "", valid: "", amount: 1070, status: "ร่าง", salesperson: "เอ", interest: null,
    lines: LINES, discount: 0, contactName: "", contactPhone: "", contactEmail: "", address: "", taxId: "", deliveryMethod: "",
    deliveryAddress: "", project: "โครงการทดสอบ", poRef: "", paymentTerms: "", issueDate: "2026-09-01", expiryDate: "2026-12-31", remarks: "",
    revisionNote: "", jobTypeCode: "LI", jobTypeName: "FRP Lining", isPotentialOpportunity: false, followUpDate: "",
    createdByUserId: adminUserId, updatedBy: "", approvalHistory: [],
    ...extra,
  } as never);
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  db = client.db("tcs_erp");
  authHandler = (await import("../../api/handlers/auth.js")).default;
  dashboardHandler = (await import("../../api/dashboard/index.js")).default;

  const setup = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: PASSWORD,
  }, "");
  await authHandler(setup.req, setup.res);
  expect(setup.captured.statusCode).toBe(201);
  adminCookie = setup.captured.headers["set-cookie"].split(";")[0];
  adminUserId = (await db.collection("users").findOne({ username: "admin" }))!._id.toString();

  // Q-1 ถูก rewrite เป็น Q-1-R1 → นับใบเดียว (ฉบับล่าสุด) · ใบชนะ/แพ้มีประวัติครบ · ใบยกเลิกจากร่าง
  await seedQuote("Q-1", { status: "ร่าง" });
  await seedQuote("Q-1-R1", { status: "ส่งให้ลูกค้าแล้ว", approvalHistory: hist("submitted", "approved", "sent_to_customer"), isPotentialOpportunity: true });
  await seedQuote("Q-2", { status: "ปิดการขายสำเร็จ", approvalHistory: hist("submitted", "approved", "sent_to_customer", "customer_accepted", "marked_won") });
  await seedQuote("Q-3", { status: "เสียโอกาส", salesperson: "บี", approvalHistory: hist("submitted", "approved", "sent_to_customer", "customer_rejected", "marked_lost") });
  await seedQuote("Q-4", { status: "ยกเลิก", salesperson: "บี", approvalHistory: hist("cancelled") });
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("GET /api/dashboard — ส่วนที่เพิ่มสำหรับ Excel", () => {
  it("ตอบ statusBySalesperson และ closingProbability เสมอ แต่ไม่ตอบ quotations ถ้าไม่ได้ขอ", async () => {
    const s = await dashboard("/api/dashboard");
    expect(s.quotations).toBeUndefined();
    expect(s.kpis.totalQuotations, "Q-1 กับ Q-1-R1 นับเป็นใบเดียว").toBe(4);
    const byName = Object.fromEntries(s.statusBySalesperson.map((r) => [r.salesperson, r]));
    expect(byName["เอ"].total.count).toBe(2);
    expect(byName["บี"].total.count).toBe(2);
    expect(byName["เอ"].cells).toHaveLength(9);
    expect(byName["เอ"].cells.find((c) => c.status === "ปิดการขายสำเร็จ")?.count).toBe(1);
    // ใบปิดแล้ว 3 ใบ (ชนะ แพ้ ยกเลิก) ต่ำกว่าขั้นต่ำ 5 → ทุกขั้นเป็น "ข้อมูลไม่พอ" ใช้ fallback
    expect(s.closingProbability.closedSampleSize).toBe(3);
    expect(s.closingProbability.stages.every((st) => st.probability === null && st.source === "fallback")).toBe(true);
    expect(s.closingProbability.totalOpenCount, "Q-1-R1 เท่านั้นที่ยังเปิด").toBe(1);
  });

  it("?include=quotations → รายการผ่าน dedupe ยอดตรงกับตัวคิดก่อน VAT และเปลี่ยนเมื่อ ?vat=post", async () => {
    const pre = await dashboard("/api/dashboard?include=quotations");
    expect(pre.quotations).toBeDefined();
    const ids = pre.quotations!.map((q) => q.id);
    expect(ids).toContain("Q-1-R1");
    expect(ids).not.toContain("Q-1");
    expect(ids).toHaveLength(4);
    const open = pre.quotations!.find((q) => q.id === "Q-1-R1")!;
    expect(open.amount).toBe(computeQuoteAmountBeforeVat(LINES, 0));
    expect(open.isOpen).toBe(true);
    expect(open.stageProbability, "ขั้นข้อมูลไม่พอ → ใช้อัตราชนะรวม (ชนะ 1 แพ้ 1 = 50%)").toBe(50);
    const closed = pre.quotations!.find((q) => q.id === "Q-2")!;
    expect(closed.isOpen).toBe(false);
    expect(closed.stageProbability).toBeNull();
    expect(closed.daysOpen, "ออก 2026-09-01 ปิด 2026-08-05 → ติดลบได้ตามข้อมูลจริง ไม่ crash").toBe(-27);

    const post = await dashboard("/api/dashboard?include=quotations&vat=post");
    expect(post.quotations!.find((q) => q.id === "Q-1-R1")!.amount).toBe(computeQuoteAmountWithVat(LINES, 0));
  });

  it("ผู้ใช้ที่ไม่มี viewAll เห็นเฉพาะใบของตัวเอง ทั้งรายการและเมทริกซ์", async () => {
    const { rolesCollection, usersCollection } = await import("../../api/_lib/collections.js");
    const roles = await rolesCollection();
    const users = await usersCollection();
    const now = new Date().toISOString();
    await roles.insertOne({
      key: "sales-own", name: "Sales (own)", description: "", isSuperAdmin: false, isSystem: false,
      permissions: ["dashboard:view", "quotations:view"], createdAt: now, updatedAt: now,
    } as never);
    const inserted = await users.insertOne({
      employeeId: "E002", fullName: "บี", username: "bee", email: "bee@test.local",
      passwordHash: (await users.findOne({ username: "admin" }))!.passwordHash,
      roleKey: "sales-own", status: "active", createdAt: now, updatedAt: now,
    } as never);
    await db.collection("quotes").updateMany({ salesperson: "บี" }, { $set: { createdByUserId: inserted.insertedId.toString() } });

    const login = makeReqRes("POST", "/api/auth/login", { identifier: "bee", password: PASSWORD }, "");
    await authHandler(login.req, login.res);
    expect(login.captured.statusCode).toBe(200);
    const beeCookie = login.captured.headers["set-cookie"].split(";")[0];

    const s = await dashboard("/api/dashboard?include=quotations", beeCookie);
    expect(s.quotations!.map((q) => q.id).sort()).toEqual(["Q-3", "Q-4"]);
    expect(s.statusBySalesperson.map((r) => r.salesperson)).toEqual(["บี"]);
  });
});
