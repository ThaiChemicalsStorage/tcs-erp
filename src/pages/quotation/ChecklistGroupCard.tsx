import type { ChecklistGroup } from "../../lib/documentRequirements";

/**
 * One printed checkbox/radio group card (e.g. "Safety", "Logo", "เอกสารส่งถึง") — shared by
 * Quotation and Scope of Work's "ข้อกำหนดเอกสารและการส่งมอบ" section (renamed from
 * ScopeOfWorkChecklistGroup.tsx 2026-07-16, required-field validation pass, since Quotation now
 * renders the exact same checklist-group model — see docs/MODULES/Quotation.md/ScopeOfWork.md).
 * `selectionType: "single"` renders radio-style (checking one option unchecks any other in the
 * same group, enforced here AND re-clamped server-side on save); `"multiple"` renders plain
 * independent checkboxes. `required`/`error` add the red-asterisk marker and inline Thai error
 * message for the 8 mandatory groups (Safety/ขนส่ง/Logo/เงื่อนไขการวางบิล/เอกสารส่งถึง/Nameplate/
 * เงื่อนไขการส่งมอบงาน/ปจ.2) — see src/lib/documentRequirements.ts.
 */
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
          <label key={opt.key} className={`flex items-center gap-2 text-xs text-foreground ${disabled ? "" : "cursor-pointer"} select-none`}>
            <input
              type={group.selectionType === "single" ? "radio" : "checkbox"}
              checked={opt.checked}
              disabled={disabled}
              onChange={() => toggleOption(opt.key)}
              className={`${group.selectionType === "single" ? "w-3.5 h-3.5" : "w-3.5 h-3.5 rounded"} border-border accent-[#c9a84c] disabled:opacity-60 flex-shrink-0`}
            />
            {opt.label}
          </label>
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
