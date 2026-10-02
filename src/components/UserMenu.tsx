import { useEffect, useState } from "react";
import { ChevronDown, HelpCircle, LogOut, Settings, Sparkles } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { WhatsNewPanel, useWhatsNewUnseen } from "./WhatsNewPanel";

/**
 * ปุ่มชื่อผู้ใช้มุมขวาบน + เมนู (ดีไซน์ใหม่ 2026-09-30)
 *
 * เมนูมี ตั้งค่า · วิธีใช้งาน · มีอะไรใหม่ · ออกจากระบบ — "มีอะไรใหม่" ย้ายมาจากปุ่มประกายบนแถบบน
 * จุดสีน้ำเงินที่รูปโปรไฟล์บอกว่ามีประกาศใหม่ที่ยังไม่ได้เปิดดู
 */
export function UserMenu({
  currentUserId, fullName, roleName, initials, pictureUrl, onSettings, onHelp, onLogout,
}: {
  currentUserId: string;
  fullName: string;
  roleName: string;
  initials: string;
  pictureUrl?: string;
  onSettings: () => void;
  onHelp: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [unseen, markSeen] = useWhatsNewUnseen(currentUserId);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const item = "w-full h-10 px-2.5 rounded-md flex items-center gap-2.5 text-sm text-foreground hover:bg-[#f4f6fa] transition-colors";

  return (
    <div className="relative" data-tour="user-menu">
      <button
        onClick={() => { setWhatsNewOpen(false); setMenuOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${fullName} — ${t("nav.settings")}, ${t("topbar.help")}, ${t("whatsNew.title")}, ${t("topbar.logout")}`}
        className="h-11 pl-1 pr-2 rounded-lg flex items-center gap-2.5 hover:bg-[#f4f6fa] transition-colors"
      >
        {/* จุดแจ้งเตือนอยู่นอกวงกลม (เจ้าของแจ้ง 2026-10-02 ว่าจุดไปอยู่ข้างใน) — วงกลมตัด overflow รูปโปรไฟล์
            จุดจึงต้องอยู่ในกรอบชั้นนอกที่ไม่ตัด แล้วเลื่อนออกไปที่มุมขวาบน */}
        <span className="relative flex-shrink-0">
          <span className="w-[34px] h-[34px] rounded-full bg-[#e8edf7] text-[#1a3a6b] text-[13px] font-semibold flex items-center justify-center overflow-hidden">
            {pictureUrl ? <img src={pictureUrl} alt="" className="w-full h-full object-cover" /> : initials}
          </span>
          {unseen && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#1a5fb4] ring-2 ring-white" />}
        </span>
        <span className="hidden lg:flex flex-col items-start leading-tight max-w-[160px] min-w-0">
          <span className="text-sm font-semibold text-foreground truncate max-w-full">{fullName}</span>
          <span className="text-xs text-muted-foreground truncate max-w-full">{roleName}</span>
        </span>
        <ChevronDown size={16} className="text-muted-foreground hidden lg:block" />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div role="menu" aria-label={fullName} className="absolute right-0 top-full mt-2 w-60 bg-card border border-border rounded-[10px] shadow-[0_12px_28px_-8px_rgba(11,29,58,0.22)] z-20 p-1.5 flex flex-col">
            <button role="menuitem" onClick={() => { setMenuOpen(false); onSettings(); }} className={item}>
              <Settings size={16} className="text-muted-foreground" /> {t("nav.settings")}
            </button>
            <button role="menuitem" onClick={() => { setMenuOpen(false); onHelp(); }} className={item}>
              <HelpCircle size={16} className="text-muted-foreground" /> {t("topbar.help")}
            </button>
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); setWhatsNewOpen(true); if (unseen) markSeen(); }}
              className={item}
            >
              <Sparkles size={16} className="text-muted-foreground" />
              <span className="flex-1 text-left">{t("whatsNew.title")}</span>
              {unseen && <span aria-label={t("whatsNew.unseenAria")} className="w-2 h-2 rounded-full bg-[#1a5fb4]" />}
            </button>
            <div className="h-px bg-[#eef1f6] my-1.5 mx-1" />
            <button role="menuitem" onClick={() => { setMenuOpen(false); onLogout(); }} className="w-full h-10 px-2.5 rounded-md flex items-center gap-2.5 text-sm text-[#b93636] hover:bg-[#fcebeb] transition-colors">
              <LogOut size={16} /> {t("topbar.logout")}
            </button>
          </div>
        </>
      )}

      <WhatsNewPanel open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
    </div>
  );
}
