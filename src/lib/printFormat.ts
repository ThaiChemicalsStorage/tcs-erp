/**
 * ตัวช่วยจัดรูปแบบค่าบน "ใบพิมพ์" ทุกใบ — เพิ่ม 2026-09-02 ตามคำสั่งเจ้าของสองข้อพร้อมกัน:
 *
 *   1. *"เปลี่ยนเป็นวันเดือนปี"* — ใบพิมพ์หลายใบยิงค่า ISO ดิบ (`2026-09-02`, ปี-เดือน-วัน) ลงกระดาษ
 *      ตรง ๆ ซึ่งอ่านผิดลำดับกับที่คนไทยอ่าน `printDate()` เปลี่ยนเป็น `02/09/2026` (วัน/เดือน/ปี)
 *   2. *"ใส่ - ให้กับรายละเอียดทุกอัน"* — ช่องที่ไม่มีค่าเคยพิมพ์ออกมาเป็นที่ว่างเปล่า แยกไม่ออกว่า
 *      "ไม่มีข้อมูล" หรือ "ลืมกรอก" ทุกตัวช่วยในไฟล์นี้จึงคืน `EMPTY_MARK` เมื่อค่าว่าง
 *
 * ใช้กับ **ใบพิมพ์เท่านั้น** — หน้าจอแก้ไขยังต้องเห็นช่องว่างเป็นช่องว่างจริง ๆ ไม่งั้นผู้ใช้จะเผลอคิดว่า
 * มีคนพิมพ์ขีดกลางไว้ในฟิลด์
 *
 * ปีที่พิมพ์เป็น **ค.ศ.** เหมือนเดิมทุกใบ ไม่ได้แปลงเป็น พ.ศ. — เจ้าของสั่งแค่เรื่องลำดับวันเดือนปี
 * การเปลี่ยนศักราชเป็นคนละเรื่องและจะทำให้เอกสารเก่า/ใหม่อ่านไม่ตรงกัน
 */

/** ขีดกลางที่ใช้แทน "ไม่มีข้อมูล" บนใบพิมพ์ */
export const EMPTY_MARK = "-";

/**
 * `YYYY-MM-DD` (หรือ ISO timestamp เต็ม) → `DD/MM/YYYY` · ค่าว่าง/รูปแบบผิด → `-`
 *
 * ตัดสตริงเอาตรง ๆ ไม่ผ่าน `new Date()` เพราะ `new Date("2026-09-02")` ถูกตีความเป็นเที่ยงคืน **UTC**
 * แล้ว `getDate()` อ่านกลับด้วยเขตเวลาเครื่อง — เครื่องที่ตั้งเวลาไว้ฝั่งลบจะได้วันที่เลื่อนไปหนึ่งวัน
 */
export function printDate(value: string | null | undefined): string {
  const iso = (value ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return EMPTY_MARK;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** เหมือน `printDate()` แต่คืนสตริงว่างแทนขีดกลาง — ใช้กับช่องลายเซ็นที่ตั้งใจเว้นไว้ให้เขียนมือ */
export function printDateOrBlank(value: string | null | undefined): string {
  const formatted = printDate(value);
  return formatted === EMPTY_MARK ? "" : formatted;
}

/** ข้อความใด ๆ · ว่าง (หรือมีแต่ช่องว่าง) → `-` */
export function printText(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text === "" ? EMPTY_MARK : text;
}

/**
 * ตัวเลข · `null`/`undefined`/`NaN` → `-`
 *
 * **ศูนย์ไม่ใช่ค่าว่าง** — "เบิก 0" เป็นข้อมูลจริงที่ต่างจาก "ยังไม่ได้กรอก" จึงพิมพ์ `0` ตามเดิม
 */
export function printNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_MARK;
  return String(value);
}

/** ตัวเลขเงิน/ปริมาณที่ต้องมีคั่นหลักพัน · ว่าง → `-` */
export function printAmount(value: number | null | undefined, fractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_MARK;
  return value.toLocaleString("en-US", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}
