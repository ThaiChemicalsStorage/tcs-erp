import { apiFetch } from "./apiClient.js";
import type { TranslationKey } from "./i18n.js";

/**
 * Product Stock (added 2026-08-18). See api/_lib/collections.ts's StockMovementFields doc comment
 * for why this ledger is deliberately shared/document-agnostic — Accounting's IV stock-cutting
 * feature (src/pages/accounting/ArStockPanel.tsx) is the first caller, not the only intended one.
 *
 * ⚠️ `StockMovementKind` / `StockMovementSourceType` are declared independently in
 * api/_lib/collections.ts — keep both in step. (This copy had drifted: `material_requisition` was
 * being written by the server for two days before it existed here — fixed 2026-09-03.)
 */
export type StockMovementKind = "receive" | "deduct" | "adjust" | "return";
export type StockMovementSourceType = "manual" | "ar_document" | "material_requisition" | "receiving_report" | "tool_issue" | "purchase_request"
  /** นำเข้ายอดสต๊อกจากไฟล์ Excel (2026-09-23) */
  | "stock_import"
  /** ใบรับคืน/รับเข้าคลังของสโตร์ (2026-09-23) */
  | "store_receipt";

export interface StockMovement {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  kind: StockMovementKind;
  delta: number;
  balanceAfter: number;
  reason: string;
  sourceType: StockMovementSourceType;
  sourceId?: string;
  sourceLabel?: string;
  /** ต้นทุน/หน่วย · มูลค่า · มูลค่าคงเหลือ (2026-09-03) — แถวเก่าไม่มี อ่านเป็น undefined */
  unitCost?: number;
  amount?: number;
  balanceValueAfter?: number;
  /** แผนก/ทีม/ประเภทงานที่ตัดให้หรือคืนจาก — ประทับจากหัวใบเบิก (2026-09-03) */
  departmentId?: string;
  departmentName?: string;
  teamId?: string;
  teamName?: string;
  workTypeCode?: string;
  workTypeName?: string;
  createdAt: string;
  createdBy: string;
}

export const STOCK_MOVEMENT_KIND_LABELS: Record<StockMovementKind, string> = {
  receive: "รับเข้า",
  deduct: "ตัดออก",
  adjust: "ปรับยอด",
  return: "คืนของ",
};

/** i18n key equivalent of the map above — same `t(SOME_LABEL_KEY[x])` pattern as
 * `DOC_TYPE_LABEL_KEY` (src/lib/accounting.ts). Use this (not the plain-Thai map above) in any
 * on-screen UI. Added 2026-08-18. */
export const STOCK_MOVEMENT_KIND_LABEL_KEY: Record<StockMovementKind, TranslationKey> = {
  receive: "stock.movementKind.receive",
  deduct: "stock.movementKind.deduct",
  adjust: "stock.movementKind.adjust",
  return: "stock.movementKind.return",
};

/** มูลค่าสต๊อกของสินค้าหนึ่งตัว — ไม่เก็บลงฐานข้อมูล คำนวณตอนอ่านเสมอ */
export function stockValueOf(p: { stockQty: number; avgCost?: number }): number {
  return Math.max(0, p.stockQty) * (p.avgCost ?? 0);
}

export async function fetchStockMovements(filter?: { productId?: string; sourceId?: string; limit?: number }): Promise<StockMovement[]> {
  const params = new URLSearchParams();
  if (filter?.productId) params.set("productId", filter.productId);
  if (filter?.sourceId) params.set("sourceId", filter.sourceId);
  if (filter?.limit) params.set("limit", String(filter.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  const { movements } = await apiFetch<{ movements: StockMovement[] }>(`/stock-movements${qs}`);
  return movements;
}

/** Manual receive/deduct/adjust from the Stock page — not tied to any document. */
export async function createStockMovement(fields: {
  productId: string;
  kind: StockMovementKind;
  qty?: number; // for "receive"/"deduct" — a positive magnitude
  delta?: number; // for "adjust" — a signed correction
  reason: string;
  /** ต้นทุน/หน่วยตอนรับเข้า (ไม่บังคับ) — ถ้ากรอก ต้นทุนถัวเฉลี่ยของสินค้าจะถูกถัวใหม่ */
  unitCost?: number;
}): Promise<StockMovement> {
  const { movement } = await apiFetch<{ movement: StockMovement }>("/stock-movements", {
    method: "POST",
    body: JSON.stringify(fields),
  });
  return movement;
}

// ── ประวัติความเคลื่อนไหวสต๊อก (หน้าแยก 2026-09-23) ─────────────────────────────

/**
 * ที่มาของความเคลื่อนไหวหนึ่งแถว เติมตอนอ่านจากเอกสารต้นทาง — ไม่ได้เก็บในแถวสต๊อก
 *
 * เจ้าของสั่ง: *"ค้นหาดูได้ว่าของชิ้นนี้ตัดไปกับงานไหนบ้างเข้ายังไงบ้าง"* · แถวสต๊อกเก็บแค่เลขเอกสาร
 * งาน/โครงการอยู่บนใบเบิก ส่วนใบสั่งซื้อ/ผู้ขายอยู่บนใบรับสินค้า จึงต้องตามไปอ่านอีกทอดหนึ่ง
 */
export interface StockMovementLink {
  jobCode?: string;
  jobOrderCode?: string;
  productionOrderId?: string;
  customerName?: string;
  /** เจ้าของใบเบิก — "project" | "production" | "store" */
  ownerDepartment?: string;
  /** รหัสการจ่าย/รับของใบสโตร์ (PD, JD, …) หรือรหัสรับเข้าของใบรับสินค้า (RR/RX/RI) */
  code?: string;
  purchaseOrderNumber?: string;
  vendorName?: string;
}

export interface StockHistoryRow extends StockMovement {
  /** ชื่อผู้ทำรายการ — แถวสต๊อกเก็บแค่ id ผู้ใช้ */
  createdByName: string;
  link: StockMovementLink;
}

export interface StockHistoryFilter {
  q?: string;
  kind?: StockMovementKind | "";
  sourceType?: StockMovementSourceType | "";
  productId?: string;
  departmentId?: string;
  /** วันที่แบบ YYYY-MM-DD ตามเวลาไทย ทั้งสองฝั่งรวมวันนั้น */
  from?: string;
  to?: string;
  skip?: number;
  limit?: number;
}

export interface StockHistorySummaryRow {
  kind: StockMovementKind;
  count: number;
  /** ผลรวมมูลค่า (บวกเสมอ) — แถวเก่าที่ไม่มีมูลค่าไม่ถูกนับ */
  amount: number;
}

export interface StockHistoryResult {
  movements: StockHistoryRow[];
  /** จำนวนแถวทั้งหมดที่ตรงตัวกรอง (ไม่ใช่แค่หน้านี้) */
  total: number;
  summary: StockHistorySummaryRow[];
}

export async function fetchStockHistory(filter: StockHistoryFilter): Promise<StockHistoryResult> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<StockHistoryResult>(`/stock-movements/history${qs}`);
}
