import type { TranslationKey } from "./i18n";

export type Permission =
  | "dashboard:view"
  | "quotations:view"
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
  | "auditLog:view"
  | "customers:view"
  | "customers:create"
  | "customers:edit"
  | "customers:archive";

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard:view",
  "quotations:view",
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
  "auditLog:view",
  "customers:view",
  "customers:create",
  "customers:edit",
  "customers:archive",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard:view": "ดูแดชบอร์ด",
  "quotations:view": "ดูใบเสนอราคา",
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
  "auditLog:view": "ดูบันทึกการใช้งาน (Audit Log)",
  "customers:view": "ดูข้อมูลลูกค้า",
  "customers:create": "เพิ่มข้อมูลลูกค้า",
  "customers:edit": "แก้ไขข้อมูลลูกค้า",
  "customers:archive": "เก็บถาวร/กู้คืนข้อมูลลูกค้า",
};

/** Translated display label per permission — `PERMISSION_LABELS` (Thai) stays as-is since it's also used to seed the `permissions` collection's stored `label` field; this map is UI-display only. */
export const PERMISSION_LABEL_KEY: Record<Permission, TranslationKey> = {
  "dashboard:view": "permission.dashboardView",
  "quotations:view": "permission.quotationsView",
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
  "auditLog:view": "permission.auditLogView",
  "customers:view": "permission.customersView",
  "customers:create": "permission.customersCreate",
  "customers:edit": "permission.customersEdit",
  "customers:archive": "permission.customersArchive",
};

export const PERMISSION_GROUPS: { label: string; labelKey: TranslationKey; permissions: Permission[] }[] = [
  { label: "แดชบอร์ด", labelKey: "nav.dashboard", permissions: ["dashboard:view"] },
  {
    label: "ใบเสนอราคา",
    labelKey: "nav.quotations",
    permissions: [
      "quotations:view",
      "quotations:create",
      "quotations:edit",
      "quotations:delete",
      "quotations:approve",
      "quotations:reject",
      "quotations:export",
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
    label: "ระบบ",
    labelKey: "permissionGroup.system",
    permissions: ["users:manage", "roles:manage", "company:manage", "auditLog:view"],
  },
];

/**
 * "roles:manage" and "company:manage" are enterprise-critical (creating/deleting roles, editing
 * permissions, promoting to Super Admin, and company-wide settings). Per spec these are Super
 * Admin-only regardless of what a role's permission list says, so a non-Super-Admin role can never
 * be misconfigured into unlocking them.
 */
export const SUPER_ADMIN_ONLY_PERMISSIONS: Permission[] = ["roles:manage", "company:manage"];
