import type { Quote, QuoteLine } from "../quotes.js";
import { validateChecklistGroups, type ChecklistGroup } from "../documentRequirements.js";
import { isValidIsoDateOrEmpty } from "./dateUtils.js";
import type { ValidationResult } from "./types.js";

/**
 * Centralized required-field configuration for the Quotation form (added 2026-07-16) — the single
 * place an optional-field exception is declared, per the business requirement: "all visible
 * editable fields required by default... exceptions allowed only when explicitly marked as
 * optional in one centralized validation configuration." `required: false` entries below are the
 * ONLY sanctioned exceptions, each with its own business reason; every other field is required.
 *
 * Deliberately does NOT include server-derived/read-only fields (quote id, `date`, `amount`,
 * `jobTypeName`, `createdByUserId`, `approvalHistory`, `customerSnapshot`) — those are never
 * "missing" from the user's perspective, and the server always (re)generates them successfully
 * before persisting, per "Do not treat auto-generated read-only fields as missing."
 */
export const quotationRequiredFields: Record<string, { label: string; required: boolean }> = {
  client: { label: "ชื่อลูกค้า", required: true },
  // Seller information — auto-filled from the current user at creation time, but still a real
  // required field per "Seller/approver information" in the business requirement.
  salesperson: { label: "พนักงานขาย", required: true },
  contactName: { label: "ชื่อผู้ติดต่อ", required: true },
  contactPhone: { label: "เบอร์โทรผู้ติดต่อ", required: true },
  // Optional exception: a usable contact email isn't always on file when a quotation is drafted.
  contactEmail: { label: "อีเมลผู้ติดต่อ", required: false },
  address: { label: "ที่อยู่ลูกค้า", required: true },
  // Optional exception: a Thai tax ID isn't always known/collectible before a PO is issued.
  taxId: { label: "เลขประจำตัวผู้เสียภาษี", required: false },
  deliveryMethod: { label: "วิธีการส่งของ", required: true },
  deliveryAddress: { label: "สถานที่ส่งของ", required: true },
  project: { label: "ชื่อโครงการ", required: true },
  // Optional exception: a customer PO number normally doesn't exist yet at quotation stage.
  poRef: { label: "เลขที่ใบสั่งซื้อ (PO)", required: false },
  paymentTerms: { label: "เงื่อนไขการชำระเงิน", required: true },
  issueDate: { label: "วันที่ออกใบเสนอราคา", required: true },
  expiryDate: { label: "วันหมดอายุ", required: true },
  jobTypeCode: { label: "ประเภทงาน", required: true },
  // Optional exception: remarks/terms are often left at the template's/company's default text.
  remarks: { label: "หมายเหตุ", required: false },
  // Optional exception (2026-07-16, Codex review Medium Priority fix — every visible editable field
  // must be centrally classified, even ones that are legitimately optional): "" means no follow-up
  // is scheduled yet, a fully valid state, not missing data.
  followUpDate: { label: "วันที่ติดตาม", required: false },
  // Optional exception: a boolean flag — `false` ("not a potential opportunity") is just as valid a
  // value as `true`, never "missing." Included here only so it's explicitly declared rather than
  // silently absent from the central policy.
  isPotentialOpportunity: { label: "โอกาสในการขาย", required: false },
};

/** Date fields checked for semantic (not just non-blank) validity — "" is always fine (unset), but
 * a non-empty value must be a real `YYYY-MM-DD` calendar date. Added 2026-07-16, Codex review Medium
 * Priority fix: finalization/print previously accepted any nonblank string. */
const DATE_FIELD_KEYS = new Set(["issueDate", "expiryDate", "followUpDate"]);

/** Line-level numeric fields deliberately NOT required — `unitPrice: 0` (a free/no-charge item) and
 * `discount: 0` (no discount) are both fully valid values, never "missing" data (a number field
 * can't be blank the way a text field can; the input always holds some number). Declared explicitly
 * here, not silently omitted, per the "every visible field classified centrally" requirement
 * (2026-07-16, Codex review Medium Priority fix) — both are already type/range-sanitized on every
 * server write (`api/_lib/quoteValidation.ts`), just never required to be non-zero. */
export const QUOTATION_LINE_OPTIONAL_NUMERIC_FIELDS = ["unitPrice", "discount"] as const;

/** Single centralized toggle for whether every non-header line item requires a filled-in
 * `specifications` field (per the Item Validation business rule's "Required specifications") —
 * kept as one flag here, not scattered per-caller, so a future relaxation/tightening is a one-line
 * change instead of a re-audit of every call site. */
export const REQUIRE_LINE_SPECIFICATIONS = true;

function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

export interface QuotationLineValidation {
  valid: boolean;
  /** QuoteLine.id -> Thai error message for the first problem found on that line. */
  lineErrors: Record<number, string>;
  /** True when there are zero non-header lines at all (a document needs at least one). */
  hasNoLines: boolean;
}

/** A completely blank line the user added and never filled in or removed is never valid — either
 * complete it or delete it before proceeding (per "Do not allow completely blank item rows"). */
export function validateQuotationLines(lines: QuoteLine[]): QuotationLineValidation {
  const activeLines = lines.filter((l) => !l.isSectionHeader);
  const lineErrors: Record<number, string> = {};
  for (const line of activeLines) {
    if (isBlank(line.description)) { lineErrors[line.id] = "กรุณากรอกชื่อ/รายละเอียดสินค้า"; continue; }
    if (isBlank(line.unit)) { lineErrors[line.id] = "กรุณากรอกหน่วย"; continue; }
    if (!(line.qty > 0)) { lineErrors[line.id] = "กรุณากรอกจำนวนให้มากกว่า 0"; continue; }
    if (REQUIRE_LINE_SPECIFICATIONS && isBlank(line.specifications)) { lineErrors[line.id] = "กรุณากรอกข้อกำหนด/สเปคสินค้า"; continue; }
  }
  return { valid: activeLines.length > 0 && Object.keys(lineErrors).length === 0, lineErrors, hasNoLines: activeLines.length === 0 };
}

/** The subset of `Quote` the validators actually need — a plain object shape (not `Quote` itself)
 * so the frontend can validate an in-progress draft (local component state) that hasn't been
 * assembled into a full `Quote`/`QuoteDraftFields` yet. `checklistGroups` is optional so an old
 * record that predates this field (see `withDefaultChecklistGroups` in
 * api/_lib/documentRequirements.ts) is still validated as "every mandatory group missing", never
 * skipped/crashed on. */
export type QuotationValidationInput = Pick<
  Quote,
  | "client" | "salesperson" | "contactName" | "contactPhone" | "contactEmail" | "address" | "taxId"
  | "deliveryMethod" | "deliveryAddress" | "project" | "poRef" | "paymentTerms"
  | "issueDate" | "expiryDate" | "jobTypeCode" | "remarks" | "lines"
  | "followUpDate" | "isPotentialOpportunity"
> & { checklistGroups?: ChecklistGroup[] };

function computeQuotationValidation(quote: QuotationValidationInput): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const values = quote as unknown as Record<string, unknown>;
  for (const [key, cfg] of Object.entries(quotationRequiredFields)) {
    const value = values[key];
    const isStringValue = typeof value === "string";
    if (cfg.required) {
      if (!isStringValue || isBlank(value)) { fieldErrors[key] = `กรุณากรอก${cfg.label}`; continue; }
    } else if (!isStringValue || isBlank(value)) {
      continue;
    }
    if (DATE_FIELD_KEYS.has(key) && isStringValue && !isValidIsoDateOrEmpty(value)) {
      fieldErrors[key] = `${cfg.label}ไม่ถูกต้อง`;
    }
  }

  const lineValidation = validateQuotationLines(quote.lines);
  if (lineValidation.hasNoLines) {
    fieldErrors.lines = "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ";
  } else {
    for (const [lineId, message] of Object.entries(lineValidation.lineErrors)) {
      fieldErrors[`lines.${lineId}`] = message;
    }
  }

  const checklistResult = validateChecklistGroups(quote.checklistGroups ?? []);
  const groupErrors: Record<string, string[]> = {};
  if (Object.keys(checklistResult.groupErrors).length > 0) {
    groupErrors.documentRequirements = Object.values(checklistResult.groupErrors);
  }

  const missingCount = Object.keys(fieldErrors).length + Object.values(groupErrors).reduce((n, arr) => n + arr.length, 0);
  return { valid: missingCount === 0, fieldErrors, groupErrors, missingCount };
}

/** Called before any workflow transition that moves a Quotation out of "ร่าง" (submit/approve/send
 * to customer/customer accepted/won/etc. — see the workflow guard in api/handlers/quotes.ts). A
 * Draft may remain incomplete; nothing past Draft may. */
export function validateQuotationForFinalization(quote: QuotationValidationInput): ValidationResult {
  return computeQuotationValidation(quote);
}

/** Called before Print/PDF export — same completeness bar as finalization, since an incomplete
 * document must never be printed even while it's still sitting in Draft status. */
export function validateQuotationForPrint(quote: QuotationValidationInput): ValidationResult {
  return computeQuotationValidation(quote);
}
