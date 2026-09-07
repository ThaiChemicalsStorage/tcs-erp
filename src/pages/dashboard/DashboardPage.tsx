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
import { ServiceSummary } from "./ServiceSummary";
import {
  RevenueTrendChart, RevenueByJobTypeChart, JobTypeDistributionChart,
  ExpectedSalesForecastChart, ProductsByCategoryChart,
} from "./DashboardCharts";

// แท่งกะพริบแทนค่าที่ยังโหลดไม่เสร็จ
// A single pulsing placeholder bar standing in for a not-yet-loaded value.
function SkeletonBar({ className = "h-4 w-16" }: { className?: string }) {
  return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

// โครงหน้าจอแบบกะพริบสำหรับตอนโหลดข้อมูลแดชบอร์ดครั้งแรกเท่านั้น ไม่ครอบหัวข้อ/ตัวกรองด้านบน
// Skeleton placeholder for the first load only; mirrors the real section layout so nothing jumps when data arrives.
function DashboardContentSkeleton() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
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

      <ChartCard title={t("dashboard.statusSummary.title")} sub={t("dashboard.statusSummary.sub")}>
        <SkeletonBar className="h-40 w-full" />
      </ChartCard>

      <ChartCard title={t("dashboard.salesActivity.title")} sub={t("dashboard.salesActivity.sub")}>
        <SkeletonBar className="h-52 w-full" />
      </ChartCard>

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

// แสดงสถานะโหลดข้อมูลล้มเหลว พร้อมปุ่มลองใหม่
// Renders an error state with a retry button when the dashboard fails to load.
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

// หน้าแดชบอร์ดผู้บริหาร: 4 การ์ดสรุปหลัก + สถานะใบเสนอราคา + กิจกรรมการขาย + รายละเอียดสนับสนุนด้านล่าง
// The Executive Dashboard page — 4 KPI cards, quotation status, sales activity, plus supporting detail sections below.
export function DashboardPage({ currentUserId, onNavigateToQuotations, onOpenQuote }: {
  currentUserId: string;
  onNavigateToQuotations: (filter: QuotationListFilter) => void;
  onOpenQuote: (quoteId: string) => void;
}) {
  const { t } = useI18n();

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
  const [filters, setFilters] = useState<DashboardFilterState>({ from: "", to: "", salesperson: "all", department: "all", vatMode: "pre" });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardStats(filters)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, retryToken]);

  // ตั้งค่ากำลังโหลดใหม่และล้าง error ก่อนเปลี่ยนตัวกรอง
  // Marks the dashboard as loading and clears any error before applying new filters.
  const handleFiltersChange = (next: DashboardFilterState) => {
    setLoading(true);
    setLoadError(false);
    setFilters(next);
  };
  const retry = () => { setLoading(true); setLoadError(false); setRetryToken((n) => n + 1); };
  // ดึงข้อมูลแดชบอร์ดใหม่หลังทำรายการอนุมัติ/ปฏิเสธ เพื่อให้ทุกวิดเจ็ตซิงค์กัน
  // Re-fetches dashboard stats after an approve/reject action so every widget stays in sync.
  const refreshAfterAction = () => { setLoading(true); setRetryToken((n) => n + 1); };

  // สร้างและดาวน์โหลดไฟล์ CSV ของข้อมูลแดชบอร์ดปัจจุบัน
  // Builds and downloads a CSV export of the current dashboard data.
  const exportCsv = () => {
    if (!stats) return;
    const csv = buildDashboardCsv(stats, stats.filters);
    downloadCsv(`dashboard-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };
  const [exportingXlsx, setExportingXlsx] = useState(false);
  // สร้างและดาวน์โหลดไฟล์ Excel ของข้อมูลแดชบอร์ดปัจจุบัน ชื่อไฟล์มีช่วงวันที่ โหมด VAT และขอบเขตข้อมูลกำกับ
  // 2026-09-07: ยิงขอข้อมูลใหม่พร้อม `includeQuotations` เพื่อให้ได้รายการใบเสนอราคาทีละใบ (ชีต "รายการ
  // ใบเสนอราคา") ซึ่งหน้าจอปกติไม่โหลด ตัวกรองเดิมทุกตัวส่งไปเหมือนกัน ยอดในไฟล์จึงตรงกับที่เห็นบนจอ
  const exportXlsx = () => {
    if (!stats || exportingXlsx) return;
    setExportingXlsx(true);
    fetchDashboardStats({ ...filters, includeQuotations: true })
      .then((full) => {
        const period = full.filters.from || full.filters.to
          ? `${full.filters.from || "start"}_${full.filters.to || todayIsoBangkok()}`
          : todayIsoBangkok();
        const vat = full.filters.vatMode === "post" ? "inclVAT" : "preVAT";
        const scope = full.ownDataOnly ? `-${full.visibilityScope}` : "";
        return exportDashboardXlsx(full, full.filters, `dashboard-report-${period}-${vat}${scope}.xlsx`);
      })
      .catch((err) => console.error("[dashboard] export xlsx failed", err))
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
        <DashboardFilterBar filters={filters} onChange={handleFiltersChange} availableSalespeople={stats?.availableSalespeople ?? []} availableDepartments={stats?.availableDepartments ?? []} hidePeopleFilters={stats?.visibilityScope === "own"} />
      </div>

      {stats?.ownDataOnly && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-[#c9a84c]/8 border border-[#c9a84c]/25 rounded-lg px-3 py-2 -mt-3">
          <UserRound size={13} className="text-[#c9a84c] flex-shrink-0" />
          {t(
            stats.visibilityScope === "team"
              ? "dashboard.teamDataOnly.notice"
              : stats.visibilityScope === "department"
                ? "dashboard.departmentDataOnly.notice"
                : "dashboard.ownDataOnly.notice",
          )}
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

// แสดงเนื้อหาแดชบอร์ดทั้งหมดเมื่อโหลดข้อมูลเสร็จแล้ว: การ์ดสรุป สถานะ กิจกรรมขาย และรายละเอียดสนับสนุน
// Renders the full data-driven widget tree once dashboard stats have loaded.
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
    approvalDashboard, notificationSummary, scopeOfWork, deliveryOrder, serviceSummary,
  } = stats;
  const interestTotal = interestBreakdown.interested + interestBreakdown.notInterested + interestBreakdown.notEvaluated;
  const trendAnchorDate = stats.filters.to || todayIsoBangkok();

  return (
    <>
      {!hasAnyData && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#c9a84c]/10 border border-[#c9a84c]/25">
          <LayoutDashboard size={18} className="text-[#c9a84c] flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("empty.dashboard.title")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("empty.dashboard.sub")}</p>
          </div>
        </div>
      )}

      <div data-tour="dashboard-kpis">
        <ExecutiveSummaryCards kpis={kpis} vatMode={stats.filters.vatMode} />
      </div>

      <div data-tour="dashboard-status">
        <QuotationStatusSummary kpis={kpis} vatMode={stats.filters.vatMode} />
      </div>

      {salesActivity && (
        <SalesActivityAnalytics data={salesActivity} anchorDate={trendAnchorDate} dateFiltered={!!stats.filters.from} />
      )}

      {activityTimeline && <ActivityTimeline entries={activityTimeline} onOpenQuote={onOpenQuote} />}

      <div data-tour="dashboard-indepth" className="pt-2 border-t border-border space-y-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.section.detail")}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SalesPerformancePanel kpis={kpis} vatMode={stats.filters.vatMode} />
          <ExpectedSalesForecastChart forecast={forecast} vatMode={stats.filters.vatMode} />
        </div>

        <ActivityFollowUpSummary kpis={kpis} onPendingApprovalsClick={() => onNavigateToQuotations({ status: "รออนุมัติ" })} />
        {(scopeOfWork || deliveryOrder) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scopeOfWork && <ScopeOfWorkSummary data={scopeOfWork} />}
            {deliveryOrder && <DeliveryOrderSummary data={deliveryOrder} />}
          </div>
        )}
        {serviceSummary && <ServiceSummary data={serviceSummary} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <RevenueTrendChart trend={revenueTrend} anchorDate={trendAnchorDate} vatMode={stats.filters.vatMode} />
          <ProductsByCategoryChart categoryBreakdown={categoryBreakdown} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RevenueByJobTypeChart jobTypeAnalytics={jobTypeAnalytics} vatMode={stats.filters.vatMode} />
          <JobTypeDistributionChart jobTypeAnalytics={jobTypeAnalytics} />
        </div>

        <PipelineSteps pipeline={pipeline} onStageClick={(status) => onNavigateToQuotations({ status })} vatMode={stats.filters.vatMode} />

        <SalesPerformanceTable title={t("dashboard.ranking.title")} sub={t("dashboard.ranking.sub")} entries={salesPerformance} limit={10} vatMode={stats.filters.vatMode} />
        <SalesPerformanceTable title={t("dashboard.salesPerformance.title")} sub={t("dashboard.salesPerformance.sub")} entries={salesPerformance} vatMode={stats.filters.vatMode} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CustomerAnalytics data={customerAnalytics} vatMode={stats.filters.vatMode} />
          <JobTypeAnalytics jobTypeAnalytics={jobTypeAnalytics} vatMode={stats.filters.vatMode} />
        </div>

        {approvalDashboard && <ApprovalDashboard data={approvalDashboard} onRefresh={refreshAfterAction} vatMode={stats.filters.vatMode} />}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FollowUpReminders followUps={followUps} onOpenClient={(client) => onNavigateToQuotations({ client })} vatMode={stats.filters.vatMode} />
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
