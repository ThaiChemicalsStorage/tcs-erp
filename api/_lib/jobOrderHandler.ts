import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { handleAttachmentUpload, handleAttachmentDelete, handleAttachmentDownload, type AttachmentConfig } from "./documentAttachments.js";
import type { DocumentAttachment } from "../../src/lib/documentAttachments.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  jobOrdersCollection, countersCollection, auditLogCollection,
  withStringId, type JobOrderFields, type CounterFields,
} from "./collections.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { loadPendingProjectItemsOrThrow, linkProjectItemsToSubDocument, markProjectItemsFulfilled, unlinkProjectItems, findProjectItemIdsByLink } from "./projectHandler.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { getRevisionRoot } from "../../src/lib/revisionDiff.js";
import { sanitizeNullableNumber } from "./projectValidation.js";
import { buildJobOrderChecklistGroups, withJobOrderChecklistGroups } from "../../src/lib/jobOrder.js";
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
    // บรรทัดว่างถูกตัดทิ้ง เหมือน ProductionOrderLine.subDetails ที่มีเทสต์คุมพฤติกรรมนี้อยู่
    subDetails: (Array.isArray(r.subDetails) ? r.subDetails : [])
      .map((sd, i) => sanitizeShortText(sd, `รายละเอียดย่อยลำดับที่ ${idx + 1}.${i + 1}`))
      .filter(Boolean),
    quantity: sanitizeNullableNumber(r.quantity, `จำนวนลำดับที่ ${idx + 1}`),
    unit: sanitizeShortText(r.unit, `หน่วยลำดับที่ ${idx + 1}`),
    remark: sanitizeLongText(r.remark, `หมายเหตุลำดับที่ ${idx + 1}`),
  }));
}

/** Only recognizes group/option `key`s the server itself generated (via
 * `buildJobOrderChecklistGroups()`) and only ever toggles `checked`/`value` — same
 * "a client can toggle state but never inject new structure" rule Scope of Work's own
 * `sanitizeChecklistGroups()` enforces. */
function sanitizeChecklist(raw: unknown, currentRaw: ChecklistGroup[]): ChecklistGroup[] {
  // เทียบกับโครงสร้างที่จัดกลุ่มแล้ว ไม่ใช่ค่าดิบในฐานข้อมูล — ไม่งั้นเอกสารเก่า (กลุ่มเดียว) จะถูก
  // ปฏิเสธด้วย "กลุ่มเช็คลิสต์ไม่ถูกต้อง" ทันทีที่หน้าจอส่งหัวข้อใหม่กลับมา
  const current = withJobOrderChecklistGroups(currentRaw);
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
      // บรรทัดย่อย — ตัดบรรทัดว่างทิ้ง และเก็บเฉพาะตอนที่ตัวเลือกถูกติ๊ก (ปลดติ๊กแล้วรายละเอียดหายไปด้วย
      // โดยตั้งใจ ไม่งั้นใบพิมพ์จะมีรายละเอียดของงานที่ไม่ได้อยู่ในขอบเขต)
      const details = checked
        ? (Array.isArray(r.details) ? r.details : [])
            .map((d, i) => sanitizeShortText(d, `รายละเอียดย่อย (${baseOpt.label}) ลำดับที่ ${i + 1}`))
            .filter(Boolean)
        : [];
      if (baseOpt.value === undefined) return { ...baseOpt, checked, details };
      return { ...baseOpt, checked, details, value: sanitizeShortText(r.value, `รายละเอียด (${baseOpt.label})`) };
    });
    return { ...base, options };
  });
}

function toClient(doc: JobOrderFields & { _id: string }) {
  // จัดเช็คลิสต์เข้าหัวข้อปัจจุบันทุกครั้งที่อ่าน — ใบที่บันทึกไว้ตอนยังเป็นกลุ่มเดียว 23 ข้อจะถูกกระจาย
  // เข้าหัวข้อใหม่โดยค่าที่ติ๊กไว้ไม่หาย ดู withJobOrderChecklistGroups() ใน src/lib/jobOrder.ts
  return withStringId(withApprovalDefaults({ ...doc, scopeChecklist: withJobOrderChecklistGroups(doc.scopeChecklist), attachments: doc.attachments ?? [], revisionNote: doc.revisionNote ?? "" }));
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
  /**
   * รับได้ทั้ง `itemIds` (หลายรายการ — ฝ่ายโครงการขอไว้ 2026-08-27 "ติ๊กเลือกได้ว่าจะเอาตัวไหน")
   * และ `itemId` เดี่ยวแบบเดิม เพื่อไม่ให้ผู้เรียกเก่าพัง ตัวซ้ำถูกยุบทิ้งเพราะการผูกซ้ำไม่มีความหมาย
   */
  const itemIds = [...new Set(
    Array.isArray(body.itemIds)
      ? (body.itemIds as unknown[]).filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
      : typeof body.itemId === "string" && body.itemId.trim() ? [body.itemId.trim()] : [],
  )];
  if (!projectId || itemIds.length === 0) throw new HttpError(400, "กรุณาระบุโครงการและรายการ");

  const { project, items } = await loadPendingProjectItemsOrThrow(projectId, itemIds);

  const counters = await countersCollection();
  const id = await nextJobOrderId(counters);
  const now = nowIso();
  const doc: JobOrderFields = {
    projectId, scopeOfWorkId: project.scopeOfWorkId, jobCode: project.scopeNumber,
    customerName: project.customerCompanyName,
    // "จากหน่วยงาน" เติมจากแผนกของคนสร้าง (ฝ่ายโครงการขอไว้ 2026-08-27) — แก้ทับทีหลังได้
    // User.department เก็บเป็น"ชื่อ"แผนก ไม่ใช่ id — คนที่แผนกยังเป็นค่าเก่าที่ไม่มีในตารางจะได้ช่องว่าง
    // (เป็นปัญหาข้อมูล ไม่ใช่โค้ด — ดู TODO.md เรื่อแผนกของพนักงานที่ยังไม่ตรงกับตาราง departments)
    fromSite: (ctx.user.department ?? "").trim(), toSite: "", startDate: "", finishDate: "",
    // คัดลอกรายการที่ติ๊กมาเป็นรายการดำเนินงานให้เลย — เดิมเริ่มจากตารางว่างและต้องพิมพ์เองทั้งหมด
    // สเปกของแต่ละรายการลงไปเป็นบรรทัดย่อย จะได้ไม่หายไประหว่างทาง
    lines: items.map((it) => ({
      id: newId("joline"),
      description: it.name,
      subDetails: (it.specifications ?? []).map((sp) => sp.trim()).filter(Boolean),
      quantity: it.quantity,
      unit: it.unit,
      remark: "",
    })),
    scopeChecklist: buildJobOrderChecklistGroups(), outOfScope: "",
    attachments: [],
    revisionNote: "",
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
  await linkProjectItemsToSubDocument(projectId, itemIds, "jobOrder", "jobOrderId", id);

  await writeAuditEntry(ctx, "Job Order Created", `สร้างใบสั่งงาน ${id} สำหรับ ${items.length} รายการ: ${items.map((it) => `"${it.name}"`).join(", ")}`, { scopeOfWorkId: project.scopeOfWorkId });
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
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  // ล็อกทั้ง Final และ PendingApproval — ระหว่างรออนุมัติต้องแก้ไม่ได้ ไม่งั้นผู้อนุมัติจะกดอนุมัติ
  // เนื้อหาที่ต่างจากตอนที่ตรวจ (Scope of Work ล็อกสองสถานะนี้เหมือนกัน ดู scopeOfWorkHandler.ts)
  if (doc.status !== "Draft") {
    throw new HttpError(400, doc.status === "Final"
      ? "เอกสารนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้"
      : "เอกสารนี้กำลังรออนุมัติ ต้องถอนการขออนุมัติก่อนจึงจะแก้ไขได้");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<JobOrderFields> = {};
  if ("lines" in body) update.lines = sanitizeLines(body.lines);
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  if ("scopeChecklist" in body) update.scopeChecklist = sanitizeChecklist(body.scopeChecklist, doc.scopeChecklist);
  if ("outOfScope" in body) update.outOfScope = sanitizeLongText(body.outOfScope, "รายละเอียดอื่นๆ (Out of Scope)");
  for (const f of SHORT_TEXT_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = sanitizeShortText(body[f.key], f.label);
  for (const f of DATE_FIELDS) if (f.key in body) (update as Record<string, unknown>)[f.key] = validateIsoDateOrEmpty(body[f.key], f.label);

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const jobOrders = await jobOrdersCollection();
  await jobOrders.updateOne({ _id: id }, { $set: update });
  const updated = await loadOrThrow(id);
  // การบันทึกอัตโนมัติไม่เขียน audit log — ไม่งั้นการพิมพ์งานครั้งเดียวจะสร้างรายการซ้ำนับสิบรายการ
  // An auto-save writes no audit entry (see `isAutoSaveRequest()` in api/_lib/http.ts). The write
  // itself passed the exact same permission, Draft-status and validation checks as a manual Save.
  if (!autoSave) {
    await writeAuditEntry(ctx, "Job Order Updated", `แก้ไขใบสั่งงาน ${id}`, { scopeOfWorkId: updated.scopeOfWorkId });
  }
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
    // ปิดงานให้ **ทุก** รายการที่ผูกกับใบนี้ — ใบเดียวครอบคลุมได้หลายรายการตั้งแต่ 2026-08-27
    const itemIds = await findProjectItemIdsByLink(doc.projectId, "jobOrderId", doc._id);
    await markProjectItemsFulfilled(doc.projectId, itemIds);
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

/** ตัวนับเลขฉบับแก้ไขต่อสายเอกสาร — idiom เดียวกับเอกสารใบอื่นในระบบ */
async function nextJobOrderRevision(counters: Collection<CounterFields>, root: string): Promise<number> {
  const result = await counters.findOneAndUpdate(
    { _id: `job_order_revision_${root}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return result?.seq ?? 1;
}

/**
 * Rewrite ใบสั่งงาน (2026-08-27) — `_id` คือเลขที่เอกสาร จึงต่อท้ายด้วย `-R{n}`
 *
 * ⚠️ **ต่างจากใบเบิกและใบขอซื้อตรงที่ใบสั่งงานผูกได้ "หลายรายการ"** จึงต้องย้ายลิงก์ให้ครบทุกตัวด้วย
 * ตัวช่วยพหูพจน์ ถ้าเผลอใช้ตัวเอกพจน์จะย้ายให้แค่รายการแรก ที่เหลือค้างชี้ฉบับเก่าอยู่เงียบ ๆ
 *
 * **ไฟล์แนบไม่สืบทอด** — สำเนาจะชี้ไฟล์ก้อนเดียวกันกับฉบับเดิม พอลบจากฉบับหนึ่งอีกฉบับจะลิงก์เสีย
 * เป็นเหตุผลเดียวกับที่ Scope of Work ไม่สืบทอดไฟล์แนบตอน Rewrite (ดู scopeOfWorkHandler.ts)
 *
 * เช็คลิสต์ขอบเขตงานสืบทอดมาทั้งหมด เพราะเป็นเนื้อหาของเอกสาร ไม่ใช่ข้อมูลการดำเนินงาน
 */
async function handleRewrite(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "jobOrder:create");
  const source = await loadOrThrow(id);
  // ด่านรายเอกสารเหมือนทุก route ที่แก้ข้อมูลในโมดูลนี้ — `:create` อย่างเดียวไม่พอ
  if (!canEdit(ctx, source)) throw new HttpError(403, "Forbidden");

  const [jobOrders, counters] = await Promise.all([jobOrdersCollection(), countersCollection()]);
  const root = getRevisionRoot(source._id);
  const now = nowIso();

  let created: (JobOrderFields & { _id: string }) | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const seq = await nextJobOrderRevision(counters, root);
    const { _id: _drop, ...rest } = source;
    const doc: JobOrderFields & { _id: string } = {
      ...rest,
      _id: `${root}-R${seq}`,
      lines: source.lines.map((l) => ({ ...l, id: newId("joline"), subDetails: [...(l.subDetails ?? [])] })),
      attachments: [],
      status: "Draft",
      requestedBy: ctx.user.fullName, requestedAt: now.slice(0, 10),
      approvedBy: "", approvedAt: "",
      documentRecipientBy: "", documentRecipientAt: "",
      approvedByUserId: "",
      rejectionComment: "",
      revisionNote: "",
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
    };
    try {
      await jobOrders.insertOne(doc);
      created = doc;
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: number }).code === 11000) { lastErr = err; continue; }
      throw err;
    }
  }
  if (!created) {
    console.error("[job-orders] exhausted retries reserving a unique revision number", lastErr);
    throw new HttpError(409, "ไม่สามารถสร้างเลขที่ฉบับแก้ไขที่ไม่ซ้ำกันได้ กรุณาลองใหม่อีกครั้ง");
  }

  // ย้ายลิงก์ **ทุกรายการ** ที่ผูกกับใบเดิมมาชี้ฉบับใหม่
  if (source.projectId) {
    const itemIds = await findProjectItemIdsByLink(source.projectId, "jobOrderId", source._id);
    if (itemIds.length > 0) {
      await linkProjectItemsToSubDocument(source.projectId, itemIds, "jobOrder", "jobOrderId", created._id);
    }
  }

  await writeAuditEntry(ctx, "Job Order Rewritten", `สร้างใบสั่งงานฉบับแก้ไข ${created._id} จาก ${source._id}`, { scopeOfWorkId: source.scopeOfWorkId });
  res.status(201).json({ jobOrder: toClient(created) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "jobOrder:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "jobOrder:finalize")) throw new HttpError(403, "Forbidden");

  const jobOrders = await jobOrdersCollection();
  await jobOrders.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  // คืนสถานะให้ทุกรายการที่ผูกไว้ ไม่ใช่แค่ตัวแรก ไม่งั้นรายการที่เหลือจะค้างเป็น "สร้างเอกสารแล้ว" ตลอดไป
  const itemIds = await findProjectItemIdsByLink(doc.projectId, "jobOrderId", id);
  await unlinkProjectItems(doc.projectId, itemIds, "jobOrderId");
  await writeAuditEntry(ctx, "Job Order Deleted", `ลบใบสั่งงาน ${id}`, { scopeOfWorkId: doc.scopeOfWorkId });
  res.status(200).json({ ok: true });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

const attachmentConfig: AttachmentConfig<JobOrderFields & { _id: string }> = {
  label: "ใบสั่งงาน",
  docType: "job-orders",
  load: loadOrThrow,
  canEdit,
  collection: async () => (await jobOrdersCollection()) as unknown as Collection<never>,
  idOf: (doc) => doc._id,
  currentAttachments: (doc) => (doc.attachments ?? []) as DocumentAttachment[],
  writeAudit: (ctx, action, detail, doc) => writeAuditEntry(ctx, action, detail, { scopeOfWorkId: doc.scopeOfWorkId }),
  respond: async (res, id) => { res.status(200).json({ jobOrder: toClient(await loadOrThrow(id)) }); },
};

export async function handleJobOrder(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/job-orders");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  // finalize เป็น alias ของ approve — แต่ "ไม่" เข้ากันได้ย้อนหลังจริง: ผู้เรียกเดิมยิงตอนเอกสารยัง
  // เป็นร่าง ซึ่งตอนนี้จะได้ 400 (ต้องส่งขออนุมัติก่อน) เก็บชื่อเดิมไว้เพื่อไม่ให้ URL หาย ไม่ใช่เพื่อ
  // รักษาพฤติกรรมเดิม — พฤติกรรมเปลี่ยนโดยตั้งใจ
  if (parts.length === 2 && (parts[1] === "approve" || parts[1] === "finalize")) return handleApprove(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "submit-approval") return handleSubmitApproval(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "reject") return handleReject(req, res, parts[0], approvalConfig);
    if (parts.length === 2 && parts[1] === "withdraw-approval") return handleWithdrawApproval(req, res, parts[0], approvalConfig);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "rewrite") return handleRewrite(req, res, parts[0]);
  // ไฟล์แนบ — ตัวดาวน์โหลดตั้งใจให้เปิดได้โดยไม่ต้องล็อกอิน คุมด้วย capability key ใน URL แทน
  // ดู api/_lib/documentAttachments.ts — route นี้จึงต้องมาก่อนด่าน requireUser ของ handler อื่น
  if (parts.length === 4 && parts[1] === "attachments" && parts[3] === "download") {
    return handleAttachmentDownload(req, res, "job-orders", parts[0], parts[2]);
  }
  if (parts.length === 2 && parts[1] === "attachments") return handleAttachmentUpload(req, res, parts[0], attachmentConfig);
  if (parts.length === 3 && parts[1] === "attachments") return handleAttachmentDelete(req, res, parts[0], parts[2], attachmentConfig);
  throw new HttpError(404, "Not found");
}
