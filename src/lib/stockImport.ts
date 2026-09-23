/**
 * นำเข้ายอดสต๊อกจากไฟล์ Excel (2026-09-23) — เจ้าของสั่ง *"สต๊อกสินค้าทำให้สามารถรับข้อมูล stock สินค้าเป็น exel"*
 *
 * ไฟล์หนึ่งแถวต่อสินค้าหนึ่งตัว บอก **ยอดคงเหลือที่ควรเป็น** (นับได้จริง / ยอดยกมาจากระบบเก่า) ระบบคิดส่วนต่างจากยอด
 * ปัจจุบันแล้วลงเป็นความเคลื่อนไหวสต๊อกทีละแถว — **ไม่เขียนทับ `stockQty` ตรง ๆ** เพราะกติกาของบัญชีสต๊อกคือ
 * ยอดเปลี่ยนได้ทางเดียวผ่าน `applyStockMovement()` ทุกการเปลี่ยนจึงมีประวัติ (ดู `api/_lib/stockHandler.ts`)
 *
 * แกะแบบเดียวกับ "นำเข้าสินค้า" (`productImport.ts`): อ่านจากชื่อหัวคอลัมน์ไทย/อังกฤษ หัวตารางไม่จำเป็นต้อง
 * อยู่บรรทัดแรก และแถวที่ผิดถูกทิ้งพร้อมเหตุผลรายแถวแทนที่จะล้มทั้งไฟล์
 *
 * **ไฟล์ไม่ถูกอัปโหลดขึ้นเซิร์ฟเวอร์** — แกะในเบราว์เซอร์แล้วส่งแค่ตัวเลขไป จึงไม่อยู่ใต้กติกาเก็บไฟล์ของ
 * `storeUpload()` (ไม่มีไฟล์ถูกเก็บ) · ไฟล์นี้ต้องไม่มี React/i18n เพราะเซิร์ฟเวอร์ import ค่าคงที่จากที่นี่
 */

import { apiFetch } from "./apiClient.js";

/** จำนวนแถวสูงสุดต่อครั้ง — เซิร์ฟเวอร์บังคับค่าเดียวกัน */
export const STOCK_IMPORT_MAX_ROWS = 5000;
const HEADER_SCAN_DEPTH = 10;

export interface StockImportRow {
  /** เลขแถวใน Excel (นับ 1) — ใช้ในข้อความปัญหาเท่านั้น */
  rowNumber: number;
  code: string;
  /** ยอดคงเหลือที่ต้องการ */
  qty: number;
  /** ต้นทุนต่อหน่วย — ไม่บังคับ ใช้เฉพาะแถวที่ยอดเพิ่มขึ้น (ถัวต้นทุนเฉลี่ยใหม่) */
  unitCost: number | null;
}

export interface StockImportProblem {
  rowNumber: number;
  message: string;
}

export interface ParsedStockWorkbook {
  rows: StockImportRow[];
  problems: StockImportProblem[];
  headerFound: boolean;
}

type Field = "code" | "qty" | "unitCost";

const HEADER_ALIASES: [Field, string[]][] = [
  ["code", ["รหัสสินค้า", "รหัส", "productcode", "itemcode", "code", "sku"]],
  ["qty", ["ยอดคงเหลือ", "จำนวนคงเหลือ", "คงเหลือ", "นับได้", "จำนวนนับได้", "ยอดนับ", "จำนวน", "qty", "quantity", "onhand", "stock", "balance"]],
  ["unitCost", ["ต้นทุนต่อหน่วย", "ต้นทุน", "ราคาทุน", "unitcost", "cost"]],
];

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
/** ตัวเลขจากเซลล์ — ตัดตัวคั่นหลักพันและสัญลักษณ์เงิน · ว่าง = null (ต่างจาก "อ่านไม่ออก" ที่คืน NaN) */
function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s฿]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function parseStockRows(sheetRows: string[][]): ParsedStockWorkbook {
  const problems: StockImportProblem[] = [];
  let headerIndex = -1;
  let columns: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(sheetRows.length, HEADER_SCAN_DEPTH); i++) {
    const candidate: Partial<Record<Field, number>> = {};
    (sheetRows[i] ?? []).forEach((cell, col) => {
      const f = matchField(String(cell ?? "").trim());
      if (f && candidate[f] === undefined) candidate[f] = col;
    });
    if (candidate.code !== undefined && candidate.qty !== undefined) {
      headerIndex = i;
      columns = candidate;
      break;
    }
  }
  if (headerIndex < 0) return { rows: [], problems, headerFound: false };

  const rows: StockImportRow[] = [];
  const seen = new Map<string, number>();
  for (let i = headerIndex + 1; i < sheetRows.length; i++) {
    const row = sheetRows[i] ?? [];
    const rowNumber = i + 1;
    const cell = (f: Field) => (columns[f] === undefined ? "" : String(row[columns[f]!] ?? "").trim());
    const code = cell("code");
    const qtyRaw = cell("qty");
    const costRaw = cell("unitCost");
    if (!code && !qtyRaw && !costRaw) continue;
    if (!code) { problems.push({ rowNumber, message: "ไม่มีรหัสสินค้า" }); continue; }
    const qty = parseNumber(qtyRaw);
    if (qty === null) { problems.push({ rowNumber, message: `${code}: ไม่มียอดคงเหลือ` }); continue; }
    if (Number.isNaN(qty) || qty < 0) { problems.push({ rowNumber, message: `${code}: ยอดคงเหลือต้องเป็นตัวเลขไม่ติดลบ` }); continue; }
    const cost = parseNumber(costRaw);
    if (cost !== null && (Number.isNaN(cost) || cost < 0)) { problems.push({ rowNumber, message: `${code}: ต้นทุนต้องเป็นตัวเลขไม่ติดลบ` }); continue; }
    const key = code.toLowerCase();
    if (seen.has(key)) { problems.push({ rowNumber, message: `${code}: รหัสซ้ำกับแถว ${seen.get(key)}` }); continue; }
    seen.set(key, rowNumber);
    rows.push({ rowNumber, code, qty, unitCost: cost });
    if (rows.length > STOCK_IMPORT_MAX_ROWS) {
      problems.push({ rowNumber, message: `ไฟล์มีเกิน ${STOCK_IMPORT_MAX_ROWS} แถว — แบ่งไฟล์แล้วนำเข้าทีละส่วน` });
      rows.length = STOCK_IMPORT_MAX_ROWS;
      break;
    }
  }
  return { rows, problems, headerFound: true };
}

export type StockImportStatus = "change" | "same" | "notFound";

export interface StockImportPreviewRow extends StockImportRow {
  status: StockImportStatus;
  productId: string;
  productName: string;
  unit: string;
  currentQty: number;
  delta: number;
}

/** จับคู่กับทะเบียนสินค้า (ไม่สนตัวพิมพ์) แล้วคิดส่วนต่าง — ตัวเลขจริงเซิร์ฟเวอร์คิดใหม่อีกรอบตอนบันทึก */
export function buildStockImportPreview(
  rows: StockImportRow[],
  products: { id: string; code: string; name: string; unit: string; stockQty: number; archived?: boolean }[],
): StockImportPreviewRow[] {
  const byCode = new Map(products.filter((p) => !p.archived).map((p) => [p.code.trim().toLowerCase(), p]));
  return rows.map((r) => {
    const p = byCode.get(r.code.trim().toLowerCase());
    if (!p) return { ...r, status: "notFound", productId: "", productName: "", unit: "", currentQty: 0, delta: 0 };
    const delta = Math.round((r.qty - p.stockQty) * 10000) / 10000;
    return { ...r, status: delta === 0 ? "same" : "change", productId: p.id, productName: p.name, unit: p.unit, currentQty: p.stockQty, delta };
  });
}

/** หัวคอลัมน์ของไฟล์ตั้งต้น — ชุดเดียวกับที่ตัวแกะรับ */
export const STOCK_IMPORT_TEMPLATE_HEADERS = ["รหัสสินค้า", "ชื่อสินค้า", "หน่วย", "ยอดคงเหลือ", "ต้นทุนต่อหน่วย"];

export interface StockImportResult {
  /** เลขชุดการนำเข้า เช่น `SI-202609-0001` — อยู่ในช่อง "เอกสารต้นทาง" ของทุกแถวที่นำเข้า */
  batchLabel: string;
  changed: number;
  unchanged: number;
}

export async function importStock(rows: { code: string; qty: number; unitCost: number | null }[], note: string): Promise<StockImportResult> {
  return apiFetch<StockImportResult>("/stock-movements/import", {
    method: "POST", body: JSON.stringify({ rows, note }),
  });
}
