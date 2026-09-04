import { describe, expect, it } from "vitest";
import {
  parseProductRows, buildProductImportPreview, PRODUCT_IMPORT_MAX_ROWS,
  PRODUCT_IMPORT_TEMPLATE_HEADERS, PRODUCT_IMPORT_TEMPLATE_SAMPLE,
} from "../src/lib/productImport";

/**
 * ตัวแกะไฟล์ Excel ของ "นำเข้าสินค้า" (2026-09-04) — เจ้าของสั่งว่าเวลาย้ายสินค้าจากอีกระบบเข้ามาต้อง
 * *"โยนไฟล์ exel เข้าไปแล้วสินค้าเข้ามาเลย"*
 *
 * เทสต์ทำงานกับ **แถวดิบ** (`string[][]`) ที่ `XLSX.utils.sheet_to_json(sheet, { header: 1 })` คืนมา
 * ไม่ได้แตะไฟล์จริง — แนวเดียวกับ `codeRegisterImport.test.ts` และ `costControlImport.test.ts`
 * ที่ทำไว้ก่อนแล้ว เพราะไฟล์ที่ผู้ใช้จะเอามาใช้จริงยังไม่มีใครส่งมา
 */

/** รูปร่างที่ไฟล์ส่งออกจากระบบอื่นมักเป็น: มีชื่อรายงานคร่อมอยู่เหนือหัวตาราง และมีคอลัมน์ที่เราไม่รู้จัก */
const EXPORT_SHAPE: string[][] = [
  ["รายงานรายการสินค้าคงคลัง", "", "", "", "", ""],
  ["พิมพ์เมื่อ 04/09/2569", "", "", "", "", ""],
  ["รหัสสินค้า", "ชื่อสินค้า", "หมวดหมู่", "หน่วย", "ราคาขาย", "รหัสคลังเดิม"],
  ["PD-9001", "ดอกสว่านไทเทเนียม 6mm", "วัสดุสิ้นเปลือง", "ดอก", "45", "WH-1"],
  ["PD-9002", "ลูกกลิ้ง 4 นิ้ว", "วัสดุสิ้นเปลือง", "อัน", "1,250.50", "WH-2"],
  ["", "", "", "", "", ""],
  ["MA-9003", "อะซิโตน ACETONE", "เคมี/เรซิ่น", "kg", "", "WH-3"],
];

describe("parseProductRows", () => {
  it("หาหัวตารางเจอแม้ไม่ได้อยู่บรรทัดแรก และอ่านทุกแถวใต้หัว", () => {
    const parsed = parseProductRows(EXPORT_SHAPE);
    expect(parsed.headerFound).toBe(true);
    expect(parsed.rows.map((r) => r.code)).toEqual(["PD-9001", "PD-9002", "MA-9003"]);
    expect(parsed.problems).toEqual([]);
  });

  it("อ่านตัวเลขที่มีตัวคั่นหลักพัน และให้ช่องราคาว่างเป็น 0", () => {
    const { rows } = parseProductRows(EXPORT_SHAPE);
    expect(rows[1].defaultPrice).toBe(1250.5);
    expect(rows[2].defaultPrice).toBe(0);
  });

  it("บอกชื่อคอลัมน์ที่จับคู่ไม่ได้ ไม่ทิ้งเงียบ ๆ", () => {
    expect(parseProductRows(EXPORT_SHAPE).unmappedHeaders).toEqual(["รหัสคลังเดิม"]);
  });

  it("ข้ามแถวว่างล้วนโดยไม่ฟ้อง", () => {
    expect(parseProductRows(EXPORT_SHAPE).rows).toHaveLength(3);
  });

  it("รับหัวคอลัมน์ภาษาอังกฤษและหัวที่มีช่องว่าง/ขีดคั่น", () => {
    const parsed = parseProductRows([
      ["Item Code", "Product Name", "Category", "U.O.M", "Unit Price"],
      ["A-1", "Widget", "Parts", "pc", "12"],
    ]);
    expect(parsed.headerFound).toBe(true);
    expect(parsed.rows[0]).toMatchObject({ code: "A-1", name: "Widget", categoryName: "Parts", unit: "pc", defaultPrice: 12 });
  });

  it("บอกว่าไม่ใช่ไฟล์สินค้า เมื่อไม่มีทั้งคอลัมน์รหัสและชื่อ", () => {
    const parsed = parseProductRows([["วันที่", "ยอดขาย"], ["01/09/2569", "1000"]]);
    expect(parsed.headerFound).toBe(false);
    expect(parsed.rows).toEqual([]);
  });

  it("ทิ้งแถวที่ขาดรหัสหรือชื่อ พร้อมบอกเลขแถวตามที่เห็นใน Excel", () => {
    const parsed = parseProductRows([
      ["รหัสสินค้า", "ชื่อสินค้า"],
      ["", "ของที่ไม่มีรหัส"],
      ["PD-1", ""],
      ["PD-2", "ของที่ครบ"],
    ]);
    expect(parsed.rows.map((r) => r.code)).toEqual(["PD-2"]);
    expect(parsed.problems.map((p) => p.rowNumber)).toEqual([2, 3]);
  });

  it("รหัสซ้ำกันเองในไฟล์ เก็บแถวแรก แล้วฟ้องแถวหลังพร้อมชี้ว่าซ้ำกับแถวไหน", () => {
    const parsed = parseProductRows([
      ["รหัสสินค้า", "ชื่อสินค้า"],
      ["PD-1", "ตัวแรก"],
      ["pd-1", "ตัวซ้ำ ตัวพิมพ์ต่างกัน"],
    ]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].name).toBe("ตัวแรก");
    expect(parsed.problems[0].message).toContain("แถวที่ 2");
  });

  it("ฟ้องเมื่อราคาหรือจุดเตือนไม่ใช่ตัวเลข แทนที่จะเดาเป็น 0 เงียบ ๆ", () => {
    const parsed = parseProductRows([
      ["รหัสสินค้า", "ชื่อสินค้า", "ราคา", "จุดเตือน"],
      ["PD-1", "ของดี", "สอบถาม", ""],
      ["PD-2", "ของดี 2", "10", "ประมาณ 5"],
    ]);
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems).toHaveLength(2);
    expect(parsed.problems[0].message).toContain("ราคาไม่ใช่ตัวเลข");
    expect(parsed.problems[1].message).toContain("จุดเตือนไม่ใช่ตัวเลข");
  });

  it("อ่านช่องเครื่องมือได้ทั้งไทยและอังกฤษ และฟ้องเมื่ออ่านไม่ออก", () => {
    const parsed = parseProductRows([
      ["รหัสสินค้า", "ชื่อสินค้า", "เป็นเครื่องมือ"],
      ["T-1", "สว่าน", "ใช่"],
      ["T-2", "น็อต", "ไม่"],
      ["T-3", "ไขควง", "yes"],
      ["T-4", "ค้อน", ""],
      ["T-5", "อะไรสักอย่าง", "อาจจะ"],
    ]);
    expect(parsed.rows.map((r) => r.isTool)).toEqual([true, false, true, false]);
    expect(parsed.problems[0].message).toContain("ช่องเครื่องมืออ่านไม่ออก");
  });

  it("ตัดแถวที่เกินเพดานต่อการนำเข้าหนึ่งครั้ง แล้วบอกให้รู้", () => {
    const rows: string[][] = [["รหัสสินค้า", "ชื่อสินค้า"]];
    for (let i = 0; i < PRODUCT_IMPORT_MAX_ROWS + 5; i++) rows.push([`P-${i}`, `ของ ${i}`]);
    const parsed = parseProductRows(rows);
    expect(parsed.rows).toHaveLength(PRODUCT_IMPORT_MAX_ROWS);
    expect(parsed.problems.at(-1)?.message).toContain(String(PRODUCT_IMPORT_MAX_ROWS));
  });

  it("ไฟล์ตัวอย่างที่ปุ่มดาวน์โหลดสร้าง ต้องแกะกลับได้ด้วยตัวแกะตัวเดียวกัน", () => {
    const parsed = parseProductRows([PRODUCT_IMPORT_TEMPLATE_HEADERS, PRODUCT_IMPORT_TEMPLATE_SAMPLE]);
    expect(parsed.headerFound).toBe(true);
    expect(parsed.unmappedHeaders).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ code: "PD-0001", unit: "ดอก", defaultPrice: 45, reorderPoint: 10, isTool: false });
  });
});

describe("buildProductImportPreview", () => {
  const rows = parseProductRows([
    ["รหัสสินค้า", "ชื่อสินค้า", "หมวดหมู่"],
    ["PD-9001", "ของใหม่", "หมวดใหม่"],
    ["PD-0150", "ของที่มีอยู่แล้ว", "วัสดุสิ้นเปลือง"],
    ["PD-9002", "ของใหม่อีกตัว", "หมวดใหม่"],
  ]).rows;

  it("แยกแถวที่จะสร้างออกจากแถวที่รหัสมีอยู่แล้ว", () => {
    const preview = buildProductImportPreview(rows, ["PD-0150"], ["วัสดุสิ้นเปลือง"]);
    expect(preview.toCreate.map((r) => r.code)).toEqual(["PD-9001", "PD-9002"]);
    expect(preview.duplicates.map((r) => r.code)).toEqual(["PD-0150"]);
  });

  it("เทียบรหัสเดิมแบบไม่สนตัวพิมพ์ — กันสร้างซ้ำเพราะไฟล์ต้นทางสลับตัวพิมพ์", () => {
    const preview = buildProductImportPreview(rows, ["pd-9001"], []);
    expect(preview.duplicates.map((r) => r.code)).toEqual(["PD-9001"]);
  });

  it("นับหมวดหมู่ใหม่ครั้งเดียวแม้หลายแถวใช้หมวดเดียวกัน และไม่นับหมวดที่มีอยู่แล้ว", () => {
    const preview = buildProductImportPreview(rows, [], ["วัสดุสิ้นเปลือง"]);
    expect(preview.newCategories).toEqual(["หมวดใหม่"]);
  });

  it("ไม่นับหมวดหมู่ของแถวที่จะถูกข้ามอยู่แล้ว", () => {
    const only = parseProductRows([
      ["รหัสสินค้า", "ชื่อสินค้า", "หมวดหมู่"],
      ["PD-0150", "ของที่มีอยู่แล้ว", "หมวดที่ไม่ควรถูกสร้าง"],
    ]).rows;
    expect(buildProductImportPreview(only, ["PD-0150"], []).newCategories).toEqual([]);
  });
});
