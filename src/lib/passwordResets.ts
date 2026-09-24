/**
 * กู้รหัสผ่านผ่าน Super Admin (2026-09-24) — คำสั่งเจ้าของ: *"ทำระบบกู้คืนรหัสผ่านถ้าผู้ใช้กดกู้รหัสผ่านให้ส่งรหัสผ่านไปให้
 * Super Admin จะมีแค่ Super admin ที่สามารถดูรหัสผ่านได้"* + *"ทำหน้าเพิ่มขึ้นมาด้วยนะเผื่อมีคนขอ"*
 *
 * รหัสผ่านเก็บแบบ bcrypt (ทางเดียว) **ไม่มีใครดึงรหัสเดิมออกมาได้** เจ้าของเลือกทางนี้ (ถามแล้ว):
 *   1. ผู้ใช้กด "ลืมรหัสผ่าน" ที่หน้าเข้าสู่ระบบ กรอกชื่อผู้ใช้/อีเมล → เกิดคำขอ + แจ้งเตือนถึง Super Admin ทุกคน
 *      (ตอบผู้ขอเหมือนกันทุกกรณี ไม่บอกว่าชื่อนั้นมีจริงไหม — กันการเดาชื่อผู้ใช้)
 *   2. Super Admin เปิดหน้า "คำขอกู้รหัสผ่าน" กด "ออกรหัสผ่านชั่วคราว" → ระบบสุ่มรหัสใหม่ **แสดงให้ Super Admin ครั้งเดียว**
 *      (ไม่เก็บตัวรหัสไว้ที่ไหน เก็บแค่ hash) เซสชันเดิมของผู้ใช้ถูกตัดทั้งหมด
 *   3. ผู้ใช้เข้าด้วยรหัสชั่วคราว แล้ว**ต้องตั้งรหัสใหม่ก่อนใช้งาน** (`User.mustChangePassword`)
 *
 * ไฟล์นี้มีแค่ type + ตัวเรียก API — ห้ามดึง React/i18n เข้ามา (ฝั่ง `api/` import type จากไฟล์นี้)
 */
import { apiFetch } from "./apiClient.js";

export type PasswordResetStatus = "pending" | "resolved" | "dismissed";

export interface PasswordResetRequest {
  id: string;
  userId: string;
  /** snapshot ตอนขอ — ถ้าผู้ใช้ถูกลบไปแล้วก็ยังอ่านได้ว่าใครขอ */
  fullName: string;
  username: string;
  employeeId: string;
  department: string;
  /** สิ่งที่ผู้ขอพิมพ์ (ชื่อผู้ใช้หรืออีเมล) */
  identifier: string;
  /** ข้อความถึง Super Admin เช่น เบอร์ติดต่อกลับ */
  note: string;
  status: PasswordResetStatus;
  requestedAt: string;
  /** ขอซ้ำระหว่างที่ยังค้าง = อัปเดตแถวเดิม ไม่สร้างใหม่ */
  lastRequestedAt: string;
  requestCount: number;
  requesterIp: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByName?: string;
}

/** ใช้ที่หน้าเข้าสู่ระบบ (ยังไม่ล็อกอิน) — ตอบสำเร็จเสมอถ้าข้อมูลครบ ไม่บอกว่าชื่อนั้นมีจริงหรือไม่ */
export async function requestPasswordReset(identifier: string, note: string): Promise<void> {
  await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ identifier, note }) });
}

export async function fetchPasswordResetRequests(): Promise<PasswordResetRequest[]> {
  const { requests } = await apiFetch<{ requests: PasswordResetRequest[] }>("/users/password-resets");
  return requests;
}

/** Super Admin เท่านั้น — คืนรหัสชั่วคราว **ครั้งเดียว** เซิร์ฟเวอร์ไม่เก็บตัวรหัสไว้ */
export async function issueTemporaryPassword(id: string): Promise<{ temporaryPassword: string; request: PasswordResetRequest }> {
  return apiFetch<{ temporaryPassword: string; request: PasswordResetRequest }>(
    `/users/password-resets/${encodeURIComponent(id)}/issue`, { method: "POST" },
  );
}

export async function dismissPasswordResetRequest(id: string): Promise<PasswordResetRequest> {
  const { request } = await apiFetch<{ request: PasswordResetRequest }>(
    `/users/password-resets/${encodeURIComponent(id)}/dismiss`, { method: "POST" },
  );
  return request;
}
