import { describe, expect, it } from "vitest";
import { parseGlChartRows, codeComboboxOptions, type CodeEntry } from "../src/lib/codeRegister";

/**
 * ตัวแกะผังบัญชีที่เจ้าของส่งมา (`รหัสสินค้าทั้งหมด.xlsx` — ชื่อไฟล์บอกว่าเป็นรหัสสินค้า แต่ข้างในเป็น
 * ผังบัญชี 479 บัญชี) ไฟล์จริงอยู่ใน `reference/` ที่ gitignore เทสต์จึงใช้ fixture สังเคราะห์ที่
 * **ลอกรูปร่างจริงมาทุกอย่าง**: รายงานความกว้างคงที่ยัดลงคอลัมน์เดียว มีหัวรายงาน เส้นคั่น และ
 * ท้ายรายงานปนอยู่ · แนวเดียวกับ `costControlImport.test.ts` ที่ทำไว้ก่อนแล้ว
 */

/** ตัดมาจากไฟล์จริงตามตัวอักษร รวมหัว/ท้ายรายงานที่ต้องถูกข้าม */
const REAL_SHAPE = [
  "Column1",
  "บริษัท ไทย เคมีคอล สโตเรจ จำกัด                                        หน้า   :        1",
  "  ผังบัญชี",
  "เลขที่บัญชีจาก  1000-00          ถึง  9999-99                          วันที่ : 28/08/69",
  "------------------------------------------------------------------------",
  "เลขที่บัญชี      ชื่อบัญชี                                              หมวด   ระดับ  ประเภท  บัญชีคุม",
  "---------------  ---------------------------------------------------  -----  -----  ----   ---------------",
  "1000-00          สินทรัพย์                                              ส/ท      1    คุม",
  "1100-00            สินทรัพย์หมุนเวียน                                   ส/ท      2    คุม    1000-00",
  "1111-01                เงินสดย่อย-โรงงาน                                ส/ท      4    ---    1110-00",
  "5230-15              วัสดุสิ้นเปลือง(ฝ่ายเทคนิค)                        คชจ.     3    ---    5100-00",
  "------------------------------------------------------------------------",
  "   บัญชีคุม     62",
  "   รวม         479 บัญชี",
  "",
  ">>>> จบรายงาน <<<<",
];

describe("parseGlChartRows", () => {
  it("อ่านเฉพาะบรรทัดที่ขึ้นต้นด้วยรหัสบัญชี ข้ามหัว/ท้ายรายงานทั้งหมด", () => {
    const { accounts } = parseGlChartRows(REAL_SHAPE);
    expect(accounts.map((a) => a.code)).toEqual(["1000-00", "1100-00", "1111-01", "5230-15"]);
  });

  it("แยกชื่อ หมวด ระดับ ประเภท และบัญชีคุม ออกจากบรรทัดความกว้างคงที่", () => {
    const { accounts } = parseGlChartRows(REAL_SHAPE);
    const expense = accounts.find((a) => a.code === "5230-15");
    expect(expense).toEqual({
      code: "5230-15",
      name: "วัสดุสิ้นเปลือง(ฝ่ายเทคนิค)",
      category: "คชจ.",
      level: 3,
      isControl: false,
      parentCode: "5100-00",
    });
  });

  it("แยกบัญชีคุมออกจากบัญชีย่อยได้ — 'คุม' คือคุม, '---' คือลงรายการได้", () => {
    const { accounts } = parseGlChartRows(REAL_SHAPE);
    expect(accounts.find((a) => a.code === "1000-00")?.isControl).toBe(true);
    expect(accounts.find((a) => a.code === "1111-01")?.isControl).toBe(false);
  });

  it("บัญชีระดับบนสุดไม่มีบัญชีคุม — parentCode ว่าง ไม่ใช่ undefined", () => {
    const { accounts } = parseGlChartRows(REAL_SHAPE);
    expect(accounts.find((a) => a.code === "1000-00")?.parentCode).toBe("");
  });

  it("การเยื้องของบรรทัดไม่มีผล — ระดับอ่านจากคอลัมน์ 'ระดับ' ไม่ใช่จากช่องว่างหน้าบรรทัด", () => {
    const { accounts } = parseGlChartRows(REAL_SHAPE);
    // 1111-01 เยื้องลึกกว่า 1100-00 มาก แต่ระดับมาจากคอลัมน์จริง
    expect(accounts.find((a) => a.code === "1111-01")?.level).toBe(4);
    expect(accounts.find((a) => a.code === "1100-00")?.level).toBe(2);
  });

  it("รหัสซ้ำในไฟล์ใช้แถวแรก แล้วเตือน", () => {
    const { accounts, warnings } = parseGlChartRows([
      "1000-00          ตัวแรก                       ส/ท      1    คุม",
      "1000-00          ตัวซ้ำ                       ส/ท      1    คุม",
    ]);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].name).toBe("ตัวแรก");
    expect(warnings.join(" ")).toContain("รหัสซ้ำ");
  });

  it("ไฟล์ที่ไม่ใช่ผังบัญชีเลย ได้คำเตือน ไม่ใช่รายการว่างเงียบ ๆ", () => {
    const { accounts, warnings } = parseGlChartRows(["สวัสดี", "ไม่ใช่ผังบัญชี"]);
    expect(accounts).toHaveLength(0);
    expect(warnings.join(" ")).toContain("ไม่พบบรรทัด");
  });
});

describe("codeComboboxOptions", () => {
  const base = { isDeleted: false, isActive: true, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "" };
  const codes = [
    { id: "1", kind: "department" as const, code: "G143", name: "ฝ่ายเทคนิค", ...base },
    { id: "2", kind: "account" as const, code: "5230-15", name: "วัสดุสิ้นเปลือง", category: "คชจ.", isControl: false, ...base },
    { id: "3", kind: "account" as const, code: "5100-00", name: "ต้นทุนขายสุทธิ", category: "คชจ.", isControl: true, ...base },
    { id: "4", kind: "account" as const, code: "9999-99", name: "ปิดใช้งาน", isControl: false, ...base, isActive: false },
  ] as CodeEntry[];

  it("กรองตามชนิดที่ขอ", () => {
    expect(codeComboboxOptions(codes, "department").map((o) => o.value)).toEqual(["G143"]);
  });

  it("ไม่เสนอบัญชีคุม เพราะลงรายการไม่ได้ มีไว้จัดกลุ่มเท่านั้น", () => {
    expect(codeComboboxOptions(codes, "account").map((o) => o.value)).toEqual(["5230-15"]);
  });

  it("ป้ายเป็น 'รหัส — ชื่อ' เพื่อให้พิมพ์ค้นได้ทั้งสองทาง", () => {
    expect(codeComboboxOptions(codes, "account")[0].label).toBe("5230-15 — วัสดุสิ้นเปลือง");
  });
});
