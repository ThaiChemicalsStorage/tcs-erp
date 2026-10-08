import type { TranslationKey } from "../../lib/i18n";
import { PERMISSION_GROUPS, type Permission } from "../../lib/permissions";

/**
 * ตารางสิทธิ์แยกตามโมดูล (REDESIGN 2026-09-30, บอร์ด Roles-Edit) — จัดสิทธิ์เดิม**ทุกข้อ**ลงช่องของตาราง
 * โดยไม่เพิ่ม/ไม่ตัดสิทธิ์ใด: แต่ละกลุ่มใน `PERMISSION_GROUPS` = หนึ่งหมวด · สิทธิ์ในหมวดแยกแถวตามคำหน้า ":"
 * (quotations, scopeOfWork …) · คำหลัง ":" บอกว่าอยู่คอลัมน์ไหน ถ้าไม่เข้าคอลัมน์ใดไปอยู่ "สิทธิ์อื่น ๆ" ท้ายแถว
 *
 * หมวดแดชบอร์ด บัญชี และระบบ เป็นรายการติ๊กธรรมดา (ไม่ใช่ตาราง) เพราะสิทธิ์ในหมวดเหล่านี้ไม่ได้แบ่งเป็น
 * ดู/สร้าง/แก้ไขของเอกสารชนิดเดียว — ตามบอร์ด · ความครบถ้วนมีเทสต์คุม: tests/permissionMatrix.test.ts
 */

export const MATRIX_COLUMNS = ["view", "viewAll", "viewTeam", "viewDepartment", "create", "edit", "approve", "print", "delete"] as const;
export type MatrixColumn = (typeof MATRIX_COLUMNS)[number];

/** คำหลัง ":" → คอลัมน์ · คำที่ไม่อยู่ที่นี่ = "สิทธิ์อื่น ๆ" */
const ACTION_COLUMN: Record<string, MatrixColumn> = {
  view: "view",
  viewAll: "viewAll",
  viewTeam: "viewTeam",
  viewDepartment: "viewDepartment",
  create: "create",
  edit: "edit",
  finalize: "approve",
  approve: "approve",
  review: "approve",
  print: "print",
  export: "print",
  delete: "delete",
};

/** หมวดที่แสดงเป็นรายการติ๊ก ไม่ใช่ตาราง */
const LIST_GROUPS: ReadonlySet<TranslationKey> = new Set<TranslationKey>(["nav.dashboard", "permission.group.accounting", "permissionGroup.system"]);

export interface MatrixRow {
  /** คำหน้า ":" เช่น "quotations" */
  resource: string;
  cells: Partial<Record<MatrixColumn, Permission>>;
  extras: Permission[];
}

export type MatrixSection =
  | { kind: "matrix"; labelKey: TranslationKey; rows: MatrixRow[]; permissions: Permission[] }
  | { kind: "list"; labelKey: TranslationKey; permissions: Permission[] };

export function resourceOf(p: Permission): string {
  return p.slice(0, p.indexOf(":"));
}

export function actionOf(p: Permission): string {
  return p.slice(p.indexOf(":") + 1);
}

// จัดสิทธิ์ทั้งหมดใน PERMISSION_GROUPS ลงตาราง — ช่องที่ถูกใช้ไปแล้วในแถวเดียวกันจะดันสิทธิ์ตัวถัดไปไป "อื่น ๆ" (ไม่ทับกัน)
// Lays every permission from PERMISSION_GROUPS into matrix cells; a clash pushes the later key to "other" instead of overwriting.
export function buildPermissionMatrix(groups: typeof PERMISSION_GROUPS = PERMISSION_GROUPS): MatrixSection[] {
  return groups.map((group) => {
    if (LIST_GROUPS.has(group.labelKey)) return { kind: "list", labelKey: group.labelKey, permissions: [...group.permissions] };
    const rows: MatrixRow[] = [];
    for (const p of group.permissions) {
      const resource = resourceOf(p);
      let row = rows.find((r) => r.resource === resource);
      if (!row) {
        row = { resource, cells: {}, extras: [] };
        rows.push(row);
      }
      const column = ACTION_COLUMN[actionOf(p)];
      if (column && !row.cells[column]) row.cells[column] = p;
      else row.extras.push(p);
    }
    return { kind: "matrix", labelKey: group.labelKey, rows, permissions: [...group.permissions] };
  });
}

/** ชื่อแถว (เอกสาร/เมนู) ของตาราง */
export const RESOURCE_LABEL_KEY: Record<string, TranslationKey> = {
  quotations: "roles.resource.quotations",
  quotationTemplates: "roles.resource.quotationTemplates",
  scopeOfWork: "roles.resource.scopeOfWork",
  deliveryOrder: "roles.resource.deliveryOrder",
  products: "roles.resource.products",
  stock: "roles.resource.stock",
  productRequest: "roles.resource.productRequest",
  receivingReport: "roles.resource.receivingReport",
  customers: "roles.resource.customers",
  service: "roles.resource.service",
  serviceTemplates: "roles.resource.serviceTemplates",
  project: "roles.resource.project",
  materialRequisition: "roles.resource.materialRequisition",
  jobOrder: "roles.resource.jobOrder",
  purchaseRequest: "roles.resource.purchaseRequest",
  productionOrder: "roles.resource.productionOrder",
  purchaseOrder: "roles.resource.purchaseOrder",
  vendor: "roles.resource.vendor",
  codeRegister: "roles.resource.codeRegister",
  costControl: "roles.resource.costControl",
};

/** ป้ายสั้นของสิทธิ์ในช่อง "สิทธิ์อื่น ๆ" — ไม่มีในนี้ = ใช้ชื่อสิทธิ์เต็ม */
export const EXTRA_SHORT_LABEL_KEY: Record<string, TranslationKey> = {
  reject: "roles.extra.reject",
  manage: "roles.extra.manage",
  duplicate: "roles.extra.duplicate",
  activate: "roles.extra.activate",
  archive: "roles.extra.archive",
  import: "roles.extra.import",
  chasePo: "roles.extra.chasePo",
  adjust: "roles.extra.adjust",
  receive: "roles.extra.receive",
  complete: "roles.extra.complete",
  editApproved: "roles.extra.editApproved",
  check: "roles.extra.check",
};

export const COLUMN_LABEL_KEY: Record<MatrixColumn, TranslationKey> = {
  view: "roles.col.view",
  viewAll: "roles.col.viewAll",
  viewTeam: "roles.col.viewTeam",
  viewDepartment: "roles.col.viewDepartment",
  create: "roles.col.create",
  edit: "roles.col.edit",
  approve: "roles.col.approve",
  print: "roles.col.print",
  delete: "roles.col.delete",
};
