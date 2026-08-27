import type { ArDocument, ArDocumentType } from "../../lib/accounting";
import { formatArDocDate, formatArPaymentCondition } from "../../lib/accounting";

/**
 * AR/IV/BI/RE print document (added 2026-08-17, Phase 1; BI given its own dedicated layout
 * 2026-08-18 — see below). One page per copy label (ต้นฉบับ/สำเนา 1/สำเนา 2...), matching Delivery
 * Order's exact multi-copy pattern (`COPY_LABELS.map()` over `breakAfter:"page"` blocks, same
 * `@page{margin:0}` override, see DeliveryOrderPrintDocument.tsx). Company block is hardcoded per
 * the spec's real reference PDFs (§2), same precedent as DeliveryOrderPrintDocument.tsx's own
 * LETTERHEAD constant — Settings' Company record is a single-line Thai name/address, a different
 * shape than this bilingual block.
 *
 * **2026-08-18**: the owner shared real photos of the printed AR/IV/RE and BI reference documents.
 * The AR/IV/RE frame below (`DocumentPage`) was already a close match to the AR/IV/RE photos. The
 * BI (ใบแจ้งหนี้/ใบวางบิล) photo, however, showed a genuinely different, simpler layout — no tax ID/
 * contact, no bilingual title, a compact 3-line letterhead, and a totals-owed table (No./เลขที่
 * ใบกำกับ/วันที่/ครบกำหนด/จำนวนเงิน/ชำระแล้ว/เงินคงค้าง) instead of a line-items table — confirming the
 * "Phase 1 simplification, revisit once checked against reference PDFs" note this file used to carry.
 * `BillingNotePage` below replaces the old shared-frame BI rendering with a faithful match. Also
 * fixed while in here: every date now renders Buddhist 2-digit (`13/08/69`, matching every real
 * form) via `formatArDocDate()`, not the Gregorian 4-digit `formatQuoteDateNumeric()` this file used
 * before — that mismatch existed for AR/IV/RE too, not just BI.
 */

const LETTERHEAD = {
  nameTh: "บริษัท ไทย เคมีคอล สโตเรจ จำกัด",
  nameEn: "Thai Chemicals Storage Company Limited",
  address: "200 อาคารจัสมิน อินเตอร์เนชั่นแนล ทาวเวอร์ ชั้น 25 ห้อง 2504 หมู่ 4 ถ.แจ้งวัฒนะ ต.ปากเกร็ด อ.ปากเกร็ด จ.นนทบุรี 11120",
  addressCompact: "200 จัสมินอินเตอร์เนชั่นแนลทาวเวอร์ ชั้น 25 ห้อง 2504 หมู่ 4 ต.ปากเกร็ด อ.ปากเกร็ด จ.นนทบุรี 11120",
  taxId: "0125554010201 (สำนักงานใหญ่)",
  tel: "0-2583-3615-6",
  fax: "0-2583-3617",
  factoryTel: "0-2150-9627",
  email: "account@thaichemicals.com",
  bankNote: "บัญชี \"บจก.ไทย เคมีคอล สโตเรจ\" ธนาคารกสิกรไทย บัญชีเลขที่ 683-2-16719-1",
};

// Titles follow the owner's own document names (2026-08-18 follow-up — see docs/MODULES/Accounting.md).
const DOC_TITLE: Record<ArDocumentType, { th: string; en: string }> = {
  AR: { th: "ใบรับเงินมัดจำ/ใบกำกับภาษี", en: "DEPOSIT RECEIPT / TAX INVOICE" },
  IV: { th: "ใบกำกับภาษี/ใบส่งสินค้า", en: "TAX INVOICE / DELIVERY ORDER" },
  BI: { th: "ใบแจ้งหนี้/ใบวางบิล", en: "INVOICE / BILLING NOTE" },
  RE: { th: "ใบเสร็จรับเงิน", en: "RECEIPT" },
};

// Copy counts per the Flow งานบัญชี spreadsheet: tax invoices 4 copies incl. original, billing
// note + receipt 2 copies incl. original.
const COPY_COUNT: Record<ArDocumentType, number> = { AR: 4, IV: 4, BI: 2, RE: 2 };
function copyLabels(docType: ArDocumentType): string[] {
  const n = COPY_COUNT[docType];
  return ["ต้นฉบับ", ...Array.from({ length: n - 1 }, (_, i) => `สำเนา ${i + 1}`)];
}

function money(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// ─── AR / IV / RE — shared frame (per the real reference photos) ────────────────────────

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
          {/* สแตมป์สถานะตัดสต๊อก (เฉพาะ IV, เพิ่ม 2026-08-18) — พิมพ์ใบเดิม แต่มีข้อความบอกสถานะ
              ตามที่เจ้าของเลือก ไม่ใช่ layout แยกกันสองแบบ */}
          {document.docType === "IV" && (
            <p style={{ fontSize: "10px", marginTop: "2px", fontWeight: 700, color: document.stockDeducted ? "#207e52" : "#999" }}>
              {document.stockDeducted ? "✓ ตัดสต๊อกแล้ว" : "ยังไม่ตัดสต๊อก"}
            </p>
          )}
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
          <p><strong>วันที่ / Date:</strong> {formatArDocDate(document.docDate)}</p>
          <p><strong>ครบกำหนด / Due:</strong> {formatArDocDate(document.dueDate)}</p>
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
              <td style={{ padding: "4px" }}>
                {l.description}
                {/* บรรทัดรายละเอียดย่อยใต้คำอธิบายหลัก (เช่น "For Installation") — ย่อหน้าเล็กน้อยและ
                    ตัวเล็กกว่า ตามใบกำกับภาษีจริง */}
                {(l.subDetails ?? []).map((sd, i) => (
                  <p key={i} style={{ margin: "1px 0 0 10px", fontSize: "10px" }}>{sd}</p>
                ))}
              </td>
              <td style={{ textAlign: "right", padding: "4px", verticalAlign: "top" }}>{l.qty.toLocaleString("th-TH")}</td>
              <td style={{ padding: "4px" }}>{l.unit}</td>
              <td style={{ textAlign: "right", padding: "4px" }}>{money(l.unitPrice)}</td>
              <td style={{ textAlign: "right", padding: "4px" }}>{money(l.amount)}</td>
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
            <tr><td>รวม / Total</td><td style={{ textAlign: "right" }}>{money(document.subtotal)}</td></tr>
            <tr><td>ส่วนลด / Discount</td><td style={{ textAlign: "right" }}>{money(document.discount)}</td></tr>
            <tr><td>มูลค่าสินค้า / Value Amount</td><td style={{ textAlign: "right" }}>{money(document.valueAmount)}</td></tr>
            {document.vatRate > 0 && <tr><td>ภาษีมูลค่าเพิ่ม {document.vatRate}%</td><td style={{ textAlign: "right" }}>{money(document.vatAmount)}</td></tr>}
            <tr style={{ fontWeight: 700, borderTop: "1px solid #000" }}><td>รวมเงินสุทธิ / Net</td><td style={{ textAlign: "right" }}>{money(document.netTotal)}</td></tr>
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "11px", border: "1px solid #000", padding: "4px", marginTop: "4px", display: "inline-block" }}>{document.amountTextTh}</p>

      <p style={{ fontSize: "10px", marginTop: "8px" }}>
        1. ในกรณีชำระด้วยเช็ค ใบเสร็จรับเงินฉบับนี้ จะสมบูรณ์ต่อเมื่อบริษัทฯ ได้รับเงินตามเช็คเท่านั้น / IN CASE OF THE PAYMENT PAID BY CHEQUE THIS RECEIPT WILL BE VALID ONLY UPON CLEARANCE.
      </p>

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

// ─── BI (ใบแจ้งหนี้/ใบวางบิล) — its own dedicated layout, added 2026-08-18 ──────────────────

/** ยอดที่ชำระแล้วต่อใบกำกับภาษี (คีย์ด้วย `_id` ของใบกำกับภาษี — ตรงกับ `line.linkedArDocumentId`)
 * — คำนวณโดยผู้เรียก (ตรวจว่าใบกำกับภาษีนั้นมีใบเสร็จรับเงินที่ยังไม่ถูกยกเลิกหรือไม่) แล้วส่งเข้ามา
 * เพื่อไม่ให้ component พิมพ์ต้องรู้จัก state ของเอกสารอื่นเอง ไม่ระบุ = ถือว่ายังไม่ชำระ (0). */
export type ArPaidByInvoiceId = Record<string, number>;

function BillingNotePage({ document, copyLabel, paidByInvoiceId }: { document: ArDocument; copyLabel: string; paidByInvoiceId: ArPaidByInvoiceId }) {
  const condition = formatArPaymentCondition(document);
  return (
    <div className="hidden print:block" style={{ breakAfter: "page", fontFamily: "'Noto Sans Thai', sans-serif", color: "#000", background: "#fff", padding: "12mm", fontSize: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <img src="/logo.png" alt="" style={{ width: "44px", height: "44px", objectFit: "contain" }} />
          <div style={{ lineHeight: 1.5 }}>
            <p style={{ fontWeight: 700, fontSize: "13px" }}>{LETTERHEAD.nameTh}</p>
            <p style={{ fontSize: "11px" }}>{LETTERHEAD.addressCompact}</p>
            <p style={{ fontSize: "11px" }}>สนญ. {LETTERHEAD.tel}   โรงงาน {LETTERHEAD.factoryTel}</p>
          </div>
        </div>
        <p style={{ fontWeight: 700, fontSize: "15px" }}>{DOC_TITLE.BI.th}</p>
      </div>
      <div style={{ borderBottom: "2px solid #000", marginTop: "6px" }} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", gap: "16px", fontSize: "11px" }}>
        <div>
          <p>ลูกค้า &nbsp; {document.customerSnapshot.companyName}</p>
          <p style={{ maxWidth: "320px" }}>{document.customerSnapshot.address}</p>
        </div>
        <div style={{ width: "220px" }}>
          <p><strong>เลขที่ใบวางบิล</strong> &nbsp; {document.docNo}</p>
          <p><strong>วันที่</strong> &nbsp; {formatArDocDate(document.docDate)}</p>
          {condition && <p><strong>เงื่อนไขการชำระเงิน</strong> &nbsp; {condition}</p>}
        </div>
      </div>

      <table style={{ width: "100%", marginTop: "10px", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ borderTop: "1px solid #000", borderBottom: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "4px" }}>No.</th>
            <th style={{ textAlign: "left", padding: "4px" }}>เลขที่ใบกำกับ</th>
            <th style={{ textAlign: "left", padding: "4px" }}>วันที่</th>
            <th style={{ textAlign: "left", padding: "4px" }}>ครบกำหนด</th>
            <th style={{ textAlign: "right", padding: "4px" }}>จำนวนเงิน</th>
            <th style={{ textAlign: "right", padding: "4px" }}>ชำระแล้ว</th>
            <th style={{ textAlign: "right", padding: "4px" }}>เงินคงค้าง</th>
          </tr>
        </thead>
        <tbody>
          {document.lines.map((l) => {
            const paid = (l.linkedArDocumentId && paidByInvoiceId[l.linkedArDocumentId]) || 0;
            return (
              <tr key={l.seq} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={{ padding: "4px" }}>{l.seq}</td>
                <td style={{ padding: "4px" }}>{l.description}</td>
                <td style={{ padding: "4px" }}>{formatArDocDate(document.docDate)}</td>
                <td style={{ padding: "4px" }}>{formatArDocDate(document.dueDate)}</td>
                <td style={{ textAlign: "right", padding: "4px" }}>{money(l.amount)}</td>
                <td style={{ textAlign: "right", padding: "4px" }}>{paid > 0 ? money(paid) : ""}</td>
                <td style={{ textAlign: "right", padding: "4px" }}>{money(l.amount - paid)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "8px" }}>
        {/* bahtText() already returns its own "(...)" wrapper — no extra parens here */}
        <p style={{ fontSize: "11px", border: "1px solid #000", padding: "4px" }}>{document.amountTextTh}</p>
        <table style={{ fontSize: "11px" }}>
          <tbody>
            <tr style={{ fontWeight: 700 }}><td style={{ paddingRight: "12px" }}>รวมเงินทั้งสิ้น</td><td style={{ textAlign: "right" }}>{money(document.netTotal)}</td></tr>
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: "10px", marginTop: "8px" }}>หมายเหตุ &nbsp; {LETTERHEAD.bankNote}</p>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", fontSize: "11px" }}>
        <div>
          <p>ชื่อผู้รับวางบิล ______________________</p>
          <p style={{ marginTop: "16px" }}>วันที่รับ ___/___/___</p>
          <p style={{ marginTop: "8px" }}>วันที่นัดรับเช็ค ___/___/___</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p>ในนาม {LETTERHEAD.nameTh}</p>
          <div style={{ borderBottom: "1px solid #000", height: "40px", width: "200px", marginTop: "8px" }} />
          <p style={{ marginTop: "4px" }}>ชื่อผู้วางบิล</p>
        </div>
      </div>
      <div style={{ textAlign: "right", fontSize: "10px", marginTop: "8px" }}>{copyLabel}</div>
    </div>
  );
}

export function ArDocumentPrintDocument({ document, paidByInvoiceId = {} }: { document: ArDocument; paidByInvoiceId?: ArPaidByInvoiceId }) {
  return (
    <>
      <style>{"@media print { @page { size: A4 portrait; margin: 0 } }"}</style>
      {copyLabels(document.docType).map((label) => (
        document.docType === "BI"
          ? <BillingNotePage key={label} document={document} copyLabel={label} paidByInvoiceId={paidByInvoiceId} />
          : <DocumentPage key={label} document={document} copyLabel={label} />
      ))}
    </>
  );
}
