import type { ApiRequest, ApiResponse } from "../httpTypes.js";
import { HttpError, getPathSegments, withErrorHandling } from "../http.js";
import { requirePermission } from "../auth.js";
import type { Permission } from "../../../src/lib/permissions.js";
import { filesCollection } from "./uploadService.js";
import { storage } from "./storage.js";

/**
 * `GET /api/files/:id` และ `GET /api/files/:id/thumbnail`
 *
 * ทางเดียวที่ไฟล์ออกจากระบบ · **ตรวจสิทธิ์ตามโมดูลเจ้าของไฟล์เสมอ** (ข้อ 6) ไม่ใช่ลิงก์สาธารณะที่
 * ใครเดา id ถูกก็เปิดได้ — ต่างจากไฟล์แนบของ Scope of Work ที่ใช้ capability URL เพราะต้องส่งให้
 * คนนอกที่ไม่มีบัญชี ระบบใหม่นี้ไม่มี use case นั้น จึงล็อกด้วย session + permission ให้แน่นกว่า
 *
 * ⚠️ มี use case นั้นจริง: หน้าอนุมัติรายงานบริการของลูกค้า (`/approve`) แสดงรูปเช็คลิสต์ให้คนนอกดู
 * รูปพวกนั้นจึงออกทาง `/api/service-reports/:id/approval/photos/:photoId?key=` แทน (ใช้ `sendFileRow()`)
 */

/**
 * โมดูล → สิทธิ์ที่ต้องมีจึงจะเปิดไฟล์ของโมดูลนั้นได้
 *
 * **ไม่มีค่าปริยาย** — โมดูลที่ยังไม่ได้ลงทะเบียนตรงนี้จะเปิดไฟล์ไม่ได้เลย (403) ตั้งใจให้พลาดใน
 * ทางที่ปลอดภัย: การเพิ่มจุดอัปโหลดใหม่แล้วลืมแก้ที่นี่ ต้องเป็น "เปิดไม่ได้" ไม่ใช่ "ใครก็เปิดได้"
 */
const MODULE_PERMISSION: Record<string, Permission> = {
  "job-orders": "jobOrder:view",
  "purchase-requests": "purchaseRequest:view",
  "delivery-orders": "deliveryOrder:view",
  "receiving-reports": "receivingReport:view",
  "scope-of-works": "scopeOfWork:view",
  "service-reports": "service:view",
  "ar-milestones": "ar:view",
};

/**
 * ชนิดที่ปลอดภัยพอจะให้เบราว์เซอร์เปิดในแท็บได้ · ที่เหลือ — โดยเฉพาะ HTML และ SVG ซึ่งรันสคริปต์ได้
 * ใน origin เดียวกับแอป — บังคับดาวน์โหลด กติกาเดียวกับที่ `documentAttachments.ts` ใช้อยู่เดิม
 *
 * ถึงจะตรวจ magic bytes ตอนอัปโหลดแล้ว ด่านนี้ก็ยังต้องมี: ไฟล์เก่าที่ถูกเก็บก่อนมีการตรวจ และ
 * ไฟล์ที่ migrate เข้ามาทีหลัง อาจมี `mime` ที่ผู้อัปโหลดเป็นคนกำหนดติดมาด้วย
 */
const INLINE_SAFE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);

async function send(req: ApiRequest, res: ApiResponse, fileId: string, wantThumbnail: boolean): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");

  const files = await filesCollection();
  const row = await files.findOne({ _id: fileId });
  if (!row || row.isDeleted) throw new HttpError(404, "ไม่พบไฟล์");

  const permission = MODULE_PERMISSION[row.module];
  if (!permission) {
    console.warn(`[files] โมดูล "${row.module}" ยังไม่ได้ลงทะเบียนสิทธิ์ใน MODULE_PERMISSION — ปฏิเสธไว้ก่อน`);
    throw new HttpError(403, "Forbidden");
  }
  await requirePermission(req, permission);
  await sendFileRow(res, row, wantThumbnail);
}

/**
 * ส่งเนื้อไฟล์ของแถวในตาราง `files` ออกไป **โดยไม่ตรวจสิทธิ์** — ผู้เรียกต้องตรวจเองก่อนเสมอ
 *
 * แยกออกมาให้ลิงก์อนุมัติของลูกค้า (`/api/service-reports/:id/approval/photos/:photoId`) ใช้ ซึ่งลูกค้า
 * ไม่มีบัญชี ใช้กุญแจในลิงก์แทน session — เพิ่ม 2026-09-22 หลังรูปบนหน้าอนุมัติไม่ขึ้นเพราะ
 * `/api/files/:id` บังคับล็อกอิน
 */
export async function sendFileRow(
  res: ApiResponse,
  row: { storageKey: string; thumbnailKey: string; originalName: string },
  wantThumbnail: boolean,
): Promise<void> {
  const key = wantThumbnail && row.thumbnailKey ? row.thumbnailKey : row.storageKey;
  const blob = await storage().get(key);
  if (!blob) throw new HttpError(404, "ไม่พบไฟล์");

  const type = (blob.contentType || "application/octet-stream").split(";")[0].trim().toLowerCase();
  const inline = wantThumbnail || INLINE_SAFE.has(type);
  res.setHeader("Content-Type", inline ? type : "application/octet-stream");
  // ข้อ 6: กันเบราว์เซอร์เดาชนิดไฟล์เอง ซึ่งเป็นทางที่ไฟล์ "ไม่อันตราย" กลายเป็น HTML ที่รันสคริปต์ได้
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.originalName)}`,
  );
  res.status(200).send(blob.data);
}

export async function handleFiles(req: ApiRequest, res: ApiResponse): Promise<void> {
  // แปลง HttpError เป็น response เองเหมือน handler ระดับบนสุดตัวอื่น — ไม่งั้น 401/403/404
  // จะหลุดออกไปเป็น exception ดิบ ๆ ให้ผู้เรียกจัดการเอง
  return withErrorHandling(req, res, async () => {
    // `getPathSegments()` ถอด URL-encoding ให้แล้ว — ห้ามถอดซ้ำ (กติกาใน docs/CLAUDE.md)
    const parts = getPathSegments(req, "/api/files");
    if (parts.length === 1) return send(req, res, parts[0], false);
    if (parts.length === 2 && parts[1] === "thumbnail") return send(req, res, parts[0], true);
    throw new HttpError(404, "Not found");
  });
}
