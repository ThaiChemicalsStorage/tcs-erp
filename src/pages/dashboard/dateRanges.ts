export type DateRangePreset = "today" | "yesterday" | "last7" | "last14" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "custom" | "all";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokNow(): Date {
  return new Date(Date.now() + BANGKOK_OFFSET_MS);
}
function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

// วันที่วันนี้ (YYYY-MM-DD) ตามเวลาไทย UTC+7 ใช้เป็นวันอ้างอิงเมื่อไม่ได้เลือกช่วงวันที่
// Today's date (YYYY-MM-DD) in Thailand's fixed UTC+7 offset, used as a rolling trend's anchor date.
export function todayIsoBangkok(): string {
  const now = bangkokNow();
  return iso(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// คำนวณช่วง {from, to} ตามพรีเซ็ตที่เลือก ยกเว้น "custom" และ "all" ที่ไม่มีช่วงตายตัว
// Computes {from, to} for every preset except "custom" (caller-supplied range) and "all" (no filter).
export function rangeForPreset(preset: DateRangePreset): { from: string; to: string } | null {
  const now = bangkokNow();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const today = iso(y, m, d);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yest = iso(y, m, d - 1);
      return { from: yest, to: yest };
    }
    case "last7":
      return { from: iso(y, m, d - 6), to: today };
    case "last14":
      return { from: iso(y, m, d - 13), to: today };
    case "thisMonth":
      return { from: iso(y, m, 1), to: today };
    case "lastMonth":
      return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "thisQuarter":
      return { from: iso(y, m - (m % 3), 1), to: today };
    case "thisYear":
      return { from: iso(y, 0, 1), to: today };
    case "custom":
    case "all":
      return null;
  }
}
