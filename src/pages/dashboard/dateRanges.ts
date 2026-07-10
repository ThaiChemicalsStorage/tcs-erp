export type DateRangePreset = "today" | "yesterday" | "last7" | "last14" | "thisMonth" | "lastMonth" | "thisQuarter" | "thisYear" | "custom" | "all";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Computes {from, to} for every preset except "custom" (caller supplies its own range) and "all" (no filter). */
export function rangeForPreset(preset: DateRangePreset): { from: string; to: string } | null {
  const now = new Date();
  const today = iso(now);
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = iso(new Date(now.getTime() - 86400000));
      return { from: y, to: y };
    }
    case "last7":
      return { from: iso(new Date(now.getTime() - 6 * 86400000)), to: today };
    case "last14":
      return { from: iso(new Date(now.getTime() - 13 * 86400000)), to: today };
    case "thisMonth":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "lastMonth":
      return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case "thisQuarter":
      return { from: iso(new Date(now.getFullYear(), now.getMonth() - (now.getMonth() % 3), 1)), to: today };
    case "thisYear":
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: today };
    case "custom":
    case "all":
      return null;
  }
}
