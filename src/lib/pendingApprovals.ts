import { apiFetch } from "./apiClient.js";

/**
 * กล่องงานเข้า "เอกสารรออนุมัติ" ข้ามแผนก (2026-08-31) — เจ้าของขอไว้ 2026-08-28:
 * *"เพิ่มหน้าเอกสารรออนุมัติทุกอย่าง เพราะแบบเฮดคนนึงต้องอนุมัติหลายแผนก"*
 *
 * รูปผลลัพธ์เดียวสำหรับเอกสาร 10 ชนิด ด้วยเหตุผลเดียวกับที่ `SearchDocumentResult` ใช้รูปเดียว:
 * ทุกใบตอบคำถามชุดเดิม (เลขที่อะไร ของใคร มาจากงานไหน รอมาตั้งแต่เมื่อไหร่) หน้าจอจึง render
 * แถวแบบเดียว และการเพิ่มชนิดที่ 11 คือฟังก์ชันดึงข้อมูลกับป้ายชื่อ ไม่ใช่หน้าใหม่
 */

export type PendingApprovalKind =
  | "quotation"
  | "scopeOfWork"
  | "deliveryOrder"
  | "materialRequisition"
  /** ใบรับคืน/รับเข้าคลังของสโตร์ (2026-09-23) */
  | "storeReceipt"
  | "jobOrder"
  | "purchaseRequest"
  | "purchaseOrder"
  | "productionOrder"
  | "costControl"
  | "productRequest";

export interface PendingApprovalItem {
  kind: PendingApprovalKind;
  id: string;
  /** เลขที่เอกสาร — "" สำหรับชนิดที่ยังไม่มีเลข (คำขอเพิ่มสินค้าได้รหัสตอนอนุมัติ) */
  docNumber: string;
  /** ลูกค้า / ผู้ขาย / ชื่อสินค้าที่ขอ — แล้วแต่ชนิด */
  party: string;
  /** งานต้นทาง */
  lineage: string;
  /** คนที่ชื่ออยู่บนใบว่าเป็นผู้ขอ/ผู้จัดทำ — "" ถ้าเอกสารชนิดนั้นไม่มีช่องนี้ */
  submittedBy: string;
  /**
   * ⚠️ นี่คือ `updatedAt` ไม่ใช่เวลาที่กดส่งขออนุมัติจริง — ทั้งระบบยังไม่มีฟิลด์ `submittedAt`
   * ใกล้เคียงพอเพราะการกดส่งคือการเขียนครั้งล่าสุดของใบที่รออยู่ แต่ไม่ใช่ค่าเดียวกัน
   */
  waitingSince: string;
  /** ใบเบิก/ใบขอซื้อเท่านั้น — บอกว่าให้เปิดหน้าไหน */
  ownerDepartment?: "project" | "production" | "general" | "store";
}

export async function fetchPendingApprovals(): Promise<PendingApprovalItem[]> {
  const { items } = await apiFetch<{ items: PendingApprovalItem[] }>("/pending-approvals");
  return items;
}

/** กี่วันแล้วที่ใบนี้รออยู่ — ปัดลง วันนี้ = 0 */
export function daysWaiting(waitingSince: string, now: Date = new Date()): number {
  const then = new Date(waitingSince).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}
