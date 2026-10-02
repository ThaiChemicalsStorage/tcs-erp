import { HttpError } from "./http.js";
import type { VendorFields } from "./collections.js";

/**
 * Server-side validation for Vendor create/edit payloads — same posture as
 * `customerValidation.ts`, which this is modelled on: never trust a client field, type- and
 * length-check everything here rather than in the page.
 *
 * Only `name` is required. `code` (รหัสผู้ขาย) is optional-but-unique: the owner asked for vendor
 * codes on 2026-08-28 (*"มีหน้าเพิ่มผู้ขายสำหรับจัดซื้อเพราะมันจะมีรหัสผู้ขายด้วย"*), but a buyer
 * adding a vendor mid-purchase may not have assigned one yet. Uniqueness is enforced in the handler,
 * not here, because it needs a database round-trip.
 */
const MAX_SHORT_TEXT = 200;
const MAX_LONG_TEXT = 2000;

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

export type VendorDraftInput = Omit<VendorFields, "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "isDeleted">;

/** `partial` = true for PATCH (ไม่ส่งฟิลด์ไหนมา = ไม่แตะฟิลด์นั้น) */
export function validateVendorDraft(body: unknown, partial: boolean): Partial<VendorDraftInput> {
  const b = (body ?? {}) as Record<string, unknown>;
  const out: Partial<VendorDraftInput> = {};

  if (!partial || b.name !== undefined) out.name = sanitizeText(b.name, "ชื่อผู้ขาย", MAX_SHORT_TEXT, true);
  // รหัสผู้ขายเก็บเป็นตัวพิมพ์ใหญ่เสมอ — คนกรอก "v-001" กับ "V-001" ต้องชนกัน ไม่ใช่ได้สองแถว
  if (!partial || b.code !== undefined) out.code = sanitizeText(b.code, "รหัสผู้ขาย", 40).toUpperCase();
  if (!partial || b.contactName !== undefined) out.contactName = sanitizeText(b.contactName, "ผู้ติดต่อ", MAX_SHORT_TEXT);
  if (!partial || b.phone !== undefined) out.phone = sanitizeText(b.phone, "เบอร์โทร", 40);
  if (!partial || b.taxId !== undefined) out.taxId = sanitizeText(b.taxId, "เลขประจำตัวผู้เสียภาษี", 40);
  if (!partial || b.address !== undefined) out.address = sanitizeText(b.address, "ที่อยู่", MAX_LONG_TEXT);
  if (!partial || b.note !== undefined) out.note = sanitizeText(b.note, "หมายเหตุ", MAX_LONG_TEXT);
  if (!partial || b.isActive !== undefined) out.isActive = b.isActive === undefined ? true : b.isActive === true;

  // ── ช่องใหม่ 2026-10-02 (หน้าจอโปรแกรมบัญชีเดิม) — ไม่บังคับทั้งหมด ไม่ส่งมา = ไม่แตะ แม้ตอนสร้าง ──
  // ใครแก้ช่องไหนได้ (จัดซื้อ/บัญชี) ตัดสินใน handler ไม่ใช่ที่นี่ — ที่นี่ตรวจแค่ชนิดและความยาว
  const text = (key: keyof VendorDraftInput, label: string, maxLen = MAX_SHORT_TEXT) => {
    if (b[key] !== undefined) (out as Record<string, unknown>)[key] = sanitizeText(b[key], label, maxLen);
  };
  const num = (key: keyof VendorDraftInput, label: string, opts: { min?: number; max?: number; integer?: boolean } = {}) => {
    if (b[key] !== undefined) (out as Record<string, unknown>)[key] = sanitizeNumber(b[key], label, opts);
  };
  text("nameEn", "ชื่อภาษาอังกฤษ");
  text("postalCode", "รหัสไปรษณีย์", 10);
  if (b.branch !== undefined) {
    // สาขาตามโปรแกรมเดิม: 0 = สำนักงานใหญ่, -1 = ไม่ระบุ — ว่าง/null ถือเป็น -1
    out.branch = sanitizeNumber(b.branch, "สาขา", { min: -1, max: 99999, integer: true }) ?? -1;
  }
  text("paymentTerms", "เงื่อนไขการชำระเงิน");
  text("whtIncomeType", "ประเภทเงินได้ที่จ่าย");
  num("whtRate", "อัตราภาษีที่หัก (%)", { min: 0, max: 100 });
  text("whtCategory", "หมวดภาษีหัก ณ ที่จ่าย", 40);
  text("whtCondition", "เงื่อนไขการหักภาษี", 80);
  text("vendorType", "ประเภทผู้จำหน่าย", 80);
  text("accountCode", "เลขที่บัญชี", 40);
  if (b.priceType !== undefined) {
    if (b.priceType !== "" && b.priceType !== "none" && b.priceType !== "exclusive" && b.priceType !== "inclusive") {
      throw new HttpError(400, "ประเภทราคาไม่ถูกต้อง");
    }
    out.priceType = b.priceType;
  }
  num("vatRate", "ภาษีมูลค่าเพิ่ม (%)", { min: 0, max: 100 });
  text("shippingMethod", "ขนส่งโดย");
  num("creditDays", "เครดิต (วัน)", { min: 0, max: 3650, integer: true });
  text("currency", "รหัสสกุลเงิน", 10);
  text("discount", "ส่วนลด", 40);
  num("creditLimit", "วงเงินอนุมัติ", { min: 0 });
  num("openingBalance", "ยอดยกมา");
  num("advanceCheque", "เช็คจ่ายล่วงหน้า", { min: 0 });
  if (out.accountCode !== undefined) out.accountCode = out.accountCode.toUpperCase();
  if (out.currency !== undefined) out.currency = out.currency.toUpperCase();

  return out;
}

/** ตัวเลขที่ว่างได้ — "" / null = null · ไม่ใช่ตัวเลข/นอกช่วง = 400 */
function sanitizeNumber(v: unknown, fieldLabel: string, opts: { min?: number; max?: number; integer?: boolean }): number | null {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) throw new HttpError(400, `${fieldLabel}ต้องเป็นตัวเลข`);
  if (opts.integer && !Number.isInteger(n)) throw new HttpError(400, `${fieldLabel}ต้องเป็นจำนวนเต็ม`);
  if (opts.min !== undefined && n < opts.min) throw new HttpError(400, `${fieldLabel}ต้องไม่น้อยกว่า ${opts.min}`);
  if (opts.max !== undefined && n > opts.max) throw new HttpError(400, `${fieldLabel}ต้องไม่เกิน ${opts.max}`);
  return n;
}
