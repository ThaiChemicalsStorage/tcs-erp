import { HelpCircle } from "lucide-react";
import { useI18n } from "../lib/i18n";

// ปุ่มแถบเครื่องมือสำหรับเล่นทัวร์แนะนำหน้านี้ซ้ำ
// Toolbar button that replays the current page's guided tour
// variant="title" = ปุ่ม ? กลมข้างชื่อหน้า (ดีไซน์ใหม่ 2026-09-30) · ค่าเริ่มต้น = ปุ่มกรอบแบบเดิมในแถบเครื่องมือ
export function TourReplayButton({ onClick, variant = "toolbar" }: { onClick: () => void; variant?: "toolbar" | "title" }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      title={t("tour.replay")}
      aria-label={t("tour.replay")}
      className={variant === "title" ? "flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:bg-[#e3e8f0] hover:text-foreground transition-colors flex-shrink-0" : "flex items-center justify-center w-8 h-8 text-muted-foreground border border-[#c3ccda] bg-white rounded-lg hover:bg-[#f4f6fa] hover:text-foreground transition-all"}
    >
      <HelpCircle size={variant === "title" ? 18 : 14} />
    </button>
  );
}
