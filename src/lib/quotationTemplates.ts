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

/**
 * Generic dynamic-field schema (added 2026-07-20, FRP Lining template pass) — lets a template item
 * declare structured, conditional inputs (dropdown/radio/checkbox-group/text/number) instead of
 * only the free-text `specifications`/`subDetails`/`editableParameters` above. Reusable by any
 * future template, not tied to FRP Lining: `Quote.lines[].dynamicFields` (src/lib/quotes.tsx) holds
 * the live, per-quotation editable copy; `Quote.templateSnapshot.sections[].items[].dynamicFields`
 * (frozen at creation) is the schema that copy is rendered/validated against. See
 * src/lib/templateDynamicFields.ts for the shared visibility/formatting/Included-Excluded logic and
 * docs/MODULES/QuotationTemplates.md "Dynamic Fields" for the full writeup.
 */
export type TemplateFieldType = "dropdown" | "radio" | "checkboxGroup" | "text" | "number";

export interface TemplateFieldOption {
  key: string;
  label: string;
  /** checkboxGroup only — this option's checked state in a freshly-applied quotation. */
  defaultChecked?: boolean;
  /** dropdown/radio only — when this option is the field's current selected value, the field's own
   * "{label}: {value}" customer-facing display line is omitted entirely (not printed at all, not
   * even as e.g. "Concrete Surface Repair: No") instead of the normal "Label: value" text. For an
   * option whose selection means "not applicable" / "nothing to add" rather than real informational
   * content. Generic: any current or future dropdown/radio option can opt into this — not specific
   * to FRP Lining's Concrete Surface Repair "No", which is just its first user. See
   * `formatFieldDisplay()` in src/lib/templateDynamicFields.ts. */
  omitFromCustomerDisplay?: boolean;
}

/** Gates a field's visibility on another field on the SAME item — `equalsAny` matches a
 * dropdown/radio field's current `value`, or (when the controlling field is a checkboxGroup) any
 * one of its currently checked option keys. */
export interface TemplateFieldVisibilityRule {
  fieldKey: string;
  equalsAny: string[];
}

export interface TemplateDynamicField {
  key: string;
  label: string;
  type: TemplateFieldType;
  /** dropdown/radio/checkboxGroup only. */
  options?: TemplateFieldOption[];
  /** text/number only — appended after the value in customer-facing output, e.g. "mm". */
  unitSuffix?: string;
  /** text only — an editing-UI hint/example (e.g. suggested resin brand names), never a
   * restrictive allowlist and never auto-inserted as a value. */
  placeholder?: string;
  visibleWhen?: TemplateFieldVisibilityRule;
  /** checkboxGroup only — when true, customer-facing output renders an auto-generated
   * "Included .../Excluded ..." pair (fixed option order) instead of raw checkboxes. Another
   * dropdown/text field on the same item whose `visibleWhen` targets one of this field's checked
   * options is appended inline after that option in the Included line (e.g. "Confined Space
   * Certificate — 2 Roles") — a generic mechanism, not specific to any one option. */
  generateIncludedExcluded?: boolean;
  sortOrder: number;
}

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
  /** A one-time copy of the linked product's catalog fields, taken at the moment it was added to
   * this template item (Template Management "Select Existing Product") — informational context for
   * whoever edits the template later, never a live reference. `name`/`unit`/`specifications` above
   * are the actual editable copy the template carries; this is purely provenance metadata (e.g. "this
   * item started from Product ABC-123, catalog price ฿500"). Never read by
   * `applyTemplateToQuoteDraft()` — templates never carry a price, matching the "no prices unless
   * the source explicitly gave one" rule; `unitPrice` on the resulting quote line is always 0
   * regardless of what a linked product's catalog price was. */
  productSnapshot?: { code: string; name: string; unit: string; defaultPrice: number };
  visibleToCustomer: boolean;
  sortOrder: number;
  /** Structured dynamic fields carried by this item (dropdown/radio/checkboxGroup/text/number) —
   * see `TemplateDynamicField` above. Optional/absent on every item created before this existed. */
  dynamicFields?: TemplateDynamicField[];
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

/** "excel_import" — created/updated by `POST /api/quotation-templates/import` from
 * `api/_lib/templateSeedData.ts`. "manual" — created via the Template Management "create" form, or
 * produced by duplicating any template (a duplicate can immediately diverge from its source, so it
 * stops being import-tracked the moment it's created). Drives the list page's imported/manual
 * filter — see docs/MODULES/QuotationTemplates.md "Template Management Module." */
export type TemplateSourceType = "excel_import" | "manual";

/** The "Condition" section's structured content (added 2026-07-20, FRP Lining template pass) —
 * VAT wording, Warranty/Delivery fill-in-the-blank phrasing, and selectable Payment presets.
 * Optional/absent on every template that predates this (they keep using plain `defaultTerms`
 * paymentTerm/warrantyTerm/taxNote lines instead, unaffected). `Quote.vatConditionText`/
 * `warrantyText`/`deliveryDays`/`paymentTerms` (src/lib/quotes.tsx) hold the per-quotation editable
 * copy seeded from this at apply time. */
export interface TemplateConditionConfig {
  /** e.g. "Vat 7%: The Above Price Included Vat 7%" — informational wording only, never used to
   * compute VAT (see `computeTotals()`/`VAT_RATE` in src/lib/quotes.tsx, unaffected). */
  vatConditionText: string;
  /** Fixed suffix phrase after the editable Warranty value, e.g. "After Job Completed." */
  warrantyUnit: string;
  /** Fixed suffix phrase after the editable Delivery day count, e.g. "Days After Received P/O" */
  deliveryUnit: string;
  /** Selectable starting text for the Payment field — the salesperson picks one, then may freely
   * edit the result (stored as the ordinary `Quote.paymentTerms` string, same field every other
   * template's payment terms already use). */
  paymentPresets: string[];
}

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
  /** SHA-256 fingerprint of the real source workbook's matching sheet, computed at import time by
   * `api/_lib/templateWorkbookParser.ts` (added 2026-07-15, second Codex-review fix pass) — changes
   * if the workbook file itself changes, independent of `sourceHash` (which only reflects the
   * hand-transcribed seed content). Absent on manually-created templates and on any template
   * created before this field existed. See docs/MODULES/QuotationTemplates.md "Real Workbook
   * Change Detection." */
  sourceWorkbookHash?: string;
  sections: TemplateSection[];
  defaultTerms: TemplateTermLine[];
  /** Internal-only notes captured at the template level (not tied to one specific item) — e.g. a
   * general staff reminder found near the top/bottom of a sheet. Never customer-visible. */
  internalNotes: string[];
  /** Customer-visible starting "หมายเหตุ" (Notes) rows, added 2026-07-20 — copied into
   * `Quote.notes` at apply time, where the salesperson may freely add/edit/remove/reorder them.
   * Optional/absent on every template created before this existed (falls back to `[]`). */
  defaultNotes?: string[];
  /** See `TemplateConditionConfig` above. Optional/absent on every template that predates it. */
  conditions?: TemplateConditionConfig;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/** Compact shape for list views (Step 2 template picker, Global Search, Template Management list) — omits full section/item content. */
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

/** The subset of `QuotationTemplate` a Template Management create/edit form actually submits — the
 * rest (`id`/`sourceHash`/`isDeleted`/`createdAt`/`updatedAt`/`createdBy`/`updatedBy`) is always
 * server-derived, matching the same "client describes content, server owns provenance" split
 * already established for `Quote.quotationTemplateName`/`quotationTemplateVersion`. `sourceType` is
 * also server-derived (never client-writable): a manually created template is always "manual"; an
 * excel-imported one only ever changes via the import route. */
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
  defaultNotes?: string[];
  conditions?: TemplateConditionConfig;
  isActive: boolean;
}

/** `includeArchived` only has an effect for a caller with template-management view access — the
 * server silently ignores it for a plain Sales browse-for-a-quotation request (see
 * `handleList` in api/_lib/quotationTemplatesHandler.ts), so it's always safe to pass. */
export async function fetchQuotationTemplates(opts?: { jobTypeCode?: string; includeArchived?: boolean }): Promise<QuotationTemplateSummary[]> {
  const params = new URLSearchParams();
  if (opts?.jobTypeCode) params.set("jobTypeCode", opts.jobTypeCode);
  if (opts?.includeArchived) params.set("includeArchived", "true");
  const qs = params.toString();
  const res = await apiFetch<{ templates: QuotationTemplateSummary[] }>(`/quotation-templates${qs ? `?${qs}` : ""}`);
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

/** "Archive" — sets `isDeleted: true` (soft-delete), the same convention Customers already uses.
 * `setQuotationTemplateArchived(id, false)` un-archives (restores) a previously archived template. */
export async function setQuotationTemplateArchived(id: string, isDeleted: boolean): Promise<QuotationTemplateSummary> {
  const res = await apiFetch<{ template: QuotationTemplateSummary }>(`/quotation-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ isDeleted }),
  });
  return res.template;
}

export async function createQuotationTemplate(draft: TemplateContentDraft): Promise<QuotationTemplate> {
  const res = await apiFetch<{ template: QuotationTemplate }>("/quotation-templates", {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return res.template;
}

/** Full content update — templateCode/jobTypeCode changes are allowed (an admin correcting a typo
 * or reclassifying a manual template), unlike `Quote.quotationTemplateId` which is frozen forever
 * once a quotation references it. Existing quotations already hold their own frozen snapshot
 * (`quotationTemplateName`/`quotationTemplateVersion`), so editing the master template — even its
 * code/name — can never retroactively change a quotation created from it. */
export async function updateQuotationTemplate(id: string, draft: TemplateContentDraft): Promise<QuotationTemplate> {
  const res = await apiFetch<{ template: QuotationTemplate }>(`/quotation-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(draft),
  });
  return res.template;
}

/** Duplicates a template's full content under a new `templateCode`, always inactive
 * (Draft/Inactive until the admin reviews and activates it) — see docs/MODULES/QuotationTemplates.md
 * "Duplicate." The server generates fresh section/item ids and appends " (Copy)" to the name. */
export async function duplicateQuotationTemplate(id: string, newTemplateCode: string): Promise<QuotationTemplate> {
  const res = await apiFetch<{ template: QuotationTemplate }>(`/quotation-templates/${id}/duplicate`, {
    method: "POST",
    body: JSON.stringify({ newTemplateCode }),
  });
  return res.template;
}
