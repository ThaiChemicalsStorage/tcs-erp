import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import type { Collection } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  receivingReportsCollection, purchaseOrdersCollection, productsCollection, apEntriesCollection,
  countersCollection, auditLogCollection,
  toObjectId, withStringId, type ReceivingReportFields, type CounterFields,
} from "./collections.js";
import { nextMonthlyDocumentNumber } from "./documentNumbering.js";
import { applyStockMovement } from "./stockHandler.js";
import {
  handleAttachmentUpload, handleAttachmentDelete, handleAttachmentDownload, type AttachmentConfig,
} from "./documentAttachments.js";
import type { DocumentAttachment } from "../../src/lib/documentAttachments.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import {
  receivingReportTotals, outstandingQtyOf, isFullyReceived, batchTotals,
  type ReceivingReportLine, type ReceivingBatch, type ReceivingReportSummary,
} from "../../src/lib/receivingReport.js";
import type { ApEntryFields } from "./collections.js";

/**
 * ใบรับสินค้า (Receiving Report) API — added 2026-09-03 กับโมดูลแผนกสโตร์
 * ดู `src/lib/receivingReport.ts` สำหรับรูปร่างข้อมูลและเหตุผลของโมเดล
 *
 * **หัวใจของไฟล์นี้คือ `handlePostBatch()`** — "รับของหนึ่งรอบ" ทำสามอย่างพร้อมกันในคำสั่งเดียว:
 * เพิ่มสต๊อกพร้อมต้นทุน → ตั้งหนี้ลงทะเบียนเจ้าหนี้/ภาษีซื้อ → บันทึกรอบลงใบเดิม เจ้าของสั่งไว้ว่า
 * *"บันทึกบัญชีเพื่อตั้งหนี้และได้ทะเบียนรายงานภาษีซื้อ ทะเบียนเจ้าหนี้ และการ์ด stock"* ทั้งหมดนี้
 * ต้องเป็นผลของการกดรับของครั้งเดียว ไม่ใช่งานคีย์ซ้ำของบัญชี
 *
 * **ไม่มีขั้นอนุมัติ** — ผังกระบวนการจัดซื้อของเจ้าของไม่มีด่านอนุมัติตอนรับของ (ของมาถึงแล้ว
 * จะอนุมัติอะไรอีก) การควบคุมอยู่ที่สิทธิ์ `receivingReport:receive` และการยกเลิกรอบที่ทำได้
 * เฉพาะรอบล่าสุดที่ยังไม่จ่ายเงิน
 */

const MAX_BATCH_LINES = 200;

async function nextReceivingReportId(counters: Collection<CounterFields>): Promise<string> {
  return nextMonthlyDocumentNumber(counters, "RR", "receiving_report");
}

/**
 * `documentNumber` ต้องไม่ซ้ำ แต่ `ensureIndexes()` รันแค่ตอน Setup Wizard — ฐานข้อมูลที่ติดตั้งไปแล้ว
 * จะไม่มีวันได้ index นี้ สร้างเองแบบ lazy ครั้งเดียวต่อ instance (แนวเดียวกับใบสั่งซื้อ/ใบเบิก)
 * รวม index "หนึ่งใบสั่งซื้อ = หนึ่งใบรับสินค้า" ไว้ด้วย เพราะเป็นกติกาที่ต้องบังคับที่ฐานข้อมูล
 * ไม่ใช่แค่เช็คในโค้ด (สองแท็บกดสร้างพร้อมกันจะได้สองใบ)
 */
let indexesEnsured = false;
async function ensureReceivingReportIndexes(col: Collection<ReceivingReportFields & { _id: string }>): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    await col.updateMany(
      { $or: [{ documentNumber: { $exists: false } }, { documentNumber: "" }] },
      [{ $set: { documentNumber: "$_id" } }],
    );
    await col.createIndex({ documentNumber: 1 }, { unique: true });
    await col.createIndex({ purchaseOrderId: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
  } catch (err) {
    console.error("[receivingReport] ensure indexes failed", err);
  }
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบรับสินค้า", action, details, createdAt: nowIso(),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "receivingReport:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "receivingReport:viewAll");
}

function toClient(doc: ReceivingReportFields & { _id: string }) {
  return withStringId({
    ...doc,
    documentNumber: doc.documentNumber || doc._id,
    lines: doc.lines ?? [],
    batches: doc.batches ?? [],
    attachments: doc.attachments ?? [],
  });
}

function toSummary(doc: ReceivingReportFields & { _id: string }): ReceivingReportSummary {
  const full = toClient(doc);
  const totals = receivingReportTotals(full);
  return {
    id: full.id,
    documentNumber: full.documentNumber,
    purchaseOrderId: full.purchaseOrderId,
    purchaseOrderNumber: full.purchaseOrderNumber,
    vendorName: full.vendorName,
    jobCode: full.jobCode,
    status: full.status,
    orderedValue: totals.orderedValue,
    receivedValue: totals.receivedValue,
    outstandingValue: totals.outstandingValue,
    batchCount: full.batches.length,
    updatedAt: full.updatedAt,
  };
}

async function loadOrThrow(id: string) {
  const receivingReports = await receivingReportsCollection();
  const doc = await receivingReports.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบรับสินค้า");
  return doc;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "receivingReport:view");
  const purchaseOrderId = typeof req.query.purchaseOrderId === "string" ? req.query.purchaseOrderId : "";

  // ค้นด้วยใบสั่งซื้อต้นทาง = "ใบนี้มีใบรับสินค้าแล้วหรือยัง" ไม่ใช่การเปิดดูรายการ จึงไม่กรองเจ้าของ
  // ถ้ากรอง ผู้ใช้จะไม่เห็นว่าเพื่อนเปิดใบไว้แล้ว แล้วกดสร้างซ้ำจนไปชน 409 โดยไม่มีทางไปต่อ
  const ownership = purchaseOrderId
    ? {}
    : buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "receivingReport:viewAll"), "createdBy");

  const receivingReports = await receivingReportsCollection();
  const docs = await receivingReports
    .find({ isDeleted: false, ...(purchaseOrderId ? { purchaseOrderId } : {}), ...ownership })
    .sort({ updatedAt: -1 })
    .toArray();
  res.status(200).json({ receivingReports: docs.map(toSummary) });
}

/**
 * สร้างจากใบสั่งซื้อที่อนุมัติแล้ว — บรรทัดทั้งหมดเป็น snapshot ตอนสร้าง
 *
 * ถ้าใบสั่งซื้อนั้นมีใบรับสินค้าอยู่แล้วตอบ **409 พร้อม `receivingReportId` ของใบเดิม** ไม่ใช่
 * error เปล่า ๆ — หน้าจอจะได้พาไปเปิดใบเดิมต่อได้ทันที (เจ้าของเคาะไว้ว่า 1 PO = 1 RR)
 */
async function handleCreate(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "receivingReport:create");
  // ต้องมีสิทธิ์ดูใบสั่งซื้อด้วย ไม่งั้นปุ่มสร้างจะกลายเป็นช่องอ่านเนื้อหาใบสั่งซื้อที่ตัวเองไม่มีสิทธิ์ดู
  if (!roleHasPermission(ctx.role, "purchaseOrder:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const purchaseOrderId = typeof body.purchaseOrderId === "string" ? body.purchaseOrderId.trim() : "";
  if (!purchaseOrderId) throw new HttpError(400, "กรุณาระบุใบสั่งซื้อ");

  const purchaseOrders = await purchaseOrdersCollection();
  const po = await purchaseOrders.findOne({ _id: purchaseOrderId });
  if (!po || po.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งซื้อต้นทาง");
  if (po.status !== "Final") throw new HttpError(400, "ใบสั่งซื้อต้องได้รับอนุมัติก่อนจึงจะรับสินค้าได้");

  const receivingReports = await receivingReportsCollection();
  await ensureReceivingReportIndexes(receivingReports);
  const existing = await receivingReports.findOne({ purchaseOrderId, isDeleted: false });
  if (existing) {
    throw new HttpError(409, `ใบสั่งซื้อนี้มีใบรับสินค้าอยู่แล้ว (${existing.documentNumber || existing._id})`, {
      details: { receivingReportId: existing._id },
    });
  }

  /**
   * **ข้ามบรรทัดที่ถูกยกเลิก (2026-09-21)** — ถ้าไม่กรอง สโตร์จะถูกสั่งให้รับของที่จัดซื้อถอนไปแล้ว
   * และหนี้กับสต๊อกจะถูกตั้งจากของที่ไม่มีวันมาถึง · บรรทัดที่ยกเลิกยังพิมพ์อยู่บนใบสั่งซื้อ (ขีดทับ)
   * เพื่อให้ผู้ขายเทียบกับใบเดิมได้ แต่ไม่ใช่สิ่งที่ต้องรับเข้าคลัง
   */
  const linesToReceive = (po.lines ?? []).filter((l) => !l.cancelled);
  // ใบที่ไม่มีบรรทัดเลยยังสร้างใบรับสินค้าได้เหมือนเดิม — พฤติกรรมเดิมที่ไม่ได้ตั้งใจเปลี่ยนรอบนี้
  // ด่านนี้จับเฉพาะกรณี "มีรายการ แต่ถูกยกเลิกหมด" ซึ่งเป็นของใหม่ที่เพิ่งเป็นไปได้
  if (linesToReceive.length === 0 && (po.lines ?? []).length > 0) {
    throw new HttpError(400, "ทุกรายการในใบสั่งซื้อนี้ถูกยกเลิกแล้ว ไม่มีรายการที่ต้องรับของ");
  }
  const lines: ReceivingReportLine[] = linesToReceive.map((l) => ({
    id: newId("rrline"),
    poLineId: l.id,
    productId: l.productId || null,
    productCode: l.productCode ?? "",
    description: l.description ?? "",
    subDetails: l.subDetails ?? [],
    unit: l.unit ?? "",
    qtyOrdered: l.qty ?? 0,
    unitPriceOrdered: l.unitPrice ?? 0,
    discount: l.discount ?? null,
    discountMode: l.discountMode ?? "percent",
  }));

  const counters = await countersCollection();
  const id = await nextReceivingReportId(counters);
  const now = nowIso();
  const doc: ReceivingReportFields & { _id: string } = {
    _id: id,
    documentNumber: id,
    purchaseOrderId,
    purchaseOrderNumber: po.documentNumber || po._id,
    jobCode: po.jobCode ?? "",
    vendorName: po.vendorName ?? "",
    vendorTaxId: po.vendorTaxId ?? "",
    vendorAddress: po.vendorAddress ?? "",
    orderVatRate: po.vatRate ?? null,
    orderDiscount: po.discount ?? null,
    orderDiscountMode: po.discountMode ?? "percent",
    lines,
    batches: [],
    status: "Open",
    remarks: "",
    attachments: [],
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
    isDeleted: false,
  };

  try {
    await receivingReports.insertOne(doc);
  } catch (err) {
    // ชน unique index ของ purchaseOrderId — สองแท็บกดพร้อมกัน คืนใบที่ชนะไปให้เปิดต่อ
    if ((err as { code?: number }).code === 11000) {
      const winner = await receivingReports.findOne({ purchaseOrderId, isDeleted: false });
      throw new HttpError(409, `ใบสั่งซื้อนี้มีใบรับสินค้าอยู่แล้ว (${winner?.documentNumber ?? ""})`, {
        details: { receivingReportId: winner?._id ?? "" },
      });
    }
    throw err;
  }
  await writeAuditEntry(ctx, "Receiving Report Created", `สร้างใบรับสินค้า ${id} จากใบสั่งซื้อ ${doc.purchaseOrderNumber}`);
  res.status(201).json({ receivingReport: toClient(doc) });
}

async function handleGet(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "receivingReport:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({ receivingReport: toClient(doc) });
}

/**
 * แก้ได้แค่ 3 อย่าง: เลขที่บนฟอร์ม, หมายเหตุ, และปิด/เปิดใบ
 *
 * **บรรทัดสินค้าและรอบการรับแก้ผ่าน PATCH ไม่ได้เลย** — บรรทัดเป็น snapshot ของใบสั่งซื้อ ส่วนรอบรับ
 * ผูกกับสต๊อกและหนี้ที่ลงบัญชีไปแล้ว ถ้าปล่อยให้แก้ตรงนี้ ตัวเลขในใบกับในบัญชีจะเดินคนละทางทันที
 */
async function handleUpdate(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<ReceivingReportFields> = {};
  if ("documentNumber" in body) {
    const next = sanitizeShortText(body.documentNumber, "เลขที่ใบรับสินค้า", true);
    if (next !== doc.documentNumber) {
      const receivingReports = await receivingReportsCollection();
      const clash = await receivingReports.findOne({ documentNumber: next, _id: { $ne: id } });
      if (clash) throw new HttpError(409, `เลขที่ ${next} ถูกใช้ไปแล้วในใบรับสินค้าอื่น`);
    }
    update.documentNumber = next;
  }
  if ("remarks" in body) update.remarks = sanitizeLongText(body.remarks, "หมายเหตุ");
  if ("status" in body) {
    const next = body.status === "Closed" ? "Closed" : "Open";
    // ปิดใบทั้งที่ยังรับไม่ครบ = "ยกเลิกส่วนที่เหลือ" ซึ่งเป็นเรื่องปกติของงานจริง (ผู้ขายส่งไม่ครบแล้ว
    // ตกลงกันว่าจบแค่นี้) เปิดใบกลับมารับต่อได้เสมอ ตราบใดที่ยังมีของค้างรับอยู่จริง
    if (next === "Open" && isFullyReceived(toClient(doc))) {
      throw new HttpError(400, "ใบนี้รับครบทุกรายการแล้ว เปิดกลับมารับต่อไม่ได้");
    }
    update.status = next;
    update.closedAt = next === "Closed" ? nowIso() : "";
  }

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const receivingReports = await receivingReportsCollection();
  await receivingReports.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  if (!autoSave) await writeAuditEntry(ctx, "Receiving Report Updated", `แก้ไขใบรับสินค้า ${id}`);
  res.status(200).json({ receivingReport: toClient(updated) });
}

async function handleDelete(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "receivingReport:delete");
  const doc = await loadOrThrow(id);
  // ลบใบที่รับของไปแล้วไม่ได้ — สต๊อกกับหนี้ที่ลงไปแล้วจะกลายเป็นรายการไร้ต้นทาง ต้องยกเลิกรอบ
  // ทีละรอบก่อน (ซึ่งย้อนสต๊อกและหนี้ให้จริง ๆ) แล้วค่อยลบใบเปล่า
  if ((doc.batches ?? []).length > 0) {
    throw new HttpError(400, "ใบนี้มีการรับของแล้ว — ต้องยกเลิกรอบการรับทั้งหมดก่อนจึงจะลบได้");
  }
  const receivingReports = await receivingReportsCollection();
  await receivingReports.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Receiving Report Deleted", `ลบใบรับสินค้า ${id}`);
  res.status(204).end();
}

async function handlePrint(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "receivingReport:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Receiving Report Printed", `พิมพ์ใบรับสินค้า ${doc._id}`);
  res.status(204).end();
}

/**
 * บันทึกรับของหนึ่งรอบ — จุดที่สต๊อก บัญชีเจ้าหนี้ และภาษีซื้อ เกิดขึ้นพร้อมกัน
 *
 * **ลำดับการเขียนสำคัญ** และตั้งใจเรียงแบบนี้:
 *   1. ตรวจทุกอย่างให้ครบก่อน (จำนวนไม่เกินค้างรับ, สินค้าทุกตัวที่ผูกรหัสมีอยู่จริง) — ตรวจสินค้า
 *      ตั้งแต่ตอนนี้ เพื่อให้ขั้นที่ 2 แทบไม่มีทางล้มกลางคัน (รับเข้าไม่มีเงื่อนไข "ของไม่พอ" อยู่แล้ว)
 *   2. เขียนสต๊อกทีละบรรทัด เก็บ id ของ movement ไว้
 *   3. ตั้งหนี้ (`ap_entries`) หนึ่งแถวต่อรอบ
 *   4. ผูกรอบเข้าใบ แล้วปิดใบถ้ารับครบทุกบรรทัด
 * ถ้าขั้น 3 หรือ 4 ล้มจริง ๆ (เหตุสุดวิสัยระดับฐานข้อมูล) จะเหลือสต๊อกที่เพิ่มไปแล้วโดยไม่มีรอบรับ
 * — ตามได้จาก `stock_movements` ที่ประทับ `sourceId` ของใบไว้ทุกแถว และแก้ด้วยการปรับสต๊อกด้วยมือ
 * ระบบนี้ไม่มี transaction เพราะ MongoDB ที่โฮสต์เองเป็น standalone (ดู ARCHITECTURE.md)
 */
async function handlePostBatch(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "receivingReport:receive");
  const doc = await loadOrThrow(id);
  const current = toClient(doc);
  if (current.status === "Closed") throw new HttpError(400, "ใบนี้ปิดแล้ว — เปิดใบก่อนจึงจะรับของเพิ่มได้");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const invoiceNumber = sanitizeShortText(body.invoiceNumber, "เลขที่ใบกำกับภาษี/ใบส่งของ", true);
  const receivedDate = validateIsoDateOrEmpty(body.receivedDate, "วันที่รับของ") || nowIso().slice(0, 10);
  const invoiceDate = validateIsoDateOrEmpty(body.invoiceDate, "วันที่ใบกำกับภาษี") || receivedDate;
  const vatRate = sanitizeNullableNumber(body.vatRate, "อัตราภาษี (%)", { min: 0, max: 100 });
  const receivedBy = sanitizeShortText(body.receivedBy, "ผู้รับของ") || ctx.user.fullName;
  const remark = sanitizeLongText(body.remark, "หมายเหตุ");

  const rawLines = body.lines;
  if (!Array.isArray(rawLines)) throw new HttpError(400, "ข้อมูลรายการรับไม่ถูกต้อง");
  if (rawLines.length > MAX_BATCH_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_BATCH_LINES} รายการ`);

  const lineById = new Map(current.lines.map((l) => [l.id, l]));
  const batchLines: { lineId: string; qty: number; unitPrice: number; amount: number }[] = [];
  const seen = new Set<string>();
  for (const [idx, raw] of (rawLines as Record<string, unknown>[]).entries()) {
    const lineId = typeof raw.lineId === "string" ? raw.lineId : "";
    const line = lineById.get(lineId);
    if (!line) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ไม่พบบรรทัดที่ระบุในใบนี้`);
    if (seen.has(lineId)) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ส่งบรรทัดเดียวกันมาซ้ำ`);
    seen.add(lineId);
    const qty = sanitizeNullableNumber(raw.qty, `จำนวนรับลำดับที่ ${idx + 1}`) ?? 0;
    const unitPrice = sanitizeNullableNumber(raw.unitPrice, `ราคาต่อหน่วยลำดับที่ ${idx + 1}`) ?? 0;
    if (qty <= 0) continue; // บรรทัดที่ยังไม่รับรอบนี้ — ปล่อยผ่าน ไม่ใช่ข้อผิดพลาด
    const outstanding = outstandingQtyOf(current, line);
    if (qty > outstanding) {
      throw new HttpError(400, `${line.productCode || line.description}: รับได้อีกไม่เกิน ${outstanding} ${line.unit} (ส่งมา ${qty})`);
    }
    batchLines.push({ lineId, qty, unitPrice, amount: round2(qty * unitPrice) });
  }
  if (batchLines.length === 0) throw new HttpError(400, "กรุณาระบุจำนวนที่รับอย่างน้อยหนึ่งรายการ");

  // ตรวจว่าสินค้าที่ผูกรหัสไว้ยังมีอยู่จริงทุกตัว **ก่อน** เขียนสต๊อกแม้แต่แถวเดียว
  const productIds = [...new Set(batchLines.map((bl) => lineById.get(bl.lineId)!.productId).filter((pid): pid is string => !!pid))];
  if (productIds.length > 0) {
    const products = await productsCollection();
    const found = await products.countDocuments({ _id: { $in: productIds.map((pid) => toObjectId(pid)) } });
    if (found !== productIds.length) throw new HttpError(400, "มีสินค้าในใบนี้ที่ถูกลบไปแล้ว — แก้ไขใบสั่งซื้อหรือรับเป็นรายการพิมพ์เองแทน");
  }

  const totals = batchTotals(batchLines, vatRate);
  const batchId = newId("rrbatch");
  const now = nowIso();

  const stockMovementIds: string[] = [];
  for (const bl of batchLines) {
    const line = lineById.get(bl.lineId)!;
    if (!line.productId) continue; // บรรทัดพิมพ์เอง ไม่มีรหัสสินค้า → ไม่เขียนสต๊อก แต่ยังตั้งหนี้
    const { movement } = await applyStockMovement({
      productId: line.productId,
      kind: "receive",
      delta: bl.qty,
      reason: `รับสินค้าตามใบ ${current.documentNumber} (ใบกำกับ ${invoiceNumber})`,
      sourceType: "receiving_report",
      sourceId: id,
      sourceLabel: current.documentNumber,
      userId: ctx.user.id,
      unitCost: bl.unitPrice,
    });
    stockMovementIds.push(movement.id);
  }

  const apEntries = await apEntriesCollection();
  const apEntry: ApEntryFields = {
    entryType: "RR",
    receivingReportId: id,
    receivingReportNumber: current.documentNumber,
    batchId,
    purchaseOrderNumber: current.purchaseOrderNumber,
    jobCode: current.jobCode,
    vendorName: current.vendorName,
    vendorTaxId: current.vendorTaxId,
    vendorAddress: current.vendorAddress,
    invoiceNumber,
    invoiceDate,
    description: `รับสินค้าตามใบสั่งซื้อ ${current.purchaseOrderNumber}`,
    subtotal: round2(totals.subtotal),
    vatRate,
    vatAmt: round2(totals.vatAmt),
    total: round2(totals.total),
    status: "Unpaid",
    postedAt: now,
    postedBy: ctx.user.id,
    postedByName: ctx.user.fullName,
  };
  const apInsert = await apEntries.insertOne(apEntry);

  const batch: ReceivingBatch = {
    id: batchId,
    seq: current.batches.length + 1,
    receivedDate,
    invoiceNumber,
    invoiceDate,
    vatRate,
    lines: batchLines,
    subtotal: round2(totals.subtotal),
    vatAmt: round2(totals.vatAmt),
    total: round2(totals.total),
    receivedBy,
    remark,
    postedAt: now,
    postedBy: ctx.user.id,
    postedByName: ctx.user.fullName,
    stockMovementIds,
    apEntryId: apInsert.insertedId.toString(),
  };

  const receivingReports = await receivingReportsCollection();
  await receivingReports.updateOne({ _id: id }, {
    $push: { batches: batch },
    $set: { updatedAt: now, updatedBy: ctx.user.id },
  });
  // ปิดใบเองเมื่อรับครบทุกบรรทัด — เจ้าของสั่งว่ารายการที่รับแล้วต้องย้ายไปอยู่ฝั่ง "รับครบแล้ว"
  // ซึ่งหน้าจอทำจากยอดค้างรับ ส่วนสถานะใบเป็นตัวบอกว่าทั้งใบจบแล้ว
  const after = await loadOrThrow(id);
  if (isFullyReceived(toClient(after))) {
    await receivingReports.updateOne({ _id: id }, { $set: { status: "Closed", closedAt: now } });
  }
  await writeAuditEntry(ctx, "Receiving Report Batch Posted",
    `รับสินค้าครั้งที่ ${batch.seq} ของใบ ${current.documentNumber} ใบกำกับ ${invoiceNumber} ยอด ${batch.total.toLocaleString("en-US")} บาท`);
  res.status(200).json({ receivingReport: toClient(await loadOrThrow(id)) });
}

/**
 * ยกเลิกรอบการรับ — ได้เฉพาะ **รอบล่าสุด** และเฉพาะรอบที่ยังไม่จ่ายเงิน
 *
 * ที่จำกัดไว้แค่รอบล่าสุด เพราะต้นทุนถัวเฉลี่ยของสินค้าเดินหน้าไปตามลำดับการรับ การถอนรอบกลาง ๆ
 * ออกจะทำให้ค่าเฉลี่ยที่คำนวณไว้แล้วผิดโดยไม่มีทางคำนวณย้อนได้ (ระบบไม่เก็บ lot)
 *
 * ⚠️ **การย้อนสต๊อกใช้ต้นทุนถัวเฉลี่ย ณ ตอนย้อน ไม่ใช่ราคาที่รับเข้ามา** — ถ้าระหว่างนั้นมีการรับ
 * ของตัวเดียวกันที่ราคาอื่นเข้ามา มูลค่าสต๊อกหลังย้อนจะไม่กลับไปเท่าเดิมเป๊ะ ๆ ยอด **จำนวน** ถูกเสมอ
 */
async function handleDeleteBatch(req: ApiRequest, res: ApiResponse, id: string, batchId: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "receivingReport:receive");
  const doc = await loadOrThrow(id);
  const current = toClient(doc);
  const last = current.batches[current.batches.length - 1];
  if (!last || last.id !== batchId) throw new HttpError(400, "ยกเลิกได้เฉพาะรอบการรับล่าสุดเท่านั้น");

  const apEntries = await apEntriesCollection();
  const ap = await apEntries.findOne({ batchId });
  if (ap && ap.status === "Paid") {
    throw new HttpError(409, "รอบนี้ถูกบันทึกว่าจ่ายเงินแล้ว — ยกเลิกการจ่ายในทะเบียนเจ้าหนี้ก่อน");
  }

  const lineById = new Map(current.lines.map((l) => [l.id, l]));
  for (const bl of last.lines) {
    const line = lineById.get(bl.lineId);
    if (!line?.productId) continue;
    // ถ้าของถูกเบิกออกไปแล้วจนคงเหลือไม่พอ applyStockMovement จะตอบ 400 เอง ซึ่งถูกต้อง:
    // ยกเลิกการรับของที่ถูกจ่ายออกไปแล้วไม่ได้
    await applyStockMovement({
      productId: line.productId,
      kind: "adjust",
      delta: -bl.qty,
      reason: `ยกเลิกการรับครั้งที่ ${last.seq} ของใบ ${current.documentNumber}`,
      sourceType: "receiving_report",
      sourceId: id,
      sourceLabel: current.documentNumber,
      userId: ctx.user.id,
    });
  }

  await apEntries.deleteMany({ batchId });
  const receivingReports = await receivingReportsCollection();
  await receivingReports.updateOne({ _id: id }, {
    $pull: { batches: { id: batchId } },
    $set: { status: "Open", closedAt: "", updatedAt: nowIso(), updatedBy: ctx.user.id },
  } as never);
  await writeAuditEntry(ctx, "Receiving Report Batch Reversed",
    `ยกเลิกการรับครั้งที่ ${last.seq} ของใบ ${current.documentNumber} (ใบกำกับ ${last.invoiceNumber})`);
  res.status(200).json({ receivingReport: toClient(await loadOrThrow(id)) });
}

/** ไฟล์แนบ — ใบส่งของ/ใบกำกับภาษีที่สแกน ใช้ระบบกลางตัวเดียวกับใบสั่งงาน/ใบขอซื้อ/ใบส่งมอบ */
const attachmentConfig: AttachmentConfig<ReceivingReportFields & { _id: string }> = {
  label: "ใบรับสินค้า",
  docType: "receiving-reports",
  load: loadOrThrow,
  canEdit,
  collection: async () => (await receivingReportsCollection()) as unknown as Collection<never>,
  idOf: (doc) => doc._id,
  currentAttachments: (doc) => (doc.attachments ?? []) as DocumentAttachment[],
  writeAudit: (ctx, action, detail) => writeAuditEntry(ctx, action, detail),
  respond: async (res, id) => { res.status(200).json({ receivingReport: toClient(await loadOrThrow(id)) }); },
};

export async function handleReceivingReport(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/receiving-reports");

  // ดาวน์โหลดไฟล์แนบเปิดได้โดยไม่ต้องล็อกอิน (คุมด้วย key ใน URL) จึงต้องมาก่อน requireUser
  if (parts.length === 4 && parts[1] === "attachments" && parts[3] === "download") {
    return handleAttachmentDownload(req, res, "receiving-reports", parts[0], parts[2]);
  }
  await requireUser(req);

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) {
    if (req.method === "GET") return handleGet(req, res, parts[0]);
    if (req.method === "PATCH") return handleUpdate(req, res, parts[0]);
    if (req.method === "DELETE") return handleDelete(req, res, parts[0]);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 2) {
    if (parts[1] === "receipts") return handlePostBatch(req, res, parts[0]);
    if (parts[1] === "print") return handlePrint(req, res, parts[0]);
    if (parts[1] === "attachments") return handleAttachmentUpload(req, res, parts[0], attachmentConfig);
  }
  if (parts.length === 3) {
    if (parts[1] === "receipts") return handleDeleteBatch(req, res, parts[0], parts[2]);
    if (parts[1] === "attachments") return handleAttachmentDelete(req, res, parts[0], parts[2], attachmentConfig);
  }
  throw new HttpError(404, "Not found");
}
