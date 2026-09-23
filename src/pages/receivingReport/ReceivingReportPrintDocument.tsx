import type { CompanyHeaderInfo } from "../../lib/storage";
import type { ReceivingReport, ReceivingReportCode } from "../../lib/receivingReport";
import { receivingReportTotals, receivedQtyOf, receivedAmountOf, outstandingQtyOf, receivingReportCodeOf } from "../../lib/receivingReport";
import { fmt } from "../../lib/quotes";
import { PrintLetterhead } from "../../components/PrintLetterhead";
import { PrintSignatureLine } from "../../components/PrintSignature";
import { printDate, printText } from "../../lib/printFormat";
import { PrintPageFrame } from "../../components/PrintPageFrame";

/**
 * ⚠️ **ใบพิมพ์ชั่วคราว — รอฟอร์มจริง** เหมือนใบสั่งซื้อ เจ้าของยังไม่ได้ส่งฟอร์มกระดาษของแผนกสโตร์มา
 * ไฟล์นี้จึงพิมพ์ข้อมูลออกมาให้ครบในเลย์เอาต์เรียบ ๆ ไม่ได้เดาหน้าตาฟอร์มจริง (ดู DESIGN.md)
 *
 * พิมพ์สองตาราง: รายการทั้งใบ (สั่ง/รับสะสม/ค้างรับ) และรอบการรับแต่ละรอบพร้อมเลขใบกำกับภาษี
 * ซึ่งเป็นชุดข้อมูลที่บัญชีต้องใช้กระทบยอดกับทะเบียนภาษีซื้อ
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n` — เอกสารธุรกิจที่พิมพ์ออกไปต้องไม่เปลี่ยนภาษาตาม
 * การตั้งค่าของคนกดพิมพ์ (ดู docs/CLAUDE.md)
 */
const PRINT_CODE_LABEL: Record<ReceivingReportCode, string> = {
  RR: "RR — ซื้อเชื่อ-วัตถุดิบ", RX: "RX — โรงงาน", RI: "RI — โครงการ",
};

export function ReceivingReportPrintDocument({ doc, companyHeader }: { doc: ReceivingReport; companyHeader: CompanyHeaderInfo }) {
  const totals = receivingReportTotals(doc);
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "4px 6px", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, fontWeight: 700, textAlign: "center", background: "#eee" };
  const right: React.CSSProperties = { ...cell, textAlign: "right" };

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif", fontSize: "11px", color: "#000" }}>
      <PrintPageFrame>

      <PrintLetterhead
        companyHeader={companyHeader}
        docLabel="RECEIVING REPORT"
        rightMeta={[
          { label: "เลขที่", value: doc.documentNumber || doc.id },
          { label: "วันที่พิมพ์", value: printDate(new Date().toISOString().slice(0, 10)) },
        ]}
      />
      <div style={{ textAlign: "center", margin: "0 0 10px" }}>
        <div style={{ fontSize: "16px", fontWeight: 700 }}>ใบรับสินค้า</div>
        {/* รหัสรับเข้า (2026-09-23) — ใบพิมพ์เป็นภาษาไทยเสมอ จึงใช้ชื่อไทยตรง ๆ ไม่ผ่าน t() */}
        <div style={{ fontSize: "12px" }}>{PRINT_CODE_LABEL[receivingReportCodeOf(doc)]}</div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={cell}><b>ใบสั่งซื้อ:</b> {doc.purchaseOrderNumber ? printText(doc.purchaseOrderNumber) : "ไม่มี (รับของโดยไม่มีใบสั่งซื้อ)"}</td>
            <td style={cell}><b>รหัสงาน:</b> {printText(doc.jobCode)}</td>
            <td style={cell}><b>สถานะ:</b> {doc.status === "Closed" ? "ปิดใบแล้ว" : "ยังรับไม่ครบ"}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={2}><b>ผู้ขาย:</b> {printText(doc.vendorName)}</td>
            <td style={cell}><b>เลขผู้เสียภาษี:</b> {printText(doc.vendorTaxId)}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={3}><b>ที่อยู่:</b> {printText(doc.vendorAddress)}</td>
          </tr>
          <tr>
            <td style={cell}><b>มูลค่าสั่งซื้อ:</b> {fmt(totals.orderedValue)}</td>
            <td style={cell}><b>รับแล้ว:</b> {fmt(totals.receivedValue)}</td>
            <td style={cell}><b>ค้างรับ:</b> {fmt(totals.outstandingValue)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={head}>ลำดับ</th>
            <th style={head}>รหัส</th>
            <th style={head}>รายการ</th>
            <th style={head}>หน่วย</th>
            <th style={head}>สั่ง</th>
            <th style={head}>รับแล้ว</th>
            <th style={head}>ค้างรับ</th>
            <th style={head}>ราคา/หน่วย</th>
            <th style={head}>มูลค่าที่รับ</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.length === 0 && <tr><td style={{ ...cell, textAlign: "center" }} colSpan={9}>ไม่มีรายการ</td></tr>}
          {doc.lines.map((line, i) => (
            <tr key={line.id}>
              <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
              <td style={cell}>{printText(line.productCode)}</td>
              <td style={cell}>
                {printText(line.description)}
                {line.subDetails.length > 0 && <div style={{ fontSize: "10px" }}>{line.subDetails.join(" · ")}</div>}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>{printText(line.unit)}</td>
              <td style={right}>{fmt(line.qtyOrdered)}</td>
              <td style={right}>{fmt(receivedQtyOf(doc, line.id))}</td>
              <td style={right}>{fmt(outstandingQtyOf(doc, line))}</td>
              <td style={right}>{fmt(line.unitPriceOrdered)}</td>
              <td style={right}>{fmt(receivedAmountOf(doc, line.id))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ fontWeight: 700, margin: "0 0 4px" }}>ประวัติการรับ</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head}>ครั้งที่</th>
            <th style={head}>วันที่รับ</th>
            <th style={head}>เลขที่ใบกำกับภาษี</th>
            <th style={head}>วันที่ใบกำกับ</th>
            <th style={head}>ผู้รับของ</th>
            <th style={head}>ก่อนภาษี</th>
            <th style={head}>ภาษี</th>
            <th style={head}>รวม</th>
          </tr>
        </thead>
        <tbody>
          {doc.batches.length === 0 && <tr><td style={{ ...cell, textAlign: "center" }} colSpan={8}>ยังไม่มีการรับของ</td></tr>}
          {doc.batches.map((b) => (
            <tr key={b.id}>
              <td style={{ ...cell, textAlign: "center" }}>{b.seq}</td>
              <td style={cell}>{printDate(b.receivedDate)}</td>
              <td style={cell}>{printText(b.invoiceNumber)}</td>
              <td style={cell}>{printDate(b.invoiceDate)}</td>
              <td style={cell}>{printText(b.receivedBy || b.postedByName)}</td>
              <td style={right}>{fmt(b.subtotal)}</td>
              <td style={right}>{fmt(b.vatAmt)}</td>
              <td style={right}>{fmt(b.total)}</td>
            </tr>
          ))}
          {doc.batches.length > 0 && (
            <tr>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700 }} colSpan={7}>รวมรับทั้งสิ้น</td>
              <td style={{ ...right, fontWeight: 700 }}>{fmt(totals.receivedValue)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {doc.remarks ? <div style={{ marginTop: 8 }}><b>หมายเหตุ:</b> {doc.remarks}</div> : null}

      {/* กันบล็อกลายเซ็นถูกหั่นคร่อมหน้า — ดู PrintDocument.tsx ของใบเสนอราคา */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 28, breakInside: "avoid" }}>
        <tbody>
          <tr>
            <td style={{ width: "50%", textAlign: "center", paddingTop: 20 }}>
              <PrintSignatureLine userId={doc.createdBy} height={28} />
              <div>....................................................</div>
              <div>ผู้รับของ</div>
            </td>
            <td style={{ width: "50%", textAlign: "center", paddingTop: 20 }}>
              <div style={{ height: "28px" }} />
              <div>....................................................</div>
              <div>ผู้ตรวจสอบ</div>
            </td>
          </tr>
        </tbody>
      </table>
      </PrintPageFrame>
    </div>
  );
}
