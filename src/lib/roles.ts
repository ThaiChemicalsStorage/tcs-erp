import { ALL_PERMISSIONS, type Permission, SUPER_ADMIN_ONLY_PERMISSIONS } from "./permissions";
import type { User } from "./users";

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
    ],
    isSuperAdmin: false,
    isSystem: true,
  },
  {
    key: "sales_user",
    name: "Sales User",
    description: "สร้างและแก้ไขใบเสนอราคาของตนเอง ส่งขออนุมัติได้ แต่อนุมัติ/ปฏิเสธไม่ได้",
    permissions: ["dashboard:view", "quotations:view", "quotations:create", "quotations:edit", "quotations:export", "products:view"],
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
      "quotations:edit",
      "quotations:approve",
      "quotations:reject",
      "quotations:export",
      "products:view",
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
      "quotations:edit",
      "quotations:approve",
      "quotations:reject",
      "quotations:export",
      "products:view",
    ],
    isSuperAdmin: false,
    isSystem: false,
  },
  {
    key: "viewer",
    name: "Viewer",
    description: "ดูข้อมูลได้อย่างเดียว ไม่สามารถสร้าง แก้ไข หรืออนุมัติได้",
    permissions: ["dashboard:view", "quotations:view", "products:view"],
    isSuperAdmin: false,
    isSystem: false,
  },
];

const ROLES_KEY = "tcs_erp_roles";

export function loadRoles(): Role[] {
  try {
    const raw = localStorage.getItem(ROLES_KEY);
    const parsed: Role[] = raw ? JSON.parse(raw) : [];
    return parsed.length > 0 ? parsed : defaultRoles;
  } catch {
    return defaultRoles;
  }
}
export function saveRoles(roles: Role[]) {
  localStorage.setItem(ROLES_KEY, JSON.stringify(roles));
}

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
