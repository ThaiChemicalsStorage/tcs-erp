import { useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { type DateRangePreset, type DateRangeValue } from "../lib/dateRanges";
import { useI18n } from "../lib/i18n";

/**
 * ตัวกรองช่วงวันที่สำหรับ**หน้ารายการเอกสารทุกหน้า** — เพิ่ม 2026-09-21 ตามคำสั่งเจ้าของ:
 * *"อยากให้สามารถ filter เป็นวันเดือนปีได้ แบบในช่วงเดือนนี้ ในวันนี้ ในปีนี้ เพราะมันต้องเก็บเอกสาร
 * 10 ปี ไม่มีใครมานั่งเลื่อนดูเอกสารเองหรอก"*
 *
 * ใช้ `rangeForPreset()` ตัวเดียวกับแดชบอร์ด (`src/lib/dateRanges.ts` ซึ่งย้ายออกมาจาก
 * `pages/dashboard/` ในวันเดียวกัน) — ช่วง "เดือนนี้" ของหน้ารายการกับของแดชบอร์ดจึงหมายถึง
 * ช่วงเดียวกันเป๊ะ และคิดตาม **เวลาไทย UTC+7** เหมือนเลขที่เอกสารทั้งระบบ
 *
 * กรองฝั่งหน้าจอ ไม่ได้ยิง query ใหม่ — หน้ารายการทุกหน้าโหลดข้อมูลมาทั้งชุดอยู่แล้ว การกรองที่นี่
 * จึงเห็นผลทันทีโดยไม่ต้องรอเน็ต · ถ้าวันหนึ่งข้อมูลโตจนต้องแบ่งหน้า ค่อยย้ายไปกรองฝั่งเซิร์ฟเวอร์
 * โดยใช้ `rangeForPreset()` ตัวเดิมส่ง `from`/`to` ไปเป็น query string
 */

/** พรีเซ็ตที่หน้ารายการเอกสารใช้ — ชุดย่อยของแดชบอร์ด เอาเฉพาะที่ตอบคำถาม "หาเอกสารช่วงไหน" */
const PRESETS: DateRangePreset[] = ["all", "today", "thisMonth", "lastMonth", "thisYear", "custom"];

export function DateRangeFilter({ value, onChange }: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
}) {
  const { t } = useI18n();
  const [customOpen, setCustomOpen] = useState(value.preset === "custom");

  const label: Record<DateRangePreset, string> = {
    all: t("dateFilter.all"),
    today: t("dateFilter.today"),
    yesterday: t("dateFilter.yesterday"),
    last7: t("dateFilter.last7"),
    last14: t("dateFilter.last14"),
    thisMonth: t("dateFilter.thisMonth"),
    lastMonth: t("dateFilter.lastMonth"),
    thisQuarter: t("dateFilter.thisQuarter"),
    thisYear: t("dateFilter.thisYear"),
    custom: t("dateFilter.custom"),
  };

  const pick = (preset: DateRangePreset) => {
    setCustomOpen(preset === "custom");
    onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap" data-tour="date-filter">
      <CalendarRange size={14} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap" role="group" aria-label={t("dateFilter.label")}>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => pick(p)}
            aria-pressed={value.preset === p}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
              value.preset === p ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label[p]}
          </button>
        ))}
      </div>

      {customOpen && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })}
            aria-label={t("dateFilter.from")}
            className="h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })}
            aria-label={t("dateFilter.to")}
            className="h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {(value.from || value.to) && (
            <button
              type="button"
              onClick={() => onChange({ preset: "custom", from: "", to: "" })}
              aria-label={t("dateFilter.clear")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
