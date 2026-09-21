import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { nextMonthlyDocumentNumber } from "./documentNumbering.js";
import type { Collection } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  purchaseOrdersCollection, purchaseRequestsCollection, productsCollection, countersCollection,
  auditLogCollection, toObjectId, withStringId, type PurchaseOrderFields, type CounterFields,
  vendorsCollection, usersCollection, receivingReportsCollection,
} from "./collections.js";
import { vendorApprovalStatusOf } from "../../src/lib/vendors.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import { getRevisionRoot } from "../../src/lib/revisionDiff.js";
import type { PurchaseOrderLine, PurchaseOrderSummary } from "../../src/lib/purchaseOrder.js";

/**
 * ใบสั่งซื้อ (Purchase Order) API — added 2026-08-28 with the Purchasing module. Mounted from
 * `api/handlers/quotes.ts` alongside every other document handler (the 12-function-slot constraint
 * documented there). See `src/lib/purchaseOrder.ts` for the domain-shape doc comment.
 *
 * Created from an **approved** Purchase Request, copying its lines as a snapshot — editing a PO
 * never touches the PR. A PO with no source PR is allowed (`purchaseRequestId: ""`), because
 * Purchasing sometimes buys without a formal request.
 */

const MAX_LINES = 200;

async function nextPurchaseOrderId(counters: Collection<CounterFields>): Promise<string> {
  return nextMonthlyDocumentNumber(counters, "PO", "purchase_order");
}

/**
 * `documentNumber` ต้องไม่ซ้ำ แต่ `ensureIndexes()` ใน collections.ts รันแค่ตอน Setup Wizard ครั้งเดียว
 * ฐานข้อมูลที่ติดตั้งไปแล้วจึงไม่มีวันได้ index นี้ — สร้างเองแบบ lazy ครั้งเดียวต่อ instance
 * (แนวเดียวกับ `ensureProductionOrderNumberIndex()`) ห่อ try/catch ไว้เพราะถ้ามีเลขซ้ำค้างอยู่ก่อน
 * การสร้าง index จะล้มเหลว และต้องไม่ให้มันบล็อกการสร้างเอกสารใหม่ทั้งหมด
 */
let numberIndexEnsured = false;
async function ensurePurchaseOrderNumberIndex(col: Collection<PurchaseOrderFields & { _id: string }>): Promise<void> {
  if (numberIndexEnsured) return;
  numberIndexEnsured = true;
  try {
    await col.updateMany(
      { $or: [{ documentNumber: { $exists: false } }, { documentNumber: "" }] },
      [{ $set: { documentNumber: "$_id" } }],
    );
    await col.createIndex({ documentNumber: 1 }, { unique: true });
  } catch (err) {
    console.error("[purchaseOrder] ensure documentNumber index failed", err);
  }
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบสั่งซื้อ", action, details, createdAt: nowIso(),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "purchaseOrder:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "purchaseOrder:finalize");
}

/**
 * `productId` เป็น optional เหมือนใบขอซื้อ — จัดซื้อสั่งของที่ยังไม่มีรหัสในคลังเป็นเรื่องปกติ
 * (โมดูล "คำขอเพิ่มสินค้า" มีอยู่ก็เพราะรหัสถูกตั้งทีหลัง) ถ้าผูกกับสินค้าจริง รหัส/ชื่อ/หน่วย
 * ถูก **ดึงจากฐานข้อมูลฝั่งเซิร์ฟเวอร์** ไม่เชื่อค่าที่ client ส่งมา
 */
/** ช่องยกเลิกของหนึ่งบรรทัด — ติ๊กยกเลิกแล้วต้องมีเหตุผลเสมอ */
function cancellationOf(r: Record<string, unknown>, idx: number): { cancelled: boolean; cancelRemark: string } {
  const cancelled = r.cancelled === true;
  const cancelRemark = sanitizeShortText(r.cancelRemark, `หมายเหตุการยกเลิกลำดับที่ ${idx + 1}`);
  if (cancelled && !cancelRemark) {
    throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: กรุณาระบุหมายเหตุการยกเลิก`);
  }
  // ไม่ได้ยกเลิกก็ไม่เก็บหมายเหตุค้างไว้ ไม่งั้นติ๊กออกแล้วเหตุผลเก่าจะโผล่กลับมาตอนติ๊กใหม่
  return { cancelled, cancelRemark: cancelled ? cancelRemark : "" };
}

async function sanitizeLines(raw: unknown, existing: PurchaseOrderLine[] = []): Promise<PurchaseOrderLine[]> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  const rows = raw as Record<string, unknown>[];
  // ตัวชี้กลับไปบรรทัดของใบขอซื้อไม่รับจาก PATCH — อ่านค่าเดิมกลับด้วย line id แทน ไม่งั้นไคลเอนต์
  // ย้ายตัวชี้ไปบรรทัดอื่นได้ แล้วบรรทัดที่ซื้อไปแล้วจะกลับมาซื้อได้อีก (แพตเทิร์นเดียวกับ
  // `storeDecision` ใน purchaseRequestHandler.ts)
  const existingById = new Map(existing.map((l) => [l.id, l]));

  const productIds = [...new Set(rows.map((r) => (typeof r.productId === "string" ? r.productId : "")).filter(Boolean))];
  const products = await productsCollection();
  const productDocs = productIds.length > 0 ? await products.find({ _id: { $in: productIds.map((pid) => toObjectId(pid)) } }).toArray() : [];
  const productById = new Map(productDocs.map((p) => [p._id.toString(), p]));

  return rows.map((r, idx) => {
    const productId = typeof r.productId === "string" ? r.productId : "";
    const product = productId ? productById.get(productId) : undefined;
    if (productId && !product) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ไม่พบสินค้าที่ระบุ`);
    return {
      id: typeof r.id === "string" && r.id ? r.id : newId("poline"),
      subDetails: (Array.isArray(r.subDetails) ? r.subDetails : [])
        .map((sd, i) => sanitizeShortText(sd, `รายละเอียดย่อยลำดับที่ ${idx + 1}.${i + 1}`))
        .filter(Boolean),
      productId: productId || null,
      productCode: product ? product.code : sanitizeShortText(r.productCode, `รหัสสินค้าลำดับที่ ${idx + 1}`),
      description: product ? product.name : sanitizeShortText(r.description, `รายละเอียดลำดับที่ ${idx + 1}`, true),
      unit: product ? product.unit : sanitizeShortText(r.unit, `หน่วยลำดับที่ ${idx + 1}`),
      qty: sanitizeNullableNumber(r.qty, `จำนวนลำดับที่ ${idx + 1}`),
      unitPrice: sanitizeNullableNumber(r.unitPrice, `ราคาต่อหน่วยลำดับที่ ${idx + 1}`),
      // ส่วนลดรายบรรทัด (2026-08-31) — โหมดที่ไม่รู้จักถือเป็นเปอร์เซ็นต์ ตรงกับที่ quoteMath ทำ
      discount: sanitizeNullableNumber(r.discount, `ส่วนลดลำดับที่ ${idx + 1}`),
      discountMode: r.discountMode === "amount" ? "amount" as const : "percent" as const,
      // สามช่องที่ดึงมาจากใบขอซื้อ
      neededByDate: validateIsoDateOrEmpty(r.neededByDate, `วันต้องการลำดับที่ ${idx + 1}`),
      departmentCode: sanitizeShortText(r.departmentCode, `แผนกลำดับที่ ${idx + 1}`),
      costCode: sanitizeShortText(r.costCode, `รหัสบัญชีลำดับที่ ${idx + 1}`),
      sourcePrLineId: existingById.get(typeof r.id === "string" ? r.id : "")?.sourcePrLineId ?? "",
      // ยกเลิกรายการ (2026-09-21) — **เหตุผลบังคับ** เจ้าของขอสองอย่างนี้มาคู่กัน
      // การยกเลิกที่ไม่มีเหตุผลอธิบายไม่ได้ตอนผู้ขายโทรมาถามว่าทำไมของหาย
      ...cancellationOf(r, idx),
      remark: sanitizeShortText(r.remark, `หมายเหตุลำดับที่ ${idx + 1}`),
    };
  });
}

function toClient(doc: PurchaseOrderFields & { _id: string }) {
  // เอกสารเก่าที่ยังไม่มีฟิลด์เหล่านี้ — เติมตอนอ่านเสมอ ไม่ทำ migration (แนวเดียวกับทุกโมดูล)
  return withStringId(withApprovalDefaults({
    ...doc,
    documentNumber: doc.documentNumber || doc._id,
    // ใบก่อน 2026-09-21 ไม่มี `vendorId` — เติมเป็น "" ตอนอ่าน ไม่ทำ migration
    vendorId: doc.vendorId ?? "",
    intendedApproverUserId: doc.intendedApproverUserId ?? "",
    intendedApproverName: doc.intendedApproverName ?? "",
    lines: (doc.lines ?? []).map((l) => ({ ...l, subDetails: l.subDetails ?? [] })),
    revisionNote: doc.revisionNote ?? "",
  }));
}

function toSummary(doc: PurchaseOrderFields & { _id: string }): PurchaseOrderSummary {
  const full = withStringId(doc);
  return {
    id: full.id,
    documentNumber: full.documentNumber || full.id,
    purchaseRequestId: full.purchaseRequestId,
    jobCode: full.jobCode,
    vendorName: full.vendorName,
    neededByDate: full.neededByDate,
    status: full.status,
    updatedAt: full.updatedAt,
  };
}

async function loadOrThrow(id: string) {
  const purchaseOrders = await purchaseOrdersCollection();
  const doc = await purchaseOrders.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งซื้อ");
  return doc;
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseOrder:view");
  const purchaseRequestId = typeof req.query.purchaseRequestId === "string" ? req.query.purchaseRequestId : "";

  // การค้นด้วยใบขอซื้อต้นทางเป็น "เช็คว่าออก PO ไปหรือยัง" ไม่ใช่การเปิดดูรายการ จึงไม่กรองเจ้าของ
  // — ถ้ากรอง ผู้ใช้จะไม่เห็นว่าเพื่อนออก PO ให้แล้วและออกซ้ำ (เหตุผลเดียวกับ Delivery Order/Project)
  const ownership = purchaseRequestId
    ? {}
    : buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "purchaseOrder:viewAll"), "createdBy");

  const purchaseOrders = await purchaseOrdersCollection();
  const docs = await purchaseOrders
    .find({ isDeleted: false, ...(purchaseRequestId ? { purchaseRequestId } : {}), ...ownership })
    .sort({ updatedAt: -1 })
    .toArray();
  res.status(200).json({ purchaseOrders: docs.map(toSummary) });
}

/**
 * บรรทัดของใบขอซื้อใบหนึ่งที่ถูกออกใบสั่งซื้อไปแล้ว → เลขที่ใบที่ซื้อมัน (2026-09-21)
 *
 * **คำนวณจากใบสั่งซื้อจริงทุกครั้ง ไม่ได้เก็บธงไว้บนใบขอซื้อ** — ลบใบสั่งซื้อทิ้ง (soft-delete)
 * แล้วบรรทัดต้องกลับมาซื้อได้เองทันที ถ้าเก็บธงไว้จะค้างเป็น "ซื้อไม่ได้ตลอดกาล"
 *
 * ฉบับแก้ไขของใบสั่งซื้อ (`-R{n}`) นับเป็นอีกใบหนึ่งตามปกติ เพราะฉบับเดิมก็ยังอยู่จริงและยังไม่ถูกลบ
 * **อย่าพยายามยุบสายแก้ไขให้เหลือใบเดียว** — จะกลายเป็นการซ่อนใบที่ยังเปิดค้างอยู่
 */
export async function purchasedPrLineIds(purchaseRequestId: string): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!purchaseRequestId) return result;
  const purchaseOrders = await purchaseOrdersCollection();
  const docs = await purchaseOrders
    .find({ purchaseRequestId, isDeleted: false }, { projection: { documentNumber: 1, lines: 1 } })
    .toArray();
  for (const po of docs) {
    const label = po.documentNumber || po._id;
    for (const line of po.lines ?? []) {
      // บรรทัดที่ถูกยกเลิกไม่นับว่าซื้อแล้ว (2026-09-21) — ของนั้นถูกถอนไปแล้ว ไม่ถูกคิดเงินและไม่ถูก
      // ลอกไปใบรับสินค้า ถ้ายังนับอยู่ บรรทัดของใบขอซื้อจะค้างเป็น "ซื้อไม่ได้ตลอดกาล" ทั้งที่ยังไม่ได้ของ
      if (line.cancelled) continue;
      const source = line.sourcePrLineId ?? "";
      if (!source) continue;
      const list = result.get(source);
      if (list) { if (!list.includes(label)) list.push(label); } else { result.set(source, [label]); }
    }
  }
  return result;
}

async function handleCreate(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseOrder:create");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const purchaseRequestId = typeof body.purchaseRequestId === "string" ? body.purchaseRequestId : "";
  /**
   * บรรทัดที่จัดซื้อติ๊กเลือกไว้บนใบขอซื้อ (2026-09-21) — ไม่ส่งมา = เอาทุกบรรทัดที่ยังไม่ได้ซื้อ
   *
   * การติ๊กเป็นแค่การ**เลือกว่าจะเอาไปเปิดใบสั่งซื้อ** ไม่ใช่สถานะอนุมัติรายบรรทัด (เจ้าของยืนยัน)
   * จึงไม่มีฟิลด์ใหม่บนใบขอซื้อเลย เป็นแค่ `lineIds` ที่ส่งมากับคำสั่งสร้างครั้งนั้น
   */
  const selectedLineIds = Array.isArray(body.lineIds)
    ? [...new Set((body.lineIds as unknown[]).filter((v): v is string => typeof v === "string" && v.trim() !== ""))]
    : null;

  let jobCode = "";
  let neededByDate = "";
  let deliveryLocation = "";
  let lines: PurchaseOrderLine[] = [];

  if (purchaseRequestId) {
    // ต้องมีสิทธิ์ดูใบขอซื้อด้วย ไม่งั้นจะใช้ปุ่มสร้าง PO เป็นช่องอ่านเนื้อหาใบขอซื้อที่ตัวเองไม่มีสิทธิ์ดู
    if (!roleHasPermission(ctx.role, "purchaseRequest:view")) throw new HttpError(403, "Forbidden");
    const purchaseRequests = await purchaseRequestsCollection();
    const pr = await purchaseRequests.findOne({ _id: purchaseRequestId });
    if (!pr || pr.isDeleted) throw new HttpError(404, "ไม่พบใบขอซื้อต้นทาง");
    if (pr.status !== "Final") throw new HttpError(400, "ใบขอซื้อต้องได้รับอนุมัติก่อนจึงจะออกใบสั่งซื้อได้");
    /**
     * **ต้องผ่านสโตร์ก่อน (2026-09-09)** — ไหลงานที่เจ้าของสั่ง: อนุมัติ → สโตร์เช็คของ → จัดซื้อ
     * สโตร์อาจจ่ายของจากสต๊อกได้เลย ซึ่งแปลว่าไม่ต้องซื้อ การออกใบสั่งซื้อก่อนรู้ผลคือการซื้อของที่มีอยู่
     *
     * ใบก่อน 2026-09-09 ไม่มี `storeStage` เลย — ปล่อยผ่าน ไม่งั้นใบที่อนุมัติไว้ก่อนหน้านี้จะออก
     * ใบสั่งซื้อไม่ได้ทั้งหมด (ไม่ได้ทำ migration โดยตั้งใจ แนวเดียวกับทุกฟิลด์ที่เพิ่มทีหลัง)
     */
    if (pr.storeStage === "pending") {
      throw new HttpError(400, "ใบขอซื้อนี้ยังรอสโตร์เช็คของ ต้องให้สโตร์ยืนยันก่อนว่าไม่มีของในสต๊อก");
    }
    if (pr.storeStage === "closed") {
      throw new HttpError(400, "ใบขอซื้อนี้สโตร์จ่ายของจากสต๊อกครบแล้ว ไม่ต้องสั่งซื้อ");
    }
    /**
     * **ฝ่ายจัดซื้อต้องอนุมัติใบขอซื้อก่อน (2026-09-21)** — ข้อตัดสินใจของเจ้าของข้อสุดท้าย
     *
     * เขียนเป็น `=== "review"` (บล็อกเฉพาะใบที่เข้าไหลใหม่แล้วแต่จัดซื้อยังไม่กดอนุมัติ)
     * **ไม่ใช่ `!== "approved"`** เพราะใบทุกใบที่ค้างอยู่ในระบบวันนี้ยังไม่มีฟิลด์นี้เลย
     * รูปแบบลบจะทำให้ใบเก่าทั้งหมดเปิดใบสั่งซื้อไม่ได้ทันทีที่ deploy — ตรงข้ามกับด่านล็อกการแก้ไข
     * ใน `purchaseRequestHandler.ts` ที่ต้องเขียนเป็น `=== "approved"` ด้วยเหตุผลกลับกันพอดี
     */
    if (pr.purchasingStage === "review") {
      throw new HttpError(400, "ฝ่ายจัดซื้อยังไม่ได้อนุมัติใบขอซื้อนี้ — กดอนุมัติ (ฝ่ายจัดซื้อ) บนใบก่อนจึงจะออกใบสั่งซื้อได้");
    }

    jobCode = pr.jobCode ?? "";
    neededByDate = pr.neededByDate ?? "";
    deliveryLocation = pr.deliveryLocation ?? "";
    // ⚠️ **ไม่ก๊อป ผู้จำหน่าย / เครดิต / ขนส่งโดย จากใบขอซื้ออีกแล้ว (2026-08-31)** —
    // สามช่องนั้นถูกถอดออกจากใบขอซื้อตามที่เจ้าของสั่ง ("ใบขอซื้อไม่ต้องมีผู้จำหน่าย เครดิต ขนส่งโดย")
    // ฝ่ายจัดซื้อเลือกผู้ขายเองบนใบสั่งซื้อจากทะเบียนผู้ขาย (src/lib/vendors.ts) ซึ่งเติม
    // ผู้ติดต่อ/โทร/เลขภาษี/ที่อยู่ ให้ครบกว่าที่ใบขอซื้อเคยส่งต่อมาได้
    // snapshot ของรายการ ณ ตอนสร้าง — แก้ PO ทีหลังไม่กระทบใบขอซื้อ และแก้ใบขอซื้อไม่ย้อนมาแก้ PO
    //
    // **ข้ามบรรทัดที่สโตร์บอกว่ามีของ (2026-09-09)** — ของนั้นออกจากคลังไปแล้ว ลอกมาก็จะซื้อซ้ำ
    // บรรทัดที่สโตร์ยังไม่ได้เช็ค (ใบเก่าก่อนวันนั้น) ลอกมาทั้งหมดตามเดิม
    const linesToBuy = (pr.lines ?? []).filter((l) => l.storeDecision !== "stock");
    if (linesToBuy.length === 0 && (pr.lines ?? []).length > 0) {
      throw new HttpError(400, "ทุกรายการในใบขอซื้อนี้สโตร์จ่ายจากสต๊อกแล้ว ไม่มีรายการที่ต้องสั่งซื้อ");
    }

    /**
     * กันซื้อซ้ำ (2026-09-21) — เจ้าของสั่งว่าใบขอซื้อใบเดียว *"อาจจะเปิดซื้อจากหลายบริษัทก็ได้"*
     * บรรทัดที่ออกใบสั่งซื้อไปแล้วจึงต้องไม่ถูกลอกไปอีกใบ
     *
     * ติ๊กมาเอง → บรรทัดที่ซื้อไปแล้วเป็น **400 พร้อมบอกเลขใบเดิม** เพราะเป็นการเลือกผิดที่ต้องรู้ตัว
     * ไม่ได้ติ๊ก (เอาทุกรายการ) → **ข้ามเงียบ ๆ** เพราะเจตนาคือ "ที่เหลือทั้งหมด" อยู่แล้ว
     */
    const purchased = await purchasedPrLineIds(purchaseRequestId);
    let chosen: typeof linesToBuy;
    if (selectedLineIds) {
      const byId = new Map(linesToBuy.map((l) => [l.id, l]));
      chosen = selectedLineIds.map((lineId) => {
        const line = byId.get(lineId);
        if (!line) {
          const issued = (pr.lines ?? []).find((l) => l.id === lineId);
          throw new HttpError(400, issued
            ? `${issued.description}: สโตร์จ่ายของจากสต๊อกให้แล้ว ไม่ต้องสั่งซื้อ`
            : "ไม่พบรายการที่เลือกในใบขอซื้อ");
        }
        const already = purchased.get(lineId);
        if (already && already.length > 0) {
          throw new HttpError(400, `${line.description}: ออกใบสั่งซื้อไปแล้วในใบ ${already.join(", ")}`);
        }
        return line;
      });
      if (chosen.length === 0) throw new HttpError(400, "กรุณาเลือกอย่างน้อยหนึ่งรายการ");
    } else {
      chosen = linesToBuy.filter((l) => !(purchased.get(l.id)?.length));
      if (chosen.length === 0) {
        throw new HttpError(400, "ทุกรายการในใบขอซื้อนี้ออกใบสั่งซื้อไปแล้ว");
      }
    }
    lines = chosen.map((l) => ({
      id: newId("poline"),
      productId: l.productId || null,
      productCode: l.productCode ?? "",
      description: l.description ?? "",
      subDetails: l.subDetails ?? [],
      unit: l.unit ?? "",
      qty: l.qtyRequested ?? null,
      // **ราคาเริ่มว่างเสมอ (2026-09-21)** — เดิมลอก `estimatedCost` ของใบขอซื้อมาเป็นราคาต่อหน่วย
      // เจ้าของสั่งให้ถอดราคาประเมินออกจากใบขอซื้อทั้งหมด ฝ่ายจัดซื้อจึงกรอกราคาจริงที่ได้จากผู้ขายเอง
      unitPrice: null,
      discount: null,
      discountMode: "percent" as const,
      // เจ้าของขอไว้ 2026-08-28: "ใบสั่งซื้อให้มีรายละเอียดด้วยที่ดึงมาจากใบขอซื้อ" — เดิมสามช่องนี้
      // ถูกทิ้งไปเงียบ ๆ ตอนก๊อป เพราะใบสั่งซื้อไม่มีที่เก็บ
      neededByDate: l.neededByDate ?? "",
      departmentCode: l.departmentCode ?? "",
      costCode: l.costCode ?? "",
      // ตัวชี้กลับไปบรรทัดต้นทาง — หัวใจของการกันซื้อซ้ำ ดู purchasedPrLineIds()
      sourcePrLineId: l.id,
      cancelled: false,
      cancelRemark: "",
      remark: "",
    }));
  }

  const counters = await countersCollection();
  const id = await nextPurchaseOrderId(counters);
  const now = nowIso();

  const doc: PurchaseOrderFields & { _id: string } = {
    _id: id,
    documentNumber: id,
    purchaseRequestId,
    jobCode,
    // ผู้ขายเริ่มว่างเสมอตั้งแต่ 2026-08-31 — ฝ่ายจัดซื้อเลือกเองจากทะเบียนผู้ขายบนหน้าใบสั่งซื้อ
    vendorId: "",
    vendorName: "",
    intendedApproverUserId: "",
    intendedApproverName: "",
    vendorContact: "",
    vendorPhone: "",
    vendorTaxId: "",
    vendorAddress: "",
    vendorQuotationRef: "",
    orderDate: now.slice(0, 10),
    neededByDate,
    creditDays: null,
    shippingMethod: "",
    deliveryLocation,
    lines,
    vatRate: null,
    discount: null,
    discountMode: "percent" as const,
    remarks: "",
    status: "Draft",
    orderedBy: ctx.user.fullName,
    approvedBy: "",
    revisionNote: "",
    approvedByUserId: "",
    approvedAt: "",
    rejectionComment: "",
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
    isDeleted: false,
  };

  const purchaseOrders = await purchaseOrdersCollection();
  await ensurePurchaseOrderNumberIndex(purchaseOrders);
  await purchaseOrders.insertOne(doc);
  await writeAuditEntry(ctx, "Purchase Order Created", purchaseRequestId
    ? `สร้างใบสั่งซื้อ ${id} จากใบขอซื้อ ${purchaseRequestId}`
    : `สร้างใบสั่งซื้อ ${id} (ไม่มีใบขอซื้อต้นทาง)`);
  res.status(201).json({ purchaseOrder: toClient(doc) });
}

async function handleGet(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "purchaseOrder:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({ purchaseOrder: toClient(doc) });
}

const SHORT_TEXT_FIELDS: { key: keyof PurchaseOrderFields; label: string }[] = [
  { key: "vendorName", label: "ผู้ขาย" },
  { key: "vendorContact", label: "ผู้ติดต่อ" },
  { key: "vendorPhone", label: "เบอร์โทร" },
  { key: "vendorTaxId", label: "เลขประจำตัวผู้เสียภาษี" },
  { key: "vendorQuotationRef", label: "อ้างอิงใบเสนอราคา" },
  { key: "jobCode", label: "รหัสงาน" },
  { key: "shippingMethod", label: "ขนส่งโดย" },
  { key: "deliveryLocation", label: "สถานที่ส่งของ" },
  { key: "orderedBy", label: "ผู้สั่งซื้อ" },
  { key: "approvedBy", label: "ผู้อนุมัติ" },
];
const LONG_TEXT_FIELDS: { key: keyof PurchaseOrderFields; label: string }[] = [
  { key: "vendorAddress", label: "ที่อยู่ผู้ขาย" },
  { key: "remarks", label: "หมายเหตุ" },
  { key: "revisionNote", label: "หมายเหตุการแก้ไข" },
];
const DATE_FIELDS: { key: keyof PurchaseOrderFields; label: string }[] = [
  { key: "orderDate", label: "วันที่สั่งซื้อ" },
  { key: "neededByDate", label: "วันที่ต้องการรับของ" },
];


/**
 * ผูกใบสั่งซื้อเข้ากับผู้ขายในทะเบียน (2026-09-21) — คืนค่าที่จะเขียนลง `$set`
 *
 * **การกู้ใบเก่าอัตโนมัติคือส่วนที่สำคัญที่สุดของเฟสนี้**: ใบร่างที่ค้างอยู่ใน production ทุกใบมีแต่
 * `vendorName` เป็นข้อความ ไม่มี `vendorId` เลย (ฟิลด์นี้เพิ่งมีวันนี้) ถ้าไม่กู้ให้ ใบเหล่านั้นจะ
 * อนุมัติไม่ได้ทันทีในวันที่ deploy เพราะด่าน `beforeApprove` บังคับว่าต้องมี `vendorId`
 *
 * กู้ให้เฉพาะเมื่อชื่อตรงกับผู้ขาย **รายเดียวเป๊ะ** (ไม่สนตัวพิมพ์) — เจอหลายรายการห้ามเดา เพราะการ
 * เดาผิดแปลว่าใบสั่งซื้อไปผูกกับนิติบุคคลอื่น ซึ่งแย่กว่าการให้คนมาเลือกเอง
 */
async function resolveVendorLink(
  body: Record<string, unknown>,
  doc: PurchaseOrderFields & { _id: string },
): Promise<Partial<PurchaseOrderFields>> {
  const vendors = await vendorsCollection();

  // เลือกจากทะเบียนบนหน้าจอ — ตรวจว่ามีจริง แล้วเชื่อค่านั้น
  if ("vendorId" in body) {
    const raw = typeof body.vendorId === "string" ? body.vendorId.trim() : "";
    if (raw) {
      const vendor = await vendors.findOne({ _id: toObjectId(raw) });
      if (!vendor) throw new HttpError(400, "ไม่พบผู้ขายที่เลือกในทะเบียน");
      return { vendorId: raw };
    }
    // `vendorId: ""` **ไม่ใช่คำสั่งให้ตัดการผูก** — หน้าจอส่งทุกฟิลด์ไปกับทุกครั้งที่บันทึก ใบเก่าทุกใบ
    // จึงส่งค่าว่างมาเสมอ · ถ้า return ตรงนี้ การกู้ใบเก่าด้วยการจับคู่ชื่อข้างล่างจะไม่เคยทำงานเลย
    // (ซึ่งคือทั้งหมดของเหตุผลที่ฟังก์ชันนี้มีอยู่) จึงตกไปใช้การจับคู่ชื่อต่อ
  }

  // พิมพ์ชื่อเอง (หรือใบเก่าที่ถูกบันทึกครั้งแรกหลัง deploy) — ลองจับคู่กับทะเบียนให้
  if (!("vendorName" in body)) return {};
  const nextName = typeof body.vendorName === "string" ? body.vendorName.trim() : "";
  // **ชื่อว่างที่ส่งมาตรง ๆ = ตัดการผูกเสมอ** ต้องเช็คก่อนด่าน "ชื่อไม่เปลี่ยน" ข้างล่าง ไม่งั้นใบที่มี
  // `vendorId` อยู่แต่ `vendorName` ว่าง (สร้างได้จากการยิง API ตรง ๆ) จะตัดการผูกไม่ได้เลย
  if (!nextName) return { vendorId: "" };
  // ชื่อไม่เปลี่ยนและผูกไว้แล้ว = ไม่ต้องไปค้นทะเบียนซ้ำ · ใบเก่าที่ยังไม่ผูก (`vendorId` ว่าง) ต้องตก
  // ลงไปจับคู่ชื่อข้างล่างเสมอ นั่นคือทางกู้ใบเก่าทั้งหมด
  if (nextName === (doc.vendorName ?? "").trim() && doc.vendorId) return {};
  // เทียบชื่อฝั่ง JS ไม่ใช่ regex ใน Mongo — ทะเบียนผู้ขายเป็นตารางเล็ก (handleList ก็อ่านทั้งตาราง
  // อยู่แล้ว) และการหนีอักขระพิเศษในชื่อบริษัทเป็นจุดที่พลาดเงียบ ๆ ได้ง่ายโดยไม่มีอะไรมาดัก
  const key = nextName.toLowerCase();
  const matches = (await vendors.find({ isDeleted: false }).toArray())
    .filter((v) => (v.name ?? "").trim().toLowerCase() === key);
  return { vendorId: matches.length === 1 ? matches[0]._id.toString() : "" };
}

/**
 * ผู้อนุมัติที่ตั้งใจไว้ (2026-09-21) — ตรวจกับตารางผู้ใช้จริงเสมอ
 *
 * **ห้ามปล่อยผ่าน `SHORT_TEXT_FIELDS`** ไม่งั้นกลายเป็นช่อง id อิสระที่ใครพิมพ์อะไรลงไปก็ได้ แล้ว
 * การแจ้งเตือนจะยิงไปหา id ที่ไม่มีอยู่จริงอย่างเงียบ ๆ · เก็บชื่อเป็น snapshot ไว้แสดงผลด้วย
 * เผื่อผู้ใช้คนนั้นถูกปิดบัญชีภายหลัง
 */
async function resolveIntendedApprover(body: Record<string, unknown>): Promise<Partial<PurchaseOrderFields>> {
  if (!("intendedApproverUserId" in body)) return {};
  const raw = typeof body.intendedApproverUserId === "string" ? body.intendedApproverUserId.trim() : "";
  if (!raw) return { intendedApproverUserId: "", intendedApproverName: "" };
  const users = await usersCollection();
  const user = await users.findOne({ _id: toObjectId(raw) });
  if (!user) throw new HttpError(400, "ไม่พบผู้ใช้ที่เลือกเป็นผู้อนุมัติ");
  if (user.status !== "active") throw new HttpError(400, `${user.fullName} ถูกปิดบัญชีแล้ว เลือกเป็นผู้อนุมัติไม่ได้`);
  return { intendedApproverUserId: raw, intendedApproverName: user.fullName };
}
async function handleUpdate(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  // ล็อกทั้ง Final และ PendingApproval เหมือนใบขอซื้อ — ระหว่างรออนุมัติต้องแก้ไม่ได้ ไม่งั้นผู้อนุมัติ
  // จะกดอนุมัติเนื้อหาที่ต่างจากตอนที่ตรวจ
  if (doc.status !== "Draft") {
    throw new HttpError(400, doc.status === "Final"
      ? "ใบสั่งซื้อนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้"
      : "ใบสั่งซื้อนี้กำลังรออนุมัติ ต้องถอนการขออนุมัติก่อนจึงจะแก้ไขได้");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<PurchaseOrderFields> = {};
  if ("lines" in body) update.lines = await sanitizeLines(body.lines, doc.lines ?? []);
  // ผู้ขายในทะเบียน — จัดการแยกจาก SHORT_TEXT_FIELDS เสมอ ไม่งั้นกลายเป็นช่อง id อิสระที่ใครพิมพ์อะไรก็ได้
  Object.assign(update, await resolveVendorLink(body, doc));
  Object.assign(update, await resolveIntendedApprover(body));
  if ("creditDays" in body) update.creditDays = sanitizeNullableNumber(body.creditDays, "เครดิต (วัน)");
  if ("vatRate" in body) update.vatRate = sanitizeNullableNumber(body.vatRate, "อัตราภาษี (%)");
  if ("discount" in body) update.discount = sanitizeNullableNumber(body.discount, "ส่วนลดท้ายใบ");
  if ("discountMode" in body) update.discountMode = body.discountMode === "amount" ? "amount" : "percent";
  if ("documentNumber" in body) {
    const next = sanitizeShortText(body.documentNumber, "เลขที่ใบสั่งซื้อ", true);
    if (next !== doc.documentNumber) {
      const purchaseOrders = await purchaseOrdersCollection();
      const clash = await purchaseOrders.findOne({ documentNumber: next, _id: { $ne: id } });
      if (clash) throw new HttpError(409, `เลขที่ ${next} ถูกใช้ไปแล้วในใบสั่งซื้ออื่น`);
    }
    update.documentNumber = next;
  }
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of LONG_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeLongText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const purchaseOrders = await purchaseOrdersCollection();
  await purchaseOrders.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  // การบันทึกอัตโนมัติไม่เขียน audit log — ผ่านการตรวจสิทธิ์/สถานะ/validation ชุดเดียวกับกดบันทึกเอง
  if (!autoSave) await writeAuditEntry(ctx, "Purchase Order Updated", `แก้ไขใบสั่งซื้อ ${id}`);
  res.status(200).json({ purchaseOrder: toClient(updated) });
}

async function handleDelete(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseOrder:delete");
  const doc = await loadOrThrow(id);
  const purchaseOrders = await purchaseOrdersCollection();
  await purchaseOrders.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Purchase Order Deleted", `ลบใบสั่งซื้อ ${doc._id}`);
  res.status(204).end();
}

async function handlePrint(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseOrder:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Purchase Order Printed", `พิมพ์ใบสั่งซื้อ ${doc._id}`);
  res.status(204).end();
}

/** สร้างฉบับแก้ไข `-R{n}` จากใบที่อนุมัติแล้ว — ฉบับเดิมไม่ถูกแตะต้อง */
async function handleRewrite(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseOrder:create");
  const doc = await loadOrThrow(id);
  if (doc.status !== "Final") throw new HttpError(400, "แก้ไขฉบับใหม่ได้เฉพาะใบที่อนุมัติแล้ว");

  const root = getRevisionRoot(doc._id);
  const counters = await countersCollection();
  const result = await counters.findOneAndUpdate(
    { _id: `purchase_order_revision_${root}` }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true },
  );
  const revision = result?.seq ?? 1;
  const newDocId = `${root}-R${revision}`;
  const now = nowIso();

  const next: PurchaseOrderFields & { _id: string } = {
    ...doc,
    _id: newDocId,
    documentNumber: newDocId,
    status: "Draft",
    // ล้างลายเซ็น/ผลอนุมัติทั้งหมด และ **หมายเหตุการแก้ไขเริ่มว่างเสมอ** ไม่สืบทอดของฉบับก่อน
    // `intendedApproverUserId`/`Name` **ไม่อยู่ในรายการนี้โดยตั้งใจ** — มันคือความตั้งใจว่าใครควรเป็น
    // คนอนุมัติ ซึ่งยังเป็นคนเดิมในฉบับแก้ไข ต่างจาก `approvedBy` ที่เป็นลายเซ็นของการอนุมัติครั้งก่อน
    approvedBy: "",
    approvedByUserId: "",
    approvedAt: "",
    rejectionComment: "",
    revisionNote: "",
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
  };

  const purchaseOrders = await purchaseOrdersCollection();
  await ensurePurchaseOrderNumberIndex(purchaseOrders);
  await purchaseOrders.insertOne(next);
  await writeAuditEntry(ctx, "Purchase Order Rewritten", `สร้างฉบับแก้ไข ${newDocId} จาก ${doc._id}`);
  res.status(201).json({ purchaseOrder: toClient(next) });
}

/**
 * ย้อนใบสั่งซื้อที่อนุมัติแล้วกลับเป็นร่าง (2026-09-21) — เจ้าของข้อ 9:
 * *"ใบ PO ถ้าถูกหัวหน้า Approve ไปแล้วสามารถย้อนได้โดยไม่ต้องกด Rewrite"*
 *
 * **เขียนเป็น route ของใบสั่งซื้อเอง ห้ามไปขยาย `handleWithdrawApproval`** — ตัวนั้นบังคับให้เอกสาร
 * อยู่ในสถานะ `PendingApproval` และถูกใช้ร่วมกัน 6 โมดูล การคลายด่านตรงนั้นจะทำให้คนที่มีสิทธิ์แก้
 * ไปถอนการอนุมัติใบสั่งผลิต ใบเบิก ใบสั่งงาน Cost Control และใบขอซื้อได้ด้วย ซึ่งไม่มีใครสั่ง
 *
 * ใช้ `purchaseOrder:finalize` ไม่ใช่ `canEdit` — **คนที่อนุมัติได้คือคนที่ถอนได้** ถ้าใช้สิทธิ์แก้ไข
 * คนเปิดใบจะถอนลายเซ็นของหัวหน้าตัวเองได้
 *
 * **ด่านใบรับสินค้า**: ของเข้าคลังไปแล้วย้อนไม่ได้ · ใช้ query เดียวกับที่ `receivingReportHandler.ts`
 * ใช้ตอนกันสร้างซ้ำ (`1 PO = 1 RR` บังคับอยู่แล้ว `findOne` จึงครอบคลุมแน่นอน) และส่ง
 * `receivingReportId` กลับไปด้วยเพื่อให้หน้าจอเสนอปุ่มเปิดใบนั้นได้
 */
async function handleRevertApproval(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "purchaseOrder:finalize");
  const doc = await loadOrThrow(id);
  if (doc.status !== "Final") throw new HttpError(400, "ย้อนได้เฉพาะใบสั่งซื้อที่อนุมัติแล้วเท่านั้น");

  const receivingReports = await receivingReportsCollection();
  const rr = await receivingReports.findOne({ purchaseOrderId: id, isDeleted: false });
  if (rr) {
    // `details` ถูก spread ขึ้นระดับบนสุดของ body (ดู sendJson ใน http.ts) — หน้าจอจึงอ่าน
    // `receivingReportId` ได้ตรง ๆ แบบเดียวกับ 409 ของ receivingReportHandler ตอนกันสร้างซ้ำ
    throw new HttpError(400, "ใบสั่งซื้อนี้มีใบรับสินค้าแล้ว (" + (rr.documentNumber || rr._id) + ") ย้อนการอนุมัติไม่ได้", {
      details: { receivingReportId: rr._id },
    });
  }

  const reason = sanitizeLongText((req.body ?? {}).reason, "เหตุผลที่ย้อนการอนุมัติ");
  const now = nowIso();
  const note = "ถอนการอนุมัติเมื่อ " + now.slice(0, 10) + " โดย " + ctx.user.fullName + (reason ? " — " + reason : "");
  const previousNote = (doc.revisionNote ?? "").trim();
  const purchaseOrders = await purchaseOrdersCollection();
  await purchaseOrders.updateOne({ _id: id }, {
    $set: {
      status: "Draft",
      // ชุดเดียวกับที่ `handleRewrite` ล้าง — ให้ "ล้างการอนุมัติ" มีนิยามเดียวในไฟล์นี้
      approvedBy: "",
      approvedByUserId: "",
      approvedAt: "",
      rejectionComment: "",
      // ต่อท้าย ไม่เขียนทับ — และแสดงบนใบพิมพ์ด้วย คนที่ถือกระดาษใบเก่าจะได้รู้ว่าใบถูกถอน
      revisionNote: previousNote ? previousNote + "\n" + note : note,
      updatedAt: now,
      updatedBy: ctx.user.id,
    },
  });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Purchase Order Approval Reverted",
    "ถอนการอนุมัติใบสั่งซื้อ " + id + (reason ? " — " + reason : ""));
  res.status(200).json({ purchaseOrder: toClient(updated) });
}

const approvalConfig: ApprovalConfig<PurchaseOrderFields & { _id: string }> = {
  label: "ใบสั่งซื้อ",
  approvePermission: "purchaseOrder:finalize",
  submitNotification: {
    type: "purchase_order_submitted", module: "ใบสั่งซื้อ",
    relatedField: "relatedPurchaseOrderId", context: (doc) => doc.vendorName || doc.jobCode || "",
    /**
     * เลือกคนอนุมัติไว้ = แจ้งเฉพาะคนนั้น (2026-09-21) · **ไม่ล็อกสิทธิ์** คนอื่นยังกดอนุมัติได้
     *
     * คนที่เลือกไว้ถูกปิดบัญชีไปแล้ว → คืน `null` เพื่อถอยไปกระจายตามสิทธิ์ตามเดิม ดีกว่าส่งไม่ถึงใครเลย
     */
    recipients: async (doc) => {
      if (!doc.intendedApproverUserId) return null;
      const users = await usersCollection();
      const user = await users.findOne({ _id: toObjectId(doc.intendedApproverUserId) });
      return user && user.status === "active" ? [doc.intendedApproverUserId] : null;
    },
  },
  collection: async () => (await purchaseOrdersCollection()) as unknown as Collection<PurchaseOrderFields & { _id: string }>,
  /**
   * **บัญชีต้องอนุมัติผู้ขายก่อนจึงจะอนุมัติใบสั่งซื้อได้ (2026-09-21)** — คำสั่งเจ้าของข้อ 5:
   * *"ทะเบียนผู้ขาย จัดซื้อกรอกข้อมูลรายละเอียดครบแล้ว นำส่งข้อมูลไปที่บัญชีให้บัญชีอนุมัติก่อนเปิด PO"*
   *
   * อยู่ที่ `beforeApprove` ไม่ใช่ที่ PATCH โดยตั้งใจ — ร่างยังสร้างและแก้ได้เสมอแม้ผู้ขายยังไม่ผ่านบัญชี
   * (เจ้าของเลือกไว้ตรง ๆ ว่า "สร้าง PO ร่างได้ แต่อนุมัติ PO ไม่ได้") · hook นี้โยน error **ก่อน**
   * สถานะเปลี่ยน ใบจึงค้างที่ "รออนุมัติ" ไม่เสียหาย
   *
   * **ใบที่อนุมัติไปแล้วไม่ถูกแตะตลอดกาล** — hook ทำงานเฉพาะตอน `PendingApproval` → `Final` เท่านั้น
   * จงใจไม่ทำ migration ย้อนหลัง (ดู docs/DATABASE.md)
   */
  beforeApprove: async (_ctx, doc) => {
    if (!doc.vendorId) {
      throw new HttpError(400, 'ใบสั่งซื้อนี้ยังไม่ได้เลือกผู้ขายจากทะเบียน — เลือกผู้ขายในช่อง "ผู้ขาย" ก่อนจึงจะอนุมัติได้');
    }
    const vendors = await vendorsCollection();
    const vendor = await vendors.findOne({ _id: toObjectId(doc.vendorId) });
    if (!vendor) throw new HttpError(400, "ไม่พบผู้ขายของใบนี้ในทะเบียนแล้ว");
    if (vendor.isDeleted) throw new HttpError(400, "ผู้ขาย " + vendor.name + " ถูกเก็บถาวรแล้ว");
    if (!vendor.isActive) throw new HttpError(400, "ผู้ขาย " + vendor.name + " ถูกปิดใช้งานแล้ว");
    const status = vendorApprovalStatusOf(vendor);
    if (status !== "approved") {
      throw new HttpError(400, status === "pendingApproval"
        ? "ผู้ขาย " + vendor.name + " ยังรอบัญชีอนุมัติ"
        : "ผู้ขาย " + vendor.name + " ยังไม่ผ่านการอนุมัติของบัญชี — ส่งให้บัญชีอนุมัติในหน้าทะเบียนผู้ขายก่อน");
    }
  },
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail) => writeAuditEntry(ctx, action, detail),
  respond: (res, doc) => res.status(200).json({ purchaseOrder: toClient(doc) }),
};

export async function handlePurchaseOrder(req: ApiRequest, res: ApiResponse): Promise<void> {
  await requireUser(req);
  const parts = getPathSegments(req, "/api/purchase-orders");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) {
    if (req.method === "GET") return handleGet(req, res, parts[0]);
    if (req.method === "PATCH") return handleUpdate(req, res, parts[0]);
    if (req.method === "DELETE") return handleDelete(req, res, parts[0]);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 2) {
    const [id, action] = parts;
    if (action === "print") return handlePrint(req, res, id);
    if (action === "rewrite") return handleRewrite(req, res, id);
    if (action === "submit-approval") return handleSubmitApproval(req, res, id, approvalConfig);
    // `finalize` เป็น alias ของ `approve` เหมือนอีก 4 เอกสาร เพื่อไม่ให้ผู้เรียกเดิมพัง
    if (action === "approve" || action === "finalize") return handleApprove(req, res, id, approvalConfig);
    if (action === "reject") return handleReject(req, res, id, approvalConfig);
    if (action === "withdraw-approval") return handleWithdrawApproval(req, res, id, approvalConfig);
    // ย้อนใบที่อนุมัติแล้ว (2026-09-21) — route ของใบสั่งซื้อเอง ไม่ใช่ helper ร่วม ดู handleRevertApproval()
    if (action === "revert-approval") return handleRevertApproval(req, res, id);
  }
  throw new HttpError(404, "Not found");
}
