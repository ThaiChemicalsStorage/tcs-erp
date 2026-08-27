import { Fragment } from "react";
import { Pin } from "lucide-react";
import type { CompanyHeaderInfo } from "../../lib/storage";
import type { User } from "../../lib/users";
import {
  type Quote, type QuoteLine, type DiscountMode, fmt, lineSubtotal, lineDiscountAmount, computeTotals, bahtText, VAT_RATE,
  lineHasDetails, formatQuoteDateThai as fmtThaiDate, formatQuoteDateNumeric as fmtNumericDate,
} from "../../lib/quotes";
import { BrandMark } from "../../components/BrandMark";
import { FacebookIcon, LineAppIcon } from "../../components/PrintSocialIcons";

// ตรวจว่าหัวข้อหมวดมีรายการตามหลังหรือไม่ ถ้าไม่มีจะไม่พิมพ์หัวข้อนั้นออกมา
// Checks whether a section header has an item right after it, so empty headers are skipped when printing
function sectionHeaderHasItems(lines: QuoteLine[], headerIdx: number): boolean {
  const next = lines[headerIdx + 1];
  return !!next && !next.isSectionHeader;
}

// แสดงป้ายชื่อ-ค่าหนึ่งบรรทัด ซ่อนตัวเองถ้าค่าว่างเปล่า
// Renders a label-value line, hiding itself when the value is blank
function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  if (!value.trim()) return null;
  return (
    <div className="flex gap-2 text-[10.5px] leading-[1.6]">
      <span className="text-[#5a7299] flex-shrink-0">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}

// ตารางใบเสนอราคาแบบสำหรับพิมพ์ (แสดงเฉพาะตอนสั่งพิมพ์) รวมหัวเอกสาร รายการ ยอดรวม และช่องลายเซ็น
// Print-only quotation table (shown only when printing), including header, line items, totals, and signatures
export function PrintDocument({
  isDetail,
  quote,
  nextId,
  companyHeader,
  client, contactName, contactPhone, contactEmail, address, taxId,
  deliveryMethod, deliveryAddress, project,
  poRef, paymentTerms, issueDate, expiryDate, jobTypeName,
  lines, discount, discountMode, remarks,
  preparerUser, approverUser, preparerName, preparerDate, approverName, approverDate,
}: {
  isDetail: boolean;
  quote?: Quote;
  nextId: string;
  companyHeader: CompanyHeaderInfo;
  client: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  deliveryAddress: string;
  project: string;
  poRef: string;
  paymentTerms: string;
  issueDate: string;
  expiryDate: string;
  jobTypeName: string;
  lines: QuoteLine[];
  discount: number;
  discountMode?: DiscountMode;
  remarks: string;
  preparerUser?: User;
  approverUser?: User;
  preparerName: string;
  preparerDate: string;
  approverName: string;
  approverDate: string;
}) {
  const { subtotal, discountAmt, afterDiscount, vatAmt, total } = computeTotals(lines, discount, discountMode);
  const quoteId = isDetail ? quote!.id : nextId;

  let runningItemNumber = 0;
  const itemNumbers = lines.map((l) => (l.isSectionHeader ? null : ++runningItemNumber));

  const signatureColumns = [
    { label: "ผู้เสนอราคา", user: preparerUser, name: preparerName, date: preparerDate },
    { label: "ผู้อนุมัติใบเสนอราคา", user: approverUser, name: approverName, date: approverDate },
    { label: "ผู้ยืนยันการสั่งซื้อ", user: undefined, name: "", date: "" },
  ];

  return (
    <>
      {/* ยกเลิก margin ของ @page เพื่อไม่ให้เบราว์เซอร์วาดวันที่/URL/ชื่อหน้าตอนพิมพ์ — ชดเชยระยะขอบ
          กระดาษเองด้วย padding แทน (ซ้าย/ขวาซ้ำทุกหน้าผ่าน padding ของ table เอง, บนซ้ำทุกหน้าผ่าน
          thead ที่พิมพ์ซ้ำ, ล่างชดเชยเฉพาะหน้าสุดท้ายที่บล็อคลายเซ็นอยู่) */}
      <style>{"@media print { @page { size: A4 portrait; margin: 0 } }"}</style>
      <table className="hidden print:table w-full border-collapse text-[#0b1d3a]" style={{ fontSize: "11px", padding: "0 12mm" }}>
        <colgroup>
          <col style={{ width: "4%" }} />
          <col style={{ width: "33%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "16%" }} />
        </colgroup>
        <thead>
          <tr>
            <td colSpan={7} className="p-0">
              <div className="relative pt-[12mm] pb-3 mb-2 border-b-2 border-[#0b1d3a]/10">
                <div className="absolute top-0 right-0 w-6 h-20 bg-[#1a5fb4] flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold tracking-[0.2em]" style={{ writingMode: "vertical-rl" }}>QUOTATION</span>
                </div>

                <div className="flex justify-between items-start pr-8">
                  <span className="text-[10px] font-mono text-[#5a7299]">{fmtNumericDate(issueDate)}</span>
                  <span className="text-[10px] font-mono text-[#5a7299]">{quoteId}</span>
                </div>

                <div className="flex items-start gap-3 mt-1 pr-8">
                  {companyHeader.logoDataUrl ? (
                    <img src={companyHeader.logoDataUrl} alt={companyHeader.name} className="w-12 h-12 rounded-full object-contain border border-[#0b1d3a]/15 bg-white p-0.5 flex-shrink-0" />
                  ) : (
                    <BrandMark size={48} variant="mark" theme="dark" className="flex-shrink-0" />
                  )}
                  <div>
                    <p className="font-bold text-[13px]">{companyHeader.name}</p>
                    {companyHeader.address.trim() && <p className="text-[10px] text-[#5a7299] leading-snug">{companyHeader.address}</p>}
                    {companyHeader.taxId.trim() && <p className="text-[10px] text-[#5a7299]">เลขประจำตัวผู้เสียภาษี : {companyHeader.taxId}</p>}
                    {(companyHeader.phone.trim() || companyHeader.email.trim()) && (
                      <p className="text-[10px] text-[#5a7299]">
                        {companyHeader.phone.trim() && <>โทรศัพท์ : {companyHeader.phone}</>}
                        {companyHeader.phone.trim() && companyHeader.email.trim() && "  "}
                        {companyHeader.email.trim() && <>E-mail : {companyHeader.email}</>}
                      </p>
                    )}
                    {(companyHeader.facebookName.trim() || companyHeader.lineId.trim() || companyHeader.website.trim()) && (
                      <div className="flex items-center gap-1.5 text-[10px] text-[#5a7299] mt-0.5">
                        {companyHeader.facebookName.trim() && (
                          <span className="flex items-center gap-1"><FacebookIcon size={11} /> {companyHeader.facebookName}</span>
                        )}
                        {companyHeader.lineId.trim() && (
                          <span className="flex items-center gap-1"><LineAppIcon size={11} /> {companyHeader.lineId}</span>
                        )}
                        {companyHeader.website.trim() && <span>{companyHeader.website}</span>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mt-3">
                  <div className="space-y-0.5">
                    <p className="font-bold text-[13px] mb-1">ผู้ซื้อ</p>
                    <p className="font-semibold text-[11px]">{client}</p>
                    {address.trim() && <p className="text-[10.5px] leading-snug">{address}</p>}
                    <Field label="เลขประจำตัวผู้เสียภาษี" value={taxId} mono />
                    <Field label="ชื่อผู้ติดต่อ" value={contactName} />
                    <Field label="เบอร์โทร" value={contactPhone} mono />
                    <Field label="E-mail" value={contactEmail} />
                    <Field label="วิธีจัดส่ง" value={deliveryMethod} />
                    <Field label="ที่อยู่จัดส่ง" value={deliveryAddress} />
                    <Field label="โครงการ" value={project} />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[#1a5fb4] font-bold text-[17px] mb-1" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>ใบเสนอราคา</p>
                    <Field label="เลขที่" value={quoteId} mono />
                    <Field label="วันที่" value={fmtThaiDate(issueDate)} />
                    <Field label="วันที่ยืนราคา" value={fmtThaiDate(expiryDate)} />
                    <Field label="ประเภทงาน" value={jobTypeName} />
                    <Field label="อ้างอิง PO" value={poRef} mono />
                    <Field label="เงื่อนไขการชำระเงิน" value={paymentTerms} />
                    <Field label="Salesperson" value={preparerName} />
                    <Field label="โทรศัพท์" value={preparerUser?.phone ?? ""} mono />
                    <Field label="E-mail" value={preparerUser?.email ?? ""} />
                  </div>
                </div>
              </div>
            </td>
          </tr>
          <tr className="bg-[#1a5fb4] text-white">
            {["ลำดับ", "รายละเอียด", "จำนวน", "หน่วย", "ราคา/หน่วย", "ส่วนลด/หน่วย", "มูลค่า"].map((h, i) => (
              <th key={h} className={`px-2 py-1.5 text-[10px] font-semibold ${i === 0 || i === 2 || i === 3 ? "text-center" : i === 1 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            if (line.isSectionHeader) {
              if (!sectionHeaderHasItems(lines, idx)) return null;
              return (
                <tr key={line.id}>
                  <td colSpan={7} className="px-2 pt-2.5 pb-1 font-bold text-[11.5px] border-b border-[#0b1d3a]/15">
                    {line.description}
                  </td>
                </tr>
              );
            }
            const hasDetails = lineHasDetails(line);
            // คอลัมน์ในเอกสารพิมพ์คือ "ส่วนลด/หน่วย" เสมอ ถ้าผู้ใช้กรอกส่วนลดเป็นจำนวนเงินของทั้งรายการ
            // จะถูกเฉลี่ยกลับมาเป็นต่อหน่วยเพื่อให้แบบฟอร์มที่พิมพ์ออกมายังคงรูปแบบเดิม
            // The printed column is always "discount per unit". A line whose discount was entered as
            // a baht amount is a discount on the whole line, so it is divided back down per unit
            // here — the printed form keeps the exact layout it has always had either way.
            const lineDiscount = lineDiscountAmount(line);
            const unitDiscount = line.qty > 0 ? lineDiscount / line.qty : lineDiscount;
            return (
              <Fragment key={line.id}>
                <tr className="align-top">
                  <td className="px-2 py-1.5 text-center font-mono">{itemNumbers[idx]}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-semibold">{line.description}</span>
                    {line.tags.map((tag) => (
                      <span key={tag} className="inline-block ml-1 px-1 text-[9px] border border-[#1a5fb4]/30 text-[#1a5fb4] rounded">{tag}</span>
                    ))}
                  </td>
                  <td className="px-2 py-1.5 text-center font-mono">{fmt(line.qty)}</td>
                  <td className="px-2 py-1.5 text-center">{line.unit}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{fmt(line.unitPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {unitDiscount > 0
                      ? `${fmt(unitDiscount)}${line.discountMode === "amount" ? "" : ` (${line.discount}%)`}`
                      : fmt(0)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmt(lineSubtotal(line))}</td>
                </tr>
                {hasDetails && (
                  <tr>
                    <td />
                    <td colSpan={6} className="px-2 pb-2 text-[10px] text-[#3b5a85]">
                      {line.subDetails.filter((sd) => sd.text.trim()).map((sd) => (
                        <div key={sd.id} className="flex items-start gap-1 mt-0.5">
                          <Pin size={9} className="mt-0.5 flex-shrink-0 text-[#7a9ac9]" />
                          <span>{sd.text}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}

          <tr>
            <td colSpan={7} className="pt-4">
              <div className="flex justify-end">
                <div className="w-64 space-y-1">
                  <div className="flex justify-between text-[11px]"><span>รวมเป็นเงิน</span><span className="font-mono">{fmt(subtotal)}</span></div>
                  <div className="flex justify-between text-[11px]">
                    <span>ส่วนลดพิเศษ{discount > 0 && discountMode !== "amount" ? ` (${discount}%)` : ""}</span>
                    <span className="font-mono">{fmt(discountAmt)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] border-t border-[#0b1d3a]/15 pt-1"><span>ยอดหลังหักส่วนลด</span><span className="font-mono">{fmt(afterDiscount)}</span></div>
                  <div className="flex justify-between text-[11px]"><span>VAT {VAT_RATE}%</span><span className="font-mono">{fmt(vatAmt)}</span></div>
                  <div className="flex justify-between text-[13px] font-bold border-t-2 border-[#0b1d3a]/30 pt-1.5 mt-1">
                    <span>จำนวนเงินรวมทั้งหมด THB</span><span className="font-mono">{fmt(total)}</span>
                  </div>
                  <p className="text-right text-[10px] italic text-[#5a7299]">{bahtText(total)}</p>
                </div>
              </div>
            </td>
          </tr>

          {remarks.trim() && (
            <tr>
              <td colSpan={7} className="pt-4">
                <p className="text-[11px] font-semibold mb-1">หมายเหตุ / เงื่อนไข</p>
                <p className="text-[10.5px] whitespace-pre-line leading-relaxed">{remarks}</p>
              </td>
            </tr>
          )}

          <tr>
            <td colSpan={7} className="pt-5 pb-[12mm]">
              <table className="w-full border-collapse border border-[#0b1d3a]/20">
                <thead>
                  <tr className="bg-[#1a5fb4] text-white">
                    {signatureColumns.map((col, i) => (
                      <th key={col.label} className={`px-2 py-1 text-[10px] font-semibold ${i < 2 ? "border-r border-white/20" : ""}`}>{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {signatureColumns.map((col, i) => (
                      <td key={col.label} className={`px-3 py-2 align-bottom h-20 relative ${i < 2 ? "border-r border-[#0b1d3a]/20" : ""}`}>
                        {i === 1 && companyHeader.stampDataUrl && (
                          <img src={companyHeader.stampDataUrl} alt="ตราประทับ" className="absolute right-2 top-1 h-12 w-12 object-contain opacity-80 pointer-events-none" />
                        )}
                        <div className="h-10 flex items-end justify-center">
                          {col.user?.signatureDataUrl && (
                            <img src={col.user.signatureDataUrl} alt="" className="max-h-9 max-w-[80%] object-contain" />
                          )}
                        </div>
                        <div className="border-t border-[#0b1d3a]/30 mt-1 pt-1 text-center">
                          <p className="text-[10px]">{col.name || " "}</p>
                          <p className="text-[9px] text-[#5a7299]">{col.date || "..... / ..... / ....."}</p>
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
