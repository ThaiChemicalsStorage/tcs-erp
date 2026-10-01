import { LayoutDashboard, UserRound } from "lucide-react";
import { type QuotationListFilter, interestLabelKey } from "../../../lib/quotes";
import type { DashboardStats } from "../../../lib/dashboard";
import { useI18n } from "../../../lib/i18n";
import { todayIsoBangkok } from "../../../lib/dateRanges";
import { fmtShort } from "../format";
import { SalesPerformancePanel } from "../SalesPerformancePanel";
import { ActivityFollowUpSummary } from "../ActivityFollowUpSummary";
import { PipelineSteps } from "../PipelineSteps";
import { SalesActivityAnalytics } from "../SalesActivityAnalytics";
import { SalesPerformanceTable } from "../SalesPerformanceTable";
import { JobTypeAnalytics } from "../JobTypeAnalytics";
import { CustomerAnalytics } from "../CustomerAnalytics";
import { FollowUpReminders } from "../FollowUpReminders";
import { ApprovalDashboard } from "../ApprovalDashboard";
import { NotificationSummary } from "../NotificationSummary";
import { ScopeOfWorkDeliverySummary } from "../ScopeOfWorkSummary";
import { RevenueTrendChart, ExpectedSalesForecastChart } from "../DashboardCharts";
import { ChartCard, Donut, KpiCard, KpiGrid, ProgressBar, SectionHeading, SplitRow } from "./DepartmentWidgets";
import { CHART, TONE } from "./dashboardTokens";
import { fmtCount } from "./countFormat";

/**
 * แท็บขาย — หน้าตาตามบอร์ด `Dashboard-Sales` (ดีไซน์ใหม่ 2026-09-30) ตัวเลขทุกตัวยังมาจาก `GET /api/dashboard` เดิม
 * และหมายถึงสิ่งเดิมทุกตัว (เจ้าของสั่งคงสวิตช์ VAT และความหมายตัวเลข 2026-09-30)
 *
 * ลำดับ: KPI 4 ใบ → รายการรออนุมัติ + การติดตามลูกค้า → งานที่ต้องดำเนินการ (บอร์ดตัด เจ้าของสั่งคง) →
 * ใบเสนอราคาแต่ละขั้น + สถิติสถานะ → รายได้ + ยอดคาดการณ์ → "รายละเอียดเชิงลึก": ผลงานพนักงานขาย · ประสิทธิภาพ ·
 * ประเภทงาน (รวมสองกราฟเดิม) + ความสนใจ / SOW·ใบส่งมอบ / การแจ้งเตือน · ลูกค้า · กิจกรรมของฝ่ายขาย (คงกราฟไว้)
 *
 * ย้ายออกไปแท็บอื่นสามชิ้นตั้งแต่รอบแรก (2026-09-14) เพราะไม่ใช่เรื่องของฝ่ายขาย: การ์ดงานบริการ → แท็บบริการ ·
 * กราฟสินค้าตามหมวดหมู่ → แท็บคลังสินค้า · กิจกรรมล่าสุด (audit log ทั้งระบบ) → แท็บภาพรวม
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
  const vatMode = stats.filters.vatMode;
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const trendAnchorDate = stats.filters.to || todayIsoBangkok();
  const docs = t("dashboard.unit.docs");
  const quoteUnit = t("quotation.countUnit") || docs;
  const interestTotal = interestBreakdown.interested + interestBreakdown.notInterested + interestBreakdown.notEvaluated;
  const interestRows = [
    { key: "interested", label: t(interestLabelKey["น่าสนใจ"]), count: interestBreakdown.interested, color: CHART.blue },
    { key: "notInterested", label: t(interestLabelKey["ไม่น่าสนใจ"]), count: interestBreakdown.notInterested, color: TONE.neutral },
    { key: "notEvaluated", label: t("quotation.interest.notEvaluated"), count: interestBreakdown.notEvaluated, color: TONE.empty },
  ];

  return (
    <>
      {stats.ownDataOnly && (
        <p className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-[13px] text-[#3d5173]">
          <UserRound size={16} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
          {t(
            stats.visibilityScope === "team"
              ? "dashboard.teamDataOnly.notice"
              : stats.visibilityScope === "department"
                ? "dashboard.departmentDataOnly.notice"
                : "dashboard.ownDataOnly.notice",
          )}
        </p>
      )}

      {!hasAnyData && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card">
          <span className="w-9 h-9 rounded-full bg-[#e8f0fb] text-[#1a5fb4] flex items-center justify-center flex-shrink-0">
            <LayoutDashboard size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{t("empty.dashboard.title")}</p>
            <p className="text-[13px] text-muted-foreground">{t("empty.dashboard.sub")}</p>
          </div>
        </div>
      )}

      <div data-tour="dashboard-kpis">
        <KpiGrid>
          <KpiCard
            label={t("dashboard.kpi.totalQuotations")} scope="period" value={fmtCount(kpis.totalQuotations)} unit={docs}
            sparkline={salesActivity ? { values: salesActivity.monthly.map((p) => p.created) } : undefined}
            caption={salesActivity ? t("dashboard.kpi.sparkCreatedCaption") : t("dashboard.kpi.helper.totalQuotations")}
          />
          <KpiCard
            label={t("dashboard.kpi.totalQuotationValue")} scope="period" value={fmtShort(kpis.totalQuotationValue)}
            caption={`${vatSuffix} · ${t("dashboard.kpi.helper.totalQuotationValue")}`}
          />
          <KpiCard
            label={t("dashboard.kpi.closedSales")} scope="period" value={fmtShort(kpis.closedSales)}
            sparkline={{ values: revenueTrend.monthly.map((p) => p.revenue) }}
            caption={`${vatSuffix} · ${t("dashboard.kpi.wonSparkCaption").replace("{n}", fmtCount(kpis.wonDeals))}`}
          />
          <KpiCard
            label={t("dashboard.kpi.expectedSales")} scope="period" value={fmtShort(kpis.expectedSales)}
            help={`${t("dashboard.kpi.help.expectedSales")} ${vatSuffix}`}
            caption={`${vatSuffix} · ${t("dashboard.kpi.helper.expectedSales")}`}
          />
        </KpiGrid>
      </div>

      <SplitRow
        main={approvalDashboard && <ApprovalDashboard data={approvalDashboard} onRefresh={refreshAfterAction} vatMode={vatMode} />}
        side={<FollowUpReminders followUps={followUps} onOpenClient={(client) => onNavigateToQuotations({ client })} vatMode={vatMode} />}
      />

      <ActivityFollowUpSummary kpis={kpis} onPendingApprovalsClick={() => onNavigateToQuotations({ status: "รออนุมัติ" })} />

      <SplitRow
        main={<PipelineSteps pipeline={pipeline} onStageClick={(status) => onNavigateToQuotations({ status })} vatMode={vatMode} />}
        side={(
          <div data-tour="dashboard-status" className="h-full flex flex-col">
            <ChartCard
              title={t("dashboard.statusSummary.title")} className="h-full" bodyClassName="flex-1 px-5 py-5 flex items-center"
              sub={`${t("dashboard.dept.periodTag")} · ${t("dashboard.statusSummary.sub")} · ${vatSuffix}`}
            >
              <Donut
                unit={quoteUnit} empty={t("dashboard.noData")}
                slices={[
                  { key: "won", label: t("dashboard.kpi.wonDeals"), sub: fmtShort(kpis.closedSales), value: kpis.wonDeals, color: TONE.good },
                  { key: "active", label: t("dashboard.kpi.activeQuotations"), sub: fmtShort(kpis.activeQuotationsValue), value: kpis.activeQuotations, color: CHART.blue },
                  { key: "lost", label: t("dashboard.kpi.lostDeals"), sub: fmtShort(kpis.lostValue), value: kpis.lostDeals, color: TONE.alert },
                  { key: "nonActive", label: t("dashboard.kpi.nonActiveQuotations"), sub: fmtShort(kpis.nonActiveQuotationsValue), value: kpis.nonActiveQuotations, color: TONE.neutral },
                ]}
              />
            </ChartCard>
          </div>
        )}
      />

      <SplitRow
        main={<RevenueTrendChart trend={revenueTrend} anchorDate={trendAnchorDate} vatMode={vatMode} />}
        side={<ExpectedSalesForecastChart forecast={forecast} vatMode={vatMode} />}
      />

      <div data-tour="dashboard-indepth" className="flex flex-col gap-5">
        <SectionHeading title={t("dashboard.section.detail")} note={t("dashboard.section.detail.sub")} />

        <SalesPerformanceTable title={t("dashboard.salesPerformance.title")} sub={t("dashboard.salesPerformance.sub2")} entries={salesPerformance} vatMode={vatMode} />

        <SalesPerformancePanel kpis={kpis} vatMode={vatMode} />

        <SplitRow
          main={<JobTypeAnalytics jobTypeAnalytics={jobTypeAnalytics} vatMode={vatMode} />}
          side={(
            <div className="flex flex-col gap-5">
              <ChartCard title={t("dashboard.interest.title")} sub={`${t("dashboard.dept.periodTag")} · ${t("dashboard.interest.sub")}`} bodyClassName="px-5 pt-4 pb-[18px] flex flex-col gap-3.5">
                {interestRows.map((item) => (
                  <div key={item.key} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="flex-1 text-[13px] text-[#26395a]">{item.label}</span>
                      <span className="text-[13px] font-semibold tabular-nums">{fmtCount(item.count)} {quoteUnit}</span>
                    </div>
                    <ProgressBar height={6} value={item.count} max={interestTotal} color={item.color} label={`${item.label} ${fmtCount(item.count)}`} />
                  </div>
                ))}
              </ChartCard>
              {(scopeOfWork || deliveryOrder) && <ScopeOfWorkDeliverySummary scopeOfWork={scopeOfWork} deliveryOrder={deliveryOrder} />}
              <NotificationSummary summary={notificationSummary} />
            </div>
          )}
        />

        <CustomerAnalytics data={customerAnalytics} vatMode={vatMode} />

        {salesActivity && (
          <SalesActivityAnalytics data={salesActivity} anchorDate={trendAnchorDate} dateFiltered={!!stats.filters.from} />
        )}
      </div>
    </>
  );
}
