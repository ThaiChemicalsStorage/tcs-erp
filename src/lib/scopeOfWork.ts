import { apiFetch } from "./apiClient.js";
import type { ChecklistOption, ChecklistGroup } from "./documentRequirements.js";

// Re-exported for backward compatibility — `ChecklistOption`/`ChecklistGroup` moved to
// documentRequirements.ts (2026-07-16) so Quotation can share the same checklist-group model
// without depending on this Scope-of-Work-specific module. Every existing import of these two
// types from "./scopeOfWork" (this file) keeps working unchanged.
export type { ChecklistOption, ChecklistGroup };

/**
 * Scope of Work (added 2026-07-15) — a printable job document generated from an existing
 * Quotation, reproducing the printed structure of the reference PDF ("Scope Of Work
 * PQ202607-174-LI-SK บริษัท เค ไทย ไฮดรอลิค จำกัด.pdf", `public/`). See
 * docs/MODULES/ScopeOfWork.md for the full field-by-field PDF mapping.
 *
 * **This file is type-imported into the API bundle** (`api/_lib/collections.ts`,
 * `api/_lib/scopeOfWorkHandler.ts`) — per the standing rule in docs/CLAUDE.md, never add a
 * *value* import here that transitively pulls in JSX/React (e.g. don't import anything from
 * `src/lib/quotes.tsx`, which has module-scope JSX in `statusIcon` that would execute on import
 * and break every authenticated API route). Only type-only imports from `quotes.tsx` are safe.
 *
 * A Scope of Work is created FROM a quotation (`quotationId`) but stores its own independent
 * snapshot of every quotation-derived field (`customerSnapshot`, `items`, `jobTypeCode`, etc.) —
 * editing a Scope of Work never modifies the source quotation, and later edits to the quotation/
 * customer/product master data never silently change an already-created Scope of Work. An
 * explicit "อัปเดตข้อมูลจากใบเสนอราคา" action can re-pull the snapshot on demand only.
 */

export type ScopeOfWorkStatus = "Draft" | "Final";

/** Frozen-at-creation-time copy of the quotation's Customer Information — same "snapshot, not
 * live reference" rule as `Quote.customerSnapshot` (src/lib/customers.ts). `contactName` (added
 * 2026-07-15, Codex review High Priority fix) is the quotation's own generic contact — real
 * quotation data, not a sample/handwritten value — kept here for reference even though it isn't
 * automatically pushed into the more specific `shippingContact`/`billingContact` fields below
 * (there's no reliable way to tell which of those two, if either, a single generic contact maps
 * to — see docs/MODULES/ScopeOfWork.md "Field-by-field mapping"). */
export interface ScopeOfWorkCustomerSnapshot {
  companyName: string;
  contactName: string;
  address: string;
  taxId: string;
  phone: string;
  email: string;
  projectName: string;
}

/** One printed item row (e.g. "1. FRP Lining for concrete floors") — copied from the source
 * quotation's line items at creation time, then independently editable. `isSectionHeader` mirrors
 * `QuoteLine.isSectionHeader` (a non-priced divider copied from a Quotation Template section). */
export interface ScopeOfWorkSpecLine {
  id: string;
  text: string;
}
export interface ScopeOfWorkItem {
  id: string;
  name: string;
  specifications: ScopeOfWorkSpecLine[];
  quantity: number | null;
  unit: string;
  remark: string;
  isSectionHeader?: boolean;
}

/** Editable payment fields — pulled from the quotation's `paymentTerms` text when available
 * (as free-text `description`), otherwise left blank. The sample PDF's "40% / 60%" split is never
 * saved as a universal default (see docs/MODULES/ScopeOfWork.md "Payment Conditions"). */
export interface ScopeOfWorkPaymentConditions {
  downPaymentPct: number | null;
  finalPaymentPct: number | null;
  method: string;
  description: string;
  notes: string;
}

/** A signature block (ผู้ขาย / ผู้อนุมัติ) — name/date always start blank/editable; blue
 * handwritten sample names are never used as default data. `userId` optionally links a real ERP
 * user so their saved `signatureDataUrl` can render at print time, same convention as
 * `PrintDocument.tsx`'s preparer/approver signatures. */
export interface ScopeOfWorkSignatory {
  name: string;
  userId: string;
  date: string;
}

export interface ScopeOfWork {
  id: string;
  scopeNumber: string;
  yearMonth: string;
  jobSequence: number;
  secondaryCode: string;
  quotationId: string;
  quotationNumber: string;
  jobTypeCode: string;
  jobTypeName: string;
  /** Frozen-at-creation-time copy of `quote.salesperson` — added 2026-07-15 (Codex review High
   * Priority fix: "quotation salesperson is not retained"). Read-only provenance, refreshed only
   * by the explicit "อัปเดตข้อมูลจากใบเสนอราคา" action — never itself editable, and distinct from
   * `seller` below (who actually signs *this* Scope of Work document, which may be a different
   * person and is freely editable). `seller.name` defaults from this value at creation time when
   * non-empty, so the common case ("the assigned salesperson signs it") needs no manual retyping. */
  quotationSalesperson: string;
  issueDate: string;
  deliveryDate: string;
  drawingCode: string;
  customerPoNumber: string;
  customerSnapshot: ScopeOfWorkCustomerSnapshot;
  deliveryLocation: string;
  shippingContact: string;
  shippingPhone: string;
  billingContact: string;
  billingPhone: string;
  checklistGroups: ChecklistGroup[];
  items: ScopeOfWorkItem[];
  paymentConditions: ScopeOfWorkPaymentConditions;
  remarks: string;
  seller: ScopeOfWorkSignatory;
  approver: ScopeOfWorkSignatory;
  status: ScopeOfWorkStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/** Compact shape for a quotation-detail "does a Scope of Work already exist?" lookup — omits
 * full checklist/item content. */
export interface ScopeOfWorkSummary {
  id: string;
  scopeNumber: string;
  quotationId: string;
  status: ScopeOfWorkStatus;
  updatedAt: string;
}

/** Row shape for the standalone Scope of Work management page's list (added 2026-07-22) — a bit
 * richer than `ScopeOfWorkSummary` (which only ever needs to answer "does one exist for this
 * quotation?"), since this powers an actual browsable table with the same kind of at-a-glance
 * fields `QuoteList.tsx` shows for quotations. Still omits full checklist/item content. */
export interface ScopeOfWorkListItem {
  id: string;
  scopeNumber: string;
  secondaryCode: string;
  quotationId: string;
  quotationNumber: string;
  jobTypeCode: string;
  jobTypeName: string;
  customerName: string;
  /** Added 2026-07-22 for the list page's Salesperson filter — see `ScopeOfWork.quotationSalesperson`. */
  quotationSalesperson: string;
  issueDate: string;
  deliveryDate: string;
  status: ScopeOfWorkStatus;
  updatedAt: string;
}

/** Fields a Scope of Work editor actually submits on PATCH — everything except the id/scopeNumber
 * components/quotationId/status/version/audit fields, which are always server-derived or only
 * change via a dedicated action (finalize/duplicate/refresh). `issueDate`/`secondaryCode` ARE
 * editable and, when changed, cause the server to recompute `scopeNumber` (see
 * api/_lib/scopeOfWorkHandler.ts) — `jobTypeCode` never changes after creation; `jobSequence` only
 * changes if editing `issueDate` moves it into a different calendar month (a fresh sequence number
 * is re-allocated for that month, to preserve global scopeNumber uniqueness). */
export type ScopeOfWorkUpdateFields = Partial<{
  issueDate: string;
  deliveryDate: string;
  drawingCode: string;
  customerPoNumber: string;
  secondaryCode: string;
  deliveryLocation: string;
  shippingContact: string;
  shippingPhone: string;
  billingContact: string;
  billingPhone: string;
  checklistGroups: ChecklistGroup[];
  items: ScopeOfWorkItem[];
  paymentConditions: ScopeOfWorkPaymentConditions;
  remarks: string;
  seller: ScopeOfWorkSignatory;
  approver: ScopeOfWorkSignatory;
}>;

export async function fetchScopeOfWorksByQuotation(quotationId: string): Promise<ScopeOfWorkSummary[]> {
  const { scopeOfWorks } = await apiFetch<{ scopeOfWorks: ScopeOfWorkSummary[] }>(`/scope-of-works?quotationId=${encodeURIComponent(quotationId)}`);
  return scopeOfWorks;
}
/** Every non-deleted Scope of Work company-wide, for the standalone management page's list
 * (added 2026-07-22) — omitting `quotationId` from the query switches the server from its
 * by-quotation lookup to this "list everything" mode (`api/_lib/scopeOfWorkHandler.ts`). */
export async function fetchAllScopeOfWorks(): Promise<ScopeOfWorkListItem[]> {
  const { scopeOfWorks } = await apiFetch<{ scopeOfWorks: ScopeOfWorkListItem[] }>("/scope-of-works");
  return scopeOfWorks;
}
export async function fetchScopeOfWork(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${id}`);
  return scopeOfWork;
}
/** `secondaryCode` (รหัสอ้างอิงท้ายงาน) is required by the server — 2026-07-15, Codex review High
 * Priority fix: the generated job code previously always omitted its 4th segment because this was
 * silently blank on every creation. Its actual *value* is still never invented here or server-side
 * — the caller (the "สร้าง Scope of Work" prompt in QuoteDocument.tsx) collects it from the user
 * before calling this. */
export async function createScopeOfWorkFromQuotation(quotationId: string, secondaryCode: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>("/scope-of-works", {
    method: "POST",
    body: JSON.stringify({ quotationId, secondaryCode }),
  });
  return scopeOfWork;
}
export async function updateScopeOfWork(id: string, fields: ScopeOfWorkUpdateFields): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return scopeOfWork;
}
export async function finalizeScopeOfWork(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${id}/finalize`, { method: "POST" });
  return scopeOfWork;
}
export async function duplicateScopeOfWork(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${id}/duplicate`, { method: "POST" });
  return scopeOfWork;
}
/** Creates a new revision (`{root}-R{n}`) of `id`, added 2026-07-22 to mirror Quotation's identical
 * feature — see `handleRewrite()` in api/_lib/scopeOfWorkHandler.ts. The source record is never
 * modified. */
export async function rewriteScopeOfWork(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${id}/rewrite`, { method: "POST" });
  return scopeOfWork;
}
export async function refreshScopeOfWorkFromQuotation(id: string): Promise<ScopeOfWork> {
  const { scopeOfWork } = await apiFetch<{ scopeOfWork: ScopeOfWork }>(`/scope-of-works/${id}/refresh`, { method: "POST" });
  return scopeOfWork;
}
export async function deleteScopeOfWork(id: string): Promise<void> {
  await apiFetch<void>(`/scope-of-works/${id}`, { method: "DELETE" });
}
export async function logScopeOfWorkPrinted(id: string): Promise<void> {
  await apiFetch<void>(`/scope-of-works/${id}/print`, { method: "POST" });
}

export function newScopeSpecLineId(): string {
  return `sl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
export function newScopeItemId(): string {
  return `si-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
export function blankScopeOfWorkItem(): ScopeOfWorkItem {
  return { id: newScopeItemId(), name: "", specifications: [], quantity: null, unit: "", remark: "" };
}
