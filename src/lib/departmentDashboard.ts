import { apiFetch } from "./apiClient.js";
import type { AuditLogEntry } from "./auditLog.js";
import type { PendingApprovalKind } from "./pendingApprovals.js";
import type { StockMovementKind } from "./stock.js";
import type { DepartmentKey } from "./dashboardTabs.js";

/**
 * แดชบอร์ดแยกตามแผนก — ชนิดข้อมูลของ `GET /api/dashboard/departments` (เพิ่ม 2026-09-14)
 *
 * ตัวเลขสองแบบ ต้องบอกผู้ใช้ให้ชัดเสมอว่าตัวไหนเป็นแบบไหน (Filter Honesty ใน UI_GUIDELINES.md):
 *   - **ณ ปัจจุบัน (snapshot)** — ของที่ค้างอยู่ตอนนี้ ไม่ขึ้นกับช่วงวันที่ เช่น ใบรออนุมัติ มูลค่าสต๊อก
 *   - **ในช่วงที่เลือก (period)** — ฟิลด์ที่ชื่อลงท้ายด้วย `InPeriod` หรืออธิบายไว้ในคอมเมนต์
 *
 * ค่า `null` ของตัวเลขตัวใดตัวหนึ่ง = ผู้ใช้ไม่มีสิทธิ์ดูเอกสารชนิดนั้น (แท็บหนึ่งรวมเอกสารหลายชนิดที่
 * สิทธิ์แยกกัน) · หน้าจอต้องซ่อนตัวนั้น ไม่ใช่แสดงเป็นศูนย์
 */

export type DepartmentDashboardView = "overview" | DepartmentKey;
/** "own" = อย่างน้อยหนึ่งชนิดเอกสารในแท็บนี้นับเฉพาะใบที่ผู้ใช้เห็นในหน้ารายการของตัวเอง */
export type BlockScope = "all" | "own";

export interface StatusCounts { draft: number; pending: number; final: number }

/** หนึ่งแถวในรายการ "ใกล้ครบกำหนด / เลยกำหนด" — `date` คือวันที่ที่ทำให้ใบนี้ติดรายการ */
export interface DueItem { id: string; docNumber: string; party: string; date: string }

export interface DeliveryOrderCounts { total: number; draft: number; pending: number; final: number }

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
  poStatus: StatusCounts | null;
  /** ช่วงที่เลือก — ใบสั่งซื้อที่อนุมัติแล้ว นับตามวันที่ออกใบ · มูลค่ารวม VAT ตามใบ */
  poApprovedInPeriod: { count: number; value: number } | null;
  prStatusByDepartment: { ownerDepartment: "project" | "production" | "general"; counts: StatusCounts }[] | null;
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
  /** ช่วงที่เลือก */
  movementsByKind: { kind: StockMovementKind; count: number; amount: number }[] | null;
  /** ช่วงที่เลือก — 10 แถวล่าสุด */
  recentMovements: { id: string; productCode: string; productName: string; kind: StockMovementKind; delta: number; createdAt: string }[] | null;
  lowStockItems: { id: string; code: string; name: string; unit: string; stockQty: number; reorderPoint: number }[] | null;
  categoryBreakdown: { categoryId: string; categoryName: string; count: number; percentage: number }[];
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
  dueList: DueItem[];
  requisitionStatus: StatusCounts | null;
  purchaseRequestStatus: StatusCounts | null;
  deliveryOrder: DeliveryOrderCounts | null;
}

// ── โครงการ ───────────────────────────────────────────────────────────────────
export interface ProjectSummary {
  jobOrderPending: number | null;
  jobOrderDueSoon: number | null;
  mrAwaitingIssue: number | null;
  /** ใบขอซื้อของโครงการที่อนุมัติแล้ว ยังไม่ได้ของ (ยังไม่มีใบสั่งซื้อ และสโตร์ยังไม่ปิด) */
  prOpen: number | null;
}
export interface ProjectDetail {
  jobOrderStatus: StatusCounts | null;
  jobOrderStartedInPeriod: number | null;
  dueList: DueItem[] | null;
  requisitionStatus: StatusCounts | null;
  purchaseRequestStatus: StatusCounts | null;
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
  recent: { id: string; docNumber: string; party: string; date: string; status: string }[];
}

// ── บริการ ────────────────────────────────────────────────────────────────────
export interface ServiceBlockSummary {
  draft: number;
  completedThisMonth: number;
  approvalPending: number;
}
export interface ServiceDetail {
  counts: { total: number; draft: number; completed: number; cancelled: number; thisMonth: number };
  /** ช่วงที่เลือก — นับตามวันที่ตรวจ */
  inspectedInPeriod: number;
  approvalPending: number;
  approvalRejected: number;
  /** PM ครั้งถัดไปภายใน 30 วัน */
  upcomingPmCount: number;
  upcomingPm: DueItem[];
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
