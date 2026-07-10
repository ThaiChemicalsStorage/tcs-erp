import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, CircleDot, LayoutDashboard } from "lucide-react";
import { type Quote, type QuoteStatus, interestLabelKey } from "../../lib/quotes";
import { fetchDashboardStats, type DashboardStats } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { DashboardFilterBar, type DashboardFilterState } from "./DashboardFilterBar";
import { KpiGrid } from "./KpiGrid";
import { PipelineFunnel } from "./PipelineFunnel";
import { SalesPerformanceTable } from "./SalesPerformanceTable";
import { JobTypeAnalytics } from "./JobTypeAnalytics";
import { CustomerAnalytics } from "./CustomerAnalytics";
import { ActivityTimeline } from "./ActivityTimeline";
import { FollowUpReminders } from "./FollowUpReminders";
import { ApprovalDashboard } from "./ApprovalDashboard";
import { NotificationSummary } from "./NotificationSummary";
import {
  RevenueTrendChart, QuotationTrendChart, SalesByEmployeeChart, RevenueByJobTypeChart,
  QuotationStatusDonut, WinLoseDonut, ExpectedSalesForecastChart, MonthlyClosingRateChart, ProductsByCategoryChart,
} from "./DashboardCharts";

export interface QuotationListFilter {
  status?: QuoteStatus;
  client?: string;
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="h-8 w-56 rounded-lg bg-muted animate-pulse" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
      </div>
      <div className="h-64 rounded-xl bg-muted animate-pulse" />
    </div>
  );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
      <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
        <LayoutDashboard size={22} className="text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{title}</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{sub}</p>
    </div>
  );
}

export function DashboardPage({ quotes, onNavigateToQuotations }: { quotes: Quote[]; onNavigateToQuotations: (filter: QuotationListFilter) => void }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<DashboardFilterState>({ from: "", to: "", salesperson: "all" });

  useEffect(() => {
    let cancelled = false;
    fetchDashboardStats(filters)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters]);

  // setLoading(true) lives here (triggered by the filter change itself) rather than at the top
  // of the effect above — calling setState synchronously as the first thing an effect does
  // causes an avoidable extra render cascade (react-hooks/set-state-in-effect).
  const handleFiltersChange = (next: DashboardFilterState) => {
    setLoading(true);
    setFilters(next);
  };

  if (!stats) return <DashboardSkeleton />;

  const { kpis, revenueByMonth, categoryBreakdown, monthlyClosingRate, pipeline, salesPerformance, customerAnalytics, jobTypeAnalytics, forecast, followUps, activityTimeline, approvalDashboard, notificationSummary, availableSalespeople } = stats;
  const hasBusinessData = kpis.totalQuotations > 0 || kpis.totalProducts > 0;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("dashboard.subtitle")}</p>
        </div>
        {loading && <div className="w-4 h-4 rounded-full border-2 border-[#c9a84c] border-t-transparent animate-spin" />}
      </div>

      <DashboardFilterBar filters={filters} onChange={handleFiltersChange} availableSalespeople={availableSalespeople} />

      {!hasBusinessData ? (
        <EmptyState title={t("empty.dashboard.title")} sub={t("empty.dashboard.sub")} />
      ) : (
        <>
          <KpiGrid kpis={kpis} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <RevenueTrendChart data={revenueByMonth} />
            <ProductsByCategoryChart categoryBreakdown={categoryBreakdown} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <PipelineFunnel pipeline={pipeline} onStageClick={(status) => onNavigateToQuotations({ status })} />
            <SalesPerformanceTable title={t("dashboard.ranking.title")} sub={t("dashboard.ranking.sub")} entries={salesPerformance} limit={10} />
          </div>

          <SalesPerformanceTable title={t("dashboard.salesPerformance.title")} sub={t("dashboard.salesPerformance.sub")} entries={salesPerformance} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <JobTypeAnalytics jobTypeAnalytics={jobTypeAnalytics} />
            <CustomerAnalytics data={customerAnalytics} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <QuotationTrendChart revenueByMonth={revenueByMonth} />
            <SalesByEmployeeChart salesPerformance={salesPerformance} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <RevenueByJobTypeChart jobTypeAnalytics={jobTypeAnalytics} />
            <MonthlyClosingRateChart data={monthlyClosingRate} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <QuotationStatusDonut pipeline={pipeline} />
            <WinLoseDonut won={kpis.wonDeals} lost={kpis.lostDeals} />
            <ExpectedSalesForecastChart forecast={forecast} />
          </div>

          <div className={`grid grid-cols-1 ${approvalDashboard ? "xl:grid-cols-3" : "xl:grid-cols-2"} gap-4`}>
            <FollowUpReminders followUps={followUps} onOpenClient={(client) => onNavigateToQuotations({ client })} />
            {approvalDashboard && <ApprovalDashboard data={approvalDashboard} />}
            <NotificationSummary summary={notificationSummary} />
          </div>

          <div className={`grid grid-cols-1 ${activityTimeline ? "xl:grid-cols-3" : "xl:grid-cols-1"} gap-4`}>
            {activityTimeline && <div className="xl:col-span-2"><ActivityTimeline entries={activityTimeline} /></div>}
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-base font-semibold text-foreground mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.interest.title")}</h2>
              <div className="space-y-3">
                {[
                  { label: t(interestLabelKey["น่าสนใจ"]), count: quotes.filter((q) => q.interest === "น่าสนใจ").length, color: "#2aa36b", icon: <ThumbsUp size={13} /> },
                  { label: t(interestLabelKey["ไม่น่าสนใจ"]), count: quotes.filter((q) => q.interest === "ไม่น่าสนใจ").length, color: "#e05252", icon: <ThumbsDown size={13} /> },
                  { label: t("quotation.interest.notEvaluated"), count: quotes.filter((q) => q.interest === null).length, color: "#5a7299", icon: <CircleDot size={13} /> },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${item.color}15` }}>
                      <span style={{ color: item.color }}>{item.icon}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs text-foreground">{item.label}</span>
                        <span className="text-xs font-mono font-semibold text-foreground">{item.count} {t("quotation.countUnit")}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${quotes.length ? (item.count / quotes.length) * 100 : 0}%`, background: item.color }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
