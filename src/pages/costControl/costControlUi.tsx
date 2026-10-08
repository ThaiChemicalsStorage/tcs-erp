import { X } from "lucide-react";
import { FilterSelect } from "../../components/ui/ListPage";
import { field } from "../../components/ui/styles";
import type { CostControlStatus } from "../../lib/costControl";
import type { DateRangePreset, DateRangeValue } from "../../lib/dateRanges";
import { useI18n } from "../../lib/i18n";
import { useCostControlStatusLabel } from "./costControlHooks";
import { DateInput } from "../../components/DateInput";

/**
 * ชิ้นส่วนหน้าจอของ Cost Control ตามดีไซน์ใหม่ (2026-09-30) — ป้ายสถานะมีจุด, ตัวกรองช่วงวันที่แบบปุ่ม
 * "ช่วงวันที่: ทั้งหมด ▾" (hook ของขั้นตอนอนุมัติอยู่ที่ `costControlHooks.tsx`)
 */

const PILL: Record<CostControlStatus, { pill: string; dot: string }> = {
  Draft: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  PendingApproval: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  Final: { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
};

export function CostControlStatusPill({ status }: { status: CostControlStatus }) {
  const label = useCostControlStatusLabel();
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
 * ตัวกรองช่วงวันที่แบบปุ่มของแถบเครื่องมือแบบใหม่ — พรีเซ็ตชุดเดียวกับ `DateRangeFilter` (ตรรกะช่วงวันที่
 * ยังอยู่ที่ `lib/dateRanges.ts` ที่เดียว) · เลือก "กำหนดเอง" แล้วมีช่องวันที่สองช่อง
 */
export function CostControlDateRangeSelect({ value, onChange }: { value: DateRangeValue; onChange: (next: DateRangeValue) => void }) {
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
        label={t("costControl.dateRange")}
        value={value.preset}
        options={DATE_PRESETS.map((p) => ({ value: p, label: label[p] }))}
        onChange={(preset) => onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" })}
      />
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <DateInput
            value={value.from}
            max={value.to || undefined}
            onChange={(v) => onChange({ ...value, preset: "custom", from: v })}
            ariaLabel={t("dateFilter.from")}
            className={`${field.input} w-[150px]`}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <DateInput
            value={value.to}
            min={value.from || undefined}
            onChange={(v) => onChange({ ...value, preset: "custom", to: v })}
            ariaLabel={t("dateFilter.to")}
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
