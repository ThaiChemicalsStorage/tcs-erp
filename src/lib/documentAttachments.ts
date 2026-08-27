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
  /** capability URL — มี `?key=` ที่สุ่มมาอยู่ในตัว เปิดได้โดยไม่ต้องล็อกอิน */
  url: string;
  size: number;
  contentType: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
}

/** เพดานเดียวกับที่ Scope of Work ใช้มาตั้งแต่ 2026-07-24 — ตอบข้อกังวล "กลัว db เต็ม" ด้วยลิมิตแข็ง
 * แทนการไปพึ่ง storage ภายนอก ไฟล์เก็บเป็น BSON Binary จึงเดินทางไปกับฐานข้อมูลทุกที่ */
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;
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
