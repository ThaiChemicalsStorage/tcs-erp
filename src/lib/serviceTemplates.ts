import { apiFetch } from "./apiClient.js";

// Service Checklist Template — master data for the "บริการ" (Service) module (added 2026-08-06,
// Phase 1). A template is a reusable checklist structure (sections -> groups -> items), seeded
// from the company's real paper Service Check Sheet reference files (see
// api/_lib/serviceTemplateSeedData.ts). A Service Report always starts from one template, whose
// structure is frozen onto the report as `ServiceReportTemplateSnapshot` at creation time — see
// src/lib/serviceReports.ts. Editing a template afterward never touches an already-created
// report's snapshot, and editing a report's checklist never touches the template.

export type ServiceChecklistItemKind = "normalAbnormal" | "measurement";

export interface ServiceChecklistItemDef {
  key: string; // stable within the template, e.g. "blower.vibration"
  label: string;
  kind: ServiceChecklistItemKind;
  unit?: string; // optional unit hint for a "measurement" item, e.g. "in.wg"
  sortOrder: number;
}

export interface ServiceChecklistGroupDef {
  key: string;
  title: string;
  items: ServiceChecklistItemDef[];
  sortOrder: number;
}

export interface ServiceChecklistSectionDef {
  key: string;
  title: string;
  // "(เพิ่มเติม)" add-on sections on the source checklist (e.g. Dust Collector, Chemicals
  // Feeding) — not every service visit involves every add-on system, so a report can opt a
  // section in/out (see ServiceChecklistSectionValue.included in src/lib/serviceReports.ts).
  isOptionalAddon: boolean;
  groups: ServiceChecklistGroupDef[];
  sortOrder: number;
}

export type ServiceTemplateSourceType = "seed" | "manual";

export interface ServiceTemplate {
  id: string;
  templateCode: string; // stable natural key, e.g. "SVC-AIRPOLLUTION-STD"
  templateName: string;
  description: string;
  version: string;
  sourceType: ServiceTemplateSourceType;
  sourceFileName: string;
  sourceSheetName: string;
  sourceHash: string; // idempotency gate for the seed upsert, see api/_lib/serviceTemplateSeedData.ts
  sections: ServiceChecklistSectionDef[];
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface ServiceTemplateSummary {
  id: string;
  templateCode: string;
  templateName: string;
  version: string;
  sectionCount: number;
  itemCount: number;
  isActive: boolean;
  isDeleted: boolean;
  updatedAt: string;
}

export interface ServiceTemplateDraft {
  templateName: string;
  description: string;
  sections: ServiceChecklistSectionDef[];
}

// ดึงรายการสรุป Template ตรวจเช็คทั้งหมด
// Fetches the summarized list of every checklist template
export async function fetchServiceTemplates(): Promise<ServiceTemplateSummary[]> {
  const { serviceTemplates } = await apiFetch<{ serviceTemplates: ServiceTemplateSummary[] }>("/service-templates");
  return serviceTemplates;
}

// ดึงข้อมูล Template ตรวจเช็คแบบเต็มตาม id
// Fetches a single checklist template's full content by id
export async function fetchServiceTemplate(id: string): Promise<ServiceTemplate> {
  const { serviceTemplate } = await apiFetch<{ serviceTemplate: ServiceTemplate }>(`/service-templates/${id}`);
  return serviceTemplate;
}

// สร้าง Template ตรวจเช็คใหม่
// Creates a new checklist template
export async function createServiceTemplate(draft: ServiceTemplateDraft): Promise<ServiceTemplate> {
  const { serviceTemplate } = await apiFetch<{ serviceTemplate: ServiceTemplate }>("/service-templates", {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return serviceTemplate;
}

// แก้ไข Template ตรวจเช็คที่มีอยู่
// Updates an existing checklist template
export async function updateServiceTemplate(id: string, fields: Partial<ServiceTemplateDraft>): Promise<ServiceTemplate> {
  const { serviceTemplate } = await apiFetch<{ serviceTemplate: ServiceTemplate }>(`/service-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return serviceTemplate;
}

// ทำสำเนา Template ตรวจเช็ค
// Duplicates a checklist template
export async function duplicateServiceTemplate(id: string, templateName: string): Promise<ServiceTemplate> {
  const { serviceTemplate } = await apiFetch<{ serviceTemplate: ServiceTemplate }>(`/service-templates/${id}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ templateName }),
  });
  return serviceTemplate;
}

// เก็บถาวร/กู้คืน Template ตรวจเช็ค
// Archives or restores a checklist template
export async function setServiceTemplateArchived(id: string, isDeleted: boolean): Promise<ServiceTemplate> {
  const { serviceTemplate } = await apiFetch<{ serviceTemplate: ServiceTemplate }>(`/service-templates/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({ isDeleted }),
  });
  return serviceTemplate;
}

// เปิด/ปิดใช้งาน Template ตรวจเช็ค
// Activates or deactivates a checklist template
export async function setServiceTemplateActive(id: string, isActive: boolean): Promise<ServiceTemplate> {
  const { serviceTemplate } = await apiFetch<{ serviceTemplate: ServiceTemplate }>(`/service-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  return serviceTemplate;
}
