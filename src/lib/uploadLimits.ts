/**
 * เพดานและชนิดไฟล์**ฝั่งหน้าจอ** — ไว้เตือนผู้ใช้ทันทีก่อนเริ่มอัปโหลด ไม่ต้องรอให้ไฟล์ 20MB
 * วิ่งขึ้นไปให้เซิร์ฟเวอร์ปฏิเสธ (ข้อ 5 ของ `docs/UPLOAD_COMPRESSION_TASK.md`)
 *
 * **นี่ไม่ใช่ด่านจริง** ด่านจริงคือ `api/_lib/upload/uploadConfig.ts` ซึ่งปรับจาก env ได้และตรวจ
 * ชนิดไฟล์จากเนื้อไฟล์จริง · ค่าที่นี่ต้องตรงกับ**ค่าเริ่มต้น**ของฝั่งนั้น ถ้าเจ้าของตั้ง env ให้
 * เล็กลง หน้าจอจะปล่อยผ่านแล้วเซิร์ฟเวอร์ตอบข้อความภาษาไทยที่ถูกต้องเอง ซึ่งยอมรับได้
 */

export const CLIENT_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const CLIENT_MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** ค่า `accept` ของ `<input type="file">` — ตรงกับ whitelist กลาง (ข้อ 5 ขั้นที่ 5) */
export const ACCEPT_ALL_UPLOADS =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,.gif,.pdf,.docx,.xlsx,.pptx,.txt,.csv," +
  "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif,application/pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation," +
  "text/plain,text/csv";

/** สำหรับจุดที่รับรูปอย่างเดียว เช่น รูปเช็คลิสต์งานบริการ */
export const ACCEPT_IMAGES = ".jpg,.jpeg,.png,.webp,.heic,.heif,.gif,image/*";

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|gif)$/i;

function isImage(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_EXTENSIONS.test(file.name);
}

/** เพดานที่ใช้กับไฟล์นี้ — รูปกับเอกสารคนละค่า ดูเหตุผลใน `uploadConfig.ts` */
export function limitFor(file: File): number {
  return isImage(file) ? CLIENT_MAX_IMAGE_BYTES : CLIENT_MAX_DOCUMENT_BYTES;
}

/**
 * ตรวจไฟล์ก่อนส่ง · คืนข้อความภาษาไทยที่ผู้ใช้เข้าใจ หรือ `null` เมื่อผ่าน
 *
 * ข้อความต้องบอก**เพดานที่ใช้กับไฟล์นั้นจริง ๆ** ไม่ใช่เพดานกลาง — ผู้ใช้ที่ถูกปฏิเสธ PDF 12MB
 * ต้องเห็น "10MB" ไม่ใช่ "20MB" ไม่งั้นจะงงว่าทำไมไฟล์ที่เล็กกว่าเพดานถึงไม่ผ่าน
 */
export function checkBeforeUpload(file: File): string | null {
  if (file.size === 0) return "ไฟล์ว่างเปล่า";
  const cap = limitFor(file);
  if (file.size > cap) {
    return `ไฟล์ใหญ่เกิน ${Math.floor(cap / 1024 / 1024)}MB — ${isImage(file) ? "รูปภาพ" : "ไฟล์เอกสาร"}ต้องไม่เกินขนาดนี้`;
  }
  return null;
}

/** ข้อความบอกผู้ใช้ว่ารองรับไฟล์อะไรบ้าง — ใช้ใต้ปุ่มแนบไฟล์ */
export const SUPPORTED_TYPES_HINT = "รองรับ JPG, PNG, WEBP, HEIC, GIF, PDF, Word, Excel, PowerPoint, TXT และ CSV";
