import { newLineId, newSubDetailId, type QuoteLine } from "../../lib/quotes";
import type { QuotationTemplate, TemplateTermLine } from "../../lib/quotationTemplates";
import { buildDefaultDynamicFieldValues } from "../../lib/templateDynamicFields";

/** Result of copying a Quotation Template into a new quotation draft — see
 * `docs/MODULES/QuotationTemplates.md` "Template Snapshot in Quotation." Deliberately lives here
 * (not in `src/lib/quotationTemplates.ts`) since it value-imports from `src/lib/quotes.tsx`, which
 * has module-scope JSX and must never be value-imported into anything the API bundle could
 * transitively reach — see the doc comment at the top of `quotationTemplates.ts`. */
export interface AppliedTemplateDraft {
  lines: QuoteLine[];
  paymentTerms: string;
  remarks: string;
  /** Added 2026-07-20 — see `Quote.notes`/`vatConditionText`/`warrantyText`/`deliveryDays`. */
  notes: string[];
  vatConditionText: string;
  warrantyText: string;
  deliveryDays: number | null;
}

function termsByType(terms: TemplateTermLine[], type: TemplateTermLine["type"]): string[] {
  return terms.filter((t) => t.type === type).map((t) => t.text);
}

/**
 * Converts a full `QuotationTemplate` (fetched via `GET /api/quotation-templates/:id`) into a
 * `QuoteLine[]` + `paymentTerms`/`remarks` starting point for a new quotation — a one-time copy,
 * never a live reference. Every id is freshly generated (`newLineId()`/`newSubDetailId()`), so the
 * resulting lines are completely independent of the template the moment this function returns:
 * editing them afterward can never write back to the master template record.
 *
 * - A section becomes one `isSectionHeader: true` line (a non-priced divider — see
 *   `LineItemsEditor.tsx`/`PrintDocument.tsx`).
 * - An item/subItem becomes one ordinary `QuoteLine`: `description`/`unit`/`qty` copied directly
 *   (quantity `null` → `0`, an editable starting point, never invented), `unitPrice`/`discount`
 *   always `0` (this codebase never invents prices), `specifications` joined into the line's
 *   specifications text, and `item.subDetails` **plus** every editable parameter folded into
 *   `subDetails` as individual, freely editable rows (matching how `subDetails` already works for
 *   any other line). **2026-07-15, second Codex-review fix pass (High Priority #3)**: `item.
 *   subDetails` — real sub-detail text an admin configured in the Template Management editor — was
 *   previously silently discarded here; only editable-parameter prompts were copied. Fixed: both
 *   are now included, `item.subDetails` first (so an admin's own configured detail lines read
 *   before the generic fill-in-the-blank prompts).
 * - **An item with `visibleToCustomer: false` is skipped entirely** (same pass, same finding) —
 *   previously every item was copied unconditionally regardless of this flag, so marking an item
 *   "hidden from customer documents" in the editor had no actual effect on an applied quotation. A
 *   section whose every item ends up hidden still gets its header line here; `PrintDocument.tsx`
 *   already silently omits a section header with no items following it, so this doesn't need
 *   special-casing here too.
 * - An editable parameter renders as `"Label: ______ Unit"` — a clear fill-in-the-blank prompt,
 *   never a real value (`editableParameter.value` is always blank in the source template anyway).
 * - **Internal notes are never copied** — `item.internalNotes`/`template.internalNotes` are
 *   dropped entirely here, by design, so they can never reach a customer-facing quotation or its
 *   PDF. See "Internal Notes vs Customer-Facing Content" in docs/MODULES/QuotationTemplates.md.
 * - `defaultTerms` become `paymentTerms` (payment-term lines only, newline-joined into `Quote`'s
 *   single `paymentTerms` text field) and `remarks` (warranty + tax-note lines, since `Quote` has
 *   no dedicated warranty/tax field — `remarks` is the closest existing free-text field for
 *   customer-facing terms that aren't strictly payment schedule).
 */
export function applyTemplateToQuoteDraft(template: QuotationTemplate): AppliedTemplateDraft {
  const lines: QuoteLine[] = [];

  for (const section of template.sections) {
    lines.push({
      id: newLineId(), description: section.title, unit: "", qty: 0, unitPrice: 0, discount: 0,
      notes: "", specifications: "", tags: [], subDetails: [], isSectionHeader: true,
    });

    for (const item of section.items) {
      if (!item.visibleToCustomer) continue;
      const subDetails = [
        ...item.subDetails.map((text) => ({ id: newSubDetailId(), text })),
        ...item.editableParameters.map((p) => ({
          id: newSubDetailId(),
          text: `${p.label}: ______${p.unit ? ` ${p.unit}` : ""}`,
        })),
      ];
      const dynamicFieldSchema = item.dynamicFields ?? [];
      lines.push({
        id: newLineId(),
        description: item.name,
        unit: item.unit,
        qty: item.quantity ?? 0,
        unitPrice: 0,
        discount: 0,
        notes: "",
        specifications: item.specifications.join("\n"),
        tags: [],
        subDetails,
        isSectionHeader: false,
        ...(dynamicFieldSchema.length
          ? { sourceTemplateItemId: item.id, dynamicFields: buildDefaultDynamicFieldValues(dynamicFieldSchema) }
          : {}),
      });
    }
  }

  // A template using the newer `conditions` (Payment presets) leaves `paymentTerms` blank so the
  // salesperson must actively choose one — auto-selecting the first preset would read as a fake
  // default. Templates without `conditions` keep the older `defaultTerms` paymentTerm behavior.
  const paymentTerms = template.conditions?.paymentPresets.length
    ? ""
    : termsByType(template.defaultTerms, "paymentTerm").join("\n");
  // `conditions.warrantyText`/`warrantyUnit` (see below) is the PRIMARY warranty surface for a
  // template that defines `conditions` — FRP Lining, the only template using it today, deliberately
  // keeps `defaultTerms` empty for exactly this reason (see templateSeedData.ts). Legacy
  // `defaultTerms` `warrantyTerm`/`taxNote` lines are still folded into `remarks` unconditionally
  // (not gated on `conditions` being absent) — for every template that follows FRP Lining's own
  // convention this is a no-op (empty array in, empty string out), but it means a future template
  // that combines BOTH `conditions` and non-empty legacy `defaultTerms` warranty lines (nothing in
  // the admin editor prevents that — the two are independent, unrelated form controls) never
  // silently loses that content instead of just showing it twice across two sections.
  const remarks = [...termsByType(template.defaultTerms, "warrantyTerm"), ...termsByType(template.defaultTerms, "taxNote")].join("\n");
  const notes = [...(template.defaultNotes ?? [])];
  const vatConditionText = template.conditions?.vatConditionText ?? "";
  // Warranty/Delivery values always start blank (see TemplateConditionConfig) — never invented.
  const warrantyText = "";
  const deliveryDays = null;

  return { lines, paymentTerms, remarks, notes, vatConditionText, warrantyText, deliveryDays };
}
