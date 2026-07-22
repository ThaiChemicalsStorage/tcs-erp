/**
 * A "Rewrite/แก้ไข" (see `handleRewrite()` in `api/handlers/quotes.ts`) creates a brand-new MongoDB
 * document for each revision of a quotation — `QT-2567-0041`, `QT-2567-0041-R1`, `QT-2567-0041-R2`
 * are 3 separate documents in the `quotes` collection that all represent the same logical
 * quotation. No `parentQuoteId`/`revisionOf` field exists (see DATABASE.md) — the chain is
 * recoverable purely from each document's own `_id`, via the same `-R<digits>` suffix convention
 * `handleRewrite()` itself generates.
 *
 * Every Dashboard aggregate that counts or sums "quotations" must count each chain exactly once,
 * using the LATEST revision's data — never the superseded original, never a sum across every
 * revision — per an explicit 2026-07-22 business decision (a rewrite supersedes, not duplicates,
 * what it was rewritten from). This is the one shared place both `api/handlers/quotes.ts`
 * (generating the next revision number) and `api/dashboard/index.ts` (every quote-count/-value
 * aggregate) parse the `-R<digits>` suffix, so the two can never drift apart.
 */

/** Strips a quote id's trailing revision suffix (e.g. `QT-2567-0041-R2` → `QT-2567-0041`). Quote ids
 * never otherwise end in `-R<digits>`, so this is unambiguous. */
export function getRevisionRoot(id: string): string {
  return id.replace(/-R\d+$/, "");
}

/** The revision number encoded in a quote id, or `0` for an original (never-rewritten) quote — so
 * `0` always sorts lowest and a real `-R1`/`-R2`/... always "wins" as the latest revision. */
export function getRevisionNumber(id: string): number {
  const match = id.match(/-R(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Collapses a list of quote-like docs down to one entry per revision chain — whichever doc has the
 * highest revision number for its chain's root id (an unrewritten quote, or the newest rewrite of
 * one). Every Dashboard quote-count/-value aggregate must run its source data through this before
 * counting/summing, or a rewritten quotation is silently counted once per revision instead of once.
 * Output order is not guaranteed to match input order.
 */
export function dedupeQuotesByRevisionChain<T extends { _id: string }>(docs: readonly T[]): T[] {
  const latestByRoot = new Map<string, T>();
  for (const doc of docs) {
    const root = getRevisionRoot(doc._id);
    const existing = latestByRoot.get(root);
    if (!existing || getRevisionNumber(doc._id) > getRevisionNumber(existing._id)) {
      latestByRoot.set(root, doc);
    }
  }
  return [...latestByRoot.values()];
}
