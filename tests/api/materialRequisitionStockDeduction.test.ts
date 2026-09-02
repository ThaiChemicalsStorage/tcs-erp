import { describe, expect, it, beforeAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * กฎการรวมยอดสำหรับ "ตัดของอัตโนมัติ" (2026-09-02) — `deductionsFor()` ใน
 * `api/_lib/materialRequisitionHandler.ts`
 *
 * เป็นจุดที่พลาดแล้ว**สต๊อกเพี้ยนแบบเงียบ ๆ**: ถ้าไม่รวมยอดต่อสินค้า ใบที่ใส่สินค้าตัวเดิมสองบรรทัด
 * จะผ่านด่านตรวจทั้งสองบรรทัดทั้งที่รวมกันแล้วเกินยอดคงเหลือ แล้วไปล้มตอนตัดจริงหลังเอกสารเป็น Final
 * ไปแล้ว ซึ่งย้อนไม่ได้ · ทดสอบแยกจาก route เพราะกฎนี้ไม่ได้ขึ้นกับ HTTP หรือสิทธิ์เลย
 */
let handler: typeof import("../../api/_lib/materialRequisitionHandler.js");

beforeAll(async () => {
  // โมดูลนี้ import ลูกโซ่ไปถึง collections.ts ซึ่งต้องมี MONGODB_URI ตอน import — ชี้ไปที่ memory server
  // เหมือนที่ tests/api/stockMovements.test.ts ทำ (ไม่มีการต่อจริงเกิดขึ้นในเทสต์ชุดนี้)
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  handler = await import("../../api/_lib/materialRequisitionHandler.js");
});

describe("deductionsFor", () => {
  it("รวมยอดของสินค้าตัวเดียวกันที่อยู่คนละบรรทัด", () => {
    const result = handler.deductionsFor([
      { productId: "p1", plannedQty: 2 },
      { productId: "p1", plannedQty: 2 },
      { productId: "p2", plannedQty: 1 },
    ]);
    expect(result.get("p1"), "2 + 2 ต้องเป็น 4 ไม่ใช่เช็คทีละ 2").toBe(4);
    expect(result.get("p2")).toBe(1);
    expect(result.size).toBe(2);
  });

  it("ข้ามบรรทัดที่พิมพ์เองโดยไม่ได้เลือกจากแคตตาล็อก — ไม่มีสต๊อกให้ตัด", () => {
    const result = handler.deductionsFor([
      { productId: "", plannedQty: 5 },
      { plannedQty: 5 },
      { productId: "   ", plannedQty: 5 },
    ]);
    expect(result.size).toBe(0);
  });

  it("ข้ามบรรทัดที่ยังไม่กรอกจำนวน หรือกรอกเป็นศูนย์/ติดลบ", () => {
    const result = handler.deductionsFor([
      { productId: "p1", plannedQty: null },
      { productId: "p2" },
      { productId: "p3", plannedQty: 0 },
      { productId: "p4", plannedQty: -3 },
    ]);
    expect(result.size, "ศูนย์คือ 'ไม่เบิก' ส่วนติดลบคือข้อมูลเสีย ทั้งคู่ไม่ควรไปแตะสต๊อก").toBe(0);
  });

  it("ใบที่ไม่มีรายการเลยได้ผลลัพธ์ว่าง — ด่านตรวจต้องปล่อยผ่าน ไม่ใช่ล้ม", () => {
    expect(handler.deductionsFor([]).size).toBe(0);
  });

  it("ตัดช่องว่างหัวท้ายของรหัสสินค้าก่อนรวมยอด", () => {
    const result = handler.deductionsFor([
      { productId: " p1 ", plannedQty: 1 },
      { productId: "p1", plannedQty: 1 },
    ]);
    expect(result.size, "ไม่งั้นสินค้าตัวเดียวจะถูกนับเป็นสองตัว แล้วด่านตรวจจะหลวมลง").toBe(1);
    expect(result.get("p1")).toBe(2);
  });
});

/**
 * เลขใบเบิกของฝ่ายผลิตอิงจาก **เลขที่บนฟอร์ม** ของใบสั่งผลิต ซึ่งผู้ใช้แก้เองได้ — ไม่ใช่รหัสภายใน
 * เลขนั้นจึงกลายเป็น `_id` ของใบเบิก และ `_id` ไปโผล่ใน URL ของ route ที่ถูกตัดด้วย `/`
 * ถ้าปล่อยให้อักขระอันตรายหลุดเข้าไป route ของใบนั้นจะพังทั้งเส้นและเปิดเอกสารไม่ได้อีกเลย
 */
describe("safePrefix", () => {
  it("ใช้เลขที่บนฟอร์มตามที่พิมพ์ รวมถึงภาษาไทย", () => {
    expect(handler.safePrefix("SC-2026-09-002")).toBe("SC-2026-09-002");
    expect(handler.safePrefix("SC-ทดสอบแก้เลข-01")).toBe("SC-ทดสอบแก้เลข-01");
    expect(handler.safePrefix("  SC-2026-09-002  "), "ตัดช่องว่างหัวท้ายทิ้ง").toBe("SC-2026-09-002");
  });

  it("ถอยไปใช้รหัสภายในเมื่อเลขบนฟอร์มมีอักขระที่ทำให้ URL พัง", () => {
    for (const bad of ["SC/2026/09", "SC 2026", "SC?x", "SC#1", "SC%20", "SC\\2026"]) {
      expect(handler.safePrefix(bad), bad).toBe("");
    }
  });

  it("เลขบนฟอร์มที่ว่างเปล่าถือว่าไม่มี", () => {
    expect(handler.safePrefix("")).toBe("");
    expect(handler.safePrefix("   ")).toBe("");
  });
});
