import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Activity } from "lucide-react";
import type { SalesActivityTrend, SalesActivityBySalespersonRow } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { EmptyState } from "../../components/EmptyState";
import { periodLabel, fmtDateShort } from "./format";

type Grouping = "weekly" | "monthly" | "quarterly" | "yearly";
const GROUPINGS: Grouping[] = ["weekly", "monthly", "quarterly", "yearly"];

type ActivityCategory = "created" | "edited" | "statusChanged" | "approvalRequested" | "approvalCompleted";
const CATEGORIES: { key: ActivityCategory; color: string }[] = [
  { key: "created", color: "#c9a84c" },
  { key: "edited", color: "#5a7299" },
  { key: "statusChanged", color: "#1a5fb4" },
  { key: "approvalRequested", color: "#e08a3c" },
  { key: "approvalCompleted", color: "#2aa36b" },
];

/**
 * New section (2026-07-10 UI/UX redesign): quotation activity, grouped by period, filterable by
 * the same salesperson/department controls as the rest of the Dashboard (already applied
 * server-side in `api/dashboard/index.ts`'s `salesActivity` aggregation — this component just
 * renders whichever grouping tab is selected). Kept intentionally compact (one chart + one table,
 * tabs instead of four separate always-visible charts) per "avoid making this section too large."
 *
 * **2026-07-13, Codex-review fix**: expanded from 2 tracked categories (Created/Edited) to the 5
 * originally requested — Created, Edited, Status Changed, Approval Requested, Approval Completed
 * — as a **stacked** bar chart (not 5 grouped bars per period, which would triple the visual
 * density this section is explicitly supposed to avoid). The section's `sub` copy also now states
 * plainly that this is a rolling trend anchored to the filter's end date, not limited by its start
 * date — the previous silence on that was flagged as misleading (the date-range filter visibly
 * has a "from" control that doesn't affect this chart).
 */
export function SalesActivityAnalytics({ data, anchorDate }: { data: SalesActivityTrend; anchorDate: string }) {
  const { t, lang } = useI18n();
  const [grouping, setGrouping] = useState<Grouping>("monthly");
  const groupingLabel: Record<Grouping, string> = {
    weekly: t("dashboard.chart.revenue.grouping.week"),
    monthly: t("dashboard.chart.revenue.grouping.month"),
    quarterly: t("dashboard.chart.revenue.grouping.quarter"),
    yearly: t("dashboard.chart.revenue.grouping.year"),
  };
  const categoryLabel: Record<ActivityCategory, string> = {
    created: t("dashboard.salesActivity.created"),
    edited: t("dashboard.salesActivity.edited"),
    statusChanged: t("dashboard.salesActivity.statusChanged"),
    approvalRequested: t("dashboard.salesActivity.approvalRequested"),
    approvalCompleted: t("dashboard.salesActivity.approvalCompleted"),
  };
  const rows = data[grouping];
  const hasData = rows.some((r) => CATEGORIES.some((c) => r[c.key] > 0));
  const chartData = rows.map((r) => ({ ...r, label: periodLabel(r.period) }));
  const bySalespersonRows: (SalesActivityBySalespersonRow & { total: number })[] = data.bySalesperson[grouping]
    .map((r) => ({ ...r, total: r.created + r.edited }))
    .slice(0, 12);

  return (
    <ChartCard
      title={t("dashboard.salesActivity.title")}
      sub={`${t("dashboard.salesActivity.sub")} — ${t("dashboard.trend.endingOn")} ${fmtDateShort(anchorDate, lang)}`}
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
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
              <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {CATEGORIES.map((c, i) => (
                <Bar key={c.key} dataKey={c.key} name={categoryLabel[c.key]} stackId="activity" fill={c.color} radius={i === CATEGORIES.length - 1 ? [4, 4, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.salesActivity.col.period")}</th>
                  {CATEGORIES.map((c) => (
                    <th key={c.key} className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{categoryLabel[c.key]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chartData.slice(-8).reverse().map((r) => (
                  <tr key={r.period} className="border-b border-border/40 last:border-0">
                    <td className="px-2 py-1.5 text-xs text-foreground font-mono">{r.label}</td>
                    {CATEGORIES.map((c) => (
                      <td key={c.key} className="px-2 py-1.5 text-xs font-mono text-right" style={{ color: c.color }}>{r[c.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-salesperson breakdown (2026-07-13, P'Keng/P'Kee business requirement) — a
              distinct table from the one above: that one is period-only totals across everyone in
              scope, this one is (period, salesperson) rows, Created/Edited only. */}
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("dashboard.salesActivity.bySalesperson.title")}</p>
            {bySalespersonRows.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{t("dashboard.salesActivity.bySalesperson.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.salesActivity.col.period")}</th>
                      <th className="px-2 py-1.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.salesActivity.col.salesperson")}</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.salesActivity.created")}</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.salesActivity.edited")}</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.salesActivity.col.total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bySalespersonRows.map((r) => (
                      <tr key={`${r.period}-${r.salesperson}`} className="border-b border-border/40 last:border-0">
                        <td className="px-2 py-1.5 text-xs text-foreground font-mono whitespace-nowrap">{periodLabel(r.period)}</td>
                        <td className="px-2 py-1.5 text-xs text-foreground truncate max-w-[160px]" title={r.salesperson}>{r.salesperson}</td>
                        <td className="px-2 py-1.5 text-xs font-mono text-[#c9a84c] text-right">{r.created}</td>
                        <td className="px-2 py-1.5 text-xs font-mono text-[#5a7299] text-right">{r.edited}</td>
                        <td className="px-2 py-1.5 text-xs font-mono font-semibold text-foreground text-right">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </ChartCard>
  );
}
