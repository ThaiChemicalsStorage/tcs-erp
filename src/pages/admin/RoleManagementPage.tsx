import { useId, useState } from "react";
import { Plus, Pencil, Trash2, Lock, ShieldCheck, HelpCircle } from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import type { Role } from "../../lib/roles";
import { isPermissionLockedToSuperAdmin, createRole, updateRole, deleteRole } from "../../lib/roles";
import { PERMISSION_GROUPS, PERMISSION_LABEL_KEY, permissionsRequiring, withPermissionDependencies, type Permission } from "../../lib/permissions";
import type { User } from "../../lib/users";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

type View = "list" | "create" | "edit" | "view";

interface RoleFormState {
  name: string;
  description: string;
  permissions: Permission[];
}

// สร้างค่าเริ่มต้นว่างสำหรับฟอร์มบทบาท
// Returns an empty role form state
function emptyForm(): RoleFormState {
  return { name: "", description: "", permissions: [] };
}

// หน้าจัดการบทบาทและสิทธิ์การใช้งาน แสดงรายการ สร้าง แก้ไข และลบบทบาท
// Manages roles and permissions — list, create, edit, and delete roles
export function RoleManagementPage({
  roles,
  onRolesChange,
  users,
  currentUserId,
  onAudit,
}: {
  roles: Role[];
  onRolesChange: (roles: Role[]) => void;
  users: User[];
  currentUserId: string;
  onAudit: (action: string, details: string) => void;
}) {
  const { t } = useI18n();

  const tourSteps: DriveStep[] = [
    { element: '[data-tour="roles-create"]', popover: { title: t("tour.roles.create.title"), description: t("tour.roles.create.desc"), side: "bottom" } },
    { element: '[data-tour="roles-list"]', popover: { title: t("tour.roles.list.title"), description: t("tour.roles.list.desc"), side: "top" } },
  ];
  const tour = useModuleTour("roles", currentUserId, tourSteps);

  const [view, setView] = useState<View>("list");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<RoleFormState>(emptyForm());
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const { message, show } = useToast();
  const nameId = useId();
  const descriptionId = useId();

  const editingRole = roles.find((r) => r.key === editingKey);

  const startCreate = () => { setForm(emptyForm()); setError(""); setEditingKey(null); setView("create"); };
  // เริ่มแก้ไขบทบาท เปิดโหมดดูอย่างเดียวถ้าเป็น Super Admin เท่านั้น
  // Starts editing a role — Super Admin opens in view-only mode, other roles are editable
  const startEdit = (r: Role) => {
    setForm({ name: r.name, description: r.description, permissions: [...r.permissions] });
    setEditingKey(r.key);
    setError("");
    setView(r.isSuperAdmin ? "view" : "edit");
  };

  // สิทธิ์อื่นที่ติ๊กอยู่และจำเป็นต้องใช้สิทธิ์นี้ร่วมด้วย
  // Currently-ticked permissions that would break if `p` were removed (see PERMISSION_DEPENDENCIES).
  const requiredBy = (p: Permission) => permissionsRequiring(p, form.permissions);

  const togglePermission = (p: Permission) => {
    if (isPermissionLockedToSuperAdmin(p)) return;
    setForm((f) => {
      if (!f.permissions.includes(p)) {
        // Ticking pulls in whatever that permission needs, so the admin sees it happen here rather
        // than discovering the server added it on save.
        return { ...f, permissions: withPermissionDependencies([...f.permissions, p]) };
      }
      if (permissionsRequiring(p, f.permissions).length > 0) return f;
      return { ...f, permissions: f.permissions.filter((x) => x !== p) };
    });
  };

  // บันทึกฟอร์มบทบาท ตรวจสอบชื่อซ้ำก่อนสร้างหรืออัปเดตบทบาท
  // Submits the role form — validates the name then creates or updates the role
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError(t("roles.errorNameRequired")); return; }
    const nameTaken = roles.some((r) => r.name.trim().toLowerCase() === form.name.trim().toLowerCase() && r.key !== editingKey);
    if (nameTaken) { setError(t("roles.errorNameTaken")); return; }

    try {
      if (view === "create") {
        const created = await createRole({ name: form.name.trim(), description: form.description.trim(), permissions: form.permissions });
        onRolesChange([...roles, created]);
        onAudit("Role Changed", `สร้างบทบาทใหม่ "${created.name}"`);
        show(t("roles.createdToast"));
      } else if (editingKey) {
        const updated = await updateRole(editingKey, { name: form.name.trim(), description: form.description.trim(), permissions: form.permissions });
        onRolesChange(roles.map((r) => (r.key === editingKey ? updated : r)));
        onAudit("Permission Changed", `แก้ไขสิทธิ์ของบทบาท "${form.name.trim()}"`);
        show(t("common.savedNote"));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
      return;
    }
    setView("list");
    setEditingKey(null);
  };

  const usersWithRole = (roleKey: string) => users.filter((u) => u.roleKey === roleKey).length;

  // ยืนยันการลบบทบาทที่เลือกไว้
  // Confirms and deletes the currently targeted role
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRole(deleteTarget.key);
      onRolesChange(roles.filter((r) => r.key !== deleteTarget.key));
      onAudit("Role Changed", `ลบบทบาท "${deleteTarget.name}"`);
      show(t("roles.deletedToast"));
    } catch (err) {
      show(err instanceof ApiError ? err.message : t("roles.deleteErrorToast"));
    }
    setDeleteTarget(null);
  };

  const readOnly = view === "view";
  const nameLocked = readOnly || !!editingRole?.isSystem;

  if (view !== "list") {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
              {view === "create" ? t("roles.createNew") : view === "view" ? `${t("roles.viewTitlePrefix")}${editingRole?.name}` : t("roles.editTitle")}
            </h2>
            {readOnly && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                <Lock size={10} /> {t("roles.viewOnlyBadge")}
              </span>
            )}
            {!readOnly && editingRole?.isSystem && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                <Lock size={10} /> {t("roles.nameLockedBadge")}
              </span>
            )}
          </div>
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={nameId} className="text-xs font-medium text-foreground block mb-1.5">{t("roles.nameLabel")}</label>
                <input id={nameId} disabled={nameLocked} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 disabled:opacity-60" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={descriptionId} className="text-xs font-medium text-foreground block mb-1.5">{t("roles.descriptionLabel")}</label>
                <input id={descriptionId} disabled={readOnly} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 disabled:opacity-60" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-foreground mb-2">{t("roles.permissionsTitle")}</p>
              <div className="space-y-3">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label} className="border border-border rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t(group.labelKey)}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {group.permissions.map((p) => {
                        const locked = isPermissionLockedToSuperAdmin(p);
                        const dependents = requiredBy(p);
                        const pinned = dependents.length > 0;
                        const pinnedTitle = pinned
                          ? t("roles.permissionRequiredBy").replace("{names}", dependents.map((d) => t(PERMISSION_LABEL_KEY[d])).join(", "))
                          : undefined;
                        return (
                          <label
                            key={p}
                            title={pinnedTitle}
                            className={`flex items-center gap-2 text-xs ${locked || readOnly || pinned ? "opacity-50" : "cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(p)}
                              disabled={locked || readOnly || pinned}
                              onChange={() => togglePermission(p)}
                              className="w-3.5 h-3.5 rounded border-border accent-[#c9a84c]"
                            />
                            <span className="text-foreground">{t(PERMISSION_LABEL_KEY[p])}</span>
                            {locked && <Lock size={10} className="text-muted-foreground" />}
                            {!locked && pinned && <Lock size={10} className="text-muted-foreground" aria-label={pinnedTitle} />}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                {t("roles.permissionsLockHintPrefix")} <Lock size={9} className="inline" /> {t("roles.permissionsLockHint")}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">{t("roles.permissionDependencyHint")}</p>
            </div>

            {error && <p className="text-xs text-[#e05252]">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setView("list"); setEditingKey(null); }} className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                {readOnly ? t("common.close") : t("common.cancel")}
              </button>
              {!readOnly && (
                <button type="submit" className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">{t("common.save")}</button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <p className="text-xs text-muted-foreground">{t("roles.pageHint")}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={tour.start}
            title={t("tour.replay")}
            aria-label={t("tour.replay")}
            className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
          >
            <HelpCircle size={15} />
          </button>
          <button data-tour="roles-create" onClick={startCreate} className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Plus size={15} /> {t("roles.createNew")}
          </button>
        </div>
      </div>

      <div data-tour="roles-list" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r) => (
          <div key={r.key} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1.5">
                {r.isSuperAdmin && <ShieldCheck size={14} className="text-[#c9a84c]" />}
                <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{r.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(r)} title={r.isSuperAdmin ? t("roles.viewDetails") : t("common.edit")} aria-label={`${r.isSuperAdmin ? t("roles.viewDetails") : t("common.edit")} ${r.name}`} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={13} /></button>
                <button
                  onClick={() => setDeleteTarget(r)}
                  disabled={r.isSystem || usersWithRole(r.key) > 0}
                  title={r.isSystem ? t("roles.deleteSystemTitle") : usersWithRole(r.key) > 0 ? t("roles.deleteInUseTitle") : t("roles.deleteAction")}
                  aria-label={`${r.isSystem ? t("roles.deleteSystemTitle") : usersWithRole(r.key) > 0 ? t("roles.deleteInUseTitle") : t("roles.deleteAction")} ${r.name}`}
                  className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">{r.description || t("common.dash")}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{r.isSuperAdmin ? t("roles.allPermissions") : t("roles.permissionCount").replace("{n}", String(r.permissions.length))}</span>
              <span>·</span>
              <span>{t("roles.userCount").replace("{n}", String(usersWithRole(r.key)))}</span>
              {r.isSystem && <span className="flex items-center gap-1 text-[#866d28]"><Lock size={10} /> {t("roles.systemBadge")}</span>}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("roles.deleteConfirmTitle")}
        message={t("roles.deleteConfirmMessage").replace("{name}", deleteTarget?.name ?? "")}
        danger
        confirmLabel={t("common.delete")}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
