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
