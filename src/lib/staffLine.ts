import { apiFetch } from "./apiClient";

/**
 * LINE แจ้งเตือนพนักงาน (2026-10-08, Tuhmo #50) — ฝั่งหน้าจอของ `api/_lib/staffLine.ts`
 * ทุกคำสั่งทำกับบัญชีของคนที่ล็อกอินอยู่เท่านั้น ไม่มีทางผูก LINE ให้คนอื่น
 */
export interface StaffLineStatus {
  /** บริษัทตั้งค่า token ของ OA แล้วหรือยัง — ยังไม่ตั้ง = ซ่อนปุ่มเชื่อม */
  configured: boolean;
  linked: boolean;
  linkedAt: string;
  /** รหัสที่ออกแล้วและยังไม่หมดอายุ */
  pairing: { code: string; expiresAt: string } | null;
  oaName: string;
  oaBasicId: string;
  addFriendUrl: string;
}

export function fetchStaffLineStatus(): Promise<StaffLineStatus> {
  return apiFetch<StaffLineStatus>("/line/staff/me");
}

export function requestStaffLinePairing(): Promise<StaffLineStatus> {
  return apiFetch<StaffLineStatus>("/line/staff/pairing", { method: "POST" });
}

export function unlinkStaffLine(): Promise<StaffLineStatus> {
  return apiFetch<StaffLineStatus>("/line/staff/me", { method: "DELETE" });
}
