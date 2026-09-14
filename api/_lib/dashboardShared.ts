import { roleHasPermission } from "../../src/lib/roles.js";
import type { AuthContext } from "./auth.js";
import { buildOwnershipClause } from "./visibility.js";
import {
  auditLogCollection, categoriesCollection, deliveryOrdersCollection, productsCollection, serviceReportsCollection,
  withStringId,
} from "./collections.js";

/**
 * ของที่แดชบอร์ดขาย (`api/dashboard/index.ts`) กับแดชบอร์ดแผนก (`departmentDashboard.ts`) ใช้ร่วมกัน
 * — ย้ายออกมาจาก `api/dashboard/index.ts` แบบไม่เปลี่ยนพฤติกรรมเมื่อ 2026-09-14 ตอนแยกแดชบอร์ดเป็นแท็บ
 * ตามแผนก เพื่อไม่ให้สองไฟล์ต่างคนต่างนับใบส่งมอบ/งานบริการ/หมวดหมู่สินค้าคนละวิธี
 */

/**
 * Thailand is UTC+7, no DST. The server process has no guaranteed local timezone (a container is
 * typically UTC), and `issueDate`/`expiryDate`/`followUpDate` are Thailand-local business-date strings —
 * so "today"/month-boundary math here must not use the server's ambient local `Date` getters
 * (wrong timezone) or mix a local constructor with `.toISOString()` (shifts the boundary by a
 * day for any positive-UTC-offset zone). Fix: shift by the fixed offset once, then always read
 * back via UTC getters/`Date.UTC` only — correct regardless of the server's actual configured
 * timezone.
 */
export const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export function bangkokNow(): Date {
  return new Date(Date.now() + BANGKOK_OFFSET_MS);
}
export function todayIsoDate(): string {
  return bangkokNow().toISOString().slice(0, 10);
}

/** วันที่ YYYY-MM-DD บวก/ลบจำนวนวัน — คิดบนปฏิทินล้วน ไม่ขึ้นกับเขตเวลาของเครื่อง */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC instant range covering the Bangkok-local calendar day(s) `[from, to]` — for filtering real UTC timestamp fields (e.g. audit_log's `createdAt`) by the same Bangkok-local date-range preset used everywhere else, unlike `issueDate`/etc. which are already plain Bangkok-local date strings needing no conversion. */
export function bangkokDayBoundsUtc(from: string, to: string): { $gte?: string; $lt?: string } {
  const range: { $gte?: string; $lt?: string } = {};
  if (from) range.$gte = new Date(new Date(`${from}T00:00:00Z`).getTime() - BANGKOK_OFFSET_MS).toISOString();
  if (to) range.$lt = new Date(new Date(`${to}T00:00:00Z`).getTime() - BANGKOK_OFFSET_MS + 86400000).toISOString();
  return range;
}

export const ACTIVITY_LIMIT = 30;

/**
 * กิจกรรมล่าสุดจาก audit log — ผู้เรียกต้องเช็ก `auditLog:view` เอง
 *
 * `userName`/`userNamesIn` คือตัวกรองพนักงานขาย/ฝ่ายของแดชบอร์ดขาย (จับคู่ด้วยชื่อ ตามธรรมเนียมเดิม
 * ของไฟล์นั้น) · แดชบอร์ดแผนกเรียกโดยไม่ส่งสองตัวนี้ เพราะภาพรวมบริษัทไม่มีตัวกรองคน
 */
export async function fetchActivityTimeline({ from, to, userName, userNamesIn }: {
  from: string; to: string; userName?: string; userNamesIn?: string[];
}): Promise<ReturnType<typeof withStringId>[]> {
  const auditLog = await auditLogCollection();
  const auditMatch: Record<string, unknown> = {};
  if (from || to) auditMatch.createdAt = bangkokDayBoundsUtc(from, to);
  if (userName) auditMatch.userName = userName;
  if (userNamesIn) {
    const deptCond = { userName: { $in: userNamesIn } };
    if (auditMatch.userName) {
      auditMatch.$and = [{ userName: auditMatch.userName }, deptCond];
      delete auditMatch.userName;
    } else {
      Object.assign(auditMatch, deptCond);
    }
  }
  const entries = await auditLog.find(auditMatch).sort({ createdAt: -1 }).limit(ACTIVITY_LIMIT).toArray();
  return entries.map(withStringId);
}

export interface CategoryBreakdownRow { categoryId: string; categoryName: string; count: number; percentage: number }

/** จำนวนสินค้า (ไม่รวมที่เก็บถาวร) ต่อหมวดหมู่ — ทั้งบริษัท ไม่ขึ้นกับตัวกรองใด ๆ */
export async function computeCategoryBreakdown(): Promise<CategoryBreakdownRow[]> {
  const [products, categories] = await Promise.all([productsCollection(), categoriesCollection()]);
  const [productsByCategoryAgg, categoryDocs] = await Promise.all([
    products.aggregate<{ _id: string; count: number }>([
      { $match: { archived: false } },
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]).toArray(),
    categories.find({}).toArray(),
  ]);
  const categoryNameById = new Map(categoryDocs.map((c) => [c._id.toString(), c.name]));
  const totalCategorizedProducts = productsByCategoryAgg.reduce((sum, c) => sum + c.count, 0);
  return productsByCategoryAgg
    .map((c) => ({
      categoryId: c._id,
      categoryName: categoryNameById.get(c._id) ?? "ไม่ระบุหมวดหมู่",
      count: c.count,
      percentage: totalCategorizedProducts > 0 ? Math.round((c.count / totalCategorizedProducts) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface DeliveryOrderCounts { total: number; draft: number; pending: number; final: number }

/**
 * จำนวนใบส่งมอบสินค้าแยกสถานะ — ทั้งบริษัท ทุกช่วงเวลา · ผู้ไม่มี `deliveryOrder:viewAll` นับเฉพาะใบที่
 * หน้ารายการของตัวเองแสดง (predicate เดียวกับ `handleList` ใน deliveryOrderHandler.ts) · ผู้เรียกต้อง
 * เช็ก `deliveryOrder:view` เอง
 */
export async function countDeliveryOrders(ctx: AuthContext): Promise<DeliveryOrderCounts> {
  const ownDeliveryClause = await buildOwnershipClause(ctx, "deliveryOrder", "createdBy");
  const deliveryOrders = await deliveryOrdersCollection();
  const [total, draft, pending, final] = await Promise.all([
    deliveryOrders.countDocuments({ isDeleted: false, ...ownDeliveryClause }),
    deliveryOrders.countDocuments({ isDeleted: false, status: "Draft", ...ownDeliveryClause }),
    deliveryOrders.countDocuments({ isDeleted: false, status: "PendingApproval", ...ownDeliveryClause }),
    deliveryOrders.countDocuments({ isDeleted: false, status: "Final", ...ownDeliveryClause }),
  ]);
  return { total, draft, pending, final };
}

/** Own-data-only predicate ของรายงานบริการ — เหมือน `handleList` ใน serviceReportHandler.ts เป๊ะ */
export function serviceOwnershipClause(ctx: AuthContext): Record<string, unknown> {
  return roleHasPermission(ctx.role, "service:viewAll")
    ? {}
    : { $or: [{ createdBy: ctx.user.id }, { createdBy: "" }] };
}

export interface ServiceCounts { total: number; draft: number; completed: number; cancelled: number; thisMonth: number }

/** จำนวนรายงานบริการแยกสถานะ + ที่ตรวจเดือนนี้ — ผู้เรียกต้องเช็ก `service:view` เอง */
export async function countServiceReports(ctx: AuthContext, today: string): Promise<ServiceCounts> {
  const ownServiceClause = serviceOwnershipClause(ctx);
  const serviceReports = await serviceReportsCollection();
  const thisMonthPrefix = today.slice(0, 7);
  const [total, draft, completed, cancelled, thisMonth] = await Promise.all([
    serviceReports.countDocuments({ isDeleted: false, ...ownServiceClause }),
    serviceReports.countDocuments({ isDeleted: false, status: "Draft", ...ownServiceClause }),
    serviceReports.countDocuments({ isDeleted: false, status: "Completed", ...ownServiceClause }),
    serviceReports.countDocuments({ isDeleted: false, status: "Cancelled", ...ownServiceClause }),
    serviceReports.countDocuments({ isDeleted: false, inspectionDate: { $regex: `^${thisMonthPrefix}` }, ...ownServiceClause }),
  ]);
  return { total, draft, completed, cancelled, thisMonth };
}
