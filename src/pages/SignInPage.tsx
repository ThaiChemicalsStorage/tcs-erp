import { useId, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, LogIn, MailCheck, MonitorSmartphone, User as UserIcon } from "lucide-react";
import { AuthLayout } from "./AuthLayout";
import { useI18n } from "../lib/i18n";
import { ApiError } from "../lib/apiClient";
import { requestPasswordReset } from "../lib/passwordResets";

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

  if (view !== "signin") {
    return (
      <AuthLayout>
        <button type="button" onClick={() => setView("signin")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft size={13} /> {t("signin.forgot.back")}
        </button>
        {view === "sent" ? (
          <div role="status" className="space-y-3">
            <MailCheck size={28} className="text-[#207e52]" />
            <h1 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("signin.forgot.sentTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("signin.forgot.sentBody")}</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("signin.forgot.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1 mb-7">{t("signin.forgot.subtitle")}</p>
            <form onSubmit={submitForgot} className="space-y-4">
              <div>
                <label htmlFor={forgotIdentifierId} className="text-xs font-medium text-foreground block mb-1.5">{t("signin.identifierLabel")}</label>
                <input id={forgotIdentifierId} type="text" value={forgotIdentifier} onChange={(e) => setForgotIdentifier(e.target.value)} autoFocus
                  placeholder={t("signin.identifierPlaceholder")}
                  className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
              <div>
                <label htmlFor={forgotNoteId} className="text-xs font-medium text-foreground block mb-1.5">{t("signin.forgot.noteLabel")}</label>
                <textarea id={forgotNoteId} rows={2} value={forgotNote} onChange={(e) => setForgotNote(e.target.value)} maxLength={500}
                  placeholder={t("signin.forgot.notePlaceholder")}
                  className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y" />
              </div>
              {forgotError && <p role="alert" className="text-xs text-[#e05252]">{forgotError}</p>}
              <button type="submit" disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60">
                <KeyRound size={15} /> {submitting ? t("signin.forgot.sending") : t("signin.forgot.submit")}
              </button>
            </form>
          </>
        )}
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

        {/* บอกสาเหตุที่ถูกเด้งออกมา ก่อนที่ผู้ใช้จะพิมพ์อะไร — ไม่ใช่ error ของการกรอกฟอร์ม
            จึงแยกกล่องกัน และหายไปเองเมื่อมี error จริงจากการกดเข้าสู่ระบบ */}
        {!error && signedOutReason === "superseded" && (
          <p role="status" className="flex items-start gap-2 text-xs text-[#a75d1a] bg-[#e08a3c]/10 border border-[#e08a3c]/20 rounded-lg px-3 py-2.5">
            <MonitorSmartphone size={14} className="flex-shrink-0 mt-px" />
            {t("signin.signedOutElsewhere")}
          </p>
        )}
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
        <button type="button" onClick={() => { setForgotIdentifier(identifier); setForgotError(""); setView("forgot"); }}
          className="font-medium text-[#866d28] hover:underline underline-offset-2">
          {t("signin.forgot.link")}
        </button>
        <span className="block mt-1.5">{t("signin.forgotHelp")}</span>
      </p>
    </AuthLayout>
  );
}
