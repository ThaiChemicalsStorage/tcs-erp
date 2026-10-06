import { afterEach, describe, expect, it } from "vitest";
import {
  displayYear2, formatDisplayDate, formatDisplayDateLong, formatDisplayMonth, formatDisplayMonthShort, getDisplayLang, setDisplayLang,
} from "../src/lib/displayDate";
import { formatQuoteDateThai } from "../src/lib/quotes";

afterEach(() => setDisplayLang("th"));

describe("displayDate", () => {
  it("defaults to Thai (Buddhist year, Thai month) when nothing is set — server side has no window", () => {
    expect(getDisplayLang()).toBe("th");
  });

  it("Thai mode: พ.ศ. + Thai month", () => {
    setDisplayLang("th");
    expect(formatDisplayDate("2026-10-06")).toBe("6 ต.ค. 2569");
    expect(formatDisplayDateLong("2026-10-06")).toBe("6 ตุลาคม 2569");
    expect(formatDisplayMonth("2026-09")).toBe("กันยายน 2569");
    expect(displayYear2(2026)).toBe("69");
  });

  it("English mode: ค.ศ. + English month", () => {
    setDisplayLang("en");
    expect(formatDisplayDate("2026-10-06")).toBe("6 Oct 2026");
    expect(formatDisplayDateLong("2026-10-06")).toBe("6 October 2026");
    expect(formatDisplayMonth("2026-09")).toBe("September 2026");
    expect(formatDisplayMonthShort("2026-09")).toBe("Sep");
    expect(displayYear2(2026)).toBe("26");
  });

  it("a bare YYYY-MM-DD never shifts a day across time zones", () => {
    setDisplayLang("en");
    expect(formatDisplayDate("2026-01-01")).toBe("1 Jan 2026");
  });

  it("empty or invalid input is an empty string, not 'Invalid Date'", () => {
    expect(formatDisplayDate("")).toBe("");
    expect(formatDisplayDate("not a date")).toBe("");
  });

  it("print formatting stays Thai even in English mode", () => {
    setDisplayLang("en");
    expect(formatQuoteDateThai("2026-10-06T05:00:00Z")).toBe("6 ต.ค. 2569");
  });
});
