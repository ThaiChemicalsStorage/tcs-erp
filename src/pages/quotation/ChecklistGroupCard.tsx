import type { ChecklistGroup } from "../../lib/documentRequirements";
import { useI18n } from "../../lib/i18n";

// การ์ดกลุ่มตัวเลือกแบบ checkbox/radio หนึ่งกลุ่ม ใช้ร่วมกันระหว่างใบเสนอราคาและ Scope of Work
// One checkbox/radio group card, shared between the Quotation and Scope of Work checklist sections.
export function ChecklistGroupCard({
  group,
  onChange,
  disabled,
  required = false,
  error,
}: {
  group: ChecklistGroup;
  onChange: (next: ChecklistGroup) => void;
  disabled: boolean;
  required?: boolean;
  error?: string;
}) {
  const { t } = useI18n();
  // สลับสถานะติ๊กของตัวเลือก: โหมด single จะเลือกได้ทีละหนึ่งรายการเท่านั้น
  // Toggles an option's checked state; in "single" mode, selecting one clears the others.
  const toggleOption = (key: string) => {
    if (disabled) return;
    if (group.selectionType === "single") {
      onChange({ ...group, options: group.options.map((o) => ({ ...o, checked: o.key === key ? !o.checked : false })) });
    } else {
      onChange({ ...group, options: group.options.map((o) => (o.key === key ? { ...o, checked: !o.checked } : o)) });
    }
  };

  return (
    <div className={`border rounded-lg p-3 bg-secondary/30 ${error ? "border-[#e05252]/50" : "border-border"}`}>
      <p className="text-xs font-semibold text-foreground mb-2">
        {group.title} {required && <span className="text-[#e05252]">*</span>}
      </p>
      <div className="space-y-1.5">
        {group.options.map((opt) => (
          <div key={opt.key} className="space-y-1">
            <label className={`flex items-center gap-2 text-xs text-foreground ${disabled ? "" : "cursor-pointer"} select-none`}>
              <input
                type={group.selectionType === "single" ? "radio" : "checkbox"}
                checked={opt.checked}
                disabled={disabled}
                onChange={() => toggleOption(opt.key)}
                className={`${group.selectionType === "single" ? "w-3.5 h-3.5" : "w-3.5 h-3.5 rounded"} border-border accent-[#c9a84c] disabled:opacity-60 flex-shrink-0`}
              />
              {opt.label}
              {opt.value !== undefined && (
                <input
                  disabled={disabled}
                  value={opt.value}
                  onClick={(e) => e.preventDefault()}
                  onChange={(e) => onChange({ ...group, options: group.options.map((o) => (o.key === opt.key ? { ...o, value: e.target.value } : o)) })}
                  className="flex-1 min-w-0 text-xs text-foreground bg-secondary border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
                />
              )}
            </label>
            {/* บรรทัดย่อยใต้ตัวเลือก — เพิ่มมา 2026-08-27 สำหรับใบสั่งงาน
                อยู่**นอก** <label> โดยตั้งใจ ไม่งั้นคลิกในช่องกรอกจะไปสลับเช็คบ็อกซ์
                แสดงเฉพาะเมื่อ details ถูกกำหนดไว้จริง (Scope of Work ไม่ได้ตั้ง จึงไม่กระทบ) และติ๊กแล้ว */}
            {opt.details !== undefined && opt.checked && (
              <div className="pl-6 space-y-1">
                {opt.details.map((d, di) => (
                  <div key={di} className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs flex-shrink-0">•</span>
                    <input
                      type="text"
                      disabled={disabled}
                      value={d}
                      onChange={(e) => onChange({
                        ...group,
                        options: group.options.map((o) => (o.key === opt.key
                          ? { ...o, details: (o.details ?? []).map((x, xi) => (xi === di ? e.target.value : x)) }
                          : o)),
                      })}
                      placeholder={t("checklist.subDetailPlaceholder")}
                      className="flex-1 min-w-0 text-xs bg-secondary border border-border rounded px-2 py-1 outline-none focus:border-[#c9a84c]/50 disabled:opacity-60"
                    />
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => onChange({
                          ...group,
                          options: group.options.map((o) => (o.key === opt.key
                            ? { ...o, details: (o.details ?? []).filter((_, xi) => xi !== di) }
                            : o)),
                        })}
                        className="text-muted-foreground hover:text-[#e05252] transition-colors text-xs px-1"
                        aria-label={`${t("checklist.removeSubDetail")} — ${opt.label}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange({
                      ...group,
                      options: group.options.map((o) => (o.key === opt.key ? { ...o, details: [...(o.details ?? []), ""] } : o)),
                    })}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    + {t("checklist.addSubDetail")}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {group.note !== undefined && (
        <input
          disabled={disabled}
          value={group.note}
          onChange={(e) => onChange({ ...group, note: e.target.value })}
          placeholder="โปรดระบุ..."
          className="w-full mt-2 text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
        />
      )}
      {error && <p className="text-xs text-[#e05252] mt-1.5">{error}</p>}
    </div>
  );
}
