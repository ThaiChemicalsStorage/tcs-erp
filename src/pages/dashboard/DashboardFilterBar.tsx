import { useId, useState } from "react";
import { CalendarRange } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { Toggle } from "../../components/Toggle";
import { type DateRangePreset, rangeForPreset } from "./dateRanges";
import type { DashboardVatMode } from "../../lib/dashboard";

export interface DashboardFilterState {
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
  filters, onChange, availableSalespeople, availableDepartments, hidePeopleFilters = false,
}: {
  filters: DashboardFilterState;
  onChange: (next: DashboardFilterState) => void;
  availableSalespeople: string[];
  availableDepartments: string[];
  hidePeopleFilters?: boolean;
}) {
  const { t } = useI18n();
  const [preset, setPreset] = useState<DateRangePreset>("all");
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
    setPreset(p);
    const range = rangeForPreset(p);
    onChange({ ...filters, from: range?.from ?? "", to: range?.to ?? "" });
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
    </div>
  );
}
