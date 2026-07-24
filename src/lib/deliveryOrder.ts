import { apiFetch } from "./apiClient.js";

/**
 * Delivery Order (ใบส่งมอบสินค้าและบริการ, added 2026-07-23) — a printable document generated from
 * an existing Scope of Work, reproducing the printed structure of the reference PDF
 * ("ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM บริษัท อีจ.pdf", `public/`). Per direct user request:
 * customer info ("เรียน") is pulled from the source Quotation (via the Scope of Work's own
 * `customerSnapshot`, itself already sourced from the Quotation), items are pulled from the Scope
 * of Work, and the document splits into one printed page per payment installment — each page shows
 * only the items ticked for that installment (e.g. "40% Materials on site" gets only the items the
 * preparer marks as covered by that shipment).
 *
 * **This file is type-imported into the API bundle** (`api/_lib/collections.ts`,
 * `api/_lib/deliveryOrderHandler.ts`) — per the standing rule in docs/CLAUDE.md, never add a
 * *value* import here that transitively pulls in JSX/React.
 *
 * A Delivery Order is created FROM a Scope of Work (`scopeOfWorkId`) but stores its own independent
 * snapshot of the fields it needs (`customerCompanyName`/`customerAddress`/`items`) — editing a
 * Delivery Order never modifies the source Scope of Work, and later edits to the Scope of Work never
 * silently change an already-created Delivery Order. An explicit "อัปเดตข้อมูลจาก Scope of Work"
 * action re-pulls the snapshot (and reconciles `installments` against the Scope of Work's current
 * payment schedule) on demand only.
 */

export type DeliveryOrderStatus = "Draft" | "Final";

/** One printed item row — a lean snapshot of `ScopeOfWorkItem` (name/quantity/unit/specifications
 * only; `remark`/`isSectionHeader` items aren't part of this document, see `deriveItemsFromScope()`
 * in api/_lib/deliveryOrderHandler.ts). Read-only in the Delivery Order editor — to change an item's
 * own name/qty/unit/specs, edit the Scope of Work itself and use "อัปเดตข้อมูลจาก Scope of Work". */
export interface DeliveryOrderItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  specifications: { id: string; text: string }[];
}

/** One printed page — mirrors one `ScopeOfWorkPaymentInstallment` (same `id`, so a refresh can
 * reconcile by identity), plus the fields specific to this document: which items are ticked for
 * this shipment/page, and the always-blank-by-default "เลขที่"/"วันที่" lines the reference PDF
 * leaves for hand-filling after printing. `remark` is auto-drafted at creation/refresh time from
 * `pct`/`label`/`paymentType`/`days` (the "Remark:" footer line) but freely editable afterward —
 * same "auto-draft, never silently overwrite" convention as `revisionNote`. */
export interface DeliveryOrderInstallment {
  id: string;
  pct: number | null;
  label: string;
  paymentType: "" | "Cash" | "Credit";
  days: number | null;
  itemIds: string[];
  documentNumber: string;
  issueDate: string;
  remark: string;
}

export interface DeliveryOrder {
  id: string;
  scopeOfWorkId: string;
  scopeNumber: string;
  quotationId: string;
  customerCompanyName: string;
  customerAddress: string;
  items: DeliveryOrderItem[];
  installments: DeliveryOrderInstallment[];
  status: DeliveryOrderStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
  /** Capability key for the session-less read-only HTML view (added 2026-07-24) —
   * `GET /api/delivery-orders/:id/view?key=...`, linked from the Scope of Work
   * document-recipient email when the sender ticks "แนบใบส่งมอบสินค้า". Generated server-side on
   * first use (same random-key pattern as attachment downloads), never client-writable (not in
   * DeliveryOrderUpdateFields), absent until then. */
  shareKey?: string;
}

/** Compact shape for a Scope of Work detail's "does a Delivery Order already exist?" lookup. */
export interface DeliveryOrderSummary {
  id: string;
  scopeOfWorkId: string;
  status: DeliveryOrderStatus;
  updatedAt: string;
}

/** Row shape for the standalone Delivery Order management page's list. */
export interface DeliveryOrderListItem {
  id: string;
  scopeOfWorkId: string;
  scopeNumber: string;
  customerCompanyName: string;
  installmentCount: number;
  status: DeliveryOrderStatus;
  updatedAt: string;
}

export type DeliveryOrderUpdateFields = Partial<{
  installments: DeliveryOrderInstallment[];
}>;

export async function fetchDeliveryOrdersByScope(scopeOfWorkId: string): Promise<DeliveryOrderSummary[]> {
  const { deliveryOrders } = await apiFetch<{ deliveryOrders: DeliveryOrderSummary[] }>(`/delivery-orders?scopeOfWorkId=${encodeURIComponent(scopeOfWorkId)}`);
  return deliveryOrders;
}
/** Every non-deleted Delivery Order company-wide, for the standalone management page's list —
 * omitting `scopeOfWorkId` from the query switches the server to this "list everything" mode
 * (`api/_lib/deliveryOrderHandler.ts`), same convention as Scope of Work's own list route. */
export async function fetchAllDeliveryOrders(): Promise<DeliveryOrderListItem[]> {
  const { deliveryOrders } = await apiFetch<{ deliveryOrders: DeliveryOrderListItem[] }>("/delivery-orders");
  return deliveryOrders;
}
export async function fetchDeliveryOrder(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${id}`);
  return deliveryOrder;
}
export async function createDeliveryOrderFromScope(scopeOfWorkId: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>("/delivery-orders", {
    method: "POST",
    body: JSON.stringify({ scopeOfWorkId }),
  });
  return deliveryOrder;
}
export async function updateDeliveryOrder(id: string, fields: DeliveryOrderUpdateFields): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return deliveryOrder;
}
export async function finalizeDeliveryOrder(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${id}/finalize`, { method: "POST" });
  return deliveryOrder;
}
export async function refreshDeliveryOrderFromScope(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${id}/refresh`, { method: "POST" });
  return deliveryOrder;
}
export async function deleteDeliveryOrder(id: string): Promise<void> {
  await apiFetch<void>(`/delivery-orders/${id}`, { method: "DELETE" });
}

/** `"{pct}% {label} ({Cash|Credit} {days} Days)"` — the starting-draft "Remark:" footer text for a
 * newly-created/refreshed installment page, e.g. "40% After material on site (Cash 7 Days)". Freely
 * editable afterward (e.g. to add a clause like "Exclude Electrical control", as the reference PDF's
 * sample does) — this is only ever a sensible default, never re-applied automatically. */
export function draftInstallmentRemark(installment: Pick<DeliveryOrderInstallment, "pct" | "label" | "paymentType" | "days">): string {
  const pctPart = installment.pct !== null ? `${installment.pct}% ` : "";
  const methodPart = installment.paymentType
    ? ` (${installment.paymentType}${installment.days !== null ? ` ${installment.days} Days` : ""})`
    : "";
  return `${pctPart}${installment.label}${methodPart}`.trim();
}
