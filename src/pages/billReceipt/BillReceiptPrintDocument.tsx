import type { BillReceipt } from "../../lib/billReceipt";
import { fmt } from "../../lib/quotes";

/**
 * ⚠️ **ใบพิมพ์ชั่วคราว — รอฟอร์มจริง** (ดูหมายเหตุเต็มใน
 * `src/pages/purchaseOrder/PurchaseOrderPrintDocument.tsx`) · ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n`
 */
export function BillReceiptPrintDocument({ doc }: { doc: BillReceipt }) {
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "4px 6px", verticalAlign: "top" };

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif", fontSize: "11px", color: "#000" }}>
      <style>{`@media print { @page { size: A4 portrait; margin: 12mm; } }`}</style>

      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ fontSize: "16px", fontWeight: 700 }}>ใบรับวางบิล</div>
        <div style={{ fontSize: "10px" }}>BILL RECEIPT</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={cell}><b>เลขที่:</b> {doc.documentNumber || doc.id}</td>
            <td style={cell}><b>วันที่รับวางบิล:</b> {doc.receivedDate || "—"}</td>
          </tr>
          <tr>
            <td style={cell}><b>ผู้ขาย:</b> {doc.vendorName || "—"}</td>
            <td style={cell}><b>อ้างอิงใบสั่งซื้อ:</b> {doc.purchaseOrderId}</td>
          </tr>
          <tr>
            <td style={cell}><b>เลขที่ใบแจ้งหนี้:</b> {doc.vendorInvoiceNo || "—"}</td>
            <td style={cell}><b>วันที่ใบแจ้งหนี้:</b> {doc.vendorInvoiceDate || "—"}</td>
          </tr>
          <tr>
            <td style={cell}><b>ยอดตามบิล:</b> {doc.billAmount !== null ? fmt(doc.billAmount) : "—"} บาท</td>
            <td style={cell}><b>กำหนดชำระ:</b> {doc.dueDate || "—"}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={2}><b>อ้างอิงใบตรวจรับ:</b> {doc.goodsReceiptId || "—"}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: 10, marginBottom: 6, fontWeight: 700 }}>เอกสารที่ได้รับ</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {doc.attachmentChecks.map((c) => (
            <tr key={c.key}>
              <td style={{ ...cell, width: 40, textAlign: "center" }}>{c.checked ? "✓" : ""}</td>
              <td style={cell}>{c.label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {doc.remarks ? <div style={{ marginTop: 8 }}><b>หมายเหตุ:</b> {doc.remarks}</div> : null}

      <div style={{ textAlign: "center", marginTop: 40 }}>
        <div>....................................................</div>
        <div>ผู้รับวางบิล {doc.receivedBy ? `(${doc.receivedBy})` : ""}</div>
      </div>
    </div>
  );
}
