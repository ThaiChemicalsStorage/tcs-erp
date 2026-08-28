import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  billReceiptsCollection, purchaseOrdersCollection, goodsReceiptsCollection, countersCollection,
  auditLogCollection, withStringId, type BillReceiptFields,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import { DEFAULT_BILL_ATTACHMENT_CHECKS } from "../../src/lib/billReceipt.js";
import type { BillReceiptAttachmentCheck, BillReceiptSummary } from "../../src/lib/billReceipt.js";

/**
 * ใบรับวางบิล (Bill Receipt) API — added 2026-08-28, the last step of the owner's procurement flow.
 *
 * Records that Purchasing received a supplier's billing paperwork against a purchase order.
 * **It is not Accounts Payable** — it posts no payable and never touches `ar_documents` (which is
 * the customer-facing receivable side). See `src/lib/billReceipt.ts`.
 *
 * Two states (ร่าง → รับวางบิลแล้ว), no approval workflow — same reasoning as the goods receipt.
 */

async function nextBillReceiptId(): Promise<string> {
  const counters = await countersCollection();
  const buddhistYear = new Date().getFullYear() + 543;
  const result = await counters.findOneAndUpdate(
    { _id: `bill_receipt_${buddhistYear}` }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true },
  );
  return `BR-${buddhistYear}-${String(result?.seq ?? 1).padStart(4, "0")}`;
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบรับวางบิล", action, details, createdAt: nowIso(),
  });
}

function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "billReceipt:edit")) return false;
  return !doc.createdBy || doc.createdBy === ctx.user.id || roleHasPermission(ctx.role, "billReceipt:finalize");
}

/**
 * รายการเอกสารที่ติ๊ก — `label` ถูก **ตรึงจากรายการมาตรฐานฝั่งเซิร์ฟเวอร์เสมอ** ไม่รับจาก client
 * เพราะป้ายที่พิมพ์ลงเอกสารต้องไม่ถูกแก้จากฝั่งเบราว์เซอร์ รับมาเฉพาะ `checked`
 */
function sanitizeChecks(raw: unknown): BillReceiptAttachmentCheck[] {
  const sent = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  const checkedByKey = new Map(sent.map((r) => [String(r.key ?? ""), r.checked === true]));
  return DEFAULT_BILL_ATTACHMENT_CHECKS.map((c) => ({ ...c, checked: checkedByKey.get(c.key) === true }));
}

function toClient(doc: BillReceiptFields & { _id: string }) {
  return withStringId({
    ...doc,
    documentNumber: doc.documentNumber || doc._id,
    // เอกสารเก่าที่บันทึกก่อนมีรายการติ๊กครบชุด — normalize ตอนอ่าน ไม่ทำ migration
    attachmentChecks: sanitizeChecks(doc.attachmentChecks),
    revisionNote: doc.revisionNote ?? "",
  });
}

function toSummary(doc: BillReceiptFields & { _id: string }): BillReceiptSummary {
  const f = withStringId(doc);
  return {
    id: f.id, documentNumber: f.documentNumber || f.id, purchaseOrderId: f.purchaseOrderId,
    vendorName: f.vendorName, vendorInvoiceNo: f.vendorInvoiceNo, receivedDate: f.receivedDate,
    dueDate: f.dueDate, billAmount: f.billAmount, status: f.status, updatedAt: f.updatedAt,
  };
}

async function loadOrThrow(id: string) {
  const col = await billReceiptsCollection();
  const doc = await col.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบรับวางบิล");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "billReceipt:view");
  const purchaseOrderId = typeof req.query.purchaseOrderId === "string" ? req.query.purchaseOrderId : "";
  const ownership = purchaseOrderId
    ? {}
    : buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "billReceipt:viewAll"), "createdBy");
  const col = await billReceiptsCollection();
  const docs = await col
    .find({ isDeleted: false, ...(purchaseOrderId ? { purchaseOrderId } : {}), ...ownership })
    .sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ billReceipts: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "billReceipt:create");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const purchaseOrderId = typeof body.purchaseOrderId === "string" ? body.purchaseOrderId : "";
  const goodsReceiptId = typeof body.goodsReceiptId === "string" ? body.goodsReceiptId : "";
  if (!purchaseOrderId) throw new HttpError(400, "ต้องระบุใบสั่งซื้อต้นทาง");
  if (!roleHasPermission(ctx.role, "purchaseOrder:view")) throw new HttpError(403, "Forbidden");

  const purchaseOrders = await purchaseOrdersCollection();
  const po = await purchaseOrders.findOne({ _id: purchaseOrderId });
  if (!po || po.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งซื้อต้นทาง");
  if (po.status !== "Final") throw new HttpError(400, "ใบสั่งซื้อต้องได้รับอนุมัติก่อนจึงจะรับวางบิลได้");

  // ใบตรวจรับเป็นตัวเลือก — ผู้ขายบางรายวางบิลมาก่อนที่ของจะตรวจรับเสร็จ
  if (goodsReceiptId) {
    const grCol = await goodsReceiptsCollection();
    const gr = await grCol.findOne({ _id: goodsReceiptId });
    if (!gr || gr.isDeleted) throw new HttpError(404, "ไม่พบใบตรวจรับสินค้าที่ระบุ");
  }

  const id = await nextBillReceiptId();
  const now = nowIso();
  const doc: BillReceiptFields & { _id: string } = {
    _id: id,
    documentNumber: id,
    purchaseOrderId,
    goodsReceiptId,
    jobCode: po.jobCode ?? "",
    vendorName: po.vendorName ?? "",
    vendorInvoiceNo: "",
    vendorInvoiceDate: "",
    receivedDate: now.slice(0, 10),
    dueDate: "",
    billAmount: null,
    attachmentChecks: sanitizeChecks(undefined),
    remarks: "",
    status: "Draft",
    receivedBy: ctx.user.fullName,
    revisionNote: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };

  const col = await billReceiptsCollection();
  await col.insertOne(doc);
  await writeAuditEntry(ctx, "Bill Receipt Created", `สร้างใบรับวางบิล ${id} จากใบสั่งซื้อ ${purchaseOrderId}`);
  res.status(201).json({ billReceipt: toClient(doc) });
}

const SHORT_TEXT_FIELDS: { key: keyof BillReceiptFields; label: string }[] = [
  { key: "documentNumber", label: "เลขที่ใบรับวางบิล" },
  { key: "jobCode", label: "รหัสงาน" },
  { key: "vendorName", label: "ผู้ขาย" },
  { key: "vendorInvoiceNo", label: "เลขที่ใบแจ้งหนี้" },
  { key: "receivedBy", label: "ผู้รับวางบิล" },
];
const DATE_FIELDS: { key: keyof BillReceiptFields; label: string }[] = [
  { key: "vendorInvoiceDate", label: "วันที่ใบแจ้งหนี้" },
  { key: "receivedDate", label: "วันที่รับวางบิล" },
  { key: "dueDate", label: "กำหนดชำระ" },
];

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, "ใบรับวางบิลนี้ปิดแล้ว ต้องเปิดกลับมาแก้ก่อน");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<BillReceiptFields> = {};
  if ("attachmentChecks" in body) update.attachmentChecks = sanitizeChecks(body.attachmentChecks);
  if ("billAmount" in body) update.billAmount = sanitizeNullableNumber(body.billAmount, "ยอดตามบิล");
  if ("remarks" in body) update.remarks = sanitizeLongText(body.remarks, "หมายเหตุ");
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const col = await billReceiptsCollection();
  await col.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  if (!autoSave) await writeAuditEntry(ctx, "Bill Receipt Updated", `แก้ไขใบรับวางบิล ${id}`);
  res.status(200).json({ billReceipt: toClient(updated) });
}

async function handleStatus(req: VercelRequest, res: VercelResponse, id: string, next: "Received" | "Draft") {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "billReceipt:finalize");
  const doc = await loadOrThrow(id);
  const wanted = next === "Received" ? "Draft" : "Received";
  if (doc.status !== wanted) throw new HttpError(400, "สถานะเอกสารไม่ถูกต้องสำหรับการทำรายการนี้");
  const col = await billReceiptsCollection();
  await col.updateOne({ _id: id }, { $set: { status: next, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, next === "Received" ? "Bill Receipt Completed" : "Bill Receipt Reopened",
    `${next === "Received" ? "ปิดใบรับวางบิล" : "เปิดใบรับวางบิลกลับมาแก้"} ${id}`);
  res.status(200).json({ billReceipt: toClient(await loadOrThrow(id)) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "billReceipt:delete");
  const doc = await loadOrThrow(id);
  const col = await billReceiptsCollection();
  await col.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Bill Receipt Deleted", `ลบใบรับวางบิล ${doc._id}`);
  res.status(204).end();
}

export async function handleBillReceipt(req: VercelRequest, res: VercelResponse): Promise<void> {
  await requireUser(req);
  const parts = getPathSegments(req, "/api/bill-receipts");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) {
    if (req.method === "GET") {
      await requirePermission(req, "billReceipt:view");
      return void res.status(200).json({ billReceipt: toClient(await loadOrThrow(parts[0])) });
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
      const ctx = await requirePermission(req, "billReceipt:print");
      await writeAuditEntry(ctx, "Bill Receipt Printed", `พิมพ์ใบรับวางบิล ${(await loadOrThrow(id))._id}`);
      return void res.status(204).end();
    }
  }
  throw new HttpError(404, "Not found");
}
