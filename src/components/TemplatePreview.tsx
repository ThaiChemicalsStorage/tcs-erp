import { Layers, ChevronRight } from "lucide-react";
import type { QuotationTemplate } from "../lib/quotationTemplates";
import { useI18n } from "../lib/i18n";

// แสดงตัวอย่างเทมเพลตใบเสนอราคา (แบบย่อหรือแบบเต็ม) โดยไม่แสดงหมายเหตุภายในหรือราคา
// Renders a quotation template preview (compact or full), never showing internal notes or price
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
                    {item.subDetails.length > 0 && (
                      <ul className="text-[11px] text-muted-foreground list-disc list-inside ml-3">
                        {item.subDetails.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

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
