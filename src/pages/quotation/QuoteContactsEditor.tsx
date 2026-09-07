import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { type QuoteContact, blankContact, MAX_QUOTE_CONTACTS } from "../../lib/quotes";

const inputCls = "w-full min-w-0 text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60";

/**
 * รายชื่อผู้ติดต่อของใบเสนอราคา (2026-09-07) — เจ้าของขอให้ *"ทำเหมือนปุ่มเพิ่ม PO"* ของ Scope of Work
 * จึงใช้โครงเดียวกับ `DocumentNumberListEditor` ตรงนั้น: แถวแรกคือผู้ติดต่อหลัก (คนที่ระบบดึงจากทะเบียน
 * ลูกค้าให้ และเป็นคนที่ Scope of Work/AR/ค้นหา มองเห็น) แถวถัดไปเพิ่มด้วยปุ่มทอง ลบด้วยถังขยะ
 * เหลือแถวสุดท้ายลบไม่ได้ เพื่อให้ช่องผู้ติดต่อหลักยังอยู่บนฟอร์มเสมอ
 *
 * ต่างจาก PO ตรงที่แถวหนึ่งมีสี่ช่อง (ชื่อ ตำแหน่ง เบอร์ อีเมล) จึงวางเป็นกริดสองคอลัมน์ต่อแถวแทนที่จะ
 * เป็นช่องเดียวยาว ๆ · ตัวแก้ไขนี้ไม่ตัดแถวว่างเอง `currentDraft()` ของหน้าเอกสารเป็นคนตัดตอนส่ง
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

  return (
    <div className="space-y-2">
      {rows.map((c, index) => (
        <div key={c.id} className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0 space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
              {index === 0 ? t("quotation.contacts.primary") : t("quotation.contacts.nth").replace("{n}", String(index + 1))}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input id={`quote-contact-${index}-name`} aria-label={t("quotation.field.contactName")} disabled={disabled} className={inputCls}
                value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} placeholder={t("quotation.field.contactNamePlaceholder")} />
              <input id={`quote-contact-${index}-position`} aria-label={t("quotation.field.contactPosition")} disabled={disabled} className={inputCls}
                value={c.position} onChange={(e) => update(c.id, { position: e.target.value })} placeholder={t("quotation.field.contactPositionPlaceholder")} />
              <input id={`quote-contact-${index}-phone`} aria-label={t("quotation.field.contactPhone")} disabled={disabled} className={inputCls}
                value={c.phone} onChange={(e) => update(c.id, { phone: e.target.value })} placeholder="0XX-XXX-XXXX" />
              <input id={`quote-contact-${index}-email`} aria-label={t("quotation.field.contactEmail")} disabled={disabled} className={inputCls}
                value={c.email} onChange={(e) => update(c.id, { email: e.target.value })} placeholder="name@company.com" />
            </div>
          </div>
          {!disabled && rows.length > 1 && (
            <button type="button" onClick={() => remove(c.id)} title={t("quotation.contacts.remove")} aria-label={t("quotation.contacts.remove")}
              className="text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0 p-1 mt-5">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={add} disabled={full}
          title={full ? t("quotation.contacts.max").replace("{n}", String(MAX_QUOTE_CONTACTS)) : undefined}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed">
          <Plus size={11} /> {t("quotation.contacts.add")}
        </button>
      )}
    </div>
  );
}
