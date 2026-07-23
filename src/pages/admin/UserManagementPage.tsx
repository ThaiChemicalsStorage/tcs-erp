import { useEffect, useState } from "react";
import { Plus, Pencil, KeyRound, UserCheck, UserX, Trash2, Search, ShieldCheck } from "lucide-react";
import type { User, UserStatus } from "../../lib/users";
import { createUser, updateUser, deleteUser, isEmployeeIdTaken, isUsernameTaken, isEmailTaken, initials, POSITION_SUGGESTIONS } from "../../lib/users";
import { DOCUMENT_RECIPIENT_DEPARTMENTS } from "../../lib/documentRequirements";
import type { Role } from "../../lib/roles";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

type View = "list" | "create" | "edit";

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors";
const labelCls = "text-xs font-medium text-foreground block mb-1.5";

interface UserFormState {
  fullName: string;
  employeeId: string;
  username: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  roleKey: string;
  status: UserStatus;
  password: string;
  confirm: string;
}

function emptyForm(defaultRoleKey: string): UserFormState {
  return { fullName: "", employeeId: "", username: "", email: "", phone: "", department: "", position: "", roleKey: defaultRoleKey, status: "active", password: "", confirm: "" };
}

export function UserManagementPage({
  users,
  onUsersChange,
  roles,
  currentUser,
  isSuperAdmin,
  onAudit,
  initialEditId,
  onEditIdConsumed,
}: {
  users: User[];
  onUsersChange: (users: User[]) => void;
  roles: Role[];
  currentUser: User;
  isSuperAdmin: boolean;
  onAudit: (action: string, details: string) => void;
  /** Set by a Global Search user result click — opens that user's edit form directly, whether UserManagementPage is mounting fresh or already on-screen (see CustomersPage's identical `initialEditId` for the full rationale). */
  initialEditId?: string | null;
  onEditIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<UserFormState>(() => emptyForm(roles.find((r) => !r.isSuperAdmin)?.key ?? roles[0]?.key ?? ""));
  const [error, setError] = useState("");
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPw, setResetPw] = useState({ password: "", confirm: "" });
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const { message, show } = useToast();

  const assignableRoles = roles.filter((r) => !r.isSuperAdmin || isSuperAdmin);
  const roleName = (roleKey: string) => roles.find((r) => r.key === roleKey)?.name ?? roleKey;

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [u.fullName, u.employeeId, u.username, u.email, u.department, u.position].some((f) => f.toLowerCase().includes(q));
  });

  const startCreate = () => {
    setForm(emptyForm(assignableRoles[0]?.key ?? ""));
    setError("");
    setEditingId(null);
    setView("create");
  };
  const startEdit = (u: User) => {
    setForm({
      fullName: u.fullName, employeeId: u.employeeId, username: u.username, email: u.email, phone: u.phone,
      department: u.department, position: u.position, roleKey: u.roleKey, status: u.status, password: "", confirm: "",
    });
    setError("");
    setEditingId(u.id);
    setView("edit");
  };

  const [appliedEditId, setAppliedEditId] = useState<string | null>(null);
  if (initialEditId && initialEditId !== appliedEditId) {
    setAppliedEditId(initialEditId);
    const target = users.find((u) => u.id === initialEditId);
    if (target) startEdit(target);
  }
  useEffect(() => {
    if (initialEditId) onEditIdConsumed?.();
  }, [initialEditId, onEditIdConsumed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.employeeId.trim() || !form.username.trim() || !form.email.trim()) {
      setError(t("users.errorRequired"));
      return;
    }
    if (isEmployeeIdTaken(users, form.employeeId, editingId ?? undefined)) { setError(t("users.errorEmployeeIdTaken")); return; }
    if (isUsernameTaken(users, form.username, editingId ?? undefined)) { setError(t("users.errorUsernameTaken")); return; }
    if (isEmailTaken(users, form.email, editingId ?? undefined)) { setError(t("users.errorEmailTaken")); return; }

    try {
      if (view === "create") {
        if (!form.password || form.password.length < 6) { setError(t("users.errorPasswordLength")); return; }
        if (form.password !== form.confirm) { setError(t("users.errorPasswordMismatch")); return; }
        const created = await createUser({
          employeeId: form.employeeId, fullName: form.fullName, username: form.username, email: form.email,
          password: form.password, phone: form.phone, department: form.department, position: form.position, roleKey: form.roleKey,
        });
        onUsersChange([...users, created]);
        onAudit("User Created", `สร้างผู้ใช้ ${created.fullName} (${created.username}) บทบาท ${roleName(created.roleKey)}`);
        show(t("users.createdToast"));
      } else if (editingId) {
        const target = users.find((u) => u.id === editingId);
        const roleChanged = target && target.roleKey !== form.roleKey;
        if (editingId === currentUser.id && roleChanged) { setError(t("users.errorOwnRoleChange")); return; }
        if (target && roleChanged && isLastActiveSuperAdmin(target) && !roles.find((r) => r.key === form.roleKey)?.isSuperAdmin) {
          setError(t("users.errorLastSuperAdminRoleChange"));
          return;
        }
        const updated = await updateUser(editingId, {
          fullName: form.fullName, employeeId: form.employeeId, username: form.username, email: form.email,
          phone: form.phone, department: form.department, position: form.position, roleKey: form.roleKey, status: form.status,
        });
        onUsersChange(users.map((u) => (u.id === editingId ? updated : u)));
        onAudit("User Updated", `แก้ไขข้อมูลผู้ใช้ ${form.fullName}${roleChanged ? ` (เปลี่ยนบทบาทเป็น ${roleName(form.roleKey)})` : ""}`);
        show(t("users.savedToast"));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
      return;
    }
    setView("list");
    setEditingId(null);
  };

  const confirmResetPassword = async () => {
    if (!resetTarget) return;
    if (resetPw.password.length < 6) { setError(t("users.errorPasswordLength")); return; }
    if (resetPw.password !== resetPw.confirm) { setError(t("users.errorPasswordMismatch")); return; }
    try {
      const updated = await updateUser(resetTarget.id, { password: resetPw.password });
      onUsersChange(users.map((u) => (u.id === resetTarget.id ? updated : u)));
      onAudit("Password Reset", `รีเซ็ตรหัสผ่านให้ผู้ใช้ ${resetTarget.fullName}`);
      show(t("users.resetToast"));
      setResetTarget(null);
      setResetPw({ password: "", confirm: "" });
      setError("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("users.resetErrorToast"));
    }
  };

  const confirmToggleStatus = async () => {
    if (!statusTarget) return;
    if (statusTarget.status === "active" && isLastActiveSuperAdmin(statusTarget)) { setStatusTarget(null); return; }
    const next: UserStatus = statusTarget.status === "active" ? "inactive" : "active";
    try {
      const updated = await updateUser(statusTarget.id, { status: next });
      onUsersChange(users.map((u) => (u.id === statusTarget.id ? updated : u)));
      onAudit(next === "active" ? "User Activated" : "User Deactivated", `${next === "active" ? "เปิดใช้งาน" : "ระงับการใช้งาน"}ผู้ใช้ ${statusTarget.fullName}`);
      show(next === "active" ? t("users.activatedToast") : t("users.deactivatedToast"));
    } catch (err) {
      show(err instanceof ApiError ? err.message : t("users.actionErrorToast"));
    }
    setStatusTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      onUsersChange(users.filter((u) => u.id !== deleteTarget.id));
      onAudit("User Deleted", `ลบผู้ใช้ ${deleteTarget.fullName} (${deleteTarget.username})`);
      show(t("users.deletedToast"));
    } catch (err) {
      show(err instanceof ApiError ? err.message : t("users.deleteErrorToast"));
    }
    setDeleteTarget(null);
  };

  const superAdminCount = users.filter((u) => roles.find((r) => r.key === u.roleKey)?.isSuperAdmin).length;
  const canDelete = (u: User) => {
    if (u.id === currentUser.id) return false;
    const isTargetSuperAdmin = roles.find((r) => r.key === u.roleKey)?.isSuperAdmin;
    if (isTargetSuperAdmin && superAdminCount <= 1) return false;
    return true;
  };

  const activeSuperAdminCount = users.filter((u) => u.status === "active" && roles.find((r) => r.key === u.roleKey)?.isSuperAdmin).length;
  const isLastActiveSuperAdmin = (u: User) =>
    u.status === "active" && !!roles.find((r) => r.key === u.roleKey)?.isSuperAdmin && activeSuperAdminCount <= 1;

  if (view !== "list") {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-semibold text-foreground mb-5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {view === "create" ? t("users.createTitle") : t("users.editTitle")}
          </h2>
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>{t("users.field.fullName")} <span className="text-[#e05252]">*</span></label><input className={inputCls} value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} /></div>
              <div><label className={labelCls}>{t("users.field.employeeId")} <span className="text-[#e05252]">*</span></label><input className={inputCls} value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>{t("users.field.username")} <span className="text-[#e05252]">*</span></label><input className={inputCls} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></div>
              <div><label className={labelCls}>{t("users.field.email")} <span className="text-[#e05252]">*</span></label><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>{t("users.field.phone")}</label><input className={inputCls} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div>
                <label className={labelCls}>{t("users.field.department")}</label>
                <select className={inputCls} value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}>
                  <option value="">{t("users.field.department.none")}</option>
                  {DOCUMENT_RECIPIENT_DEPARTMENTS.map((d) => <option key={d.key} value={d.label}>{d.label}</option>)}
                  {/* A legacy value predating this dropdown (added 2026-07-23 — department used to be
                      free text) is kept selectable rather than silently discarded on save; picking a
                      real option below replaces it for good. See docs/MODULES/ScopeOfWork.md
                      "Document Recipients". */}
                  {form.department && !DOCUMENT_RECIPIENT_DEPARTMENTS.some((d) => d.label === form.department) && (
                    <option value={form.department}>{form.department} ({t("users.field.department.legacy")})</option>
                  )}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">{t("users.field.department.hint")}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t("users.field.position")}</label>
                <input className={inputCls} list="position-suggestions" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
                <datalist id="position-suggestions">{POSITION_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
              </div>
              <div>
                <label className={labelCls}>{t("users.field.role")} <span className="text-[#e05252]">*</span></label>
                <select
                  className={inputCls}
                  value={form.roleKey}
                  onChange={(e) => setForm((f) => ({ ...f, roleKey: e.target.value }))}
                  disabled={editingId === currentUser.id}
                >
                  {assignableRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
                {editingId === currentUser.id && <p className="text-[10px] text-muted-foreground mt-1">{t("users.ownRoleLockedHint")}</p>}
              </div>
            </div>
            {view === "edit" && (
              <div>
                <label className={labelCls}>{t("users.field.status")}</label>
                <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as UserStatus }))} disabled={editingId === currentUser.id}>
                  <option value="active">{t("users.status.active")}</option>
                  <option value="inactive">{t("users.status.inactive")}</option>
                </select>
              </div>
            )}
            {view === "create" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelCls}>{t("users.field.initialPassword")} <span className="text-[#e05252]">*</span></label><input type="password" className={inputCls} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></div>
                <div><label className={labelCls}>{t("users.field.confirmPassword")} <span className="text-[#e05252]">*</span></label><input type="password" className={inputCls} value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} /></div>
              </div>
            )}
            {error && <p className="text-xs text-[#e05252]">{error}</p>}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setView("list"); setEditingId(null); }} className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">{t("common.cancel")}</button>
              <button type="submit" className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">{t("common.save")}</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-full sm:w-72">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("users.searchPlaceholder")} className="bg-transparent text-sm outline-none w-full text-foreground placeholder-muted-foreground" />
        </div>
        <button onClick={startCreate} className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
          <Plus size={15} /> {t("users.addNew")}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
              <th className="text-left font-medium px-4 py-3">{t("users.col.user")}</th>
              <th className="text-left font-medium px-4 py-3">{t("users.col.employeeId")}</th>
              <th className="text-left font-medium px-4 py-3">{t("users.col.deptPosition")}</th>
              <th className="text-left font-medium px-4 py-3">{t("users.col.role")}</th>
              <th className="text-left font-medium px-4 py-3">{t("users.col.status")}</th>
              <th className="text-right font-medium px-4 py-3">{t("users.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const role = roles.find((r) => r.key === u.roleKey);
              return (
                <tr key={u.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#a07830] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials(u.fullName || "?")}</div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate flex items-center gap-1">
                          {u.fullName}{role?.isSuperAdmin && <ShieldCheck size={11} className="text-[#c9a84c]" />}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{u.username} · {u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{u.employeeId}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.department || t("common.dash")} {u.position && `· ${u.position}`}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20">{role?.name ?? u.roleKey}</span></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${u.status === "active" ? "bg-[#2aa36b]/10 text-[#2aa36b] border-[#2aa36b]/20" : "bg-[#8a94a6]/10 text-[#8a94a6] border-[#8a94a6]/20"}`}>
                      {u.status === "active" ? t("users.status.active") : t("users.status.inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(u)} title={t("users.action.edit")} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => { setResetTarget(u); setResetPw({ password: "", confirm: "" }); setError(""); }} title={t("users.action.resetPassword")} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><KeyRound size={14} /></button>
                      <button
                        onClick={() => setStatusTarget(u)}
                        disabled={u.id === currentUser.id || isLastActiveSuperAdmin(u)}
                        title={isLastActiveSuperAdmin(u) ? t("users.action.suspendLastSuperAdminTitle") : u.status === "active" ? t("users.action.suspend") : t("users.action.activate")}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {u.status === "active" ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={!canDelete(u)}
                        title={t("users.action.deleteUser")}
                        className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-xs text-muted-foreground py-10">{t("users.notFound")}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={() => setResetTarget(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
            <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("users.resetPasswordTitle")}</p>
            <p className="text-xs text-muted-foreground mb-4">{t("users.resetPasswordFor").replace("{name}", resetTarget.fullName)}</p>
            <div className="space-y-3">
              <div><label className={labelCls}>{t("users.field.newPassword")}</label><input type="password" className={inputCls} value={resetPw.password} onChange={(e) => setResetPw((p) => ({ ...p, password: e.target.value }))} /></div>
              <div><label className={labelCls}>{t("users.field.confirmNewPassword")}</label><input type="password" className={inputCls} value={resetPw.confirm} onChange={(e) => setResetPw((p) => ({ ...p, confirm: e.target.value }))} /></div>
              {error && <p className="text-xs text-[#e05252]">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => { setResetTarget(null); setError(""); }} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">{t("common.cancel")}</button>
              <button onClick={confirmResetPassword} className="px-3.5 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">{t("users.resetAction")}</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!statusTarget}
        title={statusTarget?.status === "active" ? t("users.suspendAccountTitle") : t("users.activateAccountTitle")}
        message={
          statusTarget?.status === "active"
            ? t("users.suspendConfirmMessage").replace("{name}", statusTarget?.fullName ?? "")
            : t("users.activateConfirmMessage").replace("{name}", statusTarget?.fullName ?? "")
        }
        danger={statusTarget?.status === "active"}
        onConfirm={confirmToggleStatus}
        onCancel={() => setStatusTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title={t("users.deleteConfirmTitle")}
        message={t("users.deleteConfirmMessage").replace("{name}", deleteTarget?.fullName ?? "")}
        danger
        confirmLabel={t("common.delete")}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
