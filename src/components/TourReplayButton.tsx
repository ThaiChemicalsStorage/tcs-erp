import { HelpCircle } from "lucide-react";
import { useI18n } from "../lib/i18n";

/** Shared HelpCircle "replay this page's tour" toolbar button (extracted 2026-07-29 — it had
 * been copy-pasted per page and had already drifted into two size variants; new call sites must
 * use this instead of hand-rolling the markup). Lives in its own file (not GuidedTour.tsx, which
 * exports only hooks) so react-refresh's only-export-components rule stays satisfied. */
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
