import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { EmptyState } from "../../components/EmptyState";
import { PieChart as PieChartIcon } from "lucide-react";
import { fmtShort, fmtPercent } from "./format";

// สรุปผลใบเสนอราคา 4 กลุ่ม (ชนะ/แพ้/ยังดำเนินการ/ไม่ได้ดำเนินการ) พร้อมจำนวน มูลค่า และเปอร์เซ็นต์ที่รวมกันได้ 100%
// Summarizes quotations into 4 outcome groups (won/lost/active/non-active) with count, value, and percentages that sum to 100%
export function QuotationStatusSummary({ kpis }: { kpis: DashboardKpis }) {
  const { t } = useI18n();

  const rows = [
    { key: "won", label: t("dashboard.kpi.wonDeals"), count: kpis.wonDeals, value: kpis.closedSales, color: "#157347" },
    { key: "lost", label: t("dashboard.kpi.lostDeals"), count: kpis.lostDeals, value: kpis.lostValue, color: "#e05252" },
    { key: "active", label: t("dashboard.kpi.activeQuotations"), count: kpis.activeQuotations, value: kpis.activeQuotationsValue, color: "#3b6fc9" },
    { key: "nonActive", label: t("dashboard.kpi.nonActiveQuotations"), count: kpis.nonActiveQuotations, value: kpis.nonActiveQuotationsValue, color: "#8a94a6" },
  ];
  const hasData = rows.some((r) => r.count > 0);
  const donutData = rows.filter((r) => r.count > 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);

  return (
    <ChartCard title={t("dashboard.statusSummary.title")} sub={t("dashboard.statusSummary.sub")}>
      {!hasData ? (
        <EmptyState icon={PieChartIcon} title={t("dashboard.noData")} description={t("dashboard.statusSummary.sub")} compact />
      ) : (
        <div className="flex flex-col sm:flex-row items-center gap-5">
          <div className="w-[140px] h-[140px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={42} outerRadius={64} paddingAngle={3} dataKey="count" strokeWidth={0}>
                  {donutData.map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 w-full overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.statusSummary.col.status")}</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.statusSummary.col.count")}</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.statusSummary.col.value")}</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.statusSummary.col.percentage")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-2 text-xs text-foreground">
                      <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />{r.label}</span>
                    </td>
                    <td className="px-2 py-2 text-xs font-mono text-foreground text-right">{r.count.toLocaleString("th-TH")}</td>
                    <td className="px-2 py-2 text-xs font-mono text-muted-foreground text-right">{fmtShort(r.value)}</td>
                    <td className="px-2 py-2 text-xs font-mono text-muted-foreground text-right">{totalCount ? fmtPercent((r.count / totalCount) * 100) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
