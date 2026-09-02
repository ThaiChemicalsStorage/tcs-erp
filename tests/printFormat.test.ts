import { describe, expect, it } from "vitest";
import { EMPTY_MARK, printAmount, printDate, printDateOrBlank, printNumber, printText } from "../src/lib/printFormat";
import { templateLinesToRequisitionLines } from "../src/lib/materialRequisitionTemplate";
import type { MaterialRequisitionTemplateLine } from "../src/lib/materialRequisitionTemplate";

/**
 * ตัวช่วยจัดรูปแบบใบพิมพ์ (2026-09-02) — คุมสองคำสั่งของเจ้าของที่พังแบบเงียบได้ทั้งคู่:
 * "เปลี่ยนเป็นวันเดือนปี" (ถ้าพลาด วันที่จะพิมพ์สลับวัน/เดือนโดยไม่มีอะไรฟ้อง) และ
 * "ใส่ - ให้กับรายละเอียดทุกอัน" (ถ้าพลาด ช่องว่างกับเลขศูนย์จะแยกกันไม่ออกบนกระดาษ)
 */
describe("printDate", () => {
  it("แปลง YYYY-MM-DD เป็น DD/MM/YYYY", () => {
    expect(printDate("2026-09-02")).toBe("02/09/2026");
    expect(printDate("2026-12-31")).toBe("31/12/2026");
  });

  it("รับ ISO timestamp เต็มได้ โดยตัดเวลาทิ้ง", () => {
    expect(printDate("2026-09-02T17:45:12.000Z")).toBe("02/09/2026");
  });

  it("ไม่พึ่งเขตเวลาของเครื่อง — วันที่ไม่เลื่อนไม่ว่าเครื่องตั้งโซนอะไรไว้", () => {
    // `new Date("2026-01-01")` คือเที่ยงคืน UTC เครื่องฝั่งลบจะอ่านกลับได้ 31/12 ถ้าเผลอใช้ getDate()
    expect(printDate("2026-01-01")).toBe("01/01/2026");
  });

  it("ค่าว่างหรือรูปแบบผิดได้ขีดกลาง", () => {
    expect(printDate("")).toBe(EMPTY_MARK);
    expect(printDate(null)).toBe(EMPTY_MARK);
    expect(printDate(undefined)).toBe(EMPTY_MARK);
    expect(printDate("02/09/2026")).toBe(EMPTY_MARK);
  });

  it("printDateOrBlank คืนค่าว่างแทนขีด — ใช้กับช่องลายเซ็นที่ต้องเขียนมือ", () => {
    expect(printDateOrBlank("")).toBe("");
    expect(printDateOrBlank("2026-09-02")).toBe("02/09/2026");
  });
});

describe("printText / printNumber / printAmount", () => {
  it("ข้อความว่างหรือมีแต่ช่องว่างได้ขีดกลาง", () => {
    expect(printText("")).toBe(EMPTY_MARK);
    expect(printText("   ")).toBe(EMPTY_MARK);
    expect(printText(null)).toBe(EMPTY_MARK);
    expect(printText(" ตัวอย่าง ")).toBe("ตัวอย่าง");
  });

  it("ศูนย์ไม่ใช่ค่าว่าง — 'เบิก 0' ต้องพิมพ์เลข 0 ไม่ใช่ขีด", () => {
    expect(printNumber(0)).toBe("0");
    expect(printAmount(0)).toBe("0.00");
  });

  it("null / undefined / NaN ได้ขีดกลาง", () => {
    expect(printNumber(null)).toBe(EMPTY_MARK);
    expect(printNumber(undefined)).toBe(EMPTY_MARK);
    expect(printNumber(Number.NaN)).toBe(EMPTY_MARK);
    expect(printAmount(null)).toBe(EMPTY_MARK);
  });

  it("printAmount ใส่ตัวคั่นหลักพันและทศนิยมสองตำแหน่ง", () => {
    expect(printAmount(1234567.5)).toBe("1,234,567.50");
  });
});

describe("templateLinesToRequisitionLines", () => {
  const line = (id: string): MaterialRequisitionTemplateLine => ({
    id, productId: "p1", productCode: "CH-001", productName: "เรซิ่น", unit: "กก.",
    category: "chemical", plannedQty: 5,
  });

  it("คัดลอกข้อมูลสินค้าและจำนวนตั้งต้นมาครบ", () => {
    const [converted] = templateLinesToRequisitionLines([line("a")]);
    expect(converted.productId).toBe("p1");
    expect(converted.productCode).toBe("CH-001");
    expect(converted.plannedQty).toBe(5);
    // ช่องที่สโตร์กรอกตอนจ่ายของจริงต้องเริ่มว่างเสมอ
    expect(converted.withdrawal1Qty).toBeNull();
    expect(converted.returnQty).toBeNull();
    expect(converted.actualUsedQty).toBeNull();
  });

  it("สร้าง id ใหม่ทุกครั้ง — กดใช้เทมเพลตเดิมซ้ำในใบเดียวต้องไม่ได้ key ซ้ำ", () => {
    const first = templateLinesToRequisitionLines([line("a"), line("b")]);
    const second = templateLinesToRequisitionLines([line("a"), line("b")]);
    const ids = [...first, ...second].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    // และต้องไม่ใช่ id ของบรรทัดในเทมเพลต ซึ่งใช้ซ้ำกันทุกใบที่เรียกเทมเพลตเดียวกัน
    expect(ids).not.toContain("a");
  });
});
