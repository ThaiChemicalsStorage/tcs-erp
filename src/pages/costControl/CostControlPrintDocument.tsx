import { type CostControl, lineTotalCost } from "../../lib/costControl";
import type { Company } from "../../lib/storage";
import { fmt } from "../../lib/quotes";
import { PrintSignatureLine } from "../../components/PrintSignature";
import { printDate, printText } from "../../lib/printFormat";

/**
 * ใบพิมพ์ Cost Control — **FM-SL-06 Rev.02 : 11/09/67**
 *
 * ถอดแบบจากฟอร์มจริงของบริษัท ไม่ได้ออกแบบเอง: ไฟล์ต้นทางคือ
 * `PQ202608-222-SC-SK …xlsx` (ชีต `COST CONTROL-SC`) และไฟล์ PDF ที่พิมพ์ออกมาจากชีตนั้น ทั้งสอง
 * อยู่ใต้ `reference/` ซึ่ง gitignore ไว้ — ไฟล์นี้จึงเป็นบันทึกถาวรของหน้าตาฟอร์ม
 *
 * เจ้าของสั่งไว้ชัดว่า *"รูปแบบ pdf ต้องออกมาตรงตามเหมือนใน pdf ที่ส่งให้ไปเลย"* สิ่งที่ตรวจแล้วว่าต้องตรง:
 *
 * | รายละเอียด | ค่าที่ใช้ |
 * |---|---|
 * | หัวจดหมาย | โลโก้ซ้าย ข้อความบริษัทขวา — **ไม่ใช่** `PrintLetterhead` ของแอป (อันนั้นมีแถบทองแนวตั้ง) |
 * | หัวเรื่อง | ช่องมีเส้นขอบเต็มความกว้าง เขียนว่า COST CONTROL |
 * | กล่องข้อมูลงาน | 2 แถว มีเส้นขอบ: Job Name/Work type · Job order/Date |
 * | พื้นหลังหัวกลุ่ม | `#F2DBDB` |
 * | พื้นหลังช่องรายละเอียดของรายการ | `#92D050` (เฉพาะช่องรายละเอียด ไม่ใช่ทั้งแถว) |
 * | ไฮไลต์ราคาขาย / คิดเป็น% | `#FFFF00` — **เลิกใช้ 2026-08-31 พร้อมกับบล็อกสรุปท้ายใบ** |
 * | ช่องต้นทุน | ฿ ชิดซ้าย เลขชิดขวา **อยู่ในช่องเดียวกัน ไม่มีเส้นคั่น** (Excel เก็บเป็นเซลล์เดียว รูปแบบบัญชี) |
 * | ค่าศูนย์ | พิมพ์เป็น `-` ไม่ใช่ 0.00 |
 *
 * สามสีข้างบนอ่านมาจาก `fgColor` ของเซลล์ในไฟล์ Excel จริง ไม่ได้กะจากภาพ
 *
 * ภาษาไทยตายตัว ห้ามเรียก `useI18n` — กฎใบพิมพ์ใน docs/CLAUDE.md
 */

/** ข้อความที่ไม่มีในโปรไฟล์บริษัท — แบบเดียวกับที่ใบส่งมอบสินค้าทำ (`DeliveryOrderPrintDocument.tsx`) */
const LETTERHEAD = {
  nameEn: "Thai Chemicals Storage Company Limited",
  fax: "02-5833617",
};
const FORM_CODE = "FM-SL-06 Rev.02 : 11/09/67";

/**
 * เว้นขอบขวาไว้ 2px — ไม่ใช่การจัดหน้า แต่กันเส้นขอบขวาหายตอนพิมพ์
 *
 * ตารางกว้าง 100% ของพื้นที่พิมพ์ A4 (186mm ≈ 703px) และ `border-collapse: collapse` วางเส้นขอบนอกสุด
 * **ถัดจาก** ขอบขวาของตาราง ไม่ใช่ข้างใน — ตรวจจาก PDF ที่พิมพ์ออกมาจริง เส้นแนวตั้งขวาสุดถูกวาดที่
 * x = 703→704 ขณะที่กระดาษมีถึงแค่ 703 เส้นจึงตกนอกหน้าและหายไปทั้งเส้น (เจ้าของแจ้ง 2026-08-28
 * ว่า "ตอนกดปริ้นเป็น A4 ขอบมันมาไม่ครบ") · เส้นซ้ายไม่มีปัญหาเพราะวาดที่ x = 0→1 ซึ่งอยู่ในหน้าพอดี
 */
const EDGE_GUARD = "2px";

const LINE = "1px solid #000";
const GROUP_BG = "#F2DBDB";
const ITEM_BG = "#92D050";
// HIGHLIGHT_BG (`#FFFF00`) เคยใช้ไฮไลต์ราคาขายกับคิดเป็น% — ถอดออกพร้อมบล็อกสรุปท้ายใบ 2026-08-31

/** ค่าศูนย์บนฟอร์มจริงพิมพ์เป็นขีด ไม่ใช่ 0.00 */
const money = (n: number): string => (n === 0 ? "-" : fmt(n));

export function CostControlPrintDocument({ costControl: c, company }: { costControl: CostControl; company: Company }) {
  const cell: React.CSSProperties = { border: LINE, padding: "2px 4px", verticalAlign: "middle" };
  const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  // ฿ กับตัวเลขอยู่ในช่องเดียวกัน ดันคนละฝั่ง — เคยแยกเป็นสองช่องแล้วมีเส้นคั่นกลางซึ่งฟอร์มจริงไม่มี
  const bahtRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "6px" };
  // สไตล์ของบล็อกสรุป (sumLabel/sumBaht/sumValue) ถูกลบไปพร้อมบล็อกเมื่อ 2026-08-31

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif", color: "#000", fontSize: "11px", paddingRight: EDGE_GUARD }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>

      {/* หัวจดหมาย — โลโก้ซ้าย ข้อความขวา ตามฟอร์มจริง */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px" }}>
        <tbody>
          <tr>
            <td style={{ width: "150px", verticalAlign: "middle", textAlign: "center", border: "none", padding: 0 }}>
              {company.logoDataUrl ? <img src={company.logoDataUrl} alt="" style={{ width: "96px", height: "auto" }} /> : null}
            </td>
            <td style={{ verticalAlign: "middle", border: "none", padding: 0, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700 }}>{company.name}</div>
              <div>{LETTERHEAD.nameEn}</div>
              <div>{company.address}</div>
              <div>
                Tel : {company.phone} Fax :{LETTERHEAD.fax} E-mail : {company.email}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* หัวเรื่อง + กล่องข้อมูลงาน — เป็นตารางเดียวกันแบบในฟอร์ม */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px" }}>
        <tbody>
          <tr>
            <td colSpan={4} style={{ ...cell, textAlign: "center", fontWeight: 700 }}>COST CONTROL</td>
          </tr>
          <tr>
            <td style={{ ...cell, width: "12%" }}>Job Name</td>
            <td style={{ ...cell, width: "48%" }}>: {printText(c.jobName)}</td>
            <td style={{ ...cell, width: "14%" }}>Work type&nbsp;&nbsp;&nbsp;:</td>
            <td style={{ ...cell, textAlign: "center" }}>{printText(c.workType)}</td>
          </tr>
          <tr>
            <td style={cell}>Job order</td>
            <td style={cell}>: {printText(c.jobOrder)}</td>
            <td style={cell}>Date&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</td>
            <td style={{ ...cell, textAlign: "center" }}>{printDate(c.docDate)}</td>
          </tr>
        </tbody>
      </table>

      {/* ปล่อยให้เบราว์เซอร์จัดความกว้างคอลัมน์เอง — เคยตั้ง table-layout: fixed พร้อม % ตายตัว
          แล้วตัวเลขในคอลัมน์สุดท้ายถูกตัดหายไปตอนพิมพ์ เพราะเนื้อหา nowrap ล้นออกนอกช่องที่กำหนดไว้
          แล้วโดน container ของหน้าเฉือนทิ้ง · ใส่ความกว้างเป็นคำใบ้เฉพาะคอลัมน์แคบก็พอ */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...cell, width: "5%" }}>ลำดับที่</th>
            <th style={cell}>รายละเอียด</th>
            <th style={{ ...cell, width: "8%" }}>Model</th>
            <th style={{ ...cell, width: "10%" }}>supplier name</th>
            <th style={{ ...cell, width: "6%" }}>จำนวน</th>
            <th style={{ ...cell, width: "6%" }}>หน่วย</th>
            <th style={cell}>ต้นทุน</th>
            <th style={cell}>ต้นทุนรวมทั้งหมด</th>
          </tr>
        </thead>
        <tbody>
          {c.lines.map((l) => {
            const isGroup = l.kind === "group";
            return (
              <tr key={l.id}>
                <td style={{ ...cell, textAlign: "center" }}>{l.seq}</td>
                <td style={{
                  ...cell,
                  paddingLeft: l.kind === "sub" ? "14px" : "4px",
                  background: isGroup ? GROUP_BG : l.kind === "item" ? ITEM_BG : undefined,
                }}>{l.description}</td>
                <td style={cell}>{isGroup ? "" : l.model}</td>
                <td style={{ ...cell, textAlign: "center" }}>{isGroup ? "" : l.supplierName}</td>
                <td style={{ ...cell, textAlign: "center" }}>{isGroup || l.qty === null ? "" : fmt(l.qty)}</td>
                <td style={{ ...cell, textAlign: "center" }}>{isGroup ? "" : l.unit}</td>
                <td style={num}>
                  {isGroup || l.unitCost === null ? "" : (
                    <span style={bahtRow}><span>฿</span><span>{money(l.unitCost)}</span></span>
                  )}
                </td>
                {/* ยังไม่กรอกต้นทุน = ยังไม่มียอดรวม ปล่อยว่างให้เหมือนช่องต้นทุน ไม่พิมพ์ "-" ซึ่ง
                    แปลว่า "ศูนย์" บนฟอร์มนี้ — ใบที่นำเข้ามาใหม่ยังไม่มีราคาเลยทั้งใบ */}
                <td style={num}>{isGroup || l.unitCost === null ? "" : money(lineTotalCost(l))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/*
        บล็อกสรุปท้ายใบทั้งบล็อก (1. ราคาต้นทุน … 5. ราคาขาย + กำไร + คิดเป็น%) **ถอดออก 2026-08-31**
        ตามที่เจ้าของสั่ง รวมถึงยอดรวมต้นทุนที่เหลือไว้บรรทัดเดียวตอนแรก ซึ่งเจ้าของสั่งให้เอาออกด้วย
        ("ทำไมยังมีต้นทุนรวมอยู่ เอาออกไปด้วย")

        **ใบนี้จึงต่างจากฟอร์มจริง FM-SL-06 ตรงนี้ โดยตั้งใจ ไม่ใช่ตกหล่น** — ใบพิมพ์จบที่ตารางรายการ
        แล้วต่อด้วยหมายเหตุ/ผู้ลงนามเลย ไม่มียอดรวมที่ไหนอีก · คนอ่านยังเห็นต้นทุนรายบรรทัดในตาราง
      */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
        <tbody>
          <tr>
            <td style={{ border: "none", padding: "2px 6px", width: "120px", verticalAlign: "bottom" }}>หมายเหตุ :</td>
            <td style={{ border: "none", padding: "2px 6px", borderBottom: LINE, verticalAlign: "bottom" }}>{printText(c.remarks)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "18px" }}>
        <tbody>
          <tr>
            {/* ลายเซ็นจริงของคนสร้างใบและคนที่กดอนุมัติ (เจ้าของสั่ง 2026-09-02) */}
            <td style={{ border: "none", padding: "2px 6px", width: "50%" }}>
              <PrintSignatureLine userId={c.createdBy} height={26} />
              Submitted by&nbsp; ...............................{c.submittedBy ? ` (${c.submittedBy})` : ""}
            </td>
            <td style={{ border: "none", padding: "2px 6px", width: "50%" }}>
              <PrintSignatureLine userId={c.approvedByUserId} height={26} />
              Approved by&nbsp; ...............................{c.approvedBy ? ` (${c.approvedBy})` : ""}
            </td>
          </tr>
          <tr>
            <td style={{ border: "none", padding: "2px 6px" }}>Date (ว/ด/ป)&nbsp; ...................................</td>
            <td style={{ border: "none", padding: "2px 6px" }}>Date (ว/ด/ป)&nbsp; ...................................</td>
          </tr>
        </tbody>
      </table>

      <div style={{ textAlign: "right", marginTop: "10px" }}>{FORM_CODE}</div>
    </div>
  );
}
