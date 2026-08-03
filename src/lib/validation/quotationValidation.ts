import type { Quote } from "../quotes.js";
import { isValidIsoDateOrEmpty } from "./dateUtils.js";
import type { ValidationResult } from "./types.js";

export const quotationRequiredFields: Record<string, { label: string; required: boolean }> = {
  client: { label: "ชื่อลูกค้า", required: true },
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
  jobTypeCode: { label: "ประเภทงาน", required: false },
  remarks: { label: "หมายเหตุ", required: false },
  followUpDate: { label: "วันที่ติดตาม", required: false },
  isPotentialOpportunity: { label: "โอกาสในการขาย", required: false },
};

const DATE_FIELD_KEYS = new Set(["issueDate", "expiryDate", "followUpDate"]);

// ตรวจว่าค่าเป็นค่าว่างหรือมีแต่ช่องว่างหรือไม่
// Checks whether a value is null/undefined/blank (whitespace-only).
function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

export type QuotationValidationInput = Pick<
  Quote,
  | "client" | "salesperson" | "contactName" | "contactPhone" | "contactEmail" | "address" | "taxId"
  | "deliveryMethod" | "deliveryAddress" | "project" | "poRef" | "paymentTerms"
  | "issueDate" | "expiryDate" | "jobTypeCode" | "remarks"
  | "followUpDate" | "isPotentialOpportunity"
>;

// ตรวจสอบข้อมูลใบเสนอราคาตามฟิลด์ที่กำหนดไว้ในตาราง quotationRequiredFields
// Validates a quote's fields against the quotationRequiredFields configuration.
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

// ตรวจสอบความครบถ้วนก่อนเปลี่ยนสถานะใบเสนอราคาออกจาก "ร่าง" (ส่ง/อนุมัติ/ส่งลูกค้า ฯลฯ)
// Validates completeness before any workflow transition that moves a quote out of Draft.
export function validateQuotationForFinalization(quote: QuotationValidationInput): ValidationResult {
  return computeQuotationValidation(quote);
}

// ตรวจสอบความครบถ้วนก่อนพิมพ์/ส่งออก PDF
// Validates completeness before Print/PDF export.
export function validateQuotationForPrint(quote: QuotationValidationInput): ValidationResult {
  return computeQuotationValidation(quote);
}
