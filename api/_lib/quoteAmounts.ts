/**
 * Shared quote-amount math — the one place both `api/_lib/quoteValidation.ts` (server-authoritative
 * `amount` on create/edit) and `api/dashboard/index.ts` (every Dashboard monetary total) compute a
 * quotation's value from its line items, so the two can never drift onto two different formulas.
 *
 * `Quote` has no stored pre-tax/subtotal field — only the VAT-included grand total (`amount`) is
 * persisted; `lines`/`discount` are the raw inputs used to compute it. Per the 2026-07-14 "Dashboard
 * pre-tax amounts" requirement, `computeQuoteAmountBeforeVat()` is the authoritative before-VAT
 * figure: it recomputes directly from line items (qty × unit price, line-level discount, then the
 * quote-level discount), the same inputs `computeQuoteAmountWithVat()` uses to derive the persisted
 * `amount` — it is never backed out by dividing a rounded VAT-included total by `1 + VAT_RATE/100`.
 * Every quotation has carried real `lines`/`discount` data since the 2026-07-08 rewrite (see
 * CHANGELOG.md — before that, `Quote` had no `lines` field at all and Save/Duplicate didn't work),
 * so there is no legacy-data case where this can't be computed: an empty `lines` array correctly
 * yields `0`, not a missing value.
 */
const VAT_RATE = 7;

export interface QuoteAmountLine {
  qty: number;
  unitPrice: number;
  discount: number;
}

/** The VAT base — item subtotal after line-level discounts, then the quote-level discount, before VAT is added. This is what "amount before VAT" means for a quotation. */
export function computeQuoteAmountBeforeVat(lines: readonly QuoteAmountLine[], discountPct: number): number {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice * (1 - l.discount / 100), 0);
  const discountAmt = subtotal * (discountPct / 100);
  return subtotal - discountAmt;
}

/** The persisted `Quote.amount` — before-VAT subtotal plus VAT. */
export function computeQuoteAmountWithVat(lines: readonly QuoteAmountLine[], discountPct: number): number {
  const afterDiscount = computeQuoteAmountBeforeVat(lines, discountPct);
  return afterDiscount + afterDiscount * (VAT_RATE / 100);
}
