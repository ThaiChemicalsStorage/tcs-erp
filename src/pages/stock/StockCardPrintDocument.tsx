import type { Product } from "../../lib/products";
import type { StockMovement } from "../../lib/stock";
import type { CompanyHeaderInfo } from "../../lib/storage";
import { PrintLetterhead } from "../../components/PrintLetterhead";
import { printDate, printText } from "../../lib/printFormat";
import { STOCK_MOVEMENT_KIND_LABELS } from "../../lib/stock";
import { PrintPageFrame } from "../../components/PrintPageFrame";

/**
 * การ์ดสต๊อก (Stock Card) ของสินค้าหนึ่งตัว — เจ้าของสั่ง 2026-09-03 ให้มี *"การ์ด stock"* คู่กับ
 * ทะเบียนภาษีซื้อ/เจ้าหนี้ที่ใบรับสินค้าตั้งหนี้ให้
 *
 * รูปแบบตามการ์ดสต๊อกทางบัญชี: แต่ละแถวคือหนึ่งการเคลื่อนไหว แยกฝั่ง **รับ** / **จ่าย** เป็น
 * จำนวน · ราคา/หน่วย · มูลค่า แล้วปิดด้วย **คงเหลือ** จำนวนและมูลค่า (ถัวเฉลี่ยเคลื่อนที่ — ดู
 * stockHandler.ts) · แถวที่บันทึกก่อน 2026-09-03 ไม่มีต้นทุน พิมพ์ขีดกลางในช่องราคา/มูลค่า
 * แต่จำนวนยังครบ — ไม่ได้ทำ migration
 *
 * รับ movement เรียงจาก**เก่าไปใหม่** (หน้าจอเรียงกลับด้าน ผู้เรียกต้อง reverse ให้ก่อน) เพราะการ์ด
 * อ่านจากบนลงล่างตามเวลา
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ตามนโยบายใบพิมพ์ใน docs/CLAUDE.md
 */
export function StockCardPrintDocument({ product, movements, companyHeader, printedAt }: {
  product: Product;
  movements: StockMovement[];
  companyHeader: CompanyHeaderInfo;
  printedAt: string;
}) {
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "3px 5px", verticalAlign: "middle" };
  const headCell: React.CSSProperties = { ...cell, textAlign: "center", fontWeight: 700 };
  const num = (n: number | undefined, digits = 2) => (n === undefined || n === null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }));
  const qty = (n: number) => n.toLocaleString("en-US");
  const avgCost = product.avgCost ?? 0;

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif", fontSize: "11px", color: "#000" }}>
      <PrintPageFrame size="A4 landscape">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              <PrintLetterhead
                companyHeader={companyHeader}
                docLabel="STOCK CARD"
                rightMeta={[
                  { label: "วันที่พิมพ์", value: printDate(printedAt) },
                  { label: "รหัสสินค้า", value: printText(product.code) },
                ]}
              />
              <h1 style={{ textAlign: "center", fontSize: "15px", fontWeight: 700, margin: "0 0 6px" }}>การ์ดสต๊อกสินค้า</h1>
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6px" }}>
                <tbody>
                  <tr>
                    <td style={{ border: "none", padding: "1px 4px", fontWeight: 700, width: "90px" }}>ชื่อสินค้า:</td>
                    <td style={{ border: "none", padding: "1px 4px" }}>{printText(product.name)}</td>
                    <td style={{ border: "none", padding: "1px 4px", fontWeight: 700, width: "70px" }}>หน่วย:</td>
                    <td style={{ border: "none", padding: "1px 4px", width: "80px" }}>{printText(product.unit)}</td>
                    <td style={{ border: "none", padding: "1px 4px", fontWeight: 700, width: "110px" }}>คงเหลือปัจจุบัน:</td>
                    <td style={{ border: "none", padding: "1px 4px", width: "90px", textAlign: "right" }}>{qty(product.stockQty)}</td>
                    <td style={{ border: "none", padding: "1px 4px", fontWeight: 700, width: "110px" }}>ต้นทุนเฉลี่ย/หน่วย:</td>
                    <td style={{ border: "none", padding: "1px 4px", width: "90px", textAlign: "right" }}>{num(avgCost)}</td>
                    <td style={{ border: "none", padding: "1px 4px", fontWeight: 700, width: "90px" }}>มูลค่าคงเหลือ:</td>
                    <td style={{ border: "none", padding: "1px 4px", width: "100px", textAlign: "right" }}>{num(Math.max(0, product.stockQty) * avgCost)}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <thead>
                  <tr>
                    <th style={headCell} rowSpan={2}>วันที่</th>
                    <th style={headCell} rowSpan={2}>เอกสารอ้างอิง / รายการ</th>
                    <th style={headCell} rowSpan={2}>แผนก / ทีม</th>
                    <th style={headCell} colSpan={3}>รับ</th>
                    <th style={headCell} colSpan={3}>จ่าย</th>
                    <th style={headCell} colSpan={2}>คงเหลือ</th>
                  </tr>
                  <tr>
                    <th style={headCell}>จำนวน</th><th style={headCell}>ราคา/หน่วย</th><th style={headCell}>มูลค่า</th>
                    <th style={headCell}>จำนวน</th><th style={headCell}>ราคา/หน่วย</th><th style={headCell}>มูลค่า</th>
                    <th style={headCell}>จำนวน</th><th style={headCell}>มูลค่า</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 && (
                    <tr><td style={{ ...cell, textAlign: "center" }} colSpan={11}>ยังไม่มีการเคลื่อนไหว</td></tr>
                  )}
                  {movements.map((m) => {
                    const inbound = m.delta > 0;
                    const q = Math.abs(m.delta);
                    const chargeTo = [m.departmentName, m.teamName].filter(Boolean).join(" / ");
                    return (
                      <tr key={m.id}>
                        <td style={{ ...cell, whiteSpace: "nowrap" }}>{printDate(m.createdAt.slice(0, 10))}</td>
                        <td style={cell}>
                          {m.sourceLabel ? `${m.sourceLabel} — ` : ""}{STOCK_MOVEMENT_KIND_LABELS[m.kind]}{m.reason ? ` · ${m.reason}` : ""}
                        </td>
                        <td style={cell}>{printText(chargeTo)}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{inbound ? qty(q) : ""}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{inbound ? num(m.unitCost) : ""}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{inbound ? num(m.amount) : ""}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{inbound ? "" : qty(q)}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{inbound ? "" : num(m.unitCost)}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{inbound ? "" : num(m.amount)}</td>
                        <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{qty(m.balanceAfter)}</td>
                        <td style={{ ...cell, textAlign: "right" }}>{num(m.balanceValueAfter)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              <p style={{ textAlign: "right", margin: "6px 0 0", fontSize: "9px" }}>
                ต้นทุนถัวเฉลี่ยเคลื่อนที่ · ยอด ณ วันที่พิมพ์ {printDate(printedAt)}
              </p>
            </td>
          </tr>
        </tfoot>
      </table>
      </PrintPageFrame>
    </div>
  );
}
