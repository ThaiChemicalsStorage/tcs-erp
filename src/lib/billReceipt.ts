/**
 * ใบรับวางบิล (Bill Receipt) — added 2026-08-28, the last step of the owner's procurement flow chart
 * (PR → PO → รับ/ตรวจรับสินค้า → **รับวางบิล**).
 *
 * Records that Purchasing received a supplier's invoice/billing documents against a purchase order,
 * who received them, and when payment is due. It is the hand-off point to Accounting.
 *
 * **This is not Accounts Payable.** The app's existing Accounting module (`src/lib/accounting.ts`,
 * `ar_documents`) is Accounts *Receivable* — money customers owe TCS. This document is the mirror
 * side, money TCS owes suppliers, but it deliberately stops at "we received the bill": it does not
 * post a payable, does not touch `ar_documents`, and does not model payment. Wiring it into a real
 * AP ledger is separate, larger work the owner has not scoped yet.
 *
 * **No approval workflow** — like the goods receipt, this is a record of something that happened,
 * not a commitment needing sign-off. Status is ร่าง → รับวางบิลแล้ว.
 *
 * ⚠️ The printed form is not built yet — the owner will supply the real form.
 */

import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";

export type BillReceiptStatus = "Draft" | "Received";

/** เอกสารที่ผู้ขายแนบมาตอนวางบิล — ติ๊กว่าได้รับอะไรมาบ้าง */
export interface BillReceiptAttachmentCheck {
  key: string;
  label: string;
  checked: boolean;
}

/**
 * รายการเอกสารมาตรฐานที่ต้องได้รับตอนวางบิล — ตั้งต้นให้ทุกใบ ผู้ใช้ติ๊กเอง
 * เป็นค่าตั้งต้นที่ถอดมาจากผังงาน ("สินค้า / ผู้รับเหมา / เอกสาร") **รอฟอร์มจริงมายืนยัน**
 */
export const DEFAULT_BILL_ATTACHMENT_CHECKS: readonly { key: string; label: string }[] = [
  { key: "invoice", label: "ใบแจ้งหนี้ / Invoice" },
  { key: "taxInvoice", label: "ใบกำกับภาษี" },
  { key: "deliveryNote", label: "ใบส่งของ" },
  { key: "poCopy", label: "สำเนาใบสั่งซื้อ" },
  { key: "receipt", label: "ใบเสร็จรับเงิน" },
];

export interface BillReceipt {
  id: string;
  documentNumber: string;
  /** ใบสั่งซื้อต้นทาง */
  purchaseOrderId: string;
  /** ใบตรวจรับที่เกี่ยวข้อง — "" ได้ ถ้ายังไม่ได้ออกใบตรวจรับ */
  goodsReceiptId: string;
  jobCode: string;
  vendorName: string;

  /** เลขที่ใบแจ้งหนี้ของผู้ขาย */
  vendorInvoiceNo: string;
  /** วันที่บนใบแจ้งหนี้ของผู้ขาย */
  vendorInvoiceDate: string;
  /** วันที่รับวางบิล */
  receivedDate: string;
  /** กำหนดชำระ */
  dueDate: string;
  /** ยอดตามบิล — null = ยังไม่ระบุ */
  billAmount: number | null;

  attachmentChecks: BillReceiptAttachmentCheck[];
  remarks: string;
  status: BillReceiptStatus;

  /** ช่องเซ็นบนฟอร์ม — ข้อความอิสระ */
  receivedBy: string;

  revisionNote: string;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export interface BillReceiptSummary {
  id: string;
  documentNumber: string;
  purchaseOrderId: string;
  vendorName: string;
  vendorInvoiceNo: string;
  receivedDate: string;
  dueDate: string;
  billAmount: number | null;
  status: BillReceiptStatus;
  updatedAt: string;
}

export function blankAttachmentChecks(): BillReceiptAttachmentCheck[] {
  return DEFAULT_BILL_ATTACHMENT_CHECKS.map((c) => ({ ...c, checked: false }));
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchAllBillReceipts(): Promise<BillReceiptSummary[]> {
  const { billReceipts } = await apiFetch<{ billReceipts: BillReceiptSummary[] }>("/bill-receipts");
  return billReceipts;
}

export async function fetchBillReceiptsByOrder(purchaseOrderId: string): Promise<BillReceiptSummary[]> {
  const { billReceipts } = await apiFetch<{ billReceipts: BillReceiptSummary[] }>(
    `/bill-receipts?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`,
  );
  return billReceipts;
}

export async function fetchBillReceipt(id: string): Promise<BillReceipt> {
  const { billReceipt } = await apiFetch<{ billReceipt: BillReceipt }>(`/bill-receipts/${encodeURIComponent(id)}`);
  return billReceipt;
}

/** สร้างจากใบสั่งซื้อ (และใบตรวจรับ ถ้ามี) */
export async function createBillReceipt(purchaseOrderId: string, goodsReceiptId?: string): Promise<BillReceipt> {
  const { billReceipt } = await apiFetch<{ billReceipt: BillReceipt }>("/bill-receipts", {
    method: "POST",
    body: JSON.stringify({ purchaseOrderId, ...(goodsReceiptId ? { goodsReceiptId } : {}) }),
  });
  return billReceipt;
}

export type BillReceiptUpdateFields = Partial<Omit<BillReceipt, "id" | "createdAt" | "createdBy" | "isDeleted">>;

export async function updateBillReceipt(id: string, fields: BillReceiptUpdateFields, options?: WriteOptions): Promise<BillReceipt> {
  const { billReceipt } = await apiFetch<{ billReceipt: BillReceipt }>(
    `/bill-receipts/${encodeURIComponent(id)}${writeQuery(options)}`,
    { method: "PATCH", body: JSON.stringify(fields) },
  );
  return billReceipt;
}

export async function deleteBillReceipt(id: string): Promise<void> {
  await apiFetch(`/bill-receipts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** ปิดใบ (ร่าง → รับวางบิลแล้ว) */
export async function completeBillReceipt(id: string): Promise<BillReceipt> {
  const { billReceipt } = await apiFetch<{ billReceipt: BillReceipt }>(`/bill-receipts/${encodeURIComponent(id)}/complete`, { method: "POST" });
  return billReceipt;
}

/** เปิดกลับมาแก้ (รับวางบิลแล้ว → ร่าง) */
export async function reopenBillReceipt(id: string): Promise<BillReceipt> {
  const { billReceipt } = await apiFetch<{ billReceipt: BillReceipt }>(`/bill-receipts/${encodeURIComponent(id)}/reopen`, { method: "POST" });
  return billReceipt;
}

export async function logBillReceiptPrinted(id: string): Promise<void> {
  await apiFetch(`/bill-receipts/${encodeURIComponent(id)}/print`, { method: "POST" });
}
