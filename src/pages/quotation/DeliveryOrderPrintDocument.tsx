import type { CompanyHeaderInfo } from "../../lib/storage";
import type { DeliveryOrder, DeliveryOrderInstallment } from "../../lib/deliveryOrder";
import { formatQuoteDateNumeric as fmtNumericDate } from "../../lib/quotes";

/**
 * Print/PDF output for a Delivery Order — closely follows the printed structure of the reference
 * PDF ("ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM บริษัท อีจ.pdf", `public/`): one printed page PER
 * payment installment, each with its own company letterhead, "เรียน"/"เลขที่"/"วันที่"/"WORK ORDER"
 * header, an item table showing only the items ticked for that installment, a "Remark:" footer line,
 * and a customer/TCS signature block. Deliberately does NOT reproduce the sample's blue handwritten
 * เลขที่/วันที่/signature values — those render the live editable field values only, blank where the
 * user hasn't filled them in (same convention `ScopeOfWorkPrintDocument.tsx` already follows), nor
 * any pricing (never shown on this document type, only quantities/units).
 */

function InstallmentPage({
  deliveryOrder,
  installment,
  companyHeader,
}: {
  deliveryOrder: DeliveryOrder;
  installment: DeliveryOrderInstallment;
  companyHeader: CompanyHeaderInfo;
}) {
  const pageItems = deliveryOrder.items.filter((it) => installment.itemIds.includes(it.id));

  return (
    <table className="hidden print:table w-full border-collapse text-[#0b1d3a]" style={{ fontSize: "10.5px", breakAfter: "page" }}>
      <colgroup>
        <col style={{ width: "6%" }} />
        <col style={{ width: "68%" }} />
        <col style={{ width: "13%" }} />
        <col style={{ width: "13%" }} />
      </colgroup>
      <thead>
        <tr>
          <td colSpan={4} className="p-0">
            {/* Company letterhead */}
            <div className="flex items-start gap-3 pb-2 mb-2 border-b-2 border-[#0b1d3a]">
              {companyHeader.logoDataUrl && (
                <img src={companyHeader.logoDataUrl} alt={companyHeader.name} className="w-12 h-12 rounded-full object-contain border border-[#0b1d3a]/15 bg-white p-0.5 flex-shrink-0" />
              )}
              <div>
                <p className="font-bold text-[13px]">{companyHeader.name}</p>
                {companyHeader.address.trim() && <p className="text-[9.5px] text-[#5a7299] leading-snug">{companyHeader.address}</p>}
                {(companyHeader.phone.trim() || companyHeader.email.trim()) && (
                  <p className="text-[9.5px] text-[#5a7299]">
                    {companyHeader.phone.trim() && <>TEL : {companyHeader.phone}</>}
                    {companyHeader.phone.trim() && companyHeader.email.trim() && "  "}
                    {companyHeader.email.trim() && <>E-mail : {companyHeader.email}</>}
                  </p>
                )}
              </div>
            </div>

            <p className="text-center font-bold text-[15px] tracking-wide" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
              ใบส่งมอบสินค้าและบริการ
            </p>
            <p className="text-center text-[11px] text-[#5a7299] mb-2.5">Delivery Order &amp; Service Order</p>

            {/* Two-column header */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-2.5 border-t border-b border-[#0b1d3a]/30 py-2">
              <div className="space-y-0.5">
                <p className="text-[10px]"><span className="text-[#5a7299]">เรียน :</span> {deliveryOrder.customerCompanyName || " "}</p>
                {deliveryOrder.customerAddress.trim() && <p className="text-[10px] whitespace-pre-line pl-[38px]">{deliveryOrder.customerAddress}</p>}
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px]"><span className="text-[#5a7299] inline-block w-16">เลขที่</span> {installment.documentNumber || " "}</p>
                <p className="text-[10px]"><span className="text-[#5a7299] inline-block w-16">วันที่</span> {installment.issueDate ? fmtNumericDate(installment.issueDate) : " "}</p>
                <p className="text-[10px]"><span className="text-[#5a7299] inline-block w-16">WORK ORDER</span> <span className="font-mono">{deliveryOrder.scopeNumber}</span></p>
                <p className="text-[10px]"><span className="text-[#5a7299] inline-block w-16">งวดชำระ</span> {`${installment.pct !== null ? `${installment.pct}% ` : ""}${installment.label}`.trim() || " "}</p>
              </div>
            </div>
          </td>
        </tr>
        <tr className="bg-[#1a5fb4] text-white">
          {["ลำดับ", "รายการ", "จำนวน", "หน่วย"].map((h, i) => (
            <th key={h} className={`px-2 py-1.5 text-[10px] font-semibold ${i === 0 || i === 2 || i === 3 ? "text-center" : "text-left"}`}>{h}</th>
          ))}
        </tr>
      </thead>
      {/* Same "item + its spec/detail row share one unbreakable <tbody>" convention as
          ScopeOfWorkPrintDocument.tsx — keeps a heading from splitting away from its first detail
          line across a page boundary. */}
      {pageItems.map((item, idx) => (
        <tbody key={item.id} style={{ breakInside: "avoid" }}>
          <tr className="align-top">
            <td className="px-2 py-1.5 text-center font-mono">{idx + 1}</td>
            <td className="px-2 py-1.5 font-semibold">{item.name}</td>
            <td className="px-2 py-1.5 text-center font-mono">{item.quantity ?? ""}</td>
            <td className="px-2 py-1.5 text-center">{item.unit}</td>
          </tr>
          {item.specifications.filter((sp) => sp.text.trim()).length > 0 && (
            <tr>
              <td />
              <td colSpan={3} className="px-2 pb-2 text-[10px] text-[#3b5a85]">
                {item.specifications.filter((sp) => sp.text.trim()).map((sp) => (
                  <p key={sp.id}>- {sp.text}</p>
                ))}
              </td>
            </tr>
          )}
        </tbody>
      ))}
      <tbody>
        {pageItems.length === 0 && (
          <tr><td colSpan={4} className="px-2 py-4 text-center text-[10px] text-[#5a7299]">ยังไม่ได้เลือกรายการสำหรับงวดนี้</td></tr>
        )}

        {installment.remark.trim() && (
          <tr>
            <td colSpan={4} className="pt-3 pb-1">
              <p className="text-[10px] whitespace-pre-line"><span className="font-semibold">Remark:</span> {installment.remark}</p>
            </td>
          </tr>
        )}

        <tr>
          <td colSpan={4} className="pt-5" style={{ breakInside: "avoid" }}>
            <div className="grid grid-cols-2 gap-8 text-center">
              <p className="text-[10px]">ลงนาม {deliveryOrder.customerCompanyName || "..."}</p>
              <p className="text-[10px]">ลงนาม {companyHeader.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-8 mt-6 text-center text-[10px]">
              {["ผู้ตรวจรับสินค้าและงานบริการ", "ผู้ส่งสินค้าและงานบริการ"].map((label) => (
                <div key={label}>
                  <p className="border-b border-dotted border-[#0b1d3a]/40 pb-3">&nbsp;</p>
                  <p className="mt-1">ลงชื่อ .......................................................</p>
                  <p className="mt-1">( ....................................................... )</p>
                  <p className="mt-1 text-[#5a7299]">{label}</p>
                  <p className="mt-1">วันที่ ....... / ....... / .......</p>
                </div>
              ))}
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** `onlyInstallmentId` scopes the print output to a single payment milestone's page — the
 * per-milestone "พิมพ์" buttons (`DeliveryOrderDocument.tsx`) pass the clicked installment's id so
 * the printed document contains that milestone's Delivery Note alone, never a sibling milestone's
 * items/เลขที่/วันที่/Remark. When null (e.g. a raw browser Ctrl+P with no button clicked), every
 * milestone's page renders — each page is still self-contained per installment either way. */
export function DeliveryOrderPrintDocument({ deliveryOrder, companyHeader, onlyInstallmentId = null }: {
  deliveryOrder: DeliveryOrder;
  companyHeader: CompanyHeaderInfo;
  onlyInstallmentId?: string | null;
}) {
  const installments = onlyInstallmentId
    ? deliveryOrder.installments.filter((i) => i.id === onlyInstallmentId)
    : deliveryOrder.installments;
  return (
    <>
      {installments.map((installment) => (
        <InstallmentPage key={installment.id} deliveryOrder={deliveryOrder} installment={installment} companyHeader={companyHeader} />
      ))}
    </>
  );
}
