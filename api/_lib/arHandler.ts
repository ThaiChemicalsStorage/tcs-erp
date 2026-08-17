import type { VercelRequest, VercelResponse } from "@vercel/node";
import { type WithId, Binary } from "mongodb";
import { randomUUID } from "node:crypto";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, type AuthContext } from "./auth.js";
import {
  arMilestonesCollection, arAttachmentFilesCollection, arDocumentsCollection,
  scopeOfWorksCollection, quotesCollection, auditLogCollection, withStringId, toObjectId,
  type ArMilestoneFields, type ArDocumentFields, type ArDocumentLine, type ArChecklistKey,
  type ArWorkClassification, type ScopeOfWorkFields, type QuoteFields, countersCollection,
} from "./collections.js";
import { computeQuoteAmountBeforeVat } from "./quoteAmounts.js";
import { nextArDocNumber } from "./documentNumbering.js";
import {
  round2, computeDownPaymentLineAmount, computeDepositDeductionLineAmount, computeArDocumentTotals, computeDueDate,
} from "./arCalculations.js";
import { bahtText } from "../../src/lib/quotes.js";
import { nowIso } from "../../src/lib/products.js";

/**
 * Accounts Receivable API (added 2026-08-17, Phase 1 — see docs/MODULES/Accounting.md for the full
 * design writeup and the Phase 1/Phase 2 boundary). Mounted from `api/handlers/quotes.ts` on the raw
 * pathname (same "shares this function file" convention Scope of Work/Delivery Order already use —
 * see docs/ARCHITECTURE.md; the Vercel function-count cap no longer actually applies since
 * production is self-hosted Express, but the convention is kept for consistency).
 *
 * Deliberately does NOT use a Mongo multi-document transaction for "issue AR+BI together" — no
 * transaction usage exists anywhere in this codebase and it's unconfirmed whether production Mongo
 * runs as a replica set (a standalone mongod can't run one at all). Each document in a billing set is
 * issued sequentially, each protected by its own atomic counter reservation; a mid-batch failure
 * leaves a recoverable, auditable gap (a reserved-but-unused sequence number) rather than risking a
 * runtime crash from an unsupported transaction API.
 */

async function writeArAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
  related: { scopeOfWorkId?: string; scopeNumber?: string },
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "บัญชีลูกหนี้",
    action,
    details,
    createdAt: nowIso(),
    ...(related.scopeOfWorkId ? { relatedScopeId: related.scopeOfWorkId } : {}),
    ...(related.scopeNumber ? { relatedScopeNumber: related.scopeNumber } : {}),
  });
}

async function loadScopeOrThrow(id: string): Promise<WithId<ScopeOfWorkFields>> {
  const scopeOfWorks = await scopeOfWorksCollection();
  const doc = await scopeOfWorks.findOne({ _id: toObjectId(id) });
  if (!doc) throw new HttpError(404, "ไม่พบ Scope of Work");
  return doc;
}

/** Total contract value (ex-VAT) for a Scope of Work — pulled transitively through its source
 * Quotation, since ScopeOfWork itself carries no pricing ("no pricing anywhere" is a documented
 * design principle, not a gap — see docs/CLAUDE.md). Uses the same `computeQuoteAmountBeforeVat()`
 * the Dashboard already uses to unwrap the VAT-inclusive `Quote.amount`. */
async function loadTotalContractValueExVat(scope: WithId<ScopeOfWorkFields>): Promise<{ total: number; quote: QuoteFields & { _id: string } }> {
  const quotes = await quotesCollection();
  const quote = await quotes.findOne({ _id: scope.quotationId });
  if (!quote) throw new HttpError(400, "ไม่พบใบเสนอราคาต้นทางของ Scope of Work นี้ ไม่สามารถคำนวณมูลค่างานได้");
  const total = computeQuoteAmountBeforeVat(
    quote.lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, discount: l.discount })),
    quote.discount,
  );
  return { total: round2(total), quote };
}

/** Lazily creates (or returns the existing) ar_milestones row for a Scope of Work installment — the
 * first time a user opens that installment's Issue Billing Set wizard, per decision #2 (never
 * proactively for every installment in the system). `pct`/`label`/`paymentType`/`days` and
 * `totalContractValueExVat` are a frozen snapshot at that moment, never re-derived automatically
 * afterward — see `refreshMilestoneFromScope()` below for the explicit-only re-pull. */
async function getOrCreateMilestone(
  ctx: AuthContext,
  scope: WithId<ScopeOfWorkFields>,
  installmentId: string,
): Promise<WithId<ArMilestoneFields>> {
  const milestones = await arMilestonesCollection();
  const existing = await milestones.findOne({ scopeOfWorkId: scope._id.toString(), installmentId });
  if (existing) return existing;

  const installment = scope.paymentConditions.installments.find((i) => i.id === installmentId);
  if (!installment) throw new HttpError(404, "ไม่พบงวดการชำระเงินนี้ใน Scope of Work");
  const { total } = await loadTotalContractValueExVat(scope);
  const isDownPayment = ["down payment", "deposit", "เงินมัดจำ", "ชำระเงินล่วงหน้า"].includes(installment.label.trim().toLowerCase());

  const now = nowIso();
  const doc: ArMilestoneFields = {
    scopeOfWorkId: scope._id.toString(),
    installmentId,
    isDownPayment,
    pct: installment.pct,
    label: installment.label,
    paymentType: installment.paymentType,
    days: installment.days,
    totalContractValueExVat: total,
    retentionPct: null,
    workClassification: "service", // most common case in the real reference data; confirmed/adjusted in the wizard's first step before issuing
    billingStatus: "not_billed",
    checklistState: {},
    attachmentIds: [],
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const result = await milestones.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

async function loadMilestoneOrThrow(id: string): Promise<WithId<ArMilestoneFields>> {
  const milestones = await arMilestonesCollection();
  const doc = await milestones.findOne({ _id: toObjectId(id) });
  if (!doc) throw new HttpError(404, "ไม่พบงวดบิลนี้");
  return doc;
}

// ─── Milestones ─────────────────────────────────────────────────────────────

async function handleMilestonesList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "ar:view");
  const scopeOfWorkId = typeof req.query.scopeOfWorkId === "string" ? req.query.scopeOfWorkId : "";
  const milestones = await arMilestonesCollection();
  const filter = scopeOfWorkId ? { scopeOfWorkId } : {};
  const docs = await milestones.find(filter).sort({ createdAt: 1 }).toArray();
  res.status(200).json({ milestones: docs.map(withStringId) });
}

/** GET returns-or-lazily-creates the milestone row for a given Scope of Work installment — the
 * wizard's first step calls this with `?scopeOfWorkId=&installmentId=` to open (and, if needed,
 * bootstrap) a milestone before showing its checklist/review screen. */
async function handleMilestoneOpen(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:create");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const scopeOfWorkId = typeof body.scopeOfWorkId === "string" ? body.scopeOfWorkId : "";
  const installmentId = typeof body.installmentId === "string" ? body.installmentId : "";
  if (!scopeOfWorkId || !installmentId) throw new HttpError(400, "กรุณาระบุ Scope of Work และงวดการชำระเงิน");
  const scope = await loadScopeOrThrow(scopeOfWorkId);
  const milestone = await getOrCreateMilestone(ctx, scope, installmentId);
  res.status(200).json({ milestone: withStringId(milestone) });
}

const PATCHABLE_MILESTONE_KEYS = new Set(["workClassification", "retentionPct", "checklistState"]);

async function handleMilestoneUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:create");
  const doc = await loadMilestoneOrThrow(id);
  if (doc.billingStatus !== "not_billed") {
    throw new HttpError(400, "งวดนี้ออกเอกสารไปแล้ว ไม่สามารถแก้ไขข้อมูลก่อนวางบิลได้อีก");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<ArMilestoneFields> = {};
  if ("workClassification" in body) {
    const v = body.workClassification;
    if (v !== "goods" && v !== "service" && v !== "contract") throw new HttpError(400, "ประเภทงานไม่ถูกต้อง");
    update.workClassification = v as ArWorkClassification;
  }
  if ("retentionPct" in body) {
    const v = body.retentionPct;
    if (v !== null && (typeof v !== "number" || v < 0 || v > 100)) throw new HttpError(400, "เปอร์เซ็นต์เงินประกันผลงานไม่ถูกต้อง");
    update.retentionPct = v as number | null;
  }
  if ("checklistState" in body) {
    const v = body.checklistState;
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new HttpError(400, "ข้อมูล checklist ไม่ถูกต้อง");
    update.checklistState = v as Partial<Record<ArChecklistKey, boolean>>;
  }
  const keys = Object.keys(update);
  if (keys.some((k) => !PATCHABLE_MILESTONE_KEYS.has(k))) throw new HttpError(400, "ไม่สามารถแก้ไขฟิลด์นี้ได้");

  if (keys.length > 0) {
    const milestones = await arMilestonesCollection();
    await milestones.updateOne({ _id: doc._id }, { $set: { ...update, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  }
  const updated = await loadMilestoneOrThrow(id);
  res.status(200).json({ milestone: withStringId(updated) });
}

/** Explicit-only re-pull of `pct`/`label`/`paymentType`/`days` from the Scope of Work — mirrors
 * Delivery Order's own explicit-only "อัปเดตข้อมูลจาก Scope of Work" refresh. Only allowed while
 * `not_billed` (once billed, the milestone is a frozen snapshot of what was actually invoiced). */
async function handleMilestoneRefresh(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:create");
  const doc = await loadMilestoneOrThrow(id);
  if (doc.billingStatus !== "not_billed") throw new HttpError(400, "งวดนี้ออกเอกสารไปแล้ว ไม่สามารถอัปเดตข้อมูลได้อีก");

  const scope = await loadScopeOrThrow(doc.scopeOfWorkId);
  const installment = scope.paymentConditions.installments.find((i) => i.id === doc.installmentId);
  if (!installment) throw new HttpError(404, "ไม่พบงวดการชำระเงินนี้ใน Scope of Work แล้ว (อาจถูกลบออก)");
  const { total } = await loadTotalContractValueExVat(scope);

  const milestones = await arMilestonesCollection();
  await milestones.updateOne(
    { _id: doc._id },
    { $set: {
      pct: installment.pct, label: installment.label, paymentType: installment.paymentType, days: installment.days,
      totalContractValueExVat: round2(total), updatedAt: nowIso(), updatedBy: ctx.user.id,
    } },
  );
  const updated = await loadMilestoneOrThrow(id);
  res.status(200).json({ milestone: withStringId(updated) });
}

// ─── Attachments (checklist evidence) ────────────────────────────────────────
// Deliberately a dedicated collection/route, NOT Scope of Work's scope_attachment_files — that
// system is capped at 5 files *per Scope of Work record* (not per installment) and gated by Sales'
// scopeOfWork:edit permission. See the collections.ts doc comment on ArAttachmentFileFields.

const MAX_AR_ATTACHMENTS_PER_MILESTONE = 5;
const MAX_AR_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const VALID_CHECKLIST_KEYS: ReadonlySet<ArChecklistKey> = new Set(["poCopy", "deliveryNote", "report", "stampDuty", "bankGuarantee", "whtEnvelope"]);

async function handleAttachmentUpload(req: VercelRequest, res: VercelResponse, milestoneId: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:create");
  const milestone = await loadMilestoneOrThrow(milestoneId);

  const existingCount = milestone.attachmentIds.length;
  if (existingCount >= MAX_AR_ATTACHMENTS_PER_MILESTONE) {
    throw new HttpError(400, `แนบไฟล์ได้สูงสุด ${MAX_AR_ATTACHMENTS_PER_MILESTONE} ไฟล์ต่องวด — ลบไฟล์เดิมออกก่อน`);
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const checklistKey = typeof body.checklistKey === "string" ? body.checklistKey : "";
  if (!VALID_CHECKLIST_KEYS.has(checklistKey as ArChecklistKey)) throw new HttpError(400, "ประเภทเอกสารแนบไม่ถูกต้อง");
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim().slice(0, 200) : "";
  if (!fileName) throw new HttpError(400, "กรุณาระบุชื่อไฟล์");
  const contentType = typeof body.contentType === "string" && body.contentType.trim() ? body.contentType.trim().slice(0, 120) : "application/octet-stream";
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  if (!dataBase64) throw new HttpError(400, "ไม่พบข้อมูลไฟล์");
  if (dataBase64.length > Math.ceil((MAX_AR_ATTACHMENT_BYTES * 4) / 3) + 8) {
    throw new HttpError(400, `ไฟล์ต้องมีขนาดไม่เกิน ${Math.floor(MAX_AR_ATTACHMENT_BYTES / 1024 / 1024)} MB`);
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) throw new HttpError(400, "ข้อมูลไฟล์ไม่ถูกต้อง");
  const data = Buffer.from(dataBase64, "base64");
  if (data.length === 0 || data.length > MAX_AR_ATTACHMENT_BYTES) {
    throw new HttpError(400, `ไฟล์ต้องมีขนาดไม่เกิน ${Math.floor(MAX_AR_ATTACHMENT_BYTES / 1024 / 1024)} MB`);
  }

  const attachmentId = randomUUID();
  const files = await arAttachmentFilesCollection();
  await files.insertOne({
    milestoneId, attachmentId, checklistKey: checklistKey as ArChecklistKey,
    fileName, contentType, size: data.length, data: new Binary(data),
    createdAt: nowIso(), createdBy: ctx.user.id,
  });

  const milestones = await arMilestonesCollection();
  await milestones.updateOne(
    { _id: milestone._id },
    { $push: { attachmentIds: attachmentId }, $set: { updatedAt: nowIso(), updatedBy: ctx.user.id } },
  );
  const updated = await loadMilestoneOrThrow(milestoneId);
  res.status(200).json({ milestone: withStringId(updated), attachmentId });
}

async function handleAttachmentDelete(req: VercelRequest, res: VercelResponse, milestoneId: string, attachmentId: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:create");
  const milestone = await loadMilestoneOrThrow(milestoneId);
  if (!milestone.attachmentIds.includes(attachmentId)) throw new HttpError(404, "ไม่พบไฟล์แนบ");

  const files = await arAttachmentFilesCollection();
  await files.deleteOne({ attachmentId });
  const milestones = await arMilestonesCollection();
  await milestones.updateOne(
    { _id: milestone._id },
    { $pull: { attachmentIds: attachmentId }, $set: { updatedAt: nowIso(), updatedBy: ctx.user.id } },
  );
  const updated = await loadMilestoneOrThrow(milestoneId);
  res.status(200).json({ milestone: withStringId(updated) });
}

async function handleAttachmentDownload(req: VercelRequest, res: VercelResponse, milestoneId: string, attachmentId: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  // Session + permission gated (not an unguessable capability URL) — unlike Scope of Work's
  // attachments, these are never emailed to an external recipient, so there's no mail-client-with-
  // no-session use case to design around.
  await requirePermission(req, "ar:view");
  const files = await arAttachmentFilesCollection();
  const file = await files.findOne({ milestoneId, attachmentId });
  if (!file) throw new HttpError(404, "ไม่พบไฟล์แนบ");
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.fileName)}"`);
  res.status(200).send(file.data.buffer);
}

// ─── Documents (issue AR/IV + companion BI) ──────────────────────────────────

const REQUIRED_CHECKLIST_FOR: Record<ArWorkClassification, ArChecklistKey[]> = {
  goods: ["poCopy", "deliveryNote"],
  service: ["poCopy", "deliveryNote"],
  contract: ["poCopy", "deliveryNote"],
};

function checklistIsComplete(milestone: WithId<ArMilestoneFields>): boolean {
  const required = REQUIRED_CHECKLIST_FOR[milestone.workClassification];
  return required.every((key) => milestone.checklistState[key] === true);
}

/** Builds the line items for a milestone's principal document (AR for a down-payment milestone,
 * IV for any other) — see arCalculations.ts's doc comment for why these are NOT simply "pct% of the
 * total" for a non-deposit milestone. */
async function buildDocumentLines(
  milestone: WithId<ArMilestoneFields>,
  quote: QuoteFields & { _id: string },
): Promise<{ lines: ArDocumentLine[]; docType: "AR" | "IV" }> {
  if (milestone.isDownPayment) {
    const amount = computeDownPaymentLineAmount(milestone.totalContractValueExVat, milestone.pct ?? 0);
    return {
      docType: "AR",
      lines: [{ seq: 1, description: `Down Payment ${milestone.pct ?? 0}%`, qty: 1, unit: "งวด", unitPrice: amount, amount }],
    };
  }

  // Non-deposit milestone: the Scope of Work's source Quotation line items, unscaled, plus a
  // deduction line per already-issued deposit AR document for this Scope of Work. Phase 1 is built
  // and verified against exactly this 2-milestone (deposit + final) shape — see arCalculations.ts's
  // doc comment. A Scope of Work with more than one non-deposit milestone already issued is refused
  // below rather than silently producing an unverified number.
  const arDocuments = await arDocumentsCollection();
  const [priorDeposits, priorNonDeposits] = await Promise.all([
    arDocuments.find({ scopeOfWorkId: milestone.scopeOfWorkId, docType: "AR", status: "issued" }).toArray(),
    arDocuments.find({ scopeOfWorkId: milestone.scopeOfWorkId, docType: "IV", status: "issued" }).toArray(),
  ]);
  if (priorNonDeposits.length > 0) {
    throw new HttpError(400, "Scope of Work นี้มีการออกใบกำกับภาษีงวดที่ไม่ใช่เงินมัดจำไปแล้ว — รูปแบบมากกว่า 2 งวด (มัดจำ + งวดสุดท้าย) ยังไม่รองรับในระบบขณะนี้ กรุณาติดต่อผู้ดูแลระบบ");
  }

  const itemLines: ArDocumentLine[] = quote.lines
    .filter((l) => !l.isSectionHeader)
    .map((l, i) => ({
      seq: i + 1,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      unitPrice: l.unitPrice,
      amount: round2(l.qty * l.unitPrice * (1 - l.discount / 100)),
    }));
  const deductionLines: ArDocumentLine[] = priorDeposits.map((dep, i) => ({
    seq: itemLines.length + i + 1,
    description: `หักเงินมัดจำ(${dep.docNo})${milestone.pct ?? ""}%`,
    qty: 1,
    unit: "งวด",
    unitPrice: computeDepositDeductionLineAmount(dep.valueAmount),
    amount: computeDepositDeductionLineAmount(dep.valueAmount),
    linkedArDocumentId: dep._id.toString(),
  }));
  return { docType: "IV", lines: [...itemLines, ...deductionLines] };
}

async function handleIssueDocuments(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:issue");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const milestoneId = typeof body.milestoneId === "string" ? body.milestoneId : "";
  if (!milestoneId) throw new HttpError(400, "กรุณาระบุงวดบิลที่จะออกเอกสาร");

  const milestone = await loadMilestoneOrThrow(milestoneId);
  if (milestone.billingStatus !== "not_billed") throw new HttpError(400, "งวดนี้ออกเอกสารไปแล้ว");
  if (!checklistIsComplete(milestone)) throw new HttpError(400, "กรุณาแนบเอกสารตาม checklist ให้ครบก่อนออกเอกสาร", { code: "CHECKLIST_INCOMPLETE" });

  const scope = await loadScopeOrThrow(milestone.scopeOfWorkId);
  const { quote } = await loadTotalContractValueExVat(scope);
  const { docType, lines } = await buildDocumentLines(milestone, quote);
  const totals = computeArDocumentTotals(lines.map((l) => l.amount));
  const docDate = nowIso().slice(0, 10);
  const dueDate = computeDueDate(docDate, milestone.paymentType, milestone.days);

  const customerSnapshot = {
    companyName: scope.customerSnapshot.companyName,
    address: scope.customerSnapshot.address,
    taxId: scope.customerSnapshot.taxId,
    branch: "",
    contactName: scope.customerSnapshot.contactName,
    phone: scope.customerSnapshot.phone,
    email: scope.customerSnapshot.email,
  };
  const remarks = [
    `**${milestone.pct ?? ""}%${milestone.isDownPayment ? "จากยอดเต็มค่าบริการทั้งหมด" : "จากยอดเต็มค่าบริการทั้งหมด"}=${milestone.totalContractValueExVat.toLocaleString("th-TH")}**`,
    `**${scope.scopeNumber}**`,
    ...(scope.customerPoNumber ? [`**PO:${scope.customerPoNumber}**`] : []),
  ];

  const counters = await countersCollection();
  const principalDocNo = await nextArDocNumber(counters, docType);
  const now = nowIso();
  const arDocuments = await arDocumentsCollection();
  const principalDoc: ArDocumentFields = {
    scopeOfWorkId: scope._id.toString(),
    milestoneId,
    docType,
    docNo: principalDocNo,
    docDate,
    dueDate,
    customerSnapshot,
    reference: scope.customerPoNumber,
    lines,
    ...totals,
    vatRate: 7,
    amountTextTh: bahtText(totals.netTotal),
    remarks,
    status: "issued",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const principalInsert = await arDocuments.insertOne(principalDoc);
  const principal = { ...principalDoc, _id: principalInsert.insertedId };

  // Companion BI (billing note) — issued in the same action, one line referencing the principal
  // document, per the real Flow's "AR/IV + BI issue together" workflow.
  const biDocNo = await nextArDocNumber(counters, "BI");
  const biLine: ArDocumentLine = {
    seq: 1, description: `${docType} ${principalDocNo}`, qty: 1, unit: "รายการ",
    unitPrice: totals.netTotal, amount: totals.netTotal,
  };
  const biDoc: ArDocumentFields = {
    scopeOfWorkId: scope._id.toString(),
    milestoneId,
    docType: "BI",
    docNo: biDocNo,
    docDate,
    dueDate,
    customerSnapshot,
    reference: principalDocNo,
    lines: [biLine],
    subtotal: totals.netTotal, discount: 0, valueAmount: totals.netTotal, vatRate: 0, vatAmount: 0, netTotal: totals.netTotal,
    amountTextTh: bahtText(totals.netTotal),
    remarks: [],
    status: "issued",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const biInsert = await arDocuments.insertOne(biDoc);
  const bi = { ...biDoc, _id: biInsert.insertedId };

  const milestones = await arMilestonesCollection();
  await milestones.updateOne(
    { _id: milestone._id },
    { $set: { billingStatus: milestone.isDownPayment ? "billed" : "work_open", updatedAt: now, updatedBy: ctx.user.id } },
  );

  await writeArAuditEntry(ctx, `AR Document Issued (${docType})`, `ออกเอกสาร ${principalDocNo} และ ${biDocNo} สำหรับ Scope of Work ${scope.scopeNumber}`, {
    scopeOfWorkId: scope._id.toString(), scopeNumber: scope.scopeNumber,
  });

  res.status(201).json({ documents: [withStringId(principal), withStringId(bi)].map((d) => ({ ...d, id: d.id })) });
}

async function handleDocumentsList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "ar:view");
  const scopeOfWorkId = typeof req.query.scopeOfWorkId === "string" ? req.query.scopeOfWorkId : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const filter: Record<string, unknown> = {};
  if (scopeOfWorkId) filter.scopeOfWorkId = scopeOfWorkId;
  if (status) filter.status = status;
  const arDocuments = await arDocumentsCollection();
  const docs = await arDocuments.find(filter).sort({ createdAt: -1 }).toArray();
  res.status(200).json({ documents: docs.map(withStringId) });
}

async function loadDocumentOrThrow(id: string): Promise<WithId<ArDocumentFields>> {
  const arDocuments = await arDocumentsCollection();
  const doc = await arDocuments.findOne({ _id: toObjectId(id) });
  if (!doc) throw new HttpError(404, "ไม่พบเอกสาร");
  return doc;
}

async function handleDocumentOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "ar:view");
  const doc = await loadDocumentOrThrow(id);
  res.status(200).json({ document: withStringId(doc) });
}

/** Phase 1: basic cancel — a status transition only (never a delete, see collections.ts's
 * ArDocumentFields doc comment), no red ยกเลิก watermark / supervisor-override checklist bypass yet
 * (Phase 2 polish, see docs/MODULES/Accounting.md). */
async function handleDocumentCancel(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:cancel");
  const doc = await loadDocumentOrThrow(id);
  if (doc.status === "cancelled") throw new HttpError(400, "เอกสารนี้ถูกยกเลิกไปแล้ว");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) throw new HttpError(400, "กรุณาระบุเหตุผลในการยกเลิก");

  const arDocuments = await arDocumentsCollection();
  const now = nowIso();
  await arDocuments.updateOne(
    { _id: doc._id },
    { $set: { status: "cancelled", cancelledReason: reason, cancelledBy: ctx.user.id, cancelledAt: now, updatedAt: now, updatedBy: ctx.user.id } },
  );
  await writeArAuditEntry(ctx, "AR Document Cancelled", `ยกเลิกเอกสาร ${doc.docNo}: ${reason}`, { scopeOfWorkId: doc.scopeOfWorkId });
  const updated = await loadDocumentOrThrow(id);
  res.status(200).json({ document: withStringId(updated) });
}

/** Guard called from `scopeOfWorkHandler.ts`'s `handleRewrite()` — a Scope of Work Rewrite creates a
 * brand-new document _id, which would silently orphan any already-billed ar_milestones history from
 * the record a user now sees (installment ids carry over, but the scopeOfWorkId half of
 * ar_milestones' composite key does not). See docs/MODULES/Accounting.md decision #2. */
export async function assertScopeHasNoBilledMilestones(scopeOfWorkId: string): Promise<void> {
  const milestones = await arMilestonesCollection();
  const billed = await milestones.findOne({ scopeOfWorkId, billingStatus: { $ne: "not_billed" } });
  if (billed) {
    throw new HttpError(400, "Scope of Work นี้มีการวางบิลแล้ว ไม่สามารถเขียนใหม่ (Rewrite) ได้");
  }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────

export async function handleAr(req: VercelRequest, res: VercelResponse): Promise<void> {
  const pathname = (req.url ?? "").split("?")[0];

  if (pathname === "/api/ar-milestones") return handleMilestonesList(req, res);
  if (pathname === "/api/ar-milestones/open") return handleMilestoneOpen(req, res);
  const milestoneParts = getPathSegments(req, "/api/ar-milestones");
  if (milestoneParts.length === 1) return handleMilestoneUpdate(req, res, milestoneParts[0]);
  if (milestoneParts.length === 2 && milestoneParts[1] === "refresh") return handleMilestoneRefresh(req, res, milestoneParts[0]);
  if (milestoneParts.length === 2 && milestoneParts[1] === "attachments") return handleAttachmentUpload(req, res, milestoneParts[0]);
  if (milestoneParts.length === 3 && milestoneParts[1] === "attachments" && req.method === "DELETE") {
    return handleAttachmentDelete(req, res, milestoneParts[0], milestoneParts[2]);
  }
  if (milestoneParts.length === 3 && milestoneParts[1] === "attachments" && req.method === "GET") {
    return handleAttachmentDownload(req, res, milestoneParts[0], milestoneParts[2]);
  }

  if (pathname === "/api/ar-documents") return req.method === "POST" ? handleIssueDocuments(req, res) : handleDocumentsList(req, res);
  const docParts = getPathSegments(req, "/api/ar-documents");
  if (docParts.length === 1) return handleDocumentOne(req, res, docParts[0]);
  if (docParts.length === 2 && docParts[1] === "cancel") return handleDocumentCancel(req, res, docParts[0]);

  throw new HttpError(404, "Not found");
}
