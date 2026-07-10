import type { JobTypeStat } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { fmtShort, fmtPercent } from "./format";

export function JobTypeAnalytics({ jobTypeAnalytics }: { jobTypeAnalytics: JobTypeStat[] }) {
  const { t } = useI18n();
  const maxRevenue = Math.max(1, ...jobTypeAnalytics.map((j) => j.revenue));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.jobType.title")}</h2>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("dashboard.jobType.sub")}</p>
      </div>
      {jobTypeAnalytics.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <div className="space-y-3">
          {jobTypeAnalytics.map((j) => (
            <div key={j.jobTypeCode}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-foreground font-medium">
                  <span className="font-mono text-muted-foreground mr-1.5">{j.jobTypeCode}</span>{j.jobTypeName}
                </span>
                <span className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                  <span>{j.count} {t("quotation.countUnit")}</span>
                  <span>{t("dashboard.jobType.winRate")} {fmtPercent(j.winRate)}</span>
                  <span className="text-foreground font-semibold">{fmtShort(j.revenue)}</span>
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#c9a84c]" style={{ width: `${(j.revenue / maxRevenue) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
