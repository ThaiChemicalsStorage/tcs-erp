import { useId } from "react";
import type { ChecklistGroup, ChecklistOption } from "../../lib/documentRequirements";
import { useI18n } from "../../lib/i18n";

// การ์ดกลุ่มตัวเลือกแบบ checkbox/radio หนึ่งกลุ่ม ใช้ร่วมกันระหว่างใบสั่งงานและ Scope of Work
// One checkbox/radio group, shared between the Job Order and Scope of Work checklist sections.
// variant "card" (ค่าเริ่มต้น) = การ์ดเล็กแบบเดิมที่ใบสั่งงานใช้ · "row" = แถวเช็คลิสต์ของ Scope of Work
// ดีไซน์ใหม่ 2026-09-30: ชื่อกลุ่มซ้าย 200px ตัวเลือกเป็นชิปกดได้ทั้งชิ้นด้านขวา
export function ChecklistGroupCard({
  group,
  onChange,
  disabled,
  required = false,
  error,
  variant = "card",
}: {
  group: ChecklistGroup;
  onChange: (next: ChecklistGroup) => void;
  disabled: boolean;
  required?: boolean;
  error?: string;
  variant?: "card" | "row";
}) {
  const { t } = useI18n();
  const labelId = useId();
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
  const patchOption = (key: string, patch: Partial<ChecklistOption>) =>
    onChange({ ...group, options: group.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) });

  const inlineInput = "min-w-0 text-xs text-foreground bg-white border border-[#c3ccda] rounded px-2 py-1 outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors disabled:opacity-60";

  // ช่องกรอกในบรรทัดตัวเลือก (ค่า / หน่วย / ช่องที่สอง) — ใช้เหมือนกันทั้งสองแบบ
  const optionExtras = (opt: ChecklistOption) => (
    <>
      {opt.value !== undefined && (
        <input
          disabled={disabled}
          value={opt.value}
          aria-label={opt.label}
          onClick={(e) => e.preventDefault()}
          onChange={(e) => patchOption(opt.key, { value: e.target.value })}
          className={`flex-1 ${inlineInput}`}
        />
      )}
      {/* หน่วยที่พิมพ์อยู่บนฟอร์มอยู่แล้ว (BAR / TON) — เป็นป้าย ไม่ใช่ช่องกรอก */}
      {opt.unit && <span className="text-xs text-muted-foreground flex-shrink-0">{opt.unit}</span>}
      {/* ช่องกรอกที่สอง — บรรทัดงานสีของ FM-PJ-01 เว้นช่องไว้สองช่อง (ชื่อสี / ความหนา) */}
      {opt.value2 !== undefined && (
        <>
          <span className="text-xs text-muted-foreground flex-shrink-0">/</span>
          <input
            disabled={disabled}
            value={opt.value2}
            aria-label={`${opt.label} — ${opt.unit2 ?? ""}`.trim()}
            onClick={(e) => e.preventDefault()}
            onChange={(e) => patchOption(opt.key, { value2: e.target.value })}
            className={`w-20 flex-shrink-0 ${inlineInput}`}
          />
        </>
      )}
      {opt.unit2 && <span className="text-xs text-muted-foreground flex-shrink-0">{opt.unit2}</span>}
    </>
  );

  // บรรทัดย่อยใต้ตัวเลือก — เพิ่มมา 2026-08-27 สำหรับใบสั่งงาน
  // อยู่**นอก** <label> โดยตั้งใจ ไม่งั้นคลิกในช่องกรอกจะไปสลับเช็คบ็อกซ์
  // แสดงเฉพาะเมื่อ details ถูกกำหนดไว้จริง (Scope of Work ไม่ได้ตั้ง จึงไม่กระทบ) และติ๊กแล้ว
  const optionDetails = (opt: ChecklistOption) =>
    opt.details !== undefined && opt.checked ? (
      <div className="pl-6 space-y-1">
        {opt.details.map((d, di) => (
          <div key={di} className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs flex-shrink-0">•</span>
            <input
              type="text"
              disabled={disabled}
              value={d}
              onChange={(e) => patchOption(opt.key, { details: (opt.details ?? []).map((x, xi) => (xi === di ? e.target.value : x)) })}
              placeholder={t("checklist.subDetailPlaceholder")}
              className={`flex-1 ${inlineInput}`}
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => patchOption(opt.key, { details: (opt.details ?? []).filter((_, xi) => xi !== di) })}
                className="text-muted-foreground hover:text-[#b93636] transition-colors text-xs px-1"
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
            onClick={() => patchOption(opt.key, { details: [...(opt.details ?? []), ""] })}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            + {t("checklist.addSubDetail")}
          </button>
        )}
      </div>
    ) : null;

  const inputType = group.selectionType === "single" ? "radio" : "checkbox";

  if (variant === "row") {
    const withDetails = group.options.filter((o) => o.details !== undefined && o.checked);
    return (
      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-x-4 gap-y-2 items-start py-2.5 border-b border-[#eef1f6] last:border-b-0">
        <span id={labelId} className={`min-h-8 flex items-center text-[13px] font-medium ${error ? "text-[#b93636]" : "text-[#26395a]"}`}>
          {group.title}
          {required && <span className="text-[#b93636] ml-1">*</span>}
        </span>
        <div className="flex flex-col gap-2 min-w-0">
          <div role={group.selectionType === "single" ? "radiogroup" : "group"} aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
            {group.options.map((opt) => (
              <label
                key={opt.key}
                className={`min-h-8 py-1 pl-2.5 pr-3 rounded-lg border text-[13px] inline-flex items-center gap-2 select-none transition-colors ${
                  opt.checked ? "border-[#1a5fb4] bg-[#e8f0fb] font-medium text-foreground" : `border-[#c3ccda] bg-white text-foreground ${disabled ? "" : "hover:border-[#8a97ad]"}`
                } ${disabled ? "" : "cursor-pointer"}`}
              >
                <input
                  type={inputType}
                  checked={opt.checked}
                  disabled={disabled}
                  onChange={() => toggleOption(opt.key)}
                  className="w-4 h-4 m-0 accent-[#1a5fb4] flex-shrink-0"
                />
                {opt.label}
                {optionExtras(opt)}
              </label>
            ))}
            {group.note !== undefined && (
              <input
                disabled={disabled}
                value={group.note}
                aria-label={`${group.title} — ${t("checklist.otherPlaceholder")}`}
                onChange={(e) => onChange({ ...group, note: e.target.value })}
                placeholder={t("checklist.otherPlaceholder")}
                className="w-full sm:w-[220px] h-8 px-2.5 rounded-lg border border-[#c3ccda] bg-white text-[13px] text-foreground placeholder:text-[#8a97ad] outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors"
              />
            )}
          </div>
          {withDetails.map((opt) => <div key={opt.key}>{optionDetails(opt)}</div>)}
          {error && <p className="text-xs text-[#b93636]">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-3 bg-secondary/30 ${error ? "border-[#e05252]/50" : "border-border"}`}>
      {/* ใบสั่งงานส่งกลุ่มที่ไม่มีหัวข้อมา (2026-08-31) เพราะฟอร์ม FM-PJ-01 ตัวจริงเป็นรายการ
          เรียงยาวไม่มีหัวข้อย่อยเลย — เว้นแถบหัวข้อไปทั้งแถบ ไม่ใช่เรนเดอร์หัวข้อว่างทิ้งช่องไว้
          เครื่องหมาย * ยังต้องได้ที่ยืน จึงเรนเดอร์เดี่ยว ๆ เมื่อกลุ่มบังคับแต่ไม่มีหัวข้อ */}
      {group.title.trim() !== "" ? (
        <p className="text-xs font-semibold text-foreground mb-2">
          {group.title} {required && <span className="text-[#e05252]">*</span>}
        </p>
      ) : required ? (
        <p className="text-xs font-semibold text-[#e05252] mb-2">*</p>
      ) : null}
      <div className="space-y-1.5">
        {group.options.map((opt) => (
          <div key={opt.key} className="space-y-1">
            <label className={`flex items-center gap-2 text-xs text-foreground ${disabled ? "" : "cursor-pointer"} select-none`}>
              <input
                type={inputType}
                checked={opt.checked}
                disabled={disabled}
                onChange={() => toggleOption(opt.key)}
                className={`${group.selectionType === "single" ? "w-3.5 h-3.5" : "w-3.5 h-3.5 rounded"} border-border accent-[#c9a84c] disabled:opacity-60 flex-shrink-0`}
              />
              {opt.label}
              {optionExtras(opt)}
            </label>
            {optionDetails(opt)}
          </div>
        ))}
      </div>
      {group.note !== undefined && (
        <input
          disabled={disabled}
          value={group.note}
          onChange={(e) => onChange({ ...group, note: e.target.value })}
          placeholder={t("checklist.otherPlaceholder")}
          className="w-full mt-2 text-xs text-foreground bg-white border border-[#c3ccda] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors disabled:opacity-60"
        />
      )}
      {error && <p className="text-xs text-[#e05252] mt-1.5">{error}</p>}
    </div>
  );
}
