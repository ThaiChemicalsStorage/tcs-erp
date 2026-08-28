import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  goodsReceiptsCollection, purchaseOrdersCollection, countersCollection, auditLogCollection,
  withStringId, type GoodsReceiptFields,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import type { GoodsReceiptLine, GoodsReceiptLineResult, GoodsReceiptSummary } from "../../src/lib/goodsReceipt.js";

/**
 * ใบตรวจรับสินค้า (Goods Receipt) API — added 2026-08-28 with the Purchasing module.
 *
 * **Deliberately does not use `documentApproval.ts`.** The owner's flow chart shows an inspector
 * receiving and checking goods with no approval gate after it, so this is a two-state record
 * (ร่าง → ตรวจรับแล้ว), not a document needing sign-off. Adding the shared approval machine here
 * would invent a step the business does not have.
 *
 * **Writes no stock.** See the doc comment in `src/lib/goodsReceipt.ts`.
 */

const MAX_LINES = 200;
const LINE_RESULTS: GoodsReceiptLineResult[] = ["Pending", "Passed", "Rejected"];

async function nextGoodsReceiptId(): Promise<string> {
  const counters = await countersCollection();
  const buddhistYear = new Date().getFullYear() + 543;
  const result = await counters.findOneAndUpdate(
    { _id: `goods_receipt_${buddhistYear}` }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true },
  );
  return `GR-${buddhistYear}-${String(result?.seq ?? 1).padStart(4, "0")}`;
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบตรวจรับสินค้า", action, details, createdAt: nowIso(),
  });
}

function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "goodsReceipt:edit")) return false;
  return !doc.createdBy || doc.createdBy === ctx.user.id || roleHasPermission(ctx.role, "goodsReceipt:finalize");
}

function sanitizeLines(raw: unknown): GoodsReceiptLine[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  return (raw as Record<string, unknown>[]).map((r, idx) => ({
    id: typeof r.id === "string" && r.id ? r.id : newId("grline"),
    productId: typeof r.productId === "string" && r.productId ? r.productId : null,
    productCode: sanitizeShortText(r.productCode, `รหัสสินค้าลำดับที่ ${idx + 1}`),
    description: sanitizeShortText(r.description, `รายละเอียดลำดับที่ ${idx + 1}`, true),
    subDetails: (Array.isArray(r.subDetails) ? r.subDetails : [])
      .map((sd, i) => sanitizeShortText(sd, `รายละเอียดย่อยลำดับที่ ${idx + 1}.${i + 1}`)).filter(Boolean),
    unit: sanitizeShortText(r.unit, `หน่วยลำดับที่ ${idx + 1}`),
    // จำนวนที่สั่ง — คัดลอกมาจากใบสั่งซื้อตอนสร้าง ผู้ใช้แก้ได้ (บางทีใบสั่งซื้อพิมพ์ผิด) แต่ค่าเริ่มต้น
    // มาจากเอกสารต้นทางเสมอ เพื่อให้เทียบกับของที่มาจริงได้
    qtyOrdered: sanitizeNullableNumber(r.qtyOrdered, `จำนวนที่สั่งลำดับที่ ${idx + 1}`),
    qtyReceived: sanitizeNullableNumber(r.qtyReceived, `จำนวนที่รับลำดับที่ ${idx + 1}`),
    result: LINE_RESULTS.includes(r.result as GoodsReceiptLineResult) ? (r.result as GoodsReceiptLineResult) : "Pending",
    remark: sanitizeShortText(r.remark, `หมายเหตุลำดับที่ ${idx + 1}`),
  }));
}

function toClient(doc: GoodsReceiptFields & { _id: string }) {
  return withStringId({
    ...doc,
    documentNumber: doc.documentNumber || doc._id,
    lines: (doc.lines ?? []).map((l) => ({ ...l, subDetails: l.subDetails ?? [] })),
    revisionNote: doc.revisionNote ?? "",
  });
}

function toSummary(doc: GoodsReceiptFields & { _id: string }): GoodsReceiptSummary {
  const f = withStringId(doc);
  return {
    id: f.id, documentNumber: f.documentNumber || f.id, purchaseOrderId: f.purchaseOrderId,
    jobCode: f.jobCode, vendorName: f.vendorName, receivedDate: f.receivedDate,
    status: f.status, updatedAt: f.updatedAt,
  };
}

async function loadOrThrow(id: string) {
  const col = await goodsReceiptsCollection();
  const doc = await col.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบตรวจรับสินค้า");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "goodsReceipt:view");
  const purchaseOrderId = typeof req.query.purchaseOrderId === "string" ? req.query.purchaseOrderId : "";
  // ค้นด้วยใบสั่งซื้อ = เช็คว่ามีใบตรวจรับแล้วหรือยัง ไม่ใช่การเปิดดูรายการ จึงไม่กรองเจ้าของ
  const ownership = purchaseOrderId
    ? {}
    : buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "goodsReceipt:viewAll"), "createdBy");
  const col = await goodsReceiptsCollection();
  const docs = await col
    .find({ isDeleted: false, ...(purchaseOrderId ? { purchaseOrderId } : {}), ...ownership })
    .sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ goodsReceipts: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "goodsReceipt:create");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const purchaseOrderId = typeof body.purchaseOrderId === "string" ? body.purchaseOrderId : "";
  if (!purchaseOrderId) throw new HttpError(400, "ต้องระบุใบสั่งซื้อต้นทาง");
  if (!roleHasPermission(ctx.role, "purchaseOrder:view")) throw new HttpError(403, "Forbidden");

  const purchaseOrders = await purchaseOrdersCollection();
  const po = await purchaseOrders.findOne({ _id: purchaseOrderId });
  if (!po || po.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งซื้อต้นทาง");
  if (po.status !== "Final") throw new HttpError(400, "ใบสั่งซื้อต้องได้รับอนุมัติก่อนจึงจะตรวจรับสินค้าได้");

  const id = await nextGoodsReceiptId();
  const now = nowIso();
  const doc: GoodsReceiptFields & { _id: string } = {
    _id: id,
    documentNumber: id,
    purchaseOrderId,
    jobCode: po.jobCode ?? "",
    vendorName: po.vendorName ?? "",
    receivedDate: now.slice(0, 10),
    deliveryNoteRef: "",
    receivedLocation: po.deliveryLocation ?? "",
    // snapshot ของรายการที่สั่ง — `qtyReceived` เริ่มว่างเสมอ ให้คนตรวจกรอกเอง ไม่เติมให้เท่าที่สั่ง
    // เพราะการเติมล่วงหน้าเท่ากับสมมติว่าของมาครบ ซึ่งเป็นสิ่งที่ใบนี้มีไว้เพื่อตรวจสอบ
    lines: (po.lines ?? []).map((l) => ({
      id: newId("grline"),
      productId: l.productId || null,
      productCode: l.productCode ?? "",
      description: l.description ?? "",
      subDetails: l.subDetails ?? [],
      unit: l.unit ?? "",
      qtyOrdered: l.qty ?? null,
      qtyReceived: null,
      result: "Pending" as GoodsReceiptLineResult,
      remark: "",
    })),
    remarks: "",
    status: "Draft",
    receivedBy: ctx.user.fullName,
    inspectedBy: "",
    revisionNote: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };

  const col = await goodsReceiptsCollection();
  await col.insertOne(doc);
  await writeAuditEntry(ctx, "Goods Receipt Created", `สร้างใบตรวจรับสินค้า ${id} จากใบสั่งซื้อ ${purchaseOrderId}`);
  res.status(201).json({ goodsReceipt: toClient(doc) });
}

const SHORT_TEXT_FIELDS: { key: keyof GoodsReceiptFields; label: string }[] = [
  { key: "documentNumber", label: "เลขที่ใบตรวจรับ" },
  { key: "jobCode", label: "รหัสงาน" },
  { key: "vendorName", label: "ผู้ขาย" },
  { key: "deliveryNoteRef", label: "เลขที่ใบส่งของ" },
  { key: "receivedLocation", label: "สถานที่รับของ" },
  { key: "receivedBy", label: "ผู้รับของ" },
  { key: "inspectedBy", label: "ผู้ตรวจรับ" },
];

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, "ใบตรวจรับนี้ปิดแล้ว ต้องเปิดกลับมาแก้ก่อน");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<GoodsReceiptFields> = {};
  if ("lines" in body) update.lines = sanitizeLines(body.lines);
  if ("receivedDate" in body) update.receivedDate = validateIsoDateOrEmpty(body.receivedDate, "วันที่รับของ");
  if ("remarks" in body) update.remarks = sanitizeLongText(body.remarks, "หมายเหตุ");
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const col = await goodsReceiptsCollection();
  await col.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  if (!autoSave) await writeAuditEntry(ctx, "Goods Receipt Updated", `แก้ไขใบตรวจรับสินค้า ${id}`);
  res.status(200).json({ goodsReceipt: toClient(updated) });
}

/** ปิด/เปิดใบ — ใช้สิทธิ์ `:finalize` ทั้งคู่ เพราะการเปิดกลับมาแก้ใบที่ตรวจรับแล้วมีน้ำหนักเท่ากัน */
async function handleStatus(req: VercelRequest, res: VercelResponse, id: string, next: "Received" | "Draft") {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "goodsReceipt:finalize");
  const doc = await loadOrThrow(id);
  const wanted = next === "Received" ? "Draft" : "Received";
  if (doc.status !== wanted) throw new HttpError(400, "สถานะเอกสารไม่ถูกต้องสำหรับการทำรายการนี้");
  const col = await goodsReceiptsCollection();
  await col.updateOne({ _id: id }, { $set: { status: next, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, next === "Received" ? "Goods Receipt Completed" : "Goods Receipt Reopened",
    `${next === "Received" ? "ปิดใบตรวจรับสินค้า" : "เปิดใบตรวจรับสินค้ากลับมาแก้"} ${id}`);
  res.status(200).json({ goodsReceipt: toClient(await loadOrThrow(id)) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "goodsReceipt:delete");
  const doc = await loadOrThrow(id);
  const col = await goodsReceiptsCollection();
  await col.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Goods Receipt Deleted", `ลบใบตรวจรับสินค้า ${doc._id}`);
  res.status(204).end();
}

export async function handleGoodsReceipt(req: VercelRequest, res: VercelResponse): Promise<void> {
  await requireUser(req);
  const parts = getPathSegments(req, "/api/goods-receipts");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) {
    if (req.method === "GET") {
      await requirePermission(req, "goodsReceipt:view");
      return void res.status(200).json({ goodsReceipt: toClient(await loadOrThrow(parts[0])) });
    }
    if (req.method === "PATCH") return handleUpdate(req, res, parts[0]);
    if (req.method === "DELETE") return handleDelete(req, res, parts[0]);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 2) {
    const [id, action] = parts;
    if (action === "complete") return handleStatus(req, res, id, "Received");
    if (action === "reopen") return handleStatus(req, res, id, "Draft");
    if (action === "print") {
      if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
      const ctx = await requirePermission(req, "goodsReceipt:print");
      await writeAuditEntry(ctx, "Goods Receipt Printed", `พิมพ์ใบตรวจรับสินค้า ${(await loadOrThrow(id))._id}`);
      return void res.status(204).end();
    }
  }
  throw new HttpError(404, "Not found");
}
