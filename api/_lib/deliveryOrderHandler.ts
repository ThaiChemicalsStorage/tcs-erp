import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WithId } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import {
  deliveryOrdersCollection, scopeOfWorksCollection, auditLogCollection,
  toObjectId, withStringId, type DeliveryOrderFields, type ScopeOfWorkFields,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
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
    const ownershipMatch = roleHasPermission(ctx.role, "deliveryOrder:viewAll")
      ? {}
      : { $or: [{ createdBy: ctx.user.id }, { createdBy: "" }] };
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
  if (doc.status === "Final") {
    throw new HttpError(400, "ใบส่งมอบสินค้านี้เป็นสถานะ Final แล้ว ไม่สามารถแก้ไขได้");
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
  if (doc.status === "Final") {
    throw new HttpError(400, "ใบส่งมอบสินค้านี้เป็นสถานะ Final แล้ว ไม่สามารถแก้ไขได้");
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

async function handleFinalize(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "deliveryOrder:finalize");
  const doc = await loadDeliveryOrderOrThrow(id);
  if (doc.status === "Final") throw new HttpError(400, "ใบส่งมอบสินค้านี้เป็นสถานะ Final อยู่แล้ว");

  const deliveryOrders = await deliveryOrdersCollection();
  const now = nowIso();
  await deliveryOrders.updateOne({ _id: doc._id }, { $set: { status: "Final" as DeliveryOrderStatus, updatedAt: now, updatedBy: ctx.user.id } });
  const updated = await deliveryOrders.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบใบส่งมอบสินค้า");
  await writeDeliveryOrderAuditEntry(ctx, "Delivery Order Finalized", `ยืนยันสถานะ Final ของใบส่งมอบสินค้า ${updated.scopeNumber}`, {
    scopeNumber: updated.scopeNumber, scopeOfWorkId: updated.scopeOfWorkId,
  });
  res.status(200).json({ deliveryOrder: toClient(updated) });
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

// ─── Session-less share view (2026-07-24) ───────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/**
 * `GET /api/delivery-orders/:id/view?key=...` — a read-only HTML rendering of the Delivery Order,
 * linked from the Scope of Work document-recipient email when the sender ticks "แนบใบส่งมอบสินค้า"
 * (added 2026-07-24, direct user request). Deliberately NO session auth — same capability-URL
 * pattern (random `shareKey`, minted by scopeOfWorkHandler's send route on first use, opaque 404
 * on mismatch) as attachment downloads, because email recipients open this from a mail client
 * with no app session. This is a *viewing convenience* rendered server-side from the live record
 * (always current, one section per non-deposit installment); the official printable FM-SL-05
 * form remains the in-app print flow (`DeliveryOrderPrintDocument.tsx`) — this page doesn't try
 * to replicate it pixel-for-pixel. Every interpolated value is user-entered data → escaped.
 */
async function handleShareView(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const key = typeof req.query.key === "string" ? req.query.key : "";
  let doc: WithId<DeliveryOrderFields> | null;
  try {
    const deliveryOrders = await deliveryOrdersCollection();
    doc = await deliveryOrders.findOne({ _id: toObjectId(id) });
  } catch {
    doc = null;
  }
  // Opaque 404 on every failure mode (bad id, deleted, no key minted yet, wrong key) — never
  // reveal which part failed to an unauthenticated caller.
  const shareKey = doc && typeof doc.shareKey === "string" ? doc.shareKey : "";
  if (!doc || doc.isDeleted || !shareKey || key !== shareKey) throw new HttpError(404, "Not found");

  const itemById = new Map(doc.items.map((it) => [it.id, it]));
  const sections = stripDepositInstallments(doc.installments).map((inst, idx) => {
    const items = inst.itemIds.map((iid) => itemById.get(iid)).filter((it): it is DeliveryOrderItem => !!it);
    const rows = items.length > 0
      ? items.map((it, i) => `
          <tr>
            <td style="border:1px solid #444;padding:6px 10px;text-align:center;vertical-align:top;">${i + 1}</td>
            <td style="border:1px solid #444;padding:6px 10px;vertical-align:top;">${escapeHtml(it.name)}${it.specifications.length > 0 ? `<div style="color:#555;font-size:12px;margin-top:2px;">${it.specifications.map((s) => escapeHtml(s.text)).join("<br>")}</div>` : ""}</td>
            <td style="border:1px solid #444;padding:6px 10px;text-align:center;vertical-align:top;">${it.quantity ?? "-"}</td>
            <td style="border:1px solid #444;padding:6px 10px;text-align:center;vertical-align:top;">${escapeHtml(it.unit)}</td>
          </tr>`).join("")
      : `<tr><td colspan="4" style="border:1px solid #444;padding:10px;text-align:center;color:#777;">ยังไม่ได้เลือกรายการสินค้าสำหรับงวดนี้</td></tr>`;
    return `
      <div style="margin-top:${idx > 0 ? "36px" : "0"};padding-top:${idx > 0 ? "28px" : "0"};${idx > 0 ? "border-top:2px dashed #bbb;" : ""}">
        <table style="width:100%;border-collapse:collapse;margin-bottom:10px;"><tr>
          <td style="font-size:13px;">งวดที่ ${idx + 1}: <strong>${escapeHtml(inst.remark || inst.label)}</strong></td>
          <td style="font-size:13px;text-align:right;white-space:nowrap;">เลขที่: <strong>${escapeHtml(inst.documentNumber || "-")}</strong>&nbsp;&nbsp;วันที่: <strong>${escapeHtml(inst.issueDate || "-")}</strong></td>
        </tr></table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#f0f0f0;">
            <th style="border:1px solid #444;padding:6px 10px;width:44px;">No.</th>
            <th style="border:1px solid #444;padding:6px 10px;">Description</th>
            <th style="border:1px solid #444;padding:6px 10px;width:70px;">Q'ty</th>
            <th style="border:1px solid #444;padding:6px 10px;width:70px;">Unit</th>
          </tr>
          ${rows}
        </table>
      </div>`;
  }).join("");

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>ใบส่งมอบสินค้าและบริการ ${escapeHtml(doc.scopeNumber)}</title></head>
    <body style="margin:0;background:#e9e9e9;font-family:'Times New Roman','Noto Serif Thai',serif;color:#111;">
      <div style="max-width:760px;margin:24px auto;background:#fff;padding:40px 48px;border:1px solid #ccc;">
        <p style="margin:0 0 2px;text-align:center;font-size:18px;font-weight:700;">ใบส่งมอบสินค้าและบริการ</p>
        <p style="margin:0 0 18px;text-align:center;font-size:13px;letter-spacing:1px;">DELIVERY ORDER &amp; SERVICE ORDER</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
          <tr><td style="width:110px;padding:2px 0;color:#555;">เอกสารอ้างอิง</td><td style="padding:2px 0;font-weight:600;">${escapeHtml(doc.scopeNumber)} <span style="font-weight:400;color:#777;">(${doc.status === "Final" ? "ฉบับสมบูรณ์" : "ฉบับร่าง"})</span></td></tr>
          <tr><td style="padding:2px 0;color:#555;vertical-align:top;">เรียน</td><td style="padding:2px 0;font-weight:600;">${escapeHtml(doc.customerCompanyName)}${doc.customerAddress ? `<div style="font-weight:400;color:#333;">${escapeHtml(doc.customerAddress)}</div>` : ""}</td></tr>
        </table>
        ${sections || `<p style="text-align:center;color:#777;font-size:13px;">ยังไม่มีงวดส่งมอบในเอกสารนี้</p>`}
        <p style="margin:28px 0 0;font-size:11px;color:#999;text-align:center;">เอกสารฉบับดูออนไลน์จากระบบ TCS ERP — ข้อมูลเป็นสถานะล่าสุด ณ เวลาที่เปิดดู ฉบับพิมพ์อย่างเป็นทางการออกจากระบบเท่านั้น</p>
      </div>
    </body></html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(html);
}

export async function handleDeliveryOrder(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/delivery-orders");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 2 && parts[1] === "view") return handleShareView(req, res, parts[0]);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "refresh") return handleRefresh(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "finalize") return handleFinalize(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
