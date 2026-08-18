import type { MaterialRequisition } from "../../lib/materialRequisition";

/**
 * Print layout for FM-ST-04 Rev.02 — plain black-on-white formal form, matching the reference PDF's
 * column layout (No./Code/Description/Unit/Planned/1st/2nd/Return/Actual). Only rendered while
 * printing (`hidden print:block`, same convention DeliveryOrderPrintDocument.tsx established) — a
 * first-pass reproduction of the form's structure, not yet pixel-calibrated against the real
 * printed page (that level of polish came as a later pass for Delivery Order's own print layout too,
 * not its first ship).
 */
export function MaterialRequisitionPrintDocument({ materialRequisition: m }: { materialRequisition: MaterialRequisition }) {
  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
      <h1 className="text-center text-lg font-bold mb-3">ใบเบิกและใบคืนวัสดุ</h1>
      <table className="w-full text-xs mb-3" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td className="py-0.5 pr-2 font-semibold w-28">ชื่อลูกค้า:</td>
            <td className="py-0.5 border-b border-black">{m.customerName}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold w-32">เลขที่ใบเบิก:</td>
            <td className="py-0.5 border-b border-black w-40">{m.id}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">รหัสงาน:</td>
            <td className="py-0.5 border-b border-black">{m.jobCode}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">เลขที่ใบสั่งงาน:</td>
            <td className="py-0.5 border-b border-black">{m.jobOrderCode}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">ชื่อสินค้า:</td>
            <td className="py-0.5 border-b border-black">{m.productName}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">วันที่เริ่มผลิต:</td>
            <td className="py-0.5 border-b border-black">{m.productionStartDate}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">ชื่อพนักงานดูแล:</td>
            <td colSpan={3} className="py-0.5 border-b border-black">{m.responsibleEmployee}</td>
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
              <td className="border border-black px-1.5 py-1">{line.productCode}</td>
              <td className="border border-black px-1.5 py-1">{line.productName}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.unit}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.plannedQty ?? ""}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.withdrawal1Qty ?? ""}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.withdrawal2Qty ?? ""}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.returnQty ?? ""}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.actualUsedQty ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="w-full text-xs mt-6" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            {([
              ["ผู้จัดทำ", m.preparedBy, m.preparedAt],
              ["ผู้อนุมัติ", m.approvedBy, m.approvedAt],
            ] as const).map(([label, name, date]) => (
              <td key={label} className="w-1/2 py-2 text-center align-top">
                <div className="border-b border-black h-8 mb-1" />
                <p>{label}: {name}</p>
                <p>วันที่: {date}</p>
              </td>
            ))}
          </tr>
          <tr>
            {([
              ["แผนกสโตร์", m.storeDeptBy, m.storeDeptAt],
              ["แผนกต้นทุน", m.costDeptBy, m.costDeptAt],
            ] as const).map(([label, name, date]) => (
              <td key={label} className="w-1/2 py-2 text-center align-top">
                <div className="border-b border-black h-8 mb-1" />
                <p>{label}: {name}</p>
                <p>วันที่: {date}</p>
              </td>
            ))}
          </tr>
          <tr>
            {([
              ["ผู้คืน", m.returnedBy, m.returnedAt],
              ["ผู้รับคืน", m.returnReceivedBy, m.returnedAt],
            ] as const).map(([label, name, date]) => (
              <td key={label} className="w-1/2 py-2 text-center align-top">
                <div className="border-b border-black h-8 mb-1" />
                <p>{label}: {name}</p>
                <p>วันที่: {date}</p>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="text-[9px] text-right mt-4">FM-ST-04 Rev.02 : 21/07/68</p>
    </div>
  );
}
