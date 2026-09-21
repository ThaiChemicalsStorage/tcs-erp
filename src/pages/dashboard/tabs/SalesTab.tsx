import { ThumbsUp, ThumbsDown, CircleDot, LayoutDashboard, UserRound, FileText, Wallet, TrendingUp, Target } from "lucide-react";
import { type QuotationListFilter, type QuoteStatus, interestLabelKey, statusLabelKey } from "../../../lib/quotes";
import type { DashboardStats, FollowUpSummary } from "../../../lib/dashboard";
import { useI18n } from "../../../lib/i18n";
import { todayIsoBangkok } from "../../../lib/dateRanges";
import { fmtShort, fmtPercent } from "../format";
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
import { ScopeOfWorkSummary } from "../ScopeOfWorkSummary";
import { DeliveryOrderSummary } from "../DeliveryOrderSummary";
import {
  RevenueTrendChart, RevenueByJobTypeChart, JobTypeDistributionChart, ExpectedSalesForecastChart,
} from "../DashboardCharts";
import { DEPARTMENT_META } from "./tabMeta";
import { ChartCard, Donut, DueBadge, EmptyNote, KpiCard, KpiGrid, RankBars, SplitRow } from "./DepartmentWidgets";
import { GOLD } from "./dashboardTokens";
import { fmtCount } from "./countFormat";

const MAIN_FLOW: QuoteStatus[] = ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว", "ส่งให้ลูกค้าแล้ว", "ลูกค้ายอมรับ", "ปิดการขายสำเร็จ"];
const OFF_RAMP: QuoteStatus[] = ["ลูกค้าปฏิเสธ", "เสียโอกาส", "ยกเลิก"];
/** สีแถบของแต่ละขั้น: ก่อนส่งลูกค้า = เทาน้ำเงิน · อยู่กับลูกค้า = สีขาย · ปิดสำเร็จ = เขียว · หลุดจากเส้นทาง = เทา */
const STAGE_COLOR: Partial<Record<QuoteStatus, string>> = {
  "ส่งให้ลูกค้าแล้ว": DEPARTMENT_META.sales.accent,
  "ลูกค้ายอมรับ": DEPARTMENT_META.sales.accent,
  "ปิดการขายสำเร็จ": "#157347",
};

/**
 * แท็บขาย — ออกแบบใหม่ 2026-09-14 ตาม docs/DASHBOARD_DESIGN.md: KPI 4 ใบเดิม (ห้ามเกิน 4 — กติกาธุรกิจ) พร้อม
 * เส้นแนวโน้มเฉพาะตัวที่มีประวัติจริง → ใบเสนอราคาแต่ละขั้น + โดนัทสถานะ → อันดับพนักงานขาย + ติดตามลูกค้า
 * · ใต้ตัวคั่น "รายละเอียดเชิงลึก" คือเนื้อหาเดิมทั้งหมดของแดชบอร์ดขาย ตัวเลขทุกตัวยังมาจาก `GET /api/dashboard` เดิม
 *
 * ย้ายออกไปแท็บอื่นสามชิ้นตั้งแต่รอบแรก เพราะไม่ใช่เรื่องของฝ่ายขาย: การ์ดงานบริการ → แท็บบริการ · กราฟสินค้า
 * ตามหมวดหมู่ → แท็บคลังสินค้า (เปลี่ยนเป็นมูลค่า) · กิจกรรมล่าสุด (audit log ทั้งระบบ) → แท็บภาพรวม
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
  const interestTotal = interestBreakdown.interested + interestBreakdown.notInterested + interestBreakdown.notEvaluated;
  const trendAnchorDate = stats.filters.to || todayIsoBangkok();
  const salesAccent = DEPARTMENT_META.sales.accent;

  const byStage = new Map(pipeline.map((p) => [p.stage, p]));
  const stageRows = [...MAIN_FLOW, ...OFF_RAMP].map((status) => ({ status, stage: byStage.get(status) })).filter((r) => !!r.stage);
  const maxStage = Math.max(1, ...stageRows.map((r) => r.stage?.count ?? 0));

  const ranking = [...salesPerformance].sort((a, b) => b.revenue - a.revenue);
  const today = todayIsoBangkok();
  const followUpRows: FollowUpSummary[] = [...followUps.overdue, ...followUps.today, ...followUps.upcoming].slice(0, 6);

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
        <KpiGrid>
          <KpiCard
            icon={FileText} chip={salesAccent} label={t("dashboard.kpi.totalQuotations")} value={fmtCount(kpis.totalQuotations)}
            sparkline={salesActivity ? { values: salesActivity.monthly.map((p) => p.created), color: salesAccent } : undefined}
            caption={salesActivity ? t("dashboard.sales.kpi.totalQuotationsCaption") : t("dashboard.kpi.helper.totalQuotations")}
          />
          <KpiCard icon={Wallet} chip={salesAccent} label={`${t("dashboard.kpi.totalQuotationValue")} ${vatSuffix}`} value={fmtShort(kpis.totalQuotationValue)} caption={`${t("dashboard.kpi.helper.totalQuotationValue")} ${vatSuffix}`} />
          <KpiCard
            icon={TrendingUp} chip="#157347" label={`${t("dashboard.kpi.closedSales")} ${vatSuffix}`} value={fmtShort(kpis.closedSales)}
            sparkline={{ values: revenueTrend.monthly.map((p) => p.revenue), color: "#157347" }}
            caption={t("dashboard.overview.kpi.closedSalesCaption").replace("{n}", fmtCount(kpis.wonDeals))}
          />
          <KpiCard
            icon={Target} chip={GOLD} label={`${t("dashboard.kpi.expectedSales")} ${vatSuffix}`} value={fmtShort(kpis.expectedSales)}
            help={`${t("dashboard.kpi.help.expectedSales")} ${vatSuffix}`} caption={t("dashboard.kpi.helper.expectedSales")}
          />
        </KpiGrid>
      </div>

      <SplitRow
        main={(
          <ChartCard title={t("dashboard.sales.stages.title")} sub={`${t("dashboard.sales.stages.sub")} ${vatSuffix}`}>
            {stageRows.every((r) => !r.stage?.count) ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
              <ul className="space-y-1">
                {stageRows.map(({ status, stage }, i) => {
                  const offRamp = OFF_RAMP.includes(status);
                  const color = offRamp ? "#8a94a6" : STAGE_COLOR[status] ?? "#5a7299";
                  return (
                    <li key={status} className={offRamp && i === MAIN_FLOW.length ? "pt-2 mt-2 border-t border-border" : ""}>
                      <button
                        onClick={() => onNavigateToQuotations({ status })}
                        className="w-full grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto] items-center gap-3 py-1.5 px-1 rounded-lg text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 transition-colors"
                      >
                        <span className={`text-sm truncate ${offRamp ? "text-muted-foreground" : status === "ปิดการขายสำเร็จ" ? "font-semibold text-foreground" : "text-foreground"}`}>{t(statusLabelKey[status])}</span>
                        <span className="h-[18px] rounded bg-muted overflow-hidden">
                          <span className="block h-full rounded" style={{ width: `${((stage?.count ?? 0) / maxStage) * 100}%`, background: color }} />
                        </span>
                        <span className="text-xs font-mono text-foreground whitespace-nowrap text-right min-w-[6.5rem]">
                          {fmtCount(stage?.count ?? 0)} · {fmtShort(stage?.totalValue ?? 0)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ChartCard>
        )}
        side={(
          <div data-tour="dashboard-status" className="h-full">
            <ChartCard title={t("dashboard.statusSummary.title")} sub={`${t("dashboard.statusSummary.sub")} ${vatSuffix}`} className="h-full">
              <Donut
                unit={t("quotation.countUnit")} empty={t("dashboard.noData")}
                slices={[
                  { key: "won", label: `${t("dashboard.kpi.wonDeals")} · ${fmtShort(kpis.closedSales)}`, value: kpis.wonDeals, color: "#2aa36b" },
                  { key: "lost", label: `${t("dashboard.kpi.lostDeals")} · ${fmtShort(kpis.lostValue)}`, value: kpis.lostDeals, color: "#e05252" },
                  { key: "active", label: `${t("dashboard.kpi.activeQuotations")} · ${fmtShort(kpis.activeQuotationsValue)}`, value: kpis.activeQuotations, color: salesAccent },
                  { key: "nonActive", label: `${t("dashboard.kpi.nonActiveQuotations")} · ${fmtShort(kpis.nonActiveQuotationsValue)}`, value: kpis.nonActiveQuotations, color: "#8a94a6" },
                ]}
              />
            </ChartCard>
          </div>
        )}
      />

      <SplitRow
        main={(
          <ChartCard title={t("dashboard.sales.ranking.title")} sub={`${t("dashboard.sales.ranking.sub")} ${vatSuffix}`}>
            <RankBars
              color={salesAccent} empty={t("dashboard.noData")}
              rows={ranking.map((r) => ({
                key: r.salesperson, label: r.salesperson, value: r.revenue, display: fmtShort(r.revenue),
                sub: `${fmtCount(r.quotationCount)} ${t("quotation.countUnit")} · ${t("dashboard.ranking.col.conversionRate")} ${fmtPercent(r.conversionRate)}`,
              }))}
            />
          </ChartCard>
        )}
        side={(
          <ChartCard title={t("dashboard.followUps.title")} sub={`${t("dashboard.followUps.amountNote")} ${vatSuffix}`} className="h-full">
            {followUpRows.length === 0 ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
              <ul className="-my-2">
                {followUpRows.map((f) => (
                  <li key={f.id} className="border-b border-border/50 last:border-0">
                    <button onClick={() => onNavigateToQuotations({ client: f.client })} className="w-full flex items-center gap-3 py-2.5 text-left rounded-lg hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 transition-colors">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground truncate" title={f.client}>{f.client}</span>
                        <span className="block text-xs text-muted-foreground font-mono truncate">{f.id} · {fmtShort(f.amount)}</span>
                      </span>
                      <DueBadge date={f.followUpDate} today={today} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        )}
      />

      <div data-tour="dashboard-indepth" className="pt-2 border-t border-border space-y-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.section.detail")}</p>

        {salesActivity && (
          <SalesActivityAnalytics data={salesActivity} anchorDate={trendAnchorDate} dateFiltered={!!stats.filters.from} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SalesPerformancePanel kpis={kpis} vatMode={vatMode} />
          <ExpectedSalesForecastChart forecast={forecast} vatMode={vatMode} />
        </div>

        <ActivityFollowUpSummary kpis={kpis} onPendingApprovalsClick={() => onNavigateToQuotations({ status: "รออนุมัติ" })} />
        {(scopeOfWork || deliveryOrder) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {scopeOfWork && <ScopeOfWorkSummary data={scopeOfWork} />}
            {deliveryOrder && <DeliveryOrderSummary data={deliveryOrder} />}
          </div>
        )}

        <RevenueTrendChart trend={revenueTrend} anchorDate={trendAnchorDate} vatMode={vatMode} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RevenueByJobTypeChart jobTypeAnalytics={jobTypeAnalytics} vatMode={vatMode} />
          <JobTypeDistributionChart jobTypeAnalytics={jobTypeAnalytics} />
        </div>

        <PipelineSteps pipeline={pipeline} onStageClick={(status) => onNavigateToQuotations({ status })} vatMode={vatMode} />

        <SalesPerformanceTable title={t("dashboard.salesPerformance.title")} sub={t("dashboard.salesPerformance.sub")} entries={salesPerformance} vatMode={vatMode} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CustomerAnalytics data={customerAnalytics} vatMode={vatMode} />
          <JobTypeAnalytics jobTypeAnalytics={jobTypeAnalytics} vatMode={vatMode} />
        </div>

        {approvalDashboard && <ApprovalDashboard data={approvalDashboard} onRefresh={refreshAfterAction} vatMode={vatMode} />}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <FollowUpReminders followUps={followUps} onOpenClient={(client) => onNavigateToQuotations({ client })} vatMode={vatMode} />
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
