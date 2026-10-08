import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { FilterSelect } from "../../components/ui/ListPage";
import { field } from "../../components/ui/styles";
import type { DateRangePreset, DateRangeValue } from "../../lib/dateRanges";
import type { DiscountMode } from "../../lib/quoteMath";
import { DateInput } from "../../components/DateInput";

/**
 * ชิ้นส่วนหน้าตาที่หน้าคลังฝั่งรับของใช้ร่วมกัน (ใบรับสินค้า · ใบรับวางบิล · ใบเบิก-คืนวัสดุของสโตร์) — ดีไซน์ใหม่ 2026-09-30
 * ของที่ชุด `components/ui` ยังไม่มี (ป้ายสถานะตามโทน ช่องตัวเลขมีหน่วยต่อท้าย ช่องส่วนลด %/฿ ตัวกรองช่วงวันที่แบบปุ่ม
 * การ์ดยอดสีกรมท่ามีแถบความคืบหน้า) สร้างไว้ในโมดูลตามกติกาของงานย้ายดีไซน์
 */

export const PAGE_CLASS = "flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5";

export const rowOpenClass = "cursor-pointer outline-none focus-visible:bg-[#f8f9fc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40";

export type PillTone = "grey" | "amber" | "blue" | "green" | "red";

const PILL_TONES: Record<PillTone, { pill: string; dot: string }> = {
  grey: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  amber: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  blue: { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
  green: { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  red: { pill: "bg-[#fcebeb] text-[#b93636]", dot: "bg-[#b93636]" },
};

/** ป้ายสถานะ 26px จุดสีนำหน้า */
export function Pill({ tone, label }: { tone: PillTone; label: string }) {
  const style = PILL_TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${style.pill}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {label}
    </span>
  );
}

/** ป้ายเล็กสี่เหลี่ยมมุมมน (สถานะรองข้างป้ายหลัก เช่น "ค้างเบิก" "รับเข้าคลังแล้ว") */
export function Tag({ tone, children }: { tone: "amber" | "green" | "grey"; children: ReactNode }) {
  const cls = tone === "amber" ? "bg-[#fdf3e0] text-[#8a5a00]" : tone === "green" ? "bg-[#e6f4ec] text-[#1b7f4f]" : "bg-[#eef1f6] text-[#3d5173]";
  return <span className={`inline-flex items-center h-[22px] px-2 rounded-md text-xs font-semibold whitespace-nowrap ${cls}`}>{children}</span>;
}

/** ชิปรหัส (RR, PP, JD …) ตัว mono บนพื้นเทา */
export function CodeChip({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center h-[22px] min-w-[34px] px-1.5 rounded-md font-mono text-xs font-semibold flex-shrink-0 ${dark ? "bg-[#0b1d3a] text-white" : "bg-[#eef1f6] text-[#3d5173]"}`}>
      {children}
    </span>
  );
}

/** วงกลมตัวเลือกเดียว 18px (แถวในหน้าต่างเลือก) */
export function RadioDot({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 ${on ? "border-[#0b1d3a]" : "border-[#a3aec2]"}`}>
      {on && <span className="w-2 h-2 rounded-full bg-[#0b1d3a]" />}
    </span>
  );
}

/** ช่องติ๊ก 18px (แถวในหน้าต่างเลือกหลายรายการ) */
export function CheckDot({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className={`w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center flex-shrink-0 text-white ${on ? "bg-[#0b1d3a] border-[#0b1d3a]" : "bg-white border-[#a3aec2]"}`}>
      {on && <Check size={12} strokeWidth={3} />}
    </span>
  );
}

/** ช่องตัวเลขมีหน่วยต่อท้าย (% · วัน) ในกรอบเดียว — `data-field-box` ให้กฎช่องกรอกของหน้าเอกสารไม่วาดกรอบซ้อน */
export function SuffixInput({ id, value, onChange, suffix, ariaLabel, min, max, integer = false }: {
  id?: string;
  value: string | number;
  onChange: (raw: string) => void;
  suffix: ReactNode;
  ariaLabel?: string;
  min?: number;
  max?: number;
  integer?: boolean;
}) {
  return (
    <span data-field-box className="h-10 rounded-lg border border-[#c3ccda] bg-white flex items-stretch overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={integer ? 1 : undefined}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 px-3 bg-transparent text-sm text-foreground text-right tabular-nums outline-none"
      />
      <span className="px-3 flex items-center bg-[#f4f6fa] border-l border-border text-[13px] text-[#3d5173] whitespace-nowrap">{suffix}</span>
    </span>
  );
}

/** ช่องส่วนลด: ตัวเลข + ปุ่มสลับหน่วย % / ฿ ในกรอบเดียว · `small` = 36px สำหรับในตาราง */
export function DiscountInput({ value, mode, onValue, onMode, ariaLabel, small = false }: {
  value: string | number;
  mode: DiscountMode;
  onValue: (raw: string) => void;
  onMode: (mode: DiscountMode) => void;
  ariaLabel: string;
  small?: boolean;
}) {
  const { t } = useI18n();
  const seg = (on: boolean) =>
    `${small ? "h-[26px] min-w-6 text-xs" : "h-7 min-w-8 text-[13px]"} px-1 rounded-[5px] flex items-center justify-center transition-colors ${on ? "bg-white text-foreground font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)]" : "text-[#3d5173] hover:text-foreground"}`;
  return (
    <span data-field-box className={`${small ? "h-9 pr-[3px]" : "h-10 pr-1"} rounded-lg border border-[#c3ccda] bg-white flex items-center overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors`}>
      <input
        type="number"
        min={0}
        value={value}
        placeholder="0"
        aria-label={ariaLabel}
        onChange={(e) => onValue(e.target.value)}
        className={`flex-1 min-w-0 ${small ? "px-2" : "px-3"} bg-transparent text-sm text-foreground text-right tabular-nums outline-none placeholder:text-[#8a97ad]`}
      />
      <span role="group" aria-label={`${t("receivingReportDoc.discountMode")} ${ariaLabel}`} className="flex bg-[#eef1f6] rounded-md p-0.5 flex-shrink-0">
        <button type="button" aria-pressed={mode === "percent"} onClick={() => onMode("percent")} className={seg(mode === "percent")}>%</button>
        <button type="button" aria-pressed={mode === "amount"} aria-label={t("receivingReportDoc.discountBaht")} onClick={() => onMode("amount")} className={seg(mode === "amount")}>฿</button>
      </span>
    </span>
  );
}

/** การ์ดยอดสีกรมท่าบนคอลัมน์ขวา — หัวเล็ก ค่าใหญ่ แถบความคืบหน้า (ถ้ามี) และแถวข้อมูลย่อย */
export function RailSummaryCard({ label, value, mono = false, aside, progress, progressLabel, rows }: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  /** ข้อความข้างค่าใหญ่ (เช่นชื่อรหัส) */
  aside?: ReactNode;
  /** 0–100 · ไม่ส่ง = ไม่มีแถบ */
  progress?: number;
  progressLabel?: string;
  rows: { label: ReactNode; value: ReactNode; mono?: boolean }[];
}) {
  const pct = progress === undefined ? 0 : Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <section className="rounded-xl bg-[#0b1d3a] text-white p-5 flex flex-col gap-3">
      <div className="text-[13px] text-[#c5d3e8]">{label}</div>
      <div className="flex items-center gap-3 min-w-0">
        <span className={mono ? "font-mono text-[26px] font-medium leading-tight" : "text-[26px] font-semibold leading-tight tabular-nums break-all"}>{value}</span>
        {aside && <span className="text-sm font-medium leading-snug">{aside}</span>}
      </div>
      {progress !== undefined && (
        <div role="progressbar" aria-label={progressLabel} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full rounded-full bg-[#c9a84c] transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {rows.length > 0 && <div className="h-px bg-white/10" />}
      {rows.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-[13px] text-[#c5d3e8]">
          <span>{r.label}</span>
          <span className={`text-right text-white ${r.mono ? "font-mono" : "tabular-nums"}`}>{r.value}</span>
        </div>
      ))}
    </section>
  );
}

/** เนื้อในกล่องสรุปของกล่องยืนยัน: เลขที่ (mono) + บรรทัดรอง ซ้าย · ค่า (ยอด/จำนวน) ขวา */
export function SummaryLine({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="font-mono text-[13px] font-medium text-foreground truncate">{title}</span>
        {sub && <span className="text-[13px] text-[#3d5173] truncate">{sub}</span>}
      </div>
      {right !== undefined && <span className="font-semibold tabular-nums whitespace-nowrap text-foreground">{right}</span>}
    </div>
  );
}

const DATE_PRESETS: DateRangePreset[] = ["all", "today", "thisMonth", "lastMonth", "thisYear", "custom"];

/**
 * ตัวกรองช่วงวันที่แบบปุ่ม "ช่วงวันที่: ทั้งหมด ▾" — พรีเซ็ตชุดเดียวกับ `DateRangeFilter` (ตรรกะอยู่ที่ `lib/dateRanges.ts`)
 * เลือก "กำหนดเอง" แล้วมีช่องวันที่สองช่อง
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
        label={t("inventoryUi.dateRange")}
        value={value.preset}
        options={DATE_PRESETS.map((p) => ({ value: p, label: label[p] }))}
        onChange={(preset) => onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" })}
      />
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <DateInput value={value.from} max={value.to || undefined} ariaLabel={t("dateFilter.from")}
            onChange={(v) => onChange({ ...value, preset: "custom", from: v })} className={`${field.input} w-[150px]`} />
          <span className="text-sm text-muted-foreground">–</span>
          <DateInput value={value.to} min={value.from || undefined} ariaLabel={t("dateFilter.to")}
            onChange={(v) => onChange({ ...value, preset: "custom", to: v })} className={`${field.input} w-[150px]`} />
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

/** ข้อความโหลดไม่สำเร็จ + ปุ่มลองใหม่ (หน้ารายการ) */
export function LoadErrorState({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="py-16 px-6 flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      <button type="button" onClick={onRetry} className="h-9 px-3 inline-flex items-center rounded-lg border border-[#c3ccda] bg-white text-[13px] font-medium text-foreground hover:bg-[#f4f6fa] transition-colors">
        {retryLabel}
      </button>
    </div>
  );
}
