import { describe, it, expect } from "vitest";
import { parseStockRows, buildStockImportPreview } from "../src/lib/stockImport";

/** ตัวแกะไฟล์นำเข้ายอดสต๊อก (2026-09-23) — หัวคอลัมน์ไทย/อังกฤษ, หัวไม่อยู่บรรทัดแรก, แถวผิดถูกทิ้งรายแถว */
describe("parseStockRows", () => {
  it("หาหัวตารางที่ไม่ได้อยู่บรรทัดแรก และอ่านตัวเลขที่มีตัวคั่นหลักพัน", () => {
    const r = parseStockRows([
      ["รายงานยอดคงเหลือ ณ 30/09/2569"],
      ["รหัสสินค้า", "ชื่อสินค้า", "ยอดคงเหลือ", "ต้นทุนต่อหน่วย"],
      ["RS-01", "เรซิน", "1,250", "3,480.50"],
      ["", "", "", ""],
      ["BT-12", "สลัก", "40", ""],
    ]);
    expect(r.headerFound).toBe(true);
    expect(r.rows).toEqual([
      { rowNumber: 3, code: "RS-01", qty: 1250, unitCost: 3480.5 },
      { rowNumber: 5, code: "BT-12", qty: 40, unitCost: null },
    ]);
  });

  it("หัวภาษาอังกฤษก็ได้", () => {
    expect(parseStockRows([["Code", "Qty"], ["A1", "3"]]).rows[0]).toMatchObject({ code: "A1", qty: 3 });
  });

  it("แถวที่ผิดถูกทิ้งพร้อมเหตุผล — ยอดว่าง/ติดลบ/อ่านไม่ออก/รหัสซ้ำ", () => {
    const r = parseStockRows([
      ["code", "qty"],
      ["A1", ""], ["A2", "-1"], ["A3", "abc"], ["A4", "2"], ["a4", "5"],
    ]);
    expect(r.rows.map((x) => x.code)).toEqual(["A4"]);
    expect(r.problems.map((p) => p.rowNumber)).toEqual([2, 3, 4, 6]);
  });

  it("ไม่มีคอลัมน์ยอดคงเหลือ = ไม่ใช่ไฟล์สต๊อก", () => {
    expect(parseStockRows([["รหัสสินค้า", "ชื่อสินค้า"], ["A1", "x"]]).headerFound).toBe(false);
  });
});

describe("buildStockImportPreview", () => {
  it("จับคู่ไม่สนตัวพิมพ์ คิดส่วนต่าง และข้ามสินค้าที่เก็บถาวร", () => {
    const preview = buildStockImportPreview(
      [{ rowNumber: 2, code: "rs-01", qty: 10, unitCost: null }, { rowNumber: 3, code: "OLD", qty: 1, unitCost: null }, { rowNumber: 4, code: "BT", qty: 5, unitCost: null }],
      [
        { id: "p1", code: "RS-01", name: "เรซิน", unit: "ถัง", stockQty: 4 },
        { id: "p2", code: "OLD", name: "เก่า", unit: "ชิ้น", stockQty: 0, archived: true },
        { id: "p3", code: "BT", name: "สลัก", unit: "ตัว", stockQty: 5 },
      ],
    );
    expect(preview.map((p) => [p.status, p.delta])).toEqual([["change", 6], ["notFound", 0], ["same", 0]]);
  });
});
