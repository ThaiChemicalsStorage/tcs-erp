import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { DepartmentDashboardResponse } from "../../src/lib/departmentDashboard";
import { purchaseOrderTotals } from "../../src/lib/purchaseOrder";
import { receivingReportTotals } from "../../src/lib/receivingReport";

/**
 * `GET /api/dashboard/departments` (2026-09-14) — ตัวเลขของแท็บแผนกบนหน้าแดชบอร์ด
 *
 * The things worth pinning:
 *   1. **Routing.** It shares the `dashboard` route key with the sales dashboard, whose handler
 *      ignores the pathname — so the dispatch must run first, and the sales payload must still work.
 *   2. **Each number means what its label says** — especially the ones assembled in memory
 *      (PO awaiting receipt, MR awaiting issue, stock value) rather than a single count.
 *   3. **Snapshot vs period.** A document outside the date range drops out of "selected period"
 *      numbers only, never out of "as of now" ones.
 *   4. **Permissions.** A block is `null` without the tab's view permission; a number inside a block
 *      is `null` without that document type's own permission.
 *   5. **BD carries no money** — the owner removed every Cost Control total on 2026-08-31.
 */

const PASSWORD = "correct-horse-1";

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let adminId: string;
let today: string;
let addDays: (iso: string, n: number) => string;

async function get(path: string, cookie = adminCookie): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: { cookie } });
}

async function dept(view: string, query = "", cookie = adminCookie): Promise<DepartmentDashboardResponse> {
  const res = await get(`/api/dashboard/departments?dept=${view}${query}`, cookie);
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as DepartmentDashboardResponse;
}

async function loginAs(username: string, permissions: string[]): Promise<{ cookie: string; userId: string }> {
  const { rolesCollection, usersCollection } = await import("../../api/_lib/collections.js");
  const roles = await rolesCollection();
  const users = await usersCollection();
  const now = new Date().toISOString();
  await roles.insertOne({
    key: `role-${username}`, name: username, description: "", isSuperAdmin: false, isSystem: false,
    permissions, createdAt: now, updatedAt: now,
  } as never);
  const inserted = await users.insertOne({
    employeeId: username, fullName: username, username, email: `${username}@test.local`,
    passwordHash: (await users.findOne({ username: "admin" }))!.passwordHash,
    roleKey: `role-${username}`, status: "active", createdAt: now, updatedAt: now,
  } as never);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: username, password: PASSWORD }),
  });
  expect(login.status).toBe(200);
  return { cookie: (login.headers.get("set-cookie") ?? "").split(";")[0], userId: inserted.insertedId.toString() };
}

const base = () => ({ isDeleted: false, createdBy: adminId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const poLine = { id: "l1", productId: null, productCode: "", description: "ของ", subDetails: [], unit: "ชิ้น", qty: 2, unitPrice: 100, discount: 0, remark: "" };
const RR_C = {
  purchaseOrderId: "PO-C", status: "Open", orderVatRate: 7, orderDiscount: 0,
  lines: [{ id: "l1", qtyOrdered: 10, unitPriceOrdered: 50, discount: 0 }],
  batches: [{ id: "b1", total: 107, lines: [] }],
};

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
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: PASSWORD }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: PASSWORD }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const shared = await import("../../api/_lib/dashboardShared.js");
  today = shared.todayIsoDate();
  addDays = shared.addDaysIso;
  const c = await import("../../api/_lib/collections.js");
  adminId = (await (await c.usersCollection()).findOne({ username: "admin" }))!._id.toString();

  // ── จัดซื้อ ──
  await (await c.purchaseOrdersCollection()).insertMany([
    // อนุมัติแล้ว ยังไม่มีใบรับ เลยวันต้องการรับของ · ออกใบเดือนมกราคม
    { _id: "PO-A", ...base(), status: "Final", documentNumber: "PO-A", purchaseRequestId: "PR-2", vendorName: "ผู้ขาย A", orderDate: "2026-01-15", neededByDate: addDays(today, -1), lines: [poLine], vatRate: 7 },
    // ใบรับปิดแล้ว = รับครบ
    { _id: "PO-B", ...base(), status: "Final", documentNumber: "PO-B", purchaseRequestId: "", vendorName: "ผู้ขาย B", orderDate: "2025-06-01", neededByDate: addDays(today, 5), lines: [poLine], vatRate: null },
    // ใบรับยังเปิด = ยังรับไม่ครบ แต่ยังไม่มีวันต้องการรับของ
    { _id: "PO-C", ...base(), status: "Final", documentNumber: "PO-C", purchaseRequestId: "", vendorName: "ผู้ขาย C", orderDate: "2026-03-01", neededByDate: "", lines: [poLine], vatRate: 7 },
    { _id: "PO-D", ...base(), status: "PendingApproval", documentNumber: "PO-D", purchaseRequestId: "", vendorName: "", orderDate: "", neededByDate: "", lines: [], vatRate: null },
    { _id: "PO-E", ...base(), isDeleted: true, status: "Final", documentNumber: "PO-E", purchaseRequestId: "", vendorName: "", orderDate: "2026-01-20", neededByDate: addDays(today, -9), lines: [poLine], vatRate: 7 },
  ] as never);
  await (await c.receivingReportsCollection()).insertMany([
    { ...base(), purchaseOrderId: "PO-B", status: "Closed", lines: [], batches: [], orderVatRate: null },
    { ...base(), ...RR_C },
  ] as never);
  await (await c.purchaseRequestsCollection()).insertMany([
    { _id: "PR-1", ...base(), status: "Final", storeStage: "forwarded", ownerDepartment: "general" },
    // ใบก่อน 2026-09-09 ไม่มี storeStage และมีใบสั่งซื้อแล้ว (PO-A) — ถึงจัดซื้อแล้ว แต่ไม่รอออกใบ
    { _id: "PR-2", ...base(), status: "Final" },
    { _id: "PR-3", ...base(), status: "Final", storeStage: "pending", ownerDepartment: "project" },
    { _id: "PR-4", ...base(), status: "Draft", ownerDepartment: "production" },
  ] as never);

  // ── คลังสินค้า ──
  await (await c.productsCollection()).insertMany([
    { code: "P1", name: "ถึงจุดเตือน", unit: "ชิ้น", stockQty: 5, avgCost: 10, reorderPoint: 5, archived: false },
    { code: "P2", name: "ติดลบ ไม่ตั้งจุดเตือน", unit: "ชิ้น", stockQty: -3, avgCost: 100, reorderPoint: 0, archived: false },
    { code: "P3", name: "เก็บถาวร", unit: "ชิ้น", stockQty: 20, avgCost: 2, reorderPoint: 50, archived: true },
    { code: "P4", name: "ปกติ", unit: "ชิ้น", stockQty: 10, avgCost: 3, reorderPoint: 2, archived: false },
  ] as never);
  await (await c.stockMovementsCollection()).insertMany([
    { productId: "p1", productCode: "P1", productName: "ถึงจุดเตือน", kind: "receive", delta: 5, balanceAfter: 5, amount: 100, reason: "", sourceType: "manual", createdAt: new Date().toISOString(), createdBy: "" },
    { productId: "p1", productCode: "P1", productName: "ถึงจุดเตือน", kind: "deduct", delta: -2, balanceAfter: 3, amount: 40, reason: "", sourceType: "manual", createdAt: "2020-01-01T00:00:00.000Z", createdBy: "" },
  ] as never);
  await (await c.materialRequisitionsCollection()).insertMany([
    { _id: "MR-1", ...base(), status: "Final", ownerDepartment: "production", lines: [{ plannedQty: 5, withdrawal1Qty: 2, withdrawal2Qty: null }] },
    { _id: "MR-2", ...base(), status: "Final", lines: [{ plannedQty: 3, withdrawal1Qty: 3, withdrawal2Qty: null }] },
    { _id: "MR-3", ...base(), status: "Draft", ownerDepartment: "production", lines: [{ plannedQty: 9, withdrawal1Qty: null, withdrawal2Qty: null }] },
  ] as never);

  // ── ผลิต ──
  await (await c.productionOrdersCollection()).insertMany([
    { _id: "PD-1", ...base(), status: "Final", documentNumber: "PD-1", customerCompanyName: "ลูกค้า", productName: "ถัง", startDate: today, dueDate: addDays(today, 3) },
    { _id: "PD-2", ...base(), status: "Final", documentNumber: "PD-2", customerCompanyName: "ลูกค้า", productName: "ท่อ", startDate: "2020-01-01", dueDate: addDays(today, -2) },
    { _id: "PD-3", ...base(), status: "PendingApproval", documentNumber: "PD-3", startDate: "", dueDate: "" },
  ] as never);

  // ── BD — มีต้นทุนในบรรทัด เพื่อพิสูจน์ว่าไม่หลุดออกมาในคำตอบ ──
  await (await c.costControlsCollection()).insertMany([
    { ...base(), status: "Final", documentNumber: "CC-1", jobName: "งาน 1", scopeOfWorkId: "SOW-1", docDate: today, lines: [{ qty: 2, unitCost: 5000 }], totalCost: 10000 },
    { ...base(), status: "Draft", documentNumber: "CC-2", jobName: "งาน 2", scopeOfWorkId: "", docDate: "2020-01-01", lines: [{ qty: 1, unitCost: 700 }] },
  ] as never);

  // ── บริการ ──
  await (await c.serviceReportsCollection()).insertMany([
    { _id: "SR-1", ...base(), status: "Completed", inspectionDate: today, nextPmDate: addDays(today, 10), customerApproval: { status: "pending" }, customerSnapshot: { companyName: "ลูกค้า 1" }, serviceSystemName: "Scrubber" },
    { _id: "SR-2", ...base(), status: "Draft", inspectionDate: "2020-01-01", nextPmDate: addDays(today, 40), customerApproval: null },
    { _id: "SR-3", ...base(), status: "Cancelled", inspectionDate: today, nextPmDate: addDays(today, 5), customerApproval: { status: "rejected" } },
  ] as never);
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("แดชบอร์ดแผนก — เส้นทาง", () => {
  it("ถูก map ใน Express (ไม่มีคุกกี้ = 401 ไม่ใช่ 404 หรือ payload ขาย)", async () => {
    expect((await fetch(`${baseUrl}/api/dashboard/departments?dept=overview`)).status).toBe(401);
  });

  it("แท็บที่ไม่รู้จัก และวันที่ผิดรูปแบบ = 400", async () => {
    expect((await get("/api/dashboard/departments?dept=hr")).status).toBe(400);
    expect((await get("/api/dashboard/departments?dept=bd&from=14/09/2026")).status).toBe(400);
  });

  it("แดชบอร์ดขายเดิมยังตอบ payload ของมันตามปกติ", async () => {
    const res = await get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveProperty("kpis");
  });
});

describe("แดชบอร์ดแผนก — ภาพรวม", () => {
  it("มีทุกบล็อกที่มีสิทธิ์ แต่ไม่มีรายละเอียด และมีใบรออนุมัติ + กิจกรรมล่าสุด", async () => {
    const res = await dept("overview");
    for (const key of ["service", "purchasing", "inventory", "production", "project", "bd"] as const) {
      expect(res.blocks[key], key).not.toBeNull();
      expect(res.blocks[key]?.detail, key).toBeNull();
    }
    expect(res.failed).toEqual([]);
    expect(res.pendingApprovals?.find((r) => r.kind === "purchaseOrder")?.count).toBe(1);
    expect(res.pendingApprovals?.find((r) => r.kind === "productionOrder")?.count).toBe(1);
    expect(Array.isArray(res.activityTimeline)).toBe(true);
  });

  it("จำนวนรออนุมัติตรงกับกล่องเอกสารรออนุมัติทุกชนิด", async () => {
    const res = await dept("overview");
    const listRes = await get("/api/pending-approvals");
    const { items } = (await listRes.json()) as { items: { kind: string }[] };
    for (const row of res.pendingApprovals ?? []) {
      expect(row.count, row.kind).toBe(items.filter((i) => i.kind === row.kind).length);
    }
  });
});

describe("แดชบอร์ดแผนก — จัดซื้อ", () => {
  it("นับใบรอออกใบสั่งซื้อ รออนุมัติ รอรับของ และเลยกำหนด ถูกความหมาย", async () => {
    const { blocks } = await dept("purchasing");
    const b = blocks.purchasing!;
    expect(b.summary).toEqual({ prAwaitingPo: 1, poPending: 1, poAwaitingReceipt: 2, poOverdue: 1 });
    expect(b.detail?.overduePurchaseOrders?.map((r) => r.id)).toEqual(["PO-A"]);
    expect(b.detail?.prStage).toEqual({ atStore: 1, atPurchasing: 2, closedByStore: 0 });
    const production = b.detail?.prStatusByDepartment?.find((r) => r.ownerDepartment === "production");
    expect(production?.counts).toEqual({ draft: 1, pending: 0, final: 0 });
  });

  it("มูลค่าใบสั่งซื้อในช่วงที่เลือกคิดด้วยตัวคำนวณเดียวกับใบสั่งซื้อ และช่วงวันที่ไม่กระทบตัวเลข ณ ปัจจุบัน", async () => {
    const { blocks } = await dept("purchasing", "&from=2026-01-01&to=2026-01-31");
    const b = blocks.purchasing!;
    const expected = purchaseOrderTotals({ lines: [poLine] as never, vatRate: 7 }).total;
    expect(b.detail?.poApprovedInPeriod).toEqual({ count: 1, value: expected });
    expect(b.summary.poAwaitingReceipt).toBe(2);
  });
});

describe("แดชบอร์ดแผนก — คลังสินค้า", () => {
  it("มูลค่าสต๊อกไม่นับยอดติดลบและสินค้าเก็บถาวร · จุดเตือน 0 ไม่นับว่าใกล้หมด", async () => {
    const b = (await dept("inventory")).blocks.inventory!;
    expect(b.summary.stockValue).toBe(5 * 10 + 0 + 10 * 3);
    expect(b.summary.lowStock).toBe(1);
    expect(b.detail?.lowStockItems?.map((p) => p.code)).toEqual(["P1"]);
  });

  it("ใบเบิกรอจ่ายนับเฉพาะใบอนุมัติที่ยังค้างจ่าย · ใบรับที่ยังเปิดและยอดค้างรับตรงกับหน้าใบรับสินค้า", async () => {
    const b = (await dept("inventory")).blocks.inventory!;
    expect(b.summary.mrAwaitingIssue).toBe(1);
    expect(b.summary.openReceivingReports).toBe(1);
    expect(b.detail?.outstandingReceiveValue).toBe(receivingReportTotals(RR_C as never).outstandingValue);
  });

  it("ความเคลื่อนไหวของสต๊อกเป็นตัวเลขตามช่วงที่เลือก", async () => {
    const all = (await dept("inventory")).blocks.inventory!;
    expect(all.detail?.movementsByKind?.find((m) => m.kind === "deduct")?.count).toBe(1);
    const recent = (await dept("inventory", `&from=${today.slice(0, 4)}-01-01`)).blocks.inventory!;
    expect(recent.detail?.movementsByKind?.find((m) => m.kind === "deduct")?.count).toBe(0);
    expect(recent.detail?.movementsByKind?.find((m) => m.kind === "receive")).toEqual({ kind: "receive", count: 1, amount: 100 });
    expect(recent.summary.stockValue).toBe(all.summary.stockValue);
  });
});

describe("แดชบอร์ดแผนก — ผลิต / โครงการ", () => {
  it("ผลิต: ใกล้กำหนด เลยกำหนด และใบเบิกของฝ่ายผลิตที่ค้างจ่าย", async () => {
    const b = (await dept("production")).blocks.production!;
    expect(b.summary).toEqual({ pending: 1, dueSoon: 1, pastDue: 1, mrAwaitingIssue: 1 });
    expect(b.detail?.dueList.map((r) => r.id)).toEqual(["PD-2", "PD-1"]);
    expect(b.detail?.startedInPeriod).toBe(3);
    const inRange = (await dept("production", `&from=${today}&to=${today}`)).blocks.production!;
    expect(inRange.detail?.startedInPeriod).toBe(1);
    expect(inRange.summary.pastDue).toBe(1);
  });

  it("โครงการ: ใบเบิกที่ไม่มี ownerDepartment เป็นของโครงการ · ใบขอซื้อที่ยังไม่ได้ของ", async () => {
    const b = (await dept("project")).blocks.project!;
    // MR-2 ของโครงการจ่ายครบแล้ว
    expect(b.summary.mrAwaitingIssue).toBe(0);
    // PR-3 (รอสโตร์) และ PR-2 (ไม่มี ownerDepartment) — แต่ PR-2 มีใบสั่งซื้อแล้ว จึงเหลือ PR-3 ใบเดียว
    expect(b.summary.prOpen).toBe(1);
  });
});

describe("แดชบอร์ดแผนก — BD", () => {
  it("นับจำนวนตามสถานะและการผูก Scope ได้ถูก", async () => {
    const b = (await dept("bd")).blocks.bd!;
    expect(b.summary).toEqual({ draft: 1, pending: 0, final: 1, createdInPeriod: 2 });
    expect(b.detail).toMatchObject({ linkedToScope: 1, standalone: 1 });
    expect((await dept("bd", `&from=${today}`)).blocks.bd!.summary.createdInPeriod).toBe(1);
  });

  it("ไม่มีตัวเลขเงินหลุดออกมาเลย ทั้งชื่อฟิลด์และค่าต้นทุนที่อยู่ในฐานข้อมูล", async () => {
    const b = (await dept("bd")).blocks.bd!;
    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) { keys.push(k); walk(v); }
      }
    };
    walk(b);
    expect(keys.filter((k) => /value|amount|total|cost|price/i.test(k))).toEqual([]);
    const body = JSON.stringify(b);
    expect(body).not.toContain("5000");
    expect(body).not.toContain("10000");
  });
});

describe("แดชบอร์ดแผนก — บริการ", () => {
  it("ร่าง ปิดงานเดือนนี้ รอลูกค้าอนุมัติ และ PM ใน 30 วัน (ไม่นับใบยกเลิก)", async () => {
    const b = (await dept("service")).blocks.service!;
    expect(b.summary).toEqual({ draft: 1, completedThisMonth: 1, approvalPending: 1 });
    expect(b.detail?.approvalRejected).toBe(1);
    expect(b.detail?.upcomingPmCount).toBe(1);
    expect(b.detail?.upcomingPm.map((r) => r.id)).toEqual(["SR-1"]);
    expect(b.detail?.counts).toMatchObject({ total: 3, draft: 1, completed: 1, cancelled: 1 });
  });
});

describe("แดชบอร์ดแผนก — สิทธิ์", () => {
  it("มีแค่สิทธิ์ดูสต๊อก = เห็นบล็อกคลังสินค้าบล็อกเดียว และตัวเลขที่ต้องใช้สิทธิ์อื่นเป็น null", async () => {
    const { cookie } = await loginAs("stockonly", ["dashboard:view", "stock:view"]);
    const res = await dept("overview", "", cookie);
    expect(res.blocks.inventory).not.toBeNull();
    for (const key of ["service", "purchasing", "production", "project", "bd"] as const) expect(res.blocks[key], key).toBeNull();
    expect(res.blocks.inventory?.summary.mrAwaitingIssue).toBeNull();
    expect(res.blocks.inventory?.summary.openReceivingReports).toBeNull();
    expect(res.pendingApprovals).toEqual([]);
    expect(res.activityTimeline).toBeNull();
    expect((await dept("purchasing", "", cookie)).blocks.purchasing).toBeNull();
  });

  it("ไม่มี dashboard:view = 403", async () => {
    const { cookie } = await loginAs("nodash", ["stock:view"]);
    expect((await get("/api/dashboard/departments?dept=overview", cookie)).status).toBe(403);
  });

  it("ไม่มี viewAll = นับเฉพาะใบของตัวเองกับใบที่ไม่มีเจ้าของ เหมือนหน้ารายการ", async () => {
    const { cookie, userId } = await loginAs("buyer", ["dashboard:view", "purchaseOrder:view"]);
    const c = await import("../../api/_lib/collections.js");
    await (await c.purchaseOrdersCollection()).insertMany([
      { _id: "PO-MINE", ...base(), createdBy: userId, status: "PendingApproval", lines: [] },
      { _id: "PO-LEGACY", ...base(), createdBy: "", status: "PendingApproval", lines: [] },
    ] as never);
    const b = (await dept("purchasing", "", cookie)).blocks.purchasing!;
    expect(b.scope).toBe("own");
    expect(b.summary.poPending).toBe(2);
    // ไม่มีสิทธิ์ดูใบขอซื้อ
    expect(b.summary.prAwaitingPo).toBeNull();
    expect((await dept("purchasing")).blocks.purchasing!.summary.poPending).toBe(3);
  });
});

describe("เอกสารรออนุมัติ — ใบเสนอราคาที่ไม่มีฟิลด์ isDeleted", () => {
  it("ขึ้นทั้งในกล่องรายการและในตัวนับของแดชบอร์ด", async () => {
    const { quotesCollection } = await import("../../api/_lib/collections.js");
    // ใบเสนอราคาจริงไม่มีฟิลด์ isDeleted เลย — เดิมกรอง isDeleted: false จึงไม่เคยขึ้นในกล่อง
    await (await quotesCollection()).insertOne({
      _id: "QT-NO-FLAG", client: "ลูกค้า", project: "", status: "รออนุมัติ", salesperson: "", issueDate: today, lines: [], approvalHistory: [],
    } as never);
    const listRes = await get("/api/pending-approvals");
    const { items } = (await listRes.json()) as { items: { id: string }[] };
    expect(items.map((i) => i.id)).toContain("QT-NO-FLAG");
    expect((await dept("overview")).pendingApprovals?.find((r) => r.kind === "quotation")?.count).toBe(1);
  });
});
