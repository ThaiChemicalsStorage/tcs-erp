import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ทะเบียนรหัสต้องผ่านบัญชี (เจ้าของสั่ง 2026-10-02) — *"สร้างได้แค่จัดซื้อกับบัญชี อนุมัติได้แค่บัญชี ·
 * รหัสต้องรออนุมัติก่อนถึงจะใช้ได้"* · รหัสเดิม (รวมผังบัญชี 479 รายการ) ถือว่าอนุมัติแล้ว
 *
 * ตรึงไว้:
 *   1. รหัสเก่าไม่มีฟิลด์ = อนุมัติแล้ว — ไม่งั้นวัน deploy ใบขอซื้อเลือกรหัสไม่ได้เลยทั้งระบบ
 *   2. คนที่ไม่มี `codeRegister:approve` สร้าง = รออนุมัติ · บัญชีสร้างเอง = อนุมัติทันที · ประเภทงานไม่ผ่านบัญชี
 *   3. คนที่แค่ "เลือก" รหัสไม่เห็นรหัสที่รออนุมัติ และเซิร์ฟเวอร์ไม่รับรหัสนั้นบนใบขอซื้อ — แต่ใบที่ใส่ไว้ก่อนยังบันทึกต่อได้
 *   4. ไม่อนุมัติต้องมีเหตุผล · จัดซื้ออนุมัติเองไม่ได้ · จัดซื้อแก้ชื่อรหัสที่อนุมัติแล้ว = กลับไปรออนุมัติ
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let buyerCookie: string;
let pickerCookie: string;

type CodeDoc = { id: string; kind: string; code: string; name: string; approvalStatus: string; rejectionComment: string; approvedByName: string };

async function call(cookie: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });
}
async function create(cookie: string, body: Record<string, unknown>): Promise<CodeDoc> {
  const res = await call(cookie, "/api/code-entries", { method: "POST", body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: CodeDoc }).code;
}
async function list(cookie: string): Promise<CodeDoc[]> {
  const res = await call(cookie, "/api/code-entries");
  expect(res.status).toBe(200);
  return ((await res.json()) as { codes: CodeDoc[] }).codes;
}
async function userWithRole(key: string, username: string, permissions: string[]): Promise<string> {
  const { rolesCollection, usersCollection } = await import("../../api/_lib/collections.js");
  const roles = await rolesCollection();
  const users = await usersCollection();
  const now = new Date().toISOString();
  await roles.insertOne({ key, name: key, description: "", isSuperAdmin: false, isSystem: false, permissions, createdAt: now, updatedAt: now } as never);
  await users.insertOne({
    employeeId: username, fullName: username, username, email: `${username}@test.local`,
    passwordHash: (await users.findOne({ username: "admin" }))!.passwordHash,
    roleKey: key, status: "active", createdAt: now, updatedAt: now,
  } as never);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: username, password: "correct-horse-1" }),
  });
  expect(login.status).toBe(200);
  return (login.headers.get("set-cookie") ?? "").split(";")[0];
}
async function draftPr(): Promise<string> {
  const res = await call(adminCookie, "/api/purchase-requests", { method: "POST", body: "{}" });
  return ((await res.json()) as { purchaseRequest: { id: string } }).purchaseRequest.id;
}
function prLines(departmentCode: string, description = "ปั๊ม") {
  return [{ id: "l1", productId: "", productCode: "", description, subDetails: [], unit: "ตัว", qtyRequested: 1, departmentCode, costCode: "" }];
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
    body: JSON.stringify({ employeeId: "E001", fullName: "Accounting Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  buyerCookie = await userWithRole("buyer", "buyer", ["codeRegister:view", "codeRegister:create", "codeRegister:edit", "purchaseRequest:view"]);
  pickerCookie = await userWithRole("picker", "picker", ["purchaseRequest:view"]);
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("ทะเบียนรหัส — ขั้นอนุมัติของบัญชี", () => {
  it("รหัสเก่าที่ไม่มีฟิลด์สถานะ = อนุมัติแล้ว และคนเลือกรหัสเห็น", async () => {
    const { codeEntriesCollection } = await import("../../api/_lib/collections.js");
    const now = new Date().toISOString();
    await (await codeEntriesCollection()).insertOne({
      kind: "account", code: "5230-15", name: "ค่าซ่อมแซม", category: "คชจ.", level: 4, isControl: false, parentCode: "",
      isActive: true, isDeleted: false, createdAt: now, updatedAt: now, createdBy: "", updatedBy: "",
    });
    const legacy = (await list(adminCookie)).find((c) => c.code === "5230-15");
    expect(legacy?.approvalStatus).toBe("approved");
    expect((await list(pickerCookie)).map((c) => c.code)).toContain("5230-15");
  });

  it("จัดซื้อสร้าง = รออนุมัติ (แจ้งบัญชี) · บัญชีสร้าง = อนุมัติทันที · ประเภทงานไม่ผ่านบัญชี", async () => {
    const pending = await create(buyerCookie, { kind: "department", code: "d100", name: "ฝ่ายซ่อม" });
    expect(pending.approvalStatus).toBe("pending");
    const own = await create(adminCookie, { kind: "department", code: "D200", name: "ฝ่ายผลิต" });
    expect(own.approvalStatus).toBe("approved");
    expect(own.approvedByName).toBe("Accounting Admin");
    const workType = await create(buyerCookie, { kind: "workType", code: "W1", name: "งานเหล็ก" });
    expect(workType.approvalStatus).toBe("approved");

    const pickerCodes = (await list(pickerCookie)).map((c) => c.code);
    expect(pickerCodes).toContain("D200");
    expect(pickerCodes).not.toContain("D100");

    const { notificationsCollection } = await import("../../api/_lib/collections.js");
    expect(await (await notificationsCollection()).countDocuments({ type: "code_entry_submitted" } as never)).toBe(1);
  });

  it("ใบขอซื้อใช้รหัสที่รออนุมัติไม่ได้ จนกว่าบัญชีอนุมัติ", async () => {
    const id = await draftPr();
    const blocked = await call(adminCookie, `/api/purchase-requests/${id}`, { method: "PATCH", body: JSON.stringify({ lines: prLines("d100") }) });
    expect(blocked.status).toBe(400);
    expect(((await blocked.json()) as { error: string }).error).toContain("D100");

    const target = (await list(adminCookie)).find((c) => c.code === "D100")!;
    expect((await call(buyerCookie, `/api/code-entries/${target.id}/approve`, { method: "POST" })).status).toBe(403);
    const approved = await call(adminCookie, `/api/code-entries/${target.id}/approve`, { method: "POST" });
    expect(approved.status).toBe(200);

    const ok = await call(adminCookie, `/api/purchase-requests/${id}`, { method: "PATCH", body: JSON.stringify({ lines: prLines("d100") }) });
    expect(ok.status).toBe(200);
  });

  it("ใบที่ใส่รหัสไว้ก่อนรหัสกลับไปรออนุมัติ ยังบันทึกต่อได้ (ตรวจเฉพาะรหัสที่เปลี่ยน)", async () => {
    const id = await draftPr();
    expect((await call(adminCookie, `/api/purchase-requests/${id}`, { method: "PATCH", body: JSON.stringify({ lines: prLines("D200") }) })).status).toBe(200);
    const { codeEntriesCollection } = await import("../../api/_lib/collections.js");
    await (await codeEntriesCollection()).updateOne({ kind: "department", code: "D200" }, { $set: { approvalStatus: "pending" } });
    const res = await call(adminCookie, `/api/purchase-requests/${id}`, { method: "PATCH", body: JSON.stringify({ lines: prLines("D200", "ปั๊มน้ำ") }) });
    expect(res.status).toBe(200);
  });

  it("ไม่อนุมัติต้องมีเหตุผล · จัดซื้อแก้แล้วกลับไปรออนุมัติ · แก้ชื่อรหัสที่อนุมัติแล้วก็ต้องรออนุมัติใหม่", async () => {
    const code = await create(buyerCookie, { kind: "account", code: "5230-99", name: "ค่าอื่น" });
    expect((await call(adminCookie, `/api/code-entries/${code.id}/reject`, { method: "POST", body: "{}" })).status).toBe(400);
    const rejected = await call(adminCookie, `/api/code-entries/${code.id}/reject`, { method: "POST", body: JSON.stringify({ comment: "ใช้ 5230-15 แทน" }) });
    expect(rejected.status).toBe(200);
    expect(((await rejected.json()) as { code: CodeDoc }).code).toMatchObject({ approvalStatus: "rejected", rejectionComment: "ใช้ 5230-15 แทน" });

    const resubmitted = await call(buyerCookie, `/api/code-entries/${code.id}`, { method: "PATCH", body: JSON.stringify({ name: "ค่าซ่อมเครื่องจักร" }) });
    expect(((await resubmitted.json()) as { code: CodeDoc }).code.approvalStatus).toBe("pending");

    const approvedBefore = (await list(adminCookie)).find((c) => c.code === "D100")!;
    expect(approvedBefore.approvalStatus).toBe("approved");
    const renamed = await call(buyerCookie, `/api/code-entries/${approvedBefore.id}`, { method: "PATCH", body: JSON.stringify({ name: "ฝ่ายซ่อมบำรุง" }) });
    expect(((await renamed.json()) as { code: CodeDoc }).code.approvalStatus).toBe("pending");
    // ปิด/เปิดใช้งานไม่นับเป็นการแก้ — บัญชีแก้เองก็ไม่ตกขั้น
    const adminRename = await call(adminCookie, `/api/code-entries/${(await list(adminCookie)).find((c) => c.code === "5230-15")!.id}`, { method: "PATCH", body: JSON.stringify({ name: "ค่าซ่อมแซมทั่วไป" }) });
    expect(((await adminRename.json()) as { code: CodeDoc }).code.approvalStatus).toBe("approved");
  });
});
