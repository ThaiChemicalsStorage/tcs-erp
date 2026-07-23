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

/** Cash or Credit — a structured dropdown selection rather than free text, so the print/PDF output
 * and the sum-to-100% validation both read a consistent value instead of parsing arbitrary user
 * text. `""` means "not yet chosen." */
export type ScopeOfWorkPaymentType = "" | "Cash" | "Credit";

/** One payment schedule row (e.g. "40% Down Payment (Cash)") — arbitrarily many rows are allowed
 * (not capped at 2), added 2026-07-23 per direct user request for 3+-installment plans (e.g. 20%
 * Down Payment (Cash 30 days) / 40% Materials (Credit 30 days) / 40% After Delivered Date (Credit
 * 30 days)). `label` is the free-text installment name ("Down Payment", "Materials", "After Job
 * Complete", ...). `paymentType`/`days` (added 2026-07-23, same day, per a direct follow-up
 * request replacing the initial free-text `method` field) are a structured Cash/Credit dropdown
 * plus an optional day count — `days` applies to either type (the user's own example used "Cash 30
 * days", not just Credit), kept per-row rather than one shared method for the whole schedule since
 * a real multi-installment plan can legitimately mix Cash and Credit terms across rows. */
export interface ScopeOfWorkPaymentInstallment {
  id: string;
  pct: number | null;
  label: string;
  paymentType: ScopeOfWorkPaymentType;
  days: number | null;
}

/** `"Cash"` / `"Credit 30 Days"` / `""` — the display string derived from a row's structured
 * `paymentType`/`days`, used for the printed document and the "(...)" hint after each installment's
 * label. Kept as a pure function (not a stored field) so `paymentType`/`days` stay the single
 * source of truth — nothing can drift out of sync with a separately-stored string. */
export function formatPaymentMethod(installment: Pick<ScopeOfWorkPaymentInstallment, "paymentType" | "days">): string {
  if (!installment.paymentType) return "";
  return installment.days !== null ? `${installment.paymentType} ${installment.days} Days` : installment.paymentType;
}

/** Editable payment fields — pulled from the quotation's `paymentTerms` text when available
 * (as free-text `description`), otherwise left blank. The sample PDF's "40% / 60%" split is never
 * saved as a universal default (see docs/MODULES/ScopeOfWork.md "Payment Conditions"). `installments`
 * replaced the previous fixed `{downPaymentPct, finalPaymentPct, method}` pair on 2026-07-23 — see
 * `normalizePaymentConditions()` below for how an existing pre-2026-07-23 record's legacy shape is
 * read. Three quick-select presets (`PAYMENT_TERM_PRESETS`) populate common 2-installment schedules;
 * the array itself is always freely editable — add/remove/edit rows without limit. */
export interface ScopeOfWorkPaymentConditions {
  installments: ScopeOfWorkPaymentInstallment[];
  description: string;
  notes: string;
}

export function newPaymentInstallmentId(): string {
  return `pi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
export function blankPaymentInstallment(): ScopeOfWorkPaymentInstallment {
  return { id: newPaymentInstallmentId(), pct: null, label: "", paymentType: "", days: null };
}

/** 3 quick-select presets a salesperson can apply with one click, then still freely edit (add more
 * rows, retitle a row, change a percentage/type/days) — never a silently-assumed default written
 * without the user choosing it. Per direct user request, 2026-07-23. */
export const PAYMENT_TERM_PRESETS: { label: string; installments: Omit<ScopeOfWorkPaymentInstallment, "id">[] }[] = [
  {
    label: "40% Down Payment (Cash) / 60% After Job Complete (Cash)",
    installments: [
      { pct: 40, label: "Down Payment", paymentType: "Cash", days: null },
      { pct: 60, label: "After Job Complete", paymentType: "Cash", days: null },
    ],
  },
  {
    label: "30% Down Payment (Cash) / 70% After Job Complete (Credit 30 Days)",
    installments: [
      { pct: 30, label: "Down Payment", paymentType: "Cash", days: null },
      { pct: 70, label: "After Job Complete", paymentType: "Credit", days: 30 },
    ],
  },
  {
    label: "100% After Job Complete (Credit 30 Days)",
    installments: [
      { pct: 100, label: "After Job Complete", paymentType: "Credit", days: 30 },
    ],
  },
];

const VALID_PAYMENT_TYPES: readonly ScopeOfWorkPaymentType[] = ["", "Cash", "Credit"];

/** Best-effort parse of a free-text payment method string (e.g. "Cash", "Credit 30 Days", "Cash 30
 * days") into the structured `{paymentType, days}` shape — used only when reading a legacy record
 * whose installment rows predate the 2026-07-23 structured-dropdown change (see
 * `normalizePaymentConditions()` below). Not exhaustive by design: arbitrary free text that names
 * neither "Cash" nor "Credit" falls back to `paymentType: ""` (the day count, if any, is still
 * kept) rather than guessing — the user re-selects it once, same one-time cost as any other
 * legacy-shape migration in this codebase. */
function parsePaymentMethodText(text: string): { paymentType: ScopeOfWorkPaymentType; days: number | null } {
  const dayMatch = /(\d+)\s*Days?/i.exec(text);
  const days = dayMatch ? parseInt(dayMatch[1], 10) : null;
  const paymentType: ScopeOfWorkPaymentType = /credit/i.test(text) ? "Credit" : /cash/i.test(text) ? "Cash" : "";
  return { paymentType, days };
}

/**
 * Reads a stored `paymentConditions` value and normalizes it to the current `installments`-array
 * shape with structured `paymentType`/`days` rows — a Scope of Work saved before 2026-07-23 still
 * has an older shape in MongoDB (either the very first fixed `{downPaymentPct, finalPaymentPct,
 * method}` pair, or the same-day intermediate `installments` array whose rows carried a free-text
 * `method` string instead of `paymentType`/`days` — no migration script was run for either; MongoDB
 * enforces no schema, so old documents are simply read-compatible via this function until they're
 * next saved, at which point the server persists the current shape for good — see
 * `sanitizePaymentConditions()` in api/_lib/scopeOfWorkHandler.ts). Applied server-side to every
 * response (`normalizeScope()`), so the frontend only ever sees the current shape. Exported (not
 * handler-local) since it's also used directly by the handler's finalize/print validation input
 * mapping. */
export function normalizePaymentConditions(raw: unknown): ScopeOfWorkPaymentConditions {
  const r = (raw ?? {}) as Record<string, unknown>;
  const description = typeof r.description === "string" ? r.description : "";
  const notes = typeof r.notes === "string" ? r.notes : "";
  if (Array.isArray(r.installments)) {
    return {
      installments: (r.installments as Record<string, unknown>[]).map((it) => {
        const id = typeof it.id === "string" && it.id ? it.id : newPaymentInstallmentId();
        const pct = typeof it.pct === "number" ? it.pct : null;
        const label = typeof it.label === "string" ? it.label : "";
        if (typeof it.paymentType === "string" && (VALID_PAYMENT_TYPES as readonly string[]).includes(it.paymentType)) {
          return { id, pct, label, paymentType: it.paymentType as ScopeOfWorkPaymentType, days: typeof it.days === "number" ? it.days : null };
        }
        // Intermediate same-day shape: a free-text `method` string instead of paymentType/days.
        const parsed = typeof it.method === "string" ? parsePaymentMethodText(it.method) : { paymentType: "" as ScopeOfWorkPaymentType, days: null };
        return { id, pct, label, ...parsed };
      }),
      description,
      notes,
    };
  }
  const legacy = typeof r.method === "string" ? parsePaymentMethodText(r.method) : { paymentType: "" as ScopeOfWorkPaymentType, days: null };
  const installments: ScopeOfWorkPaymentInstallment[] = [];
  if (typeof r.downPaymentPct === "number") installments.push({ id: newPaymentInstallmentId(), pct: r.downPaymentPct, label: "Down Payment", ...legacy });
  if (typeof r.finalPaymentPct === "number") installments.push({ id: newPaymentInstallmentId(), pct: r.finalPaymentPct, label: "After Job Complete", ...legacy });
  return { installments, description, notes };
}

/** A record saved before 2026-07-23 has no `documentRecipients` field in MongoDB at all
 * (`undefined`) — defaults to `{}` rather than letting the frontend crash calling `.entries()`/
 * indexing into it. See `ScopeOfWork.documentRecipients`'s own doc comment. */
export function normalizeDocumentRecipients(raw: unknown): Record<string, string[]> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) out[key] = value.filter((v): v is string => typeof v === "string");
  }
  return out;
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
  /** Real people to email when a `documentsToSend` (เอกสารส่งถึง) checklist option is checked —
   * added 2026-07-23, per direct user request to actually route this checklist to real staff
   * instead of it being a plain printed-form checkbox list. Keyed by the checked option's `key`
   * (e.g. `"purchase"`, `"accounting"` — see `DOCUMENT_RECIPIENT_DEPARTMENTS` in
   * documentRequirements.ts), each value an array of `User.id`s picked from whoever has that exact
   * `department` value. Never includes the `"other"` key (free text, no real department to resolve
   * against). Independent of `checked` state — unchecking an option doesn't clear its recipients,
   * so re-checking it later remembers the previous picks; only the email-send action reads this. */
  documentRecipients: Record<string, string[]>;
  /** Free-text summary of what changed in this revision vs. the one it was rewritten from — added
   * 2026-07-23, per direct user request, same field/semantics as `Quote.revisionNote`
   * (src/lib/quotes.tsx). Always starts blank on a brand-new record, a Duplicate, or a fresh
   * Rewrite — never inherited from the source. `generateScopeOfWorkRevisionSummary()`
   * (src/lib/revisionDiff.ts) can auto-fill an editable starting draft; freely editable afterward. */
  revisionNote: string;
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
  documentRecipients: Record<string, string[]>;
  revisionNote: string;
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

/** Emails every user picked in `documentRecipients` (see the field's own doc comment) — one email
 * per distinct recipient, deduped across departments so a person picked under two checked options
 * only gets one message. Added 2026-07-23. `sentCount`/`failedCount` let the UI report a partial
 * failure (e.g. one recipient's address rejected) without treating the whole action as failed. */
export async function sendScopeOfWorkDocumentNotifications(id: string): Promise<{ sentCount: number; failedCount: number; recipientCount: number }> {
  return apiFetch<{ sentCount: number; failedCount: number; recipientCount: number }>(`/scope-of-works/${id}/send-documents`, { method: "POST" });
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
