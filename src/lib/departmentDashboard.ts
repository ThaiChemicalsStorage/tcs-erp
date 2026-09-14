import { apiFetch } from "./apiClient.js";
import type { AuditLogEntry } from "./auditLog.js";
import type { PendingApprovalKind } from "./pendingApprovals.js";
import type { StockMovementKind } from "./stock.js";
import type { DepartmentKey } from "./dashboardTabs.js";

/**
 * แดชบอร์ดแยกตามแผนก — ชนิดข้อมูลของ `GET /api/dashboard/departments` (เพิ่ม 2026-09-14)
 *
 * ตัวเลขสามแบบ ต้องบอกผู้ใช้ให้ชัดเสมอว่าตัวไหนเป็นแบบไหน (Filter Honesty ใน UI_GUIDELINES.md):
 *   - **ณ ปัจจุบัน (snapshot)** — ของที่ค้างอยู่ตอนนี้ ไม่ขึ้นกับช่วงวันที่ เช่น ใบรออนุมัติ มูลค่าสต๊อก
 *   - **ในช่วงที่เลือก (period)** — ฟิลด์ที่ชื่อลงท้ายด้วย `InPeriod` หรืออธิบายไว้ในคอมเมนต์
 *   - **12 เดือนล่าสุด (`...ByMonth`)** — สิ้นสุดเดือนปัจจุบันเสมอ ไม่ขึ้นกับช่วงวันที่ · มีเฉพาะตัวเลขที่ระบบ
 *     เก็บวันที่ไว้จริง (docs/DASHBOARD_DESIGN.md ข้อ 5) · เดือนที่ไม่มีเอกสารเป็น 0 ไม่ใช่หายไป
 *
 * ค่า `null` ของตัวเลขตัวใดตัวหนึ่ง = ผู้ใช้ไม่มีสิทธิ์ดูเอกสารชนิดนั้น (แท็บหนึ่งรวมเอกสารหลายชนิดที่
 * สิทธิ์แยกกัน) · หน้าจอต้องซ่อนตัวนั้น ไม่ใช่แสดงเป็นศูนย์
 */

/** แท็บที่ endpoint นี้ตอบได้ — `operations` = แท็บรวม ผลิต · โครงการ · BD (ได้สามบล็อก) */
export type DepartmentDashboardView = "overview" | "service" | "purchasing" | "inventory" | "operations";
/** "own" = อย่างน้อยหนึ่งชนิดเอกสารในแท็บนี้นับเฉพาะใบที่ผู้ใช้เห็นในหน้ารายการของตัวเอง */
export type BlockScope = "all" | "own";

export interface StatusCounts { draft: number; pending: number; final: number }

/** หนึ่งแถวในรายการ "ใกล้ครบกำหนด / เลยกำหนด" — `date` คือวันที่ที่ทำให้ใบนี้ติดรายการ */
export interface DueItem { id: string; docNumber: string; party: string; date: string }

/** หนึ่งเดือนในกราฟ 12 เดือน — `month` เป็น "YYYY-MM" ตามเวลาไทย */
export interface MonthCount { month: string; count: number }

export interface DeliveryOrderCounts { total: number; draft: number; pending: number; final: number }

/** ใบขอซื้อที่อนุมัติแล้วแต่ยังไม่ได้ของ (สโตร์ยังไม่ปิด และยังไม่มีใบสั่งซื้อ) แยกว่าค้างอยู่ที่ใคร */
export interface OpenPurchaseRequestStages { atStore: number; atPurchasing: number }

// ── จัดซื้อ ───────────────────────────────────────────────────────────────────
export interface PurchasingSummary {
  /** ใบขอซื้อที่อนุมัติแล้ว ผ่านสโตร์มาถึงจัดซื้อ และยังไม่มีใบสั่งซื้อ */
  prAwaitingPo: number | null;
  poPending: number | null;
  /** ใบสั่งซื้อที่อนุมัติแล้วแต่ยังรับของไม่ครบ (ยังไม่มีใบรับสินค้า หรือใบรับยังเปิดอยู่) */
  poAwaitingReceipt: number | null;
  /** ในกลุ่มข้างบน ที่เลยวันที่ต้องการรับของแล้ว */
  poOverdue: number | null;
}
export interface PurchasingDetail {
  /** ช่วงที่เลือก — ใบสั่งซื้อที่อนุมัติแล้ว นับตามวันที่ออกใบ · มูลค่ารวม VAT ตามใบ */
  poApprovedInPeriod: { count: number; value: number } | null;
  /** 12 เดือนล่าสุด — ใบสั่งซื้อที่อนุมัติแล้ว ตามวันที่ออกใบ · มูลค่ารวม VAT ตามใบ */
  poValueByMonth: { month: string; count: number; value: number }[] | null;
  /** ช่วงที่เลือก — ผู้ขายที่ยอดสั่งซื้อ (ใบอนุมัติแล้ว) สูงสุด 6 ราย */
  topVendors: { name: string; count: number; value: number }[] | null;
  /** ใบสั่งซื้อที่อนุมัติแล้วทั้งหมด เทียบกับที่รับของครบแล้ว (ใบรับสินค้าปิดแล้ว) */
  receiptProgress: { approved: number; received: number } | null;
  /** ตัวเดียวกับ `summary.prAwaitingPo` แยกตามแผนกเจ้าของใบ */
  prAwaitingPoByDepartment: { project: number; production: number; general: number } | null;
  /** ใบขอซื้อที่อนุมัติแล้ว แยกว่าตอนนี้อยู่ขั้นไหน */
  prStage: { atStore: number; atPurchasing: number; closedByStore: number } | null;
  overduePurchaseOrders: DueItem[] | null;
}

// ── คลังสินค้า ────────────────────────────────────────────────────────────────
export interface InventorySummary {
  stockValue: number | null;
  lowStock: number | null;
  /** ใบเบิกที่อนุมัติแล้วและยังจ่ายไม่ครบ ทุกแผนก — ตัวเดียวกับกล่อง "ตัดของตามใบเบิก" */
  mrAwaitingIssue: number | null;
  openReceivingReports: number | null;
}
export interface InventoryDetail {
  outstandingReceiveValue: number | null;
  prAwaitingStore: number | null;
  pendingProductRequests: number | null;
  /** ในกลุ่มถึงจุดเตือน ที่คงเหลือเป็นศูนย์หรือติดลบ */
  outOfStock: number | null;
  /** ตัวเดียวกับ `summary.mrAwaitingIssue` แยกแผนก (ใบที่ไม่มี ownerDepartment เป็นของโครงการ) */
  mrAwaitingIssueByDepartment: { production: number; project: number } | null;
  /** 12 เดือนล่าสุด — มูลค่าที่รับเข้า (`receive`) และตัดจ่าย (`deduct`) ตามเวลาที่บันทึก */
  movementsByMonth: { month: string; receive: number; deduct: number }[] | null;
  /** ช่วงที่เลือก — 10 แถวล่าสุด */
  recentMovements: { id: string; productCode: string; productName: string; kind: StockMovementKind; delta: number; createdAt: string }[] | null;
  lowStockItems: { id: string; code: string; name: string; unit: string; stockQty: number; reorderPoint: number }[] | null;
  /** มูลค่าสต๊อก ณ ปัจจุบัน ต่อหมวดหมู่ เรียงมากไปน้อย (สินค้าเก็บถาวรไม่นับ) */
  stockValueByCategory: { categoryId: string; categoryName: string; value: number }[] | null;
}

// ── ผลิต ──────────────────────────────────────────────────────────────────────
export interface ProductionSummary {
  pending: number;
  /** อนุมัติแล้ว และวันกำหนดเสร็จบนใบอยู่ใน 7 วันข้างหน้า */
  dueSoon: number;
  /** อนุมัติแล้ว และวันกำหนดเสร็จบนใบผ่านมาแล้ว — ระบบไม่มีสถานะ "ผลิตเสร็จ" จึงบอกได้แค่นี้ */
  pastDue: number;
  mrAwaitingIssue: number | null;
}
export interface ProductionDetail {
  status: StatusCounts;
  /** ช่วงที่เลือก — นับตามวันเริ่มผลิต */
  startedInPeriod: number;
  /** 12 เดือนล่าสุด — นับตามวันเริ่มผลิตบนใบ */
  startedByMonth: MonthCount[];
  dueList: DueItem[];
  prOpenStage: OpenPurchaseRequestStages | null;
  deliveryOrder: DeliveryOrderCounts | null;
}

// ── โครงการ ───────────────────────────────────────────────────────────────────
export interface ProjectSummary {
  jobOrderPending: number | null;
  jobOrderDueSoon: number | null;
  /** อนุมัติแล้ว และวันแล้วเสร็จบนใบผ่านมาแล้ว — ใบสั่งงานไม่มีสถานะ "เสร็จ" เหมือนใบสั่งผลิต */
  jobOrderPastDue: number | null;
  mrAwaitingIssue: number | null;
  /** ใบขอซื้อของโครงการที่อนุมัติแล้ว ยังไม่ได้ของ (ยังไม่มีใบสั่งซื้อ และสโตร์ยังไม่ปิด) */
  prOpen: number | null;
}
export interface ProjectDetail {
  jobOrderStatus: StatusCounts | null;
  jobOrderStartedInPeriod: number | null;
  /** 12 เดือนล่าสุด — นับตามวันเริ่มงานบนใบสั่งงาน */
  startedByMonth: MonthCount[] | null;
  /** อนุมัติแล้ว วันแล้วเสร็จผ่านมาแล้วหรืออยู่ใน 7 วันข้างหน้า */
  dueList: DueItem[] | null;
  prOpenStage: OpenPurchaseRequestStages | null;
  deliveryOrder: DeliveryOrderCounts | null;
}

// ── BD (Cost Control) — จำนวนเท่านั้น ไม่มียอดเงิน ตามที่เจ้าของสั่งถอดยอดรวมออก 2026-08-31 ──
export interface BdSummary extends StatusCounts {
  /** ช่วงที่เลือก — นับตามวันที่บนหัวใบ */
  createdInPeriod: number;
}
export interface BdDetail {
  linkedToScope: number;
  standalone: number;
  /** 12 เดือนล่าสุด — นับตามวันที่บนหัวใบ */
  createdByMonth: MonthCount[];
  recent: { id: string; docNumber: string; party: string; date: string; status: string }[];
}

// ── บริการ ────────────────────────────────────────────────────────────────────
export interface ServiceBlockSummary {
  draft: number;
  completedThisMonth: number;
  approvalPending: number;
}
/** รายงานที่ต้องตามต่อ — `date` คือวันที่ที่เริ่มนับว่าค้าง (ลูกค้าตอบ / ส่งให้ลูกค้า / แก้ไขล่าสุด) */
export interface ServiceFollowUp { id: string; party: string; date: string; reason: "rejected" | "pending" | "staleDraft" }
export interface ServiceDetail {
  /** ช่วงที่เลือก — นับตามวันที่ตรวจ */
  inspectedInPeriod: number;
  approvalRejected: number;
  /** PM ครั้งถัดไปภายใน 30 วัน */
  upcomingPmCount: number;
  upcomingPm: DueItem[];
  /** 12 เดือนล่าสุด — นับตามวันที่ตรวจ ไม่นับใบยกเลิก · `completed` = ในนั้นที่ปิดงานแล้ว */
  inspectedByMonth: { month: string; inspected: number; completed: number }[];
  /** ช่วงที่เลือก (ตามวันที่ตรวจ) — รายงานที่ปิดงานแล้ว แยกตามผลการอนุมัติของลูกค้า */
  approvalBreakdown: { approved: number; pending: number; rejected: number; notSent: number };
  /** ลูกค้าไม่อนุมัติ · รอลูกค้าตอบ · ร่างที่ไม่ได้แตะเกิน 7 วัน — ไม่เกิน 10 แถว */
  followUps: ServiceFollowUp[];
}

export interface DepartmentBlockTypes {
  purchasing: { summary: PurchasingSummary; detail: PurchasingDetail | null };
  inventory: { summary: InventorySummary; detail: InventoryDetail | null };
  production: { summary: ProductionSummary; detail: ProductionDetail | null };
  project: { summary: ProjectSummary; detail: ProjectDetail | null };
  bd: { summary: BdSummary; detail: BdDetail | null };
  service: { summary: ServiceBlockSummary; detail: ServiceDetail | null };
}

export type DepartmentBlock<K extends DepartmentKey> = DepartmentBlockTypes[K] & { scope: BlockScope };

/** รายการ "ต้องจัดการก่อน" บนภาพรวม — รวมจากทุกแผนกที่ผู้ใช้เห็น เรียงวันที่เก่าสุดก่อน */
export interface AttentionItem {
  dept: DepartmentKey;
  kind: "poOverdue" | "productionDue" | "jobOrderDue" | "serviceApproval";
  id: string;
  docNumber: string;
  party: string;
  /** วันกำหนด (สามชนิดแรก) หรือวันที่ส่งให้ลูกค้าอนุมัติ (serviceApproval) */
  date: string;
}

export interface DepartmentDashboardResponse {
  view: DepartmentDashboardView;
  filters: { from: string; to: string };
  today: string;
  /**
   * ไม่มีคีย์ = ไม่ได้ขอบล็อกนั้น · `null` = ไม่มีสิทธิ์ หรือคำนวณล้มเหลว (ดู `failed`)
   * ภาพรวมได้ `detail: null` ทุกบล็อก
   */
  blocks: { [K in DepartmentKey]?: DepartmentBlock<K> | null };
  /** เฉพาะภาพรวม — จำนวนใบรออนุมัติต่อชนิดที่ผู้ใช้อนุมัติได้ · แท็บอื่นเป็น null */
  pendingApprovals: { kind: PendingApprovalKind; count: number }[] | null;
  /** เฉพาะภาพรวมและผู้มี `auditLog:view` */
  activityTimeline: AuditLogEntry[] | null;
  /** เฉพาะภาพรวม — ไม่เกิน 8 รายการ · null เมื่อแท็บอื่นหรือคำนวณล้มเหลว */
  attention: AttentionItem[] | null;
  failed: DepartmentKey[];
}

export async function fetchDepartmentDashboard(
  view: DepartmentDashboardView,
  range: { from: string; to: string },
): Promise<DepartmentDashboardResponse> {
  const params = new URLSearchParams({ dept: view });
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  return apiFetch<DepartmentDashboardResponse>(`/dashboard/departments?${params.toString()}`);
}
