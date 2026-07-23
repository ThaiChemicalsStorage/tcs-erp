import { Check } from "lucide-react";
import type { User } from "../../lib/users";
import { DOCUMENT_RECIPIENT_DEPARTMENTS, type ChecklistGroup } from "../../lib/documentRequirements";

/**
 * "ผู้รับเอกสาร" — real people to actually email when a `documentsToSend` (เอกสารส่งถึง) checklist
 * option is checked, added 2026-07-23 per direct user request ("อยากให้ลิงค์ข้อมูลกับแผนกที่จะเลือก
 * ตอนสร้างพนักงาน"). Only renders a row for a department currently checked in `documentsToSendGroup`
 * — candidates are `users` filtered by an exact match against `User.department` (now a controlled
 * dropdown sourced from the same `DOCUMENT_RECIPIENT_DEPARTMENTS` list, see
 * `src/pages/admin/UserManagementPage.tsx`), so the match is reliable rather than fuzzy free-text.
 * Purely a selection UI — the actual "send email" action lives in `ScopeOfWorkDocument.tsx` (it
 * needs to save first, since the server reads recipients from the persisted record, not from
 * unsaved client state).
 *
 * **2026-07-23, same-day UX pass**: real `<input type="checkbox">` per candidate (matching
 * `ChecklistGroupCard.tsx`'s already-established, unambiguous checkbox convention directly above
 * this card) replaced the original color-only toggle-chip design — a direct user report that the
 * chip's subtle selected/unselected color difference alone wasn't a clear enough "you're choosing
 * who this gets emailed to" affordance for a first-time user. Also added a per-department selected
 * count next to the title, so it's obvious at a glance which departments still need a pick.
 */
export function DocumentRecipientsPicker({
  documentsToSendGroup,
  users,
  value,
  onChange,
  disabled,
}: {
  documentsToSendGroup: ChecklistGroup | undefined;
  users: User[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  disabled: boolean;
}) {
  if (!documentsToSendGroup) return null;
  const checkedByKey = new Map(documentsToSendGroup.options.map((o) => [o.key, o.checked]));
  const checkedDepartments = DOCUMENT_RECIPIENT_DEPARTMENTS.filter((d) => checkedByKey.get(d.key));
  if (checkedDepartments.length === 0) return null;

  const toggleRecipient = (deptKey: string, userId: string) => {
    if (disabled) return;
    const current = value[deptKey] ?? [];
    const next = current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId];
    onChange({ ...value, [deptKey]: next });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 print:hidden">
      <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
        ผู้รับเอกสาร
      </p>
      <p className="text-[11px] text-muted-foreground mb-3">
        ติ๊กเลือกพนักงานในแต่ละแผนกที่เลือกไว้ใน "เอกสารส่งถึง" ด้านบน — เมื่อกดปุ่ม "ส่งอีเมลแจ้งผู้รับเอกสาร" ระบบจะส่งอีเมลไปยังพนักงานที่ติ๊กเลือกไว้เท่านั้น
      </p>
      <div className="space-y-4">
        {checkedDepartments.map((dept) => {
          const candidates = users.filter((u) => u.department.trim() === dept.label);
          const selected = value[dept.key] ?? [];
          const selectedCount = selected.filter((id) => candidates.some((c) => c.id === id)).length;
          return (
            <div key={dept.key} className="border border-border/70 rounded-lg p-3 bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-foreground">{dept.label}</p>
                {candidates.length > 0 && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${selectedCount > 0 ? "bg-[#2aa36b]/15 text-[#2aa36b]" : "bg-[#e08a3c]/15 text-[#e08a3c]"}`}>
                    {selectedCount > 0 ? (
                      <span className="inline-flex items-center gap-0.5"><Check size={10} /> เลือกแล้ว {selectedCount} คน</span>
                    ) : (
                      "ยังไม่ได้เลือกผู้รับ"
                    )}
                  </span>
                )}
              </div>
              {candidates.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  ยังไม่มีพนักงานที่ตั้งค่าแผนกเป็น "{dept.label}" — ตั้งค่าได้ที่หน้าจัดการผู้ใช้งาน
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {candidates.map((u) => {
                    const isSelected = selected.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        title={u.email}
                        className={`flex items-center gap-2 text-xs text-foreground select-none rounded-md px-1.5 py-1 -mx-1.5 transition-colors ${disabled ? "" : "cursor-pointer hover:bg-secondary/60"}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={disabled}
                          onChange={() => toggleRecipient(dept.key, u.id)}
                          className="w-3.5 h-3.5 rounded border-border accent-[#c9a84c] disabled:opacity-60 flex-shrink-0"
                        />
                        <span className={isSelected ? "font-medium text-foreground" : "text-muted-foreground"}>{u.fullName}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
