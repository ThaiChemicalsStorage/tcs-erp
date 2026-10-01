/** ตัวช่วยจัดรูปแบบของแท็บแผนก — แยกจากไฟล์คอมโพเนนต์เพื่อให้ fast refresh ของ Vite ทำงาน */

export const fmtCount = (n: number) => n.toLocaleString("th-TH");

/** จำนวนวันจาก `from` ถึง `to` (YYYY-MM-DD) — ติดลบ = `to` มาก่อน */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** "2026-09" → "ก.ย." / "Sep" — ป้ายแกนของกราฟ 12 เดือน */
export function fmtMonthShort(month: string, lang: "th" | "en"): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { month: "short", timeZone: "UTC" });
}

/** ป้ายแกนตัวเลขแบบย่อไม่มีสกุลเงิน — 1200000 → "1.2M" · 450000 → "450K" (แกนกราฟเงินในแดชบอร์ด) */
export function fmtAxis(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${Number((abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1))}M`;
  if (abs >= 1_000) return `${sign}${Number((abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1))}K`;
  return `${sign}${abs.toLocaleString("th-TH")}`;
}

/** "2026-10-01" → "วันพฤหัสบดีที่ 1 ตุลาคม 2569" / "Thursday, October 1, 2026" — บรรทัดทักทายบนหัวแดชบอร์ด */
export function fmtLongDate(iso: string, lang: "th" | "en"): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "th" ? "th-TH" : "en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
