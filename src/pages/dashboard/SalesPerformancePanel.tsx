import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtShort, fmtPercent, fmtDaysOrDash } from "./format";

/**
 * Efficiency/rate metrics that don't need their own KPI card — a compact label/value grid inside
 * one `ChartCard`, not 6 more same-size tiles. Added 2026-07-13 (third Dashboard simplification
 * pass) pulling these 6 fields out of the old flat `KpiGrid.tsx` (removed).
 */
export function SalesPerformancePanel({ kpis }: { kpis: DashboardKpis }) {
  const { t } = useI18n();
  const days = t("dashboard.unit.days");
  const metrics: { label: string; value: string }[] = [
    { label: t("dashboard.kpi.winRate"), value: fmtPercent(kpis.winRate) },
    { label: t("dashboard.kpi.loseRate"), value: fmtPercent(kpis.loseRate) },
    { label: t("dashboard.kpi.conversionRate"), value: fmtPercent(kpis.conversionRate) },
    { label: t("dashboard.kpi.averageDealSize"), value: fmtShort(kpis.averageDealSize) },
    { label: t("dashboard.kpi.averageApprovalTime"), value: fmtDaysOrDash(kpis.averageApprovalTime, days) },
    { label: t("dashboard.kpi.averageClosingTime"), value: fmtDaysOrDash(kpis.averageClosingTime, days) },
  ];
  return (
    <ChartCard title={t("dashboard.salesEfficiency.title")} sub={t("dashboard.salesEfficiency.sub")}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0">
            <p className="text-[11px] text-muted-foreground truncate" title={m.label}>{m.label}</p>
            <p className="text-lg font-bold font-mono text-foreground mt-0.5">{m.value}</p>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
