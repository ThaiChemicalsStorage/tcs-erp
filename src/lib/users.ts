import { apiFetch } from "./apiClient.js";

export type UserStatus = "active" | "inactive";

export interface User {
  id: string;
  employeeId: string;
  fullName: string;
  username: string;
  email: string;
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

export interface CreateUserFields {
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
}

export interface UpdateUserFields {
  fullName?: string;
  employeeId?: string;
  username?: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  roleKey?: string;
  status?: UserStatus;
  profilePictureDataUrl?: string;
  signatureDataUrl?: string;
  password?: string;
  /** Required alongside `password` when a non-admin is changing their own password. */
  currentPassword?: string;
}

export async function fetchUsers(): Promise<User[]> {
  const { users } = await apiFetch<{ users: User[] }>("/users");
  return users;
}
export async function createUser(fields: CreateUserFields): Promise<User> {
  const { user } = await apiFetch<{ user: User }>("/users", { method: "POST", body: JSON.stringify(fields) });
  return user;
}
export async function updateUser(id: string, fields: UpdateUserFields): Promise<User> {
  const { user } = await apiFetch<{ user: User }>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return user;
}
export async function deleteUser(id: string): Promise<void> {
  await apiFetch<void>(`/users/${id}`, { method: "DELETE" });
}
