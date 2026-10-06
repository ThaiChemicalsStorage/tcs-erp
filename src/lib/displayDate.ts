/**
 * วันที่บน "หน้าจอ" ตามภาษาที่ผู้ใช้เลือก (added 2026-10-06, Tuhmo #45) — โหมดไทย: พ.ศ. + เดือนไทย
 * (เหมือนเดิมทุกอย่าง) · โหมดอังกฤษ: ค.ศ. + เดือนอังกฤษ ("6 Oct 2026")
 *
 * **ใบพิมพ์และไฟล์ส่งออกไม่ใช้ไฟล์นี้** — ยังเป็นภาษาไทยเสมอ (`formatQuoteDateThai`, `printDate`, `formatArDocDate`)
 * เหตุผลเดียวกับที่ใบพิมพ์ไม่แปลภาษา: เอกสารที่ส่งลูกค้า/เก็บเข้าแฟ้มต้องไม่เปลี่ยนตามการตั้งค่าของคนกดพิมพ์
 *
 * ไม่มี React — `I18nProvider` เรียก `setDisplayLang()` ระหว่าง render เพื่อให้ลูกทุกตัวที่ render ตามมาได้ภาษาใหม่ทันที
 * (อ่าน localStorage อย่างเดียวไม่พอ เพราะ provider เขียนลง localStorage ใน useEffect ซึ่งรันหลัง render)
 * ฝั่งเซิร์ฟเวอร์ไม่มี window → เป็นไทยเสมอ
 */

export type DisplayLang = "th" | "en";

let current: DisplayLang | null = null;

export function setDisplayLang(lang: DisplayLang): void {
  current = lang;
}

export function getDisplayLang(): DisplayLang {
  if (current) return current;
  try {
    if (typeof window !== "undefined" && window.localStorage.getItem("tcs_erp_lang") === "en") return "en";
  } catch { /* storage ปิดอยู่ — ใช้ไทย */ }
  return "th";
}

// ICU ของ en-GB ย่อกันยายนเป็น "Sept" — ใช้ตารางเองให้ได้ตัวย่อสามตัวอักษรเหมือนกันทุกเดือน
const EN_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isEn(): boolean {
  return getDisplayLang() === "en";
}

function locale(): string {
  return getDisplayLang() === "en" ? "en-GB" : "th-TH";
}

function toDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (!value) return null;
  // "YYYY-MM-DD" ล้วน ๆ = วันที่ตามปฏิทิน ไม่ใช่เวลา UTC เที่ยงคืน — แปลงเป็นเวลาท้องถิ่นไม่ให้เลื่อนวัน
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "6 ต.ค. 2569" / "6 Oct 2026" */
export function formatDisplayDate(value: string | Date): string {
  const d = toDate(value);
  if (!d) return "";
  if (isEn()) return `${d.getDate()} ${EN_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/** "6 ตุลาคม 2569" / "6 October 2026" */
export function formatDisplayDateLong(value: string | Date): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }) : "";
}

/** "6 ต.ค. 2569 14:05" / "6 Oct 2026, 14:05" */
export function formatDisplayDateTime(value: string | Date): string {
  const d = toDate(value);
  if (!d) return "";
  if (isEn()) return `${formatDisplayDate(d)}, ${formatDisplayTime(d)}`;
  return d.toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "14:05" — `seconds: true` ได้ "14:05:09" */
export function formatDisplayTime(value: string | Date, opts: { seconds?: boolean; timeZone?: string } = {}): string {
  const d = toDate(value);
  return d
    ? d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", ...(opts.seconds ? { second: "2-digit" } : {}), ...(opts.timeZone ? { timeZone: opts.timeZone } : {}) })
    : "";
}

/** "2026-09" → "กันยายน 2569" / "September 2026" */
export function formatDisplayMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" });
}

/** "2026-09" → "ก.ย." / "Sep" */
export function formatDisplayMonthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  if (isEn()) return EN_MONTHS_SHORT[m - 1] ?? month;
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short" });
}

/** ปีสองหลักของป้ายไตรมาส ฯลฯ — "69" (พ.ศ.) / "26" (ค.ศ.) */
export function displayYear2(year: number): string {
  return String((isEn() ? year : year + 543) % 100).padStart(2, "0");
}
