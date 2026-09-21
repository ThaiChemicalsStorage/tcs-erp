/**
 * ค่าตั้งต้นของระบบอัปโหลด — **ทุกค่าปรับได้จาก environment variable ห้าม hardcode ที่อื่น**
 * (ข้อ 5 ของ `docs/UPLOAD_COMPRESSION_TASK.md`) ดู `.env.example` สำหรับชื่อตัวแปรทั้งหมด
 *
 * อ่านค่าแบบ lazy ผ่านฟังก์ชัน ไม่ใช่ค่าคงที่ตอน import — `server/env.ts` โหลด `.env` ก่อนโมดูล api/
 * ตัวไหนจะถูก evaluate ก็จริง แต่เทสต์ตั้ง env ทีหลังได้ ถ้าตรึงค่าไว้ตอน import เทสต์จะแก้ไม่ได้เลย
 */

function num(name: string, fallback: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (raw === "") return fallback;
  const n = Number(raw);
  // ค่าที่ตั้งมาผิด (ตัวอักษร/ติดลบ/ศูนย์) ต้องไม่ทำให้ระบบอัปโหลดพังเงียบ ๆ — เตือนแล้วใช้ค่าเริ่มต้น
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`[upload] ${name}="${raw}" ใช้ไม่ได้ — ใช้ค่าเริ่มต้น ${fallback} แทน`);
    return fallback;
  }
  return n;
}

function list(name: string, fallback: string[]): string[] {
  const raw = (process.env[name] ?? "").trim();
  if (raw === "") return fallback;
  const parsed = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

export interface UploadConfig {
  /** ขนาดสูงสุดต่อไฟล์ **ก่อน**บีบอัด — รูปกับไฟล์เอกสารคนละเพดาน ดูเหตุผลที่ `maxDocumentBytes` */
  maxImageBytes: number;
  /**
   * เอกสาร (PDF/Office/ข้อความ) เพดานต่ำกว่ารูป **โดยตั้งใจ** — ไฟล์เก็บเป็น BSON Binary ใน MongoDB
   * ซึ่งมีเพดาน 16MB ต่อ document ตายตัว · รูปบีบแล้วเหลือหลักร้อย KB เสมอจึงรับ 20MB ได้สบาย
   * แต่ PDF ที่บีบไม่ลง (ข้อความล้วน) จะถูกเก็บขนาดเดิม 20MB ไม่ได้ เพราะชนเพดาน BSON
   * ถ้าย้ายไปเก็บบน object storage เมื่อไหร่ ค่านี้ขยับขึ้นได้ทันทีโดยไม่ต้องแก้โค้ด
   */
  maxDocumentBytes: number;
  maxFilesPerUpload: number;
  /** ด้านยาวสูงสุดของรูปหลังย่อ — ห้ามขยายรูปที่เล็กกว่านี้ */
  imageMaxDimension: number;
  imageQuality: number;
  thumbnailMaxDimension: number;
  thumbnailQuality: number;
  /**
   * พื้นล่างของการบีบรูป **เอกสาร** — กันไม่ให้รูปถ่ายใบเสร็จ/ใบส่งของอ่านตัวหนังสือไม่ออก
   * (ข้อควรระวังในข้อ 4.1 ของเจ้าของ: ห้าม quality < 75 หรือย่อ < 1600px สำหรับรูปเอกสาร)
   */
  documentImageMinDimension: number;
  documentImageMinQuality: number;
  pdfImageDpi: number;
  /** เวลาสูงสุดต่อการบีบหนึ่งไฟล์ — เกินแล้วเก็บไฟล์เดิม ไม่ทำให้อัปโหลดล้ม */
  compressTimeoutMs: number;
  /** นามสกุล/ชนิดไฟล์ที่ระบบรับ (ค่ากลาง) — แต่ละโมดูลแคบกว่านี้ได้ แต่กว้างกว่าไม่ได้ */
  allowedKinds: string[];
}

export function uploadConfig(): UploadConfig {
  return {
    maxImageBytes: num("UPLOAD_MAX_IMAGE_MB", 20) * 1024 * 1024,
    maxDocumentBytes: num("UPLOAD_MAX_DOCUMENT_MB", 10) * 1024 * 1024,
    maxFilesPerUpload: num("UPLOAD_MAX_FILES", 10),
    imageMaxDimension: num("UPLOAD_IMAGE_MAX_DIMENSION", 2000),
    imageQuality: num("UPLOAD_IMAGE_QUALITY", 80),
    thumbnailMaxDimension: num("UPLOAD_THUMBNAIL_DIMENSION", 400),
    thumbnailQuality: num("UPLOAD_THUMBNAIL_QUALITY", 70),
    documentImageMinDimension: num("UPLOAD_DOC_IMAGE_MIN_DIMENSION", 1600),
    documentImageMinQuality: num("UPLOAD_DOC_IMAGE_MIN_QUALITY", 75),
    pdfImageDpi: num("UPLOAD_PDF_DPI", 150),
    compressTimeoutMs: num("UPLOAD_COMPRESS_TIMEOUT_SECONDS", 60) * 1000,
    allowedKinds: list("UPLOAD_ALLOWED_KINDS", [
      "jpg", "jpeg", "png", "webp", "heic", "heif", "gif",
      "pdf", "docx", "xlsx", "pptx", "txt", "csv",
    ]),
  };
}
