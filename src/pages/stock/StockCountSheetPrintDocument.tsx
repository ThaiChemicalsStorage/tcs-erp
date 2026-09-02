import type { Product, ProductCategory } from "../../lib/products";
import type { CompanyHeaderInfo } from "../../lib/storage";
import { PrintLetterhead } from "../../components/PrintLetterhead";
import { printDate, printText } from "../../lib/printFormat";

/**
 * ใบนับสต๊อกสินค้า — เจ้าของสั่ง 2026-09-02:
 * *"สามารถปริ้นใบ Stock สินค้าออกไปเช็คกับ Stock จริงได้"*
 *
 * เป็น**ใบสำหรับเดินนับของ** ไม่ใช่รายงานยอดคงเหลือ ความต่างอยู่ที่สองคอลัมน์ท้ายตารางซึ่งพิมพ์ออกมา
 * เป็นช่องว่างเสมอ: "นับจริง" ให้เขียนตัวเลขที่นับได้ด้วยปากกา และ "ผลต่าง" ให้เขียนส่วนต่าง
 * ระบบไม่เติมค่าให้ทั้งสองช่องโดยตั้งใจ — ถ้าเติม คนนับจะเผลออ่านตัวเลขระบบแล้วลอกลงไปโดยไม่ได้นับจริง
 * ซึ่งทำลายจุดประสงค์ทั้งหมดของการนับสต๊อก
 *
 * ตัวเลขคงเหลือของระบบ**ยังพิมพ์อยู่** เพราะคนนับต้องรู้ว่ากำลังหาของกี่ชิ้นถึงจะรู้ว่าควรค้นต่อหรือพอ
 * ถ้าจะปิดตัวเลขนั้นให้เป็นการนับแบบไม่รู้ยอด (blind count) ต้องเป็นตัวเลือกที่เจ้าของสั่งอีกที
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ตามนโยบายใบพิมพ์ใน docs/CLAUDE.md
 */
export function StockCountSheetPrintDocument({ products, categories, companyHeader, printedAt, countedBy }: {
  /** เรียงและกรองมาแล้วจากหน้าสต๊อก — ใบนี้พิมพ์ตามที่เห็นบนจอ ไม่จัดเรียงใหม่เอง */
  products: Product[];
  categories: ProductCategory[];
  companyHeader: CompanyHeaderInfo;
  /** วันที่พิมพ์ รูปแบบ YYYY-MM-DD */
  printedAt: string;
  /** ชื่อคนที่กดพิมพ์ — เติมให้ในช่อง "ผู้นับ" เป็นค่าตั้งต้น แก้ด้วยปากกาได้ */
  countedBy: string;
}) {
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "3px 5px", verticalAlign: "middle" };
  const headCell: React.CSSProperties = { ...cell, textAlign: "center", fontWeight: 700 };

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif", fontSize: "11px", color: "#000" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>

      {/* หัวจดหมายกับหัวเรื่องอยู่ใน thead/tfoot ของตารางนอกสุด เพื่อให้พิมพ์ซ้ำทุกหน้า —
          ใบนับของจริงมักยาวหลายแผ่น แผ่นที่หลุดออกจากแฟ้มต้องบอกได้ว่าเป็นของบริษัทไหน วันไหน */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              <PrintLetterhead
                companyHeader={companyHeader}
                docLabel="STOCK COUNT"
                rightMeta={[
                  { label: "วันที่พิมพ์", value: printDate(printedAt) },
                  { label: "จำนวนรายการ", value: String(products.length) },
                ]}
              />
              <h1 style={{ textAlign: "center", fontSize: "15px", fontWeight: 700, margin: "0 0 8px" }}>ใบนับสต๊อกสินค้า</h1>
            </td>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                <colgroup>
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "33%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={headCell}>ลำดับ</th>
                    <th style={headCell}>รหัสสินค้า</th>
                    <th style={headCell}>ชื่อสินค้า</th>
                    <th style={headCell}>หมวดหมู่</th>
                    <th style={headCell}>หน่วย</th>
                    <th style={headCell}>ยอดในระบบ</th>
                    <th style={headCell}>นับจริง</th>
                    <th style={headCell}>ผลต่าง</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => (
                    <tr key={p.id}>
                      <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                      <td style={cell}>{printText(p.code)}</td>
                      <td style={cell}>{printText(p.name)}</td>
                      <td style={cell}>{printText(categoryName(p.categoryId))}</td>
                      <td style={{ ...cell, textAlign: "center" }}>{printText(p.unit)}</td>
                      <td style={{ ...cell, textAlign: "right" }}>{p.stockQty.toLocaleString("en-US")}</td>
                      {/* สองช่องนี้เว้นว่างเสมอ — ดูคอมเมนต์หัวไฟล์ */}
                      <td style={{ ...cell, height: "18px" }} />
                      <td style={cell} />
                    </tr>
                  ))}
                </tbody>
              </table>

              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "22px", breakInside: "avoid" }}>
                <tbody>
                  <tr>
                    {[["ผู้นับ", countedBy], ["ผู้ตรวจสอบ", ""], ["ผู้อนุมัติ", ""]].map(([label, value]) => (
                      <td key={label} style={{ border: "none", width: "33.33%", padding: "0 10px", textAlign: "center", verticalAlign: "bottom" }}>
                        <div style={{ height: "26px" }} />
                        <div style={{ borderBottom: "1px solid #000" }} />
                        <p style={{ margin: "2px 0 0" }}>{label}{value ? `: ${value}` : ""}</p>
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
              <p style={{ textAlign: "right", margin: "6px 0 0", fontSize: "9px" }}>
                ยอดในระบบ ณ วันที่พิมพ์ {printDate(printedAt)}
              </p>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
