import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WithId } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  projectsCollection, scopeOfWorksCollection, auditLogCollection,
  toObjectId, withStringId, type ProjectFields, type ScopeOfWorkFields,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeEnum } from "./projectValidation.js";
import type { ProjectItem, ProjectItemSourcingMethod, ProjectStatus, ProjectSummary, ProjectListItem } from "../../src/lib/project.js";

/**
 * Project API (added 2026-08-18, Stage 3) — `api/handlers/quotes.ts` dispatches `/api/projects`
 * here on the raw pathname, sharing that function file with quotes/scope-of-works/delivery-orders/
 * ar-milestones/ar-documents (`api/handlers/` is exactly 9 files + 3 plain-route files = 12/12, no
 * headroom — confirmed Stage 2). Mounted alongside Scope of Work/Delivery Order specifically because
 * a Project is generated from, and always belongs to, exactly one Scope of Work — same reasoning as
 * Delivery Order's own mount. A Project distributes every Scope of Work item across one of 3
 * sourcing branches (in stock / fabricate in-house / purchase externally), each branch spawning a
 * real sub-document via materialRequisitionHandler.ts/jobOrderHandler.ts/purchaseRequestHandler.ts —
 * see those files for the atomic link-back invariant.
 */

const PROJECT_STATUSES: readonly ProjectStatus[] = ["Planning", "InProgress", "Completed"];
const SOURCING_METHODS: readonly ProjectItemSourcingMethod[] = ["unassigned", "requisition", "jobOrder", "purchaseRequest"];

async function writeProjectAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
  related: { scopeNumber?: string; scopeOfWorkId?: string },
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "โครงการ",
    action,
    details,
    createdAt: nowIso(),
    ...(related.scopeNumber ? { relatedScopeNumber: related.scopeNumber } : {}),
    ...(related.scopeOfWorkId ? { relatedScopeId: related.scopeOfWorkId } : {}),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
/** Same "own, or holds :finalize" rule as Scope of Work's/Delivery Order's canEditX() — Project has
 * no dedicated Draft/Final lock of its own (see handleUpdate below), but the ownership half of the
 * rule still applies: a plain :edit holder may only touch their own Project. */
function canEditProject(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "project:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "project:finalize");
}

/** A non-priced divider row (`isSectionHeader`) copied from a Quotation Template makes no sense to
 * "source" — excluded entirely, same convention deliveryOrderHandler.ts's deriveItemsFromScope()
 * already established. `existing` (default empty) lets this double as both "derive fresh" (create)
 * and "reconcile by id, preserving sourcing state" (refresh) — an item whose id still exists on the
 * Scope of Work keeps its `sourcingMethod`/`itemStatus`/sub-document links; a brand-new item starts
 * `"unassigned"`/`"pending"`; an item removed from the Scope of Work simply stops appearing here
 * (any sub-document already created against it is left in place, orphaned but harmless — same
 * "no destructive cleanup" convention every other module in this codebase follows). */
function reconcileItemsFromScope(scope: WithId<ScopeOfWorkFields>, existing: ProjectItem[] = []): ProjectItem[] {
  const existingById = new Map(existing.map((it) => [it.id, it]));
  return scope.items
    .filter((it) => !it.isSectionHeader)
    .map((it): ProjectItem => {
      const prev = existingById.get(it.id);
      const snapshot = { name: it.name, specifications: it.specifications.map((s) => s.text), quantity: it.quantity, unit: it.unit };
      if (prev) return { ...prev, ...snapshot };
      return {
        id: it.id, ...snapshot,
        sourcingMethod: "unassigned", itemStatus: "pending",
        materialRequisitionId: "", jobOrderId: "", purchaseRequestId: "",
      };
    });
}

function toSummary(doc: WithId<ProjectFields>): ProjectSummary {
  const full = withStringId(doc);
  return { id: full.id, scopeOfWorkId: full.scopeOfWorkId, status: full.status, updatedAt: full.updatedAt };
}
function toListItem(doc: WithId<ProjectFields>): ProjectListItem {
  const full = withStringId(doc);
  return {
    id: full.id,
    scopeOfWorkId: full.scopeOfWorkId ?? "",
    scopeNumber: full.scopeNumber ?? "",
    customerCompanyName: full.customerCompanyName ?? "",
    itemCount: Array.isArray(full.items) ? full.items.length : 0,
    status: full.status ?? "Planning",
    updatedAt: full.updatedAt ?? "",
  };
}
function toClient(doc: WithId<ProjectFields>) {
  return withStringId(doc);
}

export async function loadProjectOrThrow(id: string): Promise<WithId<ProjectFields>> {
  const projects = await projectsCollection();
  const doc = await projects.findOne({ _id: toObjectId(id) });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบโครงการ");
  return doc;
}

/**
 * Loads the Project and validates the target item exists and is still `"pending"` (no sub-document
 * created against it yet) — called by materialRequisitionHandler.ts/jobOrderHandler.ts/
 * purchaseRequestHandler.ts's own create routes BEFORE they insert the new sub-document, so a
 * sub-document is never created for an invalid/already-claimed item in the first place. Exported so
 * the 400/404 error and the "already claimed" check live in exactly one place.
 */
/**
 * ตรวจว่ารายการที่ขอมา "มีอยู่จริงและยังว่าง" ทุกตัว **ก่อน** จะ insert อะไรลงไป
 *
 * รับได้หลายรายการตั้งแต่ 2026-08-27 — ฝ่ายโครงการขอให้ใบสั่งงาน "ติ๊กเลือกได้ว่าจะเอาตัวไหน"
 * หนึ่งเอกสารจึงครอบคลุมได้หลายรายการ ตัวเดียวก็ยังใช้ `loadPendingProjectItemOrThrow()` ได้เหมือนเดิม
 *
 * ตรวจให้ครบทุกตัวก่อน แล้วค่อยคืนค่า — ไม่ใช่ตรวจไปสร้างไป เพื่อไม่ให้เกิดเอกสารที่ผูกรายการได้แค่บางส่วน
 */
export async function loadPendingProjectItemsOrThrow(
  projectId: string,
  itemIds: string[],
): Promise<{ project: WithId<ProjectFields>; items: ProjectItem[] }> {
  if (itemIds.length === 0) throw new HttpError(400, "กรุณาเลือกรายการอย่างน้อย 1 รายการ");
  const project = await loadProjectOrThrow(projectId);
  const items: ProjectItem[] = [];
  for (const itemId of itemIds) {
    const item = project.items.find((it) => it.id === itemId);
    if (!item) throw new HttpError(404, "ไม่พบรายการนี้ในโครงการ");
    if (item.itemStatus !== "pending") {
      throw new HttpError(400, `รายการ "${item.name}" มีเอกสารที่สร้างไว้แล้ว`);
    }
    items.push(item);
  }
  return { project, items };
}

/** เวอร์ชันรายการเดียว — ยังใช้กับปุ่มสร้างรายแถวในหน้าโครงการ */
export async function loadPendingProjectItemOrThrow(
  projectId: string,
  itemId: string,
): Promise<{ project: WithId<ProjectFields>; item: ProjectItem }> {
  const { project, items } = await loadPendingProjectItemsOrThrow(projectId, [itemId]);
  return { project, item: items[0] };
}

/**
 * Atomically links a newly-created sub-document back onto its parent ProjectItem — the CRITICAL
 * invariant for this module (Stage 3): `sourcingMethod`/`itemStatus`/the relevant
 * `{materialRequisition,jobOrder,purchaseRequest}Id` are always server-derived here, immediately
 * after the sub-document's own `insertOne()` succeeds, never trusted from client input on the
 * sub-document's own create route. No multi-document transaction wraps the two writes (this
 * codebase's Mongo deployment/tests are single-node, no replica set — see e.g. the RBAC migration
 * backfill's own $addToSet-then-record ordering for the same non-transactional precedent); atomicity
 * in practice comes from `loadPendingProjectItemOrThrow()` above validating the item is still
 * `"pending"` *before* the sub-document is inserted, so the only way this update could fail after a
 * successful insert is a genuine DB outage between the two calls.
 */
export async function linkProjectItemsToSubDocument(
  projectId: string,
  itemIds: string[],
  sourcingMethod: ProjectItemSourcingMethod,
  linkField: "materialRequisitionId" | "jobOrderId" | "purchaseRequestId",
  subDocumentId: string,
): Promise<void> {
  if (itemIds.length === 0) return;
  const projects = await projectsCollection();
  // เขียนทุกรายการใน `updateOne` ครั้งเดียวด้วย arrayFilters — ไม่ใช่วนลูปอัปเดตทีละตัว
  // เพราะการวนลูปเปิดช่องให้ผูกได้บางตัวแล้วพลาดตัวที่เหลือ กลายเป็นเอกสารที่ผูกครึ่ง ๆ กลาง ๆ
  // ตัว filter ต้องมีเงื่อนไขรายการด้วย ไม่ใช่แค่ `_id` — ถ้าเหลือแค่ `_id` การอัปเดตจะ "สำเร็จ"
  // (matchedCount = 1) แม้ไม่มีรายการไหนตรงเลย แล้วเอกสารลูกที่เพิ่ง insert ไปจะกลายเป็นเอกสารกำพร้า
  // เงียบ ๆ ซึ่งเป็นสิ่งที่คอมเมนต์ CRITICAL ด้านบนบอกว่าห้ามเกิด
  //
  // ใช้ `$all` ไม่ใช่ `$in` โดยตั้งใจ: `$in` ผ่านเมื่อ**มีสักรายการเดียว**ตรง ตอนที่ยังผูกทีละรายการ
  // สองอย่างนี้เท่ากัน แต่พอผูกได้หลายรายการแล้วมันต่างกันมาก — ถ้ามีรายการหนึ่งถูกลบไประหว่างทาง
  // `$in` จะปล่อยผ่านแล้วผูกให้แค่ตัวที่เหลือ กลายเป็นเอกสารที่ผูกครึ่ง ๆ กลาง ๆ โดยไม่มีอะไรฟ้อง
  // `$all` บังคับว่าทุก id ที่ขอมาต้องมีอยู่จริง ไม่งั้น matchedCount = 0 แล้วโยน 404 ออกไป
  const result = await projects.updateOne(
    { _id: toObjectId(projectId), "items.id": { $all: itemIds } },
    {
      $set: {
        "items.$[it].sourcingMethod": sourcingMethod,
        "items.$[it].itemStatus": "documentCreated",
        [`items.$[it].${linkField}`]: subDocumentId,
        updatedAt: nowIso(),
      },
    },
    { arrayFilters: [{ "it.id": { $in: itemIds } }] },
  );
  if (result.matchedCount === 0) throw new HttpError(404, "ไม่พบรายการนี้ในโครงการ");
}

/** เวอร์ชันรายการเดียว — ยังใช้กับปุ่มสร้างรายแถวในหน้าโครงการ */
export async function linkProjectItemToSubDocument(
  projectId: string,
  itemId: string,
  sourcingMethod: ProjectItemSourcingMethod,
  linkField: "materialRequisitionId" | "jobOrderId" | "purchaseRequestId",
  subDocumentId: string,
): Promise<void> {
  return linkProjectItemsToSubDocument(projectId, [itemId], sourcingMethod, linkField, subDocumentId);
}

/** Resolves which ProjectItem a sub-document belongs to by its recorded link field — the
 * sub-document types (MaterialRequisition/JobOrder/PurchaseRequest) don't store their own
 * originating `itemId`, only the Project does (as the `{...}Id` on the matching `ProjectItem`), so
 * `handleFinalize()`/`handleDelete()` on each sub-document handler resolve it this way rather than
 * carrying a redundant reverse-reference. Returns `null` (never throws) if the Project was deleted
 * or the link was already cleared — callers treat that as "nothing to update," not an error. */
/**
 * หา **ทุก** รายการในโครงการที่ผูกอยู่กับเอกสารใบนี้ — ตั้งแต่ 2026-08-27 ใบสั่งงานหนึ่งใบครอบคลุม
 * ได้หลายรายการ ถ้ายังคืนแค่ตัวแรก การกดอนุมัติจะปิดงานให้แค่รายการเดียว ที่เหลือค้างเป็น
 * "สร้างเอกสารแล้ว" ตลอดไปโดยไม่มีอะไรฟ้อง
 */
export async function findProjectItemIdsByLink(
  projectId: string,
  linkField: "materialRequisitionId" | "jobOrderId" | "purchaseRequestId",
  subDocumentId: string,
): Promise<string[]> {
  const projects = await projectsCollection();
  const doc = await projects.findOne({ _id: toObjectId(projectId), [`items.${linkField}`]: subDocumentId });
  if (!doc) return [];
  return doc.items.filter((it) => it[linkField] === subDocumentId).map((it) => it.id);
}

/** เวอร์ชันรายการเดียว — คืนตัวแรกที่เจอ ใช้กับจุดที่รู้ว่าผูกรายการเดียวจริง ๆ */
export async function findProjectItemIdByLink(
  projectId: string,
  linkField: "materialRequisitionId" | "jobOrderId" | "purchaseRequestId",
  subDocumentId: string,
): Promise<string | null> {
  const ids = await findProjectItemIdsByLink(projectId, linkField, subDocumentId);
  return ids[0] ?? null;
}

/** Called by each sub-document handler's own `/:id/finalize` route, after the sub-document's status
 * flips to `"Final"` — advances the parent ProjectItem to `"fulfilled"`. Best-effort (never throws):
 * by this point the item is already linked from a successful create, so a missing match here would
 * only mean the parent Project was independently deleted/refreshed out from under it, not a bug in
 * the finalize action itself. */
export async function markProjectItemsFulfilled(projectId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const projects = await projectsCollection();
  await projects.updateOne(
    { _id: toObjectId(projectId) },
    { $set: { "items.$[it].itemStatus": "fulfilled", updatedAt: nowIso() } },
    { arrayFilters: [{ "it.id": { $in: itemIds } }] },
  );
}

export async function markProjectItemFulfilled(projectId: string, itemId: string): Promise<void> {
  return markProjectItemsFulfilled(projectId, [itemId]);
}

/** Called by each sub-document handler's own `DELETE /:id` route — resets the parent ProjectItem
 * back to `"unassigned"`/`"pending"` and clears the link, closing the loop `handleItemUpdate()`
 * above points users toward ("ยกเลิก/ลบเอกสารเดิมก่อน"). Best-effort, same reasoning as
 * markProjectItemFulfilled() above. */
export async function unlinkProjectItems(
  projectId: string,
  itemIds: string[],
  linkField: "materialRequisitionId" | "jobOrderId" | "purchaseRequestId",
): Promise<void> {
  if (itemIds.length === 0) return;
  const projects = await projectsCollection();
  await projects.updateOne(
    { _id: toObjectId(projectId) },
    {
      $set: {
        "items.$[it].sourcingMethod": "unassigned",
        "items.$[it].itemStatus": "pending",
        [`items.$[it].${linkField}`]: "",
        updatedAt: nowIso(),
      },
    },
    { arrayFilters: [{ "it.id": { $in: itemIds } }] },
  );
}

export async function unlinkProjectItem(
  projectId: string,
  itemId: string,
  linkField: "materialRequisitionId" | "jobOrderId" | "purchaseRequestId",
): Promise<void> {
  return unlinkProjectItems(projectId, [itemId], linkField);
}
async function loadScopeOrThrow(scopeOfWorkId: string): Promise<WithId<ScopeOfWorkFields>> {
  const scopeOfWorks = await scopeOfWorksCollection();
  const doc = await scopeOfWorks.findOne({ _id: toObjectId(scopeOfWorkId) });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบ Scope of Work");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "project:view");
  const scopeOfWorkId = typeof req.query.scopeOfWorkId === "string" ? req.query.scopeOfWorkId : "";

  const projects = await projectsCollection();
  // Omitting scopeOfWorkId switches from "does a Project already exist for this Scope of Work?"
  // (an existence check, deliberately unfiltered by :viewAll — same reasoning Scope of Work's/
  // Delivery Order's identical by-source lookup uses: hiding a colleague's already-created record
  // here would risk a duplicate-creation UX trap) to "list every Project company-wide," which IS
  // scoped by project:viewAll.
  if (!scopeOfWorkId) {
    const ownershipMatch = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "project:viewAll"), "createdBy");
    const docs = await projects.find({ isDeleted: false, ...ownershipMatch }).sort({ updatedAt: -1 }).toArray();
    res.status(200).json({ projects: docs.map(toListItem) });
    return;
  }

  const docs = await projects.find({ scopeOfWorkId, isDeleted: false }).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ projects: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "project:create");
  // Reading the source Scope of Work's full content requires :view too — same defense-in-depth
  // Delivery Order's own create route uses.
  if (!roleHasPermission(ctx.role, "scopeOfWork:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const scopeOfWorkId = typeof body.scopeOfWorkId === "string" ? body.scopeOfWorkId.trim() : "";
  if (!scopeOfWorkId) throw new HttpError(400, "กรุณาระบุ Scope of Work");
  const scope = await loadScopeOrThrow(scopeOfWorkId);
  // เปิดโครงการได้เฉพาะงานที่อนุมัติแล้ว (Final) เท่านั้น — งานที่ยังเป็นฉบับร่างหรือรออนุมัติ ยังแก้ไข
  // รายการได้อยู่ ถ้าเปิดโครงการไปก่อนแล้วรายการเปลี่ยนทีหลัง ใบเบิก/ใบสั่งงาน/ใบขอซื้อที่ออกไปแล้วจะอ้าง
  // ของที่ไม่ตรงกับงานจริง (ซ้ำร้ายกว่านั้น การ refresh ฝั่ง Scope of Work สร้าง item id ใหม่ทุกครั้ง ทำให้
  // ลิงก์ของเอกสารลูกหลุดไปเลย — ดู docs/MODULES/Project.md)
  //
  // Server-side gate, not just a UI filter: the picker in ProjectSourcePickers.tsx disables
  // non-Final rows, but that is presentation only and this is the check that actually holds.
  if (scope.status !== "Final") {
    throw new HttpError(400, "Scope of Work นี้ยังไม่ได้รับการอนุมัติ (ต้องเป็นสถานะ Final ก่อนจึงจะเปิดโครงการได้)");
  }

  const now = nowIso();
  const doc: ProjectFields = {
    scopeOfWorkId,
    scopeNumber: scope.scopeNumber,
    quotationId: scope.quotationId,
    customerCompanyName: scope.customerSnapshot.companyName,
    items: reconcileItemsFromScope(scope),
    status: "Planning",
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
    isDeleted: false,
  };
  const projects = await projectsCollection();
  const result = await projects.insertOne(doc);
  const created = { ...doc, _id: result.insertedId };
  await writeProjectAuditEntry(ctx, "Project Created", `สร้างโครงการสำหรับ Scope of Work ${scope.scopeNumber}`, {
    scopeNumber: scope.scopeNumber, scopeOfWorkId,
  });
  res.status(201).json({ project: toClient(created) });
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "project:view");
  const doc = await loadProjectOrThrow(id);
  res.status(200).json({ project: toClient(doc) });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadProjectOrThrow(id);
  if (!canEditProject(ctx, doc)) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<ProjectFields> = {};
  // Only top-level fields — item-level sourcing assignment goes through the dedicated
  // PATCH /:id/items/:itemId route below, never this one, so the two concerns can't collide.
  if ("status" in body) update.status = sanitizeEnum(body.status, PROJECT_STATUSES, "สถานะโครงการ");

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const projects = await projectsCollection();
  await projects.updateOne({ _id: doc._id }, { $set: update });
  const updated = await projects.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบโครงการ");
  await writeProjectAuditEntry(ctx, "Project Updated", `แก้ไขโครงการของ Scope of Work ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  res.status(200).json({ project: toClient(updated) });
}

/**
 * Branch assignment only — sets `sourcingMethod` on one ProjectItem. Deliberately does NOT create
 * the sub-document itself (that's materialRequisitionHandler.ts's/jobOrderHandler.ts's/
 * purchaseRequestHandler.ts's own POST route, which sets `sourcingMethod` too, atomically with its
 * own creation — see those files). Only allowed while the item is still `"pending"` (no sub-document
 * created yet) — once a sub-document exists, reassigning the branch here would silently orphan a
 * real record's back-link, so it's rejected instead: delete/cancel the sub-document first.
 */
async function handleItemUpdate(req: VercelRequest, res: VercelResponse, id: string, itemId: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadProjectOrThrow(id);
  if (!canEditProject(ctx, doc)) throw new HttpError(403, "Forbidden");

  const item = doc.items.find((it) => it.id === itemId);
  if (!item) throw new HttpError(404, "ไม่พบรายการนี้ในโครงการ");
  if (item.itemStatus !== "pending") {
    throw new HttpError(400, "รายการนี้มีเอกสารที่สร้างไว้แล้ว ไม่สามารถเปลี่ยนสาขาการจัดหาได้โดยตรง — ยกเลิก/ลบเอกสารเดิมก่อน");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const sourcingMethod = sanitizeEnum(body.sourcingMethod, SOURCING_METHODS, "สาขาการจัดหา");

  const projects = await projectsCollection();
  await projects.updateOne(
    { _id: doc._id, "items.id": itemId },
    { $set: { "items.$.sourcingMethod": sourcingMethod, updatedAt: nowIso(), updatedBy: ctx.user.id } },
  );
  const updated = await projects.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบโครงการ");
  await writeProjectAuditEntry(ctx, "Project Item Sourcing Assigned", `กำหนดสาขาการจัดหา "${sourcingMethod}" ให้รายการ "${item.name}" ในโครงการของ Scope of Work ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  res.status(200).json({ project: toClient(updated) });
}

async function handleRefresh(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadProjectOrThrow(id);
  if (!canEditProject(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (!roleHasPermission(ctx.role, "scopeOfWork:view")) throw new HttpError(403, "Forbidden");
  const scope = await loadScopeOrThrow(doc.scopeOfWorkId);

  const update: Partial<ProjectFields> = {
    scopeNumber: scope.scopeNumber,
    customerCompanyName: scope.customerSnapshot.companyName,
    items: reconcileItemsFromScope(scope, doc.items),
    updatedAt: nowIso(),
    updatedBy: ctx.user.id,
  };
  const projects = await projectsCollection();
  await projects.updateOne({ _id: doc._id }, { $set: update });
  const updated = await projects.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบโครงการ");
  await writeProjectAuditEntry(ctx, "Project Refreshed", `อัปเดตข้อมูลโครงการจาก Scope of Work ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  res.status(200).json({ project: toClient(updated) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "project:delete");
  const doc = await loadProjectOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "project:finalize")) throw new HttpError(403, "Forbidden");

  const projects = await projectsCollection();
  await projects.updateOne({ _id: doc._id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeProjectAuditEntry(ctx, "Project Deleted", `ลบโครงการของ Scope of Work ${doc.scopeNumber}`, {
    scopeNumber: doc.scopeNumber, scopeOfWorkId: doc.scopeOfWorkId,
  });
  res.status(200).json({ ok: true });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleProject(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/projects");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "refresh") return handleRefresh(req, res, parts[0]);
  if (parts.length === 3 && parts[1] === "items") return handleItemUpdate(req, res, parts[0], parts[2]);
  throw new HttpError(404, "Not found");
}
