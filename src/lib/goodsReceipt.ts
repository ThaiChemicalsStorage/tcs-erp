/**
 * ใบตรวจรับสินค้า (Goods Receipt) — added 2026-08-28, step 3 of the owner's procurement flow chart
 * (PR → PO → **รับ/ตรวจรับสินค้า** → รับวางบิล).
 *
 * Generated from an approved Purchase Order, copying its lines as a snapshot. Each line records
 * **what was ordered vs. what actually arrived**, because partial and rejected deliveries are the
 * normal case, not an edge case — that is the entire reason this document exists rather than just
 * ticking the PO as "received".
 *
 * **No approval workflow.** Unlike the PO, this is an inspection record, not a commitment: the flow
 * chart shows an inspector receiving and checking, with no approval gate after it. So the status is
 * a plain two-step ร่าง → ตรวจรับแล้ว and `api/_lib/documentApproval.ts` is deliberately not used.
 *
 * **Does not write stock.** `stock_movements` is the single source of truth for `Product.stockQty`
 * (see `applyStockMovement()` in api/_lib/stockHandler.ts) and a receipt is the obvious future
 * writer — `StockMovementSourceType` gains a `"goods_receipt"` value here so the link is typed —
 * but nothing is written yet. Whether receiving should cut stock automatically or behind an
 * explicit confirmation is a business decision the owner has not made, and guessing it would put
 * wrong numbers in a live stock ledger.
 *
 * ⚠️ The printed form is not built yet — the owner will supply the real FM-PU-xx form.
 */

import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";

export type GoodsReceiptStatus = "Draft" | "Received";

/** ผลตรวจรับต่อรายการ */
export type GoodsReceiptLineResult = "Pending" | "Passed" | "Rejected";

export interface GoodsReceiptLine {
  id: string;
  productId: string | null;
  productCode: string;
  description: string;
  subDetails: string[];
  unit: string;
  /** จำนวนที่สั่งไว้ใน PO — snapshot ไม่ให้แก้ ใช้เทียบกับของที่มาจริง */
  qtyOrdered: number | null;
  /** จำนวนที่รับจริง — กรอกตอนตรวจรับ */
  qtyReceived: number | null;
  result: GoodsReceiptLineResult;
  /** เหตุผลตอนไม่ผ่าน / ของขาด */
  remark: string;
}

export interface GoodsReceipt {
  id: string;
  documentNumber: string;
  /** ใบสั่งซื้อต้นทาง — บังคับมี ใบตรวจรับไม่มีต้นทางไม่ได้ */
  purchaseOrderId: string;
  jobCode: string;
  vendorName: string;

  /** วันที่รับของจริง (YYYY-MM-DD, "" = ยังไม่ระบุ) */
  receivedDate: string;
  /** เลขที่ใบส่งของ/ใบกำกับภาษีของผู้ขายที่แนบมากับของ */
  deliveryNoteRef: string;
  /** สถานที่รับของ */
  receivedLocation: string;

  lines: GoodsReceiptLine[];
  remarks: string;
  status: GoodsReceiptStatus;

  /** ช่องเซ็นบนฟอร์ม — ข้อความอิสระ */
  receivedBy: string;
  inspectedBy: string;

  revisionNote: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export interface GoodsReceiptSummary {
  id: string;
  documentNumber: string;
  purchaseOrderId: string;
  jobCode: string;
  vendorName: string;
  receivedDate: string;
  status: GoodsReceiptStatus;
  updatedAt: string;
}

export function blankGoodsReceiptLine(id: string): GoodsReceiptLine {
  return {
    id, productId: null, productCode: "", description: "", subDetails: [], unit: "",
    qtyOrdered: null, qtyReceived: null, result: "Pending", remark: "",
  };
}

/** รับครบทุกรายการหรือยัง — ใช้เตือนก่อนปิดใบ ไม่ได้บังคับ เพราะรับไม่ครบแล้วปิดใบเป็นเรื่องปกติ */
export function isFullyReceived(lines: GoodsReceiptLine[]): boolean {
  return lines.length > 0 && lines.every((l) => (l.qtyReceived ?? 0) >= (l.qtyOrdered ?? 0));
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchAllGoodsReceipts(): Promise<GoodsReceiptSummary[]> {
  const { goodsReceipts } = await apiFetch<{ goodsReceipts: GoodsReceiptSummary[] }>("/goods-receipts");
  return goodsReceipts;
}

export async function fetchGoodsReceiptsByOrder(purchaseOrderId: string): Promise<GoodsReceiptSummary[]> {
  const { goodsReceipts } = await apiFetch<{ goodsReceipts: GoodsReceiptSummary[] }>(
    `/goods-receipts?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`,
  );
  return goodsReceipts;
}

export async function fetchGoodsReceipt(id: string): Promise<GoodsReceipt> {
  const { goodsReceipt } = await apiFetch<{ goodsReceipt: GoodsReceipt }>(`/goods-receipts/${encodeURIComponent(id)}`);
  return goodsReceipt;
}

/** สร้างจากใบสั่งซื้อที่อนุมัติแล้ว (เซิร์ฟเวอร์บังคับสถานะ Final) */
export async function createGoodsReceipt(purchaseOrderId: string): Promise<GoodsReceipt> {
  const { goodsReceipt } = await apiFetch<{ goodsReceipt: GoodsReceipt }>("/goods-receipts", {
    method: "POST", body: JSON.stringify({ purchaseOrderId }),
  });
  return goodsReceipt;
}

export type GoodsReceiptUpdateFields = Partial<Omit<GoodsReceipt, "id" | "createdAt" | "createdBy" | "isDeleted">>;

export async function updateGoodsReceipt(id: string, fields: GoodsReceiptUpdateFields, options?: WriteOptions): Promise<GoodsReceipt> {
  const { goodsReceipt } = await apiFetch<{ goodsReceipt: GoodsReceipt }>(
    `/goods-receipts/${encodeURIComponent(id)}${writeQuery(options)}`,
    { method: "PATCH", body: JSON.stringify(fields) },
  );
  return goodsReceipt;
}

export async function deleteGoodsReceipt(id: string): Promise<void> {
  await apiFetch(`/goods-receipts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** ปิดใบ (ร่าง → ตรวจรับแล้ว) — ล็อกการแก้ไขหลังจากนี้ */
export async function completeGoodsReceipt(id: string): Promise<GoodsReceipt> {
  const { goodsReceipt } = await apiFetch<{ goodsReceipt: GoodsReceipt }>(`/goods-receipts/${encodeURIComponent(id)}/complete`, { method: "POST" });
  return goodsReceipt;
}

/** เปิดใบที่ปิดไปแล้วกลับมาแก้ (ตรวจรับแล้ว → ร่าง) — ต้องมีสิทธิ์ปิดใบเท่านั้น */
export async function reopenGoodsReceipt(id: string): Promise<GoodsReceipt> {
  const { goodsReceipt } = await apiFetch<{ goodsReceipt: GoodsReceipt }>(`/goods-receipts/${encodeURIComponent(id)}/reopen`, { method: "POST" });
  return goodsReceipt;
}

export async function logGoodsReceiptPrinted(id: string): Promise<void> {
  await apiFetch(`/goods-receipts/${encodeURIComponent(id)}/print`, { method: "POST" });
}
