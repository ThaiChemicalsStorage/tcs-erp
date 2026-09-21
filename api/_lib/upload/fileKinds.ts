import { fileTypeFromBuffer } from "file-type";

/**
 * ระบุชนิดไฟล์จาก **เนื้อไฟล์จริง (magic bytes)** ไม่ใช่นามสกุลหรือ Content-Type ที่ browser ส่งมา
 * (ข้อ 6 ของ `docs/UPLOAD_COMPRESSION_TASK.md`)
 *
 * ก่อนหน้านี้ทุกจุดอัปโหลดในระบบเชื่อ `contentType` จาก client ตรง ๆ — ไฟล์ `.exe` ที่เปลี่ยนนามสกุล
 * เป็น `.jpg` จึงถูกเก็บได้ ด่านที่มีอยู่เดิมคือตอน **ดาวน์โหลด** (บังคับ `Content-Disposition:
 * attachment` สำหรับชนิดที่รันสคริปต์ได้) ซึ่งกัน XSS ได้จริง แต่ไม่ได้กันการเก็บไฟล์ขยะ/อันตราย
 */

/** ชนิดที่ระบบรู้จัก — ชื่อสั้นตัวพิมพ์เล็ก ใช้เป็นคีย์ใน whitelist ของ config และของแต่ละโมดูล */
export type FileKind =
  | "jpg" | "png" | "webp" | "gif" | "heic"
  | "pdf" | "docx" | "xlsx" | "pptx"
  | "txt" | "csv";

export type FileFamily = "image" | "pdf" | "office" | "text";

interface KindInfo {
  family: FileFamily;
  /** MIME ที่ระบบเป็นคนกำหนดเอง — **ไม่เคยสะท้อนค่าที่ผู้อัปโหลดส่งมา** */
  mime: string;
  ext: string;
}

const KINDS: Record<FileKind, KindInfo> = {
  jpg: { family: "image", mime: "image/jpeg", ext: "jpg" },
  png: { family: "image", mime: "image/png", ext: "png" },
  webp: { family: "image", mime: "image/webp", ext: "webp" },
  gif: { family: "image", mime: "image/gif", ext: "gif" },
  heic: { family: "image", mime: "image/heic", ext: "heic" },
  pdf: { family: "pdf", mime: "application/pdf", ext: "pdf" },
  docx: { family: "office", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  xlsx: { family: "office", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  pptx: { family: "office", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" },
  txt: { family: "text", mime: "text/plain", ext: "txt" },
  csv: { family: "text", mime: "text/csv", ext: "csv" },
};

export function kindInfo(kind: FileKind): KindInfo {
  return KINDS[kind];
}

export function familyOf(kind: FileKind): FileFamily {
  return KINDS[kind].family;
}

/** ชื่อชนิดที่ `file-type` คืนมา → ชื่อชนิดของเรา · ที่ไม่อยู่ในนี้ = ไม่รองรับ */
const FROM_DETECTED: Record<string, FileKind> = {
  jpg: "jpg", png: "png", webp: "webp", gif: "gif",
  heic: "heic", avif: "heic", // HEIF ทั้งสองแบบเข้าเส้นทางถอดรหัสเดียวกัน
  pdf: "pdf",
  docx: "docx", xlsx: "xlsx", pptx: "pptx",
};

/**
 * ตรวจว่าเป็น UTF-8/ASCII ล้วนหรือไม่ — TXT/CSV **ไม่มี magic bytes** ให้ตรวจ จึงต้องพิสูจน์ทางอ้อม
 * ว่าเนื้อไฟล์อ่านเป็นข้อความได้จริง ไม่ใช่ไบนารีที่ตั้งชื่อ `.txt` มาหลอก
 *
 * เกณฑ์: ถอดรหัส UTF-8 แบบเข้มงวดต้องผ่าน และต้องไม่มีอักขระควบคุมที่ไม่ใช่ tab/CR/LF
 * (ไฟล์ไบนารีแทบทุกชนิดมี NUL byte ซึ่งตกด่านนี้ทันที)
 */
function looksLikeText(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    // eslint-disable-next-line no-control-regex -- ตั้งใจจับอักขระควบคุมตรง ๆ เพื่อแยกไบนารีออก
    return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  } catch {
    return false;
  }
}

export interface DetectedFile {
  kind: FileKind;
  family: FileFamily;
  /** MIME ที่ระบบกำหนดจากชนิดจริง ไม่ใช่ของ client */
  mime: string;
  ext: string;
}

/**
 * ระบุชนิดจากเนื้อไฟล์ · คืน `null` เมื่อระบุไม่ได้หรือเป็นชนิดที่ระบบไม่รองรับ
 *
 * `declaredName` ใช้**เฉพาะตอนแยก TXT กับ CSV** ซึ่งเนื้อไฟล์เหมือนกันทุกประการ — ไม่ได้ใช้ตัดสินว่า
 * ไฟล์เป็นชนิดไหน การเชื่อชื่อไฟล์คือช่องโหว่ที่ฟังก์ชันนี้มีไว้ปิด
 */
export async function detectFile(buffer: Buffer, declaredName: string): Promise<DetectedFile | null> {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected) {
    const kind = FROM_DETECTED[detected.ext];
    if (!kind) return null;
    const info = KINDS[kind];
    return { kind, family: info.family, mime: info.mime, ext: info.ext };
  }

  // ไม่มี magic bytes → เหลือความเป็นไปได้เดียวที่เรารับคือไฟล์ข้อความ
  if (!looksLikeText(buffer)) return null;
  const kind: FileKind = declaredName.trim().toLowerCase().endsWith(".csv") ? "csv" : "txt";
  const info = KINDS[kind];
  return { kind, family: info.family, mime: info.mime, ext: info.ext };
}
