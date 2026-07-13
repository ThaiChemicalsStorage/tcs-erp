import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, CircleDot, LayoutDashboard, AlertTriangle, RotateCw, Download } from "lucide-react";
import { type QuotationListFilter, interestLabelKey } from "../../lib/quotes";
import { fetchDashboardStats, type DashboardStats } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { DashboardFilterBar, type DashboardFilterState } from "./DashboardFilterBar";
import { todayIsoBangkok } from "./dateRanges";
import { buildDashboardCsv, downloadCsv } from "./csvExport";
import { ExecutiveSummaryCards } from "./ExecutiveSummaryCards";
import { SalesPerformancePanel } from "./SalesPerformancePanel";
import { ActivityFollowUpSummary } from "./ActivityFollowUpSummary";
import { QuotationStatusSummary } from "./QuotationStatusSummary";
import { PipelineSteps } from "./PipelineSteps";
import { SalesActivityAnalytics } from "./SalesActivityAnalytics";
import { SalesPerformanceTable } from "./SalesPerformanceTable";
import { JobTypeAnalytics } from "./JobTypeAnalytics";
import { CustomerAnalytics } from "./CustomerAnalytics";
import { ActivityTimeline } from "./ActivityTimeline";
import { FollowUpReminders } from "./FollowUpReminders";
import { ApprovalDashboard } from "./ApprovalDashboard";
import { NotificationSummary } from "./NotificationSummary";
import {
  RevenueTrendChart, RevenueByJobTypeChart, JobTypeDistributionChart,
  ExpectedSalesForecastChart, ProductsByCategoryChart,
} from "./DashboardCharts";

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

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
      <div className="w-14 h-14 rounded-xl bg-[#e05252]/10 flex items-center justify-center mb-4">
        <AlertTriangle size={22} className="text-[#e05252]" />
      </div>
      <p className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("dashboard.error.title")}</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{t("dashboard.error.sub")}</p>
      <button onClick={onRetry} className="mt-4 flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
        <RotateCw size={14} /> {t("dashboard.error.retry")}
      </button>
    </div>
  );
}

/**
 * Executive Dashboard.
 *
 * **Top of page — the 4 sections P'Keng/P'Kee's business requirement names, in the exact
 * requested order** (2026-07-13, sixth/seventh same-day passes): page title + compact filters,
 * `ExecutiveSummaryCards` (4 cards only — Total Quotations/Value, Closed/Expected Sales),
 * `QuotationStatusSummary` (Won/Lost/Active/Non-Active donut+table, full width — the forecast
 * chart used to sit alongside it but was moved to supporting detail, see below),
 * `SalesActivityAnalytics` (5-category trend chart + period table + a per-salesperson breakdown
 * table, full width), then `ActivityTimeline` ("Recent Activity Details" — date/salesperson/
 * activity/quotation-number/customer-name columns, quotation number links to the quote). This
 * replaces the flat 22-card `KpiGrid.tsx` (removed 2026-07-13 in an earlier pass) — the business
 * requirement explicitly names only these 4 sections as required, with an instruction to "focus
 * first on the exact required business information" and move anything else lower.
 *
 * **Below that — supporting detail, still real filter-aware MongoDB data, not removed**:
 * `SalesPerformancePanel` (rates/cycle-times/Active-Non-Active counts) + `ExpectedSalesForecastChart`,
 * `ActivityFollowUpSummary` (pending approvals/follow-ups/expired/new-customer counts), revenue/
 * job-type charts, the sales pipeline step cards (`PipelineSteps.tsx` — the non-overlapping
 * horizontal-step-card replacement for the old broken `recharts` `FunnelChart`), ranking tables,
 * top customers/job types, the actionable Pending Approvals + Follow-up Reminders lists (distinct
 * from the compact *counts* in `ActivityFollowUpSummary` — those are real clickable/actionable
 * line-item lists), the notification summary, and the customer-interest breakdown. None of this
 * data was removed — it moved out of the 4 required top sections because the business requirement
 * doesn't name it as required, not because it stopped mattering. See CHANGELOG.md.
 *
 * History: 2026-07-10 (UI/UX redesign) split the original flat KPI grid into a tiered "primary
 * hero cards + dense secondary mini-cards" layout and added `QuotationStatusSummary`/
 * `PipelineSteps`/`SalesActivityAnalytics`, removing 5 now-redundant charts. 2026-07-13 (first
 * revert pass) merged the tiered KPI cards back into one flat `KpiGrid`. 2026-07-13 (second revert
 * pass) replaced that flat grid with `ExecutiveSummaryCards` + 2 new compact panels. 2026-07-13
 * (third pass) reordered into a fully-specified 7-section structure. 2026-07-13 (this pass, the
 * P'Keng/P'Kee business-requirement pass) fixed 4 High Priority Codex data/filter bugs, then
 * simplified to the exact 4-section required layout above, added Sales Activity's per-salesperson
 * breakdown table, and added structured quotation/customer fields to Recent Activity Details.
 */
export function DashboardPage({ onNavigateToQuotations, onOpenQuote }: { onNavigateToQuotations: (filter: QuotationListFilter) => void; onOpenQuote: (quoteId: string) => void }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<DashboardFilterState>({ from: "", to: "", salesperson: "all", department: "all" });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardStats(filters)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, retryToken]);

  // setLoading(true)/setLoadError(false) live here (triggered by the filter change/retry click
  // itself) rather than at the top of the effect above — calling setState synchronously as the
  // first thing an effect does causes an avoidable extra render cascade (react-hooks/set-state-in-effect).
  const handleFiltersChange = (next: DashboardFilterState) => {
    setLoading(true);
    setLoadError(false);
    setFilters(next);
  };
  const retry = () => { setLoading(true); setLoadError(false); setRetryToken((n) => n + 1); };
  // Approve/Reject from the Approval Dashboard widget mutates a quote's status server-side —
  // silently re-fetch (no loading skeleton) so every other filter-scoped widget stays consistent
  // with the new pending-approvals count instead of only patching that one card in place.
  const refreshAfterAction = () => setRetryToken((n) => n + 1);

  if (!stats && loadError) return <ErrorState onRetry={retry} />;
  if (!stats) return <DashboardSkeleton />;

  const {
    hasAnyData, kpis, interestBreakdown, revenueTrend, categoryBreakdown, pipeline, salesPerformance,
    customerAnalytics, jobTypeAnalytics, forecast, followUps, activityTimeline, salesActivity,
    approvalDashboard, notificationSummary, availableSalespeople, availableDepartments,
  } = stats;
  const interestTotal = interestBreakdown.interested + interestBreakdown.notInterested + interestBreakdown.notEvaluated;
  // Sales Activity Analytics / Revenue Trend are rolling windows that ignore the filter's `from`
  // bound by design (see UI_GUIDELINES.md "Filter Honesty") — this anchor date is what "ending on"
  // actually means: the selected `to` date if the user picked one, else today (Bangkok-local, not
  // the server/browser's ambient timezone). Threaded into both charts so their sub-copy can state
  // a real date instead of a generic "rolling trend" phrase — 2026-07-13, independent review fix.
  const trendAnchorDate = stats.filters.to || todayIsoBangkok();

  const exportCsv = () => {
    const csv = buildDashboardCsv(stats, stats.filters);
    downloadCsv(`dashboard-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div data-tour="dashboard-title">
        <PageHeader
          title={t("dashboard.title")}
          description={t("dashboard.subtitle")}
          actions={
            <>
              {loading && <div className="w-4 h-4 rounded-full border-2 border-[#c9a84c] border-t-transparent animate-spin" />}
              {hasAnyData && (
                <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Download size={13} /> {t("dashboard.export.csv")}
                </button>
              )}
            </>
          }
        />
      </div>

      <div data-tour="dashboard-filters">
        <DashboardFilterBar filters={filters} onChange={handleFiltersChange} availableSalespeople={availableSalespeople} availableDepartments={availableDepartments} />
      </div>

      {!hasAnyData ? (
        <EmptyState icon={LayoutDashboard} title={t("empty.dashboard.title")} description={t("empty.dashboard.sub")} />
      ) : (
        <>
          {/* ── The required P'Keng/P'Kee 5-section overview, in the exact requested order ── */}

          {/* 1. Executive KPI summary — 4 cards only */}
          <div data-tour="dashboard-kpis">
            <ExecutiveSummaryCards kpis={kpis} />
          </div>

          {/* 2. Quotation status summary — full width, not paired with Forecast (Forecast moved to
              supporting detail below per "if it makes the Dashboard cluttered, move it lower") */}
          <QuotationStatusSummary kpis={kpis} />

          {/* 3. Sales activity analytics — trend + recent-period table + per-salesperson
              breakdown, filter-aware, full width */}
          {salesActivity && <SalesActivityAnalytics data={salesActivity} anchorDate={trendAnchorDate} />}

          {/* 4. Recent activity details */}
          {activityTimeline && <ActivityTimeline entries={activityTimeline} onOpenQuote={onOpenQuote} />}

          {/* ── Supporting detail — real data, unchanged, just not part of the 4 required
              sections above. Sales Performance/Tasks&Follow-up/Forecast moved here 2026-07-13
              (P'Keng/P'Kee pass) since they weren't named in the required 5-row layout — "focus
              first on the exact required business information." Not removed, still real,
              filter-aware MongoDB data. ── */}
          <div className="pt-2 border-t border-border space-y-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.section.detail")}</p>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <SalesPerformancePanel kpis={kpis} />
              <ExpectedSalesForecastChart forecast={forecast} />
            </div>

            <ActivityFollowUpSummary kpis={kpis} onPendingApprovalsClick={() => onNavigateToQuotations({ status: "รออนุมัติ" })} />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <RevenueTrendChart trend={revenueTrend} anchorDate={trendAnchorDate} />
              <ProductsByCategoryChart categoryBreakdown={categoryBreakdown} />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <RevenueByJobTypeChart jobTypeAnalytics={jobTypeAnalytics} />
              <JobTypeDistributionChart jobTypeAnalytics={jobTypeAnalytics} />
            </div>

            <PipelineSteps pipeline={pipeline} onStageClick={(status) => onNavigateToQuotations({ status })} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <SalesPerformanceTable title={t("dashboard.ranking.title")} sub={t("dashboard.ranking.sub")} entries={salesPerformance} limit={10} />
            </div>
            <SalesPerformanceTable title={t("dashboard.salesPerformance.title")} sub={t("dashboard.salesPerformance.sub")} entries={salesPerformance} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <CustomerAnalytics data={customerAnalytics} />
              <JobTypeAnalytics jobTypeAnalytics={jobTypeAnalytics} />
            </div>

            {approvalDashboard && <ApprovalDashboard data={approvalDashboard} onRefresh={refreshAfterAction} />}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <FollowUpReminders followUps={followUps} onOpenClient={(client) => onNavigateToQuotations({ client })} />
              <NotificationSummary summary={notificationSummary} />
            </div>

            <div className="bg-card border border-border rounded-xl p-5 max-w-xl">
              <h2 className="text-base font-semibold text-foreground mb-4" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("dashboard.interest.title")}</h2>
              <div className="space-y-3">
                {[
                  { label: t(interestLabelKey["น่าสนใจ"]), count: interestBreakdown.interested, color: "#2aa36b", icon: <ThumbsUp size={13} /> },
                  { label: t(interestLabelKey["ไม่น่าสนใจ"]), count: interestBreakdown.notInterested, color: "#e05252", icon: <ThumbsDown size={13} /> },
                  { label: t("quotation.interest.notEvaluated"), count: interestBreakdown.notEvaluated, color: "#5a7299", icon: <CircleDot size={13} /> },
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
                        <div className="h-full rounded-full" style={{ width: `${interestTotal ? (item.count / interestTotal) * 100 : 0}%`, background: item.color }} />
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
