import { HelpCircle } from "lucide-react";
import { useI18n } from "../lib/i18n";

// ปุ่มแถบเครื่องมือสำหรับเล่นทัวร์แนะนำหน้านี้ซ้ำ
// Toolbar button that replays the current page's guided tour
export function TourReplayButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      title={t("tour.replay")}
      aria-label={t("tour.replay")}
      className="flex items-center justify-center w-8 h-8 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
    >
      <HelpCircle size={14} />
    </button>
  );
}
