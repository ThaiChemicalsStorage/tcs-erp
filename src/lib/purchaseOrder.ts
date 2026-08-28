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
  return { id, productId: null, productCode: "", description: "", subDetails: [], unit: "", qty: null, unitPrice: null, remark: "" };
}

/**
 * ยอดรวมก่อนภาษี — คำนวณตอนแสดงผลเสมอ **ไม่เก็บลงฐานข้อมูล**
 *
 * ตั้งใจไม่ไปใช้ `quoteMath.ts` (เครื่องคิดเงินของใบเสนอราคา) เพราะนั่นมีส่วนลดต่อบรรทัด/ต่อเอกสาร
 * และกฎ VAT ของฝั่งขาย ซึ่งใบสั่งซื้อยังไม่รู้ว่าต้องใช้แบบไหนจนกว่าฟอร์มจริงจะมา — เอาสูตรของ
 * ฝั่งขายมาใช้ก่อนแล้วมาแก้ทีหลัง เสี่ยงกว่าการบวกเลขตรง ๆ ตรงนี้
 */
export function purchaseOrderSubtotal(lines: PurchaseOrderLine[]): number {
  return lines.reduce((sum, l) => sum + (l.qty ?? 0) * (l.unitPrice ?? 0), 0);
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
export async function createPurchaseOrder(purchaseRequestId?: string): Promise<PurchaseOrder> {
  const { purchaseOrder } = await apiFetch<{ purchaseOrder: PurchaseOrder }>("/purchase-orders", {
    method: "POST",
    body: JSON.stringify(purchaseRequestId ? { purchaseRequestId } : {}),
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
