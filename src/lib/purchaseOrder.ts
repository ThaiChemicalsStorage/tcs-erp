/**
 * ใบสั่งซื้อ (Purchase Order) — added 2026-08-28 for the Purchasing (จัดซื้อ) department, from the
 * owner's "กระบวนการจัดซื้อ (Procurement Process Flow)" chart: PR → **PO** → รับ/ตรวจรับสินค้า → รับวางบิล.
 *
 * This is the first document the Purchasing department actually owns. Until now Purchasing existed
 * in the system only as a signature column on someone else's Purchase Request (`purchasingDeptBy`,
 * editable only while that document is still a draft) plus a notification when a PR was approved.
 *
 * **Generated from an approved Purchase Request** (`purchaseRequestId`), copying its lines as a
 * snapshot — the same "snapshot, never a live reference" rule Scope of Work → Delivery Order
 * follows. Editing a PO never touches the PR it came from. A PO can also be opened standalone
 * (`purchaseRequestId: ""`) because Purchasing sometimes buys without a formal request.
 *
 * Numbering is `PO-{พ.ศ.}-{NNNN}` — Buddhist year, matching PR/MR/JO rather than Production Order's
 * deliberate Gregorian exception. `PO-` does not collide with the existing `PR-` prefix.
 *
 * ⚠️ **The printed form is not built yet.** The owner will supply the real FM-PU-xx form; until then
 * `PurchaseOrderPrintDocument.tsx` is a placeholder and the field set below is the structure the
 * flow chart implies, not a transcription of a real paper form. Expect it to change when the form
 * arrives — that is planned, not drift.
 */

import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";
// ยืมเฉพาะตัวคิดส่วนลดมาใช้ ไม่ยืม computeTotals เพราะมันฮาร์ดโค้ด VAT 7% (ดู purchaseOrderTotals)
import { resolveDiscountAmount, lineDiscountAmount, lineSubtotal, type DiscountMode, type QuoteAmountLine } from "./quoteMath.js";

export type { DiscountMode };

export type PurchaseOrderStatus = "Draft" | "PendingApproval" | "Final";

/**
 * One ordered item.
 *
 * `productId` is nullable on purpose, exactly as `PurchaseRequestLine` has it: Purchasing regularly
 * orders things that have no product code yet (the คำขอเพิ่มสินค้า flow exists precisely because
 * codes are minted later, by Store). A line typed by hand is a first-class line here.
 */
export interface PurchaseOrderLine {
  id: string;
  /** null = พิมพ์เอง ยังไม่ผูกกับสินค้าในคลัง */
  productId: string | null;
  productCode: string;
  description: string;
  /** บรรทัดรายละเอียดย่อยใต้รายการหลัก — แบบเดียวกับใบขอซื้อและใบสั่งผลิต */
  subDetails: string[];
  unit: string;
  qty: number | null;
  /** ราคาต่อหน่วยที่ตกลงกับผู้ขาย — null = ยังไม่ระบุ */
  unitPrice: number | null;
  /**
   * ส่วนลดของบรรทัดนี้ (2026-08-31) — ตีความเป็น % หรือบาท ตาม `discountMode`
   * รูปแบบเดียวกับ `QuoteLine.discount`/`discountMode` เป๊ะ ๆ เพื่อให้ใช้ตัวคำนวณร่วมกันได้
   * null/ไม่มีค่า = ไม่มีส่วนลด — เอกสารเก่าอ่านออกมาเหมือนเดิม ไม่ต้อง migrate
   */
  discount?: number | null;
  /** ไม่ระบุ = ตีความเป็นเปอร์เซ็นต์ (ตรงกับที่ใบเสนอราคาทำอยู่) */
  discountMode?: DiscountMode;
  /**
   * สามช่องนี้ดึงมาจากใบขอซื้อ (2026-08-31) — เจ้าของขอไว้ว่า *"ใบสั่งซื้อให้มีรายละเอียดด้วย
   * ที่ดึงมาจากใบขอซื้อ"* เดิมตัวก๊อป PR→PO ทิ้งทั้งสามช่องนี้ไปเงียบ ๆ เพราะ PO ไม่มีที่เก็บ
   */
  neededByDate?: string;
  /** "แผนก" — รหัสแผนกที่ขอซื้อ ต่อบรรทัด (ของใบขอซื้อเรียก departmentCode เหมือนกัน) */
  departmentCode?: string;
  /** รหัสบัญชี/ศูนย์ต้นทุน — บนใบขอซื้อยังเป็นฟิลด์ตายอยู่ ที่นี่ก๊อปมาเก็บไว้ให้ครบสาย */
  costCode?: string;
  /**
   * บรรทัดต้นทางบนใบขอซื้อ (2026-09-21) — `""`/ไม่มีค่า = บรรทัดที่จัดซื้อพิมพ์เพิ่มเองบนใบสั่งซื้อ
   *
   * มีไว้ตอบคำถามเดียว: *บรรทัดนี้ของใบขอซื้อถูกออกใบสั่งซื้อไปแล้วหรือยัง* — เจ้าของสั่งว่าใบขอซื้อ
   * ใบเดียว *"อาจจะเปิดซื้อจากหลายบริษัทก็ได้"* จึงต้องแยกได้ว่าบรรทัดไหนซื้อไปแล้วกับใคร
   *
   * **คำตอบถูกคำนวณจากใบสั่งซื้อจริงทุกครั้ง ไม่ได้เก็บเป็นธงไว้บนใบขอซื้อ** — ลบใบสั่งซื้อทิ้งแล้ว
   * บรรทัดนั้นต้องกลับมาซื้อได้เอง ถ้าเก็บธงไว้บนใบขอซื้อ บรรทัดจะค้างเป็น "ซื้อไม่ได้ตลอดกาล"
   * โดยไม่มีหน้าจอไหนไปเคลียร์ให้
   *
   * **เซิร์ฟเวอร์เขียนตอนสร้างใบเท่านั้น ไม่รับจาก PATCH** — ค่าเดิมถูกอ่านกลับมาด้วย line id
   * ใน `sanitizeLines()` (กติกาเดียวกับ `storeDecision` ของใบขอซื้อ)
   */
  sourcePrLineId?: string;
  remark: string;
}

export interface PurchaseOrder {
  id: string;
  /**
   * เลขที่ที่พิมพ์บนฟอร์ม — แก้เองได้เฉพาะฉบับร่าง แยกจาก `id` ซึ่งเป็น `_id` ของ MongoDB และแก้ไม่ได้
   * เพราะใบตรวจรับ/ใบรับวางบิลอ้างถึงมัน ตอนสร้างเท่ากับ `id` เสมอ เอกสารเก่าที่ไม่มีฟิลด์นี้
   * เซิร์ฟเวอร์เติมให้เป็น `id` ตอนอ่าน (normalize ตอนอ่าน ไม่ทำ migration) — แบบเดียวกับใบสั่งผลิต
   */
  documentNumber: string;
  /** ใบขอซื้อต้นทาง — "" ได้ ถ้าจัดซื้อเปิดใบเอง */
  purchaseRequestId: string;
  /** รหัสงาน — snapshot จากใบขอซื้อต้นทาง */
  jobCode: string;

  // ── ผู้ขาย ────────────────────────────────────────────────────────────────
  /** ยังเป็นข้อความพิมพ์เอง — ทั้งระบบยังไม่มีทะเบียนผู้ขาย ดูหมายเหตุท้ายไฟล์ */
  vendorName: string;
  vendorContact: string;
  vendorPhone: string;
  vendorTaxId: string;
  vendorAddress: string;
  /** เลขที่ใบเสนอราคาของผู้ขายที่อ้างอิง */
  vendorQuotationRef: string;

  // ── เงื่อนไข ──────────────────────────────────────────────────────────────
  /** วันที่ออกใบสั่งซื้อ (YYYY-MM-DD, "" = ยังไม่ระบุ) */
  orderDate: string;
  /** วันที่ต้องการรับของ */
  neededByDate: string;
  creditDays: number | null;
  shippingMethod: string;
  deliveryLocation: string;

  lines: PurchaseOrderLine[];
  /** อัตราภาษีมูลค่าเพิ่ม (%) — null = ยังไม่ระบุ ยอดรวมคำนวณตอนแสดงผล ไม่ได้เก็บไว้ */
  vatRate: number | null;
  /**
   * ส่วนลดท้ายใบ (2026-08-31) — เจ้าของขอไว้ *"มีส่วนลดท้ายใบด้วย"*
   * คิดจากยอดหลังหักส่วนลดรายบรรทัดแล้ว และคิดก่อน VAT — ลำดับเดียวกับใบเสนอราคา
   */
  discount?: number | null;
  discountMode?: DiscountMode;
  remarks: string;

  status: PurchaseOrderStatus;

  /** ช่องเซ็นบนฟอร์ม — ข้อความอิสระ ระบบเติม `approvedBy` ให้ตอนกดอนุมัติถ้ายังว่าง */
  orderedBy: string;
  approvedBy?: string;

  /**
   * หมายเหตุการแก้ไข — พิมพ์เอง อธิบายว่าฉบับนี้ต่างจากฉบับก่อนตรงไหน **แสดงบนใบพิมพ์ด้วย**
   * เหมือนใบขอซื้อ/ใบสั่งผลิต (ต่างจากใบเสนอราคาที่หมายเหตุเป็นข้อมูลภายใน ไม่เคยถูกพิมพ์)
   * ไม่สืบทอดตอนกด Rewrite — เริ่มว่างเสมอ
   */
  revisionNote: string;

  /** เซิร์ฟเวอร์เขียนเท่านั้น */
  approvedByUserId?: string;
  approvedAt?: string;
  rejectionComment?: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export interface PurchaseOrderSummary {
  id: string;
  documentNumber: string;
  purchaseRequestId: string;
  jobCode: string;
  vendorName: string;
  neededByDate: string;
  status: PurchaseOrderStatus;
  updatedAt: string;
}

export function blankPurchaseOrderLine(id: string): PurchaseOrderLine {
  return { id, productId: null, productCode: "", description: "", subDetails: [], unit: "", qty: null, unitPrice: null, discount: null, discountMode: "percent", neededByDate: "", departmentCode: "", costCode: "", remark: "" };
}

/**
 * ยอดรวมก่อนภาษีหลังหักส่วนลดรายบรรทัดแล้ว — คำนวณตอนแสดงผลเสมอ **ไม่เก็บลงฐานข้อมูล**
 *
 * **2026-08-31**: เดิมคอมเมนต์ตรงนี้เขียนไว้ว่าจงใจไม่ใช้ `quoteMath.ts` เพราะ "ใบสั่งซื้อยังไม่รู้ว่า
 * ต้องใช้ส่วนลดแบบไหน" — ตอนนี้รู้แล้ว เจ้าของขอไว้ 2026-08-28 ว่าต้องมีส่วนลด**ทั้งแบบเปอร์เซ็นต์
 * และแบบจำนวนเงิน ทั้งรายบรรทัดและท้ายใบ** จึงยืมเฉพาะตัวคิดส่วนลดของ `quoteMath.ts` มาใช้
 *
 * ⚠️ **แต่ยังใช้ `computeTotals()` ของที่นั่นไม่ได้** เพราะมันฮาร์ดโค้ด `VAT_RATE = 7` ขณะที่
 * ใบสั่งซื้อมี `vatRate` ที่ผู้ใช้แก้เองได้ต่อใบ (ซื้อจากผู้ขายที่ไม่จด VAT ก็มี) — จึงต้องมี
 * `purchaseOrderTotals()` ของตัวเองด้านล่าง
 */
export function purchaseOrderSubtotal(lines: PurchaseOrderLine[]): number {
  return lines.reduce((sum, l) => sum + lineSubtotal(toAmountLine(l)), 0);
}

/** แปลงบรรทัดของใบสั่งซื้อให้เข้ารูปที่ quoteMath คิดได้ — ใบสั่งซื้อใช้ null ส่วนใบเสนอราคาใช้ 0 */
function toAmountLine(l: PurchaseOrderLine): QuoteAmountLine {
  return { qty: l.qty ?? 0, unitPrice: l.unitPrice ?? 0, discount: l.discount ?? 0, discountMode: l.discountMode };
}

/** ส่วนลดรายบรรทัดคิดเป็นเงินแล้ว — ใช้แสดงในคอลัมน์ของตาราง */
export function purchaseOrderLineDiscount(l: PurchaseOrderLine): number {
  return lineDiscountAmount(toAmountLine(l));
}

/** ยอดสุทธิของหนึ่งบรรทัด หลังหักส่วนลดของบรรทัดนั้นแล้ว */
export function purchaseOrderLineTotal(l: PurchaseOrderLine): number {
  return lineSubtotal(toAmountLine(l));
}

/**
 * ยอดรวมทั้งใบ — เหมือน `computeTotals()` ของใบเสนอราคาทุกขั้น **ยกเว้นอัตรา VAT**
 * ซึ่งอ่านจาก `vatRate` ของเอกสารเอง (null = ยังไม่ระบุ = ไม่คิดภาษี)
 */
export function purchaseOrderTotals(doc: Pick<PurchaseOrder, "lines" | "vatRate" | "discount" | "discountMode">) {
  const subtotal = purchaseOrderSubtotal(doc.lines);
  const discountAmt = resolveDiscountAmount(subtotal, doc.discount ?? 0, doc.discountMode);
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = doc.vatRate !== null && doc.vatRate !== undefined ? (afterDiscount * doc.vatRate) / 100 : 0;
  return { subtotal, discountAmt, afterDiscount, vatAmt, total: afterDiscount + vatAmt };
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchAllPurchaseOrders(): Promise<PurchaseOrderSummary[]> {
  const { purchaseOrders } = await apiFetch<{ purchaseOrders: PurchaseOrderSummary[] }>("/purchase-orders");
  return purchaseOrders;
}

/** ใบสั่งซื้อที่ออกจากใบขอซื้อใบนี้ — ใช้เช็คว่าออก PO ไปแล้วหรือยัง */
export async function fetchPurchaseOrdersByRequest(purchaseRequestId: string): Promise<PurchaseOrderSummary[]> {
  const { purchaseOrders } = await apiFetch<{ purchaseOrders: PurchaseOrderSummary[] }>(
    `/purchase-orders?purchaseRequestId=${encodeURIComponent(purchaseRequestId)}`,
  );
  return purchaseOrders;
}

export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${encodeURIComponent(id)}`);
  return purchaseOrder;
}

/** สร้างจากใบขอซื้อที่อนุมัติแล้ว (เซิร์ฟเวอร์บังคับสถานะ Final) — ไม่ส่ง id มา = เปิดใบเปล่า */
/**
 * `lineIds` (2026-09-21) — เลือกเฉพาะบางบรรทัดของใบขอซื้อ · **ไม่ส่ง = ทุกบรรทัดที่ยังไม่ได้ซื้อ**
 * ใบขอซื้อใบเดียวจึงแตกเป็นใบสั่งซื้อหลายใบตามผู้ขายได้ ตามที่เจ้าของสั่ง
 */
export async function createPurchaseOrder(purchaseRequestId?: string, lineIds?: string[]): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>("/purchase-orders", {
    method: "POST",
    body: JSON.stringify(purchaseRequestId ? { purchaseRequestId, ...(lineIds ? { lineIds } : {}) } : {}),
  });
  return purchaseOrder;
}

export type PurchaseOrderUpdateFields = Partial<Omit<PurchaseOrder, "id" | "createdAt" | "createdBy" | "isDeleted">>;

export async function updatePurchaseOrder(id: string, fields: PurchaseOrderUpdateFields, options?: WriteOptions): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>(
    `/purchase-orders/${encodeURIComponent(id)}${writeQuery(options)}`,
    { method: "PATCH", body: JSON.stringify(fields) },
  );
  return purchaseOrder;
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await apiFetch(`/purchase-orders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** สร้างฉบับแก้ไขใหม่ (`-R{n}`) จากใบที่อนุมัติแล้ว — หมายเหตุการแก้ไขเริ่มว่างเสมอ */
export async function rewritePurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return purchaseOrder;
}

export async function logPurchaseOrderPrinted(id: string): Promise<void> {
  await apiFetch(`/purchase-orders/${encodeURIComponent(id)}/print`, { method: "POST" });
}

// ── ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) — ใช้ documentApproval.ts ร่วมกับอีก 4 เอกสาร ──────
export async function submitPurchaseOrderApproval(id: string): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return purchaseOrder;
}
export async function approvePurchaseOrder(id: string): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${encodeURIComponent(id)}/approve`, { method: "POST" });
  return purchaseOrder;
}
export async function rejectPurchaseOrder(id: string, comment: string): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${encodeURIComponent(id)}/reject`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  return purchaseOrder;
}
export async function withdrawPurchaseOrderApproval(id: string): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${encodeURIComponent(id)}/withdraw-approval`, { method: "POST" });
  return purchaseOrder;
}
