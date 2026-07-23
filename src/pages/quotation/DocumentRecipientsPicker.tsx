import type { User } from "../../lib/users";
import { DOCUMENT_RECIPIENT_DEPARTMENTS, type ChecklistGroup } from "../../lib/documentRequirements";

/**
 * "ผู้รับเอกสาร" — real people to actually email when a `documentsToSend` (เอกสารส่งถึง) checklist
 * option is checked, added 2026-07-23 per direct user request ("อยากให้ลิงค์ข้อมูลกับแผนกที่จะเลือก
 * ตอนสร้างพนักงาน"). Only renders a row for a department currently checked in `documentsToSendGroup`
 * — candidates are `users` filtered by an exact match against `User.department` (now a controlled
 * dropdown sourced from the same `DOCUMENT_RECIPIENT_DEPARTMENTS` list, see
 * `src/pages/admin/UserManagementPage.tsx`), so the match is reliable rather than fuzzy free-text.
 * Toggle-chip UI (not a `<select multiple>`) to match this app's existing tag/chip conventions
 * elsewhere and to comfortably show each candidate's full name at a glance. Purely a selection UI —
 * the actual "send email" action lives in `ScopeOfWorkDocument.tsx` (it needs to save first, since
 * the server reads recipients from the persisted record, not from unsaved client state).
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
        เลือกพนักงานในแต่ละแผนกที่เลือกไว้ใน "เอกสารส่งถึง" ด้านบน — เมื่อกดส่งอีเมล ระบบจะส่งไปยังอีเมลของพนักงานที่เลือก
      </p>
      <div className="space-y-3">
        {checkedDepartments.map((dept) => {
          const candidates = users.filter((u) => u.department.trim() === dept.label);
          const selected = value[dept.key] ?? [];
          return (
            <div key={dept.key}>
              <p className="text-xs font-medium text-foreground mb-1.5">{dept.label}</p>
              {candidates.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  ยังไม่มีพนักงานที่ตั้งค่าแผนกเป็น "{dept.label}" — ตั้งค่าได้ที่หน้าจัดการผู้ใช้งาน
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map((u) => {
                    const isSelected = selected.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleRecipient(dept.key, u.id)}
                        title={u.email}
                        className={`px-2.5 py-1 text-[11px] rounded-lg border transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                          isSelected
                            ? "bg-[#c9a84c]/15 border-[#c9a84c]/40 text-[#c9a84c] font-medium"
                            : "border-border text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40"
                        }`}
                      >
                        {u.fullName}
                      </button>
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
