import type { User } from "./users";
import { type Role, hasPermission } from "./roles";
import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";
import type { TranslationKey } from "./i18n";
import type { CustomerSnapshot } from "./customers";
import type { TemplateSection, TemplateTermLine } from "./quotationTemplates";
import type { QuoteContact } from "./quoteContacts";
import {
  type DiscountMode, VAT_RATE as SHARED_VAT_RATE, lineSubtotal as sharedLineSubtotal,
  computeTotals as sharedComputeTotals,
} from "./quoteMath";

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
  /** ตัวเลขส่วนลดของรายการนี้ — ตีความเป็น % หรือบาท ตาม `discountMode` */
  discount: number;
  /**
   * หน่วยของส่วนลดรายการนี้ (เพิ่ม 2026-08-25) — ไม่ระบุ = "percent" เหมือนข้อมูลเดิมทั้งหมด
   * Unit of this line's discount (added 2026-08-25). Absent means "percent", which is what every
   * line written before 2026-08-25 meant, so old quotations need no migration.
   */
  discountMode?: DiscountMode;
  tags: string[];
  subDetails: SubDetail[];
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
  /** ส่วนลดพิเศษท้ายเอกสาร — ตีความเป็น % หรือบาท ตาม `discountMode` */
  discount: number;
  /** หน่วยของส่วนลดพิเศษ (เพิ่ม 2026-08-25) — ไม่ระบุ = "percent" (ข้อมูลเดิมทั้งหมด) */
  discountMode?: DiscountMode;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  /**
   * ผู้ติดต่อทุกคนของใบนี้ (เพิ่ม 2026-09-07) — ไม่ระบุ = ใบเก่าที่มีแค่สามช่องด้านบน อ่านผ่าน
   * `quoteContactsOf()` ได้ผู้ติดต่อคนเดียวจากสามช่องนั้น ไม่ได้ทำ migration · สามช่องด้านบน**ยังอยู่
   * และเท่ากับ `contacts[0]` เสมอ** เซิร์ฟเวอร์เป็นคนเขียนให้ (ดู src/lib/quoteContacts.ts)
   * Every contact person on this quotation (added 2026-09-07). Absent on older documents, which
   * carry only the three legacy fields above; the server keeps those three mirroring `contacts[0]`.
   */
  contacts?: QuoteContact[];
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
  jobTypeCode: string;
  jobTypeName: string;
  isPotentialOpportunity: boolean;
  followUpDate: string;
  revisionNote: string;
  createdByUserId: string;
  updatedBy: string;
  approvalHistory: ApprovalHistoryEntry[];
  customerId?: string;
  customerSnapshot?: CustomerSnapshot;
  quotationTemplateId?: string;
  quotationTemplateName?: string;
  quotationTemplateVersion?: string;
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
  | "client" | "status" | "lines" | "discount" | "discountMode" | "salesperson"
  | "contactName" | "contactPhone" | "contactEmail" | "contacts" | "address" | "taxId"
  | "deliveryMethod" | "deliveryAddress" | "project"
  | "poRef" | "paymentTerms" | "issueDate" | "expiryDate" | "remarks" | "revisionNote"
  | "jobTypeCode" | "jobTypeName" | "isPotentialOpportunity" | "followUpDate"
  | "customerId"
  | "quotationTemplateId"
> & { amount: number };

export type QuoteUpdateFields = Partial<
  Omit<Quote, "id" | "status" | "date" | "valid" | "createdByUserId" | "updatedBy" | "approvalHistory">
>;

export type { DiscountMode } from "./quoteMath";
export { lineDiscountAmount, resolveDiscountAmount } from "./quoteMath";
// ผู้ติดต่อหลายคน — ตัวช่วยล้วนอยู่ใน quoteContacts.ts (ไม่มี import) ให้เซิร์ฟเวอร์ใช้ไฟล์เดียวกันได้
export type { QuoteContact } from "./quoteContacts";
export {
  MAX_QUOTE_CONTACTS, newContactId, blankContact, isBlankContact, normalizeContacts,
  quoteContactsOf, primaryContactFields, contactLine,
} from "./quoteContacts";

export const VAT_RATE = SHARED_VAT_RATE;

export const statusStyle: Record<QuoteStatus, string> = {
  "ร่าง": "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  "รออนุมัติ": "bg-[#c9a84c]/10 text-[#866d28] border border-[#c9a84c]/20",
  "อนุมัติแล้ว": "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
  "ส่งให้ลูกค้าแล้ว": "bg-[#3b6fc9]/10 text-[#366bc6] border border-[#3b6fc9]/20",
  "ลูกค้ายอมรับ": "bg-[#1f9d8a]/10 text-[#187c6d] border border-[#1f9d8a]/20",
  "ปิดการขายสำเร็จ": "bg-[#157347]/10 text-[#157347] border border-[#157347]/20",
  "ลูกค้าปฏิเสธ": "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  "เสียโอกาส": "bg-[#e05252]/10 text-[#d22626] border border-[#e05252]/20",
  "ยกเลิก": "bg-[#8a94a6]/10 text-[#657085] border border-[#8a94a6]/20",
};

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

export const interestLabelKey: Record<"น่าสนใจ" | "ไม่น่าสนใจ", TranslationKey> = {
  "น่าสนใจ": "quotation.interest.interested",
  "ไม่น่าสนใจ": "quotation.interest.notInterested",
};

// ไอคอนประจำสถานะย้ายไปอยู่ที่ src/pages/quotation/statusIcons.tsx แล้ว (2026-08-25)
// `statusIcon` moved to src/pages/quotation/statusIcons.tsx on 2026-08-25 — it was the only JSX in
// this file, and `api/` imports this module at runtime, so the server had to be able to transpile
// JSX at boot. That is what crash-looped production on 2026-08-21. Import it from there.
// **Never add JSX (or a React/lucide-react import) back into this file.**

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

// คำนวณสิทธิ์การกระทำต่างๆ ของผู้ใช้บนใบเสนอราคานี้ (แก้ไข/อนุมัติ/ยกเลิก ฯลฯ) ตามบทบาทและสถานะเอกสาร
// Computes what actions the current user may perform on this quote (edit/approve/cancel etc.) based on role and status
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
    canRewrite: !isNew && hasCreate,
  };
}

// เงื่อนไขการชำระเงินที่ใช้บ่อย — เป็น**รายการแนะนำเท่านั้น ไม่ใช่ค่าที่บังคับ** (2026-08-31)
//
// เดิมช่องนี้เป็น `<select>` เลือกได้แค่ 4 ค่านี้ ทั้งที่ฝั่งเซิร์ฟเวอร์รับข้อความอิสระมาตลอด
// (`sanitizeShortText`, 300 ตัวอักษร ไม่มี allow-list) เจ้าของสั่งให้พิมพ์เองได้ ตอนนี้จึงเป็น
// `Combobox` ที่พิมพ์อะไรก็ได้ และรายการนี้เป็นแค่ทางลัด · ห้ามเอาไปใช้ตรวจความถูกต้องของค่า
const PAYMENT_TERMS = ["ชำระภายใน 30 วัน", "ชำระภายใน 60 วัน", "ชำระทันที", "แบ่งชำระ 3 งวด"];
export const paymentTermsOptions = PAYMENT_TERMS;

// จัดรูปแบบตัวเลขเป็นสตริงแบบไทย มีทศนิยม 2 ตำแหน่งเสมอ
// Formats a number as a Thai-locale string with exactly 2 decimal places
export function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// คำอ่านจำนวนเงินภาษาไทยย้ายไปอยู่ที่ ./bahtText.ts แล้ว (2026-08-25) — re-export ไว้เพื่อให้ที่เรียกใช้เดิมไม่ต้องแก้
// The baht-in-words conversion moved to ./bahtText.ts on 2026-08-25 so that `api/_lib/arHandler.ts`
// can import it without pulling in this whole module (and, before the same pass, a `.tsx` file).
// Re-exported here so existing frontend call sites keep working unchanged.
export { bahtText } from "./bahtText";

// แปลงวันที่เป็นสตริง ISO แบบวันที่เท่านั้น (YYYY-MM-DD)
// Converts a Date to an ISO date-only string (YYYY-MM-DD)
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// คืนวันที่วันนี้ในรูปแบบ ISO
// Returns today's date as an ISO string
export function todayIso(): string {
  return toIsoDate(new Date());
}
// คืนวันที่ในอนาคต/อดีตห่างจากวันนี้ตามจำนวนวันที่กำหนด ในรูปแบบ ISO
// Returns a date offset from today by the given number of days, as an ISO string
export function plusDaysIso(days: number): string {
  return toIsoDate(new Date(Date.now() + days * 86400000));
}

let lineIdCounter = 1000;
// สร้างรหัส id ใหม่สำหรับรายการสินค้าในใบเสนอราคา
// Generates a new id for a quote line item
export function newLineId(): number {
  lineIdCounter += 1;
  return Date.now() + lineIdCounter;
}

// สร้างรหัส id ใหม่สำหรับรายการย่อย
// Generates a new id for a sub-detail row
export function newSubDetailId(): string {
  return `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// สร้างรายการสินค้าเปล่าเริ่มต้นสำหรับใบเสนอราคา
// Creates a blank quote line item
export function blankLine(): QuoteLine {
  return { id: newLineId(), description: "", unit: "ชิ้น", qty: 1, unitPrice: 0, discount: 0, tags: [], subDetails: [] };
}

// คำนวณยอดรวมของรายการเดียว (จำนวน x ราคา หักส่วนลดของรายการ ไม่ว่าจะระบุเป็น % หรือบาท)
// Computes the subtotal of a single line (qty x price, minus that line's discount, percent or baht)
export function lineSubtotal(l: QuoteLine): number {
  return sharedLineSubtotal(l);
}

// ตรวจสอบว่ารายการนี้มีรายละเอียดย่อยหรือแท็กที่ควรแสดงในเอกสารพิมพ์หรือไม่
// Checks whether a line has any sub-details/tags worth showing in the print output
export function lineHasDetails(l: QuoteLine): boolean {
  return l.subDetails.some((sd) => sd.text.trim() !== "") || l.tags.length > 0;
}

// จัดรูปแบบวันที่แบบไทย (เช่น "3 ส.ค. 2569")
// Formats a date in Thai display format (e.g. "3 ส.ค. 2569")
export function formatQuoteDateThai(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

// จัดรูปแบบวันที่แบบตัวเลข (DD/MM/YYYY)
// Formats a date in numeric DD/MM/YYYY format
export function formatQuoteDateNumeric(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return "";
  }
}

// คำนวณยอดรวมทั้งหมดของใบเสนอราคา (ยอดก่อนลด ส่วนลด ภาษี และยอดสุทธิ)
// Computes the quote's aggregate totals (subtotal, discount, VAT, and grand total)
export function computeTotals(lines: QuoteLine[], discount: number, discountMode?: DiscountMode) {
  return sharedComputeTotals(lines, discount, discountMode);
}

// ตรวจสอบว่ารหัสนี้เป็นใบเสนอราคาที่เป็นรีวิชัน (มีส่วนต่อท้าย -R) หรือไม่
// Checks whether an id belongs to a revision quote (has a -R suffix)
export function isRevisionQuote(id: string): boolean {
  return /-R\d+$/.test(id);
}

// สร้างรหัสใบเสนอราคาถัดไป (พรีวิวฝั่งไคลเอนต์เท่านั้น — เลขจริงกำหนดจากเซิร์ฟเวอร์ตอนบันทึก)
// Client-side preview of the next quote id — the server assigns the authoritative id on save
// (nextQuoteId() in api/handlers/quotes.ts), this is only shown to the user before that happens.
// Format: Q#YYMMDD-NNNN, sequence resets daily — matches the server's counter exactly in shape,
// though the preview's own count (of today's ids already loaded client-side) can't guarantee the
// same number the server actually reserves under concurrent creates.
export function nextQuoteId(quotes: Quote[]): string {
  const today = new Date();
  const yy = String(today.getFullYear() % 100).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const dateKey = `${yy}${mm}${dd}`;
  const prefix = `Q#${dateKey}-`;
  const todayCount = quotes.filter((q) => q.id.startsWith(prefix)).length;
  return `${prefix}${String(todayCount + 1).padStart(4, "0")}`;
}

// ดึงรายการใบเสนอราคาทั้งหมดจากเซิร์ฟเวอร์
// Fetches all quotes from the server
export async function fetchQuotes(): Promise<Quote[]> {
  const { quotes } = await apiFetch<{ quotes: Quote[] }>("/quotes");
  return quotes;
}
// สร้างใบเสนอราคาใหม่
// Creates a new quote
export async function createQuote(fields: QuoteDraftFields): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>("/quotes", { method: "POST", body: JSON.stringify(fields) });
  return quote;
}
// แก้ไขใบเสนอราคาที่มีอยู่ตาม id
// Updates an existing quote identified by id
export async function updateQuote(id: string, fields: QuoteUpdateFields, options?: WriteOptions): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>(`/quotes/${encodeURIComponent(id)}${writeQuery(options)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return quote;
}
// ทำสำเนาใบเสนอราคา
// Duplicates a quote
export async function duplicateQuote(id: string): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>(`/quotes/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
  return quote;
}
// สร้างรีวิชันใหม่ของใบเสนอราคาโดยไม่แก้ไขต้นฉบับ
// Creates a new revision of a quote without modifying the source record
export async function rewriteQuote(id: string): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>(`/quotes/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return quote;
}
// ตรวจสอบความครบถ้วนของเอกสารก่อนพิมพ์/ส่งออก PDF
// Validates document completeness before printing/exporting as PDF
export async function printQuote(id: string): Promise<void> {
  await apiFetch<void>(`/quotes/${encodeURIComponent(id)}/print`, { method: "POST" });
}
// ดำเนินการตามขั้นตอนอนุมัติของใบเสนอราคา (ส่งขออนุมัติ/อนุมัติ/ปฏิเสธ ฯลฯ)
// Performs a workflow action on a quote (submit/approve/reject etc.)
export async function performWorkflowAction(
  id: string,
  action: ApprovalAction,
  comment: string,
  draft: QuoteUpdateFields,
): Promise<Quote> {
  const { quote } = await apiFetch<{ quote: Quote }>(`/quotes/${encodeURIComponent(id)}/workflow`, {
    method: "POST",
    body: JSON.stringify({ action, comment, draft }),
  });
  return quote;
}
