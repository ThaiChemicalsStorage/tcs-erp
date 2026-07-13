import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { JobTypeStat, Forecast, RevenueTrend } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtShort, periodLabel } from "./format";

const PALETTE = ["#c9a84c", "#1a5fb4", "#2aa36b", "#7c4dbb", "#e05252", "#1f9d8a", "#e08a3c", "#3b6fc9"];

interface TooltipEntry { name: string; value: number; color: string }
function SimpleTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: TooltipEntry[]; label?: string; formatter: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#c9a84c]/30 rounded-lg p-3 shadow-xl">
      <p className="text-muted-foreground text-xs font-mono mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} className="text-xs font-mono" style={{ color: p.color }}>{p.name}: {formatter(p.value)}</p>)}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground text-center py-10">{children}</p>;
}

type TrendGrouping = "weekly" | "monthly" | "quarterly" | "yearly";
const TREND_GROUPINGS: TrendGrouping[] = ["weekly", "monthly", "quarterly", "yearly"];

export function RevenueTrendChart({ trend }: { trend: RevenueTrend }) {
  const { t } = useI18n();
  const [grouping, setGrouping] = useState<TrendGrouping>("monthly");
  const groupingLabel: Record<TrendGrouping, string> = {
    weekly: t("dashboard.chart.revenue.grouping.week"),
    monthly: t("dashboard.chart.revenue.grouping.month"),
    quarterly: t("dashboard.chart.revenue.grouping.quarter"),
    yearly: t("dashboard.chart.revenue.grouping.year"),
  };
  const data = trend[grouping];
  const hasData = data.some((d) => d.revenue > 0);
  return (
    <ChartCard
      title={t("dashboard.chart.revenue.title")}
      sub={t("dashboard.chart.revenue.sub")}
      className="xl:col-span-2"
      actions={
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {TREND_GROUPINGS.map((g) => (
            <button key={g} onClick={() => setGrouping(g)}
              className={`px-2 py-1 text-[10px] rounded-md font-medium transition-all ${grouping === g ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {groupingLabel[g]}
            </button>
          ))}
        </div>
      }
    >
      {!hasData ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.map((r) => ({ ...r, label: periodLabel(r.period) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} /><stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
            <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Area type="monotone" dataKey="revenue" name={t("dashboard.kpi.closedSales")} stroke="#c9a84c" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: "#c9a84c" }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/** All active job types are shown (not top-N) — a job type with zero quotes this period is a real, meaningful zero, not noise to hide. */
export function RevenueByJobTypeChart({ jobTypeAnalytics }: { jobTypeAnalytics: JobTypeStat[] }) {
  const { t } = useI18n();
  const data = jobTypeAnalytics;
  const hasData = data.some((d) => d.totalValue > 0);
  return (
    <ChartCard title={t("dashboard.chart.revenueByJobType.title")} sub={t("dashboard.chart.revenueByJobType.sub")}>
      {!hasData ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <YAxis type="category" dataKey="jobTypeCode" width={60} tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="totalValue" name={t("dashboard.chart.revenueByJobType.totalValue")} fill="#5a7299" radius={[0, 4, 4, 0]} />
            <Bar dataKey="revenue" name={t("dashboard.chart.revenueByJobType.wonValue")} fill="#c9a84c" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function JobTypeDistributionChart({ jobTypeAnalytics }: { jobTypeAnalytics: JobTypeStat[] }) {
  const { t } = useI18n();
  const data = jobTypeAnalytics.filter((j) => j.count > 0).map((j) => ({ name: j.jobTypeCode, value: j.count }));
  return (
    <ChartCard title={t("dashboard.chart.jobTypeDistribution.title")} sub={t("dashboard.chart.jobTypeDistribution.sub")}>
      {data.length === 0 ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <>
          <div className="flex justify-center mb-4">
            <PieChart width={160} height={160}>
              <Pie data={data} cx={75} cy={75} innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
            </PieChart>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="text-muted-foreground font-mono truncate" title={d.name}>{d.name}</span></div>
                <span className="font-mono text-foreground">{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}

export function ExpectedSalesForecastChart({ forecast }: { forecast: Forecast }) {
  const { t } = useI18n();
  const data = [
    { label: t("dashboard.forecast.thisMonth"), value: forecast.thisMonth },
    { label: t("dashboard.forecast.thisQuarter"), value: forecast.thisQuarter },
    { label: t("dashboard.forecast.thisYear"), value: forecast.thisYear },
  ];
  const hasData = data.some((d) => d.value > 0);
  return (
    <ChartCard title={t("dashboard.chart.expectedSales.title")} sub={`${t("dashboard.chart.expectedSales.sub")} · ${t("dashboard.forecast.basedOn")} ${forecast.historicalWinRate}%`}>
      {!hasData ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1a5fb4" stopOpacity={0.3} /><stop offset="95%" stopColor="#1a5fb4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
            <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Area type="monotone" dataKey="value" name={t("dashboard.kpi.expectedSales")} stroke="#1a5fb4" strokeWidth={2} fill="url(#fcGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function ProductsByCategoryChart({ categoryBreakdown }: { categoryBreakdown: { categoryId: string; categoryName: string; count: number; percentage: number }[] }) {
  const { t } = useI18n();
  return (
    <ChartCard title={t("dashboard.chart.category.title")} sub={t("dashboard.chart.category.sub")}>
      {categoryBreakdown.length === 0 ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <>
          <div className="flex justify-center mb-4">
            <PieChart width={160} height={160}>
              <Pie data={categoryBreakdown} cx={75} cy={75} innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="count" strokeWidth={0}>
                {categoryBreakdown.map((entry, i) => <Cell key={entry.categoryId} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
            </PieChart>
          </div>
          <div className="space-y-2.5">
            {categoryBreakdown.map((c, i) => (
              <div key={c.categoryId} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="text-xs text-muted-foreground truncate" title={c.categoryName}>{c.categoryName}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, background: PALETTE[i % PALETTE.length] }} />
                  </div>
                  <span className="text-xs font-mono text-foreground w-10 text-right">{c.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}
