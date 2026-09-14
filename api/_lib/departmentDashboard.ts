import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError } from "./http.js";
import { requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause, buildCostControlVisibilityClause } from "./visibility.js";
import {
  purchaseOrdersCollection, purchaseRequestsCollection, receivingReportsCollection, productsCollection,
  stockMovementsCollection, materialRequisitionsCollection, productRequestsCollection, productionOrdersCollection,
  jobOrdersCollection, costControlsCollection, serviceReportsCollection,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import { purchaseOrderTotals } from "../../src/lib/purchaseOrder.js";
import { receivingReportTotals } from "../../src/lib/receivingReport.js";
import { stockValueOf, type StockMovementKind } from "../../src/lib/stock.js";
import { requisitionHasOutstanding } from "../../src/lib/materialRequisition.js";
import { DEPARTMENT_KEYS, canSeeDashboardTab, type DepartmentKey } from "../../src/lib/dashboardTabs.js";
import type {
  BlockScope, DepartmentBlock, DepartmentDashboardResponse, DepartmentDashboardView, DueItem, StatusCounts,
} from "../../src/lib/departmentDashboard.js";
import { countPendingApprovals } from "./pendingApprovals.js";
import {
  todayIsoDate, addDaysIso, bangkokDayBoundsUtc, fetchActivityTimeline, computeCategoryBreakdown,
  countDeliveryOrders, countServiceReports, serviceOwnershipClause,
} from "./dashboardShared.js";

/**
 * `GET /api/dashboard/departments?dept=overview|service|purchasing|inventory|production|project|bd&from&to`
 * — ตัวเลขของแท็บแผนกบนหน้าแดชบอร์ด (เพิ่ม 2026-09-14)
 *
 * เจ้าของสั่ง *"หน้า Dashboard อยากให้ทำให้ดูง่ายขึ้นแยกแต่ละแผนกอย่างชัดเจนแต่ก็ยังมี Dashboard ที่ดู
 * ข้อมูลรวมได้ทุกอย่างอยู่ด้วย"* · แท็บขายยังใช้ `GET /api/dashboard` เดิมทุกอย่าง และแท็บบัญชีใช้
 * `GET /api/ar-dashboard` เดิม — endpoint นี้คำนวณเฉพาะแผนกที่ก่อนหน้านี้ไม่มีตัวเลขบนแดชบอร์ดเลย
 *
 * **กติกาที่ต้องรักษา**
 *   1. ด่านของทั้ง route คือ `dashboard:view` (สิทธิ์ของหน้า) · แต่ละบล็อกเปิดด้วยกติกาแท็บใน
 *      `src/lib/dashboardTabs.ts` ซึ่งเป็นตัวเดียวกับที่หน้าจอใช้ซ่อนแท็บ · ตัวเลขแต่ละตัวในบล็อกยังเช็ก
 *      สิทธิ์ดูของเอกสารชนิดนั้นซ้ำอีกชั้น (แท็บหนึ่งรวมหลายชนิดเอกสาร) ไม่มีสิทธิ์ = `null`
 *   2. **นับเฉพาะใบที่หน้ารายการของผู้ใช้แสดง** — ทุก clause การมองเห็นลอกมาจาก `handleList` ของโมดูล
 *      นั้นตรง ๆ · ข้อยกเว้นที่ตั้งใจเหมือนต้นทาง: คิวตัดของของสโตร์ไม่กรองเจ้าของ (เปิดด้วย `stock:adjust`)
 *   3. **clause ความเป็นเจ้าของเป็น `$or` ห้าม spread สองอันซ้อนกัน** ใช้ `and()` ข้างล่างเสมอ (บั๊กเดียวกับ
 *      ที่แก้ใน MR/PR เมื่อ 2026-08-20i)
 *   4. บล็อกหนึ่งพังต้องไม่ทำให้ทั้งหน้าว่าง — บล็อกนั้นเป็น `null` และชื่ออยู่ใน `failed`
 *   5. BD ไม่มียอดเงินเลย ตามคำสั่งเจ้าของ 2026-08-31 ที่ถอดยอดรวมของ Cost Control ออก (มีเทสต์กันไว้)
 */

type Has = (permission: Permission) => boolean;

interface BlockContext {
  ctx: AuthContext;
  has: Has;
  from: string;
  to: string;
  today: string;
  /** false = ภาพรวม (ต้องการแค่ summary) */
  withDetail: boolean;
}

const DUE_SOON_DAYS = 7;
const PM_WINDOW_DAYS = 30;
const LIST_LIMIT = 10;

type Clause = Record<string, unknown>;

/** รวม clause ด้วย `$and` — ข้ามอันที่ว่าง เพื่อให้ query ที่ไม่มีเงื่อนไขเจ้าของยังอ่านง่ายใน log */
function and(...clauses: Clause[]): Clause {
  const nonEmpty = clauses.filter((c) => Object.keys(c).length > 0);
  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return nonEmpty[0];
  return { $and: nonEmpty };
}

/** ช่วงวันที่บนฟิลด์วันที่แบบข้อความ (YYYY-MM-DD) · ไม่เลือกช่วง = ไม่มีเงื่อนไข */
function periodClause(field: string, from: string, to: string): Clause {
  if (!from && !to) return {};
  const range: Record<string, string> = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return { [field]: range };
}

/** ตัวเดียวกับ `periodClause` สำหรับกรองในหน่วยความจำ — ช่วงที่เลือกแล้วใบที่ไม่มีวันที่ไม่นับ */
function inPeriod(date: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!date) return false;
  return (!from || date >= from) && (!to || date <= to);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type Countable = { countDocuments(filter: never): Promise<number> };
type Aggregatable = { aggregate(pipeline: never): { toArray(): Promise<unknown[]> } };

async function count(collection: Countable, filter: Clause): Promise<number> {
  return collection.countDocuments(filter as never);
}

/** จำนวนแยกสามสถานะของเครื่องอนุมัติร่วม (Draft / PendingApproval / Final) */
async function statusCounts(collection: Aggregatable, match: Clause): Promise<StatusCounts> {
  const rows = (await collection.aggregate([
    { $match: match },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ] as never).toArray()) as { _id: string; n: number }[];
  const by = new Map(rows.map((r) => [r._id, r.n]));
  return { draft: by.get("Draft") ?? 0, pending: by.get("PendingApproval") ?? 0, final: by.get("Final") ?? 0 };
}

/** ใบที่ไม่มี `ownerDepartment` เป็นของฝ่ายโครงการ — ตรงกับ handler ของหน้ารายการ MR/PR */
const PROJECT_OWNED: Clause = { $or: [{ ownerDepartment: "project" }, { ownerDepartment: { $exists: false } }] };
const PRODUCTION_OWNED: Clause = { ownerDepartment: "production" };

/** ใบเบิกที่อนุมัติแล้วและยังจ่ายไม่ครบ — ตัวตัดสินเดียวกับคิวของสโตร์ (`requisitionHasOutstanding`) */
async function countRequisitionsAwaitingIssue(match: Clause): Promise<number> {
  const col = await materialRequisitionsCollection();
  const docs = await col.find(
    and({ isDeleted: false, status: "Final" }, match) as never,
    { projection: { status: 1, "lines.plannedQty": 1, "lines.withdrawal1Qty": 1, "lines.withdrawal2Qty": 1 } },
  ).toArray();
  return docs.filter((d) => requisitionHasOutstanding({ status: d.status, lines: d.lines ?? [] })).length;
}

/** id ของใบขอซื้อที่มีใบสั่งซื้อผูกอยู่แล้ว (ไม่นับใบสั่งซื้อที่ถูกลบ) */
async function purchaseRequestIdsWithPo(): Promise<Set<string>> {
  const pos = await purchaseOrdersCollection();
  const ids = await pos.distinct("purchaseRequestId", { isDeleted: false } as never);
  return new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""));
}

const scopeOf = (...ownScoped: boolean[]): BlockScope => (ownScoped.some(Boolean) ? "own" : "all");

// ── จัดซื้อ ───────────────────────────────────────────────────────────────────

async function purchasingBlock({ ctx, has, from, to, today, withDetail }: BlockContext): Promise<DepartmentBlock<"purchasing">> {
  const canPo = has("purchaseOrder:view");
  const canPr = has("purchaseRequest:view");
  const poOwn = buildSimpleOwnershipClause(ctx.user.id, has("purchaseOrder:viewAll"), "createdBy");
  const prOwn = buildSimpleOwnershipClause(ctx.user.id, has("purchaseRequest:viewAll"), "createdBy");
  const [pos, prs, rrs] = await Promise.all([purchaseOrdersCollection(), purchaseRequestsCollection(), receivingReportsCollection()]);

  const summary: DepartmentBlock<"purchasing">["summary"] = { prAwaitingPo: null, poPending: null, poAwaitingReceipt: null, poOverdue: null };
  const detail: NonNullable<DepartmentBlock<"purchasing">["detail"]> = {
    poStatus: null, poApprovedInPeriod: null, prStatusByDepartment: null, prStage: null, overduePurchaseOrders: null,
  };

  if (canPo) {
    const approved = await pos.find(
      and({ isDeleted: false, status: "Final" }, poOwn) as never,
      { projection: { documentNumber: 1, vendorName: 1, neededByDate: 1, orderDate: 1, lines: 1, vatRate: 1, discount: 1, discountMode: 1 } },
    ).toArray();
    // ใบรับสินค้ามีได้ใบเดียวต่อใบสั่งซื้อ (unique index) · ไม่มีใบรับ = ยังไม่เริ่มรับ · Closed = รับครบหรือสโตร์ปิดใบ
    const receiving = await rrs.find(
      { isDeleted: false, purchaseOrderId: { $in: approved.map((p) => p._id.toString()) } } as never,
      { projection: { purchaseOrderId: 1, status: 1 } },
    ).toArray();
    const receivingStatusByPo = new Map(receiving.map((r) => [r.purchaseOrderId, r.status]));
    const awaiting = approved.filter((p) => receivingStatusByPo.get(p._id.toString()) !== "Closed");
    const overdue = awaiting
      .filter((p) => !!p.neededByDate && p.neededByDate < today)
      .sort((a, b) => a.neededByDate.localeCompare(b.neededByDate));

    summary.poAwaitingReceipt = awaiting.length;
    summary.poOverdue = overdue.length;
    summary.poPending = await count(pos, and({ isDeleted: false, status: "PendingApproval" }, poOwn));

    if (withDetail) {
      detail.poStatus = await statusCounts(pos, and({ isDeleted: false }, poOwn));
      const inRange = approved.filter((p) => inPeriod(p.orderDate, from, to));
      detail.poApprovedInPeriod = {
        count: inRange.length,
        value: round2(inRange.reduce((sum, p) => sum + purchaseOrderTotals({
          lines: p.lines ?? [], vatRate: p.vatRate ?? null, discount: p.discount, discountMode: p.discountMode,
        }).total, 0)),
      };
      detail.overduePurchaseOrders = overdue.slice(0, LIST_LIMIT).map((p): DueItem => ({
        id: p._id.toString(), docNumber: p.documentNumber || p._id.toString(), party: p.vendorName ?? "", date: p.neededByDate,
      }));
    }
  }

  if (canPr) {
    const [approved, linkedToPo] = await Promise.all([
      prs.find(and({ isDeleted: false, status: "Final" }, prOwn) as never, { projection: { storeStage: 1 } }).toArray(),
      purchaseRequestIdsWithPo(),
    ]);
    // ใบก่อน 2026-09-09 ไม่มี storeStage — วิ่งตรงไปจัดซื้อตามกติกาเดิม (เงื่อนไขเดียวกับกล่องของจัดซื้อ)
    const atPurchasing = approved.filter((p) => p.storeStage === "forwarded" || !p.storeStage);
    summary.prAwaitingPo = atPurchasing.filter((p) => !linkedToPo.has(p._id.toString())).length;

    if (withDetail) {
      detail.prStage = {
        atStore: approved.filter((p) => p.storeStage === "pending").length,
        atPurchasing: atPurchasing.length,
        closedByStore: approved.filter((p) => p.storeStage === "closed").length,
      };
      const rows = (await prs.aggregate([
        { $match: and({ isDeleted: false }, prOwn) },
        { $group: { _id: { department: { $ifNull: ["$ownerDepartment", "project"] }, status: "$status" }, n: { $sum: 1 } } },
      ] as never).toArray()) as { _id: { department: string; status: string }; n: number }[];
      detail.prStatusByDepartment = (["project", "production", "general"] as const).map((ownerDepartment) => {
        const of = (status: string) => rows.find((r) => r._id.department === ownerDepartment && r._id.status === status)?.n ?? 0;
        return { ownerDepartment, counts: { draft: of("Draft"), pending: of("PendingApproval"), final: of("Final") } };
      });
    }
  }

  return {
    scope: scopeOf(canPo && !has("purchaseOrder:viewAll"), canPr && !has("purchaseRequest:viewAll")),
    summary,
    detail: withDetail ? detail : null,
  };
}

// ── คลังสินค้า ────────────────────────────────────────────────────────────────

async function inventoryBlock({ ctx, has, from, to, withDetail }: BlockContext): Promise<DepartmentBlock<"inventory">> {
  const canStock = has("stock:view");
  const canReceiving = has("receivingReport:view");
  const canProductRequests = has("productRequest:view");
  // คิวตัดของ: หน้ารายการเปิดด้วย materialRequisition:view แล้วต้องมี stock:adjust อีกชั้น
  const canIssueQueue = has("stock:adjust") && has("materialRequisition:view");
  // กล่องใบขอซื้อรอสโตร์ใช้กติกาเดียวกัน — ต้องจ่ายของได้ถึงจะเป็นงานของคนนี้
  const canStoreInbox = has("stock:adjust") && has("purchaseRequest:view");

  const summary: DepartmentBlock<"inventory">["summary"] = { stockValue: null, lowStock: null, mrAwaitingIssue: null, openReceivingReports: null };
  const detail: NonNullable<DepartmentBlock<"inventory">["detail"]> = {
    outstandingReceiveValue: null, prAwaitingStore: null, pendingProductRequests: null,
    movementsByKind: null, recentMovements: null, lowStockItems: null, categoryBreakdown: [],
  };

  const tasks: Promise<void>[] = [];

  if (canStock) {
    tasks.push((async () => {
      const products = await (await productsCollection()).find(
        { archived: { $ne: true } } as never,
        { projection: { code: 1, name: 1, unit: 1, stockQty: 1, avgCost: 1, reorderPoint: 1 } },
      ).toArray();
      summary.stockValue = round2(products.reduce((sum, p) => sum + stockValueOf({ stockQty: p.stockQty ?? 0, avgCost: p.avgCost }), 0));
      // จุดเตือน 0 หรือไม่มีค่า = ปิดการเตือนของสินค้าตัวนั้น — กติกาเดียวกับหน้าสต๊อก (StockPage.tsx)
      const low = products.filter((p) => (p.reorderPoint ?? 0) > 0 && (p.stockQty ?? 0) <= (p.reorderPoint ?? 0));
      summary.lowStock = low.length;
      if (withDetail) {
        detail.lowStockItems = low
          .sort((a, b) => ((a.stockQty ?? 0) - (a.reorderPoint ?? 0)) - ((b.stockQty ?? 0) - (b.reorderPoint ?? 0)))
          .slice(0, LIST_LIMIT)
          .map((p) => ({ id: p._id.toString(), code: p.code, name: p.name, unit: p.unit, stockQty: p.stockQty ?? 0, reorderPoint: p.reorderPoint ?? 0 }));

        const movements = await stockMovementsCollection();
        const match: Clause = from || to ? { createdAt: bangkokDayBoundsUtc(from, to) } : {};
        const [byKind, recent] = await Promise.all([
          movements.aggregate([
            { $match: match },
            { $group: { _id: "$kind", count: { $sum: 1 }, amount: { $sum: { $ifNull: ["$amount", 0] } } } },
          ] as never).toArray() as Promise<{ _id: StockMovementKind; count: number; amount: number }[]>,
          movements.find(match as never, { projection: { productCode: 1, productName: 1, kind: 1, delta: 1, createdAt: 1 } })
            .sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray(),
        ]);
        detail.movementsByKind = (["receive", "deduct", "return", "adjust"] as const).map((kind) => {
          const row = byKind.find((r) => r._id === kind);
          return { kind, count: row?.count ?? 0, amount: round2(row?.amount ?? 0) };
        });
        detail.recentMovements = recent.map((m) => ({
          id: m._id.toString(), productCode: m.productCode, productName: m.productName, kind: m.kind, delta: m.delta, createdAt: m.createdAt,
        }));
      }
    })());
  }

  if (canIssueQueue) {
    tasks.push(countRequisitionsAwaitingIssue({}).then((n) => { summary.mrAwaitingIssue = n; }));
  }

  if (canReceiving) {
    tasks.push((async () => {
      const rrs = await receivingReportsCollection();
      const own = buildSimpleOwnershipClause(ctx.user.id, has("receivingReport:viewAll"), "createdBy");
      const open = await rrs.find(
        and({ isDeleted: false, status: "Open" }, own) as never,
        { projection: { lines: 1, batches: 1, orderVatRate: 1, orderDiscount: 1, orderDiscountMode: 1 } },
      ).toArray();
      summary.openReceivingReports = open.length;
      if (withDetail) {
        detail.outstandingReceiveValue = round2(open.reduce((sum, r) => sum + receivingReportTotals({
          lines: r.lines ?? [], batches: r.batches ?? [], orderVatRate: r.orderVatRate ?? null,
          orderDiscount: r.orderDiscount, orderDiscountMode: r.orderDiscountMode,
        }).outstandingValue, 0));
      }
    })());
  }

  if (withDetail && canStoreInbox) {
    tasks.push((async () => {
      const own = buildSimpleOwnershipClause(ctx.user.id, has("purchaseRequest:viewAll"), "createdBy");
      detail.prAwaitingStore = await count(await purchaseRequestsCollection(), and({ isDeleted: false, status: "Final", storeStage: "pending" }, own));
    })());
  }

  if (withDetail && canProductRequests) {
    tasks.push((async () => {
      // ผู้พิจารณาคำขอเห็นทุกใบ — กติกาเดียวกับ handleList ใน productRequestHandler.ts
      const seesAll = has("productRequest:viewAll") || has("productRequest:review");
      const own = buildSimpleOwnershipClause(ctx.user.id, seesAll, "requestedBy");
      detail.pendingProductRequests = await count(await productRequestsCollection(), and({ isDeleted: false, status: "Pending" }, own));
    })());
  }

  if (withDetail) {
    tasks.push(computeCategoryBreakdown().then((rows) => { detail.categoryBreakdown = rows; }));
  }

  await Promise.all(tasks);

  return {
    scope: scopeOf(canReceiving && !has("receivingReport:viewAll")),
    summary,
    detail: withDetail ? detail : null,
  };
}

// ── ผลิต ──────────────────────────────────────────────────────────────────────

async function productionBlock({ ctx, has, from, to, today, withDetail }: BlockContext): Promise<DepartmentBlock<"production">> {
  const orders = await productionOrdersCollection();
  const own = buildSimpleOwnershipClause(ctx.user.id, has("productionOrder:viewAll"), "createdBy");
  const base = and({ isDeleted: false }, own);
  const soon = addDaysIso(today, DUE_SOON_DAYS);
  const canRequisitions = has("materialRequisition:view");
  const mrOwn = buildSimpleOwnershipClause(ctx.user.id, has("materialRequisition:viewAll"), "createdBy");

  const [pending, dueSoon, pastDue, mrAwaitingIssue] = await Promise.all([
    count(orders, and(base, { status: "PendingApproval" })),
    count(orders, and(base, { status: "Final", dueDate: { $gte: today, $lte: soon } })),
    count(orders, and(base, { status: "Final", dueDate: { $gt: "", $lt: today } })),
    canRequisitions ? countRequisitionsAwaitingIssue(and(PRODUCTION_OWNED, mrOwn)) : Promise.resolve(null),
  ]);

  let detail: DepartmentBlock<"production">["detail"] = null;
  if (withDetail) {
    const canPr = has("purchaseRequest:view");
    const prOwn = buildSimpleOwnershipClause(ctx.user.id, has("purchaseRequest:viewAll"), "createdBy");
    const [status, startedInPeriod, due, requisitionStatus, purchaseRequestStatus, deliveryOrder] = await Promise.all([
      statusCounts(orders, base),
      count(orders, and(base, periodClause("startDate", from, to))),
      orders.find(
        and(base, { status: "Final", dueDate: { $gt: "", $lte: soon } }) as never,
        { projection: { documentNumber: 1, customerCompanyName: 1, productName: 1, dueDate: 1 } },
      ).sort({ dueDate: 1 }).limit(LIST_LIMIT).toArray(),
      canRequisitions ? statusCounts(await materialRequisitionsCollection(), and({ isDeleted: false }, PRODUCTION_OWNED, mrOwn)) : Promise.resolve(null),
      canPr ? statusCounts(await purchaseRequestsCollection(), and({ isDeleted: false }, PRODUCTION_OWNED, prOwn)) : Promise.resolve(null),
      has("deliveryOrder:view") ? countDeliveryOrders(ctx) : Promise.resolve(null),
    ]);
    detail = {
      status, startedInPeriod, requisitionStatus, purchaseRequestStatus, deliveryOrder,
      dueList: due.map((d): DueItem => ({
        id: d._id.toString(), docNumber: d.documentNumber || d._id.toString(),
        party: [d.customerCompanyName, d.productName].filter(Boolean).join(" · "), date: d.dueDate,
      })),
    };
  }

  return {
    scope: scopeOf(!has("productionOrder:viewAll"), canRequisitions && !has("materialRequisition:viewAll")),
    summary: { pending, dueSoon, pastDue, mrAwaitingIssue },
    detail,
  };
}

// ── โครงการ ───────────────────────────────────────────────────────────────────

async function projectBlock({ ctx, has, from, to, today, withDetail }: BlockContext): Promise<DepartmentBlock<"project">> {
  const canJobOrders = has("jobOrder:view");
  const canRequisitions = has("materialRequisition:view");
  const canPr = has("purchaseRequest:view");
  const jobs = await jobOrdersCollection();
  const jobBase = and({ isDeleted: false }, buildSimpleOwnershipClause(ctx.user.id, has("jobOrder:viewAll"), "createdBy"));
  const mrOwn = buildSimpleOwnershipClause(ctx.user.id, has("materialRequisition:viewAll"), "createdBy");
  const prOwn = buildSimpleOwnershipClause(ctx.user.id, has("purchaseRequest:viewAll"), "createdBy");
  const soon = addDaysIso(today, DUE_SOON_DAYS);

  const openProjectPurchaseRequests = async (): Promise<number> => {
    const [approved, linkedToPo] = await Promise.all([
      (await purchaseRequestsCollection()).find(
        and({ isDeleted: false, status: "Final" }, PROJECT_OWNED, prOwn) as never, { projection: { storeStage: 1 } },
      ).toArray(),
      purchaseRequestIdsWithPo(),
    ]);
    return approved.filter((p) => p.storeStage !== "closed" && !linkedToPo.has(p._id.toString())).length;
  };

  const [jobOrderPending, jobOrderDueSoon, mrAwaitingIssue, prOpen] = await Promise.all([
    canJobOrders ? count(jobs, and(jobBase, { status: "PendingApproval" })) : Promise.resolve(null),
    canJobOrders ? count(jobs, and(jobBase, { status: "Final", finishDate: { $gte: today, $lte: soon } })) : Promise.resolve(null),
    canRequisitions ? countRequisitionsAwaitingIssue(and(PROJECT_OWNED, mrOwn)) : Promise.resolve(null),
    canPr ? openProjectPurchaseRequests() : Promise.resolve(null),
  ]);

  let detail: DepartmentBlock<"project">["detail"] = null;
  if (withDetail) {
    const [jobOrderStatus, jobOrderStartedInPeriod, due, requisitionStatus, purchaseRequestStatus, deliveryOrder] = await Promise.all([
      canJobOrders ? statusCounts(jobs, jobBase) : Promise.resolve(null),
      canJobOrders ? count(jobs, and(jobBase, periodClause("startDate", from, to))) : Promise.resolve(null),
      canJobOrders
        ? jobs.find(
          and(jobBase, { status: "Final", finishDate: { $gt: "", $lte: soon } }) as never,
          { projection: { jobCode: 1, customerName: 1, finishDate: 1 } },
        ).sort({ finishDate: 1 }).limit(LIST_LIMIT).toArray()
        : Promise.resolve(null),
      canRequisitions ? statusCounts(await materialRequisitionsCollection(), and({ isDeleted: false }, PROJECT_OWNED, mrOwn)) : Promise.resolve(null),
      canPr ? statusCounts(await purchaseRequestsCollection(), and({ isDeleted: false }, PROJECT_OWNED, prOwn)) : Promise.resolve(null),
      has("deliveryOrder:view") ? countDeliveryOrders(ctx) : Promise.resolve(null),
    ]);
    detail = {
      jobOrderStatus, jobOrderStartedInPeriod, requisitionStatus, purchaseRequestStatus, deliveryOrder,
      dueList: due?.map((d): DueItem => ({
        id: d._id.toString(), docNumber: d._id.toString(), party: [d.jobCode, d.customerName].filter(Boolean).join(" · "), date: d.finishDate,
      })) ?? null,
    };
  }

  return {
    scope: scopeOf(
      canJobOrders && !has("jobOrder:viewAll"),
      canRequisitions && !has("materialRequisition:viewAll"),
      canPr && !has("purchaseRequest:viewAll"),
    ),
    summary: { jobOrderPending, jobOrderDueSoon, mrAwaitingIssue, prOpen },
    detail,
  };
}

// ── BD (Cost Control) ─────────────────────────────────────────────────────────

async function bdBlock({ ctx, has, from, to, withDetail }: BlockContext): Promise<DepartmentBlock<"bd">> {
  const costControls = await costControlsCollection();
  const base = and({ isDeleted: false }, await buildCostControlVisibilityClause(ctx, has("costControl:viewAll")));

  const [status, createdInPeriod] = await Promise.all([
    statusCounts(costControls, base),
    count(costControls, and(base, periodClause("docDate", from, to))),
  ]);

  let detail: DepartmentBlock<"bd">["detail"] = null;
  if (withDetail) {
    const [linkedToScope, total, recent] = await Promise.all([
      count(costControls, and(base, { scopeOfWorkId: { $gt: "" } })),
      count(costControls, base),
      // projection ไม่มี lines โดยตั้งใจ — แท็บนี้ห้ามมีตัวเลขเงิน
      costControls.find(base as never, { projection: { documentNumber: 1, jobName: 1, docDate: 1, status: 1 } })
        .sort({ updatedAt: -1 }).limit(LIST_LIMIT).toArray(),
    ]);
    detail = {
      linkedToScope,
      standalone: total - linkedToScope,
      recent: recent.map((d) => ({
        id: d._id.toString(), docNumber: d.documentNumber || d._id.toString(), party: d.jobName ?? "", date: d.docDate ?? "", status: d.status,
      })),
    };
  }

  return {
    scope: scopeOf(!has("costControl:viewAll")),
    summary: { ...status, createdInPeriod },
    detail,
  };
}

// ── บริการ ────────────────────────────────────────────────────────────────────

async function serviceBlock({ ctx, has, from, to, today, withDetail }: BlockContext): Promise<DepartmentBlock<"service">> {
  const reports = await serviceReportsCollection();
  const base = and({ isDeleted: false }, serviceOwnershipClause(ctx));
  const monthPrefix = today.slice(0, 7);

  const [draft, completedThisMonth, approvalPending] = await Promise.all([
    count(reports, and(base, { status: "Draft" })),
    count(reports, and(base, { status: "Completed", inspectionDate: { $regex: `^${monthPrefix}` } })),
    count(reports, and(base, { "customerApproval.status": "pending" })),
  ]);

  let detail: DepartmentBlock<"service">["detail"] = null;
  if (withDetail) {
    const pmWindow = and(base, { status: { $ne: "Cancelled" }, nextPmDate: { $gte: today, $lte: addDaysIso(today, PM_WINDOW_DAYS) } });
    const [counts, inspectedInPeriod, approvalRejected, upcomingPmCount, upcoming] = await Promise.all([
      countServiceReports(ctx, today),
      count(reports, and(base, periodClause("inspectionDate", from, to))),
      count(reports, and(base, { "customerApproval.status": "rejected" })),
      count(reports, pmWindow),
      reports.find(pmWindow as never, { projection: { customerSnapshot: 1, serviceSystemName: 1, nextPmDate: 1 } })
        .sort({ nextPmDate: 1 }).limit(LIST_LIMIT).toArray(),
    ]);
    detail = {
      counts, inspectedInPeriod, approvalPending, approvalRejected, upcomingPmCount,
      upcomingPm: upcoming.map((r): DueItem => ({
        id: r._id.toString(), docNumber: r._id.toString(),
        party: [r.customerSnapshot?.companyName, r.serviceSystemName].filter(Boolean).join(" · "), date: r.nextPmDate,
      })),
    };
  }

  return {
    scope: scopeOf(!has("service:viewAll")),
    summary: { draft, completedThisMonth, approvalPending },
    detail,
  };
}

// ── route ─────────────────────────────────────────────────────────────────────

const BLOCK_BUILDERS: { [K in DepartmentKey]: (c: BlockContext) => Promise<DepartmentBlock<K>> } = {
  service: serviceBlock,
  purchasing: purchasingBlock,
  inventory: inventoryBlock,
  production: productionBlock,
  project: projectBlock,
  bd: bdBlock,
};

const VIEWS = new Set<string>(["overview", ...DEPARTMENT_KEYS]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function queryString(req: VercelRequest, key: string): string {
  const v = req.query?.[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}

export async function handleDepartmentDashboard(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "dashboard:view");

  const view = queryString(req, "dept") || "overview";
  if (!VIEWS.has(view)) throw new HttpError(400, "ไม่รู้จักแท็บแดชบอร์ดนี้");
  const from = queryString(req, "from");
  const to = queryString(req, "to");
  if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) throw new HttpError(400, "รูปแบบวันที่ไม่ถูกต้อง");

  const has: Has = (p) => roleHasPermission(ctx.role, p);
  const today = todayIsoDate();
  const isOverview = view === "overview";
  const blockContext: BlockContext = { ctx, has, from, to, today, withDetail: !isOverview };

  const requested: DepartmentKey[] = isOverview ? [...DEPARTMENT_KEYS] : [view as DepartmentKey];
  const blocks: DepartmentDashboardResponse["blocks"] = {};
  const failed: DepartmentKey[] = [];

  await Promise.all(requested.map(async (key) => {
    if (!canSeeDashboardTab(key, has)) {
      blocks[key] = null;
      return;
    }
    try {
      (blocks as Record<DepartmentKey, unknown>)[key] = await BLOCK_BUILDERS[key](blockContext);
    } catch (err) {
      console.error(`[dashboard/departments] block "${key}" failed`, err);
      blocks[key] = null;
      failed.push(key);
    }
  }));

  let pendingApprovals: DepartmentDashboardResponse["pendingApprovals"] = null;
  let activityTimeline: DepartmentDashboardResponse["activityTimeline"] = null;
  if (isOverview) {
    try {
      pendingApprovals = await countPendingApprovals(ctx);
    } catch (err) {
      console.error("[dashboard/departments] pending approval counts failed", err);
    }
    if (has("auditLog:view")) {
      try {
        activityTimeline = (await fetchActivityTimeline({ from, to })) as unknown as DepartmentDashboardResponse["activityTimeline"];
      } catch (err) {
        console.error("[dashboard/departments] activity timeline failed", err);
      }
    }
  }

  const body: DepartmentDashboardResponse = {
    view: view as DepartmentDashboardView,
    filters: { from, to },
    today,
    blocks,
    pendingApprovals,
    activityTimeline,
    failed: failed.sort(),
  };
  res.status(200).json(body);
}
