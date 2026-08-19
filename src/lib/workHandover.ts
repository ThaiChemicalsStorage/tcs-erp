import { apiFetch } from "./apiClient.js";

/**
 * Work Handover Note (ใบส่งมอบงาน) — added 2026-08-19, the 4th Project-module document type,
 * previously deferred (see docs/CLAUDE.md's coordination note and docs/MODULES/Accounting.md).
 *
 * ⚠️ UNLIKE Material Requisition/Job Order/Purchase Request, there is NO reference PDF for this
 * document — no real paper form was ever provided to build against. This is a first-draft structure
 * inferred purely from the document's known PURPOSE (per docs/MODULES/Accounting.md's "Flow
 * งานบัญชี.(13.8.69).xlsx" summary, item 7 of the "บัญชีรับ" sheet): prepared by Project staff once
 * work is complete, signed by the customer on-site as acceptance, and the signed copy is what tells
 * Accounting the next payment installment can be billed. **Every field below should be verified
 * against the actual paper form once the owner/accounting department provides one** — see
 * docs/MODULES/Project.md "Work Handover Note (first draft, unverified)" for the full caveat.
 *
 * Generated from a Project (not a ScopeOfWorkItem — unlike Material Requisition/Job Order/Purchase
 * Request, this document isn't about sourcing one item, it's a whole-job completion record), with a
 * denormalized scopeOfWorkId + jobCode snapshot for traceability, same convention as the other 3.
 * Line items are free-typed, same "no fixed catalog" reasoning and shape as Job Order's lines.
 *
 * `documentCode` is deliberately always `null` — no real form code (e.g. "FM-PJ-02") exists yet, and
 * inventing one would misrepresent an unverified guess as a real business identifier. Leave it null
 * until the real form surfaces.
 *
 * Status is NOT the Draft/Final lock every other Project-module document uses — signing (customer
 * acceptance) is the meaningful state transition here, not an internal "finalize" approval. `isSigned`
 * + `signedAt` are the sole source of truth; there is no separate `status` enum field. Signing this
 * document does NOT automatically update any Scope of Work billing status — the Accounting module
 * doesn't exist yet, so `isSigned`/`signedAt` are a manual signal a human (Accounting) checks, not an
 * automated trigger. See docs/MODULES/Project.md for this explicit limitation.
 */

export interface WorkHandoverLine {
  id: string;
  description: string;
  quantity: number | null;
  unit: string;
  remark: string;
}

export interface WorkHandoverNote {
  /** Human-readable business id (e.g. "WH-2569-0001"), same numbering convention as the other 3
   * Project-module document types. */
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  /** Snapshot of Project.scopeNumber. */
  jobCode: string;
  /** Pending confirmation of the real paper form's code (e.g. an "FM-PJ-0x" equivalent) — always
   * null until a real reference form is provided. Never invent a value here. */
  documentCode: string | null;
  /** Snapshot from Project.customerCompanyName. */
  customerName: string;
  /** Free-text job/site description — what work/site this handover covers. */
  siteDescription: string;
  /** "วันที่งานแล้วเสร็จ" — date the work was completed, distinct from signedAt (the date of the
   * customer's acceptance signature, which may come later). */
  workCompletedDate: string;
  /** What was delivered/completed — free-typed, same shape/reasoning as JobOrderLine (no fixed
   * catalog; a handover can describe a mix of fabricated items, installed equipment, or services). */
  lines: WorkHandoverLine[];
  preparedByName: string;
  preparedBySignatureDataUrl: string;
  preparedAt: string | null;
  customerSignedName: string;
  customerSignatureDataUrl: string;
  customerSignedAt: string | null;
  /** True once the customer's acceptance signature has been confirmed via signWorkHandover(). The
   * sole source of truth for this document's state — see the file-level doc comment above. */
  isSigned: boolean;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/** Lightweight shape for both the by-project existence-check list and the standalone list page —
 * same shared-summary convention JobOrderSummary/PurchaseRequestSummary already use. */
export interface WorkHandoverSummary {
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  jobCode: string;
  isSigned: boolean;
  updatedAt: string;
}

// ดึงรายการใบส่งมอบงานของโครงการที่ระบุ (ใช้ตรวจสอบว่ามีอยู่แล้วหรือไม่)
// Fetches Work Handover Notes for one Project — used for the "does one already exist?" check
export async function fetchWorkHandoversByProject(projectId: string): Promise<WorkHandoverSummary[]> {
  const { workHandovers } = await apiFetch<{ workHandovers: WorkHandoverSummary[] }>(`/work-handovers?projectId=${encodeURIComponent(projectId)}`);
  return workHandovers;
}
// ดึงรายการใบส่งมอบงานทั้งหมดในระบบ สำหรับหน้ารายการแบบแยกต่างหาก
// Fetches every Work Handover Note company-wide, for the standalone management page's list
export async function fetchAllWorkHandovers(): Promise<WorkHandoverSummary[]> {
  const { workHandovers } = await apiFetch<{ workHandovers: WorkHandoverSummary[] }>("/work-handovers");
  return workHandovers;
}
export async function fetchWorkHandover(id: string): Promise<WorkHandoverNote> {
  const { workHandover } = await apiFetch<{ workHandover: WorkHandoverNote }>(`/work-handovers/${encodeURIComponent(id)}`);
  return workHandover;
}
export async function createWorkHandoverFromProject(projectId: string): Promise<WorkHandoverNote> {
  const { workHandover } = await apiFetch<{ workHandover: WorkHandoverNote }>("/work-handovers", { method: "POST", body: JSON.stringify({ projectId }) });
  return workHandover;
}
export type WorkHandoverUpdateFields = Partial<Omit<WorkHandoverNote, "id" | "projectId" | "scopeOfWorkId" | "jobCode" | "createdAt" | "createdBy" | "isDeleted" | "isSigned" | "signedAt">>;
export async function updateWorkHandover(id: string, fields: WorkHandoverUpdateFields): Promise<WorkHandoverNote> {
  const { workHandover } = await apiFetch<{ workHandover: WorkHandoverNote }>(`/work-handovers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return workHandover;
}
// ยืนยันว่าลูกค้าเซ็นรับงานแล้ว (ต้องบันทึกลายเซ็นลูกค้าไว้ก่อนด้วย updateWorkHandover)
// Confirms the customer's acceptance signature (the signature itself must already be saved via updateWorkHandover first)
export async function signWorkHandover(id: string): Promise<WorkHandoverNote> {
  const { workHandover } = await apiFetch<{ workHandover: WorkHandoverNote }>(`/work-handovers/${encodeURIComponent(id)}/sign`, { method: "POST" });
  return workHandover;
}
export async function logWorkHandoverPrinted(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/work-handovers/${encodeURIComponent(id)}/print`, { method: "POST" });
}
export async function deleteWorkHandover(id: string): Promise<void> {
  await apiFetch<void>(`/work-handovers/${encodeURIComponent(id)}`, { method: "DELETE" });
}
// สร้างรายการเปล่าสำหรับตารางที่พิมพ์เองอิสระ (ไม่ผูกกับแคตตาล็อก) เหมือนใบสั่งงาน
// Builds a blank free-typed line (not catalog-linked), same shape/reasoning as Job Order's blankJobOrderLine()
export function blankWorkHandoverLine(): WorkHandoverLine {
  return { id: `whline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, description: "", quantity: null, unit: "", remark: "" };
}
