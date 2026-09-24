/**
 * ส่งออกตารางธรรมดาเป็นไฟล์ Excel (2026-09-24) — หน้าสต๊อก ประวัติสต๊อก และการ์ดสต๊อก ตามคำสั่งเจ้าของ
 * *"หน้า stock สินค้าสามารถนำออกเป็น exel ได้หรือ pdf ได้ ละก็ตรงประวัติปรับ stock และการ์ด stock ก็ export ออกมาเป็น exel หรือ pdf ได้เหมือนกัน"*
 *
 * สไตล์เดียวกับรายงานแดชบอร์ด (`pages/dashboard/xlsxExport.ts`): หัวตารางแถบกรมท่าตัวขาว · แถวรวมแถบทอง · แถวสลับสี ·
 * ตรึงหัวตาราง + ฟิลเตอร์ · ฟอนต์ Tahoma (มีไทยทุกเครื่อง) · `exceljs` โหลดแบบ dynamic เฉพาะตอนกดส่งออก
 * ฝั่ง PDF ใช้ใบพิมพ์ (`TablePrintDocument`) + "บันทึกเป็น PDF" ของเบราว์เซอร์ แบบเดียวกับใบพิมพ์ทุกใบของระบบ
 *
 * ไฟล์นี้ใช้เฉพาะในเบราว์เซอร์ (ต้องมี `document`) — ห้าม import จาก `api/`
 */

export type ExportCellKind = "text" | "qty" | "money" | "date";
export type ExportCell = string | number | null;

export interface ExportColumn {
  header: string;
  kind?: ExportCellKind;
}

export interface ExportSheet {
  sheetName: string;
  title: string;
  /** บรรทัดคำอธิบายใต้หัวเรื่อง เช่น ตัวกรองที่ใช้ / วันที่ส่งออก */
  meta?: string[];
  columns: ExportColumn[];
  rows: ExportCell[][];
  totals?: ExportCell[];
}

const FONT = "Tahoma";
const NAVY = "FF0B1D3A";
const GOLD = "FFC9A84C";
const GOLD_SOFT = "FFF5EDD6";
const BAND = "FFF7F8FA";
const GRID = "FFD9DEE6";
const MUTED = "FF5A7299";
const FORMAT: Record<ExportCellKind, string | null> = { text: null, date: null, qty: "#,##0.##", money: "#,##0.00" };

function width(v: ExportCell, kind: ExportCellKind): number {
  if (v === null || v === "") return 1;
  if (typeof v === "number") return v.toLocaleString("en-US", { minimumFractionDigits: kind === "money" ? 2 : 0, maximumFractionDigits: 2 }).length;
  return Math.max(...String(v).split("\n").map((s) => s.length));
}

/** ประกอบสมุดงาน — แยกจากตัวดาวน์โหลดให้ทดสอบใน Node ได้ */
export async function buildTableWorkbook(sheets: ExportSheet[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TCS ERP";
  wb.created = new Date();
  const thin = { style: "thin" as const, color: { argb: GRID } };

  for (const sheet of sheets) {
    const cols = sheet.columns.length;
    const headerRow = 2 + (sheet.meta?.length ?? 0) + 1;
    // ชื่อชีต Excel ห้ามมี : \ / ? * [ ] และยาวไม่เกิน 31 ตัว
    const ws = wb.addWorksheet(sheet.sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31), {
      views: [{ state: "frozen", ySplit: headerRow }],
      properties: { defaultRowHeight: 16 },
    });

    const title = ws.addRow([sheet.title]);
    title.getCell(1).font = { name: FONT, size: 13, bold: true, color: { argb: NAVY } };
    title.height = 22;
    if (cols > 1) ws.mergeCells(title.number, 1, title.number, cols);
    for (const line of sheet.meta ?? []) {
      const r = ws.addRow([line]);
      r.getCell(1).font = { name: FONT, size: 10, color: { argb: MUTED } };
      if (cols > 1) ws.mergeCells(r.number, 1, r.number, cols);
    }
    ws.addRow([]);

    const head = ws.addRow(sheet.columns.map((c) => c.header));
    head.height = 30;
    head.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });

    const styleRow = (values: ExportCell[], seq: number, total: boolean) => {
      const row = ws.addRow(values.map((v) => (v === null ? "" : v)));
      sheet.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const kind = c.kind ?? "text";
        const fmt = FORMAT[kind];
        if (fmt && typeof values[i] === "number") cell.numFmt = fmt;
        cell.font = { name: FONT, size: 10, bold: total };
        cell.border = total
          ? { top: { style: "medium", color: { argb: NAVY } }, left: thin, bottom: thin, right: thin }
          : { top: thin, left: thin, bottom: thin, right: thin };
        if (total) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_SOFT } };
        else if (seq % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
        cell.alignment = { vertical: "top", wrapText: true, horizontal: typeof values[i] === "number" ? "right" : "left" };
      });
    };
    sheet.rows.forEach((r, i) => styleRow(r, i + 1, false));
    if (sheet.totals) styleRow(sheet.totals, 0, true);

    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: cols } };
    sheet.columns.forEach((c, i) => {
      const kind = c.kind ?? "text";
      const w = Math.max(10, c.header.length + 2, ...sheet.rows.map((r) => width(r[i] ?? null, kind) + 2), sheet.totals ? width(sheet.totals[i] ?? null, kind) + 2 : 0);
      ws.getColumn(i + 1).width = Math.min(48, w);
    });
    // เส้นทองใต้หัวเรื่อง ให้หน้าตาเหมือนรายงานแดชบอร์ด
    title.getCell(1).border = { bottom: { style: "thin", color: { argb: GOLD } } };
  }
  return wb;
}

export async function downloadXlsx(fileName: string, sheets: ExportSheet[]): Promise<void> {
  const wb = await buildTableWorkbook(sheets);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** ชื่อไฟล์ "สต๊อกสินค้า-2026-09-24" — วันที่ตามเวลาเครื่อง */
export function exportFileName(base: string): string {
  return `${base}-${new Date().toLocaleDateString("sv-SE")}`;
}
