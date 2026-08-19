import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  workHandoverNotesCollection, countersCollection, auditLogCollection,
  withStringId, type WorkHandoverFields, type CounterFields,
} from "./collections.js";
import { loadProjectOrThrow } from "./projectHandler.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import { validateImageDataUrl } from "./uploadValidation.js";
import type { WorkHandoverLine, WorkHandoverSummary } from "../../src/lib/workHandover.js";

/**
 * Work Handover Note API (added 2026-08-19) — mounted from `api/handlers/quotes.ts` alongside
 * Project/Material Requisition/Job Order/Purchase Request (same 12-function-slot sharing reasoning,
 * see that file). Generated from a Project directly (not a ProjectItem), so — unlike
 * materialRequisitionHandler.ts/jobOrderHandler.ts/purchaseRequestHandler.ts — there is no
 * loadPendingProjectItemOrThrow()/linkProjectItemToSubDocument() dance here; see
 * src/lib/workHandover.ts for the full domain-shape doc comment and the explicit
 * "no reference PDF, first-draft structure" caveat.
 */

const MAX_LINES = 100;

async function nextWorkHandoverId(counters: Collection<CounterFields>): Promise<string> {
  const buddhistYear = new Date().getFullYear() + 543;
  const counterId = `work_handover_${buddhistYear}`;
  const result = await counters.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
  const seq = result?.seq ?? 1;
  return `WH-${buddhistYear}-${String(seq).padStart(4, "0")}`;
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string, related: { scopeOfWorkId?: string }): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบส่งมอบงาน", action, details, createdAt: nowIso(),
    ...(related.scopeOfWorkId ? { relatedScopeId: related.scopeOfWorkId } : {}),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "workHandover:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "workHandover:sign");
}

/** Free-typed (not catalog-referenced) — same reasoning/shape as Job Order's own sanitizeLines(). */
function sanitizeLines(raw: unknown): WorkHandoverLine[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  return (raw as Record<string, unknown>[]).map((r, idx) => ({
    id: typeof r.id === "string" && r.id ? r.id : newId("whline"),
    description: sanitizeShortText(r.description, `รายละเอียดลำดับที่ ${idx + 1}`),
    quantity: sanitizeNullableNumber(r.quantity, `จำนวนลำดับที่ ${idx + 1}`),
    unit: sanitizeShortText(r.unit, `หน่วยลำดับที่ ${idx + 1}`),
    remark: sanitizeLongText(r.remark, `หมายเหตุลำดับที่ ${idx + 1}`),
  }));
}

function toClient(doc: WorkHandoverFields & { _id: string }) {
  return withStringId(doc);
}
function toSummary(doc: WorkHandoverFields & { _id: string }): WorkHandoverSummary {
  const full = withStringId(doc);
  return { id: full.id, projectId: full.projectId, scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode, isSigned: full.isSigned, updatedAt: full.updatedAt };
}

async function loadOrThrow(id: string) {
  const workHandovers = await workHandoverNotesCollection();
  const doc = await workHandovers.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบส่งมอบงาน");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "workHandover:view");
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";

  // Omitting projectId switches from "does a Work Handover Note already exist for this Project?"
  // (an existence check, deliberately unfiltered by :viewAll — same reasoning Project's own by-scope
  // lookup uses) to "list every Work Handover Note company-wide," scoped by :viewAll.
  const workHandovers = await workHandoverNotesCollection();
  if (!projectId) {
    const ownershipMatch = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "workHandover:viewAll"), "createdBy");
    const docs = await workHandovers.find({ isDeleted: false, ...ownershipMatch }).sort({ updatedAt: -1 }).toArray();
    res.status(200).json({ workHandovers: docs.map(toSummary) });
    return;
  }
  const docs = await workHandovers.find({ projectId, isDeleted: false }).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ workHandovers: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "workHandover:create");
  if (!roleHasPermission(ctx.role, "project:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId) throw new HttpError(400, "กรุณาระบุโครงการ");
  const project = await loadProjectOrThrow(projectId);

  const counters = await countersCollection();
  const id = await nextWorkHandoverId(counters);
  const now = nowIso();
  const doc: WorkHandoverFields = {
    projectId, scopeOfWorkId: project.scopeOfWorkId, jobCode: project.scopeNumber,
    documentCode: null,
    customerName: project.customerCompanyName,
    siteDescription: "", workCompletedDate: "",
    lines: [],
    preparedByName: ctx.user.fullName, preparedBySignatureDataUrl: "", preparedAt: now.slice(0, 10),
    customerSignedName: "", customerSignatureDataUrl: "", customerSignedAt: null,
    isSigned: false, signedAt: null,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  const workHandovers = await workHandoverNotesCollection();
  await workHandovers.insertOne({ ...doc, _id: id });

  await writeAuditEntry(ctx, "Work Handover Note Created", `สร้างใบส่งมอบงาน ${id} สำหรับโครงการ ${project.scopeNumber}`, { scopeOfWorkId: project.scopeOfWorkId });
  res.status(201).json({ workHandover: toClient({ ...doc, _id: id }) });
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "workHandover:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({ workHandover: toClient(doc) });
}

const SHORT_TEXT_FIELDS: { key: keyof WorkHandoverFields; label: string }[] = [
  { key: "customerName", label: "ชื่อลูกค้า" },
  { key: "siteDescription", label: "รายละเอียดงาน/สถานที่" },
  { key: "preparedByName", label: "ผู้จัดทำ" },
  { key: "customerSignedName", label: "ผู้ลงนามฝ่ายลูกค้า" },
];
const DATE_FIELDS: { key: keyof WorkHandoverFields; label: string }[] = [
  { key: "workCompletedDate", label: "วันที่งานแล้วเสร็จ" },
  { key: "preparedAt", label: "วันที่จัดทำ" },
];

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.isSigned) throw new HttpError(400, "เอกสารนี้ลูกค้าเซ็นรับงานแล้ว ไม่สามารถแก้ไขได้");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<WorkHandoverFields> = {};
  if ("lines" in body) update.lines = sanitizeLines(body.lines);
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);
  if ("preparedBySignatureDataUrl" in body) update.preparedBySignatureDataUrl = validateImageDataUrl(body.preparedBySignatureDataUrl, "ลายเซ็นผู้จัดทำ");
  if ("customerSignatureDataUrl" in body) update.customerSignatureDataUrl = validateImageDataUrl(body.customerSignatureDataUrl, "ลายเซ็นลูกค้า");
  if ("customerSignedAt" in body) update.customerSignedAt = validateIsoDateOrEmpty(body.customerSignedAt, "วันที่ลงนามลูกค้า") || null;

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const workHandovers = await workHandoverNotesCollection();
  await workHandovers.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Work Handover Note Updated", `แก้ไขใบส่งมอบงาน ${id}`, { scopeOfWorkId: updated.scopeOfWorkId });
  res.status(200).json({ workHandover: toClient(updated) });
}

/**
 * The meaningful state transition for this document — customer acceptance, not an internal
 * "finalize" approval (hence the `workHandover:sign` permission, not `:finalize`). Requires the
 * customer's signature to already be saved via handleUpdate() first — same "save draft, then act"
 * two-step flow every other Project-module document uses for its own state transition. Deliberately
 * does NOT touch any Scope of Work / billing status — see src/lib/workHandover.ts's file-level doc
 * comment and docs/MODULES/Project.md for why this stays a manual signal.
 */
async function handleSign(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "workHandover:sign");
  const doc = await loadOrThrow(id);
  if (doc.isSigned) throw new HttpError(400, "เอกสารนี้ลูกค้าเซ็นรับงานแล้ว");
  if (!doc.customerSignatureDataUrl) throw new HttpError(400, "กรุณาให้ลูกค้าเซ็นชื่อและบันทึกร่างก่อนยืนยัน");

  const now = nowIso();
  const workHandovers = await workHandoverNotesCollection();
  await workHandovers.updateOne({ _id: id }, { $set: {
    isSigned: true, signedAt: now,
    customerSignedAt: doc.customerSignedAt || now.slice(0, 10),
    updatedAt: now, updatedBy: ctx.user.id,
  } });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Work Handover Note Signed", `ยืนยันลูกค้าเซ็นรับงานใบส่งมอบงาน ${id}`, { scopeOfWorkId: updated.scopeOfWorkId });
  res.status(200).json({ workHandover: toClient(updated) });
}

async function handlePrint(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "workHandover:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Work Handover Note Printed", `พิมพ์ใบส่งมอบงาน ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "workHandover:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "workHandover:sign")) throw new HttpError(403, "Forbidden");

  const workHandovers = await workHandoverNotesCollection();
  await workHandovers.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Work Handover Note Deleted", `ลบใบส่งมอบงาน ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleWorkHandover(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/work-handovers");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "sign") return handleSign(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
