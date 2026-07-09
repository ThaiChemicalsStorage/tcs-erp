import { FilePen, Clock, CheckCircle2, Ban, Send, CheckCheck, Trophy, XCircle, Frown } from "lucide-react";
import type { User } from "./users";
import { type Role, hasPermission } from "./roles";
import { apiFetch } from "./apiClient.js";
import type { TranslationKey } from "./i18n";

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
  notes: string;
  specifications: string;
  tags: string[];
  subDetails: SubDetail[];
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
  /** User id of the creator, used for ownership-scoped edit permission. Empty string for legacy/seed quotes. */
  createdByUserId: string;
  /** User id of whoever last edited the quote (plain edit or workflow action). Empty string until first edit. */
  updatedBy: string;
  approvalHistory: ApprovalHistoryEntry[];
}

export type QuoteDraftFields = Pick<
  Quote,
  | "client" | "status" | "lines" | "discount" | "salesperson"
  | "contactName" | "contactPhone" | "contactEmail" | "address" | "taxId"
  | "deliveryMethod" | "deliveryAddress" | "project"
  | "poRef" | "paymentTerms" | "issueDate" | "expiryDate" | "remarks"
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
  return { id: newLineId(), description: "", unit: "ชิ้น", qty: 1, unitPrice: 0, discount: 0, notes: "", specifications: "", tags: [], subDetails: [] };
}

export function lineSubtotal(l: QuoteLine): number {
  return l.qty * l.unitPrice * (1 - l.discount / 100);
}

/** Whether a line has any notes/sub-details/specifications/tags worth showing in an expand panel or print. */
export function lineHasDetails(l: QuoteLine): boolean {
  return l.notes.trim() !== "" || l.subDetails.some((sd) => sd.text.trim() !== "") || l.specifications.trim() !== "" || l.tags.length > 0;
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
