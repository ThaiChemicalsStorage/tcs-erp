import type { TranslationKey } from "../../lib/i18n";
import type { PendingApprovalKind } from "../../lib/pendingApprovals";

/**
 * ป้ายชนิดเอกสารของกล่อง "เอกสารรออนุมัติ" — ยืมคีย์ของแต่ละโมดูลมาใช้ ไม่ตั้งคีย์ซ้ำ
 * แยกออกมาจาก PendingApprovalsPage.tsx เมื่อ 2026-09-14 เพราะแท็บภาพรวมของแดชบอร์ดใช้ป้ายชุดเดียวกัน
 */
export const PENDING_KIND_LABEL_KEY: Record<PendingApprovalKind, TranslationKey> = {
  quotation: "nav.quotations",
  scopeOfWork: "nav.scopeOfWork",
  deliveryOrder: "nav.deliveryOrder",
  materialRequisition: "nav.materialRequisition",
  storeReceipt: "storeReceipt.kindLabel",
  jobOrder: "nav.jobOrder",
  purchaseRequest: "nav.purchaseRequest",
  purchaseOrder: "nav.purchaseOrder",
  productionOrder: "nav.productionOrder",
  costControl: "nav.costControl",
  productRequest: "nav.productRequest",
};
