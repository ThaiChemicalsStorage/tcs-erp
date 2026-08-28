/**
 * อ่านไฟล์ Excel ของงาน แล้วแปลงเป็นร่าง Cost Control — added 2026-08-28.
 *
 * **ฟังก์ชันบริสุทธิ์ทั้งไฟล์**: รับ `string[][]` (รูปแบบเดียวกับที่ `XLSX.utils.sheet_to_json(ws,
 * { header: 1, raw: false, defval: "" })` คืนมา) และไม่รู้จัก React, network หรือ `xlsx` เลย —
 * ผู้เรียกเป็นคนโหลดไลบรารีและอ่านไฟล์เอง แยกแบบนี้เพื่อให้ unit test ยิงตรงได้โดยไม่ต้องมีไฟล์จริง
 * (ไฟล์ตัวอย่างอยู่ใต้ `reference/` ซึ่ง gitignore ไว้ เทสต์จึงพึ่งมันไม่ได้)
 *
 * ## กติกาถอดจากไฟล์จริง
 *
 * ไฟล์ที่บริษัทใช้ (`PQ202608-222-SC-SK …xlsx`) มี 2 ชีตที่อ่านได้:
 *
 * **1. ชีต `COST CONTROL-…`** — ใบที่ทำเสร็จแล้ว อ่านตรง ๆ ได้เลย แม่นที่สุด
 * คอลัมน์ `A`=ลำดับ `B`=รายละเอียด `C`=Model `D`=supplier `E`=จำนวน `F`=หน่วย `G`=ต้นทุน `H`=รวม
 *
 * **2. ชีต `SC`** — ใบประเมินราคา 8,400 แถว ต้องแกะ
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

/** ชื่อชีตที่อ่านได้ พร้อมบอกว่าเป็นแบบไหน — ผู้เรียกใช้เลือกชีตก่อนส่ง rows เข้ามา */
export function classifySheetName(name: string): "costControl" | "sc" | null {
  const n = name.trim().toUpperCase();
  if (n.startsWith("COST CONTROL")) return "costControl";
  if (n === "SC" || n.startsWith("SC ") || n.startsWith("SC-")) return "sc";
  return null;
}

const cell = (row: string[] | undefined, i: number): string =>
  String((row ?? [])[i] ?? "").replace(/\s+/g, " ").trim();

/**
 * ตัวเลขในไฟล์มาหลายหน้าตา: `"฿931,020.00"`, `"1,802,484.00"`, `"-"` (ศูนย์), `""` (ว่าง)
 * คืน `null` เมื่ออ่านไม่ออกหรือว่าง เพื่อให้แยก "ไม่ระบุ" ออกจาก "ศูนย์" ได้
 */
export function parseNumericCell(raw: string): number | null {
  const t = raw.replace(/[฿,\s]/g, "").trim();
  if (t === "" || t === "-" || t === "=") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** `"26/8/2026"` / `"24/8/2026"` (วัน/เดือน/ปี ค.ศ.) → `"2026-08-26"` · อ่านไม่ออกคืน "" */
export function parseSheetDate(raw: string): string {
  const t = raw.trim();
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

function parseCostControlSheetDirect(rows: string[][], fills?: SheetFills): CostControlImportResult {
  const header: CostControlImportHeader = { jobName: "", workType: "", jobOrder: "", docDate: "" };
  const lines: CostControlLine[] = [];
  const warnings: string[] = [];

  let rounded = 0;
  let roundedDelta = 0;

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
    return { header, lines, sheetKind: "costControl", warnings: ["ไม่พบแถวหัวตาราง (\"ลำดับที่\") ในชีตนี้"] };
  }

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const seq = cell(r, CC_COL.seq);
    const description = cell(r, CC_COL.description);
    const qty = parseNumericCell(cell(r, CC_COL.qty));
    const unitCost = parseNumericCell(cell(r, CC_COL.unitCost));

    // บล็อกสรุปท้ายใบเริ่มที่ "1. ราคาต้นทุน" — หยุดอ่านรายการตรงนั้น
    if (/^\d\.\s/.test(description) || description.startsWith("หมายเหตุ") || description.startsWith("Submitted by")) break;
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

  if (lines.length === 0) warnings.push("อ่านชีตได้แต่ไม่พบรายการเลย — ตรวจว่าเลือกชีตถูกไหม");
  if (rounded > 0) {
    warnings.push(
      `${rounded} บรรทัดมียอดในไฟล์ต่างจาก จำนวน × ต้นทุน (รวมต่างกัน ${roundedDelta.toFixed(2)} บาท) — ` +
      `ปกติเกิดจากไฟล์ต้นทางแสดงจำนวนแบบปัดเศษ ระบบนี้คำนวณยอดจากจำนวน × ต้นทุนเสมอ ` +
      `ถ้าต้องการให้ตรงกับไฟล์เป๊ะ ให้แก้จำนวนหรือต้นทุนของบรรทัดนั้น`,
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
      warnings.push(`รายการที่ ${seq} "${description}" อ่านยอดรวมไม่ได้ — ใส่ตัวเลขเองก่อนบันทึก`);
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
export function parseCostControlSheet(rows: string[][], kind: "costControl" | "sc", fills?: SheetFills): CostControlImportResult {
  return kind === "costControl" ? parseCostControlSheetDirect(rows, fills) : parseScSheet(rows);
}
