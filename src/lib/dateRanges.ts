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

/**
 * ─── ตัวกรองช่วงวันที่ของหน้ารายการเอกสาร (2026-09-21) ───────────────────────────────
 *
 * เจ้าของสั่ง: *"อยากให้สามารถ filter เป็นวันเดือนปีได้ แบบในช่วงเดือนนี้ ในวันนี้ ในปีนี้
 * เพราะมันต้องเก็บเอกสาร 10 ปี ไม่มีใครมานั่งเลื่อนดูเอกสารเองหรอก"*
 *
 * อยู่ไฟล์เดียวกับ `rangeForPreset()` โดยตั้งใจ — "เดือนนี้" ของหน้ารายการกับของแดชบอร์ดต้อง
 * หมายถึงช่วงเดียวกันเป๊ะ ถ้าแยกไฟล์แล้วมีคนแก้ที่เดียว สองที่จะเพี้ยนจากกันโดยไม่มีอะไรฟ้อง
 */

export interface DateRangeValue {
  preset: DateRangePreset;
  /** ใช้เฉพาะตอน preset เป็น "custom" — รูปแบบ YYYY-MM-DD */
  from: string;
  to: string;
}

export const ALL_DATES: DateRangeValue = { preset: "all", from: "", to: "" };

/** ช่วงวันที่ที่ใช้จริงจากค่าที่เลือก · `null` = ไม่กรอง */
export function resolveRange(value: DateRangeValue): { from: string; to: string } | null {
  if (value.preset === "custom") {
    if (!value.from && !value.to) return null;
    // กรอกด้านเดียวได้ — "ตั้งแต่วันนี้เป็นต้นไป" หรือ "ก่อนวันนี้" เป็นคำถามที่คนถามจริง
    return { from: value.from || "0000-01-01", to: value.to || "9999-12-31" };
  }
  return rangeForPreset(value.preset);
}

/**
 * เอกสารใบนี้อยู่ในช่วงที่เลือกหรือไม่
 *
 * `iso` อาจเป็นวันที่ล้วน (`2026-09-21`) หรือ timestamp เต็ม (`2026-09-21T10:30:00.000Z`)
 * แล้วแต่ฟิลด์ · **timestamp เก็บเป็น UTC แต่ช่วงวันที่คิดตามเวลาไทย** — เอกสารที่บันทึกหลัง
 * 17:00 UTC เป็นของ "วันพรุ่งนี้" ตามเวลาไทย ซึ่งตรงกับวันที่ผู้ใช้เห็นบนหน้าจอ จึงต้องแปลงก่อนตัด
 * ถ้าตัดสตริงดิบ ๆ เอกสารที่สร้างตอนเย็นจะหายไปจากตัวกรอง "วันนี้" โดยไม่มีอะไรฟ้อง
 */
export function isWithinRange(iso: string | undefined, range: { from: string; to: string } | null): boolean {
  if (!range) return true;
  if (!iso) return false;
  const day = iso.length > 10
    ? new Date(new Date(iso).getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)
    : iso.slice(0, 10);
  return day >= range.from && day <= range.to;
}
