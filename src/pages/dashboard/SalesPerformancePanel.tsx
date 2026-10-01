import type { DashboardKpis, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard, ScopeTag } from "./ChartCard";
import { fmtShort, fmtPercent, fmtDaysOrDash } from "./format";
import { StatCells } from "./tabs/DepartmentWidgets";
import { fmtCount } from "./tabs/countFormat";

// ประสิทธิภาพการขาย (บอร์ด Dashboard-Sales) — ช่องตัวเลขคั่นเส้นบางเต็มการ์ด
// Sales efficiency metrics (win/lose/conversion rates, etc.) as a divided grid of figures
export function SalesPerformancePanel({ kpis, vatMode }: { kpis: DashboardKpis; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const days = t("dashboard.unit.days");
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  return (
    <ChartCard flush title={t("dashboard.salesEfficiency.title")} sub={t("dashboard.salesEfficiency.sub")} actions={<ScopeTag>{t("dashboard.dept.periodTag")}</ScopeTag>}>
      <StatCells
        size="lg"
        cells={[
          { key: "winRate", label: t("dashboard.kpi.winRate"), value: fmtPercent(kpis.winRate), sub: t("dashboard.kpi.helper.winRate") },
          { key: "loseRate", label: t("dashboard.kpi.loseRate"), value: fmtPercent(kpis.loseRate) },
          { key: "conversionRate", label: t("dashboard.kpi.conversionRate"), value: fmtPercent(kpis.conversionRate) },
          { key: "averageDealSize", label: t("dashboard.kpi.averageDealSize"), value: fmtShort(kpis.averageDealSize), sub: vatSuffix },
          { key: "averageApprovalTime", label: t("dashboard.kpi.averageApprovalTime"), value: fmtDaysOrDash(kpis.averageApprovalTime, days) },
          { key: "averageClosingTime", label: t("dashboard.kpi.averageClosingTime"), value: fmtDaysOrDash(kpis.averageClosingTime, days) },
          { key: "activeQuotations", label: t("dashboard.kpi.activeQuotations"), value: fmtCount(kpis.activeQuotations), sub: t("dashboard.kpi.helper.activeQuotations") },
          { key: "nonActiveQuotations", label: t("dashboard.kpi.nonActiveQuotations"), value: fmtCount(kpis.nonActiveQuotations) },
        ]}
      />
    </ChartCard>
  );
}
