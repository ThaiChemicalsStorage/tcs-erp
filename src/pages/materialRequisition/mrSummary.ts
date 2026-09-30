import { issuedQtyOf, outstandingQtyOf, type MaterialRequisitionLine } from "../../lib/materialRequisition";

/**
 * ตัวเลขการ์ดกรมท่า "รายการวัสดุ" บนคอลัมน์ขวาของใบเบิก (ดีไซน์ใหม่ 2026-09-30 — การ์ดนับใหม่) — คิดจากรายการในใบ
 * กับยอดคงเหลือที่เซิร์ฟเวอร์ส่งมาพร้อมใบ ไม่มีข้อมูลใหม่:
 *
 *  - **จ่ายครบแล้ว** = บรรทัดที่จ่ายไปแล้วและไม่เหลือค้าง
 *  - **ค้างเบิก** = บรรทัดที่ยังจ่ายไม่ครบตามที่ขอ (`outstandingQtyOf` > 0 — ฉบับร่างคือทุกบรรทัดที่ขอไว้)
 *  - **ของไม่พอ** = บรรทัดที่ค้างเบิกมากกว่ายอดคงเหลือในคลัง — กฎเดียวกับป้าย "ของไม่พอ ขาด n" ในตาราง
 *    (เทียบกับที่ยังต้องจ่าย ไม่ใช่ที่ขอทั้งหมด เพราะส่วนที่จ่ายไปแล้วออกจากคลังไปแล้ว) · สินค้าที่ไม่รู้ยอดไม่นับ
 */
export interface RequisitionLineSummary {
  total: number;
  fullyIssued: number;
  outstanding: number;
  short: number;
}

export function summarizeRequisitionLines(
  lines: Pick<MaterialRequisitionLine, "productId" | "plannedQty" | "withdrawal1Qty" | "withdrawal2Qty">[],
  stockByProduct: Record<string, number>,
): RequisitionLineSummary {
  let fullyIssued = 0;
  let outstanding = 0;
  let short = 0;
  for (const line of lines) {
    const left = outstandingQtyOf(line);
    if (left > 0) {
      outstanding += 1;
      const stock = stockByProduct[line.productId];
      if (stock !== undefined && left > stock) short += 1;
    } else if (issuedQtyOf(line) > 0) {
      fullyIssued += 1;
    }
  }
  return { total: lines.length, fullyIssued, outstanding, short };
}
