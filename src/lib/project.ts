import { apiFetch } from "./apiClient.js";

/**
 * Project module (added 2026-08-18 — Stage 2 data layer, Stage 3 API, Stage 4 first UI).
 *
 * A Project is generated from a Scope of Work once its Scope of Work + Cost Control are finalized —
 * same "created via a toolbar button on the source document, snapshot not live reference" shape as
 * Delivery Order's relationship to Scope of Work (see src/lib/deliveryOrder.ts). It distributes every
 * Scope of Work item across exactly one of 3 sourcing branches (in stock / fabricate in-house /
 * purchase externally) and tracks, per item, which real sub-document (MaterialRequisition/JobOrder/
 * PurchaseRequest — see the sibling lib files) was generated for it.
 *
 * See docs/MODULES/Project.md for the full feature writeup.
 */

export type ProjectStatus = "Planning" | "InProgress" | "Completed";

/** Which of the 3 branches an item has been assigned to. "unassigned" is the starting state for
 * every item copied in from the source Scope of Work. */
export type ProjectItemSourcingMethod = "unassigned" | "requisition" | "jobOrder" | "purchaseRequest";

export type ProjectItemStatus = "pending" | "documentCreated" | "fulfilled" | "cancelled";

export interface ProjectItem {
  /** Mirrors the source ScopeOfWorkItem's id — same id-preservation convention DeliveryOrderItem
   * uses, so refresh-by-id reconciliation against the Scope of Work stays possible. */
  id: string;
  name: string;
  specifications: string[];
  quantity: number | null;
  unit: string;
  sourcingMethod: ProjectItemSourcingMethod;
  itemStatus: ProjectItemStatus;
  /** "" = none yet. Set server-side, atomically with the sub-document's own creation, once the API
   * layer exists (Stage 3) — never client-invented. */
  materialRequisitionId: string;
  jobOrderId: string;
  purchaseRequestId: string;
}

export interface Project {
  id: string;
  scopeOfWorkId: string;
  /** Frozen snapshot of ScopeOfWork.scopeNumber, refreshable — same convention as
   * DeliveryOrder.scopeNumber. */
  scopeNumber: string;
  quotationId: string;
  /** Snapshot from ScopeOfWork.customerSnapshot.companyName. */
  customerCompanyName: string;
  items: ProjectItem[];
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

/** Stage 3 addition — lightweight shape for the by-scope existence-check list, same convention as
 * DeliveryOrderSummary. */
export interface ProjectSummary {
  id: string;
  scopeOfWorkId: string;
  status: ProjectStatus;
  updatedAt: string;
}

/** Stage 3 addition — lightweight shape for the company-wide standalone list, same convention as
 * DeliveryOrderListItem. */
export interface ProjectListItem {
  id: string;
  scopeOfWorkId: string;
  scopeNumber: string;
  customerCompanyName: string;
  itemCount: number;
  status: ProjectStatus;
  updatedAt: string;
}

// ดึงรายการโครงการของ Scope of Work ที่ระบุ (ใช้ตรวจสอบว่ามีโครงการอยู่แล้วหรือไม่)
// Fetches Projects for one Scope of Work — used for the "does a Project already exist?" check
export async function fetchProjectsByScope(scopeOfWorkId: string): Promise<ProjectSummary[]> {
  const { projects } = await apiFetch<{ projects: ProjectSummary[] }>(`/projects?scopeOfWorkId=${encodeURIComponent(scopeOfWorkId)}`);
  return projects;
}
// ดึงรายการโครงการทั้งหมดในระบบ สำหรับหน้ารายการแบบแยกต่างหาก
// Fetches every Project company-wide, for the standalone management page's list
export async function fetchAllProjects(): Promise<ProjectListItem[]> {
  const { projects } = await apiFetch<{ projects: ProjectListItem[] }>("/projects");
  return projects;
}
export async function fetchProject(id: string): Promise<Project> {
  const { project } = await apiFetch<{ project: Project }>(`/projects/${encodeURIComponent(id)}`);
  return project;
}
export async function createProjectFromScope(scopeOfWorkId: string): Promise<Project> {
  const { project } = await apiFetch<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify({ scopeOfWorkId }) });
  return project;
}
export async function updateProjectStatus(id: string, status: ProjectStatus): Promise<Project> {
  const { project } = await apiFetch<{ project: Project }>(`/projects/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
  return project;
}
// กำหนดสาขาการจัดหาให้กับรายการหนึ่งในโครงการ (ยังไม่สร้างเอกสารย่อย)
// Assigns a sourcing branch to one Project item — does not create the sub-document itself
export async function assignProjectItemSourcing(id: string, itemId: string, sourcingMethod: ProjectItemSourcingMethod): Promise<Project> {
  const { project } = await apiFetch<{ project: Project }>(`/projects/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, { method: "PATCH", body: JSON.stringify({ sourcingMethod }) });
  return project;
}
export async function refreshProjectFromScope(id: string): Promise<Project> {
  const { project } = await apiFetch<{ project: Project }>(`/projects/${encodeURIComponent(id)}/refresh`, { method: "POST" });
  return project;
}
export async function deleteProject(id: string): Promise<void> {
  await apiFetch<void>(`/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
}
