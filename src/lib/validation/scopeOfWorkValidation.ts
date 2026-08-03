import type { ScopeOfWorkCustomerSnapshot, ScopeOfWorkItem, ScopeOfWorkPaymentConditions, ScopeOfWorkSignatory } from "../scopeOfWork.js";
import { validateChecklistGroups, type ChecklistGroup } from "../documentRequirements.js";
import { isValidIsoDateOrEmpty } from "./dateUtils.js";
import type { ValidationResult } from "./types.js";

export const scopeOfWorkRequiredFields: Record<string, { label: string; required: boolean }> = {
  scopeNumber: { label: "เลขที่เอกสาร", required: true },
  "customerSnapshot.companyName": { label: "ชื่อลูกค้า", required: true },
  "customerSnapshot.contactName": { label: "ชื่อผู้ติดต่อ", required: true },
  "customerSnapshot.address": { label: "ที่อยู่ลูกค้า", required: true },
  "customerSnapshot.taxId": { label: "เลขประจำตัวผู้เสียภาษี", required: false },
  "customerSnapshot.phone": { label: "เบอร์โทรลูกค้า", required: true },
  "customerSnapshot.email": { label: "อีเมลลูกค้า", required: false },
  issueDate: { label: "วันที่", required: true },
  deliveryDate: { label: "วันที่ส่งของ/ส่งแบบอนุมัติ", required: true },
  drawingCode: { label: "รหัส Drawing", required: true },
  secondaryCode: { label: "รหัสอ้างอิงท้ายงาน", required: false },
  customerPoNumber: { label: "เอกสารใบสั่งซื้อเลขที่ (PO)", required: false },
  deliveryLocation: { label: "สถานที่ส่งของ", required: true },
  shippingContact: { label: "ชื่อผู้ติดต่อส่งของ", required: true },
  shippingPhone: { label: "เบอร์โทรผู้ติดต่อส่งของ", required: true },
  billingContact: { label: "ชื่อผู้ติดต่อวางบิล", required: true },
  billingPhone: { label: "เบอร์โทรผู้ติดต่อวางบิล", required: true },
  "paymentConditions.description": { label: "รายละเอียดการชำระเงิน", required: true },
  "paymentConditions.notes": { label: "หมายเหตุการชำระเงิน", required: false },
  "seller.name": { label: "ชื่อผู้ขาย", required: true },
  "seller.date": { label: "วันที่ผู้ขายลงนาม", required: false },
  "approver.date": { label: "วันที่ผู้อนุมัติลงนาม", required: false },
  remarks: { label: "หมายเหตุ", required: false },
};

export const SCOPE_ITEM_OPTIONAL_FIELDS = ["remark"] as const;

const DATE_FIELD_KEYS = new Set(["issueDate", "deliveryDate", "seller.date", "approver.date"]);

// ตรวจว่าค่าเป็นค่าว่างหรือมีแต่ช่องว่างหรือไม่
// Checks whether a value is null/undefined/blank (whitespace-only).
function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

// อ่านค่าจาก object ตาม path แบบมีจุดคั่น (เช่น "customerSnapshot.companyName")
// Reads a value from an object via a dotted path (e.g. "customerSnapshot.companyName").
function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

export interface ScopeOfWorkItemValidation {
  valid: boolean;
  itemErrors: Record<string, string>;
  hasNoItems: boolean;
}

// ตรวจสอบรายการสินค้า/งานแต่ละแถวของ Scope of Work ว่ากรอกครบถ้วนหรือไม่
// Validates each Scope of Work item row for completeness.
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

// ตรวจว่างวดชำระเงินทุกงวดกรอกเปอร์เซ็นต์ครบและรวมกันได้ 100% พอดี (ถ้ามีการเพิ่มงวด)
// Checks that all payment installment rows have a percentage filled in and sum to exactly 100%.
function validatePaymentPercentages(payment: ScopeOfWorkPaymentConditions): string | null {
  if (payment.installments.length === 0) return null;
  if (payment.installments.some((i) => i.pct === null)) return "กรุณากรอกเปอร์เซ็นต์ให้ครบทุกงวดชำระเงิน";
  const total = payment.installments.reduce((sum, i) => sum + (i.pct ?? 0), 0);
  if (Math.round(total * 100) / 100 !== 100) return "เปอร์เซ็นต์การชำระเงินทุกงวดรวมกันต้องเป็น 100%";
  return null;
}

export interface ScopeOfWorkValidationInput {
  scopeNumber: string;
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

// ตรวจสอบข้อมูล Scope of Work ทั้งฟอร์มตามฟิลด์ที่กำหนด รวมรายการ เงื่อนไขชำระเงิน และเอกสารแนบ
// Validates a Scope of Work's fields, items, payment conditions, and document requirements.
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

// ตรวจสอบความครบถ้วนก่อนเปลี่ยนสถานะจาก Draft เป็น Final (ต้องมีชื่อผู้อนุมัติด้วย)
// Validates completeness before the Draft -> Final transition (requires an approver name).
export function validateScopeOfWorkForFinalization(scope: ScopeOfWorkValidationInput): ValidationResult {
  return computeScopeOfWorkValidation(scope, { requireApprover: true });
}

// ตรวจสอบความครบถ้วนก่อนพิมพ์/ส่งออก PDF (ต้องมีผู้อนุมัติเฉพาะเมื่อสถานะเป็น Final แล้ว)
// Validates completeness before Print/PDF export (approver only required once status is Final).
export function validateScopeOfWorkForPrint(scope: ScopeOfWorkValidationInput & { status: "Draft" | "PendingApproval" | "Final" }): ValidationResult {
  return computeScopeOfWorkValidation(scope, { requireApprover: scope.status === "Final" });
}
