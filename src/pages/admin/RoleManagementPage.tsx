import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Lock, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import type { Role } from "../../lib/roles";
import { isPermissionLockedToSuperAdmin, createRole, updateRole, deleteRole } from "../../lib/roles";
import { ALL_PERMISSIONS, PERMISSION_LABEL_KEY, permissionsRequiring, withPermissionDependencies, type Permission } from "../../lib/permissions";
import type { User } from "../../lib/users";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toast } from "../../components/Toast";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListPageHeader, ListCard } from "../../components/ui/ListPage";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field, surface, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";
import {
  buildPermissionMatrix, COLUMN_LABEL_KEY, EXTRA_SHORT_LABEL_KEY, MATRIX_COLUMNS, RESOURCE_LABEL_KEY, actionOf, type MatrixSection,
} from "./permissionMatrix";

type View = "list" | "create" | "edit" | "view";

interface RoleFormState {
  name: string;
  description: string;
  permissions: Permission[];
}

const MATRIX: MatrixSection[] = buildPermissionMatrix();
/** คอลัมน์ของตาราง: ชื่อเมนู 220 · 9 ช่องติ๊ก 60 · "สิทธิ์อื่น ๆ" ที่เหลือ (บอร์ด Roles-Edit) */
const MATRIX_GRID = "grid grid-cols-[220px_repeat(9,60px)_minmax(160px,1fr)]";

// สร้างค่าเริ่มต้นว่างสำหรับฟอร์มบทบาท
// Returns an empty role form state
function emptyForm(): RoleFormState {
  return { name: "", description: "", permissions: [] };
}

// หน้าจัดการบทบาทและสิทธิ์การใช้งาน — รายการเป็นตาราง (ดีไซน์ใหม่ 2026-09-30) คลิกแถวเปิดหน้าตารางสิทธิ์เต็มหน้า
// Manages roles and permissions — list as a table; a row opens the full-page permission matrix (view/create/edit)
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

  // ทัวร์นี้ครอบเฉพาะหน้ารายการ — หน้าแก้บทบาท (RoleEditor) ยังไม่มีปุ่มเปิดคำแนะนำของตัวเอง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="roles-create"]', manual: "ch27-2", popover: { title: t("tour.roles.create.title"), description: t("tour.roles.create.desc"), side: "bottom" } },
    { element: '[data-tour="roles-list"]', manual: "ch27-2", popover: { title: t("tour.roles.list.title"), description: t("tour.roles.list.desc"), side: "top" } },
    { element: '[data-tour="roles-system"]', manual: "ch27-2", popover: { title: t("tour.roles.system.title"), description: t("tour.roles.system.desc"), side: "left" } },
  ];
  const tour = useModuleTour("roles", currentUserId, tourSteps);

  const [view, setView] = useState<View>("list");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const { message, show } = useToast();

  const usersWithRole = (roleKey: string) => users.filter((u) => u.roleKey === roleKey).length;
  const editingRole = roles.find((r) => r.key === editingKey);

  const startCreate = () => { setEditingKey(null); setView("create"); };
  // เปิดบทบาท — Super Admin เปิดแบบดูอย่างเดียว บทบาทอื่นแก้ไขได้
  // Opens a role — Super Admin opens view-only, every other role is editable
  const startEdit = (r: Role) => { setEditingKey(r.key); setView(r.isSuperAdmin ? "view" : "edit"); };
  const backToList = () => { setView("list"); setEditingKey(null); };

  if (view !== "list") {
    return (
      <>
        <RoleEditor
          key={`${view}:${editingKey ?? ""}`}
          mode={view}
          role={editingRole}
          roles={roles}
          userCount={editingRole ? usersWithRole(editingRole.key) : 0}
          currentUserId={currentUserId}
          onRolesChange={onRolesChange}
          onAudit={onAudit}
          onToast={show}
          onDone={backToList}
        />
        <Toast message={message} />
      </>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.admin")}
        title={t("nav.roles")}
        description={t("roles.pageHint")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={
          <button data-tour="roles-create" onClick={startCreate} className={btn.primary}>
            <Plus size={16} /> {t("roles.createNew")}
          </button>
        }
      />

      <ListCard>
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#eef1f6]">
          <h2 className={`${surface.cardTitle} flex-1`}>{t("roles.listTitle")}</h2>
          <span className="text-[13px] text-muted-foreground">
            {t("roles.listSummary").replace("{roles}", String(roles.length)).replace("{users}", String(users.length))}
          </span>
        </div>
        <div data-tour="roles-list" className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed">
            <thead>
              <tr className={table.head}>
                <th className={table.th}>{t("roles.col.role")}</th>
                <th className={`${table.th} w-[140px] text-right`}>{t("roles.col.permissions")}</th>
                <th className={`${table.th} w-[140px] text-right`}>{t("roles.col.users")}</th>
                <th className={`${table.th} w-[190px]`}>{t("roles.col.type")}</th>
                <th className={`${table.th} w-12`}><span className="sr-only">{t("roles.viewDetails")}</span></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const count = usersWithRole(r.key);
                const openLabel = `${r.isSuperAdmin ? t("roles.viewDetails") : t("common.edit")} ${r.name}`;
                return (
                  <tr key={r.key} onClick={() => startEdit(r)} className={`${table.row} group cursor-pointer text-sm`}>
                    <td className={table.td}>
                      <span className="flex flex-col min-w-0 leading-snug">
                        <span className="flex items-center gap-1.5 min-w-0">
                          {r.isSuperAdmin && <ShieldCheck size={15} className="text-[#7d6420] flex-shrink-0" aria-hidden="true" />}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                            aria-label={openLabel}
                            className="font-semibold text-foreground truncate text-left rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40"
                          >
                            {r.name}
                          </button>
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{r.description || t("common.dash")}</span>
                      </span>
                    </td>
                    <td className={`${table.td} text-right tabular-nums text-[#3d5173]`}>
                      {r.isSuperAdmin ? t("roles.allPermissions") : t("roles.permissionCount").replace("{n}", String(r.permissions.length))}
                    </td>
                    <td className={`${table.td} text-right tabular-nums ${count > 0 ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>
                      {t("roles.userCount").replace("{n}", String(count))}
                    </td>
                    <td className={table.td}>
                      {r.isSystem ? (
                        <span data-tour="roles-system" className="h-[26px] px-2.5 rounded-md bg-[#eef1f6] text-[#26395a] text-[12.5px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap">
                          <Lock size={13} aria-hidden="true" /> {t("roles.systemBadge")}
                        </span>
                      ) : (
                        <span className="text-[#8a97ad]">{t("common.dash")}</span>
                      )}
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
      </ListCard>
      <Toast message={message} />
    </div>
  );
}

type BoxState = "on" | "off" | "pinned" | "locked" | "roOn" | "roOff";

// ช่องติ๊กของตารางสิทธิ์ (บอร์ด Roles-Edit): ติ๊ก = กรมท่า · ติ๊กอัตโนมัติจากสิทธิ์อื่น = เทา ล็อก · สงวนให้ Super Admin = กุญแจ ·
// โหมดดูอย่างเดียว = เครื่องหมายถูกล้วน
// A matrix tick box: on/off · pinned (auto-ticked dependency) · Super-Admin-only lock · read-only check
function PermissionBox({ state, label, title, onToggle, small = false, children }: {
  state: BoxState;
  label: string;
  title: string;
  onToggle: () => void;
  small?: boolean;
  children?: ReactNode;
}) {
  const size = small ? "w-4 h-4" : "w-[18px] h-[18px]";
  const iconSize = small ? 11 : 12;
  if (state === "roOn" || state === "roOff") {
    return (
      <span role={state === "roOn" ? "img" : undefined} aria-label={state === "roOn" ? label : undefined} title={label} className="inline-flex items-center gap-2 text-[13px] text-foreground leading-snug">
        {state === "roOn" ? <Check size={16} className="text-[#0b1d3a] flex-shrink-0" aria-hidden="true" /> : <span className={`${size} flex-shrink-0`} aria-hidden="true" />}
        {children}
      </span>
    );
  }
  const disabled = state === "pinned" || state === "locked";
  const boxCls =
    state === "on" ? "border-[#0b1d3a] bg-[#0b1d3a] text-white"
    : state === "pinned" ? "border-[#8a97ad] bg-[#8a97ad] text-white"
    : state === "locked" ? "border-[#d6dce6] bg-[#eef1f6] text-[#8a97ad]"
    : "border-[#a3aec2] bg-white";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "on" || state === "pinned"}
      aria-disabled={disabled}
      aria-label={label}
      title={title}
      onClick={() => { if (!disabled) onToggle(); }}
      className={`inline-flex items-start gap-2 text-left rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 ${disabled ? "cursor-not-allowed" : "cursor-pointer"} ${children ? "text-[13px] leading-snug" : ""} ${state === "locked" ? "text-[#8a97ad]" : "text-foreground"}`}
    >
      <span aria-hidden="true" className={`${size} ${children ? "mt-px" : ""} rounded border-[1.5px] flex items-center justify-center flex-shrink-0 ${boxCls}`}>
        {(state === "on" || state === "pinned") && <Check size={iconSize} strokeWidth={3} />}
        {state === "locked" && <Lock size={iconSize - 1} />}
      </span>
      {children}
    </button>
  );
}

// หน้าเดียวสำหรับดู/สร้าง/แก้ไขบทบาท (บอร์ด Roles-View / Roles-Create / Roles-Edit) — แถบหัวติดด้านบนพร้อมปุ่มบันทึก
// ส่งรายการสิทธิ์ชุดเดียวกับฟอร์มเดิมทุกประการ (name/description/permissions) — เซิร์ฟเวอร์ทำ sanitizeRolePermissions ซ้ำเสมอ
// The single view/create/edit page with a sticky header save; saves exactly the same payload the old form did
function RoleEditor({ mode, role, roles, userCount, currentUserId, onRolesChange, onAudit, onToast, onDone }: {
  mode: Exclude<View, "list">;
  role: Role | undefined;
  roles: Role[];
  userCount: number;
  currentUserId: string;
  onRolesChange: (roles: Role[]) => void;
  onAudit: (action: string, details: string) => void;
  onToast: (message: string) => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState<RoleFormState>(() =>
    role && mode !== "create" ? { name: role.name, description: role.description, permissions: [...role.permissions] } : emptyForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const formId = useId();
  const nameId = useId();
  const descriptionId = useId();
  // หน้า Super Admin (ดูอย่างเดียว) ไม่มีปุ่มบันทึก — ทัวร์ข้ามขั้นแรกเอง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="roleedit-actions"]', manual: "ch27-2", popover: { title: t("tour.roleEdit.actions.title"), description: t("tour.roleEdit.actions.desc"), side: "bottom" } },
    { element: '[data-tour="roleedit-info"]', manual: "ch27-2", popover: { title: t("tour.roleEdit.info.title"), description: t("tour.roleEdit.info.desc"), side: "bottom" } },
    { element: '[data-tour="roleedit-matrix"]', manual: "ch27-2", popover: { title: t("tour.roleEdit.matrix.title"), description: t("tour.roleEdit.matrix.desc"), side: "bottom" } },
    { element: '[data-tour="roleedit-visibility"]', manual: "ch27-2", popover: { title: t("tour.roleEdit.visibility.title"), description: t("tour.roleEdit.visibility.desc"), side: "bottom" } },
    { element: '[data-tour="roleedit-other"]', manual: "ch27-2", popover: { title: t("tour.roleEdit.other.title"), description: t("tour.roleEdit.other.desc"), side: "bottom" } },
  ];
  const tour = useModuleTour("roleEditor", currentUserId, tourSteps);

  // ความสูงของแถบหัวที่ติดด้านบน — หัวตารางสิทธิ์ติดอยู่ใต้แถบนี้พอดี (แถบสูงไม่เท่ากันเมื่อปุ่มตกบรรทัด)
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.offsetHeight);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const readOnly = mode === "view";
  const nameLocked = readOnly || !!role?.isSystem;
  const allTicked = readOnly && !!role?.isSuperAdmin;
  const has = (p: Permission) => allTicked || form.permissions.includes(p);

  // สิทธิ์อื่นที่ติ๊กอยู่และจำเป็นต้องใช้สิทธิ์นี้ร่วมด้วย
  // Currently-ticked permissions that would break if `p` were removed (see PERMISSION_DEPENDENCIES).
  const requiredBy = (p: Permission) => permissionsRequiring(p, form.permissions);

  const togglePermission = (p: Permission) => {
    if (readOnly || isPermissionLockedToSuperAdmin(p)) return;
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

  const boxFor = (p: Permission): { state: BoxState; label: string; title: string } => {
    const label = t(PERMISSION_LABEL_KEY[p]);
    if (readOnly) return { state: has(p) ? "roOn" : "roOff", label, title: label };
    if (isPermissionLockedToSuperAdmin(p)) return { state: "locked", label, title: `${label} — ${t("roles.permissionsLockHint")}` };
    const dependents = has(p) ? requiredBy(p) : [];
    if (dependents.length > 0) {
      return { state: "pinned", label, title: t("roles.permissionRequiredBy").replace("{names}", dependents.map((d) => t(PERMISSION_LABEL_KEY[d])).join(", ")) };
    }
    return { state: has(p) ? "on" : "off", label, title: label };
  };

  // บันทึกฟอร์มบทบาท ตรวจสอบชื่อซ้ำก่อนสร้างหรืออัปเดตบทบาท
  // Submits the role form — validates the name then creates or updates the role
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || saving) return;
    if (!form.name.trim()) { setError(t("roles.errorNameRequired")); return; }
    const nameTaken = roles.some((r) => r.name.trim().toLowerCase() === form.name.trim().toLowerCase() && r.key !== role?.key);
    if (nameTaken) { setError(t("roles.errorNameTaken")); return; }

    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createRole({ name: form.name.trim(), description: form.description.trim(), permissions: form.permissions });
        onRolesChange([...roles, created]);
        onAudit("Role Changed", `สร้างบทบาทใหม่ "${created.name}"`);
        onToast(t("roles.createdToast"));
      } else if (role) {
        const updated = await updateRole(role.key, { name: form.name.trim(), description: form.description.trim(), permissions: form.permissions });
        onRolesChange(roles.map((r) => (r.key === role.key ? updated : r)));
        onAudit("Permission Changed", `แก้ไขสิทธิ์ของบทบาท "${form.name.trim()}"`);
        onToast(t("common.savedNote"));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
      setSaving(false);
      return;
    }
    setSaving(false);
    onDone();
  };

  // ยืนยันการลบบทบาทนี้
  // Confirms and deletes this role
  const runDelete = async () => {
    if (!role) return;
    setDeleting(true);
    try {
      await deleteRole(role.key);
      onRolesChange(roles.filter((r) => r.key !== role.key));
      onAudit("Role Changed", `ลบบทบาท "${role.name}"`);
      onToast(t("roles.deletedToast"));
      setDeleting(false);
      setConfirmDelete(false);
      onDone();
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : t("roles.deleteErrorToast"));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const selectedCount = ALL_PERMISSIONS.filter(has).length;
  const deleteBlockedReason = role?.isSystem ? t("roles.deleteSystemTitle") : userCount > 0 ? t("roles.deleteInUseTitle") : "";
  const title = mode === "create" ? t("roles.createNew") : role?.name ?? "";
  const meta = mode === "create" ? null
    : `${allTicked ? t("roles.allPermissions") : t("roles.permissionCount").replace("{n}", String(form.permissions.length))} · ${t("roles.userCount").replace("{n}", String(userCount))}`;

  const sectionCount = (perms: Permission[]) => {
    const n = perms.filter(has).length;
    return (
      <span className={`text-[12.5px] tabular-nums ${n > 0 ? "text-[#1a5fb4]" : "text-[#8a97ad]"}`}>
        {t("roles.selectedInGroup").replace("{n}", String(n)).replace("{total}", String(perms.length))}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div ref={headerRef} className="sticky top-0 z-20 bg-white border-b border-border px-4 md:px-8 pt-3.5 pb-4 flex flex-col gap-2.5">
        <button type="button" onClick={onDone} className="self-start inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40">
          <ChevronLeft size={16} /> {t("roles.backToList")}
        </button>
        <div className="flex items-center gap-x-3.5 gap-y-2.5 flex-wrap min-h-10">
          {readOnly && <ShieldCheck size={20} className="text-[#7d6420] flex-shrink-0" aria-hidden="true" />}
          <h1 className="text-[22px] font-semibold leading-tight text-foreground min-w-0 break-words">{title}</h1>
          {readOnly && (
            <span className="h-[26px] px-2.5 rounded-full bg-[#eef1f6] text-[#3d5173] text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap">
              <Lock size={13} aria-hidden="true" /> {t("roles.viewOnlyBadge")}
            </span>
          )}
          {!readOnly && role?.isSystem && (
            <span className="h-[26px] px-2.5 rounded-full bg-[#eef1f6] text-[#3d5173] text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap">
              <Lock size={13} aria-hidden="true" /> {t("roles.nameLockedBadge")}
            </span>
          )}
          {meta && <span className="text-[13px] text-muted-foreground tabular-nums">{meta}</span>}
          <span className="flex-1" />
          <TourReplayButton variant="title" onClick={tour.start} />
          <div data-tour={readOnly ? undefined : "roleedit-actions"} className="flex items-center gap-2.5">
            {readOnly ? (
              <button type="button" onClick={onDone} className={btn.secondary}>{t("common.close")}</button>
            ) : (
              <>
                <button type="button" onClick={onDone} disabled={saving} className={btn.secondary}>{t("common.cancel")}</button>
                {mode === "edit" && (
                  <MoreMenu
                    items={[{
                      key: "delete",
                      label: t("roles.deleteAction"),
                      hint: deleteBlockedReason || t("roles.menu.deleteHint"),
                      icon: Trash2,
                      danger: true,
                      disabled: !!deleteBlockedReason,
                      onSelect: () => setConfirmDelete(true),
                    }]}
                  />
                )}
                <button type="submit" form={formId} disabled={saving} className={btn.primary}>
                  <Save size={16} /> {t("common.save")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate className="px-4 md:px-8 pt-6 pb-10 flex flex-col gap-5">
        {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}

        <section data-tour="roleedit-info" className={surface.card}>
          <div className={surface.cardHead}><h2 className={surface.cardTitle}>{t("roles.sectionInfo")}</h2></div>
          <div className="px-6 pt-5 pb-6 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-5">
            {readOnly ? (
              <>
                <ReadonlyField label={t("roles.nameLabel").replace(/\s*\*$/, "")} value={form.name} />
                <ReadonlyField label={t("roles.descriptionLabel")} value={form.description || t("common.dash")} />
              </>
            ) : (
              <>
                <Field label={t("roles.nameLabel").replace(/\s*\*$/, "")} htmlFor={nameId} required>
                  <input id={nameId} disabled={nameLocked} autoFocus={mode === "create"} placeholder={t("roles.namePlaceholder")} className={`${field.input} w-full`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </Field>
                <Field label={t("roles.descriptionLabel")} htmlFor={descriptionId}>
                  <input id={descriptionId} placeholder={t("roles.descriptionPlaceholder")} className={`${field.input} w-full`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </Field>
              </>
            )}
          </div>
        </section>

        <section className={surface.card}>
          <div className="px-5 pt-4 pb-3.5 border-b border-[#eef1f6] flex flex-col gap-2.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className={`${surface.cardTitle} flex-1`}>{t("roles.permissionsTitle")}</h2>
              <span className="h-[26px] px-2.5 rounded-full bg-[#e8f0fb] text-[#1a5fb4] text-[12.5px] font-semibold inline-flex items-center tabular-nums">
                {allTicked ? t("roles.allPermissions") : t("roles.selectedTotal").replace("{n}", String(selectedCount)).replace("{total}", String(ALL_PERMISSIONS.length))}
              </span>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="w-4 h-4 rounded border-[1.5px] border-[#d6dce6] bg-[#eef1f6] text-[#8a97ad] flex items-center justify-center flex-shrink-0"><Lock size={10} /></span>
                  {t("roles.legend.locked")}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="w-4 h-4 rounded border-[1.5px] border-[#8a97ad] bg-[#8a97ad] text-white flex items-center justify-center flex-shrink-0"><Check size={11} strokeWidth={3} /></span>
                  {t("roles.legend.pinned")}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="w-4 text-center text-[#c3ccda]">—</span>
                  {t("roles.legend.na")}
                </span>
              </div>
            )}
          </div>

          {/* จอกว้าง (xl) หัวตารางติดใต้แถบหัวเมื่อเลื่อน · จอแคบเลื่อนตารางซ้าย-ขวาได้แทน (sticky ใช้ไม่ได้ในกล่องที่เลื่อนแนวนอน) */}
          <div className="overflow-x-auto xl:overflow-visible">
            <div className="min-w-[960px] xl:min-w-0">
              <div
                data-tour="roleedit-matrix"
                style={{ top: headerHeight }}
                className={`${MATRIX_GRID} grid-rows-[26px_30px] xl:sticky z-10 px-5 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173] leading-tight`}
              >
                <span className="col-start-1 row-span-2 flex items-center">{t("roles.col.menu")}</span>
                <span data-tour="roleedit-visibility" className="col-start-2 col-span-4 row-start-1 mx-2 pb-[3px] flex items-end justify-center border-b border-[#d6dce6] font-medium text-muted-foreground">{t("roles.col.visibility")}</span>
                {MATRIX_COLUMNS.map((c, i) => (
                  <span
                    key={c}
                    style={{ gridColumnStart: i + 2 }}
                    className={`flex items-center justify-center text-center ${i < 4 ? "row-start-2" : "row-start-1 row-span-2"}`}
                  >
                    {t(COLUMN_LABEL_KEY[c])}
                  </span>
                ))}
                <span data-tour="roleedit-other" className="col-start-11 row-start-1 row-span-2 flex items-center pl-4">{t("roles.col.other")}</span>
              </div>

              {MATRIX.map((section) => (
                <div key={section.labelKey} className="flex flex-col">
                  <div className="h-11 px-5 border-t border-border flex items-center gap-2.5 bg-white">
                    <h3 className="text-[15px] font-semibold text-foreground">{t(section.labelKey)}</h3>
                    {sectionCount(section.permissions)}
                  </div>
                  {section.kind === "matrix" ? (
                    section.rows.map((row) => (
                      <div key={row.resource} className={`${MATRIX_GRID} items-center min-h-11 px-5 border-t border-[#eef1f6] hover:bg-[#f8f9fc]`}>
                        <span className="py-2.5 pr-3 text-sm font-medium leading-snug text-foreground">{t(RESOURCE_LABEL_KEY[row.resource])}</span>
                        {MATRIX_COLUMNS.map((c) => {
                          const p = row.cells[c];
                          return (
                            <span key={c} className="h-11 flex items-center justify-center">
                              {p ? <PermissionBox {...boxFor(p)} onToggle={() => togglePermission(p)} /> : <span aria-hidden="true" className="text-[#c3ccda]">—</span>}
                            </span>
                          );
                        })}
                        <span className="flex flex-wrap gap-x-[18px] gap-y-1.5 py-2.5 pl-4">
                          {row.extras.map((p) => {
                            const shortKey = EXTRA_SHORT_LABEL_KEY[actionOf(p)];
                            return (
                              <PermissionBox key={p} {...boxFor(p)} small onToggle={() => togglePermission(p)}>
                                {shortKey ? t(shortKey) : t(PERMISSION_LABEL_KEY[p])}
                              </PermissionBox>
                            );
                          })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1 px-5 pt-1.5 pb-3.5 border-t border-[#eef1f6]">
                      {section.permissions.map((p) => (
                        <span key={p} className="py-1.5">
                          <PermissionBox {...boxFor(p)} onToggle={() => togglePermission(p)}>
                            <span className="text-[13.5px] leading-normal">{t(PERMISSION_LABEL_KEY[p])}</span>
                          </PermissionBox>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </form>

      <ConfirmDialog
        open={confirmDelete && !!role}
        title={t("roles.deleteConfirmTitle")}
        message={t("roles.deleteConfirmMessage").replace("{name}", role?.name ?? "")}
        danger
        confirmLabel={t("roles.deleteAction")}
        busy={deleting}
        summary={role ? (
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0 flex flex-col gap-0.5 leading-snug">
              <span className="font-medium text-foreground truncate">{role.name}</span>
              {role.description && <span className="text-xs text-muted-foreground truncate">{role.description}</span>}
            </span>
            <span className="text-[13px] text-[#3d5173] whitespace-nowrap tabular-nums">
              {t("roles.permissionCount").replace("{n}", String(role.permissions.length))} · {t("roles.userCount").replace("{n}", String(userCount))}
            </span>
          </div>
        ) : undefined}
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
