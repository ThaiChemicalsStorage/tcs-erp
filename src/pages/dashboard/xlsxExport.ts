import type { DashboardStats } from "../../lib/dashboard";
import { buildWorkbookSheets, type ReportCell, type ReportFilters } from "./reportRows";

/**
 * ส่งออกรายงานแดชบอร์ดเป็น Excel หลายชีต — ตัวเรนเดอร์ของแถวจาก `reportRows.ts` (แหล่งเดียวกับ CSV)
 *
 * 2026-09-07 ยกเครื่องจาก 6 ชีตป้ายอังกฤษเป็น 10 ชีตภาษาไทย ตามที่เจ้าของขอ *"แยกดูยอดรวม เปอร์เซ็นต์
 * ดูแยกเป็นคนได้ โอกาสปิดการขายรวม แบบละเอียด ๆ"* และ *"ออกแบบให้ออกมาดูง่าย"*:
 *   - ตัวเลขเป็น**ตัวเลขจริง**พร้อมรูปแบบ (เงินคั่นหลักพัน 2 ตำแหน่ง · เปอร์เซ็นต์เป็น % จริง · วันที่เป็นข้อความ
 *     ISO ที่ Excel เรียงได้) ผู้ใช้ลาก SUM() ได้ทันที
 *   - แต่ละชีตมีบรรทัดหัวข้อ + บรรทัดว่างคั่นระหว่างตาราง ความกว้างคอลัมน์คิดจากเนื้อหาจริง
 *   - `xlsx` โหลดแบบ dynamic เหมือนเดิม ไม่ติดไปกับ bundle หลัก
 *
 * ข้อจำกัดที่รู้: xlsx รุ่นชุมชน (ที่ใช้อยู่) ไม่รองรับตัวหนา/สีพื้น/freeze pane — "ดูง่าย" ในไฟล์นี้จึงมาจาก
 * โครงสร้างแถว ชื่อชีตชัด และรูปแบบตัวเลข ไม่ใช่การตกแต่ง
 */

const NUMBER_FORMAT: Record<ReportCell["kind"], string | null> = {
  text: null,
  date: null,
  int: "#,##0",
  money: "#,##0.00",
  percent: "0.0%",
  days: "0.0",
};

function toSheetValue(cell: ReportCell): string | number {
  if (cell.v === null) return cell.kind === "text" || cell.kind === "date" ? "" : "—";
  if (cell.kind === "percent" && typeof cell.v === "number") return cell.v / 100;
  return cell.v;
}

export async function exportDashboardXlsx(stats: DashboardStats, filters: ReportFilters, filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of buildWorkbookSheets(stats, filters)) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows.map((row) => row.map(toSheetValue)));
    // ใส่รูปแบบตัวเลขทีละช่องตามชนิดที่ตัวสร้างแถวบอกไว้ — aoa_to_sheet ไม่รู้จักชนิดของเรา
    sheet.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const fmt = NUMBER_FORMAT[cell.kind];
        if (!fmt || typeof cell.v !== "number") return;
        const ref = XLSX.utils.encode_cell({ r, c });
        const target = ws[ref] as { t?: string; z?: string } | undefined;
        if (target) { target.t = "n"; target.z = fmt; }
      });
    });
    const colCount = Math.max(1, ...sheet.rows.map((r) => r.length));
    ws["!cols"] = Array.from({ length: colCount }, (_, i) => ({
      wch: Math.min(48, Math.max(10, ...sheet.rows.map((r) => {
        const cell = r[i];
        if (!cell) return 0;
        // ตัวเลขที่จัดรูปแบบแล้วกว้างกว่าตัวดิบ (คั่นหลักพัน + ทศนิยม) เผื่อไว้ให้ไม่ขึ้น ######
        const width = typeof cell.v === "number" ? cell.v.toLocaleString("en-US", { maximumFractionDigits: 2 }).length + 2 : String(cell.v ?? "").length;
        return width + 2;
      }))),
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, filename);
}
