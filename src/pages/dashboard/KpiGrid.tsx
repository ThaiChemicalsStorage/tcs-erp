import {
  TrendingUp, Boxes, Users, FileText, Trophy, Frown, Target, Percent, Timer,
  Clock, AlertTriangle, CalendarClock, UserPlus, Repeat, Wallet, Activity, Ban, ClipboardCheck, type LucideIcon,
} from "lucide-react";
import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { MetricInfoTooltip } from "../../components/MetricInfoTooltip";
import { fmtShort, fmtPercent, fmtDaysOrDash } from "./format";

function KpiCard({ title, value, icon: Icon, accent, help }: { title: string; value: string; icon: LucideIcon; accent: string; help?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-[#c9a84c]/30 transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
        {help && <MetricInfoTooltip label={title} text={help} />}
      </div>
      <p className="text-2xl font-bold text-foreground font-mono tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{title}</p>
    </div>
  );
}

/**
 * The original flat, single-tier KPI grid (restored 2026-07-13 after the 2026-07-10 UI/UX
 * redesign's two-tier PrimaryKpiCards/SecondaryKpiSummary split read as too "template-like" —
 * see CHANGELOG.md). One consistent card size for every metric, no hero-card treatment. All 22
 * KPI fields `DashboardKpis` computes are shown (some had quietly stopped being rendered anywhere
 * during the redesign, despite the API still returning them) — a few keep the small `?` info
 * tooltip the redesign added for the metrics whose exact definition isn't obvious, since that's a
 * tiny non-visual affordance, not part of the card-size/hierarchy complaint.
 */
export function KpiGrid({ kpis }: { kpis: DashboardKpis }) {
  const { t } = useI18n();
  const days = t("dashboard.unit.days");

  const cards: { title: string; value: string; icon: LucideIcon; accent: string; help?: string }[] = [
    { title: t("dashboard.kpi.totalQuotations"), value: kpis.totalQuotations.toLocaleString("th-TH"), icon: FileText, accent: "#1a5fb4" },
    { title: t("dashboard.kpi.totalQuotationValue"), value: fmtShort(kpis.totalQuotationValue), icon: Wallet, accent: "#5a7299" },
    { title: t("dashboard.kpi.closedSales"), value: fmtShort(kpis.closedSales), icon: TrendingUp, accent: "#c9a84c" },
    { title: t("dashboard.kpi.expectedSales"), value: fmtShort(kpis.expectedSales), icon: Target, accent: "#1a5fb4", help: t("dashboard.kpi.help.expectedSales") },
    { title: t("dashboard.kpi.averageDealSize"), value: fmtShort(kpis.averageDealSize), icon: Wallet, accent: "#7c4dbb", help: t("dashboard.kpi.help.averageDealSize") },
    { title: t("dashboard.kpi.winRate"), value: fmtPercent(kpis.winRate), icon: Percent, accent: "#2aa36b", help: t("dashboard.kpi.help.winRate") },
    { title: t("dashboard.kpi.loseRate"), value: fmtPercent(kpis.loseRate), icon: Percent, accent: "#e05252" },
    { title: t("dashboard.kpi.conversionRate"), value: fmtPercent(kpis.conversionRate), icon: Activity, accent: "#1f9d8a" },
    { title: t("dashboard.kpi.averageApprovalTime"), value: fmtDaysOrDash(kpis.averageApprovalTime, days), icon: Timer, accent: "#e08a3c" },
    { title: t("dashboard.kpi.averageClosingTime"), value: fmtDaysOrDash(kpis.averageClosingTime, days), icon: Clock, accent: "#e08a3c", help: t("dashboard.kpi.help.averageClosingTime") },
    { title: t("dashboard.kpi.activeQuotations"), value: kpis.activeQuotations.toLocaleString("th-TH"), icon: FileText, accent: "#3b6fc9", help: t("dashboard.kpi.help.activeQuotations") },
    { title: t("dashboard.kpi.nonActiveQuotations"), value: kpis.nonActiveQuotations.toLocaleString("th-TH"), icon: Ban, accent: "#8a94a6", help: t("dashboard.kpi.help.nonActiveQuotations") },
    { title: t("dashboard.kpi.expiredQuotations"), value: kpis.expiredQuotations.toLocaleString("th-TH"), icon: AlertTriangle, accent: "#e05252" },
    { title: t("dashboard.kpi.pendingApprovals"), value: kpis.pendingApprovals.toLocaleString("th-TH"), icon: ClipboardCheck, accent: "#c9a84c", help: t("dashboard.kpi.help.pendingApprovals") },
    { title: t("dashboard.kpi.overdueFollowups"), value: kpis.overdueFollowups.toLocaleString("th-TH"), icon: CalendarClock, accent: "#e05252" },
    { title: t("dashboard.kpi.newCustomers"), value: kpis.newCustomers.toLocaleString("th-TH"), icon: UserPlus, accent: "#2aa36b" },
    { title: t("dashboard.kpi.repeatCustomers"), value: kpis.repeatCustomers.toLocaleString("th-TH"), icon: Repeat, accent: "#7c4dbb" },
    { title: t("dashboard.kpi.totalCustomers"), value: kpis.totalCustomers.toLocaleString("th-TH"), icon: Users, accent: "#7c4dbb" },
    { title: t("dashboard.kpi.totalLeads"), value: kpis.totalLeads.toLocaleString("th-TH"), icon: Users, accent: "#3b6fc9" },
    { title: t("dashboard.kpi.totalProducts"), value: kpis.totalProducts.toLocaleString("th-TH"), icon: Boxes, accent: "#2aa36b" },
    { title: t("dashboard.kpi.wonDeals"), value: kpis.wonDeals.toLocaleString("th-TH"), icon: Trophy, accent: "#157347" },
    { title: t("dashboard.kpi.lostDeals"), value: kpis.lostDeals.toLocaleString("th-TH"), icon: Frown, accent: "#e05252" },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((kpi) => <KpiCard key={kpi.title} {...kpi} />)}
    </div>
  );
}
