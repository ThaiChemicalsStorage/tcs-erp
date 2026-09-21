import type { PurchaseOrder } from "../../lib/purchaseOrder";
import { fmt } from "../../lib/quotes";
import { purchaseOrderTotals, purchaseOrderLineTotal } from "../../lib/purchaseOrder";
import { printDate, printText, printNumber } from "../../lib/printFormat";
import { PrintPageFrame } from "../../components/PrintPageFrame";

/**
 * ⚠️ **ใบพิมพ์ชั่วคราว — รอฟอร์มจริง**
 *
 * เจ้าของงานจะส่งฟอร์มกระดาษจริงของฝ่ายจัดซื้อ (FM-PU-xx) มาให้ทีหลัง ไฟล์นี้จึงเป็นเลย์เอาต์
 * เรียบ ๆ ที่พิมพ์ข้อมูลออกมาได้ครบ **ไม่ใช่การลอกฟอร์มจริง** — จงใจไม่แต่งหน้าตาเลียนแบบเอกสาร
 * ที่ยังไม่เคยเห็น เพราะ DESIGN.md ระบุว่าฟอร์มกระดาษจริงคือผู้มีอำนาจตัดสินหน้าตาของใบพิมพ์
 * ไม่ใช่ระบบดีไซน์ของแอป การเดาแล้วให้ดู "เหมือนฟอร์ม" จะทำให้แยกไม่ออกว่าอันไหนยืนยันแล้ว
 *
 * เมื่อได้ฟอร์มจริงมา: แทนที่ทั้งไฟล์นี้ ใช้ `PrintLetterhead` ถ้าฟอร์มมีหัวจดหมายบริษัท
 * และใส่รหัสฟอร์มที่ `<tfoot>` (เบราว์เซอร์พิมพ์ tfoot ซ้ำทุกหน้า — วิธีเดียวที่ทำ footer หลายหน้าได้)
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n` — เอกสารธุรกิจที่พิมพ์ออกไปต้องไม่เปลี่ยนภาษา
 * ตามการตั้งค่าของคนกดพิมพ์ (ดู docs/CLAUDE.md)
 */
export function PurchaseOrderPrintDocument({ doc }: { doc: PurchaseOrder }) {
  // ยอดทุกตัวมาจากตัวคิดตัวเดียวกับหน้าแก้ไข (purchaseOrderTotals) — เดิมสูตรถูกเขียนซ้ำสองที่
  const totals = purchaseOrderTotals(doc);

  const cell: React.CSSProperties = { border: "1px solid #000", padding: "4px 6px", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, fontWeight: 700, textAlign: "center", background: "#eee" };
  /** พื้นที่เหนือเส้นลงนาม — สูงคงที่ 28px เท่าของเดิม ให้ชื่อนั่งชิดเส้นเหมือนคนเซ็นชื่อบนเส้น */
  const signatureArea: React.CSSProperties = { height: 28, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" };

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif", fontSize: "11px", color: "#000" }}>
      <PrintPageFrame>

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: "16px", fontWeight: 700 }}>ใบสั่งซื้อ</div>
        <div style={{ fontSize: "10px" }}>PURCHASE ORDER</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={cell}><b>เลขที่:</b> {doc.documentNumber || doc.id}</td>
            <td style={cell}><b>วันที่:</b> {printDate(doc.orderDate)}</td>
            <td style={cell}><b>อ้างอิงใบขอซื้อ:</b> {printText(doc.purchaseRequestId)}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={2}><b>ผู้ขาย:</b> {printText(doc.vendorName)}</td>
            <td style={cell}><b>รหัสงาน:</b> {printText(doc.jobCode)}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={2}><b>ที่อยู่:</b> {printText(doc.vendorAddress)}</td>
            <td style={cell}><b>เลขผู้เสียภาษี:</b> {printText(doc.vendorTaxId)}</td>
          </tr>
          <tr>
            <td style={cell}><b>ผู้ติดต่อ:</b> {printText(doc.vendorContact)}</td>
            <td style={cell}><b>โทร:</b> {printText(doc.vendorPhone)}</td>
            <td style={cell}><b>เครดิต:</b> {doc.creditDays !== null ? `${doc.creditDays} วัน` : "-"}</td>
          </tr>
          <tr>
            <td style={cell}><b>วันที่ต้องการรับของ:</b> {printDate(doc.neededByDate)}</td>
            <td style={cell}><b>ขนส่งโดย:</b> {printText(doc.shippingMethod)}</td>
            <td style={cell}><b>สถานที่ส่งของ:</b> {printText(doc.deliveryLocation)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...head, width: 28 }}>ที่</th>
            <th style={{ ...head, width: 90 }}>รหัสสินค้า</th>
            <th style={head}>รายละเอียด</th>
            <th style={{ ...head, width: 55 }}>หน่วย</th>
            <th style={{ ...head, width: 55 }}>จำนวน</th>
            <th style={{ ...head, width: 75 }}>ราคา/หน่วย</th>
            <th style={{ ...head, width: 60 }}>ส่วนลด</th>
            <th style={{ ...head, width: 85 }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {/* บรรทัดที่ถูกยกเลิก (2026-09-21) — **ยังพิมพ์อยู่** แต่ขีดทับ เพราะผู้ขายถือใบเดิมและต้อง
              เห็นว่าอะไรถูกถอน · ยอดของบรรทัดยังโชว์ให้เทียบได้ว่าที่หายไปคือเท่าไร แต่ไม่ถูกคิดใน
              ยอดรวม (กรองอยู่ใน purchaseOrderSubtotal ที่เดียว) */}
          {doc.lines.map((l, i) => (
            <tr key={l.id} style={l.cancelled ? { color: "#666", textDecoration: "line-through" } : undefined}>
              <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
              <td style={cell}>{printText(l.productCode)}</td>
              <td style={cell}>
                {l.description}
                {l.subDetails.map((sd, j) => (
                  <div key={j} style={{ paddingLeft: 12, fontSize: "10px" }}>{sd}</div>
                ))}
                {l.cancelled && (
                  <div style={{ paddingLeft: 12, fontSize: "10px", textDecoration: "none" }}>ยกเลิก: {printText(l.cancelRemark)}</div>
                )}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>{printText(l.unit)}</td>
              <td style={{ ...cell, textAlign: "right" }}>{printNumber(l.qty)}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.unitPrice !== null ? fmt(l.unitPrice) : "-"}</td>
              {/* ส่วนลดพิมพ์ตามที่กรอก (10% หรือ 500) ไม่ใช่ยอดที่คิดแล้ว — คนอ่านใบต้องเห็นเงื่อนไข */}
              <td style={{ ...cell, textAlign: "right" }}>
                {l.discount ? `${fmt(l.discount)}${l.discountMode === "amount" ? "" : "%"}` : "-"}
              </td>
              <td style={{ ...cell, textAlign: "right" }}>{fmt(purchaseOrderLineTotal(l))}</td>
            </tr>
          ))}
          {doc.lines.some((l) => l.cancelled) && (
            <tr>
              <td style={{ ...cell, fontSize: "10px" }} colSpan={8}>รายการที่ขีดฆ่าถูกยกเลิก ไม่รวมในยอดสุทธิ</td>
            </tr>
          )}
          <tr>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }} colSpan={7}>รวมเป็นเงิน</td>
            <td style={{ ...cell, textAlign: "right" }}>{fmt(totals.subtotal)}</td>
          </tr>
          {totals.discountAmt > 0 && (
            <tr>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700 }} colSpan={7}>
                ส่วนลดท้ายใบ{doc.discountMode === "amount" ? "" : ` ${fmt(doc.discount ?? 0)}%`}
              </td>
              <td style={{ ...cell, textAlign: "right" }}>-{fmt(totals.discountAmt)}</td>
            </tr>
          )}
          <tr>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }} colSpan={7}>ภาษีมูลค่าเพิ่ม {doc.vatRate ?? 0}%</td>
            <td style={{ ...cell, textAlign: "right" }}>{fmt(totals.vatAmt)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }} colSpan={7}>ยอดสุทธิ</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{fmt(totals.total)}</td>
          </tr>
        </tbody>
      </table>

      {doc.remarks ? <div style={{ marginTop: 8 }}><b>หมายเหตุ:</b> {doc.remarks}</div> : null}
      {doc.revisionNote ? <div style={{ marginTop: 6 }}><b>หมายเหตุการแก้ไข:</b> {doc.revisionNote}</div> : null}

      {/* กันบล็อกลายเซ็นถูกหั่นคร่อมหน้า — ดู PrintDocument.tsx ของใบเสนอราคา */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 28, breakInside: "avoid" }}>
        <tbody>
          <tr>
            {/* เจ้าของสั่ง 2026-09-18: ใบสั่งซื้อ "ไม่ต้องมีลายเซ็นให้ขึ้นชื่อที่กรอกในช่องไปเลยแล้วชื่อวงเล็บ
                ก็เอาออกไปเลย" — จึงถอด <PrintSignatureLine> (รูปลายเซ็นจากโปรไฟล์) ออกทั้งสองช่อง แล้ววาง
                ชื่อที่พิมพ์ไว้ในเอกสารไว้เหนือเส้นแทน ส่วนป้ายใต้เส้นเหลือแต่คำว่าผู้สั่งซื้อ/ผู้อนุมัติ
                กล่องสูง 28px คงไว้เท่าของเดิมเพื่อไม่ให้แถวยุบเมื่อยังไม่ได้กรอกชื่อ (ใบร่างที่พิมพ์ไปเซ็นมือ) */}
            <td style={{ width: "50%", textAlign: "center", paddingTop: 20 }}>
              <div style={signatureArea}>{(doc.orderedBy ?? "").trim()}</div>
              <div>....................................................</div>
              <div>ผู้สั่งซื้อ</div>
            </td>
            <td style={{ width: "50%", textAlign: "center", paddingTop: 20 }}>
              <div style={signatureArea}>{(doc.approvedBy ?? "").trim()}</div>
              <div>....................................................</div>
              <div>ผู้อนุมัติ</div>
            </td>
          </tr>
        </tbody>
      </table>
      </PrintPageFrame>
    </div>
  );
}
