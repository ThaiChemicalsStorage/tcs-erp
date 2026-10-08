/**
 * ตรรกะของช่องกรอกวันที่ `DateInput` (2026-10-08, Tuhmo #48) — แยกจากคอมโพเนนต์ให้เทสต์ได้โดยไม่ต้องเรนเดอร์ React
 *
 * เจ้าของ: *"บางเครื่องก็วันนำหน้าบางเครื่องเดือนนำหน้า อยากให้มันเป็นแบบวันนำหน้าหมดเลย และที่เป็นปีอยากให้เป็น พ.ศ."*
 * ช่อง `<input type="date">` ของเบราว์เซอร์แสดงตามภาษาของเครื่อง (Chrome อังกฤษ = mm/dd/yyyy) และไม่มีทางสั่งให้เป็น
 * วัน/เดือน หรือ พ.ศ. ได้ — จึงแสดงเองเป็น "วว/ดด/ปปปป" เสมอ ปีเป็น พ.ศ. ในโหมดไทย และ ค.ศ. ในโหมดอังกฤษ
 * (ตรงกับ `displayDate.ts`) · ค่าที่ส่งเข้า-ออกยังเป็น ISO "YYYY-MM-DD" เหมือนช่องเดิมทุกประการ ข้อมูลเก่าไม่กระทบ
 */

export type DateInputEra = "be" | "ce";

export const BE_OFFSET = 543;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-08" → { y: 2026, m: 10, d: 8 } · ค่าที่ไม่ใช่วันที่จริง (31 ก.พ.) = null */
export function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return isRealDate(y, mo, d) ? { y, m: mo, d } : null;
}

export function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** ISO → "08/10/2569" (be) / "08/10/2026" (ce) · ค่าว่างหรือผิดรูป = "" */
export function formatDateInput(iso: string, era: DateInputEra): string {
  const p = parseIso(iso);
  if (!p) return "";
  const year = era === "be" ? p.y + BE_OFFSET : p.y;
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${year}`;
}

/**
 * จัดรูปข้อความระหว่างพิมพ์ — พิมพ์ตัวเลขติดกัน "08102569" ได้ "08/10/2569" โดยไม่ต้องกด "/" เอง
 * พิมพ์ "/" เองก็ได้ ("8/10/2569" คงไว้ตามที่พิมพ์) · ตัวอักษรอื่นถูกตัดทิ้ง
 */
export function maskDateTyping(raw: string): string {
  // "-" "." และช่องว่างนับเป็นตัวคั่นเหมือน "/" (พิมพ์ 8-10-2569 หรือ 8.10.2569 ก็ได้วันที่เดียวกัน)
  const cleaned = raw.trim().replace(/[-.\s]+/g, "/").replace(/[^\d/]/g, "").replace(/^\/+/, "");
  if (cleaned.includes("/")) {
    // มี "/" แล้ว (พิมพ์เอง หรือเป็นตัวที่เราเติมให้ตอนพิมพ์ตัวเลขต่อเนื่อง) · ส่วนสุดท้ายที่ยังเป็นวัน/เดือนแต่ยาวเกิน 2 หลัก
    // = ผู้ใช้พิมพ์ต่อไปเรื่อย ๆ → ล้นไปส่วนถัดไป ("05/102" → "05/10/2") ไม่ใช่ตัดทิ้ง
    const parts = cleaned.split("/");
    while (parts.length < 3 && parts[parts.length - 1].length > 2) {
      const last = parts.pop()!;
      parts.push(last.slice(0, 2), last.slice(2));
    }
    return parts.slice(0, 3).map((p, i) => p.slice(0, i < 2 ? 2 : 4)).join("/");
  }
  const digits = cleaned.slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * ข้อความที่พิมพ์ → ISO · ยังพิมพ์ไม่ครบ/ไม่ใช่วันที่จริง = null
 *
 * ปี: ≥ 2400 ถือเป็น พ.ศ. เสมอ (ลบ 543) ไม่ว่าโหมดไหน · 4 หลักที่ต่ำกว่านั้นเป็น ค.ศ. — คนไทยพิมพ์ "2026" ก็ได้วันที่ถูก ·
 * ปี 2 หลักตีความตามโหมด ("69" → พ.ศ. 2569 ในโหมดไทย · "26" → ค.ศ. 2026 ในโหมดอังกฤษ)
 */
export function parseDateInput(text: string, era: DateInputEra): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(text.trim());
  if (!m) return null;
  const d = Number(m[1]), mo = Number(m[2]);
  let y = Number(m[3]);
  if (m[3].length === 2) {
    // 2 หลัก: โหมดไทยเติม 25 (69 → 2569) · โหมดอังกฤษเติม 20 (26 → 2026)
    y = era === "be" ? 2500 + y : 2000 + y;
  }
  if (y >= 2400) y -= BE_OFFSET;
  return isRealDate(y, mo, d) ? toIso(y, mo, d) : null;
}

/** อยู่ในช่วง min/max (ISO, รวมขอบ) ไหม · min/max ว่าง = ไม่จำกัด */
export function isWithinRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** ตารางวันในปฏิทินเดือนหนึ่ง เริ่มวันอาทิตย์ · ช่องก่อนวันที่ 1 เป็น null */
export function monthGrid(y: number, m: number): (number | null)[] {
  const first = new Date(y, m - 1, 1).getDay();
  const cells: (number | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** วันนี้ตามเวลาเครื่อง เป็น ISO — ใช้ปุ่ม "วันนี้" และไฮไลต์ในปฏิทิน */
export function todayIso(now: Date = new Date()): string {
  return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** เลื่อนวันที่ ISO ไป n วัน (ใช้ลูกศรในปฏิทิน) */
export function addDaysIso(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const d = new Date(p.y, p.m - 1, p.d + n);
  return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
