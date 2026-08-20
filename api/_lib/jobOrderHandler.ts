import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  jobOrdersCollection, countersCollection, auditLogCollection,
  withStringId, type JobOrderFields, type CounterFields,
} from "./collections.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { loadPendingProjectItemOrThrow, linkProjectItemToSubDocument, markProjectItemFulfilled, unlinkProjectItem, findProjectItemIdByLink } from "./projectHandler.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import { buildJobOrderChecklistGroups } from "../../src/lib/jobOrder.js";
import type { JobOrderLine, JobOrderSummary, ChecklistGroup } from "../../src/lib/jobOrder.js";

/**
 * Job Order API (added 2026-08-18, Stage 3) — mounted from `api/handlers/quotes.ts` alongside
 * Project/Material Requisition/Purchase Request. See src/lib/jobOrder.ts for the full domain-shape
 * doc comment and the FM-PJ-01 PDF-to-field mapping.
 */

const MAX_LINES = 100;

async function nextJobOrderId(counters: Collection<CounterFields>): Promise<string> {
  const buddhistYear = new Date().getFullYear() + 543;
  const counterId = `job_order_${buddhistYear}`;
  const result = await counters.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
  const seq = result?.seq ?? 1;
  return `JO-${buddhistYear}-${String(seq).padStart(4, "0")}`;
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string, related: { scopeOfWorkId?: string }): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบสั่งงาน", action, details, createdAt: nowIso(),
    ...(related.scopeOfWorkId ? { relatedScopeId: related.scopeOfWorkId } : {}),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "jobOrder:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "jobOrder:finalize");
}

/** Free-typed (not catalog-referenced, unlike Material Requisition's lines) — fabrication work
 * varies per job, so there's no product master to resolve against. */
function sanitizeLines(raw: unknown): JobOrderLine[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลรายการดำเนินงานไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `จำนวนรายการต้องไม่เกิน ${MAX_LINES} รายการ`);
  return (raw as Record<string, unknown>[]).map((r, idx) => ({
    id: typeof r.id === "string" && r.id ? r.id : newId("joline"),
    description: sanitizeShortText(r.description, `รายละเอียดลำดับที่ ${idx + 1}`),
    quantity: sanitizeNullableNumber(r.quantity, `จำนวนลำดับที่ ${idx + 1}`),
    unit: sanitizeShortText(r.unit, `หน่วยลำดับที่ ${idx + 1}`),
    remark: sanitizeLongText(r.remark, `หมายเหตุลำดับที่ ${idx + 1}`),
  }));
}

/** Only recognizes group/option `key`s the server itself generated (via
 * `buildJobOrderChecklistGroups()`) and only ever toggles `checked`/`value` — same
 * "a client can toggle state but never inject new structure" rule Scope of Work's own
 * `sanitizeChecklistGroups()` enforces. */
function sanitizeChecklist(raw: unknown, current: ChecklistGroup[]): ChecklistGroup[] {
  if (raw === undefined) return current;
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลขอบเขตงานไม่ถูกต้อง");
  const currentByKey = new Map(current.map((g) => [g.key, g]));
  return (raw as Record<string, unknown>[]).map((g) => {
    const key = typeof g.key === "string" ? g.key : "";
    const base = currentByKey.get(key);
    if (!base) throw new HttpError(400, "กลุ่มเช็คลิสต์ไม่ถูกต้อง");
    const rawOptions = Array.isArray(g.options) ? (g.options as Record<string, unknown>[]) : [];
    const optionByKey = new Map(rawOptions.map((o) => [typeof o.key === "string" ? o.key : "", o]));
    const options = base.options.map((baseOpt) => {
      const r = optionByKey.get(baseOpt.key);
      if (!r) return baseOpt;
      const checked = typeof r.checked === "boolean" ? r.checked : baseOpt.checked;
      if (baseOpt.value === undefined) return { ...baseOpt, checked };
      return { ...baseOpt, checked, value: sanitizeShortText(r.value, `รายละเอียด (${baseOpt.label})`) };
    });
    return { ...base, options };
  });
}

function toClient(doc: JobOrderFields & { _id: string }) {
  return withStringId(withApprovalDefaults(doc));
}
function toSummary(doc: JobOrderFields & { _id: string }): JobOrderSummary {
  const full = withStringId(doc);
  return { id: full.id, projectId: full.projectId, scopeOfWorkId: full.scopeOfWorkId, jobCode: full.jobCode, status: full.status, updatedAt: full.updatedAt };
}

async function loadOrThrow(id: string) {
  const jobOrders = await jobOrdersCollection();
  const doc = await jobOrders.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบใบสั่งงาน");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "jobOrder:view");
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";

  // Omitting projectId switches to "list every Job Order company-wide" — same Stage 4/5 addition
  // materialRequisitionHandler.ts got, needed for Job Order's own standalone list page (Stage 5).
  const ownershipMatch = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "jobOrder:viewAll"), "createdBy");
  const jobOrders = await jobOrdersCollection();
  const filter = projectId ? { projectId, isDeleted: false, ...ownershipMatch } : { isDeleted: false, ...ownershipMatch };
  const docs = await jobOrders.find(filter).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ jobOrders: docs.map(toSummary) });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "jobOrder:create");
  if (!roleHasPermission(ctx.role, "project:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  if (!projectId || !itemId) throw new HttpError(400, "กรุณาระบุโครงการและรายการ");

  const { project, item } = await loadPendingProjectItemOrThrow(projectId, itemId);

  const counters = await countersCollection();
  const id = await nextJobOrderId(counters);
  const now = nowIso();
  const doc: JobOrderFields = {
    projectId, scopeOfWorkId: project.scopeOfWorkId, jobCode: project.scopeNumber,
    customerName: project.customerCompanyName,
    fromSite: "", toSite: "", startDate: "", finishDate: "",
    lines: [], scopeChecklist: buildJobOrderChecklistGroups(), outOfScope: "",
    status: "Draft",
    // requestedAt seeds from a date-only slice of `now`, not the full ISO timestamp — this field
    // round-trips through handleUpdate()'s validateIsoDateOrEmpty() on every save, which requires
    // strict YYYY-MM-DD (same precedent as Scope of Work's own issueDate/approver.date). Seeding
    // the full timestamp here made every single save after creation fail with 400 (found 2026-08-18
    // during the Stage 6 live-browser walkthrough — see CHANGELOG).
    requestedBy: ctx.user.fullName, requestedAt: now.slice(0, 10),
    approvedBy: "", approvedAt: "",
    documentRecipientBy: "", documentRecipientAt: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };
  const jobOrders = await jobOrdersCollection();
  await jobOrders.insertOne({ ...doc, _id: id });

  // CRITICAL invariant — see materialRequisitionHandler.ts's identical comment on this same step.
  await linkProjectItemToSubDocument(projectId, itemId, "jobOrder", "jobOrderId", id);

  await writeAuditEntry(ctx, "Job Order Created", `สร้างใบสั่งงาน ${id} สำหรับรายการ "${item.name}"`, { scopeOfWorkId: project.scopeOfWorkId });
  res.status(201).json({ jobOrder: toClient({ ...doc, _id: id }) });
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "jobOrder:view");
  const doc = await loadOrThrow(id);
  res.status(200).json({ jobOrder: toClient(doc) });
}

const SHORT_TEXT_FIELDS: { key: keyof JobOrderFields; label: string }[] = [
  { key: "customerName", label: "ชื่อลูกค้า" },
  { key: "fromSite", label: "จากหน่วยงาน" },
  { key: "toSite", label: "ถึงหน่วยงาน" },
  { key: "requestedBy", label: "ผู้ร้องขอ" },
  { key: "approvedBy", label: "ผู้อนุมัติ" },
  { key: "documentRecipientBy", label: "ผู้รับเอกสาร" },
];
const DATE_FIELDS: { key: keyof JobOrderFields; label: string }[] = [
  { key: "startDate", label: "วันเริ่มดำเนินการ" },
  { key: "finishDate", label: "วันดำเนินการแล้วเสร็จ" },
  { key: "requestedAt", label: "วันที่ร้องขอ" },
  { key: "approvedAt", label: "วันที่อนุมัติ" },
  { key: "documentRecipientAt", label: "วันที่รับเอกสาร" },
];

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status === "Final") throw new HttpError(400, "เอกสารนี้อนุมัติแล้ว (Final) ไม่สามารถแก้ไขได้");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<JobOrderFields> = {};
  if ("lines" in body) update.lines = sanitizeLines(body.lines);
  if ("scopeChecklist" in body) update.scopeChecklist = sanitizeChecklist(body.scopeChecklist, doc.scopeChecklist);
  if ("outOfScope" in body) update.outOfScope = sanitizeLongText(body.outOfScope, "รายละเอียดอื่นๆ (Out of Scope)");
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const jobOrders = await jobOrdersCollection();
  await jobOrders.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Job Order Updated", `แก้ไขใบสั่งงาน ${id}`, { scopeOfWorkId: updated.scopeOfWorkId });
  res.status(200).json({ jobOrder: toClient(updated) });
}

/**
 * ขั้นตอนอนุมัติ (ร่าง → รออนุมัติ → อนุมัติ) เพิ่ม 2026-08-20 — ใช้ helper ร่วมใน documentApproval.ts
 * ที่ทำตามกลไกของ Scope of Work ทุกประการ ตามที่เจ้าของสั่ง ("เหมือน Scope of Work เป๊ะ")
 *
 * `finalize` เดิมที่กระโดดจากร่างไป Final ตรงๆ ถูกแทนที่ด้วย `approve` ซึ่งบังคับให้ผ่าน
 * PendingApproval ก่อน — route ชื่อเดิมยังคงไว้เป็น alias เพื่อไม่ให้ของเดิมที่เรียกอยู่พัง
 */
const approvalConfig: ApprovalConfig<JobOrderFields & { _id: string }> = {
  label: "ใบสั่งงาน",
  approvePermission: "jobOrder:finalize",
  collection: async () => (await jobOrdersCollection()) as unknown as Collection<JobOrderFields & { _id: string }>,
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail, doc) => writeAuditEntry(ctx, action, detail, { scopeOfWorkId: doc.scopeOfWorkId }),
  // อนุมัติแล้วถือว่ารายการใน Project ต้นทางถูกจัดหาเรียบร้อย (เดิมทำตอน finalize)
  onApproved: async (_ctx, doc) => {
    const itemId = await findProjectItemIdByLink(doc.projectId, "jobOrderId", doc._id);
    if (itemId) await markProjectItemFulfilled(doc.projectId, itemId);
  },
  respond: (res, doc) => res.status(200).json({ jobOrder: toClient(doc) }),
};

async function handlePrint(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "jobOrder:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Job Order Printed", `พิมพ์ใบสั่งงาน ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "jobOrder:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "jobOrder:finalize")) throw new HttpError(403, "Forbidden");

  const jobOrders = await jobOrdersCollection();
  await jobOrders.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const itemId = await findProjectItemIdByLink(doc.projectId, "jobOrderId", id);
  if (itemId) await unlinkProjectItem(doc.projectId, itemId, "jobOrderId");
  await writeAuditEntry(ctx, "Job Order Deleted", `ลบใบสั่งงาน ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleJobOrder(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/job-orders");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  // finalize คงไว้เป็น alias ของ approve เพื่อความเข้ากันได้ย้อนหลัง
  if (parts.length === 2 && (parts[1] === "approve" || parts[1] === "finalize")) return handleApprove(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "submit-approval") return handleSubmitApproval(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "reject") return handleReject(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "withdraw-approval") return handleWithdrawApproval(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
