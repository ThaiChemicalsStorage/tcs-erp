import { useId, useState } from "react";
import { Eye, EyeOff, Loader2, Mail, ShieldCheck } from "lucide-react";
import { AuthCard, AuthLayout } from "./AuthLayout";
import { Field } from "../components/ui/Field";
import { btn, field } from "../components/ui/styles";
import { useI18n } from "../lib/i18n";

export interface SetupWizardFields {
  fullName: string;
  employeeId: string;
  username: string;
  email: string;
  password: string;
}

const boxInputCls = "flex-1 min-w-0 h-[38px] bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none";
const inputCls = `${field.input} w-full`;

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

  return (
    <AuthLayout width="wide">
      <AuthCard className="px-6 py-6 sm:px-10 sm:pt-9 sm:pb-10 gap-6">
        <div className="flex flex-col gap-2">
          <span className="self-start inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#7d6420]">
            <ShieldCheck size={14} aria-hidden="true" /> {t("setup.badge")}
          </span>
          <h1 className="mt-1 text-2xl font-semibold leading-tight text-foreground">{t("setup.title")}</h1>
          <p className="text-sm text-[#3d5173]">{t("setup.subtitle")}</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <Field label={t("setup.fullNameLabel")} htmlFor={fullNameId} required>
            <input id={fullNameId} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder={t("setup.fullNamePlaceholder")} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-[18px]">
            <Field label={t("setup.employeeIdLabel")} htmlFor={employeeIdId} required>
              <input id={employeeIdId} type="text" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={`${inputCls} font-mono`} placeholder="EMP-0001" />
            </Field>
            <Field label={t("setup.usernameLabel")} htmlFor={usernameId} required>
              <input id={usernameId} type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="username" />
            </Field>
          </div>
          <Field label={t("setup.emailLabel")} htmlFor={emailId} required>
            <span className={field.box}>
              <Mail size={16} aria-hidden="true" className="text-muted-foreground flex-shrink-0" />
              <input id={emailId} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={boxInputCls} placeholder="you@tcs-erp.co.th" />
            </span>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-[18px]">
            <Field label={t("setup.passwordLabel")} htmlFor={passwordId} required>
              <span className={`${field.box} pr-1`}>
                <input
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={boxInputCls}
                  placeholder={t("setup.passwordPlaceholder")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("signin.hidePassword") : t("signin.showPassword")}
                  aria-pressed={showPassword}
                  className="w-8 h-8 flex-shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
            </Field>
            <Field label={t("setup.confirmLabel")} htmlFor={confirmId} required>
              <input id={confirmId} type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder={t("setup.confirmPlaceholder")} />
            </Field>
          </div>

          {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}

          <button type="submit" disabled={submitting} className={`${btn.primary} w-full mt-1.5`}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} aria-hidden="true" />}
            {submitting ? t("setup.submitting") : t("setup.submit")}
          </button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
