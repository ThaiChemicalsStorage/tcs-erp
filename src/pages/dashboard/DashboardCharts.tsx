import { useState } from "react";
import type { Forecast, RevenueTrend, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtShort, periodLabel, fmtDateShort } from "./format";
import { EmptyNote, MonthlyBars, ProgressBar, Segmented } from "./tabs/DepartmentWidgets";
import { BAR } from "./tabs/dashboardTokens";
import { fmtAxis } from "./tabs/countFormat";

/**
 * กราฟของแท็บขาย (ดีไซน์ใหม่ 2026-09-30, บอร์ด Dashboard-Sales) — รายได้ตามช่วงเวลาเป็นแท่ง (ล่าสุดสีเข้ม) +
 * ปุ่มแบ่งส่วน รายสัปดาห์/เดือน/ไตรมาส/ปี · ยอดคาดการณ์เป็นแถบสามแถว
 * กราฟรายได้/สัดส่วนตามประเภทงานสองกราฟเดิมรวมเข้าตาราง "การวิเคราะห์ตามประเภทงาน" แล้ว (เจ้าของอนุมัติ 2026-09-30)
 */

export type TrendGrouping = "weekly" | "monthly" | "quarterly" | "yearly";
const TREND_GROUPINGS: TrendGrouping[] = ["weekly", "monthly", "quarterly", "yearly"];

/** ปุ่มแบ่งส่วน รายสัปดาห์/รายเดือน/รายไตรมาส/รายปี — ใช้ทั้งกราฟรายได้และกิจกรรมของฝ่ายขาย */
export function GroupingSegmented({ value, onChange }: { value: TrendGrouping; onChange: (g: TrendGrouping) => void }) {
  const { t } = useI18n();
  const label: Record<TrendGrouping, string> = {
    weekly: t("dashboard.chart.revenue.grouping.week"),
    monthly: t("dashboard.chart.revenue.grouping.month"),
    quarterly: t("dashboard.chart.revenue.grouping.quarter"),
    yearly: t("dashboard.chart.revenue.grouping.year"),
  };
  return <Segmented options={TREND_GROUPINGS.map((g) => ({ key: g, label: label[g] }))} value={value} onChange={onChange} ariaLabel={t("dashboard.grouping.label")} />;
}

// กราฟรายได้ เลือกดูแบบรายสัปดาห์/เดือน/ไตรมาส/ปีได้
// Revenue bars, switchable between weekly/monthly/quarterly/yearly grouping.
export function RevenueTrendChart({ trend, anchorDate, vatMode }: { trend: RevenueTrend; anchorDate: string; vatMode: DashboardVatMode }) {
  const { t, lang } = useI18n();
  const [grouping, setGrouping] = useState<TrendGrouping>("monthly");
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const rows = trend[grouping].map((r) => ({ month: r.period, revenue: r.revenue }));
  return (
    <ChartCard
      fill
      title={t("dashboard.chart.revenue.title")} tag={vatSuffix}
      sub={`${t("dashboard.chart.revenue.sub")} — ${t("dashboard.trend.endingOn")} ${fmtDateShort(anchorDate, lang)}`}
      actions={<GroupingSegmented value={grouping} onChange={setGrouping} />}
    >
      <MonthlyBars
        rows={rows}
        series={[{ key: "revenue", name: `${t("dashboard.kpi.closedSales")} ${vatSuffix}` }]}
        format={fmtShort} axisFormat={fmtAxis} height={240} empty={t("dashboard.noData")}
        labelOf={grouping === "monthly" ? undefined : (r) => periodLabel(r.month)}
      />
    </ChartCard>
  );
}

// ยอดขายที่คาดว่าจะได้ เดือนนี้/ไตรมาสนี้/ปีนี้ — แถบเทียบกับค่าที่มากสุด
// Expected sales forecast for this month/quarter/year as three bars.
export function ExpectedSalesForecastChart({ forecast, vatMode }: { forecast: Forecast; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const data = [
    { key: "month", label: t("dashboard.forecast.thisMonth"), value: forecast.thisMonth },
    { key: "quarter", label: t("dashboard.forecast.thisQuarter"), value: forecast.thisQuarter },
    { key: "year", label: t("dashboard.forecast.thisYear"), value: forecast.thisYear },
  ];
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <ChartCard
      title={t("dashboard.chart.expectedSales.title")} tag={vatSuffix} className="h-full" bodyClassName="flex-1 px-5 py-[18px] flex flex-col justify-around gap-4"
      sub={`${t("dashboard.chart.expectedSales.sub")} · ${t("dashboard.forecast.basedOn")} ${forecast.historicalWinRate}%`}
    >
      {max === 0 ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : data.map((d) => (
        <div key={d.key} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="flex-1 text-[13px] text-[#26395a]">{d.label}</span>
            <span className="text-lg font-semibold tabular-nums">{fmtShort(d.value)}</span>
          </div>
          <ProgressBar value={d.value} max={max} color={BAR.rank} label={`${d.label} ${fmtShort(d.value)}`} />
        </div>
      ))}
    </ChartCard>
  );
}
