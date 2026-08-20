import type { ProductionOrder } from "../../lib/productionOrder";
import { formatQuoteDateThai } from "../../lib/quotes";

/**
 * ฟอร์มพิมพ์ใบสั่งผลิต — คัดตามฟอร์มจริง FM-PD-02 Rev.00 : 01/11/64
 * (reference/company/ใบสั่งผลิต(Production Order).pdf ซึ่ง gitignore ไว้)
 *
 * Always renders in Thai regardless of the user's UI language — same rule every other print
 * component in this app follows (see docs/CLAUDE.md's i18n policy): a printed business document
 * must not change language based on who happened to press print.
 *
 * A4 portrait. Sequence numbers are assigned over non-header rows only, so inserting a section
 * header ("ชิ้นส่วน") never renumbers the items below it.
 */

const MIN_BODY_ROWS = 18;

export function ProductionOrderPrintDocument({ doc }: { doc: ProductionOrder }) {
  let seq = 0;
  const rows = doc.lines.map((l) => ({ line: l, seq: l.isSectionHeader ? null : ++seq }));
  const padding = Math.max(0, MIN_BODY_ROWS - rows.length);

  const cell: React.CSSProperties = { border: "1px solid #000", padding: "3px 5px", verticalAlign: "top" };
  const headCell: React.CSSProperties = { ...cell, textAlign: "center", fontWeight: 700 };

  const signRow = (label: string, s: { name: string; date: string }) => (
    <tr>
      <td style={{ ...cell, width: "62%", height: "26px" }}>
        {label} : <span style={{ fontWeight: 400 }}>{s.name}</span>
      </td>
      <td style={{ ...cell, width: "38%" }}>
        วันที่ : <span style={{ fontWeight: 400 }}>{s.date ? formatQuoteDateThai(s.date) : ""}</span>
      </td>
    </tr>
  );

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Noto Sans Thai', 'Sarabun', sans-serif", fontSize: "11px", color: "#000" }}>
      <style>{`@page { size: A4 portrait; margin: 10mm; }`}</style>

      <h1 style={{ textAlign: "center", fontSize: "15px", fontWeight: 700, margin: "0 0 6px" }}>
        ใบสั่งผลิต(Production Order)
      </h1>
      <p style={{ textAlign: "right", margin: "0 0 4px", fontWeight: 700 }}>
        เลขที่ใบสั่งผลิต : {doc.id}
      </p>

      {/* หัวเอกสาร — ฟอร์มจริงเป็นบรรทัดมีเส้นใต้ ไม่ใช่ตาราง */}
      <div style={{ borderTop: "1px solid #000", borderLeft: "1px solid #000", borderRight: "1px solid #000" }}>
        {[
          ["ชื่อลูกค้า", doc.customerCompanyName],
          ["รหัสงาน", doc.jobCode],
          ["ชื่อสินค้า", doc.productName],
          ["ชื่อพนักงานดูแล", doc.supervisorName],
        ].map(([label, value]) => (
          <p key={label} style={{ margin: 0, padding: "3px 6px", borderBottom: "1px solid #000" }}>
            {label} : {value}
          </p>
        ))}
        <p style={{ margin: 0, padding: "3px 6px", borderBottom: "1px solid #000", display: "flex", gap: "40px" }}>
          <span>วันที่เริ่มผลิต : {doc.startDate ? formatQuoteDateThai(doc.startDate) : ""}</span>
          <span>กำหนดเสร็จ : {doc.dueDate ? formatQuoteDateThai(doc.dueDate) : ""}</span>
        </p>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "-1px" }}>
        <thead>
          <tr>
            <th rowSpan={2} style={{ ...headCell, width: "7%" }}>ลำดับที่</th>
            <th rowSpan={2} style={{ ...headCell, width: "48%" }}>รายการ</th>
            <th colSpan={2} style={headCell}>สั่งผลิต</th>
            <th rowSpan={2} style={{ ...headCell, width: "25%" }}>หมายเหตุ</th>
          </tr>
          <tr>
            <th style={{ ...headCell, width: "10%" }}>จำนวน</th>
            <th style={{ ...headCell, width: "10%" }}>หน่วย</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ line, seq: n }) => (
            <tr key={line.id}>
              <td style={{ ...cell, textAlign: "center" }}>{n ?? ""}</td>
              <td style={{ ...cell, fontWeight: line.isSectionHeader ? 700 : 400, textAlign: line.isSectionHeader ? "center" : "left" }}>
                {line.description}
                {/* บรรทัดย่อยใต้รายการหลัก เยื้องเข้ามาเล็กน้อยตามฟอร์มจริง */}
                {line.subDetails.map((sd, i) => (
                  <p key={i} style={{ margin: "1px 0 0 12px", fontWeight: 400 }}>{sd}</p>
                ))}
              </td>
              <td style={{ ...cell, textAlign: "center" }}>{line.qty ?? ""}</td>
              <td style={{ ...cell, textAlign: "center" }}>{line.unit}</td>
              <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{line.remark}</td>
            </tr>
          ))}
          {/* แถวว่างให้เต็มหน้า เหมือนฟอร์มกระดาษที่มีช่องว่างไว้เขียนเพิ่ม */}
          {Array.from({ length: padding }, (_, i) => (
            <tr key={`pad-${i}`}>
              <td style={{ ...cell, height: "20px" }} />
              <td style={cell} />
              <td style={cell} />
              <td style={cell} />
              <td style={cell} />
            </tr>
          ))}
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "-1px", fontWeight: 700 }}>
        <tbody>
          {signRow("ผู้สั่งผลิต", doc.orderedBy)}
          {signRow("ผู้อนุมัติ", doc.approver)}
          {signRow("ผู้ส่งมอบงาน", doc.deliveredBy)}
          {signRow("ผู้ตรวจรับงาน", doc.receivedBy)}
          {signRow("แผนกต้นทุน", doc.costDeptBy)}
        </tbody>
      </table>

      <p style={{ textAlign: "right", margin: "4px 0 0", fontSize: "10px" }}>FM-PD-02 Rev.00 : 01/11/64</p>
    </div>
  );
}
