import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection, Filter } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  purchaseRequestsCollection, productionOrdersCollection, productsCollection, countersCollection, auditLogCollection,
  toObjectId, withStringId, type PurchaseRequestFields, type CounterFields,
} from "./collections.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { loadPendingProjectItemOrThrow, linkProjectItemToSubDocument, markProjectItemFulfilled, unlinkProjectItem, findProjectItemIdByLink } from "./projectHandler.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { notifyDepartments, PURCHASING_DEPARTMENT_NAMES } from "./departmentNotify.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import type { PurchaseRequestLine, PurchaseRequestSummary } from "../../src/lib/purchaseRequest.js";

/**
 * Purchase Request API (added 2026-08-18, Stage 3) — mounted from `api/handlers/quotes.ts` alongside
 * Project/Material Requisition/Job Order. See src/lib/purchaseRequest.ts for the full domain-shape
 * doc comment and the FMPU05/"-ED6908027.pdf" PDF-to-field mapping.
 */

const MAX_LINES = 100;

async function nextPurchaseRequestId(counters: Collection<CounterFields>): Promise<string> {
  const buddhistYear = new Date().getFullYear() + 543;
  const counterId = `purchase_request_${buddhistYear}`;
  const result = await counters.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
  const seq = result?.seq ?? 1;
  return `PR-${buddhistYear}-${String(seq).padStart(4, "0")}`;
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string, related: { scopeOfWorkId?: string }): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบขอซื้อ", action, details, createdAt: nowIso(),
    ...(related.scopeOfWorkId ? { relatedScopeId: related.scopeOfWorkId } : {}),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "purchaseRequest:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "purchaseRequest:finalize");
}

/** Unlike Material Requisition, `productId` is optional here — a real filled example
 * (RM-1915 in "-ED6908027.pdf") shows a PR line CAN reference the same catalog Material
 * Requisition uses, but a PR line can also be a one-off item with no catalog entry at all. When
 * `productId` IS given it's resolved/verified server-side exactly like Material Requisition's lines
 * (never trusting a client-sent `productCode`/`description` for a linked line); when it's absent,
 * `description`/`unit` are taken as free-typed input instead. */
async function sanitizeLines(raw: unknown): Promise<PurchaseRequestLine[]> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  const rows = raw as Record<string, unknown>[];

  const productIds = [...new Set(rows.map((r) => (typeof r.productId === "string" ? r.productId : "")).filter(Boolean))];
  const products = await productsCollection();
  const productDocs = productIds.length > 0 ? await products.find({ _id: { $in: productIds.map((pid) => toObjectId(pid)) } }).toArray() : [];
  const productById = new Map(productDocs.map((p) => [p._id.toString(), p]));

  return rows.map((r, idx) => {
    const productId = typeof r.productId === "string" ? r.productId : "";
    const product = productId ? productById.get(productId) : undefined;
    if (productId && !product) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ไม่พบสินค้าที่ระบุ`);
    return {
      id: typeof r.id === "string" && r.id ? r.id : newId("prline"),
      // บรรทัดย่อย — ตัดบรรทัดว่างทิ้งเหมือน ProductionOrderLine.subDetails (มีเทสต์คุมพฤติกรรมนี้อยู่)
      subDetails: (Array.isArray(r.subDetails) ? r.subDetails : [])
        .map((sd, i) => sanitizeShortText(sd, `รายละเอียดย่อยลำดับที่ ${idx + 1}.${i + 1}`))
        .filter(Boolean),
      productId,
      productCode: product ? product.code : sanitizeShortText(r.productCode, `รหัสสินค้าลำดับที่ ${idx + 1}`),
      description: product ? product.name : sanitizeShortText(r.description, `รายละเอียดลำดับที่ ${idx + 1}`, true),
      unit: product ? product.unit : sanitizeShortText(r.unit, `หน่วยลำดับที่ ${idx + 1}`),
      warehouseRemainingQty: sanitizeShortText(r.warehouseRemainingQty, `คลัง คงเหลือลำดับที่ ${idx + 1}`),
      qtyRequested: sanitizeNullableNumber(r.qtyRequested, `จำนวนขอซื้อลำดับที่ ${idx + 1}`),
      neededByDate: validateIsoDateOrEmpty(r.neededByDate, `วันต้องการลำดับที่ ${idx + 1}`),
      departmentCode: sanitizeShortText(r.departmentCode, `แผนกลำดับที่ ${idx + 1}`),
      costCode: sanitizeShortText(r.costCode, `รหัสต้นทุนลำดับที่ ${idx + 1}`),
      estimatedCost: sanitizeNullableNumber(r.estimatedCost, `ราคาประเมินลำดับที่ ${idx + 1}`),
    };
  });
}

function toClient(doc: PurchaseRequestFields & { _id: string }) {
  // บรรทัดที่บันทึกไว้ก่อน 2026-08-27 ไม่มี `subDetails` — เติมเป็น [] ตอนอ่าน ไม่ได้ทำ migration
  // ถ้าไม่เติม หน้าแก้ไขใบขอซื้อจะพังทั้งหน้ากับเอกสารเก่าทุกใบ (`line.subDetails.length` ของ undefined)
  return withStringId(withApprovalDefaults({
    ...doc,
    lines: (doc.lines ?? []).map((l) => ({ ...l, subDetails: l.subDetails ?? [] })),
  }));
}
function toSummary(doc: PurchaseRequestFields & { _id: string }): PurchaseRequestSummary {
  const full = withStringId(doc);
  return { id: full.id, projectId: full.projectId, scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode, status: full.status, updatedAt: full.updatedAt };
}

async function loadOrThrow(id: string) {
  const purchaseRequests = await purchaseRequestsCollection();
  const doc = await purchaseRequests.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบขอซื้อ");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseRequest:view");
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";

  // Omitting projectId switches to "list every Purchase Request company-wide" — same Stage 4/5
  // addition materialRequisitionHandler.ts got, needed for Purchase Request's own standalone list
  // page (Stage 5).
  const ownershipMatch = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "purchaseRequest:viewAll"), "createdBy");
  const purchaseRequests = await purchaseRequestsCollection();
  // แยกเอกสารตามแผนกเจ้าของ — ฝ่ายโครงการกับฝ่ายผลิตใช้เอกสารชนิดเดียวกันแต่ไม่เห็นของกันและกัน
  // (ยืนยันกับเจ้าของ 2026-08-20). เอกสารเก่าที่ไม่มีฟิลด์นี้ถือเป็นของฝ่ายโครงการ จึงต้องรับทั้ง
  // ค่า "project" และกรณีที่ยังไม่มีฟิลด์เลย — ไม่ได้ทำ migration
  const ownerDepartment = req.query.ownerDepartment === "production" ? "production" : "project";
  const departmentClause: Filter<PurchaseRequestFields & { _id: string }> = ownerDepartment === "production"
    ? { ownerDepartment: "production" }
    : { $or: [{ ownerDepartment: "project" }, { ownerDepartment: { $exists: false } }] };
  // เวลาระบุ projectId คือเช็คของโครงการนั้นโดยตรง ไม่ต้องกรองแผนกซ้ำ
  // $and, not spread: buildSimpleOwnershipClause() also returns a $or, so spreading both
  // would have the department clause silently overwrite the ownership one (a real leak).
  const filter = projectId
    ? { projectId, isDeleted: false, ...ownershipMatch }
    : { isDeleted: false, $and: [ownershipMatch, departmentClause] };
  const docs = await purchaseRequests.find(filter).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ purchaseRequests: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseRequest:create");
  if (!roleHasPermission(ctx.role, "project:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  const productionOrderId = typeof body.productionOrderId === "string" ? body.productionOrderId.trim() : "";

  /**
   * ออกได้จาก 2 ต้นทาง (ยืนยันกับเจ้าของ 2026-08-20 ว่าสองแผนกแยกข้อมูลกัน):
   *   - รายการในโครงการ → ของฝ่ายโครงการ ผูกกับ ProjectItem
   *   - ใบสั่งผลิต       → ของฝ่ายผลิต ไม่มีรายการให้ผูก จึงข้าม item-link
   */
  const fromProduction = Boolean(productionOrderId);
  if (!fromProduction && (!projectId || !itemId)) throw new HttpError(400, "กรุณาระบุโครงการและรายการ หรือใบสั่งผลิต");

  let source: { projectId: string; scopeOfWorkId: string; jobCode: string };
  let item: { name: string } | null = null;
  if (fromProduction) {
    const productionOrders = await productionOrdersCollection();
    const po = await productionOrders.findOne({ _id: productionOrderId });
    if (!po || po.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งผลิต");
    // ไม่บังคับว่าใบสั่งผลิตต้องอนุมัติก่อน — ฝ่ายผลิตขอไว้ในการประชุม 2026-08-27
    // ("ใบสั่งผลิตกับใบเบิกไม่ต้องรอ Final ก็สร้างได้") เจ้าของยืนยันให้ปลดทั้งชั้นนี้และชั้น Scope of Work → ใบสั่งผลิต
    // เดิมบังคับไว้ตั้งแต่ 2026-08-20 ด้วยเหตุผลว่าใบสั่งผลิตฉบับร่างไม่ควรสั่งเบิกของจริงได้
    if (!roleHasPermission(ctx.role, "productionOrder:view")) throw new HttpError(403, "Forbidden");
    source = { projectId: "", scopeOfWorkId: po.scopeOfWorkId, jobCode: po.jobCode };
  } else {
    const loaded = await loadPendingProjectItemOrThrow(projectId, itemId);
    item = loaded.item;
    source = { projectId, scopeOfWorkId: loaded.project.scopeOfWorkId, jobCode: loaded.project.scopeNumber };
  }

  const counters = await countersCollection();
  const id = await nextPurchaseRequestId(counters);
  const now = nowIso();
  const doc: PurchaseRequestFields = {
    projectId: source.projectId, scopeOfWorkId: source.scopeOfWorkId, jobCode: source.jobCode,
    ownerDepartment: fromProduction ? "production" : "project",
    productionOrderId: fromProduction ? productionOrderId : "",
    vendorName: "", neededByDate: "", creditDays: null, shippingMethod: "", deliveryLocation: "",
    lines: [], status: "Draft",
    // requestedAt seeds from a date-only slice of `now`, not the full ISO timestamp — see
    // jobOrderHandler.ts's identical fix/comment on requestedAt for why (validateIsoDateOrEmpty
    // requires strict YYYY-MM-DD; the full timestamp made every save after creation fail with 400).
    requestedBy: ctx.user.fullName, requestedAt: now.slice(0, 10),
    approvedBy: "", approvedAt: "",
    purchasingDeptBy: "", purchasingDeptAt: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.insertOne({ ...doc, _id: id });

  // CRITICAL invariant — see materialRequisitionHandler.ts's identical comment on this same step.
  // ฝ่ายผลิตออกจากใบสั่งผลิต ไม่มีรายการในโครงการให้ผูก จึงข้ามขั้นตอนนี้
  if (!fromProduction) {
    await linkProjectItemToSubDocument(projectId, itemId, "purchaseRequest", "purchaseRequestId", id);
  }

  await writeAuditEntry(
    ctx, "Purchase Request Created",
    fromProduction
      ? `สร้างใบขอซื้อ ${id} จากใบสั่งผลิต ${productionOrderId}`
      : `สร้างใบขอซื้อ ${id} สำหรับรายการ "${item?.name ?? ""}"`,
    { scopeOfWorkId: source.scopeOfWorkId },
  );
  res.status(201).json({ purchaseRequest: toClient({ ...doc, _id: id }) });
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "purchaseRequest:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({ purchaseRequest: toClient(doc) });
}

const SHORT_TEXT_FIELDS: { key: keyof PurchaseRequestFields; label: string }[] = [
  { key: "vendorName", label: "ผู้จำหน่าย" },
  { key: "shippingMethod", label: "ขนส่งโดย" },
  { key: "deliveryLocation", label: "สถานที่ส่งของ" },
  { key: "requestedBy", label: "ผู้ขอซื้อ" },
  { key: "approvedBy", label: "ผู้อนุมัติ" },
  { key: "purchasingDeptBy", label: "ฝ่ายจัดซื้อ" },
];
const DATE_FIELDS: { key: keyof PurchaseRequestFields; label: string }[] = [
  { key: "neededByDate", label: "วันที่รับของ" },
  { key: "requestedAt", label: "วันที่ขอซื้อ" },
  { key: "approvedAt", label: "วันที่อนุมัติ" },
  { key: "purchasingDeptAt", label: "วันที่ฝ่ายจัดซื้อ" },
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
  const update: Partial<PurchaseRequestFields> = {};
  if ("lines" in body) update.lines = await sanitizeLines(body.lines);
  if ("creditDays" in body) update.creditDays = sanitizeNullableNumber(body.creditDays, "เครดิต (วัน)");
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  // การบันทึกอัตโนมัติไม่เขียน audit log — ไม่งั้นการพิมพ์งานครั้งเดียวจะสร้างรายการซ้ำนับสิบรายการ
  // An auto-save writes no audit entry (see `isAutoSaveRequest()` in api/_lib/http.ts). The write
  // itself passed the exact same permission, Draft-status and validation checks as a manual Save.
  if (!autoSave) {
    await writeAuditEntry(ctx, "Purchase Request Updated", `แก้ไขใบขอซื้อ ${id}`, { scopeOfWorkId: updated.scopeOfWorkId });
  }
  res.status(200).json({ purchaseRequest: toClient(updated) });
}

/**
 * ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) เพิ่ม 2026-08-20 — ใช้ helper ร่วมใน documentApproval.ts
 * ที่ทำตามกลไกของ Scope of Work ทุกประการ ตามที่เจ้าของสั่ง ("เหมือน Scope of Work เป๊ะ")
 *
 * `finalize` เดิมที่กระโดดจากร่างไป Final ตรงๆ ถูกแทนที่ด้วย `approve` ซึ่งบังคับให้ผ่าน
 * PendingApproval ก่อน — route ชื่อเดิมยังคงไว้เป็น alias เพื่อไม่ให้ของเดิมที่เรียกอยู่พัง
 */
const approvalConfig: ApprovalConfig<PurchaseRequestFields & { _id: string }> = {
  label: "ใบขอซื้อ",
  approvePermission: "purchaseRequest:finalize",
  collection: async () => (await purchaseRequestsCollection()) as unknown as Collection<PurchaseRequestFields & { _id: string }>,
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail, doc) => writeAuditEntry(ctx, action, detail, { scopeOfWorkId: doc.scopeOfWorkId }),
  // อนุมัติแล้วถือว่ารายการใน Project ต้นทางถูกจัดหาเรียบร้อย (เดิมทำตอน finalize)
  onApproved: async (ctx, doc) => {
    const itemId = doc.projectId ? await findProjectItemIdByLink(doc.projectId, "purchaseRequestId", doc._id) : null;
    if (itemId) await markProjectItemFulfilled(doc.projectId, itemId);

    // ส่งต่อให้จัดซื้อ (ฝ่ายโครงการขอไว้ 2026-08-27: "ใบขอซื้อ ให้ผู้จัดการอนุมัติแล้วส่งไปที่จัดซื้อ")
    // best-effort โดยตั้งใจ — การอนุมัติต้องไม่ล้มเพราะแจ้งเตือนส่งไม่ออก แต่ถ้าไม่มีผู้รับเลยต้องเห็นใน log
    try {
      const sent = await notifyDepartments(PURCHASING_DEPARTMENT_NAMES, ctx.user.id, {
        type: "purchase_request_approved",
        title: "ใบขอซื้ออนุมัติแล้ว — รอจัดซื้อดำเนินการ",
        description: `${ctx.user.fullName} อนุมัติใบขอซื้อ ${doc._id} (งาน ${doc.jobCode || "-"})`,
        module: "ใบขอซื้อ",
        related: { relatedPurchaseRequestId: doc._id },
      });
      if (sent === 0) {
        console.warn("[purchase-requests] approved but nobody in Purchasing received a notification —",
          "no active user has User.department matching", PURCHASING_DEPARTMENT_NAMES.join("/"));
      }
    } catch (err) {
      console.error("[purchase-requests] failed to notify Purchasing on approval", err);
    }
  },
  respond: (res, doc) => res.status(200).json({ purchaseRequest: toClient(doc) }),
};

async function handlePrint(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseRequest:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Purchase Request Printed", `พิมพ์ใบขอซื้อ ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseRequest:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "purchaseRequest:finalize")) throw new HttpError(403, "Forbidden");

  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const itemId = doc.projectId ? await findProjectItemIdByLink(doc.projectId, "purchaseRequestId", id) : null;
  if (itemId) await unlinkProjectItem(doc.projectId, itemId, "purchaseRequestId");
  await writeAuditEntry(ctx, "Purchase Request Deleted", `ลบใบขอซื้อ ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handlePurchaseRequest(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/purchase-requests");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  // finalize เป็น alias ของ approve — แต่ "ไม่" เข้ากันได้ย้อนหลังจริง: ผู้เรียกเดิมยิงตอนเอกสารยัง
  // เป็นร่าง ซึ่งตอนนี้จะได้ 400 (ต้องส่งขออนุมัติก่อน) เก็บชื่อเดิมไว้เพื่อไม่ให้ URL หาย ไม่ใช่เพื่อ
  // รักษาพฤติกรรมเดิม — พฤติกรรมเปลี่ยนโดยตั้งใจ
  if (parts.length === 2 && (parts[1] === "approve" || parts[1] === "finalize")) return handleApprove(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "submit-approval") return handleSubmitApproval(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "reject") return handleReject(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "withdraw-approval") return handleWithdrawApproval(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
