/**
 * ใบสั่งผลิต (Production Order, FM-PD-02 Rev.00 : 01/11/64) — added 2026-08-20 for the Production
 * (ผลิต) department. Transcribed from `reference/company/ใบสั่งผลิต(Production Order).pdf`, which is
 * a scanned form (gitignored, so the field mapping below is the durable record of its structure).
 *
 * Unlike Material Requisition / Job Order / Purchase Request — which are all generated from a
 * *Project item* — a Production Order is generated **directly from an approved Scope of Work**
 * (owner-confirmed 2026-08-20). The Production department receives the Scope of Work, Cost Control
 * and Drawing, then issues this to distribute fabrication work to the team.
 *
 * Numbering is `SC-{YYYY}-{MM}-{NNN}` — Gregorian year + month, unlike every other document in this
 * app which uses a Buddhist year (MR-2569-0001). That is deliberate: it matches the real form's own
 * `SC-2026-08-009`, confirmed with the owner rather than assumed.
 */

import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";

export type ProductionOrderStatus = "Draft" | "PendingApproval" | "Final";

/**
 * One row of the printed table (ลำดับที่ / รายการ / สั่งผลิต: จำนวน+หน่วย / หมายเหตุ).
 *
 * The real form mixes three kinds of row, which is why `isSectionHeader` and `subDetails` exist:
 *   - a bold product header ("FRP Vertical Tank 8 Cu.m. ...") with a remark but no seq/qty
 *   - a centred divider ("ชิ้นส่วน")
 *   - numbered items, several carrying indented continuation lines underneath
 *     ("หนา 7 mm. 1(V)+2(M4)/S901...", "สเต็ปที่1 ...", "สเต็ปที่2 ...")
 * Sequence numbers are assigned at render time over non-header rows only, so inserting a header
 * never renumbers anything — same approach ScopeOfWorkItem's own `isSectionHeader` takes.
 */
export interface ProductionOrderLine {
  id: string;
  isSectionHeader: boolean;
  description: string;
  /** บรรทัดรายละเอียดย่อยใต้รายการหลัก — พิมพ์เยื้องเข้ามาใต้คำอธิบาย */
  subDetails: string[];
  qty: number | null;
  unit: string;
  remark: string;
}

/** ช่องเซ็นท้ายฟอร์ม 5 ช่อง แต่ละช่องมีชื่อ + วันที่ */
export interface ProductionOrderSignatory {
  name: string;
  date: string;
}

export interface ProductionOrder {
  id: string;
  /**
   * เลขที่ใบสั่งผลิตที่พิมพ์ออกมาบนฟอร์ม — แก้เองได้ (ฉบับร่างเท่านั้น) ตามที่ฝ่ายผลิตขอเมื่อ 2026-08-27
   *
   * แยกจาก `id` โดยตั้งใจ: `id` คือ `_id` ของ MongoDB ซึ่งแก้ไม่ได้ และใบเบิก/ใบขอซื้ออ้างถึงมันผ่าน
   * `productionOrderId` ตัวนับรายเดือนจึงยังเดินตามปกติทุกใบ ส่วนเลขที่พิมพ์บนกระดาษเปลี่ยนได้อิสระ
   * ตอนสร้างจะเท่ากับ `id` เสมอ เอกสารเก่าที่ไม่มีฟิลด์นี้เซิร์ฟเวอร์เติมให้เป็น `id` ตอนอ่าน
   */
  documentNumber: string;
  /** เลขที่งาน (รหัสงาน) — snapshot ของ ScopeOfWork.scopeNumber */
  scopeOfWorkId: string;
  jobCode: string;
  customerCompanyName: string;
  /** ชื่อสินค้า — พิมพ์เอง ไม่ได้ดึงอัตโนมัติ เพราะหนึ่งงานอาจสั่งผลิตหลายรายการแยกใบกัน */
  productName: string;
  /** ชื่อพนักงานดูแล เช่น "นางพ่วงแก้ว สุมาภา (FI-01)" — เก็บเป็นข้อความอิสระตามฟอร์ม */
  supervisorName: string;
  /** วันที่เริ่มผลิต / กำหนดเสร็จ (YYYY-MM-DD, "" = ยังไม่ระบุ) */
  startDate: string;
  dueDate: string;
  lines: ProductionOrderLine[];
  status: ProductionOrderStatus;

  // ── ช่องเซ็น 5 ช่องท้ายฟอร์ม ──────────────────────────────────────────────
  orderedBy: ProductionOrderSignatory;
  /** ผู้อนุมัติ — ระบบเติมชื่อ/วันที่ให้ตอนกดอนุมัติ ถ้ายังว่างอยู่ (ดู api/_lib/documentApproval.ts) */
  approver: ProductionOrderSignatory;
  deliveredBy: ProductionOrderSignatory;
  receivedBy: ProductionOrderSignatory;
  costDeptBy: ProductionOrderSignatory;

  /**
   * หมายเหตุการแก้ไข — พิมพ์เอง อธิบายว่าฉบับนี้ต่างจากฉบับก่อนตรงไหน (ฝ่ายผลิตขอไว้ 2026-08-27:
   * "ใบเบิกของมี Rewrite แล้วสามารถทำหมายเหตุการแก้ไขได้เหมือนใน scope และสามารถดูในใบปริ้นได้") **แสดงบนใบพิมพ์ด้วย** ต่างจาก revisionNote ของใบเสนอราคา/Scope of Work
   * ที่เป็นข้อมูลภายในและไม่เคยถูกพิมพ์เลย
   *
   * ไม่สืบทอดมาจากฉบับก่อนตอนกด Rewrite — เริ่มว่างเสมอ ตรงกับพฤติกรรมของ Scope of Work
   * เอกสารเก่าที่ไม่มีฟิลด์นี้อ่านออกมาเป็น "" (normalize ตอนอ่าน ไม่ได้ทำ migration)
   */
  revisionNote: string;

  /** ผู้กดอนุมัติจริงในระบบ + เหตุผลที่ตีกลับ — เซิร์ฟเวอร์เขียนเท่านั้น */
  approvedByUserId?: string;
  rejectionComment?: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export interface ProductionOrderSummary {
  id: string;
  documentNumber: string;
  scopeOfWorkId: string;
  jobCode: string;
  customerCompanyName: string;
  productName: string;
  status: ProductionOrderStatus;
  updatedAt: string;
}

export function blankProductionOrderLine(id: string, isSectionHeader = false): ProductionOrderLine {
  return { id, isSectionHeader, description: "", subDetails: [], qty: null, unit: "", remark: "" };
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchAllProductionOrders(): Promise<ProductionOrderSummary[]> {
  const { productionOrders } = await apiFetch<{ productionOrders: ProductionOrderSummary[] }>("/production-orders");
  return productionOrders;
}
export async function fetchProductionOrdersByScope(scopeOfWorkId: string): Promise<ProductionOrderSummary[]> {
  const { productionOrders } = await apiFetch<{ productionOrders: ProductionOrderSummary[] }>(`/production-orders?scopeOfWorkId=${encodeURIComponent(scopeOfWorkId)}`);
  return productionOrders;
}
export async function fetchProductionOrder(id: string): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}`);
  return productionOrder;
}
/** สร้างจาก Scope of Work ที่อนุมัติแล้วเท่านั้น (เซิร์ฟเวอร์บังคับ) */
export async function createProductionOrderFromScope(scopeOfWorkId: string, itemIds?: string[]): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>("/production-orders", {
    method: "POST", body: JSON.stringify({ scopeOfWorkId, ...(itemIds ? { itemIds } : {}) }),
  });
  return productionOrder;
}
export type ProductionOrderUpdateFields = Partial<Omit<ProductionOrder, "id" | "createdAt" | "createdBy" | "isDeleted">>;
export async function updateProductionOrder(id: string, fields: ProductionOrderUpdateFields, options?: WriteOptions): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}${writeQuery(options)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
  return productionOrder;
}
export async function deleteProductionOrder(id: string): Promise<void> {
  await apiFetch(`/production-orders/${encodeURIComponent(id)}`, { method: "DELETE" });
}
/**
 * ช่องเซ็นหลังอนุมัติ (ผู้ส่งมอบงาน/ผู้ตรวจรับงาน/แผนกต้นทุน) — กรอกได้แม้เอกสารอนุมัติแล้ว เพราะบน
 * ฟอร์มจริงสามช่องนี้เซ็นหลังทำงานเสร็จ ดู handleSignatories() ใน api/_lib/productionOrderHandler.ts
 */
export async function updateProductionOrderSignatories(
  id: string,
  fields: Partial<Pick<ProductionOrder, "deliveredBy" | "receivedBy" | "costDeptBy">>,
): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}/signatories`, {
    method: "POST", body: JSON.stringify(fields),
  });
  return productionOrder;
}

/** ดึงรายการ+สเปกจาก Scope of Work ต้นทางมาแทนที่รายการทั้งชุด (ฉบับร่างเท่านั้น) */
export async function refreshProductionOrderFromScope(id: string): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}/refresh`, { method: "POST" });
  return productionOrder;
}

/** สร้างฉบับแก้ไขใหม่ (`-R{n}`) จากใบที่อนุมัติแล้ว — หมายเหตุการแก้ไขเริ่มว่างเสมอ */
export async function rewriteProductionOrder(id: string): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return productionOrder;
}

export async function logProductionOrderPrinted(id: string): Promise<void> {
  await apiFetch(`/production-orders/${encodeURIComponent(id)}/print`, { method: "POST" });
}

// ── ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) — เหมือน Scope of Work ทุกประการ ──────────────
export async function submitProductionOrderApproval(id: string): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return productionOrder;
}
export async function approveProductionOrder(id: string): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}/approve`, { method: "POST" });
  return productionOrder;
}
export async function rejectProductionOrder(id: string, comment: string): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}/reject`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  return productionOrder;
}
export async function withdrawProductionOrderApproval(id: string): Promise<ProductionOrder> {
  const { productionOrder } = await apiFetch<{ productionOrder: ProductionOrder }>(`/production-orders/${encodeURIComponent(id)}/withdraw-approval`, { method: "POST" });
  return productionOrder;
}
