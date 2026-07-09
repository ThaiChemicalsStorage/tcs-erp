import { newId, nowIso } from "./products";

export type UserStatus = "active" | "inactive";

export interface User {
  id: string;
  employeeId: string;
  fullName: string;
  username: string;
  email: string;
  /** Client-only simulation, not real security — see docs/RBAC.md. Never a real password hash. */
  passwordHash: string;
  phone: string;
  department: string;
  position: string;
  roleKey: string;
  status: UserStatus;
  profilePictureDataUrl: string;
  signatureDataUrl: string;
  createdAt: string;
  updatedAt: string;
}

const USERS_KEY = "tcs_erp_users";

export function loadUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
export function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

/**
 * Not a real cryptographic hash. This app has no backend — anything client-side is inherently
 * inspectable/bypassable via devtools. This only avoids storing raw passwords as plaintext strings.
 */
export function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    hash = (hash * 31 + password.charCodeAt(i)) | 0;
  }
  return `h${Math.abs(hash).toString(36)}_${password.length}`;
}
export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function findUserByLogin(users: User[], identifier: string): User | undefined {
  const needle = identifier.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === needle || u.email.toLowerCase() === needle);
}

export function isEmployeeIdTaken(users: User[], employeeId: string, excludeUserId?: string): boolean {
  const needle = employeeId.trim().toLowerCase();
  return users.some((u) => u.id !== excludeUserId && u.employeeId.trim().toLowerCase() === needle);
}
export function isUsernameTaken(users: User[], username: string, excludeUserId?: string): boolean {
  const needle = username.trim().toLowerCase();
  return users.some((u) => u.id !== excludeUserId && u.username.toLowerCase() === needle);
}
export function isEmailTaken(users: User[], email: string, excludeUserId?: string): boolean {
  const needle = email.trim().toLowerCase();
  return users.some((u) => u.id !== excludeUserId && u.email.toLowerCase() === needle);
}

export function newUser(fields: {
  employeeId: string;
  fullName: string;
  username: string;
  email: string;
  password: string;
  phone?: string;
  department?: string;
  position?: string;
  roleKey: string;
  status?: UserStatus;
}): User {
  const now = nowIso();
  return {
    id: newId("user"),
    employeeId: fields.employeeId.trim(),
    fullName: fields.fullName.trim(),
    username: fields.username.trim(),
    email: fields.email.trim(),
    passwordHash: hashPassword(fields.password),
    phone: fields.phone?.trim() ?? "",
    department: fields.department?.trim() ?? "",
    position: fields.position?.trim() ?? "",
    roleKey: fields.roleKey,
    status: fields.status ?? "active",
    profilePictureDataUrl: "",
    signatureDataUrl: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export const POSITION_SUGGESTIONS: string[] = [
  "CEO",
  "Director",
  "General Manager",
  "Sales Manager",
  "Sales Executive",
  "Engineer",
  "HR",
  "Accounting",
  "Purchasing",
  "Warehouse",
];

export const DEPARTMENT_SUGGESTIONS: string[] = [
  "ผู้บริหาร",
  "ฝ่ายขาย",
  "วิศวกรรม",
  "ฝ่ายบุคคล",
  "ฝ่ายบัญชี",
  "ฝ่ายจัดซื้อ",
  "คลังสินค้า",
  "ไอที",
];
