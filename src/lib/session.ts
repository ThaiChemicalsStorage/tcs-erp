import { apiFetch, ApiError } from "./apiClient.js";
import type { User } from "./users";

export interface SessionInfo {
  user: User | null;
  needsSetup: boolean;
  /**
   * ทำไมถึงไม่มี user (2026-08-31) — `"superseded"` แปลว่าบัญชีนี้ถูกเข้าสู่ระบบจากเครื่องอื่น
   * ตั้งแต่มีข้อจำกัด "1 user เข้าใช้ได้ทีละเครื่องเดียว" · `null`/ไม่มีค่า = เหตุผลธรรมดา
   * (หมดอายุ กดออกเอง หรือยังไม่เคยเข้า) ซึ่งไม่ต้องอธิบายอะไรเป็นพิเศษ
   */
  signedOutReason?: "superseded" | null;
}

export interface SetupFields {
  employeeId: string;
  fullName: string;
  username: string;
  email: string;
  password: string;
}

// ดึงข้อมูล session ปัจจุบันของผู้ใช้จากเซิร์ฟเวอร์
// Fetches the current user's session info from the server.
export async function fetchSession(): Promise<SessionInfo> {
  return apiFetch<SessionInfo>("/auth/session");
}

// สร้างบัญชี Super Admin คนแรกตอนตั้งค่าระบบครั้งแรก
// Creates the first Super Admin account during initial setup.
export async function setupSuperAdmin(fields: SetupFields): Promise<User> {
  const { user } = await apiFetch<{ user: User }>("/auth/setup", { method: "POST", body: JSON.stringify(fields) });
  return user;
}

// เข้าสู่ระบบด้วยชื่อผู้ใช้/อีเมลและรหัสผ่าน คืนค่า error message ถ้าไม่สำเร็จ หรือ null ถ้าสำเร็จ
// Logs in with a username/email and password; returns an error message on failure, or null on success.
export async function login(identifier: string, password: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const { user } = await apiFetch<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
    return { user, error: null };
  } catch (err) {
    if (err instanceof ApiError) return { user: null, error: err.message };
    const isEnglish = typeof window !== "undefined" && window.localStorage.getItem("tcs_erp_lang") === "en";
    return { user: null, error: isEnglish ? "Login failed. Please try again." : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }
}

// ออกจากระบบ (ลบ session ฝั่งเซิร์ฟเวอร์)
// Logs out (clears the server-side session).
export async function logout(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}
