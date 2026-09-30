import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { type QuoteContact, blankContact, MAX_QUOTE_CONTACTS } from "../../lib/quotes";
import { btn, field } from "../../components/ui/styles";

/**
 * รายชื่อผู้ติดต่อของใบเสนอราคา (2026-09-07) — เจ้าของขอให้ *"ทำเหมือนปุ่มเพิ่ม PO"* ของ Scope of Work
 * จึงใช้โครงเดียวกับ `DocumentNumberListEditor` ตรงนั้น: แถวแรกคือผู้ติดต่อหลัก (คนที่ระบบดึงจากทะเบียน
 * ลูกค้าให้ และเป็นคนที่ Scope of Work/AR/ค้นหา มองเห็น) แถวถัดไปเพิ่มด้วยปุ่ม "เพิ่มผู้ติดต่อ" ลบด้วยถังขยะ
 * เหลือแถวสุดท้ายลบไม่ได้ เพื่อให้ช่องผู้ติดต่อหลักยังอยู่บนฟอร์มเสมอ
 *
 * ดีไซน์ใหม่ (2026-09-30): แต่ละช่องมีชื่อกำกับเหนือกล่อง · ปุ่มเพิ่มเป็นปุ่มข้อความสีน้ำเงิน ·
 * ตัวแก้ไขนี้ไม่ตัดแถวว่างเอง `currentDraft()` ของหน้าเอกสารเป็นคนตัดตอนส่ง
 */
export function QuoteContactsEditor({ contacts, onChange, disabled }: {
  contacts: QuoteContact[];
  onChange: (next: QuoteContact[]) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const rows = contacts.length > 0 ? contacts : [blankContact()];
  const update = (id: string, patch: Partial<QuoteContact>) => onChange(rows.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id: string) => {
    const next = rows.filter((c) => c.id !== id);
    onChange(next.length > 0 ? next : [blankContact()]);
  };
  const add = () => onChange([...rows, blankContact()]);
  const full = rows.length >= MAX_QUOTE_CONTACTS;
  const input = `${field.input} w-full min-w-0`;

  const cell = (index: number, key: "name" | "position" | "phone" | "email", label: string, c: QuoteContact, placeholder: string) => {
    const id = `quote-contact-${index}-${key}`;
    return (
      <div className="flex flex-col gap-1.5 min-w-0">
        <label htmlFor={id} className={field.label}>{label}</label>
        <input id={id} disabled={disabled} className={input} value={c[key]} onChange={(e) => update(c.id, { [key]: e.target.value })} placeholder={placeholder} />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {rows.map((c, index) => (
        <div key={c.id} role="group" aria-labelledby={`quote-contact-${index}-legend`} className={`min-w-0 flex flex-col gap-2.5 ${index > 0 ? "pt-4 border-t border-[#eef1f6]" : ""}`}>
          <div className="flex items-center gap-2 min-h-6">
            <span id={`quote-contact-${index}-legend`} className="flex-1 text-xs font-semibold text-[#3d5173]">
              {index === 0 ? t("quotation.contacts.primary") : t("quotation.contacts.nth").replace("{n}", String(index + 1))}
            </span>
            {!disabled && rows.length > 1 && (
              <button type="button" onClick={() => remove(c.id)} title={t("quotation.contacts.remove")} aria-label={t("quotation.contacts.remove")}
                className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[#5f7293] hover:text-[#b93636] hover:bg-[#fcebeb] transition-colors">
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
            {cell(index, "name", t("quotation.field.contactName"), c, t("quotation.field.contactNamePlaceholder"))}
            {cell(index, "position", t("quotation.field.contactPosition"), c, t("quotation.field.contactPositionPlaceholder"))}
            {cell(index, "phone", t("quotation.field.contactPhone"), c, "0XX-XXX-XXXX")}
            {cell(index, "email", t("quotation.field.contactEmail"), c, "name@company.com")}
          </div>
        </div>
      ))}
      {!disabled && (
        <div>
          <button type="button" onClick={add} disabled={full}
            title={full ? t("quotation.contacts.max").replace("{n}", String(MAX_QUOTE_CONTACTS)) : undefined}
            className={btn.text}>
            <Plus size={16} /> {t("quotation.contacts.add")}
          </button>
        </div>
      )}
    </div>
  );
}
