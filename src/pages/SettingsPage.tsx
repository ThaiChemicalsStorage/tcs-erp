import { useEffect, useRef, useState } from "react";
import {
  User as UserIcon, Building2, ShieldCheck, Bell, CheckCircle2, Hash, Mail, Phone, MapPin, type LucideIcon,
  Image as ImageIcon, Stamp, Upload, X, AlertTriangle, PenTool, Landmark, FileText,
} from "lucide-react";
import type { Company } from "../lib/storage";
import { saveCompany as saveCompanyApi } from "../lib/storage";
import type { User } from "../lib/users";
import { initials, updateUser } from "../lib/users";
import { ApiError } from "../lib/apiClient";
import type { Role } from "../lib/roles";
import { useI18n, type Lang } from "../lib/i18n";

const MAX_IMAGE_BYTES = 1_000_000;

function ImageUploadField({
  label,
  icon: Icon,
  value,
  onChange,
  aspect = "square",
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (dataUrl: string) => void;
  aspect?: "square" | "wide";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 1MB)");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label className={labelCls}><span className="flex items-center gap-1"><Icon size={10} /> {label}</span></label>
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 flex items-center justify-center bg-secondary border border-border rounded-lg overflow-hidden ${aspect === "square" ? "w-16 h-16" : "w-28 h-16"}`}>
          {value ? (
            <img src={value} alt={label} className="w-full h-full object-contain" />
          ) : (
            <Icon size={18} className="text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
            >
              <Upload size={12} /> อัปโหลด
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-[#e05252] hover:border-[#e05252]/40 transition-all"
              >
                <X size={12} /> ลบ
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">PNG/JPG ไม่เกิน 1MB</p>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {error && <p className="text-xs text-[#e05252] mt-1.5 flex items-center gap-1"><AlertTriangle size={11} /> {error}</p>}
    </div>
  );
}

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
  if (!show) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs text-[#2aa36b]">
      <CheckCircle2 size={13} /> บันทึกการเปลี่ยนแปลงแล้ว
    </span>
  );
}

function useSavedFlash() {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);
  return [saved, () => setSaved(true)] as const;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
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
const readOnlyCls = "w-full text-sm text-muted-foreground bg-muted border border-border rounded-lg px-3 py-2 outline-none cursor-not-allowed";
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
  const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: "profile", label: "โปรไฟล์", icon: UserIcon },
    ...(canManageCompany ? [{ key: "company" as const, label: "ข้อมูลบริษัท", icon: Building2 }] : []),
    { key: "security", label: "ความปลอดภัย", icon: ShieldCheck },
    { key: "notifications", label: "การแจ้งเตือน", icon: Bell },
  ];
  const [tab, setTab] = useState<Tab>("profile");

  const [profileDraft, setProfileDraft] = useState(currentUser);
  const [profileSaved, flashProfileSaved] = useSavedFlash();
  const [profileError, setProfileError] = useState("");

  const [companyDraft, setCompanyDraft] = useState(company);
  const [companySaved, flashCompanySaved] = useSavedFlash();
  const [companyError, setCompanyError] = useState("");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaved, flashPwSaved] = useSavedFlash();

  const [notifPrefs, setNotifPrefs] = useState({
    quoteApproved: true,
    lowStock: true,
    weeklyDigest: false,
  });

  const roleName = roles.find((r) => r.key === currentUser.roleKey)?.name ?? currentUser.roleKey;

  const saveProfile = async () => {
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
      setProfileError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const saveCompany = async () => {
    try {
      const updated = await saveCompanyApi(companyDraft);
      setCompanyError("");
      onCompanyChange(updated);
      onAudit("Company Settings Updated", `${currentUser.fullName} แก้ไขข้อมูลบริษัท`);
      flashCompanySaved();
    } catch (err) {
      setCompanyError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const savePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) {
      setPwError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    if (newPw.length < 6) {
      setPwError("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("รหัสผ่านใหม่และการยืนยันไม่ตรงกัน");
      return;
    }
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
      setPwError(err instanceof ApiError ? err.message : "เปลี่ยนรหัสผ่านไม่สำเร็จ");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>ตั้งค่า</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">จัดการข้อมูลบัญชีและองค์กรของคุณ</p>
      </div>

      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-medium transition-all whitespace-nowrap ${
              tab === t.key ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Profile */}
      {tab === "profile" && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#a07830] flex items-center justify-center text-white text-lg font-bold flex-shrink-0 overflow-hidden">
              {profileDraft.profilePictureDataUrl ? (
                <img src={profileDraft.profilePictureDataUrl} alt={profileDraft.fullName} className="w-full h-full object-cover" />
              ) : (
                initials(profileDraft.fullName || "?")
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{profileDraft.fullName || "—"}</p>
              <p className="text-xs text-muted-foreground font-mono">{roleName}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>ชื่อ-นามสกุล</label>
              <input className={inputCls} value={profileDraft.fullName} onChange={(e) => setProfileDraft((p) => ({ ...p, fullName: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>เบอร์โทรศัพท์</label>
              <input className={inputCls} value={profileDraft.phone} onChange={(e) => setProfileDraft((p) => ({ ...p, phone: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>รหัสพนักงาน</label>
              <input className={readOnlyCls} value={profileDraft.employeeId} disabled />
            </div>
            <div>
              <label className={labelCls}>อีเมล</label>
              <input className={readOnlyCls} value={profileDraft.email} disabled />
            </div>
            <div>
              <label className={labelCls}>แผนก</label>
              <input className={readOnlyCls} value={profileDraft.department || "—"} disabled />
            </div>
            <div>
              <label className={labelCls}>ตำแหน่งงาน</label>
              <input className={readOnlyCls} value={profileDraft.position || "—"} disabled />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>บทบาท (Role)</label>
              <input className={readOnlyCls} value={roleName} disabled />
              <p className="text-[10px] text-muted-foreground mt-1">บทบาทกำหนดโดยผู้ดูแลระบบเท่านั้น</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-border">
            <ImageUploadField
              label="รูปโปรไฟล์"
              icon={ImageIcon}
              value={profileDraft.profilePictureDataUrl}
              onChange={(v) => setProfileDraft((p) => ({ ...p, profilePictureDataUrl: v }))}
              aspect="square"
            />
            <ImageUploadField
              label="ลายเซ็นส่วนตัว"
              icon={PenTool}
              value={profileDraft.signatureDataUrl}
              onChange={(v) => setProfileDraft((p) => ({ ...p, signatureDataUrl: v }))}
              aspect="wide"
            />
          </div>
          <p className="text-[10px] text-muted-foreground -mt-3">ลายเซ็นนี้จะถูกใช้อัตโนมัติในใบเสนอราคาที่คุณสร้างหรืออนุมัติ</p>

          <div className="pt-2 border-t border-border">
            <LanguageField />
          </div>

          {profileError && <p className="text-xs text-[#e05252]">{profileError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveProfile} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              บันทึกการเปลี่ยนแปลง
            </button>
            <SavedNote show={profileSaved} />
          </div>
        </div>
      )}

      {/* Company */}
      {tab === "company" && canManageCompany && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            ข้อมูลนี้จะแสดงบนหัวเอกสารใบเสนอราคาที่ออกให้ลูกค้า — เฉพาะ Super Admin เท่านั้นที่แก้ไขได้
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <ImageUploadField label="โลโก้บริษัท" icon={ImageIcon} value={companyDraft.logoDataUrl} onChange={(v) => setCompanyDraft((c) => ({ ...c, logoDataUrl: v }))} aspect="wide" />
            <ImageUploadField label="ตราประทับบริษัท (ไม่บังคับ)" icon={Stamp} value={companyDraft.stampDataUrl} onChange={(v) => setCompanyDraft((c) => ({ ...c, stampDataUrl: v }))} />
          </div>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>ชื่อบริษัท</label>
              <input className={inputCls} value={companyDraft.name} onChange={(e) => setCompanyDraft((c) => ({ ...c, name: e.target.value }))} />
            </div>
            <div>
              <label className={`${labelCls} flex items-center gap-1`}><MapPin size={10} /> ที่อยู่</label>
              <input className={inputCls} value={companyDraft.address} onChange={(e) => setCompanyDraft((c) => ({ ...c, address: e.target.value }))} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={`${labelCls} flex items-center gap-1`}><Phone size={10} /> โทรศัพท์</label>
                <input className={inputCls} value={companyDraft.phone} onChange={(e) => setCompanyDraft((c) => ({ ...c, phone: e.target.value }))} />
              </div>
              <div>
                <label className={`${labelCls} flex items-center gap-1`}><Mail size={10} /> อีเมลบริษัท</label>
                <input className={inputCls} value={companyDraft.email} onChange={(e) => setCompanyDraft((c) => ({ ...c, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={`${labelCls} flex items-center gap-1`}><Hash size={10} /> เลขประจำตัวผู้เสียภาษี</label>
                <input className={`${inputCls} font-mono`} value={companyDraft.taxId} onChange={(e) => setCompanyDraft((c) => ({ ...c, taxId: e.target.value }))} />
              </div>
              <div>
                <label className={labelCls}>อัตราภาษีมูลค่าเพิ่ม (VAT %)</label>
                <input type="number" min={0} max={100} className={`${inputCls} font-mono`} value={companyDraft.vatRate} onChange={(e) => setCompanyDraft((c) => ({ ...c, vatRate: Number(e.target.value) }))} />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2 border-t border-border">
            <p className={`${labelCls} flex items-center gap-1 text-foreground font-medium`}><Landmark size={12} /> ข้อมูลบัญชีธนาคาร</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>ธนาคาร</label><input className={inputCls} value={companyDraft.bankName} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankName: e.target.value }))} /></div>
              <div><label className={labelCls}>สาขา</label><input className={inputCls} value={companyDraft.bankBranch} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankBranch: e.target.value }))} /></div>
              <div><label className={labelCls}>ชื่อบัญชี</label><input className={inputCls} value={companyDraft.bankAccountName} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankAccountName: e.target.value }))} /></div>
              <div><label className={labelCls}>เลขที่บัญชี</label><input className={`${inputCls} font-mono`} value={companyDraft.bankAccountNumber} onChange={(e) => setCompanyDraft((c) => ({ ...c, bankAccountNumber: e.target.value }))} /></div>
            </div>
          </div>

          <div className="pt-2 border-t border-border">
            <label className={`${labelCls} flex items-center gap-1`}><FileText size={10} /> เงื่อนไขและข้อตกลง (Terms &amp; Conditions) เริ่มต้น</label>
            <textarea rows={4} className={`${inputCls} resize-none`} value={companyDraft.termsAndConditions} onChange={(e) => setCompanyDraft((c) => ({ ...c, termsAndConditions: e.target.value }))} />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveCompany} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              บันทึกการเปลี่ยนแปลง
            </button>
            <SavedNote show={companySaved} />
          </div>
          {companyError && <p className="text-xs text-[#e05252]">{companyError}</p>}
        </div>
      )}

      {/* Security */}
      {tab === "security" && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-5">
          <p className="text-xs font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>เปลี่ยนรหัสผ่าน</p>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>รหัสผ่านปัจจุบัน</label>
              <input type="password" className={inputCls} value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>รหัสผ่านใหม่</label>
                <input type="password" className={inputCls} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>ยืนยันรหัสผ่านใหม่</label>
                <input type="password" className={inputCls} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
              </div>
            </div>
          </div>
          {pwError && <p className="text-xs text-[#e05252]">{pwError}</p>}
          <div className="flex items-center gap-3 pt-1">
            <button onClick={savePassword} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              อัปเดตรหัสผ่าน
            </button>
            <SavedNote show={pwSaved} />
          </div>
        </div>
      )}

      {/* Notifications */}
      {tab === "notifications" && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-1">
          {[
            { key: "quoteApproved" as const, label: "ใบเสนอราคาได้รับการอนุมัติ", sub: "แจ้งเตือนเมื่อใบเสนอราคาถูกอนุมัติหรือปฏิเสธ" },
            { key: "lowStock" as const, label: "สินค้าคงคลังต่ำกว่าสต็อกสำรอง", sub: "แจ้งเตือนเมื่อสินค้าในคลังใกล้หมด" },
            { key: "weeklyDigest" as const, label: "สรุปรายงานประจำสัปดาห์", sub: "ส่งสรุปภาพรวมธุรกิจทางอีเมลทุกสัปดาห์" },
          ].map((n, i) => (
            <div key={n.key} className={`flex items-center justify-between py-4 ${i > 0 ? "border-t border-border" : ""}`}>
              <div>
                <p className="text-sm text-foreground font-medium">{n.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.sub}</p>
              </div>
              <Toggle checked={notifPrefs[n.key]} onChange={(v) => setNotifPrefs((p) => ({ ...p, [n.key]: v }))} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
