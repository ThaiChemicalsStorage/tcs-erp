import type { MaterialRequisition } from "../../lib/materialRequisition";
import type { CompanyHeaderInfo } from "../../lib/storage";
import { PrintLetterhead } from "../../components/PrintLetterhead";
import { PrintSignatureLine } from "../../components/PrintSignature";
import { printDate, printDateOrBlank, printText, printTextOrBlank, printNumber } from "../../lib/printFormat";
import { PaginatedPrintForm } from "../../components/PaginatedPrintForm";
import { useKitRecipes } from "../../hooks/useKitRecipes";
import { kitBreakdownText } from "../../lib/products";

/**
 * Print layout for FM-ST-04 Rev.02 — the form's own column layout
 * (No./Code/Description/Unit/Planned/1st/2nd/Return/Actual), rendered only while printing
 * (`hidden print:block`, applied by `PaginatedPrintForm`).
 *
 * **2026-08-27**: gained the company letterhead, per the Production department's request that
 * ใบเบิกและใบคืนพัสดุ "ทำเทมเพลตออกมาคล้ายๆของใบเสนอราคา". The letterhead itself lives in the shared
 * `PrintLetterhead` component; the form body below is unchanged, because the reference form's column
 * layout is what Store staff actually read — only the header was asked to change.
 *
 * **2026-09-02** (คำสั่งเจ้าของสามข้อพร้อมกัน): วันที่ทุกช่องพิมพ์เป็น วัน/เดือน/ปี ผ่าน `printDate()`
 * (เดิมยิงค่า ISO ดิบลงกระดาษ), ช่องที่ไม่มีข้อมูลพิมพ์ขีดกลางแทนที่ว่าง, และช่องผู้จัดทำ/ผู้อนุมัติ
 * วางรูปลายเซ็นจริงของเจ้าตัวจากโปรไฟล์ (ดู `PrintSignature.tsx`)
 *
 * **จัดหน้าเองด้วย `PaginatedPrintForm` (2026-10-06)** — ทุกหน้ามีหัวเอกสาร (หัวจดหมาย ชื่อใบ เลขที่ ลูกค้า รหัสงาน …) + หัวตาราง
 * + แถวว่างเติมจนเต็มหน้า และรหัสฟอร์มท้ายกระดาษ · หมายเหตุการแก้ไข/ช่องเซ็นอยู่หน้าสุดท้าย ถ้าไม่พอที่ยกไปหน้าใหม่ที่มีหัวและตารางว่างเต็มหน้า
 * (เจ้าของสั่ง ดูไฟล์ component) · เดิมห่อทั้งใบด้วยตารางนอกให้ <tfoot> ซ้ำรหัสฟอร์ม แต่หัวเอกสารไม่ซ้ำ และช่องเซ็นที่ล้นไปขึ้นหน้าใหม่โดยไม่มีหัว
 *
 * Fixed Thai, no i18n — see docs/CLAUDE.md's print policy.
 */
export function MaterialRequisitionPrintDocument({ materialRequisition: m, companyHeader }: { materialRequisition: MaterialRequisition; companyHeader: CompanyHeaderInfo }) {
  // สินค้าชุด (2026-09-29) — พิมพ์ชิ้นส่วนใต้ชื่อชุด ตามจำนวนที่ขอเบิก
  const kits = useKitRecipes();
  /**
   * ช่องเซ็นที่ระบบรู้ตัวคนจริง ๆ มีสองช่อง — ผู้จัดทำคือคนสร้างเอกสาร ผู้อนุมัติคือคนที่กดปุ่มอนุมัติ
   * อีกสี่ช่อง (สโตร์/ต้นทุน/ผู้คืน/ผู้รับคืน) เป็นการเซ็นรับของหน้างาน ไม่มี user id ผูกไว้ จึงเว้นเส้น
   * ให้เซ็นมือเหมือนเดิม
   */
  const signatureRows = [
    [
      { label: "ผู้จัดทำ", name: m.preparedBy, date: m.preparedAt, userId: m.createdBy },
      { label: "ผู้อนุมัติ", name: m.approvedBy, date: m.approvedAt, userId: m.approvedByUserId ?? "" },
    ],
    [
      { label: "แผนกสโตร์", name: m.storeDeptBy, date: m.storeDeptAt, userId: "" },
      { label: "แผนกต้นทุน", name: m.costDeptBy, date: m.costDeptAt, userId: "" },
    ],
    [
      { label: "ผู้คืน", name: m.returnedBy, date: m.returnedAt, userId: "" },
      { label: "ผู้รับคืน", name: m.returnReceivedBy, date: m.returnedAt, userId: "" },
    ],
  ];

  // เลขบนฟอร์ม (พิมพ์ทับได้ตั้งแต่ 2026-09-03) — ใบเก่าไม่มี ถอยไปใช้เลขรันของระบบ
  const formNumber = m.documentNumber || m.id;
  // "ตัดของให้" — แผนก / ทีม / ประเภทงาน รวมเป็นบรรทัดเดียวบนหัวใบ
  const chargeTo = [m.chargeDepartmentName, m.chargeTeamName].filter(Boolean).join(" / ");
  const workType = [m.chargeWorkTypeCode, m.chargeWorkTypeName].filter(Boolean).join(" ");

  const header = (
    <>
      <PrintLetterhead
        companyHeader={companyHeader}
        docLabel="REQUISITION"
        rightMeta={[
          { label: "เลขที่ใบเบิก", value: formNumber },
          { label: "รหัสงาน", value: printText(m.jobCode) },
        ]}
      />
      <h1 className="text-center text-lg font-bold mb-3">ใบเบิกและใบคืนวัสดุ</h1>
      <table className="w-full text-xs mb-3" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td className="py-0.5 pr-2 font-semibold w-28">ชื่อลูกค้า:</td>
            <td className="py-0.5 border-b border-black">{printText(m.customerName)}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold w-32">เลขที่ใบเบิก:</td>
            <td className="py-0.5 border-b border-black w-40">{formNumber}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">รหัสงาน:</td>
            <td className="py-0.5 border-b border-black">{printText(m.jobCode)}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">เลขที่ใบสั่งงาน:</td>
            <td className="py-0.5 border-b border-black">{printText(m.jobOrderCode)}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">ชื่อสินค้า:</td>
            <td className="py-0.5 border-b border-black">{printText(m.productName)}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">วันที่เริ่มผลิต:</td>
            <td className="py-0.5 border-b border-black">{printDate(m.productionStartDate)}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">ชื่อพนักงานดูแล:</td>
            <td className="py-0.5 border-b border-black">{printText(m.responsibleEmployee)}</td>
            {/* สายที่มา: ใบนี้ออกจากใบสั่งผลิตใบไหน — ใบของฝ่ายโครงการไม่มีต้นทางนี้ พิมพ์ขีดกลาง */}
            <td className="py-0.5 pl-4 pr-2 font-semibold">เลขที่ใบสั่งผลิต:</td>
            <td className="py-0.5 border-b border-black">{printText(m.productionOrderId)}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">ตัดของให้แผนก/ทีม:</td>
            <td className="py-0.5 border-b border-black">{printText(chargeTo)}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">ตัดเข้างาน:</td>
            <td className="py-0.5 border-b border-black">{printText(workType)}</td>
          </tr>
        </tbody>
      </table>
    </>
  );

  /* ฟอร์ม FM-ST-04 มีสองช่องเบิก แต่ของจริงจ่ายกี่รอบก็ได้ตั้งแต่ 2026-09-07 — สองช่องนี้เป็นค่าที่
     เซิร์ฟเวอร์คิดจากรอบการจ่าย (รอบ 1 ลงช่องแรก รอบ 2 ขึ้นไปรวมกันในช่องที่สอง) ไม่ใช่ค่าที่ใครกรอก
     ประวัติเต็มทุกรอบดูได้ในหน้าเอกสาร ไม่ได้พิมพ์ลงกระดาษเพราะฟอร์มจริงไม่มีที่ให้ */
  const tableHead = (
    <thead>
      <tr>
        {["No.", "รหัสสินค้า", "รายการ", "หน่วย", "เบิกของ", "เบิกครั้งที่1", "เบิกครั้งที่2", "คืนของ", "ใช้จริง"].map((h) => (
          <th key={h} className="border border-black px-1.5 py-1 font-semibold text-center">{h}</th>
        ))}
      </tr>
    </thead>
  );

  const bodyRows = m.lines.map((line, idx) => ({
    key: line.id,
    node: (
      <tr>
        <td className="border border-black px-1.5 py-1 text-center">{idx + 1}</td>
        <td className="border border-black px-1.5 py-1">{printText(line.productCode)}</td>
        <td className="border border-black px-1.5 py-1">
          {printText(line.productName)}
          {kits.has(line.productId) && (
            <span className="block text-[9px]">ชุด: {kitBreakdownText(kits.get(line.productId)!.components, line.plannedQty && line.plannedQty > 0 ? line.plannedQty : 1)}{line.plannedQty && line.plannedQty > 0 ? "" : " (ต่อชุด)"}</span>
          )}
        </td>
        <td className="border border-black px-1.5 py-1 text-center">{printText(line.unit)}</td>
        <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.plannedQty)}</td>
        <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.withdrawal1Qty)}</td>
        <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.withdrawal2Qty)}</td>
        <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.returnQty)}</td>
        <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.actualUsedQty)}</td>
      </tr>
    ),
  }));

  // แถวว่างเติมให้เต็มทุกหน้า (เดิมใบนี้ไม่มีแถวว่าง) — ช่องแรกใส่ช่องว่างไม่ตัดคำ ให้สูงเท่าบรรทัดรายการหนึ่งบรรทัดพอดี
  const blankRow = (key: string) => (
    <tr key={key}>
      <td className="border border-black px-1.5 py-1">{" "}</td>
      {Array.from({ length: 8 }, (_, i) => (
        <td key={i} className="border border-black px-1.5 py-1" />
      ))}
    </tr>
  );

  const footer = (
    <>
      {/* หมายเหตุการแก้ไข — พิมพ์จริงตามที่ฝ่ายผลิตขอ ("สามารถดูในใบปริ้นได้") ซ่อนเมื่อว่าง */}
      {(m.revisionNote ?? "").trim() !== "" && (
        <div className="border border-black px-2 py-1 mt-2 text-[10px]" style={{ whiteSpace: "pre-wrap" }}>
          <span className="font-semibold">หมายเหตุการแก้ไข :</span> {m.revisionNote}
        </div>
      )}

      <table className="w-full text-xs mt-6" style={{ borderCollapse: "collapse" }}>
        <tbody>
          {signatureRows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map(({ label, name, date, userId }) => (
                <td key={label} className="w-1/2 py-2 text-center align-top">
                  <PrintSignatureLine userId={userId} height={32} />
                  {/* เส้นลงนามสั้นกว่าช่อง มีช่องว่างคั่นชัดเจน — เดิมเต็มช่องและช่องไม่มี padding
                      แนวนอนเลย สองช่องจึงต่อกันเป็นเส้นเดียวลากยาวทั้งหน้า (เจ้าของแจ้ง 2026-09-21) */}
                  <div className="border-b border-black mb-1 w-3/4 mx-auto" />
                  {/* ชื่อที่ยังไม่มีคนเซ็นเว้นว่าง ไม่ใช่ `-` (เจ้าของสั่ง 2026-09-21) — ช่องนี้ตั้งใจ
                      เว้นไว้ให้เขียนด้วยปากกา เหตุผลเดียวกับ printDateOrBlank() บรรทัดถัดไป */}
                  <p>{label}: {printTextOrBlank(name)}</p>
                  <p>วันที่: {printDateOrBlank(date) || "....... / ....... / ......."}</p>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );

  return (
    <PaginatedPrintForm
      style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif" }}
      header={header}
      tableHead={tableHead}
      // เดิมคือ className="text-[10px]" ของตารางรายการ — ตารางของตัวจัดหน้ารับได้แค่ style
      tableStyle={{ fontSize: "10px" }}
      rows={bodyRows}
      blankRow={blankRow}
      footer={footer}
      pageFooter={<p className="text-[9px] text-right mt-4">FM-ST-04 Rev.02 : 21/07/68</p>}
    />
  );
}
