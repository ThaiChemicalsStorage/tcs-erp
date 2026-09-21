import { describe, expect, it } from "vitest";
import {
  resolveRange, isWithinRange, ALL_DATES, rangeForPreset, todayIsoBangkok, type DateRangeValue,
} from "../src/lib/dateRanges";

/**
 * ตัวกรองช่วงวันที่ของหน้ารายการเอกสาร (2026-09-21) — เจ้าของสั่งเพราะระบบเก็บเอกสาร 10 ปี
 *
 * สิ่งที่ตรึงไว้คือจุดที่พังแล้วไม่มีอะไรฟ้อง: เขตเวลา (ทั้งระบบคิดตามเวลาไทย ไม่ใช่ UTC)
 * และการกรอกช่วงด้านเดียว ซึ่งเป็นสิ่งที่คนใช้งานจริงทำบ่อย
 */

const custom = (from: string, to: string): DateRangeValue => ({ preset: "custom", from, to });

describe("resolveRange", () => {
  it("ทั้งหมด = ไม่กรอง", () => {
    expect(resolveRange(ALL_DATES)).toBeNull();
  });

  it("วันนี้ เดือนนี้ ปีนี้ ใช้ช่วงเดียวกับแดชบอร์ดเป๊ะ", () => {
    for (const preset of ["today", "thisMonth", "thisYear"] as const) {
      expect(resolveRange({ preset, from: "", to: "" })).toEqual(rangeForPreset(preset));
    }
  });

  it("วันนี้คิดตามเวลาไทย ไม่ใช่ UTC", () => {
    expect(resolveRange({ preset: "today", from: "", to: "" })).toEqual({
      from: todayIsoBangkok(), to: todayIsoBangkok(),
    });
  });

  it("กำหนดเองที่ยังไม่กรอกอะไรเลย = ไม่กรอง", () => {
    expect(resolveRange(custom("", ""))).toBeNull();
  });

  it("กรอกด้านเดียวได้ — ตั้งแต่วันนี้เป็นต้นไป / ก่อนวันนี้", () => {
    expect(resolveRange(custom("2026-01-01", ""))).toEqual({ from: "2026-01-01", to: "9999-12-31" });
    expect(resolveRange(custom("", "2026-01-31"))).toEqual({ from: "0000-01-01", to: "2026-01-31" });
  });
});

describe("isWithinRange", () => {
  const range = { from: "2026-09-01", to: "2026-09-30" };

  it("ไม่มีช่วง = ผ่านทุกใบ", () => {
    expect(isWithinRange("2020-01-01", null)).toBe(true);
  });

  it("เอกสารที่ไม่มีวันที่ ตกทุกช่วง — ไม่ใช่ผ่านฟรี", () => {
    expect(isWithinRange(undefined, range)).toBe(false);
    expect(isWithinRange("", range)).toBe(false);
  });

  it("วันที่ล้วนเทียบตรง ๆ รวมวันขอบทั้งสองด้าน", () => {
    expect(isWithinRange("2026-09-01", range)).toBe(true);
    expect(isWithinRange("2026-09-30", range)).toBe(true);
    expect(isWithinRange("2026-08-31", range)).toBe(false);
    expect(isWithinRange("2026-10-01", range)).toBe(false);
  });

  /**
   * `updatedAt` เก็บเป็น UTC · เอกสารที่บันทึก 30 ก.ย. 17:30 UTC คือ **1 ต.ค. เวลาไทย**
   * ถ้าตัดสตริงดิบ ๆ จะนับเป็นเดือนกันยายน ซึ่งไม่ตรงกับที่คนไทยเห็นบนหน้าจอ
   */
  it("timestamp เต็มถูกแปลงเป็นเวลาไทยก่อนเทียบ", () => {
    expect(isWithinRange("2026-09-30T17:30:00.000Z", range), "17:30 UTC = 00:30 ของวันถัดไปตามเวลาไทย").toBe(false);
    expect(isWithinRange("2026-09-30T10:00:00.000Z", range), "10:00 UTC = 17:00 วันเดียวกันตามเวลาไทย").toBe(true);
    expect(isWithinRange("2026-08-31T17:30:00.000Z", range), "31 ส.ค. 17:30 UTC = 1 ก.ย. เวลาไทย").toBe(true);
  });
});
