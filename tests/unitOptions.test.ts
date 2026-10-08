import { describe, expect, it } from "vitest";
import { buildUnitOptions } from "../src/lib/unitOptions";
import { filterComboboxOptions } from "../src/lib/comboboxFilter";

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

// พิมพ์ "ช" แล้วขึ้นครบทุกหน่วย เพราะไปค้นเจอ "ใช้ใน N สินค้า" ในบรรทัดรอง (เจอตอนทดสอบบนจอจริง 2026-10-08)
describe("filterComboboxOptions", () => {
  const units = buildUnitOptions([
    { unit: "ชุด", archived: false }, { unit: "kg", archived: false }, { unit: "เส้น", archived: false },
  ]);

  it("unit field ignores the usage hint, so Thai letters inside it do not match every unit", () => {
    const ch = filterComboboxOptions(units, "ช", { searchHint: false }).map((o) => o.value);
    expect(ch).toContain("ชุด");
    expect(ch).toContain("ชิ้น");
    expect(ch).not.toContain("kg");
    expect(filterComboboxOptions(units, "ส", { searchHint: false }).map((o) => o.value)).toEqual(["เส้น"]);
  });

  it("other comboboxes still search the hint by default (e.g. full name of a code)", () => {
    const opts = [{ value: "SC", hint: "Wet Scrubber" }, { value: "BF", hint: "Dust Collector" }];
    expect(filterComboboxOptions(opts, "scrub").map((o) => o.value)).toEqual(["SC"]);
  });

  it("empty query returns everything, capped by limit", () => {
    expect(filterComboboxOptions(units, "  ", { limit: 2 })).toHaveLength(2);
  });
});
