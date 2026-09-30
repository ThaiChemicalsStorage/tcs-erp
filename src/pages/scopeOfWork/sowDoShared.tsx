import type { ReactNode } from "react";
import { ChevronRight, X, type LucideIcon } from "lucide-react";
import { FilterSelect } from "../../components/ui/ListPage";
import { field } from "../../components/ui/styles";
import type { DateRangePreset, DateRangeValue } from "../../lib/dateRanges";
import { useI18n } from "../../lib/i18n";
import { useApprovalStatusLabel, type ApprovalStatus } from "./sowDoStatus";

/**
 * ชิ้นส่วนที่ Scope of Work กับใบส่งมอบสินค้าใช้ร่วมกัน (ดีไซน์ใหม่ 2026-09-30) — ทั้งสองเอกสารมีสถานะ
 * Draft → PendingApproval → Final ชุดเดียวกัน จึงใช้ป้ายสถานะ ขั้นตอน และการ์ดเอกสารต้นทางแบบเดียวกัน
 */

const PILL: Record<ApprovalStatus, { pill: string; dot: string }> = {
  Draft: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  PendingApproval: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  Final: { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
};

export function ApprovalStatusPill({ status }: { status: ApprovalStatus }) {
  const label = useApprovalStatusLabel();
  const style = PILL[status] ?? PILL.Draft;
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${style.pill}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {label(status)}
    </span>
  );
}

const DATE_PRESETS: DateRangePreset[] = ["all", "today", "thisMonth", "lastMonth", "thisYear", "custom"];

/**
 * ตัวกรองช่วงวันที่แบบปุ่ม "ช่วงวันที่: ทั้งหมด ▾" ของแถบเครื่องมือแบบใหม่ — พรีเซ็ตชุดเดียวกับ
 * `DateRangeFilter` (ตรรกะช่วงวันที่ยังอยู่ที่ `lib/dateRanges.ts` ที่เดียว) เลือก "กำหนดเอง" แล้วมีช่องวันที่สองช่อง
 */
export function ListDateRangeSelect({ value, onChange }: { value: DateRangeValue; onChange: (next: DateRangeValue) => void }) {
  const { t } = useI18n();
  const label: Record<string, string> = {
    all: t("dateFilter.all"),
    today: t("dateFilter.today"),
    thisMonth: t("dateFilter.thisMonth"),
    lastMonth: t("dateFilter.lastMonth"),
    thisYear: t("dateFilter.thisYear"),
    custom: t("dateFilter.custom"),
  };
  return (
    <div className="flex items-center gap-2 flex-wrap" data-tour="date-filter">
      <FilterSelect<DateRangePreset>
        label={t("sowdo.dateRange")}
        value={value.preset}
        options={DATE_PRESETS.map((p) => ({ value: p, label: label[p] }))}
        onChange={(preset) => onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" })}
      />
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })}
            aria-label={t("dateFilter.from")}
            className={`${field.input} w-[150px]`}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })}
            aria-label={t("dateFilter.to")}
            className={`${field.input} w-[150px]`}
          />
          {(value.from || value.to) && (
            <button type="button" onClick={() => onChange({ preset: "custom", from: "", to: "" })} aria-label={t("dateFilter.clear")} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** ป้ายเล็ก "ดึงจาก…" บนหัวการ์ดข้อมูลที่อ่านอย่างเดียว */
export function SourceTag({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="h-6 px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-medium inline-flex items-center gap-1.5 flex-shrink-0">
      <Icon size={13} />
      {children}
    </span>
  );
}

/**
 * แถวเอกสารต้นทางบนคอลัมน์ขวา (ไอคอน + ชนิดเอกสาร + เลขที่) — กดได้เมื่อมีทางเปิดเอกสารนั้น
 * (`onOpen`) ไม่มีก็แสดงเป็นข้อมูลเฉย ๆ
 */
export function SourceDocRow({ icon: Icon, kind, number, onOpen, muted = false }: {
  icon: LucideIcon;
  kind: ReactNode;
  number: ReactNode;
  onOpen?: () => void;
  muted?: boolean;
}) {
  const body = (
    <>
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${muted ? "bg-[#eef1f6] text-[#3d5173]" : "bg-[#e8f0fb] text-[#1a5fb4]"}`}>
        <Icon size={16} />
      </span>
      <span className="flex-1 min-w-0 flex flex-col leading-snug text-left">
        <span className="text-xs text-muted-foreground">{kind}</span>
        <span className={`font-mono text-[13px] font-medium truncate ${onOpen ? "text-[#1a5fb4]" : "text-foreground"}`}>{number}</span>
      </span>
    </>
  );
  if (!onOpen) {
    return <div className="px-3 py-2.5 border border-border rounded-lg flex items-center gap-3">{body}</div>;
  }
  return (
    <button type="button" onClick={onOpen} className="px-3 py-2.5 border border-border rounded-lg bg-white hover:bg-[#f4f6fa] transition-colors flex items-center gap-3 w-full">
      {body}
      <ChevronRight size={16} className="text-[#8a97ad] flex-shrink-0" />
    </button>
  );
}

/** กล่องเทาในการ์ดเอกสารต้นทาง: คำอธิบายที่มาของข้อมูล + ลิงก์คำสั่ง (เช่น อัปเดตข้อมูล) */
export function SourceNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="p-3 bg-[#f8f9fc] border border-border rounded-lg flex flex-col gap-1.5">
      <span className="text-[13px] leading-relaxed text-[#3d5173]">{children}</span>
      {action}
    </div>
  );
}

/** การ์ดสรุปสีกรมท่าบนคอลัมน์ขวา — หัวเล็ก ค่าใหญ่ แถบความคืบหน้า (ถ้ามี) และแถวข้อมูลย่อย */
export function RailSummaryCard({ label, value, valueNote, progress, rows, dataTour }: {
  label: ReactNode;
  value: ReactNode;
  valueNote?: ReactNode;
  /** 0–100 · ไม่ส่ง = ไม่มีแถบ */
  progress?: number;
  rows: { label: ReactNode; value: ReactNode }[];
  dataTour?: string;
}) {
  return (
    <section data-tour={dataTour} className="rounded-xl bg-[#0b1d3a] text-white p-5 flex flex-col gap-3">
      <div className="text-[13px] text-[#c5d3e8]">{label}</div>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="text-[26px] font-semibold leading-tight tabular-nums">{value}</span>
        {valueNote && <span className="text-[13px] text-[#c5d3e8]">{valueNote}</span>}
      </div>
      {progress !== undefined && (
        <div aria-hidden="true" className="h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div className={`h-full transition-all ${progress >= 100 ? "bg-[#e6f4ec]" : "bg-[#c9a84c]"}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {rows.length > 0 && <div className="h-px bg-white/10" />}
      {rows.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-[13px] text-[#c5d3e8]">
          <span>{r.label}</span>
          <span className="text-white text-right">{r.value}</span>
        </div>
      ))}
    </section>
  );
}

/** แถวเอกสารที่เกี่ยวข้อง (ใบส่งมอบ / Cost Control / โครงการ) — ไอคอน ชนิด ค่า และปุ่มคำสั่งชิดขวา */
export function RelatedDocRow({ icon: Icon, kind, value, note, action }: {
  icon: LucideIcon;
  kind: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} className="text-muted-foreground flex-shrink-0 mt-2.5" />
      <span className="flex-1 min-w-0 flex flex-col leading-snug">
        <span className="text-xs text-muted-foreground">{kind}</span>
        <span className="text-sm font-medium text-foreground truncate">{value}</span>
        {note && <span className="text-xs text-muted-foreground mt-0.5">{note}</span>}
      </span>
      {action && <span className="flex-shrink-0 self-center">{action}</span>}
    </div>
  );
}

/** ลิงก์คำสั่งสีน้ำเงินขนาดเล็กในการ์ดคอลัมน์ขวา */
export const railLink = "text-[13px] font-medium text-[#1a5fb4] hover:underline disabled:text-[#8a97ad] disabled:no-underline disabled:cursor-not-allowed whitespace-nowrap";

/** ปุ่มคำสั่งตัวอักษรสีน้ำเงินขนาดเล็กในกล่องเทาของการ์ดเอกสารต้นทาง (เช่น "อัปเดตข้อมูล") */
export const railTextBtn = "self-start h-8 px-2 -mx-2 inline-flex items-center gap-1.5 rounded-lg text-[#1a5fb4] text-[13px] font-medium hover:bg-[#e8f0fb] transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
