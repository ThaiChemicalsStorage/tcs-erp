import { Trophy, Frown, Ban, Wallet, Clock, ClipboardCheck, CalendarClock, Users, Boxes, type LucideIcon } from "lucide-react";
import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { MetricInfoTooltip } from "../../components/MetricInfoTooltip";
import { fmtShort, fmtDaysOrDash } from "./format";

function MiniCard({ title, value, icon: Icon, accent, help }: { title: string; value: string; icon: LucideIcon; accent: string; help?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: `${accent}18` }}>
        <Icon size={15} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground font-mono leading-none truncate">{value}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-[10px] text-muted-foreground truncate">{title}</p>
          {help && <MetricInfoTooltip label={title} text={help} />}
        </div>
      </div>
    </div>
  );
}

/**
 * Everything that's real and useful but doesn't need to compete with `PrimaryKpiCards` for the
 * first thing an executive sees — small, dense mini-cards instead of full-size KPI tiles, per the
 * 2026-07-10 UI/UX redesign request ("secondary KPIs... compact mini cards, do not mix these with
 * the main KPI cards").
 */
export function SecondaryKpiSummary({ kpis }: { kpis: DashboardKpis }) {
  const { t } = useI18n();
  const days = t("dashboard.unit.days");
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("dashboard.section.secondaryKpi")}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2.5">
        <MiniCard title={t("dashboard.kpi.wonDeals")} value={kpis.wonDeals.toLocaleString("th-TH")} icon={Trophy} accent="#157347" />
        <MiniCard title={t("dashboard.kpi.lostDeals")} value={kpis.lostDeals.toLocaleString("th-TH")} icon={Frown} accent="#e05252" />
        <MiniCard title={t("dashboard.kpi.nonActiveQuotations")} value={kpis.nonActiveQuotations.toLocaleString("th-TH")} icon={Ban} accent="#8a94a6" help={t("dashboard.kpi.help.nonActiveQuotations")} />
        <MiniCard title={t("dashboard.kpi.averageDealSize")} value={fmtShort(kpis.averageDealSize)} icon={Wallet} accent="#7c4dbb" help={t("dashboard.kpi.help.averageDealSize")} />
        <MiniCard title={t("dashboard.kpi.averageClosingTime")} value={fmtDaysOrDash(kpis.averageClosingTime, days)} icon={Clock} accent="#e08a3c" help={t("dashboard.kpi.help.averageClosingTime")} />
        <MiniCard title={t("dashboard.kpi.pendingApprovals")} value={kpis.pendingApprovals.toLocaleString("th-TH")} icon={ClipboardCheck} accent="#c9a84c" help={t("dashboard.kpi.help.pendingApprovals")} />
        <MiniCard title={t("dashboard.kpi.overdueFollowups")} value={kpis.overdueFollowups.toLocaleString("th-TH")} icon={CalendarClock} accent="#e05252" />
        <MiniCard title={t("dashboard.kpi.totalCustomers")} value={kpis.totalCustomers.toLocaleString("th-TH")} icon={Users} accent="#7c4dbb" />
        <MiniCard title={t("dashboard.kpi.totalProducts")} value={kpis.totalProducts.toLocaleString("th-TH")} icon={Boxes} accent="#2aa36b" />
      </div>
    </div>
  );
}
