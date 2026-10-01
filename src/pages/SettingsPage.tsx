import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  User as UserIcon, Building2, ShieldCheck, Bell, CheckCircle2, Lock, Info, AlertTriangle, Loader2, type LucideIcon,
  Image as ImageIcon, Stamp,
} from "lucide-react";
import { useModuleTour, type TourStep } from "../components/GuidedTour";
import { TourReplayButton } from "../components/TourReplayButton";
import { ListPageHeader } from "../components/ui/ListPage";
import { SectionCard } from "../components/ui/SectionCard";
import { Field, ReadonlyField } from "../components/ui/Field";
import { btn, field, surface } from "../components/ui/styles";
import type { Company } from "../lib/storage";
import { saveCompany as saveCompanyApi } from "../lib/storage";
import type { User } from "../lib/users";
import { initials, updateUser } from "../lib/users";
import { ApiError } from "../lib/apiClient";
import type { Role } from "../lib/roles";
import { useI18n, type Lang } from "../lib/i18n";
import { ImageUploadField } from "../components/ImageUploadField";
import { SignaturePad } from "../components/SignaturePad";
import { Toggle } from "../components/Toggle";

// ช่องเลือกภาษาของระบบ (ไทย/อังกฤษ) — เปลี่ยนทันที ไม่ต้องกดบันทึก
// Field for switching the system language (Thai/English) — applies immediately, not part of the save.
function LanguageSection() {
  const { lang, setLang, t } = useI18n();
  const titleId = useId();
  const refs = useRef(new Map<Lang, HTMLButtonElement>());
  const options: { key: Lang; label: string }[] = [
    { key: "th", label: t("settings.language.th") },
    { key: "en", label: t("settings.language.en") },
  ];
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = options.find((o) => o.key !== lang);
    if (!next) return;
    setLang(next.key);
    refs.current.get(next.key)?.focus();
  };
  return (
    <section className={`${surface.card} px-6 py-5 flex flex-wrap items-center gap-x-6 gap-y-3`}>
      <div className="flex-1 min-w-[12rem] flex flex-col gap-0.5">
        <h2 id={titleId} className={surface.cardTitle}>{t("settings.language")}</h2>
        <p className="text-[13px] text-muted-foreground">{t("settings.language.sub")}</p>
      </div>
      <div role="radiogroup" aria-labelledby={titleId} onKeyDown={onKeyDown} className="flex bg-[#eef1f6] rounded-lg p-[3px]">
        {options.map((o) => {
          const selected = lang === o.key;
          return (
            <button
              key={o.key}
              ref={(el) => { if (el) refs.current.set(o.key, el); else refs.current.delete(o.key); }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setLang(o.key)}
              className={`h-[34px] min-w-[88px] px-3.5 rounded-md text-sm transition-colors ${
                selected ? "bg-white text-foreground font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)]" : "text-[#3d5173] font-medium hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

type Tab = "profile" | "company" | "security" | "notifications";
type PwErrorField = "next" | "confirm" | null;

// แสดงข้อความ "บันทึกแล้ว" ชั่วคราว
// Shows a transient "saved" note.
function SavedNote({ show }: { show: boolean }) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <span role="status" className="flex items-center gap-1.5 text-[13px] text-[#1b7f4f]">
      <CheckCircle2 size={14} /> {t("common.savedNote")}
    </span>
  );
}

// hook แสดงสถานะบันทึกสำเร็จชั่วคราวแล้วซ่อนอัตโนมัติ
// Hook toggling a temporary "saved" flag that auto-clears.
function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);
  return [saved, () => setSaved(true)] as const;
}

// กล่องข้อความแจ้ง (ฟ้า = ข้อมูล, เหลือง = คำเตือน) ตามบอร์ด Settings-Company / Settings-Notifications
function Note({ tone, icon: Icon, children }: { tone: "info" | "warning"; icon: LucideIcon; children: ReactNode }) {
  const toneCls = tone === "info"
    ? "bg-[#e8f0fb] border-[#b9d0f0] text-[#16407a]"
    : "bg-[#fdf3e0] border-[#efd3a0] text-[#6b4600]";
  return (
    <div role="note" className={`px-4 py-3 border rounded-[10px] flex gap-2.5 ${toneCls}`}>
      <Icon size={16} aria-hidden="true" className={`flex-shrink-0 mt-0.5 ${tone === "warning" ? "text-[#8a5a00]" : ""}`} />
      <span className="text-[13px] leading-normal">{children}</span>
    </div>
  );
}

const inputCls = `${field.input} w-full`;

// หน้าตั้งค่าระบบ รวมโปรไฟล์ผู้ใช้ ข้อมูลบริษัท ความปลอดภัย และการแจ้งเตือน
// Settings page covering user profile, company info, security, and notifications.
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

  const tourSteps: TourStep[] = [
    { element: '[data-tour="settings-tabs"]', manual: "ch28", popover: { title: t("tour.settings.tabs.title"), description: t("tour.settings.tabs.desc"), side: "right" } },
    { element: '[data-tour="settings-personal"]', manual: "ch28-1", popover: { title: t("tour.settings.personal.title"), description: t("tour.settings.personal.desc"), side: "top" } },
    { element: '[data-tour="settings-profile"]', manual: "ch28-1", popover: { title: t("tour.settings.profile.title"), description: t("tour.settings.profile.desc"), side: "top" } },
    { element: '[data-tour="settings-language"]', manual: "ch2-5", popover: { title: t("tour.settings.language.title"), description: t("tour.settings.language.desc"), side: "top" } },
    { element: '[data-tour="settings-save"]', manual: "ch28-1", popover: { title: t("tour.settings.save.title"), description: t("tour.settings.save.desc"), side: "top" } },
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
  const [pwError, setPwError] = useState<{ message: string; field: PwErrorField }>({ message: "", field: null });
  const [pwSaved, flashPwSaved] = useSavedFlash();
  const [pwSaving, setPwSaving] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState({
    quoteApproved: true,
    lowStock: true,
    weeklyDigest: false,
  });

  const fullNameId = useId();
  const profilePhoneId = useId();
  const companyNameId = useId();
  const addressId = useId();
  const companyPhoneId = useId();
  const companyEmailId = useId();
  const websiteId = useId();
  const facebookNameId = useId();
  const lineIdFieldId = useId();
  const taxIdId = useId();
  const vatId = useId();
  const bankNameId = useId();
  const bankBranchId = useId();
  const bankAccountNameId = useId();
  const bankAccountNumberId = useId();
  const currentPwId = useId();
  const newPwId = useId();
  const confirmPwId = useId();
  const notifRowIdPrefix = useId();

  const roleName = roles.find((r) => r.key === currentUser.roleKey)?.name ?? currentUser.roleKey;

  // บันทึกการแก้ไขโปรไฟล์ผู้ใช้ปัจจุบัน
  // Saves changes to the current user's profile.
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

  // บันทึกการแก้ไขข้อมูลบริษัท
  // Saves changes to the company settings.
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

  // ตรวจสอบและบันทึกการเปลี่ยนรหัสผ่าน
  // Validates and saves a password change.
  const savePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      setPwError({ message: t("settings.security.errorRequired"), field: null });
      return;
    }
    if (newPw.length < 6) {
      setPwError({ message: t("settings.security.errorLength"), field: "next" });
      return;
    }
    if (newPw !== confirmPw) {
      setPwError({ message: t("settings.security.errorMismatch"), field: "confirm" });
      return;
    }
    setPwSaving(true);
    try {
      const updated = await updateUser(currentUser.id, { password: newPw, currentPassword: currentPw });
      setPwError({ message: "", field: null });
      onUserChange(updated);
      onAudit("Password Reset", `${currentUser.fullName} เปลี่ยนรหัสผ่านของตนเอง`);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      flashPwSaved();
    } catch (err) {
      setPwError({ message: err instanceof ApiError ? err.message : t("settings.security.errorGeneric"), field: null });
    } finally {
      setPwSaving(false);
    }
  };

  const notifRows: { key: "quoteApproved" | "lowStock" | "weeklyDigest"; label: string; sub: string; id: string }[] = [
    { key: "quoteApproved", label: t("settings.notif.quoteApproved.label"), sub: t("settings.notif.quoteApproved.sub"), id: `${notifRowIdPrefix}-quoteApproved` },
    { key: "lowStock", label: t("settings.notif.lowStock.label"), sub: t("settings.notif.lowStock.sub"), id: `${notifRowIdPrefix}-lowStock` },
    { key: "weeklyDigest", label: t("settings.notif.weeklyDigest.label"), sub: t("settings.notif.weeklyDigest.sub"), id: `${notifRowIdPrefix}-weeklyDigest` },
  ];

  // แถบบันทึกติดล่างจอ — เฉพาะหมวดที่มีปุ่มบันทึกรวม (โปรไฟล์/ข้อมูลบริษัท) · ความปลอดภัยมีปุ่มในการ์ดเอง · การแจ้งเตือนไม่มีการบันทึก
  const saveBar = tab === "profile"
    ? { onSave: saveProfile, saving: profileSaving, saved: profileSaved, error: profileError }
    : tab === "company" && canManageCompany
    ? { onSave: saveCompany, saving: companySaving, saved: companySaved, error: companyError }
    : null;

  const pwFieldError = (f: Exclude<PwErrorField, null>) => (pwError.field === f ? pwError.message : undefined);

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="flex-1 px-4 md:px-8 py-6 flex flex-col gap-5">
        <ListPageHeader
          title={t("settings.pageTitle")}
          description={t("settings.pageSubtitle")}
          help={<TourReplayButton variant="title" onClick={tour.start} />}
        />

        <div className="flex flex-col lg:flex-row lg:items-start gap-5 lg:gap-6">
          <nav
            data-tour="settings-tabs"
            aria-label={t("settings.nav.aria")}
            className={`${surface.card} lg:w-[220px] flex-shrink-0 p-2 flex lg:flex-col gap-0.5 overflow-x-auto`}
          >
            {tabs.map((tabDef) => {
              const active = tab === tabDef.key;
              return (
                <button
                  key={tabDef.key}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setTab(tabDef.key)}
                  className={`h-11 px-3 rounded-lg flex items-center gap-2.5 text-sm whitespace-nowrap text-left transition-colors ${
                    active ? "bg-[#fbf7ea] text-foreground font-semibold" : "text-[#3d5173] font-medium hover:bg-[#f4f6fa] hover:text-foreground"
                  }`}
                >
                  <tabDef.icon size={16} aria-hidden="true" className={active ? "text-[#7d6420]" : "text-muted-foreground"} />
                  {tabDef.label}
                </button>
              );
            })}
          </nav>

          <div className="flex-1 min-w-0 lg:max-w-[820px] flex flex-col gap-5">
            {tab === "profile" && (
              <>
                <div data-tour="settings-personal">
                <SectionCard title={t("settings.profile.sectionPersonal")} bodyClassName="px-6 pt-5 pb-6 flex flex-col gap-5">
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-full bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center text-lg font-semibold flex-shrink-0 overflow-hidden">
                      {profileDraft.profilePictureDataUrl ? (
                        <img src={profileDraft.profilePictureDataUrl} alt={profileDraft.fullName} className="w-full h-full object-cover" />
                      ) : (
                        initials(profileDraft.fullName || "?")
                      )}
                    </div>
                    <div className="min-w-0 flex flex-col leading-snug">
                      <span className="text-base font-semibold text-foreground break-words">{profileDraft.fullName || t("common.dash")}</span>
                      <span className="text-[13px] text-muted-foreground">{roleName}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px]">
                    <Field label={t("settings.profile.fullNameLabel")} htmlFor={fullNameId}>
                      <input id={fullNameId} className={inputCls} value={profileDraft.fullName} onChange={(e) => setProfileDraft((p) => ({ ...p, fullName: e.target.value }))} />
                    </Field>
                    <Field label={t("settings.profile.phoneLabel")} htmlFor={profilePhoneId}>
                      <input id={profilePhoneId} className={inputCls} value={profileDraft.phone} onChange={(e) => setProfileDraft((p) => ({ ...p, phone: e.target.value }))} />
                    </Field>
                  </div>

                  <div className="h-px bg-[#eef1f6]" />

                  <div className="flex flex-col gap-3.5">
                    <div className="flex flex-col gap-0.5">
                      <h3 className="text-sm font-semibold text-[#26395a]">{t("settings.profile.adminFields")}</h3>
                      <p className="text-xs text-muted-foreground">{t("settings.profile.roleHint")}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4">
                      <ReadonlyField label={t("settings.profile.employeeIdLabel")} value={profileDraft.employeeId} mono />
                      <ReadonlyField label={t("settings.profile.emailLabel")} value={profileDraft.email} className="sm:col-span-2" />
                      <ReadonlyField label={t("settings.profile.departmentLabel")} value={profileDraft.department} />
                      <ReadonlyField label={t("settings.profile.positionLabel")} value={profileDraft.position} />
                      <ReadonlyField label={t("settings.profile.roleLabel")} value={roleName} />
                    </div>
                  </div>
                </SectionCard>
                </div>

                <div data-tour="settings-profile">
                  <SectionCard title={t("settings.profile.sectionMedia")} bodyClassName="px-6 pt-5 pb-6 grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-6 md:gap-8">
                    <ImageUploadField
                      label={t("settings.profile.pictureLabel")}
                      icon={ImageIcon}
                      value={profileDraft.profilePictureDataUrl}
                      onChange={(v) => setProfileDraft((p) => ({ ...p, profilePictureDataUrl: v }))}
                      aspect="square"
                    />
                    <div className="flex flex-col gap-2.5 min-w-0">
                      <span className={field.label}>{t("settings.profile.signatureLabel")}</span>
                      <SignaturePad
                        dataUrl={profileDraft.signatureDataUrl}
                        signerName={profileDraft.fullName}
                        signedAt={null}
                        requireName={false}
                        onConfirm={({ dataUrl }) => setProfileDraft((p) => ({ ...p, signatureDataUrl: dataUrl }))}
                        onClear={() => setProfileDraft((p) => ({ ...p, signatureDataUrl: "" }))}
                      />
                      <p className={field.help}>{t("settings.profile.signatureHint")}</p>
                    </div>
                  </SectionCard>
                </div>

                <div data-tour="settings-language">
                  <LanguageSection />
                </div>
              </>
            )}

            {tab === "company" && canManageCompany && (
              <>
                <Note tone="info" icon={Info}>{t("settings.company.hint")}</Note>

                <SectionCard title={t("settings.company.sectionBranding")} bodyClassName="px-6 pt-5 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <ImageUploadField label={t("settings.company.logoLabel")} icon={ImageIcon} value={companyDraft.logoDataUrl} onChange={(v) => setCompanyDraft((c) => ({ ...c, logoDataUrl: v }))} aspect="wide" />
                  <ImageUploadField label={t("settings.company.stampLabel")} icon={Stamp} value={companyDraft.stampDataUrl} onChange={(v) => setCompanyDraft((c) => ({ ...c, stampDataUrl: v }))} />
                </SectionCard>

                <SectionCard title={t("settings.tab.company")} bodyClassName="px-6 pt-5 pb-6 grid grid-cols-1 sm:grid-cols-6 gap-x-5 gap-y-[18px]">
                  <Field label={t("settings.company.nameLabel")} htmlFor={companyNameId} className="sm:col-span-6">
                    <input id={companyNameId} className={inputCls} value={companyDraft.name} onChange={(e) => setCompanyDraft((c) => ({ ...c, name: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.addressLabel")} htmlFor={addressId} className="sm:col-span-6">
                    <input id={addressId} className={inputCls} value={companyDraft.address} onChange={(e) => setCompanyDraft((c) => ({ ...c, address: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.phoneLabel")} htmlFor={companyPhoneId} className="sm:col-span-3">
                    <input id={companyPhoneId} className={inputCls} value={companyDraft.phone} onChange={(e) => setCompanyDraft((c) => ({ ...c, phone: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.emailLabel")} htmlFor={companyEmailId} className="sm:col-span-3">
                    <input id={companyEmailId} className={inputCls} value={companyDraft.email} onChange={(e) => setCompanyDraft((c) => ({ ...c, email: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.websiteLabel")} htmlFor={websiteId} className="sm:col-span-2">
                    <input id={websiteId} className={inputCls} value={companyDraft.website} onChange={(e) => setCompanyDraft((c) => ({ ...c, website: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.facebookLabel")} htmlFor={facebookNameId} className="sm:col-span-2">
                    <input id={facebookNameId} className={inputCls} value={companyDraft.facebookName} onChange={(e) => setCompanyDraft((c) => ({ ...c, facebookName: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.lineLabel")} htmlFor={lineIdFieldId} className="sm:col-span-2">
                    <input id={lineIdFieldId} className={inputCls} value={companyDraft.lineId} onChange={(e) => setCompanyDraft((c) => ({ ...c, lineId: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.taxIdLabel")} htmlFor={taxIdId} className="sm:col-span-3">
                    <input id={taxIdId} className={`${inputCls} font-mono`} value={companyDraft.taxId} onChange={(e) => setCompanyDraft((c) => ({ ...c, taxId: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.vatLabel")} htmlFor={vatId} className="sm:col-span-3">
                    <span className="w-40 h-10 flex items-stretch rounded-lg border border-[#c3ccda] bg-white overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
                      <input
                        id={vatId}
                        type="number"
                        min={0}
                        max={100}
                        className="flex-1 min-w-0 px-3 bg-transparent text-sm text-foreground text-right tabular-nums outline-none"
                        value={companyDraft.vatRate}
                        onChange={(e) => setCompanyDraft((c) => ({ ...c, vatRate: Number(e.target.value) }))}
                      />
                      <span aria-hidden="true" className="px-3 flex items-center bg-[#f4f6fa] border-l border-border text-[13px] text-[#3d5173]">%</span>
                    </span>
                  </Field>
                </SectionCard>

                <SectionCard title={t("settings.company.bankSectionTitle")} bodyClassName="px-6 pt-5 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px]">
                  <Field label={t("settings.company.bankNameLabel")} htmlFor={bankNameId}>
                    <input id={bankNameId} className={inputCls} value={companyDraft.bankName} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankName: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.bankBranchLabel")} htmlFor={bankBranchId}>
                    <input id={bankBranchId} className={inputCls} value={companyDraft.bankBranch} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankBranch: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.bankAccountNameLabel")} htmlFor={bankAccountNameId}>
                    <input id={bankAccountNameId} className={inputCls} value={companyDraft.bankAccountName} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankAccountName: e.target.value }))} />
                  </Field>
                  <Field label={t("settings.company.bankAccountNumberLabel")} htmlFor={bankAccountNumberId}>
                    <input id={bankAccountNumberId} className={`${inputCls} font-mono`} value={companyDraft.bankAccountNumber} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankAccountNumber: e.target.value }))} />
                  </Field>
                </SectionCard>

                <SectionCard title={t("settings.company.termsLabel")}>
                  <textarea
                    aria-label={t("settings.company.termsLabel")}
                    rows={5}
                    className={`${field.textarea} w-full resize-y`}
                    value={companyDraft.termsAndConditions}
                    onChange={(e) => setCompanyDraft((c) => ({ ...c, termsAndConditions: e.target.value }))}
                  />
                </SectionCard>
              </>
            )}

            {tab === "security" && (
              <SectionCard
                title={<span className="flex items-center gap-2.5"><Lock size={16} aria-hidden="true" className="text-muted-foreground" />{t("settings.security.title")}</span>}
                bodyClassName=""
              >
                <form onSubmit={(e) => { e.preventDefault(); void savePassword(); }}>
                  <div className="px-6 pt-5 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px]">
                    <Field label={t("settings.security.currentLabel")} htmlFor={currentPwId} required>
                      <input id={currentPwId} type="password" autoComplete="current-password" className={inputCls} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                    </Field>
                    <div className="hidden sm:block" />
                    <Field label={t("settings.security.newLabel")} htmlFor={newPwId} required help={t("settings.security.lengthHint")} error={pwFieldError("next")}>
                      <input id={newPwId} type="password" autoComplete="new-password" aria-invalid={pwError.field === "next" || undefined}
                        className={`${inputCls} ${pwError.field === "next" ? "border-[#b93636]" : ""}`} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                    </Field>
                    <Field label={t("settings.security.confirmLabel")} htmlFor={confirmPwId} required error={pwFieldError("confirm")}>
                      <input id={confirmPwId} type="password" autoComplete="new-password" aria-invalid={pwError.field === "confirm" || undefined}
                        className={`${inputCls} ${pwError.field === "confirm" ? "border-[#b93636]" : ""}`} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
                    </Field>
                    {pwError.message && pwError.field === null && (
                      <p role="alert" className="sm:col-span-2 rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{pwError.message}</p>
                    )}
                    {pwError.field !== null && <span role="alert" className="sr-only">{pwError.message}</span>}
                  </div>
                  <div className="px-6 py-4 border-t border-[#eef1f6] flex flex-wrap items-center justify-end gap-3.5">
                    <SavedNote show={pwSaved} />
                    <button type="submit" disabled={pwSaving} className={btn.primary}>
                      {pwSaving && <Loader2 size={16} className="animate-spin" />}
                      {t("settings.security.submit")}
                    </button>
                  </div>
                </form>
              </SectionCard>
            )}

            {tab === "notifications" && (
              <>
                <Note tone="warning" icon={AlertTriangle}>{t("settings.notifications.hint")}</Note>
                <SectionCard title={t("settings.tab.notifications")} bodyClassName="">
                  {notifRows.map((n, i) => (
                    <div key={n.key} className={`px-6 py-4 flex items-center gap-6 ${i > 0 ? "border-t border-[#eef1f6]" : ""}`}>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span id={n.id} className="text-sm font-medium text-foreground">{n.label}</span>
                        <span className="text-[13px] text-muted-foreground">{n.sub}</span>
                      </div>
                      <Toggle checked={notifPrefs[n.key]} onChange={(v) => setNotifPrefs((p) => ({ ...p, [n.key]: v }))} labelledBy={n.id} />
                    </div>
                  ))}
                </SectionCard>
              </>
            )}
          </div>
        </div>
      </div>

      {saveBar && (
        <div className="sticky bottom-0 z-10 flex-shrink-0 bg-white border-t border-border shadow-[0_-8px_16px_-12px_rgba(11,29,58,0.18)] px-4 md:px-8 py-4">
          <div className="lg:ml-[244px] lg:max-w-[820px] flex flex-wrap items-center justify-end gap-x-3.5 gap-y-2">
            {saveBar.error && <p role="alert" className="text-[13px] text-[#b93636] mr-auto">{saveBar.error}</p>}
            <SavedNote show={saveBar.saved} />
            <button type="button" data-tour="settings-save" onClick={() => { void saveBar.onSave(); }} disabled={saveBar.saving} className={btn.primary}>
              {saveBar.saving && <Loader2 size={16} className="animate-spin" />}
              {t("common.saveChanges")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
