/**
 * Pure quotation money math — the single source of truth for how a quotation's value is computed,
 * shared verbatim between the frontend (`src/lib/quotes.tsx`, `LineItemsEditor`, `PrintDocument`)
 * and the API bundle (`api/_lib/quoteAmounts.ts` re-exports this file, which `api/_lib/
 * quoteValidation.ts` and `api/dashboard/index.ts` build on). It deliberately contains no React,
 * no JSX and no imports, so the Node-side bundle can pull it in the same way it already pulls in
 * `src/lib/validation/*`.
 *
 * **Discount modes (added 2026-08-25).** Both the line-level discount and the quote-level
 * "ส่วนลดพิเศษ" can be entered either as a percentage or as a straight baht amount, chosen per
 * document via `discountMode`. `discountMode` is optional everywhere and **absent means
 * `"percent"`** — that is what every quotation created before 2026-08-25 stored, so old records
 * keep computing exactly as they always did with no migration.
 *
 * A discount is always clamped into `[0, base]`: entering a baht discount larger than what is
 * being discounted zeroes that base out rather than producing a negative total.
 */

export type DiscountMode = "percent" | "amount";

export const VAT_RATE = 7;

export interface QuoteAmountLine {
  qty: number;
  unitPrice: number;
  discount: number;
  discountMode?: DiscountMode;
}

/** Clamps a raw discount figure into `[0, base]` so a too-large baht discount can never go negative. */
function clampDiscount(raw: number, base: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, Math.max(base, 0));
}

/** Resolves a discount input (percent or baht) against the amount it is being taken off. */
export function resolveDiscountAmount(base: number, discount: number, mode: DiscountMode | undefined): number {
  const raw = mode === "amount" ? discount : base * (discount / 100);
  return clampDiscount(raw, base);
}

/** จำนวนเงินส่วนลดของรายการเดียว — the baht value of one line's own discount. */
export function lineDiscountAmount(line: QuoteAmountLine): number {
  return resolveDiscountAmount(line.qty * line.unitPrice, line.discount, line.discountMode);
}

/** มูลค่ารายการหลังหักส่วนลดของรายการนั้น — qty × unit price, minus that line's own discount. */
export function lineSubtotal(line: QuoteAmountLine): number {
  return line.qty * line.unitPrice - lineDiscountAmount(line);
}

/** The full totals breakdown a quotation shows on screen and in print. */
export function computeTotals(
  lines: readonly QuoteAmountLine[],
  discount: number,
  discountMode?: DiscountMode,
) {
  const subtotal = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const discountAmt = resolveDiscountAmount(subtotal, discount, discountMode);
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = afterDiscount * (VAT_RATE / 100);
  const total = afterDiscount + vatAmt;
  return { subtotal, discountAmt, afterDiscount, vatAmt, total };
}

/** The VAT base — item subtotal after line-level discounts, then the quote-level discount, before VAT is added. */
export function computeQuoteAmountBeforeVat(
  lines: readonly QuoteAmountLine[],
  discount: number,
  discountMode?: DiscountMode,
): number {
  return computeTotals(lines, discount, discountMode).afterDiscount;
}

/** The persisted `Quote.amount` — before-VAT subtotal plus VAT. */
export function computeQuoteAmountWithVat(
  lines: readonly QuoteAmountLine[],
  discount: number,
  discountMode?: DiscountMode,
): number {
  return computeTotals(lines, discount, discountMode).total;
}
