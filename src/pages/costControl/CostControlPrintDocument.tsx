import { type CostControl, costControlTotals, lineTotalCost } from "../../lib/costControl";
import type { Company } from "../../lib/storage";
import { fmt } from "../../lib/quotes";

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
 * | ไฮไลต์ราคาขาย / คิดเป็น% | `#FFFF00` |
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
const HIGHLIGHT_BG = "#FFFF00";

/** ค่าศูนย์บนฟอร์มจริงพิมพ์เป็นขีด ไม่ใช่ 0.00 */
const money = (n: number): string => (n === 0 ? "-" : fmt(n));

export function CostControlPrintDocument({ costControl: c, company }: { costControl: CostControl; company: Company }) {
  const totals = costControlTotals(c);

  const cell: React.CSSProperties = { border: LINE, padding: "2px 4px", verticalAlign: "middle" };
  const num: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  // ฿ กับตัวเลขอยู่ในช่องเดียวกัน ดันคนละฝั่ง — เคยแยกเป็นสองช่องแล้วมีเส้นคั่นกลางซึ่งฟอร์มจริงไม่มี
  const bahtRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: "6px" };
  const sumLabel: React.CSSProperties = { padding: "2px 6px", whiteSpace: "nowrap" };
  const sumBaht: React.CSSProperties = { padding: "2px 2px", textAlign: "left", width: "14px" };
  const sumValue: React.CSSProperties = { padding: "2px 6px", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", minWidth: "110px" };

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
            <td style={{ ...cell, width: "48%" }}>: {c.jobName}</td>
            <td style={{ ...cell, width: "14%" }}>Work type&nbsp;&nbsp;&nbsp;:</td>
            <td style={{ ...cell, textAlign: "center" }}>{c.workType}</td>
          </tr>
          <tr>
            <td style={cell}>Job order</td>
            <td style={cell}>: {c.jobOrder}</td>
            <td style={cell}>Date&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</td>
            <td style={{ ...cell, textAlign: "center" }}>{c.docDate}</td>
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
                <td style={num}>{isGroup ? "" : money(lineTotalCost(l))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* บล็อกสรุป — 1-5 ไม่มีเส้นขอบ ส่วนกำไร/คิดเป็น% อยู่ในกรอบ ตามฟอร์มจริง */}
      <table style={{ borderCollapse: "collapse", marginTop: "14px", marginLeft: "60px" }}>
        <tbody>
          <tr>
            <td style={sumLabel}>1.&nbsp; ราคาต้นทุน</td>
            <td style={sumBaht}>฿</td>
            <td style={sumValue}>{money(totals.totalCost)}</td>
          </tr>
          <tr>
            <td style={sumLabel}>2.&nbsp; ค่าดำเนินการ{c.operatingPct !== null ? `  (${fmt(c.operatingPct)}%)` : ""}</td>
            <td style={sumBaht}>฿</td>
            <td style={sumValue}>{money(totals.operatingCost)}</td>
          </tr>
          <tr>
            <td style={sumLabel}>3.&nbsp; Bubble cost{c.bubblePct !== null ? `  (${fmt(c.bubblePct)}%)` : ""}</td>
            <td style={sumBaht}>฿</td>
            <td style={sumValue}>{money(totals.bubbleCost)}</td>
          </tr>
          <tr>
            <td style={sumLabel}>4.&nbsp; Entertainment + Commission ลูกค้า</td>
            <td style={sumBaht}>฿</td>
            <td style={sumValue}>{money(totals.entertainmentCost)}</td>
          </tr>
          <tr>
            <td style={sumLabel}>5.&nbsp; ราคาขาย</td>
            <td style={{ ...sumBaht, background: HIGHLIGHT_BG }}>฿</td>
            <td style={{ ...sumValue, background: HIGHLIGHT_BG }}>{money(totals.sellingPrice)}</td>
          </tr>
          <tr>
            <td style={{ ...sumLabel, border: LINE }}>กำไร</td>
            <td style={{ ...sumBaht, border: LINE, borderRight: "none" }} />
            <td style={{ ...sumValue, border: LINE, borderLeft: "none" }}>{fmt(totals.profit)}</td>
          </tr>
          <tr>
            <td style={{ ...sumLabel, border: LINE }}>คิดเป็น%</td>
            <td style={{ ...sumBaht, border: LINE, borderRight: "none", background: HIGHLIGHT_BG }} />
            <td style={{ ...sumValue, border: LINE, borderLeft: "none", background: HIGHLIGHT_BG }}>{fmt(totals.profitPct)}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
        <tbody>
          <tr>
            <td style={{ border: "none", padding: "2px 6px", width: "120px", verticalAlign: "bottom" }}>หมายเหตุ :</td>
            <td style={{ border: "none", padding: "2px 6px", borderBottom: LINE, verticalAlign: "bottom" }}>{c.remarks}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "18px" }}>
        <tbody>
          <tr>
            <td style={{ border: "none", padding: "2px 6px", width: "50%" }}>
              Submitted by&nbsp; ...............................{c.submittedBy ? ` (${c.submittedBy})` : ""}
            </td>
            <td style={{ border: "none", padding: "2px 6px", width: "50%" }}>
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
