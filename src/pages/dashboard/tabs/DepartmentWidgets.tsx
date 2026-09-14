import type { ReactNode } from "react";
import { FilePen, FileClock, FileCheck2, Files, UserRound, type LucideIcon } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { MetricInfoTooltip } from "../../../components/MetricInfoTooltip";
import { ChartCard } from "../ChartCard";
import { fmtDateShort } from "../format";
import { DepartmentTabSkeleton, ErrorState } from "../DashboardStates";
import type { DashboardData } from "../useDashboardData";
import { fmtCount, daysBetweenIso } from "./countFormat";
import type { DepartmentKey } from "../../../lib/dashboardTabs";
import type {
  BlockScope, DepartmentBlock, DepartmentDashboardResponse, DueItem, StatusCounts,
} from "../../../lib/departmentDashboard";

/** ชิ้นส่วนที่แท็บแผนกทุกแท็บใช้ร่วมกัน (2026-09-14) — ให้ทุกแท็บหน้าตาและภาษาเดียวกัน */


export interface DepartmentTabProps {
  result: DashboardData<DepartmentDashboardResponse>;
  onRetry: () => void;
  onNavigatePage: (navKey: string) => void;
}

/**
 * กรอบของแท็บแผนก — จัดการโหลดครั้งแรก / โหลดพัง / บล็อกหาย ให้ทุกแท็บเหมือนกัน แล้วส่งบล็อกของแผนกนั้น
 * ให้ตัวแท็บวาดเฉพาะเนื้อหา
 */
export function DepartmentTabFrame<K extends DepartmentKey>({ dept, result, onRetry, children }: {
  dept: K;
  result: DashboardData<DepartmentDashboardResponse>;
  onRetry: () => void;
  children: (block: DepartmentBlock<K>, response: DepartmentDashboardResponse) => ReactNode;
}) {
  const response = result.data?.view === dept ? result.data : null;
  const block = response?.blocks[dept] as DepartmentBlock<K> | null | undefined;
  if (!response) return result.error ? <ErrorState onRetry={onRetry} /> : <DepartmentTabSkeleton />;
  if (!block) return <ErrorState onRetry={onRetry} />;
  return <>{children(block, response)}</>;
}

/** บรรทัดอธิบายใต้แถบตัวกรอง — บอกว่าตัวเลขไหนขึ้นกับช่วงวันที่ และบอกถ้าบางตัวนับเฉพาะของผู้ใช้เอง */
export function TabIntro({ scope, children }: { scope: BlockScope; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground -mt-2">
      <span>{t("dashboard.dept.snapshotNote")}</span>
      {scope === "own" && (
        <span className="flex items-center gap-1">
          <UserRound size={12} className="text-[#c9a84c] flex-shrink-0" /> {t("dashboard.dept.ownScope")}
        </span>
      )}
      {children}
    </div>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>;
}

/**
 * Stat tile ตาม DESIGN.md "Stat Tiles" — ชิปไอคอน + ตัวเลข mono + ป้าย · `caption` บรรทัดเล็กใต้ป้าย
 * `tone` ทำให้ตัวเลขเป็นสีเตือน เฉพาะเมื่อมีของค้างจริง (ค่ามากกว่าศูนย์) ไม่ใช่ทาสีตลอดเวลา
 */
export function StatTile({ icon: Icon, label, value, accent, caption, help, tone, variant = "card" }: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent: string;
  caption?: string;
  help?: string;
  tone?: "alert" | "warn";
  variant?: "card" | "inset";
}) {
  const toneClass = tone === "alert" ? "text-[#d22626]" : tone === "warn" ? "text-[#a75d1a]" : "text-foreground";
  return (
    <div className={`flex items-center gap-3 min-w-0 border border-border ${variant === "card" ? "bg-card rounded-xl p-4" : "rounded-lg p-3"}`}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}18` }}>
        <Icon size={16} style={{ color: accent }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-lg font-bold font-mono leading-none ${toneClass}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate" title={label}>{label}</p>
        {caption && <p className="text-[10px] text-muted-foreground mt-0.5 truncate" title={caption}>{caption}</p>}
      </div>
      {help && <MetricInfoTooltip label={label} text={help} />}
    </div>
  );
}

/** การ์ดจำนวนเอกสารแยกสามสถานะของเครื่องอนุมัติร่วม (ร่าง / รออนุมัติ / อนุมัติแล้ว) */
export function StatusBreakdownCard({ title, sub, counts, footer, actions }: {
  title: string; sub?: string; counts: StatusCounts; footer?: ReactNode; actions?: ReactNode;
}) {
  const { t } = useI18n();
  const total = counts.draft + counts.pending + counts.final;
  return (
    <ChartCard title={title} sub={sub ?? t("dashboard.dept.allDocsNow")} actions={actions}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile variant="inset" icon={Files} label={t("dashboard.dept.status.total")} value={fmtCount(total)} accent="#5a7299" />
        <StatTile variant="inset" icon={FilePen} label={t("dashboard.dept.status.draft")} value={fmtCount(counts.draft)} accent="#5a7299" />
        <StatTile variant="inset" icon={FileClock} label={t("dashboard.dept.status.pending")} value={fmtCount(counts.pending)} accent="#e08a3c" />
        <StatTile variant="inset" icon={FileCheck2} label={t("dashboard.dept.status.final")} value={fmtCount(counts.final)} accent="#2aa36b" />
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </ChartCard>
  );
}

/** ปุ่มเล็กมุมขวาของการ์ด พาไปหน้ารายการของเอกสารชนิดนั้น */
export function OpenListButton({ label, onClick }: { label?: string; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} className="px-2.5 py-1 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all whitespace-nowrap">
      {label ?? t("dashboard.dept.openList")}
    </button>
  );
}

export function CardTable({ title, sub, actions, headers, empty, children, isEmpty }: {
  title: string;
  sub?: string;
  actions?: ReactNode;
  headers: string[];
  empty: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
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
              <tr className="border-b border-border bg-muted/40">
                {headers.map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
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

/** ตาราง "ใกล้/เลยกำหนด" — ป้ายขวาสุดคำนวณจากวันที่ของแถวเทียบวันนี้ (เวลาไทย จากเซิร์ฟเวอร์) */
export function DueListTable({ title, sub, rows, dateLabel, today, empty, actions }: {
  title: string;
  sub: string;
  rows: DueItem[];
  dateLabel: string;
  today: string;
  empty: string;
  actions?: ReactNode;
}) {
  const { t, lang } = useI18n();
  return (
    <CardTable
      title={title} sub={sub} actions={actions} empty={empty} isEmpty={rows.length === 0}
      headers={[t("dashboard.dept.due.col.docNumber"), t("dashboard.dept.due.col.party"), dateLabel, ""]}
    >
      {rows.map((row) => {
        const days = daysBetweenIso(today, row.date);
        const badge = days < 0
          ? { text: t("dashboard.dept.due.overdueDays").replace("{n}", String(-days)), cls: "bg-[#e05252]/10 text-[#d22626] border-[#e05252]/20" }
          : days === 0
            ? { text: t("dashboard.dept.due.today"), cls: "bg-[#e08a3c]/10 text-[#a75d1a] border-[#e08a3c]/20" }
            : { text: t("dashboard.dept.due.inDays").replace("{n}", String(days)), cls: "bg-[#5a7299]/10 text-[#576f94] border-[#5a7299]/20" };
        return (
          <tr key={row.id} className="border-b border-border/50 last:border-0">
            <td className="px-4 py-2.5 text-xs font-mono text-foreground font-semibold whitespace-nowrap">{row.docNumber}</td>
            <td className="px-4 py-2.5 text-sm text-foreground max-w-[320px] truncate" title={row.party}>{row.party || "—"}</td>
            <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{fmtDateShort(row.date, lang)}</td>
            <td className="px-4 py-2.5 whitespace-nowrap">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badge.cls}`}>{badge.text}</span>
            </td>
          </tr>
        );
      })}
    </CardTable>
  );
}

/** ป้ายสถานะของเครื่องอนุมัติร่วม ตาม Tinted Pill Rule ใน DESIGN.md */
export function SharedStatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const style = status === "PendingApproval"
    ? { key: "dashboard.dept.status.pending" as const, cls: "bg-[#c9a84c]/10 text-[#866d28] border-[#c9a84c]/20" }
    : status === "Final"
      ? { key: "dashboard.dept.status.final" as const, cls: "bg-[#2aa36b]/10 text-[#207e52] border-[#2aa36b]/20" }
      : { key: "dashboard.dept.status.draft" as const, cls: "bg-[#5a7299]/10 text-[#576f94] border-[#5a7299]/20" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${style.cls}`}>{t(style.key)}</span>;
}
