import type { CompanyHeaderInfo } from "../../lib/storage";
import { batchTotals, billerOf, type ReceivingReport, type ReceivingReportPrintInfo } from "../../lib/receivingReport";
import { bahtText } from "../../lib/bahtText";
import { addDaysIso, printDateShortBE, splitAddressTwoLines } from "../../lib/printFormat";

/**
 * ใบพิมพ์ใบรับสินค้า — **ฟอร์ม FM-ST-01 Rev.01 ของโปรแกรมบัญชีเดิม** (2026-09-23)
 *
 * เจ้าของส่งตัวอย่างจริงมาสองใบ (`reference/company/ใบรับสินค้า.pdf` = RR6909135, `ใบรับ 2.pdf` = RR6909134)
 * ขนาดทุกตัวในไฟล์นี้วัดจากไฟล์ตัวอย่าง (A4 กว้าง 210mm) แบบเดียวกับใบจ่าย/ใบรับคืน (`StoreSlipPrint.tsx`)
 *
 * **หนึ่งรอบการรับ = หนึ่งใบ** — ในโปรแกรมเดิมใบรับสินค้าหนึ่งใบคือบิลของผู้ขายหนึ่งใบ (มี "เลขที่บิล" ช่องเดียว
 * และยอดเงินของบิลนั้น) แต่ใบรับสินค้าของระบบนี้รับได้หลายรอบในใบเดียว แต่ละรอบมีเลขใบกำกับของตัวเอง
 * จึงพิมพ์รอบละหนึ่งฟอร์ม (`batchId` = พิมพ์เฉพาะรอบนั้น, ไม่ระบุ = ทุกรอบต่อกัน) · ใบที่ยังไม่ได้รับของเลย
 * พิมพ์รายการที่สั่งไว้พร้อมราคาสั่งซื้อ (ใช้เป็นใบตรวจรับ) และเว้นเลขที่บิลไว้
 *
 * ข้อมูลที่ไม่ได้อยู่ในใบรับสินค้า (รหัสผู้ขาย เครดิต วันที่ใบสั่งซื้อ ขนส่งโดย เลขใบขอซื้อ พิมพ์ครั้งที่) มากับ
 * การกดพิมพ์ — ดู `ReceivingReportPrintInfo` · ช่อง "คลัง" และ "ส่วนลด" ระบบนี้ไม่มีข้อมูล พิมพ์เป็นช่องว่าง
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n` — เอกสารที่พิมพ์ออกไปต้องไม่เปลี่ยนภาษาตามคนกด (ดู docs/CLAUDE.md)
 */

interface SlipLine {
  key: string;
  /** บรรทัดแรก = รหัส + รายการ · ที่เหลือ = รายละเอียดย่อยจากใบสั่งซื้อ */
  text: string[];
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
}

interface Slip {
  key: string;
  seq: number;
  receivedDate: string;
  invoiceNumber: string;
  invoiceDate: string;
  vatRate: number | null;
  subtotal: number;
  vatAmt: number;
  total: number;
  /** เครดิต/ครบกำหนดของรอบนี้ (2026-09-24) — ว่าง = ใช้เครดิตของใบสั่งซื้อจาก printInfo */
  creditDays: number | null;
  dueDate: string;
  remark: string;
  postedByName: string;
  lines: SlipLine[];
}

const ROWS_PER_PAGE = 12;
const COLS = [10.7, 80.4, 10.5, 30.6, 21.7, 19.4, 24.7];
const BOX_WIDTH = 198;
const ROW_H = 6.4;
const LINE = "1.3px solid #000";
// ฟอร์ม FM-ST-01 พิมพ์ตัวเล็กกว่าใบจ่าย/ใบรับคืน — วัดจากตัวอย่าง: รายการสินค้า 1.66mm/อักษร, ที่อยู่บริษัท ~11.3px
const BODY_FONT = "10.8px";
const HEAD_FONT = "11.3px";
const mono = "'Courier New', 'Noto Sans Thai', monospace";
const thai = "'Noto Sans Thai', 'Tahoma', sans-serif";

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
/** "18/9/69" — ฟอร์มเดิมเขียนวันที่ใบขอซื้อต่อท้ายเลขที่แบบไม่เติมศูนย์ */
function shortDateNoPad(value: string): string {
  const [d, m, y] = printDateShortBE(value).split("/");
  return d ? `${Number(d)}/${Number(m)}/${y}` : "";
}
function slipsOf(doc: ReceivingReport, batchId?: string): Slip[] {
  const lineById = new Map(doc.lines.map((l) => [l.id, l]));
  const textOf = (lineId: string) => {
    const l = lineById.get(lineId);
    return l ? [`${l.productCode} ${l.description}`.trim(), ...(l.subDetails ?? []).filter((s) => s.trim())] : [""];
  };
  const batches = doc.batches.filter((b) => !batchId || b.id === batchId);
  if (batches.length > 0) {
    return batches.map((b) => ({
      key: b.id, seq: b.seq, receivedDate: b.receivedDate, invoiceNumber: b.invoiceNumber, invoiceDate: b.invoiceDate,
      vatRate: b.vatRate, subtotal: b.subtotal, vatAmt: b.vatAmt, total: b.total, remark: b.remark, postedByName: b.postedByName,
      creditDays: b.creditDays ?? null, dueDate: b.dueDate ?? "",
      lines: b.lines.map((bl) => ({
        key: bl.lineId, text: textOf(bl.lineId), qty: bl.qty, unit: lineById.get(bl.lineId)?.unit ?? "", unitPrice: bl.unitPrice, amount: bl.amount,
      })),
    }));
  }
  // ยังไม่ได้รับของ — พิมพ์รายการที่สั่งไว้ไปตรวจรับ
  const lines = doc.lines.map((l) => ({
    key: l.id, text: textOf(l.id), qty: l.qtyOrdered, unit: l.unit, unitPrice: l.unitPriceOrdered, amount: round2(l.qtyOrdered * l.unitPriceOrdered),
  }));
  const t = batchTotals(lines, doc.orderVatRate, { priceType: doc.priceType, discount: doc.orderDiscount, discountMode: doc.orderDiscountMode });
  return [{
    key: "ordered", seq: 0, receivedDate: "", invoiceNumber: "", invoiceDate: "", vatRate: t.vatRate,
    subtotal: t.subtotal, vatAmt: t.vatAmt, total: t.total, creditDays: doc.creditDays ?? null, dueDate: "", remark: "", postedByName: "", lines,
  }];
}

/** แบ่งหน้า — บรรทัดสินค้าหนึ่งตัว (รวมรายละเอียดย่อย) ไม่ถูกหั่นข้ามหน้า */
function paginate(lines: SlipLine[]): SlipLine[][] {
  const pages: SlipLine[][] = [[]];
  let used = 0;
  for (const l of lines) {
    const h = Math.min(l.text.length, ROWS_PER_PAGE);
    if (used + h > ROWS_PER_PAGE && pages[pages.length - 1].length > 0) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(l);
    used += h;
  }
  return pages;
}

export function ReceivingReportPrintDocument({ doc, companyHeader, printInfo, batchId }: {
  doc: ReceivingReport;
  companyHeader: CompanyHeaderInfo;
  printInfo: ReceivingReportPrintInfo | null;
  /** พิมพ์เฉพาะรอบนี้ — ไม่ระบุ = ทุกรอบ */
  batchId?: string;
}) {
  const info: ReceivingReportPrintInfo = printInfo ?? {
    printCount: 0, vendorCode: "", creditDays: null, purchaseOrderDate: "", shippingText: "", headerRemark: "",
    purchaseRequestNumber: "", purchaseRequestDate: "",
  };
  // ผู้ออกบิลที่สโตร์กรอกเอง (2026-09-24) พิมพ์แทนผู้ขาย — เป็นชื่อเดียวกับที่ตั้งหนี้
  const biller = billerOf(doc);
  const [addr1, addr2] = splitAddressTwoLines(biller.address);
  const printedAt = new Date();
  const printedAtText = `${printDateShortBE(printedAt.toLocaleDateString("sv-SE"))} ${printedAt.toLocaleTimeString("en-GB", { hour12: false })}`;
  const multi = doc.batches.length > 1;
  const colLeft = (i: number) => COLS.slice(0, i).reduce((a, b) => a + b, 0);
  const columnRules = (height: number, upTo = 6) => Array.from({ length: upTo }, (_, i) => i + 1).map((i) => (
    <div key={i} style={{ position: "absolute", top: 0, left: `${colLeft(i)}mm`, height: `${height}mm`, borderLeft: LINE }} />
  ));

  const pages = slipsOf(doc, batchId).flatMap((slip) => paginate(slip.lines).map((lines, idx, all) => ({ slip, lines, last: idx === all.length - 1 })));

  return (
    <div className="hidden print:block" style={{ fontFamily: mono, fontWeight: 400, color: "#000" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 0 } }"}</style>
      {pages.map(({ slip, lines, last }, pageIdx) => {
        const lastPage = pageIdx === pages.length - 1;
        const billDate = slip.invoiceDate || slip.receivedDate;
        const creditDays = slip.creditDays ?? info.creditDays;
        const dueDate = slip.dueDate || (creditDays !== null && billDate ? addDaysIso(billDate, creditDays) : "");
        const footerRemarks = [
          info.purchaseRequestNumber ? `${info.purchaseRequestNumber}:${shortDateNoPad(info.purchaseRequestDate)}` : "",
          ...slip.remark.split(/\r?\n/),
        ].map((s) => s.trim()).filter(Boolean);
        let row = 0;
        return (
          <div key={`${slip.key}-${pageIdx}`} style={{
            width: "210mm", height: "296mm", boxSizing: "border-box", padding: "5mm 0 0 5.5mm", overflow: "hidden",
            breakAfter: lastPage ? "auto" : "page", pageBreakAfter: lastPage ? "auto" : "always",
          }}>
            {/* หัวบริษัท */}
            <div style={{ position: "relative", width: `${BOX_WIDTH}mm`, height: "26mm", fontSize: BODY_FONT }}>
              <div style={{ fontFamily: thai, fontSize: "17.5px", fontWeight: 700, letterSpacing: "0.3em", whiteSpace: "nowrap", marginLeft: "-1mm", lineHeight: 1.3 }}>{companyHeader.name}</div>
              <div style={{ position: "absolute", top: "7.6mm", left: "-1mm", whiteSpace: "nowrap", fontSize: HEAD_FONT }}>{companyHeader.address}</div>
              <div style={{ position: "absolute", top: "13.8mm", left: "-1mm", whiteSpace: "nowrap", fontSize: HEAD_FONT }}>{companyHeader.phone}</div>
              <div style={{ position: "absolute", top: "12.6mm", left: "135.5mm", fontFamily: thai, fontSize: "17px", fontWeight: 700, letterSpacing: "0.2em", whiteSpace: "nowrap" }}>ใบรับสินค้า</div>
              <div style={{ position: "absolute", top: "20mm", left: "-1mm", whiteSpace: "pre", fontSize: HEAD_FONT }}>
                {`เลขประจำตัวผู้เสียภาษี ${companyHeader.taxId}        ${companyHeader.branchName || "สำนักงานใหญ่"}`}
              </div>
            </div>

            {/* หัวใบ: ผู้จำหน่ายซ้าย / เลขที่-วันที่-เครดิต-ใบสั่งซื้อ ขวา */}
            <div style={{ position: "relative", width: `${BOX_WIDTH}mm`, height: "46mm", marginTop: "5.5mm", fontSize: BODY_FONT }}>
              {([
                [0, `ผู้จำหน่าย   ${info.vendorCode}`],
                [1, biller.name],
                [2, addr1],
                [3, addr2],
                [4, `เลขประจำตัวผู้เสียภาษี      ${biller.taxId}`],
                [5, `เลขที่บิล      ${slip.invoiceNumber}${slip.invoiceDate ? `      ลวท.${printDateShortBE(slip.invoiceDate)}` : ""}`],
                [6, `หมายเหตุ    ${info.headerRemark}`],
              ] as const).map(([r, text]) => (
                <div key={r} style={{ position: "absolute", top: `${r * 6.2}mm`, left: "3mm", width: "100mm", whiteSpace: "pre", overflow: "hidden" }}>{text}</div>
              ))}
              {([
                [0, "ใบรับสินค้า#", `${doc.documentNumber || doc.id}${multi && slip.seq ? ` (รับครั้งที่ ${slip.seq})` : ""}`],
                [1, "วันที่", printDateShortBE(slip.receivedDate)],
                [2, "", doc.jobCode ? `JOB NO. ${doc.jobCode}` : ""],
                [3, creditDays !== null ? `เครดิต   ${creditDays} วัน` : "", dueDate ? `ครบกำหนด     ${printDateShortBE(dueDate)}` : ""],
                [5, "ใบสั่งซื้อ#", doc.purchaseOrderNumber ? `${doc.purchaseOrderNumber}   ${info.purchaseOrderDate ? `วันที่ ${printDateShortBE(info.purchaseOrderDate)}` : ""}` : ""],
                [6, "ขนส่งโดย", info.shippingText],
              ] as const).map(([r, label, value]) => (
                <div key={r}>
                  <div style={{ position: "absolute", top: `${r * 6.2}mm`, left: "104mm", whiteSpace: "pre" }}>{label}</div>
                  <div style={{ position: "absolute", top: `${r * 6.2}mm`, left: "136.5mm", width: "61mm", whiteSpace: "pre", overflow: "hidden" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* ตาราง */}
            <div style={{ position: "relative", width: `${BOX_WIDTH}mm`, marginTop: "1.5mm", border: LINE, fontSize: BODY_FONT }}>
              <div style={{ position: "relative", height: "12.8mm", borderBottom: LINE }}>
                {columnRules(12.8)}
                {["No.", "รหัสสินค้า/รายละเอียด", "คลัง", "จำนวน", "หน่วยละ", "ส่วนลด", "จำนวนเงิน"].map((h, i) => (
                  <div key={h} style={{
                    position: "absolute", top: 0, left: `${colLeft(i)}mm`, width: `${COLS[i]}mm`, height: "12.8mm",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{h}</div>
                ))}
              </div>
              <div style={{ position: "relative", height: "76.7mm", borderBottom: LINE }}>
                {columnRules(76.7)}
                {lines.map((l) => {
                  const top = 3.3 + row * ROW_H;
                  row += Math.min(l.text.length, ROWS_PER_PAGE);
                  const cell = (col: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
                    position: "absolute", top: `${top}mm`, left: `${colLeft(col)}mm`, width: `${COLS[col]}mm`,
                    lineHeight: `${ROW_H}mm`, whiteSpace: "nowrap", overflow: "hidden", boxSizing: "border-box", ...extra,
                  });
                  const no = pages.slice(0, pageIdx).filter((p) => p.slip === slip).reduce((n, p) => n + p.lines.length, 0)
                    + lines.indexOf(l) + 1;
                  return (
                    <div key={l.key}>
                      <div style={cell(0, { textAlign: "center" })}>{no}</div>
                      <div style={cell(1, { paddingLeft: "3mm" })}>
                        {l.text.slice(0, ROWS_PER_PAGE).map((t, i) => <div key={i} style={{ overflow: "hidden" }}>{t}</div>)}
                      </div>
                      <div style={cell(3, { display: "flex" })}>
                        <span style={{ width: "16.9mm", textAlign: "right", flexShrink: 0 }}>{money(l.qty)}</span>
                        <span style={{ overflow: "hidden" }}>{l.unit}</span>
                      </div>
                      <div style={cell(4, { textAlign: "right", paddingRight: "1.8mm" })}>{money(l.unitPrice)}</div>
                      <div style={cell(6, { textAlign: "right", paddingRight: "1mm" })}>{money(l.amount)}</div>
                    </div>
                  );
                })}
              </div>

              {last ? (
                <>
                  {/* ยอดเงิน — ไม่มีส่วนลดท้ายบิลและเงินมัดจำในรอบการรับ จึงเป็นศูนย์ตามฟอร์ม */}
                  <div style={{ position: "relative", height: "48.6mm", borderBottom: LINE }}>
                    <div style={{ position: "absolute", top: 0, left: `${colLeft(6)}mm`, height: "48.6mm", borderLeft: LINE }} />
                    <div style={{ position: "absolute", top: "3.3mm", left: "1.3mm" }}>หมายเหตุ</div>
                    {footerRemarks.slice(0, 4).map((t, i) => (
                      <div key={i} style={{ position: "absolute", top: `${9.5 + i * 6.26}mm`, left: "3mm", width: "95mm", whiteSpace: "pre", overflow: "hidden" }}>{t}</div>
                    ))}
                    <div style={{ position: "absolute", top: `${3.3 + 6 * 6.26}mm`, left: "1.3mm", width: "118mm", whiteSpace: "nowrap", overflow: "hidden" }}>
                      {`ตัวอักษร:${bahtText(slip.total)}.`}
                    </div>
                    {([
                      [<>รวมเป็นเงิน</>, money(slip.subtotal)],
                      [<><u>หัก</u>ส่วนลด</>, money(0)],
                      [<>ยอดหลังหักส่วนลด</>, money(slip.subtotal)],
                      [<><u>หัก</u>เงินมัดจำ{"      #"}</>, money(0)],
                      [<>จำนวนเงินหลังหักมัดจำ</>, money(slip.subtotal)],
                      [<>จำนวนภาษีมูลค่าเพิ่ม{"      "}{slip.vatRate !== null ? `${slip.vatRate.toFixed(2)}%` : ""}</>, money(round2(slip.vatAmt))],
                      [<>จำนวนเงินรวมทั้งสิ้น</>, money(round2(slip.total))],
                    ] as const).map(([label, value], i) => (
                      <div key={i}>
                        <div style={{ position: "absolute", top: `${3.3 + i * 6.26}mm`, left: "119.6mm", whiteSpace: "pre" }}>{label}</div>
                        <div style={{ position: "absolute", top: `${3.3 + i * 6.26}mm`, left: `${colLeft(6)}mm`, width: `${COLS[6]}mm`, textAlign: "right", paddingRight: "1.8mm", boxSizing: "border-box" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {/* ช่องเซ็น + ประวัติการพิมพ์ */}
                  <div style={{ position: "relative", height: "29mm" }}>
                    <div style={{ position: "absolute", top: "6.2mm", left: "3mm", whiteSpace: "pre" }}>{"ชื่อผู้รับสินค้า ____________________"}</div>
                    <div style={{ position: "absolute", top: "6.2mm", left: "98mm", whiteSpace: "pre" }}>{"ชื่อผู้ตรวจสอบ ____________________"}</div>
                    <div style={{ position: "absolute", top: "12.2mm", left: "3mm", whiteSpace: "pre" }}>{"วันที่          ___/___/___"}</div>
                    <div style={{ position: "absolute", top: "12.2mm", left: "98mm", whiteSpace: "pre" }}>{"วันที่          ___/___/___"}</div>
                    <div style={{ position: "absolute", top: "18.4mm", left: "3mm", whiteSpace: "pre" }}>พิมพ์โดย</div>
                    <div style={{ position: "absolute", top: "18.4mm", left: "60.5mm", whiteSpace: "pre" }}>
                      {`วันที่      ${printedAtText}พิมพ์ครั้งที่      ${info.printCount || ""}      บันทึกโดย   ${slip.postedByName}`}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ height: "4mm" }} />
              )}
            </div>
            <div style={{ width: `${BOX_WIDTH - 5}mm`, textAlign: "right", marginTop: "3.5mm", fontSize: BODY_FONT }}>FM-ST-01 Rev.01 : 02/06/69</div>
          </div>
        );
      })}
    </div>
  );
}
