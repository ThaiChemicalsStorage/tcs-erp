import { useEffect, useId, useState } from "react";
import {
  User as UserIcon, Building2, ShieldCheck, Bell, CheckCircle2, Hash, Mail, Phone, MapPin, type LucideIcon,
  Image as ImageIcon, Stamp, PenTool, Landmark, FileText, HelpCircle,
} from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../components/GuidedTour";
import type { Company } from "../lib/storage";
import { saveCompany as saveCompanyApi } from "../lib/storage";
import type { User } from "../lib/users";
import { initials, updateUser } from "../lib/users";
import { ApiError } from "../lib/apiClient";
import type { Role } from "../lib/roles";
import { useI18n, type Lang } from "../lib/i18n";
import { ImageUploadField } from "../components/ImageUploadField";

function LanguageField() {
  const { lang, setLang, t } = useI18n();
  const options: { key: Lang; label: string }[] = [
    { key: "th", label: t("settings.language.th") },
    { key: "en", label: t("settings.language.en") },
  ];
  return (
    <div>
      <label className={labelCls}>{t("settings.language")}</label>
      <p className="text-[10px] text-muted-foreground mb-2 -mt-1">{t("settings.language.sub")}</p>
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => setLang(o.key)}
            className={`px-3.5 py-1.5 text-xs rounded-md font-medium transition-all ${
              lang === o.key ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type Tab = "profile" | "company" | "security" | "notifications";

function SavedNote({ show }: { show: boolean }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#2aa36b]">
      <CheckCircle2 size={13} /> {t("common.savedNote")}
    </span>
  );
}

function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);
  return [saved, () => setSaved(true)] as const;
}

function Toggle({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`w-10 h-5.5 rounded-full transition-colors relative flex-shrink-0 ${checked ? "bg-[#c9a84c]" : "bg-muted border border-border"}`}
      style={{ height: "22px" }}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[19px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors";
// Darkened variant of muted-foreground (not the shared token) — text-muted-foreground (#5a7299) on
// this field's bg-muted (#eef1f8) measures ~4.3:1, just under the 4.5:1 AA floor for normal text;
// this hex clears ~5.3:1 while staying in the same blue-slate family (Impeccable audit 2026-07-30).
// Scoped to this file only, not the global --muted-foreground token used across the rest of the app.
const readOnlyCls = "w-full text-sm text-[#4c6488] bg-muted border border-border rounded-lg px-3 py-2 outline-none cursor-default";
const labelCls = "text-xs text-muted-foreground block mb-1.5";

export function SettingsPage({
  company,
  onCompanyChange,
  currentUser,
  onUserChange,
  roles,
  canManageCompany,
  onAudit,
}: {
  company: Company;
  onCompanyChange: (c: Company) => void;
  currentUser: User;
  onUserChange: (u: User) => void;
  roles: Role[];
  canManageCompany: boolean;
  onAudit: (action: string, details: string) => void;
}) {
  const { t } = useI18n();

  // Page tour (added 2026-07-29) — same one-time-per-user auto-start + replay-button convention
  // as the other pages' tours. The profile step targets the default tab's card, so both steps are
  // present on a fresh visit.
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="settings-tabs"]', popover: { title: t("tour.settings.tabs.title"), description: t("tour.settings.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="settings-profile"]', popover: { title: t("tour.settings.profile.title"), description: t("tour.settings.profile.desc"), side: "top" } },
  ];
  const tour = useModuleTour("settings", currentUser.id, tourSteps);

  const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: "profile", label: t("settings.tab.profile"), icon: UserIcon },
    ...(canManageCompany ? [{ key: "company" as const, label: t("settings.tab.company"), icon: Building2 }] : []),
    { key: "security", label: t("settings.tab.security"), icon: ShieldCheck },
    { key: "notifications", label: t("settings.tab.notifications"), icon: Bell },
  ];
  const [tab, setTab] = useState<Tab>("profile");

  const [profileDraft, setProfileDraft] = useState(currentUser);
  const [profileSaved, flashProfileSaved] = useSavedFlash();
  const [profileError, setProfileError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  const [companyDraft, setCompanyDraft] = useState(company);
  const [companySaved, flashCompanySaved] = useSavedFlash();
  const [companyError, setCompanyError] = useState("");
  const [companySaving, setCompanySaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaved, flashPwSaved] = useSavedFlash();
  const [pwSaving, setPwSaving] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState({
    quoteApproved: true,
    lowStock: true,
    weeklyDigest: false,
  });

  // Field ids for label/input association (screen readers otherwise can't tell which label
  // belongs to which field — Impeccable audit 2026-07-30, matches the useId() convention already
  // used for this in TemplateEditorView.tsx / UserManagementPage.tsx).
  const fullNameId = useId();
  const profilePhoneId = useId();
  const employeeIdId = useId();
  const profileEmailId = useId();
  const departmentId = useId();
  const positionId = useId();
  const roleFieldId = useId();
  const companyNameId = useId();
  const addressId = useId();
  const companyPhoneId = useId();
  const companyEmailId = useId();
  const taxIdId = useId();
  const vatId = useId();
  const bankNameId = useId();
  const bankBranchId = useId();
  const bankAccountNameId = useId();
  const bankAccountNumberId = useId();
  const termsId = useId();
  const currentPwId = useId();
  const newPwId = useId();
  const confirmPwId = useId();
  const profileHeadingId = useId();
  const companyHeadingId = useId();
  const securityHeadingId = useId();
  const notificationsHeadingId = useId();

  const roleName = roles.find((r) => r.key === currentUser.roleKey)?.name ?? currentUser.roleKey;

  const saveProfile = async () => {
    setProfileSaving(true);
    try {
      const updated = await updateUser(currentUser.id, {
        fullName: profileDraft.fullName,
        phone: profileDraft.phone,
        profilePictureDataUrl: profileDraft.profilePictureDataUrl,
        signatureDataUrl: profileDraft.signatureDataUrl,
      });
      setProfileError("");
      onUserChange(updated);
      onAudit("Profile Updated", `${profileDraft.fullName} แก้ไขข้อมูลโปรไฟล์ของตนเอง`);
      flashProfileSaved();
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setProfileSaving(false);
    }
  };

  const saveCompany = async () => {
    setCompanySaving(true);
    try {
      const updated = await saveCompanyApi(companyDraft);
      setCompanyError("");
      onCompanyChange(updated);
      onAudit("Company Settings Updated", `${currentUser.fullName} แก้ไขข้อมูลบริษัท`);
      flashCompanySaved();
    } catch (err) {
      setCompanyError(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setCompanySaving(false);
    }
  };

  const savePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      setPwError(t("settings.security.errorRequired"));
      return;
    }
    if (newPw.length < 6) {
      setPwError(t("settings.security.errorLength"));
      return;
    }
    if (newPw !== confirmPw) {
      setPwError(t("settings.security.errorMismatch"));
      return;
    }
    setPwSaving(true);
    try {
      const updated = await updateUser(currentUser.id, { password: newPw, currentPassword: currentPw });
      setPwError("");
      onUserChange(updated);
      onAudit("Password Reset", `${currentUser.fullName} เปลี่ยนรหัสผ่านของตนเอง`);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      flashPwSaved();
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : t("settings.security.errorGeneric"));
    } finally {
      setPwSaving(false);
    }
  };

  const notifRows: { key: "quoteApproved" | "lowStock" | "weeklyDigest"; label: string; sub: string; id: string }[] = [
    { key: "quoteApproved", label: t("settings.notif.quoteApproved.label"), sub: t("settings.notif.quoteApproved.sub"), id: `${notificationsHeadingId}-quoteApproved` },
    { key: "lowStock", label: t("settings.notif.lowStock.label"), sub: t("settings.notif.lowStock.sub"), id: `${notificationsHeadingId}-lowStock` },
    { key: "weeklyDigest", label: t("settings.notif.weeklyDigest.label"), sub: t("settings.notif.weeklyDigest.sub"), id: `${notificationsHeadingId}-weeklyDigest` },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("settings.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("settings.pageSubtitle")}</p>
        </div>
        <button
          onClick={tour.start}
          title={t("tour.replay")}
          aria-label={t("tour.replay")}
          className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
        >
          <HelpCircle size={15} />
        </button>
      </div>

      <div data-tour="settings-tabs" className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit overflow-x-auto">
        {tabs.map((tabDef) => (
          <button
            key={tabDef.key}
            onClick={() => setTab(tabDef.key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-medium transition-all whitespace-nowrap ${
              tab === tabDef.key ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tabDef.icon size={13} /> {tabDef.label}
          </button>
        ))}
      </div>

      {/* Profile */}
      {tab === "profile" && (
        <div data-tour="settings-profile" className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-5">
          <h2 id={profileHeadingId} className="sr-only">{t("settings.tab.profile")}</h2>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#a07830] flex items-center justify-center text-white text-lg font-bold flex-shrink-0 overflow-hidden">
              {profileDraft.profilePictureDataUrl ? (
                <img src={profileDraft.profilePictureDataUrl} alt={profileDraft.fullName} className="w-full h-full object-cover" />
              ) : (
                initials(profileDraft.fullName || "?")
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{profileDraft.fullName || t("common.dash")}</p>
              <p className="text-xs text-muted-foreground font-mono">{roleName}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={fullNameId} className={labelCls}>{t("settings.profile.fullNameLabel")}</label>
              <input id={fullNameId} className={inputCls} value={profileDraft.fullName} onChange={(e) => setProfileDraft((p) => ({ ...p, fullName: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={profilePhoneId} className={labelCls}>{t("settings.profile.phoneLabel")}</label>
              <input id={profilePhoneId} className={inputCls} value={profileDraft.phone} onChange={(e) => setProfileDraft((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={employeeIdId} className={labelCls}>{t("settings.profile.employeeIdLabel")}</label>
              <input id={employeeIdId} className={readOnlyCls} value={profileDraft.employeeId} readOnly />
            </div>
            <div>
              <label htmlFor={profileEmailId} className={labelCls}>{t("settings.profile.emailLabel")}</label>
              <input id={profileEmailId} className={readOnlyCls} value={profileDraft.email} readOnly />
            </div>
            <div>
              <label htmlFor={departmentId} className={labelCls}>{t("settings.profile.departmentLabel")}</label>
              <input id={departmentId} className={readOnlyCls} value={profileDraft.department || t("common.dash")} readOnly />
            </div>
            <div>
              <label htmlFor={positionId} className={labelCls}>{t("settings.profile.positionLabel")}</label>
              <input id={positionId} className={readOnlyCls} value={profileDraft.position || t("common.dash")} readOnly />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={roleFieldId} className={labelCls}>{t("settings.profile.roleLabel")}</label>
              <input id={roleFieldId} className={readOnlyCls} value={roleName} readOnly aria-describedby={`${roleFieldId}-hint`} />
              <p id={`${roleFieldId}-hint`} className="text-[10px] text-muted-foreground mt-1">{t("settings.profile.roleHint")}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
            <ImageUploadField
              label={t("settings.profile.pictureLabel")}
              icon={ImageIcon}
              value={profileDraft.profilePictureDataUrl}
              onChange={(v) => setProfileDraft((p) => ({ ...p, profilePictureDataUrl: v }))}
              aspect="square"
            />
            <ImageUploadField
              label={t("settings.profile.signatureLabel")}
              icon={PenTool}
              value={profileDraft.signatureDataUrl}
              onChange={(v) => setProfileDraft((p) => ({ ...p, signatureDataUrl: v }))}
              aspect="wide"
            />
          </div>
          <p className="text-[10px] text-muted-foreground -mt-3">{t("settings.profile.signatureHint")}</p>

          <div className="pt-2 border-t border-border">
            <LanguageField />
          </div>

          {profileError && <p role="alert" className="text-xs text-[#e05252]">{profileError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveProfile} disabled={profileSaving} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {t("common.saveChanges")}
            </button>
            <SavedNote show={profileSaved} />
          </div>
        </div>
      )}

      {/* Company */}
      {tab === "company" && canManageCompany && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-5">
          <h2 id={companyHeadingId} className="sr-only">{t("settings.tab.company")}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("settings.company.hint")}
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <ImageUploadField label={t("settings.company.logoLabel")} icon={ImageIcon} value={companyDraft.logoDataUrl} onChange={(v) => setCompanyDraft((c) => ({ ...c, logoDataUrl: v }))} aspect="wide" />
            <ImageUploadField label={t("settings.company.stampLabel")} icon={Stamp} value={companyDraft.stampDataUrl} onChange={(v) => setCompanyDraft((c) => ({ ...c, stampDataUrl: v }))} />
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor={companyNameId} className={labelCls}>{t("settings.company.nameLabel")}</label>
              <input id={companyNameId} className={inputCls} value={companyDraft.name} onChange={(e) => setCompanyDraft((c) => ({ ...c, name: e.target.value }))} />
            </div>
            <div>
              <label htmlFor={addressId} className={`${labelCls} flex items-center gap-1`}><MapPin size={10} /> {t("settings.company.addressLabel")}</label>
              <input id={addressId} className={inputCls} value={companyDraft.address} onChange={(e) => setCompanyDraft((c) => ({ ...c, address: e.target.value }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={companyPhoneId} className={`${labelCls} flex items-center gap-1`}><Phone size={10} /> {t("settings.company.phoneLabel")}</label>
                <input id={companyPhoneId} className={inputCls} value={companyDraft.phone} onChange={(e) => setCompanyDraft((c) => ({ ...c, phone: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={companyEmailId} className={`${labelCls} flex items-center gap-1`}><Mail size={10} /> {t("settings.company.emailLabel")}</label>
                <input id={companyEmailId} className={inputCls} value={companyDraft.email} onChange={(e) => setCompanyDraft((c) => ({ ...c, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={taxIdId} className={`${labelCls} flex items-center gap-1`}><Hash size={10} /> {t("settings.company.taxIdLabel")}</label>
                <input id={taxIdId} className={`${inputCls} font-mono`} value={companyDraft.taxId} onChange={(e) => setCompanyDraft((c) => ({ ...c, taxId: e.target.value }))} />
              </div>
              <div>
                <label htmlFor={vatId} className={labelCls}>{t("settings.company.vatLabel")}</label>
                <input id={vatId} type="number" min={0} max={100} className={`${inputCls} font-mono`} value={companyDraft.vatRate} onChange={(e) => setCompanyDraft((c) => ({ ...c, vatRate: Number(e.target.value) }))} />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-border">
            <h3 className={`${labelCls} flex items-center gap-1 text-foreground font-medium`}><Landmark size={12} /> {t("settings.company.bankSectionTitle")}</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label htmlFor={bankNameId} className={labelCls}>{t("settings.company.bankNameLabel")}</label><input id={bankNameId} className={inputCls} value={companyDraft.bankName} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankName: e.target.value }))} /></div>
              <div><label htmlFor={bankBranchId} className={labelCls}>{t("settings.company.bankBranchLabel")}</label><input id={bankBranchId} className={inputCls} value={companyDraft.bankBranch} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankBranch: e.target.value }))} /></div>
              <div><label htmlFor={bankAccountNameId} className={labelCls}>{t("settings.company.bankAccountNameLabel")}</label><input id={bankAccountNameId} className={inputCls} value={companyDraft.bankAccountName} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankAccountName: e.target.value }))} /></div>
              <div><label htmlFor={bankAccountNumberId} className={labelCls}>{t("settings.company.bankAccountNumberLabel")}</label><input id={bankAccountNumberId} className={`${inputCls} font-mono`} value={companyDraft.bankAccountNumber} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankAccountNumber: e.target.value }))} /></div>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <label htmlFor={termsId} className={`${labelCls} flex items-center gap-1`}><FileText size={10} /> {t("settings.company.termsLabel")}</label>
            <textarea id={termsId} rows={4} className={`${inputCls} resize-none`} value={companyDraft.termsAndConditions} onChange={(e) => setCompanyDraft((c) => ({ ...c, termsAndConditions: e.target.value }))} />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveCompany} disabled={companySaving} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {t("common.saveChanges")}
            </button>
            <SavedNote show={companySaved} />
          </div>
          {companyError && <p role="alert" className="text-xs text-[#e05252]">{companyError}</p>}
        </div>
      )}

      {/* Security */}
      {tab === "security" && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-5">
          <h2 id={securityHeadingId} className="text-xs font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("settings.security.title")}</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor={currentPwId} className={labelCls}>{t("settings.security.currentLabel")}</label>
              <input id={currentPwId} type="password" autoComplete="current-password" className={inputCls} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor={newPwId} className={labelCls}>{t("settings.security.newLabel")}</label>
                <input id={newPwId} type="password" autoComplete="new-password" className={inputCls} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              </div>
              <div>
                <label htmlFor={confirmPwId} className={labelCls}>{t("settings.security.confirmLabel")}</label>
                <input id={confirmPwId} type="password" autoComplete="new-password" className={inputCls} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
              </div>
            </div>
          </div>
          {pwError && <p role="alert" className="text-xs text-[#e05252]">{pwError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={savePassword} disabled={pwSaving} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
              {t("settings.security.submit")}
            </button>
            <SavedNote show={pwSaved} />
          </div>
        </div>
      )}

      {/* Notifications */}
      {tab === "notifications" && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-1">
          <h2 id={notificationsHeadingId} className="sr-only">{t("settings.tab.notifications")}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed pb-3">
            {t("settings.notifications.hint")}
          </p>
          {notifRows.map((n, i) => (
            <div key={n.key} className={`flex items-center justify-between py-4 ${i > 0 ? "border-t border-border" : ""}`}>
              <div>
                <p id={n.id} className="text-sm text-foreground font-medium">{n.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.sub}</p>
              </div>
              <Toggle checked={notifPrefs[n.key]} onChange={(v) => setNotifPrefs((p) => ({ ...p, [n.key]: v }))} labelledBy={n.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
