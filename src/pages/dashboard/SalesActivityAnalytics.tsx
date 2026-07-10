import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Activity } from "lucide-react";
import type { SalesActivityTrend } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { EmptyState } from "../../components/EmptyState";
import { periodLabel } from "./format";

type Grouping = "weekly" | "monthly" | "quarterly" | "yearly";
const GROUPINGS: Grouping[] = ["weekly", "monthly", "quarterly", "yearly"];

/**
 * New section (2026-07-10 UI/UX redesign): quotation Created/Updated activity, grouped by period,
 * filterable by the same salesperson/department controls as the rest of the Dashboard (already
 * applied server-side in `api/dashboard/index.ts`'s `salesActivity` aggregation — this component
 * just renders whichever grouping tab is selected). Kept intentionally compact (one chart + one
 * table, tabs instead of four separate always-visible charts) per "avoid making this section too
 * large."
 */
export function SalesActivityAnalytics({ data }: { data: SalesActivityTrend }) {
  const { t } = useI18n();
  const [grouping, setGrouping] = useState<Grouping>("monthly");
  const groupingLabel: Record<Grouping, string> = {
    weekly: t("dashboard.chart.revenue.grouping.week"),
    monthly: t("dashboard.chart.revenue.grouping.month"),
    quarterly: t("dashboard.chart.revenue.grouping.quarter"),
    yearly: t("dashboard.chart.revenue.grouping.year"),
  };
  const rows = data[grouping];
  const hasData = rows.some((r) => r.created > 0 || r.edited > 0);
  const chartData = rows.map((r) => ({ ...r, label: periodLabel(r.period) }));

  return (
    <ChartCard
      title={t("dashboard.salesActivity.title")}
      sub={t("dashboard.salesActivity.sub")}
      actions={
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {GROUPINGS.map((g) => (
            <button key={g} onClick={() => setGrouping(g)}
              className={`px-2 py-1 text-[10px] rounded-md font-medium transition-all ${grouping === g ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {groupingLabel[g]}
            </button>
          ))}
        </div>
      }
    >
      {!hasData ? (
        <EmptyState icon={Activity} title={t("dashboard.salesActivity.empty")} description={t("dashboard.salesActivity.sub")} compact />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
              <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="created" name={t("dashboard.salesActivity.created")} fill="#c9a84c" radius={[4, 4, 0, 0]} />
              <Bar dataKey="edited" name={t("dashboard.salesActivity.edited")} fill="#5a7299" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.salesActivity.col.period")}</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.salesActivity.created")}</th>
                  <th className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.salesActivity.edited")}</th>
                </tr>
              </thead>
              <tbody>
                {chartData.slice(-8).reverse().map((r) => (
                  <tr key={r.period} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-1.5 text-xs text-foreground font-mono">{r.label}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-[#c9a84c] text-right">{r.created}</td>
                    <td className="px-2 py-1.5 text-xs font-mono text-[#5a7299] text-right">{r.edited}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ChartCard>
  );
}
