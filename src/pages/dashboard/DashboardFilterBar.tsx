import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { type DateRangePreset, rangeForPreset } from "./dateRanges";

export interface DashboardFilterState {
  from: string;
  to: string;
  salesperson: string;
  department: string;
}

const PRESETS: DateRangePreset[] = ["all", "today", "yesterday", "last7", "last14", "thisMonth", "lastMonth", "thisQuarter", "thisYear", "custom"];

export function DashboardFilterBar({
  filters, onChange, availableSalespeople, availableDepartments,
}: {
  filters: DashboardFilterState;
  onChange: (next: DashboardFilterState) => void;
  availableSalespeople: string[];
  availableDepartments: string[];
}) {
  const { t } = useI18n();
  const [preset, setPreset] = useState<DateRangePreset>("all");

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
    <div className="flex items-center gap-3 flex-wrap bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground pl-1"><CalendarRange size={14} /></div>
      <select
        value={preset}
        onChange={(e) => applyPreset(e.target.value as DateRangePreset)}
        className="text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors"
      >
        {PRESETS.map((p) => <option key={p} value={p}>{presetLabel[p]}</option>)}
      </select>

      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <input type="date" value={filters.from} onChange={(e) => onChange({ ...filters, from: e.target.value })}
            className="text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors font-mono" />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="date" value={filters.to} onChange={(e) => onChange({ ...filters, to: e.target.value })}
            className="text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors font-mono" />
        </div>
      )}

      <select
        value={filters.department}
        onChange={(e) => onChange({ ...filters, department: e.target.value })}
        className="text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors ml-auto"
      >
        <option value="all">{t("dashboard.filter.department.all")}</option>
        {availableDepartments.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>

      <select
        value={filters.salesperson}
        onChange={(e) => onChange({ ...filters, salesperson: e.target.value })}
        className="text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors"
      >
        <option value="all">{t("dashboard.filter.salesperson.all")}</option>
        {availableSalespeople.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}
