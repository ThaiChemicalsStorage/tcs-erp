import type { JobOrder } from "../../lib/jobOrder";

/**
 * Print layout for FM-PJ-01 Rev.01 — plain black-on-white formal form. Deliberately NOT wired
 * through i18n: printed documents in this app always render in a fixed language regardless of the
 * preparer's own UI toggle (confirmed precedent — neither ScopeOfWorkPrintDocument.tsx nor
 * DeliveryOrderPrintDocument.tsx import useI18n either), same reasoning CLAUDE.md documents for
 * PrintDocument.tsx: translating a real business document based on the preparer's UI setting risks
 * silently sending an English document where a Thai one was expected. A first-pass structural
 * reproduction of the form, not yet pixel-calibrated (same caveat as Material Requisition's own
 * print layout).
 */
export function JobOrderPrintDocument({ jobOrder: j }: { jobOrder: JobOrder }) {
  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
      <h1 className="text-center text-lg font-bold mb-3">ใบสั่งงาน (JOB ORDER)</h1>
      <table className="w-full text-xs mb-3" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td className="py-0.5 pr-2 font-semibold w-28">ชื่อลูกค้า:</td>
            <td className="py-0.5 border-b border-black">{j.customerName}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold w-28">รหัสงาน:</td>
            <td className="py-0.5 border-b border-black w-32">{j.id}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">จากหน่วยงาน:</td>
            <td className="py-0.5 border-b border-black">{j.fromSite}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">ถึงหน่วยงาน:</td>
            <td className="py-0.5 border-b border-black">{j.toSite}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">วันเริ่มดำเนินการ:</td>
            <td className="py-0.5 border-b border-black">{j.startDate}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">วันดำเนินการแล้วเสร็จ:</td>
            <td className="py-0.5 border-b border-black">{j.finishDate}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["ลำดับ", "รายละเอียด", "จำนวน", "หน่วย", "หมายเหตุ"].map((h) => (
              <th key={h} className="border border-black px-1.5 py-1 font-semibold text-center">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {j.lines.map((line, idx) => (
            <tr key={line.id}>
              <td className="border border-black px-1.5 py-1 text-center">{idx + 1}</td>
              <td className="border border-black px-1.5 py-1">
                {line.description}
                {/* บรรทัดย่อย เยื้องเข้ามาในช่องเดียวกัน ไม่แตกคอลัมน์ — รูปแบบเดียวกับใบสั่งผลิตและใบขอซื้อ */}
                {(line.subDetails ?? []).map((sd, i) => (
                  <p key={i} style={{ margin: "1px 0 0 12px" }}>{sd}</p>
                ))}
              </td>
              <td className="border border-black px-1.5 py-1 text-center">{line.quantity ?? ""}</td>
              <td className="border border-black px-1.5 py-1 text-center">{line.unit}</td>
              <td className="border border-black px-1.5 py-1">{line.remark}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs font-semibold mt-4 mb-1">ขอบเขตงาน (Scope of work)</p>
      {/* แยกเป็นหัวข้อตั้งแต่ 2026-08-27 — เดิมยุบตัวเลือกทุกกลุ่มมาเรียงรวมเป็นตารางสองคอลัมน์เดียว
          ตอนนี้พิมพ์ชื่อหัวข้อกำกับ และมีบรรทัดย่อยใต้ข้อที่ติ๊กไว้ */}
      {j.scopeChecklist.map((g) => (
        <div key={g.key} className="mb-1.5">
          <p className="text-[10px] font-semibold">{g.title}</p>
          <div className="text-[10px] grid grid-cols-2 gap-x-4">
            {g.options.map((opt) => (
              <div key={opt.key}>
                <p>{opt.checked ? "☑" : "☐"} {opt.label}{opt.value ? `: ${opt.value}` : ""}</p>
                {(opt.details ?? []).map((d, i) => (
                  <p key={i} style={{ margin: "0 0 0 12px" }}>- {d}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}

      {j.outOfScope.trim() && (
        <>
          <p className="text-xs font-semibold mt-4 mb-1">รายละเอียดอื่นๆ (Out of Scope)</p>
          <p className="text-[10px] whitespace-pre-line">{j.outOfScope}</p>
        </>
      )}

      <table className="w-full text-xs mt-6" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            {([
              ["ผู้ร้องขอ", j.requestedBy, j.requestedAt],
              ["ผู้อนุมัติ", j.approvedBy, j.approvedAt],
              ["ผู้รับเอกสาร", j.documentRecipientBy, j.documentRecipientAt],
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
      <p className="text-[9px] text-right mt-4">FM-PJ-01 Rev.01 : 10/10/65</p>
    </div>
  );
}
