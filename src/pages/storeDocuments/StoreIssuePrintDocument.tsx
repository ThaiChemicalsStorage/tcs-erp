import type { CompanyHeaderInfo } from "../../lib/storage";
import { issuedQtyOf, type MaterialRequisition } from "../../lib/materialRequisition";
import { StoreSlipPrint } from "./StoreSlipPrint";
import { STORE_ISSUE_PRINT_TITLE } from "./storeSlipTitles";

/**
 * ใบพิมพ์ใบเบิกของสโตร์ — ฟอร์ม "ใบจ่ายวัสดุ" ของโปรแกรมบัญชีเดิม (2026-09-23, ตัวอย่างจากเจ้าของ
 * `reference/company/ใบเบิก.pdf`) · ใบเบิกฝ่ายโครงการ/ผลิตยังพิมพ์ฟอร์ม FM-ST-04 เหมือนเดิม
 * (`MaterialRequisitionPrintDocument.tsx`) — ตัวเลือกอยู่ใน `MaterialRequisitionDocument.tsx`
 *
 * ใบจ่ายเดิมพิมพ์ **ของที่จ่ายออกไปจริง** จึงใช้จำนวนที่สโตร์จ่ายแล้ว (ทุกรอบรวมกัน) และไม่พิมพ์บรรทัดที่ยังไม่ได้จ่าย ·
 * ใบที่ยังไม่ได้จ่ายเลยพิมพ์จำนวนที่ขอเบิก (ใช้เป็นใบหยิบของ) · ต้นทุน (ช่อง หน่วยละ) มากับการกดพิมพ์:
 * จ่ายแล้ว = ต้นทุนที่ลงสต๊อกจริง, ยังไม่จ่าย = ต้นทุนเฉลี่ยปัจจุบัน
 */
export function StoreIssuePrintDocument({ materialRequisition: m, unitCostByProduct, companyHeader }: {
  materialRequisition: MaterialRequisition;
  unitCostByProduct: Record<string, number>;
  companyHeader: CompanyHeaderInfo;
}) {
  const issues = m.issues ?? [];
  const anyIssued = m.lines.some((l) => issuedQtyOf(l) > 0);
  const rows = m.lines
    .filter((l) => l.productId || l.productName)
    .map((l) => ({
      key: l.id,
      code: l.productCode,
      name: l.productName,
      qty: anyIssued ? issuedQtyOf(l) : (l.plannedQty ?? 0),
      unit: l.unit,
      unitCost: unitCostByProduct[l.productId] ?? 0,
    }))
    .filter((r) => r.qty > 0);
  // วันที่ของใบจ่าย = วันที่สโตร์จ่ายรอบล่าสุด · ยังไม่จ่าย = วันที่จัดทำ
  const lastIssue = issues.length > 0 ? issues[issues.length - 1].issuedDate : "";
  const remark = [...new Set([m.jobCode, m.customerName, m.productName, m.storeReference ?? ""].map((s) => (s ?? "").trim()).filter(Boolean))].join(" ");

  return (
    <StoreSlipPrint
      variant="issue"
      companyName={companyHeader.name}
      title={m.issueCode ? STORE_ISSUE_PRINT_TITLE[m.issueCode] : "ใบจ่ายวัสดุ"}
      jobCode={m.jobCode}
      documentNumber={m.documentNumber || m.id}
      date={lastIssue || m.preparedAt || m.createdAt}
      remark={remark}
      extraRemark={(m.revisionNote ?? "").trim()}
      rows={rows}
    />
  );
}
