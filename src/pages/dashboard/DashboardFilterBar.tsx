import { useId, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Info } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { Toggle } from "../../components/Toggle";
import { field } from "../../components/ui/styles";
import { type DateRangePreset, rangeForPreset } from "../../lib/dateRanges";
import type { DashboardVatMode } from "../../lib/dashboard";
import { DateInput } from "../../components/DateInput";

export interface DashboardFilterState {
  /**
   * ตัวเลือกช่วงวันที่ที่ผู้ใช้กดไว้ (2026-09-14) — เดิมเก็บเป็น state ภายในแถบ ซึ่งรีเซ็ตกลับเป็น "ทั้งหมด"
   * ทุกครั้งที่แถบถูกสร้างใหม่ (สลับแท็บ) ทั้งที่ from/to ยังเป็นช่วงเดิม · ย้ายมาอยู่กับตัวกรองในหน้าแม่แทน
   */
  preset: DateRangePreset;
  from: string;
  to: string;
  salesperson: string;
  department: string;
  vatMode: DashboardVatMode;
}

const PRESETS: DateRangePreset[] = ["all", "today", "yesterday", "last7", "last14", "thisMonth", "lastMonth", "thisQuarter", "thisYear", "custom"];

/** กล่องเลือกแบบมีชื่อด้านซ้าย (บอร์ด: "ช่วงเวลา [▾]" · "แผนก [▾]") — select จริงของเบราว์เซอร์ */
function LabeledSelect({ label, value, onChange, widthClass, icon, children }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  widthClass: string;
  icon?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <label htmlFor={id} className={`${field.label} whitespace-nowrap`}>{label}</label>
      <span className={`relative block min-w-0 ${widthClass}`}>
        {icon && <CalendarDays size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />}
        <select
          id={id} value={value} onChange={(e) => onChange(e.target.value)}
          className={`${field.input.replace("px-3", icon ? "pl-[38px] pr-9" : "pl-3 pr-9")} w-full appearance-none cursor-pointer`}
        >
          {children}
        </select>
        <ChevronDown size={16} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </span>
    </div>
  );
}

/**
 * ช่วงเวลาบนหัวหน้า (ดีไซน์ใหม่ 2026-09-30) — ใช้กับทุกแท็บยกเว้นบัญชี (บัญชีมีตัวกรองของตัวเอง)
 * "กำหนดเอง" แสดงช่องวันที่สองช่องต่อท้าย
 */
export function DashboardPeriodFilter({ filters, onChange }: {
  filters: DashboardFilterState;
  onChange: (next: DashboardFilterState) => void;
}) {
  const { t } = useI18n();
  const presetLabel: Record<DateRangePreset, string> = {
    all: t("dashboard.filter.range.all"),
    today: t("dashboard.filter.range.today"),
    yesterday: t("dashboard.filter.range.yesterday"),
    last7: t("dashboard.filter.range.last7"),
    last14: t("dashboard.filter.range.last14"),
    thisMonth: t("dashboard.filter.range.thisMonth"),
    lastMonth: t("dashboard.filter.range.lastMonth"),
    thisQuarter: t("dashboard.filter.range.thisQuarter"),
    thisYear: t("dashboard.filter.range.thisYear"),
    custom: t("dashboard.filter.range.custom"),
  };
  const applyPreset = (p: DateRangePreset) => {
    const range = rangeForPreset(p);
    onChange({ ...filters, preset: p, from: range?.from ?? "", to: range?.to ?? "" });
  };
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <LabeledSelect label={t("dashboard.filter.range.label")} value={filters.preset} onChange={(v) => applyPreset(v as DateRangePreset)} widthClass="w-[200px]" icon>
        {PRESETS.map((p) => <option key={p} value={p}>{presetLabel[p]}</option>)}
      </LabeledSelect>
      {filters.preset === "custom" && (
        <div role="group" aria-label={t("dashboard.filter.customRange")} className="flex items-center gap-1.5">
          <DateInput
            value={filters.from} onChange={(v) => onChange({ ...filters, from: v })}
            ariaLabel={t("dashboard.filter.dateFrom.label")} className={`${field.input} font-mono w-[150px]`}
          />
          <span className="text-sm text-muted-foreground" aria-hidden="true">—</span>
          <DateInput
            value={filters.to} onChange={(v) => onChange({ ...filters, to: v })}
            ariaLabel={t("dashboard.filter.dateTo.label")} className={`${field.input} font-mono w-[150px]`}
          />
        </div>
      )}
    </div>
  );
}

/**
 * แถวตัวกรองใต้แถบแท็บของแท็บขาย (บอร์ด Dashboard-Sales): แผนก · พนักงานขาย · สวิตช์ VAT · บรรทัดอธิบาย
 * สวิตช์ VAT อยู่ต่อ — เจ้าของสั่งคงไว้ 2026-09-30 แม้บอร์ดจะตัดออก
 */
export function DashboardSalesFilters({ filters, onChange, availableSalespeople, availableDepartments, hidePeopleFilters = false }: {
  filters: DashboardFilterState;
  onChange: (next: DashboardFilterState) => void;
  availableSalespeople: string[];
  availableDepartments: string[];
  hidePeopleFilters?: boolean;
}) {
  const { t } = useI18n();
  const vatLabelId = useId();
  const vatText = t(filters.vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  return (
    <div className="flex items-center gap-x-4 gap-y-3 flex-wrap min-h-10">
      {!hidePeopleFilters && (
        <>
          <LabeledSelect label={t("dashboard.filter.department.label")} value={filters.department} onChange={(v) => onChange({ ...filters, department: v })} widthClass="w-[180px]">
            <option value="all">{t("dashboard.filter.department.all")}</option>
            {availableDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
          </LabeledSelect>
          <LabeledSelect label={t("dashboard.filter.salesperson.label")} value={filters.salesperson} onChange={(v) => onChange({ ...filters, salesperson: v })} widthClass="w-[220px]">
            <option value="all">{t("dashboard.filter.salesperson.all")}</option>
            {availableSalespeople.map((s) => <option key={s} value={s}>{s}</option>)}
          </LabeledSelect>
        </>
      )}
      <div data-tour="dashboard-vat" className="flex items-center gap-2.5 h-10">
        <Toggle
          checked={filters.vatMode === "post"}
          onChange={(checked) => onChange({ ...filters, vatMode: checked ? "post" : "pre" })}
          labelledBy={vatLabelId}
        />
        <span id={vatLabelId} className="text-[13px] font-medium text-[#26395a] whitespace-nowrap">{vatText}</span>
      </div>
      <div className="flex-1" />
      <p className="flex items-start gap-2 text-[13px] text-muted-foreground min-w-0">
        <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>{t("dashboard.sales.filterNote").replace("{vat}", vatText)}</span>
      </p>
    </div>
  );
}
