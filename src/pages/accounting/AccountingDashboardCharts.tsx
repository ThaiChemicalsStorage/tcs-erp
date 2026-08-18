import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type {
  ArDashboardTrendPoint, ArDashboardDocTypeStat, ArDashboardBillingFunnelStat, ArAgingBucket,
} from "../../lib/accountingDashboard";
import { AGING_BUCKET_COLORS, AGING_BUCKET_LABEL_KEY } from "../../lib/accountingDashboard";
import { DOC_TYPE_LABEL_KEY, BILLING_STATUS_LABEL_KEY } from "../../lib/accounting";
import { ChartCard } from "../dashboard/ChartCard";
import { fmtShort } from "../dashboard/format";
import { useI18n } from "../../lib/i18n";

// กราฟสำหรับแดชบอร์ดบัญชี (เพิ่ม 2026-08-18) — ใช้ ChartCard/fmtShort ร่วมกับแดชบอร์ดหลัก
// Charts for the Accounting Dashboard, reusing the main Dashboard's ChartCard/fmtShort conventions.

const DOC_TYPE_COLORS: Record<string, string> = { AR: "#c9a84c", IV: "#1a5fb4", BI: "#2aa36b", RE: "#7c4dbb" };
const FUNNEL_COLORS: Record<string, string> = { not_billed: "#5a7299", billed: "#c9a84c", work_open: "#e08a3c", closed: "#2aa36b" };

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

type TrendGrouping = "monthly" | "quarterly";

// รวมจุดข้อมูลรายเดือน 12 จุด เป็นรายไตรมาส 4 จุด
// Re-buckets 12 monthly points into 4 quarterly points, client-side.
function toQuarterly(monthly: ArDashboardTrendPoint[]): { label: string; netTotal: number; count: number }[] {
  const out: { label: string; netTotal: number; count: number }[] = [];
  for (let i = 0; i < monthly.length; i += 3) {
    const chunk = monthly.slice(i, i + 3);
    out.push({
      label: `${chunk[0]?.label ?? ""} - ${chunk[chunk.length - 1]?.label ?? ""}`,
      netTotal: chunk.reduce((s, p) => s + p.netTotal, 0),
      count: chunk.reduce((s, p) => s + p.count, 0),
    });
  }
  return out;
}

// กราฟแนวโน้มยอดใบกำกับภาษี (AR+IV) 12 เดือนล่าสุด — ไม่ขึ้นกับตัวกรองช่วงเวลาที่เลือกไว้ด้านบน
// Trailing-12-month tax-invoice (AR+IV) trend — always fixed, unaffected by the page's date filter.
export function ArTrendChart({ trend }: { trend: ArDashboardTrendPoint[] }) {
  const { t } = useI18n();
  const [grouping, setGrouping] = useState<TrendGrouping>("monthly");
  const data = grouping === "monthly" ? trend : toQuarterly(trend);
  const hasData = data.some((d) => d.netTotal > 0);
  return (
    <ChartCard
      title={t("accountingDashboard.chart.trend.title")}
      sub={t("accountingDashboard.chart.trend.sub")}
      className="xl:col-span-2"
      actions={
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {(["monthly", "quarterly"] as TrendGrouping[]).map((g) => (
            <button key={g} onClick={() => setGrouping(g)}
              className={`px-2 py-1 text-[10px] rounded-md font-medium transition-all ${grouping === g ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {g === "monthly" ? t("accountingDashboard.chart.trend.monthly") : t("accountingDashboard.chart.trend.quarterly")}
            </button>
          ))}
        </div>
      }
    >
      {!hasData ? <EmptyNote>{t("accountingDashboard.msg.noDataInPeriod")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="arTrendGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.3} /><stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" />
            <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} minTickGap={16} />
            <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Area type="monotone" dataKey="netTotal" name={t("accountingDashboard.chart.trend.seriesNetTotal")} stroke="#c9a84c" strokeWidth={2} fill="url(#arTrendGrad)" dot={false} activeDot={{ r: 4, fill: "#c9a84c" }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// โดนัทสัดส่วนประเภทเอกสารที่ออกในช่วงที่เลือก พร้อมตัวเลขกำกับแต่ละประเภท
// Donut of documents issued within the selected period, by type, with a numeric legend list.
export function DocTypeBreakdownChart({ data }: { data: ArDashboardDocTypeStat[] }) {
  const { t } = useI18n();
  const total = data.reduce((s, d) => s + d.count, 0);
  const docsUnit = t("accountingDashboard.unit.docs");
  return (
    <ChartCard title={t("accountingDashboard.chart.docTypeBreakdown.title")} sub={t("accountingDashboard.sub.selectedPeriod")}>
      {total === 0 ? <EmptyNote>{t("accountingDashboard.msg.noDataInPeriod")}</EmptyNote> : (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="50%" height={160}>
            <PieChart>
              <Pie data={data.filter((d) => d.count > 0)} dataKey="count" nameKey="docType" innerRadius={40} outerRadius={70} paddingAngle={2}>
                {data.filter((d) => d.count > 0).map((d) => <Cell key={d.docType} fill={DOC_TYPE_COLORS[d.docType]} />)}
              </Pie>
              <Tooltip content={<SimpleTooltip formatter={(v) => `${v} ${docsUnit}`} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {data.map((d) => (
              <div key={d.docType} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOC_TYPE_COLORS[d.docType] }} />
                  {t(DOC_TYPE_LABEL_KEY[d.docType])}
                </span>
                <span className="font-mono text-muted-foreground whitespace-nowrap">{d.count} {docsUnit} · {fmtShort(d.netTotal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// แท่งสรุปสถานะการวางบิลของทุกงวดที่เคยเปิด — สแนปช็อตปัจจุบัน ไม่ขึ้นกับตัวกรองช่วงเวลา
// Bar summary of every opened milestone's billing status — a current snapshot, unfiltered by date.
export function BillingFunnelChart({ data }: { data: ArDashboardBillingFunnelStat[] }) {
  const { t } = useI18n();
  const total = data.reduce((s, d) => s + d.count, 0);
  const chartData = data.map((d) => ({ ...d, label: t(BILLING_STATUS_LABEL_KEY[d.status]) }));
  const periodsUnit = t("accountingDashboard.unit.periods");
  return (
    <ChartCard title={t("accountingDashboard.chart.billingFunnel.title")} sub={t("accountingDashboard.chart.billingFunnel.sub")}>
      {total === 0 ? <EmptyNote>{t("accountingDashboard.chart.billingFunnel.empty")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
            <Tooltip content={<SimpleTooltip formatter={(v) => `${v} ${periodsUnit}`} />} />
            <Bar dataKey="count" name={t("accountingDashboard.chart.billingFunnel.seriesCount")} radius={[4, 4, 0, 0]}>
              {chartData.map((d) => <Cell key={d.status} fill={FUNNEL_COLORS[d.status]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// แท่งสรุปยอดค้างชำระตามช่วงอายุหนี้ — สแนปช็อตปัจจุบัน ไม่ขึ้นกับตัวกรองช่วงเวลา
// Bar summary of outstanding balance by aging bucket — a current snapshot, unfiltered by date.
export function AgingChart({ buckets }: { buckets: ArAgingBucket[] }) {
  const { t } = useI18n();
  const totalAmount = buckets.reduce((s, b) => s + b.amount, 0);
  // เซิร์ฟเวอร์ส่ง label เป็นข้อความไทยล้วนมากับ key — แปลใหม่ที่นี่แทนใช้ b.label ตรงๆ เพื่อให้กราฟนี้
  // เปลี่ยนภาษาได้ด้วย ดู AGING_BUCKET_LABEL_KEY ใน accountingDashboard.ts
  // The server sends `label` as plain Thai alongside `key` — re-translate here instead of using
  // b.label directly, so this chart's axis labels switch language too.
  const chartData = buckets.map((b) => ({ ...b, label: t(AGING_BUCKET_LABEL_KEY[b.key]) }));
  return (
    <ChartCard title={t("accountingDashboard.chart.aging.title")} sub={t("accountingDashboard.chart.aging.sub")}>
      {totalAmount === 0 ? <EmptyNote>{t("accountingDashboard.msg.noOutstanding")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(11,29,58,0.07)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50} />
            <YAxis tick={{ fill: "#5a7299", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
            <Tooltip content={<SimpleTooltip formatter={fmtShort} />} />
            <Bar dataKey="amount" name={t("accountingDashboard.chart.aging.seriesOutstanding")} radius={[4, 4, 0, 0]}>
              {chartData.map((b) => <Cell key={b.key} fill={AGING_BUCKET_COLORS[b.key]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
