import type { VercelRequest, VercelResponse } from "@vercel/node";
import { nextMonthlyDocumentNumber } from "./documentNumbering.js";
import type { Collection, Filter } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  materialRequisitionsCollection, productionOrdersCollection, jobOrdersCollection, productsCollection, countersCollection, auditLogCollection,
  departmentsCollection, teamsCollection, codeEntriesCollection,
  toObjectId, withStringId, type MaterialRequisitionFields, type CounterFields,
} from "./collections.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { loadPendingProjectItemsOrThrow, linkProjectItemsToSubDocument, markProjectItemsFulfilled, unlinkProjectItems, findProjectItemIdsByLink } from "./projectHandler.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, validateIsoDateOrEmpty, sanitizeLongText } from "./quoteValidation.js";
import { getRevisionRoot } from "../../src/lib/revisionDiff.js";
import { notifyDepartments, STORE_DEPARTMENT_NAMES } from "./departmentNotify.js";
import { sanitizeNullableNumber, sanitizeEnum } from "./projectValidation.js";
import { ensureMaterialCatalogSeeded } from "./materialCatalogSeedData.js";
import { applyStockMovement, assertProductsHaveStock, type StockMovementOrgTags } from "./stockHandler.js";
import { issuedQtyOf, netHeldQtyOf, requisitionHasOutstanding } from "../../src/lib/materialRequisition.js";
import type { MaterialRequisitionLine, MaterialRequisitionCategory, MaterialRequisitionSummary } from "../../src/lib/materialRequisition.js";

/**
 * Material Requisition API (added 2026-08-18, Stage 3) — mounted from `api/handlers/quotes.ts`
 * alongside Project/Job Order/Purchase Request (same 12/12-slot-sharing constraint, see
 * projectHandler.ts's file header). See src/lib/materialRequisition.ts for the full domain-shape
 * doc comment and the FM-ST-04 PDF-to-field mapping.
 *
 * **2026-09-03 — สต๊อกตัดตอนสโตร์จ่ายของจริง ไม่ใช่ตอนอนุมัติ.** เจ้าของเลือกทางนี้เมื่อถูกถาม
 * (แทนการตัดตาม "เบิกของ" ตอนอนุมัติที่ทำไว้เมื่อ 2026-09-02 ซึ่งทำให้ใบที่ของไม่พออนุมัติไม่ได้เลย):
 *   - อนุมัติ = อนุมัติ ไม่แตะสต๊อก (`approvalConfig` ไม่มี beforeApprove/onApproved ด้านสต๊อกอีก)
 *   - `POST /:id/issue` — สโตร์กรอก "เบิกครั้งที่ 1/2" แล้วสต๊อกถูกตัดตาม**ส่วนต่าง**ต่อสินค้า จ่ายบางส่วนได้
 *     ส่วนที่เหลือคือ "ค้างเบิก" ที่หน้าจอโชว์ต่อบรรทัด และจ่ายเพิ่มในใบเดิมได้เมื่อของมา
 *   - `POST /:id/return` — คืนตามส่วนต่างเหมือนเดิม แต่ห้ามคืนเกินที่จ่ายไปแล้ว และลงบัญชีเป็น kind `return`
 *   - ทุก movement ประทับ แผนก/ทีม/ประเภทงาน จากหัวใบ (`charge*`) — ฐานของทะเบียนเครื่องมือประจำทีม
 */

const MAX_LINES = 100;

/**
 * รวมจำนวนต่อ **รหัสสินค้า** (ไม่ใช่ต่อบรรทัด) — บรรทัดที่ไม่มี `productId` หรือจำนวน ≤ 0 ถูกข้าม
 *
 * เดิม (2026-09-02) ใช้กับช่อง "เบิกของ" ตอนอนุมัติ ตอนนี้ใช้กับ "จ่ายแล้ว" (`issuedQtyOf`) และ "คืนของ"
 * โดยผู้เรียก map ค่าที่ต้องการลง `plannedQty` ก่อน · ชื่อพารามิเตอร์คงไว้เพื่อไม่ให้เทสต์ที่ตรึงกฎ
 * การรวมยอดต้องเขียนใหม่ — กฎนั้นคือจุดที่พลาดแล้วสต๊อกจะเพี้ยนเงียบ ๆ
 *
 * export ไว้ให้เทสต์เรียกได้โดยตรง (idiom เดียวกับ `bangkokBuddhistYyMm()` ใน documentNumbering.ts)
 */
export function deductionsFor(lines: { productId?: string; plannedQty?: number | null }[]): Map<string, number> {
  const byProduct = new Map<string, number>();
  for (const line of lines) {
    const productId = (line.productId ?? "").trim();
    const qty = line.plannedQty ?? 0;
    if (!productId || !Number.isFinite(qty) || qty <= 0) continue;
    byProduct.set(productId, (byProduct.get(productId) ?? 0) + qty);
  }
  return byProduct;
}
/** จำนวนที่จ่ายแล้วต่อสินค้า — ตัวที่ route จ่ายของใช้เทียบก่อน/หลัง */
export function issuedByProduct(lines: { productId?: string; withdrawal1Qty?: number | null; withdrawal2Qty?: number | null }[]): Map<string, number> {
  return deductionsFor(lines.map((l) => ({ productId: l.productId, plannedQty: issuedQtyOf({ withdrawal1Qty: l.withdrawal1Qty ?? null, withdrawal2Qty: l.withdrawal2Qty ?? null }) })));
}
/**
 * ส่วนต่างต่อสินค้าระหว่างสองรอบ — วน **union** ของทั้งสองฝั่ง ไม่ใช่แค่ฝั่ง "หลัง" (บั๊กเดิมของ
 * handleReturn: เคลียร์ช่องเป็นว่างแล้วสินค้านั้นหายไปจากฝั่งหลัง ส่วนต่างจึงไม่เคยถูกย้อน)
 */
export function deltaByProduct(before: Map<string, number>, after: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const productId of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(productId) ?? 0) - (before.get(productId) ?? 0);
    if (delta !== 0) out.set(productId, delta);
  }
  return out;
}
const MATERIAL_CATEGORIES: readonly MaterialRequisitionCategory[] = ["chemical", "consumable", "hardware", "other"];

/** `MR-{YYYYMM}-{NNNN}` — รูปแบบกลางของทุกใบภายใน (documentNumbering.ts) เก็บเป็น `_id` ตรง ๆ
 * ทั้งฝ่ายโครงการและฝ่ายผลิต (ตั้งแต่ 2026-09-03 — ก่อนหน้านั้นฝ่ายผลิตใช้ `{SC}-MR{n}` เป็น `_id`)
 * Deliberately a clean new prefix, not the real Purchase Request example's legacy "ED" scheme
 * (see docs/DATABASE.md "Project module" for why). */
async function nextMaterialRequisitionId(counters: Collection<CounterFields>): Promise<string> {
  return nextMonthlyDocumentNumber(counters, "MR", "material_requisition");
}

/**
 * เลขบนฟอร์มของใบเบิกฝ่ายผลิต — **อิงจากเลขที่ใบสั่งผลิต** ตามคำสั่งเจ้าของ 2026-09-02
 * ("เลขใบเบิกอิงมาจากใบสั่งผลิต") เช่นใบสั่งผลิต `SC-2026-09-001` จะได้ `SC-2026-09-001-MR1`, `-MR2` …
 *
 * 2026-09-03: ย้ายจาก `_id` มาเป็นค่าตั้งต้นของ `documentNumber` (พิมพ์ทับได้) เพราะเจ้าของสั่งให้เลขรัน
 * ของทุกใบเป็น `{PREFIX}-{YYYYMM}-{NNNN}` พร้อมกันกับ "ใบเบิกกรอกเลขเองได้แต่ยังให้รันเลขปกติ" —
 * ทั้งสองคำสั่งอยู่ด้วยกันได้ทางนี้ · ตัวนับแยกต่อใบสั่งผลิต (atomic, upsert) เหมือนเดิม
 */
async function nextProductionFormNumber(
  counters: Collection<CounterFields>,
  /** `_id` ของใบสั่งผลิต — ใช้เป็นกุญแจตัวนับ เพราะเป็นค่าที่แก้ไม่ได้ */
  productionOrderId: string,
  /** เลขที่พิมพ์บนฟอร์ม (`documentNumber`) ซึ่งแก้เองได้ — ใช้เป็นเนื้อของเลขใบเบิก */
  productionOrderNumber: string,
): Promise<string> {
  const counterId = `material_requisition_of_${productionOrderId}`;
  const result = await counters.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
  const seq = result?.seq ?? 1;
  return `${safePrefix(productionOrderNumber) || productionOrderId}-MR${seq}`;
}

/**
 * เลขที่ใบสั่งผลิตที่ผู้ใช้พิมพ์เอง เคยต้องใช้เป็น `_id` ของใบเบิกได้จริง (`_id` โผล่ใน URL ของ route
 * ซึ่งถูกตัดด้วย `/`) ตอนนี้เป็นแค่เลขบนฟอร์ม แต่ยังกรองอักขระชุดเดิมไว้ เพราะเลขบนฟอร์มถูกส่งเป็น
 * query ของ Global Search และพิมพ์ลงกระดาษ — เจอแบบนั้นเมื่อไหร่ให้ถอยไปใช้ `_id` ของใบสั่งผลิตแทน
 */
export function safePrefix(documentNumber: string): string {
  const trimmed = (documentNumber ?? "").trim();
  if (!trimmed) return "";
  return /[/\\\s?#%]/.test(trimmed) ? "" : trimmed;
}

/**
 * `documentNumber` ต้องไม่ซ้ำ แต่ `ensureIndexes()` ใน collections.ts รันแค่ตอน Setup Wizard ครั้งเดียว
 * ฐานข้อมูลที่ติดตั้งไปแล้วจึงไม่มีวันได้ index นี้ — สร้างเองแบบ lazy ครั้งเดียวต่อ instance พร้อม backfill
 * `documentNumber = _id` ให้ใบเก่าก่อน (idiom เดียวกับ `ensurePurchaseOrderNumberIndex()`)
 */
let numberIndexEnsured = false;
async function ensureMaterialRequisitionNumberIndex(col: Collection<MaterialRequisitionFields & { _id: string }>): Promise<void> {
  if (numberIndexEnsured) return;
  numberIndexEnsured = true;
  try {
    await col.updateMany(
      { $or: [{ documentNumber: { $exists: false } }, { documentNumber: "" }] },
      [{ $set: { documentNumber: "$_id" } }],
    );
    await col.createIndex({ documentNumber: 1 }, { unique: true });
  } catch (err) {
    console.error("[materialRequisition] ensure documentNumber index failed", err);
  }
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

// ── แผนก / ทีม / ประเภทงาน ที่ของถูกตัดให้ ────────────────────────────────────────────────────
type ChargeFields = Pick<MaterialRequisitionFields,
  "chargeDepartmentId" | "chargeDepartmentName" | "chargeTeamId" | "chargeTeamName" | "chargeWorkTypeCode" | "chargeWorkTypeName">;

function isObjectIdLike(v: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(v);
}

/**
 * ค่าตั้งต้นตอนสร้างใบ = แผนก/ทีมของคนสร้าง · `User.department` เก็บเป็น**ชื่อ** ไม่ใช่ id (ดู users.ts)
 * จึงต้องหาแถวใน `departments` ด้วยชื่อ ถ้าไม่เจอ (ค่าเก่าอย่าง "Technic" — TODO.md บันทึกไว้) ก็เก็บแค่ชื่อ
 * ส่วน `User.teamId` เป็น id จริง หาชื่อได้ตรง ๆ · ทั้งหมดเป็นแค่ค่าตั้งต้น ผู้ใช้เปลี่ยนได้ตลอด
 */
async function defaultChargeForUser(ctx: AuthContext): Promise<ChargeFields> {
  const out: ChargeFields = {
    chargeDepartmentId: "", chargeDepartmentName: "", chargeTeamId: "", chargeTeamName: "",
    chargeWorkTypeCode: "", chargeWorkTypeName: "",
  };
  const departmentName = (ctx.user.department ?? "").trim();
  if (departmentName) {
    const departments = await departmentsCollection();
    const dept = await departments.findOne({ name: departmentName });
    out.chargeDepartmentName = departmentName;
    if (dept) out.chargeDepartmentId = dept._id.toString();
  }
  const teamId = (ctx.user.teamId ?? "").trim();
  if (teamId && isObjectIdLike(teamId)) {
    const teams = await teamsCollection();
    const team = await teams.findOne({ _id: toObjectId(teamId) });
    if (team) {
      out.chargeTeamId = teamId;
      out.chargeTeamName = team.name;
      if (!out.chargeDepartmentId) {
        out.chargeDepartmentId = team.departmentId;
        const departments = await departmentsCollection();
        const dept = isObjectIdLike(team.departmentId) ? await departments.findOne({ _id: toObjectId(team.departmentId) }) : null;
        if (dept) out.chargeDepartmentName = dept.name;
      }
    }
  }
  return out;
}

/**
 * แผนก/ทีม/ประเภทงานจาก body — รับ **id** ของแผนก/ทีมแล้วหาชื่อให้เอง (ชื่อเป็น snapshot ไม่รับจาก client)
 * ส่วนประเภทงานรับทั้งรหัสและชื่อ เพราะพิมพ์เองได้เมื่อยังไม่มีในทะเบียน — ถ้ามีรหัสในทะเบียนแต่ไม่ส่งชื่อมา
 * เติมชื่อจากทะเบียนให้ · คืนเฉพาะฟิลด์ที่ body พูดถึง เพื่อให้ PATCH บางส่วนไม่ล้างค่าที่เหลือ
 */
async function resolveChargeFromBody(body: Record<string, unknown>): Promise<Partial<ChargeFields>> {
  const out: Partial<ChargeFields> = {};
  if ("chargeDepartmentId" in body) {
    const id = sanitizeShortText(body.chargeDepartmentId, "แผนกที่ตัดของ");
    out.chargeDepartmentId = id;
    out.chargeDepartmentName = "";
    if (id) {
      if (!isObjectIdLike(id)) throw new HttpError(400, "แผนกที่ตัดของไม่ถูกต้อง");
      const dept = await (await departmentsCollection()).findOne({ _id: toObjectId(id) });
      if (!dept) throw new HttpError(400, "ไม่พบแผนกที่ระบุ");
      out.chargeDepartmentName = dept.name;
    }
  }
  if ("chargeTeamId" in body) {
    const id = sanitizeShortText(body.chargeTeamId, "ทีมที่ตัดของ");
    out.chargeTeamId = id;
    out.chargeTeamName = "";
    if (id) {
      if (!isObjectIdLike(id)) throw new HttpError(400, "ทีมที่ตัดของไม่ถูกต้อง");
      const team = await (await teamsCollection()).findOne({ _id: toObjectId(id) });
      if (!team) throw new HttpError(400, "ไม่พบทีมที่ระบุ");
      out.chargeTeamName = team.name;
    }
  }
  if ("chargeWorkTypeCode" in body || "chargeWorkTypeName" in body) {
    const code = sanitizeShortText(body.chargeWorkTypeCode, "รหัสประเภทงาน").toUpperCase();
    let name = sanitizeShortText(body.chargeWorkTypeName, "ประเภทงาน");
    if (code && !name) {
      const entry = await (await codeEntriesCollection()).findOne({ kind: "workType", code, isDeleted: false });
      if (entry) name = entry.name;
    }
    out.chargeWorkTypeCode = code;
    out.chargeWorkTypeName = name;
  }
  return out;
}

function orgTagsOf(doc: MaterialRequisitionFields): StockMovementOrgTags {
  return {
    departmentId: doc.chargeDepartmentId || undefined,
    departmentName: doc.chargeDepartmentName || undefined,
    teamId: doc.chargeTeamId || undefined,
    teamName: doc.chargeTeamName || undefined,
    workTypeCode: doc.chargeWorkTypeCode || undefined,
    workTypeName: doc.chargeWorkTypeName || undefined,
  };
}

/**
 * Every line REQUIRES a real, resolvable `productId` (unlike Purchase Request's optional one) —
 * see MaterialRequisitionLine's own doc comment. `productCode`/`productName`/`unit` are always
 * rebuilt server-side from the resolved Product record, never trusted from client input — same
 * "server-resolved snapshot" integrity rule Quotation Templates' product links already established.
 *
 * `withdrawal1Qty`/`withdrawal2Qty` (จ่ายจริง) และ `returnQty` **ไม่รับจาก PATCH** ตั้งแต่ 2026-09-03 —
 * เป็นของสโตร์ผ่าน `/issue` และ `/return` เท่านั้น ค่าเดิมของบรรทัดเดียวกัน (จับคู่ด้วย `id`) ถูกคงไว้
 * ใบ Draft ยังไม่เคยจ่าย ค่าจึงเป็น null อยู่แล้ว — กฎนี้กันเฉพาะไม่ให้ client ยัดเลขจ่ายเข้ามาก่อนอนุมัติ
 */
async function sanitizeLines(raw: unknown, existing: MaterialRequisitionLine[]): Promise<MaterialRequisitionLine[]> {
  if (raw === undefined) return existing;
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการวัสดุไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  const rows = raw as Record<string, unknown>[];
  const existingById = new Map(existing.map((l) => [l.id, l]));

  const productIds = [...new Set(rows.map((r) => (typeof r.productId === "string" ? r.productId : "")).filter(Boolean))];
  const products = await productsCollection();
  const productDocs = productIds.length > 0 ? await products.find({ _id: { $in: productIds.map((id) => toObjectId(id)) } }).toArray() : [];
  const productById = new Map(productDocs.map((p) => [p._id.toString(), p]));

  return rows.map((r, idx) => {
    const productId = typeof r.productId === "string" ? r.productId : "";
    if (!productId) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: กรุณาระบุสินค้า`);
    const product = productById.get(productId);
    if (!product) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ไม่พบสินค้าที่ระบุ`);
    const id = typeof r.id === "string" && r.id ? r.id : newId("mrline");
    const prev = existingById.get(id);
    return {
      id,
      productId, productCode: product.code, productName: product.name, unit: product.unit,
      category: sanitizeEnum(r.category, MATERIAL_CATEGORIES, `หมวดหมู่ลำดับที่ ${idx + 1}`),
      plannedQty: sanitizeNullableNumber(r.plannedQty, `จำนวนที่วางแผนลำดับที่ ${idx + 1}`),
      withdrawal1Qty: prev?.withdrawal1Qty ?? null,
      withdrawal2Qty: prev?.withdrawal2Qty ?? null,
      returnQty: prev?.returnQty ?? null,
      actualUsedQty: sanitizeNullableNumber(r.actualUsedQty, `ใช้จริงลำดับที่ ${idx + 1}`),
    };
  });
}

function toClient(doc: MaterialRequisitionFields & { _id: string }) {
  // เอกสารก่อน 2026-08-27 ไม่มี revisionNote / ก่อน 2026-09-03 ไม่มี documentNumber+charge* — เติมตอนอ่าน ไม่ได้ทำ migration
  return withStringId(withApprovalDefaults({
    ...doc,
    revisionNote: doc.revisionNote ?? "",
    documentNumber: doc.documentNumber || doc._id,
    chargeDepartmentId: doc.chargeDepartmentId ?? "", chargeDepartmentName: doc.chargeDepartmentName ?? "",
    chargeTeamId: doc.chargeTeamId ?? "", chargeTeamName: doc.chargeTeamName ?? "",
    chargeWorkTypeCode: doc.chargeWorkTypeCode ?? "", chargeWorkTypeName: doc.chargeWorkTypeName ?? "",
  }));
}
function toSummary(doc: MaterialRequisitionFields & { _id: string }): MaterialRequisitionSummary {
  const full = withStringId(doc);
  return {
    id: full.id, documentNumber: full.documentNumber || full.id,
    chargeDepartmentName: full.chargeDepartmentName ?? "", chargeTeamName: full.chargeTeamName ?? "",
    chargeWorkTypeName: full.chargeWorkTypeName ?? "",
    hasOutstanding: requisitionHasOutstanding({ status: full.status, lines: full.lines ?? [] }),
    projectId: full.projectId, scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode,
    // เอกสารก่อน 2026-08-20 ไม่มีฟิลด์นี้ — normalize ตอนอ่าน ไม่ได้ทำ migration
    productionOrderId: full.productionOrderId ?? "",
    status: full.status, updatedAt: full.updatedAt,
  };
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
  /**
   * รายการในโครงการที่ติ๊กเลือกไว้ — รับทั้ง `itemIds` (หลายรายการ) และ `itemId` เดี่ยวของผู้เรียกเก่า
   *
   * เจ้าของสั่ง 2026-09-02: *"แก้ใบเบิกและคืนวัสดุ / ใบขอซื้อ ของโครงการให้เหมือนกับผลิต"* — ฝ่ายผลิต
   * ออกใบเดียวครอบทั้งใบสั่งผลิตอยู่แล้ว ฝั่งโครงการจึงต้องติ๊กหลายรายการแล้วได้ใบเดียวเหมือนกัน
   * (เดิมบังคับหนึ่งใบต่อหนึ่งรายการ) รูปแบบเดียวกับใบสั่งงานที่เปลี่ยนไปแล้วเมื่อ 2026-08-27
   */
  const itemIds = [...new Set(
    Array.isArray(body.itemIds)
      ? (body.itemIds as unknown[]).filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
      : typeof body.itemId === "string" && body.itemId.trim() ? [body.itemId.trim()] : [],
  )];
  const productionOrderId = typeof body.productionOrderId === "string" ? body.productionOrderId.trim() : "";

  /**
   * เอกสารใบนี้ออกได้จาก 2 ต้นทาง (ยืนยันกับเจ้าของ 2026-08-20 ว่าสองแผนกแยกข้อมูลกัน):
   *   - รายการในโครงการ  → ของฝ่ายโครงการ, ผูกกับ ProjectItem และอัปเดตสถานะรายการนั้น
   *   - ใบสั่งผลิต        → ของฝ่ายผลิต, ไม่มีรายการให้ผูก จึงข้าม item-link ทั้งหมด
   */
  const fromProduction = Boolean(productionOrderId);
  if (!fromProduction && (!projectId || itemIds.length === 0)) throw new HttpError(400, "กรุณาระบุโครงการและรายการ หรือใบสั่งผลิต");

  /** `responsibleEmployee` = "ชื่อพนักงานดูแล" บนฟอร์ม — เจ้าของสั่ง 2026-09-02 ว่า "ชื่อพนักงานดูแล
   *  ให้ขึ้นมาเลย" จึงเติมให้ตั้งแต่ตอนสร้าง (แก้ทีหลังได้) ใบของฝ่ายผลิตสืบมาจากใบสั่งผลิตก่อน
   *  เพราะที่นั่นระบุตัวคนดูแลงานไว้จริง ๆ ถ้าใบนั้นยังว่างค่อยถอยมาใช้ชื่อคนสร้างใบเบิก */
  let source: { projectId: string; scopeOfWorkId: string; jobCode: string; customerName: string; productName: string; responsibleEmployee: string };
  let pickedItems: { name: string }[] = [];
  /** เลขที่บนฟอร์มของใบสั่งผลิตต้นทาง — ว่างไว้เมื่อไม่ได้ออกจากใบสั่งผลิต */
  let productionOrderNumber = "";
  let jobOrderLink = { jobOrderId: null as string | null, jobOrderCode: "" };

  if (fromProduction) {
    const productionOrders = await productionOrdersCollection();
    const po = await productionOrders.findOne({ _id: productionOrderId });
    if (!po || po.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งผลิต");
    // ไม่บังคับว่าใบสั่งผลิตต้องอนุมัติก่อน — ฝ่ายผลิตขอไว้ในการประชุม 2026-08-27
    // ("ใบสั่งผลิตกับใบเบิกไม่ต้องรอ Final ก็สร้างได้") เจ้าของยืนยันให้ปลดทั้งชั้นนี้และชั้น Scope of Work → ใบสั่งผลิต
    // เดิมบังคับไว้ตั้งแต่ 2026-08-20 ด้วยเหตุผลว่าใบสั่งผลิตฉบับร่างไม่ควรสั่งเบิกของจริงได้
    if (!roleHasPermission(ctx.role, "productionOrder:view")) throw new HttpError(403, "Forbidden");
    productionOrderNumber = po.documentNumber ?? "";
    source = {
      projectId: "", scopeOfWorkId: po.scopeOfWorkId, jobCode: po.jobCode,
      customerName: po.customerCompanyName, productName: po.productName,
      responsibleEmployee: po.supervisorName?.trim() || ctx.user.fullName,
    };
  } else {
    // Validates the item exists and is still "pending" BEFORE anything is inserted — see
    // loadPendingProjectItemOrThrow()'s own doc comment for why this ordering is what makes the
    // create-then-link sequence below safe without a real multi-document transaction.
    const loaded = await loadPendingProjectItemsOrThrow(projectId, itemIds);
    pickedItems = loaded.items;
    jobOrderLink = await resolveJobOrderLink(projectId, body.jobOrderId);
    source = {
      projectId, scopeOfWorkId: loaded.project.scopeOfWorkId, jobCode: loaded.project.scopeNumber,
      customerName: loaded.project.customerCompanyName,
      // ใบเดียวครอบได้หลายรายการแล้ว ช่อง "ชื่อสินค้า" จึงต่อชื่อทุกรายการที่ติ๊กไว้
      productName: loaded.items.map((it) => it.name).join(", "),
      responsibleEmployee: ctx.user.fullName,
    };
  }

  const materialRequisitions = await materialRequisitionsCollection();
  await ensureMaterialRequisitionNumberIndex(materialRequisitions);
  const counters = await countersCollection();
  const id = await nextMaterialRequisitionId(counters);
  const documentNumber = fromProduction
    ? await nextProductionFormNumber(counters, productionOrderId, productionOrderNumber)
    : id;
  const charge = await defaultChargeForUser(ctx);
  const now = nowIso();
  const doc: MaterialRequisitionFields = {
    documentNumber,
    ...charge,
    projectId: source.projectId, scopeOfWorkId: source.scopeOfWorkId, jobCode: source.jobCode,
    customerName: source.customerName,
    ownerDepartment: fromProduction ? "production" : "project",
    revisionNote: "",
    productionOrderId: fromProduction ? productionOrderId : "",
    jobOrderId: jobOrderLink.jobOrderId, jobOrderCode: jobOrderLink.jobOrderCode,
    productName: source.productName, responsibleEmployee: source.responsibleEmployee, productionStartDate: "",
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
  await materialRequisitions.insertOne({ ...doc, _id: id });

  // CRITICAL invariant: the parent ProjectItem is updated atomically (in the sense described in
  // linkProjectItemToSubDocument()'s doc comment) immediately after the insert succeeds — never
  // trusting any client-sent sourcingMethod/itemStatus/materialRequisitionId value.
  // ฝ่ายผลิตออกจากใบสั่งผลิต ไม่มีรายการในโครงการให้ผูก จึงข้ามขั้นตอนนี้ไป
  if (!fromProduction) {
    await linkProjectItemsToSubDocument(projectId, itemIds, "requisition", "materialRequisitionId", id);
  }

  await writeAuditEntry(
    ctx, "Material Requisition Created",
    fromProduction
      ? `สร้างใบเบิกและใบคืนวัสดุ ${id} (${documentNumber}) จากใบสั่งผลิต ${productionOrderId}`
      : `สร้างใบเบิกและใบคืนวัสดุ ${id} สำหรับรายการ "${pickedItems.map((it) => it.name).join('", "')}"`,
    { scopeOfWorkId: source.scopeOfWorkId },
  );
  res.status(201).json({ materialRequisition: toClient({ ...doc, _id: id }) });
}

/**
 * ยอดคงเหลือปัจจุบันของทุกสินค้าในใบ — ส่งคู่กับเอกสารในคำขอเดียว ให้หน้าจอโชว์ "คงเหลือในสต๊อก" และ
 * "ของไม่พอ ขาด N" ต่อบรรทัดได้ทันที (เจ้าของสั่ง 2026-09-03 *"โชว์ขึ้นว่ายอดไม่พอ … ค้างเบิกอยู่เท่าไหร่"*)
 * โดยไม่ต้องดึงสินค้าทั้งคลังมาหาเอง
 */
async function stockByProductFor(lines: MaterialRequisitionLine[]): Promise<Record<string, number>> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((id) => id && isObjectIdLike(id)))];
  if (ids.length === 0) return {};
  const products = await productsCollection();
  const docs = await products.find({ _id: { $in: ids.map((id) => toObjectId(id)) } }, { projection: { stockQty: 1 } }).toArray();
  return Object.fromEntries(docs.map((p) => [p._id.toString(), p.stockQty ?? 0]));
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "materialRequisition:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({ materialRequisition: toClient(doc), stockByProduct: await stockByProductFor(doc.lines ?? []) });
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
  const materialRequisitions = await materialRequisitionsCollection();
  const update: Partial<MaterialRequisitionFields> = {};
  if ("lines" in body) update.lines = await sanitizeLines(body.lines, doc.lines ?? []);
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  if ("jobOrderId" in body) {
    const link = await resolveJobOrderLink(doc.projectId, body.jobOrderId);
    update.jobOrderId = link.jobOrderId;
    update.jobOrderCode = link.jobOrderCode;
  }
  if ("documentNumber" in body) {
    // เลขบนฟอร์มพิมพ์ทับได้ตอน Draft เท่านั้น ว่างไม่ได้ (ถอยกลับไปเป็น _id) และห้ามซ้ำกับใบอื่น
    const next = sanitizeShortText(body.documentNumber, "เลขที่ใบเบิก") || id;
    if (next !== (doc.documentNumber || id)) {
      await ensureMaterialRequisitionNumberIndex(materialRequisitions);
      const clash = await materialRequisitions.findOne({ documentNumber: next, _id: { $ne: id } });
      if (clash) throw new HttpError(409, `เลขที่ใบเบิก ${next} ถูกใช้แล้ว`);
    }
    update.documentNumber = next;
  }
  Object.assign(update, await resolveChargeFromBody(body));
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  try {
    await materialRequisitions.updateOne({ _id: id }, { $set: update });
  } catch (err) {
    if (err && typeof err === "object" && (err as { code?: number }).code === 11000) throw new HttpError(409, "เลขที่ใบเบิกนี้ถูกใช้แล้ว");
    throw err;
  }
  const updated = await loadOrThrow(id);
  // การบันทึกอัตโนมัติไม่เขียน audit log — ไม่งั้นการพิมพ์งานครั้งเดียวจะสร้างรายการซ้ำนับสิบรายการ
  // An auto-save writes no audit entry (see `isAutoSaveRequest()` in api/_lib/http.ts). The write
  // itself passed the exact same permission, Draft-status and validation checks as a manual Save.
  if (!autoSave) {
    await writeAuditEntry(ctx, "Material Requisition Updated", `แก้ไขใบเบิกและใบคืนวัสดุ ${id}`, { scopeOfWorkId: updated.scopeOfWorkId });
  }
  res.status(200).json({ materialRequisition: toClient(updated) });
}

/** ใบต้องอนุมัติแล้วเท่านั้นถึงจะจ่ายของ/รับคืนได้ — ใบที่ยังไม่อนุมัติไม่มีสิทธิ์เอาของออกจากคลัง */
function assertFinalForStock(doc: MaterialRequisitionFields, action: string): void {
  if (doc.status !== "Final") {
    throw new HttpError(400, `ใบเบิกต้องได้รับอนุมัติก่อนจึงจะ${action}ได้`);
  }
}

/**
 * "จ่ายของ" (สโตร์) — เจ้าของเลือก 2026-09-03: *ตัดตอนสโตร์จ่ายของจริง จ่ายบางส่วนได้*
 *
 * สิทธิ์ `stock:adjust` ไม่ใช่ `canEdit()` — คนจ่ายของคือสโตร์ ซึ่งไม่ใช่เจ้าของใบและอาจไม่มีสิทธิ์แก้ใบ
 * เลย ส่วนเจ้าของใบก็ไม่ควรกรอกเลขจ่ายเองได้ (ไม่งั้นตัวเลขสต๊อกจะขึ้นกับคนขอ ไม่ใช่คนจ่าย)
 *
 * ลำดับ: ตรวจทุกบรรทัด (จ่ายรวม ≤ ขอ, ≥ คืนแล้ว) → คำนวณส่วนต่างต่อสินค้า → เช็คยอดพอสำหรับทุกตัวที่ต้อง
 * ตัดเพิ่ม **ก่อน** เขียนอะไรเลย (กันเขียนครึ่งเดียว) → ตัด/คืนส่วนต่างทีละสินค้า → บันทึกใบ
 * ส่วนต่างติดลบ (สโตร์แก้เลขลง) = ของกลับเข้าคลังเป็น `return` ของสโตร์เอง ไม่ใช่การคืนจากทีม
 */
async function handleIssue(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const doc = await loadOrThrow(id);
  assertFinalForStock(doc, "จ่ายของ");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  const rowById = new Map(rows.map((r) => [typeof r.id === "string" ? r.id : "", r]));
  const lines = doc.lines.map((line) => {
    const r = rowById.get(line.id);
    if (!r) return line;
    const withdrawal1Qty = "withdrawal1Qty" in r ? sanitizeNullableNumber(r.withdrawal1Qty, `เบิกครั้งที่1 (${line.productName})`) : line.withdrawal1Qty;
    const withdrawal2Qty = "withdrawal2Qty" in r ? sanitizeNullableNumber(r.withdrawal2Qty, `เบิกครั้งที่2 (${line.productName})`) : line.withdrawal2Qty;
    if ((withdrawal1Qty ?? 0) < 0 || (withdrawal2Qty ?? 0) < 0) throw new HttpError(400, `จำนวนจ่าย (${line.productName}) ต้องไม่ติดลบ`);
    const issued = issuedQtyOf({ withdrawal1Qty, withdrawal2Qty });
    if (issued > (line.plannedQty ?? 0)) {
      throw new HttpError(400, `จ่าย ${line.productName} รวม ${issued} เกินที่ขอเบิก ${line.plannedQty ?? 0} ${line.unit}`);
    }
    if (issued < (line.returnQty ?? 0)) {
      throw new HttpError(400, `จ่าย ${line.productName} รวม ${issued} น้อยกว่าที่คืนไปแล้ว ${line.returnQty ?? 0} ${line.unit}`);
    }
    return { ...line, withdrawal1Qty, withdrawal2Qty };
  });

  const charge = await resolveChargeFromBody(body);
  const merged: MaterialRequisitionFields = { ...doc, ...charge, lines };
  const delta = deltaByProduct(issuedByProduct(doc.lines), issuedByProduct(lines));
  // เช็คก่อนเขียน: ทุกสินค้าที่ต้องตัดเพิ่มต้องมีพอ — applyStockMovement() ยังมีด่าน $gte ของตัวเองปิดช่องแข่ง
  const needs = new Map<string, number>();
  for (const [productId, d] of delta) if (d > 0) needs.set(productId, d);
  await assertProductsHaveStock(needs);

  const org = orgTagsOf(merged);
  const label = merged.documentNumber || id;
  for (const [productId, d] of delta) {
    await applyStockMovement({
      productId, kind: d > 0 ? "deduct" : "return", delta: -d,
      reason: d > 0 ? `จ่ายของตามใบเบิก ${label}` : `แก้ยอดจ่ายใบเบิก ${label} (ของกลับเข้าคลัง)`,
      sourceType: "material_requisition", sourceId: id, sourceLabel: label,
      userId: ctx.user.id, org,
    });
  }

  const update: Partial<MaterialRequisitionFields> = {
    lines, ...charge,
    updatedAt: nowIso(), updatedBy: ctx.user.id,
  };
  if ("storeDeptBy" in body) update.storeDeptBy = sanitizeShortText(body.storeDeptBy, "แผนกสโตร์");
  if (!doc.storeDeptBy && !update.storeDeptBy) update.storeDeptBy = ctx.user.fullName;
  if (delta.size > 0 || !doc.storeDeptAt) update.storeDeptAt = nowIso().slice(0, 10);

  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(
    ctx, "Material Requisition Issued",
    `สโตร์จ่ายของตามใบเบิก ${label}${delta.size > 0 ? ` (${[...delta].map(([p, d]) => `${p}: ${d > 0 ? "-" : "+"}${Math.abs(d)}`).join(", ")})` : " (ไม่มียอดเปลี่ยน)"}`,
    { scopeOfWorkId: updated.scopeOfWorkId },
  );
  res.status(200).json({ materialRequisition: toClient(updated), stockByProduct: await stockByProductFor(updated.lines ?? []) });
}

/**
 * "คืนของ" — leftover material returned via this same document, after issuance. Exempt from the
 * `status === "Final"` lock `handleUpdate()` enforces above — same "follow-up fields survive Final"
 * pattern Scope of Work's PO-chasing fields established (see docs/MODULES/ScopeOfWork.md
 * "PO Chasing"), since the paper form's own footer has separate returner/receiver-of-return
 * signatures implying the return happens after the document is otherwise done. Only `returnQty` per
 * line, plus the document-level returner/receiver signatures and the charge-to fields, are touched
 * here — every other field stays governed by the regular Draft-only PATCH above.
 *
 * 2026-09-03: ต้องเป็นใบ Final (ก่อนหน้านี้ใบร่างก็บันทึกคืนได้ แค่ไม่แตะสต๊อก — ตอนนี้ของที่ยังไม่เคย
 * ถูกจ่ายไม่มีอะไรให้คืน) · คืนได้ไม่เกินที่จ่ายไปแล้วต่อบรรทัด · ลงบัญชีเป็น kind `return`
 */
async function handleReturn(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc) && !roleHasPermission(ctx.role, "stock:adjust")) throw new HttpError(403, "Forbidden");
  assertFinalForStock(doc, "บันทึกการคืนของ");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const returns = Array.isArray(body.lines) ? (body.lines as Record<string, unknown>[]) : [];
  const returnById = new Map(returns.map((r) => [typeof r.id === "string" ? r.id : "", r]));
  const lines = doc.lines.map((line) => {
    const r = returnById.get(line.id);
    if (!r) return line;
    const returnQty = sanitizeNullableNumber(r.returnQty, `คืนของ (${line.productName})`);
    if ((returnQty ?? 0) < 0) throw new HttpError(400, `คืนของ (${line.productName}) ต้องไม่ติดลบ`);
    const issued = issuedQtyOf(line);
    if ((returnQty ?? 0) > issued) {
      throw new HttpError(400, `คืน ${line.productName} ${returnQty} เกินที่จ่ายไปแล้ว ${issued} ${line.unit}`);
    }
    return { ...line, returnQty };
  });

  const charge = await resolveChargeFromBody(body);
  const update: Partial<MaterialRequisitionFields> = {
    lines, ...charge,
    updatedAt: nowIso(),
    updatedBy: ctx.user.id,
  };
  if ("returnedBy" in body) update.returnedBy = sanitizeShortText(body.returnedBy, "ผู้คืน");
  if ("returnReceivedBy" in body) update.returnReceivedBy = sanitizeShortText(body.returnReceivedBy, "ผู้รับคืน");
  if (update.returnedBy || update.returnReceivedBy) update.returnedAt = nowIso();

  /**
   * ของที่คืนกลับเข้าสต๊อก — รับเข้าตาม **ส่วนต่าง** ของช่อง "คืนของ" ไม่ใช่ค่าเต็ม (route นี้ถูกยิงซ้ำได้
   * ทุกครั้งที่แก้ตัวเลข ถ้ารับเข้าตามค่าเต็ม การกดบันทึกสองรอบจะเพิ่มของสองเท่า) · วน union ของก่อน/หลัง
   * (ดู `deltaByProduct`) · ส่วนต่างติดลบ = แก้เลขคืนลง = ของออกจากคลังอีกครั้ง → เช็คยอดพอก่อนเขียน
   */
  const merged: MaterialRequisitionFields = { ...doc, ...charge, lines };
  const delta = deltaByProduct(
    deductionsFor(doc.lines.map((l) => ({ productId: l.productId, plannedQty: l.returnQty }))),
    deductionsFor(lines.map((l) => ({ productId: l.productId, plannedQty: l.returnQty }))),
  );
  const needs = new Map<string, number>();
  for (const [productId, d] of delta) if (d < 0) needs.set(productId, -d);
  await assertProductsHaveStock(needs);

  const org = orgTagsOf(merged);
  const label = merged.documentNumber || id;
  for (const [productId, d] of delta) {
    await applyStockMovement({
      productId, kind: d > 0 ? "return" : "deduct", delta: d,
      reason: d > 0 ? `คืนวัสดุตามใบเบิก ${label}` : `แก้ยอดคืนใบเบิก ${label} (ของออกจากคลัง)`,
      sourceType: "material_requisition", sourceId: id, sourceLabel: label,
      userId: ctx.user.id, org,
    });
  }

  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Material Requisition Return Recorded", `บันทึกการคืนวัสดุของใบเบิกและใบคืนวัสดุ ${label}`, { scopeOfWorkId: updated.scopeOfWorkId });
  res.status(200).json({ materialRequisition: toClient(updated), stockByProduct: await stockByProductFor(updated.lines ?? []) });
}

/**
 * ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) เพิ่ม 2026-08-20 — ใช้ helper ร่วมใน documentApproval.ts
 * ที่ทำตามกลไกของ Scope of Work ทุกประการ ตามที่เจ้าของสั่ง ("เหมือน Scope of Work เป๊ะ")
 *
 * `finalize` เดิมที่กระโดดจากร่างไป Final ตรงๆ ถูกแทนที่ด้วย `approve` ซึ่งบังคับว่าต้องผ่าน
 * PendingApproval ก่อน — route เดิมยังคงไว้เป็น alias เพื่อไม่ให้ของเดิมที่เรียกอยู่พัง
 *
 * **การอนุมัติไม่แตะสต๊อกอีกแล้ว** (2026-09-03) — ระหว่าง 2026-09-02 ถึง 03 มี `beforeApprove` เช็คยอด
 * และ `onApproved` ตัดตาม "เบิกของ" ซึ่งทำให้ใบที่ของไม่พออนุมัติไม่ได้เลย เจ้าของเลือกให้ตัดตอนสโตร์
 * จ่ายจริงแทน (`handleIssue`) ใบจึงอนุมัติได้เสมอ และหน้าจอบอกว่าตัวไหนขาดเท่าไร
 */
const approvalConfig: ApprovalConfig<MaterialRequisitionFields & { _id: string }> = {
  label: "ใบเบิกและใบคืนวัสดุ",
  approvePermission: "materialRequisition:finalize",
  submitNotification: {
    type: "material_requisition_submitted", module: "ใบเบิกและใบคืนวัสดุ",
    relatedField: "relatedMaterialRequisitionId", context: (doc) => doc.jobCode || "",
  },
  collection: async () => (await materialRequisitionsCollection()) as unknown as Collection<MaterialRequisitionFields & { _id: string }>,
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail, doc) => writeAuditEntry(ctx, action, detail, { scopeOfWorkId: doc.scopeOfWorkId }),
  // อนุมัติแล้วถือว่ารายการใน Project ต้นทางถูกจัดหาเรียบร้อย (เดิมทำตอน finalize)
  onApproved: async (ctx, doc) => {
    const itemIds = doc.projectId ? await findProjectItemIdsByLink(doc.projectId, "materialRequisitionId", doc._id) : [];
    if (itemIds.length > 0) await markProjectItemsFulfilled(doc.projectId, itemIds);

    // ส่งต่อให้สโตร์ (ฝ่ายโครงการขอไว้ 2026-08-27: "เมื่อผู้จัดการอนุมัติเสร็จจะส่งให้ Stores ของใบเบิก")
    // best-effort โดยตั้งใจ — การอนุมัติต้องไม่ล้มเพราะแจ้งเตือนส่งไม่ออก แต่ถ้าไม่มีผู้รับเลยต้องเห็นใน log
    try {
      const label = doc.documentNumber || doc._id;
      const sent = await notifyDepartments(STORE_DEPARTMENT_NAMES, ctx.user.id, {
        type: "material_requisition_approved",
        title: "ใบเบิกวัสดุอนุมัติแล้ว — รอสโตร์จ่ายของ",
        description: `${ctx.user.fullName} อนุมัติใบเบิก ${label} (งาน ${doc.jobCode || "-"})`,
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
 * และ `documentNumber` ของฉบับใหม่ = `{เลขบนฟอร์มเดิม}-R{n}` (ถ้าเลขบนฟอร์มถูกพิมพ์ทับไว้ ก็ยังตามสายเดิม)
 *
 * ⚠️ **ต้องย้ายลิงก์ของ ProjectItem มาชี้ฉบับใหม่ด้วย** ไม่งั้นหน้าโครงการจะยังชี้ฉบับเก่าตลอดไป
 * แล้วผู้ใช้จะกดจากโครงการเข้าไปเจอใบที่เลิกใช้แล้ว — ต่างจากใบสั่งผลิตที่ไม่ผูกกับ ProjectItem เลย
 * ใบของฝ่ายผลิต (`ownerDepartment === "production"`) ไม่มี projectId จึงข้ามขั้นตอนนี้ไปเอง
 *
 * ยอดเบิก/ยอดคืน/ช่องเซ็นไม่สืบทอด — ฉบับใหม่เริ่มต้นเหมือนใบเบิกที่ยังไม่ได้เบิกจริง (ของที่ฉบับเดิม
 * จ่ายไปแล้วยังอยู่ในบัญชีสต๊อกภายใต้ฉบับเดิม ไม่ถูกย้ายหรือย้อน)
 */
async function handleRewrite(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:create");
  const source = await loadOrThrow(id);
  // ด่านรายเอกสารเหมือนทุก route ที่แก้ข้อมูลในโมดูลนี้ — `:create` อย่างเดียวไม่พอ ไม่งั้นใครก็ตามที่
  // สร้างใบเบิกได้จะแตกฉบับแก้ไขจากใบของคนอื่น (และย้ายลิงก์ ProjectItem ตามไปด้วย) ได้
  if (!canEdit(ctx, source)) throw new HttpError(403, "Forbidden");

  const [materialRequisitions, counters] = await Promise.all([materialRequisitionsCollection(), countersCollection()]);
  await ensureMaterialRequisitionNumberIndex(materialRequisitions);
  const root = getRevisionRoot(source._id);
  const formRoot = getRevisionRoot(source.documentNumber || source._id);
  const now = nowIso();

  let created: (MaterialRequisitionFields & { _id: string }) | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const seq = await nextMaterialRequisitionRevision(counters, root);
    const { _id: _drop, ...rest } = source;
    const doc: MaterialRequisitionFields & { _id: string } = {
      ...rest,
      _id: `${root}-R${seq}`,
      documentNumber: `${formRoot}-R${seq}`,
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
    const itemIds = await findProjectItemIdsByLink(source.projectId, "materialRequisitionId", source._id);
    if (itemIds.length > 0) await linkProjectItemsToSubDocument(source.projectId, itemIds, "requisition", "materialRequisitionId", created._id);
  }

  await writeAuditEntry(ctx, "Material Requisition Rewritten", `สร้างใบเบิกฉบับแก้ไข ${created._id} จาก ${source._id}`, { scopeOfWorkId: source.scopeOfWorkId });
  res.status(201).json({ materialRequisition: toClient(created) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "materialRequisition:finalize")) throw new HttpError(403, "Forbidden");
  // ใบที่สโตร์จ่ายของไปแล้วลบไม่ได้ — บัญชีสต๊อกอ้างถึงมันอยู่ ต้องรับคืนให้ครบก่อน
  if ((doc.lines ?? []).some((l) => netHeldQtyOf(l) > 0)) {
    throw new HttpError(400, "ใบเบิกนี้มีของที่จ่ายไปแล้วยังไม่ได้คืนครบ ลบไม่ได้");
  }

  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const itemIds = doc.projectId ? await findProjectItemIdsByLink(doc.projectId, "materialRequisitionId", id) : [];
  if (itemIds.length > 0) await unlinkProjectItems(doc.projectId, itemIds, "materialRequisitionId");
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
  if (parts.length === 2 && parts[1] === "issue") return handleIssue(req, res, parts[0]);
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
