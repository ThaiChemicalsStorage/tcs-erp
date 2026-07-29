import { ALL_PERMISSIONS, type Permission, SUPER_ADMIN_ONLY_PERMISSIONS } from "./permissions.js";
import type { User } from "./users";
import { apiFetch } from "./apiClient.js";

export interface Role {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  /** Bypasses every permission check and is the only role allowed roles:manage/company:manage. */
  isSuperAdmin: boolean;
  /** Built-in roles (Super Admin, Administrator) can't be deleted and their name/isSuperAdmin flag can't change. */
  isSystem: boolean;
}

/** Seeded server-side into the roles collection on first-run setup (see api/_lib/rbacSeed.ts). */
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
    ],
    isSuperAdmin: false,
    isSystem: false,
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "ดูข้อมูลได้อย่างเดียว ไม่สามารถสร้าง แก้ไข หรืออนุมัติได้",
    permissions: ["dashboard:view", "quotations:view", "quotations:viewAll", "products:view", "customers:view", "scopeOfWork:view", "scopeOfWork:viewAll", "deliveryOrder:view", "deliveryOrder:viewAll"],
    isSuperAdmin: false,
    isSystem: false,
  },
];

export function findRole(roles: Role[], roleKey: string): Role | undefined {
  return roles.find((r) => r.key === roleKey);
}

export function roleHasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  if (role.isSuperAdmin) return true;
  return role.permissions.includes(permission);
}

/** A permission a role is not allowed to hold unless that role is the Super Admin role itself. */
export function isPermissionLockedToSuperAdmin(permission: Permission): boolean {
  return (SUPER_ADMIN_ONLY_PERMISSIONS as Permission[]).includes(permission);
}

export function hasPermission(user: User | null | undefined, roles: Role[], permission: Permission): boolean {
  if (!user) return false;
  return roleHasPermission(findRole(roles, user.roleKey), permission);
}

export function userIsSuperAdmin(user: User | null | undefined, roles: Role[]): boolean {
  if (!user) return false;
  return findRole(roles, user.roleKey)?.isSuperAdmin ?? false;
}

export function roleNameFor(user: User | null | undefined, roles: Role[]): string {
  if (!user) return "";
  return findRole(roles, user.roleKey)?.name ?? user.roleKey;
}

export interface RoleFields {
  name: string;
  description: string;
  permissions: Permission[];
}

export async function fetchRoles(): Promise<Role[]> {
  const { roles } = await apiFetch<{ roles: Role[] }>("/roles");
  return roles;
}
export async function createRole(fields: RoleFields): Promise<Role> {
  const { role } = await apiFetch<{ role: Role }>("/roles", { method: "POST", body: JSON.stringify(fields) });
  return role;
}
export async function updateRole(key: string, fields: Partial<RoleFields>): Promise<Role> {
  const { role } = await apiFetch<{ role: Role }>(`/roles/${key}`, { method: "PATCH", body: JSON.stringify(fields) });
  return role;
}
export async function deleteRole(key: string): Promise<void> {
  await apiFetch<void>(`/roles/${key}`, { method: "DELETE" });
}
