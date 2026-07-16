import type { ScopeOfWorkCustomerSnapshot, ScopeOfWorkItem, ScopeOfWorkPaymentConditions, ScopeOfWorkSignatory } from "../scopeOfWork.js";
import { validateChecklistGroups, type ChecklistGroup } from "../documentRequirements.js";
import { isValidIsoDateOrEmpty } from "./dateUtils.js";
import type { ValidationResult } from "./types.js";

/**
 * Centralized required-field configuration for the Scope of Work form (added 2026-07-16) — mirrors
 * `quotationRequiredFields` (src/lib/validation/quotationValidation.ts): `required: false` entries
 * are the only sanctioned optional-field exceptions, each with its own business reason.
 *
 * Dotted paths (`customerSnapshot.companyName`) address nested fields; every other key is a
 * top-level `ScopeOfWork` field. Excludes server-derived/read-only fields (scopeNumber,
 * yearMonth, jobSequence, quotationNumber, jobTypeCode/Name, quotationSalesperson, version,
 * timestamps) — never "missing" from the user's perspective, always regenerated successfully by
 * the server before persisting.
 */
export const scopeOfWorkRequiredFields: Record<string, { label: string; required: boolean }> = {
  "customerSnapshot.companyName": { label: "ชื่อลูกค้า", required: true },
  "customerSnapshot.contactName": { label: "ชื่อผู้ติดต่อ", required: true },
  "customerSnapshot.address": { label: "ที่อยู่ลูกค้า", required: true },
  // Optional exception: a Thai tax ID isn't always known/collectible before a PO is issued.
  "customerSnapshot.taxId": { label: "เลขประจำตัวผู้เสียภาษี", required: false },
  "customerSnapshot.phone": { label: "เบอร์โทรลูกค้า", required: true },
  // Optional exception: a usable customer email isn't always on file.
  "customerSnapshot.email": { label: "อีเมลลูกค้า", required: false },
  issueDate: { label: "วันที่", required: true },
  deliveryDate: { label: "วันที่ส่งของ/ส่งแบบอนุมัติ", required: true },
  drawingCode: { label: "รหัส Drawing", required: true },
  secondaryCode: { label: "รหัสอ้างอิงท้ายงาน", required: true },
  // Optional exception: a customer PO number normally doesn't exist yet at this stage.
  customerPoNumber: { label: "เอกสารใบสั่งซื้อเลขที่ (PO)", required: false },
  deliveryLocation: { label: "สถานที่ส่งของ", required: true },
  shippingContact: { label: "ชื่อผู้ติดต่อส่งของ", required: true },
  shippingPhone: { label: "เบอร์โทรผู้ติดต่อส่งของ", required: true },
  billingContact: { label: "ชื่อผู้ติดต่อวางบิล", required: true },
  billingPhone: { label: "เบอร์โทรผู้ติดต่อวางบิล", required: true },
  "paymentConditions.description": { label: "รายละเอียดการชำระเงิน", required: true },
  // Optional exception (2026-07-16, Codex review Medium Priority fix — every visible editable field
  // must be centrally classified): the percentage-based schedule + description above already carry
  // the actual billing condition; `method`/`notes` are supplementary free text.
  "paymentConditions.method": { label: "วิธีการชำระเงิน", required: false },
  "paymentConditions.notes": { label: "หมายเหตุการชำระเงิน", required: false },
  "seller.name": { label: "ชื่อผู้ขาย", required: true },
  // Optional exception: a signature date is normally filled in at the moment of actually signing,
  // not necessarily while the rest of the document is still being drafted.
  "seller.date": { label: "วันที่ผู้ขายลงนาม", required: false },
  "approver.date": { label: "วันที่ผู้อนุมัติลงนาม", required: false },
  // Optional exception: remarks are free-form notes, not always needed.
  remarks: { label: "หมายเหตุ", required: false },
};

/** Per-item field deliberately NOT required — `remark` is a free-form note on a Scope of Work item,
 * distinct from the `specifications` at least one of which IS required by `validateScopeOfWorkItems`
 * below. Declared explicitly (2026-07-16, Codex review Medium Priority fix) rather than silently
 * omitted from any central policy. */
export const SCOPE_ITEM_OPTIONAL_FIELDS = ["remark"] as const;

/** Date fields checked for semantic (not just non-blank) validity — added 2026-07-16, Codex review
 * Medium Priority fix. Dotted paths address the two signatory dates the same way
 * `scopeOfWorkRequiredFields` does. */
const DATE_FIELD_KEYS = new Set(["issueDate", "deliveryDate", "seller.date", "approver.date"]);

function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

export interface ScopeOfWorkItemValidation {
  valid: boolean;
  /** ScopeOfWorkItem.id -> Thai error message for the first problem found on that item. */
  itemErrors: Record<string, string>;
  hasNoItems: boolean;
}

/** A completely blank item row is never valid — either complete it or delete it before proceeding. */
export function validateScopeOfWorkItems(items: ScopeOfWorkItem[]): ScopeOfWorkItemValidation {
  const activeItems = items.filter((it) => !it.isSectionHeader);
  const itemErrors: Record<string, string> = {};
  for (const item of activeItems) {
    if (isBlank(item.name)) { itemErrors[item.id] = "กรุณากรอกชื่อรายการ"; continue; }
    if (isBlank(item.unit)) { itemErrors[item.id] = "กรุณากรอกหน่วย"; continue; }
    if (item.quantity === null || !(item.quantity > 0)) { itemErrors[item.id] = "กรุณากรอกจำนวนให้มากกว่า 0"; continue; }
    if (!item.specifications.some((s) => !isBlank(s.text))) { itemErrors[item.id] = "กรุณากรอกข้อกำหนด/รายละเอียดอย่างน้อย 1 รายการ"; continue; }
  }
  return { valid: activeItems.length > 0 && Object.keys(itemErrors).length === 0, itemErrors, hasNoItems: activeItems.length === 0 };
}

/**
 * If the user is using a percentage-based payment schedule (either `downPaymentPct` or
 * `finalPaymentPct` set), both must be filled in and must sum to exactly 100% — the actual
 * quotation/business payment split, never a hardcoded 40/60 assumption. If neither percentage is
 * set, the free-text `method`/`description` fields carry the billing condition instead and no
 * percentage check applies.
 */
function validatePaymentPercentages(payment: ScopeOfWorkPaymentConditions): string | null {
  const { downPaymentPct, finalPaymentPct } = payment;
  if (downPaymentPct === null && finalPaymentPct === null) return null;
  if (downPaymentPct === null || finalPaymentPct === null) return "กรุณากรอกเปอร์เซ็นต์การชำระเงินให้ครบทั้งเงินมัดจำและส่วนที่เหลือ";
  if (Math.round((downPaymentPct + finalPaymentPct) * 100) / 100 !== 100) return "เปอร์เซ็นต์การชำระเงิน (เงินมัดจำ + ส่วนที่เหลือ) ต้องรวมเป็น 100%";
  return null;
}

export interface ScopeOfWorkValidationInput {
  customerSnapshot: ScopeOfWorkCustomerSnapshot;
  issueDate: string;
  deliveryDate: string;
  drawingCode: string;
  secondaryCode: string;
  customerPoNumber: string;
  deliveryLocation: string;
  shippingContact: string;
  shippingPhone: string;
  billingContact: string;
  billingPhone: string;
  checklistGroups: ChecklistGroup[];
  items: ScopeOfWorkItem[];
  paymentConditions: ScopeOfWorkPaymentConditions;
  remarks: string;
  seller: ScopeOfWorkSignatory;
  approver: ScopeOfWorkSignatory;
}

function computeScopeOfWorkValidation(scope: ScopeOfWorkValidationInput, opts: { requireApprover: boolean }): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  for (const [path, cfg] of Object.entries(scopeOfWorkRequiredFields)) {
    const value = getPath(scope, path);
    const isStringValue = typeof value === "string";
    if (cfg.required) {
      if (!isStringValue || isBlank(value)) { fieldErrors[path] = `กรุณากรอก${cfg.label}`; continue; }
    } else if (!isStringValue || isBlank(value)) {
      continue;
    }
    if (DATE_FIELD_KEYS.has(path) && isStringValue && !isValidIsoDateOrEmpty(value)) {
      fieldErrors[path] = `${cfg.label}ไม่ถูกต้อง`;
    }
  }

  // Seller/approver information "when reaching the relevant workflow stage" — seller always signs
  // (even a Draft has a starting seller, defaulted at creation), approver only required once
  // finalizing (see validateScopeOfWorkForFinalization/Print below).
  if (opts.requireApprover && isBlank(scope.approver.name)) {
    fieldErrors["approver.name"] = "กรุณากรอกชื่อผู้อนุมัติ";
  }

  const itemValidation = validateScopeOfWorkItems(scope.items);
  if (itemValidation.hasNoItems) {
    fieldErrors.items = "กรุณาเพิ่มรายการอย่างน้อย 1 รายการ";
  } else {
    for (const [itemId, message] of Object.entries(itemValidation.itemErrors)) {
      fieldErrors[`items.${itemId}`] = message;
    }
  }

  const percentError = validatePaymentPercentages(scope.paymentConditions);
  if (percentError) fieldErrors["paymentConditions.percentTotal"] = percentError;

  const checklistResult = validateChecklistGroups(scope.checklistGroups);
  const groupErrors: Record<string, string[]> = {};
  if (Object.keys(checklistResult.groupErrors).length > 0) {
    groupErrors.documentRequirements = Object.values(checklistResult.groupErrors);
  }

  const missingCount = Object.keys(fieldErrors).length + Object.values(groupErrors).reduce((n, arr) => n + arr.length, 0);
  return { valid: missingCount === 0, fieldErrors, groupErrors, missingCount };
}

/** Called before the Draft -> Final transition (see handleFinalize in api/_lib/scopeOfWorkHandler.ts). */
export function validateScopeOfWorkForFinalization(scope: ScopeOfWorkValidationInput): ValidationResult {
  return computeScopeOfWorkValidation(scope, { requireApprover: true });
}

/** Called before Print/PDF export. A still-Draft record doesn't yet need an approver signature
 * (that's a Finalize-time requirement) — everything else must already be complete, since an
 * incomplete Draft must never be printed. */
export function validateScopeOfWorkForPrint(scope: ScopeOfWorkValidationInput & { status: "Draft" | "Final" }): ValidationResult {
  return computeScopeOfWorkValidation(scope, { requireApprover: scope.status === "Final" });
}
