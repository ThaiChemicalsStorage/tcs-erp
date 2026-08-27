import type { PurchaseRequest } from "../../lib/purchaseRequest";

/**
 * Print layout for form FMPU05 Rev.02 (printed footer "FM-PU-05") — plain black-on-white formal
 * form. Deliberately NOT wired through i18n — same fixed-language precedent as every other print
 * document in this app (see JobOrderPrintDocument.tsx's doc comment for the full reasoning). A
 * first-pass structural reproduction, not yet pixel-calibrated against the real
 * "-ED6908027.pdf" reference example.
 */
export function PurchaseRequestPrintDocument({ purchaseRequest: p }: { purchaseRequest: PurchaseRequest }) {
  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
      <h1 className="text-center text-lg font-bold mb-3">ใบขอซื้อ</h1>
      <table className="w-full text-xs mb-3" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td className="py-0.5 pr-2 font-semibold w-28">ผู้จำหน่าย:</td>
            <td className="py-0.5 border-b border-black">{p.vendorName}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold w-28">เลขที่ใบขอซื้อ:</td>
            <td className="py-0.5 border-b border-black w-32">{p.id}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">หมายเหตุ (รหัสงาน):</td>
            <td className="py-0.5 border-b border-black">{p.jobCode}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">วันที่รับของ:</td>
            <td className="py-0.5 border-b border-black">{p.neededByDate}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">เครดิต:</td>
            <td className="py-0.5 border-b border-black">{p.creditDays !== null ? `${p.creditDays} วัน` : ""}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">ขนส่งโดย:</td>
            <td className="py-0.5 border-b border-black">{p.shippingMethod}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">สถานที่ส่งของ:</td>
            <td colSpan={3} className="py-0.5 border-b border-black">{p.deliveryLocation}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["No.", "รหัสสินค้า/รายละเอียด", "คลัง คงเหลือ", "จำนวนขอซื้อ", "วันต้องการ", "แผนก", "ราคาประเมิน"].map((h) => (
              <th key={h} className="border border-black px-1.5 py-1 font-semibold text-center">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.lines.map((line, idx) => (
            <tr key={line.id}>
              <td className="border border-black px-1.5 py-1 text-center">{idx + 1}</td>
              <td className="border border-black px-1.5 py-1">
                {line.productCode ? `${line.productCode} ` : ""}{line.description}
                {/* บรรทัดย่อย เยื้องเข้ามาใต้คำอธิบายในช่องเดียวกัน เหมือนใบสั่งผลิต ไม่แตกคอลัมน์ */}
                {(line.subDetails ?? []).map((sd, i) => (
                  <p key={i} style={{ margin: "1px 0 0 12px" }}>{sd}</p>
                ))}
              </td>
              <td className="border border-black px-1.5 py-1 text-center">{line.warehouseRemainingQty}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.qtyRequested ?? ""}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.neededByDate}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.departmentCode}</td>
              <td className="border border-black px-1.5 py-1 text-right">{line.estimatedCost !== null ? line.estimatedCost.toLocaleString() : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* หมายเหตุการแก้ไข — พิมพ์จริงตามที่ฝ่ายผลิตขอ ("สามารถดูในใบปริ้นได้") ซ่อนเมื่อว่าง */}
      {(p.revisionNote ?? "").trim() !== "" && (
        <div className="border border-black px-2 py-1 mt-2 text-[10px]" style={{ whiteSpace: "pre-wrap" }}>
          <span className="font-semibold">หมายเหตุการแก้ไข :</span> {p.revisionNote}
        </div>
      )}


      <table className="w-full text-xs mt-6" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            {([
              ["ผู้ขอซื้อ", p.requestedBy, p.requestedAt],
              ["ผู้อนุมัติ", p.approvedBy, p.approvedAt],
              ["ฝ่ายจัดซื้อ", p.purchasingDeptBy, p.purchasingDeptAt],
            ] as const).map(([label, name, date]) => (
              <td key={label} className="w-1/3 py-2 text-center align-top">
                <div className="border-b border-black h-8 mb-1" />
                <p>{label}: {name}</p>
                <p>วันที่: {date}</p>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="text-[9px] text-right mt-4">FM-PU-05 Rev.02 : 03/11/68</p>
    </div>
  );
}
