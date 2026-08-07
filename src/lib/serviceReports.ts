import { apiFetch } from "./apiClient.js";
import type { ServiceChecklistSectionDef } from "./serviceTemplates.js";

// Service Report — the field-usable record combining the Service Checklist and the detailed
// Service Report (added 2026-08-06, Phase 1). Created directly against a Customer (not derived
// from a Quotation, unlike Scope of Work) and always starts from a ServiceTemplate, whose
// structure is frozen onto `templateSnapshot` at creation time. Photo upload, signature capture,
// print/PDF export, and customer acceptance are later phases — see docs/MODULES/Service.md.

export type ServiceChecklistItemStatus = "not_selected" | "normal" | "abnormal";

// Photo metadata for a checklist item — bytes live server-side in the `service_checklist_photo_files`
// MongoDB collection (Binary, same "keep bytes out of the parent document" pattern as
// ScopeOfWorkAttachment/scope_attachment_files); `url` is an unauthenticated capability-URL download
// link (random token), same model as Scope of Work attachments.
export interface ServiceChecklistItemPhoto {
  id: string;
  fileName: string;
  url: string;
  size: number;
  uploadedAt: string;
}

export interface ServiceChecklistItemValue {
  key: string; // matches the corresponding ServiceChecklistItemDef.key in templateSnapshot
  status: ServiceChecklistItemStatus; // meaningful only when the def's kind === "normalAbnormal"
  abnormalDetail: string; // required non-blank when status === "abnormal"
  measurementValue: string; // meaningful only when the def's kind === "measurement"
  // Required (at least 1) when status === "abnormal" before a report can be marked Completed —
  // managed through dedicated upload/delete routes, never through the generic PATCH (same
  // "not a PATCHable field" convention as ScopeOfWork.attachments).
  photos: ServiceChecklistItemPhoto[];
}

export interface ServiceChecklistGroupValue {
  key: string;
  items: ServiceChecklistItemValue[];
}

export interface ServiceChecklistSectionValue {
  key: string;
  // Always true for a non-optional section. For an isOptionalAddon section, whether this specific
  // report actually includes it — an excluded section's items are skipped by completion validation.
  included: boolean;
  groups: ServiceChecklistGroupValue[];
}

export interface ServiceReportTemplateSnapshot {
  templateId: string;
  templateCode: string;
  templateName: string;
  version: string;
  sections: ServiceChecklistSectionDef[];
  sourceHash: string;
  capturedAt: string;
}

// Deliberately a 7-field subset of CustomerSnapshot (no deliveryMethod/deliveryAddress) — a
// service visit has no "delivery," mirroring ScopeOfWorkCustomerSnapshot's precedent of trimming
// to what the document type actually needs.
export interface ServiceReportCustomerSnapshot {
  companyName: string;
  contactName: string;
  address: string;
  taxId: string;
  phone: string;
  email: string;
  projectName: string;
}

export type ServiceReportStatus = "Draft" | "Completed" | "Cancelled";

export interface ServiceReport {
  id: string; // human doc number IS the id, e.g. "SR-2569-0001"
  customerId: string; // "" if unlinked (manually entered, same convention as Quote.customerId)
  customerSnapshot: ServiceReportCustomerSnapshot;

  serviceLocation: string;
  projectOrJobCode: string;
  serviceSystemName: string; // free text — the specific installed system, finer-grained than templateCode
  serviceType: string; // free text in Phase 1 (e.g. "PM", "Breakdown")

  templateId: string; // required — every report starts from a template
  templateSnapshot: ServiceReportTemplateSnapshot;
  checklist: ServiceChecklistSectionValue[];

  inspectionDate: string; // ISO date
  reportDate: string; // ISO date
  nextPmDate: string; // ISO date or ""

  assignedServiceEngineerId: string;
  additionalInspectorNames: string[];

  onSiteContactName: string;
  onSiteContactPhone: string;

  overallCustomerSummary: string;
  overallRemark: string;

  // On-site customer sign-off (added 2026-08-07). Deliberately independent of the completion
  // checklist — a report can be completed unsigned when the customer isn't on site. The engineer's
  // own signature is not stored here: it's pulled live from their profile `signatureDataUrl`, the
  // same convention Scope of Work's print view uses. `customerSignedAt` is server-stamped.
  customerSignatureDataUrl: string; // base64 PNG data URL, "" when unsigned
  customerSignedName: string;
  customerSignedAt: string | null;

  status: ServiceReportStatus;
  isDeleted: boolean;

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// Row shape for the standalone Service Report list — the server resolves
// `assignedServiceEngineerName` from `assignedServiceEngineerId` at list time (not persisted),
// same "small denormalized read model, real id stays the source of truth" idea as
// ScopeOfWorkListItem's quotationSalesperson.
export interface ServiceReportListItem {
  id: string;
  customerName: string;
  serviceLocation: string;
  projectOrJobCode: string;
  serviceSystemName: string;
  status: ServiceReportStatus;
  inspectionDate: string;
  assignedServiceEngineerId: string;
  assignedServiceEngineerName: string;
  updatedAt: string;
}

export interface ServiceReportDraft {
  customerId: string;
  customerSnapshot: ServiceReportCustomerSnapshot;
  serviceLocation: string;
  projectOrJobCode: string;
  serviceSystemName: string;
  serviceType: string;
  templateId: string;
  checklist: ServiceChecklistSectionValue[];
  inspectionDate: string;
  reportDate: string;
  nextPmDate: string;
  assignedServiceEngineerId: string;
  additionalInspectorNames: string[];
  onSiteContactName: string;
  onSiteContactPhone: string;
  overallCustomerSummary: string;
  overallRemark: string;
  // `customerSignedAt` is absent on purpose — the server stamps it whenever the signature changes,
  // so a client can never backdate a sign-off.
  customerSignatureDataUrl: string;
  customerSignedName: string;
}

export type ServiceReportStatusAction = "complete" | "reopen" | "cancel";

// Update payload — `templateSections` (added 2026-08-06) carries this report's own customized
// checklist structure (groups/items added or removed per job, see docs/MODULES/Service.md
// "Per-report checklist customization"); it edits only the report's frozen snapshot, never the
// master template.
export type ServiceReportUpdate = Partial<ServiceReportDraft> & { templateSections?: ServiceChecklistSectionDef[] };

// รวมเฉพาะข้อมูลรูปภาพจากเซิร์ฟเวอร์เข้ากับ checklist ในเครื่อง โดยไม่ทับการแก้ไขที่ยังไม่ได้บันทึก
/**
 * Merges **only** the photo metadata from a server checklist into the local one, matched by
 * section/group/item key. Every other field on a local item (`status`, `abnormalDetail`,
 * `measurementValue`, a section's `included` flag) is kept exactly as-is.
 *
 * Photos are the one part of a checklist item the server owns outright — they change solely through
 * the dedicated photo routes, and the server's `mergeChecklist()` deliberately refuses to accept
 * them from a `PATCH`. Everything else is local-first and may be holding unsaved edits, which is
 * why the photo upload/delete responses must not be applied wholesale: doing that (the behavior
 * until 2026-08-07) reverted every unsaved change the moment an upload finished — an item just
 * flipped to Abnormal would snap back to Normal while its photo attached fine.
 *
 * Items/groups/sections that exist only locally (added to this report but not yet saved) have no
 * server counterpart and are returned untouched.
 */
export function mergeServerPhotosIntoChecklist(
  local: ServiceChecklistSectionValue[],
  server: ServiceChecklistSectionValue[],
): ServiceChecklistSectionValue[] {
  return local.map((section) => {
    const serverSection = server.find((s) => s.key === section.key);
    if (!serverSection) return section;
    return {
      ...section,
      groups: section.groups.map((group) => {
        const serverGroup = serverSection.groups.find((g) => g.key === group.key);
        if (!serverGroup) return group;
        return {
          ...group,
          items: group.items.map((item) => {
            const serverItem = serverGroup.items.find((it) => it.key === item.key);
            return serverItem ? { ...item, photos: serverItem.photos ?? [] } : item;
          }),
        };
      }),
    };
  });
}

// ดึงรายการสรุปรายงานบริการทั้งหมด (กรองตามสิทธิ์ฝั่งเซิร์ฟเวอร์)
// Fetches the summarized list of every Service Report (server-side ownership-filtered)
export async function fetchAllServiceReports(): Promise<ServiceReportListItem[]> {
  const { serviceReports } = await apiFetch<{ serviceReports: ServiceReportListItem[] }>("/service-reports");
  return serviceReports;
}

// ดึงข้อมูลรายงานบริการแบบเต็มตาม id
// Fetches a single Service Report's full content by id
export async function fetchServiceReport(id: string): Promise<ServiceReport> {
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${id}`);
  return serviceReport;
}

// สร้างรายงานบริการใหม่
// Creates a new Service Report
export async function createServiceReport(draft: ServiceReportDraft): Promise<ServiceReport> {
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>("/service-reports", {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return serviceReport;
}

// แก้ไขรายงานบริการที่ยังเป็นร่าง
// Updates a Draft Service Report
export async function updateServiceReport(id: string, fields: ServiceReportUpdate): Promise<ServiceReport> {
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return serviceReport;
}

// เปลี่ยนสถานะรายงานบริการ (เสร็จสิ้น / เปิดใหม่ / ยกเลิก)
// Changes a Service Report's status (complete / reopen / cancel)
export async function changeServiceReportStatus(id: string, action: ServiceReportStatusAction): Promise<ServiceReport> {
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  return serviceReport;
}

// ลบ (soft delete) รายงานบริการ
// Soft-deletes a Service Report
export async function deleteServiceReport(id: string): Promise<void> {
  await apiFetch<void>(`/service-reports/${id}`, { method: "DELETE" });
}

// อ่านไฟล์รูปภาพเป็น base64 (ตัดส่วนหัว data URL ออก) สำหรับแนบกับรายการตรวจเช็คที่ผิดปกติ
// Reads an image File as base64 (data-URL prefix stripped) for attaching to an Abnormal checklist item
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// อัปโหลดรูปภาพประกอบรายการตรวจเช็คที่ผิดปกติ
// Uploads a photo attached to an Abnormal checklist item
export async function uploadServiceReportPhoto(
  reportId: string,
  path: { sectionKey: string; groupKey: string; itemKey: string },
  file: File,
): Promise<ServiceReport> {
  const dataBase64 = await fileToBase64(file);
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${reportId}/photos`, {
    method: "POST",
    body: JSON.stringify({ ...path, fileName: file.name, contentType: file.type, dataBase64 }),
  });
  return serviceReport;
}

// ลบรูปภาพประกอบรายการตรวจเช็ค
// Deletes a checklist item photo
export async function deleteServiceReportPhoto(reportId: string, photoId: string): Promise<ServiceReport> {
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${reportId}/photos/${photoId}`, {
    method: "DELETE",
  });
  return serviceReport;
}

// บันทึกการพิมพ์รายงานบริการที่เซิร์ฟเวอร์ (audit log) ก่อนเปิดหน้าต่างพิมพ์ของเบราว์เซอร์
// Logs the print on the server (audit trail) before the caller opens the browser print dialog
export async function printServiceReport(reportId: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/service-reports/${reportId}/print`, { method: "POST" });
}
