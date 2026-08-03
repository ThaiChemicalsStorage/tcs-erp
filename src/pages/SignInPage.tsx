import { useId, useState } from "react";
import { Eye, EyeOff, LogIn, User as UserIcon } from "lucide-react";
import { AuthLayout } from "./AuthLayout";
import { useI18n } from "../lib/i18n";

// หน้าเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน
// Sign-in page for authenticating with username/identifier and password.
export function SignInPage({
  onSignIn,
}: {
  onSignIn: (identifier: string, password: string) => Promise<string | null>;
}) {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const identifierId = useId();
  const passwordId = useId();

  // ตรวจสอบข้อมูลและเรียกฟังก์ชันเข้าสู่ระบบ
  // Validates input and calls the sign-in handler.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setError(t("signin.errorRequired"));
      return;
    }
    setSubmitting(true);
    const result = await onSignIn(identifier.trim(), password);
    setSubmitting(false);
    setError(result ?? "");
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("signin.title")}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-7">{t("signin.subtitle")}</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={identifierId} className="text-xs font-medium text-foreground block mb-1.5">{t("signin.identifierLabel")}</label>
          <div className="relative">
            <UserIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id={identifierId}
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t("signin.identifierPlaceholder")}
              className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg pl-9 pr-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
          </div>
        </div>

        <div>
          <label htmlFor={passwordId} className="text-xs font-medium text-foreground block mb-1.5">{t("signin.passwordLabel")}</label>
          <div className="relative">
            <input
              id={passwordId}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg pl-3 pr-10 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t("signin.hidePassword") : t("signin.showPassword")}
              aria-pressed={showPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {error && <p role="alert" className="text-xs text-[#e05252]">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60"
        >
          <LogIn size={15} /> {submitting ? t("signin.submitting") : t("signin.submit")}
        </button>
      </form>

      <p className="text-center text-xs text-muted-foreground mt-7">
        {t("signin.forgotHelp")}
      </p>
    </AuthLayout>
  );
}
