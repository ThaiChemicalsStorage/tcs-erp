/**
 * ใบจ่ายวัสดุ / ใบรับคืนวัสดุ ของสโตร์ — **ลอกแบบฟอร์มที่โปรแกรมบัญชีเดิมพิมพ์** (2026-09-23)
 *
 * เจ้าของส่งตัวอย่างมาสองใบ (`reference/company/ใบเบิก.pdf` = P1 "ใบจ่ายวัสดุกลุ่ม SHELL",
 * `reference/company/ใบรับคืน.pdf` = J1 "ใบรับคืนวัสดุ กลุ่ม SHELL") พร้อมคำสั่ง *"ขอแบบนี้เป๊ะๆ"* — ขนาดทุกตัวในไฟล์นี้
 * วัดจากไฟล์ตัวอย่าง (หน้า A4 กว้าง 210mm) ไม่ได้ออกแบบใหม่: หัวบริษัท/ชื่อใบตัวห่าง, JOB กับหมายเหตุซ้าย,
 * เลขที่เอกสารกับวันที่ขวา, ตารางห้าช่อง (No. · รหัสสินค้า/รายละเอียด · จำนวน · หน่วยละ · รวม) **18 บรรทัดต่อหน้า**
 * ตัวตารางสูงเท่ากันทุกหน้า หัวซ้ำทุกหน้า และกล่องรวม/หมายเหตุ/ช่องเซ็นอยู่หน้าสุดท้ายหน้าเดียว
 *
 * ⚠️ แบ่งหน้าเอง (กล่องละ 297mm + `break-after: page`) ไม่ใช้ `PrintPageFrame` — ฟอร์มเดิมตีเส้นตารางยาวเต็มกรอบ
 * แม้มีสองบรรทัด ความสูงจึงต้องตายตัว และหัวเอกสารต้องซ้ำทุกหน้า ซึ่งการปล่อยให้เบราว์เซอร์หั่นหน้าเองทำไม่ได้
 * `@page { margin: 0 }` เหมือนใบพิมพ์อื่น เบราว์เซอร์จึงไม่วาด URL/วันที่ลงมุมกระดาษ
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n` — เอกสารที่พิมพ์ออกไปต้องไม่เปลี่ยนภาษาตามคนกด (ดู docs/CLAUDE.md)
 */

import { printDateShortBE } from "../../lib/printFormat";

export interface StoreSlipRow {
  key: string;
  code: string;
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
}

export interface StoreSlipProps {
  variant: "issue" | "receipt";
  companyName: string;
  title: string;
  jobCode: string;
  documentNumber: string;
  /** "YYYY-MM-DD…" — พิมพ์เป็น วว/ดด/ปป (พ.ศ. สองหลัก) แบบโปรแกรมเดิม */
  date: string;
  remark: string;
  /** หมายเหตุเพิ่มเติม — ว่างได้ (ฟอร์มเดิมเว้นไว้ให้เขียนมือ) */
  extraRemark: string;
  rows: StoreSlipRow[];
}

const STORE_SLIP_ROWS_PER_PAGE = 18;

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ความกว้างคอลัมน์ (mm) รวม 198mm = กรอบตารางของฟอร์มเดิม
const COLS = [10.7, 80.8, 46.8, 27.6, 32.1];
const BOX_WIDTH = 198;
const ROW_H = 6.4;
const HEAD_H = 12.8;
const BODY_H = 121;
const LINE = "1.3px solid #000";
// Courier New กว้าง 0.6em ต่ออักษร — ฟอร์มเดิม 2.12mm/อักษร ("MA-RE-OR-P9539NWA-6 Resin Ortho P9539" 37 ตัวพอดีช่องรายการ)
const BODY_FONT = "13.3px";

const mono = "'Courier New', 'Noto Sans Thai', monospace";
const spaced = "'Noto Sans Thai', 'Tahoma', sans-serif";

export function StoreSlipPrint({ variant, companyName, title, jobCode, documentNumber, date, remark, extraRemark, rows }: StoreSlipProps) {
  const pages: StoreSlipRow[][] = [];
  for (let i = 0; i < rows.length; i += STORE_SLIP_ROWS_PER_PAGE) pages.push(rows.slice(i, i + STORE_SLIP_ROWS_PER_PAGE));
  if (pages.length === 0) pages.push([]);
  const total = rows.reduce((sum, r) => sum + round2(r.qty * r.unitCost), 0);
  const colLeft = (i: number) => COLS.slice(0, i).reduce((a, b) => a + b, 0);

  // เส้นตั้งของคอลัมน์ วาดเป็นเส้นเต็มความสูงกล่อง ไม่ใช่เส้นขอบเซลล์ — ฟอร์มเดิมลากยาวถึงก้นตารางแม้บรรทัดว่าง
  const columnRules = (height: number) => [1, 2, 3, 4].map((i) => (
    <div key={i} style={{ position: "absolute", top: 0, left: `${colLeft(i)}mm`, height: `${height}mm`, borderLeft: LINE }} />
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
            {/* หัวบริษัท + ชื่อใบ — ตัวห่างแบบฟอร์มเดิม */}
            <div style={{ fontFamily: spaced, fontSize: "17.5px", letterSpacing: "0.4em", whiteSpace: "nowrap", marginLeft: "-1mm", lineHeight: 1.25 }}>{companyName}</div>
            <div style={{ fontFamily: spaced, fontSize: "17.5px", letterSpacing: "0.33em", whiteSpace: "nowrap", marginLeft: "106.5mm", lineHeight: 1.25 }}>{title}</div>

            {/* JOB / หมายเหตุ ซ้าย — เลขที่เอกสาร / วันที่ ขวา */}
            <div style={{ position: "relative", height: "13mm", marginTop: "6mm", fontSize: BODY_FONT, width: `${BOX_WIDTH}mm` }}>
              <div style={{ position: "absolute", top: 0, left: "3.5mm", whiteSpace: "nowrap" }}>
                {variant === "issue" ? `JOB NO ${jobCode}` : `JOB : ${jobCode}`}
              </div>
              <div style={{ position: "absolute", top: "6.4mm", left: "-1mm", right: variant === "issue" ? "60mm" : "58mm", whiteSpace: "pre", overflow: "hidden" }}>
                {`หมายเหตุ  : ${remark}`}
              </div>
              {variant === "issue" ? (
                <>
                  <div style={{ position: "absolute", top: 0, left: "108mm" }}>เลขที่เอกสาร</div>
                  <div style={{ position: "absolute", top: 0, left: "146mm", whiteSpace: "nowrap" }}>{documentNumber}</div>
                  <div style={{ position: "absolute", top: "6.4mm", left: "146mm" }}>{printDateShortBE(date)}</div>
                </>
              ) : (
                <>
                  {/* เลขที่ของระบบยาวกว่าของโปรแกรมเดิม (J1-202609-0019 กับ J1S2609019) จึงขยับซ้ายกว่าฟอร์มเดิมเล็กน้อยไม่ให้ล้นกรอบ */}
                  <div style={{ position: "absolute", top: 0, right: "40mm" }}>เลขที่เอกสาร</div>
                  <div style={{ position: "absolute", top: 0, left: "161mm", whiteSpace: "nowrap" }}>{documentNumber}</div>
                  <div style={{ position: "absolute", top: "6.4mm", right: "40mm" }}>วันที่</div>
                  <div style={{ position: "absolute", top: "6.4mm", left: "161mm" }}>{printDateShortBE(date)}</div>
                </>
              )}
            </div>

            {/* ตาราง: หัวคอลัมน์ + ตัวตารางสูงตายตัว */}
            <div style={{ position: "relative", width: `${BOX_WIDTH}mm`, marginTop: "2.5mm", borderTop: LINE, borderLeft: LINE, borderRight: LINE, fontSize: BODY_FONT }}>
              <div style={{ position: "relative", height: `${HEAD_H}mm`, borderBottom: LINE }}>
                {columnRules(HEAD_H)}
                {["No.", "รหัสสินค้า/รายละเอียด", "จำนวน", "หน่วยละ", "รวม"].map((h, i) => (
                  <div key={h} style={{
                    position: "absolute", top: 0, left: `${colLeft(i)}mm`, width: `${COLS[i]}mm`, height: `${HEAD_H}mm`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    letterSpacing: h === "รวม" ? "0.35em" : undefined,
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
                  return (
                    <div key={r.key}>
                      <div style={cell(0, { textAlign: "center" })}>{pageIdx * STORE_SLIP_ROWS_PER_PAGE + i + 1}</div>
                      <div style={cell(1, { paddingLeft: "3mm" })}>{`${r.code} ${r.name}`}</div>
                      <div style={cell(2, { display: "flex" })}>
                        <span style={{ width: "30.5mm", textAlign: "right", flexShrink: 0 }}>{money(r.qty)}</span>
                        <span style={{ marginLeft: "1.6mm", overflow: "hidden" }}>{r.unit}</span>
                      </div>
                      <div style={cell(3, { textAlign: "right", paddingRight: "3mm" })}>{money(r.unitCost)}</div>
                      <div style={cell(4, { textAlign: "right", paddingRight: "3.2mm" })}>{money(round2(r.qty * r.unitCost))}</div>
                    </div>
                  );
                })}
              </div>

              {last ? (
                // กล่องรวม / หมายเหตุเพิ่มเติม / ช่องเซ็น — หน้าสุดท้ายเท่านั้น
                <div style={{ position: "relative", height: "70mm", borderBottom: LINE }}>
                  <div style={{ position: "absolute", top: 0, left: `${colLeft(4)}mm`, width: `${COLS[4]}mm`, height: "12.5mm", borderLeft: LINE, borderBottom: LINE, boxSizing: "border-box" }} />
                  <div style={{ position: "absolute", top: "3.6mm", left: `${colLeft(4)}mm`, width: `${COLS[4]}mm`, textAlign: "right", paddingRight: "3.2mm", boxSizing: "border-box" }}>{money(total)}</div>
                  <div style={{ position: "absolute", top: "3.6mm", right: `${COLS[4] + 3}mm`, letterSpacing: "0.35em" }}>รวม</div>
                  {variant === "receipt" && (
                    <div style={{ position: "absolute", top: "3.6mm", left: "3mm", whiteSpace: "pre" }}>
                      {"ปรับปรุงต้นทุนโดยโปรแกรม       :          0.00"}
                    </div>
                  )}
                  <div style={{ position: "absolute", top: variant === "receipt" ? "9mm" : "10.5mm", left: "3mm", right: `${COLS[4] + 2}mm`, whiteSpace: "pre-wrap" }}>
                    {`หมายเหตุเพิ่มเติม : ${extraRemark}`}
                  </div>
                  <div style={{ position: "absolute", top: "36.5mm", left: variant === "issue" ? "5.5mm" : "3mm", whiteSpace: "pre" }}>
                    {variant === "issue"
                      ? "ผู้บันทึกใบเบิก___________  __/___/___ผู้จัดวัสดุ__________ __/__/___ผู้จ่ายวัสดุ    __________ __/__/__"
                      : "ผู้บันทึกใบรับคืน _______________ __/__/__          ผู้รับวัสดุ (สโตร์) ___________ __/__/__"}
                  </div>
                  <div style={{ position: "absolute", top: "56mm", left: variant === "issue" ? "5.5mm" : "3mm", whiteSpace: "pre" }}>
                    {variant === "issue"
                      ? "ผู้รับวัสดุ    __________________      วันที่ ___/___/___"
                      : "ผู้คืนวัสดุ   __________________  วันที่ ___/___/___"}
                  </div>
                </div>
              ) : (
                // หน้าที่ยังไม่จบ ฟอร์มเดิมเหลือตอเส้นของกล่องรวมไว้ใต้ตาราง
                <div style={{ position: "relative", height: "4mm", marginLeft: "-1.3px", marginRight: "-1.3px" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, height: "4mm", borderLeft: LINE }} />
                  <div style={{ position: "absolute", left: `${colLeft(4)}mm`, top: 0, height: "4mm", borderLeft: LINE }} />
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
