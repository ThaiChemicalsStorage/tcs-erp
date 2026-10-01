import { useState } from "react";
import type { JobTypeStat, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard, ScopeTag } from "./ChartCard";
import { fmtShort, fmtPercent } from "./format";
import { SortHeader } from "./tabs/DepartmentWidgets";
import { BAR, CHART, TD, TH, TR } from "./tabs/dashboardTokens";
import { fmtCount } from "./tabs/countFormat";

type SortKey = "totalValue" | "revenue" | "count" | "winRate" | "avgDealSize";

/**
 * การวิเคราะห์ตามประเภทงาน (บอร์ด Dashboard-Sales) — ตารางเดียวแทนตารางเดิม + กราฟมูลค่าตามประเภทงาน + โดนัทสัดส่วน
 * (เจ้าของอนุมัติให้รวมกราฟเข้าตาราง 2026-09-30) · คอลัมน์ "สัดส่วนที่ปิดได้": แถบอ่อน = มูลค่ารวมเทียบประเภทที่มากสุด
 * ส่วนเข้ม = มูลค่าที่ปิดสำเร็จ · จำนวนใบของแต่ละประเภท (ที่โดนัทเคยแสดง) อยู่ในคอลัมน์ "งาน" · เรียงได้ทุกคอลัมน์ตัวเลขเหมือนเดิม
 */
export function JobTypeAnalytics({ jobTypeAnalytics, vatMode }: { jobTypeAnalytics: JobTypeStat[]; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("totalValue");
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");

  const sorted = [...jobTypeAnalytics].sort((a, b) => b[sortKey] - a[sortKey]);
  const maxTotal = Math.max(0, ...jobTypeAnalytics.map((j) => j.totalValue));
  const sortable = (key: SortKey, label: string) => (
    <th className={`${TH} text-right`} aria-sort={sortKey === key ? "descending" : undefined}>
      <SortHeader label={label} active={sortKey === key} onClick={() => setSortKey(key)} />
    </th>
  );

  return (
    <ChartCard
      flush className="h-full"
      title={t("dashboard.jobType.title")} tag={vatSuffix} sub={t("dashboard.jobType.sub2")}
      actions={<ScopeTag>{t("dashboard.dept.periodTag")}</ScopeTag>}
    >
      {sorted.length === 0 ? (
        <p className="text-[13px] text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-border">
                <th className={`${TH} text-left`}>{t("dashboard.jobType.col.name")}</th>
                {sortable("count", t("dashboard.jobType.col.count"))}
                {sortable("totalValue", t("dashboard.jobType.col.totalValue"))}
                {sortable("revenue", t("dashboard.jobType.col.wonValue"))}
                <th className={`${TH} text-left`}>{t("dashboard.jobType.col.share")}</th>
                {sortable("winRate", t("dashboard.jobType.col.winRate"))}
                {sortable("avgDealSize", t("dashboard.jobType.col.avgDealSize"))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {sorted.map((j) => {
                const totalPct = maxTotal > 0 ? (j.totalValue / maxTotal) * 100 : 0;
                const wonPct = j.totalValue > 0 ? Math.min(100, (j.revenue / j.totalValue) * 100) : 0;
                return (
                  <tr key={j.jobTypeCode} className={`${TR} hover:bg-[#f8f9fc] transition-colors`}>
                    <td className={TD}>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="min-w-11 h-[22px] px-1.5 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold font-mono inline-flex items-center justify-center flex-shrink-0">{j.jobTypeCode}</span>
                        <span className="truncate text-[#26395a] max-w-[260px]" title={j.jobTypeName}>{j.jobTypeName}</span>
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>{fmtCount(j.count)}</td>
                    <td className={`${TD} text-right text-[#3d5173] whitespace-nowrap`}>{fmtShort(j.totalValue)}</td>
                    <td className={`${TD} text-right font-semibold whitespace-nowrap`}>{fmtShort(j.revenue)}</td>
                    <td className={`${TD} min-w-[100px]`}>
                      <span
                        className="block h-2 rounded-full bg-[#eef1f6] overflow-hidden" role="img"
                        title={t("dashboard.jobType.shareHint")}
                        aria-label={`${j.jobTypeCode} ${fmtShort(j.revenue)} / ${fmtShort(j.totalValue)}`}
                      >
                        <span className="block h-full" style={{ width: `${totalPct}%`, background: BAR.light }}>
                          <span className="block h-full" style={{ width: `${wonPct}%`, background: CHART.blue }} />
                        </span>
                      </span>
                    </td>
                    <td className={`${TD} text-right`}>{fmtPercent(j.winRate)}</td>
                    <td className={`${TD} text-right text-[#3d5173] whitespace-nowrap`}>{fmtShort(j.avgDealSize)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
