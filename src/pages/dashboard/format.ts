// จัดรูปแบบตัวเลขเป็นสกุลเงินบาทแบบย่อ เช่น ฿1.50M หรือ ฿2.3K
// Formats a number as a compact Thai Baht string, e.g. ฿1.50M or ฿2.3K.
export function fmtShort(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${sign}฿${(abs / 1000000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}฿${(abs / 1000).toFixed(1)}K`;
  return `${sign}฿${abs.toLocaleString("th-TH")}`;
}

export function fmtPercent(n: number): string {
  return `${n.toLocaleString("th-TH", { maximumFractionDigits: 1 })}%`;
}

export function fmtDays(n: number, unit: string): string {
  return `${n.toLocaleString("th-TH", { maximumFractionDigits: 1 })} ${unit}`;
}

// แสดง "—" เฉพาะกรณีไม่มีข้อมูล (null) ส่วนค่า 0.0 วันจริงจะแสดงเป็น "0.0 <หน่วย>"
// Renders "—" only for null (no data); a genuine 0.0-day average still shows as "0.0 <unit>".
export function fmtDaysOrDash(n: number | null, unit: string): string {
  return n === null ? "—" : fmtDays(n, unit);
}

// แสดง "—" เฉพาะกรณีไม่มีข้อมูล (null) ส่วนค่า 0% จริงจะแสดงเป็น "0%"
// Renders "—" only for null; a genuine 0% rate still shows as "0%".
export function fmtPercentOrDash(n: number | null): string {
  return n === null ? "—" : fmtPercent(n);
}

// แปลง "YYYY-MM-DD" เป็นวันที่แบบย่อตามภาษา เช่น "13 ก.ค. 2026" / "13 Jul 2026"
// Converts "YYYY-MM-DD" into a short localized date string, e.g. "13 ก.ค. 2026" / "13 Jul 2026".
export function fmtDateShort(iso: string, locale: "th" | "en"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short" });
}

// แปลงคีย์ช่วงเวลาเป็นป้ายแสดงผลสั้น ๆ (สัปดาห์/เดือน/ไตรมาส/ปี)
// Short display label for a revenue-trend period key — week, month, quarter, or year format.
export function periodLabel(period: string): string {
  if (/^\d{4}-W\d{2}$/.test(period)) return period.slice(5);
  if (/^\d{4}-Q\d$/.test(period)) return `${period.slice(5)} '${period.slice(2, 4)}`;
  if (/^\d{4}-\d{2}$/.test(period)) return monthLabel(period);
  return period;
}
