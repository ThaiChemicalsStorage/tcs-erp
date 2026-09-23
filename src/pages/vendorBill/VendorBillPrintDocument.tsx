import type { CompanyHeaderInfo } from "../../lib/storage";
import { vendorBillTotals, type VendorBill, type VendorBillRow } from "../../lib/vendorBill";
import { bahtText } from "../../lib/bahtText";
import { printDateShortBE, splitAddressTwoLines } from "../../lib/printFormat";

/**
 * ใบพิมพ์ใบรับวางบิล — ลอกฟอร์มของโปรแกรมบัญชีเดิม (2026-09-23, ตัวอย่างจากเจ้าของ `reference/company/ใบวางบิล.pdf`
 * = BR6909091) ขนาดวัดจากไฟล์ตัวอย่างแบบเดียวกับใบรับสินค้า FM-ST-01 · ตาราง 17 แถวต่อหน้า หัวซ้ำทุกหน้า ยอดรวม
 * คำอ่าน และช่องเซ็น/ภาษีหัก ณ ที่จ่ายอยู่หน้าสุดท้าย · ฟอร์มตัวอย่างไม่มีรหัสฟอร์ม ISO จึงไม่พิมพ์
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n` — เอกสารที่พิมพ์ออกไปต้องไม่เปลี่ยนภาษาตามคนกด (ดู docs/CLAUDE.md)
 */

const ROWS_PER_PAGE = 17;
const COLS = [10.7, 34, 27.6, 23.5, 34, 34, 34];
const BOX_WIDTH = 197.8;
const ROW_H = 6.4;
const LINE = "1.3px solid #000";
const BODY_FONT = "13.3px";
// ที่อยู่/เบอร์โทรบริษัทบนฟอร์มนี้ตัวใหญ่กว่าตัวตารางเล็กน้อย (วัดจากตัวอย่าง)
const HEAD_FONT = "14px";
const mono = "'Courier New', 'Noto Sans Thai', monospace";
const thai = "'Noto Sans Thai', 'Tahoma', sans-serif";

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VendorBillPrintDocument({ doc, rows, companyHeader }: {
  doc: VendorBill;
  rows: VendorBillRow[];
  companyHeader: CompanyHeaderInfo;
}) {
  const printable = rows.filter((r) => !r.missing);
  const pages: VendorBillRow[][] = [];
  for (let i = 0; i < printable.length; i += ROWS_PER_PAGE) pages.push(printable.slice(i, i + ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);
  const totals = vendorBillTotals(printable);
  const [addr1, addr2] = splitAddressTwoLines(doc.vendorAddress);
  const colLeft = (i: number) => COLS.slice(0, i).reduce((a, b) => a + b, 0);
  const rules = (height: number) => [1, 2, 3, 4, 5, 6].map((i) => (
    <div key={i} style={{ position: "absolute", top: 0, left: `${colLeft(i)}mm`, height: `${height}mm`, borderLeft: LINE }} />
  ));

  return (
    <div className="hidden print:block" style={{ fontFamily: mono, fontWeight: 400, color: "#000" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 0 } }"}</style>
      {pages.map((pageRows, pageIdx) => {
        const last = pageIdx === pages.length - 1;
        return (
          <div key={pageIdx} style={{
            width: "210mm", height: "296mm", boxSizing: "border-box", padding: "5mm 0 0 5.5mm", overflow: "hidden",
            breakAfter: last ? "auto" : "page", pageBreakAfter: last ? "auto" : "always",
          }}>
            {/* หัวบริษัท */}
            <div style={{ position: "relative", width: `${BOX_WIDTH}mm`, height: "20mm", fontSize: BODY_FONT }}>
              <div style={{ fontFamily: thai, fontSize: "17.5px", fontWeight: 700, letterSpacing: "0.3em", whiteSpace: "nowrap", marginLeft: "-1mm", lineHeight: 1.3 }}>{companyHeader.name}</div>
              <div style={{ position: "absolute", top: "7.6mm", left: "-1mm", whiteSpace: "nowrap", fontSize: HEAD_FONT }}>{companyHeader.address}</div>
              <div style={{ position: "absolute", top: "13.8mm", left: "-1mm", whiteSpace: "nowrap", fontSize: HEAD_FONT }}>{companyHeader.phone}</div>
              <div style={{ position: "absolute", top: "12.6mm", left: "144.5mm", fontFamily: thai, fontSize: "17px", fontWeight: 700, letterSpacing: "0.3em", whiteSpace: "nowrap" }}>ใบรับวางบิล</div>
            </div>

            {/* หัวใบ */}
            <div style={{ position: "relative", width: `${BOX_WIDTH}mm`, height: "30mm", marginTop: "6.5mm", fontSize: BODY_FONT }}>
              {([
                [0, 3, `ผู้จำหน่าย    ${doc.vendorCode}`],
                [1, 3, doc.vendorName],
                [2, 3, addr1],
                [3, 3, addr2],
                [4, 13.5, `หมายเหตุ  ${doc.remarks.replace(/\s*\r?\n\s*/g, " ")}`],
              ] as const).map(([r, left, text]) => (
                <div key={r} style={{ position: "absolute", top: `${r * 6.26}mm`, left: `${left}mm`, width: "103mm", whiteSpace: "pre", overflow: "hidden" }}>{text}</div>
              ))}
              {([
                [0, "เลขที่", doc.documentNumber],
                [2, "วันที่", printDateShortBE(doc.billDate)],
                [3, "เงื่อนไขการชำระเงิน", doc.creditDays !== null ? `เครดิต ${doc.creditDays} วัน` : ""],
              ] as const).map(([r, label, value]) => (
                <div key={r}>
                  <div style={{ position: "absolute", top: `${r * 6.26}mm`, left: "108mm", whiteSpace: "pre" }}>{label}</div>
                  <div style={{ position: "absolute", top: `${r * 6.26}mm`, left: "149.5mm", whiteSpace: "pre" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* ตาราง */}
            <div style={{ position: "relative", width: `${BOX_WIDTH}mm`, border: LINE, fontSize: BODY_FONT }}>
              <div style={{ position: "relative", height: "12.8mm", borderBottom: LINE }}>
                {rules(12.8)}
                {["No.", "เลขที่ใบรับ", "วันที่", "ครบกำหนด", "จำนวนเงิน", "จ่ายแล้ว", "เงินคงค้าง"].map((h, i) => (
                  <div key={h} style={{
                    position: "absolute", top: 0, left: `${colLeft(i)}mm`, width: `${COLS[i]}mm`, height: "12.8mm",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{h}</div>
                ))}
              </div>
              <div style={{ position: "relative", height: "108.4mm", borderBottom: LINE }}>
                {rules(108.4)}
                {pageRows.map((r, i) => {
                  const cell = (col: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
                    position: "absolute", top: `${3.3 + i * ROW_H}mm`, left: `${colLeft(col)}mm`, width: `${COLS[col]}mm`,
                    lineHeight: `${ROW_H}mm`, whiteSpace: "nowrap", overflow: "hidden", boxSizing: "border-box", ...extra,
                  });
                  return (
                    <div key={r.apEntryId}>
                      <div style={cell(0, { textAlign: "center" })}>{pageIdx * ROWS_PER_PAGE + i + 1}</div>
                      {/* เลขของระบบยาวกว่าเลขโปรแกรมเดิม (RR-202609-0134 กับ RR6909134) จึงชิดซ้ายกว่าฟอร์มเดิม */}
                      <div style={cell(1, { paddingLeft: "2mm" })}>{r.receivingReportNumber}</div>
                      <div style={cell(2, { textAlign: "center", paddingLeft: "4mm" })}>{printDateShortBE(r.invoiceDate)}</div>
                      <div style={cell(3, { textAlign: "center" })}>{printDateShortBE(r.dueDate)}</div>
                      <div style={cell(4, { textAlign: "right", paddingRight: "3.6mm" })}>{money(r.amount)}</div>
                      <div style={cell(5, { textAlign: "right", paddingRight: "3.6mm" })}>{r.paid > 0 ? money(r.paid) : ""}</div>
                      <div style={cell(6, { textAlign: "right", paddingRight: "3mm" })}>{money(r.outstanding)}</div>
                    </div>
                  );
                })}
              </div>
              {last ? (
                <div style={{ position: "relative", height: "76.5mm" }}>
                  <div style={{ position: "absolute", top: 0, left: `${colLeft(6)}mm`, width: `${COLS[6]}mm`, height: "12.8mm", borderLeft: LINE, borderBottom: LINE, boxSizing: "border-box" }} />
                  <div style={{ position: "absolute", top: "4.4mm", left: "0.3mm", width: "125mm", whiteSpace: "nowrap", overflow: "hidden" }}>{`${bahtText(totals.outstanding)}.`}</div>
                  <div style={{ position: "absolute", top: "4.4mm", left: "129mm", whiteSpace: "pre" }}>รวมเงินทั้งสิ้น</div>
                  <div style={{ position: "absolute", top: "4.4mm", left: `${colLeft(6)}mm`, width: `${COLS[6]}mm`, textAlign: "right", paddingRight: "3mm", boxSizing: "border-box" }}>{money(totals.outstanding)}</div>
                  <div style={{ position: "absolute", top: "17.4mm", left: "3mm", whiteSpace: "pre" }}>หมายเหตุ</div>
                  <div style={{ position: "absolute", top: "42.8mm", left: "6.3mm", whiteSpace: "pre" }}>{"ชื่อผู้รับวางบิล ____________________"}</div>
                  <div style={{ position: "absolute", top: "50.4mm", left: "6.3mm", whiteSpace: "pre" }}>{"วันที่รับ        ___/___/___"}</div>
                  <div style={{ position: "absolute", top: "50.4mm", left: "75.5mm", whiteSpace: "pre" }}>{"ภาษีหัก ณ. ที่จ่าย 3 % / 5%___________________"}</div>
                  <div style={{ position: "absolute", top: "56.1mm", left: "6.3mm", whiteSpace: "pre" }}>{"วันที่นัดรับเช็ค ___/___/___"}</div>
                  <div style={{ position: "absolute", top: "56.1mm", left: "75.5mm", whiteSpace: "pre" }}>{"ภาษีหัก ณ. ที่จ่าย 1 %___________________"}</div>
                  <div style={{ position: "absolute", top: "68.4mm", left: "124.5mm", whiteSpace: "pre" }}>{`วันที่จ่ายชำระ ${printDateShortBE(doc.paymentDate)}`}</div>
                </div>
              ) : (
                <div style={{ height: "4mm" }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
