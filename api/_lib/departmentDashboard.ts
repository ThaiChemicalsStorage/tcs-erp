import { kitAvailableQty } from "../../src/lib/products.js";
import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { HttpError } from "./http.js";
import { requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause, buildCostControlVisibilityClause } from "./visibility.js";
import {
  purchaseOrdersCollection, purchaseRequestsCollection, receivingReportsCollection, productsCollection,
  stockMovementsCollection, materialRequisitionsCollection, productRequestsCollection, productionOrdersCollection,
  jobOrdersCollection, costControlsCollection, serviceReportsCollection, categoriesCollection,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import { purchaseOrderTotals } from "../../src/lib/purchaseOrder.js";
import { receivingReportTotals } from "../../src/lib/receivingReport.js";
import { stockValueOf } from "../../src/lib/stock.js";
import { requisitionHasOutstanding } from "../../src/lib/materialRequisition.js";
import { DEPARTMENT_KEYS, OPERATIONS_DEPARTMENTS, canSeeDashboardTab, canSeeDepartmentBlock, type DepartmentKey } from "../../src/lib/dashboardTabs.js";
import type {
  AttentionItem, BlockScope, DepartmentBlock, DepartmentDashboardResponse, DepartmentDashboardView, DueItem,
  MonthCount, OpenPurchaseRequestStages, ServiceFollowUp, StatusCounts,
} from "../../src/lib/departmentDashboard.js";
import { countPendingApprovals } from "./pendingApprovals.js";
import { purchaseStateOf } from "./purchaseRequestHandler.js";
import { purchasingReceivedAtOf } from "../../src/lib/purchaseRequest.js";
import { businessDaysBetween, purchasingTargetDays, PURCHASING_TARGET_DAYS } from "../../src/lib/businessDays.js";
import type { PurchasingLeadTime, PurchaseRequestDept } from "../../src/lib/departmentDashboard.js";
import {
  todayIsoDate, addDaysIso, bangkokDayBoundsUtc, fetchActivityTimeline, countDeliveryOrders, serviceOwnershipClause,
} from "./dashboardShared.js";

/**
 * `GET /api/dashboard/departments?dept=overview|service|purchasing|inventory|operations&from&to`
 * — ตัวเลขของแท็บแผนกบนหน้าแดชบอร์ด (เพิ่ม 2026-09-14)
 *
 * เจ้าของสั่ง *"หน้า Dashboard อยากให้ทำให้ดูง่ายขึ้นแยกแต่ละแผนกอย่างชัดเจนแต่ก็ยังมี Dashboard ที่ดู
 * ข้อมูลรวมได้ทุกอย่างอยู่ด้วย"* · แท็บขายยังใช้ `GET /api/dashboard` เดิมทุกอย่าง และแท็บบัญชีใช้
 * `GET /api/ar-dashboard` เดิม — endpoint นี้คำนวณเฉพาะแผนกที่ก่อนหน้านี้ไม่มีตัวเลขบนแดชบอร์ดเลย
 * · รอบออกแบบใหม่ (2026-09-14 ตาม docs/DASHBOARD_DESIGN.md) เพิ่มชุดข้อมูล 12 เดือนให้กราฟ และรวม
 * ผลิต · โครงการ · BD เป็น `dept=operations` ตัวเดียว (ยังเป็นสามบล็อก สิทธิ์แยกกันเหมือนเดิม)
 *
 * **กติกาที่ต้องรักษา**
 *   1. ด่านของทั้ง route คือ `dashboard:view` (สิทธิ์ของหน้า) · แต่ละบล็อกเปิดด้วย `canSeeDepartmentBlock`
 *      ใน `src/lib/dashboardTabs.ts` ซึ่งเป็นตัวเดียวกับที่หน้าจอใช้ · ตัวเลขแต่ละตัวในบล็อกยังเช็ก
 *      สิทธิ์ดูของเอกสารชนิดนั้นซ้ำอีกชั้น (แท็บหนึ่งรวมหลายชนิดเอกสาร) ไม่มีสิทธิ์ = `null`
 *   2. **นับเฉพาะใบที่หน้ารายการของผู้ใช้แสดง** — ทุก clause การมองเห็นลอกมาจาก `handleList` ของโมดูล
 *      นั้นตรง ๆ · ข้อยกเว้นที่ตั้งใจเหมือนต้นทาง: คิวตัดของของสโตร์ไม่กรองเจ้าของ (เปิดด้วย `stock:adjust`)
 *   3. **clause ความเป็นเจ้าของเป็น `$or` ห้าม spread สองอันซ้อนกัน** ใช้ `and()` ข้างล่างเสมอ (บั๊กเดียวกับ
 *      ที่แก้ใน MR/PR เมื่อ 2026-08-20i)
 *   4. บล็อกหนึ่งพังต้องไม่ทำให้ทั้งหน้าว่าง — บล็อกนั้นเป็น `null` และชื่ออยู่ใน `failed`
 *   5. BD ไม่มียอดเงินเลย ตามคำสั่งเจ้าของ 2026-08-31 ที่ถอดยอดรวมของ Cost Control ออก (มีเทสต์กันไว้)
 *   6. ชุดข้อมูล `...ByMonth` คือ 12 เดือนล่าสุดสิ้นสุดเดือนนี้ **ไม่ขึ้นกับช่วงวันที่** และมีเฉพาะตัวเลขที่มี
 *      วันที่จริงบนเอกสาร — ตัวเลข ณ ปัจจุบัน (สต๊อก ใบรออนุมัติ) ไม่มีประวัติ ห้ามทำเป็นเส้นแนวโน้ม
 */

type Has = (permission: Permission) => boolean;

interface BlockContext {
  ctx: AuthContext;
  has: Has;
  from: string;
  to: string;
  today: string;
  /** "YYYY-MM" 12 ตัว เก่าสุดก่อน สิ้นสุดเดือนนี้ */
  months: string[];
  /** false = ภาพรวม (ต้องการแค่ summary) */
  withDetail: boolean;
}

const DUE_SOON_DAYS = 7;
const PM_WINDOW_DAYS = 30;
const STALE_DRAFT_DAYS = 7;
const LIST_LIMIT = 10;
const TREND_MONTHS = 12;
const TOP_VENDORS = 6;
const ATTENTION_LIMIT = 8;

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

/** 12 เดือนล่าสุดสิ้นสุดเดือนของ `today` — คิดบนปฏิทินล้วน */
export function lastMonthKeys(today: string, n = TREND_MONTHS): string[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return keys;
}

/** เงื่อนไข "ฟิลด์วันที่แบบข้อความอยู่ใน 12 เดือนนี้" */
function monthsClause(field: string, months: string[]): Clause {
  return { [field]: { $gte: `${months[0]}-01`, $lte: `${months[months.length - 1]}-31` } };
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

/** จำนวนเอกสารต่อเดือน นับตามฟิลด์วันที่แบบข้อความ — เดือนที่ไม่มีใบเป็น 0 */
async function monthlyCounts(collection: Aggregatable, match: Clause, field: string, months: string[]): Promise<MonthCount[]> {
  const rows = (await collection.aggregate([
    { $match: and(match, monthsClause(field, months)) },
    { $group: { _id: { $substrBytes: [`$${field}`, 0, 7] }, n: { $sum: 1 } } },
  ] as never).toArray()) as { _id: string; n: number }[];
  const by = new Map(rows.map((r) => [r._id, r.n]));
  return months.map((month) => ({ month, count: by.get(month) ?? 0 }));
}

/** ใบที่ไม่มี `ownerDepartment` เป็นของฝ่ายโครงการ — ตรงกับ handler ของหน้ารายการ MR/PR */
const PROJECT_OWNED: Clause = { $or: [{ ownerDepartment: "project" }, { ownerDepartment: { $exists: false } }] };
const PRODUCTION_OWNED: Clause = { ownerDepartment: "production" };

/** ใบเบิกที่อนุมัติแล้วและยังจ่ายไม่ครบ — ตัวตัดสินเดียวกับคิวของสโตร์ (`requisitionHasOutstanding`) */
async function requisitionsAwaitingIssue(match: Clause): Promise<{ ownerDepartment?: string }[]> {
  const col = await materialRequisitionsCollection();
  const docs = await col.find(
    and({ isDeleted: false, status: "Final" }, match) as never,
    { projection: { status: 1, ownerDepartment: 1, "lines.plannedQty": 1, "lines.withdrawal1Qty": 1, "lines.withdrawal2Qty": 1 } },
  ).toArray();
  return docs.filter((d) => requisitionHasOutstanding({ status: d.status, lines: d.lines ?? [] }));
}

async function countRequisitionsAwaitingIssue(match: Clause): Promise<number> {
  return (await requisitionsAwaitingIssue(match)).length;
}

/** id ของใบขอซื้อที่มีใบสั่งซื้อผูกอยู่แล้ว (ไม่นับใบสั่งซื้อที่ถูกลบ) */
async function purchaseRequestIdsWithPo(): Promise<Set<string>> {
  const pos = await purchaseOrdersCollection();
  const ids = await pos.distinct("purchaseRequestId", { isDeleted: false } as never);
  return new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""));
}

/** ใบขอซื้อที่อนุมัติแล้ว ยังไม่ได้ของ (สโตร์ยังไม่ปิด และยังไม่มีใบสั่งซื้อ) — แยกว่าอยู่ที่สโตร์หรือจัดซื้อ */
async function openPurchaseRequestStages(match: Clause): Promise<OpenPurchaseRequestStages> {
  const [approved, linkedToPo] = await Promise.all([
    (await purchaseRequestsCollection()).find(and({ isDeleted: false, status: "Final" }, match) as never, { projection: { storeStage: 1 } }).toArray(),
    purchaseRequestIdsWithPo(),
  ]);
  const open = approved.filter((p) => p.storeStage !== "closed" && !linkedToPo.has(p._id.toString()));
  return {
    atStore: open.filter((p) => p.storeStage === "pending").length,
    atPurchasing: open.filter((p) => p.storeStage !== "pending").length,
  };
}

const scopeOf = (...ownScoped: boolean[]): BlockScope => (ownScoped.some(Boolean) ? "own" : "all");

// ── จัดซื้อ ───────────────────────────────────────────────────────────────────

async function purchasingBlock({ ctx, has, from, to, today, months, withDetail }: BlockContext): Promise<DepartmentBlock<"purchasing">> {
  const canPo = has("purchaseOrder:view");
  const canPr = has("purchaseRequest:view");
  const poOwn = buildSimpleOwnershipClause(ctx.user.id, has("purchaseOrder:viewAll"), "createdBy");
  const prOwn = buildSimpleOwnershipClause(ctx.user.id, has("purchaseRequest:viewAll"), "createdBy");
  const [pos, prs, rrs] = await Promise.all([purchaseOrdersCollection(), purchaseRequestsCollection(), receivingReportsCollection()]);

  const summary: DepartmentBlock<"purchasing">["summary"] = { prAwaitingPo: null, poPending: null, poAwaitingReceipt: null, poOverdue: null };
  const detail: NonNullable<DepartmentBlock<"purchasing">["detail"]> = {
    poApprovedInPeriod: null, poValueByMonth: null, topVendors: null, receiptProgress: null,
    prAwaitingPoByDepartment: null, prStage: null, overduePurchaseOrders: null, leadTime: null,
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
      const totalOf = (p: (typeof approved)[number]) => purchaseOrderTotals({
        lines: p.lines ?? [], vatRate: p.vatRate ?? null, discount: p.discount, discountMode: p.discountMode,
      }).total;
      const withTotal = approved.map((p) => ({ p, total: totalOf(p) }));

      const inRange = withTotal.filter(({ p }) => inPeriod(p.orderDate, from, to));
      detail.poApprovedInPeriod = { count: inRange.length, value: round2(inRange.reduce((sum, r) => sum + r.total, 0)) };

      const byMonth = new Map<string, { count: number; value: number }>();
      for (const { p, total } of withTotal) {
        const month = (p.orderDate ?? "").slice(0, 7);
        const bucket = byMonth.get(month) ?? { count: 0, value: 0 };
        bucket.count += 1;
        bucket.value += total;
        byMonth.set(month, bucket);
      }
      detail.poValueByMonth = months.map((month) => ({
        month, count: byMonth.get(month)?.count ?? 0, value: round2(byMonth.get(month)?.value ?? 0),
      }));

      const byVendor = new Map<string, { count: number; value: number }>();
      for (const { p, total } of inRange) {
        const name = (p.vendorName ?? "").trim();
        if (!name) continue;
        const bucket = byVendor.get(name) ?? { count: 0, value: 0 };
        bucket.count += 1;
        bucket.value += total;
        byVendor.set(name, bucket);
      }
      detail.topVendors = [...byVendor.entries()]
        .map(([name, v]) => ({ name, count: v.count, value: round2(v.value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, TOP_VENDORS);

      detail.receiptProgress = { approved: approved.length, received: approved.length - awaiting.length };
      detail.overduePurchaseOrders = overdue.slice(0, LIST_LIMIT).map((p): DueItem => ({
        id: p._id.toString(), docNumber: p.documentNumber || p._id.toString(), party: p.vendorName ?? "", date: p.neededByDate,
      }));
    }
  }

  if (canPr) {
    const [approved, linkedToPo] = await Promise.all([
      prs.find(and({ isDeleted: false, status: "Final" }, prOwn) as never, { projection: { storeStage: 1, ownerDepartment: 1 } }).toArray(),
      purchaseRequestIdsWithPo(),
    ]);
    // ใบก่อน 2026-09-09 ไม่มี storeStage — วิ่งตรงไปจัดซื้อตามกติกาเดิม (เงื่อนไขเดียวกับกล่องของจัดซื้อ)
    const atPurchasing = approved.filter((p) => p.storeStage === "forwarded" || !p.storeStage);
    const awaitingPo = atPurchasing.filter((p) => !linkedToPo.has(p._id.toString()));
    summary.prAwaitingPo = awaitingPo.length;

    if (withDetail) {
      detail.prStage = {
        atStore: approved.filter((p) => p.storeStage === "pending").length,
        atPurchasing: atPurchasing.length,
        closedByStore: approved.filter((p) => p.storeStage === "closed").length,
      };
      const ofDepartment = (dept: string) => awaitingPo.filter((p) => (p.ownerDepartment ?? "project") === dept).length;
      detail.prAwaitingPoByDepartment = { project: ofDepartment("project"), production: ofDepartment("production"), general: ofDepartment("general") };
      detail.leadTime = await purchasingLeadTime(prOwn, from, to, today, months);
    }
  }

  return {
    scope: scopeOf(canPo && !has("purchaseOrder:viewAll"), canPr && !has("purchaseRequest:viewAll")),
    summary,
    detail: withDetail ? detail : null,
  };
}

// ── KPI ระยะเวลาออกใบสั่งซื้อ (2026-10-02) ──────────────────────────────────────

const LEAD_BUCKETS: { key: string; min: number; max: number | null }[] = [
  { key: "0", min: 0, max: 0 }, { key: "1", min: 1, max: 1 }, { key: "2", min: 2, max: 2 }, { key: "3", min: 3, max: 3 },
  { key: "4-5", min: 4, max: 5 }, { key: "6-7", min: 6, max: 7 }, { key: "8+", min: 8, max: null },
];
const QUEUE_LIMIT = 10;
const avg = (xs: number[]) => (xs.length === 0 ? null : round2(xs.reduce((a, b) => a + b, 0) / xs.length));

/**
 * เจ้าของสั่ง 2026-10-02: *"ได้ใบ PR มาแล้วใช้เวลากี่วันในการออกใบ PO"* — นับวันทำการ จ.–ศ. จากวันที่ใบถึงจัดซื้อ
 * จนวันที่ใบสั่งซื้อครอบบรรทัดสุดท้ายที่ต้องซื้อ (`purchaseStateOf()` ตัวเดียวกับหน้ารายการ) · ใบที่ถึงจัดซื้อแล้ว
 * แต่ยังไม่ครบนับเป็น "รออยู่" ถึงวันนี้ · ใช้ clause การมองเห็นเดียวกับหน้ารายการใบขอซื้อ
 */
async function purchasingLeadTime(prOwn: Clause, from: string, to: string, today: string, months: string[]): Promise<PurchasingLeadTime> {
  const prs = await purchaseRequestsCollection();
  const docs = await prs.find(and({ isDeleted: false, status: "Final" }, prOwn) as never, {
    projection: {
      status: 1, storeStage: 1, purchasingStage: 1, purchasingReceivedAt: 1, pulledToPurchasingAt: 1, storeReviewedAt: 1,
      approvedAt: 1, submittedAt: 1, requestedAt: 1, urgent: 1, ownerDepartment: 1, neededByDate: 1,
      "lines.id": 1, "lines.storeDecision": 1, "lines.purchasingApproval": 1,
    },
  }).toArray();
  const states = await purchaseStateOf(docs);

  type Row = { id: string; urgent: boolean; dept: PurchaseRequestDept; received: string; completed: string; days: number; target: number; doc: (typeof docs)[number] };
  const rows: Row[] = [];
  for (const doc of docs) {
    const received = purchasingReceivedAtOf(doc);
    if (!received || doc.storeStage === "closed") continue;
    const state = states.get(doc._id);
    if (!state) continue; // ไม่มีบรรทัดที่ต้องซื้อ (สโตร์จ่ายครบ / จัดซื้อไม่อนุมัติทุกบรรทัด)
    const completed = state.completedAt;
    const days = businessDaysBetween(received, completed || today) ?? 0;
    rows.push({
      id: doc._id, urgent: doc.urgent === true, dept: (doc.ownerDepartment ?? "project") as PurchaseRequestDept,
      received, completed, days, target: purchasingTargetDays(doc.urgent), doc,
    });
  }

  const done = rows.filter((r) => r.completed && inPeriod(r.completed, from, to));
  const urgentDone = done.filter((r) => r.urgent);
  const normalDone = done.filter((r) => !r.urgent);
  const onTime = (xs: Row[]) => xs.filter((r) => r.days <= r.target).length;

  const byMonth = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.completed) continue;
    const m = r.completed.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), r.days]);
  }

  const stageDays = { approval: [] as number[], store: [] as number[], purchasing: [] as number[] };
  for (const r of done) {
    const submitted = (r.doc.submittedAt || r.doc.requestedAt || "").slice(0, 10);
    const approved = (r.doc.approvedAt ?? "").slice(0, 10);
    const a = submitted && approved ? businessDaysBetween(submitted, approved) : null;
    const s = approved ? businessDaysBetween(approved, r.received) : null;
    if (a !== null && s !== null) {
      stageDays.approval.push(a);
      stageDays.store.push(s);
      stageDays.purchasing.push(r.days);
    }
  }

  const waiting = rows.filter((r) => !r.completed);
  const oldest = [...waiting].sort((a, b) => b.days - a.days)[0];
  const queue = [...waiting]
    .sort((a, b) => (a.urgent !== b.urgent ? (a.urgent ? -1 : 1) : b.days - a.days))
    .slice(0, QUEUE_LIMIT)
    .map((r) => ({
      id: r.id, urgent: r.urgent, dept: r.dept, receivedAt: r.received, days: r.days, target: r.target,
      neededByDate: r.doc.neededByDate ?? "", partial: states.get(r.id)?.state === "partial",
    }));

  return {
    targets: { normal: PURCHASING_TARGET_DAYS.normal, urgent: PURCHASING_TARGET_DAYS.urgent },
    completed: {
      count: done.length, urgentCount: urgentDone.length,
      avgDays: avg(done.map((r) => r.days)), avgUrgent: avg(urgentDone.map((r) => r.days)), avgNormal: avg(normalDone.map((r) => r.days)),
      onTime: onTime(done), onTimeUrgent: onTime(urgentDone), onTimeNormal: onTime(normalDone),
    },
    distribution: LEAD_BUCKETS.map((b) => {
      const inBucket = (r: Row) => r.days >= b.min && (b.max === null || r.days <= b.max);
      return { ...b, urgent: urgentDone.filter(inBucket).length, normal: normalDone.filter(inBucket).length };
    }),
    avgByMonth: months.map((month) => {
      const xs = byMonth.get(month) ?? [];
      return { month, avgDays: avg(xs), count: xs.length };
    }),
    byDepartment: (["project", "production", "general"] as const).map((dept) => {
      const xs = done.filter((r) => r.dept === dept);
      return { dept, count: xs.length, avgDays: avg(xs.map((r) => r.days)), onTime: onTime(xs) };
    }),
    stages: {
      approval: avg(stageDays.approval), store: avg(stageDays.store), purchasing: avg(stageDays.purchasing),
      count: stageDays.purchasing.length,
    },
    waiting: {
      count: waiting.length,
      urgent: waiting.filter((r) => r.urgent).length,
      over: waiting.filter((r) => r.days > r.target).length,
      due: waiting.filter((r) => r.days === r.target).length,
      oldestDays: oldest ? oldest.days : null,
      oldestId: oldest ? oldest.id : "",
    },
    queue,
  };
}

// ── คลังสินค้า ────────────────────────────────────────────────────────────────

async function inventoryBlock({ ctx, has, from, to, today, months, withDetail }: BlockContext): Promise<DepartmentBlock<"inventory">> {
  const canStock = has("stock:view");
  const canReceiving = has("receivingReport:view");
  const canProductRequests = has("productRequest:view");
  // คิวตัดของ: หน้ารายการเปิดด้วย materialRequisition:view แล้วต้องมี stock:adjust อีกชั้น
  const canIssueQueue = has("stock:adjust") && has("materialRequisition:view");
  // กล่องใบขอซื้อรอสโตร์ใช้กติกาเดียวกัน — ต้องจ่ายของได้ถึงจะเป็นงานของคนนี้
  const canStoreInbox = has("stock:adjust") && has("purchaseRequest:view");

  const summary: DepartmentBlock<"inventory">["summary"] = { stockValue: null, lowStock: null, mrAwaitingIssue: null, openReceivingReports: null };
  const detail: NonNullable<DepartmentBlock<"inventory">["detail"]> = {
    outstandingReceiveValue: null, prAwaitingStore: null, pendingProductRequests: null, outOfStock: null,
    mrAwaitingIssueByDepartment: null, movementsByMonth: null, recentMovements: null, lowStockItems: null, stockValueByCategory: null,
  };

  const tasks: Promise<void>[] = [];

  if (canStock) {
    tasks.push((async () => {
      const raw = await (await productsCollection()).find(
        { archived: { $ne: true } } as never,
        { projection: { code: 1, name: 1, unit: 1, stockQty: 1, avgCost: 1, reorderPoint: 1, categoryId: 1, kitComponents: 1 } },
      ).toArray();
      // สินค้าชุด (2026-09-29) ไม่มีสต๊อกของตัวเอง — ยอดคือจำนวนชุดที่เบิกได้จากชิ้นส่วน (มูลค่ายังเป็น 0 เพราะ avgCost ของชุดเป็น 0 ไม่นับซ้ำ)
      const stockById = new Map(raw.map((p) => [p._id.toString(), p.stockQty ?? 0]));
      const products = raw.map((p) => ((p.kitComponents?.length ?? 0) > 0 ? { ...p, stockQty: kitAvailableQty(p.kitComponents!, stockById) } : p));
      const valueOf = (p: (typeof products)[number]) => stockValueOf({ stockQty: p.stockQty ?? 0, avgCost: p.avgCost });
      summary.stockValue = round2(products.reduce((sum, p) => sum + valueOf(p), 0));
      // จุดเตือน 0 หรือไม่มีค่า = ปิดการเตือนของสินค้าตัวนั้น — กติกาเดียวกับหน้าสต๊อก (StockPage.tsx)
      const low = products.filter((p) => (p.reorderPoint ?? 0) > 0 && (p.stockQty ?? 0) <= (p.reorderPoint ?? 0));
      summary.lowStock = low.length;
      if (!withDetail) return;

      detail.outOfStock = low.filter((p) => (p.stockQty ?? 0) <= 0).length;
      detail.lowStockItems = low
        .sort((a, b) => ((a.stockQty ?? 0) - (a.reorderPoint ?? 0)) - ((b.stockQty ?? 0) - (b.reorderPoint ?? 0)))
        .slice(0, LIST_LIMIT)
        .map((p) => ({ id: p._id.toString(), code: p.code, name: p.name, unit: p.unit, stockQty: p.stockQty ?? 0, reorderPoint: p.reorderPoint ?? 0 }));

      const categoryDocs = await (await categoriesCollection()).find({}, { projection: { name: 1 } }).toArray();
      const categoryName = new Map(categoryDocs.map((c) => [c._id.toString(), c.name]));
      const valueByCategory = new Map<string, number>();
      for (const p of products) {
        const value = valueOf(p);
        if (value <= 0) continue;
        valueByCategory.set(p.categoryId ?? "", (valueByCategory.get(p.categoryId ?? "") ?? 0) + value);
      }
      detail.stockValueByCategory = [...valueByCategory.entries()]
        .map(([categoryId, value]) => ({ categoryId, categoryName: categoryName.get(categoryId) ?? "ไม่ระบุหมวดหมู่", value: round2(value) }))
        .sort((a, b) => b.value - a.value);

      const movements = await stockMovementsCollection();
      const periodMatch: Clause = from || to ? { createdAt: bangkokDayBoundsUtc(from, to) } : {};
      const [byMonth, recent] = await Promise.all([
        movements.aggregate([
          { $match: { kind: { $in: ["receive", "deduct"] }, createdAt: bangkokDayBoundsUtc(`${months[0]}-01`, today) } },
          {
            $group: {
              _id: { month: { $dateToString: { format: "%Y-%m", date: { $toDate: "$createdAt" }, timezone: "+07:00" } }, kind: "$kind" },
              amount: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
        ] as never).toArray() as Promise<{ _id: { month: string; kind: "receive" | "deduct" }; amount: number }[]>,
        movements.find(periodMatch as never, { projection: { productCode: 1, productName: 1, kind: 1, delta: 1, createdAt: 1 } })
          .sort({ createdAt: -1 }).limit(LIST_LIMIT).toArray(),
      ]);
      const amountOf = (month: string, kind: string) => round2(Math.abs(byMonth.find((r) => r._id.month === month && r._id.kind === kind)?.amount ?? 0));
      detail.movementsByMonth = months.map((month) => ({ month, receive: amountOf(month, "receive"), deduct: amountOf(month, "deduct") }));
      detail.recentMovements = recent.map((m) => ({
        id: m._id.toString(), productCode: m.productCode, productName: m.productName, kind: m.kind, delta: m.delta, createdAt: m.createdAt,
      }));
    })());
  }

  if (canIssueQueue) {
    tasks.push(requisitionsAwaitingIssue({}).then((docs) => {
      summary.mrAwaitingIssue = docs.length;
      if (withDetail) {
        const production = docs.filter((d) => d.ownerDepartment === "production").length;
        detail.mrAwaitingIssueByDepartment = { production, project: docs.length - production };
      }
    }));
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

  await Promise.all(tasks);

  return {
    scope: scopeOf(
      canReceiving && !has("receivingReport:viewAll"),
      withDetail && canStoreInbox && !has("purchaseRequest:viewAll"),
      withDetail && canProductRequests && !(has("productRequest:viewAll") || has("productRequest:review")),
    ),
    summary,
    detail: withDetail ? detail : null,
  };
}

// ── ผลิต ──────────────────────────────────────────────────────────────────────

async function productionBlock({ ctx, has, from, to, today, months, withDetail }: BlockContext): Promise<DepartmentBlock<"production">> {
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
    const prOwn = buildSimpleOwnershipClause(ctx.user.id, has("purchaseRequest:viewAll"), "createdBy");
    const [status, startedInPeriod, startedByMonth, due, prOpenStage, deliveryOrder] = await Promise.all([
      statusCounts(orders, base),
      count(orders, and(base, periodClause("startDate", from, to))),
      monthlyCounts(orders, base, "startDate", months),
      orders.find(
        and(base, { status: "Final", dueDate: { $gt: "", $lte: soon } }) as never,
        { projection: { documentNumber: 1, customerCompanyName: 1, productName: 1, dueDate: 1 } },
      ).sort({ dueDate: 1 }).limit(LIST_LIMIT).toArray(),
      has("purchaseRequest:view") ? openPurchaseRequestStages(and(PRODUCTION_OWNED, prOwn)) : Promise.resolve(null),
      has("deliveryOrder:view") ? countDeliveryOrders(ctx) : Promise.resolve(null),
    ]);
    detail = {
      status, startedInPeriod, startedByMonth, prOpenStage, deliveryOrder,
      dueList: due.map((d): DueItem => ({
        id: d._id.toString(), docNumber: d.documentNumber || d._id.toString(),
        party: [d.customerCompanyName, d.productName].filter(Boolean).join(" · "), date: d.dueDate,
      })),
    };
  }

  return {
    scope: scopeOf(
      !has("productionOrder:viewAll"),
      canRequisitions && !has("materialRequisition:viewAll"),
      withDetail && has("purchaseRequest:view") && !has("purchaseRequest:viewAll"),
    ),
    summary: { pending, dueSoon, pastDue, mrAwaitingIssue },
    detail,
  };
}

// ── โครงการ ───────────────────────────────────────────────────────────────────

async function projectBlock({ ctx, has, from, to, today, months, withDetail }: BlockContext): Promise<DepartmentBlock<"project">> {
  const canJobOrders = has("jobOrder:view");
  const canRequisitions = has("materialRequisition:view");
  const canPr = has("purchaseRequest:view");
  const jobs = await jobOrdersCollection();
  const jobBase = and({ isDeleted: false }, buildSimpleOwnershipClause(ctx.user.id, has("jobOrder:viewAll"), "createdBy"));
  const mrOwn = buildSimpleOwnershipClause(ctx.user.id, has("materialRequisition:viewAll"), "createdBy");
  const prOwn = buildSimpleOwnershipClause(ctx.user.id, has("purchaseRequest:viewAll"), "createdBy");
  const soon = addDaysIso(today, DUE_SOON_DAYS);

  const [jobOrderPending, jobOrderDueSoon, jobOrderPastDue, mrAwaitingIssue, prStages] = await Promise.all([
    canJobOrders ? count(jobs, and(jobBase, { status: "PendingApproval" })) : Promise.resolve(null),
    canJobOrders ? count(jobs, and(jobBase, { status: "Final", finishDate: { $gte: today, $lte: soon } })) : Promise.resolve(null),
    canJobOrders ? count(jobs, and(jobBase, { status: "Final", finishDate: { $gt: "", $lt: today } })) : Promise.resolve(null),
    canRequisitions ? countRequisitionsAwaitingIssue(and(PROJECT_OWNED, mrOwn)) : Promise.resolve(null),
    canPr ? openPurchaseRequestStages(and(PROJECT_OWNED, prOwn)) : Promise.resolve(null),
  ]);

  let detail: DepartmentBlock<"project">["detail"] = null;
  if (withDetail) {
    const [jobOrderStatus, jobOrderStartedInPeriod, startedByMonth, due, deliveryOrder] = await Promise.all([
      canJobOrders ? statusCounts(jobs, jobBase) : Promise.resolve(null),
      canJobOrders ? count(jobs, and(jobBase, periodClause("startDate", from, to))) : Promise.resolve(null),
      canJobOrders ? monthlyCounts(jobs, jobBase, "startDate", months) : Promise.resolve(null),
      canJobOrders
        ? jobs.find(
          and(jobBase, { status: "Final", finishDate: { $gt: "", $lte: soon } }) as never,
          { projection: { jobCode: 1, customerName: 1, finishDate: 1 } },
        ).sort({ finishDate: 1 }).limit(LIST_LIMIT).toArray()
        : Promise.resolve(null),
      has("deliveryOrder:view") ? countDeliveryOrders(ctx) : Promise.resolve(null),
    ]);
    detail = {
      jobOrderStatus, jobOrderStartedInPeriod, startedByMonth, deliveryOrder, prOpenStage: prStages,
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
    summary: { jobOrderPending, jobOrderDueSoon, jobOrderPastDue, mrAwaitingIssue, prOpen: prStages ? prStages.atStore + prStages.atPurchasing : null },
    detail,
  };
}

// ── BD (Cost Control) ─────────────────────────────────────────────────────────

async function bdBlock({ ctx, has, from, to, months, withDetail }: BlockContext): Promise<DepartmentBlock<"bd">> {
  const costControls = await costControlsCollection();
  const base = and({ isDeleted: false }, await buildCostControlVisibilityClause(ctx, has("costControl:viewAll")));

  const [status, createdInPeriod] = await Promise.all([
    statusCounts(costControls, base),
    count(costControls, and(base, periodClause("docDate", from, to))),
  ]);

  let detail: DepartmentBlock<"bd">["detail"] = null;
  if (withDetail) {
    const [linkedToScope, total, createdByMonth, recent] = await Promise.all([
      count(costControls, and(base, { scopeOfWorkId: { $gt: "" } })),
      count(costControls, base),
      monthlyCounts(costControls, base, "docDate", months),
      // projection ไม่มี lines โดยตั้งใจ — แท็บนี้ห้ามมีตัวเลขเงิน
      costControls.find(base as never, { projection: { documentNumber: 1, jobName: 1, docDate: 1, status: 1 } })
        .sort({ updatedAt: -1 }).limit(LIST_LIMIT).toArray(),
    ]);
    detail = {
      linkedToScope,
      standalone: total - linkedToScope,
      createdByMonth,
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

async function serviceBlock({ ctx, has, from, to, today, months, withDetail }: BlockContext): Promise<DepartmentBlock<"service">> {
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
    const staleBefore = new Date(Date.parse(`${addDaysIso(today, -STALE_DRAFT_DAYS)}T00:00:00+07:00`)).toISOString();
    const followUpProjection = { projection: { customerSnapshot: 1, serviceSystemName: 1, customerApproval: 1, updatedAt: 1 } };
    const staleDraftMatch = and(base, { status: "Draft", updatedAt: { $lt: staleBefore } });
    const [inspectedInPeriod, approvalRejected, upcomingPmCount, staleDraftCount, upcoming, byMonth, approvalRows, rejected, waiting, staleDrafts] = await Promise.all([
      count(reports, and(base, periodClause("inspectionDate", from, to))),
      count(reports, and(base, { "customerApproval.status": "rejected" })),
      count(reports, pmWindow),
      count(reports, staleDraftMatch),
      reports.find(pmWindow as never, { projection: { customerSnapshot: 1, serviceSystemName: 1, nextPmDate: 1 } })
        .sort({ nextPmDate: 1 }).limit(LIST_LIMIT).toArray(),
      reports.aggregate([
        { $match: and(base, { status: { $ne: "Cancelled" } }, monthsClause("inspectionDate", months)) },
        {
          $group: {
            _id: { $substrBytes: ["$inspectionDate", 0, 7] },
            inspected: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$status", "Completed"] }, 1, 0] } },
          },
        },
      ] as never).toArray() as Promise<{ _id: string; inspected: number; completed: number }[]>,
      reports.aggregate([
        { $match: and(base, { status: "Completed" }, periodClause("inspectionDate", from, to)) },
        { $group: { _id: { $ifNull: ["$customerApproval.status", "none"] }, n: { $sum: 1 } } },
      ] as never).toArray() as Promise<{ _id: string; n: number }[]>,
      reports.find(and(base, { "customerApproval.status": "rejected" }) as never, followUpProjection)
        .sort({ "customerApproval.respondedAt": -1 }).limit(LIST_LIMIT).toArray(),
      reports.find(and(base, { "customerApproval.status": "pending" }) as never, followUpProjection)
        .sort({ "customerApproval.sentAt": 1 }).limit(LIST_LIMIT).toArray(),
      reports.find(staleDraftMatch as never, followUpProjection)
        .sort({ updatedAt: 1 }).limit(LIST_LIMIT).toArray(),
    ]);

    const partyOf = (r: { customerSnapshot?: { companyName?: string }; serviceSystemName?: string }) =>
      [r.customerSnapshot?.companyName, r.serviceSystemName].filter(Boolean).join(" · ");
    // ใบเดียวเข้าได้หลายเงื่อนไข (ข้อมูลจริงมีร่างที่ค้างสถานะรอลูกค้าอยู่) — แสดงครั้งเดียวด้วยเหตุผลแรกที่เจอ
    const seen = new Set<string>();
    const followUps: ServiceFollowUp[] = [
      ...rejected.map((r): ServiceFollowUp => ({ id: r._id.toString(), party: partyOf(r), date: (r.customerApproval?.respondedAt ?? r.updatedAt ?? "").slice(0, 10), reason: "rejected" })),
      ...waiting.map((r): ServiceFollowUp => ({ id: r._id.toString(), party: partyOf(r), date: (r.customerApproval?.sentAt ?? "").slice(0, 10), reason: "pending" })),
      ...staleDrafts.map((r): ServiceFollowUp => ({ id: r._id.toString(), party: partyOf(r), date: (r.updatedAt ?? "").slice(0, 10), reason: "staleDraft" })),
    ].filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true))).slice(0, LIST_LIMIT);

    const approvalOf = (key: string) => approvalRows.find((r) => r._id === key)?.n ?? 0;
    detail = {
      inspectedInPeriod, approvalRejected, upcomingPmCount, staleDraftCount, followUps,
      upcomingPm: upcoming.map((r): DueItem => ({ id: r._id.toString(), docNumber: r._id.toString(), party: partyOf(r), date: r.nextPmDate })),
      inspectedByMonth: months.map((month) => {
        const row = byMonth.find((r) => r._id === month);
        return { month, inspected: row?.inspected ?? 0, completed: row?.completed ?? 0 };
      }),
      approvalBreakdown: { approved: approvalOf("approved"), pending: approvalOf("pending"), rejected: approvalOf("rejected"), notSent: approvalOf("none") },
    };
  }

  return {
    scope: scopeOf(!has("service:viewAll")),
    summary: { draft, completedThisMonth, approvalPending },
    detail,
  };
}

// ── ต้องจัดการก่อน (เฉพาะภาพรวม) ──────────────────────────────────────────────

/**
 * รายการสั้น ๆ ข้ามแผนก: ใบสั่งซื้อเลยวันรับของ · ใบสั่งผลิต/ใบสั่งงานที่ถึงหรือใกล้กำหนด · รายงานบริการที่รอลูกค้า
 * แต่ละชนิดเปิดด้วยสิทธิ์ดูของชนิดนั้นและนับเฉพาะใบที่หน้ารายการของผู้ใช้แสดง เหมือนบล็อกของแผนก
 */
async function collectAttention({ ctx, has, today }: BlockContext): Promise<AttentionItem[]> {
  const soon = addDaysIso(today, DUE_SOON_DAYS);
  const per = 5;
  const tasks: Promise<AttentionItem[]>[] = [];

  if (canSeeDepartmentBlock("purchasing", has) && has("purchaseOrder:view")) {
    tasks.push((async () => {
      const own = buildSimpleOwnershipClause(ctx.user.id, has("purchaseOrder:viewAll"), "createdBy");
      // ไม่ใส่ limit ก่อนกรองใบที่รับครบ — ใบสั่งซื้อยังเป็น Final หลังรับของครบ ใบเก่าที่รับครบแล้วจึงเรียงอยู่หน้าสุด
      // เสมอ ถ้าตัดที่ N ใบแรก ใบที่ค้างจริงจะหลุดหายเมื่อมีใบรับครบเก่ากว่าเกิน N ใบ
      const late = await (await purchaseOrdersCollection()).find(
        and({ isDeleted: false, status: "Final", neededByDate: { $gt: "", $lt: today } }, own) as never,
        { projection: { documentNumber: 1, vendorName: 1, neededByDate: 1 } },
      ).sort({ neededByDate: 1 }).toArray();
      // ใบรับสินค้าหนึ่งใบถือได้หลายใบสั่งซื้อ (2026-09-29) — ใบที่เพิ่มเข้าไปก็ถือว่ารับจบพร้อมใบนั้น
      const lateIds = late.map((p) => p._id.toString());
      const closed = new Set((await (await receivingReportsCollection()).find(
        { isDeleted: false, status: "Closed", $or: [{ purchaseOrderId: { $in: lateIds } }, { "extraPurchaseOrders.id": { $in: lateIds } }] } as never,
        { projection: { purchaseOrderId: 1, extraPurchaseOrders: 1 } },
      ).toArray()).flatMap((r) => [r.purchaseOrderId, ...(r.extraPurchaseOrders ?? []).map((x) => x.id)]));
      return late.filter((p) => !closed.has(p._id.toString())).slice(0, per).map((p): AttentionItem => ({
        dept: "purchasing", kind: "poOverdue", id: p._id.toString(), docNumber: p.documentNumber || p._id.toString(), party: p.vendorName ?? "", date: p.neededByDate,
      }));
    })());
  }

  if (canSeeDepartmentBlock("production", has)) {
    tasks.push((async () => {
      const own = buildSimpleOwnershipClause(ctx.user.id, has("productionOrder:viewAll"), "createdBy");
      const rows = await (await productionOrdersCollection()).find(
        and({ isDeleted: false, status: "Final", dueDate: { $gt: "", $lte: soon } }, own) as never,
        { projection: { documentNumber: 1, customerCompanyName: 1, productName: 1, dueDate: 1 } },
      ).sort({ dueDate: 1 }).limit(per).toArray();
      return rows.map((d): AttentionItem => ({
        dept: "production", kind: "productionDue", id: d._id.toString(), docNumber: d.documentNumber || d._id.toString(),
        party: [d.customerCompanyName, d.productName].filter(Boolean).join(" · "), date: d.dueDate,
      }));
    })());
  }

  if (canSeeDepartmentBlock("project", has) && has("jobOrder:view")) {
    tasks.push((async () => {
      const own = buildSimpleOwnershipClause(ctx.user.id, has("jobOrder:viewAll"), "createdBy");
      const rows = await (await jobOrdersCollection()).find(
        and({ isDeleted: false, status: "Final", finishDate: { $gt: "", $lte: soon } }, own) as never,
        { projection: { jobCode: 1, customerName: 1, finishDate: 1 } },
      ).sort({ finishDate: 1 }).limit(per).toArray();
      return rows.map((d): AttentionItem => ({
        dept: "project", kind: "jobOrderDue", id: d._id.toString(), docNumber: d._id.toString(),
        party: [d.jobCode, d.customerName].filter(Boolean).join(" · "), date: d.finishDate,
      }));
    })());
  }

  if (canSeeDepartmentBlock("service", has)) {
    tasks.push((async () => {
      const rows = await (await serviceReportsCollection()).find(
        and({ isDeleted: false, "customerApproval.status": "pending" }, serviceOwnershipClause(ctx)) as never,
        { projection: { customerSnapshot: 1, customerApproval: 1 } },
      ).sort({ "customerApproval.sentAt": 1 }).limit(per).toArray();
      return rows.map((r): AttentionItem => ({
        dept: "service", kind: "serviceApproval", id: r._id.toString(), docNumber: r._id.toString(),
        party: r.customerSnapshot?.companyName ?? "", date: (r.customerApproval?.sentAt ?? "").slice(0, 10),
      }));
    })());
  }

  return (await Promise.all(tasks)).flat()
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
    .slice(0, ATTENTION_LIMIT);
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

const VIEW_BLOCKS: Record<DepartmentDashboardView, readonly DepartmentKey[]> = {
  overview: DEPARTMENT_KEYS,
  service: ["service"],
  purchasing: ["purchasing"],
  inventory: ["inventory"],
  operations: OPERATIONS_DEPARTMENTS,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function queryString(req: ApiRequest, key: string): string {
  const v = req.query?.[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return typeof v === "string" ? v : "";
}

function isView(raw: string): raw is DepartmentDashboardView {
  return Object.prototype.hasOwnProperty.call(VIEW_BLOCKS, raw);
}

export async function handleDepartmentDashboard(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "dashboard:view");

  const view = queryString(req, "dept") || "overview";
  if (!isView(view)) throw new HttpError(400, "ไม่รู้จักแท็บแดชบอร์ดนี้");
  const from = queryString(req, "from");
  const to = queryString(req, "to");
  if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) throw new HttpError(400, "รูปแบบวันที่ไม่ถูกต้อง");

  const has: Has = (p) => roleHasPermission(ctx.role, p);
  const today = todayIsoDate();
  // ภาพรวมเป็นช่องติ๊กของตัวเอง (2026-09-14) — ไม่ติ๊ก = ไม่ได้ใบรออนุมัติ/กิจกรรมล่าสุด/ต้องจัดการก่อนเลย
  if (view === "overview" && !canSeeDashboardTab("overview", has)) throw new HttpError(403, "ไม่มีสิทธิ์ดูแท็บภาพรวมของแดชบอร์ด");
  const isOverview = view === "overview";
  const blockContext: BlockContext = { ctx, has, from, to, today, months: lastMonthKeys(today), withDetail: !isOverview };

  const blocks: DepartmentDashboardResponse["blocks"] = {};
  const failed: DepartmentKey[] = [];

  await Promise.all(VIEW_BLOCKS[view].map(async (key) => {
    if (!canSeeDepartmentBlock(key, has)) {
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
  let attention: DepartmentDashboardResponse["attention"] = null;
  if (isOverview) {
    const [pendingResult, timelineResult, attentionResult] = await Promise.allSettled([
      countPendingApprovals(ctx),
      has("auditLog:view") ? fetchActivityTimeline({ from, to }) : Promise.resolve(null),
      collectAttention(blockContext),
    ]);
    if (pendingResult.status === "fulfilled") pendingApprovals = pendingResult.value;
    else console.error("[dashboard/departments] pending approval counts failed", pendingResult.reason);
    if (timelineResult.status === "fulfilled") activityTimeline = timelineResult.value as unknown as DepartmentDashboardResponse["activityTimeline"];
    else console.error("[dashboard/departments] activity timeline failed", timelineResult.reason);
    if (attentionResult.status === "fulfilled") attention = attentionResult.value;
    else console.error("[dashboard/departments] attention list failed", attentionResult.reason);
  }

  const body: DepartmentDashboardResponse = {
    view,
    filters: { from, to },
    today,
    blocks,
    pendingApprovals,
    activityTimeline,
    attention,
    failed: failed.sort(),
  };
  res.status(200).json(body);
}
