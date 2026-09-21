import { apiFetch } from "./apiClient.js";

/**
 * ไฟล์แนบแบบใช้ร่วมกันได้ทุกเอกสาร — เพิ่ม 2026-08-27 ตอนที่ฝ่ายโครงการขอให้ใบสั่งงานแนบไฟล์ได้
 *
 * รูปร่างเหมือน `ScopeOfWorkAttachment` ทุกฟิลด์โดยตั้งใจ เพื่อให้ย้าย Scope of Work มาใช้ตัวนี้ทีหลังได้
 * โดยไม่ต้องแปลงข้อมูล (ยังไม่ย้ายในรอบนี้ — โมดูลนั้นใช้งานหนัก ค้างไว้ใน TODO.md)
 */
export interface DocumentAttachment {
  id: string;
  fileName: string;
  /**
   * ที่อยู่สำหรับเปิดไฟล์ · **ไฟล์ตั้งแต่ 2026-09-21 เป็น `/api/files/:id` ที่ตรวจสิทธิ์ตามโมดูล**
   * ส่วนไฟล์เก่ากว่านั้นเป็น capability URL ที่มี `?key=` สุ่มอยู่ในตัว เปิดได้โดยไม่ต้องล็อกอิน
   * — หน้าจอไม่ต้องรู้ความต่าง แค่เปิด `url` ที่ได้มา
   */
  url: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  /**
   * id ในตารางกลาง `files` — **มีเฉพาะไฟล์ที่อัปโหลดตั้งแต่ 2026-09-21** ที่ผ่านระบบบีบอัดกลาง
   * ไม่มีค่า = ไฟล์เก่าที่ไบต์ยังอยู่ใน `document_attachment_files` ตามเดิม (ดู `uploadService.ts`)
   */
  fileId?: string;
  /** URL รูปย่อ 400px สำหรับหน้ารายการ — ว่างเมื่อไม่ใช่รูป หรือเป็นไฟล์เก่า */
  thumbnailUrl?: string;
}

/**
 * เพดาน**ฝั่งหน้าจอ** สำหรับเตือนผู้ใช้ก่อนอัปโหลด — ตัวจริงที่บังคับคือ `uploadConfig()` ฝั่งเซิร์ฟเวอร์
 * ซึ่งแยกเพดานรูป (20MB) กับเอกสาร (10MB) และปรับจาก env ได้
 *
 * ตั้งเป็นค่าที่ใหญ่ที่สุดที่เป็นไปได้ เพื่อไม่ให้หน้าจอปฏิเสธไฟล์ที่เซิร์ฟเวอร์รับได้จริง · ก่อน
 * 2026-09-21 ค่านี้คือ 2MB และเป็นเพดานจริง เพราะยังไม่มีการบีบอัดฝั่งเซิร์ฟเวอร์
 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_DOCUMENT = 5;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * อ่านไฟล์เป็น base64 มาตรฐาน — แปลงทีละก้อนเพราะ `String.fromCharCode(...bytes)` กับไฟล์ 2 MB
 * จะกระจาย argument นับล้านตัวแล้ว stack ล้น (ตรรกะเดียวกับที่ ScopeOfWorkDocument.tsx เขียนแทรกไว้
 * ย้ายมาไว้ที่เดียวตอน 2026-08-27)
 */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function uploadDocumentAttachment<T>(
  docType: string,
  id: string,
  file: { fileName: string; contentType: string; dataBase64: string },
): Promise<T> {
  return apiFetch<T>(`/${docType}/${encodeURIComponent(id)}/attachments`, {
    method: "POST",
    body: JSON.stringify(file),
  });
}

export async function deleteDocumentAttachment<T>(docType: string, id: string, attachmentId: string): Promise<T> {
  return apiFetch<T>(`/${docType}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE",
  });
}
