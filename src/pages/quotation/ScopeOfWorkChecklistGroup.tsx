import type { ChecklistGroup } from "../../lib/scopeOfWork";

/**
 * One printed checkbox/radio group card (e.g. "Safety", "Test Report — ประเภท") — see
 * `buildDefaultChecklistGroups()` in api/_lib/scopeOfWorkHandler.ts for the full PDF-derived
 * group/option structure. `selectionType: "single"` renders radio-style (checking one option
 * unchecks any other in the same group, enforced client-side here AND re-clamped server-side on
 * save); `"multiple"` renders plain independent checkboxes.
 */
export function ScopeOfWorkChecklistGroup({
  group,
  onChange,
  disabled,
}: {
  group: ChecklistGroup;
  onChange: (next: ChecklistGroup) => void;
  disabled: boolean;
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
    <div className="border border-border rounded-lg p-3 bg-secondary/30">
      <p className="text-xs font-semibold text-foreground mb-2">{group.title}</p>
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
    </div>
  );
}
