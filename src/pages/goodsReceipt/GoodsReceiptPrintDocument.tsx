import type { GoodsReceipt } from "../../lib/goodsReceipt";

/**
 * ⚠️ **ใบพิมพ์ชั่วคราว — รอฟอร์มจริง** (เช่นเดียวกับใบสั่งซื้อ ดูหมายเหตุเต็มใน
 * `src/pages/purchaseOrder/PurchaseOrderPrintDocument.tsx`)
 *
 * เจ้าของจะส่งฟอร์มกระดาษจริงมาให้ทีหลัง ไฟล์นี้พิมพ์ข้อมูลออกมาครบแต่ไม่ได้ลอกหน้าตาฟอร์มใด ๆ
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n`
 */
export function GoodsReceiptPrintDocument({ doc }: { doc: GoodsReceipt }) {
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "4px 6px", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, fontWeight: 700, textAlign: "center", background: "#eee" };
  const resultLabel: Record<string, string> = { Pending: "รอตรวจ", Passed: "ผ่าน", Rejected: "ไม่ผ่าน" };

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif", fontSize: "11px", color: "#000" }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: "16px", fontWeight: 700 }}>ใบตรวจรับสินค้า</div>
        <div style={{ fontSize: "10px" }}>GOODS RECEIPT</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={cell}><b>เลขที่:</b> {doc.documentNumber || doc.id}</td>
            <td style={cell}><b>วันที่รับของ:</b> {doc.receivedDate || "—"}</td>
            <td style={cell}><b>อ้างอิงใบสั่งซื้อ:</b> {doc.purchaseOrderId}</td>
          </tr>
          <tr>
            <td style={cell}><b>ผู้ขาย:</b> {doc.vendorName || "—"}</td>
            <td style={cell}><b>เลขที่ใบส่งของ:</b> {doc.deliveryNoteRef || "—"}</td>
            <td style={cell}><b>สถานที่รับของ:</b> {doc.receivedLocation || "—"}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...head, width: 28 }}>ที่</th>
            <th style={{ ...head, width: 90 }}>รหัสสินค้า</th>
            <th style={head}>รายละเอียด</th>
            <th style={{ ...head, width: 50 }}>หน่วย</th>
            <th style={{ ...head, width: 60 }}>สั่ง</th>
            <th style={{ ...head, width: 60 }}>รับจริง</th>
            <th style={{ ...head, width: 60 }}>ผลตรวจ</th>
            <th style={{ ...head, width: 110 }}>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={l.id}>
              <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
              <td style={cell}>{l.productCode}</td>
              <td style={cell}>
                {l.description}
                {l.subDetails.map((sd, j) => <div key={j} style={{ paddingLeft: 12, fontSize: "10px" }}>{sd}</div>)}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>{l.unit}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.qtyOrdered ?? ""}</td>
              <td style={{ ...cell, textAlign: "right" }}>{l.qtyReceived ?? ""}</td>
              <td style={{ ...cell, textAlign: "center" }}>{resultLabel[l.result] ?? l.result}</td>
              <td style={cell}>{l.remark}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {doc.remarks ? <div style={{ marginTop: 8 }}><b>หมายเหตุ:</b> {doc.remarks}</div> : null}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 28 }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", textAlign: "center", paddingTop: 20 }}>
              <div>....................................................</div>
              <div>ผู้รับของ {doc.receivedBy ? `(${doc.receivedBy})` : ""}</div>
            </td>
            <td style={{ width: "50%", textAlign: "center", paddingTop: 20 }}>
              <div>....................................................</div>
              <div>ผู้ตรวจรับ {doc.inspectedBy ? `(${doc.inspectedBy})` : ""}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
