import { countersCollection } from "./collections.js";

/**
 * Accounts Receivable document numbering (added 2026-08-17) — `{PREFIX}{YY}{MM}{SEQ}`, e.g.
 * `AR6907008`, matching the company's real existing "Express" accounting software numbering (read
 * straight off real reference PDFs, see docs/MODULES/Accounting.md) — not a scheme invented for this
 * ERP, one to match exactly.
 *
 * No existing counter uses this exact `PREFIX_YYMM` monthly-key shape: `quote_{YYMMDD}` (daily,
 * Gregorian `%100`, see api/handlers/quotes.ts's `todayYyMmDd()`) and `service_report_{buddhistYear}`
 * (yearly, Buddhist, see api/_lib/serviceReportHandler.ts's `nextServiceReportId()`) are each only
 * half the pattern. This copies `service_report_`'s **Buddhist**-year math, not `quote_`'s Gregorian
 * one — copying the wrong precedent would print the wrong century-digit on every single invoice.
 *
 * `yy`/`mm` are computed fresh on every call (never cached), so a New Year rollover is safe purely
 * because the counter `_id` naturally becomes a new string on Jan 1 — same reasoning `nextQuoteId()`
 * already relies on for its own daily rollover.
 */
export type ArDocumentPrefix = "AR" | "IV" | "BI" | "RE";

/** Bangkok-local Buddhist-era "YYMM", e.g. 2026-08 -> "2608" (พ.ศ. 2569 -> "69"). Exported for tests. */
export function bangkokBuddhistYyMm(now: Date = new Date()): { yy: string; mm: string } {
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const buddhistYear = bangkokNow.getUTCFullYear() + 543;
  const yy = String(buddhistYear % 100).padStart(2, "0");
  const mm = String(bangkokNow.getUTCMonth() + 1).padStart(2, "0");
  return { yy, mm };
}

export async function nextArDocNumber(
  counters: Awaited<ReturnType<typeof countersCollection>>,
  prefix: ArDocumentPrefix,
  /** Injectable for tests only (e.g. asserting a Dec 31 -> Jan 1 rollover) — real call sites never
   * pass this, letting it default to the real current time. */
  now: Date = new Date(),
): Promise<string> {
  const { yy, mm } = bangkokBuddhistYyMm(now);
  const key = `${prefix.toLowerCase()}_${yy}${mm}`;
  const result = await counters.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  const seq = result?.seq ?? 1;
  return `${prefix}${yy}${mm}${String(seq).padStart(3, "0")}`;
}
