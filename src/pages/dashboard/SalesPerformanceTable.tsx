import { useState } from "react";
import type { SalesPerformanceEntry, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard, ScopeTag } from "./ChartCard";
import { fmtShort, fmtPercent, fmtDaysOrDash } from "./format";
import { SortHeader } from "./tabs/DepartmentWidgets";
import { CHART, TD, TH, TR } from "./tabs/dashboardTokens";
import { fmtCount } from "./tabs/countFormat";

type SortKey = "totalValue" | "revenue" | "quotationCount" | "won" | "lost" | "pending" | "conversionRate" | "avgClosingTime" | "avgDealSize" | "expectedRevenue";

// ตารางผลงานพนักงานขาย (บอร์ด Dashboard-Sales) — ทุกคน เรียงตามรายได้ กดหัวคอลัมน์เพื่อเรียงใหม่ · คอลัมน์รายได้มีแถบเทียบคนที่มากสุด
// Sales performance table with sortable columns; the revenue column carries a bar against the top performer
export function SalesPerformanceTable({ title, sub, entries, limit, vatMode }: { title: string; sub: string; entries: SalesPerformanceEntry[]; limit?: number; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const days = t("dashboard.unit.days");
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");

  const sorted = [...entries].sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1));
  const rows = limit ? sorted.slice(0, limit) : sorted;
  const maxRevenue = Math.max(0, ...entries.map((e) => e.revenue));

  const columns: { key: SortKey; label: string }[] = [
    { key: "quotationCount", label: t("dashboard.ranking.col.jobs") },
    { key: "totalValue", label: t("dashboard.ranking.col.totalValue") },
    { key: "revenue", label: t("dashboard.ranking.col.revenue") },
    { key: "expectedRevenue", label: t("dashboard.ranking.col.expectedRevenue") },
    { key: "won", label: t("dashboard.ranking.col.won") },
    { key: "lost", label: t("dashboard.ranking.col.lost") },
    { key: "pending", label: t("dashboard.ranking.col.pending") },
    { key: "conversionRate", label: t("dashboard.ranking.col.conversionRate") },
    { key: "avgDealSize", label: t("dashboard.ranking.col.avgDealSize") },
    { key: "avgClosingTime", label: t("dashboard.ranking.col.avgClosingTime") },
  ];

  return (
    <ChartCard flush title={title} tag={vatSuffix} sub={sub} actions={<ScopeTag>{t("dashboard.dept.periodTag")}</ScopeTag>}>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-border">
                <th className={`${TH} text-left`}>{t("dashboard.ranking.col.salesperson")}</th>
                {columns.map((c) => (
                  <th key={c.key} className={`${TH} ${c.key === "revenue" ? "text-left min-w-[130px]" : "text-right"}`} aria-sort={sortKey === c.key ? "descending" : undefined}>
                    <SortHeader label={c.label} active={sortKey === c.key} onClick={() => setSortKey(c.key)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r, i) => (
                <tr key={r.salesperson} className={`${TR} hover:bg-[#f8f9fc] transition-colors`}>
                  <td className={`${TD} font-medium whitespace-nowrap max-w-[220px] truncate`} title={r.salesperson}>
                    {limit && <span className="text-muted-foreground mr-2">#{i + 1}</span>}
                    {r.salesperson}
                  </td>
                  <td className={`${TD} text-right`}>{fmtCount(r.quotationCount)}</td>
                  <td className={`${TD} text-right text-[#3d5173] whitespace-nowrap`}>{fmtShort(r.totalValue)}</td>
                  <td className={TD}>
                    <span className="flex flex-col gap-1">
                      <span className="font-semibold whitespace-nowrap">{fmtShort(r.revenue)}</span>
                      <span className="block h-1 rounded-full bg-[#eef1f6] overflow-hidden" aria-hidden="true">
                        <span className="block h-full" style={{ width: `${maxRevenue > 0 ? (r.revenue / maxRevenue) * 100 : 0}%`, background: CHART.blue }} />
                      </span>
                    </span>
                  </td>
                  <td className={`${TD} text-right text-[#3d5173] whitespace-nowrap`}>{fmtShort(r.expectedRevenue)}</td>
                  <td className={`${TD} text-right`}>{fmtCount(r.won)}</td>
                  <td className={`${TD} text-right`}>{fmtCount(r.lost)}</td>
                  <td className={`${TD} text-right`}>{fmtCount(r.pending)}</td>
                  <td className={`${TD} text-right`}>{fmtPercent(r.conversionRate)}</td>
                  <td className={`${TD} text-right text-[#3d5173] whitespace-nowrap`}>{fmtShort(r.avgDealSize)}</td>
                  <td className={`${TD} text-right text-[#3d5173] whitespace-nowrap`}>{fmtDaysOrDash(r.avgClosingTime, days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
