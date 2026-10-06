import { describe, expect, it } from "vitest";
import { buildUnitOptions } from "../src/lib/unitOptions";

// ช่องหน่วยนับพิมพ์แล้วขึ้นรายการ (Tuhmo #27, 2026-10-06)
describe("buildUnitOptions", () => {
  it("catalog units come first, most-used first, archived and blank ignored", () => {
    const opts = buildUnitOptions([
      { unit: "Set", archived: false }, { unit: "เมตร", archived: false }, { unit: "เมตร", archived: false },
      { unit: "  ", archived: false }, { unit: "ถัง", archived: true },
    ]);
    expect(opts.slice(0, 2).map((o) => o.value)).toEqual(["เมตร", "Set"]);
    expect(opts[0].hint).toBe("ใช้ใน 2 สินค้า");
    expect(opts.some((o) => o.value === "ถัง")).toBe(false);
  });

  it("common units fill in after the catalog without duplicating it (case-insensitive)", () => {
    const opts = buildUnitOptions([{ unit: "set", archived: false }]);
    expect(opts.filter((o) => o.value.toLowerCase() === "set")).toHaveLength(1);
    expect(opts.map((o) => o.value)).toContain("ชิ้น");
  });

  it("works with no catalog at all (still loading / no permission)", () => {
    expect(buildUnitOptions([]).length).toBeGreaterThan(5);
  });
});
