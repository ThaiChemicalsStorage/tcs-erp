import type { MaterialRequisition } from "../../lib/materialRequisition";
import type { CompanyHeaderInfo } from "../../lib/storage";
import { PrintLetterhead } from "../../components/PrintLetterhead";
import { PrintSignatureLine } from "../../components/PrintSignature";
import { printDate, printDateOrBlank, printText, printNumber } from "../../lib/printFormat";

/**
 * Print layout for FM-ST-04 Rev.02 — the form's own column layout
 * (No./Code/Description/Unit/Planned/1st/2nd/Return/Actual), rendered only while printing
 * (`hidden print:block`, the convention DeliveryOrderPrintDocument.tsx established).
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
 * The whole document is wrapped in one outer table so the FM-ST-04 form code can sit in `<tfoot>`
 * and repeat on every printed page, the same mechanism ProductionOrderPrintDocument.tsx uses.
 *
 * Fixed Thai, no i18n — see docs/CLAUDE.md's print policy.
 */
export function MaterialRequisitionPrintDocument({ materialRequisition: m, companyHeader }: { materialRequisition: MaterialRequisition; companyHeader: CompanyHeaderInfo }) {
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

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
      <PrintLetterhead
        companyHeader={companyHeader}
        docLabel="REQUISITION"
        rightMeta={[
          { label: "เลขที่ใบเบิก", value: m.id },
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
            <td className="py-0.5 border-b border-black w-40">{m.id}</td>
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
        </tbody>
      </table>

      <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["No.", "รหัสสินค้า", "รายการ", "หน่วย", "เบิกของ", "เบิกครั้งที่1", "เบิกครั้งที่2", "คืนของ", "ใช้จริง"].map((h) => (
              <th key={h} className="border border-black px-1.5 py-1 font-semibold text-center">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.lines.map((line, idx) => (
            <tr key={line.id}>
              <td className="border border-black px-1.5 py-1 text-center">{idx + 1}</td>
              <td className="border border-black px-1.5 py-1">{printText(line.productCode)}</td>
              <td className="border border-black px-1.5 py-1">{printText(line.productName)}</td>
              <td className="border border-black px-1.5 py-1 text-center">{printText(line.unit)}</td>
              <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.plannedQty)}</td>
              <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.withdrawal1Qty)}</td>
              <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.withdrawal2Qty)}</td>
              <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.returnQty)}</td>
              <td className="border border-black px-1.5 py-1 text-center">{printNumber(line.actualUsedQty)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* หมายเหตุการแก้ไข — พิมพ์จริงตามที่ฝ่ายผลิตขอ ("สามารถดูในใบปริ้นได้") ซ่อนเมื่อว่าง */}
      {(m.revisionNote ?? "").trim() !== "" && (
        <div className="border border-black px-2 py-1 mt-2 text-[10px]" style={{ whiteSpace: "pre-wrap" }}>
          <span className="font-semibold">หมายเหตุการแก้ไข :</span> {m.revisionNote}
        </div>
      )}

      {/* กันบล็อกลายเซ็นถูกหั่นคร่อมหน้า — ดู PrintDocument.tsx ของใบเสนอราคา */}
      <table className="w-full text-xs mt-6" style={{ borderCollapse: "collapse", breakInside: "avoid" }}>
        <tbody>
          {signatureRows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map(({ label, name, date, userId }) => (
                <td key={label} className="w-1/2 py-2 text-center align-top">
                  <PrintSignatureLine userId={userId} height={32} />
                  <div className="border-b border-black mb-1" />
                  <p>{label}: {printText(name)}</p>
                  <p>วันที่: {printDateOrBlank(date) || "....... / ....... / ......."}</p>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td style={{ padding: 0, border: "none" }}>
              <p className="text-[9px] text-right mt-4">FM-ST-04 Rev.02 : 21/07/68</p>
            </td>
          </tr>
        </tfoot>
      </table>

    </div>
  );
}
