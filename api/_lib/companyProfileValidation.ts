import { HttpError } from "./http.js";
import { validateImageDataUrl } from "./uploadValidation.js";
import type { BankAccount, CompanyProfileDraft } from "../../src/lib/companyProfiles.js";

/**
 * Server-side validation for Company Profile create/edit payloads — same "never trust client
 * fields, always type/length/format-check server-side" posture as `quoteValidation.ts`. Company
 * Name (Thai) and Company Code are the only two genuinely required fields; everything else on the
 * form is optional business/document detail that a preparer may not have on hand yet.
 */
const MAX_SHORT_TEXT = 200;
const MAX_LONG_TEXT = 4000;
const MAX_BANK_ACCOUNTS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+$/i;
/** Thai taxpayer ID — 13 digits, no separators. Only enforced when non-empty (not every company profile will have this filled in immediately). */
const TAX_ID_PATTERN = /^\d{13}$/;

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

function sanitizeWebsite(v: unknown): string {
  const website = sanitizeText(v, "เว็บไซต์", MAX_SHORT_TEXT);
  if (website && !WEBSITE_PATTERN.test(website)) throw new HttpError(400, "กรุณากรอกที่อยู่เว็บไซต์ให้ถูกต้อง (ต้องขึ้นต้นด้วย http:// หรือ https://)");
  return website;
}

function sanitizeTaxId(v: unknown): string {
  const taxId = sanitizeText(v, "เลขประจำตัวผู้เสียภาษี", 20);
  if (taxId && !TAX_ID_PATTERN.test(taxId)) throw new HttpError(400, "กรุณากรอกเลขประจำตัวผู้เสียภาษีให้ถูกต้อง (13 หลัก)");
  return taxId;
}

function sanitizeBankAccounts(v: unknown): BankAccount[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError(400, "รูปแบบบัญชีธนาคารไม่ถูกต้อง");
  if (v.length > MAX_BANK_ACCOUNTS) throw new HttpError(400, `เพิ่มบัญชีธนาคารได้สูงสุด ${MAX_BANK_ACCOUNTS} บัญชี`);
  const accounts = v.map((raw, i): BankAccount => {
    const entry = raw as Record<string, unknown>;
    return {
      id: sanitizeText(entry?.id, `รหัสบัญชีธนาคารรายการที่ ${i + 1}`, 100) || `bank-${Date.now().toString(36)}-${i}`,
      bankName: sanitizeText(entry?.bankName, "ชื่อธนาคาร", MAX_SHORT_TEXT),
      accountName: sanitizeText(entry?.accountName, "ชื่อบัญชี", MAX_SHORT_TEXT),
      accountNumber: sanitizeText(entry?.accountNumber, "เลขที่บัญชี", 50),
      branch: sanitizeText(entry?.branch, "สาขา", MAX_SHORT_TEXT),
      isDefault: entry?.isDefault === true,
    };
  });
  // At most one default bank account — if the client sent more than one, keep only the first and
  // demote the rest, rather than rejecting the whole payload over a UI-fixable inconsistency.
  let seenDefault = false;
  for (const acc of accounts) {
    if (acc.isDefault) {
      if (seenDefault) acc.isDefault = false;
      seenDefault = true;
    }
  }
  // Drop entirely-blank rows (2026-07-13 Codex review, Medium: "blank account rows... are
  // accepted") — a row the admin added via "+ Add Bank Account" and then left untouched (or
  // removed all the text from) shouldn't be persisted as a real bank account record. Rows with
  // *some* real content are kept as-is; this isn't full required-field validation per field, just
  // a low-risk floor against storing pure noise rows.
  return accounts.filter((acc) => acc.bankName || acc.accountName || acc.accountNumber || acc.branch);
}

/** Validates every field of a create/edit payload. `partial` = true for PATCH (all fields optional, undefined means "leave unchanged" — the caller merges onto the existing document). */
export function validateCompanyProfileDraft(body: unknown, partial: boolean): Partial<CompanyProfileDraft> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<CompanyProfileDraft> = {};

  // companyCode/companyNameTh are always required-if-present (never allowed to be blanked out via
  // a partial edit, unlike every other field below) — they're the two identity fields the rest of
  // the app (unique lookups, document headers) can't function without.
  if (!partial || b.companyCode !== undefined) out.companyCode = sanitizeText(b.companyCode, "รหัสบริษัท", 40, true);
  if (!partial || b.companyNameTh !== undefined) out.companyNameTh = sanitizeText(b.companyNameTh, "ชื่อบริษัท", MAX_SHORT_TEXT, true);
  if (!partial || b.companyNameEn !== undefined) out.companyNameEn = sanitizeText(b.companyNameEn, "ชื่อบริษัท (อังกฤษ)", MAX_SHORT_TEXT);
  if (!partial || b.displayName !== undefined) out.displayName = sanitizeText(b.displayName, "ชื่อที่แสดง", MAX_SHORT_TEXT);
  if (!partial || b.addressTh !== undefined) out.addressTh = sanitizeText(b.addressTh, "ที่อยู่", MAX_LONG_TEXT);
  if (!partial || b.addressEn !== undefined) out.addressEn = sanitizeText(b.addressEn, "ที่อยู่ (อังกฤษ)", MAX_LONG_TEXT);
  if (!partial || b.taxId !== undefined) out.taxId = sanitizeTaxId(b.taxId);
  if (!partial || b.branchName !== undefined) out.branchName = sanitizeText(b.branchName, "ชื่อสาขา", MAX_SHORT_TEXT);
  if (!partial || b.branchCode !== undefined) out.branchCode = sanitizeText(b.branchCode, "รหัสสาขา", 40);
  if (!partial || b.phone !== undefined) out.phone = sanitizeText(b.phone, "เบอร์โทรศัพท์", 40);
  if (!partial || b.fax !== undefined) out.fax = sanitizeText(b.fax, "แฟกซ์", 40);
  if (!partial || b.email !== undefined) out.email = sanitizeEmail(b.email);
  if (!partial || b.website !== undefined) out.website = sanitizeWebsite(b.website);
  if (!partial || b.bankAccounts !== undefined) out.bankAccounts = sanitizeBankAccounts(b.bankAccounts);
  if (!partial || b.quotationPrefix !== undefined) out.quotationPrefix = sanitizeText(b.quotationPrefix, "คำนำหน้าเลขที่ใบเสนอราคา", 20);
  if (!partial || b.quotationNumberFormat !== undefined) out.quotationNumberFormat = sanitizeText(b.quotationNumberFormat, "รูปแบบเลขที่ใบเสนอราคา", 100);
  if (!partial || b.quotationTerms !== undefined) out.quotationTerms = sanitizeText(b.quotationTerms, "เงื่อนไขใบเสนอราคา", MAX_LONG_TEXT);
  if (!partial || b.quotationFooter !== undefined) out.quotationFooter = sanitizeText(b.quotationFooter, "ข้อความท้ายเอกสาร", MAX_LONG_TEXT);
  if (!partial || b.signatureLabel !== undefined) out.signatureLabel = sanitizeText(b.signatureLabel, "ป้ายกำกับลายเซ็น", MAX_SHORT_TEXT);
  if (!partial || b.logoDataUrl !== undefined) out.logoDataUrl = validateImageDataUrl(b.logoDataUrl, "โลโก้บริษัท");
  if (!partial || b.stampDataUrl !== undefined) out.stampDataUrl = validateImageDataUrl(b.stampDataUrl, "ตราประทับบริษัท");
  if (!partial || b.isActive !== undefined) out.isActive = b.isActive === undefined ? true : b.isActive === true;

  return out;
}
