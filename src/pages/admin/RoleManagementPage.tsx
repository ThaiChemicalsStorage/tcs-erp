import { useState } from "react";
import { Plus, Pencil, Trash2, Lock, ShieldCheck } from "lucide-react";
import type { Role } from "../../lib/roles";
import { isPermissionLockedToSuperAdmin, createRole, updateRole, deleteRole } from "../../lib/roles";
import { PERMISSION_GROUPS, PERMISSION_LABELS, type Permission } from "../../lib/permissions";
import type { User } from "../../lib/users";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

type View = "list" | "create" | "edit" | "view";

interface RoleFormState {
  name: string;
  description: string;
  permissions: Permission[];
}

function emptyForm(): RoleFormState {
  return { name: "", description: "", permissions: [] };
}

export function RoleManagementPage({
  roles,
  onRolesChange,
  users,
  onAudit,
}: {
  roles: Role[];
  onRolesChange: (roles: Role[]) => void;
  users: User[];
  onAudit: (action: string, details: string) => void;
}) {
  const [view, setView] = useState<View>("list");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<RoleFormState>(emptyForm());
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const { message, show } = useToast();

  const editingRole = roles.find((r) => r.key === editingKey);

  const startCreate = () => { setForm(emptyForm()); setError(""); setEditingKey(null); setView("create"); };
  const startEdit = (r: Role) => {
    setForm({ name: r.name, description: r.description, permissions: [...r.permissions] });
    setEditingKey(r.key);
    setError("");
    setView(r.isSystem ? "view" : "edit");
  };

  const togglePermission = (p: Permission) => {
    if (isPermissionLockedToSuperAdmin(p)) return;
    setForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("กรุณากรอกชื่อบทบาท"); return; }
    const nameTaken = roles.some((r) => r.name.trim().toLowerCase() === form.name.trim().toLowerCase() && r.key !== editingKey);
    if (nameTaken) { setError("มีบทบาทชื่อนี้อยู่แล้ว"); return; }

    try {
      if (view === "create") {
        const created = await createRole({ name: form.name.trim(), description: form.description.trim(), permissions: form.permissions });
        onRolesChange([...roles, created]);
        onAudit("Role Changed", `สร้างบทบาทใหม่ "${created.name}"`);
        show("สร้างบทบาทเรียบร้อยแล้ว");
      } else if (editingKey) {
        const updated = await updateRole(editingKey, { name: form.name.trim(), description: form.description.trim(), permissions: form.permissions });
        onRolesChange(roles.map((r) => (r.key === editingKey ? updated : r)));
        onAudit("Permission Changed", `แก้ไขสิทธิ์ของบทบาท "${form.name.trim()}"`);
        show("บันทึกการเปลี่ยนแปลงแล้ว");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }
    setView("list");
    setEditingKey(null);
  };

  const usersWithRole = (roleKey: string) => users.filter((u) => u.roleKey === roleKey).length;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRole(deleteTarget.key);
      onRolesChange(roles.filter((r) => r.key !== deleteTarget.key));
      onAudit("Role Changed", `ลบบทบาท "${deleteTarget.name}"`);
      show("ลบบทบาทแล้ว");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    }
    setDeleteTarget(null);
  };

  const readOnly = view === "view";

  if (view !== "list") {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-5">
            <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              {view === "create" ? "สร้างบทบาทใหม่" : view === "view" ? `บทบาท: ${editingRole?.name}` : "แก้ไขบทบาท"}
            </h2>
            {readOnly && (
              <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground border border-border">
                <Lock size={10} /> บทบาทระบบ — ดูได้อย่างเดียว
              </span>
            )}
          </div>
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">ชื่อบทบาท *</label>
                <input disabled={readOnly} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 disabled:opacity-60" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1.5">คำอธิบาย</label>
                <input disabled={readOnly} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 disabled:opacity-60" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-foreground mb-2">สิทธิ์การเข้าถึง (Permissions)</p>
              <div className="space-y-3">
                {PERMISSION_GROUPS.map((group) => (
                  <div key={group.label} className="border border-border rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{group.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.permissions.map((p) => {
                        const locked = isPermissionLockedToSuperAdmin(p);
                        return (
                          <label key={p} className={`flex items-center gap-2 text-xs ${locked || readOnly ? "opacity-50" : "cursor-pointer"}`}>
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(p)}
                              disabled={locked || readOnly}
                              onChange={() => togglePermission(p)}
                              className="w-3.5 h-3.5 rounded border-border accent-[#c9a84c]"
                            />
                            <span className="text-foreground">{PERMISSION_LABELS[p]}</span>
                            {locked && <Lock size={10} className="text-muted-foreground" />}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                สิทธิ์ที่มีสัญลักษณ์ <Lock size={9} className="inline" /> สงวนไว้สำหรับบทบาท Super Admin เท่านั้น ไม่สามารถมอบให้บทบาทอื่นได้
              </p>
            </div>

            {error && <p className="text-xs text-[#e05252]">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setView("list"); setEditingKey(null); }} className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                {readOnly ? "ปิด" : "ยกเลิก"}
              </button>
              {!readOnly && (
                <button type="submit" className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">บันทึก</button>
              )}
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-muted-foreground">จัดการบทบาทและสิทธิ์การเข้าถึง — เฉพาะ Super Admin เท่านั้น</p>
        <button onClick={startCreate} className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
          <Plus size={15} /> สร้างบทบาทใหม่
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r) => (
          <div key={r.key} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1.5">
                {r.isSuperAdmin && <ShieldCheck size={14} className="text-[#c9a84c]" />}
                <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{r.name}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(r)} title={r.isSystem ? "ดูรายละเอียด" : "แก้ไข"} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={13} /></button>
                <button
                  onClick={() => setDeleteTarget(r)}
                  disabled={r.isSystem || usersWithRole(r.key) > 0}
                  title={r.isSystem ? "บทบาทระบบ ลบไม่ได้" : usersWithRole(r.key) > 0 ? "มีผู้ใช้งานบทบาทนี้อยู่" : "ลบบทบาท"}
                  className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">{r.description || "—"}</p>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span>{r.isSuperAdmin ? "สิทธิ์ทั้งหมด" : `${r.permissions.length} สิทธิ์`}</span>
              <span>·</span>
              <span>{usersWithRole(r.key)} ผู้ใช้งาน</span>
              {r.isSystem && <span className="flex items-center gap-1 text-[#c9a84c]"><Lock size={10} /> บทบาทระบบ</span>}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="ลบบทบาท"
        message={`ลบบทบาท "${deleteTarget?.name ?? ""}" อย่างถาวร?`}
        danger
        confirmLabel="ลบ"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
