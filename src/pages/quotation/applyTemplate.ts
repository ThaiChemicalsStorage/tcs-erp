import { newLineId, newSubDetailId, type QuoteLine } from "../../lib/quotes";
import type { QuotationTemplate, TemplateItem, TemplateTermLine } from "../../lib/quotationTemplates";

export interface AppliedTemplateDraft {
  lines: QuoteLine[];
  paymentTerms: string;
  remarks: string;
}

// กรองรายการเงื่อนไขตามประเภทที่ระบุ แล้วคืนค่าเฉพาะข้อความ
// Filters term lines by the given type and returns just their text.
function termsByType(terms: TemplateTermLine[], type: TemplateTermLine["type"]): string[] {
  return terms.filter((t) => t.type === type).map((t) => t.text);
}

// อ่านข้อมูล specifications แบบเก่าจากรายการเทมเพลตอย่างปลอดภัย เผื่อยังไม่ถูกย้ายไปที่ subDetails
// Safely reads legacy `specifications` data off a template item, as a fallback for content not yet migrated to subDetails.
function legacySpecifications(item: TemplateItem): string[] {
  const raw = (item as unknown as { specifications?: unknown }).specifications;
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
}

// แปลงเทมเพลตใบเสนอราคาเป็นชุดรายการ, เงื่อนไขชำระเงิน และหมายเหตุเริ่มต้นสำหรับใบเสนอราคาใหม่ (คัดลอกครั้งเดียว ไม่ผูกกับเทมเพลตต้นทาง ไม่คัดลอกหมายเหตุภายใน)
// Converts a quotation template into starting lines, payment terms, and remarks for a new quotation (a one-time copy, never linked back to the template; internal notes are never copied).
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
