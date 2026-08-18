import { apiFetch } from "./apiClient.js";
import type { ServiceChecklistSectionDef } from "./serviceTemplates.js";
import { compressImageFile, isCompressibleImage } from "./imageCompression.js";

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

export type ServiceReportCustomerApprovalStatus = "pending" | "approved" | "rejected";

/** Remote customer approval (added 2026-08-10) — created by "ส่งให้ลูกค้าอนุมัติ", answered by the
 * customer through a time-boxed capability link (opened directly or from the LINE OA push).
 * The link token itself is never stored or echoed — the server keeps only its SHA-256 hash. */
export interface ServiceReportCustomerApproval {
  status: ServiceReportCustomerApprovalStatus;
  sentAt: string;
  sentBy: string;
  sentByName: string;
  expiresAt: string;
  sentViaLine: boolean;
  respondedAt: string | null;
  rejectReason: string;
  signedName: string;
}

export interface ServiceReport {
  id: string; // human doc number IS the id, e.g. "SR-2569-0001"
  customerId: string; // "" if unlinked (manually entered, same convention as Quote.customerId)
  customerSnapshot: ServiceReportCustomerSnapshot;

  serviceLocation: string;
  projectOrJobCode: string;
  serviceSystemName: string; // free text — the specific installed system, finer-grained than templateCode
  serviceType: string; // free text in Phase 1 (e.g. "PM", "Breakdown")

  // Empty when created without a template (2026-08-14) — the report then starts from a single
  // empty "general" section built entirely per-report via the structure-editing controls.
  templateId: string;
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

  // Remote approval state (2026-08-10) — null until "ส่งให้ลูกค้าอนุมัติ" is first pressed.
  customerApproval: ServiceReportCustomerApproval | null;

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
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${encodeURIComponent(id)}`);
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
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return serviceReport;
}

// เปลี่ยนสถานะรายงานบริการ (เสร็จสิ้น / เปิดใหม่ / ยกเลิก)
// Changes a Service Report's status (complete / reopen / cancel)
export async function changeServiceReportStatus(id: string, action: ServiceReportStatusAction): Promise<ServiceReport> {
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  return serviceReport;
}

// ลบ (soft delete) รายงานบริการ
// Soft-deletes a Service Report
export async function deleteServiceReport(id: string): Promise<void> {
  await apiFetch<void>(`/service-reports/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// อ่านไฟล์เป็น base64 (ตัดส่วนหัว data URL ออก)
// Reads a File as base64 (data-URL prefix stripped)
function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// อัปโหลดรูปภาพประกอบรายการตรวจเช็คที่ผิดปกติ — บีบอัดเป็น WebP ก่อนแปลงเป็น base64 เสมอ
// (ช่องอัปโหลดนี้กำหนด accept="image/*" ไว้แล้ว จึงไม่ต้องแยกสาขาไฟล์ที่ไม่ใช่รูปภาพ)
// Uploads a photo attached to an Abnormal checklist item — always compresses to WebP before
// base64-encoding (the underlying <input> is accept="image/*"-only, so no non-image branch needed).
export async function uploadServiceReportPhoto(
  reportId: string,
  path: { sectionKey: string; groupKey: string; itemKey: string },
  file: File,
): Promise<ServiceReport> {
  const isImage = isCompressibleImage(file);
  const { blob, fileName, contentType } = isImage
    ? { blob: (await compressImageFile(file)).blob, fileName: file.name, contentType: "image/webp" }
    : { blob: file, fileName: file.name, contentType: file.type };
  const dataBase64 = await fileToBase64(blob);
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${encodeURIComponent(reportId)}/photos`, {
    method: "POST",
    body: JSON.stringify({ ...path, fileName, contentType, dataBase64 }),
  });
  return serviceReport;
}

// ลบรูปภาพประกอบรายการตรวจเช็ค
// Deletes a checklist item photo
export async function deleteServiceReportPhoto(reportId: string, photoId: string): Promise<ServiceReport> {
  const { serviceReport } = await apiFetch<{ serviceReport: ServiceReport }>(`/service-reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(photoId)}`, {
    method: "DELETE",
  });
  return serviceReport;
}

// บันทึกการพิมพ์รายงานบริการที่เซิร์ฟเวอร์ (audit log) ก่อนเปิดหน้าต่างพิมพ์ของเบราว์เซอร์
// Logs the print on the server (audit trail) before the caller opens the browser print dialog
export async function printServiceReport(reportId: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/service-reports/${encodeURIComponent(reportId)}/print`, { method: "POST" });
}

// ─── Customer approval via time-boxed link / LINE OA (added 2026-08-10) ────────────────────────

// สร้างลิงก์อนุมัติอายุ 7 วัน แล้วส่งเข้า LINE ของลูกค้าอัตโนมัติถ้าผูกบัญชีไว้แล้ว
// Creates the 7-day approval link; also pushes it to the customer's linked LINE, if any
export async function sendServiceReportCustomerApproval(id: string): Promise<{
  serviceReport: ServiceReport;
  approvalUrl: string;
  sentViaLine: boolean;
  lineError?: string;
}> {
  return apiFetch(`/service-reports/${encodeURIComponent(id)}/send-approval`, { method: "POST" });
}

/** The read-only subset the public approval page renders — everything a customer may see, nothing
 * more (no internal user ids; the engineer arrives pre-resolved as a display name). */
export interface CustomerApprovalReportView {
  id: string;
  customerSnapshot: ServiceReportCustomerSnapshot;
  serviceLocation: string;
  projectOrJobCode: string;
  serviceSystemName: string;
  serviceType: string;
  inspectionDate: string;
  reportDate: string;
  nextPmDate: string;
  engineerName: string;
  additionalInspectorNames: string[];
  onSiteContactName: string;
  onSiteContactPhone: string;
  overallCustomerSummary: string;
  overallRemark: string;
  templateSnapshot: ServiceReportTemplateSnapshot;
  checklist: ServiceChecklistSectionValue[];
  customerSignatureDataUrl: string;
  customerSignedName: string;
}

export interface CustomerApprovalPublicData {
  report: CustomerApprovalReportView;
  companyName: string;
  companyLogoDataUrl: string;
  approval: {
    status: ServiceReportCustomerApprovalStatus;
    expired: boolean;
    expiresAt: string;
    respondedAt: string | null;
    rejectReason: string;
    signedName: string;
  };
}

// โหลดข้อมูลสำหรับหน้าอนุมัติของลูกค้า (ไม่ต้องล็อกอิน — ใช้ key จากลิงก์)
// Loads the public approval page's data (no session — authorized by the link's key)
export async function fetchCustomerApprovalPublic(reportId: string, key: string): Promise<CustomerApprovalPublicData> {
  return apiFetch(`/service-reports/${encodeURIComponent(reportId)}/approval?key=${encodeURIComponent(key)}`);
}

// ส่งคำตอบของลูกค้า (อนุมัติต้องมีลายเซ็น / ไม่อนุมัติต้องมีเหตุผล)
// Submits the customer's decision (approve requires a signature; reject requires a reason)
export async function respondCustomerApprovalPublic(
  reportId: string,
  key: string,
  payload:
    | { decision: "approved"; signatureDataUrl: string; signedName: string }
    | { decision: "rejected"; rejectReason: string; signedName: string },
): Promise<CustomerApprovalPublicData> {
  return apiFetch(`/service-reports/${encodeURIComponent(reportId)}/approval/respond`, {
    method: "POST",
    body: JSON.stringify({ ...payload, key }),
  });
}
