import type { ArDocument, ArDocumentType } from "../../lib/accounting";
import { formatQuoteDateNumeric as fmtNumericDate } from "../../lib/quotes";

/**
 * AR/IV/BI print document (added 2026-08-17, Phase 1) — one page per copy label
 * (ต้นฉบับ/สำเนา 1/สำเนา 2...), matching Delivery Order's exact multi-copy pattern
 * (`COPY_LABELS.map()` over `breakAfter:"page"` blocks, same `@page{margin:0}` override, see
 * DeliveryOrderPrintDocument.tsx). Company block is hardcoded per the spec's real reference PDFs
 * (§2), same precedent as DeliveryOrderPrintDocument.tsx's own LETTERHEAD constant — Settings'
 * Company record is a single-line Thai name/address, a different shape than this bilingual block.
 * Phase 1 note: AR/IV/BI share one frame here rather than BI's simpler dedicated layout from spec
 * §5 — a reasonable Phase 1 simplification, revisit once real printed output is checked against the
 * reference PDFs in reference/accounting/.
 */

const LETTERHEAD = {
  nameTh: "บริษัท ไทย เคมีคอล สโตเรจ จำกัด",
  nameEn: "Thai Chemicals Storage Company Limited",
  address: "200 อาคารจัสมิน อินเตอร์เนชั่นแนล ทาวเวอร์ ชั้น 25 ห้อง 2504 หมู่ 4 ถ.แจ้งวัฒนะ ต.ปากเกร็ด อ.ปากเกร็ด จ.นนทบุรี 11120",
  taxId: "0125554010201 (สำนักงานใหญ่)",
  tel: "0-2583-3615-6",
  fax: "0-2583-3617",
  email: "account@thaichemicals.com",
  bankNote: "บัญชี \"บจก.ไทย เคมีคอล สโตเรจ\" ธนาคารกสิกรไทย บัญชีเลขที่ 683-2-16719-1",
};

const DOC_TITLE: Record<ArDocumentType, { th: string; en: string }> = {
  AR: { th: "ใบกำกับภาษี (เงินมัดจำ)", en: "TAX INVOICE (DEPOSIT)" },
  IV: { th: "ต้นฉบับใบกำกับภาษี", en: "ORIGINAL TAX INVOICE" },
  BI: { th: "ใบวางบิล", en: "BILLING NOTE" },
};

const COPY_COUNT: Record<ArDocumentType, number> = { AR: 4, IV: 4, BI: 2 };
function copyLabels(docType: ArDocumentType): string[] {
  const n = COPY_COUNT[docType];
  return ["ต้นฉบับ", ...Array.from({ length: n - 1 }, (_, i) => `สำเนา ${i + 1}`)];
}

function DocumentPage({ document, copyLabel }: { document: ArDocument; copyLabel: string }) {
  return (
    <div className="hidden print:block" style={{ breakAfter: "page", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", background: "#fff", padding: "12mm", fontSize: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #000", paddingBottom: "8px" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <img src="/logo.png" alt="" style={{ width: "56px", height: "56px", objectFit: "contain" }} />
          <div style={{ lineHeight: 1.5 }}>
            <p style={{ fontWeight: 700 }}>{LETTERHEAD.nameTh}</p>
            <p>{LETTERHEAD.nameEn}</p>
            <p style={{ fontSize: "11px", maxWidth: "320px" }}>{LETTERHEAD.address}</p>
            <p style={{ fontSize: "11px" }}>โทร {LETTERHEAD.tel} · แฟกซ์ {LETTERHEAD.fax} · {LETTERHEAD.email}</p>
            <p style={{ fontSize: "11px" }}>เลขประจำตัวผู้เสียภาษี {LETTERHEAD.taxId}</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontWeight: 700, fontSize: "15px" }}>{DOC_TITLE[document.docType].th}</p>
          <p style={{ fontSize: "11px" }}>{DOC_TITLE[document.docType].en}</p>
          <p style={{ fontSize: "10px", marginTop: "4px" }}>สำหรับลูกค้า</p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", gap: "16px" }}>
        <div style={{ flex: 1, border: "1px solid #000", padding: "8px" }}>
          <p><strong>ลูกค้า / Customer:</strong> {document.customerSnapshot.companyName}</p>
          <p style={{ fontSize: "11px" }}>{document.customerSnapshot.address}</p>
          <p style={{ fontSize: "11px" }}>เลขประจำตัวผู้เสียภาษี {document.customerSnapshot.taxId}{document.customerSnapshot.branch ? ` · สาขา ${document.customerSnapshot.branch}` : ""}</p>
          {document.customerSnapshot.contactName && <p style={{ fontSize: "11px" }}>ผู้ติดต่อ: {document.customerSnapshot.contactName} {document.customerSnapshot.phone}</p>}
        </div>
        <div style={{ width: "220px", fontSize: "11px" }}>
          <p><strong>เลขที่ / No.:</strong> {document.docNo}</p>
          <p><strong>วันที่ / Date:</strong> {fmtNumericDate(document.docDate)}</p>
          <p><strong>ครบกำหนด / Due:</strong> {fmtNumericDate(document.dueDate)}</p>
          {document.reference && <p><strong>อ้างถึง / Ref:</strong> {document.reference}</p>}
        </div>
      </div>

      <table style={{ width: "100%", marginTop: "10px", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ borderTop: "1px solid #000", borderBottom: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "4px" }}>ลำดับ</th>
            <th style={{ textAlign: "left", padding: "4px" }}>รายการ</th>
            <th style={{ textAlign: "right", padding: "4px" }}>จำนวน</th>
            <th style={{ textAlign: "left", padding: "4px" }}>หน่วย</th>
            <th style={{ textAlign: "right", padding: "4px" }}>ราคาต่อหน่วย</th>
            <th style={{ textAlign: "right", padding: "4px" }}>จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((l) => (
            <tr key={l.seq} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "4px" }}>{l.seq}</td>
              <td style={{ padding: "4px" }}>{l.description}</td>
              <td style={{ textAlign: "right", padding: "4px" }}>{l.qty.toLocaleString("th-TH")}</td>
              <td style={{ padding: "4px" }}>{l.unit}</td>
              <td style={{ textAlign: "right", padding: "4px" }}>{l.unitPrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              <td style={{ textAlign: "right", padding: "4px" }}>{l.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
        <div style={{ fontSize: "11px", maxWidth: "300px" }}>
          {document.remarks.map((r, i) => <p key={i}>{r}</p>)}
        </div>
        <table style={{ fontSize: "11px", width: "220px" }}>
          <tbody>
            <tr><td>รวม / Total</td><td style={{ textAlign: "right" }}>{document.subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td></tr>
            <tr><td>ส่วนลด / Discount</td><td style={{ textAlign: "right" }}>{document.discount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td></tr>
            <tr><td>มูลค่าสินค้า / Value Amount</td><td style={{ textAlign: "right" }}>{document.valueAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td></tr>
            {document.vatRate > 0 && <tr><td>ภาษีมูลค่าเพิ่ม {document.vatRate}%</td><td style={{ textAlign: "right" }}>{document.vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td></tr>}
            <tr style={{ fontWeight: 700, borderTop: "1px solid #000" }}><td>รวมเงินสุทธิ / Net</td><td style={{ textAlign: "right" }}>{document.netTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td></tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "11px", border: "1px solid #000", padding: "4px", marginTop: "4px", display: "inline-block" }}>{document.amountTextTh}</p>

      {document.docType !== "BI" && (
        <p style={{ fontSize: "10px", marginTop: "8px" }}>
          1. ในกรณีชำระด้วยเช็ค ใบเสร็จรับเงินฉบับนี้ จะสมบูรณ์ต่อเมื่อบริษัทฯ ได้รับเงินตามเช็คเท่านั้น / IN CASE OF THE PAYMENT PAID BY CHEQUE THIS RECEIPT WILL BE VALID ONLY UPON CLEARANCE.
        </p>
      )}
      {document.docType === "BI" && <p style={{ fontSize: "10px", marginTop: "8px" }}>หมายเหตุ: {LETTERHEAD.bankNote}</p>}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", fontSize: "11px" }}>
        <div style={{ textAlign: "center", width: "200px" }}>
          <div style={{ borderBottom: "1px solid #000", height: "40px" }} />
          <p style={{ marginTop: "4px" }}>ผู้มีอำนาจลงนาม / Authorized Signature</p>
          <p>วันที่ / Date ___/___/___</p>
        </div>
        <div style={{ textAlign: "right", fontSize: "10px", alignSelf: "flex-end" }}>{copyLabel}</div>
      </div>
    </div>
  );
}

export function ArDocumentPrintDocument({ document }: { document: ArDocument }) {
  return (
    <>
      <style>{"@media print { @page { margin: 0 } }"}</style>
      {copyLabels(document.docType).map((label) => <DocumentPage key={label} document={document} copyLabel={label} />)}
    </>
  );
}
