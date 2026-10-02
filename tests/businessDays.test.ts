import { describe, expect, it } from "vitest";
import {
  addBusinessDays, agingTone, businessDaysBetween, calendarDaysBetween, purchasingTargetDays, todayInThailand,
} from "../src/lib/businessDays";

// ปฏิทินอ้างอิง: 2026-09-18 = ศุกร์ · 19 เสาร์ · 20 อาทิตย์ · 21 จันทร์ · 25 ศุกร์ · 28 จันทร์
describe("businessDaysBetween — นับเฉพาะ จ.–ศ.", () => {
  it("วันเดียวกัน = 0", () => {
    expect(businessDaysBetween("2026-09-23", "2026-09-23")).toBe(0);
  });
  it("ข้ามเสาร์–อาทิตย์: ศุกร์ → อังคาร = 2", () => {
    expect(businessDaysBetween("2026-09-18", "2026-09-22")).toBe(2);
  });
  it("พุธ → จันทร์ถัดไป = 3", () => {
    expect(businessDaysBetween("2026-09-23", "2026-09-28")).toBe(3);
  });
  it("ใบถึงวันเสาร์ ถือว่าถึงวันจันทร์ (จันทร์ = วันที่ 0)", () => {
    expect(businessDaysBetween("2026-09-19", "2026-09-21")).toBe(0);
    expect(businessDaysBetween("2026-09-20", "2026-09-22")).toBe(1);
  });
  it("วันสิ้นสุดเป็นเสาร์/อาทิตย์ไม่บวกเพิ่ม", () => {
    expect(businessDaysBetween("2026-09-18", "2026-09-20")).toBe(0);
  });
  it("วันสิ้นสุดก่อนวันเริ่ม = 0 · ค่าว่าง = null", () => {
    expect(businessDaysBetween("2026-09-28", "2026-09-18")).toBe(0);
    expect(businessDaysBetween("", "2026-09-18")).toBeNull();
  });
  it("รับ ISO เต็มได้ (ตัดเอาแค่วันที่)", () => {
    expect(businessDaysBetween("2026-09-23T08:00:00.000Z", "2026-09-28T23:00:00.000Z")).toBe(3);
  });
});

describe("ตัวช่วยอื่น", () => {
  it("เป้า: ปกติ 7 · ด่วน 3 วันทำการ", () => {
    expect(purchasingTargetDays(false)).toBe(7);
    expect(purchasingTargetDays(undefined)).toBe(7);
    expect(purchasingTargetDays(true)).toBe(3);
  });
  it("วันครบกำหนดข้ามเสาร์–อาทิตย์", () => {
    expect(addBusinessDays("2026-09-23", 3)).toBe("2026-09-28");
    expect(addBusinessDays("2026-09-19", 1)).toBe("2026-09-22");
  });
  it("ป้ายเทียบเป้า", () => {
    expect(agingTone(2, 3)).toBe("ok");
    expect(agingTone(3, 3)).toBe("due");
    expect(agingTone(4, 3)).toBe("over");
  });
  it("วันตามปฏิทิน", () => {
    expect(calendarDaysBetween("2026-09-23", "2026-09-28")).toBe(5);
  });
  it("วันนี้ตามเวลาไทย — 23:30 UTC คือวันถัดไปในไทย", () => {
    expect(todayInThailand(new Date("2026-09-27T23:30:00.000Z"))).toBe("2026-09-28");
  });
});
