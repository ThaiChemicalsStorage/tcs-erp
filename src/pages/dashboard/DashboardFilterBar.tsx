import { useId } from "react";
import { CalendarRange } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { Toggle } from "../../components/Toggle";
import { type DateRangePreset, rangeForPreset } from "../../lib/dateRanges";
import type { DashboardVatMode } from "../../lib/dashboard";

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

// แถบตัวกรองของแดชบอร์ด: ช่วงวันที่ ฝ่ายขาย และพนักงานขาย
// Dashboard filter bar for date range, department, and salesperson selection.
export function DashboardFilterBar({
  filters, onChange, availableSalespeople, availableDepartments, hidePeopleFilters = false, mode = "full",
}: {
  filters: DashboardFilterState;
  onChange: (next: DashboardFilterState) => void;
  availableSalespeople: string[];
  availableDepartments: string[];
  hidePeopleFilters?: boolean;
  /** "dateOnly" = แท็บแผนกที่ไม่ใช่ขาย — ฝ่าย/พนักงานขาย/VAT มีความหมายกับใบเสนอราคาเท่านั้น */
  mode?: "full" | "dateOnly";
}) {
  const { t } = useI18n();
  const preset = filters.preset;
  const vatLabelId = useId();

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
    <div className="flex items-center gap-2.5 flex-wrap bg-card border border-border rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 text-muted-foreground pl-1"><CalendarRange size={13} /></div>
      <select
        value={preset}
        onChange={(e) => applyPreset(e.target.value as DateRangePreset)}
        aria-label={t("dashboard.filter.range.label")}
        className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
      >
        {PRESETS.map((p) => <option key={p} value={p}>{presetLabel[p]}</option>)}
      </select>

      {preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={filters.from} onChange={(e) => onChange({ ...filters, from: e.target.value })}
            aria-label={t("dashboard.filter.dateFrom.label")}
            className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors font-mono" />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="date" value={filters.to} onChange={(e) => onChange({ ...filters, to: e.target.value })}
            aria-label={t("dashboard.filter.dateTo.label")}
            className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors font-mono" />
        </div>
      )}

      {/* People-filters + VAT toggle share this one sm:ml-auto — splitting them into separate
          ml-auto siblings previously made the leftover row space divide between both, floating
          the people-filters group mid-row instead of both hugging the right edge. Any future
          right-aligned addition belongs inside this container, not as a new sibling. */}
      {mode === "full" && (
      <div className="flex items-center gap-2.5 flex-wrap sm:ml-auto">
        {!hidePeopleFilters && (
          <>
            <select
              value={filters.department}
              onChange={(e) => onChange({ ...filters, department: e.target.value })}
              aria-label={t("dashboard.filter.department.label")}
              className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
            >
              <option value="all">{t("dashboard.filter.department.all")}</option>
              {availableDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            <select
              value={filters.salesperson}
              onChange={(e) => onChange({ ...filters, salesperson: e.target.value })}
              aria-label={t("dashboard.filter.salesperson.label")}
              className="text-xs text-foreground bg-secondary border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
            >
              <option value="all">{t("dashboard.filter.salesperson.all")}</option>
              {availableSalespeople.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        )}

        <div className="flex items-center gap-2">
          <span id={vatLabelId} className="text-xs text-muted-foreground whitespace-nowrap">
            {t(filters.vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre")}
          </span>
          <Toggle
            checked={filters.vatMode === "post"}
            onChange={(checked) => onChange({ ...filters, vatMode: checked ? "post" : "pre" })}
            labelledBy={vatLabelId}
          />
        </div>
      </div>
      )}
    </div>
  );
}
