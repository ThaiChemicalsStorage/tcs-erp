import type { MaterialRequisitionSummary } from "../../lib/materialRequisition";
import type { StoreReceiptStatus, StoreReceiptSummary } from "../../lib/storeReceipt";

/**
 * ตัวช่วยที่ไม่ใช่คอมโพเนนต์ของหน้า "ใบเบิกและใบคืนวัสดุ (สโตร์)" (ดีไซน์ใหม่ 2026-09-30) — แยกจากไฟล์ .tsx
 * เพื่อให้ไฟล์หน้าจอส่งออกเฉพาะคอมโพเนนต์ (fast refresh) และทดสอบตัวเลขได้โดยไม่ต้องเรนเดอร์
 */

export type StoreDocumentKind = "issue" | "receipt";
export type StoreDocTab = "all" | "incoming" | StoreDocumentKind;

export interface StoreDocRow {
  kind: StoreDocumentKind;
  id: string;
  number: string;
  /** รหัสจ่าย/รหัสรับ (PP, JD …) — ใบเบิกเก่าที่ไม่มี issueCode ใช้ส่วนหน้าของเลขรัน */
  code: string;
  /** อ้างอิงทีละชิ้น (ใบเบิกต้นทาง · รหัสงาน · เลขอ้างอิง) — บรรทัดแรกของคอลัมน์คือชิ้นแรก ที่เหลือเป็นบรรทัดรอง */
  refs: string[];
  chargeDepartment: string;
  chargeTeam: string;
  status: StoreReceiptStatus;
  /** ใบเบิก: ยังจ่ายไม่ครบ · ใบรับคืน: อนุมัติแล้วแต่ยังไม่รับเข้าคลัง */
  pendingStore: boolean;
  posted: boolean;
  updatedAt: string;
}

/** รวมใบเบิกของสโตร์กับใบรับคืนเป็นรายการเดียว เรียงแก้ไขล่าสุดก่อน (ตรรกะเดิมของหน้า ย้ายมาไว้ที่นี่) */
export function toStoreDocRows(issues: MaterialRequisitionSummary[], receipts: StoreReceiptSummary[]): StoreDocRow[] {
  return [
    ...issues.map((m): StoreDocRow => ({
      kind: "issue", id: m.id, number: m.documentNumber || m.id, code: m.issueCode ?? m.id.split("-")[0],
      refs: [m.sourceRequisitionNumber ?? "", m.jobCode, m.storeReference ?? ""].filter(Boolean),
      chargeDepartment: m.chargeDepartmentName, chargeTeam: m.chargeTeamName,
      status: m.status, pendingStore: m.hasOutstanding, posted: false, updatedAt: m.updatedAt,
    })),
    ...receipts.map((r): StoreDocRow => ({
      kind: "receipt", id: r.id, number: r.documentNumber || r.id, code: r.receiptCode,
      refs: [r.sourceRequisitionNumber, r.jobCode, r.reference].filter(Boolean),
      chargeDepartment: r.chargeDepartmentName, chargeTeam: r.chargeTeamName,
      status: r.status, pendingStore: r.status === "Final" && !r.posted, posted: r.posted, updatedAt: r.updatedAt,
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** จำนวนบนแท็บ — แท็บ "ใบเบิกจากแผนก" นับใบที่ส่งมารอจ่าย ไม่ใช่เอกสารของสโตร์ */
export function storeDocTabCounts(rows: StoreDocRow[], incomingCount: number): Record<StoreDocTab, number> {
  return {
    all: rows.length,
    issue: rows.filter((r) => r.kind === "issue").length,
    receipt: rows.filter((r) => r.kind === "receipt").length,
    incoming: incomingCount,
  };
}

/**
 * ขั้นปัจจุบันของแถบ 4 ขั้นของใบรับคืน (จัดทำร่าง → รออนุมัติ → อนุมัติแล้ว → รับเข้าคลังแล้ว)
 * ค่าที่ได้คือ index ของขั้นปัจจุบัน · 4 = ครบทุกขั้น (รับเข้าคลังแล้ว)
 */
export function storeReceiptStepIndex(status: StoreReceiptStatus, posted: boolean): number {
  if (posted) return 4;
  if (status === "Draft") return 0;
  if (status === "PendingApproval") return 1;
  return 2;
}

/** "คืนครั้งนี้ x จาก y รายการ" — บรรทัดที่กรอกจำนวนคืนมากกว่าศูนย์ เทียบกับบรรทัดทั้งหมดในใบ */
export function countReturningLines(lines: { qty: number | null }[]): { returning: number; total: number } {
  return { returning: lines.filter((l) => (l.qty ?? 0) > 0).length, total: lines.length };
}
