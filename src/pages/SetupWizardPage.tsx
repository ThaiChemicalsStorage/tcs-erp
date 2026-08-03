import { useId, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { AuthLayout } from "./AuthLayout";
import { useI18n } from "../lib/i18n";
import { RequiredFieldLabel } from "../components/RequiredFieldLabel";

export interface SetupWizardFields {
  fullName: string;
  employeeId: string;
  username: string;
  email: string;
  password: string;
}

// หน้าตั้งค่าระบบครั้งแรก สร้างบัญชีผู้ดูแลระบบคนแรก
// Setup wizard page for creating the first admin account.
export function SetupWizardPage({ onComplete }: { onComplete: (fields: SetupWizardFields) => Promise<string | null> }) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fullNameId = useId();
  const employeeIdId = useId();
  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const labelCls = "text-xs font-medium text-foreground block mb-1.5";

  // ตรวจสอบข้อมูลฟอร์มและส่งคำขอสร้างบัญชีผู้ดูแลระบบ
  // Validates the form and submits the admin account setup request.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !employeeId.trim() || !username.trim() || !email.trim() || !password) {
      setError(t("setup.errorRequired"));
      return;
    }
    if (password.length < 6) {
      setError(t("setup.errorPasswordLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("setup.errorPasswordMismatch"));
      return;
    }
    setError("");
    setSubmitting(true);
    const result = await onComplete({ fullName: fullName.trim(), employeeId: employeeId.trim(), username: username.trim(), email: email.trim(), password });
    setSubmitting(false);
    setError(result ?? "");
  };

  const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors";

  return (
    <AuthLayout>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-[#866d28]" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#866d28]">{t("setup.badge")}</span>
      </div>
      <h1 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("setup.title")}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-7">
        {t("setup.subtitle")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <RequiredFieldLabel htmlFor={fullNameId} className={labelCls}>{t("setup.fullNameLabel")}</RequiredFieldLabel>
          <input id={fullNameId} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder={t("setup.fullNamePlaceholder")} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <RequiredFieldLabel htmlFor={employeeIdId} className={labelCls}>{t("setup.employeeIdLabel")}</RequiredFieldLabel>
            <input id={employeeIdId} type="text" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls} placeholder="EMP-0001" />
          </div>
          <div>
            <RequiredFieldLabel htmlFor={usernameId} className={labelCls}>{t("setup.usernameLabel")}</RequiredFieldLabel>
            <input id={usernameId} type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="username" />
          </div>
        </div>
        <div>
          <RequiredFieldLabel htmlFor={emailId} className={labelCls}>{t("setup.emailLabel")}</RequiredFieldLabel>
          <input id={emailId} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@tcs-erp.co.th" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <RequiredFieldLabel htmlFor={passwordId} className={labelCls}>{t("setup.passwordLabel")}</RequiredFieldLabel>
            <div className="relative">
              <input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-9`}
                placeholder={t("setup.passwordPlaceholder")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("signin.hidePassword") : t("signin.showPassword")}
                aria-pressed={showPassword}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <RequiredFieldLabel htmlFor={confirmId} className={labelCls}>{t("setup.confirmLabel")}</RequiredFieldLabel>
            <input id={confirmId} type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder={t("setup.confirmPlaceholder")} />
          </div>
        </div>

        {error && <p role="alert" className="text-xs text-[#e05252]">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60"
        >
          <ShieldCheck size={15} /> {submitting ? t("setup.submitting") : t("setup.submit")}
        </button>
      </form>
    </AuthLayout>
  );
}
