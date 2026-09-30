import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { WHATS_NEW_ENTRIES, hasUnseenWhatsNew, markWhatsNewSeen } from "../lib/whatsNew";
import { useI18n } from "../lib/i18n";

// แปลงวันที่แบบ ISO ให้เป็นรูปแบบวันที่ภาษาไทย
// Formats an ISO date string as a Thai-locale date
function formatThaiDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * สถานะ "ยังมีรายการใหม่ที่ไม่ได้ดู" ของผู้ใช้คนนี้
 *
 * ดีไซน์ใหม่ (2026-09-30) ย้าย "มีอะไรใหม่" จากปุ่มประกายบนแถบบนเข้าไปในเมนูผู้ใช้ ตัวแผงกับจุดแจ้ง
 * จึงแยกกัน — จุดโชว์ทั้งที่ปุ่มชื่อผู้ใช้และที่รายการในเมนู ส่วนแผงเปิดจากเมนู
 */
export function useWhatsNewUnseen(currentUserId: string): [boolean, () => void] {
  const [unseen, setUnseen] = useState(() => hasUnseenWhatsNew(currentUserId));
  const markSeen = useCallback(() => {
    markWhatsNewSeen(currentUserId);
    setUnseen(false);
  }, [currentUserId]);
  return [unseen, markSeen];
}

// แผงรายการฟีเจอร์ใหม่ วางใต้ปุ่มชื่อผู้ใช้มุมขวาบน
// "What's new" panel, anchored under the user button in the topbar
export function WhatsNewPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div
        role="dialog"
        aria-label={t("whatsNew.title")}
        className="absolute right-0 top-full mt-2 w-[26rem] max-w-[90vw] bg-card border border-border rounded-xl shadow-[0_12px_28px_-8px_rgba(11,29,58,0.22)] z-20 overflow-hidden flex flex-col max-h-[32rem]"
      >
        <div className="flex items-center gap-2 pl-4 pr-2 py-2.5 border-b border-border">
          <p className="flex-1 text-[15px] font-semibold text-foreground">{t("whatsNew.title")}</p>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="w-8 h-8 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {WHATS_NEW_ENTRIES.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">{t("whatsNew.empty")}</p>
          ) : (
            WHATS_NEW_ENTRIES.map((entry) => (
              <div key={entry.id} className="px-4 py-3.5 border-b border-[#eef1f6] last:border-0">
                <p className="text-sm font-semibold text-foreground leading-snug">{entry.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatThaiDate(entry.date)}</p>
                <ul className="mt-2 space-y-1.5">
                  {entry.bullets.map((b, i) => (
                    <li key={i} className="text-[13px] text-[#3d5173] leading-relaxed flex gap-2">
                      <span aria-hidden="true" className="mt-[7px] w-1 h-1 rounded-full bg-[#8a97ad] flex-shrink-0" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
