import { useId, useState } from "react";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/apiClient";
import { updateUser, type User } from "../lib/users";

/**
 * บังคับตั้งรหัสผ่านใหม่ (2026-09-24) — ขึ้นเมื่อผู้ใช้เข้าด้วยรหัสชั่วคราวที่ Super Admin ออกให้จากหน้า "คำขอกู้รหัสผ่าน"
 * (`User.mustChangePassword`) · ปิดไม่ได้ ทางออกมีสองทาง: ตั้งรหัสใหม่ หรือออกจากระบบ
 * ใช้ API เปลี่ยนรหัสของตัวเองตัวเดิม (ต้องใส่รหัสปัจจุบัน = รหัสชั่วคราว) ซึ่งล้างสถานะนี้ให้เอง
 */
export function ForceChangePasswordDialog({ user, onChanged, onSignOut }: {
  user: User;
  onChanged: (updated: User) => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ids = { current: useId(), next: useId(), confirm: useId(), title: useId() };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !next || !confirm) { setError(t("settings.security.errorRequired")); return; }
    if (next.length < 6) { setError(t("settings.security.errorLength")); return; }
    if (next !== confirm) { setError(t("settings.security.errorMismatch")); return; }
    if (next === current) { setError(t("forcePassword.errorSame")); return; }
    setSaving(true);
    try {
      onChanged(await updateUser(user.id, { password: next, currentPassword: current }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.security.errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/60" aria-hidden="true" />
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby={ids.title}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 id={ids.title} className="flex items-center gap-2 text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            <KeyRound size={16} className="text-[#a75d1a]" /> {t("forcePassword.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t("forcePassword.subtitle")}</p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label htmlFor={ids.current} className="text-xs font-medium text-foreground block mb-1.5">{t("forcePassword.currentLabel")}</label>
            <input id={ids.current} type="password" autoFocus autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor={ids.next} className="text-xs font-medium text-foreground block mb-1.5">{t("settings.security.newLabel")}</label>
            <input id={ids.next} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor={ids.confirm} className="text-xs font-medium text-foreground block mb-1.5">{t("settings.security.confirmLabel")}</label>
            <input id={ids.confirm} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
          </div>
          {error && <p role="alert" className="text-xs text-[#e05252]">{error}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border">
          <button type="button" onClick={onSignOut} className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <LogOut size={13} /> {t("forcePassword.signOut")}
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60">
            {saving && <Loader2 size={13} className="animate-spin" />} {t("forcePassword.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
