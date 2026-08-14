import type { DashboardKpis, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtShort, fmtPercent, fmtDaysOrDash } from "./format";

// แสดงตัวชี้วัดประสิทธิภาพการขาย (อัตราชนะ/แพ้/ปิดการขาย ฯลฯ) เป็นตารางกริดกะทัดรัด
// Renders sales efficiency metrics (win/lose/conversion rates, etc.) as a compact grid
export function SalesPerformancePanel({ kpis, vatMode }: { kpis: DashboardKpis; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const days = t("dashboard.unit.days");
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const metrics: { label: string; value: string }[] = [
    { label: t("dashboard.kpi.winRate"), value: fmtPercent(kpis.winRate) },
    { label: t("dashboard.kpi.loseRate"), value: fmtPercent(kpis.loseRate) },
    { label: t("dashboard.kpi.conversionRate"), value: fmtPercent(kpis.conversionRate) },
    { label: `${t("dashboard.kpi.averageDealSize")} ${vatSuffix}`, value: fmtShort(kpis.averageDealSize) },
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
