import { useState, type ReactNode } from "react";
import {
  BarChart, Bar, Cell, LabelList,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import type {
  ArDashboardTrendPoint, ArDashboardDocTypeStat, ArDashboardBillingFunnelStat, ArAgingBucket,
} from "../../lib/accountingDashboard";
import { AGING_BUCKET_LABEL_KEY } from "../../lib/accountingDashboard";
import { AGING_RAMP } from "./accountingFormat";
import { DOC_TYPE_LABEL_KEY, BILLING_STATUS_LABEL_KEY } from "../../lib/accounting";
import { fmtShort } from "../dashboard/format";
import { useI18n } from "../../lib/i18n";
import { displayYear2 } from "../../lib/displayDate";

// กราฟสำหรับแดชบอร์ดบัญชี (เพิ่ม 2026-08-18) — ดีไซน์ใหม่ 2026-09-30: แท่งโทนน้ำเงินชุดเดียวทั้งหน้า
// ตัวเลขทุกตัวเหมือนเดิม (ความหมาย/ตัวกรอง/สูตรไม่เปลี่ยน — เจ้าของสั่งให้เปลี่ยนแค่หน้าตา)
// Charts for the Accounting Dashboard — restyled only; every figure keeps its meaning.

const AXIS_TICK = { fill: "#5f7293", fontSize: 12 };
const GRID_STROKE = "#eef1f6";
const BAR_LIGHT = "#8fb3e3";
const BAR_STRONG = "#1a5fb4";

interface TooltipEntry { name: string; value: number; color: string }
function SimpleTooltip({ active, payload, label, formatter }: { active?: boolean; payload?: TooltipEntry[]; label?: string; formatter: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg px-3 py-2 shadow-[0_12px_28px_-8px_rgba(11,29,58,0.22)]">
      <p className="text-muted-foreground text-xs mb-0.5">{label}</p>
      {payload.map((p, i) => <p key={i} className="text-xs font-semibold tabular-nums text-foreground">{p.name}: {formatter(p.value)}</p>)}
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground text-center py-10">{children}</p>;
}

/** การ์ดหัวข้อของแดชบอร์ดบัญชี — หัว (ชื่อ 16/600 · ป้ายเล็ก · คำอธิบาย) คั่นเส้นบาง ปุ่มเสริมชิดขวา */
export function DashCard({ title, chip, sub, actions, children, bodyClassName = "px-6 py-5", className = "" }: {
  title: ReactNode;
  chip?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={`bg-card border border-border rounded-xl flex flex-col min-w-0 overflow-hidden ${className}`}>
      <div className="px-6 py-4 border-b border-[#eef1f6] flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {chip && <span className="h-5 px-2 rounded-full bg-[#eef1f6] text-[#3d5173] text-xs font-medium inline-flex items-center">{chip}</span>}
          </div>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {actions}
      </div>
      <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

type TrendGrouping = "monthly" | "quarterly";

// รวมจุดข้อมูลรายเดือนเป็นรายไตรมาสตามปฏิทินจริง (ม.ค.-มี.ค. = Q1 ฯลฯ)
// เดิมตัดทีละ 3 จุดจากต้น array ซึ่งหน้าต่าง 12 เดือนย้อนหลังไม่ได้เริ่มที่เดือน ม.ค. กลุ่มที่ได้จึงเป็น
// "สามเดือนติดกัน" เฉย ๆ ไม่ใช่ไตรมาสตามที่ป้ายปุ่มบอก — บัญชียื่นภาษี/ปิดงบเป็นรายไตรมาสปฏิทิน
// Buckets monthly points into REAL calendar quarters (Q1 = Jan-Mar, ...). The trailing-12-month
// window doesn't start in January, so slicing it in fixed 3s produced arbitrary 3-month groups,
// not the quarters the toggle label promises.
function toQuarterly(monthly: ArDashboardTrendPoint[]): { label: string; netTotal: number; count: number }[] {
  const byQuarter = new Map<string, { label: string; netTotal: number; count: number }>();
  for (const p of monthly) {
    const [y, m] = p.month.split("-").map(Number);
    if (!y || !m) continue;
    const quarter = Math.floor((m - 1) / 3) + 1;
    const key = `${y}-Q${quarter}`;
    const bucket = byQuarter.get(key) ?? { label: `Q${quarter}/${displayYear2(y)}`, netTotal: 0, count: 0 };
    bucket.netTotal += p.netTotal;
    bucket.count += p.count;
    byQuarter.set(key, bucket);
  }
  // Map preserves insertion order and `monthly` is already oldest-first, so the result is too.
  return [...byQuarter.values()];
}

const shortLabel = (v: unknown) => (typeof v === "number" && v > 0 ? fmtShort(v) : "");

// กราฟแนวโน้มยอดใบกำกับภาษี (AR+IV) 12 เดือนล่าสุด — ไม่ขึ้นกับตัวกรองช่วงเวลาที่เลือกไว้ด้านบน
// Trailing-12-month tax-invoice (AR+IV) trend — always fixed, unaffected by the page's date filter.
export function ArTrendChart({ trend }: { trend: ArDashboardTrendPoint[] }) {
  const { t } = useI18n();
  const [grouping, setGrouping] = useState<TrendGrouping>("monthly");
  const data = grouping === "monthly" ? trend : toQuarterly(trend);
  const hasData = data.some((d) => d.netTotal > 0);
  return (
    <DashCard
      title={t("accountingDashboard.chart.trend.title")}
      chip={t("accountingDashboard.chart.trend.seriesNetTotal")}
      sub={t("accountingDashboard.chart.trend.sub")}
      actions={
        <div role="group" aria-label={t("accountingDashboard.chart.trend.groupingLabel")} className="flex bg-[#eef1f6] rounded-lg p-[3px]">
          {(["monthly", "quarterly"] as TrendGrouping[]).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={grouping === g}
              onClick={() => setGrouping(g)}
              className={`h-[30px] px-3 rounded-md text-[13px] transition-colors ${grouping === g ? "bg-white text-foreground font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)]" : "text-muted-foreground font-medium hover:text-foreground"}`}
            >
              {g === "monthly" ? t("accountingDashboard.chart.trend.monthly") : t("accountingDashboard.chart.trend.quarterly")}
            </button>
          ))}
        </div>
      }
    >
      {!hasData ? <EmptyNote>{t("accountingDashboard.msg.noDataInPeriod")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 22, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: "#c3ccda" }} tickLine={false} minTickGap={8} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={fmtShort} width={56} />
            <Tooltip cursor={{ fill: "rgba(26,95,180,0.06)" }} content={<SimpleTooltip formatter={fmtShort} />} />
            <Bar dataKey="netTotal" name={t("accountingDashboard.chart.trend.seriesNetTotal")} radius={[4, 4, 0, 0]} maxBarSize={grouping === "monthly" ? 40 : 96}>
              {data.map((d, i) => <Cell key={d.label} fill={i === data.length - 1 ? BAR_STRONG : BAR_LIGHT} />)}
              <LabelList dataKey="netTotal" position="top" formatter={shortLabel} style={{ fill: "#5f7293", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </DashCard>
  );
}

// สัดส่วนประเภทเอกสารที่ออกในช่วงที่เลือก — แถบแนวนอน (ความยาว = จำนวนฉบับ) พร้อมจำนวนและยอดของแต่ละประเภท
// Documents issued within the selected period, by type — horizontal bars sized by count, with count and total.
export function DocTypeBreakdownChart({ data }: { data: ArDashboardDocTypeStat[] }) {
  const { t } = useI18n();
  const total = data.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...data.map((d) => d.count));
  const docsUnit = t("accountingDashboard.unit.docs");
  return (
    <DashCard title={t("accountingDashboard.chart.docTypeBreakdown.title")} sub={`${t("accountingDashboard.sub.selectedPeriod")} · ${t("accountingDashboard.chart.docTypeBreakdown.barNote")}`} bodyClassName="px-5 py-4">
      {total === 0 ? <EmptyNote>{t("accountingDashboard.msg.noDataInPeriod")}</EmptyNote> : (
        <div className="h-full flex flex-col justify-between gap-4">
          {data.map((d) => (
            <div key={d.docType} className="flex flex-col gap-1.5" title={`${t(DOC_TYPE_LABEL_KEY[d.docType])} ${d.count} ${docsUnit} · ${fmtShort(d.netTotal)}`}>
              <div className="flex items-baseline gap-2">
                <span className="w-[22px] font-mono text-xs font-semibold text-[#3d5173]">{d.docType}</span>
                <span className="flex-1 min-w-0 truncate text-[13px] text-[#26395a]">{t(DOC_TYPE_LABEL_KEY[d.docType])}</span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground whitespace-nowrap">{d.count} {docsUnit}</span>
                <span className="w-[72px] text-right text-xs tabular-nums text-muted-foreground whitespace-nowrap">{fmtShort(d.netTotal)}</span>
              </div>
              <div className="h-2 rounded-full bg-[#eef1f6] overflow-hidden">
                <div className="h-2 rounded-full bg-[#1a5fb4]" style={{ width: `${(d.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </DashCard>
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
    <DashCard title={t("accountingDashboard.chart.billingFunnel.title")} sub={t("accountingDashboard.chart.billingFunnel.sub")} bodyClassName="px-5 pt-4 pb-4">
      {total === 0 ? <EmptyNote>{t("accountingDashboard.chart.billingFunnel.empty")}</EmptyNote> : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 22, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: "#c3ccda" }} tickLine={false} interval={0} />
              <YAxis hide allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(26,95,180,0.06)" }} content={<SimpleTooltip formatter={(v) => `${v} ${periodsUnit}`} />} />
              <Bar dataKey="count" name={t("accountingDashboard.chart.billingFunnel.seriesCount")} fill="#4f86cf" radius={[4, 4, 0, 0]} maxBarSize={52}>
                <LabelList dataKey="count" position="top" style={{ fill: "#0b1d3a", fontSize: 13, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="pt-2 text-xs text-muted-foreground text-center">{t("accountingDashboard.unitNote").replace("{unit}", periodsUnit)}</p>
        </>
      )}
    </DashCard>
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
    <DashCard title={t("accountingDashboard.chart.aging.title")} sub={t("accountingDashboard.chart.aging.sub")} bodyClassName="px-5 pt-4 pb-4">
      {totalAmount === 0 ? <EmptyNote>{t("accountingDashboard.msg.noOutstanding")}</EmptyNote> : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 22, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="label" tick={{ ...AXIS_TICK, fontSize: 11 }} axisLine={{ stroke: "#c3ccda" }} tickLine={false} interval={0} angle={-12} textAnchor="end" height={54} />
            <YAxis hide />
            <Tooltip cursor={{ fill: "rgba(26,95,180,0.06)" }} content={<SimpleTooltip formatter={fmtShort} />} />
            <Bar dataKey="amount" name={t("accountingDashboard.chart.aging.seriesOutstanding")} radius={[4, 4, 0, 0]} maxBarSize={48}>
              {chartData.map((b) => <Cell key={b.key} fill={AGING_RAMP[b.key]} />)}
              <LabelList dataKey="amount" position="top" formatter={shortLabel} style={{ fill: "#0b1d3a", fontSize: 12, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </DashCard>
  );
}
