import { describe, expect, it } from "vitest";
import {
  addDaysIso, formatDateInput, isWithinRange, maskDateTyping, monthGrid, parseDateInput, parseIso,
} from "../src/lib/dateInputFormat";

// ช่องวันที่ของทั้งแอป (Tuhmo #48, 2026-10-08) — เจ้าของ: วันนำหน้าทุกเครื่อง ปีเป็น พ.ศ.
describe("formatDateInput", () => {
  it("shows day/month first, Buddhist year in Thai mode and CE in English mode", () => {
    expect(formatDateInput("2026-10-08", "be")).toBe("08/10/2569");
    expect(formatDateInput("2026-10-08", "ce")).toBe("08/10/2026");
  });
  it("empty or malformed values show nothing", () => {
    expect(formatDateInput("", "be")).toBe("");
    expect(formatDateInput("2026-02-31", "be")).toBe("");
    expect(formatDateInput("08/10/2026", "be")).toBe("");
  });
});

describe("maskDateTyping", () => {
  it("adds the slashes while typing digits only", () => {
    expect(maskDateTyping("0")).toBe("0");
    expect(maskDateTyping("081")).toBe("08/1");
    expect(maskDateTyping("08102569")).toBe("08/10/2569");
    expect(maskDateTyping("081025691")).toBe("08/10/2569");
  });
  it("typing digits one at a time into the field gives the full date (each keystroke re-masks the previous text)", () => {
    // แบบเดียวกับที่ช่องทำจริง: ข้อความเดิม (ที่มี "/" ที่เราเติมให้แล้ว) + ตัวที่พิมพ์ใหม่ — บั๊กแรกตัดเลขปีทิ้งที่จุดนี้
    let text = "";
    for (const ch of "05102569") text = maskDateTyping(text + ch);
    expect(text).toBe("05/10/2569");
    expect(maskDateTyping("05/102")).toBe("05/10/2");
    expect(maskDateTyping("5/1025")).toBe("5/10/25");
  });
  it("keeps slashes the user typed and strips anything else", () => {
    expect(maskDateTyping("8/10/2569")).toBe("8/10/2569");
    expect(maskDateTyping("8-10-2569")).toBe("8/10/2569");
    expect(maskDateTyping("8.10.2569")).toBe("8/10/2569");
    expect(maskDateTyping("วันที่ 8/10")).toBe("8/10");
    expect(maskDateTyping("08/10/25690")).toBe("08/10/2569");
  });
});

describe("parseDateInput", () => {
  it("reads พ.ศ. back to an ISO date", () => {
    expect(parseDateInput("08/10/2569", "be")).toBe("2026-10-08");
    expect(parseDateInput("8/1/2569", "be")).toBe("2026-01-08");
  });
  it("a CE year typed in Thai mode still means CE (≥ 2400 is always พ.ศ.)", () => {
    expect(parseDateInput("08/10/2026", "be")).toBe("2026-10-08");
    expect(parseDateInput("08/10/2569", "ce")).toBe("2026-10-08");
  });
  it("two-digit years follow the mode", () => {
    expect(parseDateInput("08/10/69", "be")).toBe("2026-10-08");
    expect(parseDateInput("08/10/26", "ce")).toBe("2026-10-08");
  });
  it("incomplete or impossible dates are rejected, never half-saved", () => {
    expect(parseDateInput("08/10/25", "be")).toBe("1982-10-08"); // 2525 พ.ศ. — complete and real, so accepted
    expect(parseDateInput("08/10/256", "be")).toBeNull();
    expect(parseDateInput("31/02/2569", "be")).toBeNull();
    expect(parseDateInput("29/02/2567", "be")).toBe("2024-02-29");
    expect(parseDateInput("29/02/2569", "be")).toBeNull();
    expect(parseDateInput("", "be")).toBeNull();
  });
  it("round-trips with formatDateInput in both modes", () => {
    for (const iso of ["2026-01-01", "2024-02-29", "2026-12-31"]) {
      expect(parseDateInput(formatDateInput(iso, "be"), "be")).toBe(iso);
      expect(parseDateInput(formatDateInput(iso, "ce"), "ce")).toBe(iso);
    }
  });
});

describe("calendar helpers", () => {
  it("min/max are inclusive and optional", () => {
    expect(isWithinRange("2026-10-08", "2026-10-08", "2026-10-08")).toBe(true);
    expect(isWithinRange("2026-10-07", "2026-10-08")).toBe(false);
    expect(isWithinRange("2026-10-09", undefined, "2026-10-08")).toBe(false);
    expect(isWithinRange("2026-10-09")).toBe(true);
  });
  it("month grid starts on Sunday and pads to whole weeks", () => {
    const oct2026 = monthGrid(2026, 10); // 1 ต.ค. 2569 = วันพฤหัสบดี
    expect(oct2026.slice(0, 5)).toEqual([null, null, null, null, 1]);
    expect(oct2026.length % 7).toBe(0);
    expect(oct2026.filter((d) => d !== null)).toHaveLength(31);
  });
  it("arrow-key day moves cross month and year boundaries", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2026-03-01", -7)).toBe("2026-02-22");
    expect(parseIso("2026-13-01")).toBeNull();
  });
});
