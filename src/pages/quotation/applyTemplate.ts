import { newLineId, newSubDetailId, type QuoteLine } from "../../lib/quotes";
import type { QuotationTemplate, TemplateItem, TemplateTermLine } from "../../lib/quotationTemplates";

/** Result of copying a Quotation Template into a new quotation draft — see
 * `docs/MODULES/QuotationTemplates.md` "Template Snapshot in Quotation." Deliberately lives here
 * (not in `src/lib/quotationTemplates.ts`) since it value-imports from `src/lib/quotes.tsx`, which
 * has module-scope JSX and must never be value-imported into anything the API bundle could
 * transitively reach — see the doc comment at the top of `quotationTemplates.ts`. */
export interface AppliedTemplateDraft {
  lines: QuoteLine[];
  paymentTerms: string;
  remarks: string;
}

function termsByType(terms: TemplateTermLine[], type: TemplateTermLine["type"]): string[] {
  return terms.filter((t) => t.type === type).map((t) => t.text);
}

/** `specifications`/`editableParameters`/`visibleToCustomer` were removed from `TemplateItem`
 * entirely 2026-07-21 (unused UI, direct user request — see CHANGELOG.md); `specifications` content
 * is meant to already be folded into `subDetails` by then (see `TemplateEditorView.tsx`'s load-time
 * migration, and `templateSeedData.ts`'s `makeItem()` for freshly-imported templates). This reads a
 * raw, no-longer-typed `specifications` array defensively, purely as a one-time safety net for any
 * template document that reaches this function (e.g. applied directly via the wizard) before ever
 * being re-opened/re-saved in the editor — so real, already-configured spec text (e.g. "Material:
 * Steel") can never silently vanish from an applied quotation just because of this removal. */
function legacySpecifications(item: TemplateItem): string[] {
  const raw = (item as unknown as { specifications?: unknown }).specifications;
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
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
 *   always `0` (this codebase never invents prices), and `item.subDetails` copied directly as
 *   individual, freely editable pinned rows (matching how `subDetails` already works for any other
 *   line) — plus, defensively, any raw legacy `specifications` content the item might still carry
 *   (see `legacySpecifications()` above). **2026-07-21**: `item.specifications`/
 *   `.editableParameters`/`.visibleToCustomer` were removed from `TemplateItem` entirely (unused
 *   UI, direct user request — see CHANGELOG.md); every item is now always included (no more
 *   hide-from-customer gate) and the editable-parameter fill-in-the-blank prompts are gone. Real
 *   specifications content (e.g. "Material: Steel") keeps reaching the applied quotation via
 *   `subDetails` regardless — either already migrated there by the time this runs, or picked up by
 *   the defensive fallback. **2026-07-15, second Codex-review fix pass (High Priority #3)**:
 *   `item.subDetails` — real sub-detail text an admin configured in the Template Management editor
 *   — was previously silently discarded here; only editable-parameter prompts were copied. Fixed.
 * - **Internal notes are never copied** — `template.internalNotes` (template-level; the per-item
 *   equivalent was removed 2026-07-21, see above) is dropped entirely here, by design, so it can
 *   never reach a customer-facing quotation or its PDF. See "Internal Notes vs Customer-Facing
 *   Content" in docs/MODULES/QuotationTemplates.md.
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
      tags: [], subDetails: [], isSectionHeader: true,
    });

    for (const item of section.items) {
      const subDetails = [
        ...legacySpecifications(item).map((text) => ({ id: newSubDetailId(), text })),
        ...item.subDetails.map((text) => ({ id: newSubDetailId(), text })),
      ];
      lines.push({
        id: newLineId(),
        description: item.name,
        unit: item.unit,
        qty: item.quantity ?? 0,
        unitPrice: 0,
        discount: 0,
        tags: [],
        subDetails,
        isSectionHeader: false,
      });
    }
  }

  const paymentTerms = termsByType(template.defaultTerms, "paymentTerm").join("\n");
  const remarks = [...termsByType(template.defaultTerms, "warrantyTerm"), ...termsByType(template.defaultTerms, "taxNote")].join("\n");

  return { lines, paymentTerms, remarks };
}
