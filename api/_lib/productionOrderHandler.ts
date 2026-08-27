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
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { getRevisionRoot } from "../../src/lib/revisionDiff.js";
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

/**
 * เลขที่ที่พิมพ์บนฟอร์ม (`documentNumber`) แก้เองได้ ต่างจาก `_id` ที่แก้ไม่ได้ — ลอกสูตรของ Scope of
 * Work มาทั้งชุด (sanitize ไม่ให้ว่าง + pre-check ที่ให้ข้อความไทยสวย ๆ + unique index กัน race)
 * เอกสารที่ลบแบบ soft-delete ยังกันเลขไว้ เหมือน Scope of Work ด้วยเหตุผลเดียวกัน (audit trail กำกวม)
 */
function sanitizeProductionOrderNumber(raw: unknown): string {
  return sanitizeShortText(raw, "เลขที่ใบสั่งผลิต", true);
}

async function assertProductionOrderNumberAvailable(
  productionOrders: Awaited<ReturnType<typeof productionOrdersCollection>>,
  documentNumber: string,
  excludeId: string,
): Promise<void> {
  const clash = await productionOrders.findOne(
    { documentNumber, _id: { $ne: excludeId } },
    { projection: { _id: 1 } },
  );
  if (clash) throw new HttpError(409, `เลขที่ใบสั่งผลิต "${documentNumber}" ถูกใช้กับใบอื่นแล้ว กรุณาใช้เลขอื่น`);
}

/** `ensureIndexes()` รันเฉพาะตอน Setup Wizard ครั้งแรก ซึ่งเข้าไม่ถึงแล้วบนระบบที่ติดตั้งไปนานแล้ว —
 *  กันเหนียวแบบเดียวกับ `ensureScopeNumberIndexes()` โดยสร้างครั้งเดียวต่ออายุ instance */
let productionOrderNumberIndexEnsured = false;
async function ensureProductionOrderNumberIndex(
  productionOrders: Awaited<ReturnType<typeof productionOrdersCollection>>,
): Promise<void> {
  if (productionOrderNumberIndexEnsured) return;
  try {
    // เอกสารที่สร้างก่อนฟีเจอร์นี้ยังไม่มีฟิลด์เลย ถ้าปล่อยไว้ทุกใบจะเป็น null เหมือนกันหมด แล้ว unique
    // index จะสร้างไม่ผ่าน (E11000) — เติมให้เท่ากับ _id ก่อน ซึ่งตรงกับค่าที่ toClient() แสดงอยู่แล้ว
    await productionOrders.updateMany(
      { $or: [{ documentNumber: { $exists: false } }, { documentNumber: "" }] },
      [{ $set: { documentNumber: "$_id" } }],
    );
    await productionOrders.createIndex({ documentNumber: 1 }, { unique: true });
  } catch (err) {
    // น่าจะมีข้อมูลซ้ำอยู่ก่อน — pre-check ด้านบนยังจับเคสปกติได้ อย่าให้การสร้าง index ล้มไปบล็อกทุกการสร้างเอกสาร
    console.error("[production-orders] failed to ensure unique documentNumber index", err);
  }
  productionOrderNumberIndexEnsured = true;
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

/**
 * แปลงรายการของ Scope of Work มาเป็นรายการในใบสั่งผลิต (ฝ่ายผลิตขอไว้ 2026-08-27:
 * "ใบสั่งผลิตดึงข้อมูลสินค้าและรายละเอียดเอาไปใช้")
 *
 * ทิศทางตรงข้ามกับ `mapLineToScopeItem()` ใน scopeOfWorkHandler.ts — สเปกของงาน (ScopeOfWorkSpecLine[])
 * กลายเป็นบรรทัดย่อย (subDetails) ซึ่งเป็นสิ่งเดียวกันในเชิงความหมาย แค่คนละโครงสร้าง
 *
 * เป็น **สำเนา ณ เวลาที่ดึง** ไม่ใช่การอ้างอิงสด — ตรงกับที่ทุกโมดูลในแอปนี้ทำกับ Scope of Work
 * (ใบส่งมอบ/โครงการ) ผู้ใช้แก้รายการในใบสั่งผลิตต่อได้อิสระโดยไม่กระทบงานต้นทาง
 */
function mapScopeItemsToLines(items: unknown, onlyIds?: string[]): ProductionOrderLine[] {
  if (!Array.isArray(items)) return [];
  // onlyIds = รายการที่ผู้ใช้ติ๊กเลือกไว้ (ฝ่ายผลิตขอไว้ 2026-08-27 "อยากให้พวกนี้มันติ๊กเลือกได้
  // เพราะแต่ละอันไม่เหมือนกัน") — ไม่ระบุ = เอาทั้งหมดเหมือนเดิม
  const wanted = onlyIds && onlyIds.length > 0 ? new Set(onlyIds) : null;
  const source = wanted
    ? (items as Record<string, unknown>[]).filter((it) => typeof it.id === "string" && wanted.has(it.id))
    : (items as Record<string, unknown>[]);
  return source.slice(0, MAX_LINES).map((it) => {
    const isSectionHeader = it.isSectionHeader === true;
    const specs = Array.isArray(it.specifications) ? (it.specifications as Record<string, unknown>[]) : [];
    return {
      id: newId("poline"),
      isSectionHeader,
      description: typeof it.name === "string" ? it.name : "",
      subDetails: specs.map((sp) => (typeof sp.text === "string" ? sp.text.trim() : "")).filter(Boolean),
      qty: isSectionHeader ? null : (typeof it.quantity === "number" ? it.quantity : null),
      unit: isSectionHeader ? "" : (typeof it.unit === "string" ? it.unit : ""),
      remark: typeof it.remark === "string" ? it.remark : "",
    };
  });
}

function toClient(doc: ProductionOrderFields & { _id: string }) {
  // เอกสารที่สร้างก่อน 2026-08-27 ไม่มี documentNumber — ถือว่าเลขที่พิมพ์เท่ากับ _id เหมือนเดิม
  return withStringId(withApprovalDefaults({ ...doc, documentNumber: doc.documentNumber || doc._id, revisionNote: doc.revisionNote ?? "" }));
}
function toSummary(doc: ProductionOrderFields & { _id: string }): ProductionOrderSummary {
  const full = withStringId(doc);
  return {
    id: full.id, documentNumber: full.documentNumber || full.id,
    scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode,
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
  /**
   * รายการที่ติ๊กเลือกไว้ — ไม่ส่งมาเลย = เอาทุกรายการ (พฤติกรรมเดิม ผู้เรียกเก่าจึงไม่พัง)
   * หนึ่งงานออกใบสั่งผลิตได้หลายใบ ใบละสินค้า จึงต้องเลือกได้ว่าใบนี้ครอบคลุมรายการไหนบ้าง
   */
  const itemIds = [...new Set(
    Array.isArray(body.itemIds)
      ? (body.itemIds as unknown[]).filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
      : [],
  )];

  const scopeOfWorks = await scopeOfWorksCollection();
  const scope = await scopeOfWorks.findOne({ _id: toObjectId(scopeOfWorkId) });
  if (!scope || scope.isDeleted) throw new HttpError(404, "ไม่พบ Scope of Work");
  // ไม่มีด่าน status ที่นี่: ฝ่ายผลิตขอไว้ในการประชุม 2026-08-27 ว่า "ใบสั่งผลิตกับใบเบิกไม่ต้องรอ Final ก็สร้างได้"
  // (เจ้าของยืนยันให้ปลดทั้งสองชั้น) เดิมบังคับ Final ตั้งแต่ 2026-08-20 ด้วยเหตุผลว่างานที่ยังแก้ได้อาจเปลี่ยน
  // รายการทีหลัง — ความเสี่ยงนั้นยังอยู่จริง แต่เป็นการแลกที่ฝ่ายผลิตยอมรับเพื่อให้เริ่มงานได้ก่อนอนุมัติ
  // ด่านของ "สร้างโครงการ" (projectHandler.ts) ไม่เกี่ยวและยังคงบังคับ Final อยู่เหมือนเดิม

  const counters = await countersCollection();
  const id = await nextProductionOrderId(counters);
  const now = nowIso();
  const blank: ProductionOrderSignatory = { name: "", date: "" };
  const doc: ProductionOrderFields & { _id: string } = {
    _id: id,
    // เลขที่ที่พิมพ์บนฟอร์ม เริ่มต้นเท่ากับเลขที่ระบบรันให้ แล้วผู้ใช้แก้ทีหลังได้ตอนเป็นร่าง
    documentNumber: id,
    scopeOfWorkId,
    jobCode: scope.scopeNumber,
    customerCompanyName: scope.customerSnapshot.companyName,
    productName: "",
    supervisorName: "",
    startDate: "",
    dueDate: "",
    // ดึงรายการ+สเปกจากงานต้นทางมาให้เลย ผู้ใช้ลบ/แก้ต่อได้ (ก่อน 2026-08-27 เริ่มจากตารางว่าง)
    lines: mapScopeItemsToLines(scope.items, itemIds),
    status: "Draft",
    orderedBy: { name: ctx.user.fullName, date: now.slice(0, 10) },
    approver: { ...blank },
    deliveredBy: { ...blank },
    receivedBy: { ...blank },
    costDeptBy: { ...blank },
    approvedByUserId: "",
    rejectionComment: "",
    revisionNote: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  const productionOrders = await productionOrdersCollection();
  await ensureProductionOrderNumberIndex(productionOrders);
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
  if (body.documentNumber !== undefined) {
    const documentNumber = sanitizeProductionOrderNumber(body.documentNumber);
    if (documentNumber !== (doc.documentNumber || doc._id)) {
      await ensureProductionOrderNumberIndex(await productionOrdersCollection());
      await assertProductionOrderNumberAvailable(await productionOrdersCollection(), documentNumber, id);
    }
    set.documentNumber = documentNumber;
  }
  if (body.revisionNote !== undefined) set.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
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

/**
 * ดึงรายการจาก Scope of Work ใหม่ — **แทนที่ `lines` ทั้งชุด** ตามเจตนาของปุ่ม
 * ("อัปเดตข้อมูลจาก Scope of Work" แบบเดียวกับที่ใบส่งมอบและโครงการมี)
 *
 * ล็อกที่ Draft เหมือน `handleUpdate()` เพราะมันเขียนทับเนื้อหาเอกสาร ไม่ใช่ข้อมูลติดตามผล
 * เขียน audit เพราะเป็นการทำลายงานที่พิมพ์ไว้เอง ผู้ใช้ควรตามรอยได้ว่าใครกดเมื่อไหร่
 */
/**
 * หา id ของรายการใน Scope of Work ที่ตรงกับรายการที่เอกสารนี้มีอยู่ — จับคู่ด้วย **ชื่อรายการ**
 * เพราะใบสั่งผลิตไม่ได้เก็บ id ของ ScopeOfWorkItem ไว้ (และ id พวกนั้นถูกสร้างใหม่ทุกครั้งที่ Scope
 * refresh จากใบเสนอราคา จึงเก็บไว้ก็ไม่น่าเชื่อถืออยู่ดี — ดู TODO.md เรื่อง ScopeOfWorkItem id stability)
 *
 * คืนลิสต์ว่างเมื่อจับคู่ไม่ได้เลย ซึ่ง mapScopeItemsToLines() ตีความว่า "เอาทั้งหมด" — เป็นพฤติกรรม
 * ที่ตั้งใจ: ถ้าเอกสารยังว่างอยู่ การกดอัปเดตควรดึงมาให้ทั้งหมด ไม่ใช่ได้ตารางเปล่ากลับมา
 */
function matchingScopeItemIds(scopeItems: unknown, lines: ProductionOrderLine[]): string[] {
  if (!Array.isArray(scopeItems)) return [];
  const names = new Set(lines.filter((l) => !l.isSectionHeader).map((l) => l.description.trim()).filter(Boolean));
  if (names.size === 0) return [];
  return (scopeItems as Record<string, unknown>[])
    .filter((it) => typeof it.name === "string" && names.has(it.name.trim()))
    .map((it) => (typeof it.id === "string" ? it.id : ""))
    .filter(Boolean);
}

async function handleRefreshFromScope(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productionOrder:edit");
  if (!roleHasPermission(ctx.role, "scopeOfWork:view")) throw new HttpError(403, "Forbidden");
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, "ดึงข้อมูลใหม่ได้เฉพาะเอกสารฉบับร่างเท่านั้น");

  const scopeOfWorks = await scopeOfWorksCollection();
  const scope = await scopeOfWorks.findOne({ _id: toObjectId(doc.scopeOfWorkId) });
  if (!scope || scope.isDeleted) throw new HttpError(404, "ไม่พบ Scope of Work");

  const productionOrders = await productionOrdersCollection();
  await productionOrders.updateOne({ _id: id }, {
    $set: {
      // เคารพรายการที่ใบนี้ครอบคลุมอยู่ — เทียบจากชื่อรายการที่มีอยู่ในเอกสาร ไม่งั้นการกดอัปเดต
      // ครั้งเดียวจะดึงรายการที่ผู้ใช้ตั้งใจไม่เอากลับเข้ามาทั้งหมด
      lines: mapScopeItemsToLines(scope.items, matchingScopeItemIds(scope.items, doc.lines)),
      jobCode: scope.scopeNumber,
      customerCompanyName: scope.customerSnapshot.companyName,
      updatedAt: nowIso(), updatedBy: ctx.user.id,
    },
  });
  await writeAuditEntry(ctx, "Production Order Refreshed", `ดึงข้อมูลใบสั่งผลิต ${id} จากงาน ${scope.scopeNumber} ใหม่`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ productionOrder: toClient(await loadOrThrow(id)) });
}

/** ตัวนับเลขฉบับแก้ไขต่อสายเอกสาร — idiom เดียวกับ nextScopeRevisionNumber() ของ Scope of Work */
async function nextProductionOrderRevision(counters: Collection<CounterFields>, root: string): Promise<number> {
  const result = await counters.findOneAndUpdate(
    { _id: `production_order_revision_${root}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return result?.seq ?? 1;
}

/**
 * Rewrite — สร้างฉบับแก้ไขใหม่จากใบที่อนุมัติแล้ว (ฝ่ายผลิตขอไว้ 2026-08-27: "เพิ่ม Rewrite")
 *
 * `_id` ของเอกสารนี้คือเลขที่เอกสาร จึงต่อท้ายด้วย `-R{n}` เหมือนใบเสนอราคาทำกับ `_id` ของตัวเอง
 * ส่วน `documentNumber` (เลขที่ที่พิมพ์บนฟอร์ม ซึ่งผู้ใช้อาจแก้ไปแล้ว) ต่อท้ายด้วย `-R{n}` เดียวกัน
 * โดยคิดจากรากของตัวมันเอง ไม่ใช่ของ `_id` — สองค่านี้จึงแยกจากกันได้อย่างอิสระตามที่ตั้งใจไว้แต่แรก
 *
 * ช่องเซ็นทุกช่องถูกล้าง และ `revisionNote` **ไม่สืบทอด** มาจากฉบับก่อน (ตรงกับ Scope of Work)
 */
async function handleRewrite(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productionOrder:create");
  const source = await loadOrThrow(id);
  // ด่านรายเอกสารเหมือน handleUpdate/handleDelete/handleRefreshFromScope — `:create` อย่างเดียวไม่พอ
  if (!canEdit(ctx, source)) throw new HttpError(403, "Forbidden");

  const [productionOrders, counters] = await Promise.all([productionOrdersCollection(), countersCollection()]);
  await ensureProductionOrderNumberIndex(productionOrders);

  const idRoot = getRevisionRoot(source._id);
  const numberRoot = getRevisionRoot(source.documentNumber || source._id);
  const now = nowIso();
  const blank: ProductionOrderSignatory = { name: "", date: "" };

  let created: (ProductionOrderFields & { _id: string }) | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const seq = await nextProductionOrderRevision(counters, idRoot);
    const { _id: _drop, ...rest } = source;
    const doc: ProductionOrderFields & { _id: string } = {
      ...rest,
      _id: `${idRoot}-R${seq}`,
      documentNumber: `${numberRoot}-R${seq}`,
      lines: source.lines.map((l) => ({ ...l, id: newId("poline"), subDetails: [...l.subDetails] })),
      status: "Draft",
      orderedBy: { name: ctx.user.fullName, date: now.slice(0, 10) },
      approver: { ...blank },
      deliveredBy: { ...blank },
      receivedBy: { ...blank },
      costDeptBy: { ...blank },
      approvedByUserId: "",
      rejectionComment: "",
      revisionNote: "",
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
    };
    try {
      await productionOrders.insertOne(doc);
      created = doc;
    } catch (err) {
      // ชนเลขที่จองไว้ — แทบเป็นไปไม่ได้เพราะ seq จองแบบ atomic แต่กันไว้แบบมีขอบเขต
      // เหมือน handleRewrite ของ Scope of Work และใบเสนอราคา แทนที่จะโยน 500 ดิบ ๆ
      if (err && typeof err === "object" && (err as { code?: number }).code === 11000) { lastErr = err; continue; }
      throw err;
    }
  }
  if (!created) {
    console.error("[production-orders] exhausted retries reserving a unique revision number", lastErr);
    throw new HttpError(409, "ไม่สามารถสร้างเลขที่ฉบับแก้ไขที่ไม่ซ้ำกันได้ กรุณาลองใหม่อีกครั้ง");
  }

  await writeAuditEntry(ctx, "Production Order Rewritten", `สร้างใบสั่งผลิตฉบับแก้ไข ${created._id} จาก ${source._id}`, { scopeOfWorkId: source.scopeOfWorkId });
  res.status(201).json({ productionOrder: toClient(created) });
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
  if (parts.length === 2 && parts[1] === "refresh") return handleRefreshFromScope(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "rewrite") return handleRewrite(req, res, parts[0]);
  // finalize เป็น alias ของ approve — พฤติกรรมเปลี่ยนโดยตั้งใจ: ต้องผ่าน PendingApproval ก่อนเสมอ
  if (parts.length === 2 && (parts[1] === "approve" || parts[1] === "finalize")) return handleApprove(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "submit-approval") return handleSubmitApproval(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "reject") return handleReject(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "withdraw-approval") return handleWithdrawApproval(req, res, parts[0], approvalConfig);
  throw new HttpError(404, "Not found");
}
