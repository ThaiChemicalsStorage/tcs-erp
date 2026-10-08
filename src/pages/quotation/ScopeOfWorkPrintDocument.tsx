import { formatPaymentMethod, scopePoNumbers, scopeQuotationNumbers, type ScopeOfWork } from "../../lib/scopeOfWork";
import type { CompanyHeaderInfo } from "../../lib/storage";
import type { User } from "../../lib/users";
import { formatQuoteDateNumeric as fmtNumericDate } from "../../lib/quotes";
import { printText } from "../../lib/printFormat";
import { BrandMark } from "../../components/BrandMark";
import { FacebookIcon, LineAppIcon } from "../../components/PrintSocialIcons";
import { PaginatedPrintForm, type PrintFormRow } from "../../components/PaginatedPrintForm";

// แสดงแถวข้อมูล label กับค่า สำหรับเอกสารพิมพ์
// Renders a label/value row for the print document.
function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-[10px] leading-[1.7]">
      <span className="text-[#5a7299] flex-shrink-0 w-[92px]">{label}</span>
      <span className={`flex-1 border-b border-dotted border-[#0b1d3a]/25 min-h-[13px] ${mono ? "font-mono" : ""}`}>{printText(value)}</span>
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

// รหัสฟอร์ม ISO ท้ายกระดาษทุกหน้า (2026-10-08) — เจ้าของส่งรายการรหัสมา Scope of Work = FM-SL-04 Rev.03 · วันที่ตามฟอร์มจริง
// (`reference/company/Scope Of Work PQ202607-174-LI-SK …pdf` มุมขวาล่าง) · เดิมใบนี้ใบเดียวที่ไม่มีรหัสฟอร์ม
const FORM_CODE = "FM-SL-04 Rev.03 : 26/06/69";

// สร้างเอกสาร Scope of Work สำหรับพิมพ์/PDF ตามรูปแบบเอกสารต้นฉบับ ไม่แสดงราคา
// Renders the printable Scope of Work document matching the reference layout, without pricing.
// จัดหน้าเองด้วย PaginatedPrintForm (2026-10-06 เจ้าของ: "ทำกับทุกเอกสาร … scope of work ยังบัคอยู่") — ทุกหน้ามีหัวจดหมาย + ข้อมูลงาน (เช็คลิสต์เฉพาะหน้าแรก)
// + หัวตาราง และขอบกระดาษครบทั้งบน/ล่าง (เดิมใช้ thead ซ้ำ หน้ากลางเอกสารไม่มีขอบล่าง เนื้อหาชนขอบกระดาษ) · หมายเหตุ+ลายเซ็นอยู่หน้าสุดท้ายด้วยกัน
export function ScopeOfWorkPrintDocument({ scopeOfWork, companyHeader, sellerUser, approverUser }: {
  scopeOfWork: ScopeOfWork;
  companyHeader: CompanyHeaderInfo;
  sellerUser?: User;
  approverUser?: User;
}) {
  const s = scopeOfWork;
  let runningNumber = 0;
  const itemNumbers = s.items.map((it) => (it.isSectionHeader ? null : ++runningNumber));

  const header = (
    <>
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
          {/* หนึ่งงานมีได้หลาย PO / หลายใบเสนอราคา — ต่อกันในบรรทัดเดิม ไม่เพิ่มแถว
              เพราะหัวใบเป็นกริดสองคอลัมน์ที่ต้องมีจำนวนแถวเท่ากันถึงจะพิมพ์ออกมาตรง */}
          <Field label="เอกสารใบสั่งซื้อเลขที่" value={scopePoNumbers(s).join(", ")} mono />
          <Field label="ใบเสนอราคา" value={scopeQuotationNumbers(s).join(", ")} mono />
          <Field label="เบอร์โทรผู้ติดต่อส่งของ" value={s.shippingPhone} mono />
          <Field label="เบอร์โทรผู้ติดต่อวางบิล" value={s.billingPhone} mono />
        </div>
      </div>

    </>
  );

  // เช็คลิสต์ + การเก็บเงิน พิมพ์เฉพาะหน้าแรก (เจ้าของ 2026-10-06: "check list มีไว้แค่ใบแรกก็พอ หน้าอื่นไม่ต้อง")
  const checklist = (
    <div className="grid grid-cols-4 gap-x-3 gap-y-2 border-t border-b border-[#0b1d3a]/30 py-2 mb-2">
      {s.checklistGroups.map((group) => (
        <div key={group.key}>
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
      <div>
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
  );

  // ความกว้างคอลัมน์อยู่ที่ <th> (เดิมอยู่ใน <colgroup> — ตัวจัดหน้ารับเฉพาะ <thead>) ค่าเท่าเดิม 6/68/13/13%
  const tableHead = (
    <thead>
      <tr className="bg-[#1a5fb4] text-white">
        {["ลำดับ", "รายการ", "จำนวน", "หน่วย"].map((h, i) => (
          <th key={h} style={{ width: ["6%", "68%", "13%", "13%"][i] }} className={`px-2 py-1.5 text-[10px] font-semibold ${i === 1 ? "text-left" : "text-center"}`}>{h}</th>
        ))}
      </tr>
    </thead>
  );

  // หนึ่งรายการ = แถวชื่อ + แถว spec (ถ้ามี) — ส่ง span ให้ตัวจัดหน้าวางเป็นก้อนเดียว ไม่แยกคนละหน้า (แทน tbody breakInside: avoid เดิม)
  const bodyRows: PrintFormRow[] = s.items.length === 0
    ? [{ key: "empty", node: <tr><td colSpan={4} className="px-2 py-4 text-center text-[10px] text-[#5a7299]">ยังไม่มีรายการ</td></tr> }]
    : s.items.map((item, idx) => {
      if (item.isSectionHeader) {
        return {
          key: item.id,
          node: <tr><td colSpan={4} className="px-2 pt-2.5 pb-1 font-bold text-[11px] border-b border-[#0b1d3a]/15">{item.name}</td></tr>,
        };
      }
      const hasSpec = item.specifications.length > 0 || item.remark.trim() !== "";
      return {
        key: item.id,
        span: hasSpec ? 2 : 1,
        node: (
          <>
            <tr className="align-top">
              <td className="px-2 py-1.5 text-center font-mono">{itemNumbers[idx]}</td>
              <td className="px-2 py-1.5 font-semibold">{item.name}</td>
              <td className="px-2 py-1.5 text-center font-mono">{item.quantity ?? ""}</td>
              <td className="px-2 py-1.5 text-center">{item.unit}</td>
            </tr>
            {hasSpec && (
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
          </>
        ),
      };
    });

  const footer = (
    <>
      {/* หมายเหตุ + ลายเซ็นอยู่หน้าสุดท้ายด้วยกันเสมอ (ตัวจัดหน้ายกทั้งก้อนไปหน้าใหม่ถ้าไม่พอที่) — แทน breakInside/orphans เดิม (2026-09-07) */}
      {s.remarks.trim() && (
        <div className="pt-4">
          <p className="text-[10.5px] font-semibold mb-1">หมายเหตุ</p>
          <p className="text-[10px] whitespace-pre-line leading-relaxed">{s.remarks}</p>
        </div>
      )}
      <div className="pt-5">
        <table className="w-full border-collapse border border-[#0b1d3a]/20">
          <tbody>
            <tr className="bg-[#1a5fb4] text-white">
              <th className="px-2 py-1 text-[10px] font-semibold border-r border-white/20">ผู้ขาย</th>
              <th className="px-2 py-1 text-[10px] font-semibold">ผู้อนุมัติ</th>
            </tr>
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
      </div>
    </>
  );

  return (
    <PaginatedPrintForm
      className="text-[#0b1d3a]"
      style={{ fontSize: "10.5px" }}
      header={header}
      firstPageHeader={checklist}
      tableHead={tableHead}
      rows={bodyRows}
      // ตารางไม่มีเส้น — แถวว่างจึงเป็นแค่ที่ว่าง ทำให้ช่องลายเซ็นไปอยู่ก้นหน้าสุดท้าย
      blankRow={(key) => <tr key={key}><td colSpan={4} style={{ height: "18px" }} /></tr>}
      footer={footer}
      pageFooter={<p style={{ textAlign: "right", margin: "6px 0 0", fontSize: "9px" }}>{FORM_CODE}</p>}
    />
  );
}
