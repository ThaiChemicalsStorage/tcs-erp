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
 * เหมือน `printText()` แต่คืนสตริงว่างแทนขีดกลาง — **ใช้กับชื่อในช่องลายเซ็นเท่านั้น**
 *
 * เจ้าของสั่ง 2026-09-21 (*"เว้นว่างแทนขีดด้วย"*) · ช่องลงนามที่ยังไม่มีใครเซ็นคือช่องที่ตั้งใจเว้นไว้ให้
 * เขียนด้วยปากกา ไม่ใช่ข้อมูลที่หายไป — `-` ที่พิมพ์ทับตรงนั้นทำให้คนที่ต้องเซ็นต้องขีดฆ่ามันก่อน
 * คู่กับ `printDateOrBlank()` ที่มีเหตุผลเดียวกันสำหรับฝั่งวันที่
 *
 * **อย่าเอาไปใช้กับข้อมูลจริง** (รหัสสินค้า ชื่อสินค้า หน่วย ผู้ขาย รหัสงาน) — ตรงนั้น `-` ถูกแล้ว
 * เพราะมันบอกว่า "ไม่มีค่า" ซึ่งต่างจากช่องว่างที่อ่านเหมือนลืมพิมพ์
 */
export function printTextOrBlank(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return text === "" ? "" : text;
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

/**
 * `YYYY-MM-DD…` → `วว/ดด/ปป` แบบ **พ.ศ. สองหลัก** (`2026-09-18` → `18/09/69`) · ค่าว่าง/ผิดรูป → `""`
 *
 * ใช้เฉพาะใบพิมพ์ที่ลอกฟอร์มของโปรแกรมบัญชีเดิม (2026-09-23 — ใบจ่าย/ใบรับคืน/ใบรับสินค้า/ใบรับวางบิลของสโตร์)
 * ซึ่งพิมพ์วันที่แบบนี้ทุกช่อง · ใบพิมพ์อื่นยังเป็น ค.ศ. เต็มตาม `printDate()` ด้านบน
 */
export function printDateShortBE(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? "").trim());
  if (!m) return "";
  return `${m[3]}/${m[2]}/${String((Number(m[1]) + 543) % 100).padStart(2, "0")}`;
}

/** บวกจำนวนวันให้วันที่ `YYYY-MM-DD` (คิดแบบปฏิทิน ไม่สนเขตเวลา) · ค่าผิดรูป → `""` */
export function addDaysIso(value: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((value ?? "").trim());
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/**
 * ที่อยู่สองบรรทัดตามฟอร์มของโปรแกรมบัญชีเดิม — ขึ้นบรรทัดใหม่ตามที่กรอกไว้ ถ้าไม่มีตัดที่ช่องว่างใกล้กลางที่สุด
 * (ที่อยู่ไม่เกิน 40 ตัวอักษรอยู่บรรทัดเดียว)
 */
export function splitAddressTwoLines(address: string): [string, string] {
  const text = (address ?? "").trim();
  const byLine = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return [byLine[0], byLine.slice(1).join(" ")];
  if (text.length <= 40) return [text, ""];
  const mid = Math.floor(text.length / 2);
  for (let d = 0; d < mid; d++) {
    if (text[mid - d] === " ") return [text.slice(0, mid - d), text.slice(mid - d + 1)];
    if (text[mid + d] === " ") return [text.slice(0, mid + d), text.slice(mid + d + 1)];
  }
  return [text, ""];
}
