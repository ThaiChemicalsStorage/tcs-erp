import { describe, expect, it } from "vitest";
import {
  SCOPE_COLUMN_SPLIT,
  buildJobOrderChecklistGroups,
  withJobOrderChecklistGroups,
} from "../src/lib/jobOrder";
import type { ChecklistGroup } from "../src/lib/documentRequirements";

/**
 * เช็คลิสต์ขอบเขตงานของใบสั่งงานเปลี่ยนโครงสร้างมาแล้วสองรอบ และการอ่านเอกสารเก่าทำ**ตอนอ่าน**
 * ไม่ได้ migrate ฐานข้อมูล ถ้า withJobOrderChecklistGroups() พลาด ใบที่ติ๊กไว้แล้วจะกลายเป็นว่างเปล่า
 * เงียบ ๆ โดยไม่มี error ที่ไหนเลย จึงต้องคุมไว้ทั้งสามรูปแบบที่เคยถูกบันทึกลงฐานข้อมูลจริง:
 *
 *   ก่อน 2026-08-27      กลุ่มเดียวชื่อ "ขอบเขตงาน (Scope of work)" 23 ตัวเลือก
 *   2026-08-27..08-31    6 หัวข้อ (การจัดกลุ่มที่อนุมานเอง ไม่ได้อ่านจากกระดาษ)
 *   ตั้งแต่ 2026-08-31    กลุ่มเดียวไม่มีหัวข้อ ตามฟอร์ม FM-PJ-01 ตัวจริง
 */

/** โครงสร้างแบบเดิมก่อน 2026-08-27 — กลุ่มเดียว ไม่มีฟิลด์ details */
function legacyGroups(): ChecklistGroup[] {
  return [
    {
      key: "scopeOfWork",
      title: "ขอบเขตงาน (Scope of work)",
      selectionType: "multiple",
      options: [
        { key: "designAndCalculationSheet", label: "DESIGN AND CALCULATION SHEET", checked: true },
        { key: "fabricationDrawing", label: "FABRICATION DRAWING", checked: false },
        { key: "hydroTest", label: "HYDRO-TEST", checked: true, value: "10" },
        { key: "primerCoat", label: "PRIMER COAT", checked: false, value: "" },
        { key: "transportation", label: "TRANSPORTATION", checked: true },
        { key: "other", label: "OTHER", checked: true, value: "งานพิเศษ" },
      ],
    },
  ];
}

/** โครงสร้างช่วง 2026-08-27..08-31 — 6 หัวข้อที่อนุมานเอง ก่อนได้เห็นฟอร์มกระดาษจริง */
function groupedGroups(): ChecklistGroup[] {
  return [
    {
      key: "scopeOfWork",
      title: "แบบและการคำนวณ (Design & Drawing)",
      selectionType: "multiple",
      options: [
        { key: "designAndCalculationSheet", label: "DESIGN AND CALCULATION SHEET", checked: true, details: ["ตรวจแบบก่อนผลิต"] },
        { key: "fabricationDrawing", label: "FABRICATION DRAWING", checked: false, details: [] },
      ],
    },
    {
      key: "scopeInspectionTesting",
      title: "การตรวจสอบและทดสอบ (Inspection & Testing)",
      selectionType: "multiple",
      options: [{ key: "hydroTest", label: "HYDRO-TEST", checked: true, value: "12", details: [] }],
    },
    {
      key: "scopePainting",
      title: "งานสี (Painting)",
      selectionType: "multiple",
      options: [{ key: "finishedCoat", label: "FINISHED COAT", checked: true, value: "Epoxy", details: [] }],
    },
    {
      key: "scopeOther",
      title: "อื่น ๆ (Other)",
      selectionType: "multiple",
      options: [{ key: "other", label: "OTHER", checked: true, value: "งานพิเศษ", details: [] }],
    },
  ];
}

const flatten = (groups: ChecklistGroup[]) => groups.flatMap((g) => g.options);
const findOpt = (groups: ChecklistGroup[], key: string) => flatten(groups).find((o) => o.key === key);

describe("buildJobOrderChecklistGroups", () => {
  it("is one untitled group, exactly as the paper form is laid out", () => {
    const groups = buildJobOrderChecklistGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("scopeOfWork");
    expect(groups[0].title).toBe("");
    expect(groups[0].options).toHaveLength(23);
  });

  it("lists the options in the paper's own reading order, left column then right", () => {
    const keys = buildJobOrderChecklistGroups()[0].options.map((o) => o.key);
    expect(keys.slice(0, SCOPE_COLUMN_SPLIT)).toEqual([
      "designAndCalculationSheet",
      "fabricationDrawing",
      "shopDetailAndCuttingPlan",
      "rawMaterialSupply",
      "shopFabricationAndConsumable",
      "ptOrMt",
      "rt10",
      "hydroTest",
      "pneumaticTest",
      "manpowerSupply",
      "mobileCrane",
    ]);
    expect(keys.slice(SCOPE_COLUMN_SPLIT)).toEqual([
      "paintingSystem",
      "sandblastingSa",
      "primerCoat",
      "intermediateCoat",
      "finishedCoat",
      "hotDipGalvanized",
      "wrapping",
      "transportation",
      "siteInstallation",
      "excavation",
      "scaffolding",
      "other",
    ]);
  });

  it("gives the three paint-coat lines a second fill-in, because the form has two blanks", () => {
    const groups = buildJobOrderChecklistGroups();
    for (const key of ["primerCoat", "intermediateCoat", "finishedCoat"]) {
      const opt = findOpt(groups, key);
      expect(opt?.value, key).toBe("");
      expect(opt?.value2, key).toBe("");
      expect(opt?.unit2, key).toBe("MICRON");
    }
    // ส่วนบรรทัดที่มีช่องเดียวต้องไม่มีช่องที่สองโผล่มา
    expect(findOpt(groups, "hydroTest")?.value2).toBeUndefined();
    expect(findOpt(groups, "hydroTest")?.unit).toBe("BAR");
    expect(findOpt(groups, "mobileCrane")?.unit).toBe("TON");
    // และบรรทัดที่เป็นช่องติ๊กเปล่า ๆ ต้องไม่มีช่องกรอกเลย
    expect(findOpt(groups, "wrapping")?.value).toBeUndefined();
  });
});

describe("withJobOrderChecklistGroups — เอกสารกลุ่มเดียวแบบก่อน 2026-08-27", () => {
  it("collapses to the paper's single untitled group", () => {
    const regrouped = withJobOrderChecklistGroups(legacyGroups());
    expect(regrouped).toHaveLength(1);
    expect(regrouped[0].title).toBe("");
  });

  it("keeps every ticked option ticked", () => {
    const regrouped = withJobOrderChecklistGroups(legacyGroups());
    expect(findOpt(regrouped, "designAndCalculationSheet")?.checked).toBe(true);
    expect(findOpt(regrouped, "hydroTest")?.checked).toBe(true);
    expect(findOpt(regrouped, "transportation")?.checked).toBe(true);
    expect(findOpt(regrouped, "other")?.checked).toBe(true);
    // และของที่ไม่ได้ติ๊กต้องไม่กลายเป็นติ๊ก
    expect(findOpt(regrouped, "fabricationDrawing")?.checked).toBe(false);
    expect(findOpt(regrouped, "primerCoat")?.checked).toBe(false);
  });

  it("carries the fill-in values across", () => {
    const regrouped = withJobOrderChecklistGroups(legacyGroups());
    expect(findOpt(regrouped, "hydroTest")?.value).toBe("10");
    expect(findOpt(regrouped, "other")?.value).toBe("งานพิเศษ");
  });

  it("loses no option key from the legacy document", () => {
    const before = flatten(legacyGroups()).map((o) => o.key).sort();
    const after = flatten(withJobOrderChecklistGroups(legacyGroups())).map((o) => o.key);
    for (const key of before) expect(after, `หายไป: ${key}`).toContain(key);
  });

  it("offers every current option even when the saved document had none of them", () => {
    const regrouped = withJobOrderChecklistGroups(legacyGroups());
    const defaults = flatten(buildJobOrderChecklistGroups()).map((o) => o.key);
    const got = flatten(regrouped).map((o) => o.key);
    for (const key of defaults) expect(got, `ขาดตัวเลือกปัจจุบัน: ${key}`).toContain(key);
  });

  it("keeps an unknown legacy option rather than dropping it silently", () => {
    const withOrphan = legacyGroups();
    withOrphan[0].options.push({ key: "someRetiredOption", label: "RETIRED", checked: true });
    const regrouped = withJobOrderChecklistGroups(withOrphan);
    const orphan = findOpt(regrouped, "someRetiredOption");
    expect(orphan, "ตัวเลือกที่เลิกใช้ต้องไม่หายไปเฉย ๆ").toBeDefined();
    expect(orphan?.checked).toBe(true);
  });

  it("carries sub-details across, and defaults them to an empty list", () => {
    const withDetails = legacyGroups();
    withDetails[0].options[0].details = ["ตรวจแบบก่อนผลิต", "ส่งให้ลูกค้าอนุมัติ"];
    const regrouped = withJobOrderChecklistGroups(withDetails);
    expect(findOpt(regrouped, "designAndCalculationSheet")?.details).toEqual(["ตรวจแบบก่อนผลิต", "ส่งให้ลูกค้าอนุมัติ"]);
    // ตัวเลือกที่ไม่เคยมี details มาก่อนต้องได้ [] ไม่ใช่ undefined — ไม่งั้นการ์ดจะไม่เรนเดอร์ปุ่มเพิ่ม
    expect(findOpt(regrouped, "fabricationDrawing")?.details).toEqual([]);
  });
});

describe("withJobOrderChecklistGroups — เอกสาร 6 หัวข้อช่วง 2026-08-27..08-31", () => {
  it("flattens the six invented headings back into the paper's one list", () => {
    const regrouped = withJobOrderChecklistGroups(groupedGroups());
    expect(regrouped).toHaveLength(1);
    expect(regrouped[0].options).toHaveLength(23);
  });

  it("keeps everything the grouped document had ticked, valued and annotated", () => {
    const regrouped = withJobOrderChecklistGroups(groupedGroups());
    expect(findOpt(regrouped, "designAndCalculationSheet")?.checked).toBe(true);
    expect(findOpt(regrouped, "designAndCalculationSheet")?.details).toEqual(["ตรวจแบบก่อนผลิต"]);
    expect(findOpt(regrouped, "hydroTest")?.value).toBe("12");
    expect(findOpt(regrouped, "finishedCoat")?.checked).toBe(true);
    expect(findOpt(regrouped, "finishedCoat")?.value).toBe("Epoxy");
    expect(findOpt(regrouped, "other")?.value).toBe("งานพิเศษ");
    expect(findOpt(regrouped, "fabricationDrawing")?.checked).toBe(false);
  });

  it("gives a grouped-era paint line the second blank it never had", () => {
    // เอกสารช่วงนั้นไม่มี value2 เลย — ต้องได้ "" ไม่ใช่ undefined ไม่งั้นช่องที่สองจะไม่โผล่บนหน้าจอ
    expect(findOpt(withJobOrderChecklistGroups(groupedGroups()), "finishedCoat")?.value2).toBe("");
  });
});

describe("withJobOrderChecklistGroups — ทั่วไป", () => {
  it("is stable when applied twice", () => {
    const once = withJobOrderChecklistGroups(legacyGroups());
    expect(withJobOrderChecklistGroups(once)).toEqual(once);
  });

  it("is stable when applied twice to a grouped-era document too", () => {
    const once = withJobOrderChecklistGroups(groupedGroups());
    expect(withJobOrderChecklistGroups(once)).toEqual(once);
  });

  it("returns the full default structure for a document with no checklist at all", () => {
    expect(withJobOrderChecklistGroups(undefined)).toEqual(buildJobOrderChecklistGroups());
  });
});
