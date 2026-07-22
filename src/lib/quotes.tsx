import { FilePen, Clock, CheckCircle2, Ban, Send, CheckCheck, Trophy, XCircle, Frown } from "lucide-react";
import type { User } from "./users";
import { type Role, hasPermission } from "./roles";
import { apiFetch } from "./apiClient.js";
import type { TranslationKey } from "./i18n";
import type { CustomerSnapshot } from "./customers";
import type { TemplateSection, TemplateTermLine } from "./quotationTemplates";

export type QuoteStatus =
  | "ร่าง"
  | "รออนุมัติ"
  | "อนุมัติแล้ว"
  | "ส่งให้ลูกค้าแล้ว"
  | "ลูกค้ายอมรับ"
  | "ปิดการขายสำเร็จ"
  | "ลูกค้าปฏิเสธ"
  | "เสียโอกาส"
  | "ยกเลิก";
export type QuoteInterest = "น่าสนใจ" | "ไม่น่าสนใจ" | null;

/** A list-view filter — e.g. built by the Dashboard's pipeline-stage/follow-up click-through and consumed by QuoteList. Lives here (not in a page component) since it's a Quote-domain concept any future caller could construct against, not something specific to the Dashboard page. */
export interface QuotationListFilter {
  status?: QuoteStatus;
  client?: string;
}

export type ApprovalAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "sent_to_customer"
  | "customer_accepted"
  | "customer_rejected"
  | "marked_won"
  | "marked_lost"
  | "cancelled";

export const approvalActionLabel: Record<ApprovalAction, string> = {
  submitted: "ส่งขออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ปฏิเสธ (ส่งกลับแก้ไข)",
  sent_to_customer: "ส่งให้ลูกค้า",
  customer_accepted: "ลูกค้ายอมรับ",
  customer_rejected: "ลูกค้าปฏิเสธ",
  marked_won: "ปิดการขายสำเร็จ",
  marked_lost: "ปิดการขายไม่สำเร็จ",
  cancelled: "ยกเลิกใบเสนอราคา",
};

export interface ApprovalHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  action: ApprovalAction;
  comment: string;
  createdAt: string;
}

export interface SubDetail {
  id: string;
  text: string;
}

export interface QuoteLine {
  id: number;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
  tags: string[];
  subDetails: SubDetail[];
  /** True for a line copied from a Quotation Template's section heading (e.g. "Preparation
   * work") — renders as a full-width, non-priced divider in `LineItemsEditor.tsx`/
   * `PrintDocument.tsx` instead of a normal qty/unit-price item row. Optional and defaults to
   * falsy for every quote created before this field existed (2026-07-14) or built without a
   * template — fully backward compatible, no behavior change for existing lines. A section-header
   * line is a completely ordinary `QuoteLine` otherwise (freely editable/removable), just flagged
   * for display purposes. See docs/MODULES/QuotationTemplates.md. */
  isSectionHeader?: boolean;
}

export interface Quote {
  id: string;
  client: string;
  date: string;
  valid: string;
  amount: number;
  status: QuoteStatus;
  salesperson: string;
  interest: QuoteInterest;
  lines: QuoteLine[];
  discount: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  deliveryAddress: string;
  project: string;
  poRef: string;
  paymentTerms: string;
  issueDate: string;
  expiryDate: string;
  remarks: string;
  /** Empty string = unclassified (incl. every quote created before this field existed). */
  jobTypeCode: string;
  /** Snapshot of the job type's display name at save time, same snapshot rationale as Product Library line items — renaming a job type later doesn't rewrite historical quotes. */
  jobTypeName: string;
  /** Sales-marked "likely to close" flag, feeds the Dashboard's Expected Sales KPI/forecast. */
  isPotentialOpportunity: boolean;
  /** Empty string = no follow-up scheduled. */
  followUpDate: string;
  /** User id of the creator, used for ownership-scoped edit permission. Empty string for legacy/seed quotes. */
  createdByUserId: string;
  /** User id of whoever last edited the quote (plain edit or workflow action). Empty string until first edit. */
  updatedBy: string;
  approvalHistory: ApprovalHistoryEntry[];
  /**
   * → `Customer.id` — which saved Customer this quote is issued to, set when the user picks one
   * from the Quotation form's Customer selector (`src/pages/quotation/CustomerSelector.tsx`,
   * added 2026-07-14, replacing an earlier — wrong — "issuer company" selector built the same
   * week). Optional: a quote can still be created with the Customer Information fields typed in
   * manually, with no linked customer record at all. Changing the selected customer on an
   * existing quote is restricted server-side to Draft status, same rule as every other structural
   * field on this quote — see `api/handlers/quotes.ts`.
   */
  customerId?: string;
  /**
   * Frozen-at-save-time copy of the Customer Information fields actually submitted with this
   * quote (whether autofilled from `customerId` and then possibly edited, or typed manually) —
   * always server-derived, never trusted from the client. Exists so that later edits to the
   * Customer master record (or to this quote's own fields, on a further edit) don't retroactively
   * change what an already-issued quotation is understood to have said at the time. See
   * `src/lib/customers.ts`'s `CustomerSnapshot` and docs/MODULES/Customer.md.
   */
  customerSnapshot?: CustomerSnapshot;
  /**
   * Which Quotation Template (if any) this quote's `lines` were originally copied from — recorded
   * once at creation time, added 2026-07-14 (see docs/MODULES/QuotationTemplates.md). Purely
   * provenance metadata: `lines` itself is already an independent, quote-owned copy (same as every
   * other quote), so editing this quotation was never able to affect the master template and vice
   * versa, with or without these fields. Optional and always empty on quotes created without a
   * template (including every quote from before this pass) or built from "เริ่มจากใบเสนอราคาเปล่า" /
   * "เริ่มจากแบบฟอร์มเปล่า" (blank start) — a template is never required. Never changed after
   * creation (not part of `QuoteUpdateFields`) — the whole point is a frozen record of what was
   * used when the quote was first built, matching `customerSnapshot`'s "frozen at save time" rule.
   */
  quotationTemplateId?: string;
  quotationTemplateName?: string;
  quotationTemplateVersion?: string;
  /**
   * A server-created, structured copy of the master template's `sections`/`defaultTerms`/
   * `internalNotes`/`sourceHash` **at the moment this quote was created** — added 2026-07-15
   * (second Codex-review fix pass), closing the review's High Priority #2 finding that only
   * flattened `QuoteLine[]` + 3 provenance strings were stored, not a real structured snapshot.
   * Frozen forever at creation, same as `customerSnapshot`/`quotationTemplateName` — editing the
   * master template afterward never touches this, and this is never itself editable. **Audit/
   * reconstruction record only** — no rendering path reads it: the customer-facing quotation form,
   * editor, and printed PDF all continue to read only `lines` (the already-independent, per-line
   * copy every quote has always had), exactly as before this field existed. Deliberately **does**
   * include `internalNotes` (unlike `lines`, which `applyTemplateToQuoteDraft()` still never copies
   * into customer-facing content) — this is an internal-only audit trail, gated by the same
   * `quotations:view`-family permissions as the rest of the quote document, never surfaced in the
   * UI or PDF. See docs/MODULES/QuotationTemplates.md "Structured Template Snapshot."
   */
  templateSnapshot?: {
    sections: TemplateSection[];
    defaultTerms: TemplateTermLine[];
    internalNotes: string[];
    sourceHash: string;
    capturedAt: string;
  };
}

export type QuoteDraftFields = Pick<
  Quote,
  | "client" | "status" | "lines" | "discount" | "salesperson"
  | "contactName" | "contactPhone" | "contactEmail" | "address" | "taxId"
  | "deliveryMethod" | "deliveryAddress" | "project"
  | "poRef" | "paymentTerms" | "issueDate" | "expiryDate" | "remarks"
  | "jobTypeCode" | "jobTypeName" | "isPotentialOpportunity" | "followUpDate"
  // Client only ever sends the id — the server always re-derives `customerSnapshot` itself from
  // the submitted Customer Information fields, the same "never trust a client-supplied derived
  // value" rule `amount`/`jobTypeName` already follow. See api/handlers/quotes.ts.
  | "customerId"
  // Same pattern as `customerId`/`jobTypeCode` above — the client only ever sends the id (on
  // create only; a template can never be attached to an existing quote after the fact), and the
  // server re-derives `quotationTemplateName`/`quotationTemplateVersion` from the matched
  // `quotation_templates` record. See api/handlers/quotes.ts.
  | "quotationTemplateId"
> & { amount: number };

/** Fields the server accepts on general quote edits — everything except id/status/date/valid/createdByUserId/updatedBy/approvalHistory, which only the server (or the workflow endpoint) sets. */
export type QuoteUpdateFields = Partial<
  Omit<Quote, "id" | "status" | "date" | "valid" | "createdByUserId" | "updatedBy" | "approvalHistory">
>;

export const VAT_RATE = 7;

export const statusStyle: Record<QuoteStatus, string> = {
  "ร่าง": "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20",
  "รออนุมัติ": "bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20",
  "อนุมัติแล้ว": "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20",
  "ส่งให้ลูกค้าแล้ว": "bg-[#3b6fc9]/10 text-[#3b6fc9] border border-[#3b6fc9]/20",
  "ลูกค้ายอมรับ": "bg-[#1f9d8a]/10 text-[#1f9d8a] border border-[#1f9d8a]/20",
  "ปิดการขายสำเร็จ": "bg-[#157347]/10 text-[#157347] border border-[#157347]/20",
  "ลูกค้าปฏิเสธ": "bg-[#e08a3c]/10 text-[#e08a3c] border border-[#e08a3c]/20",
  "เสียโอกาส": "bg-[#e05252]/10 text-[#e05252] border border-[#e05252]/20",
  "ยกเลิก": "bg-[#8a94a6]/10 text-[#8a94a6] border border-[#8a94a6]/20",
};

/** Translated display label per status — `QuoteStatus` itself stays the fixed Thai literal stored in MongoDB and used for all comparisons/state-machine logic; this map is display-only. */
export const statusLabelKey: Record<QuoteStatus, TranslationKey> = {
  "ร่าง": "quotation.status.draft",
  "รออนุมัติ": "quotation.status.pendingApproval",
  "อนุมัติแล้ว": "quotation.status.approved",
  "ส่งให้ลูกค้าแล้ว": "quotation.status.sentToCustomer",
  "ลูกค้ายอมรับ": "quotation.status.customerAccepted",
  "ปิดการขายสำเร็จ": "quotation.status.won",
  "ลูกค้าปฏิเสธ": "quotation.status.customerRejected",
  "เสียโอกาส": "quotation.status.lost",
  "ยกเลิก": "quotation.status.cancelled",
};

/** Translated display label per approval action — `approvalActionLabel` (Thai) stays as-is for audit-log data; this is for on-screen UI only. */
export const approvalActionLabelKey: Record<ApprovalAction, TranslationKey> = {
  submitted: "quotation.action.submitted",
  approved: "quotation.action.approved",
  rejected: "quotation.action.rejected",
  sent_to_customer: "quotation.action.sentToCustomer",
  customer_accepted: "quotation.action.customerAccepted",
  customer_rejected: "quotation.action.customerRejected",
  marked_won: "quotation.action.markedWon",
  marked_lost: "quotation.action.markedLost",
  cancelled: "quotation.action.cancelled",
};

/** Translated display label for the two non-null QuoteInterest values — the stored value itself stays Thai. */
export const interestLabelKey: Record<"น่าสนใจ" | "ไม่น่าสนใจ", TranslationKey> = {
  "น่าสนใจ": "quotation.interest.interested",
  "ไม่น่าสนใจ": "quotation.interest.notInterested",
};

export const statusIcon: Record<QuoteStatus, React.ReactNode> = {
  "ร่าง": <FilePen size={10} />,
  "รออนุมัติ": <Clock size={10} />,
  "อนุมัติแล้ว": <CheckCircle2 size={10} />,
  "ส่งให้ลูกค้าแล้ว": <Send size={10} />,
  "ลูกค้ายอมรับ": <CheckCheck size={10} />,
  "ปิดการขายสำเร็จ": <Trophy size={10} />,
  "ลูกค้าปฏิเสธ": <XCircle size={10} />,
  "เสียโอกาส": <Frown size={10} />,
  "ยกเลิก": <Ban size={10} />,
};

/** The quotation approval-workflow state machine: which statuses each ApprovalAction may move a quote from/to. */
export const workflowTransitions: Record<ApprovalAction, { from: QuoteStatus[]; to: QuoteStatus }> = {
  submitted: { from: ["ร่าง"], to: "รออนุมัติ" },
  approved: { from: ["รออนุมัติ"], to: "อนุมัติแล้ว" },
  rejected: { from: ["รออนุมัติ"], to: "ร่าง" },
  sent_to_customer: { from: ["อนุมัติแล้ว"], to: "ส่งให้ลูกค้าแล้ว" },
  customer_accepted: { from: ["ส่งให้ลูกค้าแล้ว"], to: "ลูกค้ายอมรับ" },
  customer_rejected: { from: ["ส่งให้ลูกค้าแล้ว"], to: "ลูกค้าปฏิเสธ" },
  marked_won: { from: ["ลูกค้ายอมรับ"], to: "ปิดการขายสำเร็จ" },
  marked_lost: { from: ["ลูกค้าปฏิเสธ"], to: "เสียโอกาส" },
  cancelled: { from: ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว"], to: "ยกเลิก" },
};

export interface QuotePermissions {
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canSendToCustomer: boolean;
  canMarkCustomerAccepted: boolean;
  canMarkCustomerRejected: boolean;
  canMarkWon: boolean;
  canMarkLost: boolean;
  canCancel: boolean;
  canExport: boolean;
  canDuplicate: boolean;
  canRewrite: boolean;
}

export function computeQuotePermissions(quote: Quote | undefined, isNew: boolean, currentUser: User, roles: Role[]): QuotePermissions {
  const isOwner = !quote || !quote.createdByUserId || quote.createdByUserId === currentUser.id;
  const hasCreate = hasPermission(currentUser, roles, "quotations:create");
  const hasEdit = hasPermission(currentUser, roles, "quotations:edit");
  const hasApprove = hasPermission(currentUser, roles, "quotations:approve");
  const hasReject = hasPermission(currentUser, roles, "quotations:reject");
  const hasDelete = hasPermission(currentUser, roles, "quotations:delete");
  const editableByOwnerOrApprover = hasEdit && (isOwner || hasApprove);
  const status = quote?.status;

  return {
    canEdit: isNew ? hasCreate : editableByOwnerOrApprover,
    canSubmit: !isNew && status === "ร่าง" && (hasCreate || hasEdit) && isOwner,
    canApprove: !isNew && status === "รออนุมัติ" && hasApprove,
    canReject: !isNew && status === "รออนุมัติ" && hasReject,
    canSendToCustomer: !isNew && status === "อนุมัติแล้ว" && editableByOwnerOrApprover,
    canMarkCustomerAccepted: !isNew && status === "ส่งให้ลูกค้าแล้ว" && editableByOwnerOrApprover,
    canMarkCustomerRejected: !isNew && status === "ส่งให้ลูกค้าแล้ว" && editableByOwnerOrApprover,
    canMarkWon: !isNew && status === "ลูกค้ายอมรับ" && editableByOwnerOrApprover,
    canMarkLost: !isNew && status === "ลูกค้าปฏิเสธ" && editableByOwnerOrApprover,
    canCancel: !isNew && !!status && ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว"].includes(status) && hasDelete,
    canExport: hasPermission(currentUser, roles, "quotations:export"),
    canDuplicate: hasCreate,
    // Same permission as Duplicate — a rewrite is also "create a brand-new quote document",
    // just with a revision-numbered id instead of an unrelated fresh one. Only shown in detail
    // view (isNew is irrelevant, matching canDuplicate's own semantics).
    canRewrite: !isNew && hasCreate,
  };
}

const PAYMENT_TERMS = ["ชำระภายใน 30 วัน", "ชำระภายใน 60 วัน", "ชำระทันที", "แบ่งชำระ 3 งวด"];
export const paymentTermsOptions = PAYMENT_TERMS;

export function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function convertDigitGroup(n: number, hasPrecedingDigits: boolean): string {
  if (n === 0) return "";
  const digits = String(n).split("").map(Number);
  const len = digits.length;
  let out = "";
  digits.forEach((d, i) => {
    const pos = len - i - 1;
    if (d === 0) return;
    if (pos === 0 && d === 1 && (len > 1 || hasPrecedingDigits)) out += "เอ็ด";
    else if (pos === 1 && d === 2) out += "ยี่สิบ";
    else if (pos === 1 && d === 1) out += "สิบ";
    else out += THAI_DIGITS[d] + THAI_POSITIONS[pos];
  });
  return out;
}

/** Converts a THB amount to its Thai-language words form, e.g. 802500 -> "(แปดแสนสองพันห้าร้อยบาทถ้วน)". */
export function bahtText(amount: number): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const intPart = Math.floor(rounded);
  const satang = Math.round((rounded - intPart) * 100);

  let intText = "ศูนย์";
  if (intPart > 0) {
    const groups: number[] = [];
    let remaining = intPart;
    while (remaining > 0) {
      groups.unshift(remaining % 1000000);
      remaining = Math.floor(remaining / 1000000);
    }
    let hasPrior = false;
    intText = groups
      .map((g, i) => {
        if (g === 0) return "";
        const text = convertDigitGroup(g, hasPrior) + "ล้าน".repeat(groups.length - 1 - i);
        hasPrior = true;
        return text;
      })
      .join("");
  }

  const satangText = satang === 0 ? "ถ้วน" : `${convertDigitGroup(satang, false)}สตางค์`;
  return `(${intText}บาท${satangText})`;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function todayIso(): string {
  return toIsoDate(new Date());
}
export function plusDaysIso(days: number): string {
  return toIsoDate(new Date(Date.now() + days * 86400000));
}

let lineIdCounter = 1000;
export function newLineId(): number {
  lineIdCounter += 1;
  return Date.now() + lineIdCounter;
}

export function newSubDetailId(): string {
  return `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankLine(): QuoteLine {
  return { id: newLineId(), description: "", unit: "ชิ้น", qty: 1, unitPrice: 0, discount: 0, tags: [], subDetails: [] };
}

export function lineSubtotal(l: QuoteLine): number {
  return l.qty * l.unitPrice * (1 - l.discount / 100);
}

/** Whether a line has any sub-details/tags worth showing in the print output. */
export function lineHasDetails(l: QuoteLine): boolean {
  return l.subDetails.some((sd) => sd.text.trim() !== "") || l.tags.length > 0;
}

export function formatQuoteDateThai(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function formatQuoteDateNumeric(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return "";
  }
}

export function computeTotals(lines: QuoteLine[], discountPct: number) {
  const subtotal = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const discountAmt = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = afterDiscount * (VAT_RATE / 100);
  const total = afterDiscount + vatAmt;
  return { subtotal, discountAmt, afterDiscount, vatAmt, total };
}

/** True for a quote id ending in a "Rewrite/แก้ไข" revision suffix (e.g. `QT-2567-0041-R2`) — see
 * `handleRewrite()` in api/handlers/quotes.ts. Purely a display-side check (e.g. QuoteList's
 * summary cards); the authoritative server-side parsing lives in api/_lib/quoteRevisions.ts, kept
 * separate since that file is server-only. */
export function isRevisionQuote(id: string): boolean {
  return /-R\d+$/.test(id);
}

export function nextQuoteId(quotes: Quote[]): string {
  const year = 2567;
  const maxNum = quotes
    .map((q) => parseInt(q.id.split("-").pop() ?? "0", 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `QT-${year}-${String(maxNum + 1).padStart(4, "0")}`;
}

export async function fetchQuotes(): Promise<Quote[]> {
  const { quotes } = await apiFetch<{ quotes: Quote[] }>("/quotes");
  return quotes;
}
export async function createQuote(fields: QuoteDraftFields): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>("/quotes", { method: "POST", body: JSON.stringify(fields) });
  return quote;
}
export async function updateQuote(id: string, fields: QuoteUpdateFields): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>(`/quotes/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return quote;
}
export async function duplicateQuote(id: string): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>(`/quotes/${id}/duplicate`, { method: "POST" });
  return quote;
}
/** Creates a new revision of `id` — `{root}-R{n}` (server-derives the root by stripping any
 * existing `-R<n>` suffix and atomically reserves the next revision number), preserving the
 * source's data with a fresh `_id`/Draft status/empty approval history. The source quote is never
 * modified. See api/handlers/quotes.ts's `handleRewrite()`. */
export async function rewriteQuote(id: string): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>(`/quotes/${id}/rewrite`, { method: "POST" });
  return quote;
}
/** Server-side print/PDF completeness gate (added 2026-07-16) — call this before `window.print()`.
 * Throws `ApiError` (422, DOCUMENT_INCOMPLETE) if the quote is missing required fields/selections,
 * so a direct browser print can never bypass validation. See api/handlers/quotes.ts. */
export async function printQuote(id: string): Promise<void> {
  await apiFetch<void>(`/quotes/${id}/print`, { method: "POST" });
}
export async function performWorkflowAction(
  id: string,
  action: ApprovalAction,
  comment: string,
  draft: QuoteUpdateFields,
): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>(`/quotes/${id}/workflow`, {
    method: "POST",
    body: JSON.stringify({ action, comment, draft }),
  });
  return quote;
}
