import { ALL_PERMISSIONS, type Permission, SUPER_ADMIN_ONLY_PERMISSIONS } from "./permissions.js";
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
      "service:view", "service:viewAll", "service:print", "serviceTemplates:view",
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
    ],
    isSuperAdmin: false,
    isSystem: false,
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "ดูข้อมูลได้อย่างเดียว ไม่สามารถสร้าง แก้ไข หรืออนุมัติได้",
    permissions: ["dashboard:view", "quotations:view", "quotations:viewAll", "products:view", "customers:view", "scopeOfWork:view", "scopeOfWork:viewAll", "deliveryOrder:view", "deliveryOrder:viewAll", "service:view", "service:viewAll", "serviceTemplates:view"],
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
  const { role } = await apiFetch<{ role: Role }>(`/roles/${key}`, { method: "PATCH", body: JSON.stringify(fields) });
  return role;
}
// ลบบทบาทตาม key
// Deletes a role identified by key
export async function deleteRole(key: string): Promise<void> {
  await apiFetch<void>(`/roles/${key}`, { method: "DELETE" });
}
