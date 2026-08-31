import type { PurchaseRequest } from "../../lib/purchaseRequest";
import type { CompanyHeaderInfo } from "../../lib/storage";
import { formatArDocDate } from "../../lib/accounting";

/**
 * ฟอร์มพิมพ์ใบขอซื้อ — คัดตามฟอร์มจริง FM-PU-05 Rev.02 : 03/11/68
 *
 * **2026-08-31: ทาบกับใบจริงที่กรอกและเซ็นแล้ว** (`reference/company/ED6908038.pdf`) ก่อนหน้านี้
 * ไฟล์นี้เขียนกำกับตัวเองไว้ว่าเป็น "first-pass … not yet pixel-calibrated" `reference/` ถูก
 * gitignore ไว้ คอมเมนต์นี้จึงเป็น**บันทึกถาวรของฟอร์ม** แบบเดียวกับที่ `productionOrder.ts` ทำ
 *
 * โครงหน้ากระดาษ:
 *   - หัวจดหมาย**ภาษาไทย** ชิดซ้าย: ชื่อบริษัท / ที่อยู่ / เบอร์สำนักงาน+โรงงาน / เลขประจำตัวผู้เสียภาษี
 *   - ชิดขวาระดับเดียวกัน: "ใบขอซื้อ" แล้วบรรทัดล่างวงเล็บ**ชื่อแผนกเจ้าของเอกสาร** — ใบตัวอย่างเป็น
 *     "(ฝ่ายโครงการ)" ระบบอ่านจาก `ownerDepartment` เพราะฝ่ายผลิตกับฝ่ายโครงการใช้ฟอร์มเดียวกัน
 *   - สองคอลัมน์: ซ้าย หมายเหตุ(รหัสงาน)/สถานที่ส่งของ/โทร./ติดต่อ
 *     ขวา เลขที่ใบขออนุมัติซื้อ/วันที่/วันที่รับของ
 *
 * ⚠️ **กระดาษมีช่อง ผู้จำหน่าย / โทร. / เครดิต / ขนส่งโดย แต่เราไม่พิมพ์แล้วตั้งแต่ 2026-08-31**
 * เจ้าของสั่งไว้ว่าใบขอซื้อไม่ต้องมีสามช่องนั้น และใบตัวอย่างที่กรอกจริงก็เว้นว่างไว้ทั้งหมด —
 * คนขอซื้อไม่ใช่คนกรอก ฝ่ายจัดซื้อกรอกทีหลังตอนออกใบสั่งซื้อ (ซึ่งเลือกจากทะเบียนผู้ขายแทน)
 *   - ตาราง 7 คอลัมน์ ปิดท้ายด้วย "ให้ซื้อ" ที่**เว้นว่างไว้เขียนมือ** (ไม่ใช่ราคาประเมิน — ดูหมายเหตุล่าง)
 *   - กล่อง "หมายเหตุ" ใต้ตาราง
 *   - ลงนาม 3 ช่อง โดย**ชื่อพิมพ์อยู่เหนือเส้น** ป้ายอยู่ใต้เส้น และวันที่เป็น ____/____/______
 *   - บรรทัดสุดท้าย "พิมพ์โดย … วันที่ … บันทึกโดย …" แล้วรหัสฟอร์มชิดขวา
 *
 * **`estimatedCost` ไม่ถูกพิมพ์อีกต่อไป** — คอลัมน์ที่ 7 บนกระดาษจริงคือ "ให้ซื้อ" ซึ่งเป็นช่องว่าง
 * ให้ฝ่ายจัดซื้อเขียนเอง ไม่ใช่ราคาประเมินของผู้ขอ ราคาประเมินยังอยู่ครบทั้งในหน้าแก้ไขและฐานข้อมูล
 * ถ้าภายหลังยืนยันว่าฝ่ายจัดซื้อใช้ราคาบนใบพิมพ์จริง ให้เพิ่มเป็นคอลัมน์ที่ 8 อย่าไปทับ "ให้ซื้อ"
 *
 * "พิมพ์ครั้งที่ N" บนใบตัวอย่างมาจากซอฟต์แวร์ Express เดิม — ระบบนี้บันทึกการพิมพ์ลง audit log
 * (`POST /:id/print`) แต่ไม่เคยอ่านจำนวนครั้งกลับมาที่ฝั่งหน้าจอ จึงเว้นตัวเลขนั้นไว้ ไม่เดา
 *
 * Always renders in Thai regardless of the user's UI language — same fixed-language precedent as
 * every other print document in this app (see JobOrderPrintDocument.tsx for the full reasoning).
 */

const FORM_CODE = "FM-PU-05 Rev.02 : 03/11/68";
const DOC_FONT = "'Times New Roman', 'Noto Serif Thai', serif";
const LINE = "1px solid #000";
/** ดู JobOrderPrintDocument.tsx — เส้นขอบขวาสุดของตารางเต็มความกว้างหลุดขอบกระดาษถ้าไม่กันไว้ */
const EDGE_GUARD = "2px";
/** จำนวนแถวขั้นต่ำของตาราง เพื่อให้กล่องหมายเหตุกับช่องเซ็นลงไปอยู่ท้ายหน้าเหมือนกระดาษ */
const MIN_BODY_ROWS = 10;

/** ชื่อแผนกในวงเล็บใต้หัวเรื่อง — ฝ่ายผลิตกับฝ่ายโครงการใช้ฟอร์มเดียวกัน ต่างกันที่บรรทัดนี้ */
function departmentLabel(ownerDepartment: PurchaseRequest["ownerDepartment"]): string {
  if (ownerDepartment === "production") return "(ฝ่ายผลิต)";
  if (ownerDepartment === "general") return "";
  return "(ฝ่ายโครงการ)";
}

/** ป้าย + ค่า วางเป็นสองคอลัมน์คงที่ เพื่อให้ค่าของทุกบรรทัดตรงแนวกันเหมือนกระดาษ */
function Field({ label, value, labelWidth = "112px" }: { label: string; value: string; labelWidth?: string }) {
  return (
    <div style={{ display: "flex", gap: "8px", minHeight: "16px" }}>
      <span style={{ width: labelWidth, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1 }}>{value || " "}</span>
    </div>
  );
}

export function PurchaseRequestPrintDocument({
  purchaseRequest: p,
  companyHeader,
}: {
  purchaseRequest: PurchaseRequest;
  companyHeader: CompanyHeaderInfo;
}) {
  const padding = Math.max(0, MIN_BODY_ROWS - p.lines.length);
  const cell: React.CSSProperties = { border: LINE, padding: "2px 5px", verticalAlign: "top" };
  const headCell: React.CSSProperties = { ...cell, textAlign: "center", fontWeight: 700 };
  const dept = departmentLabel(p.ownerDepartment);

  // ใบจริงเขียนวันที่แบบ พ.ศ. สองหลัก (26/08/69) — ตัวช่วยตัวนี้มีอยู่แล้วสำหรับเอกสารบัญชี
  // ซึ่งลอกรูปแบบมาจากซอฟต์แวร์ Express ตัวเดียวกับที่ออกใบขอซื้อใบนี้
  const d = (iso: string) => (iso ? formatArDocDate(iso) : "");

  /** ช่องเซ็นหนึ่งช่อง — ชื่ออยู่เหนือเส้น ป้ายอยู่ใต้เส้น ตรงตามกระดาษ */
  const signCell = (label: string, name: string) => (
    <td style={{ width: "33.33%", padding: "0 10px", verticalAlign: "bottom", textAlign: "center" }}>
      <p style={{ margin: 0, minHeight: "30px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>{name || " "}</p>
      <div style={{ borderBottom: LINE }} />
      <p style={{ margin: "2px 0 0" }}>{label}</p>
      <p style={{ margin: "6px 0 0" }}>____/____/______</p>
    </td>
  );

  return (
    <div
      className="hidden print:block"
      style={{ fontFamily: DOC_FONT, fontSize: "11px", color: "#000", background: "#fff", paddingRight: EDGE_GUARD }}
    >
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm } }"}</style>

      {/* หัวจดหมายไทย ซ้าย + หัวเรื่องขวา */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "20px", marginBottom: "10px" }}>
        <div>
          <p style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>{companyHeader.name}</p>
          {companyHeader.address.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => (
            <p key={i} style={{ margin: 0 }}>{l}</p>
          ))}
          {companyHeader.phone.trim() !== "" && <p style={{ margin: 0 }}>โทร. {companyHeader.phone}</p>}
          {companyHeader.taxId.trim() !== "" && <p style={{ margin: 0 }}>เลขประจำตัวผู้เสียภาษี {companyHeader.taxId}</p>}
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>ใบขอซื้อ</p>
          {dept !== "" && <p style={{ margin: 0 }}>{dept}</p>}
        </div>
      </div>

      {/* สองคอลัมน์ของหัวเอกสาร */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "8px" }}>
        <div style={{ width: "52%" }}>
          {/* ป้าย "หมายเหตุ" บนหัวเอกสารของกระดาษจริงบรรจุรหัสงาน (PQ…) ไม่ใช่หมายเหตุอิสระ */}
          <Field label="หมายเหตุ" value={p.jobCode} />
          <Field label="สถานที่ส่งของ" value={p.deliveryLocation ? p.deliveryLocation : ":-"} />
          <Field label="โทร." value={p.deliveryPhone} />
          <Field label="ติดต่อ" value={p.deliveryContact} />
        </div>
        <div style={{ flex: 1 }}>
          <Field label="เลขที่ใบขออนุมัติซื้อ" value={p.id} labelWidth="130px" />
          <Field label="วันที่" value={d(p.issueDate)} labelWidth="130px" />
          <Field label="วันที่รับของ" value={d(p.neededByDate)} labelWidth="130px" />

        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
        <colgroup>
          <col style={{ width: "5%" }} />
          <col style={{ width: "43%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "11%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        <thead>
          <tr>
            {["No.", "รหัสสินค้า/รายละเอียด", "คลัง คงเหลือ", "จำนวนขอซื้อ", "วันต้องการ", "แผนก", "ให้ซื้อ"].map((h) => (
              <th key={h} style={headCell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.lines.map((line, idx) => (
            <tr key={line.id}>
              <td style={{ ...cell, textAlign: "center" }}>{idx + 1}</td>
              <td style={cell}>
                {line.productCode ? `${line.productCode} ` : ""}{line.description}
                {/* บรรทัดย่อย — กระดาษจริงไม่ได้เยื้องเข้ามา ชิดซ้ายเท่ากับคำอธิบาย */}
                {(line.subDetails ?? []).map((sd, i) => (
                  <p key={i} style={{ margin: "1px 0 0" }}>{sd}</p>
                ))}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>{line.warehouseRemainingQty}</td>
              {/* กระดาษพิมพ์จำนวนกับหน่วยรวมในช่องเดียว ("1.00  ครั้ง") */}
              <td style={{ ...cell, textAlign: "center" }}>
                {line.qtyRequested !== null ? `${line.qtyRequested.toLocaleString()}${line.unit ? ` ${line.unit}` : ""}` : ""}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>{d(line.neededByDate)}</td>
              <td style={{ ...cell, textAlign: "center" }}>{line.departmentCode}</td>
              {/* "ให้ซื้อ" เว้นว่างเสมอ — ฝ่ายจัดซื้อเขียนเองด้วยมือ */}
              <td style={cell} />
            </tr>
          ))}
          {Array.from({ length: padding }, (_, i) => (
            <tr key={`pad-${i}`}>
              {Array.from({ length: 7 }, (_, c) => <td key={c} style={{ ...cell, height: "17px" }} />)}
            </tr>
          ))}
        </tbody>
      </table>

      {/* กล่องหมายเหตุใต้ตาราง */}
      <div style={{ border: LINE, borderTop: "none", padding: "3px 6px", minHeight: "48px", whiteSpace: "pre-wrap" }}>
        <span style={{ fontWeight: 700 }}>หมายเหตุ</span>
        {p.headerRemark ? ` ${p.headerRemark}` : ""}
      </div>

      {/* หมายเหตุการแก้ไข — ไม่มีบนกระดาษ แต่ฝ่ายผลิตขอไว้เอง 2026-08-27 ("สามารถดูในใบปริ้นได้") */}
      {(p.revisionNote ?? "").trim() !== "" && (
        <div style={{ border: LINE, borderTop: "none", padding: "3px 6px", whiteSpace: "pre-wrap" }}>
          <span style={{ fontWeight: 700 }}>หมายเหตุการแก้ไข :</span> {p.revisionNote}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "18px", breakInside: "avoid" }}>
        <tbody>
          <tr>
            {signCell("ผู้ขอซื้อ", p.requestedBy)}
            {signCell("ผู้อนุมัติ", p.approvedBy)}
            {signCell("ฝ่ายจัดซื้อ", p.purchasingDeptBy)}
          </tr>
        </tbody>
      </table>

      <p style={{ margin: "14px 0 0", fontSize: "9px" }}>
        <span>พิมพ์โดย {p.requestedBy || "-"}</span>
        <span style={{ marginLeft: "24px" }}>วันที่ {d(p.requestedAt)}</span>
        <span style={{ marginLeft: "24px" }}>บันทึกโดย {p.requestedBy || "-"}</span>
      </p>
      <p style={{ textAlign: "right", margin: "2px 0 0", fontSize: "9px" }}>{FORM_CODE}</p>
    </div>
  );
}
