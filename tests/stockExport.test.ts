import { describe, it, expect } from "vitest";
import { buildTableWorkbook } from "../src/lib/tableExport";
import { stockBalanceSheet, stockCardSheet } from "../src/lib/stockExport";
import type { Product } from "../src/lib/products";
import type { StockMovement } from "../src/lib/stock";

/**
 * ส่งออก Excel/PDF ของหน้าสต๊อก (2026-09-24) — Excel และใบพิมพ์ PDF ใช้ตาราง `ExportSheet` ชุดเดียวกัน
 * สิ่งที่ตรึงไว้: ยอดรวมถูก, ฝั่งรับ/จ่ายของการ์ดสต๊อกแยกถูกตามเครื่องหมาย, และไฟล์ที่ได้มีหัวตาราง/ข้อมูลอยู่แถวที่ถูกต้อง
 */

const product = (over: Partial<Product>): Product => ({
  id: "p1", code: "ST-01", name: "เหล็กแผ่น", categoryId: "c1", unit: "แผ่น", defaultPrice: 0, description: "", specifications: "",
  archived: false, stockQty: 10, avgCost: 100, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "",
  ...over,
} as Product);

describe("stockExport", () => {
  it("รายงานยอดคงเหลือ: รวมจำนวนและมูลค่า (ยอดติดลบไม่มีมูลค่า)", () => {
    const sheet = stockBalanceSheet(
      [product({}), product({ id: "p2", code: "ST-02", stockQty: -2, avgCost: 50 })],
      [{ id: "c1", name: "เหล็ก" } as never],
      "",
    );
    expect(sheet.rows[0].slice(0, 5)).toEqual(["ST-01", "เหล็กแผ่น", "เหล็ก", "แผ่น", 10]);
    expect(sheet.totals?.[4]).toBe(8);
    expect(sheet.totals?.[7]).toBe(1000);
  });

  it("การ์ดสต๊อก: รับอยู่ฝั่งรับ จ่ายอยู่ฝั่งจ่าย", () => {
    const mv = (delta: number, kind: StockMovement["kind"]): StockMovement => ({
      id: `m${delta}`, productId: "p1", productCode: "ST-01", productName: "เหล็กแผ่น", kind, delta, balanceAfter: 0,
      reason: "", sourceType: "manual", sourceId: "", sourceLabel: "RR-1", createdAt: "2026-09-01T03:00:00.000Z", createdBy: "",
      unitCost: 100, amount: Math.abs(delta) * 100,
    } as StockMovement);
    const sheet = stockCardSheet(product({}), [mv(5, "receive"), mv(-2, "deduct")]);
    expect(sheet.rows[0].slice(3, 9)).toEqual([5, 100, 500, null, null, null]);
    expect(sheet.rows[1].slice(3, 9)).toEqual([null, null, null, 2, 100, 200]);
  });

  it("ไฟล์ Excel: หัวเรื่อง → หัวตาราง → ข้อมูล → แถวรวม", async () => {
    const wb = await buildTableWorkbook([stockBalanceSheet([product({})], [], "ST")]);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe("สต๊อกสินค้า");
    expect(ws.getRow(1).getCell(1).value).toBe("รายงานสต๊อกสินค้าคงเหลือ");
    expect(ws.getRow(4).getCell(1).value).toBe("รหัสสินค้า");
    expect(ws.getRow(5).getCell(1).value).toBe("ST-01");
    expect(ws.getRow(6).getCell(1).value).toBe("รวม");
    expect(ws.getRow(6).getCell(8).value).toBe(1000);
  });
});
