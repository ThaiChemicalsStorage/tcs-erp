import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ทะเบียนผู้ขาย: ช่องจัดซื้อ/บัญชีตามหน้าจอโปรแกรมบัญชีเดิม (เจ้าของสั่ง 2026-10-02)
 * *"แผนกจัดซื้อกรอกได้แค่นี้ ... ส่วนที่เหลือในรูปที่ส่งไปให้บัญชีกรอกเอง"*
 *
 * ตรึงไว้:
 *   1. เซิร์ฟเวอร์กัน ไม่ใช่แค่ซ่อนช่อง — จัดซื้อแก้ช่องบัญชี = 403 · บัญชีแก้ช่องจัดซื้อ = 403
 *   2. ตัดสินจาก**ช่องที่ค่าเปลี่ยนจริง** — ฟอร์มส่งทั้งชุดกลับมาได้โดยไม่ติด
 *   3. บัญชีกรอกช่องของตัวเองไม่ทำให้ผู้ขายที่อนุมัติแล้วตกขั้น · จัดซื้อเปลี่ยนสาขา = ต้องอนุมัติใหม่
 *   4. ยอดคงเหลือ/วันที่บิลล่าสุดคำนวณจากทะเบียนเจ้าหนี้ และส่งเฉพาะคนที่มี ap:view
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let buyer: string;
let accountant: string;

type V = Record<string, unknown> & { id: string; approvalStatus: string };

async function call(cookie: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });
}
async function vendorOf(res: Response): Promise<V> {
  return ((await res.json()) as { vendor: V }).vendor;
}
async function userWithRole(key: string, permissions: string[]): Promise<string> {
  const { rolesCollection, usersCollection } = await import("../../api/_lib/collections.js");
  const roles = await rolesCollection();
  const users = await usersCollection();
  const now = new Date().toISOString();
  await roles.insertOne({ key, name: key, description: "", isSuperAdmin: false, isSystem: false, permissions, createdAt: now, updatedAt: now } as never);
  await users.insertOne({
    employeeId: key, fullName: key, username: key, email: `${key}@test.local`,
    passwordHash: (await users.findOne({ username: "admin" }))!.passwordHash,
    roleKey: key, status: "active", createdAt: now, updatedAt: now,
  } as never);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: key, password: "correct-horse-1" }),
  });
  return (login.headers.get("set-cookie") ?? "").split(";")[0];
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  buyer = await userWithRole("buyer", ["vendor:view", "vendor:create", "vendor:edit"]);
  accountant = await userWithRole("accountant", ["vendor:view", "vendor:approve", "ap:view", "codeRegister:view"]);
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("ทะเบียนผู้ขาย — ช่องจัดซื้อ/บัญชี", () => {
  let id = "";

  it("จัดซื้อสร้างผู้ขายพร้อมช่องของตัวเองได้ แต่ใส่ช่องบัญชีมา = 403", async () => {
    const denied = await call(buyer, "/api/vendors", { method: "POST", body: JSON.stringify({ name: "บริษัท ทดสอบ จำกัด", creditDays: 30 }) });
    expect(denied.status).toBe(403);

    const res = await call(buyer, "/api/vendors", {
      method: "POST",
      body: JSON.stringify({ name: "บริษัท ทดสอบ จำกัด", taxId: "0105555000001", branch: 0, postalCode: "10110", paymentTerms: "1.เครดิต 30วัน", nameEn: "Test Co., Ltd.", creditDays: null, accountCode: "" }),
    });
    expect(res.status).toBe(201);
    const v = await vendorOf(res);
    id = v.id;
    expect(v).toMatchObject({ branch: 0, postalCode: "10110", paymentTerms: "1.เครดิต 30วัน", nameEn: "Test Co., Ltd.", creditDays: null });
    expect(v.balance).toBeNull(); // จัดซื้อไม่มี ap:view
  });

  it("ส่งทั้งชุดกลับมาโดยไม่แก้ช่องบัญชี = ผ่าน · แก้ช่องบัญชี = 403", async () => {
    const full = { name: "บริษัท ทดสอบ จำกัด", phone: "02-000-0000", creditDays: null, vatRate: null, priceType: "", accountCode: "", whtRate: null };
    expect((await call(buyer, `/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify(full) })).status).toBe(200);
    expect((await call(buyer, `/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify({ ...full, creditDays: 45 }) })).status).toBe(403);
  });

  it("บัญชีกรอกช่องบัญชีได้ แก้ช่องจัดซื้อไม่ได้ · ผู้ขายที่อนุมัติแล้วไม่ตกขั้น", async () => {
    expect((await call(buyer, `/api/vendors/${id}/submit-approval`, { method: "POST" })).status).toBe(200);
    expect((await call(accountant, `/api/vendors/${id}/approve`, { method: "POST" })).status).toBe(200);

    const res = await call(accountant, `/api/vendors/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "บริษัท ทดสอบ จำกัด", phone: "02-000-0000", creditDays: 30, vatRate: 7, priceType: "exclusive", whtRate: 3, whtCategory: "ภ.ง.ด.53", openingBalance: 200, accountCode: "2120-01" }),
    });
    expect(res.status).toBe(200);
    const v = await vendorOf(res);
    expect(v).toMatchObject({ creditDays: 30, vatRate: 7, priceType: "exclusive", whtRate: 3, whtCategory: "ภ.ง.ด.53", openingBalance: 200, accountCode: "2120-01", approvalStatus: "approved" });

    expect((await call(accountant, `/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify({ phone: "02-999-9999" }) })).status).toBe(403);
  });

  it("จัดซื้อเปลี่ยนสาขา = ต้องส่งอนุมัติใหม่", async () => {
    const v = await vendorOf(await call(buyer, `/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify({ branch: 2 }) }));
    expect(v.branch).toBe(2);
    expect(v.approvalStatus).toBe("draft");
  });

  it("ยอดคงเหลือ = ยอดยกมา + หนี้ที่ยังไม่จ่าย · วันที่บิลล่าสุดจากทะเบียนเจ้าหนี้ · เฉพาะ ap:view", async () => {
    const { apEntriesCollection } = await import("../../api/_lib/collections.js");
    const ap = await apEntriesCollection();
    const base = { vendorName: "บริษัท ทดสอบ จำกัด", subtotal: 0, vatRate: null, vatAmt: 0 };
    await ap.insertMany([
      { ...base, total: 1000, status: "Unpaid", invoiceDate: "2026-09-20" },
      { ...base, total: 500, status: "Paid", invoiceDate: "2026-09-28" },
      { ...base, vendorName: "รายอื่น", total: 9999, status: "Unpaid", invoiceDate: "2026-10-01" },
    ] as never[]);

    const list = ((await (await call(accountant, "/api/vendors")).json()) as { vendors: V[] }).vendors;
    expect(list.find((v) => v.id === id)).toMatchObject({ balance: 1200, lastBillDate: "2026-09-28" });
    const buyerList = ((await (await call(buyer, "/api/vendors")).json()) as { vendors: V[] }).vendors;
    expect(buyerList.find((v) => v.id === id)?.balance).toBeNull();
  });

  it("ปิดใช้งานบันทึกวันที่เลิกใช้ · เปิดใหม่ล้าง", async () => {
    const off = await vendorOf(await call(buyer, `/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) }));
    expect(off.inactiveAt).not.toBe("");
    const on = await vendorOf(await call(buyer, `/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) }));
    expect(on.inactiveAt).toBe("");
  });

  it("ใบสั่งซื้อเก็บเงื่อนไขการชำระเงิน + ประเภทราคา (ค่าที่หน้าจอเติมจากผู้ขาย) · ประเภทราคาผิด = 400", async () => {
    const admin = (await (await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
    })).headers.get("set-cookie") ?? "").split(";")[0];
    const created = await call(admin, "/api/purchase-orders", { method: "POST", body: "{}" });
    const poId = ((await created.json()) as { purchaseOrder: { id: string } }).purchaseOrder.id;
    const ok = await call(admin, `/api/purchase-orders/${poId}`, { method: "PATCH", body: JSON.stringify({ paymentTerms: "1.เครดิต 30วัน", priceType: "inclusive", vatRate: 7 }) });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { purchaseOrder: Record<string, unknown> }).purchaseOrder).toMatchObject({ paymentTerms: "1.เครดิต 30วัน", priceType: "inclusive" });
    expect((await call(admin, `/api/purchase-orders/${poId}`, { method: "PATCH", body: JSON.stringify({ priceType: "bogus" }) })).status).toBe(400);
  });

  it("เลขที่บัญชีที่ยังรอบัญชีอนุมัติในทะเบียนรหัสใช้ไม่ได้", async () => {
    const { codeEntriesCollection } = await import("../../api/_lib/collections.js");
    const now = new Date().toISOString();
    await (await codeEntriesCollection()).insertOne({
      kind: "account", code: "2120-99", name: "เจ้าหนี้รอ", category: "", level: null, isControl: false, parentCode: "",
      isActive: true, isDeleted: false, createdAt: now, updatedAt: now, createdBy: "", updatedBy: "", approvalStatus: "pending",
    });
    expect((await call(accountant, `/api/vendors/${id}`, { method: "PATCH", body: JSON.stringify({ accountCode: "2120-99" }) })).status).toBe(400);
  });
});
