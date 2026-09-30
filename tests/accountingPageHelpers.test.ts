import { describe, expect, it } from "vitest";
import { computeArDocumentTotals, round2 } from "../api/_lib/arCalculations";
import { groupApEntriesByVendor, manualLineAmount, manualTotals, monthsPresent, thaiMonthLabel } from "../src/pages/accounting/accountingFormat";
import type { ApEntry } from "../src/lib/apEntries";

/**
 * ตัวช่วยของหน้าบัญชีหลังย้ายเข้าดีไซน์ใหม่ (2026-09-30):
 * - ยอดตัวอย่างบนหน้าสร้างใบกำกับภาษี (Manual) ต้องตรงกับที่เซิร์ฟเวอร์คำนวณตอนออกจริงทุกสตางค์
 * - ทะเบียนเจ้าหนี้แบบตารางเดียว ต้องจัดกลุ่ม/เรียงผู้ขายเหมือนหน้าเดิมที่แยกตารางละผู้ขาย
 */

describe("manual tax invoice preview totals", () => {
  const cases: [number, number][][] = [
    [[2, 13500], [1, 3000]],
    [[3, 33.33], [7, 0.15], [1, 1999.99]],
    [[1.5, 1234.567], [0.333, 99.99]],
    [[1, 0]],
  ];
  it.each(cases)("matches computeArDocumentTotals for %j", (...lines) => {
    const amounts = lines.map(([qty, price]) => manualLineAmount(qty, price));
    // เซิร์ฟเวอร์ปัดทีละบรรทัดด้วย round2(qty * unitPrice) ก่อนรวม (handleManualIssue)
    expect(amounts).toEqual(lines.map(([qty, price]) => round2(qty * price)));
    const server = computeArDocumentTotals(amounts);
    expect(manualTotals(amounts)).toEqual({ valueAmount: server.valueAmount, vatAmount: server.vatAmount, netTotal: server.netTotal });
  });

  it("treats unparseable input as a zero line", () => {
    expect(manualLineAmount(Number.NaN, 100)).toBe(0);
  });
});

const entry = (id: string, vendorName: string, total: number, status: "Paid" | "Unpaid"): ApEntry => ({
  id, vendorName, total, status, vendorTaxId: `tax-${vendorName}`,
} as unknown as ApEntry);

describe("groupApEntriesByVendor", () => {
  it("groups by vendor, sorts by outstanding amount, labels a blank vendor", () => {
    const groups = groupApEntriesByVendor([
      entry("1", "A", 100, "Unpaid"),
      entry("2", "B", 500, "Paid"),
      entry("3", "A", 50, "Paid"),
      entry("4", "", 30, "Unpaid"),
      entry("5", "C", 400, "Unpaid"),
    ], "(none)");
    expect(groups.map((g) => [g.vendorName, g.unpaid, g.rows.map((r) => r.id)])).toEqual([
      ["C", 400, ["5"]],
      ["A", 100, ["1", "3"]],
      ["(none)", 30, ["4"]],
      ["B", 0, ["2"]],
    ]);
    expect(groups[1].vendorTaxId).toBe("tax-A");
  });
});

describe("month helpers", () => {
  it("lists distinct months newest first", () => {
    expect(monthsPresent(["2026-08-03", "2026-09-30", "2026-08-31T10:00:00Z", "bad"])).toEqual(["2026-09", "2026-08"]);
  });
  it("labels a month in Thai with the Buddhist year", () => {
    expect(thaiMonthLabel("2026-09")).toBe("กันยายน 2569");
  });
});
