import { useState } from "react";
import { Plus, Pencil, KeyRound, UserCheck, UserX, Trash2, Search, ShieldCheck } from "lucide-react";
import type { User, UserStatus } from "../../lib/users";
import { newUser, isEmployeeIdTaken, isUsernameTaken, isEmailTaken, hashPassword, initials, POSITION_SUGGESTIONS, DEPARTMENT_SUGGESTIONS } from "../../lib/users";
import type { Role } from "../../lib/roles";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

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
}: {
  users: User[];
  onUsersChange: (users: User[]) => void;
  roles: Role[];
  currentUser: User;
  isSuperAdmin: boolean;
  onAudit: (action: string, details: string) => void;
}) {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.employeeId.trim() || !form.username.trim() || !form.email.trim()) {
      setError("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
      return;
    }
    if (isEmployeeIdTaken(users, form.employeeId, editingId ?? undefined)) { setError("รหัสพนักงานนี้มีผู้ใช้งานแล้ว"); return; }
    if (isUsernameTaken(users, form.username, editingId ?? undefined)) { setError("ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว"); return; }
    if (isEmailTaken(users, form.email, editingId ?? undefined)) { setError("อีเมลนี้มีผู้ใช้งานแล้ว"); return; }

    if (view === "create") {
      if (!form.password || form.password.length < 6) { setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
      if (form.password !== form.confirm) { setError("รหัสผ่านและการยืนยันไม่ตรงกัน"); return; }
      const created = newUser({ ...form, roleKey: form.roleKey });
      onUsersChange([...users, created]);
      onAudit("User Created", `สร้างผู้ใช้ ${created.fullName} (${created.username}) บทบาท ${roleName(created.roleKey)}`);
      show("สร้างผู้ใช้งานเรียบร้อยแล้ว");
    } else if (editingId) {
      const target = users.find((u) => u.id === editingId);
      const roleChanged = target && target.roleKey !== form.roleKey;
      if (editingId === currentUser.id && roleChanged) { setError("ไม่สามารถเปลี่ยนบทบาทของบัญชีตนเองได้"); return; }
      onUsersChange(users.map((u) => (u.id === editingId ? {
        ...u, fullName: form.fullName.trim(), employeeId: form.employeeId.trim(), username: form.username.trim(),
        email: form.email.trim(), phone: form.phone.trim(), department: form.department.trim(), position: form.position.trim(),
        roleKey: form.roleKey, status: form.status, updatedAt: new Date().toISOString(),
      } : u)));
      onAudit("User Updated", `แก้ไขข้อมูลผู้ใช้ ${form.fullName}${roleChanged ? ` (เปลี่ยนบทบาทเป็น ${roleName(form.roleKey)})` : ""}`);
      show("บันทึกการเปลี่ยนแปลงแล้ว");
    }
    setView("list");
    setEditingId(null);
  };

  const confirmResetPassword = () => {
    if (!resetTarget) return;
    if (resetPw.password.length < 6) { setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    if (resetPw.password !== resetPw.confirm) { setError("รหัสผ่านและการยืนยันไม่ตรงกัน"); return; }
    onUsersChange(users.map((u) => (u.id === resetTarget.id ? { ...u, passwordHash: hashPassword(resetPw.password), updatedAt: new Date().toISOString() } : u)));
    onAudit("Password Reset", `รีเซ็ตรหัสผ่านให้ผู้ใช้ ${resetTarget.fullName}`);
    show("รีเซ็ตรหัสผ่านเรียบร้อยแล้ว");
    setResetTarget(null);
    setResetPw({ password: "", confirm: "" });
    setError("");
  };

  const confirmToggleStatus = () => {
    if (!statusTarget) return;
    const next: UserStatus = statusTarget.status === "active" ? "inactive" : "active";
    onUsersChange(users.map((u) => (u.id === statusTarget.id ? { ...u, status: next, updatedAt: new Date().toISOString() } : u)));
    onAudit(next === "active" ? "User Activated" : "User Deactivated", `${next === "active" ? "เปิดใช้งาน" : "ระงับการใช้งาน"}ผู้ใช้ ${statusTarget.fullName}`);
    show(next === "active" ? "เปิดใช้งานบัญชีแล้ว" : "ระงับการใช้งานบัญชีแล้ว");
    setStatusTarget(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    onUsersChange(users.filter((u) => u.id !== deleteTarget.id));
    onAudit("User Deleted", `ลบผู้ใช้ ${deleteTarget.fullName} (${deleteTarget.username})`);
    show("ลบผู้ใช้งานแล้ว");
    setDeleteTarget(null);
  };

  const superAdminCount = users.filter((u) => roles.find((r) => r.key === u.roleKey)?.isSuperAdmin).length;
  const canDelete = (u: User) => {
    if (u.id === currentUser.id) return false;
    const isTargetSuperAdmin = roles.find((r) => r.key === u.roleKey)?.isSuperAdmin;
    if (isTargetSuperAdmin && superAdminCount <= 1) return false;
    return true;
  };

  if (view !== "list") {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-semibold text-foreground mb-5" style={{ fontFamily: "'Playfair Display', serif" }}>
            {view === "create" ? "เพิ่มผู้ใช้งานใหม่" : "แก้ไขข้อมูลผู้ใช้งาน"}
          </h2>
          <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>ชื่อ-นามสกุล *</label><input className={inputCls} value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} /></div>
              <div><label className={labelCls}>รหัสพนักงาน *</label><input className={inputCls} value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>ชื่อผู้ใช้ (Username) *</label><input className={inputCls} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></div>
              <div><label className={labelCls}>อีเมล *</label><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelCls}>เบอร์โทรศัพท์</label><input className={inputCls} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
              <div>
                <label className={labelCls}>แผนก</label>
                <input className={inputCls} list="dept-suggestions" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
                <datalist id="dept-suggestions">{DEPARTMENT_SUGGESTIONS.map((d) => <option key={d} value={d} />)}</datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>ตำแหน่งงาน (Position)</label>
                <input className={inputCls} list="position-suggestions" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
                <datalist id="position-suggestions">{POSITION_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
              </div>
              <div>
                <label className={labelCls}>บทบาท (Role) *</label>
                <select
                  className={inputCls}
                  value={form.roleKey}
                  onChange={(e) => setForm((f) => ({ ...f, roleKey: e.target.value }))}
                  disabled={editingId === currentUser.id}
                >
                  {assignableRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </select>
                {editingId === currentUser.id && <p className="text-[10px] text-muted-foreground mt-1">ไม่สามารถเปลี่ยนบทบาทของบัญชีตนเองได้</p>}
              </div>
            </div>
            {view === "edit" && (
              <div>
                <label className={labelCls}>สถานะ</label>
                <select className={inputCls} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as UserStatus }))} disabled={editingId === currentUser.id}>
                  <option value="active">ใช้งานอยู่</option>
                  <option value="inactive">ระงับการใช้งาน</option>
                </select>
              </div>
            )}
            {view === "create" && (
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>รหัสผ่านเริ่มต้น *</label><input type="password" className={inputCls} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></div>
                <div><label className={labelCls}>ยืนยันรหัสผ่าน *</label><input type="password" className={inputCls} value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} /></div>
              </div>
            )}
            {error && <p className="text-xs text-[#e05252]">{error}</p>}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => { setView("list"); setEditingId(null); }} className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">ยกเลิก</button>
              <button type="submit" className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">บันทึก</button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาผู้ใช้งาน..." className="bg-transparent text-sm outline-none w-full text-foreground placeholder-muted-foreground" />
        </div>
        <button onClick={startCreate} className="flex items-center gap-1.5 px-3.5 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
          <Plus size={15} /> เพิ่มผู้ใช้งาน
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
              <th className="text-left font-medium px-4 py-3">ผู้ใช้งาน</th>
              <th className="text-left font-medium px-4 py-3">รหัสพนักงาน</th>
              <th className="text-left font-medium px-4 py-3">แผนก / ตำแหน่ง</th>
              <th className="text-left font-medium px-4 py-3">บทบาท</th>
              <th className="text-left font-medium px-4 py-3">สถานะ</th>
              <th className="text-right font-medium px-4 py-3">การจัดการ</th>
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
                  <td className="px-4 py-3 text-xs text-muted-foreground">{u.department || "—"} {u.position && `· ${u.position}`}</td>
                  <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20">{role?.name ?? u.roleKey}</span></td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${u.status === "active" ? "bg-[#2aa36b]/10 text-[#2aa36b] border-[#2aa36b]/20" : "bg-[#8a94a6]/10 text-[#8a94a6] border-[#8a94a6]/20"}`}>
                      {u.status === "active" ? "ใช้งานอยู่" : "ระงับการใช้งาน"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startEdit(u)} title="แก้ไข" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => { setResetTarget(u); setResetPw({ password: "", confirm: "" }); setError(""); }} title="รีเซ็ตรหัสผ่าน" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"><KeyRound size={14} /></button>
                      <button
                        onClick={() => setStatusTarget(u)}
                        disabled={u.id === currentUser.id}
                        title={u.status === "active" ? "ระงับการใช้งาน" : "เปิดใช้งาน"}
                        className="p-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {u.status === "active" ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={!canDelete(u)}
                        title="ลบผู้ใช้งาน"
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
              <tr><td colSpan={6} className="text-center text-xs text-muted-foreground py-10">ไม่พบผู้ใช้งาน</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={() => setResetTarget(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
            <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>รีเซ็ตรหัสผ่าน</p>
            <p className="text-xs text-muted-foreground mb-4">ตั้งรหัสผ่านใหม่ให้ {resetTarget.fullName}</p>
            <div className="space-y-3">
              <div><label className={labelCls}>รหัสผ่านใหม่</label><input type="password" className={inputCls} value={resetPw.password} onChange={(e) => setResetPw((p) => ({ ...p, password: e.target.value }))} /></div>
              <div><label className={labelCls}>ยืนยันรหัสผ่านใหม่</label><input type="password" className={inputCls} value={resetPw.confirm} onChange={(e) => setResetPw((p) => ({ ...p, confirm: e.target.value }))} /></div>
              {error && <p className="text-xs text-[#e05252]">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => { setResetTarget(null); setError(""); }} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">ยกเลิก</button>
              <button onClick={confirmResetPassword} className="px-3.5 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">รีเซ็ต</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!statusTarget}
        title={statusTarget?.status === "active" ? "ระงับการใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
        message={`${statusTarget?.status === "active" ? "ระงับการใช้งาน" : "เปิดใช้งาน"}บัญชีของ ${statusTarget?.fullName ?? ""}?`}
        danger={statusTarget?.status === "active"}
        onConfirm={confirmToggleStatus}
        onCancel={() => setStatusTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="ลบผู้ใช้งาน"
        message={`ลบบัญชีของ ${deleteTarget?.fullName ?? ""} อย่างถาวร? การกระทำนี้ไม่สามารถย้อนกลับได้`}
        danger
        confirmLabel="ลบ"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast message={message} />
    </div>
  );
}
