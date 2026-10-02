import { purchaseRequestLinesToBuy, type PurchaseRequest } from "../../lib/purchaseRequest";

/**
 * แถบขั้นตอนของใบขอซื้อ (ดีไซน์ใหม่ 2026-09-30): 3 ขั้นของเอกสารอนุมัติทั่วไป + 3 ขั้นหลังอนุมัติ
 * จัดทำร่าง → รออนุมัติ → อนุมัติแล้ว → สโตร์เช็คของ → จัดซื้ออนุมัติ → ออกใบสั่งซื้อ
 *
 * **คำนวณจากฟิลด์ที่มีอยู่แล้วเท่านั้น** (`status`, `storeStage`, `purchasingStage`, และบรรทัดที่ออกใบสั่งซื้อ
 * แล้วซึ่งเซิร์ฟเวอร์คำนวณจากใบสั่งซื้อจริง) ไม่มีสถานะใหม่ถูกเก็บลงฐานข้อมูล
 *
 * - ใบเก่าที่ไม่มี `storeStage` (ก่อน 2026-09-09) / `purchasingStage` (ก่อน 2026-09-21) วิ่งตรงไปจัดซื้อ
 *   ตามกติกาเดิม ขั้นนั้นจึงนับว่าผ่านแล้ว — ตรงกับด่านออกใบสั่งซื้อฝั่งเซิร์ฟเวอร์ที่ปล่อยใบเหล่านี้ผ่าน
 * - `storeStage === "closed"` = สโตร์จ่ายจากสต๊อกครบ ไม่ต้องซื้อ → ตัดสองขั้นของจัดซื้อทิ้ง แล้วนับว่าจบ
 */
export type PurchaseRequestStepKey = "draft" | "pending" | "approved" | "store" | "purchasing" | "po";

export interface PurchaseRequestProgress {
  steps: PurchaseRequestStepKey[];
  /** index ของขั้นปัจจุบัน · เท่ากับ steps.length เมื่อครบทุกขั้น */
  current: number;
  /** บรรทัดที่ต้องซื้อจริง (สโตร์ไม่ได้ตัดสินให้จ่ายจากสต๊อก) */
  toBuy: number;
  /** บรรทัดที่ต้องซื้อและมีใบสั่งซื้ออ้างถึงแล้วอย่างน้อยหนึ่งใบ */
  ordered: number;
  /** บรรทัดที่สโตร์ตัดสินว่าจ่ายจากสต๊อก */
  fromStock: number;
  /** เลขที่ใบสั่งซื้อทั้งหมดที่อ้างถึงใบนี้ (ไม่ซ้ำ ตามลำดับที่พบ) */
  purchaseOrders: string[];
}

export function purchaseRequestProgress(
  doc: Pick<PurchaseRequest, "status" | "storeStage" | "purchasingStage" | "lines">,
  purchasedLines: Record<string, string[]>,
): PurchaseRequestProgress {
  const lines = doc.lines ?? [];
  // ไม่นับบรรทัดที่สโตร์จ่ายจากสต๊อก และบรรทัดที่จัดซื้อไม่อนุมัติ (2026-10-02)
  const buyable = purchaseRequestLinesToBuy(doc);
  const ordered = buyable.filter((l) => (purchasedLines[l.id] ?? []).length > 0).length;
  const purchaseOrders: string[] = [];
  for (const l of lines) {
    for (const po of purchasedLines[l.id] ?? []) if (!purchaseOrders.includes(po)) purchaseOrders.push(po);
  }
  const base = { toBuy: buyable.length, ordered, fromStock: lines.filter((l) => l.storeDecision === "stock").length, purchaseOrders };

  if (doc.status === "Final" && doc.storeStage === "closed") {
    const steps: PurchaseRequestStepKey[] = ["draft", "pending", "approved", "store"];
    return { ...base, steps, current: steps.length };
  }
  const steps: PurchaseRequestStepKey[] = ["draft", "pending", "approved", "store", "purchasing", "po"];
  let current: number;
  if (doc.status === "Draft") current = 0;
  else if (doc.status === "PendingApproval") current = 1;
  else if (doc.storeStage === "pending") current = 3;
  else if (doc.purchasingStage === "review") current = 4;
  else if (buyable.length > 0 && ordered >= buyable.length) current = steps.length;
  else current = 5;
  return { ...base, steps, current };
}
