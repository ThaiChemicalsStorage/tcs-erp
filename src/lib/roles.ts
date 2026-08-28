import { ALL_PERMISSIONS, type Permission, SUPER_ADMIN_ONLY_PERMISSIONS, withPermissionDependencies } from "./permissions.js";
import type { User } from "./users";
import { apiFetch } from "./apiClient.js";

export interface Role {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSuperAdmin: boolean;
  isSystem: boolean;
}

export const defaultRoles: Role[] = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "สิทธิ์การเข้าถึงทั้งหมดในระบบ ไม่สามารถลบหรือจำกัดสิทธิ์ได้",
    permissions: [...ALL_PERMISSIONS],
    isSuperAdmin: true,
    isSystem: true,
  },
  {
    key: "administrator",
    name: "Administrator",
    description: "จัดการผู้ใช้งานและข้อมูลการดำเนินงานประจำวัน ไม่รวมการจัดการบทบาท/สิทธิ์และข้อมูลบริษัท",
    permissions: [
      "dashboard:view",
      "quotations:view",
      "quotations:viewAll",
      "quotations:create",
      "quotations:edit",
      "quotations:delete",
      "quotations:export",
      "products:view",
      "products:create",
      "products:edit",
      "products:delete",
      "products:export",
      "users:manage",
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
      "scopeOfWork:create",
      "scopeOfWork:edit",
      "scopeOfWork:finalize",
      "scopeOfWork:print",
      "scopeOfWork:delete",
      "scopeOfWork:chasePo",
      "deliveryOrder:view",
      "deliveryOrder:viewAll",
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
      "ar:view",
      "ar:create",
      "ar:issue",
      "ar:cancel",
      "stock:view",
      "stock:adjust",
      "productRequest:view",
      "productRequest:viewAll",
      "productRequest:create",
      "productRequest:review",
      // ใบสั่งผลิต (ฝ่ายผลิต, 2026-08-20) — ให้ Administrator/Super Admin เท่านั้นโดยปริยาย
      // เหมือนโมดูลโปรเจกต์: ฝ่ายผลิตต้องสร้าง role ของตัวเองผ่านหน้าจัดการบทบาท
      "productionOrder:view",
      "productionOrder:viewAll",
      "productionOrder:create",
      "productionOrder:edit",
      "productionOrder:finalize",
      "productionOrder:print",
      "productionOrder:delete",
      // โมดูลจัดซื้อ (2026-08-28) — ใบสั่งซื้อ / ใบตรวจรับสินค้า / ใบรับวางบิล ตามผังกระบวนการจัดซื้อ
      // ให้ Administrator/Super Admin เท่านั้นโดยปริยาย เหมือนโมดูลโครงการและผลิต เพราะยังไม่มี role
      // ตั้งต้นตัวไหนสังกัดฝ่ายจัดซื้อ — ต้องสร้าง role "เจ้าหน้าที่จัดซื้อ" ผ่านหน้าบทบาทและสิทธิ์เอง
      // **ค่าเหล่านี้มีผลกับการติดตั้งใหม่เท่านั้น** เครื่องที่ใช้งานอยู่แล้วต้องเข้าไปติ๊กสิทธิ์ให้บทบาทเอง
      // (ทำตามแนวของคำขอเพิ่มสินค้า 2026-08-27 ที่เจ้าของเลือกติ๊กเองแทนการเขียน RBAC migration)
      "purchaseOrder:view",
      "purchaseOrder:viewAll",
      "purchaseOrder:create",
      "purchaseOrder:edit",
      "purchaseOrder:finalize",
      "purchaseOrder:print",
      "purchaseOrder:delete",
      // Project module (added 2026-08-18, Stage 2) — granted to Administrator/Super Admin only by
      // default, per the Stage 1 recommendation: none of the existing default roles (Sales/Approver/
      // Viewer/Service Engineer/Accounting User) belong to the Project/Store/Factory/Purchasing
      // departments this module serves. Real custom roles (e.g. "เจ้าหน้าที่โครงการ") should be
      // created via Role Management once the module is functional — same "manual Role Management
      // step" pattern every prior module has needed.
      "project:view",
      "project:viewAll",
      "project:create",
      "project:edit",
      "project:finalize",
      "project:print",
      "project:delete",
      "materialRequisition:view",
      "materialRequisition:viewAll",
      "materialRequisition:create",
      "materialRequisition:edit",
      "materialRequisition:finalize",
      "materialRequisition:print",
      "materialRequisition:delete",
      "jobOrder:view",
      "jobOrder:viewAll",
      "jobOrder:create",
      "jobOrder:edit",
      "jobOrder:finalize",
      "jobOrder:print",
      "jobOrder:delete",
      "purchaseRequest:view",
      "purchaseRequest:viewAll",
      "purchaseRequest:create",
      "purchaseRequest:edit",
      "purchaseRequest:finalize",
      "purchaseRequest:print",
      "purchaseRequest:delete",
    ],
    isSuperAdmin: false,
    isSystem: true,
  },
  {
    key: "sales_user",
    name: "Sales User",
    description: "สร้างและแก้ไขใบเสนอราคาของตนเอง ส่งขออนุมัติได้ แต่อนุมัติ/ปฏิเสธไม่ได้",
    permissions: [
      "dashboard:view", "quotations:view", "quotations:create", "quotations:edit", "quotations:export", "products:view",
      "customers:view", "customers:create", "customers:edit",
      "scopeOfWork:view", "scopeOfWork:create", "scopeOfWork:edit", "scopeOfWork:print",
      "deliveryOrder:view", "deliveryOrder:create", "deliveryOrder:edit", "deliveryOrder:print",
    ],
    isSuperAdmin: false,
    isSystem: false,
  },
  {
    key: "service_engineer",
    name: "Service Engineer",
    description: "ช่างบริการภาคสนาม — สร้าง แก้ไข และปิดงานรายงานบริการของตนเอง (เห็นเฉพาะรายงานของตนเอง)",
    permissions: [
      "dashboard:view",
      "customers:view",
      // serviceTemplates:view is required, not optional: ServiceReportEditor's boot Promise.all
      // calls fetchServiceTemplates(), so without it the editor fails to load at all.
      "serviceTemplates:view",
      "service:view", "service:create", "service:edit", "service:complete", "service:print",
    ],
    isSuperAdmin: false,
    isSystem: false,
  },
  {
    key: "accounting_user",
    name: "Accounting User",
    description: "ฝ่ายบัญชีลูกหนี้ — ดูงาน Scope of Work ทั้งหมดเพื่อวางบิล จัดการ checklist ออกเอกสาร AR/ใบกำกับภาษี/ใบวางบิล/ใบเสร็จรับเงิน และยกเลิกเอกสารที่ออกผิดพลาดได้เอง",
    permissions: [
      "dashboard:view",
      "customers:view", "customers:edit",
      // scopeOfWork:viewAll (not just :view) — accounting needs to see every job company-wide to
      // bill it, not just their own, unlike a typical Sales-side own-records-only role.
      "scopeOfWork:view", "scopeOfWork:viewAll",
      // ar:cancel added 2026-08-18 — the role that actually issues AR/IV/BI/RE day to day must be
      // able to cancel its own mis-issued documents without escalating to an Administrator/Approver
      // every time (a real gap from Phase 1, where only Administrator/Approver 1/2/Viewer had it).
      "ar:view", "ar:create", "ar:issue", "ar:cancel",
      // Stock (added 2026-08-18) — accounting cuts stock against IV documents from the same
      // dual-pane view they issue/print from, so both view+adjust travel together here.
      "stock:view", "stock:adjust",
    ],
    isSuperAdmin: false,
    isSystem: false,
  },
  {
    key: "approver_1",
    name: "Approver Level 1",
    description: "ตรวจสอบและอนุมัติ/ปฏิเสธใบเสนอราคา (เช่น ผู้จัดการฝ่ายขาย)",
    permissions: [
      "dashboard:view",
      "quotations:view",
      "quotations:viewAll",
      "quotations:edit",
      "quotations:approve",
      "quotations:reject",
      "quotations:export",
      "products:view",
      "customers:view",
      "scopeOfWork:view", "scopeOfWork:viewAll", "scopeOfWork:edit", "scopeOfWork:finalize", "scopeOfWork:print", "scopeOfWork:chasePo",
      "deliveryOrder:view", "deliveryOrder:viewAll", "deliveryOrder:edit", "deliveryOrder:finalize", "deliveryOrder:print",
      "service:view", "service:viewAll", "service:print", "serviceTemplates:view",
      "ar:view", "ar:cancel",
    ],
    isSuperAdmin: false,
    isSystem: false,
  },
  {
    key: "approver_2",
    name: "Approver Level 2",
    description: "อนุมัติใบเสนอราคาระดับสูงสุด (เช่น ผู้บริหารระดับสูง/CEO)",
    permissions: [
      "dashboard:view",
      "quotations:view",
      "quotations:viewAll",
      "quotations:edit",
      "quotations:approve",
      "quotations:reject",
      "quotations:export",
      "products:view",
      "customers:view",
      "scopeOfWork:view", "scopeOfWork:viewAll", "scopeOfWork:edit", "scopeOfWork:finalize", "scopeOfWork:print", "scopeOfWork:chasePo",
      "deliveryOrder:view", "deliveryOrder:viewAll", "deliveryOrder:edit", "deliveryOrder:finalize", "deliveryOrder:print",
      "service:view", "service:viewAll", "service:print", "serviceTemplates:view",
      "ar:view", "ar:cancel",
    ],
    isSuperAdmin: false,
    isSystem: false,
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "ดูข้อมูลได้อย่างเดียว ไม่สามารถสร้าง แก้ไข หรืออนุมัติได้",
    permissions: ["dashboard:view", "quotations:view", "quotations:viewAll", "products:view", "customers:view", "scopeOfWork:view", "scopeOfWork:viewAll", "deliveryOrder:view", "deliveryOrder:viewAll", "service:view", "service:viewAll", "serviceTemplates:view", "ar:view", "stock:view"],
    isSuperAdmin: false,
    isSystem: false,
  },
];

// ค้นหาบทบาทจาก key ที่กำหนด
// Finds a role by its key
export function findRole(roles: Role[], roleKey: string): Role | undefined {
  return roles.find((r) => r.key === roleKey);
}

// ตรวจสอบว่าบทบาทนี้มีสิทธิ์ที่ระบุหรือไม่ (Super Admin ผ่านเสมอ)
// Checks whether a role has the given permission (Super Admin always passes)
export function roleHasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role.isSuperAdmin) return true;
  return role.permissions.includes(permission);
}

// ตรวจสอบว่าสิทธิ์นี้ถูกจำกัดให้เฉพาะบทบาท Super Admin เท่านั้นหรือไม่
// Checks whether a permission is locked to the Super Admin role only
export function isPermissionLockedToSuperAdmin(permission: Permission): boolean {
  return (SUPER_ADMIN_ONLY_PERMISSIONS as Permission[]).includes(permission);
}

/**
 * Nav destinations hidden from a role's own navigation **even though it holds the permission**
 * (added 2026-08-07). This is presentation, not authorization: the permission stays granted and
 * every server-side check is unaffected.
 *
 * `service_engineer` is the only entry, deliberately. The role keeps `customers:view` — it's
 * load-bearing, `ServiceReportEditor.tsx` fetches the customer list through `CustomerSelector` when
 * creating or opening a report, so revoking it would break report creation outright — but the
 * standalone Customers admin page isn't part of a field engineer's job, so the nav item is hidden.
 *
 * Dashboard was hidden here too when this was added, then **restored 2026-08-07** — the original
 * "engineers should only see บริการ" instruction turned out to rest on unclear internal
 * communication. Nothing about the permission changed in either direction; `dashboard:view` was
 * granted throughout, so this was only ever about what the sidebar offers.
 *
 * Scoped to the one concrete role rather than a behavioural rule (e.g. "any role with
 * service:create") — there's no second case yet, and a rule inferred from permissions would
 * silently reshape any future role that happened to match. **Consequences worth knowing**: a role
 * cloned from Service Engineer, or a custom role built to be equivalent, does NOT inherit this; and
 * because `service_engineer` is `isSystem: false` it can be deleted, after which this entry is
 * simply inert. Renaming it in Role Management is safe — the `key` never changes.
 */
const ROLE_HIDDEN_NAV_KEYS: Record<string, readonly string[]> = {
  service_engineer: ["customers"],
};

/** True when this role is not meant to see `navKey` in its own navigation. Never a security check. */
export function isNavHiddenForRole(role: Role | undefined | null, navKey: string): boolean {
  if (!role) return false;
  return (ROLE_HIDDEN_NAV_KEYS[role.key] ?? []).includes(navKey);
}

/** As above, resolved from a user rather than a role — the shape most client call sites have. */
export function isNavHiddenForUser(user: User | null | undefined, roles: Role[], navKey: string): boolean {
  if (!user) return false;
  return isNavHiddenForRole(findRole(roles, user.roleKey), navKey);
}

// ปรับรายการสิทธิ์ที่ส่งเข้ามาให้ถูกต้อง — ตัดสิทธิ์เฉพาะ Super Admin ออก และเติมสิทธิ์ที่จำเป็นให้อัตโนมัติ
/**
 * Normalizes a submitted permission list: drops Super-Admin-only permissions, then auto-includes
 * every dependency (`PERMISSION_DEPENDENCIES`). Shared by `POST`/`PATCH /api/roles` and the Role
 * Management matrix so the server and the UI can never disagree about what a saved role holds.
 *
 * Locked permissions are filtered on both sides of the expansion: once so a locked permission can't
 * drag dependencies in behind it, and once more in case a dependency is itself locked — the
 * Super-Admin lock always wins over auto-inclusion.
 */
export function sanitizeRolePermissions(permissions: Permission[]): Permission[] {
  const allowed = permissions.filter((p) => !isPermissionLockedToSuperAdmin(p));
  return withPermissionDependencies(allowed).filter((p) => !isPermissionLockedToSuperAdmin(p));
}

// ตรวจสอบว่าผู้ใช้ที่กำหนดมีสิทธิ์นี้หรือไม่ ตามบทบาทของผู้ใช้
// Checks whether a given user has the specified permission via their role
export function hasPermission(user: User | null | undefined, roles: Role[], permission: Permission): boolean {
  if (!user) return false;
  return roleHasPermission(findRole(roles, user.roleKey), permission);
}

// ตรวจสอบว่าผู้ใช้เป็น Super Admin หรือไม่
// Checks whether a given user is a Super Admin
export function userIsSuperAdmin(user: User | null | undefined, roles: Role[]): boolean {
  if (!user) return false;
  return findRole(roles, user.roleKey)?.isSuperAdmin ?? false;
}

// คืนชื่อบทบาทของผู้ใช้ เพื่อแสดงผล
// Returns the display name of the user's role
export function roleNameFor(user: User | null | undefined, roles: Role[]): string {
  if (!user) return "";
  return findRole(roles, user.roleKey)?.name ?? user.roleKey;
}

export interface RoleFields {
  name: string;
  description: string;
  permissions: Permission[];
}

// ดึงรายการบทบาททั้งหมดจากเซิร์ฟเวอร์
// Fetches all roles from the server
export async function fetchRoles(): Promise<Role[]> {
  const { roles } = await apiFetch<{ roles: Role[] }>("/roles");
  return roles;
}
// สร้างบทบาทใหม่ด้วยข้อมูลที่กำหนด
// Creates a new role with the given fields
export async function createRole(fields: RoleFields): Promise<Role> {
  const { role } = await apiFetch<{ role: Role }>("/roles", { method: "POST", body: JSON.stringify(fields) });
  return role;
}
// แก้ไขบทบาทที่มีอยู่ตาม key
// Updates an existing role identified by key
export async function updateRole(key: string, fields: Partial<RoleFields>): Promise<Role> {
  const { role } = await apiFetch<{ role: Role }>(`/roles/${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return role;
}
// ลบบทบาทตาม key
// Deletes a role identified by key
export async function deleteRole(key: string): Promise<void> {
  await apiFetch<void>(`/roles/${encodeURIComponent(key)}`, { method: "DELETE" });
}
