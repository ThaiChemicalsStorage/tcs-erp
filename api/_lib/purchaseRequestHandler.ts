import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { nextMonthlyDocumentNumber } from "./documentNumbering.js";
import type { Collection, Filter } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  purchaseRequestsCollection, productionOrdersCollection, productsCollection, countersCollection, auditLogCollection,
  toObjectId, withStringId, type PurchaseRequestFields, type CounterFields,
} from "./collections.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { handleAttachmentUpload, handleAttachmentDelete, handleAttachmentDownload, type AttachmentConfig } from "./documentAttachments.js";
import type { DocumentAttachment } from "../../src/lib/documentAttachments.js";
import { loadPendingProjectItemsOrThrow, linkProjectItemsToSubDocument, markProjectItemsFulfilled, unlinkProjectItems, findProjectItemIdsByLink } from "./projectHandler.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { notifyDepartments, notifyUser, PURCHASING_DEPARTMENT_NAMES, STORE_DEPARTMENT_NAMES } from "./departmentNotify.js";
import { applyStockMovement, assertProductsHaveStock, productCostBasis, returnUnitCostOf } from "./stockHandler.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, validateIsoDateOrEmpty, sanitizeLongText } from "./quoteValidation.js";
import { getRevisionRoot } from "../../src/lib/revisionDiff.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import type {
  PurchaseRequestLine, PurchaseRequestSummary, PurchaseRequestIssueBatch, PurchaseRequestStoreStage,
} from "../../src/lib/purchaseRequest.js";
import { storeIssueBatchesOf, storeIssuedQtyOf } from "../../src/lib/purchaseRequest.js";

/**
 * Purchase Request API (added 2026-08-18, Stage 3) — mounted from `api/handlers/quotes.ts` alongside
 * Project/Material Requisition/Job Order. See src/lib/purchaseRequest.ts for the full domain-shape
 * doc comment and the FMPU05/"-ED6908027.pdf" PDF-to-field mapping.
 */

const MAX_LINES = 100;

async function nextPurchaseRequestId(counters: Collection<CounterFields>): Promise<string> {
  return nextMonthlyDocumentNumber(counters, "PR", "purchase_request");
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
/**
 * ฝ่ายจัดซื้อแก้ใบที่**อนุมัติแล้ว**ได้ (2026-09-09) — เจ้าของสั่ง: *"จัดซื้อสามารถแก้ไข PR ได้ เนื่องจาก
 * ชื่อหรือยี่ห้อตอนซื้ออาจจะไม่ตรงตามที่พิมพ์ไว้ในใบ"* และเลือกให้แก้ได้**ทุกช่องเหมือนใบร่าง**
 *
 * สิทธิ์แยกตัวเอง (`purchaseRequest:editApproved`) ไม่ใช่ `:edit` หรือ `:finalize` — `:edit` คือคนเขียนใบ
 * ซึ่งไม่ควรกลับมาแก้ใบที่หัวหน้าเซ็นแล้ว ส่วน `:finalize` คือหัวหน้าที่อนุมัติ ไม่ใช่คนซื้อของ
 * **ไม่ผูกกับความเป็นเจ้าของใบ** เพราะคนซื้อของไม่ใช่คนเขียนใบโดยนิยาม
 */
function canEditApproved(ctx: AuthContext): boolean {
  return roleHasPermission(ctx.role, "purchaseRequest:editApproved");
}

/** Unlike Material Requisition, `productId` is optional here — a real filled example
 * (RM-1915 in "-ED6908027.pdf") shows a PR line CAN reference the same catalog Material
 * Requisition uses, but a PR line can also be a one-off item with no catalog entry at all. When
 * `productId` IS given it's resolved/verified server-side exactly like Material Requisition's lines
 * (never trusting a client-sent `productCode`/`description` for a linked line); when it's absent,
 * `description`/`unit` are taken as free-typed input instead. */
async function sanitizeLines(raw: unknown, existing: PurchaseRequestLine[] = []): Promise<PurchaseRequestLine[]> {
  const existingById = new Map(existing.map((l) => [l.id, l]));
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
      // ผลการเช็คของของสโตร์ไม่รับจาก PATCH (2026-09-09) — เป็นของ route /store-review เท่านั้น
      // ค่าเดิมของบรรทัดเดียวกัน (จับคู่ด้วย id) ถูกคงไว้ กฎเดียวกับยอดจ่าย/คืนของของใบเบิก
      storeDecision: existingById.get(typeof r.id === "string" ? r.id : "")?.storeDecision ?? "",
      storeAvailableQty: existingById.get(typeof r.id === "string" ? r.id : "")?.storeAvailableQty ?? null,
    };
  });
}

function toClient(doc: PurchaseRequestFields & { _id: string }) {
  // บรรทัดที่บันทึกไว้ก่อน 2026-08-27 ไม่มี `subDetails` — เติมเป็น [] ตอนอ่าน ไม่ได้ทำ migration
  // ถ้าไม่เติม หน้าแก้ไขใบขอซื้อจะพังทั้งหน้ากับเอกสารเก่าทุกใบ (`line.subDetails.length` ของ undefined)
  return withStringId(withApprovalDefaults({
    ...doc,
    lines: (doc.lines ?? []).map((l) => ({ ...l, subDetails: l.subDetails ?? [] })),
    revisionNote: doc.revisionNote ?? "",
    // ช่องที่เพิ่มมาพร้อมการทาบกับฟอร์ม FM-PU-05 ตัวจริง 2026-08-31 — เอกสารเก่าไม่มี เติมตอนอ่าน
    issueDate: doc.issueDate ?? "",
    deliveryContact: doc.deliveryContact ?? "",
    deliveryPhone: doc.deliveryPhone ?? "",
    headerRemark: doc.headerRemark ?? "",
    // ไฟล์แนบเพิ่ม 2026-09-02 — เอกสารเก่าไม่มีฟิลด์นี้ เติมตอนอ่าน ไม่ได้ทำ migration
    attachments: doc.attachments ?? [],
    // ขั้นสโตร์เพิ่ม 2026-09-09 — ใบเก่าไม่มี `storeStage` เลย (แปลว่าวิ่งตรงไปจัดซื้อตามกติกาเดิม)
    // จึงปล่อยเป็น undefined โดยตั้งใจ ไม่เติมค่าให้ ส่วนที่เหลือเติมเป็นค่าว่างเพื่อให้หน้าจออ่านได้ตรง ๆ
    storeReviewedBy: doc.storeReviewedBy ?? "",
    storeReviewedByName: doc.storeReviewedByName ?? "",
    storeReviewedAt: doc.storeReviewedAt ?? "",
    storeRemark: doc.storeRemark ?? "",
    storeIssues: doc.storeIssues ?? [],
    purchasingEdits: doc.purchasingEdits ?? [],
  }));
}
function toSummary(doc: PurchaseRequestFields & { _id: string }): PurchaseRequestSummary {
  const full = withStringId(doc);
  return { id: full.id, projectId: full.projectId, scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode, status: full.status, storeStage: full.storeStage, updatedAt: full.updatedAt, ownerDepartment: full.ownerDepartment ?? "project" };
}

async function loadOrThrow(id: string) {
  const purchaseRequests = await purchaseRequestsCollection();
  const doc = await purchaseRequests.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบขอซื้อ");
  return doc;
}

async function handleList(req: ApiRequest, res: ApiResponse) {
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
  // 2026-08-28: เพิ่มอีกสองค่า — "general" คือใบที่ฝ่ายอื่น (สโตร์/เซอร์วิส/บัญชี/บุคคล) เปิดเองโดยไม่มี
  // เอกสารต้นทาง และ "all" คือกล่องงานเข้าของฝ่ายจัดซื้อ ที่ต้องเห็นใบของทุกฝ่ายรวมกันเพื่อออกใบสั่งซื้อต่อ
  // (ยังกรองด้วย ownership เดิมอยู่ — "all" เปิดเฉพาะกำแพงแผนก ไม่ได้เปิดกำแพงสิทธิ์)
  const q = req.query.ownerDepartment;
  const ownerDepartment = q === "production" || q === "general" || q === "all" ? q : "project";
  const departmentClause: Filter<PurchaseRequestFields & { _id: string }> =
    ownerDepartment === "production" ? { ownerDepartment: "production" }
    : ownerDepartment === "general" ? { ownerDepartment: "general" }
    : ownerDepartment === "all" ? {}
    : { $or: [{ ownerDepartment: "project" }, { ownerDepartment: { $exists: false } }] };
  // เวลาระบุ projectId คือเช็คของโครงการนั้นโดยตรง ไม่ต้องกรองแผนกซ้ำ
  // $and, not spread: buildSimpleOwnershipClause() also returns a $or, so spreading both
  // would have the department clause silently overwrite the ownership one (a real leak).
  /**
   * กล่องงานเข้า (2026-09-09) — `?storeStage=pending` คือของสโตร์ (อนุมัติแล้วรอเช็คของ) และ
   * `?storeStage=forwarded` คือของจัดซื้อ (สโตร์ส่งต่อมาแล้ว) · ใบก่อน 2026-09-09 ไม่มีฟิลด์นี้เลย
   * จึงนับรวมใน `forwarded` ด้วย ไม่งั้นใบที่อนุมัติไว้ก่อนหน้านี้จะหายจากกล่องของจัดซื้อทั้งหมด
   */
  const stageQuery = req.query.storeStage;
  const stageClause: Filter<PurchaseRequestFields & { _id: string }> =
    stageQuery === "pending" ? { status: "Final", storeStage: "pending" }
    : stageQuery === "forwarded" ? { status: "Final", $or: [{ storeStage: "forwarded" }, { storeStage: { $exists: false } }] }
    : {};
  const filter = projectId
    ? { projectId, isDeleted: false, ...ownershipMatch }
    : { isDeleted: false, $and: [ownershipMatch, departmentClause, stageClause] };
  const docs = await purchaseRequests.find(filter).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ purchaseRequests: docs.map(toSummary) });
}

async function handleCreate(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseRequest:create");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  /**
   * รายการในโครงการที่ติ๊กเลือกไว้ — รับทั้ง `itemIds` (หลายรายการ) และ `itemId` เดี่ยวของผู้เรียกเก่า
   * ดูเหตุผลเต็มที่ `handleCreate()` ของใบเบิกและใบคืนวัสดุ (คำสั่งเจ้าของข้อเดียวกัน 2026-09-02)
   */
  const itemIds = [...new Set(
    Array.isArray(body.itemIds)
      ? (body.itemIds as unknown[]).filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
      : typeof body.itemId === "string" && body.itemId.trim() ? [body.itemId.trim()] : [],
  )];
  const productionOrderId = typeof body.productionOrderId === "string" ? body.productionOrderId.trim() : "";

  /**
   * ออกได้จาก 2 ต้นทาง (ยืนยันกับเจ้าของ 2026-08-20 ว่าสองแผนกแยกข้อมูลกัน):
   *   - รายการในโครงการ → ของฝ่ายโครงการ ผูกกับ ProjectItem
   *   - ใบสั่งผลิต       → ของฝ่ายผลิต ไม่มีรายการให้ผูก จึงข้าม item-link
   */
  const fromProduction = Boolean(productionOrderId);
  /**
   * ต้นทางที่สาม เพิ่ม 2026-08-28: **ไม่มีเอกสารต้นทางเลย** — ฝ่ายสโตร์ เซอร์วิส บัญชี บุคคล ตามผัง
   * "กระบวนการจัดซื้อ" ที่เจ้าของส่งมา ทุกฝ่ายขอซื้อได้ แต่มีแค่ฝ่ายโครงการกับฝ่ายผลิตเท่านั้นที่มี
   * เอกสารต้นทางให้ผูก ใบของฝ่ายอื่นจึงไม่มี projectId/scopeOfWorkId/jobCode และไม่ไปแตะ
   * linkProjectItemToSubDocument() — ผู้ใช้พิมพ์รายการเองทั้งใบ
   */
  const standalone = !fromProduction && !projectId && itemIds.length === 0;
  if (!fromProduction && !standalone && (!projectId || itemIds.length === 0)) throw new HttpError(400, "กรุณาระบุโครงการและรายการ หรือใบสั่งผลิต");
  // สิทธิ์ project:view จำเป็นเฉพาะทางที่ต้องอ่านโครงการจริง ๆ — ถ้าบังคับทั้งก้อนเหมือนเดิม
  // ฝ่ายที่ไม่มีสิทธิ์ดูโครงการจะเปิดใบของตัวเองไม่ได้เลย ซึ่งเป็นสิ่งที่รอบนี้ตั้งใจแก้
  if (!fromProduction && !standalone && !roleHasPermission(ctx.role, "project:view")) throw new HttpError(403, "Forbidden");

  let source: { projectId: string; scopeOfWorkId: string; jobCode: string };
  let pickedItems: { name: string }[] = [];
  if (standalone) {
    source = { projectId: "", scopeOfWorkId: "", jobCode: "" };
  } else if (fromProduction) {
    const productionOrders = await productionOrdersCollection();
    const po = await productionOrders.findOne({ _id: productionOrderId });
    if (!po || po.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งผลิต");
    // ไม่บังคับว่าใบสั่งผลิตต้องอนุมัติก่อน — ฝ่ายผลิตขอไว้ในการประชุม 2026-08-27
    // ("ใบสั่งผลิตกับใบเบิกไม่ต้องรอ Final ก็สร้างได้") เจ้าของยืนยันให้ปลดทั้งชั้นนี้และชั้น Scope of Work → ใบสั่งผลิต
    // เดิมบังคับไว้ตั้งแต่ 2026-08-20 ด้วยเหตุผลว่าใบสั่งผลิตฉบับร่างไม่ควรสั่งเบิกของจริงได้
    if (!roleHasPermission(ctx.role, "productionOrder:view")) throw new HttpError(403, "Forbidden");
    source = { projectId: "", scopeOfWorkId: po.scopeOfWorkId, jobCode: po.jobCode };
  } else {
    const loaded = await loadPendingProjectItemsOrThrow(projectId, itemIds);
    pickedItems = loaded.items;
    source = { projectId, scopeOfWorkId: loaded.project.scopeOfWorkId, jobCode: loaded.project.scopeNumber };
  }

  const counters = await countersCollection();
  const id = await nextPurchaseRequestId(counters);
  const now = nowIso();
  const doc: PurchaseRequestFields = {
    projectId: source.projectId, scopeOfWorkId: source.scopeOfWorkId, jobCode: source.jobCode,
    ownerDepartment: standalone ? "general" : fromProduction ? "production" : "project",
    productionOrderId: fromProduction ? productionOrderId : "",
    neededByDate: "", deliveryLocation: "",
    deliveryContact: "", deliveryPhone: "", headerRemark: "",
    // วันที่บนหัวเอกสารตั้งต้นเป็นวันที่สร้าง แก้ได้ — ใบจริงพิมพ์วันที่ที่ออกเอกสาร ไม่ใช่วันที่เซ็น
    issueDate: now.slice(0, 10),
    lines: [], attachments: [], status: "Draft",
    // requestedAt seeds from a date-only slice of `now`, not the full ISO timestamp — see
    // jobOrderHandler.ts's identical fix/comment on requestedAt for why (validateIsoDateOrEmpty
    // requires strict YYYY-MM-DD; the full timestamp made every save after creation fail with 400).
    requestedBy: ctx.user.fullName, requestedAt: now.slice(0, 10),
    approvedBy: "", approvedAt: "",
    purchasingDeptBy: "", purchasingDeptAt: "",
    revisionNote: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.insertOne({ ...doc, _id: id });

  // CRITICAL invariant — see materialRequisitionHandler.ts's identical comment on this same step.
  // ฝ่ายผลิตออกจากใบสั่งผลิต ไม่มีรายการในโครงการให้ผูก จึงข้ามขั้นตอนนี้
  if (!fromProduction && !standalone) {
    await linkProjectItemsToSubDocument(projectId, itemIds, "purchaseRequest", "purchaseRequestId", id);
  }

  await writeAuditEntry(
    ctx, "Purchase Request Created",
    standalone
      ? `สร้างใบขอซื้อ ${id} (ไม่มีเอกสารต้นทาง)`
      : fromProduction
      ? `สร้างใบขอซื้อ ${id} จากใบสั่งผลิต ${productionOrderId}`
      : `สร้างใบขอซื้อ ${id} สำหรับรายการ "${pickedItems.map((it) => it.name).join('", "')}"`,
    { scopeOfWorkId: source.scopeOfWorkId },
  );
  res.status(201).json({ purchaseRequest: toClient({ ...doc, _id: id }) });
}

async function handleGetOne(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "purchaseRequest:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({ purchaseRequest: toClient(doc), stockByProduct: await stockByProductFor(doc.lines ?? []) });
}

/**
 * ยอดคงเหลือปัจจุบันของสินค้าทุกตัวในใบ — ส่งคู่กับเอกสารเหมือนใบเบิก (2026-09-09) เพื่อให้การ์ด
 * "สโตร์เช็คของ" โชว์ยอดจริงต่อบรรทัดได้ทันที โดยไม่ต้องดึงสินค้าทั้งคลังมาหาเอง
 *
 * บรรทัดที่พิมพ์เอง (ไม่มี `productId`) ไม่มียอดคงเหลือให้ดู — สโตร์ต้องตั้งรหัสสินค้าก่อนถึงจะจ่ายได้
 */
async function stockByProductFor(lines: PurchaseRequestLine[]): Promise<Record<string, number>> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((pid) => pid && /^[0-9a-fA-F]{24}$/.test(pid)))];
  if (ids.length === 0) return {};
  const products = await productsCollection();
  const docs = await products.find({ _id: { $in: ids.map((pid) => toObjectId(pid)) } }, { projection: { stockQty: 1 } }).toArray();
  return Object.fromEntries(docs.map((p) => [p._id.toString(), p.stockQty ?? 0]));
}

/** ด่านร่วมของทุก route ฝั่งสโตร์ — ต้องเป็นใบที่อนุมัติแล้วเท่านั้น */
function assertFinalForStore(doc: PurchaseRequestFields & { _id: string }, action: string): void {
  if (doc.status !== "Final") throw new HttpError(400, `${action}ได้เฉพาะใบขอซื้อที่อนุมัติแล้วเท่านั้น`);
}

/**
 * ขั้นถัดไปของใบ หลังรู้ผลการเช็คของและยอดที่จ่ายไปแล้ว (2026-09-09)
 *
 * - มีบรรทัดที่ต้องซื้อ → `"forwarded"` (จัดซื้อออกใบสั่งซื้อได้)
 * - ทุกบรรทัดมีของ **และจ่ายครบแล้ว** → `"closed"` (จบที่สโตร์ ไม่ต้องซื้อ)
 * - นอกนั้น (ยังเช็คไม่ครบ หรือมีของแต่ยังจ่ายไม่ครบ) → `"pending"` ยังเป็นงานของสโตร์อยู่
 */
function nextStoreStage(lines: PurchaseRequestLine[], issues: PurchaseRequestIssueBatch[]): PurchaseRequestStoreStage {
  if (lines.some((l) => l.storeDecision === "purchase")) return "forwarded";
  if (lines.length === 0 || lines.some((l) => l.storeDecision !== "stock")) return "pending";
  const issuedOf = (lineId: string) => issues.flatMap((b) => b.lines).filter((l) => l.lineId === lineId).reduce((sum, l) => sum + l.qty, 0);
  return lines.every((l) => issuedOf(l.id) >= (l.qtyRequested ?? 0)) ? "closed" : "pending";
}

const SHORT_TEXT_FIELDS: { key: keyof PurchaseRequestFields; label: string }[] = [
  // ผู้จำหน่าย / โทร.ผู้จำหน่าย / ขนส่งโดย ถูกถอดออก 2026-08-31 — ดู src/lib/purchaseRequest.ts
  { key: "deliveryLocation", label: "สถานที่ส่งของ" },
  { key: "deliveryContact", label: "ผู้ติดต่อปลายทาง" },
  { key: "deliveryPhone", label: "โทร. ปลายทาง" },
  { key: "requestedBy", label: "ผู้ขอซื้อ" },
  { key: "approvedBy", label: "ผู้อนุมัติ" },
  { key: "purchasingDeptBy", label: "ฝ่ายจัดซื้อ" },
];
const DATE_FIELDS: { key: keyof PurchaseRequestFields; label: string }[] = [
  { key: "neededByDate", label: "วันที่รับของ" },
  { key: "issueDate", label: "วันที่" },
  { key: "requestedAt", label: "วันที่ขอซื้อ" },
  { key: "approvedAt", label: "วันที่อนุมัติ" },
  { key: "purchasingDeptAt", label: "วันที่ฝ่ายจัดซื้อ" },
];

async function handleUpdate(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  /**
   * **ทางเข้าสองทาง (2026-09-09)**: เจ้าของใบแก้ได้ตอนเป็นร่าง · ฝ่ายจัดซื้อแก้ได้ตอนอนุมัติแล้ว
   * `PendingApproval` ยังล็อกทุกคนตามเดิม — ห้ามแก้ใบที่ผู้อนุมัติกำลังอ่านอยู่
   */
  const purchasingEdit = doc.status === "Final" && canEditApproved(ctx);
  if (!purchasingEdit && !canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft" && !purchasingEdit) {
    throw new HttpError(400, doc.status === "Final"
      ? "เอกสารนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้"
      : "เอกสารนี้กำลังรออนุมัติ ต้องถอนการขออนุมัติก่อนจึงจะแก้ไขได้");
  }
  // การแก้ใบที่อนุมัติแล้วต้องเป็นการกดบันทึกของคนจริง ๆ ไม่ใช่การบันทึกอัตโนมัติระหว่างพิมพ์
  // (กฎมาตรฐานของระบบ: auto-save เขียนได้เฉพาะใบร่าง ดู hooks/useAutoSave.ts + api/_lib/http.ts)
  if (autoSave && purchasingEdit) throw new HttpError(409, "บันทึกอัตโนมัติไม่รองรับใบที่อนุมัติแล้ว");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<PurchaseRequestFields> = {};
  if ("lines" in body) {
    update.lines = await sanitizeLines(body.lines, doc.lines ?? []);
    if (purchasingEdit) assertStoreIssuesStillCovered(doc, update.lines);
  }
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  if ("headerRemark" in body) update.headerRemark = sanitizeLongText(body.headerRemark, "หมายเหตุ");
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  // ประวัติการแก้หลังอนุมัติ — ต่อท้ายทุกครั้งที่บันทึก ไม่ใช่เขียนทับ ใบที่ถูกแก้หลายรอบจะอ่านได้ครบ
  if (purchasingEdit) {
    update.purchasingEdits = [
      ...(doc.purchasingEdits ?? []),
      {
        at: update.updatedAt,
        byUserId: ctx.user.id,
        byName: ctx.user.fullName,
        note: sanitizeLongText(body.purchasingEditNote, "หมายเหตุการแก้ของจัดซื้อ"),
      },
    ];
  }
  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  if (purchasingEdit) {
    await writeAuditEntry(ctx, "Purchase Request Edited After Approval",
      `ฝ่ายจัดซื้อแก้ใบขอซื้อ ${id} ที่อนุมัติแล้ว`, { scopeOfWorkId: updated.scopeOfWorkId });
    // แจ้งผู้สร้างใบ — เนื้อหาใบที่เขาส่งไปอนุมัติเปลี่ยน ต้องรู้ best-effort เหมือนแจ้งเตือนอื่นทั้งระบบ
    try {
      await notifyUser(doc.createdBy, ctx.user.id, {
        type: "purchase_request_edited",
        title: "ฝ่ายจัดซื้อแก้ใบขอซื้อของคุณ",
        description: `${ctx.user.fullName} แก้ใบขอซื้อ ${id} ที่อนุมัติแล้ว (ชื่อ/ยี่ห้อ/รายละเอียดตอนซื้อจริง)`,
        module: "ใบขอซื้อ",
        related: { relatedPurchaseRequestId: id },
      });
    } catch (err) {
      console.error("[purchase-requests] failed to notify the author after a purchasing edit", err);
    }
  }
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
  submitNotification: {
    type: "purchase_request_submitted", module: "ใบขอซื้อ",
    relatedField: "relatedPurchaseRequestId", context: (doc) => doc.jobCode || "",
  },
  collection: async () => (await purchaseRequestsCollection()) as unknown as Collection<PurchaseRequestFields & { _id: string }>,
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail, doc) => writeAuditEntry(ctx, action, detail, { scopeOfWorkId: doc.scopeOfWorkId }),
  // อนุมัติแล้วถือว่ารายการใน Project ต้นทางถูกจัดหาเรียบร้อย (เดิมทำตอน finalize)
  onApproved: async (ctx, doc) => {
    const itemIds = doc.projectId ? await findProjectItemIdsByLink(doc.projectId, "purchaseRequestId", doc._id) : [];
    if (itemIds.length > 0) await markProjectItemsFulfilled(doc.projectId, itemIds);

    /**
     * **2026-09-09 — อนุมัติแล้วไปสโตร์ก่อน ไม่ใช่จัดซื้อ** ตามไหลงานที่เจ้าของสั่ง:
     * สร้างใบ → หัวหน้าฝ่ายอนุมัติ → สโตร์เช็คของ → มีของ = จ่ายจบ / ไม่มี = ส่งต่อจัดซื้อ
     * การแจ้งจัดซื้อย้ายไปอยู่ที่ `handleStoreReview()` ตอนสโตร์กดส่งต่อ · ใช้กับใบของ**ทุกฝ่าย**
     * (เจ้าของเลือก "ทุกใบ" เมื่อถูกถาม) รวมใบที่ฝ่ายอื่นเปิดเอง
     */
    const purchaseRequests = await purchaseRequestsCollection();
    await purchaseRequests.updateOne({ _id: doc._id }, { $set: { storeStage: "pending" } });

    // best-effort โดยตั้งใจ — การอนุมัติต้องไม่ล้มเพราะแจ้งเตือนส่งไม่ออก แต่ถ้าไม่มีผู้รับเลยต้องเห็นใน log
    try {
      const sent = await notifyDepartments(STORE_DEPARTMENT_NAMES, ctx.user.id, {
        type: "purchase_request_approved",
        title: "ใบขอซื้ออนุมัติแล้ว — รอสโตร์เช็คของ",
        description: `${ctx.user.fullName} อนุมัติใบขอซื้อ ${doc._id} (งาน ${doc.jobCode || "-"}) รอสโตร์เช็คว่ามีของในสต๊อกหรือไม่`,
        module: "ใบขอซื้อ",
        related: { relatedPurchaseRequestId: doc._id },
      });
      if (sent === 0) {
        console.warn("[purchase-requests] approved but nobody in Stores received a notification —",
          "no active user has User.department matching", STORE_DEPARTMENT_NAMES.join("/"));
      }
    } catch (err) {
      console.error("[purchase-requests] failed to notify Stores on approval", err);
    }
  },
  respond: (res, doc) => res.status(200).json({ purchaseRequest: toClient(doc) }),
};

/**
 * ห้ามจัดซื้อแก้ใบจนขัดกับของที่สโตร์จ่ายออกไปแล้ว (2026-09-09)
 *
 * ลบบรรทัดที่จ่ายของไปแล้วไม่ได้ และลดจำนวนให้ต่ำกว่าที่จ่ายไปแล้วไม่ได้ — ไม่งั้นใบจะอ่านว่าจ่ายเกินที่ขอ
 * และบัญชีเดินสะพัดของสต๊อกจะอ้างบรรทัดที่ไม่มีอยู่อีกต่อไป
 */
function assertStoreIssuesStillCovered(
  doc: PurchaseRequestFields & { _id: string }, nextLines: PurchaseRequestLine[],
): void {
  const issues = storeIssueBatchesOf({ storeIssues: doc.storeIssues } as never);
  if (issues.length === 0) return;
  const nextById = new Map(nextLines.map((l) => [l.id, l]));
  for (const line of doc.lines ?? []) {
    const issued = storeIssuedQtyOf({ storeIssues: doc.storeIssues } as never, line.id);
    if (issued <= 0) continue;
    const next = nextById.get(line.id);
    if (!next) throw new HttpError(400, `${line.description}: สโตร์จ่ายของไปแล้ว ${issued} ${line.unit} ลบรายการนี้ไม่ได้`);
    if ((next.qtyRequested ?? 0) < issued) {
      throw new HttpError(400, `${line.description}: สโตร์จ่ายของไปแล้ว ${issued} ${line.unit} ลดจำนวนให้น้อยกว่านั้นไม่ได้`);
    }
  }
}

/**
 * สโตร์บันทึกผลการเช็คของ (2026-09-09) — บรรทัดไหนมีของ บรรทัดไหนต้องซื้อ
 *
 * สิทธิ์ `stock:adjust` ไม่ใช่ `purchaseRequest:edit` — คนเช็คของคือสโตร์ ไม่ใช่คนเขียนใบ (กติกาเดียวกับ
 * route จ่ายของของใบเบิก) · บันทึกได้ซ้ำ ถ้าเช็คผิดหรือของมาทีหลังก็กดใหม่ได้ แต่บรรทัดที่จ่ายของไปแล้ว
 * เปลี่ยนเป็น "ต้องซื้อ" ไม่ได้ เพราะของออกจากคลังไปแล้ว
 */
async function handleStoreReview(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const doc = await loadOrThrow(id);
  assertFinalForStore(doc, "เช็คของ");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  if (rows.length === 0) throw new HttpError(400, "กรุณาระบุผลการเช็คของอย่างน้อยหนึ่งรายการ");
  const decisionById = new Map<string, { decision: "stock" | "purchase"; availableQty: number | null }>();
  for (const r of rows) {
    const lineId = typeof r.lineId === "string" ? r.lineId : "";
    const decision = r.decision === "stock" || r.decision === "purchase" ? r.decision : null;
    if (!lineId || !decision) throw new HttpError(400, "ผลการเช็คของไม่ถูกต้อง");
    decisionById.set(lineId, { decision, availableQty: sanitizeNullableNumber(r.availableQty, "ยอดคงเหลือ") });
  }

  const issues = storeIssueBatchesOf({ storeIssues: doc.storeIssues } as never);
  const lines = (doc.lines ?? []).map((line) => {
    const next = decisionById.get(line.id);
    if (!next) return line;
    if (next.decision === "purchase" && storeIssuedQtyOf({ storeIssues: doc.storeIssues } as never, line.id) > 0) {
      throw new HttpError(400, `${line.description}: จ่ายของจากสต๊อกไปแล้ว เปลี่ยนเป็น "ต้องซื้อ" ไม่ได้`);
    }
    return { ...line, storeDecision: next.decision, storeAvailableQty: next.availableQty };
  });

  const now = nowIso();
  const stage = nextStoreStage(lines, issues);
  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.updateOne({ _id: id }, {
    $set: {
      lines,
      storeStage: stage,
      storeReviewedBy: ctx.user.id,
      storeReviewedByName: ctx.user.fullName,
      storeReviewedAt: now.slice(0, 10),
      storeRemark: sanitizeLongText(body.remark, "หมายเหตุของสโตร์"),
      updatedAt: now, updatedBy: ctx.user.id,
    },
  });

  const updated = await loadOrThrow(id);
  const toBuy = lines.filter((l) => l.storeDecision === "purchase").length;
  // ส่งต่อจัดซื้อตอนนี้ ไม่ใช่ตอนอนุมัติ — นี่คือจุดที่ไหลงานของเจ้าของบอกว่า "ไม่มีให้ส่งไปที่จัดซื้อ"
  if (stage === "forwarded") {
    try {
      const sent = await notifyDepartments(PURCHASING_DEPARTMENT_NAMES, ctx.user.id, {
        type: "purchase_request_approved",
        title: "สโตร์ส่งต่อใบขอซื้อ — รอจัดซื้อดำเนินการ",
        description: `${ctx.user.fullName} เช็คของใบขอซื้อ ${id} แล้ว มี ${toBuy} รายการที่ไม่มีในสต๊อก ต้องสั่งซื้อ`,
        module: "ใบขอซื้อ",
        related: { relatedPurchaseRequestId: id },
      });
      if (sent === 0) {
        console.warn("[purchase-requests] forwarded but nobody in Purchasing received a notification —",
          "no active user has User.department matching", PURCHASING_DEPARTMENT_NAMES.join("/"));
      }
    } catch (err) {
      console.error("[purchase-requests] failed to notify Purchasing on store review", err);
    }
  }
  await writeAuditEntry(ctx, "Purchase Request Stock Checked",
    `สโตร์เช็คของใบขอซื้อ ${id} — มีของ ${lines.filter((l) => l.storeDecision === "stock").length} รายการ ต้องซื้อ ${toBuy} รายการ`,
    { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ purchaseRequest: toClient(updated), stockByProduct: await stockByProductFor(updated.lines ?? []) });
}

/**
 * สโตร์จ่ายของหนึ่งรอบตามใบขอซื้อ (2026-09-09) — เจ้าของเลือกให้ "ตัดจบ" บนใบขอซื้อเลย
 *
 * โครงเดียวกับ `handlePostIssueBatch()` ของใบเบิกทุกประการ: ต่อท้ายรอบ ตัดสต๊อกตามจำนวนของรอบนั้น
 * เช็คยอดทั้งรอบก่อนเขียนแม้แต่แถวเดียว (ไม่งั้นบรรทัดท้าย ๆ ที่ของไม่พอจะทิ้งบรรทัดต้น ๆ ที่ตัดไปแล้วค้าง)
 * บรรทัดที่ยังไม่มีรหัสสินค้าจ่ายไม่ได้ — ต้องกด "ขอรหัสสินค้า" ให้สโตร์ตั้งรหัสก่อน
 */
async function handleStoreIssue(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const doc = await loadOrThrow(id);
  assertFinalForStore(doc, "จ่ายของ");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  const lineById = new Map((doc.lines ?? []).map((l) => [l.id, l]));
  const previous = storeIssueBatchesOf({ storeIssues: doc.storeIssues } as never);

  const qtyByLineId = new Map<string, number>();
  for (const r of rows) {
    const lineId = typeof r.lineId === "string" ? r.lineId : "";
    const qty = typeof r.qty === "number" ? r.qty : NaN;
    if (!lineId || !Number.isFinite(qty) || qty <= 0) continue;
    const line = lineById.get(lineId);
    if (!line) throw new HttpError(400, "ไม่พบรายการที่ระบุในใบขอซื้อ");
    if (!line.productId) throw new HttpError(400, `${line.description}: ยังไม่มีรหัสสินค้าในคลัง จ่ายของไม่ได้ — กด "ขอรหัสสินค้า" ให้สโตร์ตั้งรหัสก่อน`);
    const already = previous.flatMap((b) => b.lines).filter((l) => l.lineId === lineId).reduce((sum, l) => sum + l.qty, 0);
    const outstanding = (line.qtyRequested ?? 0) - already;
    if (qty > outstanding) {
      throw new HttpError(400, `จ่าย ${line.description} ${qty} เกินที่ขอไว้ ${Math.max(0, outstanding)} ${line.unit}`);
    }
    qtyByLineId.set(lineId, qty);
  }
  if (qtyByLineId.size === 0) throw new HttpError(400, "กรุณาระบุจำนวนที่จ่ายอย่างน้อยหนึ่งรายการ");

  // รวมจำนวนต่อสินค้า — สองบรรทัดของสินค้าตัวเดียวกันต้องเช็คกับยอดคงเหลือก้อนเดียว
  const totals = new Map<string, number>();
  for (const [lineId, qty] of qtyByLineId) {
    const productId = lineById.get(lineId)?.productId ?? "";
    totals.set(productId, (totals.get(productId) ?? 0) + qty);
  }
  await assertProductsHaveStock(totals);

  const seq = previous.length > 0 ? Math.max(...previous.map((b) => b.seq)) + 1 : 1;
  const stockMovementIds: string[] = [];
  for (const [productId, qty] of totals) {
    const { movement } = await applyStockMovement({
      productId, kind: "deduct", delta: -qty,
      reason: `จ่ายของตามใบขอซื้อ ${id} (รอบที่ ${seq})`,
      sourceType: "purchase_request", sourceId: id, sourceLabel: id,
      userId: ctx.user.id,
    });
    stockMovementIds.push(movement.id);
  }

  const now = nowIso();
  const batch: PurchaseRequestIssueBatch = {
    id: newId("prissue"),
    seq,
    issuedDate: validateIsoDateOrEmpty(body.issuedDate, "วันที่จ่ายของ") || now.slice(0, 10),
    lines: [...qtyByLineId].map(([lineId, qty]) => ({ lineId, qty })),
    issuedBy: sanitizeShortText(body.issuedBy, "ผู้จ่ายของ") || ctx.user.fullName,
    remark: sanitizeLongText(body.remark, "หมายเหตุการจ่ายของ"),
    postedAt: now, postedBy: ctx.user.id, postedByName: ctx.user.fullName,
    stockMovementIds,
  };
  const issues = [...previous, batch];
  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.updateOne({ _id: id }, {
    $set: {
      storeIssues: issues,
      storeStage: nextStoreStage(doc.lines ?? [], issues),
      updatedAt: now, updatedBy: ctx.user.id,
    },
  });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Purchase Request Issued From Stock",
    `สโตร์จ่ายของตามใบขอซื้อ ${id} รอบที่ ${seq} (${[...totals].map(([p, q]) => `${p}: -${q}`).join(", ")})`,
    { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ purchaseRequest: toClient(updated), stockByProduct: await stockByProductFor(updated.lines ?? []) });
}

/**
 * ยกเลิกรอบการจ่ายของ**ล่าสุด** — ของทั้งรอบกลับเข้าคลังเป็น `return` ด้วย**ราคาซื้อล่าสุด**
 * ข้อจำกัด "เฉพาะรอบล่าสุด" เหมือนใบรับสินค้าและใบเบิก ด้วยเหตุผลเดียวกัน: ยกเลิกรอบกลาง ๆ แล้วลำดับ
 * ที่เหลือจะอ่านไม่ตรงกับบัญชีเดินสะพัดที่บันทึกไว้ตามลำดับจริง
 */
async function handleCancelStoreIssue(req: ApiRequest, res: ApiResponse, id: string, batchId: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const doc = await loadOrThrow(id);
  assertFinalForStore(doc, "ยกเลิกรอบการจ่าย");

  const previous = storeIssueBatchesOf({ storeIssues: doc.storeIssues } as never);
  const last = previous[previous.length - 1];
  if (!last || last.id !== batchId) throw new HttpError(400, "ยกเลิกได้เฉพาะรอบการจ่ายล่าสุดเท่านั้น");
  const issues = previous.slice(0, -1);

  const lineById = new Map((doc.lines ?? []).map((l) => [l.id, l]));
  const totals = new Map<string, number>();
  for (const l of last.lines) {
    const productId = lineById.get(l.lineId)?.productId ?? "";
    if (!productId) continue;
    totals.set(productId, (totals.get(productId) ?? 0) + l.qty);
  }
  const costs = await productCostBasis([...totals.keys()]);
  for (const [productId, qty] of totals) {
    await applyStockMovement({
      productId, kind: "return", delta: qty,
      reason: `ยกเลิกการจ่ายรอบที่ ${last.seq} ของใบขอซื้อ ${id} (ของกลับเข้าคลัง)`,
      sourceType: "purchase_request", sourceId: id, sourceLabel: id,
      userId: ctx.user.id, rowUnitCost: returnUnitCostOf(costs[productId]),
    });
  }

  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.updateOne({ _id: id }, {
    $set: {
      storeIssues: issues,
      storeStage: nextStoreStage(doc.lines ?? [], issues),
      updatedAt: nowIso(), updatedBy: ctx.user.id,
    },
  });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Purchase Request Issue Reversed",
    `ยกเลิกการจ่ายรอบที่ ${last.seq} ของใบขอซื้อ ${id} (${[...totals].map(([p, q]) => `${p}: +${q}`).join(", ")})`,
    { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ purchaseRequest: toClient(updated), stockByProduct: await stockByProductFor(updated.lines ?? []) });
}

async function handlePrint(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseRequest:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Purchase Request Printed", `พิมพ์ใบขอซื้อ ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

/** ตัวนับเลขฉบับแก้ไขต่อสายเอกสาร — idiom เดียวกับ Scope of Work / ใบสั่งผลิต / ใบเบิก */
async function nextPurchaseRequestRevision(counters: Collection<CounterFields>, root: string): Promise<number> {
  const result = await counters.findOneAndUpdate(
    { _id: `purchase_request_revision_${root}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return result?.seq ?? 1;
}

/**
 * Rewrite ใบขอซื้อ (2026-08-27) — `_id` คือเลขที่เอกสาร จึงต่อท้ายด้วย `-R{n}`
 *
 * ⚠️ ต้องย้ายลิงก์ `ProjectItem` มาชี้ฉบับใหม่ ไม่งั้นหน้าโครงการจะยังชี้ฉบับเก่าตลอดไป
 * ใบของฝ่ายผลิตไม่มี `projectId` จึงข้ามขั้นตอนนี้ไปเอง
 *
 * **รายการและราคาประเมินสืบทอดมาทั้งหมด** ต่างจากใบเบิกที่ล้างยอดเบิก/ยอดคืนทิ้ง — เพราะใบขอซื้อ
 * ฉบับแก้ไขมักเป็นการแก้ผู้ขาย/เงื่อนไข/จำนวน ไม่ใช่การเริ่มขอซื้อใหม่ตั้งแต่ต้น ส่วนช่องเซ็นและ
 * สถานะถูกล้างเหมือนกันทุกใบ
 */
async function handleRewrite(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseRequest:create");
  const source = await loadOrThrow(id);
  // ด่านรายเอกสารเหมือนทุก route ที่แก้ข้อมูลในโมดูลนี้ — `:create` อย่างเดียวไม่พอ ไม่งั้นใครก็ตามที่
  // สร้างใบขอซื้อได้จะแตกฉบับแก้ไขจากใบของคนอื่น (และย้ายลิงก์ ProjectItem ตามไปด้วย) ได้
  if (!canEdit(ctx, source)) throw new HttpError(403, "Forbidden");

  const [purchaseRequests, counters] = await Promise.all([purchaseRequestsCollection(), countersCollection()]);
  const root = getRevisionRoot(source._id);
  const now = nowIso();

  let created: (PurchaseRequestFields & { _id: string }) | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const seq = await nextPurchaseRequestRevision(counters, root);
    const { _id: _drop, ...rest } = source;
    const doc: PurchaseRequestFields & { _id: string } = {
      ...rest,
      _id: `${root}-R${seq}`,
      status: "Draft",
      requestedBy: ctx.user.fullName, requestedAt: now.slice(0, 10),
      approvedBy: "", approvedAt: "",
      purchasingDeptBy: "", purchasingDeptAt: "",
      approvedByUserId: "",
      rejectionComment: "",
      revisionNote: "",
      // ไฟล์แนบไม่สืบทอด — สำเนาจะชี้ไฟล์ก้อนเดียวกันแล้วลบทีเดียวพังทั้งสองฉบับ (เหมือนใบสั่งงาน)
      attachments: [],
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
    };
    try {
      await purchaseRequests.insertOne(doc);
      created = doc;
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: number }).code === 11000) { lastErr = err; continue; }
      throw err;
    }
  }
  if (!created) {
    console.error("[purchase-requests] exhausted retries reserving a unique revision number", lastErr);
    throw new HttpError(409, "ไม่สามารถสร้างเลขที่ฉบับแก้ไขที่ไม่ซ้ำกันได้ กรุณาลองใหม่อีกครั้ง");
  }

  if (source.projectId) {
    const itemIds = await findProjectItemIdsByLink(source.projectId, "purchaseRequestId", source._id);
    if (itemIds.length > 0) await linkProjectItemsToSubDocument(source.projectId, itemIds, "purchaseRequest", "purchaseRequestId", created._id);
  }

  await writeAuditEntry(ctx, "Purchase Request Rewritten", `สร้างใบขอซื้อฉบับแก้ไข ${created._id} จาก ${source._id}`, { scopeOfWorkId: source.scopeOfWorkId });
  res.status(201).json({ purchaseRequest: toClient(created) });
}

async function handleDelete(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseRequest:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "purchaseRequest:finalize")) throw new HttpError(403, "Forbidden");

  const purchaseRequests = await purchaseRequestsCollection();
  await purchaseRequests.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const itemIds = doc.projectId ? await findProjectItemIdsByLink(doc.projectId, "purchaseRequestId", id) : [];
  if (itemIds.length > 0) await unlinkProjectItems(doc.projectId, itemIds, "purchaseRequestId");
  await writeAuditEntry(ctx, "Purchase Request Deleted", `ลบใบขอซื้อ ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleOne(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

/** ไฟล์แนบของใบขอซื้อ — ใช้ระบบกลางตัวเดียวกับใบสั่งงาน (เจ้าของสั่ง 2026-09-02) */
const attachmentConfig: AttachmentConfig<PurchaseRequestFields & { _id: string }> = {
  label: "ใบขอซื้อ",
  docType: "purchase-requests",
  load: loadOrThrow,
  canEdit,
  collection: async () => (await purchaseRequestsCollection()) as unknown as Collection<never>,
  idOf: (doc) => doc._id,
  currentAttachments: (doc) => (doc.attachments ?? []) as DocumentAttachment[],
  writeAudit: (ctx, action, detail, doc) => writeAuditEntry(ctx, action, detail, { scopeOfWorkId: doc.scopeOfWorkId }),
  respond: async (res, id) => { res.status(200).json({ purchaseRequest: toClient(await loadOrThrow(id)) }); },
};

export async function handlePurchaseRequest(req: ApiRequest, res: ApiResponse): Promise<void> {
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
  // ขั้นสโตร์ (2026-09-09) — เช็คของ / จ่ายของ / ยกเลิกรอบล่าสุด
  if (parts.length === 2 && parts[1] === "store-review") return handleStoreReview(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "store-issues") return handleStoreIssue(req, res, parts[0]);
  if (parts.length === 3 && parts[1] === "store-issues") return handleCancelStoreIssue(req, res, parts[0], parts[2]);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "rewrite") return handleRewrite(req, res, parts[0]);
  // ไฟล์แนบ — ตัวดาวน์โหลดตั้งใจให้เปิดได้โดยไม่ต้องล็อกอิน คุมด้วย capability key ใน URL แทน
  // ดู api/_lib/documentAttachments.ts — route นี้จึงต้องมาก่อนด่าน requireUser ของ handler อื่น
  if (parts.length === 4 && parts[1] === "attachments" && parts[3] === "download") {
    return handleAttachmentDownload(req, res, "purchase-requests", parts[0], parts[2]);
  }
  if (parts.length === 2 && parts[1] === "attachments") return handleAttachmentUpload(req, res, parts[0], attachmentConfig);
  if (parts.length === 3 && parts[1] === "attachments") return handleAttachmentDelete(req, res, parts[0], parts[2], attachmentConfig);
  throw new HttpError(404, "Not found");
}
