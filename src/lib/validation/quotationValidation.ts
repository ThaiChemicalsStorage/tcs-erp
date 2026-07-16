import type { Quote } from "../quotes.js";
import { isValidIsoDateOrEmpty } from "./dateUtils.js";
import type { ValidationResult } from "./types.js";

/**
 * Centralized required-field configuration for the Quotation form (added 2026-07-16, **relaxed
 * back to a minimal set the same day** per an explicit business decision overriding the original
 * "all fields required" pass — see docs/CHANGELOG.md "Make Quotation Fields Optional and Remove
 * Document Requirements and Delivery"). Users must not be forced to complete every Quotation field;
 * only `client` (the customer name) is treated as genuinely essential, matching the exact minimum
 * this codebase enforced before required-field validation existed at all — no new mandatory field
 * was invented to replace the ones removed here. `required: false` entries are kept (not deleted)
 * so the "one centralized configuration" concept survives for any future, explicitly-confirmed
 * business rule, and so each field's non-requiredness is a documented decision, not a silent gap.
 *
 * `jobTypeCode` is genuinely required, but only **at creation** — enforced separately by
 * `validateJobType(..., { required: true })` in `api/handlers/quotes.ts`'s `POST /api/quotes`
 * handler, not by this shared finalization/print gate (a quotation, once created, always has one;
 * an edit/submit/print should never re-block on it, matching the original pre-existing behavior).
 *
 * Deliberately does NOT include server-derived/read-only fields (quote id, `date`, `amount`,
 * `jobTypeName`, `createdByUserId`, `approvalHistory`, `customerSnapshot`) — those are never
 * "missing" from the user's perspective, and the server always (re)generates them successfully
 * before persisting.
 */
export const quotationRequiredFields: Record<string, { label: string; required: boolean }> = {
  client: { label: "ชื่อลูกค้า", required: true },
  // 2026-07-16 (same day): no longer required — the business decided not every Quotation field
  // should be mandatory, and this wasn't required before required-field validation was added either.
  salesperson: { label: "พนักงานขาย", required: false },
  contactName: { label: "ชื่อผู้ติดต่อ", required: false },
  contactPhone: { label: "เบอร์โทรผู้ติดต่อ", required: false },
  contactEmail: { label: "อีเมลผู้ติดต่อ", required: false },
  address: { label: "ที่อยู่ลูกค้า", required: false },
  taxId: { label: "เลขประจำตัวผู้เสียภาษี", required: false },
  deliveryMethod: { label: "วิธีการส่งของ", required: false },
  deliveryAddress: { label: "สถานที่ส่งของ", required: false },
  project: { label: "ชื่อโครงการ", required: false },
  poRef: { label: "เลขที่ใบสั่งซื้อ (PO)", required: false },
  paymentTerms: { label: "เงื่อนไขการชำระเงิน", required: false },
  issueDate: { label: "วันที่ออกใบเสนอราคา", required: false },
  expiryDate: { label: "วันหมดอายุ", required: false },
  // See file header — required only at creation, via a separate server-side check, not here.
  jobTypeCode: { label: "ประเภทงาน", required: false },
  remarks: { label: "หมายเหตุ", required: false },
  followUpDate: { label: "วันที่ติดตาม", required: false },
  isPotentialOpportunity: { label: "โอกาสในการขาย", required: false },
};

/** Date fields checked for semantic (not just non-blank) validity when a value IS present — "" is
 * always fine (unset, never required), but a non-empty value must be a real `YYYY-MM-DD` calendar
 * date. This is a data-integrity check, not a "field is required" rule — an empty date never fails
 * it, only a malformed non-empty one does. */
const DATE_FIELD_KEYS = new Set(["issueDate", "expiryDate", "followUpDate"]);

function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

/** The subset of `Quote` the validators actually need — a plain object shape (not `Quote` itself)
 * so the frontend can validate an in-progress draft (local component state) that hasn't been
 * assembled into a full `Quote`/`QuoteDraftFields` yet. */
export type QuotationValidationInput = Pick<
  Quote,
  | "client" | "salesperson" | "contactName" | "contactPhone" | "contactEmail" | "address" | "taxId"
  | "deliveryMethod" | "deliveryAddress" | "project" | "poRef" | "paymentTerms"
  | "issueDate" | "expiryDate" | "jobTypeCode" | "remarks"
  | "followUpDate" | "isPotentialOpportunity"
>;

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

  const missingCount = Object.keys(fieldErrors).length;
  return { valid: missingCount === 0, fieldErrors, groupErrors: {}, missingCount };
}

/** Called before any workflow transition that moves a Quotation out of "ร่าง" (submit/approve/send
 * to customer/customer accepted/won/etc. — see the workflow guard in api/handlers/quotes.ts). A
 * Draft may remain incomplete; nothing past Draft may skip even this minimal check. */
export function validateQuotationForFinalization(quote: QuotationValidationInput): ValidationResult {
  return computeQuotationValidation(quote);
}

/** Called before Print/PDF export — same minimal completeness bar as finalization. */
export function validateQuotationForPrint(quote: QuotationValidationInput): ValidationResult {
  return computeQuotationValidation(quote);
}
