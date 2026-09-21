import { randomUUID } from "node:crypto";
import { HttpError } from "../http.js";
import type { AuthContext } from "../auth.js";
import { getDb } from "../mongodb.js";
import { uploadConfig } from "./uploadConfig.js";
import { detectFile, familyOf, type FileKind } from "./fileKinds.js";
import { compressImage } from "./compressImage.js";
import { compressPdf } from "./compressPdf.js";
import { storage, storageKey } from "./storage.js";

/**
 * **จุดเดียวของทั้งระบบที่รับไฟล์จากผู้ใช้** (ข้อ 3 ของ `docs/UPLOAD_COMPRESSION_TASK.md`)
 *
 *   รับไฟล์ → ตรวจขนาด → ตรวจชนิดจากเนื้อไฟล์จริง → บีบอัดตามชนิด → ตั้งชื่อ UUID
 *   → บันทึกลง storage → บันทึกแถวใน `files` → คืนข้อมูลไฟล์
 *
 * ห้ามมีโค้ดบันทึกไฟล์กระจายอยู่ในโมดูลไหนอีก — ถ้าต้องรับไฟล์ ให้เรียก `storeUpload()` ตัวนี้
 */

/** แถวในคอลเลกชันกลาง `files` — ข้อมูลไฟล์ตามข้อ 7.1 ครบทุกช่อง */
export interface FileRecordFields {
  _id: string;
  originalName: string;
  storageKey: string;
  thumbnailKey: string;
  mime: string;
  sizeBefore: number;
  sizeAfter: number;
  status: "compressed" | "skipped" | "failed";
  /** เหตุผลที่ไม่ได้บีบ (ถ้ามี) — ไว้ตามสืบว่าทำไมไฟล์นี้ยังใหญ่ */
  statusReason: string;
  width: number | null;
  height: number | null;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  /** โมดูลและรายการที่ไฟล์นี้เป็นของ เช่น `"purchase-requests"` + เลขที่ใบ */
  module: string;
  docId: string;
  isDeleted: boolean;
}

export async function filesCollection() {
  const db = await getDb();
  return db.collection<FileRecordFields>("files");
}

let indexesEnsured = false;
async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const files = await filesCollection();
  await Promise.all([
    files.createIndex({ module: 1, docId: 1 }),
    files.createIndex({ uploadedAt: -1 }),
  ]);
  indexesEnsured = true;
}

/** ข้อมูลไฟล์ที่ส่งกลับให้ผู้เรียก — ไม่มีไบต์ติดไปด้วย */
export interface StoredFile {
  id: string;
  originalName: string;
  mime: string;
  size: number;
  sizeBefore: number;
  status: FileRecordFields["status"];
  url: string;
  thumbnailUrl: string;
}

export interface UploadPolicy {
  /** โมดูลที่เป็นเจ้าของไฟล์ ใช้เป็นส่วนหนึ่งของ URL และของแถวใน `files` */
  module: string;
  docId: string;
  /**
   * whitelist เฉพาะของโมดูลนี้ — **แคบกว่าค่ากลางได้ แต่กว้างกว่าไม่ได้** (ข้อ 5)
   * ไม่ระบุ = ใช้ค่ากลางทั้งหมด
   */
  allowedKinds?: FileKind[];
  /**
   * ไฟล์นี้เป็นรูปถ่ายเอกสารหรือไม่ — บังคับพื้นล่างความละเอียด/quality ไม่ให้อ่านไม่ออก
   * ค่าเริ่มต้น `true` เพราะไฟล์แนบในระบบนี้แทบทั้งหมดคือรูปถ่ายใบเสร็จ/ใบส่งของ/แบบงาน
   */
  isDocumentPhoto?: boolean;
}

function labelOfKinds(kinds: FileKind[]): string {
  const names: Partial<Record<FileKind, string>> = {
    jpg: "JPG", png: "PNG", webp: "WEBP", gif: "GIF", heic: "HEIC",
    pdf: "PDF", docx: "Word", xlsx: "Excel", pptx: "PowerPoint", txt: "TXT", csv: "CSV",
  };
  return [...new Set(kinds.map((k) => names[k] ?? k.toUpperCase()))].join(", ");
}

/**
 * รับไฟล์หนึ่งไฟล์เข้าระบบ · โยน `HttpError` เฉพาะกรณีที่**ผู้ใช้ต้องแก้ไขเอง** คือไฟล์ใหญ่เกิน
 * หรือชนิดไม่รองรับ (ข้อยกเว้นที่ข้อ 12 อนุญาต) — การบีบอัดที่ล้มเหลวไม่เคยทำให้อัปโหลดล้ม
 */
export async function storeUpload(
  ctx: AuthContext,
  input: { data: Buffer; fileName: string },
  policy: UploadPolicy,
): Promise<StoredFile> {
  const cfg = uploadConfig();
  const allowed = policy.allowedKinds ?? (cfg.allowedKinds as FileKind[]);
  // whitelist ของโมดูลต้องไม่กว้างกว่าค่ากลาง — ตัดส่วนที่เกินทิ้งเงียบ ๆ ไม่ใช่เชื่อโมดูล
  const effective = allowed.filter((k) => cfg.allowedKinds.includes(k === "jpg" ? "jpg" : k));

  const sizeBefore = input.data.length;
  if (sizeBefore === 0) throw new HttpError(400, "ไฟล์ว่างเปล่า");

  const detected = await detectFile(input.data, input.fileName);
  if (!detected || !effective.includes(detected.kind)) {
    throw new HttpError(400, `ไม่รองรับไฟล์ชนิดนี้ รองรับเฉพาะ ${labelOfKinds(effective)}`);
  }

  /**
   * เพดานของรูปสูงกว่าของเอกสาร — รูปบีบแล้วเหลือหลักร้อย KB เสมอ แต่ PDF ที่บีบไม่ลงจะถูกเก็บ
   * ขนาดเดิม ซึ่งชนเพดาน 16MB ต่อ document ของ BSON ได้ · ดูคอมเมนต์ใน uploadConfig.ts
   */
  const cap = detected.family === "image" ? cfg.maxImageBytes : cfg.maxDocumentBytes;
  if (sizeBefore > cap) {
    throw new HttpError(400, `ไฟล์ใหญ่เกิน ${Math.floor(cap / 1024 / 1024)}MB`);
  }

  let data = input.data;
  let mime = detected.mime;
  let ext = detected.ext;
  let thumbnail: Buffer | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let status: FileRecordFields["status"] = "skipped";
  let statusReason = "";

  if (detected.family === "image") {
    try {
      const out = await compressImage(input.data, detected.kind, cfg, policy.isDocumentPhoto ?? true);
      data = out.data; mime = out.mime; ext = out.ext;
      thumbnail = out.thumbnail; width = out.width; height = out.height; status = out.status;
      if (out.status === "skipped") statusReason = "ไฟล์เดิมเล็กกว่าไฟล์ที่บีบแล้ว";
    } catch (err) {
      // รูปที่ถอดรหัสไม่ได้ (HEIC แปลก ๆ, ไฟล์เสีย) — เก็บของเดิมไว้ ไม่ทำให้อัปโหลดล้ม
      status = "failed";
      statusReason = err instanceof Error ? err.message.slice(0, 200) : "บีบอัดรูปไม่สำเร็จ";
      console.warn(`[upload] บีบรูปไม่สำเร็จ (${input.fileName}) — เก็บไฟล์เดิม:`, statusReason);
    }
  } else if (detected.family === "pdf") {
    const out = await compressPdf(input.data, cfg);
    data = out.data; status = out.status; statusReason = out.reason ?? "";
  } else {
    // Office เป็น zip ที่บีบมาในตัวแล้ว บีบซ้ำแทบไม่ได้ผลและเสี่ยงทำไฟล์เสีย (ข้อ 4.3)
    // TXT/CSV เก็บตามเดิม (ข้อ 4.5) — ทั้งสองกลุ่มคุมด้วยเพดานขนาดแทน
    statusReason = detected.family === "office" ? "ไฟล์ Office บีบมาในตัวแล้ว" : "ไฟล์ข้อความเก็บตามเดิม";
  }

  const id = randomUUID();
  const key = storageKey(id, ext);
  const store = storage();
  await store.save(key, data, mime);

  let thumbnailKey = "";
  if (thumbnail) {
    thumbnailKey = storageKey(`${id}-thumb`, "webp");
    await store.save(thumbnailKey, thumbnail, "image/webp");
  }

  await ensureIndexes();
  const files = await filesCollection();
  const row: FileRecordFields = {
    _id: id,
    // ชื่อเดิมเก็บไว้แสดงผล/ดาวน์โหลดเท่านั้น **ไม่เคยถูกใช้เป็น path** (ข้อ 6, กัน path traversal)
    originalName: input.fileName.slice(0, 255),
    storageKey: key, thumbnailKey, mime,
    sizeBefore, sizeAfter: data.length,
    status, statusReason, width, height,
    uploadedBy: ctx.user.id, uploadedByName: ctx.user.fullName,
    uploadedAt: new Date().toISOString(),
    module: policy.module, docId: policy.docId,
    isDeleted: false,
  };
  await files.insertOne(row);

  return toStoredFile(row);
}

export function toStoredFile(row: FileRecordFields): StoredFile {
  return {
    id: row._id,
    originalName: row.originalName,
    mime: row.mime,
    size: row.sizeAfter,
    sizeBefore: row.sizeBefore,
    status: row.status,
    url: `/api/files/${encodeURIComponent(row._id)}`,
    thumbnailUrl: row.thumbnailKey ? `/api/files/${encodeURIComponent(row._id)}/thumbnail` : "",
  };
}

/**
 * ลบไฟล์จริงและรูปย่อออกจาก storage (ข้อ 7.3) — เรียกตอนลบไฟล์แนบหรือลบเอกสารที่มีไฟล์แนบ
 * ลบแถวใน `files` ด้วย ไม่ได้ soft-delete เพราะไบต์หายไปแล้ว แถวที่เหลือไว้จะชี้ไปที่ว่างเปล่า
 */
export async function deleteUpload(fileId: string): Promise<void> {
  const files = await filesCollection();
  const row = await files.findOne({ _id: fileId });
  if (!row) return;
  const store = storage();
  await store.delete(row.storageKey);
  if (row.thumbnailKey) await store.delete(row.thumbnailKey);
  await files.deleteOne({ _id: fileId });
}

/** ลบไฟล์ทั้งหมดของเอกสารหนึ่งใบ — ใช้ตอนลบเอกสารทิ้ง */
export async function deleteUploadsOf(module: string, docId: string): Promise<number> {
  const files = await filesCollection();
  const rows = await files.find({ module, docId }).toArray();
  for (const row of rows) await deleteUpload(row._id);
  return rows.length;
}

export { familyOf };
