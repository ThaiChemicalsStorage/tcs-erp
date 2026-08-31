import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for ทะเบียนรหัส (`/api/code-entries`, 2026-08-31) — the two code sets the owner
 * asked for on 2026-08-28 so ใบขอซื้อ/ใบสั่งซื้อ stop being free-text boxes:
 * `department` (`G143`) and `account` (the 479-row chart of accounts, `5230-15`).
 *
 * Four things are pinned here because they are the ones that would quietly rot:
 *
 *   1. **Uniqueness is per `kind`, not global** — the two sets are unrelated registers, so `G143`
 *      may exist in both. A single `{ code }` index would have blocked that and nobody would have
 *      noticed until an import failed months later.
 *   2. **Case-insensitive clash detection** — codes are stored upper-cased, so `g143` must be
 *      refused as a duplicate rather than creating a twin.
 *   3. **Import skips instead of overwriting** — re-importing the chart of accounts is expected
 *      (the owner may send a longer file later), and overwriting would eat names admins edited.
 *   4. **The route is mounted in server/app.ts** — a new route works on Vercel from `vercel.json`
 *      alone and 404s locally if the Express map is missed. A plain 401 here proves it is mapped.
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}

type CodeEntryDoc = {
  id: string; kind: string; code: string; name: string;
  category: string; level: number | null; isControl: boolean; parentCode: string;
  isActive: boolean; isDeleted: boolean;
};

async function createCode(body: Record<string, unknown>): Promise<Response> {
  return api("/api/code-entries", { method: "POST", body: JSON.stringify(body) });
}

async function listCodes(): Promise<CodeEntryDoc[]> {
  const res = await api("/api/code-entries");
  expect(res.status).toBe(200);
  return ((await res.json()) as { codes: CodeEntryDoc[] }).codes;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("ทะเบียนรหัส — เส้นทางและสิทธิ์", () => {
  it("เส้นทางถูก map ใน Express จริง ไม่ใช่แค่ vercel.json (ไม่มีคุกกี้ = 401 ไม่ใช่ 404)", async () => {
    const res = await fetch(`${baseUrl}/api/code-entries`);
    expect(res.status).toBe(401);
  });

  it("เส้นทางย่อยก็ถึงตัวจัดการ ไม่หล่นไปหน้า SPA", async () => {
    const res = await fetch(`${baseUrl}/api/code-entries/import`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("ทะเบียนรหัส — สร้างและตรวจรหัสซ้ำ", () => {
  it("สร้างรหัสแผนกได้ และรหัสถูกเก็บเป็นตัวพิมพ์ใหญ่", async () => {
    const res = await createCode({ kind: "department", code: "g143", name: "ฝ่ายผลิต" });
    expect(res.status).toBe(201);
    const { code } = (await res.json()) as { code: CodeEntryDoc };
    expect(code.code).toBe("G143");
    expect(code.kind).toBe("department");
    expect(code.isActive).toBe(true);
    expect(code.isDeleted).toBe(false);
  });

  it("รหัสซ้ำในชุดเดียวกันถูกปฏิเสธแม้พิมพ์คนละตัวพิมพ์", async () => {
    const res = await createCode({ kind: "department", code: "G143", name: "ซ้ำ" });
    expect(res.status).toBe(409);
    const again = await createCode({ kind: "department", code: "g143", name: "ซ้ำอีก" });
    expect(again.status).toBe(409);
  });

  it("รหัสเดียวกันข้ามชุดได้ เพราะเป็นทะเบียนคนละชุดกัน", async () => {
    const res = await createCode({ kind: "account", code: "G143", name: "บัญชีที่บังเอิญรหัสตรงกัน" });
    expect(res.status).toBe(201);
  });

  it("ชนิดที่ไม่รู้จักถูกปฏิเสธ", async () => {
    const res = await createCode({ kind: "product", code: "X1", name: "ไม่ใช่ชนิดที่มี" });
    expect(res.status).toBe(400);
  });

  it("ไม่กรอกรหัสหรือชื่อไม่ผ่าน", async () => {
    expect((await createCode({ kind: "department", code: "", name: "ไม่มีรหัส" })).status).toBe(400);
    expect((await createCode({ kind: "department", code: "G200", name: "" })).status).toBe(400);
  });
});

describe("ทะเบียนรหัส — แก้ไขและเก็บถาวร", () => {
  it("แก้ชื่อได้ แต่ย้ายชนิดไม่ได้", async () => {
    const created = (await (await createCode({ kind: "department", code: "G300", name: "ชื่อเดิม" })).json()) as { code: CodeEntryDoc };
    const res = await api(`/api/code-entries/${created.code.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "ชื่อใหม่", kind: "account" }),
    });
    expect(res.status).toBe(200);
    const { code } = (await res.json()) as { code: CodeEntryDoc };
    expect(code.name).toBe("ชื่อใหม่");
    expect(code.kind).toBe("department");
  });

  it("แก้รหัสไปชนของที่มีอยู่แล้วไม่ได้ แต่บันทึกทับรหัสเดิมของตัวเองได้", async () => {
    const created = (await (await createCode({ kind: "department", code: "G400", name: "ของตัวเอง" })).json()) as { code: CodeEntryDoc };
    const clash = await api(`/api/code-entries/${created.code.id}`, { method: "PATCH", body: JSON.stringify({ code: "G143" }) });
    expect(clash.status).toBe(409);
    const same = await api(`/api/code-entries/${created.code.id}`, { method: "PATCH", body: JSON.stringify({ code: "G400" }) });
    expect(same.status).toBe(200);
  });

  it("เก็บถาวรแล้วกู้คืนกลับมาได้", async () => {
    const created = (await (await createCode({ kind: "department", code: "G500", name: "เก็บถาวรได้" })).json()) as { code: CodeEntryDoc };
    const archived = await api(`/api/code-entries/${created.code.id}/archive`, { method: "POST", body: JSON.stringify({ isDeleted: true }) });
    expect(archived.status).toBe(200);
    expect(((await archived.json()) as { code: CodeEntryDoc }).code.isDeleted).toBe(true);

    const restored = await api(`/api/code-entries/${created.code.id}/archive`, { method: "POST", body: JSON.stringify({ isDeleted: false }) });
    expect(restored.status).toBe(200);
    expect(((await restored.json()) as { code: CodeEntryDoc }).code.isDeleted).toBe(false);
  });
});

describe("ทะเบียนรหัส — นำเข้าผังบัญชี", () => {
  const entries = [
    { code: "5230-15", name: "ค่าน้ำมันเชื้อเพลิง", category: "คชจ.", level: 4, isControl: false, parentCode: "5230-00" },
    { code: "5230-16", name: "ค่าทางด่วน", category: "คชจ.", level: 4, isControl: false, parentCode: "5230-00" },
  ];

  it("นำเข้ารอบแรกสร้างครบ รอบสองข้ามทั้งหมด ไม่ทับชื่อที่แอดมินแก้เอง", async () => {
    const first = await api("/api/code-entries/import", { method: "POST", body: JSON.stringify({ kind: "account", entries }) });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ created: 2, skipped: 0 });

    const edited = (await listCodes()).find((c) => c.kind === "account" && c.code === "5230-15")!;
    await api(`/api/code-entries/${edited.id}`, { method: "PATCH", body: JSON.stringify({ name: "ชื่อที่แอดมินแก้เอง" }) });

    const second = await api("/api/code-entries/import", { method: "POST", body: JSON.stringify({ kind: "account", entries }) });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ created: 0, skipped: 2 });

    const after = (await listCodes()).find((c) => c.kind === "account" && c.code === "5230-15")!;
    expect(after.name).toBe("ชื่อที่แอดมินแก้เอง");
  });

  it("นำเข้ารายการเปล่าไม่ผ่าน", async () => {
    const res = await api("/api/code-entries/import", { method: "POST", body: JSON.stringify({ kind: "account", entries: [] }) });
    expect(res.status).toBe(400);
  });

  it("ฟิลด์เสริมของฝั่งบัญชีถูกเก็บครบ", async () => {
    const account = (await listCodes()).find((c) => c.kind === "account" && c.code === "5230-16")!;
    expect(account.category).toBe("คชจ.");
    expect(account.level).toBe(4);
    expect(account.isControl).toBe(false);
    expect(account.parentCode).toBe("5230-00");
  });
});
