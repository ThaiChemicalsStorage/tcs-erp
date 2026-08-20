import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  productionOrdersCollection, scopeOfWorksCollection, countersCollection, auditLogCollection,
  toObjectId, withStringId, type ProductionOrderFields, type CounterFields,
} from "./collections.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import type { ProductionOrderLine, ProductionOrderSignatory, ProductionOrderSummary } from "../../src/lib/productionOrder.js";

/**
 * ใบสั่งผลิต (Production Order) API — added 2026-08-20 for the Production (ผลิต) department.
 * Mounted from `api/handlers/quotes.ts` alongside Project/Material Requisition/Job Order/Purchase
 * Request (same 12/12 function-slot sharing constraint — see projectHandler.ts's file header).
 *
 * Differs from the other three Project-family documents in two ways, both owner-confirmed:
 *   1. Generated **directly from an approved Scope of Work**, not from a Project item — so there is
 *      no `projectId` and no item-link bookkeeping.
 *   2. Numbered `SC-{YYYY}-{MM}-{NNN}` using the **Gregorian** year + month, matching the real
 *      FM-PD-02 form's own `SC-2026-08-009`, unlike every other document here which uses a Buddhist
 *      year. Do not "fix" this to match the others.
 */

const MAX_LINES = 200;

/**
 * เลขที่ใบสั่งผลิต `SC-{ค.ศ.}-{เดือน}-{ลำดับ 3 หลัก}` — ตัวนับแยกต่อเดือน (atomic, upsert)
 * ต่างจากเอกสารอื่นในระบบที่นับต่อปี พ.ศ. — ตามฟอร์มจริง ยืนยันกับเจ้าของแล้ว
 */
async function nextProductionOrderId(counters: Collection<CounterFields>): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const counterId = `production_order_${year}${month}`;
  const result = await counters.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
  const seq = result?.seq ?? 1;
  return `SC-${year}-${month}-${String(seq).padStart(3, "0")}`;
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string, related: { scopeOfWorkId?: string }): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบสั่งผลิต", action, details, createdAt: nowIso(),
    ...(related.scopeOfWorkId ? { relatedScopeId: related.scopeOfWorkId } : {}),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "productionOrder:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "productionOrder:finalize");
}

function sanitizeSignatory(raw: unknown, label: string): ProductionOrderSignatory {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    name: sanitizeShortText(r.name, `ชื่อ${label}`),
    date: validateIsoDateOrEmpty(r.date, `วันที่${label}`),
  };
}

/** รายการในตาราง — บรรทัดหัวข้อ (isSectionHeader) ไม่มีจำนวน/หน่วย และไม่ถูกนับลำดับตอนพิมพ์ */
function sanitizeLines(raw: unknown): ProductionOrderLine[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  return (raw as Record<string, unknown>[]).map((r, idx) => {
    const isSectionHeader = r.isSectionHeader === true;
    return {
      id: typeof r.id === "string" && r.id ? r.id : newId("poline"),
      isSectionHeader,
      description: sanitizeShortText(r.description, `รายการลำดับที่ ${idx + 1}`),
      subDetails: (Array.isArray(r.subDetails) ? r.subDetails : [])
        .map((sd, i) => sanitizeShortText(sd, `รายละเอียดย่อยลำดับที่ ${idx + 1}.${i + 1}`))
        .filter(Boolean),
      // บรรทัดหัวข้อไม่มีจำนวน/หน่วย — บังคับล้างทิ้ง ไม่ให้ค้างมาจากตอนสลับชนิดบรรทัด
      qty: isSectionHeader ? null : sanitizeNullableNumber(r.qty, `จำนวนลำดับที่ ${idx + 1}`),
      unit: isSectionHeader ? "" : sanitizeShortText(r.unit, `หน่วยลำดับที่ ${idx + 1}`),
      remark: sanitizeShortText(r.remark, `หมายเหตุลำดับที่ ${idx + 1}`),
    };
  });
}

function toClient(doc: ProductionOrderFields & { _id: string }) {
  return withStringId(withApprovalDefaults(doc));
}
function toSummary(doc: ProductionOrderFields & { _id: string }): ProductionOrderSummary {
  const full = withStringId(doc);
  return {
    id: full.id, scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode,
    customerCompanyName: full.customerCompanyName, productName: full.productName,
    status: full.status, updatedAt: full.updatedAt,
  };
}

async function loadOrThrow(id: string) {
  const productionOrders = await productionOrdersCollection();
  const doc = await productionOrders.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งผลิต");
  return doc;
}

const approvalConfig: ApprovalConfig<ProductionOrderFields & { _id: string }> = {
  label: "ใบสั่งผลิต",
  approvePermission: "productionOrder:finalize",
  collection: async () => (await productionOrdersCollection()) as unknown as Collection<ProductionOrderFields & { _id: string }>,
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail, doc) => writeAuditEntry(ctx, action, detail, { scopeOfWorkId: doc.scopeOfWorkId }),
  // ใบสั่งผลิตเก็บผู้อนุมัติเป็นช่องเซ็น { name, date } ตามฟอร์ม ไม่ใช่ string เดี่ยวแบบอีก 3 ใบ —
  // ไม่ทับชื่อที่พิมพ์ไว้เองในฟอร์ม เติมให้เฉพาะตอนที่ยังว่าง (เหมือนพฤติกรรมเริ่มต้นของ helper)
  approvalStamp: (ctx, doc) => ({
    approver: {
      name: doc.approver?.name?.trim() ? doc.approver.name : ctx.user.fullName,
      date: nowIso().slice(0, 10),
    },
  }),
  respond: (res, doc) => res.status(200).json({ productionOrder: toClient(doc) }),
};

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productionOrder:view");
  const scopeOfWorkId = typeof req.query.scopeOfWorkId === "string" ? req.query.scopeOfWorkId : "";
  const productionOrders = await productionOrdersCollection();

  // ระบุ scopeOfWorkId = เช็คว่างานนี้มีใบสั่งผลิตอยู่แล้วหรือยัง (ไม่กรองตามเจ้าของ เหมือน
  // by-source lookup ของ Delivery Order/Project); ไม่ระบุ = รายการทั้งหมด กรองตาม :viewAll
  const ownership = scopeOfWorkId
    ? {}
    : buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "productionOrder:viewAll"), "createdBy");
  const docs = await productionOrders
    .find({ isDeleted: false, ...(scopeOfWorkId ? { scopeOfWorkId } : {}), ...ownership })
    .sort({ updatedAt: -1 })
    .toArray();
  res.status(200).json({ productionOrders: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productionOrder:create");
  if (!roleHasPermission(ctx.role, "scopeOfWork:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const scopeOfWorkId = typeof body.scopeOfWorkId === "string" ? body.scopeOfWorkId.trim() : "";
  if (!scopeOfWorkId) throw new HttpError(400, "กรุณาระบุ Scope of Work");

  const scopeOfWorks = await scopeOfWorksCollection();
  const scope = await scopeOfWorks.findOne({ _id: toObjectId(scopeOfWorkId) });
  if (!scope || scope.isDeleted) throw new HttpError(404, "ไม่พบ Scope of Work");
  // เหมือนโครงการ — เปิดใบสั่งผลิตได้เฉพาะงานที่อนุมัติแล้ว เพราะงานที่ยังแก้ได้อาจเปลี่ยนรายการทีหลัง
  if (scope.status !== "Final") {
    throw new HttpError(400, "Scope of Work นี้ยังไม่ได้รับการอนุมัติ (ต้องเป็นสถานะ Final ก่อนจึงจะออกใบสั่งผลิตได้)");
  }

  const counters = await countersCollection();
  const id = await nextProductionOrderId(counters);
  const now = nowIso();
  const blank: ProductionOrderSignatory = { name: "", date: "" };
  const doc: ProductionOrderFields & { _id: string } = {
    _id: id,
    scopeOfWorkId,
    jobCode: scope.scopeNumber,
    customerCompanyName: scope.customerSnapshot.companyName,
    productName: "",
    supervisorName: "",
    startDate: "",
    dueDate: "",
    lines: [],
    status: "Draft",
    orderedBy: { name: ctx.user.fullName, date: now.slice(0, 10) },
    approver: { ...blank },
    deliveredBy: { ...blank },
    receivedBy: { ...blank },
    costDeptBy: { ...blank },
    approvedByUserId: "",
    rejectionComment: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  const productionOrders = await productionOrdersCollection();
  await productionOrders.insertOne(doc);
  await writeAuditEntry(ctx, "Production Order Created", `สร้างใบสั่งผลิต ${id} จากงาน ${scope.scopeNumber}`, { scopeOfWorkId });
  res.status(201).json({ productionOrder: toClient(doc) });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") {
    await requirePermission(req, "productionOrder:view");
    res.status(200).json({ productionOrder: toClient(await loadOrThrow(id)) });
    return;
  }
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requirePermission(req, "productionOrder:edit");
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  // ล็อกทั้ง Final และ PendingApproval — ระหว่างรออนุมัติต้องแก้ไม่ได้ ไม่งั้นผู้อนุมัติจะกดอนุมัติ
  // เนื้อหาที่ต่างจากตอนที่ตรวจ (Scope of Work ล็อกสองสถานะนี้เหมือนกัน ดู scopeOfWorkHandler.ts)
  if (doc.status !== "Draft") {
    throw new HttpError(400, doc.status === "Final"
      ? "เอกสารนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้"
      : "เอกสารนี้กำลังรออนุมัติ ต้องถอนการขออนุมัติก่อนจึงจะแก้ไขได้");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const set: Partial<ProductionOrderFields> = { updatedAt: nowIso(), updatedBy: ctx.user.id };
  if (body.productName !== undefined) set.productName = sanitizeShortText(body.productName, "ชื่อสินค้า");
  if (body.supervisorName !== undefined) set.supervisorName = sanitizeShortText(body.supervisorName, "ชื่อพนักงานดูแล");
  if (body.startDate !== undefined) set.startDate = validateIsoDateOrEmpty(body.startDate, "วันที่เริ่มผลิต");
  if (body.dueDate !== undefined) set.dueDate = validateIsoDateOrEmpty(body.dueDate, "กำหนดเสร็จ");
  if (body.lines !== undefined) set.lines = sanitizeLines(body.lines);
  // ช่องเซ็น: ผู้อนุมัติแก้เองไม่ได้ผ่านทางนี้ — ระบบเติมให้ตอนกดอนุมัติเท่านั้น กันไม่ให้ปลอมลายเซ็น
  if (body.orderedBy !== undefined) set.orderedBy = sanitizeSignatory(body.orderedBy, "ผู้สั่งผลิต");
  if (body.deliveredBy !== undefined) set.deliveredBy = sanitizeSignatory(body.deliveredBy, "ผู้ส่งมอบงาน");
  if (body.receivedBy !== undefined) set.receivedBy = sanitizeSignatory(body.receivedBy, "ผู้ตรวจรับงาน");
  if (body.costDeptBy !== undefined) set.costDeptBy = sanitizeSignatory(body.costDeptBy, "แผนกต้นทุน");

  const productionOrders = await productionOrdersCollection();
  await productionOrders.updateOne({ _id: id }, { $set: set });
  res.status(200).json({ productionOrder: toClient(await loadOrThrow(id)) });
}

/**
 * ช่องเซ็นหลังอนุมัติ — ผู้ส่งมอบงาน / ผู้ตรวจรับงาน / แผนกต้นทุน
 *
 * ตั้งใจไม่ติดล็อก Final เหมือน handleUpdate() เพราะบนฟอร์มจริงสามช่องนี้เซ็นกัน "หลัง" อนุมัติและ
 * ทำงานเสร็จแล้ว ถ้าล็อกไปด้วยจะกรอกไม่ได้ตลอดไป — แนวเดียวกับ `POST /:id/return` ของใบเบิก-คืนวัสดุ
 * ที่ยกเว้นการล็อกด้วยเหตุผลเดียวกัน (ของที่เหลือคืนหลังเบิกไปแล้ว)
 *
 * ผู้สั่งผลิต/ผู้อนุมัติ ไม่อยู่ในนี้: ผู้สั่งผลิตเป็นข้อมูลตอนสร้าง ส่วนผู้อนุมัติระบบเขียนเองตอนกดอนุมัติ
 */
async function handleSignatories(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productionOrder:edit");
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const set: Partial<ProductionOrderFields> = { updatedAt: nowIso(), updatedBy: ctx.user.id };
  if (body.deliveredBy !== undefined) set.deliveredBy = sanitizeSignatory(body.deliveredBy, "ผู้ส่งมอบงาน");
  if (body.receivedBy !== undefined) set.receivedBy = sanitizeSignatory(body.receivedBy, "ผู้ตรวจรับงาน");
  if (body.costDeptBy !== undefined) set.costDeptBy = sanitizeSignatory(body.costDeptBy, "แผนกต้นทุน");

  const productionOrders = await productionOrdersCollection();
  await productionOrders.updateOne({ _id: id }, { $set: set });
  res.status(200).json({ productionOrder: toClient(await loadOrThrow(id)) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requirePermission(req, "productionOrder:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "productionOrder:finalize")) throw new HttpError(403, "Forbidden");
  const productionOrders = await productionOrdersCollection();
  await productionOrders.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Production Order Deleted", `ลบใบสั่งผลิต ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handlePrint(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productionOrder:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Production Order Printed", `พิมพ์ใบสั่งผลิต ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

export async function handleProductionOrder(req: VercelRequest, res: VercelResponse) {
  await requireUser(req);
  const parts = getPathSegments(req, "/api/production-orders");
  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "signatories") return handleSignatories(req, res, parts[0]);
  // finalize เป็น alias ของ approve — พฤติกรรมเปลี่ยนโดยตั้งใจ: ต้องผ่าน PendingApproval ก่อนเสมอ
  if (parts.length === 2 && (parts[1] === "approve" || parts[1] === "finalize")) return handleApprove(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "submit-approval") return handleSubmitApproval(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "reject") return handleReject(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "withdraw-approval") return handleWithdrawApproval(req, res, parts[0], approvalConfig);
  throw new HttpError(404, "Not found");
}
