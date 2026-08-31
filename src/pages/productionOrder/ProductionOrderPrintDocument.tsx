import type { ProductionOrder } from "../../lib/productionOrder";
import type { CompanyHeaderInfo } from "../../lib/storage";
import { formatQuoteDateThai } from "../../lib/quotes";

/**
 * ฟอร์มพิมพ์ใบสั่งผลิต — คัดตามฟอร์มจริง FM-PD-02 Rev.00 : 01/11/64
 * (reference/company/ใบสั่งผลิต(Production Order).pdf ซึ่ง gitignore ไว้)
 *
 * **2026-08-31: ทาบกับกระดาษตัวจริงแล้ว** ไฟล์อ้างอิงเป็น PDF ภาพสแกนไม่มีชั้นข้อความ เอกสาร
 * โมดูลจึงเคยบันทึกไว้ว่า "print layout has not been compared against the physical form" รอบนี้
 * เรนเดอร์ภาพออกมาดูแล้วเทียบทีละส่วน สิ่งที่ต่างจากกระดาษและถูกแก้รอบนี้:
 *   - กระดาษมีโลโก้บริษัทตัวใหญ่อยู่ทางขวาของบล็อกหัวเอกสาร (ทับเส้นบรรทัด) — เดิมไม่มีเลย
 *   - กระดาษมีแถวที่ไม่มีเลขลำดับแต่มีจำนวน/หน่วยของตัวเอง ("3 หน้าแปลน 20A | 2 ตัว" แล้ว
 *     "หน้าแปลน 50A | 3 ตัว", "หน้าแปลน 100A | 1 ตัว") — เดิมเก็บได้แค่ subDetails ที่เป็นข้อความล้วน
 *     จำนวนของแถวพวกนั้นจึงหายไปทั้งหมด ตอนนี้เป็น ProductionOrderLine.isContinuation
 *   - บรรทัดย่อยบนกระดาษไม่ได้เยื้องเข้ามา — เดิมเยื้อง 12px
 *   - ฟอนต์บนกระดาษเป็น serif เหมือนใบพิมพ์อื่นทุกใบในระบบ — เดิมไฟล์นี้ใช้ sans-serif อยู่ใบเดียว
 *
 * Always renders in Thai regardless of the user's UI language — same rule every other print
 * component in this app follows (see docs/CLAUDE.md's i18n policy): a printed business document
 * must not change language based on who happened to press print.
 *
 * A4 portrait. Sequence numbers are assigned over non-header rows only, so inserting a section
 * header ("ชิ้นส่วน") never renumbers the items below it.
 *
 * The whole document is wrapped in one outer table purely so the form code can live in <tfoot>:
 * browsers repeat thead/tfoot on every printed page of a table that spans pages, which is the only
 * way to get the footer onto page 2+ without a fixed-position element that would overlap content.
 * Same trick PrintDocument.tsx (Quotation) uses with <thead> for its letterhead.
 */

const MIN_BODY_ROWS = 18;

const FORM_CODE = "FM-PD-02 Rev.00 : 01/11/64";

/**
 * ตารางกว้าง 100% + `border-collapse: collapse` ทำให้เส้นขอบขวาสุดถูกวาดเลยขอบพื้นที่พิมพ์ของ A4
 * แล้วหายไปทั้งเส้น — พบตอนพิมพ์จริง 2026-08-31 (เลขที่ใบสั่งผลิตชิดขวาก็โดนตัดไปด้วย)
 * บทเรียนเดียวกับ CostControlPrintDocument.tsx (commit f1509da)
 */
const EDGE_GUARD = "2px";

export function ProductionOrderPrintDocument({ doc, companyHeader }: { doc: ProductionOrder; companyHeader: CompanyHeaderInfo }) {
  let seq = 0;
  // บรรทัดหัวข้อและบรรทัดต่อต่างก็ไม่กินเลขลำดับ — แทรกอย่างใดอย่างหนึ่งแล้วเลขข้างล่างไม่เลื่อน
  const rows = doc.lines.map((l) => ({ line: l, seq: l.isSectionHeader || l.isContinuation ? null : ++seq }));
  const padding = Math.max(0, MIN_BODY_ROWS - rows.length);

  const cell: React.CSSProperties = { border: "1px solid #000", padding: "3px 5px", verticalAlign: "top" };
  const headCell: React.CSSProperties = { ...cell, textAlign: "center", fontWeight: 700 };
  const shellCell: React.CSSProperties = { padding: 0, border: "none" };

  const signRow = (label: string, s: { name: string; date: string }) => (
    <tr>
      <td style={{ ...cell, width: "62%", height: "26px" }}>
        {label} : <span style={{ fontWeight: 400 }}>{s.name}</span>
      </td>
      <td style={{ ...cell, width: "38%" }}>
        วันที่ : <span style={{ fontWeight: 400 }}>{s.date ? formatQuoteDateThai(s.date) : ""}</span>
      </td>
    </tr>
  );

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif", fontSize: "11px", color: "#000", background: "#fff", paddingRight: EDGE_GUARD }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={shellCell}>
              <h1 style={{ textAlign: "center", fontSize: "15px", fontWeight: 700, margin: "0 0 6px" }}>
                ใบสั่งผลิต(Production Order)
              </h1>
              <p style={{ textAlign: "right", margin: "0 0 4px", fontWeight: 700 }}>
                เลขที่ใบสั่งผลิต : {doc.documentNumber || doc.id}
              </p>

              {/* หัวเอกสาร — ฟอร์มจริงเป็นบรรทัดมีเส้นใต้ ไม่ใช่ตาราง และมีโลโก้ทับอยู่ทางขวา
                  โลโก้วางแบบ absolute เพราะบนกระดาษมันคร่อมเส้นบรรทัดอยู่จริง ไม่ได้อยู่ในคอลัมน์ของตัวเอง */}
              <div style={{ position: "relative", borderTop: "1px solid #000", borderLeft: "1px solid #000", borderRight: "1px solid #000" }}>
                <img
                  src={companyHeader.logoDataUrl || "/logo.png"}
                  alt=""
                  style={{ position: "absolute", right: "10px", top: "2px", width: "62px", height: "62px", objectFit: "contain" }}
                />
                {[
                  ["ชื่อลูกค้า", doc.customerCompanyName],
                  ["รหัสงาน", doc.jobCode],
                  ["ชื่อสินค้า", doc.productName],
                  ["ชื่อพนักงานดูแล", doc.supervisorName],
                ].map(([label, value]) => (
                  <p key={label} style={{ margin: 0, padding: "3px 6px", borderBottom: "1px solid #000" }}>
                    {label} : {value}
                  </p>
                ))}
                <p style={{ margin: 0, padding: "3px 6px", borderBottom: "1px solid #000", display: "flex", gap: "40px" }}>
                  <span>วันที่เริ่มผลิต : {doc.startDate ? formatQuoteDateThai(doc.startDate) : ""}</span>
                  <span>กำหนดเสร็จ : {doc.dueDate ? formatQuoteDateThai(doc.dueDate) : ""}</span>
                </p>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "-1px" }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ ...headCell, width: "7%" }}>ลำดับที่</th>
                    <th rowSpan={2} style={{ ...headCell, width: "48%" }}>รายการ</th>
                    <th colSpan={2} style={headCell}>สั่งผลิต</th>
                    <th rowSpan={2} style={{ ...headCell, width: "25%" }}>หมายเหตุ</th>
                  </tr>
                  <tr>
                    <th style={{ ...headCell, width: "10%" }}>จำนวน</th>
                    <th style={{ ...headCell, width: "10%" }}>หน่วย</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ line, seq: n }) => (
                    <tr key={line.id}>
                      <td style={{ ...cell, textAlign: "center" }}>{n ?? ""}</td>
                      <td style={{ ...cell, fontWeight: line.isSectionHeader ? 700 : 400, textAlign: line.isSectionHeader ? "center" : "left" }}>
                        {line.description}
                        {/* บรรทัดย่อยใต้รายการหลัก — กระดาษจริงไม่ได้เยื้องเข้ามา ชิดซ้ายเท่ากับคำอธิบาย */}
                        {line.subDetails.map((sd, i) => (
                          <p key={i} style={{ margin: "1px 0 0", fontWeight: 400 }}>{sd}</p>
                        ))}
                      </td>
                      <td style={{ ...cell, textAlign: "center" }}>{line.qty ?? ""}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{line.unit}</td>
                      <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{line.remark}</td>
                    </tr>
                  ))}
                  {/* แถวว่างให้เต็มหน้า เหมือนฟอร์มกระดาษที่มีช่องว่างไว้เขียนเพิ่ม */}
                  {Array.from({ length: padding }, (_, i) => (
                    <tr key={`pad-${i}`}>
                      <td style={{ ...cell, height: "20px" }} />
                      <td style={cell} />
                      <td style={cell} />
                      <td style={cell} />
                      <td style={cell} />
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* หมายเหตุการแก้ไข — พิมพ์จริงตามที่ฝ่ายผลิตขอ ("สามารถดูในใบปริ้นได้") ซ่อนเมื่อว่าง */}
              {doc.revisionNote.trim() !== "" && (
                <div style={{ border: "1px solid #000", borderTop: "none", padding: "4px 6px", whiteSpace: "pre-wrap" }}>
                  <span style={{ fontWeight: 700 }}>หมายเหตุการแก้ไข :</span> {doc.revisionNote}
                </div>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "-1px", fontWeight: 700 }}>
                <tbody>
                  {signRow("ผู้สั่งผลิต", doc.orderedBy)}
                  {signRow("ผู้อนุมัติ", doc.approver)}
                  {signRow("ผู้ส่งมอบงาน", doc.deliveredBy)}
                  {signRow("ผู้ตรวจรับงาน", doc.receivedBy)}
                  {signRow("แผนกต้นทุน", doc.costDeptBy)}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td style={shellCell}>
              <p style={{ textAlign: "right", margin: "4px 0 0", fontSize: "10px" }}>{FORM_CODE}</p>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
