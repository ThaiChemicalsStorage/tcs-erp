import { describe, it, expect } from "vitest";
import {
  classifySheetName, parseCostControlSheet, parseNumericCell, parseSheetDate,
} from "../src/lib/costControlImport";
import { costControlTotals, lineTotalCost } from "../src/lib/costControl";

/**
 * Unit tests for the Cost Control workbook parser (`src/lib/costControlImport.ts`).
 *
 * **The fixtures below are synthetic, and deliberately so.** The real workbook
 * (`PQ202608-222-SC-SK …xlsx`) lives under `reference/`, which is gitignored — a test that opened it
 * would pass on the machine that wrote it and fail in CI and for everyone else. So the structural
 * quirks the parser exists to survive are reproduced here by hand, each one taken from a specific
 * place in the real file and noted:
 *
 *   - the `|` characters filling columns A, C, E, G, I, K, M, O of the SC sheet to draw a fake table
 *   - a block ending in `*** SAFETY***` (rows 297-311) vs. one ending in a bare separator (341-352)
 *   - `฿` and thousands separators on money, `-` meaning zero, `""` meaning not-filled-in
 *   - a rounded quantity whose stored total does not equal qty × unitCost (Packing Media, 10.62)
 *
 * The numbers used are the real ones, so a regression here is checkable against the actual document.
 */

// ── helpers ───────────────────────────────────────────────────────────────────────────────────

/** สร้างแถวของชีต SC: คอลัมน์คู่เป็น `|` เส้นตารางปลอม เหมือนไฟล์จริง */
function scRow(fields: { seq?: string; description?: string; qty?: string; unit?: string; total?: string }): string[] {
  const r = new Array<string>(16).fill("");
  for (const i of [0, 2, 4, 6, 8, 10, 12, 14]) r[i] = "|";
  if (fields.seq !== undefined) r[1] = fields.seq;
  if (fields.description !== undefined) r[3] = fields.description;
  if (fields.qty !== undefined) r[5] = fields.qty;
  if (fields.unit !== undefined) r[7] = fields.unit;
  if (fields.total !== undefined) r[15] = fields.total;
  return r;
}
const scSeparator = (): string[] => scRow({ total: "=" });

function ccRow(cells: (string | undefined)[]): string[] {
  const r = new Array<string>(8).fill("");
  cells.forEach((c, i) => { if (c !== undefined) r[i] = c; });
  return r;
}

describe("classifySheetName", () => {
  it("รู้จักชีตของใบที่ทำเสร็จแล้ว และชีตประเมินราคา", () => {
    expect(classifySheetName("COST CONTROL-SC")).toBe("costControl");
    expect(classifySheetName("  cost control-ac  ")).toBe("costControl");
    expect(classifySheetName("SC")).toBe("sc");
    expect(classifySheetName("SC-2")).toBe("sc");
  });

  it("ชีตที่ไม่รู้จักคืน null — ผู้เรียกจะได้ไม่เดาเอง", () => {
    expect(classifySheetName("Sheet1")).toBeNull();
    expect(classifySheetName("ผังบัญชี")).toBeNull();
    // "SCOPE" ขึ้นต้นด้วย SC แต่ไม่ใช่ชีตประเมินราคา
    expect(classifySheetName("SCOPE")).toBeNull();
  });
});

describe("parseNumericCell", () => {
  it("อ่านเงินที่มี ฿ และลูกน้ำได้", () => {
    expect(parseNumericCell("฿931,020.00")).toBe(931020);
    expect(parseNumericCell("1,802,484.00")).toBe(1802484);
    expect(parseNumericCell("10.62")).toBe(10.62);
  });

  it('แยก "ไม่ระบุ" ออกจาก "ศูนย์" — ว่าง/ขีด/แถวคั่น คืน null ไม่ใช่ 0', () => {
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell("-")).toBeNull();
    expect(parseNumericCell("=")).toBeNull();
    expect(parseNumericCell("ไม่ทราบ")).toBeNull();
    expect(parseNumericCell("0")).toBe(0);
  });
});

describe("parseSheetDate", () => {
  it("แปลงวัน/เดือน/ปี ค.ศ. เป็น YYYY-MM-DD", () => {
    expect(parseSheetDate("26/8/2026")).toBe("2026-08-26");
    expect(parseSheetDate("24/8/2026")).toBe("2026-08-24");
    expect(parseSheetDate("2026-08-26")).toBe("2026-08-26");
  });

  it("อ่านไม่ออกคืนค่าว่าง ไม่เดาวันที่ให้", () => {
    expect(parseSheetDate("")).toBe("");
    expect(parseSheetDate("26 ส.ค. 69")).toBe("");
  });
});

describe("ชีต COST CONTROL — อ่านตรง ๆ", () => {
  const rows: string[][] = [
    ccRow([undefined, undefined, "บริษัท ไทย เคมีคอล สโตเรจ จำกัด"]),
    ccRow(["COST CONTROL"]),
    ccRow(["Job Name : บริษัท โรงงานแปรรูปขยะชุมชนวังไผ่ กรีนเทค จำกัด", "", "", "Work type :", "Wet Scrubber 2 System"]),
    ccRow(["Job order : PQ202608-222-SC-SK", "", "", "Date :", "26/8/2026"]),
    ccRow([]),
    ccRow(["ลำดับที่", "รายละเอียด", "Model", "supplier name", "จำนวน", "หน่วย", "ต้นทุน", "ต้นทุนรวมทั้งหมด"]),
    ccRow(["", "งาน Dust Collector"]),
    ccRow(["1", "MAIN DUCT FRP No.1", "", "TCS", "1", "Lot", "฿931,020.00", "931,020.00"]),
    ccRow(["2", "MAIN DUCT FRP No.2", "", "TCS", "1", "Lot", "฿1,802,484.00", "1,802,484.00"]),
    ccRow(["6", "Wet Scrubber No.1", "", "TCS", "1", "Set", "฿273,800.00", "273,800.00"]),
    ccRow(["", "- Packing Media Tellerette", "", "", "10.62", "Cu.m.", "฿8,000.00", "84,948.67"]),
    ccRow(["", "1. ราคาต้นทุน", "", "฿8,558,497.46"]),
    ccRow(["", "หมายเหตุ :"]),
  ];
  /**
   * สีพื้นหลังของช่องรายละเอียด (คอลัมน์ B) — ในไฟล์จริงนี่คือ**สิ่งเดียว**ที่แยกหัวกลุ่มออกจาก
   * บรรทัดบรรยาย เพราะทั้งคู่เป็นแถวที่มีแต่ข้อความไม่มีตัวเลขเหมือนกัน
   */
  const fills = rows.map((_, i) => {
    const row: (string | null)[] = new Array(8).fill(null);
    if (i === 6) row[1] = "F2DBDB";                    // งาน Dust Collector
    if (i === 7 || i === 8 || i === 9) row[1] = "92D050"; // สามรายการหลัก
    return row;
  });
  const result = parseCostControlSheet(rows, "costControl", fills);

  it("อ่านหัวใบครบทั้งสี่ช่อง", () => {
    expect(result.header).toEqual({
      jobName: "บริษัท โรงงานแปรรูปขยะชุมชนวังไผ่ กรีนเทค จำกัด",
      workType: "Wet Scrubber 2 System",
      jobOrder: "PQ202608-222-SC-SK",
      docDate: "2026-08-26",
    });
  });

  it("แยกชนิดแถวได้ถูกเมื่ออ่านสีพื้นหลังได้ — หัวกลุ่ม / รายการ / รายละเอียดย่อย", () => {
    expect(result.lines.map((l) => l.kind)).toEqual(["group", "item", "item", "item", "sub"]);
    expect(result.lines[0].description).toBe("งาน Dust Collector");
    expect(result.lines[4].description).toBe("- Packing Media Tellerette");
  });

  it('ไม่มีสีให้ดู ต้องตกเป็น "รายละเอียดย่อย" ไม่ใช่ "หัวกลุ่ม"', () => {
    // เดาผิดทางหัวกลุ่มทำให้ใบพิมพ์ขึ้นพื้นชมพูเกือบทั้งหน้า เพราะบรรทัดบรรยายใต้รายการ
    // ("VERTICAL PUMP", "-34,800 CMH") มีแต่ข้อความเหมือนหัวกลุ่มเป๊ะ และมีเยอะกว่ามาก
    const noFills = parseCostControlSheet(rows, "costControl");
    expect(noFills.lines[0].kind).toBe("sub");
    expect(noFills.lines.filter((l) => l.kind === "group")).toHaveLength(0);
    // แถวที่มีเลขลำดับยังเป็น "รายการ" อยู่เหมือนเดิม
    expect(noFills.lines.filter((l) => l.kind === "item")).toHaveLength(3);
  });

  it("หยุดอ่านเมื่อถึงบล็อกสรุปท้ายใบ — ไม่เอา 1. ราคาต้นทุน มาเป็นรายการ", () => {
    expect(result.lines.some((l) => l.description.includes("ราคาต้นทุน"))).toBe(false);
    expect(result.lines.some((l) => l.description.startsWith("หมายเหตุ"))).toBe(false);
  });

  it("อ่านตัวเลขและหน่วยของรายการได้ถูก", () => {
    const first = result.lines[1];
    expect(first).toMatchObject({ seq: "1", supplierName: "TCS", qty: 1, unit: "Lot", unitCost: 931020 });
    expect(lineTotalCost(first)).toBe(931020);
  });

  it("เตือนเมื่อยอดในไฟล์ไม่เท่ากับ จำนวน × ต้นทุน แทนที่จะปัดเศษให้เงียบ ๆ", () => {
    // 10.62 × 8,000 = 84,960 แต่ไฟล์เก็บ 84,948.67 เพราะจำนวนจริงคือ 10.618583
    const warning = result.warnings.find((w) => w.includes("ยอดในไฟล์ต่างจาก"));
    expect(warning).toBeTruthy();
    expect(warning).toContain("1 บรรทัด");
  });

  it("หัวกลุ่มไม่ถูกนับเป็นต้นทุน", () => {
    expect(lineTotalCost(result.lines[0])).toBe(0);
  });
});

describe("ชีต SC — แกะเป็นบล็อก", () => {
  const rows: string[][] = [
    scRow({ description: "ESTIMATE SC AND AC 2022" }),
    (() => { const r = scRow({}); r[1] = "CUSTOMER NAME : บริษัท สินทรัพย์ไพศาลกรุ๊ป 1999 จํากัด"; r[9] = "DATE : 24/8/2026"; return r; })(),
    (() => { const r = scRow({}); r[1] = "PROJECT NAME : 34,800CMH 150mmwg."; return r; })(),
    scRow({ seq: "ITEM", description: "DESCRIPTION" }),

    // บล็อกที่ 1 — จบด้วย *** SAFETY*** (เหมือนแถว 297-311 ในไฟล์จริง)
    scRow({ seq: "1", description: "Mian Duct ( FRP Duct) No.1" }),
    scRow({ description: "DAMPER-500", qty: "4.00", unit: "SET", total: "26,880.00" }),
    scRow({ description: "D500", qty: "52.00", unit: "SET", total: "139,776.00" }),
    scRow({ description: "", total: "-" }),
    scRow({ description: "*** SAFETY***", qty: "0.00", unit: "%", total: "931,020.00" }),
    scSeparator(),

    // บล็อกที่ 2 — จบด้วยแถวคั่นเฉย ๆ ไม่มี SAFETY (เหมือนแถว 341-352)
    scRow({ seq: "2", description: "SUPPORT" }),
    scRow({ description: "- SLING ขนาด 8 mm", qty: "100.00", unit: "เมตร", total: "5,000.00" }),
    scRow({ description: "- แบบโครงเหล็กถัก", qty: "-", unit: "SET", total: "-" }),
    scRow({ total: "-" }),
    scRow({ total: "557,000.00" }),
    scSeparator(),

    // บล็อกที่ 3 — อ่านยอดไม่ได้เลย ต้องเตือน
    scRow({ seq: "3", description: "งานรื้อถอนฐานรากเดิม" }),
    scRow({ description: "รอราคาผู้รับเหมา" }),
    scSeparator(),
  ];
  const result = parseCostControlSheet(rows, "sc");

  it("อ่านชื่อลูกค้า/ชื่องาน/วันที่จากหัวชีตได้", () => {
    expect(result.header.jobName).toBe("บริษัท สินทรัพย์ไพศาลกรุ๊ป 1999 จํากัด");
    expect(result.header.workType).toBe("34,800CMH 150mmwg.");
    expect(result.header.docDate).toBe("2026-08-24");
  });

  it("ได้หนึ่งรายการต่อหนึ่งบล็อก และยอดคือค่าสุดท้ายก่อนแถวคั่น", () => {
    const items = result.lines.filter((l) => l.kind === "item");
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ seq: "1", description: "Mian Duct ( FRP Duct) No.1", qty: 1, unit: "Lot", unitCost: 931020 });
    // บล็อกที่จบด้วยแถวคั่นเฉย ๆ ต้องได้ยอดเดียวกับที่ตาเห็น
    expect(items[1]).toMatchObject({ seq: "2", description: "SUPPORT", unitCost: 557000 });
  });

  it('ไม่เอาแถว "*** SAFETY***" มาเป็นรายการย่อย — มันคือแถวบอกยอด', () => {
    expect(result.lines.some((l) => l.description.includes("SAFETY"))).toBe(false);
  });

  it("แถวย่อยถอดราคาต่อหน่วยกลับจากยอดรวม ÷ จำนวน", () => {
    const damper = result.lines.find((l) => l.description === "DAMPER-500");
    expect(damper).toMatchObject({ kind: "sub", qty: 4, unit: "SET" });
    expect(damper?.unitCost).toBe(6720); // 26,880 ÷ 4
  });

  it("เตือนเมื่อบล็อกไหนอ่านยอดไม่ได้ ระบุว่าเป็นรายการไหน", () => {
    const warning = result.warnings.find((w) => w.includes("อ่านยอดรวมไม่ได้"));
    expect(warning).toContain("รายการที่ 3");
    expect(warning).toContain("งานรื้อถอนฐานรากเดิม");
  });

  it("เตือนเสมอว่ายอดที่แกะได้เป็นจุดตั้งต้น ต้องตรวจก่อนสร้าง", () => {
    expect(result.warnings.some((w) => w.includes("กรุณาตรวจและแก้ก่อนกดสร้าง"))).toBe(true);
  });

  it("ไม่พบรายการเลยต้องบอก ไม่ใช่เงียบแล้วสร้างใบเปล่า", () => {
    const empty = parseCostControlSheet([scRow({ description: "อะไรก็ไม่รู้" })], "sc");
    expect(empty.lines).toHaveLength(0);
    expect(empty.warnings.some((w) => w.includes("ไม่พบรายการ"))).toBe(true);
  });
});

describe("costControlTotals", () => {
  const lines = [
    { id: "a", kind: "group" as const, seq: "", description: "งาน", model: "", supplierName: "", qty: null, unit: "", unitCost: null },
    { id: "b", kind: "item" as const, seq: "1", description: "x", model: "", supplierName: "", qty: 2, unit: "Set", unitCost: 100 },
    { id: "c", kind: "sub" as const, seq: "", description: "- y", model: "", supplierName: "", qty: 3, unit: "Set", unitCost: 50 },
  ];

  it("รวมต้นทุนจากทุกบรรทัด ยกเว้นหัวกลุ่ม", () => {
    const t = costControlTotals({ lines, operatingCost: null, bubbleCost: null, entertainmentCost: null, sellingPrice: null });
    expect(t.totalCost).toBe(350); // 2×100 + 3×50
  });

  it("กำไร = ราคาขาย − (ต้นทุน + ค่าดำเนินการ + bubble + entertainment)", () => {
    const t = costControlTotals({ lines, operatingCost: 50, bubbleCost: 10, entertainmentCost: 5, sellingPrice: 500 });
    expect(t.loadedCost).toBe(415);
    expect(t.profit).toBe(85);
  });

  it("คิดเป็น% หารด้วยราคาขาย ไม่ใช่ต้นทุน — ตรงกับตัวเลขในไฟล์จริง", () => {
    const t = costControlTotals({
      lines: [{ id: "x", kind: "item", seq: "1", description: "รวม", model: "", supplierName: "", qty: 1, unit: "Lot", unitCost: 8_558_497.46 }],
      operatingCost: 1_300_000, bubbleCost: 130_000, entertainmentCost: 0, sellingPrice: 13_000_000,
    });
    expect(t.profit).toBeCloseTo(3_011_502.54, 2);
    expect(t.profitPct).toBeCloseTo(23.17, 2);
  });

  it("ยังไม่ใส่ราคาขายต้องไม่หารศูนย์", () => {
    const t = costControlTotals({ lines, operatingCost: null, bubbleCost: null, entertainmentCost: null, sellingPrice: null });
    expect(t.profitPct).toBe(0);
    expect(Number.isFinite(t.profitPct)).toBe(true);
  });
});
