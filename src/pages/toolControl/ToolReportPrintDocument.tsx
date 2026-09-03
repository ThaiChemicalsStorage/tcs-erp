import type { CompanyHeaderInfo } from "../../lib/storage";
import type { ToolHoldingRow, ToolReportRow } from "../../lib/toolHoldings";
import { PrintLetterhead } from "../../components/PrintLetterhead";
import { printDate, printText } from "../../lib/printFormat";

/**
 * รายงานเครื่องมือประจำทีม — พิมพ์ได้สองแบบตามแท็บที่เปิดอยู่บนจอ:
 *   - "ในครอบครอง": ตารางยอดถือครองต่อทีม/เครื่องมือ
 *   - "รายงานเบิก-คืน": รายการเคลื่อนไหวรายแถวในช่วงวันที่ (เจ้าของสั่ง *"เลือกรายงานแยกออกมาว่าทีมไหน
 *     เบิกอะไรไปบ้าง และสามารถกดปริ้นออกมาได้"*)
 *
 * ตารางธรรมดาไม่มีฟอร์มจริง (เหมือนใบสั่งซื้อ) — เจ้าของยังไม่ได้ส่งฟอร์มมา · ภาษาไทยฮาร์ดโค้ดตามนโยบายใบพิมพ์
 */
export function ToolReportPrintDocument({ mode, holdings, rows, companyHeader, printedAt, filterLabel, rangeLabel }: {
  mode: "holdings" | "report";
  holdings: ToolHoldingRow[];
  rows: ToolReportRow[];
  companyHeader: CompanyHeaderInfo;
  printedAt: string;
  /** แผนก / ทีม / ประเภทงาน ที่กรองอยู่ — พิมพ์บนหัวใบให้รู้ว่ารายงานนี้ของใคร */
  filterLabel: string;
  rangeLabel: string;
}) {
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "3px 5px", verticalAlign: "middle" };
  const headCell: React.CSSProperties = { ...cell, textAlign: "center", fontWeight: 700 };
  const qty = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif", fontSize: "11px", color: "#000" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              <PrintLetterhead
                companyHeader={companyHeader}
                docLabel="TOOL REPORT"
                rightMeta={[
                  { label: "วันที่พิมพ์", value: printDate(printedAt) },
                  { label: mode === "holdings" ? "จำนวนรายการ" : "จำนวนรายการเคลื่อนไหว", value: String(mode === "holdings" ? holdings.length : rows.length) },
                ]}
              />
              <h1 style={{ textAlign: "center", fontSize: "15px", fontWeight: 700, margin: "0 0 4px" }}>
                {mode === "holdings" ? "รายงานเครื่องมือในครอบครองของทีม" : "รายงานการเบิก-คืนเครื่องมือ"}
              </h1>
              <p style={{ textAlign: "center", margin: "0 0 8px" }}>
                {printText(filterLabel)}{mode === "report" && rangeLabel ? ` · ${rangeLabel}` : ""}
              </p>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              {mode === "holdings" ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                  <thead>
                    <tr>
                      <th style={headCell}>ลำดับ</th>
                      <th style={headCell}>แผนก</th>
                      <th style={headCell}>ทีม</th>
                      <th style={headCell}>รหัส</th>
                      <th style={headCell}>เครื่องมือ</th>
                      <th style={headCell}>หน่วย</th>
                      <th style={headCell}>เบิกรวม</th>
                      <th style={headCell}>คืนรวม</th>
                      <th style={headCell}>ถืออยู่</th>
                      <th style={headCell}>ใบเบิกล่าสุด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.length === 0 && <tr><td style={{ ...cell, textAlign: "center" }} colSpan={10}>ไม่มีเครื่องมือที่ถูกเบิกไปและยังไม่คืน</td></tr>}
                    {holdings.map((h, i) => (
                      <tr key={`${h.teamId}|${h.productId}`}>
                        <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                        <td style={cell}>{printText(h.departmentName)}</td>
                        <td style={cell}>{printText(h.teamName)}</td>
                        <td style={cell}>{printText(h.productCode)}</td>
                        <td style={cell}>{printText(h.productName)}</td>
                        <td style={{ ...cell, textAlign: "center" }}>{printText(h.unit)}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{qty(h.issued)}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{qty(h.returned)}</td>
                        <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{qty(h.held)}</td>
                        <td style={cell}>{printText(h.lastSourceLabel)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                  <thead>
                    <tr>
                      <th style={headCell}>วันที่</th>
                      <th style={headCell}>เลขใบเบิก</th>
                      <th style={headCell}>แผนก / ทีม</th>
                      <th style={headCell}>ประเภทงาน</th>
                      <th style={headCell}>เครื่องมือ</th>
                      <th style={headCell}>เบิก</th>
                      <th style={headCell}>คืน</th>
                      <th style={headCell}>หน่วย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && <tr><td style={{ ...cell, textAlign: "center" }} colSpan={8}>ไม่มีรายการในช่วงที่เลือก</td></tr>}
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...cell, whiteSpace: "nowrap" }}>{printDate(r.createdAt.slice(0, 10))}</td>
                        <td style={cell}>{printText(r.sourceLabel)}</td>
                        <td style={cell}>{printText([r.departmentName, r.teamName].filter(Boolean).join(" / "))}</td>
                        <td style={cell}>{printText(r.workTypeName)}</td>
                        <td style={cell}>{printText(r.productCode)} {printText(r.productName)}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{r.qty > 0 ? qty(r.qty) : ""}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{r.qty < 0 ? qty(-r.qty) : ""}</td>
                        <td style={{ ...cell, textAlign: "center" }}>{printText(r.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "22px", breakInside: "avoid" }}>
                <tbody>
                  <tr>
                    {["ผู้จัดทำรายงาน", "ผู้ตรวจสอบ"].map((label) => (
                      <td key={label} style={{ border: "none", width: "50%", padding: "0 10px", textAlign: "center", verticalAlign: "bottom" }}>
                        <div style={{ height: "26px" }} />
                        <div style={{ borderBottom: "1px solid #000" }} />
                        <p style={{ margin: "2px 0 0" }}>{label}</p>
                        <p style={{ margin: "4px 0 0" }}>วันที่ ....... / ....... / .......</p>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              <p style={{ textAlign: "right", margin: "6px 0 0", fontSize: "9px" }}>คิดจากใบเบิกที่สโตร์จ่ายและรับคืน · ณ วันที่พิมพ์ {printDate(printedAt)}</p>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
