import { ThumbsUp, ThumbsDown, CircleDot, LayoutDashboard, UserRound } from "lucide-react";
import { type QuotationListFilter, interestLabelKey } from "../../../lib/quotes";
import type { DashboardStats } from "../../../lib/dashboard";
import { useI18n } from "../../../lib/i18n";
import { todayIsoBangkok } from "../dateRanges";
import { ExecutiveSummaryCards } from "../ExecutiveSummaryCards";
import { SalesPerformancePanel } from "../SalesPerformancePanel";
import { ActivityFollowUpSummary } from "../ActivityFollowUpSummary";
import { QuotationStatusSummary } from "../QuotationStatusSummary";
import { PipelineSteps } from "../PipelineSteps";
import { SalesActivityAnalytics } from "../SalesActivityAnalytics";
import { SalesPerformanceTable } from "../SalesPerformanceTable";
import { JobTypeAnalytics } from "../JobTypeAnalytics";
import { CustomerAnalytics } from "../CustomerAnalytics";
import { FollowUpReminders } from "../FollowUpReminders";
import { ApprovalDashboard } from "../ApprovalDashboard";
import { NotificationSummary } from "../NotificationSummary";
import { ScopeOfWorkSummary } from "../ScopeOfWorkSummary";
import { DeliveryOrderSummary } from "../DeliveryOrderSummary";
import {
  RevenueTrendChart, RevenueByJobTypeChart, JobTypeDistributionChart, ExpectedSalesForecastChart,
} from "../DashboardCharts";

/**
 * แท็บขาย — เนื้อหาเดิมทั้งหมดของหน้าแดชบอร์ดก่อน 2026-09-14 ย้ายมาแทบไม่แตะ
 *
 * ย้ายออกไปแท็บอื่นสามชิ้น เพราะไม่ใช่เรื่องของฝ่ายขาย: การ์ดงานบริการ → แท็บบริการ · กราฟสินค้าตาม
 * หมวดหมู่ → แท็บคลังสินค้า · กิจกรรมล่าสุด (audit log ทั้งระบบ) → แท็บภาพรวม
 * ใบส่งมอบสินค้ายังอยู่ที่นี่ และขึ้นในแท็บผลิต/โครงการด้วย เพราะเป็นเอกสารของสามแผนกพร้อมกัน
 */
export function SalesTab({ stats, onNavigateToQuotations, refreshAfterAction }: {
  stats: DashboardStats;
  onNavigateToQuotations: (filter: QuotationListFilter) => void;
  refreshAfterAction: () => void;
}) {
  const { t } = useI18n();
  const {
    hasAnyData, kpis, interestBreakdown, revenueTrend, pipeline, salesPerformance,
    customerAnalytics, jobTypeAnalytics, forecast, followUps, salesActivity,
    approvalDashboard, notificationSummary, scopeOfWork, deliveryOrder,
  } = stats;
  const interestTotal = interestBreakdown.interested + interestBreakdown.notInterested + interestBreakdown.notEvaluated;
  const trendAnchorDate = stats.filters.to || todayIsoBangkok();

  return (
    <>
      {stats.ownDataOnly && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-[#c9a84c]/8 border border-[#c9a84c]/25 rounded-lg px-3 py-2">
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

        <RevenueTrendChart trend={revenueTrend} anchorDate={trendAnchorDate} vatMode={stats.filters.vatMode} />
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
