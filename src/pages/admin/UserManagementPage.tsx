import { useEffect, useId, useMemo, useState } from "react";
import { ChevronRight, Info, KeyRound, Plus, ShieldCheck, Users as UsersIcon, X } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import type { User, UserStatus } from "../../lib/users";
import { createUser, updateUser, deleteUser, isEmployeeIdTaken, isUsernameTaken, isEmailTaken, initials } from "../../lib/users";
import type { Department } from "../../lib/departments";
import type { Team } from "../../lib/teams";
import type { Role } from "../../lib/roles";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { UserDrawer, type UserFormState } from "./UserDrawer";

type StatusTab = "all" | UserStatus;
const PAGE_SIZE = 20;

// กล่องสรุปผู้ใช้ในกล่องยืนยัน (ชื่อ · username · รหัสพนักงาน · บทบาท) ตามบอร์ด Dlg-User*
// The user summary box shown inside the confirm dialogs
function UserSummary({ user, roleName }: { user: User; roleName: string }) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-[#eef1f6] text-[#5f7293] text-[13px] font-semibold flex items-center justify-center flex-shrink-0">
        {initials(user.fullName || "?")}
      </span>
      <span className="flex-1 min-w-0 flex flex-col leading-snug">
        <span className="font-medium text-foreground truncate">{user.fullName}</span>
        <span className="text-[13px] text-[#3d5173] truncate">{user.username} · <span className="font-mono">{user.employeeId}</span></span>
      </span>
      <span className="h-[26px] px-2.5 rounded-md bg-[#eef1f6] text-[#26395a] text-[12.5px] font-medium inline-flex items-center max-w-[160px] truncate flex-shrink-0">{roleName}</span>
    </div>
  );
}

// กล่องโต้ตอบสำหรับรีเซ็ตรหัสผ่านผู้ใช้ พร้อมจัดการโฟกัสและปิดด้วย Escape (บอร์ด Dlg-UserResetPassword)
// Modal dialog for resetting a user's password, with focus trap and Escape-to-close
function ResetPasswordModal({ target, value, onChange, error, busy, onConfirm, onCancel }: {
  target: User;
  value: { password: string; confirm: string };
  onChange: (next: { password: string; confirm: string }) => void;
  error: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  const descId = useId();
  const passwordId = useId();
  const confirmId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={busy ? undefined : onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
        className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] flex flex-col">
        <form onSubmit={(e) => { e.preventDefault(); onConfirm(); }}>
          <div className="flex items-start gap-4 px-6 pt-6">
            <span className="w-11 h-11 rounded-full bg-[#e8f0fb] text-[#1a5fb4] flex items-center justify-center flex-shrink-0"><KeyRound size={20} /></span>
            <div className="flex-1 min-w-0 pt-0.5 space-y-1">
              <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{t("users.resetPasswordTitle")}</h2>
              <p id={descId} className="text-sm text-[#3d5173] leading-relaxed">{t("users.resetPasswordFor").replace("{name}", target.fullName)}</p>
            </div>
            <button type="button" onClick={onCancel} disabled={busy} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
              <X size={18} />
            </button>
          </div>
          <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
            <Field label={t("users.field.newPassword")} htmlFor={passwordId} required help={t("settings.security.lengthHint")}>
              <input id={passwordId} type="password" autoFocus autoComplete="new-password" className={`${field.input} w-full`} value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} />
            </Field>
            <Field label={t("users.field.confirmNewPassword")} htmlFor={confirmId} required>
              <input id={confirmId} type="password" autoComplete="new-password" className={`${field.input} w-full`} value={value.confirm} onChange={(e) => onChange({ ...value, confirm: e.target.value })} />
            </Field>
            {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
            <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
            <button type="submit" disabled={busy} className={btn.primary}><KeyRound size={16} /> {t("users.action.resetPassword")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// หน้าจัดการผู้ใช้งาน แสดงรายการ สร้าง แก้ไข รีเซ็ตรหัสผ่าน และเปลี่ยนสถานะผู้ใช้
// ดีไซน์ใหม่ (2026-09-30): แท็บสถานะ + ตาราง ทั้งแถวกดเปิดแผงข้อมูลผู้ใช้ (แทนไอคอนท้ายแถว)
// Manages users — list, create, edit, reset passwords, and toggle status
export function UserManagementPage({
  users,
  onUsersChange,
  roles,
  departments,
  teams,
  currentUser,
  isSuperAdmin,
  onAudit,
  initialEditId,
  onEditIdConsumed,
}: {
  users: User[];
  onUsersChange: (users: User[]) => void;
  roles: Role[];
  departments: Department[];
  teams: Team[];
  currentUser: User;
  isSuperAdmin: boolean;
  onAudit: (action: string, details: string) => void;
  initialEditId?: string | null;
  onEditIdConsumed?: () => void;
}) {
  const { t } = useI18n();

  const tourSteps: TourStep[] = [
    { element: '[data-tour="users-create"]', manual: "ch27-1", popover: { title: t("tour.users.create.title"), description: t("tour.users.create.desc"), side: "bottom" } },
    { element: '[data-tour="users-tabs"]', manual: "ch27-1", popover: { title: t("tour.users.tabs.title"), description: t("tour.users.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="users-search"]', manual: "ch27-1", popover: { title: t("tour.users.search.title"), description: t("tour.users.search.desc"), side: "bottom" } },
    { element: '[data-tour="users-table"]', manual: "ch27-1", popover: { title: t("tour.users.table.title"), description: t("tour.users.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("users", currentUser.id, tourSteps);

  /** "new" = แผงเพิ่มผู้ใช้ · id = แผงของผู้ใช้คนนั้น · null = ปิดแผง */
  const [drawerTarget, setDrawerTarget] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [page, setPage] = useState(1);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPw, setResetPw] = useState({ password: "", confirm: "" });
  const [resetError, setResetError] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [statusTarget, setStatusTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const { message, show } = useToast();

  const assignableRoles = roles.filter((r) => !r.isSuperAdmin || isSuperAdmin);
  const roleName = (roleKey: string) => roles.find((r) => r.key === roleKey)?.name ?? roleKey;

  const [appliedEditId, setAppliedEditId] = useState<string | null>(null);
  if (initialEditId && initialEditId !== appliedEditId) {
    setAppliedEditId(initialEditId);
    if (users.some((u) => u.id === initialEditId)) setDrawerTarget(initialEditId);
  }
  useEffect(() => {
    if (initialEditId) onEditIdConsumed?.();
  }, [initialEditId, onEditIdConsumed]);

  const counts = useMemo(() => ({
    all: users.length,
    active: users.filter((u) => u.status === "active").length,
    inactive: users.filter((u) => u.status !== "active").length,
  }), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => statusTab === "all" || u.status === statusTab)
      .filter((u) => !q || [u.fullName, u.employeeId, u.username, u.email, u.department, u.position].some((f) => f.toLowerCase().includes(q)));
  }, [users, search, statusTab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const superAdminCount = users.filter((u) => roles.find((r) => r.key === u.roleKey)?.isSuperAdmin).length;
  // ตรวจสอบว่าลบผู้ใช้นี้ได้หรือไม่ (ห้ามลบตัวเองหรือ Super Admin คนสุดท้าย)
  // Checks whether a user can be deleted (not self, not the last Super Admin)
  const canDelete = (u: User) => {
    if (u.id === currentUser.id) return false;
    const isTargetSuperAdmin = roles.find((r) => r.key === u.roleKey)?.isSuperAdmin;
    if (isTargetSuperAdmin && superAdminCount <= 1) return false;
    return true;
  };

  const activeSuperAdminCount = users.filter((u) => u.status === "active" && roles.find((r) => r.key === u.roleKey)?.isSuperAdmin).length;
  // ตรวจสอบว่าผู้ใช้นี้คือ Super Admin ที่ยัง active อยู่คนสุดท้ายหรือไม่
  // Checks whether the user is the last remaining active Super Admin
  const isLastActiveSuperAdmin = (u: User) =>
    u.status === "active" && !!roles.find((r) => r.key === u.roleKey)?.isSuperAdmin && activeSuperAdminCount <= 1;

  const statusBlockedReason = (u: User) =>
    u.id === currentUser.id ? t("users.menu.selfBlocked") : isLastActiveSuperAdmin(u) ? t("users.action.suspendLastSuperAdminTitle") : "";

  // บันทึกฟอร์มผู้ใช้ ตรวจสอบข้อมูลซ้ำและกฎการเปลี่ยนบทบาทก่อนสร้างหรืออัปเดต — คืนข้อความผิดพลาด (null = สำเร็จ)
  // Submits the user form — validates uniqueness and role-change rules, then creates or updates; returns an error or null
  const handleSave = async (form: UserFormState): Promise<string | null> => {
    const editingId = drawerTarget && drawerTarget !== "new" ? drawerTarget : null;
    if (!form.fullName.trim() || !form.employeeId.trim() || !form.username.trim() || !form.email.trim()) return t("users.errorRequired");
    if (!form.roleKey) return t("users.errorRoleRequired");
    if (isEmployeeIdTaken(users, form.employeeId, editingId ?? undefined)) return t("users.errorEmployeeIdTaken");
    if (isUsernameTaken(users, form.username, editingId ?? undefined)) return t("users.errorUsernameTaken");
    if (isEmailTaken(users, form.email, editingId ?? undefined)) return t("users.errorEmailTaken");

    try {
      if (!editingId) {
        if (!form.password || form.password.length < 6) return t("users.errorPasswordLength");
        if (form.password !== form.confirm) return t("users.errorPasswordMismatch");
        const created = await createUser({
          employeeId: form.employeeId, fullName: form.fullName, username: form.username, email: form.email,
          password: form.password, phone: form.phone, department: form.department, teamId: form.teamId, position: form.position, roleKey: form.roleKey,
        });
        onUsersChange([...users, created]);
        onAudit("User Created", `สร้างผู้ใช้ ${created.fullName} (${created.username}) บทบาท ${roleName(created.roleKey)}`);
        show(t("users.createdToast"));
      } else {
        const target = users.find((u) => u.id === editingId);
        const roleChanged = target && target.roleKey !== form.roleKey;
        if (editingId === currentUser.id && roleChanged) return t("users.errorOwnRoleChange");
        if (target && roleChanged && isLastActiveSuperAdmin(target) && !roles.find((r) => r.key === form.roleKey)?.isSuperAdmin) {
          return t("users.errorLastSuperAdminRoleChange");
        }
        // สถานะไม่ได้ส่งจากฟอร์มแล้ว (ดีไซน์ใหม่ 2026-09-30) — ระงับ/เปิดใช้งานผ่านเมนู "เพิ่มเติม" ที่มีกล่องยืนยัน
        const updated = await updateUser(editingId, {
          fullName: form.fullName, employeeId: form.employeeId, username: form.username, email: form.email,
          phone: form.phone, department: form.department, teamId: form.teamId, position: form.position, roleKey: form.roleKey,
        });
        onUsersChange(users.map((u) => (u.id === editingId ? updated : u)));
        onAudit("User Updated", `แก้ไขข้อมูลผู้ใช้ ${form.fullName}${roleChanged ? ` (เปลี่ยนบทบาทเป็น ${roleName(form.roleKey)})` : ""}`);
        show(t("users.savedToast"));
      }
    } catch (err) {
      return err instanceof ApiError ? err.message : t("common.errorGeneric");
    }
    setDrawerTarget(null);
    return null;
  };

  // ยืนยันการรีเซ็ตรหัสผ่านของผู้ใช้ที่เลือกไว้
  // Confirms and applies a password reset for the targeted user
  const confirmResetPassword = async () => {
    if (!resetTarget) return;
    if (resetPw.password.length < 6) { setResetError(t("users.errorPasswordLength")); return; }
    if (resetPw.password !== resetPw.confirm) { setResetError(t("users.errorPasswordMismatch")); return; }
    setResetBusy(true);
    try {
      const updated = await updateUser(resetTarget.id, { password: resetPw.password });
      onUsersChange(users.map((u) => (u.id === resetTarget.id ? updated : u)));
      onAudit("Password Reset", `รีเซ็ตรหัสผ่านให้ผู้ใช้ ${resetTarget.fullName}`);
      show(t("users.resetToast"));
      setResetTarget(null);
      setResetPw({ password: "", confirm: "" });
      setResetError("");
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : t("users.resetErrorToast"));
    } finally {
      setResetBusy(false);
    }
  };

  // ยืนยันการเปิด/ปิดใช้งานบัญชีผู้ใช้ที่เลือกไว้
  // Confirms and toggles the targeted user's active/inactive status
  const confirmToggleStatus = async () => {
    if (!statusTarget) return;
    if (statusTarget.id === currentUser.id || (statusTarget.status === "active" && isLastActiveSuperAdmin(statusTarget))) { setStatusTarget(null); return; }
    const next: UserStatus = statusTarget.status === "active" ? "inactive" : "active";
    setActionBusy(true);
    try {
      const updated = await updateUser(statusTarget.id, { status: next });
      onUsersChange(users.map((u) => (u.id === statusTarget.id ? updated : u)));
      onAudit(next === "active" ? "User Activated" : "User Deactivated", `${next === "active" ? "เปิดใช้งาน" : "ระงับการใช้งาน"}ผู้ใช้ ${statusTarget.fullName}`);
      show(next === "active" ? t("users.activatedToast") : t("users.deactivatedToast"));
    } catch (err) {
      show(err instanceof ApiError ? err.message : t("users.actionErrorToast"));
    } finally {
      setActionBusy(false);
      setStatusTarget(null);
    }
  };

  // ยืนยันการลบผู้ใช้ที่เลือกไว้
  // Confirms and deletes the targeted user
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      await deleteUser(deleteTarget.id);
      onUsersChange(users.filter((u) => u.id !== deleteTarget.id));
      onAudit("User Deleted", `ลบผู้ใช้ ${deleteTarget.fullName} (${deleteTarget.username})`);
      show(t("users.deletedToast"));
      if (drawerTarget === deleteTarget.id) setDrawerTarget(null);
    } catch (err) {
      show(err instanceof ApiError ? err.message : t("users.deleteErrorToast"));
    } finally {
      setActionBusy(false);
      setDeleteTarget(null);
    }
  };

  const drawerUser = drawerTarget && drawerTarget !== "new" ? users.find((u) => u.id === drawerTarget) ?? null : null;
  const drawerOpen = drawerTarget === "new" || drawerUser !== null;

  const tabs = [
    { key: "all" as const, label: t("quotation.filterAll"), count: counts.all },
    { key: "active" as const, label: t("users.status.active"), count: counts.active },
    { key: "inactive" as const, label: t("users.status.inactive"), count: counts.inactive },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.admin")}
        title={t("nav.users")}
        description={t("users.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={
          <button data-tour="users-create" onClick={() => setDrawerTarget("new")} className={btn.primary}>
            <Plus size={16} /> {t("users.addNew")}
          </button>
        }
      />

      <ListCard>
        {users.length === 0 ? (
          <div data-tour="users-table">
            <EmptyState icon={UsersIcon} title={t("users.notFound")} description="" compact />
          </div>
        ) : (
          <>
            <div data-tour="users-tabs">
              <ListTabs tabs={tabs} active={statusTab} onChange={(k) => { setStatusTab(k); setPage(1); }} ariaLabel={t("users.col.status")} />
            </div>
            <div data-tour="users-search">
              <ListToolbar
                search={search}
                onSearch={(v) => { setSearch(v); setPage(1); }}
                searchPlaceholder={t("users.searchPlaceholderLong")}
                count={t("ui.itemCount").replace("{n}", String(filtered.length))}
              />
            </div>

            <div data-tour="users-table">
              {filtered.length === 0 ? (
                <ListEmpty title={t("users.notFound")} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] table-fixed">
                    <thead>
                      <tr className={table.head}>
                        <th className={table.th}>{t("users.col.user")}</th>
                        <th className={`${table.th} w-[130px]`}>{t("users.col.employeeId")}</th>
                        <th className={`${table.th} w-[230px]`}>{t("users.col.deptPosition")}</th>
                        <th className={`${table.th} w-[180px]`}>{t("users.col.role")}</th>
                        <th className={`${table.th} w-[160px]`}>{t("users.col.status")}</th>
                        <th className={`${table.th} w-12`}><span className="sr-only">{t("users.action.edit")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((u) => {
                        const role = roles.find((r) => r.key === u.roleKey);
                        const off = u.status !== "active";
                        return (
                          <tr key={u.id} onClick={() => setDrawerTarget(u.id)} className={`${table.row} group cursor-pointer text-sm`}>
                            <td className={table.td}>
                              <div className="flex items-center gap-3 min-w-0">
                                <span aria-hidden="true" className={`w-[34px] h-[34px] rounded-full text-[13px] font-semibold flex items-center justify-center flex-shrink-0 ${off ? "bg-[#eef1f6] text-[#8a97ad]" : "bg-[#e8edf7] text-[#1a3a6b]"}`}>
                                  {initials(u.fullName || "?")}
                                </span>
                                <span className="flex flex-col min-w-0 leading-snug">
                                  <span className="flex items-center gap-1.5 min-w-0">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setDrawerTarget(u.id); }}
                                      aria-label={`${t("users.action.edit")} ${u.fullName}`}
                                      className="font-medium text-foreground truncate text-left rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40"
                                    >
                                      {u.fullName}
                                    </button>
                                    {role?.isSuperAdmin && <ShieldCheck size={14} className="text-[#7d6420] flex-shrink-0" aria-label="Super Admin" />}
                                  </span>
                                  <span className="text-xs text-muted-foreground truncate">{u.username} · {u.email}</span>
                                </span>
                              </div>
                            </td>
                            <td className={`${table.td} font-mono text-[13px] text-[#3d5173]`}>{u.employeeId}</td>
                            <td className={table.td}>
                              <span className={`block truncate ${u.department ? "text-foreground" : "text-[#8a97ad]"}`}>{u.department || t("common.dash")}</span>
                              {u.position && <span className="block text-xs text-muted-foreground truncate">{u.position}</span>}
                            </td>
                            <td className={table.td}>
                              <span className="h-[26px] px-2.5 rounded-md bg-[#eef1f6] text-[#26395a] text-[12.5px] font-medium inline-flex items-center max-w-full truncate">{role?.name ?? u.roleKey}</span>
                            </td>
                            <td className={table.td}>
                              <StatusBadge status={u.status} label={u.status === "active" ? t("users.status.active") : t("users.status.inactive")} />
                            </td>
                            <td className={`${table.td} text-right`}>
                              <ChevronRight size={18} aria-hidden="true" className="inline text-[#a3aec2] group-hover:text-foreground transition-colors" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {filtered.length > 0 && (
              <ListPagination
                page={currentPage}
                pageCount={pageCount}
                from={(currentPage - 1) * PAGE_SIZE + 1}
                to={Math.min(currentPage * PAGE_SIZE, filtered.length)}
                total={filtered.length}
                onPage={setPage}
              />
            )}
          </>
        )}
      </ListCard>

      {drawerOpen && (
        <UserDrawer
          key={drawerTarget ?? ""}
          user={drawerUser}
          currentUser={currentUser}
          roles={roles}
          assignableRoles={assignableRoles}
          departments={departments}
          teams={teams}
          locked={resetTarget !== null || statusTarget !== null || deleteTarget !== null}
          statusBlockedReason={drawerUser ? statusBlockedReason(drawerUser) : ""}
          deleteBlocked={drawerUser ? !canDelete(drawerUser) : true}
          onSave={handleSave}
          onClose={() => setDrawerTarget(null)}
          onResetPassword={(u) => { setResetTarget(u); setResetPw({ password: "", confirm: "" }); setResetError(""); }}
          onToggleStatus={setStatusTarget}
          onDelete={setDeleteTarget}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          target={resetTarget}
          value={resetPw}
          onChange={setResetPw}
          error={resetError}
          busy={resetBusy}
          onConfirm={() => void confirmResetPassword()}
          onCancel={() => { if (!resetBusy) { setResetTarget(null); setResetError(""); } }}
        />
      )}

      <ConfirmDialog
        open={!!statusTarget}
        title={statusTarget?.status === "active" ? t("users.suspendAccountTitle") : t("users.activateAccountTitle")}
        message={
          statusTarget?.status === "active"
            ? `${t("users.suspendConfirmMessage").replace("{name}", statusTarget?.fullName ?? "")} ${t("users.menu.suspendHint")}`
            : `${t("users.activateConfirmMessage").replace("{name}", statusTarget?.fullName ?? "")} ${t("users.activateConfirmDetail")}`
        }
        confirmLabel={statusTarget?.status === "active" ? t("users.action.suspend") : t("users.action.activate")}
        danger={statusTarget?.status === "active"}
        summary={statusTarget ? <UserSummary user={statusTarget} roleName={roleName(statusTarget.roleKey)} /> : undefined}
        busy={actionBusy}
        onConfirm={() => void confirmToggleStatus()}
        onCancel={() => setStatusTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title={t("users.deleteConfirmTitle")}
        message={t("users.deleteConfirmMessage").replace("{name}", deleteTarget?.fullName ?? "")}
        danger
        confirmLabel={t("users.action.deleteUser")}
        summary={deleteTarget ? (
          <div className="flex flex-col gap-2.5">
            <UserSummary user={deleteTarget} roleName={roleName(deleteTarget.roleKey)} />
            <p className="flex items-start gap-2 text-[13px] text-[#3d5173]"><Info size={15} className="text-[#1a5fb4] flex-shrink-0 mt-0.5" />{t("users.deleteSuggestSuspend")}</p>
          </div>
        ) : undefined}
        busy={actionBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
