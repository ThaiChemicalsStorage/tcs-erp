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

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short" });
}
