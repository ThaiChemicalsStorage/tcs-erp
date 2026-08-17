import { describe, it, expect } from "vitest";
import {
  round2, computeDownPaymentLineAmount, computeDepositDeductionLineAmount, computeArDocumentTotals,
  computeWhtExpected, computeStampDuty, computeDueDate,
} from "../../api/_lib/arCalculations";
import { bahtText } from "../../src/lib/quotes";

// Both worked examples from the owner's real reference PDFs — see docs/MODULES/Accounting.md.
// Every figure below is the real printed number, not a synthetic test fixture.

describe("Worked example A — K.Thai Hydraulic (PQ202607-174-LI-SK)", () => {
  const totalContractValueExVat = 210_000;

  it("AR6907008 (down payment, 40%) = 84,000.00", () => {
    expect(computeDownPaymentLineAmount(totalContractValueExVat, 40)).toBe(84_000);
  });

  it("IV6908014 (final, 60%): items sum to the full 210,000, deduction line = -84,000, net = 134,820.00", () => {
    // Real line items — full quantities/unit prices, NOT scaled by 60% (see arCalculations.ts doc comment).
    const lineAmounts = [
      round2(100 * 1600), // 1: FRP Lining floor, 100 sqm x 1,600 = 160,000
      round2(25 * 1600), // 2: FRP Lining gutter, 25 x 1,600 = 40,000
      round2(1 * 10_000), // 3: Installation, 1 x 10,000 = 10,000
      computeDepositDeductionLineAmount(84_000), // 4: deduct AR6907008
    ];
    expect(lineAmounts).toEqual([160_000, 40_000, 10_000, -84_000]);
    const totals = computeArDocumentTotals(lineAmounts);
    expect(totals.subtotal).toBe(126_000);
    expect(totals.valueAmount).toBe(126_000);
    expect(totals.vatAmount).toBe(8_820);
    expect(totals.netTotal).toBe(134_820);
    expect(bahtText(totals.netTotal)).toBe("(หนึ่งแสนสามหมื่นสี่พันแปดร้อยยี่สิบบาทถ้วน)");
  });

  it("due date: cash terms, due date = doc date", () => {
    expect(computeDueDate("2026-08-07", "Cash", null)).toBe("2026-08-07");
  });

  it("WHT expected on the service value (126,000 x 3%) = 3,780.00", () => {
    expect(computeWhtExpected(126_000)).toBe(3_780);
  });

  it("stamp duty: service work, 210,000 < 1,000,000 -> affix, ceil(210,000/1000) = 210 baht", () => {
    const duty = computeStampDuty(totalContractValueExVat, "service");
    expect(duty).toEqual({ required: true, method: "affix", amount: 210 });
  });
});

describe("Worked example B — VS Chem (PQ202607-166-TA-WM)", () => {
  const totalContractValueExVat = 262_000;

  it("AR6907005 (down payment, 30%) = 78,600.00", () => {
    expect(computeDownPaymentLineAmount(totalContractValueExVat, 30)).toBe(78_600);
  });

  it("IV6908015 (final, 70%): items sum to the full 262,000, deduction line = -78,600, net = 196,238.00", () => {
    const lineAmounts = [
      192_000, // 1: FRP Vertical Tank
      15_000, // 2: Level Indicator
      20_000, // 3: Steel ladder
      35_000, // 4: Transportation
      computeDepositDeductionLineAmount(78_600), // 5: deduct AR6907005
    ];
    expect(lineAmounts.reduce((s, a) => s + a, 0)).toBe(183_400);
    const totals = computeArDocumentTotals(lineAmounts);
    expect(totals.subtotal).toBe(183_400);
    expect(totals.vatAmount).toBe(12_838);
    expect(totals.netTotal).toBe(196_238);
    expect(bahtText(totals.netTotal)).toBe("(หนึ่งแสนเก้าหมื่นหกพันสองร้อยสามสิบแปดบาทถ้วน)");
  });

  it("due date: credit 30 days from the doc date", () => {
    expect(computeDueDate("2026-08-10", "Credit", 30)).toBe("2026-09-09");
  });

  it("stamp duty: goods work -> not required", () => {
    expect(computeStampDuty(totalContractValueExVat, "goods")).toEqual({ required: false, method: null, amount: 0 });
  });
});

describe("stamp duty threshold", () => {
  it(">= 1,000,000 -> online/สลักหลัง", () => {
    expect(computeStampDuty(1_500_000, "service")).toEqual({ required: true, method: "online", amount: 1500 });
  });
  it("exactly at the 1,000,000 threshold -> online (>=, not >)", () => {
    expect(computeStampDuty(1_000_000, "contract")).toEqual({ required: true, method: "online", amount: 1000 });
  });
});

describe("bahtText() — spec §11's 12 worked cases (function already exists in src/lib/quotes.ts, verifying it before reuse)", () => {
  const cases: [number, string][] = [
    [134_820, "(หนึ่งแสนสามหมื่นสี่พันแปดร้อยยี่สิบบาทถ้วน)"],
    [196_238, "(หนึ่งแสนเก้าหมื่นหกพันสองร้อยสามสิบแปดบาทถ้วน)"],
    [21, "(ยี่สิบเอ็ดบาทถ้วน)"],
    [101.5, "(หนึ่งร้อยเอ็ดบาทห้าสิบสตางค์)"],
    [1_000_001, "(หนึ่งล้านเอ็ดบาทถ้วน)"], // เอ็ด applies to a trailing 1 even across a ล้าน group boundary
    [11_111_111.11, "(สิบเอ็ดล้านหนึ่งแสนหนึ่งหมื่นหนึ่งพันหนึ่งร้อยสิบเอ็ดบาทสิบเอ็ดสตางค์)"],
    [0.25, "(ศูนย์บาทยี่สิบห้าสตางค์)"],
    [1, "(หนึ่งบาทถ้วน)"],
    [100_000_000, "(หนึ่งร้อยล้านบาทถ้วน)"],
    [5_000_000, "(ห้าล้านบาทถ้วน)"],
    [999_999.99, "(เก้าแสนเก้าหมื่นเก้าพันเก้าร้อยเก้าสิบเก้าบาทเก้าสิบเก้าสตางค์)"],
    [0, "(ศูนย์บาทถ้วน)"],
  ];

  it.each(cases)("bahtText(%d) = %s", (amount, expected) => {
    expect(bahtText(amount)).toBe(expected);
  });
});
