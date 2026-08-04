import type { ReactNode } from "react";
import type { CompanyHeaderInfo } from "../../lib/storage";
import type { DeliveryOrder, DeliveryOrderInstallment } from "../../lib/deliveryOrder";
import { formatQuoteDateNumeric as fmtNumericDate } from "../../lib/quotes";
import { FacebookIcon, LineAppIcon } from "../../components/PrintSocialIcons";

// ชื่อ/ที่อยู่/เบอร์โทร/อีเมล คงที่ตามแบบฟอร์มอ้างอิง FM-SL-05 (ภาษาอังกฤษ, ที่อยู่แยกบรรทัด) —
// ไม่ได้ดึงจากหน้าตั้งค่าเพราะ Company ใน Settings เป็นชื่อ/ที่อยู่ภาษาไทยบรรทัดเดียว ต่างรูปแบบ
// ส่วน Facebook/Line/เว็บไซต์ (companyHeader.facebookName/lineId/website) ดึงจากหน้าตั้งค่าจริงแทน
// Name/address/phone/email stay fixed to match the FM-SL-05 reference form (English, split address
// lines) — not sourced from Settings, since Company there is a single-line Thai name/address, a
// different shape. Facebook/Line/website (companyHeader.facebookName/lineId/website) DO come from
// Settings, so editing them there updates this document too.
const LETTERHEAD = {
  nameEn: "THAI CHEMICALS STORAGE CO.,LTD.",
  addressLine1: "200 Jasmine International Tower, 25th Floor, Room 2504, Moo4",
  addressLine2: "Chaengwatthana Rd, Pak Kret Subdistrict, Pak Kret District, Nonthaburi 11120",
  tel: "+66(2)-583-3615-6",
  email: "sales@thaichemicals.com",
};
const FORM_CODE = "FM-SL-05 Rev.01: 11/09/67";

const DOC_FONT = "'Times New Roman', 'Noto Serif Thai', serif";
const LINE = "1px solid #000";

const SINGLE_PAGE_ROW_TARGET = 30;

// บรรทัดข้อความที่มีเส้นขีดเส้นใต้สีดำบาง ใช้แสดงข้อมูลลูกค้าในส่วนเรียน
// A text line with a thin black underline, used for the "เรียน" customer info lines.
function UnderlinedLine({ children }: { children: ReactNode }) {
  return (
    <p style={{ borderBottom: LINE, padding: "0 6px 1px", minHeight: "18px", lineHeight: 1.35 }}>{children}</p>
  );
}

const CELL_PAD = "1px 6px";
const specCellStyle = { borderLeft: LINE, borderBottom: LINE, padding: CELL_PAD };

// หนึ่งหน้าเอกสารพิมพ์ของงวดชำระเงินหนึ่งงวด ตามแบบฟอร์ม FM-SL-05
// One printed page for a single payment installment, following the FM-SL-05 form layout.
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
  const customerLines = [
    deliveryOrder.customerCompanyName,
    ...deliveryOrder.customerAddress.split(/\r?\n/),
  ].filter((l) => l.trim());

  const usedRows = pageItems.reduce(
    (sum, it) => sum + 1 + it.specifications.filter((sp) => sp.text.trim()).length,
    0,
  );
  const fillerRows = Math.max(0, SINGLE_PAGE_ROW_TARGET - usedRows);

  return (
    <div
      className="hidden print:block"
      style={{ breakAfter: "page", fontFamily: DOC_FONT, color: "#000", background: "#fff", padding: "12mm" }}
    >
      <div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <img
                  src={companyHeader.logoDataUrl || "/logo.png"}
                  alt=""
                  style={{ width: "88px", height: "88px", objectFit: "contain", flexShrink: 0, marginTop: "2px" }}
                />
                <div style={{ fontSize: "13px", lineHeight: 1.55 }}>
                  <p style={{ fontWeight: 700, fontSize: "15px" }}>{LETTERHEAD.nameEn}</p>
                  <p>{LETTERHEAD.addressLine1}</p>
                  <p>{LETTERHEAD.addressLine2}</p>
                  <p>TEL : {LETTERHEAD.tel}&nbsp;&nbsp;&nbsp;&nbsp;E-mail : {LETTERHEAD.email}</p>
                  {(companyHeader.facebookName.trim() || companyHeader.lineId.trim() || companyHeader.website.trim()) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "-24px" }}>
                      {companyHeader.facebookName.trim() && (
                        <>
                          <FacebookIcon />
                          <span>{companyHeader.facebookName}</span>
                        </>
                      )}
                      {companyHeader.lineId.trim() && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginLeft: "70px" }}>
                          <LineAppIcon />
                          <span>{companyHeader.lineId}</span>
                        </span>
                      )}
                      {companyHeader.website.trim() && (
                        <span style={{ color: "#1155cc", textDecoration: "underline", marginLeft: "16px" }}>
                          {companyHeader.website}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <p style={{ textAlign: "center", fontWeight: 700, fontSize: "18px", marginTop: "6px", lineHeight: 1.4 }}>
                ใบส่งมอบสินค้าและบริการ
              </p>
              <p style={{ textAlign: "center", fontWeight: 700, fontSize: "14px", lineHeight: 1.3 }}>
                Delivery Order &amp; Service Order
              </p>

              <div style={{ display: "flex", gap: "24px", marginTop: "10px", marginBottom: "8px", fontSize: "12.5px" }}>
                <div style={{ flex: "1 1 55%", display: "flex", gap: "8px" }}>
                  <p style={{ fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.35 }}>เรียน :</p>
                  <div style={{ flex: 1 }}>
                    {(customerLines.length > 0 ? customerLines : [""]).map((line, i) => (
                      <UnderlinedLine key={i}>{line || " "}</UnderlinedLine>
                    ))}
                  </div>
                </div>
                <div style={{ flex: "1 1 45%" }}>
                  {[
                    { label: "เลขที่", value: installment.documentNumber, thai: true },
                    { label: "วันที่", value: installment.issueDate ? fmtNumericDate(installment.issueDate) : "", thai: true },
                    { label: "WORK ORDER", value: deliveryOrder.scopeNumber, thai: false },
                  ].map(({ label, value, thai }) => (
                    <div key={label} style={{ display: "flex", alignItems: "flex-end", gap: "10px", minHeight: "22px" }}>
                      <p style={{ fontWeight: 700, width: "108px", textAlign: "right", whiteSpace: "nowrap", lineHeight: 1.35, ...(thai ? {} : { fontSize: "13.5px" }) }}>
                        {label}
                      </p>
                      <p style={{ flex: 1, borderBottom: LINE, textAlign: "center", lineHeight: 1.35, padding: "0 4px 1px", minHeight: "18px" }}>
                        {value || " "}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", lineHeight: 1.25 }}>
        <colgroup>
          <col style={{ width: "7%" }} />
          <col style={{ width: "71%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        <thead>
          <tr>
            <td colSpan={4} style={{ border: LINE, fontWeight: 700, fontSize: "13.5px", padding: "4px 8px" }}>
              บริษัทฯ ขอส่งมอบสินค้า และงานบริการตามรายการดังต่อไปนี้
            </td>
          </tr>
          <tr style={{ fontWeight: 700, fontSize: "12px" }}>
            <td style={{ borderLeft: LINE, borderBottom: LINE }} />
            <td style={{ borderBottom: LINE, padding: "2px 6px 2px 34px" }}>
              <span style={{ textDecoration: "underline" }}>รายการ</span>
            </td>
            <td style={{ borderBottom: LINE, textAlign: "center", padding: CELL_PAD }}>
              <span style={{ textDecoration: "underline" }}>จำนวน</span>
            </td>
            <td style={{ borderRight: LINE, borderBottom: LINE, textAlign: "center", padding: CELL_PAD }}>
              <span style={{ textDecoration: "underline" }}>หน่วย</span>
            </td>
          </tr>
        </thead>

        {pageItems.map((item, idx) => (
          <tbody key={item.id} style={{ breakInside: "avoid" }}>
            <tr style={{ fontWeight: 700 }}>
              <td style={{ ...specCellStyle, textAlign: "center" }}>{idx + 1}</td>
              <td style={{ borderBottom: LINE, padding: CELL_PAD }}>{item.name}</td>
              <td style={{ borderBottom: LINE, textAlign: "center", padding: CELL_PAD }}>{item.quantity ?? " "}</td>
              <td style={{ borderRight: LINE, borderBottom: LINE, textAlign: "center", padding: CELL_PAD }}>{item.unit || " "}</td>
            </tr>
            {item.specifications.filter((sp) => sp.text.trim()).map((sp) => (
              <tr key={sp.id}>
                <td style={specCellStyle} />
                <td style={{ borderBottom: LINE, padding: CELL_PAD }}>- {sp.text}</td>
                <td style={{ borderBottom: LINE }} />
                <td style={{ borderRight: LINE, borderBottom: LINE }} />
              </tr>
            ))}
          </tbody>
        ))}

        <tbody>
          {pageItems.length === 0 && (
            <tr>
              <td style={specCellStyle} />
              <td colSpan={3} style={{ borderRight: LINE, borderBottom: LINE, padding: CELL_PAD, textAlign: "center" }}>
                ยังไม่ได้เลือกรายการสำหรับงวดนี้
              </td>
            </tr>
          )}
          {Array.from({ length: fillerRows }, (_, i) => (
            <tr key={i} style={{ height: "16px" }}>
              <td style={specCellStyle} />
              <td style={{ borderBottom: LINE }} />
              <td style={{ borderBottom: LINE }} />
              <td style={{ borderRight: LINE, borderBottom: LINE }} />
            </tr>
          ))}
        </tbody>

        <tbody style={{ breakInside: "avoid" }}>
          <tr>
            <td colSpan={4} style={{ border: LINE, padding: "3px 8px" }}>
              <span style={{ fontWeight: 700 }}>Remark :</span>
              <span style={{ marginLeft: "20px", whiteSpace: "pre-line" }}>{installment.remark}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ breakInside: "avoid" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "80px", marginTop: "10px", fontSize: "13px" }}>
          {[
            { heading: `ลงนาม ${deliveryOrder.customerCompanyName || "................................................"}`, role: "ผู้ตรวจรับสินค้าและงานบริการ" },
            { heading: `ลงนาม ${companyHeader.name}`, role: "ผู้ส่งสินค้าและงานบริการ" },
          ].map(({ heading, role }) => (
            <div key={role}>
              <p style={{ textAlign: "center", fontWeight: 700, fontSize: "13.5px" }}>{heading}</p>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", marginTop: "18px" }}>
                <p style={{ fontWeight: 700, whiteSpace: "nowrap" }}>ลงชื่อ</p>
                <div style={{ flex: 1, borderBottom: LINE }} />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", marginTop: "18px", marginLeft: "44px" }}>
                <p>(</p>
                <div style={{ flex: 1, borderBottom: LINE }} />
                <p>)</p>
              </div>
              <p style={{ textAlign: "center", fontWeight: 700, marginTop: "2px", marginLeft: "44px" }}>{role}</p>
              <p style={{ fontWeight: 700, marginTop: "10px" }}>วันที่</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "right", fontSize: "11px", fontFamily: "Arial, Helvetica, sans-serif", marginTop: "4px" }}>
          {FORM_CODE}
        </p>
      </div>
    </div>
  );
}

// เอกสารพิมพ์ใบส่งมอบสินค้า แสดงทีละงวดตาม onlyInstallmentId หรือทุกงวดถ้าไม่ระบุ
// Delivery order print document — renders one installment's page if onlyInstallmentId is set, otherwise all of them.
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
      <style>{"@media print { @page { margin: 0 } }"}</style>
      <span
        aria-hidden="true"
        className="print:hidden"
        style={{
          position: "fixed", visibility: "hidden", pointerEvents: "none",
          width: 0, height: 0, overflow: "hidden", fontFamily: "'Noto Serif Thai', serif",
        }}
      >
        ใบส่งมอบ<b>สินค้าและบริการ</b>
      </span>
      {installments.map((installment) => (
        <InstallmentPage key={installment.id} deliveryOrder={deliveryOrder} installment={installment} companyHeader={companyHeader} />
      ))}
    </>
  );
}
