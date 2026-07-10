import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type { SalesPerformanceEntry, JobTypeStat, PipelineStage, Forecast } from "../../lib/dashboard";
import { statusLabelKey } from "../../lib/quotes";
import type { QuoteStatus } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtShort, monthLabel } from "./format";

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

export function RevenueTrendChart({ data }: { data: { month: string; revenue: number }[] }) {
  const { t } = useI18n();
  const hasData = data.some((d) => d.revenue > 0);
  return (
    <ChartCard title={t("dashboard.chart.revenue.title")} sub={t("dashboard.chart.revenue.sub")} className="xl:col-span-2">
      {!hasData ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.map((r) => ({ ...r, label: monthLabel(r.month) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} /><stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
            <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Area type="monotone" dataKey="revenue" name={t("dashboard.kpi.closedSales")} stroke="#c9a84c" strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4, fill: "#c9a84c" }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/**
 * Approximation: quotation *count* over time isn't tracked per-month server-side (only won
 * revenue is, via `revenueByMonth`) — this reuses that same monthly series as the closest
 * available real-data proxy for a trend line, rather than adding a dedicated monthly-count
 * aggregation for a chart the plan explicitly scoped as best-effort. Revisit if a true
 * quotation-count-per-month series becomes a real requirement.
 */
export function QuotationTrendChart({ revenueByMonth }: { revenueByMonth: { month: string; revenue: number }[] }) {
  const { t } = useI18n();
  const data = revenueByMonth.map((r) => ({ label: monthLabel(r.month), revenue: r.revenue }));
  const hasData = revenueByMonth.some((d) => d.revenue > 0);
  return (
    <ChartCard title={t("dashboard.chart.quotationTrend.title")} sub={t("dashboard.chart.quotationTrend.sub")}>
      {!hasData ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
            <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Line type="monotone" dataKey="revenue" name={t("dashboard.kpi.closedSales")} stroke="#1a5fb4" strokeWidth={2} dot={{ r: 3, fill: "#1a5fb4" }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function SalesByEmployeeChart({ salesPerformance }: { salesPerformance: SalesPerformanceEntry[] }) {
  const { t } = useI18n();
  const data = [...salesPerformance].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  return (
    <ChartCard title={t("dashboard.chart.salesByEmployee.title")} sub={t("dashboard.chart.salesByEmployee.sub")}>
      {data.length === 0 ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <YAxis type="category" dataKey="salesperson" width={90} tick={{ fill: "#5a7299", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Bar dataKey="revenue" name={t("dashboard.ranking.col.revenue")} fill="#c9a84c" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function RevenueByJobTypeChart({ jobTypeAnalytics }: { jobTypeAnalytics: JobTypeStat[] }) {
  const { t } = useI18n();
  const data = jobTypeAnalytics.slice(0, 10);
  return (
    <ChartCard title={t("dashboard.chart.revenueByJobType.title")} sub={t("dashboard.chart.revenueByJobType.sub")}>
      {data.length === 0 ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
            <XAxis dataKey="jobTypeCode" tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Bar dataKey="revenue" name={t("dashboard.ranking.col.revenue")} radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

export function QuotationStatusDonut({ pipeline }: { pipeline: PipelineStage[] }) {
  const { t } = useI18n();
  const data = pipeline.filter((p) => p.count > 0).map((p) => ({ name: t(statusLabelKey[p.stage as QuoteStatus]), value: p.count }));
  return (
    <ChartCard title={t("dashboard.chart.statusDonut.title")} sub={t("dashboard.chart.statusDonut.sub")}>
      {data.length === 0 ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <>
          <div className="flex justify-center mb-4">
            <PieChart width={160} height={160}>
              <Pie data={data} cx={75} cy={75} innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
            </PieChart>
          </div>
          <div className="space-y-1.5">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="text-muted-foreground truncate">{d.name}</span></div>
                <span className="font-mono text-foreground">{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}

export function WinLoseDonut({ won, lost }: { won: number; lost: number }) {
  const { t } = useI18n();
  const data = [
    { name: t("dashboard.kpi.wonDeals"), value: won, color: "#157347" },
    { name: t("dashboard.kpi.lostDeals"), value: lost, color: "#e05252" },
  ].filter((d) => d.value > 0);
  return (
    <ChartCard title={t("dashboard.chart.winLose.title")} sub={t("dashboard.chart.winLose.sub")}>
      {data.length === 0 ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <div className="flex items-center gap-6">
          <PieChart width={140} height={140}>
            <Pie data={data} cx={65} cy={65} innerRadius={42} outerRadius={64} paddingAngle={3} dataKey="value" strokeWidth={0}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
          </PieChart>
          <div className="space-y-2">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="font-mono text-foreground font-semibold">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
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
                  <span className="text-xs text-muted-foreground truncate">{c.categoryName}</span>
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

export function MonthlyClosingRateChart({ data }: { data: { month: string; winRate: number | null }[] }) {
  const { t } = useI18n();
  // null (not 0) means "no won/lost deals that month" — a real 0% month (deals that all lost)
  // must still render as a visible flat line, not be hidden behind the empty state.
  const hasData = data.some((d) => d.winRate !== null);
  return (
    <ChartCard title={t("dashboard.chart.closingRate.title")} sub={t("dashboard.chart.closingRate.sub")}>
      {!hasData ? <EmptyNote>{t("dashboard.noData")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data.map((d) => ({ ...d, label: monthLabel(d.month) }))} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
            <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} unit="%" />
            <Tooltip content={<SimpleTooltip formatter={(v) => `${v}%`} />} />
            <Line type="monotone" dataKey="winRate" name={t("dashboard.kpi.winRate")} stroke="#2aa36b" strokeWidth={2} dot={{ r: 3, fill: "#2aa36b" }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
