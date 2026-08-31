import type { PurchaseOrder } from "../../lib/purchaseOrder";
import { fmt } from "../../lib/quotes";
import { purchaseOrderTotals, purchaseOrderLineTotal } from "../../lib/purchaseOrder";

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

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif", fontSize: "11px", color: "#000" }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: "16px", fontWeight: 700 }}>ใบสั่งซื้อ</div>
        <div style={{ fontSize: "10px" }}>PURCHASE ORDER</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={cell}><b>เลขที่:</b> {doc.documentNumber || doc.id}</td>
            <td style={cell}><b>วันที่:</b> {doc.orderDate || "—"}</td>
            <td style={cell}><b>อ้างอิงใบขอซื้อ:</b> {doc.purchaseRequestId || "—"}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={2}><b>ผู้ขาย:</b> {doc.vendorName || "—"}</td>
            <td style={cell}><b>รหัสงาน:</b> {doc.jobCode || "—"}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={2}><b>ที่อยู่:</b> {doc.vendorAddress || "—"}</td>
            <td style={cell}><b>เลขผู้เสียภาษี:</b> {doc.vendorTaxId || "—"}</td>
          </tr>
          <tr>
            <td style={cell}><b>ผู้ติดต่อ:</b> {doc.vendorContact || "—"}</td>
            <td style={cell}><b>โทร:</b> {doc.vendorPhone || "—"}</td>
            <td style={cell}><b>เครดิต:</b> {doc.creditDays !== null ? `${doc.creditDays} วัน` : "—"}</td>
          </tr>
          <tr>
            <td style={cell}><b>วันที่ต้องการรับของ:</b> {doc.neededByDate || "—"}</td>
            <td style={cell}><b>ขนส่งโดย:</b> {doc.shippingMethod || "—"}</td>
            <td style={cell}><b>สถานที่ส่งของ:</b> {doc.deliveryLocation || "—"}</td>
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
          {doc.lines.map((l, i) => (
            <tr key={l.id}>
              <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
              <td style={cell}>{l.productCode}</td>
              <td style={cell}>
                {l.description}
                {l.subDetails.map((sd, j) => (
                  <div key={j} style={{ paddingLeft: 12, fontSize: "10px" }}>{sd}</div>
                ))}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>{l.unit}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.qty ?? ""}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.unitPrice !== null ? fmt(l.unitPrice) : ""}</td>
              {/* ส่วนลดพิมพ์ตามที่กรอก (10% หรือ 500) ไม่ใช่ยอดที่คิดแล้ว — คนอ่านใบต้องเห็นเงื่อนไข */}
              <td style={{ ...cell, textAlign: "right" }}>
                {l.discount ? `${fmt(l.discount)}${l.discountMode === "amount" ? "" : "%"}` : ""}
              </td>
              <td style={{ ...cell, textAlign: "right" }}>{fmt(purchaseOrderLineTotal(l))}</td>
            </tr>
          ))}
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

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 28 }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", textAlign: "center", paddingTop: 20 }}>
              <div>....................................................</div>
              <div>ผู้สั่งซื้อ {doc.orderedBy ? `(${doc.orderedBy})` : ""}</div>
            </td>
            <td style={{ width: "50%", textAlign: "center", paddingTop: 20 }}>
              <div>....................................................</div>
              <div>ผู้อนุมัติ {doc.approvedBy ? `(${doc.approvedBy})` : ""}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
