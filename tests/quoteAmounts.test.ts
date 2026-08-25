import { describe, it, expect } from "vitest";
import { computeTotals, lineSubtotal, lineDiscountAmount, VAT_RATE, type QuoteLine, type DiscountMode } from "../src/lib/quotes";
import { computeQuoteAmountBeforeVat, computeQuoteAmountWithVat } from "../api/_lib/quoteAmounts";

/** Minimal real-shape QuoteLine — only the money-relevant fields vary per test. */
function line(qty: number, unitPrice: number, discount = 0, discountMode?: DiscountMode): QuoteLine {
  return {
    id: "l1", description: "item", qty, unitPrice, discount, discountMode,
    unit: "งาน", subDetails: [], tags: [],
  } as unknown as QuoteLine;
}

describe("quotation money math (client computeTotals)", () => {
  it("VAT rate is the documented fixed 7%", () => {
    expect(VAT_RATE).toBe(7);
  });

  it("single line, no discounts: 1,000 → VAT 70 → total 1,070", () => {
    const t = computeTotals([line(1, 1000)], 0);
    expect(t.subtotal).toBe(1000);
    expect(t.discountAmt).toBe(0);
    expect(t.afterDiscount).toBe(1000);
    expect(t.vatAmt).toBeCloseTo(70, 10);
    expect(t.total).toBeCloseTo(1070, 10);
  });

  it("line-level discount applies before the quote-level discount", () => {
    // 2 × 500 = 1,000, line discount 10% → 900; quote discount 10% → 810; VAT 7% → 866.70
    const t = computeTotals([line(2, 500, 10)], 10);
    expect(t.subtotal).toBeCloseTo(900, 10);
    expect(t.afterDiscount).toBeCloseTo(810, 10);
    expect(t.total).toBeCloseTo(866.7, 10);
  });

  it("multiple lines sum before the quote-level discount", () => {
    const t = computeTotals([line(1, 1000), line(3, 200, 50)], 0);
    // 1,000 + (600 × 0.5) = 1,300
    expect(t.subtotal).toBeCloseTo(1300, 10);
    expect(t.total).toBeCloseTo(1300 * 1.07, 10);
  });

  it("empty lines yield zero, not NaN", () => {
    const t = computeTotals([], 10);
    expect(t.subtotal).toBe(0);
    expect(t.total).toBe(0);
  });

  it("lineSubtotal: qty × unitPrice × (1 − discount%)", () => {
    expect(lineSubtotal(line(4, 250, 25))).toBeCloseTo(750, 10);
  });
});

// ส่วนลดที่ระบุเป็นจำนวนเงิน (เพิ่ม 2026-08-25) — ตัวเลขเดิมที่ไม่มี discountMode ต้องคิดเป็น % เหมือนเดิม
// Baht-amount discounts, added 2026-08-25. The load-bearing guarantee here is backwards
// compatibility: a line or document with no `discountMode` is every quotation written before that
// date, and must keep computing exactly as a percentage.
describe("discount entered as a baht amount", () => {
  it("an absent discountMode still means percent (every pre-2026-08-25 quotation)", () => {
    expect(lineSubtotal(line(2, 500, 10))).toBeCloseTo(900, 10);
    expect(computeTotals([line(2, 500)], 10).afterDiscount).toBeCloseTo(900, 10);
  });

  it("line-level baht discount comes off the line total, not off each unit", () => {
    // 4 × 250 = 1,000, ลด 250 บาท → 750 (ไม่ใช่ 4 × (250 − 250) = 0)
    expect(lineSubtotal(line(4, 250, 250, "amount"))).toBeCloseTo(750, 10);
    expect(lineDiscountAmount(line(4, 250, 250, "amount"))).toBeCloseTo(250, 10);
  });

  it("quote-level baht discount comes off the subtotal, then VAT applies", () => {
    // 1,000 − 100 = 900 → VAT 63 → 963
    const t = computeTotals([line(1, 1000)], 100, "amount");
    expect(t.discountAmt).toBeCloseTo(100, 10);
    expect(t.afterDiscount).toBeCloseTo(900, 10);
    expect(t.total).toBeCloseTo(963, 10);
  });

  it("the two levels mix freely — baht per line, percent on the document", () => {
    // 2 × 500 = 1,000, ลดรายการ 100 บาท → 900; ลดท้ายเอกสาร 10% → 810
    const t = computeTotals([line(2, 500, 100, "amount")], 10, "percent");
    expect(t.subtotal).toBeCloseTo(900, 10);
    expect(t.afterDiscount).toBeCloseTo(810, 10);
  });

  it("a baht discount larger than what it discounts clamps to zero, never negative", () => {
    expect(lineSubtotal(line(1, 100, 500, "amount"))).toBe(0);
    const t = computeTotals([line(1, 100)], 500, "amount");
    expect(t.afterDiscount).toBe(0);
    expect(t.total).toBe(0);
  });

  it("switching the unit reinterprets the same number — 10 as ฿10, not 10%", () => {
    expect(computeTotals([line(1, 1000)], 10, "percent").afterDiscount).toBeCloseTo(900, 10);
    expect(computeTotals([line(1, 1000)], 10, "amount").afterDiscount).toBeCloseTo(990, 10);
  });
});

describe("server-side amount math stays in lockstep with the client", () => {
  // The Dashboard's pre-tax figures and the persisted Quote.amount both come from
  // api/_lib/quoteAmounts.ts, which deliberately mirrors computeTotals — these tests fail the
  // moment the two formulas drift apart (the exact risk the shared-module design guards against).
  const cases: { lines: QuoteLine[]; discountPct: number; discountMode?: DiscountMode }[] = [
    { lines: [line(1, 1000)], discountPct: 0 },
    { lines: [line(2, 500, 10)], discountPct: 10 },
    { lines: [line(1, 999.99, 3), line(7, 123.45, 0)], discountPct: 5.5 },
    { lines: [], discountPct: 50 },
    { lines: [line(2, 500, 100, "amount")], discountPct: 250, discountMode: "amount" },
    { lines: [line(3, 333.33, 7), line(1, 50, 25, "amount")], discountPct: 12.5, discountMode: "percent" },
  ];

  it("before-VAT matches computeTotals.afterDiscount", () => {
    for (const c of cases) {
      const client = computeTotals(c.lines, c.discountPct, c.discountMode);
      const server = computeQuoteAmountBeforeVat(
        c.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, discountMode: l.discountMode })),
        c.discountPct,
        c.discountMode,
      );
      expect(server).toBeCloseTo(client.afterDiscount, 10);
    }
  });

  it("with-VAT matches computeTotals.total", () => {
    for (const c of cases) {
      const client = computeTotals(c.lines, c.discountPct, c.discountMode);
      const server = computeQuoteAmountWithVat(
        c.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, discount: l.discount, discountMode: l.discountMode })),
        c.discountPct,
        c.discountMode,
      );
      expect(server).toBeCloseTo(client.total, 10);
    }
  });
});
