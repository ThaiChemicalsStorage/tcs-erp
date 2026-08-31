import { describe, expect, it } from "vitest";
import {
  purchaseOrderTotals,
  purchaseOrderSubtotal,
  purchaseOrderLineTotal,
  blankPurchaseOrderLine,
  type PurchaseOrderLine,
  type PurchaseOrder,
} from "../src/lib/purchaseOrder";
import { VAT_RATE, computeTotals } from "../src/lib/quoteMath";

/**
 * ส่วนลดใบสั่งซื้อ (2026-08-31) — เจ้าของขอไว้ 2026-08-28:
 * *"เพิ่มส่วนลดเพิ่มเติมไปในใบสั่งซื้อเป็นได้ทั้งเปอร์เซ็นและเงิน ละก็มีส่วนลดท้ายใบด้วย"*
 *
 * สิ่งที่ตรึงไว้ที่สำคัญที่สุดคือข้อสุดท้าย: **ใบสั่งซื้อต้องใช้ `vatRate` ของตัวเอง ไม่ใช่ 7% ที่
 * `quoteMath.computeTotals()` ฮาร์ดโค้ดไว้** ถ้าใครเผลอสลับไปเรียก `computeTotals()` เพราะเห็นว่า
 * "สูตรเหมือนกัน" ใบสั่งซื้อจากผู้ขายที่ไม่จด VAT จะคิดภาษีเพิ่มมาเงียบ ๆ
 */

function line(over: Partial<PurchaseOrderLine> = {}): PurchaseOrderLine {
  return { ...blankPurchaseOrderLine("l1"), qty: 10, unitPrice: 100, ...over };
}

function doc(over: Partial<Pick<PurchaseOrder, "lines" | "vatRate" | "discount" | "discountMode">> = {}) {
  return { lines: [line()], vatRate: null as number | null, discount: null as number | null, discountMode: "percent" as const, ...over };
}

describe("ส่วนลดรายบรรทัด", () => {
  it("คิดเป็นเปอร์เซ็นต์เมื่อไม่ระบุโหมด", () => {
    expect(purchaseOrderLineTotal(line({ discount: 10, discountMode: undefined }))).toBe(900);
  });

  it("คิดเป็นจำนวนเงินเมื่อโหมดเป็น amount", () => {
    expect(purchaseOrderLineTotal(line({ discount: 150, discountMode: "amount" }))).toBe(850);
  });

  it("ไม่มีส่วนลด = ยอดเต็ม (เอกสารเก่าที่ไม่มีฟิลด์นี้อ่านออกมาเป็นแบบนี้)", () => {
    expect(purchaseOrderLineTotal(line({ discount: null }))).toBe(1000);
    expect(purchaseOrderLineTotal(line({ discount: undefined, discountMode: undefined }))).toBe(1000);
  });

  it("ส่วนลดที่มากกว่ายอด ถูกบีบให้เหลือศูนย์ ไม่ใช่ติดลบ", () => {
    expect(purchaseOrderLineTotal(line({ discount: 99999, discountMode: "amount" }))).toBe(0);
  });

  it("ยอดรวมก่อนภาษีคือผลรวมของบรรทัดที่หักส่วนลดแล้ว", () => {
    const lines = [
      { ...line({ discount: 10 }), id: "a" },
      { ...line({ qty: 2, unitPrice: 50, discount: 20, discountMode: "amount" as const }), id: "b" },
    ];
    expect(purchaseOrderSubtotal(lines)).toBe(900 + 80);
  });
});

describe("ส่วนลดท้ายใบและภาษี", () => {
  it("ส่วนลดท้ายใบคิดจากยอดหลังหักส่วนลดรายบรรทัด และคิดก่อน VAT", () => {
    const t = purchaseOrderTotals(doc({ lines: [line({ discount: 10 })], discount: 10, vatRate: 7 }));
    expect(t.subtotal).toBe(900);
    expect(t.discountAmt).toBe(90);
    expect(t.afterDiscount).toBe(810);
    expect(t.vatAmt).toBeCloseTo(56.7, 6);
    expect(t.total).toBeCloseTo(866.7, 6);
  });

  it("ส่วนลดท้ายใบแบบจำนวนเงิน", () => {
    const t = purchaseOrderTotals(doc({ discount: 250, discountMode: "amount", vatRate: 0 }));
    expect(t.discountAmt).toBe(250);
    expect(t.total).toBe(750);
  });

  it("vatRate = null (ยังไม่ระบุ) แปลว่าไม่คิดภาษี ไม่ใช่คิด 7%", () => {
    const t = purchaseOrderTotals(doc({ vatRate: null }));
    expect(t.vatAmt).toBe(0);
    expect(t.total).toBe(1000);
  });

  it("🔴 ใช้ vatRate ของใบเอง ไม่ใช่ 7% ที่ quoteMath ฮาร์ดโค้ดไว้", () => {
    expect(VAT_RATE, "ถ้าค่านี้เปลี่ยน เทสต์ข้อนี้ต้องอ่านใหม่").toBe(7);

    // ผู้ขายที่ไม่จด VAT — ใบนี้ต้องไม่มีภาษีเลย
    expect(purchaseOrderTotals(doc({ vatRate: 0 })).total).toBe(1000);
    // อัตราอื่นที่ไม่ใช่ 7 ก็ต้องได้ตามที่กรอก
    expect(purchaseOrderTotals(doc({ vatRate: 10 })).vatAmt).toBe(100);

    // และต้องไม่ตรงกับสิ่งที่ computeTotals() ของใบเสนอราคาจะให้ ซึ่งบังคับ 7% เสมอ
    const quoteAnswer = computeTotals([{ qty: 10, unitPrice: 100, discount: 0 }], 0);
    expect(quoteAnswer.vatAmt).toBe(70);
    expect(purchaseOrderTotals(doc({ vatRate: 10 })).vatAmt).not.toBe(quoteAnswer.vatAmt);
  });
});
