import { describe, expect, it } from "vitest";
import { approximateMeasurer, wrapTextToWidth, type TextMeasurer } from "../src/lib/printTextWrap";

// 1 ตัวอักษร = 1mm พอดี (96/25.4 px) — ทำให้นับความกว้างเป็นตัวอักษรได้ตรง ๆ
const oneMmPerChar: TextMeasurer = (text) => Array.from(text).length * (96 / 25.4);

describe("wrapTextToWidth", () => {
  it("keeps short text on one line", () => {
    expect(wrapTextToWidth("FRP Duct System", 40, oneMmPerChar)).toEqual(["FRP Duct System"]);
  });

  it("wraps at word boundaries and drops the space at the break", () => {
    expect(wrapTextToWidth("Transportation and Crane Charge to Nonthaburi", 31, oneMmPerChar))
      .toEqual(["Transportation and Crane Charge", "to Nonthaburi"]);
  });

  it("breaks a single word longer than the line by character", () => {
    expect(wrapTextToWidth("ABCDEFGHIJ", 4, oneMmPerChar)).toEqual(["ABCD", "EFGH", "IJ"]);
  });

  it("honours explicit newlines", () => {
    expect(wrapTextToWidth("บรรทัดแรก\nบรรทัดสอง", 50, oneMmPerChar)).toEqual(["บรรทัดแรก", "บรรทัดสอง"]);
  });

  it("keeps a leading indent on the first line only", () => {
    expect(wrapTextToWidth(" -Size: 500 mm. -Throat: 200 mm.", 16, oneMmPerChar))
      .toEqual([" -Size: 500 mm.", "-Throat: 200 mm."]);
  });

  it("never splits a Thai vowel or tone mark away from its consonant", () => {
    const lines = wrapTextToWidth("ค่าบริการติดตั้งระบบบำบัดอากาศ", 3, approximateMeasurer(96 / 25.4 / 0.55));
    for (const line of lines) expect(line).not.toMatch(/^[ัิ-ฺ็-๎]/);
    expect(lines.join("")).toBe("ค่าบริการติดตั้งระบบบำบัดอากาศ");
  });

  it("returns one empty line for empty text", () => {
    expect(wrapTextToWidth("", 10, oneMmPerChar)).toEqual([""]);
  });
});
