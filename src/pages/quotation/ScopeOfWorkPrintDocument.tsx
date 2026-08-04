import { formatPaymentMethod, type ScopeOfWork } from "../../lib/scopeOfWork";
import type { CompanyHeaderInfo } from "../../lib/storage";
import type { User } from "../../lib/users";
import { formatQuoteDateNumeric as fmtNumericDate } from "../../lib/quotes";
import { BrandMark } from "../../components/BrandMark";
import { FacebookIcon, LineAppIcon } from "../../components/PrintSocialIcons";

// แสดงแถวข้อมูล label กับค่า สำหรับเอกสารพิมพ์
// Renders a label/value row for the print document.
function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-[10px] leading-[1.7]">
      <span className="text-[#5a7299] flex-shrink-0 w-[92px]">{label}</span>
      <span className={`flex-1 border-b border-dotted border-[#0b1d3a]/25 min-h-[13px] ${mono ? "font-mono" : ""}`}>{value || " "}</span>
    </div>
  );
}

// แสดงกล่องเช็คบอกซ์ ติ๊กถูกหรือว่าง
// Renders a checkbox box, checked or empty.
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-3 h-3 border border-[#0b1d3a] flex-shrink-0 align-middle">
      {checked && <span className="text-[9px] leading-none font-bold">✓</span>}
    </span>
  );
}

// สร้างเอกสาร Scope of Work สำหรับพิมพ์/PDF ตามรูปแบบเอกสารต้นฉบับ ไม่แสดงราคา
// Renders the printable Scope of Work document matching the reference layout, without pricing.
export function ScopeOfWorkPrintDocument({ scopeOfWork, companyHeader, sellerUser, approverUser }: {
  scopeOfWork: ScopeOfWork;
  companyHeader: CompanyHeaderInfo;
  sellerUser?: User;
  approverUser?: User;
}) {
  const s = scopeOfWork;
  let runningNumber = 0;
  const itemNumbers = s.items.map((it) => (it.isSectionHeader ? null : ++runningNumber));

  return (
    <>
      {/* ยกเลิก margin ของ @page เพื่อไม่ให้เบราว์เซอร์วาดวันที่/URL/ชื่อหน้าตอนพิมพ์ — ชดเชยระยะขอบ
          กระดาษเองด้วย padding แทน (ซ้าย/ขวาซ้ำทุกหน้าผ่าน padding ของ table เอง, บนซ้ำทุกหน้าผ่าน
          thead ที่พิมพ์ซ้ำ, ล่างชดเชยเฉพาะหน้าสุดท้ายที่บล็อคลายเซ็นอยู่) — เหมือน PrintDocument.tsx */}
      <style>{"@media print { @page { margin: 0 } }"}</style>
      <table className="hidden print:table w-full border-collapse text-[#0b1d3a]" style={{ fontSize: "10.5px", padding: "0 12mm" }}>
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: "68%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "13%" }} />
        </colgroup>
        <thead>
          <tr>
            <td colSpan={4} className="pt-[12mm] px-0 pb-0">
              <div className="flex items-start gap-3 mb-2">
                {companyHeader.logoDataUrl ? (
                  <img src={companyHeader.logoDataUrl} alt={companyHeader.name} className="w-11 h-11 rounded-full object-contain border border-[#0b1d3a]/15 bg-white p-0.5 flex-shrink-0" />
                ) : (
                  <BrandMark size={44} variant="mark" theme="dark" className="flex-shrink-0" />
                )}
                <div>
                  <p className="font-bold text-[12px]">{companyHeader.name}</p>
                  {companyHeader.address.trim() && <p className="text-[9.5px] text-[#5a7299] leading-snug">{companyHeader.address}</p>}
                  {(companyHeader.phone.trim() || companyHeader.email.trim()) && (
                    <p className="text-[9.5px] text-[#5a7299]">
                      {companyHeader.phone.trim() && <>โทรศัพท์ : {companyHeader.phone}</>}
                      {companyHeader.phone.trim() && companyHeader.email.trim() && "  "}
                      {companyHeader.email.trim() && <>E-mail : {companyHeader.email}</>}
                    </p>
                  )}
                  {(companyHeader.facebookName.trim() || companyHeader.lineId.trim() || companyHeader.website.trim()) && (
                    <div className="flex items-center gap-1.5 text-[9.5px] text-[#5a7299] mt-0.5">
                      {companyHeader.facebookName.trim() && (
                        <span className="flex items-center gap-1"><FacebookIcon size={10} /> {companyHeader.facebookName}</span>
                      )}
                      {companyHeader.lineId.trim() && (
                        <span className="flex items-center gap-1"><LineAppIcon size={10} /> {companyHeader.lineId}</span>
                      )}
                      {companyHeader.website.trim() && <span>{companyHeader.website}</span>}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-center font-bold text-[16px] tracking-widest pb-2 mb-2 border-b-2 border-[#0b1d3a]" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
                SCOPE OF WORK
              </p>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-3">
                <div className="space-y-1">
                  <Field label="ชื่อลูกค้า" value={s.customerSnapshot.companyName} />
                  <Field label="รหัสงาน" value={s.scopeNumber} mono />
                  <Field label="รหัส Drawing" value={s.drawingCode} />
                  <Field label="สถานที่ส่งของ" value={s.deliveryLocation} />
                  <Field label="ชื่อผู้ติดต่อส่งของ" value={s.shippingContact} />
                  <Field label="ชื่อผู้ติดต่อวางบิล" value={s.billingContact} />
                </div>
                <div className="space-y-1">
                  <Field label="วันที่" value={fmtNumericDate(s.issueDate)} />
                  <Field label="วันที่ส่งของ/ส่งแบบอนุมัติ" value={fmtNumericDate(s.deliveryDate)} />
                  <Field label="เอกสารใบสั่งซื้อเลขที่" value={s.customerPoNumber} mono />
                  <Field label="ใบเสนอราคา" value={s.quotationNumber} mono />
                  <Field label="เบอร์โทรผู้ติดต่อส่งของ" value={s.shippingPhone} mono />
                  <Field label="เบอร์โทรผู้ติดต่อวางบิล" value={s.billingPhone} mono />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-x-3 gap-y-2 border-t border-b border-[#0b1d3a]/30 py-2 mb-2">
                {s.checklistGroups.map((group) => (
                  <div key={group.key} className="break-inside-avoid">
                    <p className="font-bold text-[9.5px] mb-0.5 underline">{group.title}</p>
                    {group.options.map((opt) => (
                      <div key={opt.key} className="flex items-center gap-1 text-[9.5px] leading-[1.5]">
                        <Checkbox checked={opt.checked} /> <span>{opt.label}</span>
                      </div>
                    ))}
                    {group.note !== undefined && group.note.trim() && (
                      <p className="text-[9px] italic text-[#5a7299]">({group.note})</p>
                    )}
                  </div>
                ))}
                <div className="break-inside-avoid">
                  <p className="font-bold text-[9.5px] mb-0.5 underline">การเก็บเงิน</p>
                  {s.paymentConditions.installments.map((installment) => {
                    const method = formatPaymentMethod(installment);
                    return (
                      <p key={installment.id} className="text-[9.5px] leading-[1.5]">
                        {installment.pct !== null ? `${installment.pct}% ` : ""}{installment.label || "-"}{method ? ` (${method})` : ""}
                      </p>
                    );
                  })}
                  {s.paymentConditions.description.trim() && <p className="text-[9.5px] leading-[1.5] whitespace-pre-line">{s.paymentConditions.description}</p>}
                  {s.paymentConditions.notes.trim() && <p className="text-[9px] italic text-[#5a7299] whitespace-pre-line">{s.paymentConditions.notes}</p>}
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
        {s.items.map((item, idx) => {
          if (item.isSectionHeader) {
            return (
              <tbody key={item.id}>
                <tr>
                  <td colSpan={4} className="px-2 pt-2.5 pb-1 font-bold text-[11px] border-b border-[#0b1d3a]/15">{item.name}</td>
                </tr>
              </tbody>
            );
          }
          return (
            <tbody key={item.id} style={{ breakInside: "avoid" }}>
              <tr className="align-top">
                <td className="px-2 py-1.5 text-center font-mono">{itemNumbers[idx]}</td>
                <td className="px-2 py-1.5 font-semibold">{item.name}</td>
                <td className="px-2 py-1.5 text-center font-mono">{item.quantity ?? ""}</td>
                <td className="px-2 py-1.5 text-center">{item.unit}</td>
              </tr>
              {(item.specifications.length > 0 || item.remark.trim()) && (
                <tr>
                  <td />
                  <td colSpan={3} className="px-2 pb-2 text-[10px] text-[#3b5a85]">
                    {item.specifications.filter((sp) => sp.text.trim()).map((sp) => (
                      <p key={sp.id}>- {sp.text}</p>
                    ))}
                    {item.remark.trim() && <p className="italic whitespace-pre-line">{item.remark}</p>}
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
        <tbody>
          {s.items.length === 0 && (
            <tr><td colSpan={4} className="px-2 py-4 text-center text-[10px] text-[#5a7299]">ยังไม่มีรายการ</td></tr>
          )}

          {s.remarks.trim() && (
            <tr>
              <td colSpan={4} className="pt-4">
                <p className="text-[10.5px] font-semibold mb-1">หมายเหตุ</p>
                <p className="text-[10px] whitespace-pre-line leading-relaxed">{s.remarks}</p>
              </td>
            </tr>
          )}

          <tr>
            <td colSpan={4} className="pt-5 pb-[12mm]" style={{ breakInside: "avoid" }}>
              <table className="w-full border-collapse border border-[#0b1d3a]/20">
                <thead>
                  <tr className="bg-[#1a5fb4] text-white">
                    <th className="px-2 py-1 text-[10px] font-semibold border-r border-white/20">ผู้ขาย</th>
                    <th className="px-2 py-1 text-[10px] font-semibold">ผู้อนุมัติ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {[{ user: sellerUser, name: s.seller.name, date: s.seller.date }, { user: approverUser, name: s.approver.name, date: s.approver.date }].map((col, i) => (
                      <td key={i} className={`px-3 py-2 align-bottom h-20 relative ${i === 0 ? "border-r border-[#0b1d3a]/20" : ""}`}>
                        <div className="h-10 flex items-end justify-center">
                          {col.user?.signatureDataUrl && <img src={col.user.signatureDataUrl} alt="" className="max-h-9 max-w-[80%] object-contain" />}
                        </div>
                        <div className="border-t border-[#0b1d3a]/30 mt-1 pt-1 text-center">
                          <p className="text-[10px]">{col.name || " "}</p>
                          <p className="text-[9px] text-[#5a7299]">{col.date ? fmtNumericDate(col.date) : "..... / ..... / ....."}</p>
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
