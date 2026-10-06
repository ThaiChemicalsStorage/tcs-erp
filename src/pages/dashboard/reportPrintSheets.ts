import type { ExportCell, ExportCellKind, ExportSheet } from "../../lib/tableExport";
import type { CellKind, ReportCell, ReportSheet } from "./reportRows";

/**
 * ชีตรายงานแท็บขาย (`buildWorkbookSheets` — ตัวเดียวกับไฟล์ Excel) → ตารางสำหรับใบพิมพ์ PDF (2026-10-06, Tuhmo #40)
 *
 * ชีตของแท็บขายมีหลายตารางต่อชีต (หัวเรื่อง → หัวตาราง → แถว → แถวรวม → บรรทัดว่าง) ส่วน `TablePrintDocument` พิมพ์ได้
 * ทีละตาราง จึงตัดทุกช่วง "หัวตาราง…บรรทัดว่าง" ออกเป็นตารางของตัวเอง ใช้หัวเรื่อง/หัวข้อย่อยล่าสุดเป็นชื่อ และแถว meta
 * (ตัวกรองที่ใช้) เป็นคำอธิบายใต้ชื่อ · ตัวเลขยังเป็นตัวเลข เปอร์เซ็นต์แปลงเป็นข้อความ "12.3%" เพราะใบพิมพ์จัดรูปแบบเฉพาะจำนวน/เงิน
 */

const KIND: Record<CellKind, ExportCellKind> = { text: "text", int: "qty", money: "money", percent: "text", days: "qty", date: "date" };

function value(c: ReportCell | undefined): ExportCell {
  if (!c || c.v === null) return null;
  if (c.kind === "percent" && typeof c.v === "number") return `${c.v.toFixed(1)}%`; // pct() เก็บ 0–100 อยู่แล้ว
  if (c.kind === "days" && typeof c.v === "number") return Math.round(c.v * 10) / 10;
  return c.v;
}

export function reportSheetsToPrintSheets(sheets: ReportSheet[]): ExportSheet[] {
  const out: ExportSheet[] = [];
  for (const sheet of sheets) {
    let title = sheet.name;
    let section = "";
    const meta: string[] = [];
    let current: ExportSheet | null = null;
    const close = () => { if (current) out.push(current); current = null; };

    for (const row of sheet.rows) {
      if (row.role === "title") { close(); title = String(row.cells[0]?.v ?? sheet.name); section = ""; continue; }
      if (row.role === "section") { close(); section = String(row.cells[0]?.v ?? ""); continue; }
      if (row.role === "meta") {
        const [label, ...rest] = row.cells;
        meta.push([label?.v, ...rest.map((c) => value(c))].filter((v) => v !== null && v !== "").join(" "));
        continue;
      }
      if (row.role === "blank") { close(); continue; }
      if (row.role === "header") {
        close();
        const kinds = (sheet.rows.find((r) => r.role === "data" && r.cells.length === row.cells.length) ?? row).cells.map((c) => KIND[c.kind]);
        current = {
          sheetName: sheet.name,
          title: section ? `${title} — ${section}` : title,
          meta: [...meta],
          columns: row.cells.map((c, i) => ({ header: String(c.v ?? ""), kind: kinds[i] })),
          rows: [],
        };
        continue;
      }
      // แถวข้อมูลที่ไม่มีหัวตาราง (เช่นตัวเลขหลักในชีตสรุป "ชื่อ | ค่า") — เปิดตาราง 2 คอลัมน์ให้เอง ไม่ให้หายจาก PDF
      if (!current) {
        current = {
          sheetName: sheet.name, title: section ? `${title} — ${section}` : title, meta: [...meta],
          columns: [{ header: "รายการ", kind: "text" }, ...row.cells.slice(1).map((c, i) => ({ header: i === 0 ? "ค่า" : `ค่า ${i + 1}`, kind: KIND[c.kind] === "money" ? "qty" as const : KIND[c.kind] }))],
          rows: [],
        };
      }
      const cells = (current as ExportSheet).columns.map((_, i) => value(row.cells[i]));
      if (row.role === "total") (current as ExportSheet).totals = cells;
      else (current as ExportSheet).rows.push(cells);
    }
    close();
  }
  return out;
}
