import {
  permissionsCollection, departmentsCollection, positionsCollection,
  notificationTypesCollection, systemSettingsCollection, jobTypesCollection,
} from "./collections.js";
import { ALL_PERMISSIONS, PERMISSION_LABELS, PERMISSION_GROUPS, SUPER_ADMIN_ONLY_PERMISSIONS } from "../../src/lib/permissions.js";
import type { NotificationType } from "../../src/lib/notifications.js";
import { nowIso } from "../../src/lib/products.js";

function groupFor(permission: string): string {
  return PERMISSION_GROUPS.find((g) => g.permissions.includes(permission as never))?.label ?? "อื่นๆ";
}

/** Idempotent: only seeds when the permissions collection is empty. Scaffolding for a future admin-configurable permission registry — RBAC still checks the hardcoded TS union, not this collection. */
export async function seedPermissionsIfEmpty(): Promise<void> {
  const permissions = await permissionsCollection();
  const count = await permissions.estimatedDocumentCount();
  if (count > 0) return;
  const now = nowIso();
  await permissions.insertMany(
    ALL_PERMISSIONS.map((key) => ({
      key,
      label: PERMISSION_LABELS[key],
      group: groupFor(key),
      isSuperAdminOnly: (SUPER_ADMIN_ONLY_PERMISSIONS as string[]).includes(key),
      createdAt: now,
    })),
  );
}

const DEFAULT_DEPARTMENTS = [
  { name: "ฝ่ายขาย", code: "SALES" },
  { name: "ฝ่ายจัดซื้อ", code: "PURCHASING" },
  { name: "ฝ่ายคลังสินค้า", code: "WAREHOUSE" },
  { name: "ฝ่ายบัญชี", code: "ACCOUNTING" },
  { name: "ฝ่ายทรัพยากรบุคคล", code: "HR" },
  { name: "ฝ่ายบริหาร", code: "MANAGEMENT" },
  { name: "ฝ่ายไอที", code: "IT" },
];

/** Idempotent. Generic starter list, not wired into User.department (still free text) — rename/manage via a future admin UI. */
export async function seedDepartmentsIfEmpty(): Promise<void> {
  const departments = await departmentsCollection();
  const count = await departments.estimatedDocumentCount();
  if (count > 0) return;
  const now = nowIso();
  await departments.insertMany(
    DEFAULT_DEPARTMENTS.map((d) => ({ ...d, isActive: true, createdAt: now, updatedAt: now, createdBy: "system", updatedBy: "system" })),
  );
}

const DEFAULT_POSITIONS = [
  { name: "พนักงาน", code: "STAFF" },
  { name: "หัวหน้างาน", code: "SUPERVISOR" },
  { name: "ผู้จัดการ", code: "MANAGER" },
  { name: "ผู้จัดการทั่วไป", code: "GENERAL_MANAGER" },
  { name: "กรรมการผู้จัดการ", code: "MANAGING_DIRECTOR" },
];

/** Idempotent. Generic starter list, not wired into User.position (still free text) — rename/manage via a future admin UI. */
export async function seedPositionsIfEmpty(): Promise<void> {
  const positions = await positionsCollection();
  const count = await positions.estimatedDocumentCount();
  if (count > 0) return;
  const now = nowIso();
  await positions.insertMany(
    DEFAULT_POSITIONS.map((p) => ({ ...p, isActive: true, createdAt: now, updatedAt: now, createdBy: "system", updatedBy: "system" })),
  );
}

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { label: string; module: string }> = {
  quotation_submitted: { label: "ใบเสนอราคารออนุมัติ", module: "ใบเสนอราคา" },
  quotation_approved: { label: "ใบเสนอราคาได้รับการอนุมัติ", module: "ใบเสนอราคา" },
  quotation_rejected: { label: "ใบเสนอราคาถูกปฏิเสธ", module: "ใบเสนอราคา" },
  quotation_high_value: { label: "ใบเสนอราคามูลค่าสูงรออนุมัติ", module: "ใบเสนอราคา" },
  quotation_customer_accepted: { label: "ลูกค้ายอมรับใบเสนอราคา", module: "ใบเสนอราคา" },
  quotation_customer_rejected: { label: "ลูกค้าปฏิเสธใบเสนอราคา", module: "ใบเสนอราคา" },
  quotation_won: { label: "ปิดการขายสำเร็จ", module: "ใบเสนอราคา" },
  quotation_lost: { label: "ปิดการขายไม่สำเร็จ", module: "ใบเสนอราคา" },
  quotation_cancelled: { label: "ใบเสนอราคาถูกยกเลิก", module: "ใบเสนอราคา" },
  scope_of_work_document_sent: { label: "มีเอกสาร Scope of Work ส่งถึงคุณ", module: "Scope of Work" },
  scope_of_work_po_chase: { label: "ทวงเลข PO", module: "Scope of Work" },
  scope_of_work_submitted: { label: "Scope of Work รออนุมัติ", module: "Scope of Work" },
  scope_of_work_approved: { label: "Scope of Work ได้รับอนุมัติ", module: "Scope of Work" },
  scope_of_work_rejected: { label: "Scope of Work ถูกตีกลับ", module: "Scope of Work" },
  delivery_order_sent_to_department: { label: "มีใบส่งมอบงานส่งถึงแผนก", module: "Delivery Order" },
  delivery_order_submitted: { label: "ใบส่งมอบสินค้ารออนุมัติ", module: "Delivery Order" },
  delivery_order_approved: { label: "ใบส่งมอบสินค้าได้รับอนุมัติ", module: "Delivery Order" },
  delivery_order_rejected: { label: "ใบส่งมอบสินค้าถูกตีกลับ", module: "Delivery Order" },
  service_report_created: { label: "มีรายงานบริการใหม่", module: "บริการ" },
  service_report_completed: { label: "รายงานบริการเสร็จสิ้นแล้ว", module: "บริการ" },
  service_report_customer_approved: { label: "ลูกค้าอนุมัติรายงานบริการแล้ว", module: "บริการ" },
  service_report_customer_rejected: { label: "ลูกค้าไม่อนุมัติรายงานบริการ", module: "บริการ" },
  material_requisition_submitted: { label: "ใบเบิกและใบคืนวัสดุรออนุมัติ", module: "ใบเบิกและใบคืนวัสดุ" },
  material_requisition_approved: { label: "อนุมัติใบเบิกและใบคืนวัสดุ", module: "ใบเบิกและใบคืนวัสดุ" },
  purchase_request_submitted: { label: "ใบขอซื้อรออนุมัติ", module: "ใบขอซื้อ" },
  job_order_submitted: { label: "ใบสั่งงานรออนุมัติ", module: "ใบสั่งงาน" },
  production_order_submitted: { label: "ใบสั่งผลิตรออนุมัติ", module: "ใบสั่งผลิต" },
  purchase_order_submitted: { label: "ใบสั่งซื้อรออนุมัติ", module: "ใบสั่งซื้อ" },
  cost_control_submitted: { label: "Cost Control รออนุมัติ", module: "Cost Control" },
  purchase_request_approved: { label: "อนุมัติใบขอซื้อ", module: "ใบขอซื้อ" },
  product_request_submitted: { label: "มีคำขอเพิ่มสินค้าใหม่", module: "คำขอเพิ่มสินค้า" },
  product_request_approved: { label: "คำขอเพิ่มสินค้าได้รับอนุมัติ", module: "คำขอเพิ่มสินค้า" },
  product_request_rejected: { label: "คำขอเพิ่มสินค้าถูกปฏิเสธ", module: "คำขอเพิ่มสินค้า" },
  stock_low: { label: "สต๊อกใกล้หมด", module: "สต๊อกสินค้า" },
};

/** Idempotent. Mirrors the NotificationType union in src/lib/notifications.ts — scaffolding, not read by any live code path yet. */
export async function seedNotificationTypesIfEmpty(): Promise<void> {
  const notificationTypes = await notificationTypesCollection();
  const count = await notificationTypes.estimatedDocumentCount();
  if (count > 0) return;
  const now = nowIso();
  await notificationTypes.insertMany(
    (Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((key) => ({
      key, label: NOTIFICATION_TYPE_LABELS[key].label, module: NOTIFICATION_TYPE_LABELS[key].module, createdAt: now,
    })),
  );
}

const DEFAULT_JOB_TYPES = [
  { code: "TA", name: "Fiberglass Tank" },
  { code: "STA", name: "Steel Tank / Stainless Steel Tank" },
  { code: "LI", name: "FRP Lining" },
  { code: "SC", name: "Wet Scrubber / Activated Carbon System" },
  { code: "BF", name: "Dust Collector System" },
  { code: "GA", name: "FRP Grating" },
  { code: "BI", name: "Bio Scrubber" },
  { code: "VT", name: "Ventilation System" },
  { code: "WTP", name: "Water Treatment System" },
  { code: "OTHER TA", name: "Other Fiberglass Tank Related Work" },
  { code: "OTHER SC", name: "Other Wet Scrubber Related Work" },
  { code: "OTHER BF", name: "Other Dust Collector Related Work" },
  { code: "OTHER", name: "Other Jobs" },
];

/** Idempotent. The default Job Type master list from the 2026-07-10 Executive Dashboard/CRM request — editable afterward via Settings (company:manage). */
export async function seedJobTypesIfEmpty(): Promise<void> {
  const jobTypes = await jobTypesCollection();
  // Unlike the other seed*IfEmpty() functions here, this one is also called defensively from
  // GET /api/jobtypes on every request (see api/handlers/jobtypes.ts) — because ensureIndexes()
  // only ever runs from the one-time Setup Wizard path, which is already permanently blocked on
  // any already-provisioned deployment. Creating the unique index here too (not just in
  // ensureIndexes()) means it actually exists in production, and turns a concurrent-first-request
  // double-seed race into a safe, ignorable duplicate-key error instead of silently inserting the
  // same 13 defaults twice with nothing to reject the duplicates.
  await jobTypes.createIndex({ code: 1 }, { unique: true });
  const count = await jobTypes.estimatedDocumentCount();
  if (count > 0) return;
  const now = nowIso();
  try {
    await jobTypes.insertMany(
      DEFAULT_JOB_TYPES.map((j) => ({ ...j, isActive: true, createdAt: now, updatedAt: now, createdBy: "system", updatedBy: "system" })),
      { ordered: false },
    );
  } catch {
    // A concurrent request already seeded these codes between our count check and this insert —
    // the unique index rejected our duplicates, which is the whole point; nothing left to do.
  }
}

/** Idempotent upsert of the singleton system-settings doc. Defaults mirror current hardcoded behavior (SESSION_DAYS in api/_lib/auth.ts) so future wiring is a no-op migration. */
export async function seedSystemSettingsIfEmpty(): Promise<void> {
  const systemSettings = await systemSettingsCollection();
  const existing = await systemSettings.findOne({ _id: "singleton" });
  if (existing) return;
  const now = nowIso();
  await systemSettings.insertOne({
    _id: "singleton",
    defaultPageSize: 25,
    maintenanceMode: false,
    sessionDurationDays: 7,
    updatedAt: now,
    updatedBy: "system",
  });
}

/** Orchestrator — seeds all system/config data. Explicitly does NOT seed any business data (customers/leads/products/quotes/notifications/company content) — the system starts with zero business data by design. */
export async function seedSystemDataIfEmpty(): Promise<void> {
  await Promise.all([
    seedPermissionsIfEmpty(),
    seedDepartmentsIfEmpty(),
    seedPositionsIfEmpty(),
    seedNotificationTypesIfEmpty(),
    seedJobTypesIfEmpty(),
  ]);
  await seedSystemSettingsIfEmpty();
}
