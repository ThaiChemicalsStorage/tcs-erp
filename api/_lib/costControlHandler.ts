import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection } from "mongodb";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  costControlsCollection, countersCollection, auditLogCollection, withStringId,
  type CostControlFields, type CounterFields,
} from "./collections.js";
import { handleSubmitApproval, handleApprove, handleReject, handleWithdrawApproval, withApprovalDefaults, type ApprovalConfig } from "./documentApproval.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso, newId } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty } from "./quoteValidation.js";
import { sanitizeNullableNumber, sanitizeEnum } from "./projectValidation.js";
import { getRevisionRoot } from "../../src/lib/revisionDiff.js";
import { costControlTotals, type CostControlLine, type CostControlLineKind, type CostControlSummary } from "../../src/lib/costControl.js";

/**
 * Cost Control (แผนก BD) API — added 2026-08-28. Mounted from `api/handlers/quotes.ts` alongside
 * every other document handler (the 12-function-slot constraint documented there).
 * See `src/lib/costControl.ts` for the domain shape and where it was transcribed from.
 *
 * **Created from an uploaded workbook, but the server never sees the file.** The browser parses the
 * spreadsheet (`src/lib/costControlImport.ts`), shows the person a preview they can correct, and
 * posts the corrected rows as ordinary JSON. That keeps the upload plumbing out of the API entirely
 * — no multipart, no base64, no body-size ceiling — and it means the rows this route receives have
 * already been looked at by a human, which the parser's own doc comment explains is not optional
 * for these files.
 */

const MAX_LINES = 400;
const LINE_KINDS: CostControlLineKind[] = ["group", "item", "sub"];

async function nextCostControlId(counters: Collection<CounterFields>): Promise<string> {
  const buddhistYear = new Date().getFullYear() + 543;
  const counterId = `cost_control_${buddhistYear}`;
  const result = await counters.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
  const seq = result?.seq ?? 1;
  return `CC-${buddhistYear}-${String(seq).padStart(4, "0")}`;
}

/**
 * `documentNumber` ต้องไม่ซ้ำ แต่ `ensureIndexes()` รันแค่ตอน Setup Wizard ครั้งเดียว ฐานข้อมูลที่
 * ติดตั้งไปแล้วจึงไม่มีวันได้ index นี้ — สร้างเองแบบ lazy ครั้งเดียวต่อ instance (แนวเดียวกับใบสั่งซื้อ)
 */
let numberIndexEnsured = false;
async function ensureCostControlNumberIndex(col: Collection<CostControlFields & { _id: string }>): Promise<void> {
  if (numberIndexEnsured) return;
  numberIndexEnsured = true;
  try {
    await col.updateMany(
      { $or: [{ documentNumber: { $exists: false } }, { documentNumber: "" }] },
      [{ $set: { documentNumber: "$_id" } }],
    );
    await col.createIndex({ documentNumber: 1 }, { unique: true });
  } catch (err) {
    console.error("[costControl] ensure documentNumber index failed", err);
  }
}

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "Cost Control", action, details, createdAt: nowIso(),
  });
}

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}
function canEdit(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "costControl:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "costControl:finalize");
}

/**
 * บรรทัดมาจากไฟล์ที่ผู้ใช้แกะและตรวจแล้วฝั่งเบราว์เซอร์ — ยังต้องล้างซ้ำฝั่งเซิร์ฟเวอร์ทุกครั้ง
 * `kind` ตรวจด้วย whitelist ไม่ใช่ sanitizeShortText เพราะเป็น union ที่โค้ดฝั่งอ่านพึ่งพา
 */
function sanitizeLines(raw: unknown): CostControlLine[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "รายการไม่ถูกต้อง");
  if (raw.length > MAX_LINES) throw new HttpError(400, `รายการเกิน ${MAX_LINES} บรรทัด`);

  return raw.map((entry, idx) => {
    const r = (entry ?? {}) as Record<string, unknown>;
    const kind = sanitizeEnum(r.kind, LINE_KINDS, `ชนิดบรรทัดลำดับที่ ${idx + 1}`) as CostControlLineKind;
    return {
      id: typeof r.id === "string" && r.id ? r.id : newId("ccline"),
      kind,
      seq: sanitizeShortText(r.seq, `ลำดับที่ของบรรทัดที่ ${idx + 1}`),
      description: sanitizeShortText(r.description, `รายละเอียดลำดับที่ ${idx + 1}`, kind !== "group" ? false : true),
      model: sanitizeShortText(r.model, `Model ลำดับที่ ${idx + 1}`),
      supplierName: sanitizeShortText(r.supplierName, `ผู้ขายลำดับที่ ${idx + 1}`),
      qty: sanitizeNullableNumber(r.qty, `จำนวนลำดับที่ ${idx + 1}`),
      unit: sanitizeShortText(r.unit, `หน่วยลำดับที่ ${idx + 1}`),
      unitCost: sanitizeNullableNumber(r.unitCost, `ต้นทุนลำดับที่ ${idx + 1}`),
    };
  });
}

function toClient(doc: CostControlFields & { _id: string }) {
  return withStringId(withApprovalDefaults({
    ...doc,
    documentNumber: doc.documentNumber || doc._id,
    lines: doc.lines ?? [],
    revisionNote: doc.revisionNote ?? "",
  }));
}

function toSummary(doc: CostControlFields & { _id: string }): CostControlSummary {
  const full = withStringId(doc);
  // ยอดรวมไม่ได้เก็บในฐานข้อมูล — คำนวณตอนส่งออกไป เหมือนที่หน้าเอกสารคำนวณเอง
  const { totalCost } = costControlTotals(full);
  return {
    id: full.id,
    documentNumber: full.documentNumber || full.id,
    jobName: full.jobName,
    jobOrder: full.jobOrder,
    workType: full.workType,
    docDate: full.docDate,
    status: full.status,
    totalCost,
    sellingPrice: full.sellingPrice,
    updatedAt: full.updatedAt,
  };
}

async function loadOrThrow(id: string) {
  const costControls = await costControlsCollection();
  const doc = await costControls.findOne({ _id: id });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบเอกสาร Cost Control");
  return doc;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "costControl:view");
  const ownership = buildSimpleOwnershipClause(ctx.user.id, roleHasPermission(ctx.role, "costControl:viewAll"), "createdBy");
  const costControls = await costControlsCollection();
  const docs = await costControls.find({ isDeleted: false, ...ownership }).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ costControls: docs.map(toSummary) });
}

/** ช่องบล็อกสรุป 1-5 — รับได้ตอนสร้างเพราะตัวแกะไฟล์อ่านมาจากท้ายชีตให้แล้ว */
const MARKUP_KEYS = [
  ["operatingCost", "ค่าดำเนินการ"], ["operatingPct", "% ค่าดำเนินการ"],
  ["bubbleCost", "Bubble cost"], ["bubblePct", "% Bubble cost"],
  ["entertainmentCost", "Entertainment + Commission"], ["sellingPrice", "ราคาขาย"],
] as const;

function markupsFromBody(body: Record<string, unknown>): Pick<CostControlFields,
  "operatingCost" | "operatingPct" | "bubbleCost" | "bubblePct" | "entertainmentCost" | "sellingPrice"> {
  const out = {
    operatingCost: null, operatingPct: null, bubbleCost: null,
    bubblePct: null, entertainmentCost: null, sellingPrice: null,
  } as Record<string, number | null>;
  for (const [key, label] of MARKUP_KEYS) {
    if (key in body) out[key] = sanitizeNullableNumber(body[key], label);
  }
  return out as ReturnType<typeof markupsFromBody>;
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "costControl:create");
  const body = (req.body ?? {}) as Record<string, unknown>;

  const jobName = sanitizeShortText(body.jobName, "Job Name");
  const workType = sanitizeShortText(body.workType, "Work type");
  const jobOrder = sanitizeShortText(body.jobOrder, "Job order");
  const docDate = validateIsoDateOrEmpty(body.docDate, "วันที่");
  const sourceFileName = sanitizeShortText(body.sourceFileName, "ชื่อไฟล์ต้นทาง");
  const lines = body.lines === undefined ? [] : sanitizeLines(body.lines);

  const counters = await countersCollection();
  const id = await nextCostControlId(counters);
  const now = nowIso();

  const doc: CostControlFields & { _id: string } = {
    _id: id,
    documentNumber: id,
    jobName, workType, jobOrder,
    docDate: docDate || now.slice(0, 10),
    lines,
    // บล็อกสรุปมาจากท้ายชีตตอนนำเข้า ถ้าไม่ได้ส่งมา (เปิดใบเปล่า) ทุกช่องเป็น null
    ...markupsFromBody(body),
    remarks: "",
    submittedBy: ctx.user.fullName,
    approvedBy: "",
    sourceFileName,
    importedAt: sourceFileName ? now : "",
    status: "Draft",
    approvedByUserId: "", approvedAt: "", rejectionComment: "", revisionNote: "",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id, isDeleted: false,
  };

  const costControls = await costControlsCollection();
  await ensureCostControlNumberIndex(costControls);
  await costControls.insertOne(doc);
  await writeAuditEntry(
    ctx, "Cost Control Created",
    sourceFileName
      ? `สร้าง ${id} จากไฟล์ "${sourceFileName}" (${lines.length} บรรทัด)`
      : `สร้าง ${id} (${lines.length} บรรทัด)`,
  );
  res.status(201).json({ costControl: toClient(doc) });
}

async function handleGet(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "costControl:view");
  res.status(200).json({ costControl: toClient(await loadOrThrow(id)) });
}

const SHORT_TEXT_FIELDS: { key: keyof CostControlFields; label: string }[] = [
  { key: "jobName", label: "Job Name" },
  { key: "workType", label: "Work type" },
  { key: "jobOrder", label: "Job order" },
  { key: "submittedBy", label: "ผู้จัดทำ" },
  { key: "approvedBy", label: "ผู้อนุมัติ" },
];
const NUMBER_FIELDS: { key: keyof CostControlFields; label: string }[] =
  MARKUP_KEYS.map(([key, label]) => ({ key, label }));

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadOrThrow(id);
  if (!canEdit(ctx, doc)) throw new HttpError(403, "Forbidden");
  // ล็อกทั้ง Final และ PendingApproval — ระหว่างรออนุมัติต้องแก้ไม่ได้ ไม่งั้นผู้อนุมัติจะกดอนุมัติ
  // เนื้อหาที่ต่างจากตอนที่ตรวจ (กฎเดียวกับใบสั่งซื้อ/ใบขอซื้อ)
  if (doc.status !== "Draft") {
    throw new HttpError(autoSave ? 409 : 400, doc.status === "Final"
      ? "เอกสารนี้อนุมัติแล้ว ไม่สามารถแก้ไขได้"
      : "เอกสารนี้กำลังรออนุมัติ ต้องถอนการขออนุมัติก่อนจึงจะแก้ไขได้");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<CostControlFields> = {};

  for (const { key, label } of SHORT_TEXT_FIELDS) {
    if (key in body) (update as Record<string, unknown>)[key] = sanitizeShortText(body[key], label);
  }
  for (const { key, label } of NUMBER_FIELDS) {
    if (key in body) (update as Record<string, unknown>)[key] = sanitizeNullableNumber(body[key], label);
  }
  if ("docDate" in body) update.docDate = validateIsoDateOrEmpty(body.docDate, "วันที่");
  if ("remarks" in body) update.remarks = sanitizeLongText(body.remarks, "หมายเหตุ");
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  if ("lines" in body) update.lines = sanitizeLines(body.lines);

  if ("documentNumber" in body) {
    const documentNumber = sanitizeShortText(body.documentNumber, "เลขที่เอกสาร", true);
    const costControls = await costControlsCollection();
    await ensureCostControlNumberIndex(costControls);
    const clash = await costControls.findOne({ documentNumber, _id: { $ne: id } });
    if (clash) throw new HttpError(409, "เลขที่เอกสารนี้มีอยู่แล้ว");
    update.documentNumber = documentNumber;
  }

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;

  const costControls = await costControlsCollection();
  await costControls.updateOne({ _id: id }, { $set: update });
  // บันทึกอัตโนมัติไม่เขียน audit — ไม่งั้นบันทึกจะท่วมจนอ่านไม่ออก (กฎเดียวกับทุกเอกสาร)
  if (!autoSave) await writeAuditEntry(ctx, "Cost Control Updated", `แก้ไข ${id}`);
  res.status(200).json({ costControl: toClient(await loadOrThrow(id)) });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "costControl:delete");
  const doc = await loadOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "costControl:viewAll")) throw new HttpError(403, "Forbidden");
  const costControls = await costControlsCollection();
  await costControls.updateOne({ _id: id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeAuditEntry(ctx, "Cost Control Deleted", `ลบ ${id}`);
  res.status(204).end();
}

async function handlePrint(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "costControl:print");
  const doc = await loadOrThrow(id);
  await writeAuditEntry(ctx, "Cost Control Printed", `พิมพ์ ${doc.documentNumber || doc._id}`);
  res.status(200).json({ ok: true });
}

async function handleRewrite(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "costControl:create");
  const doc = await loadOrThrow(id);
  if (doc.status !== "Final") throw new HttpError(400, "แก้ไขฉบับใหม่ได้เฉพาะใบที่อนุมัติแล้ว");

  const root = getRevisionRoot(doc._id);
  const counters = await countersCollection();
  const result = await counters.findOneAndUpdate(
    { _id: `cost_control_revision_${root}` }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true },
  );
  const revision = result?.seq ?? 1;
  const newDocId = `${root}-R${revision}`;
  const now = nowIso();

  const next: CostControlFields & { _id: string } = {
    ...doc,
    _id: newDocId,
    documentNumber: newDocId,
    status: "Draft",
    approvedBy: "",
    approvedByUserId: "",
    approvedAt: "",
    rejectionComment: "",
    revisionNote: "",
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
  };

  const costControls = await costControlsCollection();
  await ensureCostControlNumberIndex(costControls);
  await costControls.insertOne(next);
  await writeAuditEntry(ctx, "Cost Control Rewritten", `สร้างฉบับแก้ไข ${newDocId} จาก ${doc._id}`);
  res.status(201).json({ costControl: toClient(next) });
}

const approvalConfig: ApprovalConfig<CostControlFields & { _id: string }> = {
  label: "Cost Control",
  approvePermission: "costControl:finalize",
  submitNotification: {
    type: "cost_control_submitted", module: "Cost Control",
    relatedField: "relatedCostControlId", context: (doc) => doc.jobOrder || "",
  },
  collection: async () => (await costControlsCollection()) as unknown as Collection<CostControlFields & { _id: string }>,
  load: loadOrThrow,
  canEdit,
  writeAudit: (ctx, action, detail) => writeAuditEntry(ctx, action, detail),
  respond: (res, doc) => res.status(200).json({ costControl: toClient(doc) }),
};

export async function handleCostControl(req: VercelRequest, res: VercelResponse): Promise<void> {
  await requireUser(req);
  const parts = getPathSegments(req, "/api/cost-controls");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) {
    if (req.method === "GET") return handleGet(req, res, parts[0]);
    if (req.method === "PATCH") return handleUpdate(req, res, parts[0]);
    if (req.method === "DELETE") return handleDelete(req, res, parts[0]);
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 2) {
    const [id, action] = parts;
    if (action === "print") return handlePrint(req, res, id);
    if (action === "rewrite") return handleRewrite(req, res, id);
    if (action === "submit-approval") return handleSubmitApproval(req, res, id, approvalConfig);
    if (action === "approve" || action === "finalize") return handleApprove(req, res, id, approvalConfig);
    if (action === "reject") return handleReject(req, res, id, approvalConfig);
    if (action === "withdraw-approval") return handleWithdrawApproval(req, res, id, approvalConfig);
  }
  throw new HttpError(404, "Not found");
}
