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

/** "—" only for null (no data yet) — a genuine 0.0-day average renders as "0.0 <unit>", not a dash. */
export function fmtDaysOrDash(n: number | null, unit: string): string {
  return n === null ? "—" : fmtDays(n, unit);
}

/** "—" only for null — a genuine 0% rate renders as "0%", not a dash. */
export function fmtPercentOrDash(n: number | null): string {
  return n === null ? "—" : fmtPercent(n);
}

/** "YYYY-MM-DD" -> a short localized date, e.g. "13 ก.ค. 2026" / "13 Jul 2026" — used to label a rolling trend's anchor ("ending [date]"), not for period-key display (see periodLabel below for that). */
export function fmtDateShort(iso: string, locale: "th" | "en"): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale === "th" ? "th-TH" : "en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short" });
}

/** Short display label for a revenue-trend period key — "YYYY-MM" (month), "YYYY-Www" (week), "YYYY-Qn" (quarter), or "YYYY" (year). */
export function periodLabel(period: string): string {
  if (/^\d{4}-W\d{2}$/.test(period)) return period.slice(5);
  if (/^\d{4}-Q\d$/.test(period)) return `${period.slice(5)} '${period.slice(2, 4)}`;
  if (/^\d{4}-\d{2}$/.test(period)) return monthLabel(period);
  return period;
}
