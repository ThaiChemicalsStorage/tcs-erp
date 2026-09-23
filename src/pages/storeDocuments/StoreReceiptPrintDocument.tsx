import type { CompanyHeaderInfo } from "../../lib/storage";
import type { StoreReceipt } from "../../lib/storeReceipt";
import { storeReceiptCodeInfo } from "../../lib/storeCodes";
import { StoreSlipPrint } from "./StoreSlipPrint";
import { STORE_RECEIPT_PRINT_TITLE } from "./storeSlipTitles";

/**
 * ใบพิมพ์ใบรับคืน / รับเข้าคลังของสโตร์ — ฟอร์ม "ใบรับคืนวัสดุ" ของโปรแกรมบัญชีเดิม (2026-09-23, ตัวอย่างจากเจ้าของ
 * `reference/company/ใบรับคืน.pdf`) ใช้เลย์เอาต์เดียวกับใบจ่าย ดู `StoreSlipPrint.tsx`
 *
 * ต้นทุนต่อหน่วย (ช่อง หน่วยละ) มากับการกดพิมพ์ (`logStoreReceiptPrinted()`): รับเข้าคลังแล้ว = ต้นทุนที่ลงสต๊อกจริง ·
 * ยังไม่รับเข้า = ราคาที่การรับเข้าจะใช้ · ใบรับเข้าที่กรอกต้นทุนเองใช้ตัวเลขของบรรทัดนั้น (GC ของลูกค้า = 0 เสมอ)
 */
export function StoreReceiptPrintDocument({ doc, unitCostByProduct, companyHeader }: {
  doc: StoreReceipt;
  unitCostByProduct: Record<string, number>;
  companyHeader: CompanyHeaderInfo;
}) {
  const kind = storeReceiptCodeInfo(doc.receiptCode).kind;
  const rows = doc.lines
    .filter((l) => l.productId && l.qty !== null && (kind === "adjust" || (l.qty ?? 0) > 0))
    .map((l) => ({
      key: l.id,
      code: l.productCode,
      name: l.productName,
      qty: l.qty ?? 0,
      unit: l.unit,
      unitCost: doc.receiptCode === "GC" ? 0
        : kind === "receive" && l.unitCost !== null ? l.unitCost
          : unitCostByProduct[l.productId] ?? 0,
    }));
  const remark = [...new Set([doc.jobCode, doc.customerName, doc.reference, doc.reason].map((s) => (s ?? "").trim()).filter(Boolean))].join(" ");

  return (
    <StoreSlipPrint
      variant="receipt"
      companyName={companyHeader.name}
      title={STORE_RECEIPT_PRINT_TITLE[doc.receiptCode]}
      jobCode={doc.jobCode}
      documentNumber={doc.documentNumber || doc.id}
      date={doc.receivedDate}
      remark={remark}
      extraRemark={kind === "return" && doc.sourceRequisitionNumber ? `คืนจากใบเบิก ${doc.sourceRequisitionNumber}` : ""}
      rows={rows}
    />
  );
}
