/**
 * Accounts Receivable calculation engine (added 2026-08-17) — pure functions, shared between
 * `arHandler.ts` (server-authoritative) and the Issue Billing Set wizard's preview step (client-side
 * instant feedback), same "never trust client-computed amounts" pattern `api/_lib/quoteAmounts.ts`
 * already established for Quotation. See docs/MODULES/Accounting.md for the two real worked examples
 * (K.Thai Hydraulic, VS Chem) this must reproduce exactly, to the satang.
 *
 * Formulas (spec §6):
 *   milestoneGross   = totalContractValueExVat * (pct / 100)
 *   depositDeduction = downPaymentPct * totalContractValueExVat   (negative line, deposit milestones only)
 *   valueAmount      = milestoneGross - |depositDeduction|
 *   vatAmount        = round(valueAmount * 0.07, 2)
 *   netTotal         = valueAmount + vatAmount
 *   whtExpected      = round(serviceValueExVat * 0.03, 2)         (service work only, recorded at payment — Phase 2)
 *   dueDate          = docDate + creditDays   (cash -> docDate)
 */

const VAT_RATE = 7;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * A down-payment/deposit milestone's invoice is a single line: `pct% of the total contract value`.
 * Verified against both worked examples: K.Thai Hydraulic's AR6907008 = 40% x 210,000 = 84,000;
 * VS Chem's AR6907005 = 30% x 262,000 = 78,600.
 */
export function computeDownPaymentLineAmount(totalContractValueExVat: number, pct: number): number {
  return round2(totalContractValueExVat * (pct / 100));
}

/**
 * A non-deposit ("final") milestone's invoice is NOT `pct% of the total` as a single line — it's
 * the Scope of Work's real Quotation line items (their actual qty/unit price, unscaled) plus a
 * deduction line for whatever deposit was already invoiced. Verified against both worked examples:
 * K.Thai Hydraulic's IV6908014 items 1-3 sum to the FULL 210,000 contract value (100 sqm x 1,600 +
 * 25 x 1,600 + 1 x 10,000), not 60% of it — the "60%" in the line label is descriptive text, not a
 * scaled amount. The deduction line's amount must be the already-issued deposit AR document's own
 * frozen `valueAmount` (not recomputed from `pct` fresh) — see `computeDownPaymentLineAmount()`'s
 * doc comment above; `arHandler.ts` pulls it directly off that record when building this deduction
 * line, this function intentionally doesn't recompute it. This 2-milestone (deposit + final) shape
 * is what Phase 1 is built and tested against; a 3rd/4th milestone beyond that pattern needs its own
 * confirmed worked example before this logic can be trusted for it — see docs/MODULES/Accounting.md.
 */
export function computeDepositDeductionLineAmount(depositDocumentValueAmount: number): number {
  return -round2(depositDocumentValueAmount);
}

export interface ArDocumentTotals {
  subtotal: number;
  discount: number;
  valueAmount: number;
  vatAmount: number;
  netTotal: number;
}

/** Sums a document's lines (deduction lines already carry a negative `amount`) and derives VAT/net. */
export function computeArDocumentTotals(lineAmounts: readonly number[], discount = 0): ArDocumentTotals {
  const subtotal = round2(lineAmounts.reduce((s, a) => s + a, 0));
  const valueAmount = round2(subtotal - discount);
  const vatAmount = round2(valueAmount * (VAT_RATE / 100));
  const netTotal = round2(valueAmount + vatAmount);
  return { subtotal, discount: round2(discount), valueAmount, vatAmount, netTotal };
}

/** Withholding tax expected on a service-work payment — recorded at payment time (Phase 2's RE),
 * exposed here since the issuing wizard's stamp-duty/WHT preview needs the same 3% figure. */
export function computeWhtExpected(serviceValueExVat: number): number {
  return round2(serviceValueExVat * 0.03);
}

/** Stamp duty (spec §9): service/contract work only. Contract value < ฿1,000,000 -> affix physical
 * stamps; >= ฿1,000,000 -> pay duty online/at the Revenue office ("สลักหลัง"). Duty = ฿1 per ฿1,000
 * of contract value, rounded up (a partial ฿1,000 still owes a full extra baht). */
export interface StampDutyResult {
  required: boolean;
  method: "affix" | "online" | null;
  amount: number;
}
export function computeStampDuty(contractValueExVat: number, workClassification: "goods" | "service" | "contract"): StampDutyResult {
  if (workClassification === "goods") return { required: false, method: null, amount: 0 };
  const amount = Math.ceil(contractValueExVat / 1000);
  const method = contractValueExVat >= 1_000_000 ? "online" : "affix";
  return { required: true, method, amount };
}

/** `docDate + creditDays` for Credit terms, or `docDate` unchanged for Cash. `docDate`/result are
 * plain `YYYY-MM-DD` strings — parsed/formatted in UTC so the date math never shifts a day under a
 * local timezone offset (the server always deals in date-only values here, never date-times). */
export function computeDueDate(docDate: string, paymentType: "" | "Cash" | "Credit", creditDays: number | null): string {
  if (paymentType !== "Credit" || !creditDays) return docDate;
  const d = new Date(`${docDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + creditDays);
  return d.toISOString().slice(0, 10);
}
