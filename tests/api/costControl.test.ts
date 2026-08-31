import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for the Cost Control API (แผนก BD, added 2026-08-28), run against the real
 * Express app on a throwaway in-memory MongoDB.
 *
 * The things pinned here are the ones that would hurt to change later or that guard real money:
 *
 *   1. **เลขที่เอกสาร** `CC-{พ.ศ.}-{NNNN}` — it ends up printed on a document the owner signs.
 *   2. **ไม่เก็บยอดรวมลงฐานข้อมูล** — the list route derives `totalCost` from the lines every time,
 *      so a stored total can never drift away from the lines that produced it.
 *   3. **สถานะที่ไม่ใช่ร่างแก้ไม่ได้** — both `Final` and `PendingApproval`, because approving
 *      content that changed while it sat in the queue is the failure the lock exists for.
 *   4. **Rewrite** — `-R1` is a fresh Draft and the approved original is untouched.
 *   5. **สิทธิ์** — a role without `costControl:*` gets 403, not an empty list.
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;

const BUDDHIST_YEAR = new Date().getFullYear() + 543;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

type Line = {
  id: string; kind: "group" | "item" | "sub"; seq: string; description: string;
  model: string; supplierName: string; qty: number | null; unit: string; unitCost: number | null;
};
type CostControlDoc = {
  id: string; documentNumber: string; status: string; jobName: string; workType: string;
  jobOrder: string; docDate: string; lines: Line[]; sourceFileName: string; importedAt: string;
};
type SummaryRow = { id: string; totalCost: number };

const LINES: Line[] = [
  { id: "l0", kind: "group", seq: "", description: "งาน Dust Collector", model: "", supplierName: "", qty: null, unit: "", unitCost: null },
  { id: "l1", kind: "item", seq: "1", description: "MAIN DUCT FRP No.1", model: "", supplierName: "TCS", qty: 1, unit: "Lot", unitCost: 931020 },
  { id: "l2", kind: "sub", seq: "", description: "- Packing Media", model: "", supplierName: "", qty: 2, unit: "Cu.m.", unitCost: 8000 },
];

async function createCostControl(body: Record<string, unknown> = {}): Promise<CostControlDoc> {
  const res = await api("/api/cost-controls", {
    method: "POST",
    body: JSON.stringify({ jobName: "บริษัททดสอบ", workType: "Wet Scrubber", jobOrder: "PQ202608-222-SC-SK", lines: LINES, ...body }),
  });
  expect(res.status).toBe(201);
  return (await json<{ costControl: CostControlDoc }>(res)).costControl;
}

async function approve(id: string): Promise<CostControlDoc> {
  const submitted = await api(`/api/cost-controls/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  expect(submitted.status).toBe(200);
  const approved = await api(`/api/cost-controls/${encodeURIComponent(id)}/approve`, { method: "POST" });
  expect(approved.status).toBe(200);
  return (await json<{ costControl: CostControlDoc }>(approved)).costControl;
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
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin BD", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
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

describe("Cost Control", () => {
  it("ออกเลขที่ตามรูปแบบ CC-{พ.ศ.}-{NNNN} และเดินหน้าไม่ซ้ำ", async () => {
    const first = await createCostControl();
    const second = await createCostControl();
    expect(first.id).toMatch(new RegExp(`^CC-${BUDDHIST_YEAR}-\\d{4}$`));
    const seq = (id: string) => Number(id.split("-")[2]);
    expect(seq(second.id)).toBe(seq(first.id) + 1);
    expect(first.documentNumber).toBe(first.id);
    expect(first.status).toBe("Draft");
  });

  it("เก็บบรรทัดทั้งสามชนิดไว้ครบ พร้อมชื่อไฟล์ต้นทาง", async () => {
    const doc = await createCostControl({ sourceFileName: "PQ202608-222-SC-SK.xlsx" });
    expect(doc.lines.map((l) => l.kind)).toEqual(["group", "item", "sub"]);
    expect(doc.lines[1]).toMatchObject({ seq: "1", supplierName: "TCS", qty: 1, unit: "Lot", unitCost: 931020 });
    expect(doc.sourceFileName).toBe("PQ202608-222-SC-SK.xlsx");
    expect(doc.importedAt).not.toBe("");
  });

  it("ชนิดบรรทัดที่ไม่รู้จักถูกปฏิเสธ ไม่ใช่เก็บลงไปเงียบ ๆ", async () => {
    const res = await api("/api/cost-controls", {
      method: "POST",
      body: JSON.stringify({ jobName: "x", lines: [{ ...LINES[1], kind: "หัวข้อ" }] }),
    });
    expect(res.status).toBe(400);
  });

  it("ยอดรวมคำนวณจากบรรทัดทุกครั้ง ไม่ได้เก็บไว้ในฐานข้อมูล", async () => {
    const doc = await createCostControl();
    const list = await json<{ costControls: SummaryRow[] }>(await api("/api/cost-controls"));
    const row = list.costControls.find((r) => r.id === doc.id);
    // 1×931,020 + 2×8,000 — หัวกลุ่มไม่นับ
    expect(row?.totalCost).toBe(947020);

    // แก้ราคาแล้วยอดต้องขยับตาม โดยไม่ต้องมีใครไปอัปเดตช่องยอดรวม
    const patched = await api(`/api/cost-controls/${encodeURIComponent(doc.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ lines: [{ ...LINES[1], unitCost: 1000 }] }),
    });
    expect(patched.status).toBe(200);
    const after = await json<{ costControls: SummaryRow[] }>(await api("/api/cost-controls"));
    expect(after.costControls.find((r) => r.id === doc.id)?.totalCost).toBe(1000);
  });

  it("แก้ไม่ได้ทั้งตอนรออนุมัติและตอนอนุมัติแล้ว", async () => {
    const doc = await createCostControl();
    await api(`/api/cost-controls/${encodeURIComponent(doc.id)}/submit-approval`, { method: "POST" });
    const whilePending = await api(`/api/cost-controls/${encodeURIComponent(doc.id)}`, {
      method: "PATCH", body: JSON.stringify({ jobName: "แก้ระหว่างรออนุมัติ" }),
    });
    expect(whilePending.status).toBe(400);

    await api(`/api/cost-controls/${encodeURIComponent(doc.id)}/approve`, { method: "POST" });
    const whenFinal = await api(`/api/cost-controls/${encodeURIComponent(doc.id)}`, {
      method: "PATCH", body: JSON.stringify({ jobName: "แก้หลังอนุมัติ" }),
    });
    expect(whenFinal.status).toBe(400);
  });

  it("บันทึกอัตโนมัติบนใบที่ไม่ใช่ร่างได้ 409 ไม่ใช่ 400 — ให้ฝั่งหน้าเว็บแยกออกว่าเป็นการชนสถานะ", async () => {
    const doc = await createCostControl();
    await approve(doc.id);
    const res = await api(`/api/cost-controls/${encodeURIComponent(doc.id)}?autoSave=1`, {
      method: "PATCH", body: JSON.stringify({ jobName: "auto" }),
    });
    expect(res.status).toBe(409);
  });

  it("Rewrite ได้ฉบับ -R1 เป็นร่างใหม่ และฉบับเดิมยังอนุมัติอยู่", async () => {
    const doc = await createCostControl();
    await approve(doc.id);
    const res = await api(`/api/cost-controls/${encodeURIComponent(doc.id)}/rewrite`, { method: "POST" });
    expect(res.status).toBe(201);
    const rewritten = (await json<{ costControl: CostControlDoc }>(res)).costControl;
    expect(rewritten.id).toBe(`${doc.id}-R1`);
    expect(rewritten.status).toBe("Draft");
    // รายการต้องตามมาครบ ไม่ใช่ได้ใบเปล่า
    expect(rewritten.lines).toHaveLength(3);

    const original = await json<{ costControl: CostControlDoc }>(await api(`/api/cost-controls/${encodeURIComponent(doc.id)}`));
    expect(original.costControl.status).toBe("Final");
  });

  it("ใบร่างยัง Rewrite ไม่ได้ — ต้องอนุมัติก่อน", async () => {
    const doc = await createCostControl();
    const res = await api(`/api/cost-controls/${encodeURIComponent(doc.id)}/rewrite`, { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("เลขที่เอกสารซ้ำกันไม่ได้", async () => {
    const a = await createCostControl();
    const b = await createCostControl();
    const res = await api(`/api/cost-controls/${encodeURIComponent(b.id)}`, {
      method: "PATCH", body: JSON.stringify({ documentNumber: a.documentNumber }),
    });
    expect(res.status).toBe(409);
  });
});

describe("สิทธิ์ Cost Control", () => {
  it("บทบาทที่ไม่มีสิทธิ์โดน 403 ทุก route ไม่ใช่ได้รายการว่าง", async () => {
    const roleRes = await api("/api/roles", {
      method: "POST",
      body: JSON.stringify({ name: "No BD", description: "", permissions: ["quotation:view"] }),
    });
    expect(roleRes.status).toBe(201);
    const roleKey = (await json<{ role: { key: string } }>(roleRes)).role.key;

    const userRes = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        employeeId: "E098", fullName: "No BD", username: "nobd", email: "nobd@test.local",
        password: "correct-horse-8", roleKey, department: "Sales",
      }),
    });
    expect(userRes.status).toBe(201);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "nobd", password: "correct-horse-8" }),
    });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const asUser = (path: string, init: RequestInit = {}) =>
      fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });

    expect((await asUser("/api/cost-controls")).status).toBe(403);
    expect((await asUser("/api/cost-controls", { method: "POST", body: "{}" })).status).toBe(403);
  });
});
