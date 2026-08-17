import { HttpError } from "./http.js";
import type { CustomerFields } from "./collections.js";

/**
 * Server-side validation for Customer create/edit payloads — same "never trust client fields,
 * always type/length-check server-side" posture as `quoteValidation.ts`/`companyProfileValidation.ts`.
 * Only `companyName` is required; every other field is optional business detail a Sales user may
 * not have on hand yet when first saving a customer.
 */
const MAX_SHORT_TEXT = 200;
const MAX_LONG_TEXT = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeText(v: unknown, fieldLabel: string, maxLen: number, required = false): string {
  if (v === undefined || v === null) {
    if (required) throw new HttpError(400, `กรุณากรอก${fieldLabel}`);
    return "";
  }
  if (typeof v !== "string") throw new HttpError(400, `${fieldLabel}ต้องเป็นข้อความ`);
  const trimmed = v.trim();
  if (required && !trimmed) throw new HttpError(400, `กรุณากรอก${fieldLabel}`);
  if (trimmed.length > maxLen) throw new HttpError(400, `${fieldLabel}ยาวเกินไป (สูงสุด ${maxLen} ตัวอักษร)`);
  return trimmed;
}

function sanitizeEmail(v: unknown): string {
  const email = sanitizeText(v, "อีเมล", MAX_SHORT_TEXT);
  if (email && !EMAIL_PATTERN.test(email)) throw new HttpError(400, "กรุณากรอกอีเมลให้ถูกต้อง");
  return email;
}

export type CustomerDraftInput = Omit<CustomerFields, "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "isDeleted">;

/** `partial` = true for PATCH (all fields optional, undefined means "leave unchanged"). */
export function validateCustomerDraft(body: unknown, partial: boolean): Partial<CustomerDraftInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<CustomerDraftInput> = {};

  if (!partial || b.companyName !== undefined) out.companyName = sanitizeText(b.companyName, "ชื่อลูกค้า / บริษัท", MAX_SHORT_TEXT, true);
  if (!partial || b.contactName !== undefined) out.contactName = sanitizeText(b.contactName, "ผู้ติดต่อ", MAX_SHORT_TEXT);
  if (!partial || b.phone !== undefined) out.phone = sanitizeText(b.phone, "เบอร์โทร", 40);
  if (!partial || b.email !== undefined) out.email = sanitizeEmail(b.email);
  if (!partial || b.address !== undefined) out.address = sanitizeText(b.address, "ที่อยู่", MAX_LONG_TEXT);
  if (!partial || b.taxId !== undefined) out.taxId = sanitizeText(b.taxId, "เลขประจำตัวผู้เสียภาษี", 40);
  if (!partial || b.deliveryMethod !== undefined) out.deliveryMethod = sanitizeText(b.deliveryMethod, "วิธีจัดส่ง", MAX_SHORT_TEXT);
  if (!partial || b.projectName !== undefined) out.projectName = sanitizeText(b.projectName, "โครงการ", MAX_SHORT_TEXT);
  if (!partial || b.deliveryAddress !== undefined) out.deliveryAddress = sanitizeText(b.deliveryAddress, "ที่อยู่จัดส่ง", MAX_LONG_TEXT);
  if (!partial || b.isActive !== undefined) out.isActive = b.isActive === undefined ? true : b.isActive === true;
  // Accounting AR fields (added 2026-08-17) — see docs/MODULES/Accounting.md.
  if (!partial || b.code !== undefined) out.code = sanitizeText(b.code, "รหัสลูกค้า", 40);
  if (!partial || b.apContactName !== undefined) out.apContactName = sanitizeText(b.apContactName, "ผู้ติดต่อฝ่ายบัญชีลูกค้า", MAX_SHORT_TEXT);
  if (!partial || b.apContactPhone !== undefined) out.apContactPhone = sanitizeText(b.apContactPhone, "เบอร์โทรฝ่ายบัญชีลูกค้า", 40);
  if (!partial || b.apContactEmail !== undefined) out.apContactEmail = sanitizeEmail(b.apContactEmail);
  if (!partial || b.billingConditions !== undefined) out.billingConditions = sanitizeText(b.billingConditions, "เงื่อนไขการวางบิล", MAX_LONG_TEXT);
  if (!partial || b.requiresReport !== undefined) out.requiresReport = b.requiresReport === true;

  return out;
}
