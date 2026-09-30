import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Info, UserRound } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, PieChart, Pie } from "recharts";
import { useI18n } from "../../../lib/i18n";
import { btn } from "../../../components/ui/styles";
import { ChartCard, ScopeTag } from "../ChartCard";
import { fmtDateShort } from "../format";
import { DepartmentTabSkeleton, ErrorState } from "../DashboardStates";
import type { DashboardData } from "../useDashboardData";
import { fmtCount, daysBetweenIso, fmtMonthShort } from "./countFormat";
import { BAR, CHART_SEQUENCE, TD, TD_MONO, TH, TR } from "./dashboardTokens";
import { DEPARTMENT_META } from "./tabMeta";
import type { DepartmentKey } from "../../../lib/dashboardTabs";
import type { BlockScope, DepartmentDashboardResponse, DepartmentDashboardView, DueItem } from "../../../lib/departmentDashboard";

/**
 * ชิ้นส่วนที่แท็บแดชบอร์ดทุกแท็บใช้ร่วมกัน (2026-09-14, ปรับหน้าตาตามดีไซน์ใหม่ 2026-09-30)
 * — การ์ด KPI (ป้ายขอบเขต · ตัวเลข 28px · ภาพเล็กหนึ่งอย่าง) · กราฟแท่ง · อันดับแถบแนวนอน · โดนัท · แถบสัดส่วน · ป้าย
 * ให้ทุกแท็บหน้าตาและภาษาเดียวกัน · สีทั้งหมดมาจาก dashboardTokens.ts ห้ามเพิ่มสีใหม่ที่นี่
 */

const AXIS_TICK = { fill: "#8a97ad", fontSize: 12, fontFamily: "Inter, 'Noto Sans Thai', sans-serif" } as const;
const X_TICK = { fill: "#5f7293", fontSize: 12, fontFamily: "Inter, 'Noto Sans Thai', sans-serif" } as const;
const GRID = "#eef1f6";

export interface DepartmentTabProps {
  result: DashboardData<DepartmentDashboardResponse>;
  onRetry: () => void;
  onNavigatePage: (navKey: string) => void;
}

/**
 * กรอบของแท็บแผนก — จัดการโหลดครั้งแรก / โหลดพัง ให้ทุกแท็บเหมือนกัน แล้วส่งคำตอบของ view นั้นให้ตัวแท็บ
 * วาดเฉพาะเนื้อหา · `requireBlock` = แท็บแผนกเดียว บล็อกหาย (ไม่มีสิทธิ์/คำนวณพัง) แสดงหน้าพัง
 */
export function DepartmentViewFrame({ view, result, onRetry, children }: {
  view: DepartmentDashboardView;
  result: DashboardData<DepartmentDashboardResponse>;
  onRetry: () => void;
  children: (response: DepartmentDashboardResponse) => ReactNode;
}) {
  const response = result.data?.view === view ? result.data : null;
  if (!response) return result.error ? <ErrorState onRetry={onRetry} /> : <DepartmentTabSkeleton />;
  return <>{children(response)}</>;
}

/** บรรทัดอธิบายใต้แถบแท็บ — บอกว่าตัวเลขไหนขึ้นกับช่วงวันที่ และบอกถ้าบางตัวนับเฉพาะของผู้ใช้เอง */
export function TabIntro({ scope, children }: { scope: BlockScope; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground -mt-2">
      <span className="flex items-start gap-2">
        <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>{children ? <>{children} · </> : null}{t("dashboard.dept.snapshotNote")}</span>
      </span>
      {scope === "own" && (
        <span className="flex items-center gap-1.5">
          <UserRound size={14} className="text-[#866d28] flex-shrink-0" /> {t("dashboard.dept.ownScope")}
        </span>
      )}
    </div>
  );
}

// ── โครงหน้า ────────────────────────────────────────────────────────────────

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">{children}</div>;
}

/** แถวหลัก + การ์ดข้างกว้าง 360px — จอเล็กกว่า lg ซ้อนเป็นคอลัมน์เดียว · ไม่มี `side` = กินเต็มแถว */
export function SplitRow({ main, side }: { main: ReactNode; side?: ReactNode }) {
  if (!side) return main ? <div className="min-w-0">{main}</div> : null;
  if (!main) return <div className="min-w-0">{side}</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="min-w-0 flex flex-col [&>*]:flex-1">{main}</div>
      <div className="min-w-0 flex flex-col [&>*]:flex-1">{side}</div>
    </div>
  );
}

// ── การ์ด KPI ────────────────────────────────────────────────────────────────

export interface Segment { key: string; label: string; value: number; color: string; sub?: string }

/**
 * การ์ด KPI (ดีไซน์ใหม่) — ชื่อ + ขอบเขต ("ช่วงที่เลือก" เป็นป้าย / "ณ ปัจจุบัน" เป็นตัวอักษร) · ตัวเลข 28px + หน่วย
 * · ภาพเล็กหนึ่งอย่าง (เส้นแนวโน้ม / แถบสัดส่วน / แถบความคืบหน้า) · บรรทัดอธิบายชิดล่าง
 * `tone` ทาสีตัวเลขเฉพาะเมื่อมีของค้างจริง ผู้เรียกต้องส่งมาเฉพาะตอนค่ามากกว่าศูนย์
 * · เส้นแนวโน้มใส่ได้เฉพาะตัวเลขที่มีประวัติจริง (DASHBOARD_DESIGN.md ข้อ 5)
 */
export function KpiCard({ label, value, unit, scope, tone, caption, help, sparkline, segments, progress, badge }: {
  label: string;
  value: string;
  unit?: string;
  /** "period" = ป้าย "ช่วงที่เลือก" · ข้อความอื่น = ตัวอักษรเทาชิดขวา (เช่น "ณ ปัจจุบัน") */
  scope?: "period" | string;
  tone?: "alert" | "warn";
  caption?: ReactNode;
  help?: string;
  sparkline?: { values: number[]; color?: string };
  segments?: Segment[];
  progress?: { value: number; max: number; color?: string; label?: string };
  /** ป้ายสถานะแทนบรรทัดอธิบาย (เช่น "สินค้าถึงจุดเตือน 7 รายการ") */
  badge?: ReactNode;
}) {
  const { t } = useI18n();
  const toneClass = tone === "alert" ? "text-[#b93636]" : tone === "warn" ? "text-[#8a5a00]" : "text-foreground";
  return (
    <section className="bg-card border border-border rounded-xl px-5 py-[18px] flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2 min-h-6">
        <span className="flex-1 min-w-0 text-[13px] font-medium text-[#3d5173] truncate" title={label}>{label}</span>
        {scope === "period"
          ? <ScopeTag>{t("dashboard.dept.periodTag")}</ScopeTag>
          : scope ? <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{scope}</span> : null}
        {help && <MetricInfo label={label} text={help} />}
      </div>
      <div className="flex items-end gap-3 min-h-9">
        <span className={`flex-1 min-w-0 text-[28px] leading-tight font-semibold tabular-nums truncate ${toneClass}`}>
          {value}
          {unit && <span className="text-sm font-medium text-muted-foreground"> {unit}</span>}
        </span>
        {sparkline && <Sparkline values={sparkline.values} color={sparkline.color ?? BAR.latest} />}
      </div>
      {segments && <SegmentBar segments={segments} legend={false} />}
      {progress && <ProgressBar {...progress} />}
      <div className="flex-1" />
      {badge}
      {segments ? <SegmentLegend segments={segments} /> : caption ? <div className="text-xs text-muted-foreground">{caption}</div> : null}
    </section>
  );
}

/** ตัวเลขเน้นในบรรทัดอธิบาย — สีเข้ม ตัวหนา ตัวเลขเท่ากัน */
export function Num({ children, tone }: { children: ReactNode; tone?: "alert" | "warn" }) {
  return <span className={`font-semibold tabular-nums ${tone === "alert" ? "text-[#b93636]" : tone === "warn" ? "text-[#8a5a00]" : "text-foreground"}`}>{children}</span>;
}

/**
 * ปุ่ม (i) คำอธิบายตัวชี้วัด — กดแล้วเปิดกล่องเล็กสีขาวใต้ปุ่ม (ไม่หรี่พื้นหลัง) · กดนอกกล่อง/Esc ปิด
 * ตามบอร์ด Pop-DashboardMetricInfo
 */
export function MetricInfo({ label, text }: { label: string; text: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const aria = t("dashboard.metricInfo.aria").replace("{label}", label);
  return (
    <span ref={rootRef} className="relative inline-flex flex-shrink-0">
      <button
        type="button"
        aria-label={aria}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`w-6 h-6 rounded-md inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 ${open ? "bg-[#e8f0fb] text-[#1a5fb4]" : "text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground"}`}
      >
        <Info size={15} />
      </button>
      {open && (
        <span role="dialog" aria-label={aria} className="absolute z-30 top-full right-[-40px] mt-2.5 w-[320px] max-w-[80vw] bg-white border border-border rounded-xl shadow-[0_12px_32px_-8px_rgba(11,29,58,0.28)] px-4 pt-3.5 pb-4 flex flex-col gap-1.5 text-left">
          <span aria-hidden="true" className="absolute -top-[6px] right-[47px] w-2.5 h-2.5 bg-white border-l border-t border-border rotate-45" />
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="text-[13px] leading-relaxed text-[#3d5173] font-normal whitespace-normal">{text}</span>
        </span>
      )}
    </span>
  );
}

/** เส้นแนวโน้มเล็กในการ์ด — ไม่มีค่าใดมากกว่าศูนย์ = ไม่วาด (ไม่ทำเส้นแบนหลอกตา) */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2 || !values.some((v) => v > 0)) return null;
  const w = 96;
  const h = 32;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="flex-shrink-0 mb-1" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill={color} stroke="#ffffff" strokeWidth={1.5} />
    </svg>
  );
}

/** แถบสัดส่วนสูง 8px · คำอธิบายสีเป็นข้อความเสมอ (ห้ามพึ่งสีอย่างเดียว) */
export function SegmentBar({ segments, height = 8, legend = true }: { segments: Segment[]; height?: number; legend?: boolean }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className="space-y-2">
      <div className="flex gap-0.5 overflow-hidden rounded-full mt-0.5" style={{ height }} role="img" aria-label={segments.map((s) => `${s.label} ${fmtCount(s.value)}`).join(", ")}>
        {total === 0
          ? <span className="flex-1 bg-[#eef1f6]" />
          : visible.map((s) => <span key={s.key} title={`${s.label} ${fmtCount(s.value)}`} style={{ flexGrow: s.value, background: s.color }} />)}
      </div>
      {legend && <SegmentLegend segments={segments} />}
    </div>
  );
}

export function SegmentLegend({ segments }: { segments: Segment[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
      {segments.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
          {s.label} <Num>{fmtCount(s.value)}</Num>
        </span>
      ))}
    </div>
  );
}

export function ProgressBar({ value, max, color = "#1b7f4f", label, height = 8 }: { value: number; max: number; color?: string; label?: string; height?: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="rounded-full bg-[#eef1f6] overflow-hidden mt-0.5" style={{ height }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ── กราฟ ─────────────────────────────────────────────────────────────────────

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground text-center py-10">{children}</p>;
}

interface TooltipEntry { name: string; value: number; color: string }
function BarTooltip({ active, payload, label, format }: { active?: boolean; payload?: TooltipEntry[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg px-3 py-2 shadow-[0_12px_32px_-8px_rgba(11,29,58,0.28)]">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-[13px] text-foreground flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />{p.name} <span className="font-semibold tabular-nums">{format(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export interface MonthSeries { key: string; name: string; color?: string }

/** คำอธิบายสีของกราฟหลายชุด — วางบนหัวการ์ด (ChartCard `actions`) */
export function SeriesLegend({ series }: { series: MonthSeries[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#3d5173]">
      {series.map((s, i) => (
        <span key={s.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color ?? CHART_SEQUENCE[i % CHART_SEQUENCE.length] }} /> {s.name}
        </span>
      ))}
    </div>
  );
}

/**
 * กราฟแท่งตามช่วงเวลา — ชุดข้อมูลเดียว: แท่งเก่าสีอ่อน แท่งล่าสุด (ช่วงปัจจุบัน) สีเข้ม มีป้ายค่าทุกแท่ง
 * · หลายชุด: แท่งคู่ตามชุดสีกราฟ (คำอธิบายสีใส่ที่หัวการ์ดด้วย `SeriesLegend`)
 * `rows` เรียงเก่าสุดก่อน · ป้ายแกน X จาก `month` ("YYYY-MM") หรือ `labelOf`
 */
export function MonthlyBars<T extends { month?: string }>({ rows, series, format, axisFormat, height = 220, empty, labelOf }: {
  rows: T[];
  series: MonthSeries[];
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  height?: number;
  empty: string;
  labelOf?: (row: T) => string;
}) {
  const { lang } = useI18n();
  const data = rows.map((r) => ({ ...r, label: labelOf ? labelOf(r) : fmtMonthShort(r.month ?? "", lang) })) as (T & { label: string })[];
  const valueOf = (row: T, key: string) => Number((row as unknown as Record<string, unknown>)[key] ?? 0);
  const hasData = rows.some((r) => series.some((s) => valueOf(r, s.key) > 0));
  if (!hasData) return <EmptyNote>{empty}</EmptyNote>;

  const single = series.length === 1;
  const lastIndex = rows.length - 1;
  const showLabels = single && rows.length <= 14;
  const lastLabel = data[lastIndex]?.label;

  return (
    <div className="relative flex-1" style={{ minHeight: height }}>
      {/* วางแบบ absolute เพื่อให้ ResponsiveContainer วัดขนาดได้แน่นอนในการ์ดที่ถูกยืด */}
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap={single ? "30%" : "24%"}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="label" axisLine={{ stroke: "#c3ccda" }} tickLine={false} interval={rows.length > 14 ? "preserveStartEnd" : 0} minTickGap={4}
              tick={(props: { x?: number; y?: number; payload?: { value?: string } }) => (
                <text x={props.x} y={(props.y ?? 0) + 12} textAnchor="middle" fontSize={12} fontFamily={X_TICK.fontFamily} fill={props.payload?.value === lastLabel ? "#0b1d3a" : X_TICK.fill} fontWeight={props.payload?.value === lastLabel ? 600 : 400}>
                  {props.payload?.value}
                </text>
              )}
            />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={axisFormat ?? format} width={48} allowDecimals={false} tickCount={4} />
            <Tooltip cursor={{ fill: "rgba(11,29,58,0.04)" }} content={<BarTooltip format={format} />} />
            {series.map((s, si) => {
              const color = s.color ?? CHART_SEQUENCE[si % CHART_SEQUENCE.length];
              return (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={single ? BAR.muted : color} radius={[4, 4, 0, 0]} maxBarSize={single ? 36 : 16} isAnimationActive={false}>
                  {single && data.map((_, i) => <Cell key={i} fill={i === lastIndex ? BAR.latest : BAR.muted} />)}
                  {showLabels && (
                    <LabelList
                      dataKey={s.key}
                      content={(props) => {
                        const { x, y, width, value, index } = props as { x?: number; y?: number; width?: number; value?: number; index?: number };
                        if (!value) return null;
                        const last = index === lastIndex;
                        return (
                          <text x={(x ?? 0) + (width ?? 0) / 2} y={(y ?? 0) - 6} textAnchor="middle" fontSize={11.5} fontWeight={last ? 600 : 400} fontFamily={X_TICK.fontFamily} fill={last ? "#0b1d3a" : "#5f7293"}>
                            {(axisFormat ?? format)(value)}
                          </text>
                        );
                      }}
                    />
                  )}
                </Bar>
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface RankRow { key: string; label: string; value: number; display: string; sub?: string }

/** อันดับแถบแนวนอน — สีเดียวทั้งชุด สูงสุด 6 แถว */
export function RankBars({ rows, color = BAR.rank, empty, limit = 6 }: { rows: RankRow[]; color?: string; empty: string; limit?: number }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(0, ...shown.map((r) => r.value));
  if (shown.length === 0 || max === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ol className="flex flex-col gap-[11px]">
      {shown.map((r) => (
        <li key={r.key} className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-baseline gap-2 text-[13px]">
            <span className="flex-1 min-w-0 text-[#26395a] truncate" title={r.label}>{r.label}{r.sub && <span className="text-[#8a97ad]"> · {r.sub}</span>}</span>
            <span className="font-semibold tabular-nums text-foreground whitespace-nowrap">{r.display}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#eef1f6] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** โดนัท 132px + จำนวนรวมตรงกลาง + คำอธิบายสีพร้อมจำนวนด้านข้างเสมอ */
export function Donut({ slices, unit, empty }: { slices: Segment[]; unit: string; empty: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyNote>{empty}</EmptyNote>;
  const visible = slices.filter((s) => s.value > 0);
  return (
    <div className="flex items-center gap-[18px] flex-wrap sm:flex-nowrap">
      <div className="relative w-[132px] h-[132px] flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={visible} dataKey="value" nameKey="label" innerRadius={48} outerRadius={64} paddingAngle={visible.length > 1 ? 2 : 0} strokeWidth={0} startAngle={90} endAngle={-270} isAnimationActive={false}>
              {visible.map((s) => <Cell key={s.key} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none leading-tight">
          <span className="text-[22px] font-semibold tabular-nums text-foreground">{fmtCount(total)}</span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <ul className="flex-1 min-w-0 flex flex-col gap-2.5">
        {slices.map((s) => (
          <li key={s.key} className="flex items-start gap-2">
            <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0 mt-[5px]" style={{ background: s.color }} />
            <span className="flex-1 min-w-0 flex flex-col leading-snug">
              <span className="text-[13px] text-[#26395a]">{s.label}</span>
              {s.sub && <span className="text-xs text-muted-foreground">{s.sub}</span>}
            </span>
            <span className="font-semibold tabular-nums text-foreground">{fmtCount(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ปุ่มแบ่งส่วน (รายสัปดาห์ / รายเดือน / …) บนหัวการ์ด */
export function Segmented<K extends string>({ options, value, onChange, ariaLabel }: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex items-center gap-0.5 p-[3px] rounded-lg bg-[#eef1f6] flex-wrap">
      {options.map((o) => {
        const sel = o.key === value;
        return (
          <button
            key={o.key} type="button" aria-pressed={sel} onClick={() => onChange(o.key)}
            className={`h-[30px] px-3 rounded-md text-[13px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 ${sel ? "bg-white text-foreground font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)]" : "text-muted-foreground font-medium hover:text-foreground"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── ป้าย รายการ ตาราง ────────────────────────────────────────────────────────

const PILL_TONES = {
  alert: "bg-[#fcebeb] text-[#b93636]",
  warn: "bg-[#fdf3e0] text-[#8a5a00]",
  gold: "bg-[#fdf3e0] text-[#8a5a00]",
  good: "bg-[#e6f4ec] text-[#1b7f4f]",
  info: "bg-[#e8f0fb] text-[#1a5fb4]",
  neutral: "bg-[#eef1f6] text-[#3d5173]",
} as const;
export type PillTone = keyof typeof PILL_TONES;

/** ป้ายแบบดีไซน์ใหม่: พื้นอ่อน ตัวเข้ม ไม่มีกรอบ */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`inline-flex items-center h-6 px-[9px] rounded-full text-xs font-semibold whitespace-nowrap ${PILL_TONES[tone]}`}>{children}</span>;
}

const DOT_TONES: Record<PillTone, string> = {
  alert: "#b93636", warn: "#d89614", gold: "#d89614", good: "#1b7f4f", info: "#1a5fb4", neutral: "#8a97ad",
};

/** ป้ายสถานะเอกสารพร้อมจุดสีนำหน้า (แบบ StatusBadge ของดีไซน์ใหม่) */
export function StatusChip({ tone, children, strike }: { tone: PillTone; children: ReactNode; strike?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${PILL_TONES[tone]} ${strike ? "line-through" : ""}`}>
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: DOT_TONES[tone] }} />
      {children}
    </span>
  );
}

/** ป้ายแผนกสีเทาในตาราง — ใช้ในแท็บรวมและรายการข้ามแผนก ให้รู้ว่าแถวนี้ของใคร */
export function DeptPill({ dept, outline }: { dept: DepartmentKey; outline?: boolean }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center rounded-md text-xs font-semibold text-[#3d5173] whitespace-nowrap ${outline ? "h-6 px-2.5 bg-white border border-border" : "h-[22px] px-2 bg-[#eef1f6]"}`}>
      {t(DEPARTMENT_META[dept].labelKey)}
    </span>
  );
}

/** ป้ายกำหนดส่งจากวันที่เทียบวันนี้ (เวลาไทย จากเซิร์ฟเวอร์) — เลย = แดง · วันนี้/ใน 7 วัน = ส้ม · ไกลกว่านั้น = เทา */
export function DueBadge({ date, today }: { date: string; today: string }) {
  const { t } = useI18n();
  if (!date) return <Pill tone="neutral">—</Pill>;
  const days = daysBetweenIso(today, date);
  if (days < 0) return <Pill tone="alert">{t("dashboard.dept.due.overdueDays").replace("{n}", String(-days))}</Pill>;
  if (days === 0) return <Pill tone="warn">{t("dashboard.dept.due.today")}</Pill>;
  return <Pill tone={days <= 3 ? "warn" : "neutral"}>{t("dashboard.dept.due.inDays").replace("{n}", String(days))}</Pill>;
}

/** หัวข้อส่วนย่อยในแท็บ (18/600) — เส้นคั่นด้านบนเมื่อ `divider` · ป้ายแผนกนำหน้าได้ */
export function SectionHeading({ title, note, depts, divider }: { title: string; note?: string; depts?: DepartmentKey[]; divider?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${divider ? "pt-5 border-t border-border" : ""}`}>
      <div className="flex flex-wrap items-center gap-2">
        {depts?.map((d) => <DeptPill key={d} dept={d} outline />)}
        <h2 className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
      </div>
      {note && <p className="text-[13px] text-muted-foreground">{note}</p>}
    </div>
  );
}

/** ปุ่มเล็กมุมขวาของการ์ด พาไปหน้ารายการของเอกสารชนิดนั้น */
export function OpenListButton({ label, onClick }: { label?: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={onClick} className={btn.secondarySm}>
      {label ?? t("dashboard.dept.openList")}<ChevronRight size={15} className="text-muted-foreground" />
    </button>
  );
}

/** ลิงก์ท้ายการ์ด (ตัวอักษรน้ำเงิน) — "ไปที่หน้าสต๊อก ›" */
export function CardFooterLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="px-3 pt-2 pb-3 border-t border-[#eef1f6] mt-auto">
      <button type="button" onClick={onClick} className="h-9 px-2.5 rounded-lg text-[#1a5fb4] text-sm font-medium inline-flex items-center gap-1.5 hover:bg-[#e8f0fb] transition-colors">
        {label}<ChevronRight size={15} />
      </button>
    </div>
  );
}

export { ChartCard };

export function CardTable({ title, sub, tag, actions, headers, empty, children, isEmpty }: {
  title: string;
  sub?: string;
  tag?: string;
  actions?: ReactNode;
  headers: { label: string; align?: "right" }[];
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <ChartCard title={title} sub={sub} tag={tag} actions={actions} flush className="h-full">
      {isEmpty ? (
        <p className="text-[13px] text-muted-foreground text-center py-10">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-border">
                {headers.map((h, i) => (
                  <th key={`${h.label}-${i}`} className={`${TH} ${h.align === "right" ? "text-right" : "text-left"}`}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}


/** ตาราง "ใกล้/เลยกำหนด" — `deptOf` ใส่คอลัมน์แผนก (แท็บรวม) */
export function DueListTable({ title, sub, rows, dateLabel, today, empty, actions, deptOf }: {
  title: string;
  sub: string;
  rows: DueItem[];
  dateLabel: string;
  today: string;
  empty: string;
  actions?: ReactNode;
  deptOf?: (row: DueItem) => DepartmentKey;
}) {
  const { t, lang } = useI18n();
  const headers = [
    { label: t("dashboard.dept.due.col.docNumber") },
    { label: t("dashboard.dept.due.col.party") },
    ...(deptOf ? [{ label: t("dashboard.dept.col.department") }] : []),
    { label: dateLabel },
    { label: "" },
  ];
  return (
    <CardTable title={title} sub={sub} actions={actions} empty={empty} isEmpty={rows.length === 0} headers={headers}>
      {rows.map((row) => (
        <tr key={row.id} className={TR}>
          <td className={TD_MONO}>{row.docNumber}</td>
          <td className={`${TD} font-medium max-w-[320px] truncate`} title={row.party}>{row.party || "—"}</td>
          {deptOf && <td className={TD}><DeptPill dept={deptOf(row)} /></td>}
          <td className={`${TD} text-[#3d5173] whitespace-nowrap`}>{row.date ? fmtDateShort(row.date, lang) : "—"}</td>
          <td className={`${TD} text-right`}><DueBadge date={row.date} today={today} /></td>
        </tr>
      ))}
    </CardTable>
  );
}

/** ป้ายสถานะของเครื่องอนุมัติร่วม — Draft/รออนุมัติ/อนุมัติแล้ว ตามดีไซน์ใหม่ */
export function SharedStatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === "PendingApproval") return <StatusChip tone="warn">{t("dashboard.dept.status.pending")}</StatusChip>;
  if (status === "Final") return <StatusChip tone="good">{t("dashboard.dept.status.final")}</StatusChip>;
  return <StatusChip tone="neutral">{t("dashboard.dept.status.draft")}</StatusChip>;
}
