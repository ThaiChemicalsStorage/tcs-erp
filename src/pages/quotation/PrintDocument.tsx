import { Fragment } from "react";
import { Pin } from "lucide-react";
import type { CompanyHeaderInfo } from "../../lib/storage";
import type { User } from "../../lib/users";
import {
  type Quote, type QuoteLine, fmt, lineSubtotal, computeTotals, bahtText, VAT_RATE,
  formatQuoteDateThai as fmtThaiDate, formatQuoteDateNumeric as fmtNumericDate,
} from "../../lib/quotes";
import type { TemplateSection, TemplateConditionConfig } from "../../lib/quotationTemplates";
import { resolveDynamicFieldSchema, visibleFields, formatFieldDisplay, formatIncludedExcluded } from "../../lib/templateDynamicFields";
import { FormattedNotes } from "./notesFormat";
import { BrandMark } from "../../components/BrandMark";

/** Customer-facing display lines for one line's dynamic fields — plain visible fields formatted as
 * "Label: value", plus each `generateIncludedExcluded` checkboxGroup's auto-generated Included/
 * Excluded pair. Never the raw controls, never a hidden/blank field, never `undefined`/`null`. */
function dynamicFieldPrintLines(sections: TemplateSection[] | undefined, line: QuoteLine): string[] {
  if (!line.dynamicFields) return [];
  const schema = resolveDynamicFieldSchema(sections, line.sourceTemplateItemId);
  if (schema.length === 0) return [];
  const lines: string[] = [];
  for (const field of visibleFields(schema, line.dynamicFields)) {
    if (field.type === "checkboxGroup") {
      if (!field.generateIncludedExcluded) continue;
      const { included, excluded } = formatIncludedExcluded(schema, field, line.dynamicFields);
      if (included) lines.push(included);
      if (excluded) lines.push(excluded);
      continue;
    }
    const display = formatFieldDisplay(field, line.dynamicFields);
    if (display) lines.push(display);
  }
  return lines;
}

/** A section-header line with no item directly following it (e.g. every item under it was deleted
 * but the header itself wasn't) is never printed — an empty section heading on the customer PDF
 * reads as a mistake, not real content. Only checks the immediately-following line since
 * `applyTemplate.ts` always emits a header's items contiguously right after it. */
function sectionHeaderHasItems(lines: QuoteLine[], headerIdx: number): boolean {
  const next = lines[headerIdx + 1];
  return !!next && !next.isSectionHeader;
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  if (!value.trim()) return null;
  return (
    <div className="flex gap-2 text-[10.5px] leading-[1.6]">
      <span className="text-[#5a7299] flex-shrink-0">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}

export function PrintDocument({
  isDetail,
  quote,
  nextId,
  companyHeader,
  client, contactName, contactPhone, contactEmail, address, taxId,
  deliveryMethod, deliveryAddress, project,
  poRef, paymentTerms, issueDate, expiryDate, jobTypeName,
  lines, discount, remarks,
  notes, vatConditionText, warrantyText, deliveryDays, conditions, templateSections,
  preparerUser, approverUser, preparerName, preparerDate, approverName, approverDate,
}: {
  isDetail: boolean;
  quote?: Quote;
  nextId: string;
  /** Built once by QuoteDocument.tsx directly from the Settings -> Company Info singleton
   * (`Company`) — this app only ever issues quotations under a single company identity, so
   * there's no per-quote issuer selection. Typed as `CompanyHeaderInfo` (`src/lib/storage.ts`). */
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
  remarks: string;
  /** Condition/Notes section content (added 2026-07-20) — each independently optional, matching
   * `Quote.notes`/`vatConditionText`/`warrantyText`/`deliveryDays`. `templateSections` resolves
   * each line's dynamic-field schema (see `Quote.templateSnapshot.sections`). */
  notes?: string[];
  vatConditionText?: string;
  warrantyText?: string;
  deliveryDays?: number | null;
  conditions?: TemplateConditionConfig;
  templateSections?: TemplateSection[];
  preparerUser?: User;
  approverUser?: User;
  preparerName: string;
  preparerDate: string;
  approverName: string;
  approverDate: string;
}) {
  const { subtotal, discountAmt, afterDiscount, vatAmt, total } = computeTotals(lines, discount);
  const quoteId = isDetail ? quote!.id : nextId;

  // "No." numbering counts only ordinary priced lines, matching LineItemsEditor.tsx — a
  // section-header row (see `sectionHeaderHasItems` above) gets no number of its own. Precomputed
  // as a plain array rather than a mutable counter reassigned inside the render's line-mapping
  // closure, which React's render-purity lint rule (react-hooks/immutability) flags.
  let runningItemNumber = 0;
  const itemNumbers = lines.map((l) => (l.isSectionHeader ? null : ++runningItemNumber));

  const signatureColumns = [
    { label: "ผู้เสนอราคา", user: preparerUser, name: preparerName, date: preparerDate },
    { label: "ผู้อนุมัติใบเสนอราคา", user: approverUser, name: approverName, date: approverDate },
    { label: "ผู้ยืนยันการสั่งซื้อ", user: undefined, name: "", date: "" },
  ];

  return (
    <table className="hidden print:table w-full border-collapse text-[#0b1d3a]" style={{ fontSize: "11px" }}>
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
            <div className="relative pb-3 mb-2 border-b-2 border-[#0b1d3a]/10">
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
          // Print-specific "does this line actually have anything to show" check — deliberately
          // NOT the same as `lineHasDetails()` (used by the on-screen editor's expand-indicator),
          // which lights up whenever any dynamic field has a raw value, even one whose customer
          // display is suppressed (e.g. Concrete Surface Repair "No", see `formatFieldDisplay()`).
          // Gating the print row on the raw-value check would render an empty details `<tr>` —
          // a blank heading/row/spacing with nothing printed inside it — whenever a line's ONLY
          // content is a suppressed dynamic field. Gating on the actual rendered output instead
          // guarantees the row only ever appears when there's real content inside it.
          const dynamicLines = dynamicFieldPrintLines(templateSections, line);
          const hasDetails = line.specifications.trim() !== "" || line.notes.trim() !== ""
            || line.subDetails.some((sd) => sd.text.trim() !== "") || dynamicLines.length > 0;
          const unitDiscount = line.unitPrice * (line.discount / 100);
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
                <td className="px-2 py-1.5 text-right font-mono">{unitDiscount > 0 ? `${fmt(unitDiscount)} (${line.discount}%)` : fmt(0)}</td>
                <td className="px-2 py-1.5 text-right font-mono font-semibold">{fmt(lineSubtotal(line))}</td>
              </tr>
              {hasDetails && (
                <tr>
                  <td />
                  <td colSpan={6} className="px-2 pb-2 text-[10px] text-[#3b5a85]">
                    {line.specifications.trim() && <p className="italic mb-0.5">{line.specifications}</p>}
                    <FormattedNotes text={line.notes} />
                    {line.subDetails.filter((sd) => sd.text.trim()).map((sd) => (
                      <div key={sd.id} className="flex items-start gap-1 mt-0.5">
                        <Pin size={9} className="mt-0.5 flex-shrink-0 text-[#7a9ac9]" />
                        <span>{sd.text}</span>
                      </div>
                    ))}
                    {dynamicLines.map((text, i) => (
                      <div key={`df-${i}`} className="flex items-start gap-1 mt-0.5">
                        <Pin size={9} className="mt-0.5 flex-shrink-0 text-[#7a9ac9]" />
                        <span>{text}</span>
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
                  <span>ส่วนลดพิเศษ{discount > 0 ? ` (${discount}%)` : ""}</span>
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

        {(() => {
          const nonBlankNotes = (notes ?? []).filter((n) => n.trim());
          if (nonBlankNotes.length === 0) return null;
          return (
            <tr>
              <td colSpan={7} className="pt-4">
                <p className="text-[11px] font-semibold mb-1">หมายเหตุ</p>
                {nonBlankNotes.map((n, i) => <p key={i} className="text-[10.5px] leading-relaxed">{n}</p>)}
              </td>
            </tr>
          );
        })()}

        {(() => {
          const conditionLines: string[] = [];
          if (vatConditionText?.trim()) conditionLines.push(vatConditionText.trim());
          if (warrantyText?.trim()) conditionLines.push(`Warranty : ${warrantyText.trim()} ${conditions?.warrantyUnit || "After Job Completed."}`);
          if (deliveryDays != null) conditionLines.push(`Delivery : Within ${deliveryDays} ${conditions?.deliveryUnit || "Days After Received P/O"}`);
          if (conditionLines.length === 0) return null;
          return (
            <tr>
              <td colSpan={7} className="pt-4">
                <p className="text-[11px] font-semibold mb-1">Condition</p>
                {conditionLines.map((line, i) => <p key={i} className="text-[10.5px] leading-relaxed">{line}</p>)}
              </td>
            </tr>
          );
        })()}

        <tr>
          <td colSpan={7} className="pt-5 pb-2">
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
                        <p className="text-[10px]">{col.name || " "}</p>
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
  );
}
