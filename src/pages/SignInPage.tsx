import { useId, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, LogIn, MailCheck, MonitorSmartphone, User as UserIcon } from "lucide-react";
import { AuthCard, AuthLayout } from "./AuthLayout";
import { Field } from "../components/ui/Field";
import { btn, field } from "../components/ui/styles";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/apiClient";
import { requestPasswordReset } from "../lib/passwordResets";

const boxInputCls = "flex-1 min-w-0 h-[38px] bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none";
const errorBoxCls = "rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5";

// หน้าเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน
// Sign-in page for authenticating with username/identifier and password.
export function SignInPage({
  onSignIn,
  signedOutReason,
}: {
  onSignIn: (identifier: string, password: string) => Promise<string | null>;
  /** "superseded" = โดนเตะออกเพราะมีคนเข้าสู่ระบบด้วยบัญชีนี้จากเครื่องอื่น (2026-08-31) */
  signedOutReason?: "superseded" | null;
}) {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const identifierId = useId();
  const passwordId = useId();
  // ลืมรหัสผ่าน (2026-09-24) — ส่งคำขอถึง Super Admin แทนการบอกให้ไปตามหาผู้ดูแลเอง
  const [view, setView] = useState<"signin" | "forgot" | "sent">("signin");
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotNote, setForgotNote] = useState("");
  const [forgotError, setForgotError] = useState("");
  const forgotIdentifierId = useId();
  const forgotNoteId = useId();

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotIdentifier.trim()) { setForgotError(t("signin.forgot.errorRequired")); return; }
    setSubmitting(true);
    try {
      await requestPasswordReset(forgotIdentifier.trim(), forgotNote.trim());
      setForgotError("");
      setView("sent");
    } catch (err) {
      setForgotError(err instanceof ApiError ? err.message : t("signin.forgot.errorSend"));
    } finally {
      setSubmitting(false);
    }
  };

  if (view === "sent") {
    return (
      <AuthLayout>
        <AuthCard role="status" className="p-6 sm:p-10 gap-6">
          <span className="w-14 h-14 rounded-full bg-[#e6f4ec] text-[#1b7f4f] flex items-center justify-center">
            <MailCheck size={26} aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold leading-tight text-foreground">{t("signin.forgot.sentTitle")}</h1>
            <p className="text-sm text-[#3d5173]">{t("signin.forgot.sentBody")}</p>
          </div>
          <button type="button" onClick={() => setView("signin")} className={`${btn.primary} w-full`}>
            <ArrowLeft size={16} aria-hidden="true" /> {t("signin.forgot.back")}
          </button>
        </AuthCard>
      </AuthLayout>
    );
  }

  if (view === "forgot") {
    return (
      <AuthLayout>
        <AuthCard className="px-6 py-6 sm:px-10 sm:pt-8 sm:pb-10 gap-6">
          <button type="button" onClick={() => setView("signin")}
            className="self-start inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors">
            <ArrowLeft size={16} aria-hidden="true" /> {t("signin.forgot.back")}
          </button>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold leading-tight text-foreground">{t("signin.forgot.title")}</h1>
            <p className="text-sm text-[#3d5173]">{t("signin.forgot.subtitle")}</p>
          </div>
          <form onSubmit={submitForgot} className="flex flex-col gap-[18px]">
            <Field label={t("signin.identifierLabel")} htmlFor={forgotIdentifierId} required>
              <span className={field.box}>
                <UserIcon size={16} aria-hidden="true" className="text-muted-foreground flex-shrink-0" />
                <input id={forgotIdentifierId} type="text" autoComplete="username" value={forgotIdentifier} onChange={(e) => setForgotIdentifier(e.target.value)} autoFocus
                  placeholder={t("signin.identifierPlaceholder")} className={boxInputCls} />
              </span>
            </Field>
            <Field label={t("signin.forgot.noteLabel")} htmlFor={forgotNoteId}>
              <textarea id={forgotNoteId} rows={3} value={forgotNote} onChange={(e) => setForgotNote(e.target.value)} maxLength={500}
                placeholder={t("signin.forgot.notePlaceholder")} className={`${field.textarea} w-full resize-y`} />
            </Field>
            {forgotError && <p role="alert" className={errorBoxCls}>{forgotError}</p>}
            <button type="submit" disabled={submitting} className={`${btn.primary} w-full mt-1.5`}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} aria-hidden="true" />}
              {submitting ? t("signin.forgot.sending") : t("signin.forgot.submit")}
            </button>
          </form>
        </AuthCard>
      </AuthLayout>
    );
  }

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
      <div className="flex flex-col gap-5">
        <AuthCard className="p-6 sm:p-10 gap-7">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold leading-tight text-foreground">{t("signin.title")}</h1>
            <p className="text-sm text-[#3d5173]">{t("signin.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
            <Field label={t("signin.identifierLabel")} htmlFor={identifierId}>
              <span className={field.box}>
                <UserIcon size={16} aria-hidden="true" className="text-muted-foreground flex-shrink-0" />
                <input
                  id={identifierId}
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={t("signin.identifierPlaceholder")}
                  className={boxInputCls}
                />
              </span>
            </Field>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={passwordId} className={field.label}>{t("signin.passwordLabel")}</label>
                <button type="button" onClick={() => { setForgotIdentifier(identifier); setForgotError(""); setView("forgot"); }}
                  className="text-[13px] font-medium text-[#1a5fb4] hover:underline underline-offset-[3px] rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40">
                  {t("signin.forgot.link")}
                </button>
              </div>
              <span className={`${field.box} pr-1`}>
                <Lock size={16} aria-hidden="true" className="text-muted-foreground flex-shrink-0" />
                <input
                  id={passwordId}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={boxInputCls}
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
            </div>

            {/* บอกสาเหตุที่ถูกเด้งออกมา ก่อนที่ผู้ใช้จะพิมพ์อะไร — ไม่ใช่ error ของการกรอกฟอร์ม
                จึงแยกกล่องกัน และหายไปเองเมื่อมี error จริงจากการกดเข้าสู่ระบบ */}
            {!error && signedOutReason === "superseded" && (
              <p role="status" className="flex items-start gap-2 rounded-lg bg-[#fdf3e0] border border-[#efd3a0] text-[#6b4600] text-[13px] px-3.5 py-2.5">
                <MonitorSmartphone size={16} aria-hidden="true" className="flex-shrink-0 mt-0.5 text-[#8a5a00]" />
                {t("signin.signedOutElsewhere")}
              </p>
            )}
            {error && <p role="alert" className={errorBoxCls}>{error}</p>}

            <button type="submit" disabled={submitting} className={`${btn.primary} w-full mt-1.5`}>
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} aria-hidden="true" />}
              {submitting ? t("signin.submitting") : t("signin.submit")}
            </button>
          </form>
        </AuthCard>

        <p className="px-6 text-center text-[13px] text-muted-foreground">{t("signin.forgotHelp")}</p>
      </div>
    </AuthLayout>
  );
}
