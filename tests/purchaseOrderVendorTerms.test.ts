import { describe, it, expect } from "vitest";
import { purchaseOrderTotals, blankPurchaseOrderLine } from "../src/lib/purchaseOrder";
import { vendorTermsForOrder, type Vendor } from "../src/lib/vendors";

/**
 * ใบสั่งซื้อดึงเงื่อนไขจากผู้ขาย + ประเภทราคา (2026-10-02 — เจ้าของตอบ: ดึงเงื่อนไขชำระ/เครดิต/VAT/ประเภทราคาจากผู้ขาย ยังแก้ในใบได้)
 *
 * ตรึงไว้: ใบเก่าที่ไม่มี `priceType` ได้ยอดเดิมทุกประการ · รวม VAT ถอด VAT ออกจากยอด ไม่บวกเพิ่ม ·
 * ค่าว่างของผู้ขายไม่ไปลบสิ่งที่จัดซื้อพิมพ์ไว้ในใบ
 */

const lines = [{ ...blankPurchaseOrderLine("l1"), qty: 1, unitPrice: 1070 }];

describe("purchaseOrderTotals — ประเภทราคา", () => {
  it("ใบเก่าไม่มี priceType: มีอัตรา = แยก VAT · ไม่มีอัตรา = ไม่มี VAT (สูตรเดิม)", () => {
    expect(purchaseOrderTotals({ lines, vatRate: 7, discount: null, discountMode: "percent" })).toMatchObject({ priceType: "exclusive", vatAmt: 74.9, total: 1144.9 });
    expect(purchaseOrderTotals({ lines, vatRate: null, discount: null, discountMode: "percent" })).toMatchObject({ priceType: "none", vatAmt: 0, total: 1070 });
  });

  it("รวม VAT: ถอด VAT ออกจากยอด ยอดสุทธิเท่าราคาที่กรอก", () => {
    const t = purchaseOrderTotals({ lines, vatRate: 7, discount: null, discountMode: "percent", priceType: "inclusive" });
    expect(t.total).toBe(1070);
    expect(t.vatAmt).toBeCloseTo(70, 6);
    expect(t.base).toBeCloseTo(1000, 6);
  });

  it("ไม่มี VAT แม้มีอัตราค้างอยู่ = ไม่คิด VAT", () => {
    expect(purchaseOrderTotals({ lines, vatRate: 7, discount: null, discountMode: "percent", priceType: "none" })).toMatchObject({ vatAmt: 0, total: 1070 });
  });
});

describe("vendorTermsForOrder", () => {
  const base = { paymentTerms: "", creditDays: null, vatRate: null, priceType: "", shippingMethod: "" } as unknown as Vendor;

  it("คืนเฉพาะช่องที่ผู้ขายมีค่า", () => {
    expect(vendorTermsForOrder(base)).toEqual({});
    expect(vendorTermsForOrder({ ...base, paymentTerms: "1.เครดิต 30วัน", creditDays: 30, vatRate: 7, priceType: "exclusive", shippingMethod: "รถบริษัท" }))
      .toEqual({ paymentTerms: "1.เครดิต 30วัน", creditDays: 30, vatRate: 7, priceType: "exclusive", shippingMethod: "รถบริษัท" });
  });

  it("เครดิต 0 วัน / VAT 0% เป็นค่าจริง ไม่ใช่ค่าว่าง", () => {
    expect(vendorTermsForOrder({ ...base, creditDays: 0, vatRate: 0 })).toEqual({ creditDays: 0, vatRate: 0 });
  });
});
