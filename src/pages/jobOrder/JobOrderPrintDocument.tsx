import type { JobOrder } from "../../lib/jobOrder";
import { SCOPE_COLUMN_SPLIT } from "../../lib/jobOrder";
import type { ChecklistOption } from "../../lib/documentRequirements";
import type { CompanyHeaderInfo } from "../../lib/storage";
import { formatQuoteDateThai } from "../../lib/quotes";
import { PrintSignatureLine } from "../../components/PrintSignature";
import { printText, printNumber } from "../../lib/printFormat";
import { PrintPageFrame } from "../../components/PrintPageFrame";

/**
 * ฟอร์มพิมพ์ใบสั่งงาน — คัดตามฟอร์มจริง FM-PJ-01 Rev.01 : 10/10/65
 *
 * **2026-08-31: ทาบกับฟอร์มกระดาษตัวจริงแล้ว** ก่อนหน้านี้ไฟล์นี้เขียนกำกับตัวเองไว้ว่าเป็น
 * "a first-pass structural reproduction of the form, not yet pixel-calibrated" เพราะยังไม่เคยเห็น
 * กระดาษ เจ้าของส่ง `reference/company/FM-PJ-01 ใบสั่งงาน Rev1 (1).pdf` (ฟอร์มเปล่า) และ
 * `(3).xlsx` (กรอกแล้ว 3 ใบ) มาให้เมื่อ 2026-08-31 โฟลเดอร์ `reference/` ถูก gitignore ไว้
 * คอมเมนต์นี้กับ `buildJobOrderChecklistGroups()` จึงเป็น**บันทึกถาวรของฟอร์ม** แบบเดียวกับที่
 * `productionOrder.ts` ทำ อย่าคาดหวังว่าจะกลับไปเปิด PDF อ่านซ้ำได้
 *
 * โครงหน้ากระดาษ เรียงจากบนลงล่าง:
 *   1. โลโก้ + ชื่อบริษัทภาษาไทย จัดกลาง (**ไม่มีที่อยู่** จึงไม่ใช่ `PrintLetterhead` ซึ่งเป็นบล็อกเต็ม)
 *   2. แถบหัวเรื่องพื้นฟ้าอ่อนเต็มความกว้าง "ใบสั่งงาน (JOB ORDER)"
 *   3. หัวเอกสาร 2 คอลัมน์ × 3 แถว ทุกช่องมีป้ายอังกฤษเป็นบรรทัดที่สอง แล้วปิดด้วยเส้นดำหนา
 *   4. ตารางรายการดำเนินงาน หัวตารางพื้นฟ้า อย่างน้อย 12 แถว (กระดาษเว้นแถวว่างไว้เขียนเพิ่ม)
 *   5. ขอบเขตงาน — รายการเดียวเรียงยาวสองคอลัมน์ ไม่มีหัวข้อย่อย
 *   6. รายละเอียดอื่นๆ (Out of Scope) — เส้นบรรทัดว่างเสมอ แม้ไม่มีข้อความ
 *   7. ช่องลงนาม: ผู้ร้องขอ อยู่แถวบนเดี่ยว ๆ แล้ว ผู้อนุมัติ / ผู้รับเอกสาร อยู่แถวล่างคู่กัน
 *   8. ท้ายหน้าชิดขวา "FM-PJ-01 Rev.01 : 10/10/65"
 *
 * "(Finshed Date)" กับ "INTERMIDIATE COAT" สะกดผิดบนกระดาษจริงทั้งคู่ — พิมพ์ตามกระดาษโดยตั้งใจ
 *
 * Always renders in Thai regardless of the user's UI language — same rule every other print
 * component in this app follows (see docs/CLAUDE.md's i18n policy): a printed business document
 * must not change language based on who happened to press print.
 */

const FORM_CODE = "FM-PJ-01 Rev.01 : 10/10/65";
const DOC_FONT = "'Times New Roman', 'Noto Serif Thai', serif";
const LINE = "1px solid #000";
/** พื้นฟ้าอ่อนของแถบหัวเรื่องและหัวตารางบนกระดาษจริง */
const FILL = "#ccffff";
/** จำนวนแถวขั้นต่ำของตารางรายการ — กระดาษมี 12 แถวเว้นไว้เขียนเพิ่ม */
const MIN_BODY_ROWS = 12;
/**
 * ตารางกว้าง 100% + `border-collapse: collapse` ทำให้เส้นขอบขวาสุดถูกวาดเลยขอบพื้นที่พิมพ์ของ A4
 * ไปครึ่งพิกเซลแล้วหายไปทั้งเส้น — บทเรียนเดียวกับ CostControlPrintDocument.tsx (commit f1509da)
 */
const EDGE_GUARD = "2px";

/** ป้ายหัวข้อของฟอร์มนี้ขีดเส้นใต้เฉพาะข้อความไทย ส่วนวงเล็บอังกฤษไม่ขีด */
function SectionLabel({ thai, english }: { thai: string; english: string }) {
  return (
    <p style={{ margin: "8px 0 3px", fontSize: "11px", fontWeight: 700 }}>
      <span style={{ textDecoration: "underline" }}>{thai}</span> ({english})
    </p>
  );
}

/** ช่องหัวเอกสารหนึ่งช่อง: ป้ายไทย + ค่าบนเส้นบรรทัด แล้วป้ายอังกฤษเป็นบรรทัดที่สองใต้ป้ายไทย */
function HeaderField({ thai, english, value }: { thai: string; english: string; value: string }) {
  return (
    <td style={{ padding: "0 0 2px", verticalAlign: "bottom", width: "50%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "6px" }}>
        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{thai}</span>
        <span style={{ flex: 1, borderBottom: LINE, minHeight: "15px", padding: "0 4px 1px" }}>{printText(value)}</span>
      </div>
      <p style={{ margin: 0, fontSize: "10px" }}>({english})</p>
    </td>
  );
}

/**
 * ป้ายลงนามพร้อมจุดไข่ปลา — กระดาษใช้จุดไข่ปลา ไม่ใช่เส้นขีดใต้
 *
 * `userId` (ถ้ามี) คือเจ้าของช่องเซ็นในระบบ — คนสร้างเอกสารสำหรับ "ผู้ร้องขอ" และคนที่กดอนุมัติ
 * สำหรับ "ผู้อนุมัติ" ลายเซ็นที่เขาอัปโหลดไว้ในโปรไฟล์จะถูกวางเหนือบรรทัดให้ (เจ้าของสั่ง 2026-09-02)
 * ช่องที่ไม่มีเจ้าของในระบบ เช่น "ผู้รับเอกสาร" ยังเป็นจุดไข่ปลาให้เซ็นมือเหมือนเดิม
 */
function SignatureField({ thai, english, value, userId }: { thai: string; english: string; value: string; userId?: string }) {
  return (
    <div style={{ margin: "0 0 6px" }}>
      {userId ? <PrintSignatureLine userId={userId} height={26} /> : null}
      <p style={{ margin: 0 }}>
        <span style={{ fontWeight: 700 }}>{thai}</span> ({english}) :{" "}
        <span>{value || "..................................."}</span>
      </p>
    </div>
  );
}

/**
 * ช่องกรอกบนกระดาษเป็นเส้นให้เขียน ("PAINTING SYSTEM : ______") เส้นจึงต้องอยู่เสมอ ไม่ว่าจะกรอก
 * มาหรือยัง — ถ้าเรนเดอร์เฉพาะตอนมีค่า บรรทัดที่ยังว่างจะเหลือแค่ "PAINTING SYSTEM :" ห้อยไว้เฉย ๆ
 * และบรรทัดงานสีจะกลายเป็น "PRIMER COAT / MICRON" ซึ่งอ่านไม่รู้เรื่อง
 */
function FillIn({ value }: { value: string }) {
  return (
    <span style={{ display: "inline-block", minWidth: "80px", borderBottom: LINE, textAlign: "center", padding: "0 3px" }}>
      {value.trim() || " "}
    </span>
  );
}

/** หนึ่งบรรทัดของเช็คลิสต์ขอบเขตงาน — ☑/☐ + ป้าย + ช่องกรอก (พร้อมหน่วยที่พิมพ์อยู่บนฟอร์ม) */
function ScopeLine({ opt }: { opt: ChecklistOption }) {
  return (
    <div style={{ breakInside: "avoid" }}>
      <p style={{ margin: 0, lineHeight: 1.6 }}>
        {opt.checked ? "☑" : "☐"} {opt.label}
        {opt.value !== undefined && <> : <FillIn value={opt.value} /></>}
        {opt.unit ? ` ${opt.unit}` : ""}
        {opt.value2 !== undefined && <> / <FillIn value={opt.value2} /></>}
        {opt.unit2 ? ` ${opt.unit2}` : ""}
      </p>
      {(opt.details ?? []).map((d, i) => (
        <p key={i} style={{ margin: "0 0 0 16px", lineHeight: 1.5 }}>- {d}</p>
      ))}
    </div>
  );
}

export function JobOrderPrintDocument({
  jobOrder: j,
  companyHeader,
}: {
  jobOrder: JobOrder;
  companyHeader: CompanyHeaderInfo;
}) {
  // เลขลำดับข้ามบรรทัดต่อ เหมือนที่ใบสั่งผลิตข้ามบรรทัดหัวข้อ — แทรกบรรทัดต่อแล้วเลขข้างล่างไม่เลื่อน
  let seq = 0;
  const rows = j.lines.map((line) => ({ line, seq: line.isContinuation ? null : ++seq }));
  const padding = Math.max(0, MIN_BODY_ROWS - rows.length);

  // เช็คลิสต์ทั้งใบเป็นกลุ่มเดียวไม่มีหัวข้อ (ดู buildJobOrderChecklistGroups) — แต่ยังวนทุกกลุ่ม
  // เผื่อเอกสารเก่าที่มีตัวเลือกแปลกปลอมถูกยกไปต่อท้าย และเพื่อไม่ให้พังถ้าโครงสร้างเปลี่ยนอีก
  const scopeOptions = j.scopeChecklist.flatMap((g) => g.options);
  const leftColumn = scopeOptions.slice(0, SCOPE_COLUMN_SPLIT);
  const rightColumn = scopeOptions.slice(SCOPE_COLUMN_SPLIT);

  const cell: React.CSSProperties = { border: LINE, padding: "2px 5px", verticalAlign: "top" };
  const headCell: React.CSSProperties = { ...cell, background: FILL, textAlign: "center", fontWeight: 700 };

  return (
    <div
      className="hidden print:block"
      style={{ fontFamily: DOC_FONT, fontSize: "11px", color: "#000", background: "#fff", paddingRight: EDGE_GUARD }}
    >
      {/* พื้นสีของแถบหัวเรื่อง/หัวตารางจะหายไปตอนพิมพ์ ถ้าไม่บอกเบราว์เซอร์ว่าต้องพิมพ์พื้นหลังด้วย
          (ค่าเริ่มต้นของ Chrome คือไม่พิมพ์ จนกว่าผู้ใช้จะไปติ๊ก "Background graphics" เอง) */}
      <style>{".jo-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact }"}</style>
      <PrintPageFrame>

      <div className="jo-print">
        {/* 1. หัวจดหมาย — โลโก้ + ชื่อบริษัทไทย ไม่มีที่อยู่ ตรงตามกระดาษ */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", marginBottom: "8px" }}>
          <img src={companyHeader.logoDataUrl || "/logo.png"} alt="" style={{ width: "52px", height: "52px", objectFit: "contain" }} />
          <p style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>{companyHeader.name}</p>
        </div>

        {/* 2. แถบหัวเรื่อง */}
        <div style={{ border: LINE, background: FILL, textAlign: "center", padding: "3px 0", marginBottom: "6px" }}>
          <span style={{ fontSize: "14px", fontWeight: 700 }}>ใบสั่งงาน (JOB ORDER)</span>
        </div>

        {/* 3. หัวเอกสาร — "รหัสงาน" คือเลขงาน (PQ…) ตามที่กรอกบนกระดาษ ไม่ใช่เลข JO- ของระบบ */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <HeaderField thai="ชื่อลูกค้า :" english="Job name." value={j.customerName} />
              <HeaderField thai="รหัสงาน" english="Job order." value={j.jobCode} />
            </tr>
            <tr>
              <HeaderField thai="จากหน่วยงาน :" english="From Site" value={j.fromSite} />
              <HeaderField thai="ถึงหน่วยงาน :" english="To Site" value={j.toSite} />
            </tr>
            <tr>
              <HeaderField thai="วันเริ่มดำเนินการ :" english="Start Date" value={formatQuoteDateThai(j.startDate)} />
              {/* สะกดตามกระดาษ */}
              <HeaderField thai="วันดำเนินการแล้วเสร็จ :" english="Finshed Date" value={formatQuoteDateThai(j.finishDate)} />
            </tr>
          </tbody>
        </table>
        <div style={{ borderTop: "2px solid #000", marginTop: "4px" }} />

        {/* 4. ตารางรายการดำเนินงาน */}
        <SectionLabel thai="รายการดำเนินงาน" english="Details of Work" />
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
          <colgroup>
            <col style={{ width: "7%" }} />
            <col style={{ width: "44%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "32%" }} />
          </colgroup>
          <thead>
            <tr>
              {([
                ["ลำดับ", "Item"],
                ["รายละเอียด", "Description"],
                ["จำนวน", "Q'ty"],
                ["หน่วย", "Unit"],
                ["หมายเหตุ", "remark"],
              ] as const).map(([thai, english]) => (
                <th key={thai} style={headCell}>
                  <span style={{ display: "block" }}>{thai}</span>
                  <span style={{ display: "block", fontWeight: 400 }}>({english})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ line, seq: n }) => (
              <tr key={line.id}>
                <td style={{ ...cell, textAlign: "center" }}>{n ?? ""}</td>
                <td style={cell}>
                  {line.description}
                  {/* บรรทัดย่อยที่เป็นข้อความล้วน อยู่ในช่องเดียวกัน ไม่แตกคอลัมน์ */}
                  {(line.subDetails ?? []).map((sd, i) => (
                    <p key={i} style={{ margin: "1px 0 0 12px" }}>{sd}</p>
                  ))}
                </td>
                <td style={{ ...cell, textAlign: "center" }}>{printNumber(line.quantity)}</td>
                <td style={{ ...cell, textAlign: "center" }}>{printText(line.unit)}</td>
                <td style={cell}>{printText(line.remark)}</td>
              </tr>
            ))}
            {/* แถวว่างให้ครบตามกระดาษ ซึ่งเว้นช่องไว้ให้เขียนเพิ่มด้วยมือ */}
            {Array.from({ length: padding }, (_, i) => (
              <tr key={`pad-${i}`}>
                <td style={{ ...cell, height: "17px" }} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
                <td style={cell} />
              </tr>
            ))}
          </tbody>
        </table>

        {/* 5. ขอบเขตงาน — สองคอลัมน์ตามกระดาษ ไม่มีหัวข้อย่อย */}
        <SectionLabel thai="ขอบเขตงาน" english="Scope of work" />
        <div style={{ display: "flex", gap: "18px", fontSize: "10px", breakInside: "avoid" }}>
          <div style={{ width: "48%" }}>
            {leftColumn.map((opt) => <ScopeLine key={opt.key} opt={opt} />)}
          </div>
          <div style={{ flex: 1 }}>
            {rightColumn.map((opt) => <ScopeLine key={opt.key} opt={opt} />)}
          </div>
        </div>

        {/* 6. รายละเอียดอื่นๆ — กระดาษมีเส้นบรรทัดว่างเสมอ ไม่ได้ซ่อนเมื่อไม่มีข้อความ */}
        <SectionLabel thai="รายละเอียดอื่นๆ" english="Out of Scope" />
        {(() => {
          const written = j.outOfScope.split(/\r?\n/).filter((l) => l.trim() !== "");
          const lines = [...written, ...Array.from({ length: Math.max(0, 4 - written.length) }, () => "")];
          return lines.map((text, i) => (
            <p key={i} style={{ margin: 0, fontSize: "10px", borderBottom: LINE, minHeight: "15px", padding: "1px 2px" }}>
              {text || " "}
            </p>
          ));
        })()}

        {/* หมายเหตุการแก้ไข — ไม่มีบนกระดาษ แต่ฝ่ายผลิตขอไว้เอง 2026-08-27 ("สามารถดูในใบปริ้นได้") */}
        {(j.revisionNote ?? "").trim() !== "" && (
          <div style={{ border: LINE, padding: "3px 6px", marginTop: "6px", fontSize: "10px", whiteSpace: "pre-wrap" }}>
            <span style={{ fontWeight: 700 }}>หมายเหตุการแก้ไข :</span> {j.revisionNote}
          </div>
        )}

        {/* 7. ช่องลงนาม — ผู้ร้องขออยู่แถวบนเดี่ยว ๆ ตามกระดาษ ไม่ใช่สามช่องเรียงกัน */}
        <div style={{ marginTop: "16px", breakInside: "avoid" }}>
          <div style={{ width: "50%" }}>
            <SignatureField thai="ผู้ร้องขอ" english="Requested By" value={j.requestedBy} userId={j.createdBy} />
            <SignatureField thai="วันที่" english="Date" value={formatQuoteDateThai(j.requestedAt)} />
          </div>
          <div style={{ display: "flex", gap: "18px", marginTop: "14px" }}>
            <div style={{ width: "50%" }}>
              <SignatureField thai="ผู้อนุมัติ" english="Approved By" value={j.approvedBy} userId={j.approvedByUserId} />
              <SignatureField thai="วันที่" english="Date" value={formatQuoteDateThai(j.approvedAt)} />
            </div>
            <div style={{ flex: 1 }}>
              <SignatureField thai="ผู้รับเอกสาร" english="document recipient By" value={j.documentRecipientBy} />
              <SignatureField thai="วันที่" english="Date" value={formatQuoteDateThai(j.documentRecipientAt)} />
            </div>
          </div>
        </div>

        {/* 8. รหัสฟอร์ม */}
        <p style={{ textAlign: "right", margin: "12px 0 0", fontSize: "9px" }}>{FORM_CODE}</p>
      </div>
      </PrintPageFrame>
    </div>
  );
}
