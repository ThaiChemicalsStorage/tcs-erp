import { useEffect, useState } from "react";
import {
  User, Building2, ShieldCheck, Bell, CheckCircle2, Hash, Mail, Phone, MapPin, type LucideIcon,
} from "lucide-react";
import type { Company, UserProfile } from "../lib/storage";
import { initials } from "../lib/storage";

type Tab = "profile" | "company" | "security" | "notifications";

const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: "profile", label: "โปรไฟล์", icon: User },
  { key: "company", label: "ข้อมูลบริษัท", icon: Building2 },
  { key: "security", label: "ความปลอดภัย", icon: ShieldCheck },
  { key: "notifications", label: "การแจ้งเตือน", icon: Bell },
];

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
const labelCls = "text-xs text-muted-foreground block mb-1.5";

export function SettingsPage({
  company,
  onCompanyChange,
  user,
  onUserChange,
}: {
  company: Company;
  onCompanyChange: (c: Company) => void;
  user: UserProfile;
  onUserChange: (u: UserProfile) => void;
}) {
  const [tab, setTab] = useState<Tab>("profile");

  const [profileDraft, setProfileDraft] = useState(user);
  const [profileSaved, flashProfileSaved] = useSavedFlash();

  const [companyDraft, setCompanyDraft] = useState(company);
  const [companySaved, flashCompanySaved] = useSavedFlash();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSaved, flashPwSaved] = useSavedFlash();

  const [notifications, setNotifications] = useState({
    quoteApproved: true,
    lowStock: true,
    weeklyDigest: false,
  });

  const saveProfile = () => {
    onUserChange(profileDraft);
    flashProfileSaved();
  };

  const saveCompany = () => {
    onCompanyChange(companyDraft);
    flashCompanySaved();
  };

  const savePassword = () => {
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
    setPwError("");
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    flashPwSaved();
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
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#c9a84c] to-[#a07830] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
              {initials(profileDraft.name || "?")}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{profileDraft.name || "—"}</p>
              <p className="text-xs text-muted-foreground font-mono">{profileDraft.role}</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>ชื่อ-นามสกุล</label>
              <input className={inputCls} value={profileDraft.name} onChange={(e) => setProfileDraft((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>อีเมล</label>
              <input className={inputCls} value={profileDraft.email} onChange={(e) => setProfileDraft((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>ตำแหน่ง</label>
              <input className={inputCls} value={profileDraft.role} onChange={(e) => setProfileDraft((p) => ({ ...p, role: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveProfile} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              บันทึกการเปลี่ยนแปลง
            </button>
            <SavedNote show={profileSaved} />
          </div>
        </div>
      )}

      {/* Company */}
      {tab === "company" && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-2xl space-y-5">
          <p className="text-xs text-muted-foreground leading-relaxed">
            ข้อมูลนี้จะแสดงบนหัวเอกสารใบเสนอราคาที่ออกให้ลูกค้า
          </p>
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
            <div>
              <label className={`${labelCls} flex items-center gap-1`}><Hash size={10} /> เลขประจำตัวผู้เสียภาษี</label>
              <input className={`${inputCls} font-mono`} value={companyDraft.taxId} onChange={(e) => setCompanyDraft((c) => ({ ...c, taxId: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={saveCompany} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              บันทึกการเปลี่ยนแปลง
            </button>
            <SavedNote show={companySaved} />
          </div>
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
              <Toggle checked={notifications[n.key]} onChange={(v) => setNotifications((p) => ({ ...p, [n.key]: v }))} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
