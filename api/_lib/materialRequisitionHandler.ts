import type { ApiRequest, ApiResponse } from "./httpTypes.js";
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
import { loadPendingProjectItemsOrThrow, loadProjectOrThrow, linkProjectItemsToSubDocument, markProjectItemsFulfilled, unlinkProjectItems, findProjectItemIdsByLink } from "./projectHandler.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, validateIsoDateOrEmpty, sanitizeLongText } from "./quoteValidation.js";
import { getRevisionRoot } from "../../src/lib/revisionDiff.js";
import { notifyDepartments, STORE_DEPARTMENT_NAMES } from "./departmentNotify.js";
import { sanitizeNullableNumber, sanitizeEnum } from "./projectValidation.js";
import { ensureMaterialCatalogSeeded } from "./materialCatalogSeedData.js";
import {
  applyStockMovement, assertProductsHaveStock, productCostBasis, returnUnitCostOf, postedUnitCostsByProduct,
  type StockMovementOrgTags, type ProductCostBasis,
} from "./stockHandler.js";
import { issuedQtyOf, outstandingQtyOf, netHeldQtyOf, requisitionHasOutstanding, issueBatchesOf, batchIssuedQtyOf, withdrawalsFromBatches } from "../../src/lib/materialRequisition.js";
import type { MaterialRequisitionLine, MaterialRequisitionCategory, MaterialRequisitionSummary, MaterialIssueBatch } from "../../src/lib/materialRequisition.js";
import { isStoreIssueCode, storeIssueCounterKey, type StoreIssueCode } from "../../src/lib/storeCodes.js";

/**
 * Material Requisition API (added 2026-08-18, Stage 3) — mounted from `api/handlers/quotes.ts`
 * alongside Project/Job Order/Purchase Request (same 12/12-slot-sharing constraint, see
 * projectHandler.ts's file header). See src/lib/materialRequisition.ts for the full domain-shape
 * doc comment and the FM-ST-04 PDF-to-field mapping.
 *
 * **2026-09-03 — สต๊อกตัดตอนสโตร์จ่ายของจริง ไม่ใช่ตอนอนุมัติ.** เจ้าของเลือกทางนี้เมื่อถูกถาม
 * (แทนการตัดตาม "เบิกของ" ตอนอนุมัติที่ทำไว้เมื่อ 2026-09-02 ซึ่งทำให้ใบที่ของไม่พออนุมัติไม่ได้เลย):
 *   - อนุมัติ = อนุมัติ ไม่แตะสต๊อก (`approvalConfig` ไม่มี beforeApprove/onApproved ด้านสต๊อกอีก)
 *   - `POST /:id/issues` — สโตร์จ่ายหนึ่งรอบ สต๊อกถูกตัดตามจำนวนของรอบนั้น จ่ายบางส่วนได้
 *     ส่วนที่เหลือคือ "ค้างเบิก" ที่หน้าจอโชว์ต่อบรรทัด และจ่ายเพิ่มในใบเดิมได้เมื่อของมา
 *
 * **2026-09-07 — จ่ายเป็นรอบ ต่อท้ายอย่างเดียว.** เดิม `POST /:id/issue` รับยอดรวมของช่อง "เบิกครั้งที่ 1/2"
 * แล้วตัดตามส่วนต่าง ซึ่งจ่ายได้แค่ 2 รอบ และการพิมพ์ทับช่องเดิมทำให้ยอดของรอบก่อนหายไปเงียบ ๆ ตอนนี้
 * รอบการจ่ายเก็บเป็น `issues[]` (โครงเดียวกับ `batches` ของใบรับสินค้า) ส่วนสองช่องบนฟอร์มกลายเป็น
 * ค่าที่**คำนวณจากรอบ** (`withdrawalsFromBatches`) จึงไม่ต้องแก้ใบพิมพ์ ตัวคิดค้างเบิก หรือกฎการคืนของ
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

/** ใบเบิกของสโตร์ (2026-09-23) — เลขขึ้นต้นด้วยรหัสการจ่ายและนับแยกต่อรหัส ดู `src/lib/storeCodes.ts` */
async function nextStoreRequisitionId(counters: Collection<CounterFields>, code: StoreIssueCode): Promise<string> {
  // ใบจ่ายที่อ้างใบเบิกแผนกอื่นใช้เลขตามใบเบิกนั้น (pairedStoreSlipNumber) ซึ่งอาจเป็นเลขที่ตัวนับยังไปไม่ถึง —
  // ข้ามเลขที่ถูกใช้แล้ว ไม่งั้น unique index ของ documentNumber จะทำให้สร้างใบใหม่ไม่ได้
  const col = await materialRequisitionsCollection();
  for (let i = 0; i < 50; i++) {
    const id = await nextMonthlyDocumentNumber(counters, code, storeIssueCounterKey(code));
    if (!(await col.findOne({ $or: [{ _id: id }, { documentNumber: id }] }, { projection: { _id: 1 } }))) return id;
  }
  throw new HttpError(500, "ออกเลขที่ใบเบิกไม่สำเร็จ");
}

/**
 * เลขที่ใบจ่ายของสโตร์ = รหัสจ่าย + เลขเดียวกับใบเบิกของแผนกที่อ้างอิง (2026-09-23) — `MR-202609-0012` → `PD-202609-0012`
 * ใช้ส่วนหลังขีดแรกของ `_id` ใบเบิก (เลขรันที่ไม่เปลี่ยน) ใบคืนก็คิดแบบเดียวกัน (`JD-202609-0012`) สามใบจึงหากันเจอ ·
 * ซ้ำ (จ่ายหลายใบจากใบเบิกเดียวกัน หรือบังเอิญตรงเลขรัน) ต่อท้าย `/2`, `/3` — ตรวจกับทุกใบเพราะ documentNumber เป็น unique
 */
async function pairedStoreSlipNumber(code: StoreIssueCode, sourceId: string, selfId: string): Promise<string> {
  const dash = sourceId.indexOf("-");
  const base = `${code}-${dash > 0 ? sourceId.slice(dash + 1) : sourceId}`;
  const col = await materialRequisitionsCollection();
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}/${n}`;
    const clash = await col.findOne({ _id: { $ne: selfId }, $or: [{ documentNumber: candidate }, { _id: candidate }] }, { projection: { _id: 1 } });
    if (!clash) return candidate;
  }
  return selfId;
}

/** ใบเบิกของแผนกอื่น (โครงการ/ผลิต) ที่ใบจ่ายของสโตร์อ้างได้ — อนุมัติแล้ว ไม่ถูกลบ */
async function loadDepartmentRequisition(id: string) {
  const col = await materialRequisitionsCollection();
  const mr = await col.findOne({ _id: id });
  if (!mr || mr.isDeleted) throw new HttpError(400, "ไม่พบใบเบิกที่อ้างอิง");
  if (mr.ownerDepartment === "store") throw new HttpError(400, "ใบจ่ายของสโตร์อ้างได้เฉพาะใบเบิกของแผนกอื่น");
  if (mr.status !== "Final") throw new HttpError(400, "ใบเบิกที่อ้างอิงต้องอนุมัติแล้ว");
  return mr;
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
      // บรรทัดของใบจ่ายสโตร์ที่ผูกบรรทัดใบเบิกแผนกไว้ — เปลี่ยนสินค้าแล้วถือว่าไม่ใช่บรรทัดเดิมอีกต่อไป
      ...(prev?.sourceLineId && prev.productId === productId ? { sourceLineId: prev.sourceLineId } : {}),
    };
  });
}

function toClient(doc: MaterialRequisitionFields & { _id: string }) {
  // เอกสารก่อน 2026-08-27 ไม่มี revisionNote / ก่อน 2026-09-03 ไม่มี documentNumber+charge* — เติมตอนอ่าน ไม่ได้ทำ migration
  return withStringId(withApprovalDefaults({
    ...doc,
    revisionNote: doc.revisionNote ?? "",
    // ใบก่อน 2026-09-07 ไม่มีรายการรอบการจ่าย — หน้าจอเรียก issueBatchesOf() แปลงยอดเดิมให้เอง
    issues: doc.issues ?? [],
    documentNumber: doc.documentNumber || doc._id,
    chargeDepartmentId: doc.chargeDepartmentId ?? "", chargeDepartmentName: doc.chargeDepartmentName ?? "",
    chargeTeamId: doc.chargeTeamId ?? "", chargeTeamName: doc.chargeTeamName ?? "",
    chargeWorkTypeCode: doc.chargeWorkTypeCode ?? "", chargeWorkTypeName: doc.chargeWorkTypeName ?? "",
    storeReference: doc.storeReference ?? "",
    sourceRequisitionId: doc.sourceRequisitionId ?? "", sourceRequisitionNumber: doc.sourceRequisitionNumber ?? "",
  }));
}
function toSummary(doc: MaterialRequisitionFields & { _id: string }): MaterialRequisitionSummary {
  const full = withStringId(doc);
  return {
    id: full.id, documentNumber: full.documentNumber || full.id,
    chargeDepartmentName: full.chargeDepartmentName ?? "", chargeTeamName: full.chargeTeamName ?? "",
    chargeWorkTypeName: full.chargeWorkTypeName ?? "",
    hasOutstanding: requisitionHasOutstanding({ status: full.status, lines: full.lines ?? [] }),
    // จำนวนบรรทัดที่ยังค้างจ่าย — หน้าตัดของบอกขนาดงานของแต่ละใบด้วยค่านี้ ไม่ต้องเปิดใบทีละใบมานับ
    outstandingLineCount: full.status === "Final" ? (full.lines ?? []).filter((l) => outstandingQtyOf(l) > 0).length : 0,
    projectId: full.projectId, scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode,
    // เอกสารก่อน 2026-08-20 ไม่มีฟิลด์นี้ — normalize ตอนอ่าน ไม่ได้ทำ migration
    productionOrderId: full.productionOrderId ?? "",
    ownerDepartment: full.ownerDepartment ?? "project",
    issueCode: full.issueCode,
    storeReference: full.storeReference ?? "",
    sourceRequisitionNumber: full.sourceRequisitionNumber ?? "",
    customerName: full.customerName ?? "",
    status: full.status, updatedAt: full.updatedAt,
  };
}

async function loadOrThrow(id: string) {
  const materialRequisitions = await materialRequisitionsCollection();
  const doc = await materialRequisitions.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบเบิกและใบคืนวัสดุ");
  return doc;
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:view");
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";

  // Omitting projectId switches from "list by Project" to "list every Material Requisition
  // company-wide" — Stage 4 addition, needed for the standalone list page Store staff use as their
  // own entry point (per the original Stage 1 "Store staff shouldn't have to go through Project"
  // reasoning) — same dual-mode shape Project's own GET /api/projects already established. Both
  // modes are scoped by materialRequisition:viewAll via buildSimpleOwnershipClause() — except the
  // Store issue queue below, which is scoped by stock:adjust instead and deliberately sees every
  // author's documents.
  /**
   * **หน้าตัดของของสโตร์ (2026-09-10)** — `?issueStage=pending` คือคิวงานของสโตร์: ใบที่อนุมัติแล้ว
   * และยังจ่ายไม่ครบ · เจ้าของสั่ง *"อยากแยกหน้าออกมาเป็นของสโตร์ที่เอาไว้ตัดของ"*
   *
   * สองข้อที่ต่างจากรายการปกติโดยตั้งใจ:
   *   1. **ไม่กรองด้วย `createdBy`** — กล่องนี้เปิดด้วยสิทธิ์ `stock:adjust` ซึ่งเป็นสิทธิ์ที่ทำให้
   *      *จ่ายของ* ได้อยู่แล้ว แรงกว่า "ดูใบของคนอื่น" · ถ้ากรองด้วยความเป็นเจ้าของ สโตร์จะเห็นแต่ใบ
   *      ที่ตัวเองเขียน ซึ่งคือศูนย์ใบ และหน้าที่เพิ่งสร้างจะว่างเปล่าตลอดไป — เหตุผลเดียวกับกล่อง
   *      "เอกสารรออนุมัติ" (`api/_lib/pendingApprovals.ts`)
   *   2. **ไม่กรองแผนก** (`ownerDepartment=all`) — ของอยู่คลังเดียวกัน สโตร์คนเดียวกันเป็นคนจ่าย
   *      ทั้งใบของฝ่ายโครงการและฝ่ายผลิต การให้ไล่ดูสองเมนูคือปัญหาที่หน้านี้ถูกสร้างมาแก้
   */
  const issueQueue = req.query.issueStage === "pending";
  if (issueQueue && !roleHasPermission(ctx.role, "stock:adjust")) throw new HttpError(403, "Forbidden");
  const ownershipMatch = issueQueue
    ? {}
    : buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "materialRequisition:viewAll"), "createdBy");
  const materialRequisitions = await materialRequisitionsCollection();
  // แยกเอกสารตามแผนกเจ้าของ — ฝ่ายโครงการกับฝ่ายผลิตใช้เอกสารชนิดเดียวกันแต่ไม่เห็นของกันและกัน
  // (ยืนยันกับเจ้าของ 2026-08-20). เอกสารเก่าที่ไม่มีฟิลด์นี้ถือเป็นของฝ่ายโครงการ จึงต้องรับทั้ง
  // ค่า "project" และกรณีที่ยังไม่มีฟิลด์เลย — ไม่ได้ทำ migration
  // 2026-09-10: `"all"` = เห็นทั้งสองฝ่ายรวมกัน สำหรับหน้าตัดของของสโตร์ (และคิดแบบเดียวกับ
  // `ownerDepartment=all` ของใบขอซื้อ ที่กล่องงานเข้าฝ่ายจัดซื้อใช้มาตั้งแต่ 2026-08-28)
  const q = req.query.ownerDepartment;
  const ownerDepartment = q === "production" || q === "store" || q === "all" ? q : "project";
  const departmentClause: Filter<MaterialRequisitionFields & { _id: string }> =
    ownerDepartment === "production" ? { ownerDepartment: "production" }
    : ownerDepartment === "store" ? { ownerDepartment: "store" }
    : ownerDepartment === "all" ? {}
    : { $or: [{ ownerDepartment: "project" }, { ownerDepartment: { $exists: false } }] };
  // เวลาระบุ projectId คือเช็คของโครงการนั้นโดยตรง ไม่ต้องกรองแผนกซ้ำ
  // $and, not spread: buildSimpleOwnershipClause() also returns a $or, so spreading both
  // would have the department clause silently overwrite the ownership one (a real leak).
  const stageClause: Filter<MaterialRequisitionFields & { _id: string }> = issueQueue ? { status: "Final" } : {};
  const filter = projectId
    ? { projectId, isDeleted: false, ...ownershipMatch }
    : { isDeleted: false, $and: [ownershipMatch, departmentClause, stageClause] };
  // คิวของสโตร์เรียงใบที่รอนานที่สุดขึ้นก่อน (ตรงข้ามกับรายการปกติ) — เป็นคิวงาน ไม่ใช่ประวัติ และ
  // ใบที่เพิ่งจ่ายไปรอบหนึ่งควรถอยไปท้ายแถวเอง ไม่ใช่เด้งขึ้นมาบนสุดทุกครั้งที่แตะ
  const docs = await materialRequisitions.find(filter).sort({ updatedAt: issueQueue ? 1 : -1 }).toArray();
  // "ยังจ่ายไม่ครบ" คิดจากบรรทัดจริง ไม่ใช่ฟิลด์ที่เก็บไว้ — ไม่มีฟิลด์ไหนสรุปค่านี้ไว้ให้กรองใน MongoDB
  // และการเพิ่มฟิลด์สรุปหมายถึงมีตัวเลขชุดที่สองให้ผิดเพี้ยนจากของจริงได้ · ใบ Final มีไม่กี่ร้อยใบ
  const summaries = docs.map(toSummary).filter((s) => !issueQueue || s.hasOutstanding);
  res.status(200).json({ materialRequisitions: summaries });
}

async function handleCreate(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:create");

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
  /**
   * **ต้นทางที่สาม เพิ่ม 2026-09-10: ไม่มีเอกสารต้นทางเลย** — เจ้าของสั่ง *"ใบเบิกทำให้สามารถเบิกเป็น
   * ใบเปล่าๆ ได้โดยไม่ต้องอิงมาจากงานไหนทั้งสิ้น"* · ของที่เบิกไปใช้กับงานซ่อมบำรุง งานภายใน หรือของ
   * สิ้นเปลืองประจำวัน ไม่มีโครงการและไม่มีใบสั่งผลิตให้อ้าง แต่ก็ยังต้องตัดออกจากคลังให้ถูกต้อง
   *
   * ใบเปล่าไม่มี `projectId`/`scopeOfWorkId`/`jobCode` และ**ไม่ไปแตะ `ProjectItem` เลย** — ทางเดียว
   * กับใบของฝ่ายผลิตที่ไม่มี projectId มาตั้งแต่ 2026-08-20 ทุกจุดที่ตามรายการในโครงการจึงกันไว้ด้วย
   * `doc.projectId ? ... : []` อยู่แล้ว (ลบ · rewrite · อนุมัติ) ไม่ต้องเพิ่มด่านใหม่
   *
   * แบบเดียวกับใบขอซื้อที่เปิดใบเปล่าได้ตั้งแต่ 2026-08-28 — ต่างกันตรงที่ใบขอซื้อตั้ง
   * `ownerDepartment: "general"` เป็นค่าที่สาม ส่วนใบเบิก**คงแผนกของเมนูที่กดสร้างไว้** เพื่อให้ใบ
   * ที่เพิ่งเปิดอยู่ในรายการที่คนกดมองเห็นอยู่ ไม่ใช่หายไปอยู่เมนูที่สาม
   */
  const standalone = !fromProduction && !projectId && itemIds.length === 0;
  if (!fromProduction && !standalone && !projectId) throw new HttpError(400, "กรุณาระบุโครงการ หรือใบสั่งผลิต");
  /**
   * **ใบเบิกของสโตร์ (2026-09-23)** — ใบเปล่าชนิดพิเศษ: เลขขึ้นต้นด้วยรหัสการจ่าย (PD / PP / OU …) ที่ต้องระบุตอน
   * สร้างเสมอ และอยู่ในแผนก `"store"` ของตัวเอง ไม่ปนกับใบของฝ่ายโครงการหรือผลิต · อย่างอื่นเหมือนใบเบิกทุกประการ
   */
  const storeIssueCode = standalone && body.ownerDepartment === "store" ? body.issueCode : undefined;
  if (standalone && body.ownerDepartment === "store" && !isStoreIssueCode(storeIssueCode)) {
    throw new HttpError(400, "กรุณาเลือกรหัสการจ่ายของใบเบิกสโตร์");
  }
  // สิทธิ์ project:view จำเป็นเฉพาะทางที่อ่านโครงการจริง ๆ — ถ้าบังคับกับใบเปล่าด้วย ฝ่ายที่ไม่มีสิทธิ์
  // ดูโครงการจะเปิดใบเปล่าของตัวเองไม่ได้เลย ซึ่งคือสิ่งที่รอบนี้ตั้งใจแก้ (ด่านของทางอื่นไม่เปลี่ยน)
  if (!standalone && !roleHasPermission(ctx.role, "project:view")) throw new HttpError(403, "Forbidden");

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
  } else if (standalone) {
    // ไม่มีอะไรให้สืบทอด — ทุกช่องบนหัวใบพิมพ์เองในเอกสาร เหลือแค่ชื่อคนสร้างที่เติมให้ไว้ก่อน
    source = { projectId: "", scopeOfWorkId: "", jobCode: "", customerName: "", productName: "", responsibleEmployee: ctx.user.fullName };
  } else if (itemIds.length === 0) {
    /**
     * **เปิดใบของโครงการโดยไม่ผูกรายการ (2026-09-21)** — เหตุผลเดียวกับใบขอซื้อทุกประการ
     * (ดู `handleCreate()` ใน purchaseRequestHandler.ts): โครงการที่ออกเอกสารครบทุกรายการแล้วจะไม่มี
     * รายการ `pending` เหลือ แล้วเดิมนั่นแปลว่าเปิดใบใหม่ไม่ได้เลย ขณะที่ฝ่ายผลิตออกกี่ใบก็ได้จาก
     * ใบสั่งผลิตใบเดิม · เจ้าของสั่งให้แก้ให้เหมือนกันทั้งสามใบ 2026-09-21
     *
     * ใบยังเป็นของฝ่ายโครงการและอ้าง `projectId`/`scopeOfWorkId`/`jobCode` ครบ ต่างกันแค่ไม่มี
     * ProjectItem ให้ขยับสถานะ · ช่อง "ชื่อสินค้า" เว้นว่างให้กรอกเอง เพราะไม่มีรายการให้ต่อชื่อ
     */
    const project = await loadProjectOrThrow(projectId);
    jobOrderLink = await resolveJobOrderLink(projectId, body.jobOrderId);
    source = {
      projectId, scopeOfWorkId: project.scopeOfWorkId, jobCode: project.scopeNumber,
      customerName: project.customerCompanyName,
      productName: "",
      responsibleEmployee: ctx.user.fullName,
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
  const id = isStoreIssueCode(storeIssueCode)
    ? await nextStoreRequisitionId(counters, storeIssueCode)
    : await nextMaterialRequisitionId(counters);
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
    // ใบเปล่ารับแผนกมาจากเมนูที่กดสร้าง (ไม่ส่งมา = โครงการ) — ไม่งั้นกดจากเมนูผลิตแล้วใบไปโผล่เมนูโครงการ
    ownerDepartment: isStoreIssueCode(storeIssueCode) ? "store"
      : fromProduction || (standalone && body.ownerDepartment === "production") ? "production" : "project",
    ...(isStoreIssueCode(storeIssueCode) ? { issueCode: storeIssueCode, storeReference: "" } : {}),
    revisionNote: "",
    productionOrderId: fromProduction ? productionOrderId : "",
    jobOrderId: jobOrderLink.jobOrderId, jobOrderCode: jobOrderLink.jobOrderCode,
    productName: source.productName, responsibleEmployee: source.responsibleEmployee, productionStartDate: "",
    lines: [], issues: [], status: "Draft",
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
  // ใบของโครงการที่ไม่ได้เลือกรายการก็เช่นกัน (2026-09-21)
  if (!fromProduction && !standalone && itemIds.length > 0) {
    await linkProjectItemsToSubDocument(projectId, itemIds, "requisition", "materialRequisitionId", id);
  }

  await writeAuditEntry(
    ctx, "Material Requisition Created",
    fromProduction
      ? `สร้างใบเบิกและใบคืนวัสดุ ${id} (${documentNumber}) จากใบสั่งผลิต ${productionOrderId}`
      : standalone
      ? `สร้างใบเบิกและใบคืนวัสดุ ${id} เป็นใบเปล่า ไม่มีเอกสารต้นทาง`
      : pickedItems.length === 0
      ? `สร้างใบเบิกและใบคืนวัสดุ ${id} ในโครงการ ${source.jobCode} โดยไม่ผูกรายการ`
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

/**
 * ต้นทุนต่อหน่วยของทุกสินค้าในใบ — ส่งคู่กับเอกสารเหมือน `stockByProduct` (2026-09-09)
 *
 * หน้าจอใช้โชว์ "ราคาล่าสุด" ข้างช่องคืนของ ตามที่เจ้าของสั่งให้การคืนของลงบัญชีด้วยราคาซื้อล่าสุด
 * แยก map กับยอดคงเหลือโดยตั้งใจ — `stockByProduct` เป็น `Record<string, number>` ที่หน้าจอและ
 * route 4 ตัวอ่านอยู่แล้ว การเปลี่ยนรูปมันคือการแก้ทุกจุดพร้อมกันเพื่อข้อมูลที่เพิ่มมาแค่สองตัวเลข
 */
async function costByProductFor(lines: MaterialRequisitionLine[]): Promise<Record<string, ProductCostBasis>> {
  return productCostBasis(lines.map((l) => l.productId).filter((id) => id && isObjectIdLike(id)));
}

async function handleGetOne(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "materialRequisition:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({
    materialRequisition: toClient(doc),
    stockByProduct: await stockByProductFor(doc.lines ?? []),
    costByProduct: await costByProductFor(doc.lines ?? []),
  });
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

async function handleUpdate(req: ApiRequest, res: ApiResponse, id: string) {
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
  // ใบสโตร์ไม่มีโครงการ/ใบสั่งผลิตให้สืบรหัสงาน จึงให้พิมพ์รหัสงานและเลขอ้างอิงเองได้ — ใบของฝ่ายอื่นรหัสงาน
  // เป็น snapshot ของโครงการ แก้ไม่ได้เหมือนเดิม (ช่องนี้ถูกค้นในหน้าประวัติสต๊อก "ตัดไปงานไหน")
  if (doc.ownerDepartment === "store") {
    if ("jobCode" in body) update.jobCode = sanitizeShortText(body.jobCode, "รหัสงาน");
    if ("storeReference" in body) update.storeReference = sanitizeShortText(body.storeReference, "เลขอ้างอิง");
    // เลือก/เปลี่ยนใบเบิกของแผนกที่อ้างอิง = ตั้งหัวใบ รายการ (เฉพาะที่ยังค้างเบิก) และเลขที่ใบตามใบนั้น
    // ชนะค่าที่หน้าจอส่งมาพร้อมกันเสมอ (หน้าจอส่ง documentNumber/lines เดิมมาทุกครั้งที่บันทึก)
    if ("sourceRequisitionId" in body && body.sourceRequisitionId !== (doc.sourceRequisitionId ?? "")) {
      const srcId = typeof body.sourceRequisitionId === "string" ? body.sourceRequisitionId.trim() : "";
      if (!srcId) {
        Object.assign(update, { sourceRequisitionId: "", sourceRequisitionNumber: "", lines: [], documentNumber: id });
      } else {
        const src = await loadDepartmentRequisition(srcId);
        const srcIssues = issueBatchesOf(src);
        Object.assign(update, {
          sourceRequisitionId: src._id, sourceRequisitionNumber: src.documentNumber || src._id,
          jobCode: src.jobCode ?? "", customerName: src.customerName ?? "", productName: src.productName ?? "",
          chargeDepartmentId: src.chargeDepartmentId ?? "", chargeDepartmentName: src.chargeDepartmentName ?? "",
          chargeTeamId: src.chargeTeamId ?? "", chargeTeamName: src.chargeTeamName ?? "",
          chargeWorkTypeCode: src.chargeWorkTypeCode ?? "", chargeWorkTypeName: src.chargeWorkTypeName ?? "",
          lines: (src.lines ?? [])
            .map((l) => ({ l, outstanding: (l.plannedQty ?? 0) - batchIssuedQtyOf(srcIssues, l.id) }))
            .filter(({ outstanding }) => outstanding > 0)
            .map(({ l, outstanding }) => ({
              id: newId("mrline"), productId: l.productId, productCode: l.productCode, productName: l.productName, unit: l.unit,
              category: l.category, plannedQty: outstanding, withdrawal1Qty: null, withdrawal2Qty: null, returnQty: null,
              actualUsedQty: null, sourceLineId: l.id,
            })),
          documentNumber: await pairedStoreSlipNumber(doc.issueCode as StoreIssueCode, src._id, id),
        });
      }
    }
  }
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
 * รวมจำนวนต่อ **สินค้า** จากจำนวนต่อ **บรรทัด** — สองบรรทัดที่ชี้สินค้าเดียวกันถูกยุบเป็นก้อนเดียว
 * ก่อนแตะสต๊อก ไม่งั้นจะเขียน movement ซ้ำสองรอบให้สินค้าตัวเดียวกันในคำขอเดียว
 */
function productTotalsOf(lines: MaterialRequisitionLine[], qtyByLineId: Map<string, number>): Map<string, number> {
  return deductionsFor(lines.map((l) => ({ productId: l.productId, plannedQty: qtyByLineId.get(l.id) ?? 0 })));
}

/** ช่อง "เบิกครั้งที่ 1/2" ของทุกบรรทัด คิดใหม่จากรอบการจ่ายทั้งหมด — ค่าที่เก็บไว้ไม่เคยถูกเชื่อ */
function linesWithDerivedWithdrawals(lines: MaterialRequisitionLine[], batches: MaterialIssueBatch[]): MaterialRequisitionLine[] {
  return lines.map((l) => ({ ...l, ...withdrawalsFromBatches(batches, l.id) }));
}

/**
 * "จ่ายของ" หนึ่งรอบ (2026-09-07) — ต่อท้าย `issues` หนึ่งก้อน ตัดสต๊อกตามจำนวนของรอบนั้น จบ
 *
 * สิทธิ์ `stock:adjust` ไม่ใช่ `canEdit()` — คนจ่ายของคือสโตร์ ซึ่งไม่ใช่เจ้าของใบและอาจไม่มีสิทธิ์แก้ใบ
 * เลย ส่วนเจ้าของใบก็ไม่ควรกรอกเลขจ่ายเองได้ (ไม่งั้นตัวเลขสต๊อกจะขึ้นกับคนขอ ไม่ใช่คนจ่าย)
 *
 * ลำดับ: ตรวจทุกบรรทัด (จ่ายรอบนี้ > 0 — เกินที่ขอได้ตั้งแต่ 2026-09-24) → เช็คยอดพอสำหรับทุกสินค้า **ก่อน** เขียน
 * อะไรเลย (กันเขียนครึ่งเดียว) → ตัดสต๊อกทีละสินค้า → ต่อท้ายรอบและคิดสองช่องบนฟอร์มใหม่
 *
 * ใบเก่าที่จ่ายไปแล้วก่อนมีระบบรอบ ถูกแปลงยอดเดิมเป็นรอบย้อนหลังแล้วเขียนลงฐานข้อมูล**พร้อมกับ**รอบใหม่
 * (`legacyIssueBatchesOf` ผ่าน `issueBatchesOf`) ยอดเดิมจึงไม่หายและไม่ถูกตัดสต๊อกซ้ำ
 */
async function handlePostIssueBatch(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const doc = await loadOrThrow(id);
  assertFinalForStock(doc, "จ่ายของ");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const issuedDate = validateIsoDateOrEmpty(body.issuedDate, "วันที่จ่ายของ") || nowIso().slice(0, 10);
  const issuedBy = sanitizeShortText(body.issuedBy, "ผู้จ่ายของ") || doc.storeDeptBy || ctx.user.fullName;
  const remark = sanitizeLongText(body.remark, "หมายเหตุ");

  const rows = body.lines;
  if (!Array.isArray(rows)) throw new HttpError(400, "ข้อมูลรายการจ่ายไม่ถูกต้อง");
  if (rows.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);

  const previous = issueBatchesOf(doc);
  const lineById = new Map(doc.lines.map((l) => [l.id, l]));
  const qtyByLineId = new Map<string, number>();
  for (const [idx, raw] of (rows as Record<string, unknown>[]).entries()) {
    const lineId = typeof raw.lineId === "string" ? raw.lineId : "";
    const line = lineById.get(lineId);
    if (!line) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ไม่พบบรรทัดที่ระบุในใบนี้`);
    if (qtyByLineId.has(lineId)) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ส่งบรรทัดเดียวกันมาซ้ำ`);
    const qty = sanitizeNullableNumber(raw.qty, `จำนวนจ่าย (${line.productName})`) ?? 0;
    if (qty < 0) throw new HttpError(400, `จำนวนจ่าย (${line.productName}) ต้องไม่ติดลบ`);
    if (qty === 0) continue; // บรรทัดที่ไม่ได้จ่ายรอบนี้ — ปล่อยผ่าน ไม่ใช่ข้อผิดพลาด
    // **จ่ายเกินที่ขอได้** (คำสั่งเจ้าของ 2026-09-24: *"ใบเบิกตอนจ่ายของสามารถจ่ายของเกินได้"*) — ของจริงมาเป็นแพ็ก/ม้วน
    // ตัดพอดีจำนวนที่ขอไม่ได้ · ด่านที่เหลือคือของในคลังต้องพอ (`assertProductsHaveStock` ข้างล่าง) · ยอดค้างเบิกไม่ติดลบ
    qtyByLineId.set(lineId, qty);
  }
  if (qtyByLineId.size === 0) throw new HttpError(400, "กรุณาระบุจำนวนที่จ่ายอย่างน้อยหนึ่งรายการ");

  // ใบจ่ายของสโตร์ที่อ้างใบเบิกแผนก — บรรทัดต้นทางต้องยังอยู่ (จ่ายเกินที่แผนกค้างได้ ตามกติกาเดียวกับข้างบน)
  const source = doc.ownerDepartment === "store" && doc.sourceRequisitionId ? await loadDepartmentRequisition(doc.sourceRequisitionId) : null;
  if (source) {
    const srcLineIds = new Set((source.lines ?? []).map((l) => l.id));
    for (const lineId of qtyByLineId.keys()) {
      const sid = lineById.get(lineId)?.sourceLineId;
      if (sid && !srcLineIds.has(sid)) throw new HttpError(400, `ไม่พบรายการในใบเบิก ${source.documentNumber || source._id} แล้ว`);
    }
  }

  const charge = await resolveChargeFromBody(body);
  const merged: MaterialRequisitionFields = { ...doc, ...charge };
  // เช็คก่อนเขียน: ทุกสินค้าต้องมีพอ — applyStockMovement() ยังมีด่าน $gte ของตัวเองปิดช่องแข่ง
  const totals = productTotalsOf(doc.lines, qtyByLineId);
  await assertProductsHaveStock(totals);

  const org = orgTagsOf(merged);
  const label = merged.documentNumber || id;
  const seq = previous.length > 0 ? Math.max(...previous.map((b) => b.seq)) + 1 : 1;
  const stockMovementIds: string[] = [];
  for (const [productId, qty] of totals) {
    const { movement } = await applyStockMovement({
      productId, kind: "deduct", delta: -qty,
      reason: `จ่ายของตามใบเบิก ${label} (รอบที่ ${seq})`,
      sourceType: "material_requisition", sourceId: id, sourceLabel: label,
      userId: ctx.user.id, org,
    });
    stockMovementIds.push(movement.id);
  }

  const now = nowIso();
  const batch: MaterialIssueBatch = {
    id: newId("mrissue"),
    seq,
    issuedDate,
    lines: [...qtyByLineId].map(([lineId, qty]) => ({ lineId, qty })),
    issuedBy,
    remark,
    chargeDepartmentName: merged.chargeDepartmentName ?? "",
    chargeTeamName: merged.chargeTeamName ?? "",
    chargeWorkTypeName: merged.chargeWorkTypeName ?? "",
    postedAt: now, postedBy: ctx.user.id, postedByName: ctx.user.fullName,
    stockMovementIds,
  };
  const issues = [...previous, batch];

  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, {
    $set: {
      issues,
      lines: linesWithDerivedWithdrawals(doc.lines, issues),
      ...charge,
      storeDeptBy: issuedBy, storeDeptAt: issuedDate,
      updatedAt: now, updatedBy: ctx.user.id,
    },
  });
  if (source) await mirrorIssueToSource(source, doc, batch);
  const updated = await loadOrThrow(id);
  await writeAuditEntry(
    ctx, "Material Requisition Issued",
    `สโตร์จ่ายของตามใบเบิก ${label} รอบที่ ${seq} (${[...totals].map(([p, q]) => `${p}: -${q}`).join(", ")})`,
    { scopeOfWorkId: updated.scopeOfWorkId },
  );
  res.status(200).json({
    materialRequisition: toClient(updated),
    stockByProduct: await stockByProductFor(updated.lines ?? []),
    costByProduct: await costByProductFor(updated.lines ?? []),
  });
}

/**
 * บันทึกรอบการจ่ายของใบจ่ายสโตร์ลงใบเบิกของแผนกต้นทางด้วย (2026-09-23) — ยอด "จ่ายแล้ว/ค้างเบิก" ของแผนกนั้นจึงถูกต้อง
 * โดยแผนกไม่ต้องเปิดใบจ่ายของสโตร์ · **ไม่ตัดสต๊อกซ้ำ** (`stockMovementIds` ว่าง — ตัดที่ใบจ่ายแล้ว) · id รอบเดียวกับที่ใบจ่าย
 * ใช้ย้อนกลับตอนยกเลิก · บรรทัดที่ไม่ได้ผูกบรรทัดต้นทาง (สโตร์เพิ่มเอง) ไม่ถูกบันทึกลงใบแผนก
 */
async function mirrorIssueToSource(source: MaterialRequisitionFields & { _id: string }, slip: MaterialRequisitionFields & { _id: string }, batch: MaterialIssueBatch): Promise<void> {
  const slipLines = new Map(slip.lines.map((l) => [l.id, l]));
  const bySource = new Map<string, number>();
  for (const bl of batch.lines) {
    const sid = slipLines.get(bl.lineId)?.sourceLineId;
    if (sid) bySource.set(sid, (bySource.get(sid) ?? 0) + bl.qty);
  }
  if (bySource.size === 0) return;
  const previous = issueBatchesOf(source);
  const slipNumber = slip.documentNumber || slip._id;
  const mirror: MaterialIssueBatch = {
    ...batch,
    seq: previous.length > 0 ? Math.max(...previous.map((b) => b.seq)) + 1 : 1,
    lines: [...bySource].map(([lineId, qty]) => ({ lineId, qty })),
    remark: [`จ่ายตามใบจ่ายของสโตร์ ${slipNumber}`, batch.remark].filter(Boolean).join(" · "),
    stockMovementIds: [],
    storeSlipId: slip._id, storeSlipNumber: slipNumber,
  };
  const issues = [...previous, mirror];
  await (await materialRequisitionsCollection()).updateOne({ _id: source._id }, {
    $set: {
      issues, lines: linesWithDerivedWithdrawals(source.lines ?? [], issues),
      storeDeptBy: batch.issuedBy, storeDeptAt: batch.issuedDate, updatedAt: nowIso(),
    },
  });
}

async function removeMirrorFromSource(source: MaterialRequisitionFields & { _id: string }, batchId: string): Promise<void> {
  const issues = issueBatchesOf(source).filter((b) => b.id !== batchId);
  const stillLast = issues[issues.length - 1];
  await (await materialRequisitionsCollection()).updateOne({ _id: source._id }, {
    $set: {
      issues, lines: linesWithDerivedWithdrawals(source.lines ?? [], issues),
      storeDeptBy: stillLast?.issuedBy ?? "", storeDeptAt: stillLast?.issuedDate ?? "", updatedAt: nowIso(),
    },
  });
}

/**
 * ใบเบิกของแผนกอื่นที่สโตร์อ้างในใบจ่ายได้ (2026-09-23) — อนุมัติแล้วและยังมีของค้างเบิก ทุกแผนก ไม่กรองเจ้าของใบ
 * (สโตร์จ่ายของให้ทุกแผนก แบบเดียวกับหน้าตัดของที่ถูกแทนที่) · เก่าสุดก่อน เหมือนคิวงาน
 */
async function handleStoreSources(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "materialRequisition:view");
  const col = await materialRequisitionsCollection();
  const docs = await col.find({ isDeleted: false, status: "Final", ownerDepartment: { $ne: "store" } } as Filter<MaterialRequisitionFields & { _id: string }>)
    .sort({ updatedAt: 1 }).limit(500).toArray();
  const requisitions = docs
    .map((d) => {
      const issues = issueBatchesOf(d);
      const outstandingLineCount = (d.lines ?? []).filter((l) => (l.plannedQty ?? 0) - batchIssuedQtyOf(issues, l.id) > 0).length;
      return {
        id: d._id, documentNumber: d.documentNumber || d._id,
        ownerDepartment: d.ownerDepartment === "production" ? "production" as const : "project" as const,
        jobCode: d.jobCode ?? "", customerName: d.customerName ?? "",
        chargeDepartmentName: d.chargeDepartmentName ?? "", chargeTeamName: d.chargeTeamName ?? "",
        outstandingLineCount, updatedAt: d.updatedAt,
      };
    })
    .filter((r) => r.outstandingLineCount > 0);
  res.status(200).json({ requisitions });
}

/**
 * ยกเลิกรอบการจ่าย — ได้เฉพาะ **รอบล่าสุด** เหมือนใบรับสินค้า เพราะถ้าถอนรอบที่แทรกกลางออกได้
 * ลำดับที่เหลือจะอ่านไม่ตรงกับบัญชีเดินสะพัดของสต๊อกที่บันทึกไว้ตามลำดับจริง
 *
 * ของทั้งรอบกลับเข้าคลังเป็น kind `return` · ยกเลิกไม่ได้ถ้าทีมคืนของมามากกว่าที่จะเหลือว่าจ่ายไป
 * (ไม่งั้นยอด "คืนของ" จะมากกว่ายอด "จ่ายแล้ว" ซึ่งเป็นสถานะที่กฎการคืนของห้ามไว้อยู่แล้ว)
 */
async function handleCancelIssueBatch(req: ApiRequest, res: ApiResponse, id: string, batchId: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const doc = await loadOrThrow(id);
  assertFinalForStock(doc, "ยกเลิกรอบการจ่าย");

  const previous = issueBatchesOf(doc);
  const last = previous[previous.length - 1];
  if (!last || last.id !== batchId) throw new HttpError(400, "ยกเลิกได้เฉพาะรอบการจ่ายล่าสุดเท่านั้น");
  if (last.storeSlipId) throw new HttpError(400, `รอบนี้จ่ายผ่านใบจ่ายของสโตร์ ${last.storeSlipNumber || last.storeSlipId} — ยกเลิกที่ใบจ่ายนั้น`);
  const issues = previous.slice(0, -1);
  const source = doc.ownerDepartment === "store" && doc.sourceRequisitionId
    ? await (await materialRequisitionsCollection()).findOne({ _id: doc.sourceRequisitionId })
    : null;
  if (source) {
    // ใบเบิกแผนกคืนของไปแล้วมากกว่าที่จะเหลือว่าจ่าย → ยกเลิกไม่ได้ (กติกาเดียวกับด้านล่าง แต่ตรวจที่ใบต้นทาง)
    const srcRemaining = issueBatchesOf(source).filter((b) => b.id !== last.id);
    for (const line of source.lines ?? []) {
      const remaining = batchIssuedQtyOf(srcRemaining, line.id);
      if (remaining < (line.returnQty ?? 0)) {
        throw new HttpError(400, `ยกเลิกไม่ได้: ใบเบิก ${source.documentNumber || source._id} คืน ${line.productName} มาแล้ว ${line.returnQty} ${line.unit} มากกว่าที่จะเหลือว่าจ่ายไป ${remaining} ${line.unit}`);
      }
    }
  }

  for (const line of doc.lines) {
    const remaining = batchIssuedQtyOf(issues, line.id);
    if (remaining < (line.returnQty ?? 0)) {
      throw new HttpError(400, `ยกเลิกไม่ได้: ${line.productName} คืนมาแล้ว ${line.returnQty} ${line.unit} มากกว่าที่จะเหลือว่าจ่ายไป ${remaining} ${line.unit}`);
    }
  }

  const qtyByLineId = new Map(last.lines.map((l) => [l.lineId, l.qty]));
  const totals = productTotalsOf(doc.lines.filter((l) => qtyByLineId.has(l.id)), qtyByLineId);
  const org = orgTagsOf(doc);
  const label = doc.documentNumber || id;
  // ของกลับเข้าคลังลงบัญชีด้วย**ราคาซื้อล่าสุด** (2026-09-09) — `rowUnitCost` ไม่แตะค่าเฉลี่ยของคลัง
  const costs = await productCostBasis([...totals.keys()]);
  for (const [productId, qty] of totals) {
    await applyStockMovement({
      productId, kind: "return", delta: qty,
      reason: `ยกเลิกการจ่ายรอบที่ ${last.seq} ของใบเบิก ${label} (ของกลับเข้าคลัง)`,
      sourceType: "material_requisition", sourceId: id, sourceLabel: label,
      userId: ctx.user.id, org, rowUnitCost: returnUnitCostOf(costs[productId]),
    });
  }

  if (source) await removeMirrorFromSource(source, last.id);
  const stillLast = issues[issues.length - 1];
  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, {
    $set: {
      issues,
      lines: linesWithDerivedWithdrawals(doc.lines, issues),
      storeDeptBy: stillLast?.issuedBy ?? "", storeDeptAt: stillLast?.issuedDate ?? "",
      updatedAt: nowIso(), updatedBy: ctx.user.id,
    },
  });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(
    ctx, "Material Requisition Issue Reversed",
    `ยกเลิกการจ่ายรอบที่ ${last.seq} ของใบเบิก ${label} (${[...totals].map(([p, q]) => `${p}: +${q}`).join(", ")})`,
    { scopeOfWorkId: updated.scopeOfWorkId },
  );
  res.status(200).json({
    materialRequisition: toClient(updated),
    stockByProduct: await stockByProductFor(updated.lines ?? []),
    costByProduct: await costByProductFor(updated.lines ?? []),
  });
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
async function handleReturn(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  // คืนของได้เฉพาะแผนกสโตร์ (2026-09-23 — เจ้าของ: *"แผนกอื่นไม่สามารถคืนของเองได้ต้องให้สโตร์กรอกเองได้อย่างเดียว"*)
  // หน้าจอของแผนกไม่มีการ์ดคืนของแล้ว สโตร์คืนผ่านใบรับคืนในหน้า "ใบเบิก-คืนวัสดุ (สโตร์)"
  if (!roleHasPermission(ctx.role, "stock:adjust")) throw new HttpError(403, "คืนของได้เฉพาะแผนกสโตร์ — ทำผ่านใบรับคืนของสโตร์");
  assertFinalForStock(doc, "บันทึกการคืนของ");
  // ใบเบิกของสโตร์คืนของผ่านใบรับคืน (รหัสคู่ JD/JP/…) เท่านั้น — ไม่งั้นมีสองทางคืนของและยอดคืนนับซ้ำ
  if (doc.ownerDepartment === "store") throw new HttpError(400, "ใบเบิกของสโตร์คืนของผ่านใบรับคืนเท่านั้น");

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
  // ของกลับเข้าคลังลงบัญชีด้วย**ราคาซื้อล่าสุด** (2026-09-09, คำสั่งเจ้าของ) — แถวที่ตัดออกเพราะแก้ยอด
  // คืนให้น้อยลงใช้ราคาเดียวกัน เพื่อให้สองแถวที่หักกลบกันมีมูลค่าเท่ากัน
  const costs = await productCostBasis([...delta.keys()]);
  for (const [productId, d] of delta) {
    await applyStockMovement({
      productId, kind: d > 0 ? "return" : "deduct", delta: d,
      reason: d > 0 ? `คืนวัสดุตามใบเบิก ${label}` : `แก้ยอดคืนใบเบิก ${label} (ของออกจากคลัง)`,
      sourceType: "material_requisition", sourceId: id, sourceLabel: label,
      userId: ctx.user.id, org, rowUnitCost: returnUnitCostOf(costs[productId]),
    });
  }

  const materialRequisitions = await materialRequisitionsCollection();
  await materialRequisitions.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Material Requisition Return Recorded", `บันทึกการคืนวัสดุของใบเบิกและใบคืนวัสดุ ${label}`, { scopeOfWorkId: updated.scopeOfWorkId });
  res.status(200).json({
    materialRequisition: toClient(updated),
    stockByProduct: await stockByProductFor(updated.lines ?? []),
    costByProduct: await costByProductFor(updated.lines ?? []),
  });
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

async function handlePrint(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "materialRequisition:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Material Requisition Printed", `พิมพ์ใบเบิกและใบคืนวัสดุ ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true, unitCostByProduct: await printUnitCostsFor(doc) });
}

/**
 * ต้นทุนต่อหน่วยสำหรับใบพิมพ์ "ใบจ่ายวัสดุ" ของสโตร์ (2026-09-23 — ฟอร์มโปรแกรมบัญชีเดิมมีช่อง หน่วยละ/รวม)
 * ส่งมากับการกดพิมพ์ ไม่ได้ใส่ในทุก route ที่คืนเอกสาร — ตัวเลขนี้ใช้แค่ตอนพิมพ์ และต้องสดเสมอ
 *
 * ของที่จ่ายไปแล้ว = ต้นทุนที่ลงสต๊อกจริงในรอบจ่าย · ของที่ยังไม่ได้จ่าย = ต้นทุนเฉลี่ยปัจจุบัน (ซึ่งเป็นราคาที่
 * การจ่ายจะใช้ ดู `applyStockMovement()`) จึงเป็นตัวเลขประมาณจนกว่าสโตร์จะจ่ายจริง
 */
async function printUnitCostsFor(doc: MaterialRequisitionFields): Promise<Record<string, number>> {
  const posted = await postedUnitCostsByProduct(issueBatchesOf(doc).flatMap((b) => b.stockMovementIds ?? []));
  const basis = await costByProductFor(doc.lines ?? []);
  const out: Record<string, number> = {};
  for (const l of doc.lines ?? []) {
    if (l.productId) out[l.productId] = posted[l.productId] ?? basis[l.productId]?.avgCost ?? 0;
  }
  return out;
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
async function handleRewrite(req: ApiRequest, res: ApiResponse, id: string) {
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
      issues: [],
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

async function handleDelete(req: ApiRequest, res: ApiResponse, id: string) {
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

async function handleOne(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleMaterialRequisition(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Defensive "seed on first request to this resource" — same pattern seedJobTypesIfEmpty()/
  // seedQuotationTemplatesIfEmpty() already established, guarded to run once per warm instance (see
  // ensureMaterialCatalogSeeded()'s own doc comment).
  await ensureMaterialCatalogSeeded();
  const parts = getPathSegments(req, "/api/material-requisitions");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1 && parts[0] === "store-sources") return handleStoreSources(req, res);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "issues") return handlePostIssueBatch(req, res, parts[0]);
  if (parts.length === 3 && parts[1] === "issues") return handleCancelIssueBatch(req, res, parts[0], parts[2]);
  // route เดิมที่รับยอดรวมสองช่อง ถูกแทนด้วย /issues ตั้งแต่ 2026-09-07 — เก็บไว้ตอบให้ชัดแทนที่จะ 404
  // เงียบ ๆ เพราะแท็บที่เปิดค้างไว้ก่อนอัปเดตยังยิงมาที่นี่ และเขียนต่อไม่ได้แล้วโดยไม่ทำรอบพัง
  if (parts.length === 2 && parts[1] === "issue") {
    throw new HttpError(400, "ระบบเปลี่ยนเป็นการจ่ายของเป็นรอบแล้ว กรุณารีเฟรชหน้าเว็บก่อนบันทึก");
  }
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
