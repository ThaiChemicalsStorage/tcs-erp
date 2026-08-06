import type {
  ServiceReportCustomerSnapshot,
  ServiceChecklistSectionValue,
  ServiceReportTemplateSnapshot,
} from "../serviceReports.js";
import { isValidIsoDateOrEmpty } from "./dateUtils.js";
import type { ValidationResult } from "./types.js";

// Shared client+server validation for the Service Report checklist and report-info fields (added
// 2026-08-06, Phase 1) — same "one module, imported by both the frontend and the API bundle"
// pattern as scopeOfWorkValidation.ts, so the two can never drift apart on what "complete" means.

export const serviceReportRequiredFields: Record<string, { label: string; required: boolean }> = {
  "customerSnapshot.companyName": { label: "ชื่อลูกค้า", required: true },
  "customerSnapshot.contactName": { label: "ชื่อผู้ติดต่อ", required: true },
  "customerSnapshot.address": { label: "ที่อยู่ลูกค้า", required: false },
  "customerSnapshot.taxId": { label: "เลขประจำตัวผู้เสียภาษี", required: false },
  "customerSnapshot.phone": { label: "เบอร์โทรลูกค้า", required: true },
  "customerSnapshot.email": { label: "อีเมลลูกค้า", required: false },
  serviceLocation: { label: "สถานที่ให้บริการ", required: true },
  projectOrJobCode: { label: "อ้างอิงโปรเจกต์/รหัสงาน", required: false },
  serviceSystemName: { label: "ระบบที่ให้บริการ", required: true },
  serviceType: { label: "ประเภทบริการ", required: false },
  inspectionDate: { label: "วันที่เข้าบริการ", required: true },
  reportDate: { label: "วันที่ออกรายงาน", required: true },
  nextPmDate: { label: "รอบ PM ถัดไป", required: false },
  assignedServiceEngineerId: { label: "ผู้เข้าตรวจสอบหลัก", required: true },
  onSiteContactName: { label: "ผู้ติดต่อหน้างาน", required: false },
  onSiteContactPhone: { label: "เบอร์โทรผู้ติดต่อหน้างาน", required: false },
  overallCustomerSummary: { label: "สรุปภาพรวมสำหรับลูกค้า", required: false },
  overallRemark: { label: "หมายเหตุ", required: false },
};

const DATE_FIELD_KEYS = new Set(["inspectionDate", "reportDate", "nextPmDate"]);

function isBlank(v: string | null | undefined): boolean {
  return v === null || v === undefined || v.trim() === "";
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

export interface ServiceChecklistValidation {
  valid: boolean;
  itemErrors: Record<string, string>; // keyed by "sectionKey.groupKey.itemKey"
}

/**
 * Validates checklist completeness against the report's own frozen `templateSnapshot` — never
 * against the live template, so a template edited after report creation can never retroactively
 * change what "complete" means for an already-started report. A section the source marks
 * `isOptionalAddon: true` and the report has `included: false` for is skipped entirely (its items
 * are neither required nor scored).
 */
export function validateServiceChecklist(
  checklist: ServiceChecklistSectionValue[],
  templateSnapshot: ServiceReportTemplateSnapshot,
): ServiceChecklistValidation {
  const itemErrors: Record<string, string> = {};
  const checklistBySection = new Map(checklist.map((s) => [s.key, s]));

  for (const sectionDef of templateSnapshot.sections) {
    const sectionValue = checklistBySection.get(sectionDef.key);
    if (sectionDef.isOptionalAddon && !(sectionValue?.included ?? false)) continue;

    const groupsByKey = new Map((sectionValue?.groups ?? []).map((g) => [g.key, g]));
    for (const groupDef of sectionDef.groups) {
      const itemsByKey = new Map((groupsByKey.get(groupDef.key)?.items ?? []).map((it) => [it.key, it]));
      for (const itemDef of groupDef.items) {
        const path = `${sectionDef.key}.${groupDef.key}.${itemDef.key}`;
        const itemValue = itemsByKey.get(itemDef.key);
        if (itemDef.kind === "measurement") {
          if (isBlank(itemValue?.measurementValue)) itemErrors[path] = `กรุณากรอกค่า "${itemDef.label}"`;
          continue;
        }
        // normalAbnormal
        if (!itemValue || itemValue.status === "not_selected") {
          itemErrors[path] = `กรุณาระบุผลตรวจของ "${itemDef.label}"`;
          continue;
        }
        if (itemValue.status === "abnormal") {
          if (isBlank(itemValue.abnormalDetail)) {
            itemErrors[path] = `กรุณาระบุรายละเอียดความผิดปกติของ "${itemDef.label}"`;
          } else if ((itemValue.photos ?? []).length === 0) {
            itemErrors[path] = `กรุณาแนบรูปภาพอย่างน้อย 1 รูปสำหรับ "${itemDef.label}" ที่ผิดปกติ`;
          }
        }
      }
    }
  }

  return { valid: Object.keys(itemErrors).length === 0, itemErrors };
}

export interface ServiceReportValidationInput {
  customerSnapshot: ServiceReportCustomerSnapshot;
  serviceLocation: string;
  projectOrJobCode: string;
  serviceSystemName: string;
  serviceType: string;
  inspectionDate: string;
  reportDate: string;
  nextPmDate: string;
  assignedServiceEngineerId: string;
  onSiteContactName: string;
  onSiteContactPhone: string;
  overallCustomerSummary: string;
  overallRemark: string;
  checklist: ServiceChecklistSectionValue[];
  templateSnapshot: ServiceReportTemplateSnapshot;
}

function computeServiceReportValidation(report: ServiceReportValidationInput, opts: { requireComplete: boolean }): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  if (opts.requireComplete) {
    for (const [path, cfg] of Object.entries(serviceReportRequiredFields)) {
      const value = getPath(report, path);
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
  } else {
    // Draft/save: dates only need to be well-formed if present at all — nothing is required yet.
    for (const path of DATE_FIELD_KEYS) {
      const value = getPath(report, path);
      if (typeof value === "string" && value && !isValidIsoDateOrEmpty(value)) {
        fieldErrors[path] = `${serviceReportRequiredFields[path].label}ไม่ถูกต้อง`;
      }
    }
  }

  const groupErrors: Record<string, string[]> = {};
  if (opts.requireComplete) {
    const checklistResult = validateServiceChecklist(report.checklist, report.templateSnapshot);
    if (!checklistResult.valid) groupErrors.checklist = Object.values(checklistResult.itemErrors);
  }

  const missingCount = Object.keys(fieldErrors).length + Object.values(groupErrors).reduce((n, arr) => n + arr.length, 0);
  return { valid: missingCount === 0, fieldErrors, groupErrors, missingCount };
}

// ตรวจสอบความถูกต้องก่อนบันทึกฉบับร่าง (ไม่บังคับข้อมูลให้ครบ)
// Validates before saving a Draft (nothing required yet — only well-formedness of any dates present)
export function validateServiceReportForSave(report: ServiceReportValidationInput): ValidationResult {
  return computeServiceReportValidation(report, { requireComplete: false });
}

// ตรวจสอบความครบถ้วนก่อนเปลี่ยนสถานะเป็น "เสร็จสิ้น" (ต้องกรอกข้อมูลและเช็คลิสต์ครบทุกรายการที่เกี่ยวข้อง)
// Validates completeness before marking a report "Completed" (every applicable field/checklist item required)
export function validateServiceReportForCompletion(report: ServiceReportValidationInput): ValidationResult {
  return computeServiceReportValidation(report, { requireComplete: true });
}
