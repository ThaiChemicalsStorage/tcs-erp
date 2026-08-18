import { apiFetch } from "./apiClient.js";

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

export type ArDocumentType = "AR" | "IV" | "BI";
export type ArDocumentStatus = "issued" | "cancelled";

export interface ArDocumentLine {
  seq: number;
  description: string;
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

export async function fetchArDocuments(filter?: { scopeOfWorkId?: string; status?: ArDocumentStatus }): Promise<ArDocument[]> {
  const params = new URLSearchParams();
  if (filter?.scopeOfWorkId) params.set("scopeOfWorkId", filter.scopeOfWorkId);
  if (filter?.status) params.set("status", filter.status);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { documents } = await apiFetch<{ documents: ArDocument[] }>(`/ar-documents${qs}`);
  return documents;
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

export const BILLING_STATUS_LABELS: Record<ArBillingStatus, string> = {
  not_billed: "ยังไม่ได้วางบิล",
  billed: "วางบิล",
  work_open: "งานยังไม่จบ",
  closed: "จบ",
};

export const WORK_CLASSIFICATION_LABELS: Record<ArWorkClassification, string> = {
  goods: "สินค้า",
  service: "บริการ",
  contract: "งานสัญญา",
};

export const DOC_TYPE_LABELS: Record<ArDocumentType, string> = {
  AR: "ใบกำกับภาษี (เงินมัดจำ)",
  IV: "ใบกำกับภาษี",
  BI: "ใบวางบิล",
};
