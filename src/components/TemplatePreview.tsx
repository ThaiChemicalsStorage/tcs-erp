import { Layers, ChevronRight } from "lucide-react";
import type { QuotationTemplate, TemplateDynamicField } from "../lib/quotationTemplates";
import { useI18n } from "../lib/i18n";

/** Static, definition-level rendering of one dynamic field — shows its label/type/options/defaults
 * for review, never a "current value" (a master template has none). */
function DynamicFieldDefinition({ field }: { field: TemplateDynamicField }) {
  const suffixLabel = field.type === "checkboxGroup" ? "Checkbox" : field.type === "radio" ? "Radio" : field.type === "dropdown" ? "Dropdown" : field.unitSuffix ? `Text (${field.unitSuffix})` : "Text";
  return (
    <li className="text-[11px] text-muted-foreground">
      <span className="text-foreground font-medium">{field.label}</span> <span className="text-[10px]">({suffixLabel})</span>
      {field.options && field.options.length > 0 && (
        <ul className="list-disc list-inside ml-3">
          {field.options.map((opt) => (
            <li key={opt.key}>
              {opt.label}
              {field.type === "checkboxGroup" && (opt.defaultChecked ? " [x]" : " [ ]")}
              {opt.omitFromCustomerDisplay && <span className="italic"> (omitted from customer output when selected)</span>}
            </li>
          ))}
        </ul>
      )}
      {field.visibleWhen && (
        <span className="text-[10px] italic"> — shown when "{field.visibleWhen.fieldKey}" = {field.visibleWhen.equalsAny.join(", ")}</span>
      )}
    </li>
  );
}

/**
 * Shared "ดูตัวอย่าง" (Preview) rendering — used by both the Create Quotation wizard's Step 3
 * (`compact`, a short teaser before applying) and the Template Management module's standalone
 * preview action (full detail, before an admin edits/activates a template). A single source of
 * truth for "what's safe to show" so the two call sites can never drift apart on the one rule that
 * actually matters here: **never render `internalNotes`** (template-level or item-level) or any
 * cost figure — templates don't even carry a price field (see `TemplateItem` in
 * src/lib/quotationTemplates.ts), so there's nothing to accidentally leak on that front either.
 */
export function TemplatePreview({ template, compact = false }: { template: QuotationTemplate; compact?: boolean }) {
  const { t } = useI18n();
  const allItems = template.sections.flatMap((s) => s.items);
  const termLabel = (type: "paymentTerm" | "warrantyTerm" | "taxNote") =>
    type === "paymentTerm" ? t("templates.preview.paymentTerms")
    : type === "warrantyTerm" ? t("templates.preview.warrantyTerms")
    : t("templates.preview.taxNotes");

  return (
    <div className="rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold text-[#c9a84c]">{template.jobTypeCode}</span>
        <ChevronRight size={12} className="text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">{template.templateName}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{template.description}</p>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mb-3">
        <span className="flex items-center gap-1"><Layers size={12} /> {template.sections.length} {t("quotation.wizard.sections")}</span>
        <span>{allItems.length} {t("quotation.wizard.items")}</span>
        <span>{t("quotation.wizard.version")}: {template.version}</span>
        <span>{t("quotation.wizard.source")}: {template.sourceFileName || t("templates.preview.manualSource")} {template.sourceSheetName ? `— ${template.sourceSheetName}` : ""}</span>
      </div>

      {compact ? (
        <>
          <div className="space-y-2 mb-3">
            {template.sections.map((section) => (
              <div key={section.id}>
                <p className="text-xs font-semibold text-foreground">{section.title}</p>
                <p className="text-[11px] text-muted-foreground">{section.items.length} {t("quotation.wizard.items")}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mb-1">{t("quotation.wizard.includedItemsPreview")}</p>
          <ul className="text-xs text-foreground list-disc list-inside space-y-0.5">
            {allItems.slice(0, 6).map((item) => (
              <li key={item.id} className="truncate">{item.name}</li>
            ))}
          </ul>
        </>
      ) : (
        <div className="space-y-4">
          {template.sections.map((section) => (
            <div key={section.id}>
              <p className="text-xs font-semibold text-foreground border-b border-border/60 pb-1 mb-1.5">{section.title}</p>
              <ul className="space-y-1.5">
                {section.items.map((item) => (
                  <li key={item.id} className={item.itemType === "subItem" ? "ml-4" : ""}>
                    <p className="text-xs text-foreground">
                      {item.name}
                      {item.quantity != null && item.unit ? <span className="text-muted-foreground"> — {item.quantity} {item.unit}</span> : null}
                    </p>
                    {item.specifications.length > 0 && (
                      <ul className="text-[11px] text-muted-foreground list-disc list-inside ml-3">
                        {item.specifications.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                    {item.editableParameters.length > 0 && (
                      <ul className="text-[11px] text-[#c9a84c] list-disc list-inside ml-3">
                        {item.editableParameters.map((p, i) => <li key={i}>{p.label}: ______{p.unit ? ` ${p.unit}` : ""}</li>)}
                      </ul>
                    )}
                    {item.dynamicFields && item.dynamicFields.length > 0 && (
                      <ul className="list-disc list-inside ml-3 mt-0.5 space-y-0.5">
                        {[...item.dynamicFields].sort((a, b) => a.sortOrder - b.sortOrder).map((f) => <DynamicFieldDefinition key={f.key} field={f} />)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {(template.defaultNotes?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground border-b border-border/60 pb-1 mb-1.5">{t("templates.preview.notes")}</p>
              <ul className="text-xs text-foreground list-disc list-inside">
                {template.defaultNotes!.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}

          {template.conditions && (
            <div>
              <p className="text-xs font-semibold text-foreground border-b border-border/60 pb-1 mb-1.5">{t("templates.preview.conditions")}</p>
              <ul className="text-xs text-foreground list-disc list-inside space-y-0.5">
                <li>{template.conditions.vatConditionText}</li>
                <li>Warranty: ______ {template.conditions.warrantyUnit}</li>
                <li>Delivery: Within ______ {template.conditions.deliveryUnit}</li>
                {template.conditions.paymentPresets.map((p, i) => <li key={i} className="text-muted-foreground">{p}</li>)}
              </ul>
            </div>
          )}

          {template.defaultTerms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground border-b border-border/60 pb-1 mb-1.5">{t("templates.preview.terms")}</p>
              {(["paymentTerm", "warrantyTerm", "taxNote"] as const).map((type) => {
                const lines = template.defaultTerms.filter((t2) => t2.type === type);
                if (lines.length === 0) return null;
                return (
                  <div key={type} className="mb-1.5">
                    <p className="text-[11px] font-medium text-muted-foreground">{termLabel(type)}</p>
                    <ul className="text-[11px] text-foreground list-disc list-inside">
                      {lines.map((l, i) => <li key={i}>{l.text}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
