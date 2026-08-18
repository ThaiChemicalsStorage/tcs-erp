/**
 * Job Order (FM-PJ-01 Rev.01) — added 2026-08-18, Stage 2 (data layer only). Reproduces the printed
 * structure of public/reference/FM-PJ-01__Rev1.pdf — sent to Production when a Project item isn't in
 * the store catalog but can be fabricated in-house.
 *
 * Line items are free-typed (unlike Material Requisition's fixed catalog) since fabrication work
 * varies per job. The "ขอบเขตงาน (Scope of work)" section is a flat 23-item checklist reusing
 * ChecklistGroup/ChecklistOption from documentRequirements.ts (the same shape Scope of Work uses) —
 * several options need an associated fill-in value (micron figures, BAR/TON values, free text), which
 * is what ChecklistOption.value (added alongside this file) is for. Deliberately ONE flat group, not
 * split into the PDF's two visual columns — the source form gives those columns no explicit title/
 * business meaning of their own, so inventing one would be adding structure the source doesn't have.
 */

import { apiFetch } from "./apiClient.js";
import type { ChecklistGroup, ChecklistOption } from "./documentRequirements.js";

export type { ChecklistGroup, ChecklistOption };

export type JobOrderStatus = "Draft" | "Final";

export interface JobOrderLine {
  id: string;
  description: string;
  quantity: number | null;
  unit: string;
  remark: string;
}

export interface JobOrder {
  /** Human-readable business id (e.g. "JO-2569-0001"), intended to be stored directly as _id once
   * the API layer mints it (Stage 3) — same convention as service_reports' SR-{year}-{seq}. */
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  /** "รหัสงาน" */
  jobCode: string;
  /** "ชื่อลูกค้า" — the PDF labels this "Job name," snapshot from the Project/Scope of Work. */
  customerName: string;
  /** "จากหน่วยงาน" */
  fromSite: string;
  /** "ถึงหน่วยงาน" */
  toSite: string;
  /** "วันเริ่มดำเนินการ" */
  startDate: string;
  /** "วันดำเนินการแล้วเสร็จ" */
  finishDate: string;
  lines: JobOrderLine[];
  /** "ขอบเขตงาน (Scope of work)" — see buildJobOrderChecklistGroups() below. */
  scopeChecklist: ChecklistGroup[];
  /** "รายละเอียดอื่นๆ (Out of Scope)" */
  outOfScope: string;
  status: JobOrderStatus;
  /** "ผู้ร้องขอ" */
  requestedBy: string;
  requestedAt: string;
  /** "ผู้อนุมัติ" */
  approvedBy: string;
  approvedAt: string;
  /** "ผู้รับเอกสาร" — Production acknowledging receipt. */
  documentRecipientBy: string;
  documentRecipientAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export async function createJobOrder(projectId: string, itemId: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>("/job-orders", {
    method: "POST", body: JSON.stringify({ projectId, itemId }),
  });
  return jobOrder;
}

/** Stage 3 addition — lightweight shape for list views, same convention as DeliveryOrderSummary. */
export interface JobOrderSummary {
  id: string;
  projectId: string;
  scopeOfWorkId: string;
  jobCode: string;
  status: JobOrderStatus;
  updatedAt: string;
}

// Stage 5 additions — full wrapper set alongside the Job Order document page.
export async function fetchJobOrdersByProject(projectId: string): Promise<JobOrderSummary[]> {
  const { jobOrders } = await apiFetch<{ jobOrders: JobOrderSummary[] }>(`/job-orders?projectId=${encodeURIComponent(projectId)}`);
  return jobOrders;
}
export async function fetchAllJobOrders(): Promise<JobOrderSummary[]> {
  const { jobOrders } = await apiFetch<{ jobOrders: JobOrderSummary[] }>("/job-orders");
  return jobOrders;
}
export async function fetchJobOrder(id: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}`);
  return jobOrder;
}
export type JobOrderUpdateFields = Partial<Omit<JobOrder, "id" | "createdAt" | "createdBy" | "isDeleted">>;
export async function updateJobOrder(id: string, fields: JobOrderUpdateFields): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return jobOrder;
}
export async function finalizeJobOrder(id: string): Promise<JobOrder> {
  const { jobOrder } = await apiFetch<{ jobOrder: JobOrder }>(`/job-orders/${encodeURIComponent(id)}/finalize`, { method: "POST" });
  return jobOrder;
}
export async function logJobOrderPrinted(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/job-orders/${encodeURIComponent(id)}/print`, { method: "POST" });
}
export async function deleteJobOrder(id: string): Promise<void> {
  await apiFetch<void>(`/job-orders/${encodeURIComponent(id)}`, { method: "DELETE" });
}
// สร้างรายการเปล่าสำหรับตารางที่พิมพ์เองอิสระ (ไม่ผูกกับแคตตาล็อก)
// Builds a blank free-typed line (not catalog-linked, unlike Material Requisition's lines)
export function blankJobOrderLine(): JobOrderLine {
  return { id: `joline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, description: "", quantity: null, unit: "", remark: "" };
}

/** Builds the default "ขอบเขตงาน (Scope of work)" checklist, in the reference PDF's own reading
 * order (left column top-to-bottom, then right column top-to-bottom). Every option starts unchecked
 * with a blank value — nothing is pre-selected, same "don't guess" convention Scope of Work's own
 * default-checklist builder follows. */
export function buildJobOrderChecklistGroups(): ChecklistGroup[] {
  const opt = (key: string, label: string, hasValue = false): ChecklistOption =>
    hasValue ? { key, label, checked: false, value: "" } : { key, label, checked: false };
  return [
    {
      key: "scopeOfWork",
      title: "ขอบเขตงาน (Scope of work)",
      selectionType: "multiple",
      options: [
        opt("designAndCalculationSheet", "DESIGN AND CALCULATION SHEET"),
        opt("fabricationDrawing", "FABRICATION DRAWING"),
        opt("shopDetailAndCuttingPlan", "SHOP DETAIL AND CUTTING PLAN"),
        opt("rawMaterialSupply", "RAW MATERIAL SUPPLY"),
        opt("shopFabricationAndConsumable", "SHOP FABRICATION AND CONSUMABLE"),
        opt("ptOrMt", "PT OR MT"),
        opt("rt10", "RT 10%"),
        opt("hydroTest", "HYDRO-TEST", true),
        opt("pneumaticTest", "PNEUMATIC TEST", true),
        opt("manpowerSupply", "MANPOWER SUPPLY"),
        opt("mobileCrane", "MOBILE CRANE", true),
        opt("paintingSystem", "PAINTING SYSTEM", true),
        opt("sandblastingSa", "SANDBLASTING SA", true),
        opt("primerCoat", "PRIMER COAT", true),
        opt("intermediateCoat", "INTERMIDIATE COAT", true),
        opt("finishedCoat", "FINISHED COAT", true),
        opt("hotDipGalvanized", "HOT DIP GALVANIZED"),
        opt("wrapping", "WRAPPING"),
        opt("transportation", "TRANSPORTATION"),
        opt("siteInstallation", "SITE INSTALLATION"),
        opt("excavation", "EXCAVATION"),
        opt("scaffolding", "SCAFFOLDING"),
        opt("other", "OTHER", true),
      ],
    },
  ];
}
