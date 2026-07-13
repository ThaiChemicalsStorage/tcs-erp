import { Bell } from "lucide-react";
import type { NotificationSummary as NotificationSummaryData } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";

export function NotificationSummary({ summary }: { summary: NotificationSummaryData }) {
  const { t } = useI18n();
  const byType = Object.entries(summary.byType);
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
        <Bell size={15} /> {t("dashboard.notifications.title")}
      </h2>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-3xl font-bold font-mono text-[#c9a84c]">{summary.unreadCount}</span>
        <span className="text-xs text-muted-foreground">{t("dashboard.notifications.unread")}</span>
      </div>
      {byType.length > 0 && (
        <div className="space-y-1.5">
          {byType.map(([type, count]) => (
            <div key={type} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{type}</span>
              <span className="font-mono text-foreground">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
