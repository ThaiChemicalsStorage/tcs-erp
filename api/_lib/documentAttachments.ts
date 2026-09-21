import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import type { Collection } from "mongodb";
import { HttpError } from "./http.js";
import { requireUser, type AuthContext } from "./auth.js";
import { documentAttachmentFilesCollection } from "./collections.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText } from "./quoteValidation.js";
import type { DocumentAttachment } from "../../src/lib/documentAttachments.js";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_DOCUMENT } from "../../src/lib/documentAttachments.js";
import { storeUpload, deleteUpload } from "./upload/uploadService.js";

/**
 * ไฟล์แนบแบบใช้ร่วมกันได้ทุกเอกสาร — เพิ่ม 2026-08-27 ตอนที่ฝ่ายโครงการขอให้ใบสั่งงานแนบไฟล์ได้
 *
 * **ทำไมไม่ก๊อปจาก Scope of Work มาอีกชุด**: ตอนนั้นระบบมีการแนบไฟล์อยู่แล้ว **2 ชุดที่ไม่เกี่ยวกันเลย**
 * (Scope of Work และ Accounting) ชุดของ Scope of Work ผูกกับตัวเองทุกชั้น — ค่าคงที่ชื่อ
 * `MAX_ATTACHMENTS_PER_SCOPE`, คอลเลกชันมีฟิลด์ `scopeOfWorkId`, route อยู่ใต้ `/api/scope-of-works/`
 * การก๊อปเป็นชุดที่ 3 จะทำให้ตรรกะความปลอดภัยที่ยากจะทำให้ถูก (กันไฟล์ใหญ่, กัน charset, กัน race,
 * กัน HTML ที่รันสคริปต์) แตกกระจายอยู่ 3 ที่ ซึ่งจะแก้ตามกันไม่ครบในวันที่เจอช่องโหว่
 *
 * ตรรกะทั้งหมดในไฟล์นี้ยกมาจาก `scopeOfWorkHandler.ts` แบบตรง ๆ พร้อมเหตุผลเดิม — ดูคอมเมนต์แต่ละจุด
 * **Scope of Work ยังไม่ถูกย้ายมาใช้ตัวนี้** (โมดูลใช้งานหนัก เสี่ยงเกินคุณค่าในรอบเดียวกัน) ค้างไว้ใน TODO.md
 */

export interface AttachmentConfig<TDoc> {
  /** ชื่อเอกสารสำหรับข้อความ audit เช่น "ใบสั่งงาน" */
  label: string;
  /** ใช้เป็น `docType` ในคอลเลกชันไฟล์ และเป็นส่วนหนึ่งของ URL ดาวน์โหลด เช่น "job-orders" */
  docType: string;
  load: (id: string) => Promise<TDoc>;
  canEdit: (ctx: AuthContext, doc: TDoc) => boolean;
  /** คอลเลกชันของเอกสารเจ้าของไฟล์ — ใช้ `$push`/`$pull` ฟิลด์ `attachments` */
  collection: () => Promise<Collection<never>>;
  /** ค่า `_id` ที่ใช้ query เอกสาร (string id หรือ ObjectId แล้วแต่โมดูล) */
  idOf: (doc: TDoc) => unknown;
  currentAttachments: (doc: TDoc) => DocumentAttachment[];
  writeAudit: (ctx: AuthContext, action: string, detail: string, doc: TDoc) => Promise<void>;
  /** ตอบกลับด้วยเอกสารที่อัปเดตแล้ว ในรูปแบบของโมดูลนั้น ๆ */
  respond: (res: ApiResponse, id: string) => Promise<void>;
}

/**
 * `ensureIndexes()` ใน collections.ts รันเฉพาะตอน Setup Wizard ครั้งแรก ซึ่งเข้าไม่ถึงแล้วบนระบบที่
 * ติดตั้งไปนานแล้ว — กันเหนียวครั้งเดียวต่ออายุ instance เหมือนที่ Scope of Work ทำ ถ้าไม่มี index นี้
 * ทุกการดาวน์โหลดจะสแกนทั้งคอลเลกชันที่แต่ละแถวแบกไฟล์ได้ถึง 2 MB
 */
let indexesEnsured = false;
async function ensureIndexes(files: Awaited<ReturnType<typeof documentAttachmentFilesCollection>>): Promise<void> {
  if (indexesEnsured) return;
  await Promise.all([
    files.createIndex({ attachmentId: 1 }, { unique: true }),
    files.createIndex({ docType: 1, docId: 1 }),
  ]);
  indexesEnsured = true;
}

export async function handleAttachmentUpload<TDoc>(
  req: ApiRequest, res: ApiResponse, id: string, cfg: AttachmentConfig<TDoc>,
): Promise<void> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await cfg.load(id);
  if (!cfg.canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  // ตั้งใจ **ไม่** ล็อกที่ Draft — ไฟล์แนบเป็นข้อมูลที่ตามมาทีหลัง (แบบ, PO ของลูกค้า, รูปหน้างาน)
  // มักมาถึงหลังเอกสารอนุมัติแล้ว แนวเดียวกับที่ Scope of Work ยกเว้นไว้เมื่อ 2026-07-29

  const attachments = cfg.currentAttachments(doc);
  if (attachments.length >= MAX_ATTACHMENTS_PER_DOCUMENT) {
    throw new HttpError(400, `แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS_PER_DOCUMENT} ไฟล์ต่อเอกสาร — ลบไฟล์เดิมออกก่อน`);
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const fileName = sanitizeShortText(body.fileName, "ชื่อไฟล์");
  if (!fileName.trim()) throw new HttpError(400, "กรุณาระบุชื่อไฟล์");
  const contentType = typeof body.contentType === "string" && body.contentType.trim()
    ? body.contentType.trim().slice(0, 120)
    : "application/octet-stream";
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  if (!dataBase64) throw new HttpError(400, "ไม่พบข้อมูลไฟล์");
  // base64 ใหญ่กว่าไฟล์จริง 4/3 — ปฏิเสธก่อน decode เพื่อไม่ให้ payload เกินขนาดมาเสียเวลา decode เต็ม ๆ
  if (dataBase64.length > Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 8) {
    throw new HttpError(400, `ไฟล์ต้องมีขนาดไม่เกิน ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`);
  }
  // ตัว decode base64 ของ Node ไม่เคย throw — มัน **ข้าม** อักขระที่ไม่ถูกต้องไปเงียบ ๆ ไฟล์ที่เสียหาย
  // จึงถูกเก็บแบบขาดหายโดยไม่มีใครรู้ ตรวจ charset ตั้งแต่ต้นทางแทน (btoa() ฝั่ง client ให้ base64 มาตรฐาน)
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) throw new HttpError(400, "ข้อมูลไฟล์ไม่ถูกต้อง");
  const data = Buffer.from(dataBase64, "base64");
  if (data.length === 0) throw new HttpError(400, "ไม่พบข้อมูลไฟล์");

  /**
   * **ตั้งแต่ 2026-09-21 ไบต์ไม่ได้ถูกเขียนที่นี่อีกแล้ว** — ส่งต่อให้ `storeUpload()` ซึ่งตรวจชนิดไฟล์
   * จากเนื้อไฟล์จริง บีบอัด สร้างรูปย่อ แล้วเก็บลงตารางกลาง `files` (ดู `api/_lib/upload/`)
   * ที่นี่เหลือหน้าที่เดียวคือผูกไฟล์เข้ากับเอกสารแบบ atomic ซึ่งเป็นตรรกะเฉพาะของไฟล์แนบ
   *
   * `contentType` ที่ client ส่งมา**ไม่ถูกใช้แล้ว** — ระบบกำหนดเองจากชนิดจริงที่ตรวจได้
   * ตัวแปรยังรับไว้เพื่อไม่ให้ body เดิมของหน้าจอพัง แต่ค่าที่เก็บมาจาก `storeUpload()` เสมอ
   */
  const stored = await storeUpload(ctx, { data, fileName }, { module: cfg.docType, docId: id });
  void contentType;

  const attachmentId = stored.id;
  const attachment: DocumentAttachment = {
    id: attachmentId,
    fileName,
    url: stored.url,
    size: stored.size,
    contentType: stored.mime,
    uploadedBy: ctx.user.id,
    uploadedByName: ctx.user.fullName,
    uploadedAt: nowIso(),
    fileId: stored.id,
    thumbnailUrl: stored.thumbnailUrl,
  };

  // `$push` แบบ atomic ที่เช็คเพดานซ้ำในตัว filter เอง ("ช่องที่ N-1 ต้องยังไม่มี") — ถ้าอ่านมาทั้ง array
  // แล้ว `$set` ทับ การอัปโหลดพร้อมกันสองครั้งจะเริ่มจาก snapshot เดียวกัน แล้วอันหนึ่งหายไปเงียบ ๆ
  // (โดยที่ไฟล์ยังค้างอยู่เป็นขยะ) และทะลุเพดานไปด้วย cast เพราะ typing ของ driver ไม่รับ path แบบคำนวณ
  const collection = await cfg.collection();
  const pushResult = await collection.updateOne(
    { _id: cfg.idOf(doc), [`attachments.${MAX_ATTACHMENTS_PER_DOCUMENT - 1}`]: { $exists: false } } as never,
    { $push: { attachments: attachment }, $set: { updatedAt: nowIso(), updatedBy: ctx.user.id } } as never,
  );
  if (pushResult.matchedCount === 0) {
    // แพ้การแย่งช่องสุดท้าย — ลบไฟล์ที่เพิ่งเก็บทิ้ง ไม่ให้ค้างแบบไม่มีใครอ้างถึง แล้วตอบข้อความเดียวกับ pre-check
    await deleteUpload(stored.id);
    throw new HttpError(400, `แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS_PER_DOCUMENT} ไฟล์ต่อเอกสาร — ลบไฟล์เดิมออกก่อน`);
  }

  await cfg.writeAudit(ctx, `${cfg.label} Attachment Added`, `แนบไฟล์ "${fileName}" กับ${cfg.label} ${id}`, doc);
  await cfg.respond(res, id);
}

export async function handleAttachmentDelete<TDoc>(
  req: ApiRequest, res: ApiResponse, id: string, attachmentId: string, cfg: AttachmentConfig<TDoc>,
): Promise<void> {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await cfg.load(id);
  if (!cfg.canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");

  const target = cfg.currentAttachments(doc).find((a) => a.id === attachmentId);
  if (!target) throw new HttpError(404, "ไม่พบไฟล์แนบ");

  const collection = await cfg.collection();
  // `$pull` เฉพาะรายการนี้ (ไม่ใช่ `$set` ทับทั้ง array ที่อ่านมา) เพื่อไม่ให้ไฟล์ที่เพิ่งถูกแนบพร้อมกันหายไปด้วย
  //
  // ถอดรายการออกจากเอกสาร **ก่อน** ลบตัวไฟล์ ลำดับนี้สำคัญ: ถ้าลบไฟล์ก่อนแล้ว `$pull` ล้ม เอกสารจะเหลือ
  // ไฟล์แนบที่กดแล้วได้ 404 ตลอดไป ส่วนลำดับนี้ ถ้าการลบไฟล์ล้ม อย่างมากก็เหลือ blob กำพร้าที่ไม่มีใครอ้างถึง
  await collection.updateOne(
    { _id: cfg.idOf(doc) } as never,
    { $pull: { attachments: { id: attachmentId } }, $set: { updatedAt: nowIso(), updatedBy: ctx.user.id } } as never,
  );

  /**
   * ไฟล์ใหม่ (ตั้งแต่ 2026-09-21) อยู่ในตารางกลาง ส่วนไฟล์เก่ายังอยู่ใน `document_attachment_files`
   * ลบทั้งสองทางโดยดูจาก `fileId` — เรียกทั้งคู่ไปเลยก็ได้ แต่ทางที่ไม่ตรงจะเป็น no-op อยู่แล้ว
   * เขียนแยกให้ชัดว่าไฟล์ไหนอยู่ระบบไหน เพราะสคริปต์ย้ายข้อมูลต้องอ่านตรรกะเดียวกันนี้
   */
  if (target.fileId) {
    await deleteUpload(target.fileId);
  } else {
    const files = await documentAttachmentFilesCollection();
    await files.deleteOne({ attachmentId });
  }

  await cfg.writeAudit(ctx, `${cfg.label} Attachment Removed`, `ลบไฟล์แนบ "${target.fileName}" ออกจาก${cfg.label} ${id}`, doc);
  await cfg.respond(res, id);
}

/**
 * ชนิดไฟล์ที่ยอมให้แสดงในแท็บเบราว์เซอร์ได้ ที่เหลือ — โดยเฉพาะ text/html และ image/svg+xml ซึ่งรัน
 * สคริปต์ได้ — ถูกส่งเป็นไฟล์ดาวน์โหลดใต้ content type กลาง ๆ แทน: route นี้ไม่ต้องล็อกอินและอยู่บน
 * origin เดียวกับแอป ถ้าสะท้อน contentType ที่ผู้อัปโหลดกำหนดกลับไปพร้อม inline จะเปิดช่องให้ใครก็ตาม
 * ที่แก้เอกสารได้ อัปโหลดไฟล์ HTML ที่รันสคริปต์ (และอ่าน session) ใส่คนที่กดลิงก์
 */
const INLINE_SAFE_CONTENT_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain",
]);

/**
 * RFC 5987 ext-value percent-encoding — `encodeURIComponent` อย่างเดียวปล่อย `'`, `(`, `)`, `*` ไว้
 * และ `'` เปล่า ๆ ทำให้ไวยากรณ์ `filename*=UTF-8''…` พังทันที (มันเป็นตัวคั่นของฟิลด์นั้นเอง)
 * ชื่อไฟล์อย่าง `customer's PO (final).pdf` จะดาวน์โหลดออกมาเพี้ยน
 */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * ส่งไฟล์ออกไป — ตั้งใจ **ไม่มี** การตรวจ session: การเข้าถึงถูกคุมด้วย `downloadKey` ที่สุ่มมาและฝัง
 * อยู่ใน URL แทน เพราะลิงก์เหล่านี้ถูกส่งต่อให้คนอื่นเปิด key ยาว 24 ไบต์สุ่ม (base64url) key ผิดหรือ
 * ไม่มี key ตอบ 404 ทึบ ๆ ไม่บอกว่ามีไฟล์อยู่จริงหรือเปล่า
 */
export async function handleAttachmentDownload(
  req: ApiRequest, res: ApiResponse, docType: string, id: string, attachmentId: string,
): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) throw new HttpError(404, "ไม่พบไฟล์แนบ");

  const files = await documentAttachmentFilesCollection();
  await ensureIndexes(files);
  const file = await files.findOne({ docType, docId: id, attachmentId });
  if (!file || file.downloadKey !== key) throw new HttpError(404, "ไม่พบไฟล์แนบ");

  const buffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data.buffer);
  const storedType = (file.contentType || "").split(";")[0].trim().toLowerCase();
  const inlineSafe = INLINE_SAFE_CONTENT_TYPES.has(storedType);
  res.setHeader("Content-Type", inlineSafe ? storedType : "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `${inlineSafe ? "inline" : "attachment"}; filename*=UTF-8''${encodeRfc5987(file.fileName)}`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.status(200).send(buffer);
}
