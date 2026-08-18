import { apiFetch } from "./apiClient.js";
import { newId } from "./products.js";
import type { Product } from "./products.js";

/**
 * Material Requisition & Return (FM-ST-04 Rev.02) — added 2026-08-18 (Stage 2 data layer, Stage 3
 * API, Stage 4 first UI).
 * Reproduces the printed structure of public/reference/FM-ST-04_-_Rev.02_1.pdf through _4.pdf — a
 * fixed catalog of store items (chemicals/resins, consumables, nuts & bolts, other) with per-line
 * withdrawal/return tracking. See docs/MODULES/Product.md's Products-catalog-reuse discussion (in
 * conversation, Stage 1) — lines reference an existing src/lib/products.ts Product by id rather than
 * a duplicate parallel catalog; see api/_lib/materialCatalogSeedData.ts for the real seeded items.
 *
 * Unlike the paper form (one printed row per every possible catalog item), a digital requisition only
 * ever contains the lines actually requested — add/remove, same convention as ScopeOfWorkItem.
 *
 * jobOrderId (below) links a requisition back to this module's own JobOrder when the materials are
 * for an in-house fabrication job — confirmed 2026-08-18 that "ใบส่งผลิต" in TODO.md's coordination
 * note is an earlier name for today's Job Order (FM-PJ-01), not a separate document.
 */

export type MaterialRequisitionStatus = "Draft" | "Final";

/** Matches the 4 category groupings the reference PDF's catalog is printed under. */
export type MaterialRequisitionCategory = "chemical" | "consumable" | "hardware" | "other";

export interface MaterialRequisitionLine {
  id: string;
  /** -> Product.id. Never live-referenced after creation — code/name/unit below are a frozen
   * snapshot, same convention as QuoteLine/ScopeOfWorkItem. */
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  category: MaterialRequisitionCategory;
  /** "เบิกของ" — the originally planned/requested quantity. */
  plannedQty: number | null;
  /** "เบิกครั้งที่1" */
  withdrawal1Qty: number | null;
  /** "เบิกครั้งที่2" */
  withdrawal2Qty: number | null;
  /** "คืนของ" — leftover material returned via this same line, after issuance. Exempt from the
   * Final-status lock at the API layer (Stage 3) — same "follow-up fields survive Final" pattern
   * Scope of Work's PO-chasing fields use — since the paper form's own footer has separate
   * returner/receiver-of-return signatures implying the return happens after the document is done. */
  returnQty: number | null;
  /** "ใช้จริง" — actual quantity used, for reconciliation. */
  actualUsedQty: number | null;
}

export interface MaterialRequisition {
  /** Human-readable business id (e.g. "MR-2569-0001"), intended to be stored directly as _id once
   * the API layer mints it (Stage 3) — same convention as service_reports' SR-{year}-{seq}. */
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  /** "รหัสงาน" — snapshot of Project.scopeNumber / ScopeOfWork.scopeNumber. */
  jobCode: string;
  /** "ชื่อลูกค้า" */
  customerName: string;
  /** "เลขที่ใบสั่งผลิต" — an optional, nullable FK to this module's own JobOrder (confirmed
   * 2026-08-18: "ใบส่งผลิต/Production Order" in TODO.md's coordination note was an earlier name for
   * today's Job Order, FM-PJ-01 — same document, renamed over time, not a separate concept).
   * `null` = no Job Order behind this requisition — many requisitions pull straight from store
   * stock with no fabrication job at all, so this must never be required. `jobOrderCode` is a
   * denormalized snapshot for display, same convention ScopeOfWork.scopeNumber-style snapshots use
   * elsewhere — kept in sync whenever jobOrderId is set, "" when it's null. */
  jobOrderId: string | null;
  jobOrderCode: string;
  /** "ชื่อสินค้า" — the product/job being fabricated, not a MaterialRequisitionLine item. */
  productName: string;
  /** "ชื่อพนักงานดูแล" */
  responsibleEmployee: string;
  /** "วันที่เริ่มผลิต" */
  productionStartDate: string;
  lines: MaterialRequisitionLine[];
  status: MaterialRequisitionStatus;
  preparedBy: string;
  preparedAt: string;
  approvedBy: string;
  approvedAt: string;
  /** "แผนกสโตร์" sign-off. */
  storeDeptBy: string;
  storeDeptAt: string;
  /** "แผนกต้นทุน" sign-off. */
  costDeptBy: string;
  costDeptAt: string;
  /** "ผู้คืน" — one signature for the whole return event (return quantity itself is per-line above). */
  returnedBy: string;
  /** "ผู้รับคืน" */
  returnReceivedBy: string;
  returnedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/** Stage 3 addition — lightweight shape for the by-project list, same convention as
 * DeliveryOrderSummary. */
export interface MaterialRequisitionSummary {
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  jobCode: string;
  status: MaterialRequisitionStatus;
  updatedAt: string;
}

/** Must stay in sync with `MATERIAL_CATEGORY_SEEDS` in api/_lib/materialCatalogSeedData.ts (a
 * server-only file that can't be imported into the frontend bundle) — the 4 real `ProductCategory`
 * names the material catalog is seeded under, used to filter `ProductPickerModal`'s product list
 * down to just this module's catalog rather than every sales-facing product too. */
export const MATERIAL_CATEGORY_TO_KEY: Record<string, MaterialRequisitionCategory> = {
  "เคมี/เรซิ่น": "chemical",
  "วัสดุสิ้นเปลือง": "consumable",
  "น็อตและสกรู": "hardware",
  "อื่นๆ (คลัง)": "other",
};
export const MATERIAL_CATEGORY_NAMES: string[] = Object.keys(MATERIAL_CATEGORY_TO_KEY);
export function resolveMaterialCategoryKey(categoryName: string): MaterialRequisitionCategory {
  return MATERIAL_CATEGORY_TO_KEY[categoryName] ?? "other";
}

// สร้างรายการเปล่าจากสินค้าที่เลือกในแคตตาล็อก
// Builds a new line from a product picked in the catalog
export function blankMaterialRequisitionLine(product: Product, categoryName: string): MaterialRequisitionLine {
  return {
    id: newId("mrline"),
    productId: product.id, productCode: product.code, productName: product.name, unit: product.unit,
    category: resolveMaterialCategoryKey(categoryName),
    plannedQty: null, withdrawal1Qty: null, withdrawal2Qty: null, returnQty: null, actualUsedQty: null,
  };
}

export async function fetchMaterialRequisitionsByProject(projectId: string): Promise<MaterialRequisitionSummary[]> {
  const { materialRequisitions } = await apiFetch<{ materialRequisitions: MaterialRequisitionSummary[] }>(`/material-requisitions?projectId=${encodeURIComponent(projectId)}`);
  return materialRequisitions;
}
// ดึงรายการใบเบิกและใบคืนวัสดุทั้งหมดในระบบ สำหรับหน้ารายการแบบแยกต่างหาก (ไม่ผูกกับโครงการใดโครงการหนึ่ง)
// Fetches every Material Requisition company-wide, for the standalone management page's list
export async function fetchAllMaterialRequisitions(): Promise<MaterialRequisitionSummary[]> {
  const { materialRequisitions } = await apiFetch<{ materialRequisitions: MaterialRequisitionSummary[] }>("/material-requisitions");
  return materialRequisitions;
}
export async function fetchMaterialRequisition(id: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}`);
  return materialRequisition;
}
export async function createMaterialRequisition(projectId: string, itemId: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>("/material-requisitions", {
    method: "POST", body: JSON.stringify({ projectId, itemId }),
  });
  return materialRequisition;
}
export type MaterialRequisitionUpdateFields = Partial<Omit<MaterialRequisition, "id" | "createdAt" | "createdBy" | "isDeleted">>;
export async function updateMaterialRequisition(id: string, fields: MaterialRequisitionUpdateFields): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
  return materialRequisition;
}
// บันทึกการคืนวัสดุ (แก้ไขได้แม้เอกสารจะเป็นสถานะ Final แล้ว)
// Records a material return — stays editable even once the document is Final
export async function recordMaterialRequisitionReturn(
  id: string,
  fields: { lines: { id: string; returnQty: number | null }[]; returnedBy?: string; returnReceivedBy?: string },
): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/return`, {
    method: "POST", body: JSON.stringify(fields),
  });
  return materialRequisition;
}
export async function finalizeMaterialRequisition(id: string): Promise<MaterialRequisition> {
  const { materialRequisition } = await apiFetch<{ materialRequisition: MaterialRequisition }>(`/material-requisitions/${encodeURIComponent(id)}/finalize`, { method: "POST" });
  return materialRequisition;
}
export async function logMaterialRequisitionPrinted(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/material-requisitions/${encodeURIComponent(id)}/print`, { method: "POST" });
}
export async function deleteMaterialRequisition(id: string): Promise<void> {
  await apiFetch<void>(`/material-requisitions/${encodeURIComponent(id)}`, { method: "DELETE" });
}
