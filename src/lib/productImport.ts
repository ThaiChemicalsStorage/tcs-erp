/**
 * ตัวแกะไฟล์ Excel สำหรับ "นำเข้าสินค้า" (2026-09-04) — เจ้าของสั่งว่า *"หน้าเพิ่มสินค้าอะทำให้รองรับ
 * ไฟล์ exel ให้หน่อย เวลาย้ายสินค้าจากอีกระบบเข้ามาจะได้ง่ายๆ แบบโยนไฟล์ exel เข้าไปแล้วสินค้าเข้ามาเลย"*
 *
 * ไฟล์ที่ย้ายมาจากระบบอื่นไม่มีวันหน้าตาเหมือนกัน ตัวแกะจึง **อ่านจากชื่อหัวคอลัมน์ ไม่ใช่ตำแหน่ง** และ
 * รับได้ทั้งหัวไทยและอังกฤษ · หัวตารางไม่จำเป็นต้องอยู่บรรทัดแรก (ไฟล์ส่งออกส่วนใหญ่มีชื่อรายงานคร่อม
 * อยู่ข้างบน) จึงไล่หาบรรทัดหัวใน 10 บรรทัดแรก
 *
 * ไฟล์นี้ต้องไม่มี React/i18n — ข้อความปัญหาที่คืนออกไปเป็นไทยตายตัวเหมือน validator ตัวอื่นของระบบ
 * (`tests/serverImportGraph.test.ts` คุมไม่ให้ไฟล์ที่เซิร์ฟเวอร์ import มี JSX)
 */

/** จำนวนแถวสูงสุดต่อการนำเข้าหนึ่งครั้ง — ตรงกับที่ `POST /api/products/import` บังคับฝั่งเซิร์ฟเวอร์ */
export const PRODUCT_IMPORT_MAX_ROWS = 2000;

/** จำนวนบรรทัดแรกที่ยอมไล่หาหัวตาราง ก่อนจะสรุปว่าไฟล์นี้ไม่ใช่ไฟล์สินค้า */
const HEADER_SCAN_DEPTH = 10;

export interface ProductImportRow {
  /** เลขแถวในชีตตามที่ผู้ใช้เห็นใน Excel (นับ 1) — ใช้ในข้อความปัญหาเท่านั้น */
  rowNumber: number;
  code: string;
  name: string;
  /** ชื่อหมวดหมู่ตามที่พิมพ์มาในไฟล์ — เซิร์ฟเวอร์เป็นคนจับคู่กับหมวดหมู่จริง/สร้างใหม่ */
  categoryName: string;
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
  isTool: boolean;
  reorderPoint: number;
}

export interface ProductImportProblem {
  rowNumber: number;
  message: string;
}

export interface ParsedProductWorkbook {
  rows: ProductImportRow[];
  problems: ProductImportProblem[];
  /** หัวคอลัมน์ที่จับคู่ไม่ได้ — โชว์ให้เห็นว่าไฟล์ผิดรูป ไม่ใช่เงียบ ๆ ทิ้งไป */
  unmappedHeaders: string[];
  /** false = ไล่แล้วไม่เจอบรรทัดที่มีทั้งหัว "รหัส" และ "ชื่อ" */
  headerFound: boolean;
}

type Field = "code" | "name" | "categoryName" | "unit" | "defaultPrice" | "description" | "specifications" | "isTool" | "reorderPoint";

/**
 * ชื่อหัวคอลัมน์ที่ยอมรับ — เทียบแบบ normalise แล้ว (ตัวพิมพ์เล็ก ตัดช่องว่างและเครื่องหมายออกหมด)
 * เรียงจากเฉพาะเจาะจงไปกว้าง เพราะ `matchField()` คืนตัวแรกที่ตรง
 */
const HEADER_ALIASES: [Field, string[]][] = [
  ["code", ["รหัสสินค้า", "รหัสสินค้า/บริการ", "รหัส", "productcode", "itemcode", "code", "sku", "partno", "partnumber"]],
  ["name", ["ชื่อสินค้า", "ชื่อสินค้า/บริการ", "ชื่อรายการ", "รายการ", "ชื่อ", "productname", "itemname", "name"]],
  ["categoryName", ["หมวดหมู่", "หมวดหมู่สินค้า", "หมวด", "ประเภทสินค้า", "ประเภท", "กลุ่มสินค้า", "category", "group", "type"]],
  ["unit", ["หน่วยนับ", "หน่วย", "unit", "uom", "units"]],
  ["defaultPrice", ["ราคาเริ่มต้น", "ราคาต่อหน่วย", "ราคาขาย", "ราคา", "defaultprice", "unitprice", "price", "sellingprice"]],
  ["reorderPoint", ["จุดเตือน", "จุดสั่งซื้อ", "จุดสั่งซื้อใหม่", "สต๊อกขั้นต่ำ", "ขั้นต่ำ", "reorderpoint", "reorderlevel", "minstock", "minimum"]],
  ["isTool", ["เป็นเครื่องมือ", "เครื่องมือ", "istool", "tool", "returnable"]],
  ["specifications", ["ข้อมูลจำเพาะ", "สเปค", "สเป็ค", "specification", "specifications", "spec", "specs"]],
  ["description", ["รายละเอียด", "คำอธิบาย", "หมายเหตุ", "description", "detail", "details", "remark", "remarks", "note", "notes"]],
];

/** ตัดช่องว่าง/จุด/ขีด/วงเล็บออกให้หมด เพื่อให้ "รหัส สินค้า" กับ "รหัสสินค้า" นับเป็นหัวเดียวกัน */
function normalizeHeader(raw: string): string {
  return raw.toLowerCase().replace(/[\s._\-()[\]{}:/\\*#]/g, "");
}

function matchField(raw: string): Field | null {
  const key = normalizeHeader(raw);
  if (!key) return null;
  for (const [field, aliases] of HEADER_ALIASES) {
    if (aliases.some((a) => normalizeHeader(a) === key)) return field;
  }
  return null;
}

function cellText(row: string[], index: number | undefined): string {
  if (index === undefined) return "";
  return String(row[index] ?? "").trim();
}

/**
 * แปลงข้อความเป็นตัวเลข — รองรับตัวคั่นหลักพัน ช่องว่าง และสัญลักษณ์สกุลเงินที่ไฟล์ส่งออกมักติดมาด้วย
 * คืน `null` เมื่อมีข้อความอยู่แต่อ่านเป็นตัวเลขไม่ได้ (คนละกรณีกับช่องว่างที่คืน 0)
 *
 * ขีดเดี่ยว ๆ (`-` `–` `—`) นับเป็น 0 ไม่ใช่ค่าที่อ่านไม่ออก — ไฟล์ส่งออกแทบทุกระบบใช้ขีดแทน "ไม่มีค่า"
 * ในคอลัมน์ตัวเลข และช่อง "เป็นเครื่องมือ" ก็รับขีดเป็นเท็จอยู่แล้ว ถ้าไม่รับตรงนี้ สินค้าที่ยังไม่ตั้งราคา
 * จะถูกทิ้งทั้งแถวด้วยเหตุผล "ราคาไม่ใช่ตัวเลข"
 */
function parseNumber(raw: string): number | null {
  if (!raw) return 0;
  const cleaned = raw.replace(/[,\s฿]/g, "").replace(/^บาท/, "");
  if (!cleaned || /^[-–—]+$/.test(cleaned)) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const TRUE_WORDS = new Set(["ใช่", "y", "yes", "true", "1", "x", "✓", "เครื่องมือ", "t"]);
const FALSE_WORDS = new Set(["", "ไม่", "ไม่ใช่", "n", "no", "false", "0", "-", "–", "—", "f"]);

/** คืน `null` เมื่อกรอกมาแต่แปลไม่ออก จะได้ฟ้องแทนที่จะเดาว่าไม่ใช่เครื่องมือ */
function parseBool(raw: string): boolean | null {
  const key = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(key)) return true;
  if (FALSE_WORDS.has(key)) return false;
  return null;
}

/**
 * แกะตารางสินค้าออกจากแถวดิบของชีต (`XLSX.utils.sheet_to_json(sheet, { header: 1 })`)
 *
 * แถวว่างล้วนถูกข้ามเงียบ ๆ · แถวที่ขาดรหัสหรือชื่อ และแถวที่รหัสซ้ำกันเองในไฟล์ ถูกทิ้งพร้อมเหตุผล
 * รายแถว — ตั้งใจให้ผู้ใช้เห็นว่าแถวไหนตกและเพราะอะไร แทนที่จะล้มทั้งไฟล์เพราะแถวเดียวผิด
 */
export function parseProductRows(sheetRows: string[][]): ParsedProductWorkbook {
  const problems: ProductImportProblem[] = [];

  let headerIndex = -1;
  let columns: Partial<Record<Field, number>> = {};
  let unmappedHeaders: string[] = [];

  for (let i = 0; i < Math.min(sheetRows.length, HEADER_SCAN_DEPTH); i++) {
    const candidate: Partial<Record<Field, number>> = {};
    const unmapped: string[] = [];
    (sheetRows[i] ?? []).forEach((cell, col) => {
      const text = String(cell ?? "").trim();
      if (!text) return;
      const field = matchField(text);
      // คอลัมน์แรกที่ตรงกับ field หนึ่งชนะ — ไฟล์ที่มีหัวซ้ำสองคอลัมน์จะใช้ตัวซ้ายสุด
      if (field && candidate[field] === undefined) candidate[field] = col;
      else if (!field) unmapped.push(text);
    });
    if (candidate.code !== undefined && candidate.name !== undefined) {
      headerIndex = i;
      columns = candidate;
      unmappedHeaders = unmapped;
      break;
    }
  }

  if (headerIndex === -1) {
    return { rows: [], problems, unmappedHeaders: [], headerFound: false };
  }

  const rows: ProductImportRow[] = [];
  const seenCodes = new Map<string, number>();

  for (let i = headerIndex + 1; i < sheetRows.length; i++) {
    const raw = sheetRows[i] ?? [];
    const rowNumber = i + 1;
    if (raw.every((c) => String(c ?? "").trim() === "")) continue;

    const code = cellText(raw, columns.code);
    const name = cellText(raw, columns.name);
    if (!code && !name) continue; // แถวคั่น/ท้ายรายงานที่มีแต่ยอดรวมในคอลัมน์อื่น
    if (!code) { problems.push({ rowNumber, message: "ไม่มีรหัสสินค้า" }); continue; }
    if (!name) { problems.push({ rowNumber, message: `รหัส ${code} ไม่มีชื่อสินค้า` }); continue; }

    const dupOf = seenCodes.get(code.toLowerCase());
    if (dupOf !== undefined) {
      problems.push({ rowNumber, message: `รหัส ${code} ซ้ำกับแถวที่ ${dupOf} ในไฟล์เดียวกัน` });
      continue;
    }

    const price = parseNumber(cellText(raw, columns.defaultPrice));
    if (price === null) { problems.push({ rowNumber, message: `รหัส ${code} ราคาไม่ใช่ตัวเลข` }); continue; }
    const reorder = parseNumber(cellText(raw, columns.reorderPoint));
    if (reorder === null) { problems.push({ rowNumber, message: `รหัส ${code} จุดเตือนไม่ใช่ตัวเลข` }); continue; }
    const isTool = parseBool(cellText(raw, columns.isTool));
    if (isTool === null) { problems.push({ rowNumber, message: `รหัส ${code} ช่องเครื่องมืออ่านไม่ออก (ใส่ ใช่/ไม่ หรือเว้นว่าง)` }); continue; }

    if (rows.length >= PRODUCT_IMPORT_MAX_ROWS) {
      problems.push({ rowNumber, message: `เกิน ${PRODUCT_IMPORT_MAX_ROWS} รายการต่อการนำเข้าหนึ่งครั้ง — แถวนี้และแถวถัดไปถูกตัดออก` });
      break;
    }

    seenCodes.set(code.toLowerCase(), rowNumber);
    rows.push({
      rowNumber,
      code,
      name,
      categoryName: cellText(raw, columns.categoryName),
      unit: cellText(raw, columns.unit),
      defaultPrice: price < 0 ? 0 : price,
      description: cellText(raw, columns.description),
      specifications: cellText(raw, columns.specifications),
      isTool,
      reorderPoint: reorder < 0 ? 0 : reorder,
    });
  }

  return { rows, problems, unmappedHeaders, headerFound: true };
}

export interface ProductImportPreview {
  /** แถวที่จะถูกสร้างจริง */
  toCreate: ProductImportRow[];
  /** แถวที่รหัสมีอยู่ในระบบแล้ว — นำเข้าไม่ทับของเดิม ข้ามอย่างเดียว */
  duplicates: ProductImportRow[];
  /** ชื่อหมวดหมู่ที่ยังไม่มีในระบบ และจะถูกสร้างให้ตอนกดยืนยัน */
  newCategories: string[];
}

/**
 * เทียบผลที่แกะได้กับของที่มีอยู่ในระบบ เพื่อบอกล่วงหน้าว่ากดยืนยันแล้วจะเกิดอะไร
 *
 * เทียบรหัสสินค้าแบบ**ไม่สนตัวพิมพ์** ต่างจากตอนสร้างทีละตัวที่เทียบตรงตัว — ไฟล์ที่ย้ายมาจากระบบอื่น
 * มักสลับตัวพิมพ์ และ "สร้างซ้ำเพราะพิมพ์เล็ก/ใหญ่ไม่ตรง" เป็นความเสียหายที่ย้อนยากกว่าการข้ามไปเฉย ๆ
 */
export function buildProductImportPreview(
  rows: ProductImportRow[],
  existingCodes: string[],
  existingCategoryNames: string[],
): ProductImportPreview {
  const existing = new Set(existingCodes.map((c) => c.trim().toLowerCase()));
  const knownCategories = new Set(existingCategoryNames.map((c) => c.trim().toLowerCase()));

  const toCreate: ProductImportRow[] = [];
  const duplicates: ProductImportRow[] = [];
  for (const row of rows) {
    if (existing.has(row.code.toLowerCase())) duplicates.push(row);
    else toCreate.push(row);
  }

  const newCategories: string[] = [];
  for (const row of toCreate) {
    const name = row.categoryName.trim();
    if (!name) continue;
    if (knownCategories.has(name.toLowerCase())) continue;
    knownCategories.add(name.toLowerCase());
    newCategories.push(name);
  }

  return { toCreate, duplicates, newCategories };
}

/** หัวคอลัมน์ของไฟล์ตัวอย่างที่ปุ่ม "ดาวน์โหลดไฟล์ตัวอย่าง" สร้างให้ */
export const PRODUCT_IMPORT_TEMPLATE_HEADERS = [
  "รหัสสินค้า", "ชื่อสินค้า", "หมวดหมู่", "หน่วย", "ราคาเริ่มต้น", "จุดเตือน", "เป็นเครื่องมือ", "รายละเอียด", "ข้อมูลจำเพาะ",
];

/** หนึ่งแถวตัวอย่างใต้หัวตาราง — กรอกให้เห็นรูปแบบที่ตัวแกะรับ โดยเฉพาะช่อง "เป็นเครื่องมือ" */
export const PRODUCT_IMPORT_TEMPLATE_SAMPLE = [
  "PD-0001", "ดอกสว่านไทเทเนียม 6mm", "วัสดุสิ้นเปลือง", "ดอก", "45", "10", "ไม่", "ใช้กับงานเจาะเหล็ก", "HSS-Co 5%",
];
