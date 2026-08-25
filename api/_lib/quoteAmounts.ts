/**
 * Shared quote-amount math — the one place both `api/_lib/quoteValidation.ts` (server-authoritative
 * `amount` on create/edit) and `api/dashboard/index.ts` (every Dashboard monetary total) compute a
 * quotation's value from its line items, so the two can never drift onto two different formulas.
 *
 * As of 2026-08-25 the formula itself no longer lives here: it lives in `src/lib/quoteMath.ts` and
 * this file only re-exports it, the same frontend↔API sharing pattern already used for
 * `src/lib/validation/*` (see `api/handlers/quotes.ts`). That closes the last drift risk — the
 * frontend's on-screen totals and the server's authoritative `amount` are now literally the same
 * code, not two copies of the same formula. `src/lib/quoteMath.ts` is deliberately dependency-free,
 * so importing it into a Node function costs nothing — unlike `src/lib/quotes.ts`, which reaches
 * `apiClient.ts`. (Until 2026-08-25 that file was `quotes.tsx` and importing it also meant the
 * server had to transpile JSX at boot — the shape that crash-looped production on 2026-08-21.)
 *
 * `Quote` has no stored pre-tax/subtotal field — only the VAT-included grand total (`amount`) is
 * persisted; `lines`/`discount`/`discountMode` are the raw inputs used to compute it. Per the
 * 2026-07-14 "Dashboard pre-tax amounts" requirement, `computeQuoteAmountBeforeVat()` is the
 * authoritative before-VAT figure: it recomputes directly from line items (qty × unit price,
 * line-level discount, then the quote-level discount), the same inputs `computeQuoteAmountWithVat()`
 * uses to derive the persisted `amount` — it is never backed out by dividing a rounded VAT-included
 * total by `1 + VAT_RATE/100`. Every quotation has carried real `lines`/`discount` data since the
 * 2026-07-08 rewrite (see CHANGELOG.md — before that, `Quote` had no `lines` field at all and
 * Save/Duplicate didn't work), so there is no legacy-data case where this can't be computed: an
 * empty `lines` array correctly yields `0`, not a missing value. `discountMode` is newer still
 * (2026-08-25) and is optional: absent means "percent", which is what every pre-2026-08-25
 * quotation stored.
 */
export {
  VAT_RATE,
  lineDiscountAmount,
  lineSubtotal,
  resolveDiscountAmount,
  computeTotals,
  computeQuoteAmountBeforeVat,
  computeQuoteAmountWithVat,
} from "../../src/lib/quoteMath.js";
export type { DiscountMode, QuoteAmountLine } from "../../src/lib/quoteMath.js";
