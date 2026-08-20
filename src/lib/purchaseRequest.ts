import { apiFetch } from "./apiClient.js";

/**
 * Purchase Request (form FMPU05 Rev.02, printed footer reads "FM-PU-05") — added 2026-08-18.
 * Reproduces the printed structure of public/reference/-ED6908027.pdf (a real filled example) — sent
 * to Procurement when a Project item isn't in the store catalog and can't be made in-house (incl.
 * outsourced work). The real example's header is explicitly labeled "(ฝ่ายโครงการ)" —
 * "(Project department)" — confirming this is requested BY Project, and its remark field carried the
 * job code (e.g. "PQ202605-120-SC-SK"), confirming the job-code tie shown here.
 */

export type PurchaseRequestStatus = "Draft" | "Final";

export interface PurchaseRequestLine {
  id: string;
  /** -> Product.id. Optional — the real example line (RM-1915) *was* a catalog code shared with
   * Material Requisition's item master, but a PR line can also be a one-off item with no catalog
   * entry, so this stays optional unlike MaterialRequisitionLine.productId. */
  productId: string;
  productCode: string;
  /** "รายละเอียด" — free-typed if productId is unset. */
  description: string;
  unit: string;
  /** "คลัง คงเหลือ" — informational only, manually typed. No live-inventory integration this stage
   * (confirmed — see Stage 2 decisions in conversation, 2026-08-18); revisit once/if a real
   * Inventory/Warehouse module exists (docs/CLAUDE.md's long-term charter). */
  warehouseRemainingQty: string;
  /** "จำนวนขอซื้อ" */
  qtyRequested: number | null;
  /** "วันต้องการ" */
  neededByDate: string;
  /** "แผนก" — cost-center/department code printed on the real example (e.g. "G120"). */
  departmentCode: string;
  /** free-typed cost-center reference, distinct from departmentCode — kept separate since the real
   * example only showed one code column; split out defensively in case Purchasing tracks both a
   * requesting-department code and a distinct cost/job code. Revisit once a real filled multi-line PR
   * is available to confirm whether this is actually a second, distinct field. */
  costCode: string;
  /** "tied to a job code" per the original request — cost lives per-line here, not on the header,
   * since a PR is naturally a list of individually-priced items. */
  estimatedCost: number | null;
}

export interface PurchaseRequest {
  /** Human-readable business id (e.g. "PR-2569-0001"), intended to be stored directly as _id once
   * the API layer mints it (Stage 3) — a clean new prefix, NOT the real example's legacy "ED" scheme
   * (source/meaning of "ED" unconfirmed — see Stage 1 open questions in conversation). */
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  /** "หมายเหตุ" on the real example carried the job code (e.g. "PQ202605-120-SC-SK") — modeled here
   * as a real field rather than free-text remark. */
  jobCode: string;
  /** "ผู้จำหน่าย" — starts blank; Purchasing fills this in, not Project. */
  vendorName: string;
  /** "วันที่รับของ" */
  neededByDate: string;
  /** "เครดิต" (days) */
  creditDays: number | null;
  /** "ขนส่งโดย" */
  shippingMethod: string;
  /** "สถานที่ส่งของ" */
  deliveryLocation: string;
  lines: PurchaseRequestLine[];
  status: PurchaseRequestStatus;
  /** "ผู้ขอซื้อ" */
  requestedBy: string;
  requestedAt: string;
  /** "ผู้อนุมัติ" */
  approvedBy: string;
  approvedAt: string;
  /** "ฝ่ายจัดซื้อ" */
  purchasingDeptBy: string;
  purchasingDeptAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export async function createPurchaseRequest(projectId: string, itemId: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>("/purchase-requests", {
    method: "POST", body: JSON.stringify({ projectId, itemId }),
  });
  return purchaseRequest;
}

/** Stage 3 addition — lightweight shape for list views, same convention as DeliveryOrderSummary. */
export interface PurchaseRequestSummary {
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  jobCode: string;
  status: PurchaseRequestStatus;
  updatedAt: string;
}

// Stage 5 additions — full wrapper set alongside the Purchase Request document page.
export async function fetchPurchaseRequestsByProject(projectId: string): Promise<PurchaseRequestSummary[]> {
  const { purchaseRequests } = await apiFetch<{ purchaseRequests: PurchaseRequestSummary[] }>(`/purchase-requests?projectId=${encodeURIComponent(projectId)}`);
  return purchaseRequests;
}
export async function fetchAllPurchaseRequests(): Promise<PurchaseRequestSummary[]> {
  const { purchaseRequests } = await apiFetch<{ purchaseRequests: PurchaseRequestSummary[] }>("/purchase-requests");
  return purchaseRequests;
}
export async function fetchPurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}`);
  return purchaseRequest;
}
export type PurchaseRequestUpdateFields = Partial<Omit<PurchaseRequest, "id" | "createdAt" | "createdBy" | "isDeleted">>;
export async function updatePurchaseRequest(id: string, fields: PurchaseRequestUpdateFields): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return purchaseRequest;
}
export async function finalizePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const { purchaseRequest } = await apiFetch<{ purchaseRequest: PurchaseRequest }>(`/purchase-requests/${encodeURIComponent(id)}/finalize`, { method: "POST" });
  return purchaseRequest;
}
export async function logPurchaseRequestPrinted(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/purchase-requests/${encodeURIComponent(id)}/print`, { method: "POST" });
}
export async function deletePurchaseRequest(id: string): Promise<void> {
  await apiFetch<void>(`/purchase-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
}
// สร้างรายการเปล่า อาจผูกกับสินค้าในแคตตาล็อกหรือพิมพ์เองอิสระก็ได้
// Builds a blank line — may optionally be linked to a catalog Product, or stay free-typed
export function blankPurchaseRequestLine(product?: { id: string; code: string; name: string; unit: string }): PurchaseRequestLine {
  const newId = `prline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  if (product) {
    return { id: newId, productId: product.id, productCode: product.code, description: product.name, unit: product.unit, warehouseRemainingQty: "", qtyRequested: null, neededByDate: "", departmentCode: "", costCode: "", estimatedCost: null };
  }
  return { id: newId, productId: "", productCode: "", description: "", unit: "", warehouseRemainingQty: "", qtyRequested: null, neededByDate: "", departmentCode: "", costCode: "", estimatedCost: null };
}
