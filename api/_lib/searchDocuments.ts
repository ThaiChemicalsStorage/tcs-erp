import type { AuthContext } from "./auth.js";
import {
  deliveryOrdersCollection, serviceReportsCollection, projectsCollection,
  materialRequisitionsCollection, jobOrdersCollection, purchaseRequestsCollection, purchaseOrdersCollection, costControlsCollection,
  productionOrdersCollection, productRequestsCollection, arDocumentsCollection,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { buildOwnershipClause, buildSimpleOwnershipClause } from "./visibility.js";
import { containsRegex, startsWithRegex, type DocNumberFamily } from "./searchShared.js";
import { departmentIdForUser } from "./deliveryOrderHandler.js";
import { ALL_RECIPIENT_KEYS } from "../../src/lib/documentRequirements.js";

/**
 * The 12 business-document categories Global Search covers as of 2026-08-28 — 9 added when the owner
 * asked for "ค้นหาได้ทุกเอกสาร" (up from the 7 it had covered since 2026-07-14), then ใบสั่งซื้อ /
 * ใบตรวจรับสินค้า / ใบรับวางบิล the same day with the Purchasing module.
 * Master data (customers/products/templates/users) and menu shortcuts stay in `searchHandler.ts`;
 * this file is only the documents people actually hunt for by number.
 *
 * **One result shape for all nine.** Every document in this ERP answers the same four questions —
 * what number is it, whose job is it, where did it come from, and what state is it in — so they
 * share `SearchDocumentResult` rather than getting twelve bespoke interfaces. That is what lets the
 * UI render one row component instead of twelve, and it is why adding a thirteenth document type is
 * a searcher function plus a label, nothing more.
 *
 * Every searcher here follows the same two rules, both load-bearing:
 *
 * 1. `$and: [ownershipClause, { $or: textFields }]` — never a spread. Both halves are `$or`s, and
 *    spreading them into one object makes the second silently overwrite the first, which is a real
 *    data leak (the same bug the MR/PR list handlers carry an explicit comment about).
 * 2. Ownership scoping matches whatever that module's own list route already enforces, so search
 *    can never surface a document its list page would have hidden.
 */
export interface SearchDocumentResult {
  id: string;
  /** เลขที่เอกสาร — the number a person would read off the paper. "" when the type has none. */
  docNumber: string;
  /** ลูกค้า หรือ ผู้ขาย — whose document this is. */
  party: string;
  /** งานต้นทาง — the Scope of Work / job code / quotation this descends from. "" at the root. */
  lineage: string;
  /** Raw stored status; the client maps it to a translated pill. */
  status: string;
  /** ISO timestamp, last touched — what the results are sorted by. */
  date: string;
  /** ใบเบิกของ/ใบขอซื้อ เท่านั้น — picks which sidebar page the result opens ("general" = กล่องงานเข้าจัดซื้อ). */
  ownerDepartment?: "project" | "production" | "general";
  /** เอกสารบัญชีเท่านั้น — picks which of the four accounting pages the result opens. */
  docType?: "AR" | "BI" | "RE" | "IV";
}

type Clause = Record<string, unknown>;

/** `isDeleted: false` plus the two-`$or` `$and` guard rule 1 above describes. */
function docFilter(ownership: Clause, textFields: Clause[]): Clause {
  return { isDeleted: false, $and: [ownership, { $or: textFields }] };
}

function isoOf(doc: { updatedAt?: unknown; createdAt?: unknown }): string {
  const raw = doc.updatedAt ?? doc.createdAt ?? "";
  if (raw instanceof Date) return raw.toISOString();
  return typeof raw === "string" ? raw : "";
}

const SORT_RECENT = { updatedAt: -1 } as const;

/**
 * ใบส่งมอบสินค้า. Has no number of its own — one Delivery Order per Scope of Work, identified by
 * the parent `scopeNumber` (see docs/MODULES/DeliveryOrder.md); its per-installment
 * `documentNumber`s are searched too, but the row still shows the scope number, because that is
 * what the list page shows and what people say out loud.
 */
export async function searchDeliveryOrders(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await deliveryOrdersCollection();
  const rx = containsRegex(query);
  const ownership = await buildOwnershipClause(ctx, "deliveryOrder", "createdBy");
  // เอกสารที่ถูกส่งมาให้แผนกของผู้ใช้ ต้องค้นเจอด้วย เหมือนที่โผล่ในหน้ารายการ — merge เข้า `$or` เดิม
  // ไม่ใช่ spread ทับ (ทั้งคู่เป็น `$or` การ spread จะลบอันแรกทิ้งเงียบ ๆ) และถ้า clause เดิมเป็น {}
  // แปลว่าเห็นทุกใบอยู่แล้ว ไม่ต้องรวมอะไร — ตรงกับ handleList() ใน deliveryOrderHandler.ts ทุกบรรทัด
  const myDepartmentId = await departmentIdForUser(ctx);
  const scoped: Clause =
    myDepartmentId !== null && "$or" in ownership
      ? { $or: [...(ownership.$or as Clause[]), { sentToDepartmentIds: myDepartmentId }] }
      : ownership;
  const docs = await col.find(
    docFilter(scoped, [
      { scopeNumber: rx }, { quotationId: rx }, { customerCompanyName: rx },
      { "installments.documentNumber": rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d.scopeNumber ?? "",
    party: d.customerCompanyName ?? "",
    lineage: d.quotationId ?? "",
    status: d.status ?? "",
    date: isoOf(d),
  }));
}

/** รายงานบริการ — `_id` is the document number (SR-2569-0001). */
export async function searchServiceReports(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await serviceReportsCollection();
  const rx = containsRegex(query);
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "service:viewAll"), "createdBy");
  const docs = await col.find(
    docFilter(ownership, [
      { _id: rx }, { "customerSnapshot.companyName": rx }, { serviceLocation: rx },
      { projectOrJobCode: rx }, { serviceSystemName: rx }, { serviceType: rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d._id.toString(),
    party: d.customerSnapshot?.companyName ?? "",
    lineage: d.projectOrJobCode ?? "",
    status: d.status ?? "",
    date: isoOf(d),
  }));
}

/** โครงการ — a grouping record, not a printed document, so it has no number of its own. */
export async function searchProjects(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await projectsCollection();
  const rx = containsRegex(query);
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "project:viewAll"), "createdBy");
  const docs = await col.find(
    docFilter(ownership, [
      { scopeNumber: rx }, { quotationId: rx }, { customerCompanyName: rx }, { "items.name": rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d.scopeNumber ?? "",
    party: d.customerCompanyName ?? "",
    lineage: d.quotationId ?? "",
    status: d.status ?? "",
    date: isoOf(d),
  }));
}

/**
 * ใบเบิกและคืนวัสดุ — `_id` is the number (MR-2569-0001).
 *
 * **Returns both departments' documents, tagged.** The list pages split project vs production
 * (materialRequisitionHandler's `ownerDepartment` clause), but that split is navigational, not a
 * permission boundary: both sidebar entries are gated by the same `materialRequisition:view`, and
 * `ROLE_HIDDEN_NAV_KEYS` hides neither, so anyone who can search these can already open both pages.
 * Filtering one out here would hide a document the user can reach in two clicks — the opposite of
 * what this feature is for. `ownerDepartment` rides along so the result opens the right page.
 */
export async function searchMaterialRequisitions(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await materialRequisitionsCollection();
  const rx = containsRegex(query);
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "materialRequisition:viewAll"), "createdBy");
  const docs = await col.find(
    docFilter(ownership, [
      { _id: rx }, { customerName: rx }, { jobCode: rx }, { productName: rx },
      { responsibleEmployee: rx }, { jobOrderCode: rx },
      { "lines.productCode": rx }, { "lines.productName": rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d._id.toString(),
    party: d.customerName ?? "",
    lineage: d.jobCode ?? "",
    status: d.status ?? "",
    date: isoOf(d),
    // เอกสารเก่าไม่มีฟิลด์นี้ ถือเป็นของฝ่ายโครงการ (ไม่ได้ทำ migration) — ตรงกับ handler ของหน้ารายการ
    ownerDepartment: d.ownerDepartment === "production" ? ("production" as const) : ("project" as const),
  }));
}

/** ใบสั่งงาน — `_id` is the number (JO-2569-0001). */
export async function searchJobOrders(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await jobOrdersCollection();
  const rx = containsRegex(query);
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "jobOrder:viewAll"), "createdBy");
  const docs = await col.find(
    docFilter(ownership, [
      { _id: rx }, { customerName: rx }, { jobCode: rx }, { fromSite: rx }, { toSite: rx },
      { outOfScope: rx }, { "lines.description": rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d._id.toString(),
    party: d.customerName ?? "",
    lineage: d.jobCode ?? "",
    status: d.status ?? "",
    date: isoOf(d),
  }));
}

/** ใบขอซื้อ — `_id` is the number (PR-2569-0001). Both departments, tagged; see MR above. */
export async function searchPurchaseRequests(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await purchaseRequestsCollection();
  const rx = containsRegex(query);
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "purchaseRequest:viewAll"), "createdBy");
  const docs = await col.find(
    docFilter(ownership, [
      { _id: rx }, { vendorName: rx }, { jobCode: rx }, { deliveryLocation: rx },
      { shippingMethod: rx }, { "lines.productCode": rx }, { "lines.description": rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d._id.toString(),
    party: d.vendorName ?? "",
    lineage: d.jobCode ?? "",
    status: d.status ?? "",
    date: isoOf(d),
    ownerDepartment: d.ownerDepartment === "production" ? ("production" as const)
      : d.ownerDepartment === "general" ? ("general" as const) : ("project" as const),
  }));
}

/**
 * ใบสั่งซื้อ (2026-08-28) — `_id` คือเลขที่ (PO-2569-0001) และมี `documentNumber` ที่แก้เองได้แยกอีกตัว
 * จึงค้นทั้งสองฟิลด์ แบบเดียวกับใบสั่งผลิต · `party` เป็น **ผู้ขาย** ไม่ใช่ลูกค้า ต่างจากเอกสารอื่น
 * ทุกใบในไฟล์นี้ — เป็นเอกสารขาซื้อ ปลายทางคือผู้ขาย
 */
export async function searchPurchaseOrders(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await purchaseOrdersCollection();
  const rx = containsRegex(query);
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "purchaseOrder:viewAll"), "createdBy");
  const docs = await col.find(
    docFilter(ownership, [
      { _id: rx }, { documentNumber: rx }, { vendorName: rx }, { jobCode: rx },
      { purchaseRequestId: rx }, { vendorQuotationRef: rx }, { "lines.description": rx }, { "lines.productCode": rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d.documentNumber || d._id.toString(),
    party: d.vendorName ?? "",
    lineage: d.jobCode || d.purchaseRequestId || "",
    status: d.status ?? "",
    date: isoOf(d),
  }));
}

/**
 * Cost Control (2026-08-28) — เอกสารของแผนก BD · `party` เป็น **ชื่องาน/ลูกค้า** (Job Name) และ
 * `lineage` เป็นเลขที่งานต้นทาง (Job order) ซึ่งเป็นเลข Scope of Work ที่คนใช้เรียกงานกันจริง ๆ
 */
export async function searchCostControls(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await costControlsCollection();
  const rx = containsRegex(query);
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "costControl:viewAll"), "createdBy");
  const docs = await col.find(
    docFilter(ownership, [
      { _id: rx }, { documentNumber: rx }, { jobName: rx }, { jobOrder: rx }, { workType: rx },
      { "lines.description": rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d.documentNumber || d._id.toString(),
    party: d.jobName ?? "",
    lineage: d.jobOrder ?? "",
    status: d.status ?? "",
    date: isoOf(d),
  }));
}

/**
 * ใบสั่งผลิต — the one family whose number is an editable field (`documentNumber`, FM-PD-02) rather
 * than the `_id`. Documents created before 2026-08-27 have no `documentNumber` at all, so both are
 * searched and the display falls back to `_id`, matching `toClient()` in productionOrderHandler.
 */
export async function searchProductionOrders(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await productionOrdersCollection();
  const rx = containsRegex(query);
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "productionOrder:viewAll"), "createdBy");
  const docs = await col.find(
    docFilter(ownership, [
      { documentNumber: rx }, { _id: rx }, { customerCompanyName: rx }, { jobCode: rx },
      { productName: rx }, { supervisorName: rx }, { "lines.description": rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d.documentNumber || d._id.toString(),
    party: d.customerCompanyName ?? "",
    lineage: d.jobCode ?? "",
    status: d.status ?? "",
    date: isoOf(d),
  }));
}

/** คำขอเพิ่มสินค้า — reviewers see every request, everyone else only their own (productRequestHandler). */
export async function searchProductRequests(query: string, ctx: AuthContext, limit: number): Promise<SearchDocumentResult[]> {
  const col = await productRequestsCollection();
  const rx = containsRegex(query);
  const seesAll = roleHasPermission(ctx.role, "productRequest:viewAll") || roleHasPermission(ctx.role, "productRequest:review");
  const ownership = buildSimpleOwnershipClause(ctx.user.id, seesAll, "requestedBy");
  const docs = await col.find(
    docFilter(ownership, [
      { name: rx }, { specifications: rx }, { reason: rx },
      { requestedByName: rx }, { assignedProductCode: rx },
    ]) as never,
    { sort: SORT_RECENT, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    // A request only gets a code once it is approved, so most rows have none — `party` carries the
    // requested product name instead, and the client falls back to it as the row's primary line.
    docNumber: d.assignedProductCode ?? "",
    party: d.name ?? "",
    lineage: d.requestedByName ?? "",
    status: d.status ?? "",
    date: isoOf(d),
  }));
}

/**
 * เอกสารบัญชี AR/BI/RE/IV — one collection, four document types, four destination pages.
 *
 * No ownership clause on purpose: `handleDocumentsList()` in arHandler.ts applies none either, so
 * `ar:view` is the whole gate. And no `isDeleted` filter — an issued accounting document is never
 * soft-deleted, cancellation is the `status: "cancelled"` transition (see collections.ts), so
 * cancelled documents stay findable, which is exactly what an accountant chasing a number wants.
 */
export async function searchArDocuments(query: string, limit: number): Promise<SearchDocumentResult[]> {
  const col = await arDocumentsCollection();
  const rx = containsRegex(query);
  const docs = await col.find(
    {
      $or: [
        { docNo: rx }, { reference: rx }, { "customerSnapshot.companyName": rx },
        { "customerSnapshot.taxId": rx }, { "customerSnapshot.contactName": rx },
        { "lines.description": rx },
      ],
    } as never,
    { sort: { docDate: -1 }, limit },
  ).toArray();
  return docs.map((d) => ({
    id: d._id.toString(),
    docNumber: d.docNo ?? "",
    party: d.customerSnapshot?.companyName ?? "",
    lineage: d.reference ?? "",
    status: d.status ?? "",
    date: typeof d.docDate === "string" ? d.docDate : "",
    docType: d.docType,
  }));
}

/**
 * Scope of Work visibility, byte-for-byte the clause `handleList()` in scopeOfWorkHandler.ts builds:
 * the 4-tier `buildOwnershipClause()` cascade merged with the document-recipient matches.
 *
 * **2026-08-28, corrected.** Search had hand-rolled a binary own-vs-`viewAll` clause here since
 * 2026-07-23, which meant a team lead holding `scopeOfWork:viewTeam` saw a teammate's Scope of Work
 * on the list page but could not find it in search. Same fix applied to quotations in
 * `searchHandler.ts`. This grants no new access — it stops search from hiding records the module's
 * own list route already shows.
 */
export async function scopeOfWorkOwnership(ctx: AuthContext): Promise<Clause> {
  const recipientMatch = ALL_RECIPIENT_KEYS.map((key) => ({ [`documentRecipients.${key}`]: ctx.user.id }));
  const ownershipClause = await buildOwnershipClause(ctx, "scopeOfWork", "createdBy");
  return "$or" in ownershipClause
    ? { $or: [...(ownershipClause.$or as Clause[]), ...recipientMatch] }
    : ownershipClause;
}

/** What the fast path found: which category it belongs to, and the row to render. */
export interface DocNumberHit {
  type: DocNumberFamily;
  result: SearchDocumentResult;
}

/**
 * The document-number fast path. Runs one **anchored** prefix query against the single collection
 * the query's prefix identifies, which is the only index-usable query shape this regex-only system
 * has (see `startsWithRegex`). Returns the single best match so the panel can pin it above every
 * group and pre-select it — typing a number you are holding and pressing Enter is the commonest
 * real task this feature exists for, and it should cost exactly one keystroke past the number.
 *
 * Each branch reapplies its own module's ownership scoping rather than trusting the prefix: a
 * caller who may not see the document gets `null`, indistinguishable from a number that does not
 * exist. `quotation` is handled by `searchHandler.ts` instead, where the quote-amount helper lives.
 */
export async function searchByDocNumber(
  family: DocNumberFamily, query: string, ctx: AuthContext,
): Promise<DocNumberHit | null> {
  const anchored = startsWithRegex(query);
  const first = (type: DocNumberFamily, rows: SearchDocumentResult[]): DocNumberHit | null =>
    rows.length > 0 ? { type, result: rows[0] } : null;

  switch (family) {
    case "serviceReport": {
      const col = await serviceReportsCollection();
      const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "service:viewAll"), "createdBy");
      const docs = await col.find({ isDeleted: false, $and: [ownership, { _id: anchored }] } as never, { limit: 1 }).toArray();
      return first("serviceReport", docs.map((d) => ({
        id: d._id.toString(), docNumber: d._id.toString(),
        party: d.customerSnapshot?.companyName ?? "", lineage: d.projectOrJobCode ?? "",
        status: d.status ?? "", date: isoOf(d),
      })));
    }
    case "materialRequisition": {
      const col = await materialRequisitionsCollection();
      const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "materialRequisition:viewAll"), "createdBy");
      const docs = await col.find({ isDeleted: false, $and: [ownership, { _id: anchored }] } as never, { limit: 1 }).toArray();
      return first("materialRequisition", docs.map((d) => ({
        id: d._id.toString(), docNumber: d._id.toString(),
        party: d.customerName ?? "", lineage: d.jobCode ?? "", status: d.status ?? "", date: isoOf(d),
        ownerDepartment: d.ownerDepartment === "production" ? ("production" as const) : ("project" as const),
      })));
    }
    case "jobOrder": {
      const col = await jobOrdersCollection();
      const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "jobOrder:viewAll"), "createdBy");
      const docs = await col.find({ isDeleted: false, $and: [ownership, { _id: anchored }] } as never, { limit: 1 }).toArray();
      return first("jobOrder", docs.map((d) => ({
        id: d._id.toString(), docNumber: d._id.toString(),
        party: d.customerName ?? "", lineage: d.jobCode ?? "", status: d.status ?? "", date: isoOf(d),
      })));
    }
    case "purchaseRequest": {
      const col = await purchaseRequestsCollection();
      const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "purchaseRequest:viewAll"), "createdBy");
      const docs = await col.find({ isDeleted: false, $and: [ownership, { _id: anchored }] } as never, { limit: 1 }).toArray();
      return first("purchaseRequest", docs.map((d) => ({
        id: d._id.toString(), docNumber: d._id.toString(),
        party: d.vendorName ?? "", lineage: d.jobCode ?? "", status: d.status ?? "", date: isoOf(d),
        ownerDepartment: d.ownerDepartment === "production" ? ("production" as const)
          : d.ownerDepartment === "general" ? ("general" as const) : ("project" as const),
      })));
    }
    case "purchaseOrder": {
      const col = await purchaseOrdersCollection();
      const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "purchaseOrder:viewAll"), "createdBy");
      const docs = await col.find(
        { isDeleted: false, $and: [ownership, { $or: [{ documentNumber: anchored }, { _id: anchored }] }] } as never,
        { limit: 1 },
      ).toArray();
      return first("purchaseOrder", docs.map((d) => ({
        id: d._id.toString(), docNumber: d.documentNumber || d._id.toString(),
        party: d.vendorName ?? "", lineage: d.jobCode || d.purchaseRequestId || "",
        status: d.status ?? "", date: isoOf(d),
      })));
    }
    case "costControl": {
      const col = await costControlsCollection();
      const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "costControl:viewAll"), "createdBy");
      const docs = await col.find(
        { isDeleted: false, $and: [ownership, { $or: [{ documentNumber: anchored }, { _id: anchored }] }] } as never,
        { limit: 1 },
      ).toArray();
      return first("costControl", docs.map((d) => ({
        id: d._id.toString(), docNumber: d.documentNumber || d._id.toString(),
        party: d.jobName ?? "", lineage: d.jobOrder ?? "",
        status: d.status ?? "", date: isoOf(d),
      })));
    }
    case "productionOrder": {
      const col = await productionOrdersCollection();
      const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "productionOrder:viewAll"), "createdBy");
      const docs = await col.find(
        { isDeleted: false, $and: [ownership, { $or: [{ documentNumber: anchored }, { _id: anchored }] }] } as never,
        { limit: 1 },
      ).toArray();
      return first("productionOrder", docs.map((d) => ({
        id: d._id.toString(), docNumber: d.documentNumber || d._id.toString(),
        party: d.customerCompanyName ?? "", lineage: d.jobCode ?? "", status: d.status ?? "", date: isoOf(d),
      })));
    }
    case "arDocument": {
      const col = await arDocumentsCollection();
      const docs = await col.find({ docNo: anchored } as never, { limit: 1 }).toArray();
      return first("arDocument", docs.map((d) => ({
        id: d._id.toString(), docNumber: d.docNo ?? "",
        party: d.customerSnapshot?.companyName ?? "", lineage: d.reference ?? "",
        status: d.status ?? "", date: typeof d.docDate === "string" ? d.docDate : "",
        docType: d.docType,
      })));
    }
    default:
      return null;
  }
}
