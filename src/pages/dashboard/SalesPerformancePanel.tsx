import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtShort, fmtPercent, fmtDaysOrDash } from "./format";

/**
 * Efficiency/rate metrics that don't need their own KPI card — a compact label/value grid inside
 * one `ChartCard`, not 8 more same-size tiles. Added 2026-07-13 (third Dashboard simplification
 * pass) pulling these fields out of the old flat `KpiGrid.tsx` (removed). Active/Non-Active
 * Quotations added 2026-07-13 (fifth pass) alongside the original 6 rate/cycle-time metrics —
 * also shown in `QuotationStatusSummary`'s table, kept here too since the requested layout
 * explicitly lists them as part of this panel.
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
    { label: t("dashboard.kpi.activeQuotations"), value: kpis.activeQuotations.toLocaleString("th-TH") },
    { label: t("dashboard.kpi.nonActiveQuotations"), value: kpis.nonActiveQuotations.toLocaleString("th-TH") },
  ];
  return (
    <ChartCard title={t("dashboard.salesEfficiency.title")} sub={t("dashboard.salesEfficiency.sub")}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-5">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0">
            <p className="text-xs text-muted-foreground truncate" title={m.label}>{m.label}</p>
            <p className="text-lg font-bold font-mono text-foreground mt-0.5">{m.value}</p>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
