export type DateRangePreset = "today" | "yesterday" | "last7" | "last14" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "custom" | "all";

/**
 * Thailand is UTC+7 with no DST. Every date below is computed by shifting the current instant
 * by this fixed offset and then reading it back through UTC getters/`Date.UTC` only, never local
 * ones — mixing `new Date(y, m, d)` (local) with `.toISOString()` (UTC) shifts every boundary
 * back a day for any positive-UTC-offset user, and relying on the local getters alone would only
 * be correct if the browser's (or, server-side, Vercel's) configured timezone happens to be
 * Thailand's, which isn't guaranteed. This fixed-offset technique is correct regardless of the
 * runtime's ambient timezone.
 */
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

function bangkokNow(): Date {
  return new Date(Date.now() + BANGKOK_OFFSET_MS);
}
function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}

/** Computes {from, to} for every preset except "custom" (caller supplies its own range) and "all" (no filter). */
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
