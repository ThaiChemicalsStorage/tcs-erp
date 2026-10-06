/**
 * ใบสรุปจ่าย-คืนวัสดุ (2026-10-06) — จ่ายและคืนของใบเบิกหนึ่งใบในแผ่นเดียว พร้อมยอดออก/ยอดคืน/สุทธิ
 * เจ้าของ: *"เอารูปแบบเอกสารเป็นแบบนี้ … จะได้ไม่ต้องปริ้นใบรับใบจ่าย 2 ใบมันเปลืองกระดาษ"* (แนบรูปใบรับคืน J1 ของโปรแกรมเดิม)
 *
 * หน้าตาตาม `StoreSlipPrint` (ใบจ่าย/ใบรับคืนแบบโปรแกรมบัญชีเดิม): หัวบริษัท/ชื่อใบตัวห่าง, JOB + หมายเหตุซ้าย,
 * เลขที่เอกสาร + วันที่ขวา, ตารางสูงตายตัว 18 บรรทัดต่อหน้า หัวซ้ำทุกหน้า, กล่องรวม/ช่องเซ็นหน้าสุดท้าย —
 * ต่างแค่คอลัมน์: ฝั่งจ่ายกับฝั่งคืนแยกกัน เพราะราคาสองฝั่งไม่เท่ากัน (จ่าย = ต้นทุนตอนตัด, คืน = ราคาซื้อล่าสุดตอนรับคืน)
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n` — เอกสารที่พิมพ์ออกไปต้องไม่เปลี่ยนภาษาตามคนกด (ดู docs/CLAUDE.md)
 */

import type { IssueReturnSummary } from "../../lib/materialRequisition";
import { printDateShortBE } from "../../lib/printFormat";

const ROWS_PER_PAGE = 18;

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ความกว้างคอลัมน์ (mm) รวม 198mm = กรอบตารางเดียวกับใบจ่าย/ใบรับคืน
const HEADS = ["No.", "รหัสสินค้า/รายละเอียด", "หน่วย", "จ่าย", "ยอดออก", "คืน", "ยอดคืน", "สุทธิ"];
const COLS = [9, 60, 13, 20, 24, 20, 24, 28];
const BOX_WIDTH = 198;
const ROW_H = 6.4;
const HEAD_H = 12.8;
const BODY_H = 121;
const LINE = "1.3px solid #000";
const BODY_FONT = "12px";

const mono = "'Courier New', 'Noto Sans Thai', monospace";
const spaced = "'Noto Sans Thai', 'Tahoma', sans-serif";

export function IssueReturnSummaryPrint({ summary: s, companyName, printedAt }: {
  summary: IssueReturnSummary;
  companyName: string;
  /** วันที่พิมพ์ "YYYY-MM-DD" */
  printedAt: string;
}) {
  const rows = s.rows.map((r) => {
    const issueValue = round2(r.issuedQty * r.issueUnitCost);
    const returnValue = round2(r.returnedQty * r.returnUnitCost);
    return { ...r, issueValue, returnValue, net: round2(issueValue - returnValue) };
  });
  const pages: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) pages.push(rows.slice(i, i + ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);
  const totalIssue = round2(rows.reduce((sum, r) => sum + r.issueValue, 0));
  const totalReturn = round2(rows.reduce((sum, r) => sum + r.returnValue, 0));
  const colLeft = (i: number) => COLS.slice(0, i).reduce((a, b) => a + b, 0);
  const remark = [...new Set([s.jobCode, s.customerName, s.productName, s.storeReference].map((x) => (x ?? "").trim()).filter(Boolean))].join(" ");
  const charge = [s.chargeDepartmentName, s.chargeTeamName].filter(Boolean).join(" / ");

  const columnRules = (height: number) => COLS.slice(1).map((_, i) => (
    <div key={i} style={{ position: "absolute", top: 0, left: `${colLeft(i + 1)}mm`, height: `${height}mm`, borderLeft: LINE }} />
  ));

  return (
    <div className="hidden print:block" style={{ fontFamily: mono, fontWeight: 400, color: "#000" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 0 } }"}</style>
      {pages.map((pageRows, pageIdx) => {
        const last = pageIdx === pages.length - 1;
        return (
          <div key={pageIdx} style={{
            width: "210mm", height: "296mm", boxSizing: "border-box", padding: "4.5mm 0 0 5.5mm",
            overflow: "hidden", breakAfter: last ? "auto" : "page", pageBreakAfter: last ? "auto" : "always",
          }}>
            <div style={{ fontFamily: spaced, fontSize: "17.5px", letterSpacing: "0.4em", whiteSpace: "nowrap", marginLeft: "-1mm", lineHeight: 1.25 }}>{companyName}</div>
            <div style={{ fontFamily: spaced, fontSize: "17.5px", letterSpacing: "0.33em", whiteSpace: "nowrap", marginLeft: "106.5mm", lineHeight: 1.25 }}>ใบสรุปจ่าย-คืนวัสดุ</div>

            <div style={{ position: "relative", height: "13mm", marginTop: "6mm", fontSize: "13.3px", width: `${BOX_WIDTH}mm` }}>
              <div style={{ position: "absolute", top: 0, left: "3.5mm", right: "62mm", whiteSpace: "nowrap", overflow: "hidden" }}>
                {`JOB : ${s.jobCode}${charge ? `   ${charge}` : ""}`}
              </div>
              <div style={{ position: "absolute", top: "6.4mm", left: "-1mm", right: "62mm", whiteSpace: "pre", overflow: "hidden" }}>
                {`หมายเหตุ  : ${remark}`}
              </div>
              <div style={{ position: "absolute", top: 0, right: "40mm" }}>อ้างใบเบิก</div>
              <div style={{ position: "absolute", top: 0, left: "161mm", whiteSpace: "nowrap" }}>{s.documentNumber}</div>
              <div style={{ position: "absolute", top: "6.4mm", right: "40mm" }}>วันที่พิมพ์</div>
              <div style={{ position: "absolute", top: "6.4mm", left: "161mm" }}>{printDateShortBE(printedAt)}</div>
            </div>

            <div style={{ position: "relative", width: `${BOX_WIDTH}mm`, marginTop: "2.5mm", borderTop: LINE, borderLeft: LINE, borderRight: LINE, fontSize: BODY_FONT }}>
              <div style={{ position: "relative", height: `${HEAD_H}mm`, borderBottom: LINE }}>
                {columnRules(HEAD_H)}
                {HEADS.map((h, i) => (
                  <div key={h} style={{
                    position: "absolute", top: 0, left: `${colLeft(i)}mm`, width: `${COLS[i]}mm`, height: `${HEAD_H}mm`,
                    display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
                  }}>{h}</div>
                ))}
              </div>
              <div style={{ position: "relative", height: `${BODY_H}mm`, borderBottom: LINE }}>
                {columnRules(BODY_H)}
                {pageRows.map((r, i) => {
                  const top = `${3.3 + i * ROW_H}mm`;
                  const cell = (col: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
                    position: "absolute", top, left: `${colLeft(col)}mm`, width: `${COLS[col]}mm`, height: `${ROW_H}mm`,
                    lineHeight: `${ROW_H}mm`, whiteSpace: "nowrap", overflow: "hidden", boxSizing: "border-box", ...extra,
                  });
                  const num = (col: number, value: string) => <div style={cell(col, { textAlign: "right", paddingRight: "1.6mm" })}>{value}</div>;
                  return (
                    <div key={r.lineId}>
                      <div style={cell(0, { textAlign: "center" })}>{pageIdx * ROWS_PER_PAGE + i + 1}</div>
                      <div style={cell(1, { paddingLeft: "1.6mm" })}>{`${r.productCode} ${r.productName}`.trim()}</div>
                      <div style={cell(2, { paddingLeft: "1.2mm" })}>{r.unit}</div>
                      {num(3, money(r.issuedQty))}
                      {num(4, money(r.issueValue))}
                      {num(5, r.returnedQty > 0 ? money(r.returnedQty) : "-")}
                      {num(6, r.returnedQty > 0 ? money(r.returnValue) : "-")}
                      {num(7, money(r.net))}
                    </div>
                  );
                })}
              </div>

              {last ? (
                <div style={{ position: "relative", height: "70mm", borderBottom: LINE }}>
                  {/* แถวรวมใต้คอลัมน์ยอดออก / ยอดคืน / สุทธิ */}
                  <div style={{ position: "absolute", top: 0, left: `${colLeft(3)}mm`, width: `${BOX_WIDTH - colLeft(3)}mm`, height: "9mm", borderLeft: LINE, borderBottom: LINE, boxSizing: "border-box" }} />
                  {[4, 5, 6, 7].map((i) => (
                    <div key={i} style={{ position: "absolute", top: 0, left: `${colLeft(i)}mm`, height: "9mm", borderLeft: LINE }} />
                  ))}
                  <div style={{ position: "absolute", top: "2.2mm", left: `${colLeft(3)}mm`, width: `${COLS[3]}mm`, textAlign: "center", letterSpacing: "0.35em" }}>รวม</div>
                  <div style={{ position: "absolute", top: "2.2mm", left: `${colLeft(4)}mm`, width: `${COLS[4]}mm`, textAlign: "right", paddingRight: "1.6mm", boxSizing: "border-box" }}>{money(totalIssue)}</div>
                  <div style={{ position: "absolute", top: "2.2mm", left: `${colLeft(6)}mm`, width: `${COLS[6]}mm`, textAlign: "right", paddingRight: "1.6mm", boxSizing: "border-box" }}>{money(totalReturn)}</div>
                  <div style={{ position: "absolute", top: "2.2mm", left: `${colLeft(7)}mm`, width: `${COLS[7]}mm`, textAlign: "right", paddingRight: "1.6mm", boxSizing: "border-box", fontWeight: 700 }}>{money(round2(totalIssue - totalReturn))}</div>

                  <div style={{ position: "absolute", top: "12mm", left: "3mm", right: "3mm", whiteSpace: "pre-wrap", fontSize: "12px", lineHeight: 1.5 }}>
                    {s.storeSlipNumbers.length > 0 && `ใบจ่ายของสโตร์ : ${s.storeSlipNumbers.join(", ")}\n`}
                    {`ใบรับคืน : ${s.receiptNumbers.length > 0 ? s.receiptNumbers.join(", ") : "-"}`}
                    {s.lastIssuedDate && `\nจ่ายรอบล่าสุด : ${printDateShortBE(s.lastIssuedDate)}`}
                    {"\nยอดออก = ต้นทุนตอนจ่าย · ยอดคืน = ราคาที่รับคืนเข้าคลัง · สุทธิ = ยอดออก - ยอดคืน"}
                  </div>
                  <div style={{ position: "absolute", top: "42mm", left: "3mm", whiteSpace: "pre", fontSize: "13.3px" }}>
                    {"ผู้จัดทำ _______________ __/__/__     ผู้ตรวจ (สโตร์) _______________ __/__/__"}
                  </div>
                  <div style={{ position: "absolute", top: "58mm", left: "3mm", whiteSpace: "pre", fontSize: "13.3px" }}>
                    {"ผู้รับทราบ (หน่วยงาน) __________________  วันที่ ___/___/___"}
                  </div>
                </div>
              ) : (
                <div style={{ position: "relative", height: "4mm", marginLeft: "-1.3px", marginRight: "-1.3px" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "4mm", borderLeft: LINE }} />
                  <div style={{ position: "absolute", right: 0, top: 0, height: "4mm", borderRight: LINE }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
