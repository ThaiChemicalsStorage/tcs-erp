import type { DashboardStats } from "../../lib/dashboard";
import { buildWorkbookSheets, type ReportCell, type ReportRow, type ReportFilters } from "./reportRows";

/**
 * ส่งออกรายงานแดชบอร์ดเป็นไฟล์ Excel จัดรูปแบบเต็ม — ตัวเรนเดอร์ของแถวจาก `reportRows.ts` (แหล่งเดียวกับ CSV)
 *
 * **2026-09-07: เปลี่ยนจาก `xlsx` มาใช้ `exceljs` เฉพาะฝั่งเขียน** เจ้าของเปิดไฟล์แล้วบอกว่าอยากได้ "ตาราง
 * สวย ๆ" ซึ่ง `xlsx` รุ่นชุมชนทำไม่ได้เลย — ทดลองเขียนสไตล์แล้วอ่านกลับ ตัวหนา/สีพื้นหายหมด (`s` กลายเป็น
 * `{patternType:"none"}`) และ `!freeze` ถูกทิ้งทั้งก้อน เหลือแค่ความกว้างคอลัมน์กับ autofilter · `xlsx` ยังอยู่
 * ในโปรเจกต์สำหรับ**อ่าน**ไฟล์นำเข้า (Cost Control / ทะเบียนรหัส / นำเข้าสินค้า) ซึ่งใช้งานได้ดีอยู่แล้ว
 *
 * โหลดแบบ dynamic เหมือนเดิม — `exceljs` เป็นก้อนใหญ่ ผู้ใช้ที่ไม่เคยกดส่งออกไม่ต้องโหลดสักไบต์
 *
 * สีที่ใช้มาจากชุดสีของแอป (กรมท่า #0B1D3A / ทอง #C9A84C) หัวตารางเป็นแถบกรมท่าตัวอักษรขาว แถวรวมเป็นแถบทอง
 * แถวข้อมูลสลับสีอ่อนกันสายตาหลง และหัวตารางถูกตรึงไว้พร้อมฟิลเตอร์ในชีตที่เป็นตารางเดียวยาว ๆ
 */

const FONT = "Tahoma"; // มีไทยครบทุกเครื่อง Windows — Calibri ไม่มี ทำให้ Excel ต้องหา fallback เอง
const NAVY = "FF0B1D3A";
const GOLD = "FFC9A84C";
const GOLD_SOFT = "FFF5EDD6";
const BAND = "FFF7F8FA";
const GRID = "FFD9DEE6";
const MUTED = "FF5A7299";

const NUMBER_FORMAT: Record<ReportCell["kind"], string | null> = {
  text: null,
  date: null,
  int: "#,##0",
  money: "#,##0.00",
  percent: "0.0%",
  days: "0.0",
};

/** ค่าที่ลงช่องจริง — เปอร์เซ็นต์เก็บเป็นเศษส่วนเพื่อให้ Excel แสดงเป็น % เอง ค่าว่างของช่องตัวเลขเป็น "—" */
function cellValue(cell: ReportCell): string | number {
  if (cell.v === null) return cell.kind === "text" || cell.kind === "date" ? "" : "—";
  if (cell.kind === "percent" && typeof cell.v === "number") return cell.v / 100;
  return cell.v;
}

/** ความกว้างที่ข้อความจะกินจริงหลังจัดรูปแบบแล้ว — ตัวเลขที่คั่นหลักพันกว้างกว่าตัวดิบ */
function displayWidth(cell: ReportCell): number {
  if (cell.v === null) return 1;
  if (typeof cell.v === "number") {
    if (cell.kind === "percent") return 6;
    return cell.v.toLocaleString("en-US", { minimumFractionDigits: cell.kind === "money" ? 2 : 0, maximumFractionDigits: 2 }).length;
  }
  return String(cell.v).length;
}

const thin = { style: "thin" as const, color: { argb: GRID } };

/**
 * ประกอบสมุดงาน Excel ทั้งเล่ม — แยกจากตัวดาวน์โหลดเพื่อให้เทสต์/สคริปต์ตรวจสอบเรียกได้ใน Node
 * (ตัวดาวน์โหลดต้องมี `document`/`Blob` ซึ่งไม่มีนอกเบราว์เซอร์)
 */
export async function buildDashboardWorkbook(stats: DashboardStats, filters: ReportFilters) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "TCS ERP";
  wb.created = new Date();

  for (const sheet of buildWorkbookSheets(stats, filters)) {
    const maxCols = Math.max(1, ...sheet.rows.map((r) => r.cells.length));
    const headerIndexes = sheet.rows.map((r, i) => (r.role === "header" ? i : -1)).filter((i) => i >= 0);
    // ตรึงหัวตารางเฉพาะชีตที่หัวอยู่ใกล้บนสุด ไม่งั้นจะตรึงคร่อมหัวรายงานจนอ่านไม่รู้เรื่อง
    const freezeAfter = headerIndexes.length > 0 && headerIndexes[0] <= 2 ? headerIndexes[0] + 1 : 0;
    const ws = wb.addWorksheet(sheet.name, {
      views: freezeAfter > 0 ? [{ state: "frozen", ySplit: freezeAfter }] : undefined,
      properties: { defaultRowHeight: 16 },
    });

    let dataSeq = 0; // ใช้สลับสีแถวข้อมูล นับต่อเนื่องข้ามบล็อกภายในชีตเดียวกัน
    sheet.rows.forEach((row: ReportRow) => {
      const added = ws.addRow(row.cells.map(cellValue));
      added.font = { name: FONT, size: 10 };
      if (row.role === "blank") { dataSeq = 0; return; }

      if (row.role === "title" || row.role === "section") {
        const cell = added.getCell(1);
        cell.font = { name: FONT, size: row.role === "title" ? 13 : 11, bold: true, color: { argb: NAVY } };
        if (maxCols > 1) ws.mergeCells(added.number, 1, added.number, maxCols);
        added.height = row.role === "title" ? 22 : 18;
        if (row.role === "section") cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
        dataSeq = 0;
        return;
      }

      if (row.role === "meta") {
        added.getCell(1).font = { name: FONT, size: 10, color: { argb: MUTED } };
        added.getCell(2).font = { name: FONT, size: 10, bold: true };
        row.cells.forEach((c, i) => { const f = NUMBER_FORMAT[c.kind]; if (f && typeof c.v === "number") added.getCell(i + 1).numFmt = f; });
        return;
      }

      if (row.role === "header") {
        added.height = 30;
        added.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
          cell.border = { top: thin, left: thin, bottom: thin, right: thin };
        });
        dataSeq = 0;
        return;
      }

      const isTotal = row.role === "total";
      if (isTotal) dataSeq = 0; else dataSeq += 1;
      row.cells.forEach((c, i) => {
        const cell = added.getCell(i + 1);
        const fmt = NUMBER_FORMAT[c.kind];
        if (fmt && typeof c.v === "number") cell.numFmt = fmt;
        cell.font = { name: FONT, size: 10, bold: isTotal };
        cell.border = isTotal
          ? { top: { style: "medium", color: { argb: NAVY } }, left: thin, bottom: thin, right: thin }
          : { top: thin, left: thin, bottom: thin, right: thin };
        if (isTotal) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD_SOFT } };
        else if (dataSeq % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
        cell.alignment = { vertical: "middle", horizontal: typeof c.v === "number" ? "right" : "left" };
      });
    });

    // ฟิลเตอร์ให้เฉพาะชีตที่เป็นตารางเดียวยาว ๆ — ชีตที่มีหลายตารางในแผ่นเดียวใส่แล้วฟิลเตอร์ผิดตาราง
    if (headerIndexes.length === 1) {
      const r = headerIndexes[0] + 1;
      ws.autoFilter = { from: { row: r, column: 1 }, to: { row: r, column: sheet.rows[headerIndexes[0]].cells.length } };
    }

    for (let c = 1; c <= maxCols; c += 1) {
      const width = Math.max(
        10,
        ...sheet.rows.map((r) => {
          if (r.role === "title" || r.role === "section") return 0; // ข้อความยาวของหัวข้อถูก merge แล้ว ไม่ควรดันคอลัมน์
          const cell = r.cells[c - 1];
          return cell ? displayWidth(cell) + 3 : 0;
        }),
      );
      ws.getColumn(c).width = Math.min(46, width);
    }
  }

  return wb;
}

export async function exportDashboardXlsx(stats: DashboardStats, filters: ReportFilters, filename: string): Promise<void> {
  const wb = await buildDashboardWorkbook(stats, filters);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
