import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection, Filter } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  materialRequisitionsCollection, productionOrdersCollection, jobOrdersCollection, productsCollection, countersCollection, auditLogCollection,
  toObjectId, withStringId, type MaterialRequisitionFields, type CounterFields,
} from "./collections.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { loadPendingProjectItemOrThrow, linkProjectItemToSubDocument, markProjectItemFulfilled, unlinkProjectItem, findProjectItemIdByLink } from "./projectHandler.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, validateIsoDateOrEmpty, sanitizeLongText } from "./quoteValidation.js";
import { getRevisionRoot } from "../../src/lib/revisionDiff.js";
import { notifyDepartments, STORE_DEPARTMENT_NAMES } from "./departmentNotify.js";
import { sanitizeNullableNumber, sanitizeEnum } from "./projectValidation.js";
import { ensureMaterialCatalogSeeded } from "./materialCatalogSeedData.js";
import type { MaterialRequisitionLine, MaterialRequisitionCategory, MaterialRequisitionSummary } from "../../src/lib/materialRequisition.js";

/**
 * Material Requisition API (added 2026-08-18, Stage 3) — mounted from `api/handlers/quotes.ts`
 * alongside Project/Job Order/Purchase Request (same 12/12-slot-sharing constraint, see
 * projectHandler.ts's file header). See src/lib/materialRequisition.ts for the full domain-shape
 * doc comment and the FM-ST-04 PDF-to-field mapping.
 */

const MAX_LINES = 100;
const MATERIAL_CATEGORIES: readonly MaterialRequisitionCategory[] = ["chemical", "consumable", "hardware", "other"];

/** Same shape as Service Report's `nextServiceReportId()` — an atomic per-Buddhist-year counter,
 * business id stored directly as `_id`. Deliberately a clean new prefix, not the real Purchase
 * Request example's legacy "ED" scheme (see docs/DATABASE.md "Project module" for why). */
async function nextMaterialRequisitionId(counters: Collection<CounterFields>): Promise<string> {
  const buddhistYear = new Date().getFullYear() + 543;
  const counterId = `material_requisition_${buddhistYear}`;
  const result = await counters.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
  const seq = result?.seq ?? 1;
  return `MR-${buddhistYear}-${String(seq).padStart(4, "0")}`;
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string, related: { scopeOfWorkId?: string }): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบเบิกและใบคืนวัสดุ", action, details, createdAt: nowIso(),
    ...(related.scopeOfWorkId ? { relatedScopeId: related.scopeOfWorkId } : {}),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "materialRequisition:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "materialRequisition:finalize");
}

/** `jobOrderId` is a real, nullable FK (confirmed Stage 2 — see src/lib/materialRequisition.ts's
 * header comment) — resolved and verified server-side, never trusted from a client-sent
 * `jobOrderCode` snapshot. Requires the referenced Job Order to belong to the same Project, so a
 * requisition can't be linked to an unrelated job's paperwork by id-guessing. */
async function resolveJobOrderLink(projectId: string, raw: unknown): Promise<{ jobOrderId: string | null; jobOrderCode: string }> {
  if (raw === undefined || raw === null || raw === "") return { jobOrderId: null, jobOrderCode: "" };
  if (typeof raw !== "string") throw new HttpError(400, "เลขที่ใบสั่งงานไม่ถูกต้อง");
  const jobOrders = await jobOrdersCollection();
  const jobOrder = await jobOrders.findOne({ _id: raw, isDeleted: false });
  if (!jobOrder) throw new HttpError(400, "ไม่พบใบสั่งงานที่ระบุ");
  if (jobOrder.projectId !== projectId) throw new HttpError(400, "ใบสั่งงานนี้ไม่ได้อยู่ในโครงการเดียวกัน");
  return { jobOrderId: raw, jobOrderCode: jobOrder.jobCode };
}

/** Every line REQUIRES a real, resolvable `productId` (unlike Purchase Request's optional one) —
 * see MaterialRequisitionLine's own doc comment. `productCode`/`productName`/`unit` are always
 * rebuilt server-side from the resolved Product record, never trusted from client input — same
 * "server-resolved snapshot" integrity rule Quotation Templates' product links already established. */
async function sanitizeLines(raw: unknown): Promise<MaterialRequisitionLine[]> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการวัสดุไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  const rows = raw as Record<string, unknown>[];

  const productIds = [...new Set(rows.map((r) => (typeof r.productId === "string" ? r.productId : "")).filter(Boolean))];
  const products = await productsCollection();
  const productDocs = productIds.length > 0 ? await products.find({ _id: { $in: productIds.map((id) => toObjectId(id)) } }).toArray() : [];
  const productById = new Map(productDocs.map((p) => [p._id.toString(), p]));

  return rows.map((r, idx) => {
    const productId = typeof r.productId === "string" ? r.productId : "";
    if (!productId) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: กรุณาระบุสินค้า`);
    const product = productById.get(productId);
    if (!product) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ไม่พบสินค้าที่ระบุ`);
    return {
      id: typeof r.id === "string" && r.id ? r.id : newId("mrline"),
      productId, productCode: product.code, productName: product.name, unit: product.unit,
      category: sanitizeEnum(r.category, MATERIAL_CATEGORIES, `หมวดหมู่ลำดับที่ ${idx + 1}`),
      plannedQty: sanitizeNullableNumber(r.plannedQty, `จำนวนที่วางแผนลำดับที่ ${idx + 1}`),
      withdrawal1Qty: sanitizeNullableNumber(r.withdrawal1Qty, `เบิกครั้งที่1 ลำดับที่ ${idx + 1}`),
      withdrawal2Qty: sanitizeNullableNumber(r.withdrawal2Qty, `เบิกครั้งที่2 ลำดับที่ ${idx + 1}`),
      returnQty: sanitizeNullableNumber(r.returnQty, `คืนของลำดับที่ ${idx + 1}`),
      actualUsedQty: sanitizeNullableNumber(r.actualUsedQty, `ใช้จริงลำดับที่ ${idx + 1}`),
    };
  });
}

function toClient(doc: MaterialRequisitionFields & { _id: string }) {
  // เอกสารก่อน 2026-08-27 ไม่มี revisionNote — เติมเป็น "" ตอนอ่าน ไม่ได้ทำ migration
  return withStringId(withApprovalDefaults({ ...doc, revisionNote: doc.revisionNote ?? "" }));
}
function toSummary(doc: MaterialRequisitionFields & { _id: string }): MaterialRequisitionSummary {
  const full = withStringId(doc);
  return { id: full.id, projectId: full.projectId, scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode, status: full.status, updatedAt: full.updatedAt };
}

async function loadOrThrow(id: string) {
  const materialRequisitions = await materialRequisitionsCollection();
  const doc = await materialRequisitions.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบเบิกและใบคืนวัสดุ");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:view");
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";

  // Omitting projectId switches from "list by Project" to "list every Material Requisition
  // company-wide" — Stage 4 addition, needed for the standalone list page Store staff use as their
  // own entry point (per the original Stage 1 "Store staff shouldn't have to go through Project"
  // reasoning) — same dual-mode shape Project's own GET /api/projects already established. Both
  // modes are scoped by materialRequisition:viewAll via buildSimpleOwnershipClause().
  const ownershipMatch = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "materialRequisition:viewAll"), "createdBy");
  const materialRequisitions = await materialRequisitionsCollection();
  // แยกเอกสารตามแผนกเจ้าของ — ฝ่ายโครงการกับฝ่ายผลิตใช้เอกสารชนิดเดียวกันแต่ไม่เห็นของกันและกัน
  // (ยืนยันกับเจ้าของ 2026-08-20). เอกสารเก่าที่ไม่มีฟิลด์นี้ถือเป็นของฝ่ายโครงการ จึงต้องรับทั้ง
  // ค่า "project" และกรณีที่ยังไม่มีฟิลด์เลย — ไม่ได้ทำ migration
  const ownerDepartment = req.query.ownerDepartment === "production" ? "production" : "project";
  const departmentClause: Filter<MaterialRequisitionFields & { _id: string }> = ownerDepartment === "production"
    ? { ownerDepartment: "production" }
    : { $or: [{ ownerDepartment: "project" }, { ownerDepartment: { $exists: false } }] };
  // เวลาระบุ projectId คือเช็คของโครงการนั้นโดยตรง ไม่ต้องกรองแผนกซ้ำ
  // $and, not spread: buildSimpleOwnershipClause() also returns a $or, so spreading both
  // would have the department clause silently overwrite the ownership one (a real leak).
  const filter = projectId
    ? { projectId, isDeleted: false, ...ownershipMatch }
    : { isDeleted: false, $and: [ownershipMatch, departmentClause] };
  const docs = await materialRequisitions.find(filter).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ materialRequisitions: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:create");
  if (!roleHasPermission(ctx.role, "project:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  const productionOrderId = typeof body.productionOrderId === "string" ? body.productionOrderId.trim() : "";

  /**
   * เอกสารใบนี้ออกได้จาก 2 ต้นทาง (ยืนยันกับเจ้าของ 2026-08-20 ว่าสองแผนกแยกข้อมูลกัน):
   *   - รายการในโครงการ  → ของฝ่ายโครงการ, ผูกกับ ProjectItem และอัปเดตสถานะรายการนั้น
   *   - ใบสั่งผลิต        → ของฝ่ายผลิต, ไม่มีรายการให้ผูก จึงข้าม item-link ทั้งหมด
   */
  const fromProduction = Boolean(productionOrderId);
  if (!fromProduction && (!projectId || !itemId)) throw new HttpError(400, "กรุณาระบุโครงการและรายการ หรือใบสั่งผลิต");

  let source: { projectId: string; scopeOfWorkId: string; jobCode: string; customerName: string; productName: string };
  let item: { name: string } | null = null;
  let jobOrderLink = { jobOrderId: null as string | null, jobOrderCode: "" };

  if (fromProduction) {
    const productionOrders = await productionOrdersCollection();
    const po = await productionOrders.findOne({ _id: productionOrderId });
    if (!po || po.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งผลิต");
    // ไม่บังคับว่าใบสั่งผลิตต้องอนุมัติก่อน — ฝ่ายผลิตขอไว้ในการประชุม 2026-08-27
    // ("ใบสั่งผลิตกับใบเบิกไม่ต้องรอ Final ก็สร้างได้") เจ้าของยืนยันให้ปลดทั้งชั้นนี้และชั้น Scope of Work → ใบสั่งผลิต
    // เดิมบังคับไว้ตั้งแต่ 2026-08-20 ด้วยเหตุผลว่าใบสั่งผลิตฉบับร่างไม่ควรสั่งเบิกของจริงได้
    if (!roleHasPermission(ctx.role, "productionOrder:view")) throw new HttpError(403, "Forbidden");
    source = { projectId: "", scopeOfWorkId: po.scopeOfWorkId, jobCode: po.jobCode, customerName: po.customerCompanyName, productName: po.productName };
  } else {
    // Validates the item exists and is still "pending" BEFORE anything is inserted — see
    // loadPendingProjectItemOrThrow()'s own doc comment for why this ordering is what makes the
    // create-then-link sequence below safe without a real multi-document transaction.
    const loaded = await loadPendingProjectItemOrThrow(projectId, itemId);
    item = loaded.item;
    jobOrderLink = await resolveJobOrderLink(projectId, body.jobOrderId);
    source = {
      projectId, scopeOfWorkId: loaded.project.scopeOfWorkId, jobCode: loaded.project.scopeNumber,
      customerName: loaded.project.customerCompanyName, productName: loaded.item.name,
    };
  }

  const counters = await countersCollection();
  const id = await nextMaterialRequisitionId(counters);
  const now = nowIso();
  const doc: MaterialRequisitionFields = {
    projectId: source.projectId, scopeOfWorkId: source.scopeOfWorkId, jobCode: source.jobCode,
    customerName: source.customerName,
    ownerDepartment: fromProduction ? "production" : "project",
    revisionNote: "",
    productionOrderId: fromProduction ? productionOrderId : "",
    jobOrderId: jobOrderLink.jobOrderId, jobOrderCode: jobOrderLink.jobOrderCode,
    productName: source.productName, responsibleEmployee: "", productionStartDate: "",
    lines: [], status: "Draft",
    // preparedAt seeds from a date-only slice of `now`, not the full ISO timestamp — see
    // jobOrderHandler.ts's identical fix/comment on requestedAt for why (validateIsoDateOrEmpty
    // requires strict YYYY-MM-DD; the full timestamp made every save after creation fail with 400).
    preparedBy: ctx.user.fullName, preparedAt: now.slice(0, 10),
    approvedBy: "", approvedAt: "",
    storeDeptBy: "", storeDeptAt: "",
    costDeptBy: "", costDeptAt: "",
    returnedBy: "", returnReceivedBy: "", returnedAt: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.insertOne({ ...doc, _id: id });

  // CRITICAL invariant: the parent ProjectItem is updated atomically (in the sense described in
  // linkProjectItemToSubDocument()'s doc comment) immediately after the insert succeeds — never
  // trusting any client-sent sourcingMethod/itemStatus/materialRequisitionId value.
  // ฝ่ายผลิตออกจากใบสั่งผลิต ไม่มีรายการในโครงการให้ผูก จึงข้ามขั้นตอนนี้ไป
  if (!fromProduction) {
    await linkProjectItemToSubDocument(projectId, itemId, "requisition", "materialRequisitionId", id);
  }

  await writeAuditEntry(
    ctx, "Material Requisition Created",
    fromProduction
      ? `สร้างใบเบิกและใบคืนวัสดุ ${id} จากใบสั่งผลิต ${productionOrderId}`
      : `สร้างใบเบิกและใบคืนวัสดุ ${id} สำหรับรายการ "${item?.name ?? ""}"`,
    { scopeOfWorkId: source.scopeOfWorkId },
  );
  res.status(201).json({ materialRequisition: toClient({ ...doc, _id: id }) });
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "materialRequisition:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({ materialRequisition: toClient(doc) });
}

const SHORT_TEXT_FIELDS: { key: keyof MaterialRequisitionFields; label: string }[] = [
  { key: "customerName", label: "ชื่อลูกค้า" },
  { key: "productName", label: "ชื่อสินค้า" },
  { key: "responsibleEmployee", label: "ชื่อพนักงานดูแล" },
  { key: "preparedBy", label: "ผู้จัดทำ" },
  { key: "approvedBy", label: "ผู้อนุมัติ" },
  { key: "storeDeptBy", label: "แผนกสโตร์" },
  { key: "costDeptBy", label: "แผนกต้นทุน" },
];
const DATE_FIELDS: { key: keyof MaterialRequisitionFields; label: string }[] = [
  { key: "productionStartDate", label: "วันที่เริ่มผลิต" },
  { key: "preparedAt", label: "วันที่จัดทำ" },
  { key: "approvedAt", label: "วันที่อนุมัติ" },
  { key: "storeDeptAt", label: "วันที่แผนกสโตร์" },
  { key: "costDeptAt", label: "วันที่แผนกต้นทุน" },
];

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
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
  const update: Partial<MaterialRequisitionFields> = {};
  if ("lines" in body) update.lines = await sanitizeLines(body.lines);
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  if ("jobOrderId" in body) {
    const link = await resolveJobOrderLink(doc.projectId, body.jobOrderId);
    update.jobOrderId = link.jobOrderId;
    update.jobOrderCode = link.jobOrderCode;
  }
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  // การบันทึกอัตโนมัติไม่เขียน audit log — ไม่งั้นการพิมพ์งานครั้งเดียวจะสร้างรายการซ้ำนับสิบรายการ
  // An auto-save writes no audit entry (see `isAutoSaveRequest()` in api/_lib/http.ts). The write
  // itself passed the exact same permission, Draft-status and validation checks as a manual Save.
  if (!autoSave) {
    await writeAuditEntry(ctx, "Material Requisition Updated", `แก้ไขใบเบิกและใบคืนวัสดุ ${id}`, { scopeOfWorkId: updated.scopeOfWorkId });
  }
  res.status(200).json({ materialRequisition: toClient(updated) });
}

/**
 * "คืนของ" — leftover material returned via this same document, after issuance. Exempt from the
 * `status === "Final"` lock `handleUpdate()` enforces above — same "follow-up fields survive Final"
 * pattern Scope of Work's PO-chasing fields established (see docs/MODULES/ScopeOfWork.md
 * "PO Chasing"), since the paper form's own footer has separate returner/receiver-of-return
 * signatures implying the return happens after the document is otherwise done. Only `returnQty` per
 * line, plus the document-level returner/receiver signatures, are touched here — every other field
 * stays governed by the regular Draft-only PATCH above.
 */
async function handleReturn(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const returns = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  const returnById = new Map(returns.map((r) => [typeof r.id === "string" ? r.id : "", r]));
  const lines = doc.lines.map((line) => {
    const r = returnById.get(line.id);
    if (!r) return line;
    return { ...line, returnQty: sanitizeNullableNumber(r.returnQty, `คืนของ (${line.productName})`) };
  });

  const update: Partial<MaterialRequisitionFields> = {
    lines,
    updatedAt: nowIso(),
    updatedBy: ctx.user.id,
  };
  if ("returnedBy" in body) update.returnedBy = sanitizeShortText(body.returnedBy, "ผู้คืน");
  if ("returnReceivedBy" in body) update.returnReceivedBy = sanitizeShortText(body.returnReceivedBy, "ผู้รับคืน");
  if (update.returnedBy || update.returnReceivedBy) update.returnedAt = nowIso();

  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Material Requisition Return Recorded", `บันทึกการคืนวัสดุของใบเบิกและใบคืนวัสดุ ${id}`, { scopeOfWorkId: updated.scopeOfWorkId });
  res.status(200).json({ materialRequisition: toClient(updated) });
}

/**
 * ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) เพิ่ม 2026-08-20 — ใช้ helper ร่วมใน documentApproval.ts
 * ที่ทำตามกลไกของ Scope of Work ทุกประการ ตามที่เจ้าของสั่ง ("เหมือน Scope of Work เป๊ะ")
 *
 * `finalize` เดิมที่กระโดดจากร่างไป Final ตรงๆ ถูกแทนที่ด้วย `approve` ซึ่งบังคับว่าต้องผ่าน
 * PendingApproval ก่อน — route เดิมยังคงไว้เป็น alias เพื่อไม่ให้ของเดิมที่เรียกอยู่พัง
 */
const approvalConfig: ApprovalConfig<MaterialRequisitionFields & { _id: string }> = {
  label: "ใบเบิกและใบคืนวัสดุ",
  approvePermission: "materialRequisition:finalize",
  collection: async () => (await materialRequisitionsCollection()) as unknown as Collection<MaterialRequisitionFields & { _id: string }>,
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail, doc) => writeAuditEntry(ctx, action, detail, { scopeOfWorkId: doc.scopeOfWorkId }),
  // อนุมัติแล้วถือว่ารายการใน Project ต้นทางถูกจัดหาเรียบร้อย (เดิมทำตอน finalize)
  onApproved: async (ctx, doc) => {
    const itemId = doc.projectId ? await findProjectItemIdByLink(doc.projectId, "materialRequisitionId", doc._id) : null;
    if (itemId) await markProjectItemFulfilled(doc.projectId, itemId);

    // ส่งต่อให้สโตร์ (ฝ่ายโครงการขอไว้ 2026-08-27: "เมื่อผู้จัดการอนุมัติเสร็จจะส่งให้ Stores ของใบเบิก")
    // best-effort โดยตั้งใจ — การอนุมัติต้องไม่ล้มเพราะแจ้งเตือนส่งไม่ออก แต่ถ้าไม่มีผู้รับเลยต้องเห็นใน log
    try {
      const sent = await notifyDepartments(STORE_DEPARTMENT_NAMES, ctx.user.id, {
        type: "material_requisition_approved",
        title: "ใบเบิกวัสดุอนุมัติแล้ว — รอสโตร์จ่ายของ",
        description: `${ctx.user.fullName} อนุมัติใบเบิก ${doc._id} (งาน ${doc.jobCode || "-"})`,
        module: "ใบเบิกและใบคืนวัสดุ",
        related: { relatedMaterialRequisitionId: doc._id },
      });
      if (sent === 0) {
        console.warn("[material-requisitions] approved but nobody in Stores received a notification —",
          "no active user has User.department matching", STORE_DEPARTMENT_NAMES.join("/"));
      }
    } catch (err) {
      console.error("[material-requisitions] failed to notify Stores on approval", err);
    }
  },
  respond: (res, doc) => res.status(200).json({ materialRequisition: toClient(doc) }),
};

async function handlePrint(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Material Requisition Printed", `พิมพ์ใบเบิกและใบคืนวัสดุ ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

/** ตัวนับเลขฉบับแก้ไขต่อสายเอกสาร — idiom เดียวกับ Scope of Work และใบสั่งผลิต */
async function nextMaterialRequisitionRevision(counters: Collection<CounterFields>, root: string): Promise<number> {
  const result = await counters.findOneAndUpdate(
    { _id: `material_requisition_revision_${root}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return result?.seq ?? 1;
}

/**
 * Rewrite ใบเบิก-คืนวัสดุ (ฝ่ายผลิตขอไว้ 2026-08-27) — `_id` คือเลขที่เอกสาร จึงต่อท้ายด้วย `-R{n}`
 *
 * ⚠️ **ต้องย้ายลิงก์ของ ProjectItem มาชี้ฉบับใหม่ด้วย** ไม่งั้นหน้าโครงการจะยังชี้ฉบับเก่าตลอดไป
 * แล้วผู้ใช้จะกดจากโครงการเข้าไปเจอใบที่เลิกใช้แล้ว — ต่างจากใบสั่งผลิตที่ไม่ผูกกับ ProjectItem เลย
 * ใบของฝ่ายผลิต (`ownerDepartment === "production"`) ไม่มี projectId จึงข้ามขั้นตอนนี้ไปเอง
 *
 * ยอดเบิก/ยอดคืน/ช่องเซ็นไม่สืบทอด — ฉบับใหม่เริ่มต้นเหมือนใบเบิกที่ยังไม่ได้เบิกจริง
 */
async function handleRewrite(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:create");
  const source = await loadOrThrow(id);

  const [materialRequisitions, counters] = await Promise.all([materialRequisitionsCollection(), countersCollection()]);
  const root = getRevisionRoot(source._id);
  const now = nowIso();

  let created: (MaterialRequisitionFields & { _id: string }) | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const seq = await nextMaterialRequisitionRevision(counters, root);
    const { _id: _drop, ...rest } = source;
    const doc: MaterialRequisitionFields & { _id: string } = {
      ...rest,
      _id: `${root}-R${seq}`,
      lines: source.lines.map((l) => ({ ...l, withdrawal1Qty: null, withdrawal2Qty: null, returnQty: null, actualUsedQty: null })),
      status: "Draft",
      preparedBy: ctx.user.fullName, preparedAt: now.slice(0, 10),
      approvedBy: "", approvedAt: "",
      storeDeptBy: "", storeDeptAt: "",
      costDeptBy: "", costDeptAt: "",
      returnedBy: "", returnReceivedBy: "", returnedAt: "",
      approvedByUserId: "",
      rejectionComment: "",
      revisionNote: "",
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
    };
    try {
      await materialRequisitions.insertOne(doc);
      created = doc;
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: number }).code === 11000) { lastErr = err; continue; }
      throw err;
    }
  }
  if (!created) {
    console.error("[material-requisitions] exhausted retries reserving a unique revision number", lastErr);
    throw new HttpError(409, "ไม่สามารถสร้างเลขที่ฉบับแก้ไขที่ไม่ซ้ำกันได้ กรุณาลองใหม่อีกครั้ง");
  }

  // ย้ายลิงก์ในโครงการมาชี้ฉบับใหม่ — เฉพาะใบฝั่งโครงการที่ผูกกับรายการอยู่จริง
  if (source.projectId) {
    const itemId = await findProjectItemIdByLink(source.projectId, "materialRequisitionId", source._id);
    if (itemId) await linkProjectItemToSubDocument(source.projectId, itemId, "requisition", "materialRequisitionId", created._id);
  }

  await writeAuditEntry(ctx, "Material Requisition Rewritten", `สร้างใบเบิกฉบับแก้ไข ${created._id} จาก ${source._id}`, { scopeOfWorkId: source.scopeOfWorkId });
  res.status(201).json({ materialRequisition: toClient(created) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "materialRequisition:finalize")) throw new HttpError(403, "Forbidden");

  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const itemId = doc.projectId ? await findProjectItemIdByLink(doc.projectId, "materialRequisitionId", id) : null;
  if (itemId) await unlinkProjectItem(doc.projectId, itemId, "materialRequisitionId");
  await writeAuditEntry(ctx, "Material Requisition Deleted", `ลบใบเบิกและใบคืนวัสดุ ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleMaterialRequisition(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Defensive "seed on first request to this resource" — same pattern seedJobTypesIfEmpty()/
  // seedQuotationTemplatesIfEmpty() already established, guarded to run once per warm instance (see
  // ensureMaterialCatalogSeeded()'s own doc comment).
  await ensureMaterialCatalogSeeded();
  const parts = getPathSegments(req, "/api/material-requisitions");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "return") return handleReturn(req, res, parts[0]);
  // finalize เป็น alias ของ approve — แต่ "ไม่" เข้ากันได้ย้อนหลังจริง: ผู้เรียกเดิมยิงตอนเอกสารยัง
  // เป็นร่าง ซึ่งตอนนี้จะได้ 400 (ต้องส่งขออนุมัติก่อน) เก็บชื่อเดิมไว้เพื่อไม่ให้ URL หาย ไม่ใช่เพื่อ
  // รักษาพฤติกรรมเดิม — พฤติกรรมเปลี่ยนโดยตั้งใจ
  if (parts.length === 2 && (parts[1] === "approve" || parts[1] === "finalize")) return handleApprove(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "submit-approval") return handleSubmitApproval(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "reject") return handleReject(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "withdraw-approval") return handleWithdrawApproval(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "rewrite") return handleRewrite(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
