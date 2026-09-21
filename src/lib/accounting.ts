import { apiFetch } from "./apiClient.js";
import type { TranslationKey } from "./i18n.js";

/**
 * Accounts Receivable (Milestone Billing) — Phase 1 (added 2026-08-17). See
 * docs/MODULES/Accounting.md for the full design writeup. Types mirror the server shapes in
 * api/_lib/collections.ts (ArMilestoneFields/ArDocumentFields) 1:1.
 */

export type ArBillingStatus = "not_billed" | "billed" | "work_open" | "closed";
export type ArWorkClassification = "goods" | "service" | "contract";
export type ArChecklistKey = "poCopy" | "deliveryNote" | "report" | "stampDuty" | "bankGuarantee" | "whtEnvelope";

export const AR_CHECKLIST_LABELS: Record<ArChecklistKey, string> = {
  poCopy: "สำเนาใบสั่งซื้อ/สัญญา",
  deliveryNote: "ใบส่งมอบงาน/ใบส่งสินค้า ที่มีลายเซ็นลูกค้า",
  report: "Report แนบการวางบิล",
  stampDuty: "อากรแสตมป์",
  bankGuarantee: "หนังสือค้ำประกัน",
  whtEnvelope: "ซองติดแสตมป์สำหรับใบหักภาษี ณ ที่จ่าย",
};

export interface ArMilestone {
  id: string;
  scopeOfWorkId: string;
  installmentId: string;
  isDownPayment: boolean;
  pct: number | null;
  label: string;
  paymentType: "" | "Cash" | "Credit";
  days: number | null;
  totalContractValueExVat: number;
  retentionPct: number | null;
  workClassification: ArWorkClassification;
  billingStatus: ArBillingStatus;
  checklistState: Partial<Record<ArChecklistKey, boolean>>;
  attachmentIds: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export type ArDocumentType = "AR" | "IV" | "BI" | "RE";
export type ArDocumentStatus = "issued" | "cancelled";

export interface ArDocumentLine {
  seq: number;
  description: string;
  /**
   * บรรทัดรายละเอียดย่อยใต้คำอธิบายหลัก (เช่น "For Installation" ใต้ "(งวดที่1/4)30%DownPayment") —
   * เพิ่ม 2026-08-20 ตามใบกำกับภาษีจริงที่เจ้าของส่งมา ซึ่งมีบรรทัดย่อยใต้รายการหลัก
   *
   * Optional because every document issued before 2026-08-20 was stored without it — readers must
   * treat `undefined` as "no sub-details", never assume the array exists. Carried through from
   * `QuoteLine.subDetails` for job-derived invoices, and enterable directly in the manual dialog.
   */
  subDetails?: string[];
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  linkedArDocumentId?: string;
}

export interface ArDocumentCustomerSnapshot {
  companyName: string;
  address: string;
  taxId: string;
  branch: string;
  contactName: string;
  phone: string;
  email: string;
}

export interface ArDocument {
  id: string;
  scopeOfWorkId: string;
  milestoneId: string;
  docType: ArDocumentType;
  docNo: string;
  docDate: string;
  dueDate: string;
  paymentType: "" | "Cash" | "Credit";
  customerSnapshot: ArDocumentCustomerSnapshot;
  reference: string;
  lines: ArDocumentLine[];
  subtotal: number;
  discount: number;
  valueAmount: number;
  vatRate: number;
  vatAmount: number;
  netTotal: number;
  amountTextTh: string;
  remarks: string[];
  /** True once any stock has been cut against this document (added 2026-08-18, IV only in
   * practice) — see src/lib/stock.ts and api/_lib/collections.ts's StockMovementFields. */
  stockDeducted: boolean;
  /** True for a freestanding tax invoice created via "+ สร้างใบกำกับภาษี (Manual)" — no Scope of
   * Work/milestone behind it. See api/_lib/collections.ts's ArDocumentFields doc comment. */
  isManual: boolean;
  status: ArDocumentStatus;
  cancelledReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export async function fetchArMilestones(scopeOfWorkId?: string): Promise<ArMilestone[]> {
  const qs = scopeOfWorkId ? `?scopeOfWorkId=${encodeURIComponent(scopeOfWorkId)}` : "";
  const { milestones } = await apiFetch<{ milestones: ArMilestone[] }>(`/ar-milestones${qs}`);
  return milestones;
}

/** Opens (lazily creating if needed) the milestone row for a Scope of Work installment. */
export async function openArMilestone(scopeOfWorkId: string, installmentId: string): Promise<ArMilestone> {
  const { milestone } = await apiFetch<{ milestone: ArMilestone }>("/ar-milestones/open", {
    method: "POST",
    body: JSON.stringify({ scopeOfWorkId, installmentId }),
  });
  return milestone;
}

export async function updateArMilestone(id: string, fields: Partial<Pick<ArMilestone, "workClassification" | "retentionPct" | "checklistState">>): Promise<ArMilestone> {
  const { milestone } = await apiFetch<{ milestone: ArMilestone }>(`/ar-milestones/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return milestone;
}

export async function refreshArMilestone(id: string): Promise<ArMilestone> {
  const { milestone } = await apiFetch<{ milestone: ArMilestone }>(`/ar-milestones/${encodeURIComponent(id)}/refresh`, { method: "POST" });
  return milestone;
}

export async function uploadArAttachment(milestoneId: string, checklistKey: ArChecklistKey, file: { fileName: string; contentType: string; dataBase64: string }): Promise<ArMilestone> {
  const { milestone } = await apiFetch<{ milestone: ArMilestone }>(`/ar-milestones/${encodeURIComponent(milestoneId)}/attachments`, {
    method: "POST",
    body: JSON.stringify({ checklistKey, ...file }),
  });
  return milestone;
}

export async function deleteArAttachment(milestoneId: string, attachmentId: string): Promise<ArMilestone> {
  const { milestone } = await apiFetch<{ milestone: ArMilestone }>(`/ar-milestones/${encodeURIComponent(milestoneId)}/attachments/${encodeURIComponent(attachmentId)}`, { method: "DELETE" });
  return milestone;
}

export function arAttachmentDownloadUrl(milestoneId: string, attachmentId: string): string {
  return `/api/ar-milestones/${encodeURIComponent(milestoneId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

/** Issues the milestone's principal document (AR for a down-payment milestone, IV otherwise) plus a
 * companion BI, in one action — mirrors the real Flow's "AR/IV + BI issue together" workflow. */
export async function issueArDocuments(milestoneId: string): Promise<ArDocument[]> {
  const { documents } = await apiFetch<{ documents: ArDocument[] }>("/ar-documents", {
    method: "POST",
    body: JSON.stringify({ milestoneId }),
  });
  return documents;
}

export interface ManualArDocumentPayload {
  docType: "AR" | "IV";
  customer: {
    companyName: string;
    address: string;
    taxId: string;
    branch: string;
    contactName: string;
    phone: string;
    email: string;
  };
  paymentType: "" | "Cash" | "Credit";
  days: number | null;
  lines: { description: string; subDetails?: string[]; qty: number; unit: string; unitPrice: number }[];
  /** หมายเหตุท้ายเอกสาร พิมพ์ใต้ตารางรายการ — เพิ่ม 2026-08-20 พร้อมกับ subDetails */
  remarks?: string[];
}

/** Freestanding AR/IV creation with no Scope of Work/milestone — issues the principal doc plus a
 * companion BI in the same action, same as `issueArDocuments()`. See
 * api/_lib/arHandler.ts's handleManualIssue() for why this is a separate endpoint. */
export async function issueManualArDocument(payload: ManualArDocumentPayload): Promise<ArDocument[]> {
  const { documents } = await apiFetch<{ documents: ArDocument[] }>("/ar-documents/manual", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return documents;
}

export async function fetchArDocuments(filter?: { scopeOfWorkId?: string; status?: ArDocumentStatus; docType?: ArDocumentType; month?: string }): Promise<ArDocument[]> {
  const params = new URLSearchParams();
  if (filter?.scopeOfWorkId) params.set("scopeOfWorkId", filter.scopeOfWorkId);
  if (filter?.status) params.set("status", filter.status);
  if (filter?.docType) params.set("docType", filter.docType);
  if (filter?.month) params.set("month", filter.month); // Gregorian "YYYY-MM" (docDate's own calendar)
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { documents } = await apiFetch<{ documents: ArDocument[] }>(`/ar-documents${qs}`);
  return documents;
}

/** Issues an RE (ใบเสร็จรับเงิน) against an already-issued AR/IV tax invoice — records the payment
 * actually received; refused server-side if that invoice already has an active receipt. */
export async function issueArReceipt(taxInvoiceDocumentId: string): Promise<ArDocument> {
  const { document } = await apiFetch<{ document: ArDocument }>(`/ar-documents/${encodeURIComponent(taxInvoiceDocumentId)}/receipt`, { method: "POST" });
  return document;
}

/** Cuts stock against an issued IV (ใบกำกับภาษี/ใบส่งสินค้า) — see api/_lib/arHandler.ts's
 * handleStockDeduction() for why this is a separate, incremental action rather than automatic at
 * issue time (no reliable Quotation-line → Product link exists to derive it from). */
export async function deductArDocumentStock(id: string, lines: { productId: string; qty: number }[]): Promise<{ document: ArDocument; movements: import("./stock.js").StockMovement[] }> {
  return apiFetch(`/ar-documents/${id}/stock-deduction`, { method: "POST", body: JSON.stringify({ lines }) });
}

export async function fetchArDocument(id: string): Promise<ArDocument> {
  const { document } = await apiFetch<{ document: ArDocument }>(`/ar-documents/${encodeURIComponent(id)}`);
  return document;
}

export async function cancelArDocument(id: string, reason: string): Promise<ArDocument> {
  const { document } = await apiFetch<{ document: ArDocument }>(`/ar-documents/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return document;
}

/** "2026-08-13" -> "13/08/69" — Buddhist-era 2-digit year, matching every real reference form
 * (AR/IV/BI/RE) photographed 2026-08-18, not the Gregorian 4-digit format `formatQuoteDateNumeric()`
 * (Quotation's own printed date style) uses. */
export function formatArDocDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${String((y + 543) % 100).padStart(2, "0")}`;
}

/** "เงื่อนไขการชำระเงิน" wording exactly as printed on the real Billing Note reference form —
 * e.g. "เครดิต 30 วัน" / "เงินสด". `days` is derived from docDate→dueDate rather than stored
 * separately, since the two dates already fully determine it. */
export function formatArPaymentCondition(doc: Pick<ArDocument, "paymentType" | "docDate" | "dueDate">): string {
  if (!doc.paymentType) return "";
  if (doc.paymentType === "Cash") return "เงินสด";
  const days = Math.round((new Date(doc.dueDate).getTime() - new Date(doc.docDate).getTime()) / 86_400_000);
  return days > 0 ? `เครดิต ${days} วัน` : "เครดิต";
}

/** Maps each tax invoice's id → the still-active (non-cancelled) RE receipt issued against it,
 * joined through every receipt line's `linkedArDocumentId`. Three views need the same
 * "has this invoice been paid?" answer off whatever document set they happen to be holding — the
 * per-document-type list page (ชำระแล้ว column + the "ออกใบเสร็จ" row action), the job-billing
 * detail view, and the Billing Note print's ชำระแล้ว/เงินคงค้าง columns — so the join rule lives
 * here once rather than being re-derived at each call site. Added 2026-08-20. */
export function receiptByInvoiceId(documents: ArDocument[]): Record<string, ArDocument> {
  const map: Record<string, ArDocument> = {};
  for (const d of documents) {
    if (d.docType !== "RE" || d.status !== "issued") continue;
    for (const line of d.lines) {
      if (line.linkedArDocumentId) map[line.linkedArDocumentId] = d;
    }
  }
  return map;
}

/** The `ArPaidByInvoiceId` the print components take — invoice id → amount actually received,
 * derived from `receiptByInvoiceId()` above (a receipt's net total IS the amount received). */
export function paidByInvoiceId(documents: ArDocument[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(receiptByInvoiceId(documents)).map(([invoiceId, re]) => [invoiceId, re.netTotal]),
  );
}

export const BILLING_STATUS_LABELS: Record<ArBillingStatus, string> = {
  not_billed: "ยังไม่ได้วางบิล",
  billed: "วางบิล",
  work_open: "งานยังไม่จบ",
  closed: "จบ",
};

/** i18n key equivalents of the two label maps above — same `t(SOME_LABEL_KEY[x])` pattern as
 * `PERMISSION_LABEL_KEY` (src/lib/permissions.ts). Use these (not the plain-Thai maps above) in any
 * on-screen UI; the plain maps stay for print-only components, which are always Thai regardless of
 * the UI language toggle (same convention as PrintDocument.tsx — see docs/CLAUDE.md). Added 2026-08-18. */
export const BILLING_STATUS_LABEL_KEY: Record<ArBillingStatus, TranslationKey> = {
  not_billed: "accounting.billingStatus.notBilled",
  billed: "accounting.billingStatus.billed",
  work_open: "accounting.billingStatus.workOpen",
  closed: "accounting.billingStatus.closed",
};

export const WORK_CLASSIFICATION_LABELS: Record<ArWorkClassification, string> = {
  goods: "สินค้า",
  service: "บริการ",
  contract: "งานสัญญา",
};

// Document names exactly as the owner stated them 2026-08-18 (the "เอกสารบัญชี" list in the
// follow-up detail that unpaused the UI restructure — see docs/MODULES/Accounting.md).
export const DOC_TYPE_LABELS: Record<ArDocumentType, string> = {
  AR: "ใบรับเงินมัดจำ/ใบกำกับภาษี",
  IV: "ใบกำกับภาษี/ใบส่งสินค้า",
  BI: "ใบแจ้งหนี้/ใบวางบิล",
  RE: "ใบเสร็จรับเงิน",
};

/** i18n key equivalent of `DOC_TYPE_LABELS` above — see `BILLING_STATUS_LABEL_KEY`'s doc comment
 * for when to use this vs. the plain-Thai map. Added 2026-08-18. */
export const DOC_TYPE_LABEL_KEY: Record<ArDocumentType, TranslationKey> = {
  AR: "accounting.docType.AR",
  IV: "accounting.docType.IV",
  BI: "accounting.docType.BI",
  RE: "accounting.docType.RE",
};
