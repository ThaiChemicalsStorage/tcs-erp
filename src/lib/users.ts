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

// ค้นหาผู้ใช้จากรายชื่อทั้งหมดด้วย username หรืออีเมล (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
// Finds a user in the list by username or email (case-insensitive).
export function findUserByLogin(users: User[], identifier: string): User | undefined {
  const needle = identifier.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === needle || u.email.toLowerCase() === needle);
}

// ตรวจว่ารหัสพนักงานนี้ถูกใช้โดยผู้ใช้คนอื่นแล้วหรือไม่
// Checks whether this employee ID is already taken by another user.
export function isEmployeeIdTaken(users: User[], employeeId: string, excludeUserId?: string): boolean {
  const needle = employeeId.trim().toLowerCase();
  return users.some((u) => u.id !== excludeUserId && u.employeeId.trim().toLowerCase() === needle);
}
// ตรวจว่าชื่อผู้ใช้นี้ถูกใช้โดยผู้ใช้คนอื่นแล้วหรือไม่
// Checks whether this username is already taken by another user.
export function isUsernameTaken(users: User[], username: string, excludeUserId?: string): boolean {
  const needle = username.trim().toLowerCase();
  return users.some((u) => u.id !== excludeUserId && u.username.toLowerCase() === needle);
}
// ตรวจว่าอีเมลนี้ถูกใช้โดยผู้ใช้คนอื่นแล้วหรือไม่
// Checks whether this email is already taken by another user.
export function isEmailTaken(users: User[], email: string, excludeUserId?: string): boolean {
  const needle = email.trim().toLowerCase();
  return users.some((u) => u.id !== excludeUserId && u.email.toLowerCase() === needle);
}

// สร้างอักษรย่อจากชื่อ-นามสกุล (สูงสุด 2 ตัวอักษร ตัวพิมพ์ใหญ่)
// Builds initials from a name (up to 2 uppercase letters).
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
  currentPassword?: string;
}

// ดึงรายชื่อผู้ใช้ทั้งหมดจากเซิร์ฟเวอร์
// Fetches all users from the server.
export async function fetchUsers(): Promise<User[]> {
  const { users } = await apiFetch<{ users: User[] }>("/users");
  return users;
}
// สร้างผู้ใช้ใหม่
// Creates a new user.
export async function createUser(fields: CreateUserFields): Promise<User> {
  const { user } = await apiFetch<{ user: User }>("/users", { method: "POST", body: JSON.stringify(fields) });
  return user;
}
// แก้ไขข้อมูลผู้ใช้ที่มีอยู่
// Updates an existing user.
export async function updateUser(id: string, fields: UpdateUserFields): Promise<User> {
  const { user } = await apiFetch<{ user: User }>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return user;
}
// ลบผู้ใช้
// Deletes a user.
export async function deleteUser(id: string): Promise<void> {
  await apiFetch<void>(`/users/${id}`, { method: "DELETE" });
}
