import sharp, { type Sharp } from "sharp";
import type { UploadConfig } from "./uploadConfig.js";

/**
 * บีบอัดรูปฝั่งเซิร์ฟเวอร์ ตามลำดับที่เจ้าของกำหนดไว้ในข้อ 4.1 ของ
 * `docs/UPLOAD_COMPRESSION_TASK.md`
 *
 *   1. หมุนตาม EXIF **ก่อน**  2. ลบ metadata ทั้งหมด  3. ย่อด้านยาวไม่เกินที่ตั้งไว้ (ห้ามขยาย)
 *   4. แปลงเป็น WebP  5. คงความโปร่งใส  6. ถ้าบีบแล้วใหญ่กว่าเดิม ให้เก็บตัวที่เล็กกว่า
 *
 * ลำดับ 1 ก่อน 2 สำคัญมาก — ถ้าลบ EXIF ก่อนหมุน รูปจากมือถือจะตะแคงหรือกลับหัวถาวร
 * `sharp().rotate()` แบบไม่ใส่อาร์กิวเมนต์คือ "หมุนตาม EXIF orientation" และ sharp **ทิ้ง metadata
 * ทุกอย่างโดยปริยาย** ถ้าไม่เรียก `.withMetadata()` — เราจึงไม่เรียก ทั้งสองข้อจบในบรรทัดเดียว
 */

export interface CompressedImage {
  data: Buffer;
  /** MIME ของผลลัพธ์จริง — อาจไม่ใช่ webp ถ้าไฟล์เดิมเล็กกว่าและเราเลือกเก็บของเดิม */
  mime: string;
  ext: string;
  thumbnail: Buffer | null;
  width: number | null;
  height: number | null;
  /** `compressed` = บีบแล้วเล็กลงจริง · `skipped` = เก็บไฟล์เดิมเพราะบีบแล้วไม่ได้เล็กลง */
  status: "compressed" | "skipped";
}

/**
 * ถอดรหัส HEIC/HEIF ที่ sharp อ่านไม่ออก
 *
 * **sharp ที่ติดตั้งจาก prebuilt ถอดรหัส HEIC ของ iPhone ไม่ได้** — libvips ที่มากับมันคอมไพล์
 * libheif มาแบบไม่มี libde265 (ตัวถอด HEVC) ตรวจแล้ว 2026-09-21: `heifsave` ด้วย `compression:
 * "hevc"` ตอบ "Unsupported compression" และในไฟล์ .dll ไม่มีสัญลักษณ์ de265 เลย มีแต่ AV1
 * การเปลี่ยน base image เป็น Debian ก็ไม่ช่วย เพราะ sharp พก libvips ของตัวเองมาไม่ว่าดิสโทรไหน
 *
 * `libheif-js` เป็น libheif+libde265 ที่คอมไพล์เป็น WebAssembly — ไม่มี native dependency
 * จึงรันบน Alpine ได้ตามเดิม **ไม่ต้องเปลี่ยน base image**
 *
 * โหลดแบบ dynamic import ตอนเจอไฟล์ HEIC จริงเท่านั้น — โมดูล WASM หนักหลายเมกะไบต์
 * ไม่ควรถูกโหลดตอนเซิร์ฟเวอร์บูตทั้งที่ส่วนใหญ่ไม่เคยได้ใช้
 */
async function decodeHeic(buffer: Buffer): Promise<Sharp> {
  const mod = await import("libheif-js");
  // แพ็กเกจเป็น CommonJS ที่ emscripten สร้าง — ตัวจริงอาจอยู่ใต้ `default` หรือไม่ก็ได้ แล้วแต่ interop
  const lib = ((mod as { default?: unknown }).default ?? mod) as typeof import("libheif-js");
  const images = new lib.HeifDecoder().decode(buffer);
  if (!images || images.length === 0) throw new Error("HEIC decode produced no image");

  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const raw = { data: new Uint8ClampedArray(width * height * 4), width, height };
  await new Promise<void>((resolve, reject) => {
    image.display(raw, (result) => (result ? resolve() : reject(new Error("HEIC display failed"))));
  });
  return sharp(Buffer.from(raw.data.buffer), { raw: { width, height, channels: 4 } });
}

/**
 * @param isDocumentPhoto รูปที่แนบกับเอกสาร (ใบเสร็จ/ใบส่งของถ่ายมา) — บังคับพื้นล่างของความละเอียด
 *   และ quality ไม่ให้ต่ำจนอ่านตัวหนังสือไม่ออก ตามข้อควรระวังในข้อ 4.1 · ค่าเริ่มต้นของระบบ
 *   (2000px/q80) สูงกว่าพื้นล่างอยู่แล้ว ตัวคุมนี้จะมีผลก็ต่อเมื่อมีคนตั้ง env ต่ำกว่านั้น
 */
export async function compressImage(
  buffer: Buffer,
  kind: string,
  cfg: UploadConfig,
  isDocumentPhoto: boolean,
): Promise<CompressedImage> {
  const dimension = isDocumentPhoto
    ? Math.max(cfg.imageMaxDimension, cfg.documentImageMinDimension)
    : cfg.imageMaxDimension;
  const quality = isDocumentPhoto
    ? Math.max(cfg.imageQuality, cfg.documentImageMinQuality)
    : cfg.imageQuality;

  const source = kind === "heic" ? await decodeHeic(buffer) : sharp(buffer, { failOn: "none" });

  // `.rotate()` ต้องมาก่อน `.resize()` เสมอ ไม่งั้นด้านยาว/ด้านสั้นสลับกันตอนย่อ
  const pipeline = source
    .rotate()
    .resize(dimension, dimension, { fit: "inside", withoutEnlargement: true });

  const { data, info } = await pipeline
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  const thumbnail = await makeThumbnail(buffer, kind, cfg);

  /**
   * ข้อ 6: ไฟล์ที่บีบแล้วใหญ่กว่าไฟล์เดิมเกิดได้จริงกับรูปเล็กมากหรือ PNG ไม่กี่สี — เก็บตัวที่เล็กกว่า
   * ยกเว้น HEIC ซึ่ง**ต้องแปลงเสมอ** เพราะเบราว์เซอร์ส่วนใหญ่เปิดไฟล์ HEIC ไม่ได้ เก็บของเดิมไว้
   * เท่ากับเก็บไฟล์ที่ผู้ใช้เปิดดูไม่ได้
   */
  if (kind !== "heic" && data.length >= buffer.length) {
    return {
      data: buffer, mime: mimeOfKind(kind), ext: kind === "jpg" ? "jpg" : kind,
      thumbnail, width: info.width, height: info.height, status: "skipped",
    };
  }

  return { data, mime: "image/webp", ext: "webp", thumbnail, width: info.width, height: info.height, status: "compressed" };
}

/**
 * รูปย่อ 400px สำหรับหน้ารายการ (ข้อ 4.1) — ไฟล์ละ 20–40KB แทนที่จะโหลดรูปเต็มทุกแถว
 * ล้มแล้วไม่ถือเป็นความผิดพลาด: รูปย่อเป็นของแถม ไม่ใช่เงื่อนไขว่าอัปโหลดสำเร็จหรือไม่
 */
async function makeThumbnail(buffer: Buffer, kind: string, cfg: UploadConfig): Promise<Buffer | null> {
  try {
    // ต้องถอดรหัสใหม่ ใช้ pipeline ของรูปเต็มซ้ำไม่ได้ — sharp บริโภค stream ไปแล้วตอน toBuffer()
    const src = kind === "heic" ? await decodeHeic(buffer) : sharp(buffer, { failOn: "none" });
    return await src
      .rotate()
      .resize(cfg.thumbnailMaxDimension, cfg.thumbnailMaxDimension, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: cfg.thumbnailQuality, effort: 4 })
      .toBuffer();
  } catch (err) {
    console.warn("[upload] สร้างรูปย่อไม่สำเร็จ — ข้ามไป", err instanceof Error ? err.message : err);
    return null;
  }
}

function mimeOfKind(kind: string): string {
  switch (kind) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "heic": return "image/heic";
    default: return "image/jpeg";
  }
}
