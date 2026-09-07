import type { DashboardStats } from "../../lib/dashboard";
import { buildCsvSections, type ReportCell, type ReportFilters } from "./reportRows";

// ครอบค่าเป็นเซลล์ CSV ที่ถูกต้อง (ใส่เครื่องหมายคำพูดถ้ามีจุลภาคหรือขึ้นบรรทัดใหม่)
// Escapes a value into a valid CSV cell (quotes it if it contains a comma or newline)
function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// รวมเซลล์หลายค่าเป็นหนึ่งแถว CSV
// Joins multiple cells into one CSV row
function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

/** CSV ไม่มีรูปแบบตัวเลข — เปอร์เซ็นต์คงเป็น 0–100 ตามหัวคอลัมน์ ค่าว่างเป็นช่องว่าง */
function csvValue(cell: ReportCell): string | number {
  if (cell.v === null) return "";
  return cell.v;
}

/**
 * สร้างไฟล์ CSV สรุปรายงานแดชบอร์ด — ตัวเรนเดอร์ของแถวจาก `reportRows.ts` แหล่งเดียวกับ Excel (2026-09-07)
 * ก่อนหน้านี้ไฟล์นี้เขียนแถวของตัวเองจนต่างจาก Excel (มี Total Leads ที่ Excel ไม่มี) ตอนนี้เป็นชุดย่อยของ
 * ชีตเดียวกัน: สรุปภาพรวม · รายเซลล์ · ลูกค้า · ประเภทงาน — ต้องการชีตอื่นให้ใช้ Excel
 */
export function buildDashboardCsv(stats: DashboardStats, filters: ReportFilters): string {
  const lines: string[] = [];
  for (const section of buildCsvSections(stats, filters)) {
    lines.push(csvRow([`## ${section.name}`]));
    for (const row of section.rows) lines.push(row.length === 0 ? "" : csvRow(row.map(csvValue)));
    lines.push("");
  }
  return lines.join("\r\n");
}

// ดาวน์โหลดสตริง CSV เป็นไฟล์ในเบราว์เซอร์ (ใส่ BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง)
// Triggers a browser download of a CSV string (with a BOM so Excel reads Thai text correctly)
export function downloadCsv(filename: string, csv: string): void {
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
