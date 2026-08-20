import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * ส่งใบส่งมอบงานถึงแผนก (2026-08-20) — เจ้าของขอให้เซลล์ติ๊กส่งเอกสารให้แผนกที่เกี่ยวข้อง แล้วเอกสาร
 * ไปโผล่ในหน้ารายการของแผนกนั้น โดยผู้รับ "ดูและพิมพ์ได้อย่างเดียว"
 *
 * สิ่งที่เทสต์ชุดนี้ตรึงไว้ คือจุดที่พังแล้วจะไม่มีอะไรฟ้อง:
 *  - `User.department` เก็บเป็น **ชื่อ** แต่เอกสารเก็บเป็น **id** — จับคู่ผิดเมื่อไหร่ ไม่มีใครเห็นอะไรเลย
 *    และหน้าจอจะดูปกติทุกอย่าง
 *  - clause ของการมองเห็นต้อง **รวม** เข้ากับ clause เจ้าของด้วย `$or` เดียวกัน ไม่ใช่ spread ทับ
 *    (บั๊กแบบเดียวกับที่หลุดไปใน MR/PR เมื่อ 2026-08-20i แล้วกลายเป็นสิทธิ์รั่ว)
 *  - ผู้รับต้องแก้เอกสารไม่ได้จริง แม้ role จะมีสิทธิ์ :edit/:finalize ก็ตาม
 */

const PASSWORD = "TestPassw0rd!";

let mongod: MongoMemoryServer;
let client: MongoClient;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let quotesHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let rolesHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;

let salesCookie = "";
let factoryCookie = "";
let deliveryOrderId = "";
let factoryDeptId = "";

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
  method: string, url: string, body?: unknown, cookie = salesCookie,
): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes(method, url, body, cookie);
  await handler(req, res);
  return captured;
}

function listedIds(body: unknown): string[] {
  return (body as { deliveryOrders: { id: string }[] }).deliveryOrders.map((d) => d.id);
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  authHandler = (await import("../../api/handlers/auth.js")).default;
  quotesHandler = (await import("../../api/handlers/quotes.js")).default;
  rolesHandler = (await import("../../api/handlers/roles.js")).default;

  const setup = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Sales Person", username: "sales", email: "sales@test.local", password: PASSWORD,
  }, "");
  await authHandler(setup.req, setup.res);
  expect(setup.captured.statusCode).toBe(201);
  salesCookie = setup.captured.headers["set-cookie"].split(";")[0];

  const db = client.db("tcs_erp");

  // แผนกจริงมาจากตาราง departments — ตัวที่ระบบ seed ให้ตอนติดตั้ง แล้วเพิ่ม "ฝ่ายผลิต" เข้าไป
  // (ของจริงตอนนี้ยังไม่มีแผนกนี้ ซึ่งเป็นเหตุผลที่ต้องตั้งค่าก่อนใช้งาน — ดู MODULES/DeliveryOrder.md)
  const listed = await call(rolesHandler, "GET", "/api/departments");
  expect(listed.statusCode, JSON.stringify(listed.body)).toBe(200);
  const created = await call(rolesHandler, "POST", "/api/departments", { name: "ฝ่ายผลิต", code: "PRODUCTION" });
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201);
  factoryDeptId = (created.body as { department: { id: string } }).department.id;

  // Role ของฝ่ายผลิตจงใจให้ถือ :edit/:finalize/:delete ครบ **แต่ไม่มี :viewAll**
  // ที่ให้สิทธิ์แก้ไขครบ ก็เพื่อพิสูจน์ว่าด่าน "ผู้รับดู/พิมพ์ได้อย่างเดียว" กันได้ด้วยตัวมันเอง
  // ไม่ได้กันได้เพราะบังเอิญตั้ง role ไว้แคบ — ถ้าวันหนึ่งมีคนเผลอติ๊กสิทธิ์เพิ่มให้ ต้องยังกันอยู่
  await db.collection("roles").insertOne({
    key: "production_staff", name: "พนักงานฝ่ายผลิต", description: "",
    permissions: ["deliveryOrder:view", "deliveryOrder:print", "deliveryOrder:edit", "deliveryOrder:finalize", "deliveryOrder:delete"],
    isSuperAdmin: false, isSystem: false, createdAt: "", updatedAt: "",
  } as never);

  // พนักงานฝ่ายผลิตคนหนึ่ง — ตั้ง department เป็น "ชื่อ" แผนก ตรงตามที่หน้าจัดการผู้ใช้บันทึกจริง
  const users = db.collection("users");
  const bcrypt = await import("bcryptjs");
  await users.insertOne({
    employeeId: "E002", fullName: "Factory Staff", username: "factory", email: "factory@test.local",
    passwordHash: await bcrypt.default.hash(PASSWORD, 10),
    phone: "", department: "ฝ่ายผลิต", teamId: "", position: "", roleKey: "production_staff", status: "active",
    createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
  } as never);
  const login = makeReqRes("POST", "/api/auth/login", { identifier: "factory", password: PASSWORD }, "");
  await authHandler(login.req, login.res);
  expect(login.captured.statusCode, JSON.stringify(login.captured.body)).toBe(200);
  factoryCookie = login.captured.headers["set-cookie"].split(";")[0];

  // Scope of Work ขั้นต่ำ + ใบส่งมอบสินค้าที่ออกจากมัน
  const scope = await db.collection("scope_of_works").insertOne({
    scopeNumber: "TEST-SOW-01", yearMonth: "", jobSequence: 0, secondaryCode: "",
    quotationId: "Q-TEST-01", quotationNumber: "Q-TEST-01", jobTypeCode: "LI", jobTypeName: "FRP Lining",
    quotationSalesperson: "", issueDate: "2026-08-20", deliveryDate: "", drawingCode: "", customerPoNumber: "",
    customerSnapshot: { companyName: "Test Co.", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" },
    deliveryLocation: "", shippingContact: "", shippingPhone: "", billingContact: "", billingPhone: "",
    checklistGroups: [],
    items: [{ id: "item-1", name: "FRP Tank", specifications: [], quantity: 1, unit: "ชุด", isSectionHeader: false }],
    paymentConditions: { installments: [{ id: "inst-1", label: "งวดที่ 1", percent: 100, amount: 0, dueDate: "" }], description: "", notes: "" },
    documentRecipients: {}, documentRecipientMessage: "", revisionNote: "", remarks: "",
    seller: { name: "", userId: "", date: "" }, approver: { name: "", userId: "", date: "" },
    status: "Final", version: 1, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "", isDeleted: false,
  } as never);

  const doCreated = await call(quotesHandler, "POST", "/api/delivery-orders", { scopeOfWorkId: scope.insertedId.toString() });
  expect(doCreated.statusCode, JSON.stringify(doCreated.body)).toBe(201);
  deliveryOrderId = (doCreated.body as { deliveryOrder: { id: string } }).deliveryOrder.id;
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("ส่งใบส่งมอบงานถึงแผนก", () => {
  it("แผนกที่ยังไม่ถูกติ๊ก มองไม่เห็นเอกสารของเซลล์", async () => {
    const before = await call(quotesHandler, "GET", "/api/delivery-orders", undefined, factoryCookie);
    expect(before.statusCode, JSON.stringify(before.body)).toBe(200);
    expect(listedIds(before.body)).not.toContain(deliveryOrderId);
  });

  it("ติ๊กส่งถึงแผนกแล้ว พนักงานในแผนกนั้นเห็นเอกสารในรายการของตัวเอง", async () => {
    const sent = await call(quotesHandler, "POST", `/api/delivery-orders/${deliveryOrderId}/send-to-departments`, { departmentIds: [factoryDeptId] });
    expect(sent.statusCode, JSON.stringify(sent.body)).toBe(200);
    // นับคนที่เห็นจริง — ถ้าเป็น 0 แปลว่าจับคู่ชื่อแผนกไม่ติด ซึ่งเป็นความล้มเหลวแบบเงียบของฟีเจอร์นี้
    expect((sent.body as { recipientCount: number }).recipientCount, "ต้องจับคู่ชื่อแผนกกับพนักงานได้จริง").toBe(1);

    const after = await call(quotesHandler, "GET", "/api/delivery-orders", undefined, factoryCookie);
    expect(listedIds(after.body)).toContain(deliveryOrderId);
  });

  /**
   * ตรึงบั๊กคลาสเดียวกับสิทธิ์รั่วที่เพิ่งแก้ไปเมื่อ 2026-08-20i โดยเฉพาะ
   *
   * clause "เอกสารที่ส่งถึงแผนกฉัน" ต้อง **รวม** เข้าไปใน `$or` ของ clause เจ้าของ ไม่ใช่ spread ทับ
   * ถ้าเผลอเขียนเป็น `{ ...ownershipClause, $or: [...] }` เอกสารของตัวเองจะหายไปจากรายการเงียบ ๆ
   * เทสต์ข้ออื่นจับไม่ได้ เพราะผู้รับในเทสต์พวกนั้นไม่มีเอกสารของตัวเองสักใบ — ข้อนี้จึงจงใจให้มี
   */
  it("ผู้รับยังเห็นเอกสารของตัวเองด้วย ไม่ใช่เห็นแค่ใบที่ถูกส่งมา", async () => {
    const db = client.db("tcs_erp");
    const factoryUser = await db.collection("users").findOne({ username: "factory" });
    const own = await db.collection("delivery_orders").insertOne({
      scopeOfWorkId: "", scopeNumber: "OWN-SOW", quotationId: "", customerCompanyName: "Own Co.",
      customerAddress: "", items: [], installments: [], status: "Draft", version: 1,
      createdAt: "", updatedAt: "", createdBy: factoryUser!._id.toString(), updatedBy: "", isDeleted: false,
    } as never);

    const listed = await call(quotesHandler, "GET", "/api/delivery-orders", undefined, factoryCookie);
    const ids = listedIds(listed.body);
    expect(ids, "เอกสารที่ถูกส่งมาต้องเห็น").toContain(deliveryOrderId);
    expect(ids, "เอกสารของตัวเองต้องไม่หายไปเพราะ clause ถูกเขียนทับ").toContain(own.insertedId.toString());
  });

  it("ผู้รับได้แจ้งเตือนที่กดแล้วเปิดเอกสารใบนั้นได้ (มี relatedDeliveryOrderId)", async () => {
    const notes = await client.db("tcs_erp").collection("notifications")
      .find({ type: "delivery_order_sent_to_department" }).toArray();
    expect(notes.length).toBe(1);
    expect(notes[0].relatedDeliveryOrderId).toBe(deliveryOrderId);
  });

  it("ผู้รับแก้เอกสารไม่ได้ แม้ role จะมีสิทธิ์ :edit/:finalize/:delete ครบก็ตาม", async () => {
    const edit = await call(quotesHandler, "PATCH", `/api/delivery-orders/${deliveryOrderId}`, { installments: [] }, factoryCookie);
    expect(edit.statusCode, "ผู้รับต้องดู/พิมพ์ได้อย่างเดียว").toBe(403);

    const finalize = await call(quotesHandler, "POST", `/api/delivery-orders/${deliveryOrderId}/finalize`, undefined, factoryCookie);
    expect(finalize.statusCode).toBe(403);

    const removed = await call(quotesHandler, "DELETE", `/api/delivery-orders/${deliveryOrderId}`, undefined, factoryCookie);
    expect(removed.statusCode).toBe(403);
  });

  it("เจ้าของเอกสาร (เซลล์) ยังแก้ได้ตามปกติ ไม่ติดด่านผู้รับ", async () => {
    const edit = await call(quotesHandler, "PATCH", `/api/delivery-orders/${deliveryOrderId}`, { installments: [] });
    expect(edit.statusCode, JSON.stringify(edit.body)).toBe(200);
  });

  it("กดส่งซ้ำแผนกเดิม ไม่ยิงแจ้งเตือนซ้ำ", async () => {
    await call(quotesHandler, "POST", `/api/delivery-orders/${deliveryOrderId}/send-to-departments`, { departmentIds: [factoryDeptId] });
    const notes = await client.db("tcs_erp").collection("notifications")
      .find({ type: "delivery_order_sent_to_department" }).toArray();
    expect(notes.length, "ส่งซ้ำโดยไม่เปลี่ยนอะไร ต้องไม่รบกวนผู้รับอีกรอบ").toBe(1);
  });

  it("ปฏิเสธ id แผนกที่ไม่มีอยู่จริง แทนที่จะบันทึกเงียบ ๆ แล้วไม่มีใครเห็น", async () => {
    const bogus = await call(quotesHandler, "POST", `/api/delivery-orders/${deliveryOrderId}/send-to-departments`, {
      departmentIds: ["6a7154c5fd86794cf5859999"],
    });
    expect(bogus.statusCode).toBe(400);
  });

  it("ถอนออกจากแผนกได้ แล้วแผนกนั้นกลับมามองไม่เห็น", async () => {
    const cleared = await call(quotesHandler, "POST", `/api/delivery-orders/${deliveryOrderId}/send-to-departments`, { departmentIds: [] });
    expect(cleared.statusCode, JSON.stringify(cleared.body)).toBe(200);
    const after = await call(quotesHandler, "GET", "/api/delivery-orders", undefined, factoryCookie);
    expect(listedIds(after.body)).not.toContain(deliveryOrderId);
  });
});
