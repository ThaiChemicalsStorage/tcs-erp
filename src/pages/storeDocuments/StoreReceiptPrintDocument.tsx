import type { CompanyHeaderInfo } from "../../lib/storage";
import type { StoreReceipt, StoreReceiptSourceLine } from "../../lib/storeReceipt";
import { storeReceiptCodeInfo, type StoreReceiptCode } from "../../lib/storeCodes";
import { fmt } from "../../lib/quotes";
import { PrintLetterhead } from "../../components/PrintLetterhead";
import { PrintSignatureLine } from "../../components/PrintSignature";
import { PrintPageFrame } from "../../components/PrintPageFrame";
import { printDate, printText } from "../../lib/printFormat";

/**
 * ใบพิมพ์ใบรับคืน / รับเข้าคลังของสโตร์ (2026-09-23) — ⚠️ ใบชั่วคราว เจ้าของยังไม่ได้ส่งฟอร์มกระดาษมา
 * (สถานะเดียวกับใบรับสินค้า) พิมพ์ข้อมูลครบในเลย์เอาต์เรียบ ๆ ไม่เดาหน้าตาฟอร์มจริง
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n` — เอกสารที่พิมพ์ออกไปต้องไม่เปลี่ยนภาษาตามคนกด (ดู docs/CLAUDE.md)
 * ชื่อรหัสจึงเป็นตารางภาษาไทยของไฟล์นี้เอง ตรงกับชื่อในโปรแกรมบัญชีที่บริษัทใช้
 */
const PRINT_NAME: Record<StoreReceiptCode, string> = {
  JD: "รับคืนวัตถุดิบจากการผลิต", J1: "รับวัตถุดิบผลิต JD-SHELL#J1", J2: "รับวัตถุดิบผลิต JD-ASSEMBLY#J2",
  J3: "รับวัตถุดิบผลิต JD-STEEL#J3", JP: "รับคืนวัตถุดิบจากโครงการ", JB: "รับคืนวัตถุดิบจากไฟฟ้า",
  JS: "รับคืนงานเหล็กโครงการ", JC: "รับคืนจากการซ่อมเคลม", JT: "รับคืนเครื่องมือ",
  FG: "รับสินค้าสำเร็จรูปจากการผลิต", FP: "รับสินค้าสำเร็จรูปงานโครงการ", GC: "ใบรับสินค้าของลูกค้า",
  JN: "รับเพื่อน็อตเป็นชุด", JU: "ปรับปรุงเพิ่ม/ลดสินค้า", TK: "ปรับปรุงจากการตรวจนับ",
};

export function StoreReceiptPrintDocument({ doc, sourceLines, companyHeader }: {
  doc: StoreReceipt;
  sourceLines: StoreReceiptSourceLine[];
  companyHeader: CompanyHeaderInfo;
}) {
  const kind = storeReceiptCodeInfo(doc.receiptCode).kind;
  const cell: React.CSSProperties = { border: "1px solid #000", padding: "4px 6px", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, fontWeight: 700, textAlign: "center", background: "#eee" };
  const right: React.CSSProperties = { ...cell, textAlign: "right" };
  const src = new Map(sourceLines.map((s) => [s.lineId, s]));
  const qtyHeader = kind === "return" ? "จำนวนคืน" : kind === "adjust" ? (doc.receiptCode === "TK" ? "นับได้จริง" : "ยอดที่ถูกต้อง") : "จำนวนรับ";

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif", fontSize: "11px", color: "#000" }}>
      <PrintPageFrame>
        <PrintLetterhead
          companyHeader={companyHeader}
          docLabel="STORE RETURN / RECEIPT"
          rightMeta={[
            { label: "เลขที่", value: doc.documentNumber || doc.id },
            { label: "วันที่รับ", value: printDate(doc.receivedDate) },
          ]}
        />
        <div style={{ textAlign: "center", margin: "0 0 10px" }}>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>ใบรับคืน / รับเข้าคลัง</div>
          <div style={{ fontSize: "12px" }}>{doc.receiptCode} — {PRINT_NAME[doc.receiptCode]}</div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={cell}><b>อ้างอิงใบเบิก:</b> {printText(doc.sourceRequisitionNumber)}</td>
              <td style={cell}><b>รหัสงาน:</b> {printText(doc.jobCode)}</td>
              <td style={cell}><b>อ้างอิง:</b> {printText(doc.reference)}</td>
            </tr>
            <tr>
              <td style={cell}><b>แผนก / ทีม:</b> {printText([doc.chargeDepartmentName, doc.chargeTeamName].filter(Boolean).join(" / "))}</td>
              <td style={cell}><b>ลูกค้า:</b> {printText(doc.customerName)}</td>
              <td style={cell}><b>เหตุผล:</b> {printText(doc.reason)}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={head}>ลำดับ</th>
              <th style={head}>รหัสสินค้า</th>
              <th style={head}>รายการ</th>
              <th style={head}>หน่วย</th>
              {kind === "return" && <th style={head}>จ่ายไป</th>}
              <th style={head}>{qtyHeader}</th>
              {kind === "receive" && <th style={head}>ต้นทุน/หน่วย</th>}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id}>
                <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                <td style={cell}>{l.productCode}</td>
                <td style={cell}>{l.productName}</td>
                <td style={cell}>{l.unit}</td>
                {kind === "return" && <td style={right}>{l.sourceLineId && src.get(l.sourceLineId) ? fmt(src.get(l.sourceLineId)!.issued) : ""}</td>}
                <td style={right}>{l.qty === null ? "" : fmt(l.qty)}</td>
                {kind === "receive" && <td style={right}>{l.unitCost === null ? "" : fmt(l.unitCost)}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              {([
                ["ผู้จัดทำ", doc.preparedBy, doc.preparedAt, doc.createdBy],
                ["ผู้อนุมัติ", doc.approvedBy, doc.approvedAt, doc.approvedByUserId],
                ["แผนกสโตร์", doc.storeDeptBy, doc.storeDeptAt, ""],
                ["แผนกต้นทุน", doc.costDeptBy, doc.costDeptAt, ""],
              ] as const).map(([label, name, date, userId]) => (
                <td key={label} style={{ ...cell, textAlign: "center", width: "25%" }}>
                  <PrintSignatureLine userId={userId} height={28} />
                  <div>({name || " ".repeat(24)})</div>
                  <div>{label}</div>
                  <div>วันที่ {date ? printDate(date) : ""}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </PrintPageFrame>
    </div>
  );
}
