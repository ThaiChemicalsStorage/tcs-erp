import { describe, expect, it } from "vitest";
import {
  buildJobOrderChecklistGroups,
  withJobOrderChecklistGroups,
} from "../src/lib/jobOrder";
import type { ChecklistGroup } from "../src/lib/documentRequirements";

/**
 * ใบสั่งงานเคยเก็บเช็คลิสต์เป็น "กลุ่มเดียว 23 ตัวเลือก" จนถึง 2026-08-27 แล้วถูกแตกเป็นหลายหัวข้อ
 * ตามที่ฝ่ายโครงการขอ การจัดกลุ่มใหม่ทำ**ตอนอ่าน** ไม่ได้ migrate ฐานข้อมูล — ถ้าฟังก์ชันนี้พลาด
 * ใบสั่งงานที่ติ๊กไว้แล้วจะกลายเป็นว่างเปล่าเงียบ ๆ โดยไม่มี error ที่ไหนเลย จึงต้องมีเทสต์คุมไว้
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

const flatten = (groups: ChecklistGroup[]) => groups.flatMap((g) => g.options);
const findOpt = (groups: ChecklistGroup[], key: string) => flatten(groups).find((o) => o.key === key);

describe("withJobOrderChecklistGroups", () => {
  it("splits the legacy single group into several headings", () => {
    const regrouped = withJobOrderChecklistGroups(legacyGroups());
    expect(regrouped.length).toBeGreaterThan(1);
    // ทุกหัวข้อต้องมีชื่อและมีตัวเลือกอย่างน้อยหนึ่งข้อ
    for (const g of regrouped) {
      expect(g.title.trim()).not.toBe("");
      expect(g.options.length).toBeGreaterThan(0);
    }
  });

  it("keeps every ticked option ticked, wherever it lands", () => {
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

  it("is stable when applied twice", () => {
    const once = withJobOrderChecklistGroups(legacyGroups());
    const twice = withJobOrderChecklistGroups(once);
    expect(twice).toEqual(once);
  });

  it("returns the full default structure for a document with no checklist at all", () => {
    expect(withJobOrderChecklistGroups(undefined)).toEqual(buildJobOrderChecklistGroups());
  });
});
