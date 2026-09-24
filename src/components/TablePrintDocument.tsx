import type { CompanyHeaderInfo } from "../lib/storage";
import type { ExportSheet } from "../lib/tableExport";
import { PrintLetterhead } from "./PrintLetterhead";
import { PrintPageFrame } from "./PrintPageFrame";

/**
 * ใบพิมพ์ตารางรายงาน (2026-09-24) — ฝั่ง "PDF" ของปุ่มส่งออกในหน้าสต๊อก/ประวัติสต๊อก รับข้อมูลชุดเดียวกับไฟล์ Excel
 * (`ExportSheet`) ตัวเลขสองทางจึงตรงกันเสมอ · ผู้ใช้เลือก "บันทึกเป็น PDF" ในหน้าต่างพิมพ์ของเบราว์เซอร์ แบบเดียวกับใบพิมพ์
 * ทุกใบของระบบ (ไม่มีตัวสร้าง PDF ฝั่งเซิร์ฟเวอร์)
 *
 * แนวนอน A4 · หัวตารางพิมพ์ซ้ำทุกหน้า (`<thead>`) · ภาษาไทยตามนโยบายใบพิมพ์ใน docs/CLAUDE.md
 * อยู่ใน DOM เฉพาะตอนกำลังพิมพ์ (ผู้เรียกเรนเดอร์แล้วสั่ง `window.print()`) ซ่อนบนจอด้วย `hidden print:block`
 */
export function TablePrintDocument({ sheet, companyHeader, docLabel, printedAt }: {
  sheet: ExportSheet;
  companyHeader: CompanyHeaderInfo;
  docLabel: string;
  printedAt: string;
}) {
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "3px 5px", verticalAlign: "top" };
  const text = (v: string | number | null, kind: string | undefined) => {
    if (v === null || v === "") return "";
    if (typeof v !== "number") return v;
    return v.toLocaleString("en-US", kind === "money" ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });
  };
  const align = (v: string | number | null): React.CSSProperties["textAlign"] => (typeof v === "number" ? "right" : "left");

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Noto Sans Thai', sans-serif", fontSize: "10px", color: "#000" }}>
      <PrintPageFrame size="A4 landscape">
        <PrintLetterhead companyHeader={companyHeader} docLabel={docLabel} rightMeta={[{ label: "วันที่พิมพ์", value: printedAt }]} />
        <h1 style={{ textAlign: "center", fontSize: "15px", fontWeight: 700, margin: "0 0 4px" }}>{sheet.title}</h1>
        {(sheet.meta ?? []).map((m) => (
          <p key={m} style={{ textAlign: "center", margin: "0 0 2px", fontSize: "10px" }}>{m}</p>
        ))}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "6px" }}>
          <thead>
            <tr>
              {sheet.columns.map((c) => (
                <th key={c.header} style={{ ...cell, textAlign: "center", fontWeight: 700, background: "#eef1f6" }}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr><td style={{ ...cell, textAlign: "center" }} colSpan={sheet.columns.length}>ไม่มีข้อมูล</td></tr>
            )}
            {sheet.rows.map((r, i) => (
              <tr key={i} style={{ breakInside: "avoid" }}>
                {sheet.columns.map((c, j) => (
                  <td key={c.header} style={{ ...cell, textAlign: align(r[j] ?? null), whiteSpace: "pre-line" }}>{text(r[j] ?? null, c.kind)}</td>
                ))}
              </tr>
            ))}
            {sheet.totals && (
              <tr style={{ breakInside: "avoid" }}>
                {sheet.columns.map((c, j) => (
                  <td key={c.header} style={{ ...cell, fontWeight: 700, background: "#f5edd6", textAlign: align(sheet.totals![j] ?? null) }}>{text(sheet.totals![j] ?? null, c.kind)}</td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </PrintPageFrame>
    </div>
  );
}
