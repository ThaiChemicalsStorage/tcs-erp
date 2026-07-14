import { apiFetch } from "./apiClient.js";

/**
 * Quotation Templates (added 2026-07-14) — reusable Job-Type-specific starting structures for a
 * new quotation, imported from the real "Scope of work new template for air pollution control"
 * Excel workbook (`public/Scope of work new template for air pollution control_Technic.xlsx`).
 * See docs/MODULES/QuotationTemplates.md for the full Job Type → template mapping, the Excel
 * parsing/classification rules applied, and the FRP Tank/FRP Lining split.
 *
 * A template is master reference data (`quotation_templates` collection) — never a completed
 * quotation. Prices are always blank (`0`/empty) unless the source workbook explicitly gave one;
 * this codebase never invents pricing. Applying a template COPIES its sections/items into a new
 * `Quote.lines` array (see `src/lib/quotes.tsx`) as an independent snapshot — editing the resulting
 * quotation never modifies the master template, and editing the master template later never
 * changes quotations already created from it (see `QuoteDraftFields`'s `quotationTemplateId`/
 * `quotationTemplateName`/`quotationTemplateVersion` fields).
 *
 * **This file is type-imported into the API bundle** (`api/_lib/collections.ts`,
 * `api/_lib/quotationTemplatesHandler.ts` both do `import type { ... } from
 * "src/lib/quotationTemplates.js"`) — per the standing rule in docs/CLAUDE.md, never add a
 * *value* import here that transitively pulls in JSX/React (e.g. don't import
 * `newLineId`/anything else from `src/lib/quotes.tsx`, which has module-scope JSX in
 * `statusIcon` that would execute on import and break every authenticated API route, the same
 * class of incident documented in CLAUDE.md's 2026-07-09 postmortem). The template→`QuoteLine[]`
 * conversion (`applyTemplateToQuoteDraft()`) deliberately lives in
 * `src/pages/quotation/applyTemplate.ts` instead — a page-scoped file api/ has no reason to ever
 * reference, even by type — precisely to keep this file safe to type-import.
 */

/** A single editable placeholder extracted from the source workbook (e.g. "Capacity: xxxxxx CMH")
 * — never a final value. `value` is always blank at template-definition time; the Sales user fills
 * in the real project value after the template is applied to a quotation. */
export interface TemplateEditableParameter {
  label: string;
  value: string;
  unit: string;
  editable: true;
}

export type TemplateItemType = "item" | "subItem" | "specification";

export interface TemplateItem {
  id: string;
  itemType: TemplateItemType;
  /** Optional stable code for a future exact-match lookup (e.g. "1", "1.1") — display order is
   * always driven by array order, never by re-parsing this code, since the source workbook's own
   * numbering has real inconsistencies (duplicate section numbers, etc.) that array order already
   * sidesteps cleanly. */
  itemCode: string;
  name: string;
  description: string;
  quantity: number | null;
  unit: string;
  /** Plain specification/description lines with concrete (non-placeholder) values — shown to the customer. */
  specifications: string[];
  /** Free-text sub-detail lines (matches `QuoteLine.subDetails`' shape once copied into a quotation). */
  subDetails: string[];
  editableParameters: TemplateEditableParameter[];
  /** Internal review comments / staff-only process notes found in the source row — never copied
   * into a quotation's customer-facing content or printed. See docs/MODULES/QuotationTemplates.md
   * "Internal vs. customer-facing content." */
  internalNotes: string[];
  /** Optionally links to an existing Product Master record — set only when a real match exists;
   * never used to auto-create new Product Master records from template rows. */
  productId?: string;
  visibleToCustomer: boolean;
  sortOrder: number;
}

export interface TemplateSection {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  items: TemplateItem[];
}

/** A single payment-term / warranty / tax line — kept as parallel-Thai-only free text, matching
 * how `Quote.paymentTerms`/`Quote.remarks` are themselves plain Thai strings today (see
 * `src/lib/quotes.tsx`). */
export interface TemplateTermLine {
  type: "paymentTerm" | "warrantyTerm" | "taxNote";
  text: string;
}

export interface QuotationTemplate {
  id: string;
  templateCode: string;
  templateName: string;
  jobTypeCode: string;
  jobTypeName: string;
  description: string;
  version: string;
  sourceFileName: string;
  sourceSheetName: string;
  sourceHash: string;
  sections: TemplateSection[];
  defaultTerms: TemplateTermLine[];
  /** Internal-only notes captured at the template level (not tied to one specific item) — e.g. a
   * general staff reminder found near the top/bottom of a sheet. Never customer-visible. */
  internalNotes: string[];
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Compact shape for list views (Step 2 template picker, Global Search) — omits full section/item content. */
export interface QuotationTemplateSummary {
  id: string;
  templateCode: string;
  templateName: string;
  jobTypeCode: string;
  jobTypeName: string;
  description: string;
  version: string;
  sourceFileName: string;
  sourceSheetName: string;
  sectionCount: number;
  itemCount: number;
  isActive: boolean;
}

export interface TemplateImportReport {
  created: string[];
  updated: string[];
  skipped: string[];
  warnings: string[];
  unrecognizedRows: string[];
  internalNotesDetected: number;
}

export async function fetchQuotationTemplates(jobTypeCode?: string): Promise<QuotationTemplateSummary[]> {
  const qs = jobTypeCode ? `?jobTypeCode=${encodeURIComponent(jobTypeCode)}` : "";
  const res = await apiFetch<{ templates: QuotationTemplateSummary[] }>(`/quotation-templates${qs}`);
  return res.templates;
}

export async function fetchQuotationTemplate(id: string): Promise<QuotationTemplate> {
  const res = await apiFetch<{ template: QuotationTemplate }>(`/quotation-templates/${id}`);
  return res.template;
}

export async function importQuotationTemplates(): Promise<TemplateImportReport> {
  return apiFetch<TemplateImportReport>("/quotation-templates/import", { method: "POST" });
}

export async function setQuotationTemplateActive(id: string, isActive: boolean): Promise<QuotationTemplateSummary> {
  const res = await apiFetch<{ template: QuotationTemplateSummary }>(`/quotation-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  });
  return res.template;
}
