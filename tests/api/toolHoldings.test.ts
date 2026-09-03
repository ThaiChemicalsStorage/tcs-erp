import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * เครื่องมือประจำทีม — `GET /api/tool-holdings` คิดยอดถือครองจากบัญชีสต๊อกที่ใบเบิกประทับทีมไว้
 * (ไม่มี collection ของตัวเอง) · ใส่ movement ลงฐานข้อมูลตรง ๆ ตามรูปที่ applyStockMovement() เขียนจริง
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let toolId: string;
let consumableId: string;
const teamA = "64a000000000000000000001";
const teamB = "64a000000000000000000002";
const dept = "64a000000000000000000010";

async function api(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { cookie: adminCookie } });
}

async function move(productId: string, delta: number, teamId: string, createdAt: string, sourceLabel = "MR-202609-0001") {
  await client.db("tcs_erp").collection("stock_movements").insertOne({
    productId, productCode: "X", productName: "X", kind: delta < 0 ? "deduct" : "return", delta, balanceAfter: 0,
    reason: "", sourceType: "material_requisition", sourceId: sourceLabel, sourceLabel,
    departmentId: dept, departmentName: "ฝ่ายผลิต", teamId, teamName: teamId === teamA ? "ทีม A" : "ทีม B",
    workTypeCode: "STEEL", workTypeName: "งานเหล็ก", createdAt, createdBy: "u1",
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Store Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const db = client.db("tcs_erp");
  const base = { categoryId: "", unit: "ตัว", defaultPrice: 0, description: "", specifications: "", archived: false, stockQty: 0, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" };
  toolId = (await db.collection("products").insertOne({ ...base, code: "TL-01", name: "สว่าน", isTool: true })).insertedId.toString();
  consumableId = (await db.collection("products").insertOne({ ...base, code: "CS-01", name: "ใบตัด", isTool: false })).insertedId.toString();

  // ทีม A: เบิก 3 คืน 1 → ถือ 2 · ทีม B: เบิก 2 คืน 2 → ถือ 0 (ไม่ขึ้น) · วัสดุสิ้นเปลืองเบิก 10 (ไม่ขึ้น)
  await move(toolId, -3, teamA, "2026-09-01T03:00:00.000Z");
  await move(toolId, 1, teamA, "2026-09-02T03:00:00.000Z");
  await move(toolId, -2, teamB, "2026-09-02T04:00:00.000Z", "MR-202609-0002");
  await move(toolId, 2, teamB, "2026-09-03T04:00:00.000Z", "MR-202609-0002");
  await move(consumableId, -10, teamA, "2026-09-01T05:00:00.000Z");
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

describe("GET /api/tool-holdings", () => {
  it("เบิก 3 คืน 1 → ถือ 2 · ทีมที่คืนครบและวัสดุสิ้นเปลืองไม่ขึ้น", async () => {
    const res = await api("/api/tool-holdings");
    expect(res.status).toBe(200);
    const { holdings } = (await res.json()) as { holdings: { teamId: string; productId: string; issued: number; returned: number; held: number; lastSourceLabel: string }[] };
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ teamId: teamA, productId: toolId, issued: 3, returned: 1, held: 2, lastSourceLabel: "MR-202609-0001" });
  });

  it("กรองตามทีมได้ — ทีม B ไม่ถืออะไร", async () => {
    const { holdings } = (await (await api(`/api/tool-holdings?teamId=${teamB}`)).json()) as { holdings: unknown[] };
    expect(holdings).toHaveLength(0);
  });

  it("รายงานเบิก-คืนตามช่วงวันที่ (เวลาไทย) — เฉพาะเครื่องมือ มองจากฝั่งทีม (เบิกเป็นบวก คืนเป็นลบ)", async () => {
    const { rows } = (await (await api("/api/tool-holdings?report=1&from=2026-09-02&to=2026-09-02")).json()) as { rows: { qty: number; teamName: string; kind: string }[] };
    expect(rows.map((r) => [r.teamName, r.qty])).toEqual([["ทีม A", -1], ["ทีม B", 2]]);
  });

  it("วันที่ผิดรูปแบบ → 400", async () => {
    expect((await api("/api/tool-holdings?report=1&from=2026-9-2")).status).toBe(400);
  });
});

/**
 * จ่าย / รับคืนเครื่องมือให้ทีมโดยตรง (2026-09-03 รอบสอง) — `POST /api/tool-holdings/issue`
 *
 * สิ่งที่ตรึงไว้ คือจุดที่พังแล้วยอดถือครองจะผิดโดยไม่มีอะไรฟ้อง:
 *  - ต้องเขียนลงบัญชีสต๊อกชุดเดียวกับใบเบิก ยอดถือครองจึงต้องรวมของสองทางเข้าด้วยกัน
 *    (ถ้าเผลอแยก sourceType ออกจากตัวรวม ยอดจะหายไปครึ่งหนึ่งแบบเงียบ ๆ)
 *  - คืนเกินที่ทีมถืออยู่ต้องไม่ผ่าน ไม่งั้น "คืน" ของที่ไม่เคยเบิกจะทำให้สต๊อกงอกเอง
 *  - ของไม่พอต้องไม่เขียนอะไรเลย ไม่ใช่เขียนบรรทัดแรกแล้วค่อย error
 */
describe("POST /api/tool-holdings/issue", () => {
  let deptId = "";
  let teamC = "";

  async function post(body: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(`${baseUrl}/api/tool-holdings/issue`, {
      method: "POST", headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  }
  async function stockOf(): Promise<number> {
    const p = await client.db("tcs_erp").collection("products").findOne({ code: "TL-01" });
    return p?.stockQty ?? 0;
  }

  beforeAll(async () => {
    const db = client.db("tcs_erp");
    deptId = (await db.collection("departments").insertOne({ name: "ฝ่ายผลิต", code: "PD", isActive: true, createdAt: "", updatedAt: "" } as never)).insertedId.toString();
    teamC = (await db.collection("teams").insertOne({ name: "ทีม C", departmentId: deptId, isActive: true, createdAt: "", updatedAt: "" } as never)).insertedId.toString();
    // ตั้งยอดตั้งต้นให้สว่านมีของจ่ายได้จริง (movement ในชุดก่อนหน้าใส่ตรง ๆ ไม่ผ่าน applyStockMovement)
    await db.collection("products").updateOne({ code: "TL-01" }, { $set: { stockQty: 5 } });
  });

  it("จ่ายให้ทีมแล้วสต๊อกลด และยอดถือครองของทีมนั้นขึ้นทันที", async () => {
    const res = await post({ mode: "issue", departmentId: deptId, teamId: teamC, lines: [{ productId: toolId, qty: 3 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.slipNumber).toMatch(/^TL-\d{6}-\d{4}$/);
    expect(await stockOf()).toBe(2);

    const { holdings } = (await (await api(`/api/tool-holdings?teamId=${teamC}`)).json()) as { holdings: { held: number; lastSourceLabel: string }[] };
    expect(holdings).toHaveLength(1);
    expect(holdings[0].held).toBe(3);
    expect(holdings[0].lastSourceLabel).toBe(res.body.slipNumber);
  });

  it("คืนเกินที่ถืออยู่ไม่ผ่าน และไม่แตะสต๊อก", async () => {
    const before = await stockOf();
    const res = await post({ mode: "return", departmentId: deptId, teamId: teamC, lines: [{ productId: toolId, qty: 4 }] });
    expect(res.status).toBe(400);
    expect(await stockOf()).toBe(before);
  });

  it("รับคืนบางส่วนแล้วยอดถือครองลดตาม", async () => {
    const res = await post({ mode: "return", departmentId: deptId, teamId: teamC, lines: [{ productId: toolId, qty: 2 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await stockOf()).toBe(4);
    const { holdings } = (await (await api(`/api/tool-holdings?teamId=${teamC}`)).json()) as { holdings: { held: number }[] };
    expect(holdings[0].held).toBe(1);
  });

  it("ของไม่พอ → 400 และไม่เขียนอะไรเลย", async () => {
    const before = await stockOf();
    const res = await post({ mode: "issue", departmentId: deptId, teamId: teamC, lines: [{ productId: toolId, qty: 999 }] });
    expect(res.status).toBe(400);
    expect(await stockOf()).toBe(before);
  });

  it("สินค้าที่ไม่ใช่เครื่องมือ จ่ายผ่านหน้านี้ไม่ได้", async () => {
    const res = await post({ mode: "issue", departmentId: deptId, teamId: teamC, lines: [{ productId: consumableId, qty: 1 }] });
    expect(res.status).toBe(400);
  });

  it("ทีมที่ไม่ได้อยู่ในแผนกที่เลือก → 400", async () => {
    const res = await post({ mode: "issue", departmentId: dept, teamId: teamC, lines: [{ productId: toolId, qty: 1 }] });
    expect(res.status).toBe(400);
  });

  it("ไม่ระบุทีม → 400 (ยอดถือครองเป็นของทีม ไม่ใช่ของแผนก)", async () => {
    const res = await post({ mode: "issue", departmentId: deptId, teamId: "", lines: [{ productId: toolId, qty: 1 }] });
    expect(res.status).toBe(400);
  });

  it("รายงานเบิก-คืนเห็นรายการที่จ่ายตรงด้วย ไม่ใช่เฉพาะที่มาจากใบเบิก", async () => {
    const { rows } = (await (await api(`/api/tool-holdings?report=1&teamId=${teamC}`)).json()) as { rows: { sourceLabel: string; qty: number }[] };
    expect(rows.map((r) => r.qty)).toEqual([3, -2]);
    expect(rows.every((r) => r.sourceLabel.startsWith("TL-"))).toBe(true);
  });
});
