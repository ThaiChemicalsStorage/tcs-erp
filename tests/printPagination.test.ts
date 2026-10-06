import { describe, it, expect } from "vitest";
import { paginate } from "../src/lib/printPagination";

/**
 * ใบพิมพ์แบบฟอร์มขึ้นหน้าใหม่ (2026-10-06 เจ้าของ) — ทุกหน้ามีหัว + ตารางเต็มหน้า · ช่องเซ็นอยู่หน้าสุดท้ายเสมอ
 * ถ้ารายการจบแล้วช่องเซ็นไม่พอที่ ยกช่องเซ็นไปหน้าใหม่ที่มีแต่แถวว่าง
 */
describe("paginate", () => {
  const base = { available: 100, blankHeight: 10, footerHeight: 30 };

  it("รายการน้อย — หน้าเดียว เติมแถวว่างจนเหลือที่พอดีช่องเซ็น", () => {
    expect(paginate({ ...base, rowHeights: [10, 10] }).pages).toEqual([{ rows: [0, 1], blanks: 5, last: true }]);
  });

  it("รายการล้น — หน้าแรกเต็ม ไปต่อหน้าสอง แถวว่างเติมทั้งสองหน้า", () => {
    const { pages } = paginate({ ...base, rowHeights: Array(12).fill(10) });
    expect(pages).toEqual([
      { rows: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], blanks: 0, last: false },
      { rows: [10, 11], blanks: 5, last: true },
    ]);
  });

  it("รายการพอดีแต่ช่องเซ็นไม่พอ — ช่องเซ็นยกไปหน้าใหม่ที่มีแต่แถวว่างเต็มหน้า", () => {
    const { pages } = paginate({ ...base, rowHeights: Array(8).fill(10) });
    expect(pages).toEqual([
      { rows: [0, 1, 2, 3, 4, 5, 6, 7], blanks: 2, last: false },
      { rows: [], blanks: 7, last: true },
    ]);
  });

  it("บรรทัดสูงไม่เท่ากัน — ตัดหน้าตามความสูงจริง ไม่ใช่จำนวนบรรทัด", () => {
    const { pages } = paginate({ ...base, rowHeights: [40, 40, 40] });
    expect(pages.map((p) => p.rows)).toEqual([[0, 1], [2]]);
  });

  it("ไม่มีรายการเลย — หน้าเดียวตารางว่าง + ช่องเซ็น", () => {
    expect(paginate({ ...base, rowHeights: [] }).pages).toEqual([{ rows: [], blanks: 7, last: true }]);
  });

  it("หน้าแรกที่ว่างน้อยกว่า (เช็คลิสต์ Scope of Work พิมพ์เฉพาะหน้าแรก) — หน้าแรกรับบรรทัดน้อยกว่า หน้าถัดไปรับเต็ม", () => {
    const { pages } = paginate({ ...base, firstAvailable: 50, rowHeights: Array(12).fill(10) });
    expect(pages.map((p) => p.rows.length)).toEqual([5, 7]);
    expect(pages[0].blanks).toBe(0);
    expect(pages[1]).toMatchObject({ last: true, blanks: 0 });
  });

  it("บรรทัดเดียวสูงเกินหน้า — วางลงหน้าของมันเอง ไม่วนไม่จบ", () => {
    const { pages } = paginate({ ...base, rowHeights: [10, 150, 10] });
    expect(pages.map((p) => p.rows)).toEqual([[0], [1], [2]]);
  });
});
