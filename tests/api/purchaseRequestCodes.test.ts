import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * ใบขอซื้อแยกรหัสตามฝ่าย (2026-09-23) — Support = PR, ผลิต = FD, โครงการ = ED, งานเหล็ก = SD
 * และ "แต่ละรหัสรันเลขแยกกัน" ตามที่เจ้าของสั่ง
 *
 * สิ่งที่ตรึงไว้: ตัวนับของแต่ละรหัสไม่ปนกัน, `PR` ใช้ตัวนับเดิม (เลขต่อจากใบเก่า), รหัสที่ไม่รู้จักถูกปฏิเสธ
 * แทนที่จะตกไปเป็นค่าตั้งต้นเงียบ ๆ, และแก้รหัสผ่าน PATCH ไม่ได้ (รหัสฝังอยู่ในเลขที่ใบแล้ว)
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let server: Server;
let baseUrl: string;
let cookie: string;

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
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
  cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await client?.close();
  await mongod?.stop();
});

describe("รหัสฝ่ายของใบขอซื้อ", () => {
  it("ใบเปล่าที่ไม่ระบุรหัสเป็นของฝ่าย Support (PR)", async () => {
    const res = await api("POST", "/api/purchase-requests", {});
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.purchaseRequest.id).toMatch(/^PR-\d{6}-0001$/);
    expect(res.body.purchaseRequest.requestCode).toBe("PR");
  });

  it("แต่ละรหัสนับเลขของตัวเอง", async () => {
    const fd1 = await api("POST", "/api/purchase-requests", { requestCode: "FD" });
    const fd2 = await api("POST", "/api/purchase-requests", { requestCode: "FD" });
    const sd1 = await api("POST", "/api/purchase-requests", { requestCode: "SD" });
    const pr2 = await api("POST", "/api/purchase-requests", {});
    expect(fd1.body.purchaseRequest.id).toMatch(/^FD-\d{6}-0001$/);
    expect(fd2.body.purchaseRequest.id).toMatch(/^FD-\d{6}-0002$/);
    expect(sd1.body.purchaseRequest.id).toMatch(/^SD-\d{6}-0001$/);
    expect(pr2.body.purchaseRequest.id).toMatch(/^PR-\d{6}-0002$/);
  });

  it("รหัสที่ไม่รู้จักถูกปฏิเสธ", async () => {
    const res = await api("POST", "/api/purchase-requests", { requestCode: "XX" });
    expect(res.status).toBe(400);
  });

  it("รายการคืนรหัสมาด้วย และใบเก่าที่ไม่มีฟิลด์อ่านรหัสจากเลขที่ใบ", async () => {
    await client.db("tcs_erp").collection("purchase_requests").insertOne({
      _id: "PR-2569-0099" as never, projectId: "", scopeOfWorkId: "", jobCode: "", ownerDepartment: "general",
      status: "Draft", lines: [], updatedAt: "2026-01-01T00:00:00.000Z", createdBy: "x", isDeleted: false,
    });
    const res = await api("GET", "/api/purchase-requests?ownerDepartment=all");
    expect(res.status).toBe(200);
    const byId = new Map<string, string>(res.body.purchaseRequests.map((p: { id: string; requestCode: string }) => [p.id, p.requestCode]));
    expect(byId.get("PR-2569-0099")).toBe("PR");
    expect([...byId.entries()].some(([id, code]) => id.startsWith("SD-") && code === "SD")).toBe(true);
  });

  it("แก้รหัสผ่าน PATCH ไม่ได้", async () => {
    const created = await api("POST", "/api/purchase-requests", { requestCode: "ED" });
    const id = created.body.purchaseRequest.id;
    const patched = await api("PATCH", `/api/purchase-requests/${id}`, { requestCode: "SD", headerRemark: "x" });
    expect(patched.status, JSON.stringify(patched.body)).toBe(200);
    expect(patched.body.purchaseRequest.requestCode).toBe("ED");
  });
});
