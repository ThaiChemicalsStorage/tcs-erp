import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WithId } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildOwnershipClause } from "./visibility.js";
import {
  deliveryOrdersCollection, scopeOfWorksCollection, auditLogCollection,
  usersCollection, rolesCollection, notificationsCollection,
  toObjectId, withStringId, type DeliveryOrderFields, type ScopeOfWorkFields,
} from "./collections.js";
import { roleHasPermission, findRole } from "../../src/lib/roles.js";
import type { NotificationType } from "../../src/lib/notifications.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { normalizePaymentConditions } from "../../src/lib/scopeOfWork.js";
import { draftInstallmentRemark } from "../../src/lib/deliveryOrder.js";
import type {
  DeliveryOrderSummary, DeliveryOrderListItem, DeliveryOrderStatus,
  DeliveryOrderItem, DeliveryOrderInstallment,
} from "../../src/lib/deliveryOrder.js";

/**
 * Delivery Order API (added 2026-07-23) — `api/handlers/quotes.ts` dispatches
 * `/api/delivery-orders` here on the raw pathname, sharing that function file rather than getting
 * its own (Vercel Hobby's 12-function cap is still fully used — see docs/ARCHITECTURE.md). Mounted
 * from the quotes handler (not scopeOfWorkHandler.ts's own file, even though a Delivery Order is
 * created from a Scope of Work) purely because that's where the shared function slot already lives;
 * there's no other reason it couldn't have been mounted from scopeOfWorkHandler.ts instead. See
 * docs/MODULES/DeliveryOrder.md for the full feature writeup and PDF-to-field mapping.
 */

/** No dedicated `relatedDeliveryOrderId` field exists on `AuditLogEntry` (src/lib/auditLog.ts) —
 * these events instead reuse the already-defined `relatedScopeId`/`relatedScopeNumber` fields to
 * point back at the *source* Scope of Work, which already has real deep-link wiring in the Activity
 * Timeline/Dashboard. Adding a brand-new related-record field (and wiring it through those same
 * consumers) wasn't worth it for this pass — the Scope of Work link gets a reader to the right
 * neighborhood either way. */
async function writeDeliveryOrderAuditEntry(
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
    module: "Delivery Order",
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
/** Same "own Draft, or holds :finalize" rule as Scope of Work's `canEditScope()`. */
function canEditDeliveryOrder(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "deliveryOrder:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "deliveryOrder:finalize");
}

/** A non-priced divider row (`isSectionHeader`) copied from a Quotation Template has no
 * quantity/unit and makes no sense to "select" onto a delivery page — excluded entirely, both here
 * and in `deriveInstallmentsFromScope()`'s stale-`itemIds` cleanup below. */
function deriveItemsFromScope(scope: WithId<ScopeOfWorkFields>): DeliveryOrderItem[] {
  return scope.items
    .filter((it) => !it.isSectionHeader)
    .map((it) => ({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      specifications: it.specifications.map((s) => ({ id: s.id, text: s.text })),
    }));
}

/** A Delivery Order never has a page for a pure deposit installment — added 2026-07-23, per
 * direct user follow-up ("ลืมบอกว่าใบส่งมอบงานจะไม่มี down payment เลย"): a deposit paid before any
 * goods/work are actually delivered has nothing to "deliver," so it has no place on this document
 * type, unlike Scope of Work's payment schedule (which legitimately lists it). Broadened 2026-07-24
 * from "Down Payment" only to the other deposit spellings the free-text installment label can
 * carry. Still an exact whole-label match (case-insensitive, trimmed) — never a substring match and
 * never a percentage-based rule, so a milestone like "40% Materials" or "After Down Payment refund"
 * stays eligible; same "exact key, not fuzzy" convention `DocumentRecipientsPicker.tsx`'s
 * department matching already follows. */
const DEPOSIT_INSTALLMENT_LABELS = new Set(["down payment", "deposit", "เงินมัดจำ", "ชำระเงินล่วงหน้า"]);
function isDepositLabel(label: string): boolean {
  return DEPOSIT_INSTALLMENT_LABELS.has(label.trim().toLowerCase());
}

/**
 * Builds/reconciles `installments` against the Scope of Work's *current* payment schedule — matched
 * by the stable installment `id` (payment installments keep their id across a plain edit, same
 * invariant `revisionDiff.ts`'s `diffPaymentConditions()` already relies on). A row whose id still
 * exists on the Scope of Work keeps its user-entered `itemIds`/`documentNumber`/`issueDate`/`remark`
 * (stale `itemIds` pointing at a since-removed item are dropped, never left dangling); a brand-new
 * installment (added to the Scope of Work after this Delivery Order was created) gets a fresh blank
 * page with an auto-drafted `remark`; an installment removed from the Scope of Work — or carrying
 * a deposit label, see `isDepositLabel()` — simply stops appearing here (its page is dropped,
 * nothing to reconcile). `pct`/`label`/`paymentType`/`days` always mirror the Scope of Work's own
 * values — never independently client-editable on this document, see `sanitizeInstallmentsUpdate()`
 * below.
 */
function deriveInstallmentsFromScope(
  scope: WithId<ScopeOfWorkFields>,
  existing: DeliveryOrderInstallment[] = [],
): DeliveryOrderInstallment[] {
  const paymentConditions = normalizePaymentConditions(scope.paymentConditions);
  const existingById = new Map(existing.map((i) => [i.id, i]));
  const currentItemIds = new Set(scope.items.filter((it) => !it.isSectionHeader).map((it) => it.id));
  return paymentConditions.installments
    .filter((src) => !isDepositLabel(src.label))
    .map((src) => {
      const base = { id: src.id, pct: src.pct, label: src.label, paymentType: src.paymentType, days: src.days };
      const prev = existingById.get(src.id);
      if (prev) {
        return {
          ...base,
          itemIds: prev.itemIds.filter((itemId) => currentItemIds.has(itemId)),
          documentNumber: prev.documentNumber,
          issueDate: prev.issueDate,
          remark: prev.remark,
        };
      }
      return { ...base, itemIds: [], documentNumber: "", issueDate: "", remark: draftInstallmentRemark(base) };
    });
}

/** Defensive filter applied at every read path (not just `deriveInstallmentsFromScope()` above) —
 * a Delivery Order created before the deposit exclusion (or its 2026-07-24 broadening) shipped may
 * already have a stored deposit page; this strips it from every response without requiring a
 * migration script or a manual "อัปเดตข้อมูลจาก Scope of Work" click. A record only actually loses
 * the stored row for good once it's next saved through `handleUpdate()`/`handleRefresh()` — reads
 * alone never write back. */
function stripDepositInstallments(installments: DeliveryOrderInstallment[]): DeliveryOrderInstallment[] {
  return installments.filter((i) => !isDepositLabel(i.label));
}

function toSummary(doc: WithId<DeliveryOrderFields>): DeliveryOrderSummary {
  const full = withStringId(doc);
  return { id: full.id, scopeOfWorkId: full.scopeOfWorkId, status: full.status, updatedAt: full.updatedAt };
}
function toListItem(doc: WithId<DeliveryOrderFields>): DeliveryOrderListItem {
  const full = withStringId(doc);
  return {
    id: full.id,
    scopeOfWorkId: full.scopeOfWorkId ?? "",
    scopeNumber: full.scopeNumber ?? "",
    customerCompanyName: full.customerCompanyName ?? "",
    installmentCount: Array.isArray(full.installments) ? stripDepositInstallments(full.installments).length : 0,
    status: full.status ?? "Draft",
    updatedAt: full.updatedAt ?? "",
  };
}
/** The one place a full `DeliveryOrder` is prepared for a client response — every route below calls
 * this instead of `withStringId()` directly, so `stripDepositInstallments()` is never accidentally
 * skipped on a new response shape added later. */
function toClient(doc: WithId<DeliveryOrderFields>) {
  const full = withStringId(doc);
  return { ...full, installments: stripDepositInstallments(full.installments) };
}

async function loadDeliveryOrderOrThrow(id: string): Promise<WithId<DeliveryOrderFields>> {
  const deliveryOrders = await deliveryOrdersCollection();
  const doc = await deliveryOrders.findOne({ _id: toObjectId(id) });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบส่งมอบสินค้า");
  return doc;
}
async function loadScopeOrThrow(scopeOfWorkId: string): Promise<WithId<ScopeOfWorkFields>> {
  const scopeOfWorks = await scopeOfWorksCollection();
  const doc = await scopeOfWorks.findOne({ _id: toObjectId(scopeOfWorkId) });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบ Scope of Work");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "deliveryOrder:view");
  const scopeOfWorkId = typeof req.query.scopeOfWorkId === "string" ? req.query.scopeOfWorkId : "";

  const deliveryOrders = await deliveryOrdersCollection();
  // Omitting `scopeOfWorkId` switches this from "does one exist for this Scope of Work?" (used by
  // ScopeOfWorkDocument.tsx's toolbar) to "list every Delivery Order company-wide" — the standalone
  // Delivery Order management page. Same own-records-only scoping as Scope of Work's identical
  // route, deliberately NOT applied to the by-scope existence check below for the same reason
  // documented there (an existence check must never hide a colleague's already-created record and
  // risk a duplicate).
  if (!scopeOfWorkId) {
    const ownershipMatch = await buildOwnershipClause(ctx, "deliveryOrder", "createdBy");
    const docs = await deliveryOrders.find({ isDeleted: false, ...ownershipMatch }).sort({ updatedAt: -1 }).toArray();
    res.status(200).json({ deliveryOrders: docs.map(toListItem) });
    return;
  }

  const docs = await deliveryOrders.find({ scopeOfWorkId, isDeleted: false }).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ deliveryOrders: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "deliveryOrder:create");
  // Reading the source Scope of Work's full content requires `:view` too — same defense-in-depth
  // as Scope of Work's own Duplicate/Rewrite (`:create` alone shouldn't let a caller read out an
  // arbitrary Scope of Work's content by id).
  if (!roleHasPermission(ctx.role, "scopeOfWork:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const scopeOfWorkId = typeof body.scopeOfWorkId === "string" ? body.scopeOfWorkId.trim() : "";
  if (!scopeOfWorkId) throw new HttpError(400, "กรุณาระบุ Scope of Work");
  const scope = await loadScopeOrThrow(scopeOfWorkId);

  const now = nowIso();
  const doc: DeliveryOrderFields = {
    scopeOfWorkId,
    scopeNumber: scope.scopeNumber,
    quotationId: scope.quotationId,
    customerCompanyName: scope.customerSnapshot.companyName,
    customerAddress: scope.customerSnapshot.address,
    items: deriveItemsFromScope(scope),
    installments: deriveInstallmentsFromScope(scope),
    status: "Draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
    isDeleted: false,
  };
  const deliveryOrders = await deliveryOrdersCollection();
  const result = await deliveryOrders.insertOne(doc);
  const created = { ...doc, _id: result.insertedId };
  await writeDeliveryOrderAuditEntry(
    ctx, "Delivery Order Created",
    `สร้างใบส่งมอบสินค้าสำหรับ Scope of Work ${scope.scopeNumber}`,
    { scopeNumber: scope.scopeNumber, scopeOfWorkId },
  );
  res.status(201).json({ deliveryOrder: toClient(created) });
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "deliveryOrder:view");
  const doc = await loadDeliveryOrderOrThrow(id);
  res.status(200).json({ deliveryOrder: toClient(doc) });
}

const MAX_INSTALLMENT_ROWS = 50;

/** Only `itemIds`/`documentNumber`/`issueDate`/`remark` are client-editable per row —
 * `pct`/`label`/`paymentType`/`days` always mirror the record's own current values (they're the
 * Scope of Work's payment schedule, synced only via "อัปเดตข้อมูลจาก Scope of Work", never typed
 * directly here) and a row's `id` must already exist on the document — a client can reorder/toggle
 * which items go on which existing page, but can never invent a brand-new installment row or attach
 * an item id that isn't actually on this Delivery Order. */
function sanitizeInstallmentsUpdate(raw: unknown, current: DeliveryOrderInstallment[]): DeliveryOrderInstallment[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลงวดชำระเงินไม่ถูกต้อง");
  if (raw.length > MAX_INSTALLMENT_ROWS) throw new HttpError(400, `จำนวนงวดต้องไม่เกิน ${MAX_INSTALLMENT_ROWS} งวด`);
  const currentById = new Map(current.map((i) => [i.id, i]));
  return (raw as Record<string, unknown>[]).map((r, idx) => {
    const id = typeof r.id === "string" ? r.id : "";
    const base = currentById.get(id);
    if (!base) throw new HttpError(400, `งวดชำระเงินลำดับที่ ${idx + 1} ไม่ถูกต้อง`);
    const itemIds = Array.isArray(r.itemIds) ? r.itemIds.filter((v): v is string => typeof v === "string") : [];
    return {
      ...base,
      itemIds,
      documentNumber: sanitizeShortText(r.documentNumber, "เลขที่"),
      issueDate: validateIsoDateOrEmpty(r.issueDate, "วันที่"),
      remark: sanitizeLongText(r.remark, "หมายเหตุ (Remark)"),
    };
  });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requireUser(req);
  const doc = await loadDeliveryOrderOrThrow(id);
  if (!canEditDeliveryOrder(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") {
    throw new HttpError(400, doc.status === "PendingApproval"
      ? "ใบส่งมอบสินค้านี้อยู่ระหว่างรออนุมัติ แก้ไขไม่ได้ — ถอนคำขออนุมัติก่อนหากต้องการแก้ไข"
      : "ใบส่งมอบสินค้านี้อนุมัติแล้ว (Final) ไม่สามารถแก้ไขได้ กรุณาใช้ แก้ไข (Rewrite) เพื่อสร้างฉบับแก้ไขใหม่");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<DeliveryOrderFields> = {};
  if ("installments" in body) {
    const sanitized = sanitizeInstallmentsUpdate(body.installments, doc.installments);
    const validItemIds = new Set(doc.items.map((it) => it.id));
    update.installments = sanitized.map((row) => ({ ...row, itemIds: row.itemIds.filter((itemId) => validItemIds.has(itemId)) }));
  }

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const deliveryOrders = await deliveryOrdersCollection();
  await deliveryOrders.updateOne({ _id: doc._id }, { $set: update });
  const updated = await deliveryOrders.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบใบส่งมอบสินค้า");
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Updated", `แก้ไขใบส่งมอบสินค้าของ Scope of Work ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  res.status(200).json({ deliveryOrder: toClient(updated) });
}

async function handleRefresh(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadDeliveryOrderOrThrow(id);
  if (!canEditDeliveryOrder(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (!roleHasPermission(ctx.role, "scopeOfWork:view")) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") {
    throw new HttpError(400, "ต้องเป็นฉบับร่างเท่านั้นจึงจะอัปเดตข้อมูลจาก Scope of Work ได้ (เอกสารที่รออนุมัติ/อนุมัติแล้วถูกล็อก)");
  }
  const scope = await loadScopeOrThrow(doc.scopeOfWorkId);

  const update: Partial<DeliveryOrderFields> = {
    scopeNumber: scope.scopeNumber,
    customerCompanyName: scope.customerSnapshot.companyName,
    customerAddress: scope.customerSnapshot.address,
    items: deriveItemsFromScope(scope),
    installments: deriveInstallmentsFromScope(scope, doc.installments),
    updatedAt: nowIso(),
    updatedBy: ctx.user.id,
  };
  const deliveryOrders = await deliveryOrdersCollection();
  await deliveryOrders.updateOne({ _id: doc._id }, { $set: update });
  const updated = await deliveryOrders.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบใบส่งมอบสินค้า");
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Refreshed", `อัปเดตข้อมูลใบส่งมอบสินค้าจาก Scope of Work ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  res.status(200).json({ deliveryOrder: toClient(updated) });
}

// ─── Approval workflow (added 2026-07-24, direct user request — same model as Scope of Work's,
// see scopeOfWorkHandler.ts's workflow block for the full state diagram and reasoning) ──────────

async function notifyDeliveryOrderApprovalEvent(
  recipientUserIds: string[],
  type: NotificationType,
  title: string,
  description: string,
  deliveryOrderId: string,
  scopeNumber: string,
): Promise<void> {
  const ids = [...new Set(recipientUserIds)].filter((uid) => uid !== "");
  if (ids.length === 0) return;
  const createdAt = nowIso();
  const notifications = await notificationsCollection();
  await notifications.insertMany(ids.map((recipientUserId) => ({
    recipientUserId, type, title, description,
    module: "Delivery Order",
    // Deep-links to the record on the standalone Delivery Order page — new Notification field
    // added for these types (src/lib/notifications.ts), checked first in App.tsx's onNavigate.
    relatedDeliveryOrderId: deliveryOrderId, relatedScopeNumber: scopeNumber,
    createdAt, read: false,
  })));
}

async function activeUserIdsWithPermission(permission: Parameters<typeof roleHasPermission>[1]): Promise<string[]> {
  const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
  const [activeUsers, roleList] = await Promise.all([
    users.find({ status: "active" }, { projection: { roleKey: 1 } }).toArray(),
    roles.find({}).toArray(),
  ]);
  return activeUsers
    .filter((u) => roleHasPermission(findRole(roleList, u.roleKey), permission))
    .map((u) => u._id.toString());
}

async function handleSubmitApproval(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadDeliveryOrderOrThrow(id);
  if (!canEditDeliveryOrder(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, "ส่งขออนุมัติได้เฉพาะฉบับร่างเท่านั้น");

  const deliveryOrders = await deliveryOrdersCollection();
  await deliveryOrders.updateOne({ _id: doc._id }, { $set: { status: "PendingApproval" as DeliveryOrderStatus, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await deliveryOrders.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบใบส่งมอบสินค้า");
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Submitted", `ส่งขออนุมัติใบส่งมอบสินค้า ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  await notifyDeliveryOrderApprovalEvent(
    await activeUserIdsWithPermission("deliveryOrder:finalize"),
    "delivery_order_submitted", "ใบส่งมอบสินค้ารออนุมัติ",
    `${ctx.user.fullName} ส่งใบส่งมอบสินค้า ${updated.scopeNumber} (${updated.customerCompanyName}) เพื่อขออนุมัติ`,
    id, updated.scopeNumber,
  );
  res.status(200).json({ deliveryOrder: toClient(updated) });
}

/** `/finalize` now means "อนุมัติ" — same route-name-preserving convention as Scope of Work's. */
async function handleFinalize(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "deliveryOrder:finalize");
  const doc = await loadDeliveryOrderOrThrow(id);
  if (doc.status === "Final") throw new HttpError(400, "ใบส่งมอบสินค้านี้อนุมัติแล้ว (Final)");
  if (doc.status !== "PendingApproval") throw new HttpError(400, "ต้องส่งขออนุมัติก่อน จึงจะอนุมัติได้");

  const deliveryOrders = await deliveryOrdersCollection();
  await deliveryOrders.updateOne({ _id: doc._id }, { $set: { status: "Final" as DeliveryOrderStatus, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await deliveryOrders.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบใบส่งมอบสินค้า");
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Approved", `อนุมัติใบส่งมอบสินค้า ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  await notifyDeliveryOrderApprovalEvent(
    updated.createdBy && updated.createdBy !== ctx.user.id ? [updated.createdBy] : [],
    "delivery_order_approved", "ใบส่งมอบสินค้าได้รับอนุมัติ",
    `${ctx.user.fullName} อนุมัติใบส่งมอบสินค้า ${updated.scopeNumber} แล้ว`,
    id, updated.scopeNumber,
  );
  res.status(200).json({ deliveryOrder: toClient(updated) });
}

async function handleRejectApproval(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "deliveryOrder:finalize");
  const doc = await loadDeliveryOrderOrThrow(id);
  if (doc.status !== "PendingApproval") throw new HttpError(400, "ปฏิเสธได้เฉพาะเอกสารที่รออนุมัติเท่านั้น");
  const comment = sanitizeLongText((req.body as { comment?: unknown } | undefined)?.comment, "เหตุผลการปฏิเสธ");
  if (!comment.trim()) throw new HttpError(400, "กรุณาระบุเหตุผลการปฏิเสธ");

  const deliveryOrders = await deliveryOrdersCollection();
  await deliveryOrders.updateOne({ _id: doc._id }, { $set: { status: "Draft" as DeliveryOrderStatus, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await deliveryOrders.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบใบส่งมอบสินค้า");
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Rejected", `ปฏิเสธการอนุมัติใบส่งมอบสินค้า ${updated.scopeNumber}: ${comment.trim()}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  await notifyDeliveryOrderApprovalEvent(
    updated.createdBy && updated.createdBy !== ctx.user.id ? [updated.createdBy] : [],
    "delivery_order_rejected", "ใบส่งมอบสินค้าถูกตีกลับ",
    `${ctx.user.fullName} ปฏิเสธการอนุมัติใบส่งมอบสินค้า ${updated.scopeNumber}: ${comment.trim()}`,
    id, updated.scopeNumber,
  );
  res.status(200).json({ deliveryOrder: toClient(updated) });
}

async function handleWithdrawApproval(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadDeliveryOrderOrThrow(id);
  if (!canEditDeliveryOrder(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "PendingApproval") throw new HttpError(400, "ถอนคำขอได้เฉพาะเอกสารที่รออนุมัติเท่านั้น");

  const deliveryOrders = await deliveryOrdersCollection();
  await deliveryOrders.updateOne({ _id: doc._id }, { $set: { status: "Draft" as DeliveryOrderStatus, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await deliveryOrders.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบใบส่งมอบสินค้า");
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Approval Withdrawn", `ถอนคำขออนุมัติใบส่งมอบสินค้า ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  res.status(200).json({ deliveryOrder: toClient(updated) });
}

/** Rewrite (added 2026-07-24) — the only way to change an approved (Final) Delivery Order: a
 * fresh Draft copy of the same record (items + installment state preserved, **installment ids
 * kept as-is** so "อัปเดตข้อมูลจาก Scope of Work" reconciliation-by-id still works on the copy),
 * new createdAt/createdBy, version 1. Deliberately only offered from Final — a Draft is still
 * editable directly and a copy would just be a confusing duplicate. The list/existence lookups
 * sort by `updatedAt` desc, so the rewrite becomes the record the Scope of Work's
 * "เปิดใบส่งมอบสินค้า" button opens. */
async function handleRewrite(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "deliveryOrder:create");
  if (!roleHasPermission(ctx.role, "deliveryOrder:view")) throw new HttpError(403, "Forbidden");
  const source = await loadDeliveryOrderOrThrow(id);
  if (source.status !== "Final") throw new HttpError(400, "สร้างฉบับแก้ไขได้เฉพาะเอกสารที่อนุมัติแล้ว (Final) เท่านั้น — ฉบับร่างแก้ไขได้โดยตรง");

  const now = nowIso();
  const { _id: _sourceId, ...rest } = source;
  const doc: DeliveryOrderFields = {
    ...rest,
    status: "Draft",
    version: 1,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
    isDeleted: false,
  };
  const deliveryOrders = await deliveryOrdersCollection();
  const result = await deliveryOrders.insertOne(doc);
  const created = await deliveryOrders.findOne({ _id: result.insertedId });
  if (!created) throw new HttpError(500, "สร้างฉบับแก้ไขไม่สำเร็จ");
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Rewritten", `สร้างฉบับแก้ไขของใบส่งมอบสินค้า ${created.scopeNumber} (จากฉบับอนุมัติแล้ว)`, {
    scopeNumber: created.scopeNumber, scopeOfWorkId: created.scopeOfWorkId,
  });
  res.status(200).json({ deliveryOrder: toClient(created) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "deliveryOrder:delete");
  const doc = await loadDeliveryOrderOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "deliveryOrder:finalize")) throw new HttpError(403, "Forbidden");

  const deliveryOrders = await deliveryOrdersCollection();
  await deliveryOrders.updateOne({ _id: doc._id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Deleted", `ลบใบส่งมอบสินค้าของ Scope of Work ${doc.scopeNumber}`, {
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

// A session-less capability-URL HTML view (`GET /:id/view?key=`, linked from the Scope of Work
// recipient email) briefly existed here on 2026-07-24 — removed the same day on direct user
// request ("เอาที่ติ๊กใบส่งมอบออกไปเลย เดี๋ยวแนบไฟล์เอา"): the preferred flow is printing the
// official FM-SL-05 form to PDF and attaching it via the Scope of Work's normal ไฟล์แนบ feature.
// A `shareKey` field may linger on delivery_orders documents that had a link minted during the
// feature's brief lifetime — harmless, nothing reads it. See CHANGELOG.md 2026-07-24.

export async function handleDeliveryOrder(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/delivery-orders");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "refresh") return handleRefresh(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "finalize") return handleFinalize(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "submit-approval") return handleSubmitApproval(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "reject") return handleRejectApproval(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "withdraw-approval") return handleWithdrawApproval(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "rewrite") return handleRewrite(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
