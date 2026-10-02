/**
 * นับวันทำการของงานจัดซื้อ (เจ้าของสั่ง 2026-10-02) — **จันทร์–ศุกร์เท่านั้น ไม่นับเสาร์–อาทิตย์**
 * และ**ไม่สนวันหยุดนักขัตฤกษ์** (*"นับจันทร์-ศุกร์ก็พอนักขัตช่างมัน"*) จึงไม่มีปฏิทินวันหยุด
 *
 * ไฟล์นี้ถูก import ทั้งฝั่งหน้าจอและฝั่งเซิร์ฟเวอร์ (แดชบอร์ด) — ห้าม import อะไรที่เป็น React/i18n
 * (ดู `tests/serverImportGraph.test.ts`)
 *
 * กติกา:
 * - วันที่ใบถึง = วันที่ 0 · วันทำการถัดไปคือวันที่ 1
 * - ใบถึงวันเสาร์หรืออาทิตย์ = ถือว่าถึงวันจันทร์ถัดไป (วันจันทร์นั้นเป็นวันที่ 0)
 * - วันที่สิ้นสุดก่อนวันเริ่ม = 0 (ไม่ติดลบ)
 */

/** เป้าออกใบสั่งซื้อหลังใบขอซื้อถึงฝ่ายจัดซื้อ (เจ้าของตอบ 2026-10-02) */
export const PURCHASING_TARGET_DAYS = { normal: 7, urgent: 3 } as const;

export function purchasingTargetDays(urgent: boolean | undefined): number {
  return urgent ? PURCHASING_TARGET_DAYS.urgent : PURCHASING_TARGET_DAYS.normal;
}

/** "YYYY-MM-DD" (หรือ ISO เต็ม) → วันที่ตามปฏิทินแบบ UTC ไม่ให้เขตเวลาของเครื่องเลื่อนวัน */
function dayOf(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

const DAY_MS = 86_400_000;

function rollToWeekday(d: Date): Date {
  const dow = d.getUTCDay();
  if (dow === 6) return new Date(d.getTime() + 2 * DAY_MS);
  if (dow === 0) return new Date(d.getTime() + DAY_MS);
  return d;
}

/** จำนวนวันทำการตั้งแต่ `fromIso` ถึง `toIso` — ค่าว่าง/อ่านไม่ออกได้ `null` */
export function businessDaysBetween(fromIso: string, toIso: string): number | null {
  const from = dayOf(fromIso);
  const to = dayOf(toIso);
  if (!from || !to) return null;
  const start = rollToWeekday(from);
  if (to.getTime() <= start.getTime()) return 0;
  let count = 0;
  for (let t = start.getTime() + DAY_MS; t <= to.getTime(); t += DAY_MS) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

/** จำนวนวันตามปฏิทิน (ไว้แสดงคู่กัน "3 วันทำการ (5 วันตามปฏิทิน)") */
export function calendarDaysBetween(fromIso: string, toIso: string): number | null {
  const from = dayOf(fromIso);
  const to = dayOf(toIso);
  if (!from || !to) return null;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));
}

/** วันครบกำหนดเป้า — วันทำการที่ `days` นับจาก `fromIso` (YYYY-MM-DD) */
export function addBusinessDays(fromIso: string, days: number): string {
  const from = dayOf(fromIso);
  if (!from) return "";
  let d = rollToWeekday(from);
  let left = days;
  while (left > 0) {
    d = new Date(d.getTime() + DAY_MS);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

export type AgingTone = "ok" | "due" | "over";

/** ใช้ไปเทียบกับเป้า: ยังไม่ถึง = ok · ครบกำหนดวันนี้ = due · เลยแล้ว = over */
export function agingTone(days: number, target: number): AgingTone {
  if (days > target) return "over";
  if (days === target) return "due";
  return "ok";
}

/** วันนี้แบบ YYYY-MM-DD ตามเวลาไทย — เซิร์ฟเวอร์รันเป็น UTC จึงต้องเลื่อน +7 ชม. เอง */
export function todayInThailand(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}
