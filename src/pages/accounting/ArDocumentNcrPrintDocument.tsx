import type { ReactNode } from "react";
import type { ArDocument } from "../../lib/accounting";
import { formatArDocDate, formatArPaymentCondition } from "../../lib/accounting";
import type { ArPaidByInvoiceId } from "./ArDocumentPrintDocument";

/**
 * โหมดพิมพ์ลงฟอร์ม NCR (added 2026-08-18) — ฟอร์มกระดาษเคมี (carbonless) ที่บริษัทซื้อมาแล้ว
 * มีกรอบ/หัวเอกสาร/ป้ายช่องพิมพ์มาบนกระดาษอยู่แล้ว (ใบเสร็จรับเงินสีเขียว, ใบกำกับภาษี/ใบส่งสินค้าสีชมพู
 * — ทุกประเภทเอกสารใช้ผังฟอร์มเดียวกัน ต่างกันที่ชื่อมุมขวาบนและสีของแต่ละ ply เท่านั้น)
 * component นี้จึงพิมพ์ **เฉพาะตัวข้อมูล** วางตำแหน่งสัมบูรณ์เป็นมิลลิเมตร ให้ตกลงตรงช่องของฟอร์ม
 * และพิมพ์ **1 หน้าต่อ 1 ชุด** (กระดาษ carbon ทำสำเนาทุก ply ในการพิมพ์ครั้งเดียว — ต่างจาก
 * ArDocumentPrintDocument ที่พิมพ์กระดาษเปล่าแยกทีละสำเนา)
 *
 * NCR print mode — the pre-purchased carbonless forms already carry the frame/labels, so this
 * renders DATA ONLY at absolute mm positions, one page per form set (the carbon layers make the
 * copies), unlike the plain-paper ArDocumentPrintDocument.
 *
 * ⚠️ ตำแหน่งใน FORM_LAYOUT เป็น "ร่างแรก" ถอดสัดส่วนจากภาพถ่ายฟอร์มจริง 3 ใบ (RE6908021 /
 * IV6908024 หน้า 1-2, 2026-08-18) — ต้อง calibrate กับฟอร์มจริง+เครื่องพิมพ์ dot-matrix จริงก่อนใช้งาน
 * ผ่านหน้าตั้งค่า (offset X/Y + ขนาดกระดาษ, เก็บใน localStorage ต่อเครื่อง เพราะการเยื้องเป็นเรื่องของ
 * เครื่องพิมพ์แต่ละตัว ไม่ใช่ข้อมูลธุรกิจ) และปุ่ม "พิมพ์หน้าทดสอบ" ที่พิมพ์กากบาท/กรอบไว้ทาบกับฟอร์มจริง
 *
 * **BI (ใบแจ้งหนี้/ใบวางบิล) — added 2026-08-18, confirmed live by the owner** ("ตัวใบแจ้งหนี้มันมาเป็น
 * ฟอร์มเปล่าด้วย"): this is ALSO pre-printed NCR stock, not plain paper as originally guessed when
 * `ArDocumentPrintDocument.tsx`'s plain-paper `BillingNotePage` was built — that component's exact
 * field set (No./เลขที่ใบกำกับ/วันที่/ครบกำหนด/จำนวนเงิน/ชำระแล้ว/เงินคงค้าง table, no tax id/contact,
 * "เลขที่ใบวางบิล"/"เงื่อนไขการชำระเงิน" labels) carries over here unchanged — only the rendering
 * becomes data-only/absolute-positioned. `FORM_BI` coordinates are a first-draft best-effort guess
 * (no fresh measured photo of this specific form was provided) — needs the same physical
 * calibration pass as the AR/IV/RE layout before real use.
 */

import type { NcrPrintSettings } from "../../lib/ncrPrintSettings";

// ─── ผังตำแหน่งฟอร์ม (มม. จากมุมซ้ายบนของกระดาษ) — ร่างแรกจากภาพถ่าย ───────────────
const FORM = {
  pageIndicator: { top: 36, left: 192 },          // "หน้า 1/2" (เอกสารออกเป็นชุด)
  customerName: { top: 55, left: 24, width: 118 },
  customerAddress1: { top: 61, left: 26, width: 116 },
  customerAddress2: { top: 67, left: 26, width: 116 },
  taxId: { top: 81, left: 58 },
  branch: { top: 81, left: 118 },
  docNo: { top: 50, left: 150 },
  docDate: { top: 61, left: 150 },
  conditionDays: { top: 92, left: 22 },
  dueDate: { top: 92, left: 62 },
  reference: { top: 92, left: 150 },
  table: {
    top: 108,
    rowHeightMm: 6.5,
    rowsPerPage: 12,
    seqLeft: 9,
    descLeft: 22,
    descWidth: 108,
    qtyRight: 152,
    unitLeft: 156,
    unitPriceRight: 188,
    amountRight: 217,
  },
  totals: {
    right: 217,
    totalTop: 208,
    discountTop: 214.5,
    valueAmountTop: 221,
    vatTop: 227.5,
    netTop: 234,
  },
  amountText: { top: 231, left: 32, width: 100 },
} as const;

// ─── ผังฟอร์ม BI (ใบแจ้งหนี้/ใบวางบิล) — ร่างแรก ไม่มีรูปวัดตำแหน่งจริงของฟอร์มนี้โดยเฉพาะ ───
// โครงสร้างฟิลด์ตรงกับ BillingNotePage ใน ArDocumentPrintDocument.tsx (ไม่มีเลขภาษี/ผู้ติดต่อ,
// ตารางอ้างอิงใบกำกับภาษีต่อบรรทัด) — เปลี่ยนแค่การจัดวางเป็นตำแหน่งสัมบูรณ์
const FORM_BI = {
  pageIndicator: { top: 36, left: 192 },
  docNo: { top: 45, left: 150 },
  docDate: { top: 52, left: 150 },
  condition: { top: 59, left: 150, width: 65 },
  customerName: { top: 50, left: 20, width: 110 },
  customerAddress: { top: 57, left: 20, width: 110 },
  table: {
    top: 78,
    rowHeightMm: 7,
    rowsPerPage: 10,
    noLeft: 10,
    invoiceNoLeft: 22,
    docDateLeft: 60,
    dueDateLeft: 88,
    amountRight: 145,
    paidRight: 172,
    outstandingRight: 217,
  },
  totalTop: 195,
  totalRight: 217,
  amountText: { top: 202, left: 25, width: 130 },
} as const;

const mm = (n: number) => `${n}mm`;

function money(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10));
  const to = new Date(toIso.slice(0, 10));
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

interface NcrRow {
  seq: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  amount: string;
}

/** แปลงรายการ + หมายเหตุของเอกสารเป็นแถวบนฟอร์ม — หมายเหตุ (**PQ...** ฯลฯ) พิมพ์เป็นแถวต่อท้าย
 * ในคอลัมน์รายการ แบบเดียวกับที่ฟอร์มจริงจาก Express ทำ */
function buildRows(doc: ArDocument): NcrRow[] {
  const lineRows: NcrRow[] = doc.lines.map((l) => ({
    seq: String(l.seq),
    description: l.description,
    qty: doc.docType === "RE" ? "" : l.qty.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
    unit: doc.docType === "RE" ? "" : l.unit,
    unitPrice: doc.docType === "RE" ? "" : money(l.unitPrice),
    amount: money(l.amount),
  }));
  const remarkRows: NcrRow[] = doc.remarks.map((r) => ({
    seq: "", description: r, qty: "", unit: "", unitPrice: "", amount: "",
  }));
  return [...lineRows, ...remarkRows];
}

function Field({ top, left, width, right, children, bold }: {
  top: number; left?: number; width?: number; right?: number; children: ReactNode; bold?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: mm(top),
        ...(right !== undefined
          ? { left: 0, width: mm(right), textAlign: "right" as const }
          : { left: mm(left ?? 0), ...(width ? { width: mm(width) } : {}) }),
        overflow: "hidden",
        whiteSpace: "nowrap",
        ...(bold ? { fontWeight: 700 } : {}),
      }}
    >
      {children}
    </div>
  );
}

function NcrPage({ doc, rows, pageIndex, pageCount, settings }: {
  doc: ArDocument; rows: NcrRow[]; pageIndex: number; pageCount: number; settings: NcrPrintSettings;
}) {
  const isLast = pageIndex === pageCount - 1;
  const days = daysBetween(doc.docDate, doc.dueDate);
  const T = FORM.table;
  return (
    <div
      className="hidden print:block"
      style={{
        position: "relative",
        width: mm(settings.pageWidthMm),
        height: mm(settings.pageHeightMm),
        breakAfter: "page",
        color: "#000",
        background: "#fff",
        fontFamily: "'Noto Sans Thai', sans-serif",
        fontSize: "10.5pt",
        // offset เยื้องทั้งหน้า — calibrate กับเครื่องพิมพ์จริงผ่านหน้าตั้งค่า
        paddingTop: mm(settings.offsetYMm),
        paddingLeft: mm(settings.offsetXMm),
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* สแตมป์สถานะตัดสต๊อก (เฉพาะ IV, เพิ่ม 2026-08-18) — วางที่มุมซ้ายบน (top:4/left:4) จุดเดียวกับ
            ที่ NcrCalibrationTestPage ใช้เป็นมุมทดสอบ เพราะยืนยันแล้วว่าเป็นพื้นที่ขอบกระดาษว่างบนฟอร์มจริง
            ไม่ทับกรอบพิมพ์ — เหมือน FORM_BI ยังเป็นตำแหน่งร่างแรก ควร calibrate กับฟอร์มจริงก่อนใช้งาน */}
        {doc.docType === "IV" && (
          <Field top={4} left={4} bold>{doc.stockDeducted ? "✓ ตัดสต๊อกแล้ว" : "ยังไม่ตัดสต๊อก"}</Field>
        )}
        {pageCount > 1 && <Field top={FORM.pageIndicator.top} left={FORM.pageIndicator.left}>{pageIndex + 1}/{pageCount}</Field>}

        <Field top={FORM.customerName.top} left={FORM.customerName.left} width={FORM.customerName.width}>{doc.customerSnapshot.companyName}</Field>
        <Field top={FORM.customerAddress1.top} left={FORM.customerAddress1.left} width={FORM.customerAddress1.width}>{doc.customerSnapshot.address}</Field>
        <Field top={FORM.taxId.top} left={FORM.taxId.left}>{doc.customerSnapshot.taxId}</Field>
        {doc.customerSnapshot.branch && <Field top={FORM.branch.top} left={FORM.branch.left}>{doc.customerSnapshot.branch}</Field>}

        <Field top={FORM.docNo.top} left={FORM.docNo.left}>{doc.docNo}</Field>
        <Field top={FORM.docDate.top} left={FORM.docDate.left}>{formatArDocDate(doc.docDate)}</Field>
        {days > 0 && <Field top={FORM.conditionDays.top} left={FORM.conditionDays.left}>{days}</Field>}
        {days > 0 && <Field top={FORM.dueDate.top} left={FORM.dueDate.left}>{formatArDocDate(doc.dueDate)}</Field>}
        {doc.reference && <Field top={FORM.reference.top} left={FORM.reference.left}>{doc.reference}</Field>}

        {rows.map((row, i) => {
          const top = T.top + i * T.rowHeightMm;
          return (
            <div key={i}>
              {row.seq && <Field top={top} left={T.seqLeft}>{row.seq}</Field>}
              <Field top={top} left={T.descLeft} width={T.descWidth}>{row.description}</Field>
              {row.qty && <Field top={top} right={T.qtyRight}>{row.qty}</Field>}
              {row.unit && <Field top={top} left={T.unitLeft}>{row.unit}</Field>}
              {row.unitPrice && <Field top={top} right={T.unitPriceRight}>{row.unitPrice}</Field>}
              {row.amount && <Field top={top} right={T.amountRight}>{row.amount}</Field>}
            </div>
          );
        })}

        {isLast && (
          <>
            {/* ใบเสร็จรับเงิน (RE) บนฟอร์มจริงพิมพ์เฉพาะยอดสุทธิ ช่องรวม/ส่วนลด/VAT เว้นว่าง —
                ใบกำกับภาษีพิมพ์ครบทุกช่อง */}
            {doc.docType !== "RE" && (
              <>
                <Field top={FORM.totals.totalTop} right={FORM.totals.right}>{money(doc.subtotal)}</Field>
                <Field top={FORM.totals.discountTop} right={FORM.totals.right}>{money(doc.discount)}</Field>
                <Field top={FORM.totals.valueAmountTop} right={FORM.totals.right}>{money(doc.valueAmount)}</Field>
                <Field top={FORM.totals.vatTop} right={FORM.totals.right}>{money(doc.vatAmount)}</Field>
              </>
            )}
            <Field top={FORM.totals.netTop} right={FORM.totals.right} bold>{money(doc.netTotal)}</Field>
            {/* bahtText() already returns its own "(...)" wrapper — no extra parens here */}
            <Field top={FORM.amountText.top} left={FORM.amountText.left} width={FORM.amountText.width}>{doc.amountTextTh}</Field>
          </>
        )}
      </div>
    </div>
  );
}

// ─── BI (ใบแจ้งหนี้/ใบวางบิล) — โครงสร้างต่างจาก AR/IV/RE โดยสิ้นเชิง (ยืนยันเป็นฟอร์ม NCR แล้วเช่นกัน) ──

function BillingNoteNcrPage({ doc, pageIndex, pageCount, settings, paidByInvoiceId }: {
  doc: ArDocument; pageIndex: number; pageCount: number; settings: NcrPrintSettings; paidByInvoiceId: ArPaidByInvoiceId;
}) {
  const isLast = pageIndex === pageCount - 1;
  const condition = formatArPaymentCondition(doc);
  const T = FORM_BI.table;
  const lines = doc.lines; // BI ปกติมีบรรทัดเดียวต่อ 1 ใบ (อ้างถึงใบกำกับภาษี 1 ใบ) — เผื่ออนาคตรวมหลายใบไว้แล้ว
  return (
    <div
      className="hidden print:block"
      style={{
        position: "relative",
        width: mm(settings.pageWidthMm),
        height: mm(settings.pageHeightMm),
        breakAfter: "page",
        color: "#000",
        background: "#fff",
        fontFamily: "'Noto Sans Thai', sans-serif",
        fontSize: "10.5pt",
        paddingTop: mm(settings.offsetYMm),
        paddingLeft: mm(settings.offsetXMm),
        boxSizing: "border-box",
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        {pageCount > 1 && <Field top={FORM_BI.pageIndicator.top} left={FORM_BI.pageIndicator.left}>{pageIndex + 1}/{pageCount}</Field>}

        <Field top={FORM_BI.customerName.top} left={FORM_BI.customerName.left} width={FORM_BI.customerName.width}>{doc.customerSnapshot.companyName}</Field>
        <Field top={FORM_BI.customerAddress.top} left={FORM_BI.customerAddress.left} width={FORM_BI.customerAddress.width}>{doc.customerSnapshot.address}</Field>

        <Field top={FORM_BI.docNo.top} left={FORM_BI.docNo.left}>{doc.docNo}</Field>
        <Field top={FORM_BI.docDate.top} left={FORM_BI.docDate.left}>{formatArDocDate(doc.docDate)}</Field>
        {condition && <Field top={FORM_BI.condition.top} left={FORM_BI.condition.left} width={FORM_BI.condition.width}>{condition}</Field>}

        {lines.map((l, i) => {
          const top = T.top + i * T.rowHeightMm;
          const paid = (l.linkedArDocumentId && paidByInvoiceId[l.linkedArDocumentId]) || 0;
          return (
            <div key={l.seq}>
              <Field top={top} left={T.noLeft}>{l.seq}</Field>
              <Field top={top} left={T.invoiceNoLeft} width={30}>{l.description}</Field>
              <Field top={top} left={T.docDateLeft}>{formatArDocDate(doc.docDate)}</Field>
              <Field top={top} left={T.dueDateLeft}>{formatArDocDate(doc.dueDate)}</Field>
              <Field top={top} right={T.amountRight}>{money(l.amount)}</Field>
              {paid > 0 && <Field top={top} right={T.paidRight}>{money(paid)}</Field>}
              <Field top={top} right={T.outstandingRight}>{money(l.amount - paid)}</Field>
            </div>
          );
        })}

        {isLast && (
          <>
            <Field top={FORM_BI.totalTop} right={FORM_BI.totalRight} bold>{money(doc.netTotal)}</Field>
            <Field top={FORM_BI.amountText.top} left={FORM_BI.amountText.left} width={FORM_BI.amountText.width}>{doc.amountTextTh}</Field>
          </>
        )}
      </div>
    </div>
  );
}

export function ArDocumentNcrPrintDocument({ document: doc, settings, paidByInvoiceId = {} }: {
  document: ArDocument; settings: NcrPrintSettings; paidByInvoiceId?: ArPaidByInvoiceId;
}) {
  if (doc.docType === "BI") {
    const pageCount = Math.max(1, Math.ceil(doc.lines.length / FORM_BI.table.rowsPerPage));
    return (
      <>
        <style>{`@media print { @page { size: ${settings.pageWidthMm}mm ${settings.pageHeightMm}mm; margin: 0 } }`}</style>
        {Array.from({ length: pageCount }, (_, i) => (
          <BillingNoteNcrPage key={i} doc={doc} pageIndex={i} pageCount={pageCount} settings={settings} paidByInvoiceId={paidByInvoiceId} />
        ))}
      </>
    );
  }

  const rows = buildRows(doc);
  const pageCount = Math.max(1, Math.ceil(rows.length / FORM.table.rowsPerPage));
  const pages = Array.from({ length: pageCount }, (_, p) => rows.slice(p * FORM.table.rowsPerPage, (p + 1) * FORM.table.rowsPerPage));
  return (
    <>
      <style>{`@media print { @page { size: ${settings.pageWidthMm}mm ${settings.pageHeightMm}mm; margin: 0 } }`}</style>
      {pages.map((pageRows, i) => (
        <NcrPage key={i} doc={doc} rows={pageRows} pageIndex={i} pageCount={pageCount} settings={settings} />
      ))}
    </>
  );
}

/** หน้าทดสอบ calibration — พิมพ์กากบาทที่จุดยึดของทุกช่อง + ป้ายชื่อย่อ ไว้ทาบกับฟอร์มจริงแล้ววัดว่า
 * ต้องปรับ offset X/Y กี่มิลลิเมตร (หรือแก้ตำแหน่งใน FORM_LAYOUT ถ้าคลาดเฉพาะบางช่อง)
 * `variant="billingNote"` ทดสอบผัง BI (โครงสร้างต่างจาก AR/IV/RE โดยสิ้นเชิง) แทน */
export function NcrCalibrationTestPage({ settings, variant = "standard" }: { settings: NcrPrintSettings; variant?: "standard" | "billingNote" }) {
  const marks: { top: number; left: number; label: string }[] = variant === "billingNote" ? [
    { ...FORM_BI.customerName, label: "ลูกค้า" },
    { top: FORM_BI.docNo.top, left: FORM_BI.docNo.left, label: "เลขที่ใบวางบิล" },
    { top: FORM_BI.docDate.top, left: FORM_BI.docDate.left, label: "วันที่" },
    { top: FORM_BI.condition.top, left: FORM_BI.condition.left, label: "เงื่อนไขชำระเงิน" },
    { top: FORM_BI.table.top, left: FORM_BI.table.invoiceNoLeft, label: "แถวแรก" },
    { top: FORM_BI.totalTop, left: FORM_BI.totalRight - 30, label: "รวมเงินทั้งสิ้น" },
    { top: FORM_BI.amountText.top, left: FORM_BI.amountText.left, label: "ตัวอักษร" },
  ] : [
    { ...FORM.customerName, label: "ลูกค้า" },
    { top: FORM.taxId.top, left: FORM.taxId.left, label: "เลขภาษี" },
    { top: FORM.docNo.top, left: FORM.docNo.left, label: "เลขที่" },
    { top: FORM.docDate.top, left: FORM.docDate.left, label: "วันที่" },
    { top: FORM.conditionDays.top, left: FORM.conditionDays.left, label: "เงื่อนไข" },
    { top: FORM.dueDate.top, left: FORM.dueDate.left, label: "กำหนดชำระ" },
    { top: FORM.reference.top, left: FORM.reference.left, label: "อ้างถึง" },
    { top: FORM.table.top, left: FORM.table.descLeft, label: "แถวแรก" },
    { top: FORM.table.top + (FORM.table.rowsPerPage - 1) * FORM.table.rowHeightMm, left: FORM.table.descLeft, label: "แถวสุดท้าย" },
    { top: FORM.totals.netTop, left: FORM.totals.right - 30, label: "ยอดสุทธิ" },
    { top: FORM.amountText.top, left: FORM.amountText.left, label: "ตัวอักษร" },
  ];
  return (
    <>
      <style>{`@media print { @page { size: ${settings.pageWidthMm}mm ${settings.pageHeightMm}mm; margin: 0 } }`}</style>
      <div
        className="hidden print:block"
        style={{
          position: "relative",
          width: mm(settings.pageWidthMm),
          height: mm(settings.pageHeightMm),
          color: "#000",
          background: "#fff",
          fontFamily: "'Noto Sans Thai', sans-serif",
          fontSize: "8pt",
          paddingTop: mm(settings.offsetYMm),
          paddingLeft: mm(settings.offsetXMm),
          boxSizing: "border-box",
        }}
      >
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {marks.map((mk) => (
            <div key={mk.label} style={{ position: "absolute", top: mm(mk.top - 2), left: mm(mk.left - 2) }}>
              <span style={{ fontWeight: 700 }}>+</span>
              <span style={{ marginLeft: "1mm" }}>{mk.label}</span>
            </div>
          ))}
          <div style={{ position: "absolute", top: mm(4), left: mm(4), fontSize: "9pt" }}>
            หน้าทดสอบตำแหน่งฟอร์ม NCR — ทาบกับฟอร์มจริง: เครื่องหมาย + ควรตกที่จุดเริ่มของแต่ละช่อง
            (offset ปัจจุบัน X {settings.offsetXMm}mm / Y {settings.offsetYMm}mm · กระดาษ {settings.pageWidthMm}×{settings.pageHeightMm}mm)
          </div>
        </div>
      </div>
    </>
  );
}
