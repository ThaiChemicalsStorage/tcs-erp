import { useState } from "react";
import type { SalesActivityTrend, SalesActivityBySalespersonRow } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { periodLabel, fmtDateShort } from "./format";
import { GroupingSegmented, type TrendGrouping } from "./DashboardCharts";
import { MonthlyBars, SeriesLegend, type MonthSeries } from "./tabs/DepartmentWidgets";
import { CHART, TD, TH, TONE, TR } from "./tabs/dashboardTokens";
import { fmtCount } from "./tabs/countFormat";

type ActivityCategory = "created" | "edited" | "statusChanged" | "approvalRequested" | "approvalCompleted";
const CATEGORIES: { key: ActivityCategory; color: string }[] = [
  { key: "created", color: CHART.blue },
  { key: "edited", color: TONE.neutral },
  { key: "statusChanged", color: CHART.violet },
  { key: "approvalRequested", color: CHART.orange },
  { key: "approvalCompleted", color: CHART.aqua },
];

/**
 * กิจกรรมของฝ่ายขาย (บอร์ด Dashboard-Sales, ดีไซน์ใหม่ 2026-09-30) — บอร์ดเหลือแค่สองตาราง แต่เจ้าของสั่งคงกราฟไว้
 * จึงเป็น: กราฟแท่งซ้อนตามช่วงเวลา (ชุดสีกราฟใหม่) → ตาราง "ตามช่วงเวลา" (8 ช่วงล่าสุด) คู่กับ "สรุปตามพนักงานขาย"
 * Stacked activity bars by period, then the per-period and per-salesperson tables side by side
 */
export function SalesActivityAnalytics({ data, anchorDate, dateFiltered }: { data: SalesActivityTrend; anchorDate: string; dateFiltered: boolean }) {
  const { t, lang } = useI18n();
  const [grouping, setGrouping] = useState<TrendGrouping>("monthly");
  const categoryLabel: Record<ActivityCategory, string> = {
    created: t("dashboard.salesActivity.created"),
    edited: t("dashboard.salesActivity.edited"),
    statusChanged: t("dashboard.salesActivity.statusChanged"),
    approvalRequested: t("dashboard.salesActivity.approvalRequested"),
    approvalCompleted: t("dashboard.salesActivity.approvalCompleted"),
  };
  const series: MonthSeries[] = CATEGORIES.map((c) => ({ key: c.key, name: categoryLabel[c.key], color: c.color }));
  const rows = data[grouping];
  const hasData = rows.some((r) => CATEGORIES.some((c) => r[c.key] > 0));
  const bySalespersonRows: (SalesActivityBySalespersonRow & { total: number })[] = data.bySalesperson[grouping]
    .map((r) => ({ ...r, total: r.created + r.edited }))
    .slice(0, 12);

  return (
    <ChartCard
      flush
      title={t("dashboard.salesActivity.title")}
      sub={dateFiltered
        ? t("dashboard.salesActivity.sub.filtered")
        : `${t("dashboard.salesActivity.sub")} — ${t("dashboard.trend.endingOn")} ${fmtDateShort(anchorDate, lang)}`}
      actions={<GroupingSegmented value={grouping} onChange={setGrouping} />}
    >
      {!hasData ? (
        <p className="text-[13px] text-muted-foreground text-center py-10">{t("dashboard.salesActivity.empty")}</p>
      ) : (
        <>
          <div className="px-6 pt-4 pb-3 flex flex-col gap-3 border-b border-[#eef1f6]" role="group" aria-label={t("dashboard.salesActivity.chartLabel")}>
            <SeriesLegend series={series} />
            <MonthlyBars
              rows={rows.map((r) => ({ ...r, month: r.period }))} series={series} stacked
              format={fmtCount} height={220} empty={t("dashboard.salesActivity.empty")}
              labelOf={grouping === "monthly" ? undefined : (r) => periodLabel(r.month)}
            />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_520px]">
            <div className="min-w-0 xl:border-r border-[#eef1f6]">
              <p className="px-6 pt-3 pb-2 text-[13px] font-semibold text-[#26395a]">{t("dashboard.salesActivity.byPeriod.title")}</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#f8f9fc] border-y border-border">
                      <th className={`${TH} text-left`}>{t("dashboard.salesActivity.col.period")}</th>
                      {CATEGORIES.map((c) => <th key={c.key} className={`${TH} text-right`}>{categoryLabel[c.key]}</th>)}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.slice(-8).reverse().map((r) => (
                      <tr key={r.period} className={TR}>
                        <td className={`${TD} text-[#3d5173] whitespace-nowrap`}>{periodLabel(r.period)}</td>
                        {CATEGORIES.map((c) => <td key={c.key} className={`${TD} text-right`}>{fmtCount(r[c.key])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="min-w-0 border-t xl:border-t-0 border-[#eef1f6]">
              <p className="px-6 pt-3 pb-2 text-[13px] font-semibold text-[#26395a]">{t("dashboard.salesActivity.bySalesperson.title")}</p>
              {bySalespersonRows.length === 0 ? (
                <p className="text-[13px] text-muted-foreground text-center py-6">{t("dashboard.salesActivity.bySalesperson.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-[#f8f9fc] border-y border-border">
                        <th className={`${TH} text-left`}>{t("dashboard.salesActivity.col.period")}</th>
                        <th className={`${TH} text-left`}>{t("dashboard.salesActivity.col.salesperson")}</th>
                        <th className={`${TH} text-right`}>{t("dashboard.salesActivity.created")}</th>
                        <th className={`${TH} text-right`}>{t("dashboard.salesActivity.edited")}</th>
                        <th className={`${TH} text-right`}>{t("dashboard.salesActivity.col.total")}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {bySalespersonRows.map((r) => (
                        <tr key={`${r.period}-${r.salesperson}`} className={TR}>
                          <td className={`${TD} text-[#3d5173] whitespace-nowrap`}>{periodLabel(r.period)}</td>
                          <td className={`${TD} max-w-[180px] truncate`} title={r.salesperson}>{r.salesperson}</td>
                          <td className={`${TD} text-right`}>{fmtCount(r.created)}</td>
                          <td className={`${TD} text-right`}>{fmtCount(r.edited)}</td>
                          <td className={`${TD} text-right font-semibold`}>{fmtCount(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </ChartCard>
  );
}
