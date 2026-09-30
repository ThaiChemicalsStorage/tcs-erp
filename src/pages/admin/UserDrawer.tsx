import { useId, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Loader2, Trash2, UserCheck, UserX } from "lucide-react";
import type { User } from "../../lib/users";
import { initials, POSITION_SUGGESTIONS } from "../../lib/users";
import type { Department } from "../../lib/departments";
import type { Team } from "../../lib/teams";
import type { Role } from "../../lib/roles";
import { Drawer } from "../../components/ui/Overlays";
import { Field, SelectBox } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field } from "../../components/ui/styles";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";

export interface UserFormState {
  fullName: string;
  employeeId: string;
  username: string;
  email: string;
  phone: string;
  department: string;
  teamId: string;
  position: string;
  roleKey: string;
  password: string;
  confirm: string;
}

// ค่าเริ่มต้นของฟอร์ม — ผู้ใช้ใหม่ยังไม่เลือกบทบาท (ดีไซน์ใหม่ 2026-09-30: แสดง "— เลือกบทบาท —" แทนการเลือกให้ก่อน)
// Initial form values — a new user starts with no role picked (placeholder instead of preselecting the first role)
function toForm(u: User | null): UserFormState {
  if (!u) return { fullName: "", employeeId: "", username: "", email: "", phone: "", department: "", teamId: "", position: "", roleKey: "", password: "", confirm: "" };
  return {
    fullName: u.fullName, employeeId: u.employeeId, username: u.username, email: u.email, phone: u.phone,
    department: u.department, teamId: u.teamId, position: u.position, roleKey: u.roleKey, password: "", confirm: "",
  };
}

// ป้ายชื่อช่องเดิมมีดอกจันต่อท้ายในคำแปล ("ชื่อ-นามสกุล *") — ดีไซน์ใหม่ให้ Field ใส่ดอกจันแดงเอง
const plain = (label: string) => label.replace(/\s*\*$/, "");

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

const Divider = () => <div className="h-px bg-[#eef1f6] flex-shrink-0" />;

/**
 * แผงข้อมูลผู้ใช้งาน (ดีไซน์ใหม่ 2026-09-30, บอร์ด Drawer-User) — แทนหน้าฟอร์มเต็มจอเดิม
 * รีเซ็ตรหัสผ่าน / ระงับ-เปิดใช้งาน / ลบ ย้ายจากไอคอนท้ายแถวมาอยู่ในเมนู "เพิ่มเติม" ท้ายแผง ·
 * ช่อง "สถานะ" ในฟอร์มแก้ไขถูกเอาออก — เปลี่ยนสถานะผ่านเมนูซึ่งมีกล่องยืนยันเสมอ
 */
export function UserDrawer({
  user, currentUser, roles, assignableRoles, departments, teams, locked, statusBlockedReason, deleteBlocked,
  onSave, onClose, onResetPassword, onToggleStatus, onDelete,
}: {
  /** null = ผู้ใช้ใหม่ */
  user: User | null;
  currentUser: User;
  roles: Role[];
  assignableRoles: Role[];
  departments: Department[];
  teams: Team[];
  /** มีกล่องยืนยันซ้อนอยู่ด้านบน — กัน Escape/คลิกพื้นหลังปิดแผงไปพร้อมกัน */
  locked: boolean;
  /** เหตุผลที่ระงับ/เปิดใช้งานไม่ได้ ("" = ทำได้) */
  statusBlockedReason: string;
  deleteBlocked: boolean;
  onSave: (form: UserFormState) => Promise<string | null>;
  onClose: () => void;
  onResetPassword: (u: User) => void;
  onToggleStatus: (u: User) => void;
  onDelete: (u: User) => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<UserFormState>(() => toForm(user));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const ids = {
    fullName: useId(), employeeId: useId(), phone: useId(), username: useId(), email: useId(), password: useId(),
    confirm: useId(), position: useId(), role: useId(), department: useId(), team: useId(), positions: useId(),
  };
  const isSelf = !!user && user.id === currentUser.id;
  const set = <K extends keyof UserFormState>(key: K, value: UserFormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  // แสดงตัวเลือกทีมเฉพาะเมื่อแผนกที่เลือกในฟอร์มมีทีมอยู่จริง (หรือผู้ใช้มีทีมเดิมอยู่แล้ว)
  // Only offer a team picker once the form's selected department actually has teams (or the user already has one)
  const selectedDepartment = departments.find((d) => d.name === form.department);
  const teamsInDepartment = selectedDepartment ? teams.filter((tm) => tm.departmentId === selectedDepartment.id && tm.isActive) : [];
  const showTeam = !!selectedDepartment && (teamsInDepartment.length > 0 || !!form.teamId);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setSaving(true);
    const err = await onSave(form);
    setSaving(false);
    if (err) setError(err);
  };

  const role = user ? roles.find((r) => r.key === user.roleKey) : undefined;
  const subtitle = user ? (
    <span className="inline-flex items-center gap-2.5 flex-wrap mt-1">
      <StatusBadge status={user.status} label={user.status === "active" ? t("users.status.active") : t("users.status.inactive")} />
      <span>{user.username} · <span className="font-mono">{user.employeeId}</span></span>
    </span>
  ) : t("users.drawer.requiredHint");

  const title = (
    <span className="flex items-center gap-3.5 min-w-0">
      {user && (
        <span aria-hidden="true" className={`w-11 h-11 rounded-full text-[15px] font-semibold flex items-center justify-center flex-shrink-0 ${user.status === "active" ? "bg-[#e8edf7] text-[#1a3a6b]" : "bg-[#eef1f6] text-[#8a97ad]"}`}>
          {initials(user.fullName || "?")}
        </span>
      )}
      <span className="flex flex-col min-w-0">
        <span className="text-[13px] font-normal text-muted-foreground">{t("users.drawer.kicker")}</span>
        <span className="truncate">{user ? user.fullName : t("users.createTitle")}</span>
      </span>
    </span>
  );

  const footerLeft = user ? (
    <MoreMenu
      align="left"
      items={[
        {
          key: "reset",
          label: t("users.action.resetPassword"),
          hint: t("users.resetPasswordFor").replace("{name}", user.fullName),
          icon: KeyRound,
          onSelect: () => onResetPassword(user),
        },
        {
          key: "status",
          label: user.status === "active" ? t("users.action.suspend") : t("users.action.activate"),
          hint: statusBlockedReason || (user.status === "active" ? t("users.menu.suspendHint") : t("users.menu.activateHint")),
          icon: user.status === "active" ? UserX : UserCheck,
          disabled: !!statusBlockedReason,
          onSelect: () => onToggleStatus(user),
        },
        {
          key: "delete",
          label: t("users.action.deleteUser"),
          hint: deleteBlocked ? t("users.menu.deleteBlocked") : t("users.menu.deleteHint"),
          icon: Trash2,
          danger: true,
          disabled: deleteBlocked,
          onSelect: () => onDelete(user),
        },
      ]}
    />
  ) : undefined;

  const footerRight = (
    <>
      <button type="button" onClick={onClose} disabled={saving} className={btn.secondary}>{t("common.cancel")}</button>
      <button type="submit" form={formId} disabled={saving} className={`${btn.primary} min-w-[88px]`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : t("common.save")}
      </button>
    </>
  );

  const input = (key: "fullName" | "employeeId" | "phone" | "username" | "email" | "position") => ({
    id: ids[key],
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  return (
    <Drawer open title={title} subtitle={subtitle} onClose={onClose} busy={saving || locked} footerLeft={footerLeft} footerRight={footerRight}>
      <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-6">
        {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}

        <Group title={t("users.section.employee")}>
          <Field label={plain(t("users.field.fullName"))} htmlFor={ids.fullName} required>
            <input {...input("fullName")} autoFocus={!user} className={`${field.input} w-full`} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={plain(t("users.field.employeeId"))} htmlFor={ids.employeeId} required>
              <input {...input("employeeId")} className={`${field.input} w-full font-mono`} />
            </Field>
            <Field label={t("users.field.phone")} htmlFor={ids.phone}>
              <input {...input("phone")} className={`${field.input} w-full`} />
            </Field>
          </div>
        </Group>

        <Divider />

        <Group title={t("users.section.account")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={plain(t("users.field.username"))} htmlFor={ids.username} required>
              <input {...input("username")} autoComplete="off" className={`${field.input} w-full`} />
            </Field>
            <Field label={plain(t("users.field.email"))} htmlFor={ids.email} required>
              <input {...input("email")} type="email" className={`${field.input} w-full`} />
            </Field>
          </div>
          {!user && (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={plain(t("users.field.initialPassword"))} htmlFor={ids.password} required>
                  <input id={ids.password} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} className={`${field.input} w-full`} />
                </Field>
                <Field label={plain(t("users.field.confirmPassword"))} htmlFor={ids.confirm} required>
                  <input id={ids.confirm} type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} className={`${field.input} w-full`} />
                </Field>
              </div>
              <p className={field.help}>{t("users.errorPasswordLength")}</p>
            </div>
          )}
        </Group>

        <Divider />

        <Group title={t("users.section.access")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t("users.field.position")} htmlFor={ids.position}>
              <input {...input("position")} list={ids.positions} className={`${field.input} w-full`} />
              <datalist id={ids.positions}>{POSITION_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label={plain(t("users.field.role"))} htmlFor={ids.role} required help={isSelf ? t("users.ownRoleLockedHint") : undefined}>
              <SelectBox id={ids.role} value={form.roleKey} onChange={(e) => set("roleKey", e.target.value)} disabled={isSelf}>
                {!form.roleKey && <option value="" disabled>{t("users.field.role.placeholder")}</option>}
                {assignableRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                {/* บทบาทปัจจุบันที่ผู้แก้ไขมอบให้ไม่ได้ (Super Admin) ยังต้องแสดงชื่อไว้ ไม่งั้นช่องจะว่าง */}
                {role && !assignableRoles.some((r) => r.key === role.key) && <option value={role.key}>{role.name}</option>}
              </SelectBox>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <Field label={t("users.field.department")} htmlFor={ids.department} help={t("users.field.department.hint")}>
              <SelectBox id={ids.department} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value, teamId: "" }))}>
                <option value="">{t("users.field.department.none")}</option>
                {departments.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                {form.department && !departments.some((d) => d.name === form.department) && (
                  <option value={form.department}>{form.department} ({t("users.field.department.legacy")})</option>
                )}
              </SelectBox>
            </Field>
            {showTeam && (
              <Field label={t("users.field.team")} htmlFor={ids.team} help={t("users.field.team.hint")}>
                <SelectBox id={ids.team} value={form.teamId} onChange={(e) => set("teamId", e.target.value)}>
                  <option value="">{t("users.field.team.none")}</option>
                  {teamsInDepartment.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  {form.teamId && !teamsInDepartment.some((tm) => tm.id === form.teamId) && (
                    <option value={form.teamId}>{teams.find((tm) => tm.id === form.teamId)?.name ?? form.teamId} ({t("users.field.team.legacy")})</option>
                  )}
                </SelectBox>
              </Field>
            )}
          </div>
        </Group>
      </form>
    </Drawer>
  );
}
