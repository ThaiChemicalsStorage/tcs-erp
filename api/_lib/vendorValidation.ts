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

  return out;
}
