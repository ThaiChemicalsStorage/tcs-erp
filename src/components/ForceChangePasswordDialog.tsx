import { useId, useState } from "react";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/apiClient";
import { updateUser, type User } from "../lib/users";
import { Field } from "./ui/Field";
import { btn, field } from "./ui/styles";

/**
 * บังคับตั้งรหัสผ่านใหม่ (2026-09-24) — ขึ้นเมื่อผู้ใช้เข้าด้วยรหัสชั่วคราวที่ Super Admin ออกให้จากหน้า "คำขอกู้รหัสผ่าน"
 * (`User.mustChangePassword`) · ปิดไม่ได้ ทางออกมีสองทาง: ตั้งรหัสใหม่ หรือออกจากระบบ
 * ใช้ API เปลี่ยนรหัสของตัวเองตัวเดิม (ต้องใส่รหัสปัจจุบัน = รหัสชั่วคราว) ซึ่งล้างสถานะนี้ให้เอง
 * หน้าตาตามดีไซน์ใหม่ (2026-09-30, บอร์ด Dlg-ForceChangePassword): กว้าง 480 ไอคอนกุญแจสีเหลือง
 * [ออกจากระบบ] ซ้าย · [บันทึกรหัสผ่านใหม่] ขวา · ไม่มีปุ่ม ✕ และคลิกพื้นหลังไม่ปิด
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
  const ids = { current: useId(), next: useId(), confirm: useId(), title: useId(), desc: useId() };

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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" aria-hidden="true" />
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby={ids.title} aria-describedby={ids.desc}
        className="relative w-full max-w-[480px] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col">
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className="w-11 h-11 rounded-full bg-[#fdf3e0] text-[#8a5a00] flex items-center justify-center flex-shrink-0">
            <KeyRound size={20} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5 space-y-1">
            <h2 id={ids.title} className="text-lg font-semibold text-foreground leading-snug">{t("forcePassword.title")}</h2>
            <p id={ids.desc} className="text-sm text-[#3d5173] leading-relaxed">{t("forcePassword.subtitle")}</p>
          </div>
        </div>
        <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
          <Field label={t("forcePassword.currentLabel")} htmlFor={ids.current} required>
            <input id={ids.current} type="password" autoFocus autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={`${field.input} w-full`} />
          </Field>
          <Field label={t("settings.security.newLabel")} htmlFor={ids.next} required help={t("forcePassword.errorSame")}>
            <input id={ids.next} type="password" autoComplete="new-password" placeholder={t("settings.security.lengthHint")} value={next} onChange={(e) => setNext(e.target.value)} className={`${field.input} w-full`} />
          </Field>
          <Field label={t("settings.security.confirmLabel")} htmlFor={ids.confirm} required>
            <input id={ids.confirm} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={`${field.input} w-full`} />
          </Field>
          {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}
        </div>
        <div className="flex items-center gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
          <button type="button" onClick={onSignOut} className={btn.secondary}>
            <LogOut size={16} /> {t("forcePassword.signOut")}
          </button>
          <span className="flex-1" />
          <button type="submit" disabled={saving} className={btn.primary}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} {t("forcePassword.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
