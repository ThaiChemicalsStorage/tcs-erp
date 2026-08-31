import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Cost Control ไปพร้อมกับ Scope of Work ตอนส่งให้คนอื่น (2026-08-31)
 *
 * เจ้าของสั่งไว้ว่า *"Scope of work เวลาที่จะส่งไปให้คนอื่นอะมันจะมาพร้อมกับ Cost control ด้วย"*
 * กลไกคือ FK `costControl.scopeOfWorkId` บวกกับ **ทางมองเห็นทางที่สาม** ของโมดูล Cost Control:
 * เจ้าของใบ / `costControl:viewAll` / **เป็นผู้รับเอกสารของ Scope ที่ใบนั้นผูกอยู่**
 *
 * สิ่งที่เทสต์ชุดนี้ตรึงไว้ คือจุดที่พังแล้วจะไม่มีอะไรฟ้อง:
 *  - clause ผู้รับต้อง **รวม** เข้ากับ clause เจ้าของด้วย `$or` เดียวกัน ไม่ใช่ spread ทับ
 *    (บั๊กแบบเดียวกับที่หลุดไปใน MR/PR เมื่อ 2026-08-20i แล้วกลายเป็นสิทธิ์รั่ว)
 *  - `viewAll` ทำให้ clause เจ้าของเป็น `{}` ที่ไม่มี `$or` — merge แบบไม่ระวังจะทำให้คนที่เห็นทุกใบ
 *    เหลือเห็นแค่ใบที่ผูกกับ Scope ของตัวเอง ซึ่งเป็นการ**ตัด**สิทธิ์ ไม่ใช่เพิ่ม
 *  - ผู้รับต้องดู/พิมพ์ได้เท่านั้น **แก้ไม่ได้** แม้ role จะถือ :edit/:delete/:finalize ครบ
 *  - เลิกผูกแล้วสิทธิ์ต้องหายทันที ไม่ใช่ค้างอยู่
 *  - Global Search ต้องใช้ clause เดียวกับรายการ ไม่งั้นจะเป็น "เห็นในรายการแต่ค้นไม่เจอ"
 */

const PASSWORD = "TestPassw0rd!";

let mongod: MongoMemoryServer;
let client: MongoClient;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let quotesHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let searchHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;

/** เจ้าของทุกอย่าง (super admin จากการติดตั้ง) */
let bdCookie = "";
/** ถูกเลือกเป็นผู้รับเอกสารของ Scope — ถือสิทธิ์ Cost Control ครบยกเว้น viewAll */
let recipientCookie = "";
/** ไม่ได้เกี่ยวข้องกับ Scope ใบนี้เลย — ถือสิทธิ์ชุดเดียวกับผู้รับ */
let outsiderCookie = "";
let recipientUserId = "";

let scopeId = "";
let otherScopeId = "";
let costControlId = "";
let deletedCostControlId = "";
let legacyCostControlId = "";
let standaloneCostControlId = "";

interface CapturedResponse { statusCode: number; body: unknown; headers: Record<string, string> }

function makeReqRes(method: string, url: string, body: unknown, cookie: string) {
  const captured: CapturedResponse = { statusCode: 0, body: undefined, headers: {} };
  const query = Object.fromEntries(new URLSearchParams(url.split("?")[1] ?? ""));
  const req = {
    method, url, body, query,
    headers: { "x-forwarded-for": "10.0.0.1", cookie },
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

async function call(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  method: string, url: string, body?: unknown, cookie = bdCookie,
): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes(method, url, body, cookie);
  await handler(req, res);
  return captured;
}

function listedIds(body: unknown): string[] {
  return (body as { costControls: { id: string }[] }).costControls.map((c) => c.id);
}

/** Scope ขั้นต่ำที่ผ่าน normalize ได้ — `documentRecipients` คือสิ่งที่เทสต์ชุดนี้สนใจ */
function scopeDoc(scopeNumber: string, recipients: Record<string, string[]>) {
  return {
    scopeNumber, yearMonth: "", jobSequence: 0, secondaryCode: "",
    quotationId: "Q-CC-01", quotationNumber: "Q-CC-01", jobTypeCode: "SC", jobTypeName: "Wet Scrubber",
    quotationSalesperson: "", issueDate: "2026-08-31", deliveryDate: "", drawingCode: "",
    customerPoNumber: "", additionalPoNumbers: [], additionalQuotationNumbers: [],
    customerSnapshot: { companyName: "บริษัท ทดสอบ จำกัด", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" },
    deliveryLocation: "", shippingContact: "", shippingPhone: "", billingContact: "", billingPhone: "",
    checklistGroups: [],
    items: [{ id: "item-1", name: "Scrubber", specifications: [], quantity: 1, unit: "ชุด", isSectionHeader: false }],
    paymentConditions: { installments: [], description: "", notes: "" },
    documentRecipients: recipients, documentRecipientMessage: "", revisionNote: "", remarks: "",
    seller: { name: "", userId: "", date: "" }, approver: { name: "", userId: "", date: "" },
    status: "Draft", version: 1, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "", isDeleted: false,
  };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  authHandler = (await import("../../api/handlers/auth.js")).default;
  quotesHandler = (await import("../../api/handlers/quotes.js")).default;
  // Global Search อยู่ใต้ handler ของลูกค้า ตามธรรมเนียมรวม route ของ repo (docs/CLAUDE.md)
  searchHandler = (await import("../../api/handlers/customers.js")).default;

  const setup = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "BD Person", username: "bd", email: "bd@test.local", password: PASSWORD,
  }, "");
  await authHandler(setup.req, setup.res);
  expect(setup.captured.statusCode).toBe(201);
  bdCookie = setup.captured.headers["set-cookie"].split(";")[0];

  const db = client.db("tcs_erp");

  // Role ของผู้รับจงใจให้ถือ :edit/:finalize/:delete ครบ **แต่ไม่มี :viewAll** — ที่ให้สิทธิ์แก้ไข
  // ครบก็เพื่อพิสูจน์ว่าด่าน "ผู้รับดู/พิมพ์ได้อย่างเดียว" กันได้ด้วยตัวมันเอง ไม่ได้กันได้เพราะ
  // บังเอิญตั้ง role ไว้แคบ (แนวเดียวกับเทสต์ของใบส่งมอบสินค้า)
  await db.collection("roles").insertOne({
    key: "cc_reader", name: "ผู้รับเอกสาร", description: "",
    permissions: [
      "costControl:view", "costControl:print", "costControl:edit", "costControl:finalize",
      "costControl:delete", "costControl:create", "scopeOfWork:view",
    ],
    isSuperAdmin: false, isSystem: false, createdAt: "", updatedAt: "",
  } as never);

  const bcrypt = await import("bcryptjs");
  const users = db.collection("users");
  const mkUser = async (employeeId: string, username: string) => {
    const r = await users.insertOne({
      employeeId, fullName: username, username, email: `${username}@test.local`,
      passwordHash: await bcrypt.default.hash(PASSWORD, 10),
      phone: "", department: "", teamId: "", position: "", roleKey: "cc_reader", status: "active",
      createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
    } as never);
    const login = makeReqRes("POST", "/api/auth/login", { identifier: username, password: PASSWORD }, "");
    await authHandler(login.req, login.res);
    expect(login.captured.statusCode, JSON.stringify(login.captured.body)).toBe(200);
    return { id: r.insertedId.toString(), cookie: login.captured.headers["set-cookie"].split(";")[0] };
  };
  const recipient = await mkUser("E002", "recipient");
  recipientUserId = recipient.id;
  recipientCookie = recipient.cookie;
  outsiderCookie = (await mkUser("E003", "outsider")).cookie;

  // Scope ใบหลัก — ผู้รับถูกเลือกไว้ใต้ "ผู้รับเพิ่มเติม" (คีย์ที่ไม่ต้องรอติ๊กแผนก)
  const scopes = db.collection("scope_of_works");
  scopeId = (await scopes.insertOne(scopeDoc("CC-SOW-01", { additional: [recipientUserId] }) as never)).insertedId.toString();
  // Scope อีกใบที่ไม่มีใครถูกเลือกเป็นผู้รับเลย
  otherScopeId = (await scopes.insertOne(scopeDoc("CC-SOW-02", {}) as never)).insertedId.toString();

  const created = await call(quotesHandler, "POST", "/api/cost-controls", { scopeOfWorkId: scopeId });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
  costControlId = (created.body as { costControl: { id: string } }).costControl.id;

  // ใบที่ผูก Scope เดียวกันแต่ถูกลบไปแล้ว — ต้องไม่โผล่ที่ไหนเลย
  const del = await call(quotesHandler, "POST", "/api/cost-controls", { scopeOfWorkId: scopeId, jobName: "ใบที่ถูกลบ" });
  deletedCostControlId = (del.body as { costControl: { id: string } }).costControl.id;
  expect((await call(quotesHandler, "DELETE", `/api/cost-controls/${encodeURIComponent(deletedCostControlId)}`)).statusCode).toBe(204);

  // ใบเดี่ยวของ BD ที่ไม่ผูก Scope ไหนเลย
  const standalone = await call(quotesHandler, "POST", "/api/cost-controls", { jobName: "ใบเดี่ยว" });
  standaloneCostControlId = (standalone.body as { costControl: { id: string } }).costControl.id;

  // เอกสารยุคก่อน 2026-08-31 — ไม่มีฟิลด์ `scopeOfWorkId` อยู่ในฐานข้อมูลเลย
  legacyCostControlId = "CC-2568-9999";
  await db.collection("cost_controls").insertOne({
    _id: legacyCostControlId, documentNumber: legacyCostControlId,
    jobName: "งานเก่า", workType: "", jobOrder: "PQ202512-001-SC-SK", docDate: "2025-12-01",
    lines: [], remarks: "", submittedBy: "", approvedBy: "", sourceFileName: "", importedAt: "",
    status: "Draft", approvedByUserId: "", approvedAt: "", rejectionComment: "", revisionNote: "",
    createdAt: "", updatedAt: "", createdBy: "", updatedBy: "", isDeleted: false,
  } as never);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("Cost Control ผูกกับ Scope of Work", () => {
  it("สร้างจาก Scope แล้วหัวใบถูกเติมจาก Scope ให้เอง", async () => {
    const got = await call(quotesHandler, "GET", `/api/cost-controls/${encodeURIComponent(costControlId)}`);
    const cc = (got.body as { costControl: { scopeOfWorkId: string; jobOrder: string; jobName: string; workType: string } }).costControl;
    expect(cc.scopeOfWorkId).toBe(scopeId);
    expect(cc.jobOrder).toBe("CC-SOW-01");
    expect(cc.jobName).toBe("บริษัท ทดสอบ จำกัด");
    expect(cc.workType).toBe("Wet Scrubber");
  });

  it("ผูกกับ Scope ที่ไม่มีอยู่จริงไม่ได้ — 400 ไม่ใช่ FK ค้าง", async () => {
    const bogus = await call(quotesHandler, "POST", "/api/cost-controls", { scopeOfWorkId: "ffffffffffffffffffffffff" });
    expect(bogus.statusCode, JSON.stringify(bogus.body)).toBe(400);
    const malformed = await call(quotesHandler, "POST", "/api/cost-controls", { scopeOfWorkId: "ไม่ใช่ id" });
    expect(malformed.statusCode, JSON.stringify(malformed.body)).toBe(400);
  });

  it("`?scopeOfWorkId=` บอกได้ว่ามีใบอยู่แล้ว แม้ผู้เรียกจะไม่ใช่คนสร้าง — และไม่นับใบที่ถูกลบ", async () => {
    const byScope = await call(quotesHandler, "GET", `/api/cost-controls?scopeOfWorkId=${scopeId}`, undefined, recipientCookie);
    expect(byScope.statusCode, JSON.stringify(byScope.body)).toBe(200);
    expect(listedIds(byScope.body)).toEqual([costControlId]);

    const empty = await call(quotesHandler, "GET", `/api/cost-controls?scopeOfWorkId=${otherScopeId}`);
    expect(listedIds(empty.body)).toEqual([]);
  });
});

describe("ผู้รับเอกสารของ Scope มองเห็น Cost Control ที่ผูกอยู่", () => {
  it("ผู้รับเห็นใบที่ผูกอยู่ในรายการของตัวเอง แม้ไม่ได้เป็นคนสร้าง", async () => {
    const list = await call(quotesHandler, "GET", "/api/cost-controls", undefined, recipientCookie);
    expect(list.statusCode, JSON.stringify(list.body)).toBe(200);
    expect(listedIds(list.body)).toContain(costControlId);
    // ใบเดี่ยวของคนอื่น และใบที่ถูกลบ ต้องไม่ติดมาด้วย
    expect(listedIds(list.body)).not.toContain(standaloneCostControlId);
    expect(listedIds(list.body)).not.toContain(deletedCostControlId);
  });

  it("ผู้รับ **เปิดอ่านได้แต่แก้ไม่ได้** ถึงจะถือสิทธิ์ :edit/:delete/:finalize ครบ", async () => {
    const got = await call(quotesHandler, "GET", `/api/cost-controls/${encodeURIComponent(costControlId)}`, undefined, recipientCookie);
    expect(got.statusCode, JSON.stringify(got.body)).toBe(200);

    const patched = await call(quotesHandler, "PATCH", `/api/cost-controls/${encodeURIComponent(costControlId)}`, { jobName: "แอบแก้" }, recipientCookie);
    expect(patched.statusCode, JSON.stringify(patched.body)).toBe(403);

    const removed = await call(quotesHandler, "DELETE", `/api/cost-controls/${encodeURIComponent(costControlId)}`, undefined, recipientCookie);
    expect(removed.statusCode, JSON.stringify(removed.body)).toBe(403);

    const submitted = await call(quotesHandler, "POST", `/api/cost-controls/${encodeURIComponent(costControlId)}/submit-approval`, {}, recipientCookie);
    expect(submitted.statusCode, JSON.stringify(submitted.body)).toBe(403);

    // และเนื้อหาต้องไม่ถูกแตะจริง ๆ
    const after = await call(quotesHandler, "GET", `/api/cost-controls/${encodeURIComponent(costControlId)}`);
    expect((after.body as { costControl: { jobName: string } }).costControl.jobName).toBe("บริษัท ทดสอบ จำกัด");
  });

  it("คนที่ไม่ใช่ทั้งเจ้าของและผู้รับ ไม่เห็นใบนี้ในรายการ", async () => {
    const list = await call(quotesHandler, "GET", "/api/cost-controls", undefined, outsiderCookie);
    expect(list.statusCode, JSON.stringify(list.body)).toBe(200);
    expect(listedIds(list.body)).not.toContain(costControlId);
    expect(listedIds(list.body)).not.toContain(standaloneCostControlId);
  });

  it("Global Search ใช้ clause เดียวกับรายการ — ผู้รับค้นเจอ คนนอกค้นไม่เจอ", async () => {
    const found = await call(searchHandler, "GET", `/api/search?q=${encodeURIComponent(costControlId)}`, undefined, recipientCookie);
    expect(found.statusCode, JSON.stringify(found.body)).toBe(200);
    expect(JSON.stringify(found.body)).toContain(costControlId);

    const notFound = await call(searchHandler, "GET", `/api/search?q=${encodeURIComponent(costControlId)}`, undefined, outsiderCookie);
    expect(notFound.statusCode, JSON.stringify(notFound.body)).toBe(200);
    expect(JSON.stringify(notFound.body)).not.toContain(costControlId);
  });

  it("เลิกผูก Scope แล้วผู้รับหมดสิทธิ์ทันที แล้วผูกกลับก็ได้สิทธิ์คืน", async () => {
    const unlinked = await call(quotesHandler, "PATCH", `/api/cost-controls/${encodeURIComponent(costControlId)}`, { scopeOfWorkId: "" });
    expect(unlinked.statusCode, JSON.stringify(unlinked.body)).toBe(200);
    const during = await call(quotesHandler, "GET", "/api/cost-controls", undefined, recipientCookie);
    expect(listedIds(during.body)).not.toContain(costControlId);

    const relinked = await call(quotesHandler, "PATCH", `/api/cost-controls/${encodeURIComponent(costControlId)}`, { scopeOfWorkId: scopeId });
    expect(relinked.statusCode, JSON.stringify(relinked.body)).toBe(200);
    const after = await call(quotesHandler, "GET", "/api/cost-controls", undefined, recipientCookie);
    expect(listedIds(after.body)).toContain(costControlId);
  });
});

describe("ของเดิมต้องไม่พังไปกับการเพิ่มทางมองเห็นทางที่สาม", () => {
  it("คนที่มี viewAll (clause เป็น {} ไม่มี $or) ยังเห็นครบทุกใบ", async () => {
    // ผู้ติดตั้งเป็น super admin — clause ของเขาคือ `{}` ซึ่งเป็นเคสที่ merge พลาดแล้วกลายเป็นการตัดสิทธิ์
    const list = await call(quotesHandler, "GET", "/api/cost-controls");
    expect(list.statusCode, JSON.stringify(list.body)).toBe(200);
    const ids = listedIds(list.body);
    expect(ids).toContain(costControlId);
    expect(ids).toContain(standaloneCostControlId);
    expect(ids).toContain(legacyCostControlId);
    expect(ids).not.toContain(deletedCostControlId);
  });

  it("เอกสารเก่าที่ไม่มีฟิลด์นี้อ่านกลับมาเป็น \"\" และทำงานเหมือนเดิม", async () => {
    const got = await call(quotesHandler, "GET", `/api/cost-controls/${encodeURIComponent(legacyCostControlId)}`);
    expect(got.statusCode, JSON.stringify(got.body)).toBe(200);
    expect((got.body as { costControl: { scopeOfWorkId: string } }).costControl.scopeOfWorkId).toBe("");

    const list = await call(quotesHandler, "GET", "/api/cost-controls");
    const row = (list.body as { costControls: { id: string; scopeOfWorkId: string }[] }).costControls
      .find((c) => c.id === legacyCostControlId);
    expect(row?.scopeOfWorkId).toBe("");
  });
});
