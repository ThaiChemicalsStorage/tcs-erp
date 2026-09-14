import type { ReactNode } from "react";
import { UserRound, type LucideIcon } from "lucide-react";
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, PieChart, Pie } from "recharts";
import { useI18n } from "../../../lib/i18n";
import { MetricInfoTooltip } from "../../../components/MetricInfoTooltip";
import { ChartCard } from "../ChartCard";
import { fmtDateShort } from "../format";
import { DepartmentTabSkeleton, ErrorState } from "../DashboardStates";
import type { DashboardData } from "../useDashboardData";
import { fmtCount, daysBetweenIso, fmtMonthShort } from "./countFormat";
import { GOLD, SERIF, TD, TD_MONO, TR } from "./dashboardTokens";
import { DEPARTMENT_META } from "./tabMeta";
import type { DepartmentKey } from "../../../lib/dashboardTabs";
import type { BlockScope, DepartmentDashboardResponse, DepartmentDashboardView, DueItem } from "../../../lib/departmentDashboard";

/**
 * ชิ้นส่วนที่แท็บแดชบอร์ดทุกแท็บใช้ร่วมกัน (2026-09-14, ออกแบบใหม่ตาม docs/DASHBOARD_DESIGN.md ข้อ 4)
 * — การ์ด KPI พร้อมภาพเล็ก · กราฟแท่ง 12 เดือน · อันดับแถบแนวนอน · โดนัท · แถบสัดส่วน · ป้ายสถานะ
 * ให้ทุกแท็บหน้าตาและภาษาเดียวกัน · สีทั้งหมดมาจากข้อ 6 ของเอกสารนั้น ห้ามเพิ่มสีใหม่ที่นี่
 */

const AXIS_TICK = { fill: "#5a7299", fontSize: 11, fontFamily: "JetBrains Mono, Noto Sans Thai, monospace" } as const;
const GRID = "rgba(11,29,58,0.08)";

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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-2">
      {children}
      <span>{t("dashboard.dept.snapshotNote")}</span>
      {scope === "own" && (
        <span className="flex items-center gap-1">
          <UserRound size={12} className="text-[#c9a84c] flex-shrink-0" /> {t("dashboard.dept.ownScope")}
        </span>
      )}
    </div>
  );
}

// ── โครงหน้า ────────────────────────────────────────────────────────────────

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{children}</div>;
}

/** แถว 2 ต่อ 1 — จอเล็กกว่า lg ซ้อนเป็นคอลัมน์เดียว · ไม่มี `side` = กินเต็มแถว */
export function SplitRow({ main, side }: { main: ReactNode; side?: ReactNode }) {
  if (!side) return <div className="min-w-0">{main}</div>;
  if (!main) return <div className="min-w-0">{side}</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 min-w-0 flex flex-col [&>*]:flex-1">{main}</div>
      <div className="min-w-0 flex flex-col [&>*]:flex-1">{side}</div>
    </div>
  );
}

// ── การ์ด KPI ────────────────────────────────────────────────────────────────

export interface Segment { key: string; label: string; value: number; color: string }

/**
 * การ์ด KPI — ชิปไอคอน · ป้าย · ตัวเลขใหญ่ · ภาพเล็กหนึ่งอย่าง (เส้นแนวโน้ม / แถบสัดส่วน / แถบความคืบหน้า)
 * หรือบรรทัดอธิบาย · `tone` ทาสีตัวเลขเฉพาะเมื่อมีของค้างจริง ผู้เรียกต้องส่งมาเฉพาะตอนค่ามากกว่าศูนย์
 * · เส้นแนวโน้มใส่ได้เฉพาะตัวเลขที่มีประวัติจริง (DASHBOARD_DESIGN.md ข้อ 5)
 */
export function KpiCard({ icon: Icon, label, value, chip, tone, caption, help, sparkline, segments, progress }: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** สีของชิปไอคอน — สีแผนก หรือสีสถานะเมื่อตัวเลขเป็นสถานะ */
  chip: string;
  tone?: "alert" | "warn";
  caption?: ReactNode;
  help?: string;
  sparkline?: { values: number[]; color: string };
  segments?: Segment[];
  progress?: { value: number; max: number; color: string };
}) {
  const toneClass = tone === "alert" ? "text-[#d22626]" : tone === "warn" ? "text-[#a75d1a]" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-xl p-[18px] flex flex-col gap-2.5 min-w-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${chip}18` }}>
          <Icon size={16} style={{ color: chip }} />
        </div>
        <p className="text-sm text-muted-foreground truncate flex-1" title={label}>{label}</p>
        {help && <MetricInfoTooltip label={label} text={help} />}
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className={`text-2xl font-semibold font-mono leading-none tracking-tight ${toneClass}`}>{value}</p>
        {sparkline && <Sparkline values={sparkline.values} color={sparkline.color} />}
      </div>
      {segments && <SegmentBar segments={segments} />}
      {progress && <ProgressBar {...progress} />}
      {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

/** เส้นแนวโน้มเล็กในการ์ด — ไม่มีค่าใดมากกว่าศูนย์ = ไม่วาด (ไม่ทำเส้นแบนหลอกตา) */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2 || !values.some((v) => v > 0)) return null;
  const w = 96;
  const h = 36;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 4 - ((v - min) / span) * (h - 8)] as const);
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="flex-shrink-0" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill={color} stroke="#ffffff" strokeWidth={2} />
    </svg>
  );
}

/** แถบสัดส่วนสูง 8px พร้อมคำอธิบายสีที่เป็นข้อความเสมอ (ทองกับส้มใกล้กัน ห้ามพึ่งสีอย่างเดียว) */
export function SegmentBar({ segments, height = 8, legend = true }: { segments: Segment[]; height?: number; legend?: boolean }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-0.5 overflow-hidden rounded" style={{ height }} role="img" aria-label={segments.map((s) => `${s.label} ${fmtCount(s.value)}`).join(", ")}>
        {total === 0
          ? <span className="flex-1 bg-muted" />
          : visible.map((s) => <span key={s.key} style={{ flexGrow: s.value, background: s.color }} />)}
      </div>
      {legend && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {segments.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1 whitespace-nowrap">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              {s.label} <span className="font-mono text-foreground">{fmtCount(s.value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// ── กราฟ ─────────────────────────────────────────────────────────────────────

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="flex-1 flex items-center justify-center text-xs text-muted-foreground text-center py-10">{children}</p>;
}

interface TooltipEntry { name: string; value: number; color: string }
function BarTooltip({ active, payload, label, format }: { active?: boolean; payload?: TooltipEntry[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#c9a84c]/30 rounded-lg p-3 shadow-xl">
      <p className="text-muted-foreground text-xs font-mono mb-1">{label}</p>
      {payload.map((p) => <p key={p.name} className="text-xs font-mono text-foreground"><span style={{ color: p.color }}>●</span> {p.name}: {format(p.value)}</p>)}
    </div>
  );
}

export interface MonthSeries { key: string; name: string; color: string }

/**
 * กราฟแท่ง 12 เดือน — ชุดข้อมูลเดียว: แท่งเดือนปัจจุบัน (ยังไม่จบ) เป็นสีทอง · ป้ายค่าเฉพาะจุดสูงสุดกับเดือนล่าสุด
 * หลายชุด: แท่งคู่ + คำอธิบายสีด้านบน · `rows` ต้องมี `month` ("YYYY-MM") เรียงเก่าสุดก่อน
 */
export function MonthlyBars<T extends { month: string }>({ rows, series, format, height = 220, empty }: {
  rows: T[];
  series: MonthSeries[];
  format: (v: number) => string;
  height?: number;
  empty: string;
}) {
  const { lang } = useI18n();
  const data = rows.map((r) => ({ ...r, label: fmtMonthShort(r.month, lang) })) as (T & { label: string })[];
  const valueOf = (row: T, key: string) => Number((row as unknown as Record<string, unknown>)[key] ?? 0);
  const hasData = rows.some((r) => series.some((s) => valueOf(r, s.key) > 0));
  if (!hasData) return <EmptyNote>{empty}</EmptyNote>;

  const single = series.length === 1;
  const lastIndex = rows.length - 1;
  const peakIndex = single ? rows.reduce((best, r, i) => (valueOf(r, series[0].key) > valueOf(rows[best], series[0].key) ? i : best), 0) : -1;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3">
      {!single && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </div>
      )}
      {/* ในการ์ดที่ถูกยืด (ChartCard fill) กราฟขยายลงเต็มพื้นที่ · `height` เป็นความสูงขั้นต่ำ
          วางแบบ absolute เพื่อให้ ResponsiveContainer วัดขนาดได้แน่นอน ไม่ใช่ % ของความสูงที่ยังไม่รู้ */}
      <div className="relative flex-1" style={{ minHeight: height }}>
      <div className="absolute inset-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap={single ? "28%" : "22%"}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} minTickGap={0} />
          <YAxis tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={format} width={56} allowDecimals={false} />
          <Tooltip cursor={{ fill: "rgba(11,29,58,0.04)" }} content={<BarTooltip format={format} />} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={single ? 28 : 16} isAnimationActive={false}>
              {single && data.map((_, i) => <Cell key={i} fill={i === lastIndex ? GOLD : s.color} />)}
              {single && (
                <LabelList
                  dataKey={s.key}
                  content={(props) => {
                    const { x, y, width, value, index } = props as { x?: number; y?: number; width?: number; value?: number; index?: number };
                    if ((index !== peakIndex && index !== lastIndex) || !value) return null;
                    return (
                      <text x={(x ?? 0) + (width ?? 0) / 2} y={(y ?? 0) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fontFamily="JetBrains Mono, Noto Sans Thai, monospace" fill="#0b1d3a">
                        {format(value)}
                      </text>
                    );
                  }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      </div>
      </div>
    </div>
  );
}

export interface RankRow { key: string; label: string; value: number; display: string; sub?: string }

/** อันดับแถบแนวนอน — สีเดียวทั้งชุด สูงสุด 6 แถว (DASHBOARD_DESIGN.md ข้อ 4) */
export function RankBars({ rows, color, empty, limit = 6 }: { rows: RankRow[]; color: string; empty: string; limit?: number }) {
  const shown = rows.slice(0, limit);
  const max = Math.max(0, ...shown.map((r) => r.value));
  if (shown.length === 0 || max === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <ol className="space-y-3.5">
      {shown.map((r) => (
        <li key={r.key} className="space-y-1.5 min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-foreground truncate min-w-0" title={r.label}>{r.label}{r.sub && <span className="text-xs text-muted-foreground"> · {r.sub}</span>}</span>
            <span className="font-mono font-semibold text-foreground whitespace-nowrap">{r.display}</span>
          </div>
          <div className="h-2 rounded bg-muted overflow-hidden">
            <div className="h-full rounded" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** โดนัทหนา 18px + จำนวนรวมตรงกลาง + คำอธิบายสีพร้อมจำนวนเสมอ */
export function Donut({ slices, unit, empty }: { slices: Segment[]; unit: string; empty: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyNote>{empty}</EmptyNote>;
  const visible = slices.filter((s) => s.value > 0);
  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative w-[150px] h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={visible} dataKey="value" nameKey="label" innerRadius={52} outerRadius={70} paddingAngle={visible.length > 1 ? 2 : 0} strokeWidth={0} startAngle={90} endAngle={-270} isAnimationActive={false}>
              {visible.map((s) => <Cell key={s.key} fill={s.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-semibold font-mono text-foreground leading-none">{fmtCount(total)}</span>
          <span className="text-xs text-muted-foreground mt-1">{unit}</span>
        </div>
      </div>
      <ul className="w-full space-y-2">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="flex-1 min-w-0 truncate text-foreground">{s.label}</span>
            <span className="font-mono font-semibold text-foreground">{fmtCount(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── ป้าย รายการ ตาราง ────────────────────────────────────────────────────────

const PILL_TONES = {
  alert: "bg-[#e05252]/10 text-[#d22626] border-[#e05252]/20",
  warn: "bg-[#e08a3c]/10 text-[#a75d1a] border-[#e08a3c]/20",
  gold: "bg-[#c9a84c]/10 text-[#866d28] border-[#c9a84c]/25",
  good: "bg-[#2aa36b]/10 text-[#207e52] border-[#2aa36b]/20",
  neutral: "bg-[#5a7299]/10 text-[#576f94] border-[#5a7299]/20",
} as const;
export type PillTone = keyof typeof PILL_TONES;

/** Tinted Pill Rule ของ DESIGN.md */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${PILL_TONES[tone]}`}>{children}</span>;
}

/** ป้ายแผนกบนพื้นอ่อนของสีแผนกนั้น — ใช้ในแท็บรวมและรายการข้ามแผนก ให้รู้ว่าตัวเลข/แถวนี้ของใคร */
export function DeptPill({ dept }: { dept: DepartmentKey }) {
  const { t } = useI18n();
  const meta = DEPARTMENT_META[dept];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap" style={{ background: `${meta.accent}15`, borderColor: `${meta.accent}33`, color: meta.ink }}>
      {t(meta.labelKey)}
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
  return <Pill tone={days <= 7 ? "warn" : "neutral"}>{t("dashboard.dept.due.inDays").replace("{n}", String(days))}</Pill>;
}

/** หัวข้อส่วนย่อยในแท็บ — เส้นคั่นด้านบนเมื่อ `divider` · ป้ายแผนกนำหน้าได้ */
export function SectionHeading({ title, note, depts, divider }: { title: string; note?: string; depts?: DepartmentKey[]; divider?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${divider ? "pt-5 border-t border-border" : ""}`}>
      {depts?.map((d) => <DeptPill key={d} dept={d} />)}
      <h2 className="text-base font-semibold text-foreground" style={SERIF}>{title}</h2>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

/** ปุ่มเล็กมุมขวาของการ์ด พาไปหน้ารายการของเอกสารชนิดนั้น */
export function OpenListButton({ label, onClick }: { label?: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} className="px-2.5 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 transition-all whitespace-nowrap">
      {label ?? t("dashboard.dept.openList")}
    </button>
  );
}

export { ChartCard };

export function CardTable({ title, sub, actions, headers, empty, children, isEmpty }: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  headers: { label: string; align?: "right" }[];
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden h-full">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground" style={SERIF}>{title}</h2>
          {sub && <p className="text-xs text-muted-foreground font-mono mt-0.5">{sub}</p>}
        </div>
        {actions}
      </div>
      {isEmpty ? (
        <p className="text-sm text-muted-foreground text-center py-10">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/60">
                {headers.map((h, i) => (
                  <th key={`${h.label}-${i}`} className={`px-4 py-2.5 ${h.align === "right" ? "text-right" : "text-left"} text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap`}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
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
          <td className={`${TD_MONO} text-foreground font-semibold`}>{row.docNumber}</td>
          <td className={`${TD} max-w-[320px] truncate`} title={row.party}>{row.party || "—"}</td>
          {deptOf && <td className="px-4 py-3"><DeptPill dept={deptOf(row)} /></td>}
          <td className={`${TD_MONO} text-muted-foreground`}>{row.date ? fmtDateShort(row.date, lang) : "—"}</td>
          <td className="px-4 py-3"><DueBadge date={row.date} today={today} /></td>
        </tr>
      ))}
    </CardTable>
  );
}

/** ป้ายสถานะของเครื่องอนุมัติร่วม ตาม Tinted Pill Rule ใน DESIGN.md */
export function SharedStatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === "PendingApproval") return <Pill tone="gold">{t("dashboard.dept.status.pending")}</Pill>;
  if (status === "Final") return <Pill tone="good">{t("dashboard.dept.status.final")}</Pill>;
  return <Pill tone="neutral">{t("dashboard.dept.status.draft")}</Pill>;
}
