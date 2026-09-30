import type { ProjectItem, ProjectItemSourcingMethod, ProjectItemStatus, ProjectStatus } from "../../lib/project";

/**
 * ตัวเลขสรุปของหน้าโครงการ (ดีไซน์ใหม่ 2026-09-30) — คิดจากรายการในโครงการที่มีอยู่แล้วล้วน ๆ ไม่มีข้อมูลใหม่:
 * ช่อง "แบ่งตามสาขาการจัดหา" 4 ช่อง และการ์ดกรมท่า "จัดหาแล้ว x / y" บนคอลัมน์ขวา
 *
 * รายการที่ถูกยกเลิก (`cancelled`) ไม่นับเป็นงานที่ต้องจัดหา — ตัวหารของความคืบหน้าจึงไม่รวมรายการพวกนี้
 */
export interface ProjectItemSummary {
  bySourcing: Record<ProjectItemSourcingMethod, number>;
  byStatus: Record<ProjectItemStatus, number>;
  /** รายการที่ยังต้องจัดหา (ไม่รวมที่ยกเลิก) */
  total: number;
  /** 0–100 */
  progress: number;
  /** เลขที่เอกสารย่อยที่ไม่ซ้ำกัน (ใบเดียวผูกได้หลายรายการ) — ใช้ในกล่องยืนยันลบ */
  subDocumentCount: number;
}

export function summarizeProjectItems(items: Pick<ProjectItem, "sourcingMethod" | "itemStatus" | "materialRequisitionId" | "jobOrderId" | "purchaseRequestId">[]): ProjectItemSummary {
  const bySourcing: Record<ProjectItemSourcingMethod, number> = { unassigned: 0, requisition: 0, jobOrder: 0, purchaseRequest: 0 };
  const byStatus: Record<ProjectItemStatus, number> = { pending: 0, documentCreated: 0, fulfilled: 0, cancelled: 0 };
  const docs = new Set<string>();
  for (const item of items) {
    bySourcing[item.sourcingMethod] = (bySourcing[item.sourcingMethod] ?? 0) + 1;
    byStatus[item.itemStatus] = (byStatus[item.itemStatus] ?? 0) + 1;
    for (const id of [item.materialRequisitionId, item.jobOrderId, item.purchaseRequestId]) if (id) docs.add(id);
  }
  const total = items.length - byStatus.cancelled;
  return {
    bySourcing,
    byStatus,
    total,
    progress: total > 0 ? Math.round((byStatus.fulfilled / total) * 100) : 0,
    subDocumentCount: docs.size,
  };
}

/**
 * ปุ่มเปลี่ยนสถานะของโครงการ — เดิมเป็น dropdown เลือกสถานะไหนก็ได้ ดีไซน์ใหม่เปลี่ยนเป็นปุ่มหลัก "ขั้นถัดไป"
 * บนหัวเอกสาร ส่วนการย้อน/ข้ามขั้นย้ายไปอยู่ในเมนูเพิ่มเติม (เซิร์ฟเวอร์ยังรับได้ทุกทางเหมือนเดิม จึงไม่ตัดทางไหนทิ้ง)
 */
export function projectStatusMoves(status: ProjectStatus): { next: ProjectStatus | null; others: ProjectStatus[] } {
  const order: ProjectStatus[] = ["Planning", "InProgress", "Completed"];
  const i = order.indexOf(status);
  const next = i >= 0 && i < order.length - 1 ? order[i + 1] : null;
  return { next, others: order.filter((s) => s !== status && s !== next) };
}
