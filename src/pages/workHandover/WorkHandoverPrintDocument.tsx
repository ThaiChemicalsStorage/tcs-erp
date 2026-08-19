import type { WorkHandoverNote } from "../../lib/workHandover";

/**
 * Print layout for the Work Handover Note (ใบส่งมอบงาน) — added 2026-08-19.
 *
 * ⚠️ UNLIKE JobOrderPrintDocument.tsx/MaterialRequisitionPrintDocument.tsx/
 * PurchaseRequestPrintDocument.tsx, this is NOT a reproduction of a real reference PDF — no paper
 * form was ever provided for this document. This is a first-draft structural guess based on the
 * document's known purpose (see src/lib/workHandover.ts's file-level doc comment and
 * docs/MODULES/Project.md "Work Handover Note (first draft, unverified)"). Layout/field positions
 * WILL need to change once a real reference form is available — do not treat this as calibrated.
 *
 * Deliberately NOT wired through i18n, matching the exact precedent the other 3 Project-module print
 * documents already established: printed business documents in this app always render in a fixed
 * language regardless of the preparer's own UI toggle.
 */
export function WorkHandoverPrintDocument({ workHandover: w }: { workHandover: WorkHandoverNote }) {
  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif" }}>
      <style>{"@media print { @page { size: A4 portrait; margin: 12mm; } }"}</style>
      <h1 className="text-center text-lg font-bold mb-3">ใบส่งมอบงาน (WORK HANDOVER NOTE)</h1>
      <table className="w-full text-xs mb-3" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td className="py-0.5 pr-2 font-semibold w-28">ชื่อลูกค้า:</td>
            <td className="py-0.5 border-b border-black">{w.customerName}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold w-28">รหัสงาน:</td>
            <td className="py-0.5 border-b border-black w-32">{w.id}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">รายละเอียดงาน/สถานที่:</td>
            <td className="py-0.5 border-b border-black" colSpan={3}>{w.siteDescription}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">วันที่งานแล้วเสร็จ:</td>
            <td className="py-0.5 border-b border-black">{w.workCompletedDate}</td>
            <td className="py-0.5 pl-4 pr-2 font-semibold">สถานะ:</td>
            <td className="py-0.5 border-b border-black">{w.isSigned ? `เซ็นรับงานแล้ว (${w.signedAt?.slice(0, 10) ?? ""})` : "ร่าง"}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["ลำดับ", "รายละเอียดงานที่ส่งมอบ", "จำนวน", "หน่วย", "หมายเหตุ"].map((h) => (
              <th key={h} className="border border-black px-1.5 py-1 font-semibold text-center">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {w.lines.length === 0 ? (
            <tr><td className="border border-black px-1.5 py-2 text-center text-muted-foreground" colSpan={5}>—</td></tr>
          ) : (
            w.lines.map((line, idx) => (
              <tr key={line.id}>
                <td className="border border-black px-1.5 py-1 text-center">{idx + 1}</td>
                <td className="border border-black px-1.5 py-1">{line.description}</td>
                <td className="border border-black px-1.5 py-1 text-center">{line.quantity ?? ""}</td>
                <td className="border border-black px-1.5 py-1 text-center">{line.unit}</td>
                <td className="border border-black px-1.5 py-1">{line.remark}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <table className="w-full text-xs mt-6" style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td className="w-1/2 py-2 text-center align-top">
              <div className="h-[70px] flex items-center justify-center">
                {w.preparedBySignatureDataUrl && <img src={w.preparedBySignatureDataUrl} alt="" className="max-h-full max-w-[80%] object-contain" />}
              </div>
              <div className="border-b border-black h-2 mb-1" />
              <p>ผู้จัดทำ (ฝ่ายโครงการ): {w.preparedByName}</p>
              <p>วันที่: {w.preparedAt}</p>
            </td>
            <td className="w-1/2 py-2 text-center align-top">
              <div className="h-[70px] flex items-center justify-center">
                {w.customerSignatureDataUrl && <img src={w.customerSignatureDataUrl} alt="" className="max-h-full max-w-[80%] object-contain" />}
              </div>
              <div className="border-b border-black h-2 mb-1" />
              <p>ผู้รับมอบงาน (ลูกค้า): {w.customerSignedName}</p>
              <p>วันที่: {w.customerSignedAt ?? ""}</p>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-[9px] text-right mt-4">
        {w.documentCode ?? "รหัสฟอร์ม: รอยืนยันจากฟอร์มจริง (ยังไม่มีเอกสารต้นฉบับอ้างอิง — โครงสร้างนี้เป็นการร่างเบื้องต้น)"}
      </p>
    </div>
  );
}
