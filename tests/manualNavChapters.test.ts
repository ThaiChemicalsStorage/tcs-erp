import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MANUAL_CHAPTERS, NAV_MANUAL_CHAPTER, manualHrefForNav } from "../src/lib/manualSections";

// ปุ่ม "คู่มือการใช้งาน" เปิดบทของหน้าที่อยู่ (Tuhmo #43, 2026-10-06) — กันหน้าใหม่ตกหล่น และกันลิงก์ไปบทที่ไม่มีจริง
const appSrc = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const navKeys = [...(/type NavKey = ([^;]+);/.exec(appSrc)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const manualHtml = readFileSync(new URL("../public/manual.html", import.meta.url), "utf8");

describe("manual chapter per page", () => {
  it("reads the NavKey list from App.tsx", () => {
    expect(navKeys.length).toBeGreaterThan(30);
  });

  it("every page has a chapter", () => {
    expect(navKeys.filter((k) => !NAV_MANUAL_CHAPTER[k])).toEqual([]);
  });

  it("every mapped chapter exists in the chapter list and as an anchor in public/manual.html", () => {
    for (const chapter of new Set(Object.values(NAV_MANUAL_CHAPTER))) {
      expect(MANUAL_CHAPTERS[chapter], chapter).toBeTruthy();
      expect(manualHtml, chapter).toMatch(new RegExp(`id="${chapter}"`));
    }
  });

  it("an unknown page falls back to the manual's first page", () => {
    expect(manualHrefForNav("quotations")).toBe("/manual.html#ch6");
    expect(manualHrefForNav("no-such-page")).toBe("/manual.html");
  });
});
