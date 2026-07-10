import { History } from "lucide-react";
import type { AuditLogEntry } from "../../lib/auditLog";
import { useI18n } from "../../lib/i18n";

export function ActivityTimeline({ entries }: { entries: AuditLogEntry[] }) {
  const { t } = useI18n();
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', serif" }}>
        <History size={15} /> {t("dashboard.activity.title")}
      </h2>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-[#c9a84c] flex-shrink-0 mt-1.5" />
              <div className="min-w-0 flex-1">
                <p className="text-foreground">
                  <span className="font-semibold">{e.userName}</span>
                  <span className="text-muted-foreground"> ({e.roleName}) — {e.action}</span>
                </p>
                {e.details && <p className="text-muted-foreground mt-0.5 truncate">{e.details}</p>}
                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{new Date(e.createdAt).toLocaleString("th-TH")}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
