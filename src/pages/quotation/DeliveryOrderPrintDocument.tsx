import type { ReactNode } from "react";
import type { CompanyHeaderInfo } from "../../lib/storage";
import type { DeliveryOrder, DeliveryOrderInstallment } from "../../lib/deliveryOrder";
import { formatQuoteDateNumeric as fmtNumericDate } from "../../lib/quotes";
import { PrintSignatureLine } from "../../components/PrintSignature";
import { printText } from "../../lib/printFormat";
import { FacebookIcon, LineAppIcon } from "../../components/PrintSocialIcons";
import { PaginatedPrintForm, type PrintFormRow } from "../../components/PaginatedPrintForm";

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

// บรรทัดข้อความที่มีเส้นขีดเส้นใต้สีดำบาง ใช้แสดงข้อมูลลูกค้าในส่วนเรียน
// A text line with a thin black underline, used for the "เรียน" customer info lines.
function UnderlinedLine({ children }: { children: ReactNode }) {
  return (
    <p style={{ borderBottom: LINE, padding: "0 6px 1px", minHeight: "18px", lineHeight: 1.35 }}>{children}</p>
  );
}

const CELL_PAD = "1px 6px";
const specCellStyle = { borderLeft: LINE, borderBottom: LINE, padding: CELL_PAD };

/**
 * หัวหน้ากระดาษ — หัวจดหมาย + ชื่อเอกสาร + บล็อก เรียน / เลขที่ / วันที่ / WORK ORDER
 *
 * ซ้ำทุกหน้าของงวด — ส่งเป็น `header` ให้ PaginatedPrintForm (จัดหน้าเองตั้งแต่ 2026-10-06)
 * เดิม (2026-08-31) หน้าที่สองของงวดที่ล้นไม่มีหัวจดหมาย ไม่มีบล็อกเรียน/เลขที่ และไม่มีหัวคอลัมน์ —
 * อ่านไม่ออกว่าเป็นเอกสารของใคร (ยืนยันจากไฟล์ที่ผู้ใช้พิมพ์จริง งวดที่มี 12 รายการ ล้นเป็นสองหน้า)
 */
function PageHead({
  deliveryOrder,
  installment,
  companyHeader,
}: {
  deliveryOrder: DeliveryOrder;
  installment: DeliveryOrderInstallment;
  companyHeader: CompanyHeaderInfo;
}) {
  const customerLines = [
    deliveryOrder.customerCompanyName,
    ...deliveryOrder.customerAddress.split(/\r?\n/),
  ].filter((l) => l.trim());

  return (
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
              <UnderlinedLine key={i}>{line || " "}</UnderlinedLine>
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
                {printText(value)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ความกว้างคอลัมน์อยู่ที่ช่องหัวตาราง (เดิมอยู่ใน <colgroup> — ตัวจัดหน้ารับเฉพาะ <thead>) ค่าเท่าเดิม 7/71/12/10%
const COL_WIDTHS = ["7%", "71%", "12%", "10%"];
const TABLE_STYLE = { fontSize: "11.5px", lineHeight: 1.25 };

const tableHead = (
  <thead>
    <tr>
      <td colSpan={4} style={{ border: LINE, fontWeight: 700, fontSize: "13.5px", padding: "4px 8px" }}>
        บริษัทฯ ขอส่งมอบสินค้า และงานบริการตามรายการดังต่อไปนี้
      </td>
    </tr>
    <tr style={{ fontWeight: 700, fontSize: "12px" }}>
      <td style={{ width: COL_WIDTHS[0], borderLeft: LINE, borderBottom: LINE }} />
      <td style={{ width: COL_WIDTHS[1], borderBottom: LINE, padding: "2px 6px 2px 34px" }}>
        <span style={{ textDecoration: "underline" }}>รายการ</span>
      </td>
      <td style={{ width: COL_WIDTHS[2], borderBottom: LINE, textAlign: "center", padding: CELL_PAD }}>
        <span style={{ textDecoration: "underline" }}>จำนวน</span>
      </td>
      <td style={{ width: COL_WIDTHS[3], borderRight: LINE, borderBottom: LINE, textAlign: "center", padding: CELL_PAD }}>
        <span style={{ textDecoration: "underline" }}>หน่วย</span>
      </td>
    </tr>
  </thead>
);

// แถวว่างเติมให้เต็มหน้า — เส้นเหมือนแถวเติมแบบเดิมทุกประการ
const blankRow = (key: string) => (
  <tr key={key} style={{ height: "16px" }}>
    <td style={specCellStyle} />
    <td style={{ borderBottom: LINE }} />
    <td style={{ borderBottom: LINE }} />
    <td style={{ borderRight: LINE, borderBottom: LINE }} />
  </tr>
);

const formCode = (
  <p style={{ textAlign: "right", fontSize: "11px", fontFamily: "Arial, Helvetica, sans-serif", marginTop: "4px" }}>
    {FORM_CODE}
  </p>
);

/**
 * หนึ่งงวดตามแบบฟอร์ม FM-SL-05 — จัดหน้าเองด้วย PaginatedPrintForm (2026-10-06 เจ้าของ: ทุกหน้ามีหัวเอกสาร + หัวตาราง
 * ตารางเติมแถวว่างจนเต็มหน้า) · หนึ่งงวดอาจกินหลายหน้า และเฉพาะหน้าสุดท้ายของงวดเท่านั้นที่มี Remark กับช่องเซ็น
 * เพราะทั้งสองอย่างเป็นการปิดท้ายงวด ไม่ใช่ปิดท้ายหน้า · รหัสฟอร์มอยู่ท้ายทุกหน้า — ทุกแผ่นที่หลุดออกจากแฟ้มต้องบอกได้ว่าคือฟอร์มอะไร
 */
function InstallmentForm({
  deliveryOrder,
  installment,
  companyHeader,
  breakAfterLast,
}: {
  deliveryOrder: DeliveryOrder;
  installment: DeliveryOrderInstallment;
  companyHeader: CompanyHeaderInfo;
  breakAfterLast: boolean;
}) {
  const items = deliveryOrder.items.filter((it) => installment.itemIds.includes(it.id));

  // หนึ่งรายการ = แถวชื่อ + แถวสเปคที่ไม่ว่างบรรทัดละหนึ่ง — span บอกตัวจัดหน้าให้วางเป็นก้อนเดียว ไม่แยกคนละหน้า
  // เลขลำดับเดินต่อข้ามหน้า ไม่ใช่เริ่มนับ 1 ใหม่ทุกหน้า
  const rows: PrintFormRow[] = items.length === 0
    ? [{
      key: "empty",
      node: (
        <tr>
          <td style={specCellStyle} />
          <td colSpan={3} style={{ borderRight: LINE, borderBottom: LINE, padding: CELL_PAD, textAlign: "center" }}>
            ยังไม่ได้เลือกรายการสำหรับงวดนี้
          </td>
        </tr>
      ),
    }]
    : items.map((item, idx) => {
      const specs = item.specifications.filter((sp) => sp.text.trim());
      return {
        key: item.id,
        span: 1 + specs.length,
        node: (
          <>
            <tr style={{ fontWeight: 700 }}>
              <td style={{ ...specCellStyle, textAlign: "center" }}>{idx + 1}</td>
              <td style={{ borderBottom: LINE, padding: CELL_PAD }}>{item.name}</td>
              <td style={{ borderBottom: LINE, textAlign: "center", padding: CELL_PAD }}>{item.quantity ?? " "}</td>
              <td style={{ borderRight: LINE, borderBottom: LINE, textAlign: "center", padding: CELL_PAD }}>{item.unit || " "}</td>
            </tr>
            {specs.map((sp) => (
              <tr key={sp.id}>
                <td style={specCellStyle} />
                <td style={{ borderBottom: LINE, padding: CELL_PAD }}>- {sp.text}</td>
                <td style={{ borderBottom: LINE }} />
                <td style={{ borderRight: LINE, borderBottom: LINE }} />
              </tr>
            ))}
          </>
        ),
      };
    });

  const footer = (
    <>
      {/* Remark เดิมเป็นแถวสุดท้ายของตารางรายการ — ตอนนี้เป็นตารางของตัวเองต่อท้ายพอดี จึงไม่ใส่เส้นบน
          (เส้นล่างของแถวสุดท้ายในตารางรายการทำหน้าที่นั้นอยู่แล้ว ใส่ซ้ำจะเป็นเส้นหนาสองชั้น) */}
      <table style={{ width: "100%", borderCollapse: "collapse", ...TABLE_STYLE }}>
        <tbody>
          <tr>
            <td style={{ borderLeft: LINE, borderRight: LINE, borderBottom: LINE, padding: "3px 8px" }}>
              <span style={{ fontWeight: 700 }}>Remark :</span>
              <span style={{ marginLeft: "20px", whiteSpace: "pre-line" }}>{installment.remark}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "80px", marginTop: "10px", fontSize: "13px" }}>
        {/* ฝั่งบริษัทวางลายเซ็นจริงของคนที่ออกใบให้ (เจ้าของสั่ง 2026-09-02) — ฝั่งลูกค้าไม่มี
            บัญชีในระบบ จึงเว้นเส้นไว้ให้เซ็นรับของด้วยมือเหมือนเดิม */}
        {[
          { heading: `ลงนาม ${deliveryOrder.customerCompanyName || "................................................"}`, role: "ผู้ตรวจรับสินค้าและงานบริการ", userId: "" },
          { heading: `ลงนาม ${companyHeader.name}`, role: "ผู้ส่งสินค้าและงานบริการ", userId: deliveryOrder.createdBy },
        ].map(({ heading, role, userId }) => (
          <div key={role}>
            <p style={{ textAlign: "center", fontWeight: 700, fontSize: "13.5px" }}>{heading}</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", marginTop: "18px" }}>
              <p style={{ fontWeight: 700, whiteSpace: "nowrap" }}>ลงชื่อ</p>
              <div style={{ flex: 1, borderBottom: LINE, position: "relative" }}>
                {userId ? (
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: "1px" }}>
                    <PrintSignatureLine userId={userId} height={30} />
                  </div>
                ) : null}
              </div>
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
    </>
  );

  return (
    <PaginatedPrintForm
      style={{ fontFamily: DOC_FONT, color: "#000", background: "#fff" }}
      header={<PageHead deliveryOrder={deliveryOrder} installment={installment} companyHeader={companyHeader} />}
      tableHead={tableHead}
      tableStyle={TABLE_STYLE}
      rows={rows}
      blankRow={blankRow}
      footer={footer}
      pageFooter={formCode}
      breakAfterLast={breakAfterLast}
    />
  );
}

// เอกสารพิมพ์ใบส่งมอบสินค้า แสดงทีละงวดตาม onlyInstallmentId หรือทุกงวดถ้าไม่ระบุ — แต่ละงวดเริ่มหน้าใหม่ (breakAfterLast ทุกงวดยกเว้นงวดสุดท้าย)
// Delivery order print document — renders one installment if onlyInstallmentId is set, otherwise all of them, each starting a new page.
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
      {installments.map((installment, i) => (
        <InstallmentForm
          key={installment.id}
          deliveryOrder={deliveryOrder}
          installment={installment}
          companyHeader={companyHeader}
          breakAfterLast={i < installments.length - 1}
        />
      ))}
    </>
  );
}
