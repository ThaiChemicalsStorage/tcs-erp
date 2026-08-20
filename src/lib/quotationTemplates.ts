import { apiFetch } from "./apiClient.js";

export type TemplateItemType = "item" | "subItem" | "specification";

export interface TemplateItem {
  id: string;
  itemType: TemplateItemType;
  itemCode: string;
  name: string;
  description: string;
  quantity: number | null;
  unit: string;
  subDetails: string[];
  productId?: string;
  productSnapshot?: { code: string; name: string; unit: string; defaultPrice: number };
  sortOrder: number;
}

export interface TemplateSection {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  items: TemplateItem[];
}

export interface TemplateTermLine {
  type: "paymentTerm" | "warrantyTerm" | "taxNote";
  text: string;
}

export type TemplateSourceType = "excel_import" | "manual";

export interface QuotationTemplate {
  id: string;
  templateCode: string;
  templateName: string;
  jobTypeCode: string;
  jobTypeName: string;
  description: string;
  version: string;
  sourceType: TemplateSourceType;
  sourceFileName: string;
  sourceSheetName: string;
  sourceHash: string;
  sourceWorkbookHash?: string;
  sections: TemplateSection[];
  defaultTerms: TemplateTermLine[];
  internalNotes: string[];
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface QuotationTemplateSummary {
  id: string;
  templateCode: string;
  templateName: string;
  jobTypeCode: string;
  jobTypeName: string;
  description: string;
  version: string;
  sourceType: TemplateSourceType;
  sourceFileName: string;
  sourceSheetName: string;
  sectionCount: number;
  itemCount: number;
  isActive: boolean;
  isDeleted: boolean;
  updatedAt: string;
  updatedBy: string;
}

export interface TemplateImportReport {
  created: string[];
  updated: string[];
  skipped: string[];
  warnings: string[];
  unrecognizedRows: string[];
  internalNotesDetected: number;
}

export interface TemplateContentDraft {
  templateCode: string;
  templateName: string;
  jobTypeCode: string;
  jobTypeName: string;
  description: string;
  version: string;
  sections: TemplateSection[];
  defaultTerms: TemplateTermLine[];
  internalNotes: string[];
  isActive: boolean;
}

// ดึงรายการสรุป Template ใบเสนอราคา กรองตามประเภทงาน/สถานะเก็บถาวรได้
// Fetches a summarized list of quotation templates, optionally filtered by job type / archived state
export async function fetchQuotationTemplates(opts?: { jobTypeCode?: string; includeArchived?: boolean }): Promise<QuotationTemplateSummary[]> {
  const params = new URLSearchParams();
  if (opts?.jobTypeCode) params.set("jobTypeCode", opts.jobTypeCode);
  if (opts?.includeArchived) params.set("includeArchived", "true");
  const qs = params.toString();
  const res = await apiFetch<{ templates: QuotationTemplateSummary[] }>(`/quotation-templates${qs ? `?${qs}` : ""}`);
  return res.templates;
}

// ดึงข้อมูลเต็มของ Template ใบเสนอราคารายการเดียวตาม id
// Fetches the full content of a single quotation template by id
export async function fetchQuotationTemplate(id: string): Promise<QuotationTemplate> {
  const res = await apiFetch<{ template: QuotationTemplate }>(`/quotation-templates/${encodeURIComponent(id)}`);
  return res.template;
}

// นำเข้า Template จากไฟล์ Excel ต้นทาง
// Imports quotation templates from the source Excel workbook
export async function importQuotationTemplates(): Promise<TemplateImportReport> {
  return apiFetch<TemplateImportReport>("/quotation-templates/import", { method: "POST" });
}

// เปิด/ปิดใช้งาน Template ใบเสนอราคา
// Activates or deactivates a quotation template
export async function setQuotationTemplateActive(id: string, isActive: boolean): Promise<QuotationTemplateSummary> {
  const res = await apiFetch<{ template: QuotationTemplateSummary }>(`/quotation-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  return res.template;
}

// เก็บถาวร/กู้คืน Template ใบเสนอราคา (soft-delete)
// Archives or restores a quotation template (soft-delete)
export async function setQuotationTemplateArchived(id: string, isDeleted: boolean): Promise<QuotationTemplateSummary> {
  const res = await apiFetch<{ template: QuotationTemplateSummary }>(`/quotation-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ isDeleted }),
  });
  return res.template;
}

// สร้าง Template ใบเสนอราคาใหม่
// Creates a new quotation template
export async function createQuotationTemplate(draft: TemplateContentDraft): Promise<QuotationTemplate> {
  const res = await apiFetch<{ template: QuotationTemplate }>("/quotation-templates", {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return res.template;
}

// แก้ไขเนื้อหาทั้งหมดของ Template ใบเสนอราคาที่มีอยู่
// Updates the full content of an existing quotation template
export async function updateQuotationTemplate(id: string, draft: TemplateContentDraft): Promise<QuotationTemplate> {
  const res = await apiFetch<{ template: QuotationTemplate }>(`/quotation-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(draft),
  });
  return res.template;
}

// ทำสำเนา Template ใบเสนอราคาด้วยรหัสใหม่ (จะไม่เปิดใช้งานทันที)
// Duplicates a quotation template under a new code (created inactive)
export async function duplicateQuotationTemplate(id: string, newTemplateCode: string): Promise<QuotationTemplate> {
  const res = await apiFetch<{ template: QuotationTemplate }>(`/quotation-templates/${encodeURIComponent(id)}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ newTemplateCode }),
  });
  return res.template;
}
