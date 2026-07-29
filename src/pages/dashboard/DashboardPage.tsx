import { useEffect, useState } from "react";
import { ThumbsUp, ThumbsDown, CircleDot, LayoutDashboard, AlertTriangle, RotateCw, Download, History, UserRound, FileSpreadsheet, HelpCircle } from "lucide-react";
import type { DriveStep } from "driver.js";
import { type QuotationListFilter, interestLabelKey } from "../../lib/quotes";
import { fetchDashboardStats, type DashboardStats } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { useModuleTour } from "../../components/GuidedTour";
import { hasTourCompleted } from "../../lib/tour";
import { PageHeader } from "../../components/PageHeader";
import { DashboardFilterBar, type DashboardFilterState } from "./DashboardFilterBar";
import { todayIsoBangkok } from "./dateRanges";
import { buildDashboardCsv, downloadCsv } from "./csvExport";
import { exportDashboardXlsx } from "./xlsxExport";
import { ChartCard } from "./ChartCard";
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
import { ScopeOfWorkSummary } from "./ScopeOfWorkSummary";
import { DeliveryOrderSummary } from "./DeliveryOrderSummary";
import {
  RevenueTrendChart, RevenueByJobTypeChart, JobTypeDistributionChart,
  ExpectedSalesForecastChart, ProductsByCategoryChart,
} from "./DashboardCharts";

/** A single pulsing bar standing in for a not-yet-loaded value. */
function SkeletonBar({ className = "h-4 w-16" }: { className?: string }) {
  return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

/**
 * Content-area-only placeholder for the very first load (2026-07-14, progressive-loading pass;
 * reworked the same day into a section-first version — Codex review Medium finding: the first
 * cut was shell-first but not section-first, i.e. real section titles/table headers/named card
 * containers weren't visible during loading, just one generic animated block). Deliberately does
 * NOT cover the page title/description/filter bar above it, which now render immediately
 * regardless of whether `stats` has arrived yet (see the component body below) — only the
 * data-driven widget area waits on the fetch, and even that area now mirrors the real P'Keng/Kee
 * required 4-section structure (`ExecutiveSummaryCards` → `QuotationStatusSummary` →
 * `SalesActivityAnalytics` → `ActivityTimeline`) with each section's *real* translated title/table
 * headers (via `t()`, the same keys the loaded components use) rather than an anonymous shape, so
 * there's no layout/text jump when the real data arrives — only the pulsing placeholders inside
 * each section resolve into real values/rows. `ChartCard` is reused directly for the middle two
 * sections so their header markup is pixel-identical to the loaded state, not an approximation.
 * On every *subsequent* load (a filter change, a retry, an approve/reject refresh) this never
 * shows at all — `stats` is already non-null by then, so the previous real data stays on screen
 * with just a small "refreshing" indicator in the header (see `loading` below) instead of
 * reverting to this skeleton.
 */
function DashboardContentSkeleton() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      {/* 1. Executive KPI summary — 4 named cards, same title row as ExecutiveSummaryCards.tsx */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("dashboard.section.overview")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            t("dashboard.kpi.totalQuotations"), t("dashboard.kpi.totalQuotationValue"),
            t("dashboard.kpi.closedSales"), t("dashboard.kpi.expectedSales"),
          ].map((title) => (
            <div key={title} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-medium truncate mb-2">{title}</p>
              <SkeletonBar className="h-6 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* 2. Quotation status summary */}
      <ChartCard title={t("dashboard.statusSummary.title")} sub={t("dashboard.statusSummary.sub")}>
        <SkeletonBar className="h-40 w-full" />
      </ChartCard>

      {/* 3. Sales activity analytics */}
      <ChartCard title={t("dashboard.salesActivity.title")} sub={t("dashboard.salesActivity.sub")}>
        <SkeletonBar className="h-52 w-full" />
      </ChartCard>

      {/* 4. Recent activity details — real table headers, pulsing rows underneath */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
          <History size={15} /> {t("dashboard.activity.title")}
        </h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {[
                t("dashboard.activity.col.date"), t("dashboard.activity.col.salesperson"), t("dashboard.activity.col.action"),
                t("dashboard.activity.col.quotation"), t("dashboard.activity.col.customer"),
              ].map((col) => (
                <th key={col} className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(3)].map((_, i) => (
              <tr key={i} className="border-b border-border/40 last:border-0">
                {[...Array(5)].map((_, j) => (
                  <td key={j} className="px-2 py-2"><SkeletonBar className="h-3 w-full max-w-[100px]" /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
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
export function DashboardPage({ currentUserId, onNavigateToQuotations, onOpenQuote }: {
  /** For the page tour's per-user "seen" tracking (see useModuleTour). */
  currentUserId: string;
  onNavigateToQuotations: (filter: QuotationListFilter) => void;
  onOpenQuote: (quoteId: string) => void;
}) {
  const { t } = useI18n();

  // Page tour (added 2026-07-29) — a deeper dive than the MAIN first-sign-in tour (which also
  // covers this page's basics): auto-starts only AFTER the user has finished/skipped the main
  // tour (`hasTourCompleted`), so the two driver.js instances can never race each other on a
  // brand-new user's very first visit; the replay button works regardless.
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="dashboard-export"]', popover: { title: t("tour.dashboard.export.title"), description: t("tour.dashboard.export.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-filters"]', popover: { title: t("tour.dashboard.filters.title"), description: t("tour.dashboard.filters.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-kpis"]', popover: { title: t("tour.dashboard.kpis.title"), description: t("tour.dashboard.kpis.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-status"]', popover: { title: t("tour.dashboard.status.title"), description: t("tour.dashboard.status.desc"), side: "top" } },
    { element: '[data-tour="dashboard-indepth"]', popover: { title: t("tour.dashboard.indepth.title"), description: t("tour.dashboard.indepth.desc"), side: "top" } },
  ];
  const tour = useModuleTour("dashboard", currentUserId, tourSteps, { autoStart: hasTourCompleted(currentUserId) });

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
  // Approve/Reject from the Approval Dashboard widget mutates a quote's status server-side, then
  // re-fetches so every other filter-scoped widget stays consistent with the new pending-approvals
  // count instead of only patching that one card in place. `setLoading(true)` here (2026-07-14,
  // Codex review High Priority fix) surfaces the same small header spinner a filter change/retry
  // already shows — previously this path left the *previous* stats on screen with zero visible
  // indication a refresh was even happening, which reads as "did my approval actually take effect?"
  // `stats` itself is untouched until the new response lands (see the `!stats` skeleton guard
  // below, which only fires on the very first load), so the real data never disappears/resets —
  // only the spinner appears, exactly the "keep previous data visible during refetch, with a small
  // indicator" behavior the progressive-loading requirement calls for.
  const refreshAfterAction = () => { setLoading(true); setRetryToken((n) => n + 1); };

  // `stats?.field` below (not a destructure at the top) is deliberate — see the 2026-07-14
  // progressive-loading pass: the header/filter bar render unconditionally, before the first
  // fetch resolves, so they must not depend on `stats` already existing.
  const exportCsv = () => {
    if (!stats) return;
    const csv = buildDashboardCsv(stats, stats.filters);
    downloadCsv(`dashboard-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const exportXlsx = () => {
    if (!stats || exportingXlsx) return;
    setExportingXlsx(true);
    // Filename carries the filter period so a "เดือนที่แล้ว" export reads as that month's report.
    const period = stats.filters.from || stats.filters.to
      ? `${stats.filters.from || "start"}_${stats.filters.to || todayIsoBangkok()}`
      : new Date().toISOString().slice(0, 10);
    exportDashboardXlsx(stats, stats.filters, `dashboard-report-${period}.xlsx`)
      .finally(() => setExportingXlsx(false));
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div data-tour="dashboard-title">
        <PageHeader
          title={t("dashboard.title")}
          description={t("dashboard.subtitle")}
          actions={
            <>
              {/* Bare spinner on the very first load (no `stats` yet — the content area below shows
                  its own full skeleton). Once `stats` exists, every subsequent load (filter change,
                  retry, or an approve/reject-triggered refresh) keeps the previous data on screen
                  and adds this text label instead — "previous data stays visible during refetch,
                  with a small indicator" per the progressive-loading requirement. */}
              {loading && (
                stats
                  ? <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><div className="w-3.5 h-3.5 rounded-full border-2 border-[#c9a84c] border-t-transparent animate-spin flex-shrink-0" />{t("dashboard.refreshing")}</div>
                  : <div className="w-4 h-4 rounded-full border-2 border-[#c9a84c] border-t-transparent animate-spin" />
              )}
              {stats?.hasAnyData && (
                <div data-tour="dashboard-export" className="flex items-center gap-2">
                  <button
                    onClick={exportXlsx}
                    disabled={exportingXlsx}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#c9a84c]/40 bg-[#c9a84c]/10 rounded-lg text-foreground hover:bg-[#c9a84c]/20 transition-all disabled:opacity-50 font-medium"
                  >
                    <FileSpreadsheet size={13} className="text-[#c9a84c]" /> {exportingXlsx ? t("dashboard.export.xlsx.loading") : t("dashboard.export.xlsx")}
                  </button>
                  <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                    <Download size={13} /> {t("dashboard.export.csv")}
                  </button>
                </div>
              )}
              <button
                onClick={tour.start}
                title={t("tour.replay")}
                aria-label={t("tour.replay")}
                className="flex items-center justify-center w-8 h-8 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
              >
                <HelpCircle size={14} />
              </button>
            </>
          }
        />
      </div>

      <div data-tour="dashboard-filters">
        <DashboardFilterBar filters={filters} onChange={handleFiltersChange} availableSalespeople={stats?.availableSalespeople ?? []} availableDepartments={stats?.availableDepartments ?? []} hidePeopleFilters={stats?.ownDataOnly ?? false} />
      </div>

      {/* Filter-honesty notice (see UI_GUIDELINES.md): own-data-only callers must be told the
          Dashboard is scoped to them, or the smaller numbers read as missing data. */}
      {stats?.ownDataOnly && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-[#c9a84c]/8 border border-[#c9a84c]/25 rounded-lg px-3 py-2 -mt-3">
          <UserRound size={13} className="text-[#c9a84c] flex-shrink-0" />
          {t("dashboard.ownDataOnly.notice")}
        </div>
      )}

      {!stats ? (
        loadError ? <ErrorState onRetry={retry} /> : <DashboardContentSkeleton />
      ) : (
        <DashboardContent stats={stats} onNavigateToQuotations={onNavigateToQuotations} onOpenQuote={onOpenQuote} refreshAfterAction={refreshAfterAction} />
      )}
    </div>
  );
}

/**
 * The actual data-driven widget tree — split out of `DashboardPage` (2026-07-14, progressive-
 * loading pass) purely so the parent's early-render shell (header/filter bar) doesn't need to
 * duplicate this component's large JSX tree behind an `if (!stats) return ...` guard. Same content
 * as before this pass, unchanged; only the extraction is new.
 */
function DashboardContent({
  stats, onNavigateToQuotations, onOpenQuote, refreshAfterAction,
}: {
  stats: DashboardStats;
  onNavigateToQuotations: (filter: QuotationListFilter) => void;
  onOpenQuote: (quoteId: string) => void;
  refreshAfterAction: () => void;
}) {
  const { t } = useI18n();
  const {
    hasAnyData, kpis, interestBreakdown, revenueTrend, categoryBreakdown, pipeline, salesPerformance,
    customerAnalytics, jobTypeAnalytics, forecast, followUps, activityTimeline, salesActivity,
    approvalDashboard, notificationSummary, scopeOfWork, deliveryOrder,
  } = stats;
  const interestTotal = interestBreakdown.interested + interestBreakdown.notInterested + interestBreakdown.notEvaluated;
  // Sales Activity Analytics / Revenue Trend are rolling windows that ignore the filter's `from`
  // bound by design (see UI_GUIDELINES.md "Filter Honesty") — this anchor date is what "ending on"
  // actually means: the selected `to` date if the user picked one, else today (Bangkok-local, not
  // the server/browser's ambient timezone). Threaded into both charts so their sub-copy can state
  // a real date instead of a generic "rolling trend" phrase — 2026-07-13, independent review fix.
  const trendAnchorDate = stats.filters.to || todayIsoBangkok();

  return (
    <>
      {/* 2026-07-14, Codex-review fix (High Priority): `hasAnyData` used to gate the ENTIRE page
          behind one full-page `EmptyState`, so a genuinely empty database (no quotations, no
          products anywhere) hid the required KPI cards instead of showing them at zero — the
          business requirement calls for the 4 KPI cards plus Status/Sales Activity's own empty
          states to remain visible even then. Now: a slim inline banner communicates "no business
          data yet" without blocking the rest of the page, and every section below always renders
          (each already has its own per-widget "no data" fallback for an empty filtered/real result
          — `QuotationStatusSummary`/`SalesActivityAnalytics` show their own `EmptyState compact`
          when their own data is empty, same as before). A narrow filter matching zero results was
          already handled correctly before this fix; this only changes the *no data anywhere* case. */}
      {!hasAnyData && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#c9a84c]/10 border border-[#c9a84c]/25">
          <LayoutDashboard size={18} className="text-[#c9a84c] flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("empty.dashboard.title")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("empty.dashboard.sub")}</p>
          </div>
        </div>
      )}

      {/* ── The required P'Keng/P'Kee 5-section overview, in the exact requested order ── */}

      {/* 1. Executive KPI summary — 4 cards only */}
      <div data-tour="dashboard-kpis">
        <ExecutiveSummaryCards kpis={kpis} />
      </div>

      {/* 2. Quotation status summary — full width, not paired with Forecast (Forecast moved to
          supporting detail below per "if it makes the Dashboard cluttered, move it lower") */}
      <div data-tour="dashboard-status">
        <QuotationStatusSummary kpis={kpis} />
      </div>

      {/* 3. Sales activity analytics — trend + recent-period table + per-salesperson
          breakdown, filter-aware, full width. Always present for every `dashboard:view` role as
          of 2026-07-14 (previously null/hidden for roles without `auditLog:view` — a Codex-review
          Critical finding, see api/dashboard/index.ts); `salesActivity &&` stays as a defensive
          null-check, not a real permission gate anymore. */}
      {salesActivity && (
        <SalesActivityAnalytics data={salesActivity} anchorDate={trendAnchorDate} dateFiltered={!!stats.filters.from} />
      )}

      {/* 4. Recent activity details */}
      {activityTimeline && <ActivityTimeline entries={activityTimeline} onOpenQuote={onOpenQuote} />}

      {/* ── Supporting detail — real data, unchanged, just not part of the 4 required
          sections above. Sales Performance/Tasks&Follow-up/Forecast moved here 2026-07-13
          (P'Keng/P'Kee pass) since they weren't named in the required 5-row layout — "focus
          first on the exact required business information." Not removed, still real,
          filter-aware MongoDB data. ── */}
      <div data-tour="dashboard-indepth" className="pt-2 border-t border-border space-y-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.section.detail")}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SalesPerformancePanel kpis={kpis} />
          <ExpectedSalesForecastChart forecast={forecast} />
        </div>

        <ActivityFollowUpSummary kpis={kpis} onPendingApprovalsClick={() => onNavigateToQuotations({ status: "รออนุมัติ" })} />
        {(scopeOfWork || deliveryOrder) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scopeOfWork && <ScopeOfWorkSummary data={scopeOfWork} />}
            {deliveryOrder && <DeliveryOrderSummary data={deliveryOrder} />}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <RevenueTrendChart trend={revenueTrend} anchorDate={trendAnchorDate} />
          <ProductsByCategoryChart categoryBreakdown={categoryBreakdown} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RevenueByJobTypeChart jobTypeAnalytics={jobTypeAnalytics} />
          <JobTypeDistributionChart jobTypeAnalytics={jobTypeAnalytics} />
        </div>

        <PipelineSteps pipeline={pipeline} onStageClick={(status) => onNavigateToQuotations({ status })} />

        <SalesPerformanceTable title={t("dashboard.ranking.title")} sub={t("dashboard.ranking.sub")} entries={salesPerformance} limit={10} />
        <SalesPerformanceTable title={t("dashboard.salesPerformance.title")} sub={t("dashboard.salesPerformance.sub")} entries={salesPerformance} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CustomerAnalytics data={customerAnalytics} />
          <JobTypeAnalytics jobTypeAnalytics={jobTypeAnalytics} />
        </div>

        {approvalDashboard && <ApprovalDashboard data={approvalDashboard} onRefresh={refreshAfterAction} />}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
  );
}
