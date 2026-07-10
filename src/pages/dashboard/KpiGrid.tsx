import {
  TrendingUp, Boxes, Users, FileText, Trophy, Frown, Target, Percent, Timer,
  Clock, AlertTriangle, CalendarClock, UserPlus, Repeat, Wallet, Activity, Ban, ClipboardCheck, type LucideIcon,
} from "lucide-react";
import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { fmtShort, fmtPercent, fmtDaysOrDash } from "./format";

function KpiCard({ title, value, icon: Icon, accent }: { title: string; value: string; icon: LucideIcon; accent: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-[#c9a84c]/30 transition-all duration-200">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: `${accent}18` }}>
        <Icon size={18} style={{ color: accent }} />
      </div>
      <p className="text-2xl font-bold text-foreground font-mono tracking-tight">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{title}</p>
    </div>
  );
}

export function KpiGrid({ kpis }: { kpis: DashboardKpis }) {
  const { t } = useI18n();
  const days = t("dashboard.unit.days");

  const cards: { title: string; value: string; icon: LucideIcon; accent: string }[] = [
    { title: t("dashboard.kpi.totalQuotations"), value: kpis.totalQuotations.toLocaleString("th-TH"), icon: FileText, accent: "#1a5fb4" },
    { title: t("dashboard.kpi.totalQuotationValue"), value: fmtShort(kpis.totalQuotationValue), icon: Wallet, accent: "#5a7299" },
    { title: t("dashboard.kpi.closedSales"), value: fmtShort(kpis.closedSales), icon: TrendingUp, accent: "#c9a84c" },
    { title: t("dashboard.kpi.expectedSales"), value: fmtShort(kpis.expectedSales), icon: Target, accent: "#1a5fb4" },
    { title: t("dashboard.kpi.averageDealSize"), value: fmtShort(kpis.averageDealSize), icon: Wallet, accent: "#7c4dbb" },
    { title: t("dashboard.kpi.winRate"), value: fmtPercent(kpis.winRate), icon: Percent, accent: "#2aa36b" },
    { title: t("dashboard.kpi.loseRate"), value: fmtPercent(kpis.loseRate), icon: Percent, accent: "#e05252" },
    { title: t("dashboard.kpi.conversionRate"), value: fmtPercent(kpis.conversionRate), icon: Activity, accent: "#1f9d8a" },
    { title: t("dashboard.kpi.averageApprovalTime"), value: fmtDaysOrDash(kpis.averageApprovalTime, days), icon: Timer, accent: "#e08a3c" },
    { title: t("dashboard.kpi.averageClosingTime"), value: fmtDaysOrDash(kpis.averageClosingTime, days), icon: Clock, accent: "#e08a3c" },
    { title: t("dashboard.kpi.activeQuotations"), value: kpis.activeQuotations.toLocaleString("th-TH"), icon: FileText, accent: "#3b6fc9" },
    { title: t("dashboard.kpi.nonActiveQuotations"), value: kpis.nonActiveQuotations.toLocaleString("th-TH"), icon: Ban, accent: "#8a94a6" },
    { title: t("dashboard.kpi.expiredQuotations"), value: kpis.expiredQuotations.toLocaleString("th-TH"), icon: AlertTriangle, accent: "#e05252" },
    { title: t("dashboard.kpi.pendingApprovals"), value: kpis.pendingApprovals.toLocaleString("th-TH"), icon: ClipboardCheck, accent: "#c9a84c" },
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
