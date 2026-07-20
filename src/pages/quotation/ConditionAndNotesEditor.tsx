import { Plus, X, ArrowUp, ArrowDown } from "lucide-react";
import type { TemplateConditionConfig } from "../../lib/quotationTemplates";
import { useI18n } from "../../lib/i18n";

/**
 * "หมายเหตุ" (Notes) + "Condition" section editors (added 2026-07-20, FRP Lining template pass) —
 * screen-only, matching `remarks`' existing "screen preview only; print output is PrintDocument"
 * convention. Notes is a real add/edit/remove/reorder list, distinct from the older single
 * free-text `remarks` field (still supported unchanged). Condition holds VAT wording (display-only,
 * never used to compute VAT — see `computeTotals()`/`VAT_RATE` in src/lib/quotes.tsx), an editable
 * Warranty value (blank by default, never a fake default; the red warning here is UI-only, never
 * printed, never a server-side blocking rule — see docs/MODULES/QuotationTemplates.md "Condition
 * Section"), and an editable Delivery day count. Both are reusable by any future template, not
 * FRP-Lining-specific: Notes shows whenever there's content or the quote is editable; Condition
 * shows whenever the applied template defines `conditions` or the quote already has Condition data.
 */

export function NotesEditor({
  notes, onChange, disabled,
}: {
  notes: string[];
  onChange: (notes: string[]) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  if (notes.length === 0 && disabled) return null;

  const addNote = () => onChange([...notes, ""]);
  const updateNote = (i: number, text: string) => onChange(notes.map((n, idx) => (idx === i ? text : n)));
  const removeNote = (i: number) => onChange(notes.filter((_, idx) => idx !== i));
  const moveNote = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= notes.length) return;
    const arr = [...notes];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    onChange(arr);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 print:hidden">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.section.notes")}</p>
        {!disabled && (
          <button type="button" onClick={addNote} className="flex items-center gap-1 text-[11px] text-[#c9a84c] hover:text-[#f0c040] transition-colors">
            <Plus size={11} /> {t("common.add")}
          </button>
        )}
      </div>
      {notes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t("quotation.section.notesEmpty")}</p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((note, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                disabled={disabled}
                value={note}
                onChange={(e) => updateNote(i, e.target.value)}
                className="flex-1 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
              />
              {!disabled && (
                <>
                  <button type="button" onClick={() => moveNote(i, -1)} disabled={i === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors flex-shrink-0"><ArrowUp size={12} /></button>
                  <button type="button" onClick={() => moveNote(i, 1)} disabled={i === notes.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors flex-shrink-0"><ArrowDown size={12} /></button>
                  <button type="button" onClick={() => removeNote(i)} className="p-1 text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0"><X size={12} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ConditionEditor({
  conditions,
  vatConditionText, onVatConditionTextChange,
  warrantyText, onWarrantyTextChange,
  deliveryDays, onDeliveryDaysChange,
  disabled,
}: {
  conditions: TemplateConditionConfig | undefined;
  vatConditionText: string;
  onVatConditionTextChange: (v: string) => void;
  warrantyText: string;
  onWarrantyTextChange: (v: string) => void;
  deliveryDays: number | null;
  onDeliveryDaysChange: (v: number | null) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  if (!conditions && !vatConditionText.trim() && !warrantyText.trim() && deliveryDays == null) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5 print:hidden space-y-3">
      <p className="text-xs font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("quotation.section.condition")}</p>
      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">{t("quotation.field.vatCondition")}</label>
        <input
          disabled={disabled}
          value={vatConditionText}
          onChange={(e) => onVatConditionTextChange(e.target.value)}
          className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
        />
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">{t("quotation.field.warranty")}</label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{t("quotation.field.warrantyLabelPrefix")}</span>
          <input
            disabled={disabled}
            value={warrantyText}
            onChange={(e) => onWarrantyTextChange(e.target.value)}
            placeholder={t("quotation.field.warrantyPlaceholder")}
            className="flex-1 min-w-0 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
          />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{conditions?.warrantyUnit || t("quotation.field.warrantyUnitFallback")}</span>
        </div>
        {!warrantyText.trim() && <p className="text-[10px] text-[#e05252] mt-1">{t("quotation.field.warrantyWarning")}</p>}
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground block mb-1">{t("quotation.field.delivery")}</label>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{t("quotation.field.deliveryLabelPrefix")} {t("quotation.field.deliveryPrefix")}</span>
          <input
            disabled={disabled}
            type="number"
            min={0}
            value={deliveryDays ?? ""}
            onChange={(e) => onDeliveryDaysChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
            className="w-20 text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
          />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{conditions?.deliveryUnit || t("quotation.field.deliveryUnitFallback")}</span>
        </div>
      </div>
    </div>
  );
}
