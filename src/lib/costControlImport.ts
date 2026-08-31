/**
 * อ่านไฟล์ Excel ของงาน แล้วแปลงเป็นร่าง Cost Control — added 2026-08-28.
 *
 * **ฟังก์ชันบริสุทธิ์ทั้งไฟล์**: รับ `string[][]` (รูปแบบเดียวกับที่ `XLSX.utils.sheet_to_json(ws,
 * { header: 1, raw: false, defval: "" })` คืนมา) และไม่รู้จัก React, network หรือ `xlsx` เลย —
 * ผู้เรียกเป็นคนโหลดไลบรารีและอ่านไฟล์เอง แยกแบบนี้เพื่อให้ unit test ยิงตรงได้โดยไม่ต้องมีไฟล์จริง
 * (ไฟล์ตัวอย่างอยู่ใต้ `reference/` ซึ่ง gitignore ไว้ เทสต์จึงพึ่งมันไม่ได้)
 *
 * ## รู้จักชีตจาก**เนื้อใน** ไม่ใช่จากชื่อชีต
 *
 * รอบแรกตัดสินจากชื่อชีต (`COST CONTROL-…` / `SC`) ซึ่งใช้ได้กับไฟล์ตัวอย่างไฟล์เดียวเท่านั้น —
 * พอเจ้าของส่งไฟล์งานที่สองมา (`PQ202511-267-LI-SK …น้ำมันพืชไทย`) ชีตทั้งสี่ชื่อว่า
 * `Manhole 5 mm.` / `Rev.01` / `ลองๆ` / `3mm.` ทั้งที่ข้างในเป็นใบ Cost Control เต็มรูปแบบทุกใบ
 * ตัวแกะเลยอ่านไม่เจออะไรเลย · **`SC` ในชื่อไฟล์คือรหัสประเภทงาน ไม่ใช่ชื่อชีต** (อีกไฟล์เป็น `LI`)
 * ตอนนี้จึงดูจากแถวหัวตารางจริง — `classifySheetRows()` — และเหลือชื่อชีตไว้เป็นตัวช่วยตัดสินท้ายสุด
 *
 * ## กติกาถอดจากไฟล์จริง
 *
 * **1. ชีตแบบ Cost Control** — ใบที่ทำเสร็จแล้ว อ่านตรง ๆ ได้เลย แม่นที่สุด · รู้จักจากแถวที่
 * คอลัมน์ `A` = `"ลำดับที่"` และ `B` = `"รายละเอียด"`
 * คอลัมน์ `A`=ลำดับ `B`=รายละเอียด `C`=Model `D`=supplier `E`=จำนวน `F`=หน่วย `G`=ต้นทุน `H`=รวม
 * ท้ายใบมีบล็อกสรุป 1-5 (ราคาต้นทุน / ค่าดำเนินการ / Bubble / Entertainment / ราคาขาย) ซึ่งอ่านมา
 * ใส่ให้ด้วย — ป้ายอยู่คอลัมน์ `B` ยอดอยู่ถัดไปทางขวา
 *
 * **2. ชีตแบบใบประเมินราคา (SC)** — 8,400 แถว ต้องแกะ · รู้จักจากแถวหัวตาราง `ITEM` + `DESCRIPTION`
 * - คอลัมน์ `A,C,E,G,I,K,M,O` เป็นตัวอักษร `|` ที่ใช้วาดเส้นตารางปลอม — ข้ามทิ้งทั้งหมด
 * - ที่ใช้จริง: `B`=ลำดับ `D`=รายละเอียด `F`=จำนวน `H`=หน่วย `P`=ยอดรวมของบรรทัด
 * - **หนึ่ง "บล็อก" = หนึ่งรายการ** เริ่มที่แถวที่ `B` มีเลข จบที่แถวที่ `P` เป็น `=`
 * - **ยอดของบล็อก = ค่า `P` ตัวสุดท้ายก่อนแถว `=`**
 *
 * ## ทำไมผลลัพธ์ต้องผ่านสายตาคนก่อนเสมอ
 *
 * การแปลงนี้ **ไม่ใช่ 1:1** และห้ามทำอัตโนมัติเงียบ ๆ ตรวจกับไฟล์จริงแล้วพบทั้งสามแบบ:
 * - บล็อกที่ยอดตรงกับใบจริงเป๊ะ (MAIN DUCT FRP No.1 → 931,020.00)
 * - บล็อกที่คน **แตกเป็นหลายบรรทัด** พร้อมแก้ราคา (FRP HOOD ยอด 180,000 กลายเป็นสองบรรทัด
 *   รวม 248,000 เพราะคนเปลี่ยนราคาต่อหน่วยตอนทำใบจริง)
 * - บล็อกที่คน **ยุบหลายแถวย่อยเป็นบรรทัดเดียว** (LADDER 14,400 + PLATFORM 10,000 → "Steel Ladder
 *   & Support" 24,400)
 *
 * ตัวแกะจึงให้ **จุดตั้งต้น** ไม่ใช่คำตอบสุดท้าย: คืนทั้งบรรทัดหลักและแถวย่อยของทุกบล็อก แล้วให้คน
 * ลบ/รวม/แก้ในหน้า preview ก่อนกดสร้าง เหตุผลเดียวกับที่ `api/_lib/templateWorkbookParser.ts`
 * เขียนเตือนไว้ว่าไฟล์ของบริษัทนี้ยัดหลายความหมายไว้ในเซลล์เดียว
 */

import { type CostControlLine, type CostControlLineKind } from "./costControl.js";

export interface CostControlImportHeader {
  jobName: string;
  workType: string;
  jobOrder: string;
  /** YYYY-MM-DD — "" ถ้าอ่านวันที่ในไฟล์ไม่ออก */
  docDate: string;
}

// เคยมี `CostControlImportMarkups` (ค่าดำเนินการ/Bubble/Entertainment/ราคาขาย) อยู่ตรงนี้ — ถอดออก
// 2026-08-31 พร้อมกับการคิดกำไรทั้งโมดูล · ข้อ 1 (ราคาต้นทุน) ยังถูกอ่านอยู่ แต่ใช้เป็นตัวตรวจว่า
// แกะรายการมาครบหรือเปล่าเท่านั้น ไม่ได้เก็บลงเอกสาร — ดู `parseStatedTotalCost()`

/**
 * ชิ้นส่วนข้อความของคำเตือนที่พูดถึง **ราคาที่อ่านมาจากไฟล์**
 *
 * ตั้งแต่ 2026-08-31 การนำเข้าไม่เอาราคาจากไฟล์มาแล้ว (ดู `stripImportedPrices()`) คำเตือนกลุ่มนี้
 * จึงพูดถึงตัวเลขที่ไม่ได้ถูกนำเข้าจริง ต้องคัดทิ้งก่อนแสดง ไม่งั้นคนอ่านจะงงว่าเตือนราคาไหน
 *
 * ประกาศเป็นค่าคงที่แล้วเอาไปประกอบเป็นข้อความจริง เพื่อให้ตัวคัดกับตัวข้อความหลุดจากกันไม่ได้
 * (มีเทสต์ยืนยันว่าทุกชิ้นส่วนตรงกับคำเตือนที่ตัวแกะสร้างขึ้นจริง)
 */
const PRICE_WARNING_FRAGMENTS = {
  rounding: "มียอดในไฟล์ต่างจาก จำนวน × ต้นทุน",
  blockTotalUnreadable: "อ่านยอดรวมไม่ได้",
} as const;

export interface CostControlImportResult {
  header: CostControlImportHeader;
  lines: CostControlLine[];
  /** เรื่องที่คนต้องรู้ก่อนกดสร้าง — แสดงเหนือตาราง preview */
  warnings: string[];
  /** ชีตที่อ่าน */
  sheetKind: "costControl" | "sc";
}

/**
 * สีพื้นหลังที่ชีตจริงใช้แยกชนิดแถว — อ่านจาก `fgColor.rgb` ของเซลล์ในไฟล์ Excel
 *
 * ตัวหนังสือในเซลล์**ไม่ได้**บอกว่าแถวไหนเป็นหัวกลุ่ม: ทั้งหัวกลุ่ม ("งาน Dust Collector") และ
 * บรรทัดบรรยายใต้รายการ ("VERTICAL PUMP", "-34,800 CMH") ต่างก็เป็นแถวที่มีแต่ข้อความไม่มีตัวเลข
 * เหมือนกันเป๊ะ คนอ่านออกเพราะ**สี** ไม่ใช่เพราะเนื้อหา ตัวแกะจึงต้องดูสีด้วยถึงจะแยกถูก
 */
export const SHEET_FILL = {
  /** หัวกลุ่ม */
  group: "F2DBDB",
  /** ช่องรายละเอียดของรายการหลัก */
  item: "92D050",
} as const;

export type SheetKind = "costControl" | "sc";

/**
 * เดาชนิดชีตจากชื่อ — **ตัวช่วยท้ายสุดเท่านั้น** ให้ใช้ `classifySheetRows()` ก่อนเสมอ
 *
 * ชื่อชีตในไฟล์จริงตั้งกันตามใจ (`Rev.01`, `ลองๆ`, `3mm.`) จะเชื่อถือไม่ได้ ที่เก็บไว้เพราะชีตชื่อ
 * `COST CONTROL-…` ก็ยังมีอยู่จริง และใช้ตัดสินได้ฟรีเมื่อเนื้อในอ่านไม่ออก
 */
export function classifySheetName(name: string): SheetKind | null {
  const n = name.trim().toUpperCase();
  if (n.startsWith("COST CONTROL")) return "costControl";
  if (n === "SC" || n.startsWith("SC ") || n.startsWith("SC-")) return "sc";
  return null;
}

const cell = (row: string[] | undefined, i: number): string =>
  String((row ?? [])[i] ?? "").replace(/\s+/g, " ").trim();

/**
 * ดูจากแถวหัวตารางว่าชีตนี้เป็นแบบไหน — วิธีหลักในการรู้จักชีต
 *
 * | ชนิด | ลายเซ็นที่ใช้ตัดสิน |
 * |---|---|
 * | Cost Control | แถวที่ `A` = `"ลำดับที่"` และ `B` = `"รายละเอียด"` |
 * | ใบประเมินราคา | แถวที่ `B` = `"ITEM"` และ `D` = `"DESCRIPTION"` (หัวตารางอยู่ลึกถึงแถว ~291) |
 *
 * ไล่ทั้งชีตเพราะหัวตารางของใบประเมินราคาอยู่ลึกมาก และเลือกอันที่เจอก่อน — ชีตหนึ่งใบเป็นได้แบบเดียว
 */
export function classifySheetRows(rows: string[][]): SheetKind | null {
  for (let i = 0; i < rows.length; i++) {
    if (cell(rows[i], 0) === "ลำดับที่" && cell(rows[i], 1) === "รายละเอียด") return "costControl";
    if (cell(rows[i], 1).toUpperCase() === "ITEM" && cell(rows[i], 3).toUpperCase() === "DESCRIPTION") return "sc";
  }
  return null;
}

/** เนื้อในมาก่อน ชื่อชีตเป็นตัวสำรอง */
export function classifySheet(name: string, rows: string[][]): SheetKind | null {
  return classifySheetRows(rows) ?? classifySheetName(name);
}

/**
 * ตัวเลขในไฟล์มาหลายหน้าตา: `"฿931,020.00"`, `"1,802,484.00"`, `"-"` (ศูนย์), `""` (ว่าง)
 * คืน `null` เมื่ออ่านไม่ออกหรือว่าง เพื่อให้แยก "ไม่ระบุ" ออกจาก "ศูนย์" ได้
 */
export function parseNumericCell(raw: string): number | null {
  const t = raw.replace(/[฿,\s]/g, "").trim();
  if (t === "" || t === "-" || t === "=") return null;
  const n = Number(t);
  // `+ 0` กลบ -0 ที่เกิดจากเซลล์แบบ "฿-   .0" (ศูนย์ในรูปแบบบัญชี) ให้เป็น 0 ธรรมดา
  return Number.isFinite(n) ? n + 0 : null;
}

/**
 * `"26/8/2026"` → `"2026-08-26"` · `"14/11/68"` → `"2025-11-14"` · อ่านไม่ออกคืน ""
 *
 * ไฟล์ของบริษัทเขียนวันที่ได้ทั้ง **ค.ศ. เต็ม** (`26/8/2026`) และ **พ.ศ. สองหลัก** (`14/11/68`)
 * แบบหลังเจอในไฟล์งานน้ำมันพืชไทย ซึ่งเลขงานคือ `PQ202511-267` = พ.ย. 2025 ยืนยันว่า `68` คือ
 * พ.ศ. 2568 จริง · ปีสองหลักจึงอ่านเป็น พ.ศ. เสมอ (ฟอร์มไทย ไม่ใช่ ค.ศ. ย่อ) และปี ≥ 2400
 * ถือเป็น พ.ศ. แล้วลบ 543
 */
export function parseSheetDate(raw: string): string {
  const t = raw.trim();
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (dmy) {
    const [, d, m, rawYear] = dmy;
    let year = Number(rawYear);
    if (rawYear.length === 2) year += 2500;
    if (year >= 2400) year -= 543;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return "";
}

/** ตัดป้ายนำหน้าออกจากเซลล์หัวใบ เช่น `"Job Name : บริษัท ก"` → `"บริษัท ก"` */
function afterLabel(raw: string): string {
  const i = raw.indexOf(":");
  return i === -1 ? raw.trim() : raw.slice(i + 1).trim();
}

let lineSeq = 0;
const nextLineId = (): string => `ccline-${Date.now().toString(36)}-${(lineSeq += 1).toString(36)}`;

function makeLine(kind: CostControlLineKind, fields: Partial<CostControlLine>): CostControlLine {
  return {
    id: nextLineId(), kind, seq: "", description: "", model: "", supplierName: "",
    qty: null, unit: "", unitCost: null, ...fields,
  };
}

// ── ชีต COST CONTROL — อ่านตรง ๆ ────────────────────────────────────────────────────────────────

const CC_COL = { seq: 0, description: 1, model: 2, supplier: 3, qty: 4, unit: 5, unitCost: 6, total: 7 };

/**
 * เทียบยอดที่ไฟล์เก็บไว้ (คอลัมน์ "ต้นทุนรวมทั้งหมด") กับ จำนวน × ต้นทุน ที่ระบบจะคำนวณเอง
 *
 * ทั้งสองค่าไม่ตรงกันเป๊ะได้เป็นเรื่องปกติ เพราะไฟล์ต้นทาง **แสดงจำนวนแบบปัดเศษ** แต่คำนวณจากค่าเต็ม
 * (เช่น Packing Media จำนวนจริง 10.618583 แสดงเป็น 10.62 — ยอดจึงต่าง 11 บาท) ระบบนี้ไม่เก็บยอดรวม
 * ลงฐานข้อมูลเลย ทุกยอดคำนวณจากจำนวน × ต้นทุนเสมอ เอกสารที่ได้จึงสอดคล้องกับตัวเองแม้ต่างจากไฟล์
 * ต้นทางเล็กน้อย — บอกให้คนรู้ดีกว่าปัดเศษให้เงียบ ๆ หรือแอบเก็บยอดไว้สองชุด
 */
const ROUNDING_TOLERANCE = 1;

/** ยอดของบล็อกสรุปอยู่ถัดจากป้ายไปทางขวา — ไฟล์จริงใช้คอลัมน์ D แต่ไม่ผูกตายไว้กับตำแหน่งเดียว */
function valueRightOf(row: string[] | undefined, labelIdx: number): number | null {
  for (let c = labelIdx + 1; c < labelIdx + 8; c++) {
    const v = parseNumericCell(cell(row, c));
    if (v !== null) return v;
  }
  return null;
}

/**
 * ยอด "1. ราคาต้นทุน" ที่ไฟล์เขียนไว้ท้ายใบ — ป้ายอยู่คอลัมน์ B (บางไฟล์ A) ยอดอยู่ถัดไปทางขวา
 *
 * ตัดสินจาก**เลขข้อ** ไม่ใช่ข้อความ เพราะถ้อยคำต่างกันระหว่างไฟล์
 *
 * **ไม่ได้เก็บลงเอกสาร** — ใช้เทียบกับผลรวมของรายการที่แกะได้อย่างเดียว ถ้าไม่ตรงแปลว่าน่าจะแกะมาไม่ครบ
 * ซึ่งเป็นการตรวจอัตโนมัติอย่างเดียวที่บอกได้ว่าชีตวางโครงไม่เหมือนที่คาด · ข้อ 2-5 (ค่าดำเนินการ/
 * Bubble/Entertainment/ราคาขาย) เคยถูกอ่านมาใส่ให้ด้วย แต่ถอดออกแล้วเมื่อ 2026-08-31
 */
function parseStatedTotalCost(rows: string[][], from: number): number | null {
  for (let i = from; i < rows.length; i++) {
    const labelIdx = cell(rows[i], 1) ? 1 : 0;
    const label = cell(rows[i], labelIdx);
    if (label.startsWith("Submitted by") || label.startsWith("Approved by")) break;
    if (/^1\.\s/.test(label)) return valueRightOf(rows[i], labelIdx);
  }
  return null;
}

function parseCostControlSheetDirect(rows: string[][], fills?: SheetFills): CostControlImportResult {
  const header: CostControlImportHeader = { jobName: "", workType: "", jobOrder: "", docDate: "" };
  const lines: CostControlLine[] = [];
  const warnings: string[] = [];

  let rounded = 0;
  let roundedDelta = 0;
  let summaryStart = -1;

  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const a = cell(rows[i], 0);
    if (a.startsWith("Job Name")) {
      header.jobName = afterLabel(a);
      header.workType = cell(rows[i], 4) || afterLabel(cell(rows[i], 3));
    } else if (a.startsWith("Job order")) {
      header.jobOrder = afterLabel(a);
      header.docDate = parseSheetDate(cell(rows[i], 4) || afterLabel(cell(rows[i], 3)));
    } else if (a === "ลำดับที่") {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    return {
      header, lines, sheetKind: "costControl",
      warnings: ["ไม่พบแถวหัวตาราง (\"ลำดับที่\") ในชีตนี้"],
    };
  }

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const seq = cell(r, CC_COL.seq);
    const description = cell(r, CC_COL.description);
    const qty = parseNumericCell(cell(r, CC_COL.qty));
    const unitCost = parseNumericCell(cell(r, CC_COL.unitCost));

    // บล็อกสรุปท้ายใบเริ่มที่ "1. ราคาต้นทุน" — หยุดอ่านรายการตรงนั้น แล้วอ่านบล็อกสรุปต่อจากตรงนี้
    if (/^\d\.\s/.test(description) || description.startsWith("หมายเหตุ") || description.startsWith("Submitted by")) {
      summaryStart = i;
      break;
    }
    if (!seq && !description) continue;

    // สีของช่องรายละเอียดคือตัวชี้ขาด ถ้าอ่านสีไม่ได้ค่อยเดาจากเลขลำดับ — และเมื่อเดา ให้ตกเป็น
    // "sub" ไม่ใช่ "group" เพราะแถวข้อความล้วนส่วนใหญ่เป็นบรรทัดบรรยายใต้รายการ ไม่ใช่หัวกลุ่ม
    // (เดาผิดทางนั้นทำให้ใบพิมพ์ขึ้นพื้นชมพูทั้งหน้า) ผู้ใช้เปลี่ยนชนิดเองได้ในหน้าแก้ไข
    const fill = fills?.[i]?.[CC_COL.description] ?? null;
    const kind: CostControlLineKind =
      fill === SHEET_FILL.group ? "group"
      : fill === SHEET_FILL.item ? "item"
      : fill !== null ? (seq ? "item" : "sub")
      : (seq ? "item" : "sub");
    lines.push(makeLine(kind, {
      seq, description,
      model: cell(r, CC_COL.model),
      supplierName: cell(r, CC_COL.supplier),
      qty, unit: cell(r, CC_COL.unit), unitCost,
    }));

    const fileTotal = parseNumericCell(cell(r, CC_COL.total));
    if (fileTotal !== null && qty !== null && unitCost !== null
        && Math.abs(fileTotal - qty * unitCost) > ROUNDING_TOLERANCE) {
      rounded += 1;
      roundedDelta += fileTotal - qty * unitCost;
    }
  }

  const statedTotalCost = summaryStart === -1 ? null : parseStatedTotalCost(rows, summaryStart);

  if (lines.length === 0) warnings.push("อ่านชีตได้แต่ไม่พบรายการเลย — ตรวจว่าเลือกชีตถูกไหม");
  if (rounded > 0) {
    warnings.push(
      `${rounded} บรรทัด${PRICE_WARNING_FRAGMENTS.rounding} (รวมต่างกัน ${roundedDelta.toFixed(2)} บาท) — ` +
      `ปกติเกิดจากไฟล์ต้นทางแสดงจำนวนแบบปัดเศษ ระบบนี้คำนวณยอดจากจำนวน × ต้นทุนเสมอ ` +
      `ถ้าต้องการให้ตรงกับไฟล์เป๊ะ ให้แก้จำนวนหรือต้นทุนของบรรทัดนั้น`,
    );
  }

  // ยอด "1. ราคาต้นทุน" ในไฟล์ควรเท่ากับผลรวมที่แกะได้ ถ้าต่างกันโดยไม่มีบรรทัดไหนปัดเศษเลย แปลว่า
  // **แกะรายการมาไม่ครบ** ไม่ใช่เรื่องปัดเศษ — เป็นสัญญาณเดียวที่จับได้ว่าชีตวางโครงไม่เหมือนที่คาด
  const computedTotal = lines.reduce((sum, l) => sum + (l.kind === "group" ? 0 : (l.qty ?? 0) * (l.unitCost ?? 0)), 0);
  if (statedTotalCost !== null && rounded === 0 && Math.abs(statedTotalCost - computedTotal) > ROUNDING_TOLERANCE) {
    warnings.push(
      `ไฟล์ระบุราคาต้นทุน ${statedTotalCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท ` +
      `แต่รวมจากรายการที่แกะได้ ${computedTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท — ` +
      `อาจมีบรรทัดที่อ่านไม่เจอ กรุณาเทียบกับไฟล์ก่อนสร้าง`,
    );
  }

  return { header, lines, warnings, sheetKind: "costControl" };
}

// ── ชีต SC — แกะเป็นบล็อก ───────────────────────────────────────────────────────────────────────

const SC_COL = { seq: 1, description: 3, qty: 5, unit: 7, total: 15 };

function parseScSheet(rows: string[][]): CostControlImportResult {
  const header: CostControlImportHeader = { jobName: "", workType: "", jobOrder: "", docDate: "" };
  const lines: CostControlLine[] = [];
  const warnings: string[] = [];

  // หัวใบ: แถว "CUSTOMER NAME : …" กับ "PROJECT NAME : …" อยู่คนละแถวติดกัน
  for (let i = 0; i < rows.length; i++) {
    const b = cell(rows[i], 1);
    if (b.startsWith("CUSTOMER NAME")) {
      header.jobName = afterLabel(b);
      for (let j = 0; j < (rows[i] ?? []).length; j++) {
        const c = cell(rows[i], j);
        if (c.startsWith("DATE")) { header.docDate = parseSheetDate(afterLabel(c)); break; }
      }
    } else if (b.startsWith("PROJECT NAME")) {
      header.workType = afterLabel(b);
      break;
    }
  }

  /** แถวคั่นท้ายบล็อก — คอลัมน์ P เป็น "=" */
  const isBlockEnd = (i: number) => cell(rows[i], SC_COL.total) === "=";

  let i = 0;
  let blocks = 0;
  while (i < rows.length) {
    const seq = cell(rows[i], SC_COL.seq);
    const description = cell(rows[i], SC_COL.description);
    // บล็อกเริ่มที่แถวที่มีเลขลำดับ + คำอธิบาย
    if (!/^\d+$/.test(seq) || !description) { i += 1; continue; }

    const start = i;
    let end = start + 1;
    while (end < rows.length && !isBlockEnd(end)) {
      // เจอหัวบล็อกถัดไปโดยยังไม่เจอแถวคั่น — จบบล็อกตรงนั้นแทน
      if (/^\d+$/.test(cell(rows[end], SC_COL.seq)) && cell(rows[end], SC_COL.description)) break;
      end += 1;
    }

    // ยอดของบล็อก = ค่า P ตัวสุดท้ายก่อนแถวคั่น
    let blockTotal: number | null = null;
    for (let k = end - 1; k > start; k--) {
      const v = parseNumericCell(cell(rows[k], SC_COL.total));
      if (v !== null) { blockTotal = v; break; }
    }

    lines.push(makeLine("item", {
      seq, description,
      qty: 1, unit: "Lot", unitCost: blockTotal,
    }));
    if (blockTotal === null) {
      warnings.push(`รายการที่ ${seq} "${description}" ${PRICE_WARNING_FRAGMENTS.blockTotalUnreadable} — ใส่ตัวเลขเองก่อนบันทึก`);
    }

    // แถวย่อยที่มีเนื้อหา — ให้ติดมาด้วยเพื่อให้คนเลือกเก็บ/ลบ/รวมเองในหน้า preview
    for (let k = start + 1; k < end; k++) {
      const d = cell(rows[k], SC_COL.description);
      // "*** SAFETY***" เป็นแถวบอกยอดท้ายบล็อก ไม่ใช่รายการของจริง
      if (!d || d.startsWith("**")) continue;
      const qty = parseNumericCell(cell(rows[k], SC_COL.qty));
      const total = parseNumericCell(cell(rows[k], SC_COL.total));
      if (qty === null && total === null) {
        lines.push(makeLine("sub", { description: d }));
        continue;
      }
      lines.push(makeLine("sub", {
        description: d,
        qty, unit: cell(rows[k], SC_COL.unit),
        // ไฟล์เก็บยอดรวมไว้ ไม่ได้เก็บราคาต่อหน่วย — ถอดกลับเมื่อจำนวนใช้ได้
        unitCost: qty !== null && qty !== 0 && total !== null ? total / qty : total,
      }));
    }

    blocks += 1;
    i = end;
  }

  if (blocks === 0) {
    warnings.push("ไม่พบรายการในชีต SC เลย — ตรวจว่าเลือกชีตถูกไหม หรือไฟล์อาจใช้โครงคนละแบบ");
  } else {
    warnings.push(
      `แกะได้ ${blocks} รายการจากชีต SC — ยอดที่ได้คือยอดรวมของแต่ละบล็อก ` +
      `ใบจริงมักถูกแตก/ยุบบรรทัดต่างจากนี้ กรุณาตรวจและแก้ก่อนกดสร้าง`,
    );
  }
  return { header, lines, warnings, sheetKind: "sc" };
}

/**
 * สีพื้นหลังต่อเซลล์ในรูปแบบเดียวกับ `rows` — `fills[row][col]` เป็นรหัสสี 6 หลักตัวพิมพ์ใหญ่
 * (เช่น `"92D050"`) หรือ `null` เมื่อไม่มีสี · ไม่ส่งมาก็ได้ ตัวแกะจะเดาชนิดแถวจากเลขลำดับแทน
 */
export type SheetFills = (string | null)[][];

/**
 * แกะชีตหนึ่งชีตเป็นร่าง Cost Control
 *
 * @param rows  array-of-arrays จาก `sheet_to_json(ws, { header: 1, raw: false, defval: "" })`
 * @param kind  ผลจาก `classifySheetName()` — ผู้เรียกเลือกชีตแล้วส่งมาบอก
 * @param fills สีพื้นหลังต่อเซลล์ (ถ้าอ่านได้) — ใช้แยกหัวกลุ่มออกจากบรรทัดบรรยาย
 */
export function parseCostControlSheet(rows: string[][], kind: SheetKind, fills?: SheetFills): CostControlImportResult {
  return kind === "costControl" ? parseCostControlSheetDirect(rows, fills) : parseScSheet(rows);
}

/**
 * รวมหลายชีตเป็นร่างเดียว — สำหรับงานที่ไฟล์เดียวแยกงานย่อยไว้คนละชีต
 *
 * เจ้าของสั่งไว้ว่า *"ถ้าในไฟล์ Excel มี sheet หลายอันก็ทำขึ้นมาให้เลือกว่าจะเอาอันไหนไปทำ หรือเอา
 * ข้อมูลหลายอันไปใช้ในการทำ"* — เลือกชีตเดียวคือทางปกติ ส่วนการรวมมีกติกาดังนี้:
 *
 * - **คั่นด้วยหัวกลุ่มชื่อชีต** ทุกชุด เพื่อให้ยังรู้ว่าบรรทัดไหนมาจากไหนหลังรวมแล้ว (ลบทิ้งได้ใน preview)
 * - **หัวใบ** เอาค่าแรกที่ไม่ว่างของแต่ละช่อง ไล่ตามลำดับชีตที่เลือก
 * - เดิมมีกติกาข้อสามเรื่องบล็อกสรุป (เอาของชีตแรก ไม่บวกกัน เตือนเมื่อราคาขายชนกัน) — ตกไปเมื่อ
 *   2026-08-31 พร้อมกับการถอดบล็อกสรุปออกจากโมดูล
 */
export function mergeCostControlImports(parts: { sheetName: string; result: CostControlImportResult }[]): CostControlImportResult {
  if (parts.length === 1) return parts[0].result;

  const header: CostControlImportHeader = { jobName: "", workType: "", jobOrder: "", docDate: "" };
  const lines: CostControlLine[] = [];
  const warnings: string[] = [`รวม ${parts.length} ชีตเป็นใบเดียว — แต่ละชุดคั่นด้วยหัวกลุ่มชื่อชีต ลบออกได้ถ้าไม่ต้องการ`];

  for (const { sheetName, result } of parts) {
    for (const key of Object.keys(header) as (keyof CostControlImportHeader)[]) {
      if (!header[key] && result.header[key]) header[key] = result.header[key];
    }
    lines.push(makeLine("group", { description: sheetName }));
    lines.push(...result.lines);
    warnings.push(...result.warnings.map((w) => `[${sheetName}] ${w}`));
  }

  return { header, lines, warnings, sheetKind: parts[0].result.sheetKind };
}

/**
 * ตัดราคาทั้งหมดออกจากผลการนำเข้า — เหลือแต่ตัวรายการ (2026-08-31)
 *
 * เจ้าของสั่งไว้ว่า *"cost control เวลาโยนไฟล์เข้าไปให้เอาราคาออกให้ด้วย"* และยืนยันว่าหมายถึง
 * **ลบราคาออก ให้เหลือแต่รายการ** แล้วไปกรอกต้นทุน/ราคาขายเองในเอกสาร · เหตุผลคือราคาในไฟล์
 * ประเมินมักยังไม่ใช่ต้นทุนจริงที่จะใช้ตัดสินใจ การให้มันติดมาเลยทำให้คนเผลอเชื่อตัวเลขที่ยังไม่ได้ตรวจ
 *
 * ต่อมาวันเดียวกัน เจ้าของสั่งถอดบล็อกสรุป (ค่าดำเนินการ/Bubble/Entertainment/ราคาขาย/กำไร) ออก
 * ทั้งโมดูล ฟังก์ชันนี้จึงเหลือหน้าที่ล้างต้นทุนรายบรรทัดกับคัดคำเตือนอย่างเดียว
 *
 * **ตัดที่นี่ ไม่ตัดในตัวแกะไฟล์** เป็นเรื่องตั้งใจ: `parseCostControlSheet()` ต้องอ่านไฟล์ให้ตรงตามจริง
 * ต่อไป เพราะคำเตือน "ไฟล์ระบุราคาต้นทุน X แต่รวมจากรายการที่แกะได้ Y" คือ**เครื่องมือเดียว**ที่จับได้ว่า
 * แกะรายการมาไม่ครบ — มันคำนวณจากราคาที่อ่านมา ถ้าตัดราคาตั้งแต่ต้นทางการตรวจนั้นก็ตายไปด้วย
 * คำเตือนนั้นจึงถูกเก็บไว้ (มันคิดเสร็จก่อนตัดราคา ยังเชื่อถือได้) ส่วนคำเตือนที่พูดถึงตัวเลขที่ไม่ได้
 * นำเข้าแล้วจะถูกคัดทิ้ง
 *
 * `qty`/`unit`/`kind`/`model`/`supplierName`/`description`/`seq` ไม่ถูกแตะ — คนต้องการโครงรายการ
 * ที่พิมพ์มาแล้ว ไม่ใช่แค่ชื่อรายการ
 */
export function stripImportedPrices(result: CostControlImportResult): CostControlImportResult {
  return {
    ...result,
    lines: result.lines.map((line) => ({ ...line, unitCost: null })),
    warnings: result.warnings.filter(
      (w) => !Object.values(PRICE_WARNING_FRAGMENTS).some((fragment) => w.includes(fragment)),
    ),
  };
}
