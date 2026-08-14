import type { TranslationKey } from "./i18n";

export type Permission =
  | "dashboard:view"
  | "quotations:view"
  | "quotations:viewAll"
  | "quotations:viewTeam"
  | "quotations:viewDepartment"
  | "quotations:create"
  | "quotations:edit"
  | "quotations:delete"
  | "quotations:approve"
  | "quotations:reject"
  | "quotations:export"
  | "products:view"
  | "products:create"
  | "products:edit"
  | "products:delete"
  | "products:export"
  | "users:manage"
  | "roles:manage"
  | "company:manage"
  | "departments:manage"
  | "teams:manage"
  | "auditLog:view"
  | "customers:view"
  | "customers:create"
  | "customers:edit"
  | "customers:archive"
  | "quotationTemplates:manage"
  | "quotationTemplates:view"
  | "quotationTemplates:create"
  | "quotationTemplates:edit"
  | "quotationTemplates:duplicate"
  | "quotationTemplates:activate"
  | "quotationTemplates:archive"
  | "quotationTemplates:import"
  | "scopeOfWork:view"
  | "scopeOfWork:viewAll"
  | "scopeOfWork:viewTeam"
  | "scopeOfWork:viewDepartment"
  | "scopeOfWork:create"
  | "scopeOfWork:edit"
  | "scopeOfWork:finalize"
  | "scopeOfWork:print"
  | "scopeOfWork:delete"
  | "scopeOfWork:chasePo"
  | "deliveryOrder:view"
  | "deliveryOrder:viewAll"
  | "deliveryOrder:viewTeam"
  | "deliveryOrder:viewDepartment"
  | "deliveryOrder:create"
  | "deliveryOrder:edit"
  | "deliveryOrder:finalize"
  | "deliveryOrder:print"
  | "deliveryOrder:delete"
  | "service:view"
  | "service:viewAll"
  | "service:create"
  | "service:edit"
  | "service:delete"
  | "service:complete"
  | "service:print"
  | "serviceTemplates:view"
  | "serviceTemplates:create"
  | "serviceTemplates:edit"
  | "serviceTemplates:archive";

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard:view",
  "quotations:view",
  "quotations:viewAll",
  "quotations:viewTeam",
  "quotations:viewDepartment",
  "quotations:create",
  "quotations:edit",
  "quotations:delete",
  "quotations:approve",
  "quotations:reject",
  "quotations:export",
  "products:view",
  "products:create",
  "products:edit",
  "products:delete",
  "products:export",
  "users:manage",
  "roles:manage",
  "company:manage",
  "departments:manage",
  "teams:manage",
  "auditLog:view",
  "customers:view",
  "customers:create",
  "customers:edit",
  "customers:archive",
  "quotationTemplates:manage",
  "quotationTemplates:view",
  "quotationTemplates:create",
  "quotationTemplates:edit",
  "quotationTemplates:duplicate",
  "quotationTemplates:activate",
  "quotationTemplates:archive",
  "quotationTemplates:import",
  "scopeOfWork:view",
  "scopeOfWork:viewAll",
  "scopeOfWork:viewTeam",
  "scopeOfWork:viewDepartment",
  "scopeOfWork:create",
  "scopeOfWork:edit",
  "scopeOfWork:finalize",
  "scopeOfWork:print",
  "scopeOfWork:delete",
  "scopeOfWork:chasePo",
  "deliveryOrder:view",
  "deliveryOrder:viewAll",
  "deliveryOrder:viewTeam",
  "deliveryOrder:viewDepartment",
  "deliveryOrder:create",
  "deliveryOrder:edit",
  "deliveryOrder:finalize",
  "deliveryOrder:print",
  "deliveryOrder:delete",
  "service:view",
  "service:viewAll",
  "service:create",
  "service:edit",
  "service:delete",
  "service:complete",
  "service:print",
  "serviceTemplates:view",
  "serviceTemplates:create",
  "serviceTemplates:edit",
  "serviceTemplates:archive",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard:view": "ดูแดชบอร์ด",
  "quotations:view": "ดูใบเสนอราคา",
  "quotations:viewAll": "ดูใบเสนอราคาของผู้อื่น",
  "quotations:viewTeam": "ดูใบเสนอราคาของทีมตัวเอง",
  "quotations:viewDepartment": "ดูใบเสนอราคาของแผนกตัวเอง",
  "quotations:create": "สร้างใบเสนอราคา",
  "quotations:edit": "แก้ไขใบเสนอราคา",
  "quotations:delete": "ลบ/ยกเลิกใบเสนอราคา",
  "quotations:approve": "อนุมัติใบเสนอราคา",
  "quotations:reject": "ปฏิเสธใบเสนอราคา",
  "quotations:export": "ส่งออกใบเสนอราคา (พิมพ์/PDF)",
  "products:view": "ดูคลังสินค้า",
  "products:create": "เพิ่มสินค้า",
  "products:edit": "แก้ไขสินค้า",
  "products:delete": "ลบ/เก็บถาวรสินค้า",
  "products:export": "ส่งออกข้อมูลสินค้า",
  "users:manage": "จัดการผู้ใช้งาน",
  "roles:manage": "จัดการบทบาทและสิทธิ์",
  "company:manage": "จัดการข้อมูลบริษัท",
  "departments:manage": "จัดการแผนก",
  "teams:manage": "จัดการทีม",
  "auditLog:view": "ดูบันทึกการใช้งาน (Audit Log)",
  "customers:view": "ดูข้อมูลลูกค้า",
  "customers:create": "เพิ่มข้อมูลลูกค้า",
  "customers:edit": "แก้ไขข้อมูลลูกค้า",
  "customers:archive": "เก็บถาวร/กู้คืนข้อมูลลูกค้า",
  "quotationTemplates:manage": "จัดการ Template ใบเสนอราคา (สิทธิ์เต็มรูปแบบ — ครอบคลุมทุกสิทธิ์ย่อยด้านล่าง)",
  "quotationTemplates:view": "เข้าถึงหน้าจัดการ Template ใบเสนอราคา",
  "quotationTemplates:create": "สร้าง Template ใบเสนอราคาใหม่",
  "quotationTemplates:edit": "แก้ไขเนื้อหา Template ใบเสนอราคา",
  "quotationTemplates:duplicate": "ทำสำเนา Template ใบเสนอราคา",
  "quotationTemplates:activate": "เปิด/ปิดใช้งาน Template ใบเสนอราคา",
  "quotationTemplates:archive": "เก็บถาวร/กู้คืน Template ใบเสนอราคา",
  "quotationTemplates:import": "นำเข้า Template จากไฟล์ Excel",
  "scopeOfWork:view": "ดู Scope of Work",
  "scopeOfWork:viewAll": "ดู Scope of Work ของผู้อื่น",
  "scopeOfWork:viewTeam": "ดู Scope of Work ของทีมตัวเอง",
  "scopeOfWork:viewDepartment": "ดู Scope of Work ของแผนกตัวเอง",
  "scopeOfWork:create": "สร้าง Scope of Work",
  "scopeOfWork:edit": "แก้ไข Scope of Work",
  "scopeOfWork:finalize": "ยืนยันสถานะ Final ของ Scope of Work",
  "scopeOfWork:print": "พิมพ์ / ส่งออก Scope of Work",
  "scopeOfWork:delete": "ลบ Scope of Work",
  "scopeOfWork:chasePo": "ทวงเลข PO (ส่งแจ้งเตือนถึงพนักงานขาย)",
  "deliveryOrder:view": "ดูใบส่งมอบสินค้า",
  "deliveryOrder:viewAll": "ดูใบส่งมอบสินค้าของผู้อื่น",
  "deliveryOrder:viewTeam": "ดูใบส่งมอบสินค้าของทีมตัวเอง",
  "deliveryOrder:viewDepartment": "ดูใบส่งมอบสินค้าของแผนกตัวเอง",
  "deliveryOrder:create": "สร้างใบส่งมอบสินค้า",
  "deliveryOrder:edit": "แก้ไขใบส่งมอบสินค้า",
  "deliveryOrder:finalize": "ยืนยันสถานะ Final ของใบส่งมอบสินค้า",
  "deliveryOrder:print": "พิมพ์ / ส่งออกใบส่งมอบสินค้า",
  "deliveryOrder:delete": "ลบใบส่งมอบสินค้า",
  "service:view": "ดูรายงานบริการ",
  "service:viewAll": "ดูรายงานบริการของผู้อื่น",
  "service:create": "สร้างรายงานบริการ",
  "service:edit": "แก้ไขรายงานบริการ",
  "service:delete": "ลบรายงานบริการ",
  "service:complete": "ยืนยันสถานะเสร็จสิ้นของรายงานบริการ",
  "service:print": "พิมพ์ / ส่งออกรายงานบริการ",
  "serviceTemplates:view": "เข้าถึงหน้าจัดการ Template รายงานบริการ",
  "serviceTemplates:create": "สร้าง Template รายงานบริการใหม่",
  "serviceTemplates:edit": "แก้ไข Template รายงานบริการ",
  "serviceTemplates:archive": "เก็บถาวร/กู้คืน Template รายงานบริการ",
};

export const PERMISSION_LABEL_KEY: Record<Permission, TranslationKey> = {
  "dashboard:view": "permission.dashboardView",
  "quotations:view": "permission.quotationsView",
  "quotations:viewAll": "permission.quotationsViewAll",
  "quotations:viewTeam": "permission.quotationsViewTeam",
  "quotations:viewDepartment": "permission.quotationsViewDepartment",
  "quotations:create": "permission.quotationsCreate",
  "quotations:edit": "permission.quotationsEdit",
  "quotations:delete": "permission.quotationsDelete",
  "quotations:approve": "permission.quotationsApprove",
  "quotations:reject": "permission.quotationsReject",
  "quotations:export": "permission.quotationsExport",
  "products:view": "permission.productsView",
  "products:create": "permission.productsCreate",
  "products:edit": "permission.productsEdit",
  "products:delete": "permission.productsDelete",
  "products:export": "permission.productsExport",
  "users:manage": "permission.usersManage",
  "roles:manage": "permission.rolesManage",
  "company:manage": "permission.companyManage",
  "departments:manage": "permission.departmentsManage",
  "teams:manage": "permission.teamsManage",
  "auditLog:view": "permission.auditLogView",
  "customers:view": "permission.customersView",
  "customers:create": "permission.customersCreate",
  "customers:edit": "permission.customersEdit",
  "customers:archive": "permission.customersArchive",
  "quotationTemplates:manage": "permission.quotationTemplatesManage",
  "quotationTemplates:view": "permission.quotationTemplatesView",
  "quotationTemplates:create": "permission.quotationTemplatesCreate",
  "quotationTemplates:edit": "permission.quotationTemplatesEdit",
  "quotationTemplates:duplicate": "permission.quotationTemplatesDuplicate",
  "quotationTemplates:activate": "permission.quotationTemplatesActivate",
  "quotationTemplates:archive": "permission.quotationTemplatesArchive",
  "quotationTemplates:import": "permission.quotationTemplatesImport",
  "scopeOfWork:view": "permission.scopeOfWorkView",
  "scopeOfWork:viewAll": "permission.scopeOfWorkViewAll",
  "scopeOfWork:viewTeam": "permission.scopeOfWorkViewTeam",
  "scopeOfWork:viewDepartment": "permission.scopeOfWorkViewDepartment",
  "scopeOfWork:create": "permission.scopeOfWorkCreate",
  "scopeOfWork:edit": "permission.scopeOfWorkEdit",
  "scopeOfWork:finalize": "permission.scopeOfWorkFinalize",
  "scopeOfWork:print": "permission.scopeOfWorkPrint",
  "scopeOfWork:delete": "permission.scopeOfWorkDelete",
  "scopeOfWork:chasePo": "permission.scopeOfWorkChasePo",
  "deliveryOrder:view": "permission.deliveryOrderView",
  "deliveryOrder:viewAll": "permission.deliveryOrderViewAll",
  "deliveryOrder:viewTeam": "permission.deliveryOrderViewTeam",
  "deliveryOrder:viewDepartment": "permission.deliveryOrderViewDepartment",
  "deliveryOrder:create": "permission.deliveryOrderCreate",
  "deliveryOrder:edit": "permission.deliveryOrderEdit",
  "deliveryOrder:finalize": "permission.deliveryOrderFinalize",
  "deliveryOrder:print": "permission.deliveryOrderPrint",
  "deliveryOrder:delete": "permission.deliveryOrderDelete",
  "service:view": "permission.serviceView",
  "service:viewAll": "permission.serviceViewAll",
  "service:create": "permission.serviceCreate",
  "service:edit": "permission.serviceEdit",
  "service:delete": "permission.serviceDelete",
  "service:complete": "permission.serviceComplete",
  "service:print": "permission.servicePrint",
  "serviceTemplates:view": "permission.serviceTemplatesView",
  "serviceTemplates:create": "permission.serviceTemplatesCreate",
  "serviceTemplates:edit": "permission.serviceTemplatesEdit",
  "serviceTemplates:archive": "permission.serviceTemplatesArchive",
};

export const PERMISSION_GROUPS: { label: string; labelKey: TranslationKey; permissions: Permission[] }[] = [
  { label: "แดชบอร์ด", labelKey: "nav.dashboard", permissions: ["dashboard:view"] },
  {
    label: "ใบเสนอราคา",
    labelKey: "nav.quotations",
    permissions: [
      "quotations:view",
      "quotations:viewAll",
      "quotations:viewTeam",
      "quotations:viewDepartment",
      "quotations:create",
      "quotations:edit",
      "quotations:delete",
      "quotations:approve",
      "quotations:reject",
      "quotations:export",
      "quotationTemplates:manage",
      "quotationTemplates:view",
      "quotationTemplates:create",
      "quotationTemplates:edit",
      "quotationTemplates:duplicate",
      "quotationTemplates:activate",
      "quotationTemplates:archive",
      "quotationTemplates:import",
      "scopeOfWork:view",
      "scopeOfWork:viewAll",
      "scopeOfWork:viewTeam",
      "scopeOfWork:viewDepartment",
      "scopeOfWork:create",
      "scopeOfWork:edit",
      "scopeOfWork:finalize",
      "scopeOfWork:print",
      "scopeOfWork:delete",
      "scopeOfWork:chasePo",
      "deliveryOrder:view",
      "deliveryOrder:viewAll",
      "deliveryOrder:viewTeam",
      "deliveryOrder:viewDepartment",
      "deliveryOrder:create",
      "deliveryOrder:edit",
      "deliveryOrder:finalize",
      "deliveryOrder:print",
      "deliveryOrder:delete",
    ],
  },
  {
    label: "คลังสินค้า",
    labelKey: "nav.products",
    permissions: ["products:view", "products:create", "products:edit", "products:delete", "products:export"],
  },
  {
    label: "ลูกค้า",
    labelKey: "nav.customers",
    permissions: ["customers:view", "customers:create", "customers:edit", "customers:archive"],
  },
  {
    label: "บริการ",
    labelKey: "nav.service",
    permissions: [
      "service:view",
      "service:viewAll",
      "service:create",
      "service:edit",
      "service:delete",
      "service:complete",
      "service:print",
      "serviceTemplates:view",
      "serviceTemplates:create",
      "serviceTemplates:edit",
      "serviceTemplates:archive",
    ],
  },
  {
    label: "ระบบ",
    labelKey: "permissionGroup.system",
    permissions: ["users:manage", "roles:manage", "company:manage", "departments:manage", "teams:manage", "auditLog:view"],
  },
];

export const SUPER_ADMIN_ONLY_PERMISSIONS: Permission[] = ["roles:manage", "company:manage", "departments:manage", "teams:manage"];

/**
 * Permissions that cannot work alone: granting the key without its listed dependencies produces a
 * screen that **hard-fails**, not one that merely hides a button.
 *
 * Deliberately narrow. This map is only for cases where a page/editor's own boot fetch is gated by
 * a *different* permission than the one that unlocks it, so the whole view errors out for a role
 * that holds one but not the other. It is NOT a list of "sensible pairings" (e.g. `service:print`
 * without `service:view`) — those degrade gracefully into an unreachable button, and folding them
 * in here would quietly override deliberate admin choices.
 *
 * Every entry below is `ServiceReportEditor.tsx`: its boot `Promise.all` calls
 * `fetchServiceTemplates()` unconditionally, for viewing an existing report as much as for creating
 * one (`ServicePage.openReport()` mounts the same component), so any role that can reach that
 * editor also needs `serviceTemplates:view` or gets a permanent error state.
 *
 * Cross-module fetches that already `.catch()` into a safe fallback — `QuoteDocument`'s Scope of
 * Work lookup, `ScopeOfWorkDocument`'s Delivery Order lookup — are correctly absent: they're
 * client-gated *and* fail soft. `GET /api/quotation-templates` is absent for a different reason:
 * it accepts `quotations:create` OR `quotationTemplates:view` server-side, so the wizard can't hit
 * this failure mode at all.
 */
export const PERMISSION_DEPENDENCIES: Partial<Record<Permission, Permission[]>> = {
  "service:view": ["serviceTemplates:view"],
  "service:create": ["serviceTemplates:view"],
  "service:edit": ["serviceTemplates:view"],
};

/**
 * Expands a permission list with everything PERMISSION_DEPENDENCIES says it needs, transitively.
 * Input order is preserved and additions are appended, so the result is stable and diffable.
 * Unknown strings pass through untouched — this normalizes, it doesn't validate.
 */
export function withPermissionDependencies(permissions: Permission[]): Permission[] {
  const result: Permission[] = [];
  const seen = new Set<Permission>();
  const queue = [...permissions];
  while (queue.length > 0) {
    const permission = queue.shift() as Permission;
    if (seen.has(permission)) continue;
    seen.add(permission);
    result.push(permission);
    queue.push(...(PERMISSION_DEPENDENCIES[permission] ?? []));
  }
  return result;
}

/** The permissions in `permissions` that depend on `permission` — i.e. what breaks if it's removed. */
export function permissionsRequiring(permission: Permission, permissions: Permission[]): Permission[] {
  return permissions.filter((p) => p !== permission && withPermissionDependencies([p]).includes(permission));
}
