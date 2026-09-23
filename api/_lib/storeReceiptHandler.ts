import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import type { Collection } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  storeReceiptsCollection, materialRequisitionsCollection, productsCollection, countersCollection, auditLogCollection,
  toObjectId, withStringId, type StoreReceiptFields, type MaterialRequisitionFields,
} from "./collections.js";
import { nextMonthlyDocumentNumber } from "./documentNumbering.js";
import { applyStockMovement, productCostBasis, returnUnitCostOf, postedUnitCostsByProduct, type StockMovementOrgTags } from "./stockHandler.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import { issuedQtyOf } from "../../src/lib/materialRequisition.js";
import {
  isStoreReceiptCode, storeReceiptCodeInfo, storeReceiptCounterKey, type StoreReceiptCode,
} from "../../src/lib/storeCodes.js";
import type {
  StoreReceiptLine, StoreReceiptSummary, StoreReceiptSourceLine, StoreReceiptSourceCandidate,
} from "../../src/lib/storeReceipt.js";

/**
 * ใบรับคืน / รับเข้าคลังของสโตร์ (2026-09-23) — ดูสามพฤติกรรมตามรหัสใน `src/lib/storeReceipt.ts`
 *
 * **สต๊อกเปลี่ยนที่ `POST /:id/post` เพียงจุดเดียว** และทำได้ครั้งเดียว หลังใบอนุมัติแล้ว โดยคนที่มี `stock:adjust`
 * (สโตร์) — แบบเดียวกับที่ใบเบิกตัดของตอนสโตร์จ่ายจริง ไม่ใช่ตอนอนุมัติ การอนุมัติจึงไม่แตะสต๊อกเลย
 *
 * ใช้สิทธิ์ชุด `materialRequisition:*` ของใบเบิก (ดู/สร้าง/แก้/อนุมัติ/พิมพ์/ลบ) ไม่สร้างสิทธิ์ใหม่ —
 * เป็นเอกสารคู่ของใบเบิกของสโตร์ คนที่ทำใบเบิกได้คือคนที่ทำใบคืนได้ และไม่มีบทบาทไหนต้องไปติ๊กสิทธิ์เพิ่ม
 */

const MAX_LINES = 200;

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบรับคืน (สโตร์)", action, details, createdAt: nowIso(),
  });
}

function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "materialRequisition:edit")) return false;
  return !doc.createdBy || doc.createdBy === ctx.user.id || roleHasPermission(ctx.role, "materialRequisition:viewAll");
}

function isObjectIdLike(v: string): boolean {
  return /^[a-f0-9]{24}$/i.test(v);
}

function toClient(doc: StoreReceiptFields & { _id: string }) {
  return withStringId(withApprovalDefaults({
    ...doc,
    documentNumber: doc.documentNumber || doc._id,
    lines: doc.lines ?? [],
    stockMovementIds: doc.stockMovementIds ?? [],
  }));
}

function toSummary(doc: StoreReceiptFields & { _id: string }): StoreReceiptSummary {
  return {
    id: doc._id, documentNumber: doc.documentNumber || doc._id, receiptCode: doc.receiptCode,
    status: doc.status, posted: !!doc.postedAt, jobCode: doc.jobCode ?? "", reference: doc.reference ?? "",
    sourceRequisitionNumber: doc.sourceRequisitionNumber ?? "",
    chargeDepartmentName: doc.chargeDepartmentName ?? "", chargeTeamName: doc.chargeTeamName ?? "",
    updatedAt: doc.updatedAt,
  };
}

async function loadOrThrow(id: string) {
  const col = await storeReceiptsCollection();
  const doc = await col.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบรับคืน");
  return doc;
}

/** ใบเบิกต้นทางของใบคืน — ต้องเป็นใบของสโตร์ รหัสคู่กัน และอนุมัติแล้ว */
async function loadSourceRequisition(receiptCode: StoreReceiptCode, requisitionId: string) {
  const pair = storeReceiptCodeInfo(receiptCode).pair;
  const col = await materialRequisitionsCollection();
  const mr = await col.findOne({ _id: requisitionId });
  if (!mr || mr.isDeleted) throw new HttpError(404, "ไม่พบใบเบิกต้นทาง");
  if (mr.ownerDepartment !== "store" || mr.issueCode !== pair) {
    throw new HttpError(400, `ใบรับคืน ${receiptCode} คืนของได้เฉพาะใบเบิกรหัส ${pair}`);
  }
  if (mr.status !== "Final") throw new HttpError(400, "ใบเบิกต้นทางต้องอนุมัติแล้ว");
  return mr;
}

function sourceLinesOf(mr: MaterialRequisitionFields): StoreReceiptSourceLine[] {
  return (mr.lines ?? []).map((l) => ({
    lineId: l.id, productId: l.productId, productCode: l.productCode, productName: l.productName, unit: l.unit,
    issued: issuedQtyOf(l), returned: l.returnQty ?? 0,
  }));
}

async function stockByProductFor(lines: StoreReceiptLine[]): Promise<Record<string, number>> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((id) => id && isObjectIdLike(id)))];
  if (ids.length === 0) return {};
  const products = await productsCollection();
  const docs = await products.find({ _id: { $in: ids.map((id) => toObjectId(id)) } }, { projection: { stockQty: 1 } }).toArray();
  return Object.fromEntries(docs.map((p) => [p._id.toString(), p.stockQty ?? 0]));
}

async function bundleOf(doc: StoreReceiptFields & { _id: string }) {
  const kind = storeReceiptCodeInfo(doc.receiptCode).kind;
  let sourceLines: StoreReceiptSourceLine[] = [];
  if (kind === "return" && doc.sourceRequisitionId) {
    const col = await materialRequisitionsCollection();
    const mr = await col.findOne({ _id: doc.sourceRequisitionId });
    if (mr) sourceLines = sourceLinesOf(mr);
  }
  return { storeReceipt: toClient(doc), stockByProduct: await stockByProductFor(doc.lines ?? []), sourceLines };
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  const ctx = await requirePermission(req, "materialRequisition:view");
  const col = await storeReceiptsCollection();
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "materialRequisition:viewAll"), "createdBy");
  const docs = await col.find({ isDeleted: false, ...ownership }).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ storeReceipts: docs.map(toSummary) });
}

async function handleCreate(req: ApiRequest, res: ApiResponse) {
  const ctx = await requirePermission(req, "materialRequisition:create");
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!isStoreReceiptCode(body.receiptCode)) throw new HttpError(400, "กรุณาเลือกรหัสการรับ");
  const receiptCode = body.receiptCode;
  const counters = await countersCollection();
  const id = await nextMonthlyDocumentNumber(counters, receiptCode, storeReceiptCounterKey(receiptCode));
  const now = nowIso();
  const doc: StoreReceiptFields & { _id: string } = {
    _id: id, documentNumber: id, receiptCode,
    sourceRequisitionId: "", sourceRequisitionNumber: "",
    jobCode: "", customerName: "", reference: "", reason: "",
    receivedDate: now.slice(0, 10),
    chargeDepartmentId: "", chargeDepartmentName: "", chargeTeamId: "", chargeTeamName: "",
    lines: [],
    returnedBy: "", receivedBy: ctx.user.fullName,
    preparedBy: ctx.user.fullName, preparedAt: now.slice(0, 10),
    approvedBy: "", approvedAt: "", approvedByUserId: "", rejectionComment: "",
    storeDeptBy: "", storeDeptAt: "", costDeptBy: "", costDeptAt: "",
    status: "Draft",
    postedAt: "", postedBy: "", postedByName: "", stockMovementIds: [],
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  const col = await storeReceiptsCollection();
  await col.insertOne(doc);
  await writeAuditEntry(ctx, "Store Receipt Created", `สร้างใบรับคืน ${id} (${receiptCode})`);
  res.status(201).json({ storeReceipt: toClient(doc) });
}

/**
 * รายการของใบรับตามพฤติกรรมของรหัส — ชื่อ/รหัส/หน่วยอ่านจากทะเบียนสินค้า (หรือจากบรรทัดใบเบิกต้นทาง) เสมอ
 * ไม่เชื่อค่าที่หน้าจอส่งมา · ตรวจเพดานการคืนตรงนี้ และตรวจซ้ำอีกรอบตอนรับเข้าคลัง (ยอดใบเบิกอาจขยับระหว่างนั้น)
 */
async function sanitizeLines(raw: unknown, doc: StoreReceiptFields & { _id: string }): Promise<StoreReceiptLine[]> {
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  const kind = storeReceiptCodeInfo(doc.receiptCode).kind;
  const rows = raw as Record<string, unknown>[];
  const idOf = (r: Record<string, unknown>) => (typeof r.id === "string" && /^srline_[A-Za-z0-9_]{4,60}$/.test(r.id) ? r.id : `srline_${Math.random().toString(36).slice(2, 12)}`);

  if (kind === "return") {
    if (!doc.sourceRequisitionId) throw new HttpError(400, "กรุณาเลือกใบเบิกต้นทางก่อน");
    const mr = await loadSourceRequisition(doc.receiptCode, doc.sourceRequisitionId);
    const byLine = new Map(sourceLinesOf(mr).map((s) => [s.lineId, s]));
    const seen = new Set<string>();
    return rows.map((r, idx) => {
      const src = byLine.get(typeof r.sourceLineId === "string" ? r.sourceLineId : "");
      if (!src) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ไม่พบบรรทัดนี้ในใบเบิกต้นทาง`);
      if (seen.has(src.lineId)) throw new HttpError(400, `${src.productName}: ส่งบรรทัดเดียวกันมาซ้ำ`);
      seen.add(src.lineId);
      const qty = sanitizeNullableNumber(r.qty, `คืนครั้งนี้ (${src.productName})`);
      const room = Math.max(0, src.issued - src.returned);
      if ((qty ?? 0) > room) throw new HttpError(400, `${src.productName}: คืนได้อีกไม่เกิน ${room} ${src.unit}`);
      return {
        id: idOf(r), productId: src.productId, productCode: src.productCode, productName: src.productName, unit: src.unit,
        qty, unitCost: null, sourceLineId: src.lineId,
      };
    });
  }

  const productIds = [...new Set(rows.map((r) => (typeof r.productId === "string" ? r.productId : "")).filter((id) => id && isObjectIdLike(id)))];
  const products = await productsCollection();
  const found = productIds.length
    ? await products.find({ _id: { $in: productIds.map((id) => toObjectId(id)) } }, { projection: { code: 1, name: 1, unit: 1 } }).toArray()
    : [];
  const byId = new Map(found.map((p) => [p._id.toString(), p]));
  const seen = new Set<string>();
  return rows.map((r, idx) => {
    const productId = typeof r.productId === "string" ? r.productId : "";
    const p = byId.get(productId);
    if (!p) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: กรุณาเลือกสินค้าจากแคตตาล็อก`);
    // ปรับยอดสินค้าตัวเดียวกันสองบรรทัดในใบเดียว ไม่มีความหมาย (ยอดที่ถูกต้องมีได้ค่าเดียว)
    if (kind === "adjust" && seen.has(productId)) throw new HttpError(400, `${p.name}: มีสินค้านี้ในใบแล้ว`);
    seen.add(productId);
    const qty = sanitizeNullableNumber(r.qty, kind === "adjust" ? `ยอดที่ถูกต้อง (${p.name})` : `จำนวนรับ (${p.name})`);
    const unitCost = kind === "receive" ? sanitizeNullableNumber(r.unitCost, `ต้นทุนต่อหน่วย (${p.name})`) : null;
    return { id: idOf(r), productId, productCode: p.code ?? "", productName: p.name ?? "", unit: p.unit ?? "", qty, unitCost };
  });
}

const SHORT_TEXT: { key: keyof StoreReceiptFields; label: string }[] = [
  { key: "documentNumber", label: "เลขที่ใบ" },
  { key: "jobCode", label: "รหัสงาน" },
  { key: "customerName", label: "ลูกค้า" },
  { key: "reference", label: "เลขอ้างอิง" },
  { key: "returnedBy", label: "ผู้คืน / ผู้ส่งมอบ" },
  { key: "receivedBy", label: "ผู้รับเข้าคลัง" },
  { key: "preparedBy", label: "ผู้จัดทำ" },
  { key: "approvedBy", label: "ผู้อนุมัติ" },
  { key: "storeDeptBy", label: "แผนกสโตร์" },
  { key: "costDeptBy", label: "แผนกต้นทุน" },
];
const DATE_FIELDS: { key: keyof StoreReceiptFields; label: string }[] = [
  { key: "receivedDate", label: "วันที่รับ" },
  { key: "preparedAt", label: "วันที่จัดทำ" },
  { key: "approvedAt", label: "วันที่อนุมัติ" },
  { key: "storeDeptAt", label: "วันที่แผนกสโตร์" },
  { key: "costDeptAt", label: "วันที่แผนกต้นทุน" },
];

/**
 * เลขที่ใบคืน = รหัสรับ + **เลขเดียวกับใบเบิกต้นทาง** (2026-09-23) — เจ้าของ: *"รหัสมันจะไม่ตรงกันแต่อยากให้เลข …
 * ด้านหลังมันตรงกันทั้งหมด เพราะก่อนหน้านี้ … เลขมันไม่ตรงกันแล้วมันหากันยาก"* · ใบเบิก `P1-202609-0027` → ใบคืน
 * `J1-202609-0027` · คืนจากใบเบิกเดียวกันหลายครั้ง ใบที่สองเป็นต้นไปต่อท้าย `/2`, `/3`
 *
 * `_id` ยังเป็นเลขรันของตัวนับตอนสร้าง (เปลี่ยน `_id` ไม่ได้) — เลขที่คนเห็นคือ `documentNumber` ซึ่งรายการ ใบพิมพ์
 * ประวัติสต๊อก และการค้นหาใช้อยู่แล้ว · นับชนเฉพาะใบคืนที่ผูกใบเบิกแล้ว — ใบร่างที่ยังไม่เลือกใบเบิกถือเลขรันชั่วคราว
 * ถ้าเอามานับด้วย ใบที่เลขรันบังเอิญตรงจะดันใบจริงไปเป็น `/2`
 */
async function pairedDocumentNumber(receiptCode: StoreReceiptCode, requisitionNumber: string, selfId: string): Promise<string> {
  const dash = requisitionNumber.indexOf("-");
  const base = `${receiptCode}-${dash > 0 ? requisitionNumber.slice(dash + 1) : requisitionNumber}`;
  const col = await storeReceiptsCollection();
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base}/${n}`;
    const clash = await col.findOne({ _id: { $ne: selfId }, isDeleted: false, sourceRequisitionId: { $gt: "" }, documentNumber: candidate });
    if (!clash) return candidate;
  }
  return selfId;
}

async function handleUpdate(req: ApiRequest, res: ApiResponse, id: string) {
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") {
    throw new HttpError(autoSave ? 409 : 400, doc.status === "Final"
      ? "ใบนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้"
      : "ใบนี้กำลังรออนุมัติ ต้องถอนการขออนุมัติก่อนจึงจะแก้ไขได้");
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const kind = storeReceiptCodeInfo(doc.receiptCode).kind;
  const update: Partial<StoreReceiptFields> = {};
  for (const f of SHORT_TEXT) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  if ("documentNumber" in body) {
    update.documentNumber = (update.documentNumber as string) || id;
    // ตรวจชนเฉพาะตอนเลขเปลี่ยนจริง — หน้าจอส่งเลขเดิมมาทุกครั้งที่บันทึก และเลขที่ตามใบเบิก (pairedDocumentNumber)
    // อาจบังเอิญตรงกับเลขรันชั่วคราวของใบร่างอื่นที่ยังไม่เลือกใบเบิก ซึ่งไม่ควรทำให้บันทึกไม่ได้
    if (update.documentNumber !== (doc.documentNumber || id)) {
      const col = await storeReceiptsCollection();
      const clash = await col.findOne({ documentNumber: update.documentNumber, _id: { $ne: id }, isDeleted: false });
      if (clash) throw new HttpError(409, `เลขที่ ${update.documentNumber} ถูกใช้แล้ว`);
    }
  }
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);
  if ("reason" in body) update.reason = sanitizeLongText(body.reason, "เหตุผล");

  // เลือก/เปลี่ยนใบเบิกต้นทาง = ตั้งหัวใบตามใบเบิกนั้น และล้างรายการเดิม (รายการเดิมอ้างบรรทัดของใบเบิกอีกใบ)
  if (kind === "return" && "sourceRequisitionId" in body && body.sourceRequisitionId !== doc.sourceRequisitionId) {
    const mrId = typeof body.sourceRequisitionId === "string" ? body.sourceRequisitionId.trim() : "";
    if (!mrId) {
      Object.assign(update, { sourceRequisitionId: "", sourceRequisitionNumber: "", lines: [] });
    } else {
      const mr = await loadSourceRequisition(doc.receiptCode, mrId);
      Object.assign(update, {
        sourceRequisitionId: mr._id, sourceRequisitionNumber: mr.documentNumber || mr._id,
        jobCode: mr.jobCode ?? "", customerName: mr.customerName ?? "",
        chargeDepartmentId: mr.chargeDepartmentId ?? "", chargeDepartmentName: mr.chargeDepartmentName ?? "",
        chargeTeamId: mr.chargeTeamId ?? "", chargeTeamName: mr.chargeTeamName ?? "",
        // ตั้งรายการให้ครบทุกบรรทัดที่ยังคืนได้ จำนวนว่างไว้ให้กรอก
        lines: sourceLinesOf(mr).filter((s) => s.issued - s.returned > 0).map((s) => ({
          id: `srline_${s.lineId.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || Math.random().toString(36).slice(2, 10)}`,
          productId: s.productId, productCode: s.productCode, productName: s.productName, unit: s.unit,
          qty: null, unitCost: null, sourceLineId: s.lineId,
        })),
      });
    }
    // เลขที่ใบคืนตามใบเบิก (คำสั่งเจ้าของ 2026-09-23 "ขอแก้แบบเร็วๆด่วน") — ดู pairedDocumentNumber()
    // ชนะเลขที่หน้าจอส่งมาพร้อมกันเสมอ (หน้าจอส่ง documentNumber เดิมมาทุกครั้งที่บันทึก)
    update.documentNumber = update.sourceRequisitionNumber
      ? await pairedDocumentNumber(doc.receiptCode, update.sourceRequisitionNumber, id)
      : id;
  } else if ("lines" in body) {
    update.lines = await sanitizeLines(body.lines, { ...doc, ...update });
  }

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const col = await storeReceiptsCollection();
  await col.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  if (!autoSave) await writeAuditEntry(ctx, "Store Receipt Updated", `แก้ไขใบรับคืน ${id}`);
  res.status(200).json(await bundleOf(updated));
}

async function handleSourceCandidates(req: ApiRequest, res: ApiResponse) {
  await requirePermission(req, "materialRequisition:view");
  const code = req.query.receiptCode;
  if (!isStoreReceiptCode(code)) throw new HttpError(400, "รหัสการรับไม่ถูกต้อง");
  const pair = storeReceiptCodeInfo(code).pair;
  if (!pair) {
    res.status(200).json({ requisitions: [] });
    return;
  }
  // ไม่กรองเจ้าของใบ — สโตร์รับคืนของที่ใครเบิกไปก็ได้ ของกลับเข้าคลังเดียวกัน
  const col = await materialRequisitionsCollection();
  const docs = await col.find({ isDeleted: false, ownerDepartment: "store", issueCode: pair, status: "Final" }).sort({ updatedAt: -1 }).limit(300).toArray();
  const requisitions: StoreReceiptSourceCandidate[] = docs
    .filter((d) => (d.lines ?? []).some((l) => issuedQtyOf(l) - (l.returnQty ?? 0) > 0))
    .map((d) => ({
      id: d._id, documentNumber: d.documentNumber || d._id, jobCode: d.jobCode ?? "", storeReference: d.storeReference ?? "",
      chargeDepartmentName: d.chargeDepartmentName ?? "", chargeTeamName: d.chargeTeamName ?? "", updatedAt: d.updatedAt,
    }));
  res.status(200).json({ requisitions });
}

async function handleDelete(req: ApiRequest, res: ApiResponse, id: string) {
  const ctx = await requirePermission(req, "materialRequisition:delete");
  const doc = await loadOrThrow(id);
  if (doc.postedAt) throw new HttpError(400, "ใบนี้รับเข้าคลังแล้ว ลบไม่ได้ — ถ้าผิดให้ออกใบปรับยอด (JU) แก้");
  const col = await storeReceiptsCollection();
  await col.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Store Receipt Deleted", `ลบใบรับคืน ${id}`);
  res.status(204).end();
}

/**
 * รับเข้าคลัง — จุดเดียวที่ใบรับคืนแตะสต๊อก ทำได้ครั้งเดียวหลังอนุมัติ
 *
 * ตรวจทุกบรรทัดให้ครบก่อนเขียนแถวแรก (กันรับเข้าไปครึ่งใบ) แล้วแยกตามพฤติกรรม:
 *  - return: ตรวจเพดานกับใบเบิกต้นทาง **อีกรอบด้วยยอดล่าสุด** → ลง `return` ด้วยราคาซื้อล่าสุด (กติกาเดียวกับ
 *    การคืนในใบเบิก 2026-09-09) → บวก `returnQty` ของบรรทัดใบเบิกต้นทาง
 *  - receive: ลง `receive` พร้อมต้นทุน (ถัวเฉลี่ยใหม่) · ไม่มีต้นทุน = ใช้ต้นทุนเฉลี่ยเดิม · GC (ของลูกค้า) ไม่คิดมูลค่า
 *  - adjust: ส่วนต่างระหว่างยอดที่ถูกต้องกับยอด ณ ตอนกด → `adjust` · เท่าเดิมข้าม
 */
async function handlePost(req: ApiRequest, res: ApiResponse, id: string) {
  const ctx = await requirePermission(req, "stock:adjust");
  const doc = await loadOrThrow(id);
  if (doc.status !== "Final") throw new HttpError(400, "ใบรับคืนต้องอนุมัติก่อนจึงจะรับเข้าคลังได้");
  if (doc.postedAt) throw new HttpError(400, "ใบนี้รับเข้าคลังไปแล้ว");
  const info = storeReceiptCodeInfo(doc.receiptCode);
  const lines = (doc.lines ?? []).filter((l) => info.kind === "adjust" ? l.qty !== null && l.qty !== undefined : (l.qty ?? 0) > 0);
  if (lines.length === 0) throw new HttpError(400, "ไม่มีรายการที่ต้องรับเข้าคลัง");
  const label = doc.documentNumber || id;
  const org: StockMovementOrgTags = {
    departmentId: doc.chargeDepartmentId || undefined, departmentName: doc.chargeDepartmentName || undefined,
    teamId: doc.chargeTeamId || undefined, teamName: doc.chargeTeamName || undefined,
  };
  const base = { sourceType: "store_receipt" as const, sourceId: id, sourceLabel: label, userId: ctx.user.id, org };
  const movementIds: string[] = [];

  if (info.kind === "return") {
    const mr = await loadSourceRequisition(doc.receiptCode, doc.sourceRequisitionId);
    const byLine = new Map((mr.lines ?? []).map((l) => [l.id, l]));
    const addBack = new Map<string, number>();
    for (const l of lines) {
      const src = byLine.get(l.sourceLineId ?? "");
      if (!src) throw new HttpError(400, `${l.productName}: ไม่พบบรรทัดนี้ในใบเบิกต้นทางแล้ว`);
      const room = issuedQtyOf(src) - (src.returnQty ?? 0) - (addBack.get(src.id) ?? 0);
      if ((l.qty ?? 0) > room) throw new HttpError(400, `${l.productName}: คืนได้อีกไม่เกิน ${Math.max(0, room)} ${l.unit}`);
      addBack.set(src.id, (addBack.get(src.id) ?? 0) + (l.qty ?? 0));
    }
    const costs = await productCostBasis([...new Set(lines.map((l) => l.productId))]);
    for (const l of lines) {
      const { movement } = await applyStockMovement({
        ...base, productId: l.productId, kind: "return", delta: l.qty!,
        reason: `รับคืนตามใบ ${label} (คืนจากใบเบิก ${doc.sourceRequisitionNumber})`,
        rowUnitCost: returnUnitCostOf(costs[l.productId]),
      });
      movementIds.push(movement.id);
    }
    const mrCol = await materialRequisitionsCollection();
    await mrCol.updateOne({ _id: mr._id }, {
      $set: {
        lines: (mr.lines ?? []).map((l) => (addBack.has(l.id) ? { ...l, returnQty: (l.returnQty ?? 0) + addBack.get(l.id)! } : l)),
        returnedBy: doc.returnedBy || mr.returnedBy || "", returnReceivedBy: doc.receivedBy || mr.returnReceivedBy || "",
        returnedAt: nowIso(), updatedAt: nowIso(), updatedBy: ctx.user.id,
      },
    });
  } else if (info.kind === "receive") {
    for (const l of lines) {
      const customerGoods = doc.receiptCode === "GC";
      const { movement } = await applyStockMovement({
        ...base, productId: l.productId, kind: "receive", delta: l.qty!,
        reason: `รับเข้าคลังตามใบ ${label}${doc.reference ? ` (อ้างอิง ${doc.reference})` : ""}`,
        ...(customerGoods ? { rowUnitCost: 0 } : l.unitCost !== null && l.unitCost !== undefined ? { unitCost: l.unitCost } : {}),
      });
      movementIds.push(movement.id);
    }
  } else {
    if (!doc.reason.trim()) throw new HttpError(400, "กรุณาระบุเหตุผลการปรับยอด");
    const products = await productsCollection();
    for (const l of lines) {
      const live = await products.findOne({ _id: toObjectId(l.productId) }, { projection: { stockQty: 1 } });
      const delta = Math.round(((l.qty ?? 0) - (live?.stockQty ?? 0)) * 10000) / 10000;
      if (delta === 0) continue;
      const { movement } = await applyStockMovement({
        ...base, productId: l.productId, kind: "adjust", delta,
        reason: `ปรับยอดตามใบ ${label} (ตั้งเป็น ${l.qty}) — ${doc.reason}`,
      });
      movementIds.push(movement.id);
    }
  }

  const now = nowIso();
  const col = await storeReceiptsCollection();
  await col.updateOne({ _id: id }, {
    $set: { postedAt: now, postedBy: ctx.user.id, postedByName: ctx.user.fullName, stockMovementIds: movementIds, updatedAt: now, updatedBy: ctx.user.id },
  });
  await writeAuditEntry(ctx, "Store Receipt Posted", `รับเข้าคลังตามใบ ${label} (${movementIds.length} รายการ)`);
  res.status(200).json(await bundleOf(await loadOrThrow(id)));
}

async function handlePrint(req: ApiRequest, res: ApiResponse, id: string) {
  const ctx = await requirePermission(req, "materialRequisition:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Store Receipt Printed", `พิมพ์ใบรับคืน ${id}`);
  res.status(200).json({ unitCostByProduct: await printUnitCostsFor(doc) });
}

/**
 * ต้นทุนต่อหน่วยสำหรับใบพิมพ์ (2026-09-23 — ฟอร์มโปรแกรมบัญชีเดิมมีช่อง หน่วยละ/รวม) · รับเข้าคลังแล้ว = ต้นทุนที่ลง
 * สต๊อกจริง · ยังไม่รับเข้า = ราคาที่ `handlePost()` จะใช้: คืน = ราคาซื้อล่าสุด, รับเข้า = ต้นทุนที่กรอก (ไม่กรอก = เฉลี่ย,
 * GC = 0), ปรับยอด = ต้นทุนเฉลี่ย
 */
async function printUnitCostsFor(doc: StoreReceiptFields): Promise<Record<string, number>> {
  const kind = storeReceiptCodeInfo(doc.receiptCode).kind;
  const posted = await postedUnitCostsByProduct(doc.stockMovementIds ?? []);
  const lines = (doc.lines ?? []).filter((l) => l.productId);
  const basis = await productCostBasis(lines.map((l) => l.productId));
  const out: Record<string, number> = {};
  for (const l of lines) {
    if (posted[l.productId] !== undefined) { out[l.productId] = posted[l.productId]; continue; }
    const b = basis[l.productId];
    out[l.productId] = kind === "return" ? (returnUnitCostOf(b) ?? 0)
      : kind === "receive" ? (doc.receiptCode === "GC" ? 0 : l.unitCost ?? b?.avgCost ?? 0)
        : (b?.avgCost ?? 0);
  }
  return out;
}

const approvalConfig: ApprovalConfig<StoreReceiptFields & { _id: string }> = {
  label: "ใบรับคืน",
  approvePermission: "materialRequisition:finalize",
  // แจ้งคนที่กดอนุมัติได้ตอนส่งขออนุมัติ (2026-09-23) — เดิมขึ้นแค่ในกล่อง "เอกสารรออนุมัติ"
  submitNotification: {
    type: "store_receipt_submitted", module: "ใบรับคืน (สโตร์)",
    relatedField: "relatedStoreReceiptId",
    context: (doc) => doc.sourceRequisitionNumber || doc.jobCode || doc.reference || "",
  },
  collection: async () => (await storeReceiptsCollection()) as unknown as Collection<StoreReceiptFields & { _id: string }>,
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail) => writeAuditEntry(ctx, action, detail),
  // ใบที่ไม่มีอะไรให้รับเข้า อนุมัติไปก็รับเข้าคลังไม่ได้ — ตรวจตั้งแต่ตอนอนุมัติ ไม่ใช่ปล่อยไปติดตอนสโตร์กด
  beforeApprove: async (_ctx, doc) => {
    const kind = storeReceiptCodeInfo(doc.receiptCode).kind;
    const usable = (doc.lines ?? []).filter((l) => kind === "adjust" ? l.qty !== null && l.qty !== undefined : (l.qty ?? 0) > 0);
    if (usable.length === 0) throw new HttpError(400, "ใบรับคืนยังไม่มีรายการ");
    if (kind === "adjust" && !doc.reason.trim()) throw new HttpError(400, "กรุณาระบุเหตุผลการปรับยอดก่อนอนุมัติ");
  },
  respond: (res, doc) => res.status(200).json({ storeReceipt: toClient(doc) }),
};

export async function handleStoreReceipt(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/store-receipts");
  await requireUser(req);
  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    if (req.method === "GET") return handleList(req, res);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 1 && parts[0] === "source-requisitions") {
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
    return handleSourceCandidates(req, res);
  }
  const id = parts[0];
  if (parts.length === 1) {
    if (req.method === "GET") {
      await requirePermission(req, "materialRequisition:view");
      res.status(200).json(await bundleOf(await loadOrThrow(id)));
      return;
    }
    if (req.method === "PATCH") return handleUpdate(req, res, id);
    if (req.method === "DELETE") return handleDelete(req, res, id);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 2 && req.method === "POST") {
    switch (parts[1]) {
      case "submit-approval": return handleSubmitApproval(req, res, id, approvalConfig);
      case "approve": return handleApprove(req, res, id, approvalConfig);
      case "reject": return handleReject(req, res, id, approvalConfig);
      case "withdraw-approval": return handleWithdrawApproval(req, res, id, approvalConfig);
      case "post": return handlePost(req, res, id);
      case "print": return handlePrint(req, res, id);
    }
  }
  throw new HttpError(404, "Not found");
}
