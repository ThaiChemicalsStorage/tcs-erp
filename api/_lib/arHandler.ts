import type { VercelRequest, VercelResponse } from "@vercel/node";
import { type WithId, Binary } from "mongodb";
import { randomUUID } from "node:crypto";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, type AuthContext } from "./auth.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import {
  arMilestonesCollection, arAttachmentFilesCollection, arDocumentsCollection,
  scopeOfWorksCollection, quotesCollection, auditLogCollection, withStringId, toObjectId,
  type ArMilestoneFields, type ArDocumentFields, type ArDocumentLine, type ArChecklistKey,
  type ArWorkClassification, type ArDocumentType, type ArBillingStatus, type ArDocumentCustomerSnapshot,
  type ScopeOfWorkFields, type QuoteFields, countersCollection, type StockMovementFields,
} from "./collections.js";
import { computeQuoteAmountBeforeVat } from "./quoteAmounts.js";
import { nextArDocNumber } from "./documentNumbering.js";
import {
  round2, computeDownPaymentLineAmount, computeDepositDeductionLineAmount, computeArDocumentTotals, computeDueDate,
} from "./arCalculations.js";
import { bahtText } from "../../src/lib/quotes.js";
import { nowIso } from "../../src/lib/products.js";
import { applyStockMovement } from "./stockHandler.js";

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
    paymentType: milestone.paymentType,
    customerSnapshot,
    reference: scope.customerPoNumber,
    lines,
    ...totals,
    vatRate: 7,
    amountTextTh: bahtText(totals.netTotal),
    remarks,
    stockDeducted: false,
    isManual: false,
    status: "issued",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const principalInsert = await arDocuments.insertOne(principalDoc);
  const principal = { ...principalDoc, _id: principalInsert.insertedId };

  // Companion BI (billing note) — issued in the same action, one line referencing the principal
  // document, per the real Flow's "AR/IV + BI issue together" workflow.
  const biDocNo = await nextArDocNumber(counters, "BI");
  const biLine: ArDocumentLine = {
    // was `${docType} ${principalDocNo}` — principalDocNo already carries its own prefix
    // (e.g. "IV6908024"), so that duplicated it as "IV IV6908024"; fixed 2026-08-18 while building
    // the real BI print layout, which renders this as the bare "เลขที่ใบกำกับ" column.
    seq: 1, description: principalDocNo, qty: 1, unit: "รายการ",
    unitPrice: totals.netTotal, amount: totals.netTotal,
    // Traces back to the invoice this billing note is for — lets the BI print view look up
    // whether a receipt has since been issued against it (ชำระแล้ว/เงินคงค้าง), added 2026-08-18.
    linkedArDocumentId: principal._id.toString(),
  };
  const biDoc: ArDocumentFields = {
    scopeOfWorkId: scope._id.toString(),
    milestoneId,
    docType: "BI",
    docNo: biDocNo,
    docDate,
    dueDate,
    paymentType: milestone.paymentType,
    customerSnapshot,
    reference: principalDocNo,
    lines: [biLine],
    subtotal: totals.netTotal, discount: 0, valueAmount: totals.netTotal, vatRate: 0, vatAmount: 0, netTotal: totals.netTotal,
    amountTextTh: bahtText(totals.netTotal),
    remarks: [],
    stockDeducted: false,
    isManual: false,
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

/** Freestanding AR/IV creation — no Scope of Work/milestone at all (added 2026-08-18, direct
 * request: "ตัดสต๊อกสินค้าทำเลยก็ได้..." led into asking for a Quotation-style "+ สร้าง" button on
 * every Accounting page; scoped down to AR/IV only — a standalone BI or RE with nothing to bill
 * against would violate the existing "BI/RE always reference a principal invoice" invariant every
 * other AR route in this file relies on). Deliberately a separate endpoint from
 * `handleIssueDocuments()` above rather than a branch inside it — that function is deeply tied to
 * milestone/checklist semantics that don't apply here, and branching it would risk the already-
 * live-tested milestone flow. Still issues a companion BI in the same action, matching the
 * "AR/IV + BI together" convention every tax invoice follows regardless of how it was created. */
async function handleManualIssue(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:create");
  if (!roleHasPermission(ctx.role, "ar:issue")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const docType = body.docType === "AR" || body.docType === "IV" ? body.docType : null;
  if (!docType) throw new HttpError(400, "ประเภทเอกสารต้องเป็นใบรับเงินมัดจำ/ใบกำกับภาษี (AR) หรือใบกำกับภาษี/ใบส่งสินค้า (IV) เท่านั้น");

  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const customerBody = body.customer && typeof body.customer === "object" ? body.customer as Record<string, unknown> : {};
  const companyName = str(customerBody.companyName);
  if (!companyName) throw new HttpError(400, "กรุณาระบุชื่อบริษัทลูกค้า");
  const customerSnapshot: ArDocumentCustomerSnapshot = {
    companyName,
    address: str(customerBody.address),
    taxId: str(customerBody.taxId),
    branch: str(customerBody.branch),
    contactName: str(customerBody.contactName),
    phone: str(customerBody.phone),
    email: str(customerBody.email),
  };

  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: ArDocumentLine[] = rawLines
    .filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null)
    .map((l, i) => {
      const qty = typeof l.qty === "number" ? l.qty : NaN;
      const unitPrice = typeof l.unitPrice === "number" ? l.unitPrice : NaN;
      return { seq: i + 1, description: str(l.description), qty, unit: str(l.unit), unitPrice, amount: round2(qty * unitPrice) };
    })
    .filter((l) => l.description && Number.isFinite(l.qty) && l.qty > 0 && Number.isFinite(l.unitPrice) && l.unitPrice >= 0);
  if (lines.length === 0) throw new HttpError(400, "กรุณาระบุรายการอย่างน้อย 1 รายการ (คำอธิบาย จำนวน และราคาต่อหน่วยที่ถูกต้อง)");

  const paymentType: "" | "Cash" | "Credit" = body.paymentType === "Cash" || body.paymentType === "Credit" ? body.paymentType : "";
  const days = typeof body.days === "number" && Number.isFinite(body.days) ? body.days : null;

  const totals = computeArDocumentTotals(lines.map((l) => l.amount));
  const docDate = nowIso().slice(0, 10);
  const dueDate = computeDueDate(docDate, paymentType, days);

  const counters = await countersCollection();
  const principalDocNo = await nextArDocNumber(counters, docType);
  const now = nowIso();
  const arDocuments = await arDocumentsCollection();
  const principalDoc: ArDocumentFields = {
    scopeOfWorkId: "",
    milestoneId: "",
    docType,
    docNo: principalDocNo,
    docDate,
    dueDate,
    paymentType,
    customerSnapshot,
    reference: "",
    lines,
    ...totals,
    vatRate: 7,
    amountTextTh: bahtText(totals.netTotal),
    remarks: [],
    stockDeducted: false,
    isManual: true,
    status: "issued",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const principalInsert = await arDocuments.insertOne(principalDoc);
  const principal = { ...principalDoc, _id: principalInsert.insertedId };

  const biDocNo = await nextArDocNumber(counters, "BI");
  const biLine: ArDocumentLine = {
    seq: 1, description: principalDocNo, qty: 1, unit: "รายการ",
    unitPrice: totals.netTotal, amount: totals.netTotal,
    linkedArDocumentId: principal._id.toString(),
  };
  const biDoc: ArDocumentFields = {
    scopeOfWorkId: "",
    milestoneId: "",
    docType: "BI",
    docNo: biDocNo,
    docDate,
    dueDate,
    paymentType,
    customerSnapshot,
    reference: principalDocNo,
    lines: [biLine],
    subtotal: totals.netTotal, discount: 0, valueAmount: totals.netTotal, vatRate: 0, vatAmount: 0, netTotal: totals.netTotal,
    amountTextTh: bahtText(totals.netTotal),
    remarks: [],
    stockDeducted: false,
    isManual: true,
    status: "issued",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const biInsert = await arDocuments.insertOne(biDoc);
  const bi = { ...biDoc, _id: biInsert.insertedId };

  await writeArAuditEntry(ctx, "AR Document Issued (Manual)", `ออกเอกสาร ${principalDocNo} และ ${biDocNo} แบบ Manual สำหรับลูกค้า ${companyName}`, {});

  res.status(201).json({ documents: [withStringId(principal), withStringId(bi)] });
}

async function handleDocumentsList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "ar:view");
  const scopeOfWorkId = typeof req.query.scopeOfWorkId === "string" ? req.query.scopeOfWorkId : "";
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const docType = typeof req.query.docType === "string" ? req.query.docType : "";
  // Gregorian "YYYY-MM" (docDate is stored Gregorian ISO) — backs the per-document-type list pages'
  // month filter and the monthly tax-filing summary (added 2026-08-18 per the owner's Express-system
  // improvement request: "เดือนนี้เราออกเอกสารเลขที่อะไรไปแล้วบ้าง...ยอดรวมเท่าไหร่").
  const month = typeof req.query.month === "string" ? req.query.month : "";
  const filter: Record<string, unknown> = {};
  if (scopeOfWorkId) filter.scopeOfWorkId = scopeOfWorkId;
  if (status) filter.status = status;
  if (docType) {
    if (!["AR", "IV", "BI", "RE"].includes(docType)) throw new HttpError(400, "ประเภทเอกสารไม่ถูกต้อง");
    filter.docType = docType;
  }
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "รูปแบบเดือนไม่ถูกต้อง (YYYY-MM)");
    filter.docDate = { $gte: `${month}-01`, $lte: `${month}-31` };
  }
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

/** Issues an RE (ใบเสร็จรับเงิน / receipt) against an already-issued AR or IV tax invoice — added
 * 2026-08-18 when the owner confirmed the 4-document set (AR → RE → BI per the stated
 * "Flow การทำงานของบัญชี-รับ"). The receipt records the money actually received: one line referencing
 * the tax invoice, amount = that invoice's VAT-inclusive net total, itself carrying no VAT of its own
 * (the VAT liability lives on the tax invoice, not the receipt). Issuing the receipt for a
 * non-deposit milestone closes it (billingStatus "work_open" → "closed" = "จบ" in the Flow's
 * lifecycle); a deposit milestone stays "billed". */
async function handleIssueReceipt(req: VercelRequest, res: VercelResponse, principalId: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "ar:issue");
  const principal = await loadDocumentOrThrow(principalId);
  if (principal.docType !== "AR" && principal.docType !== "IV") {
    throw new HttpError(400, "ออกใบเสร็จรับเงินได้เฉพาะจากใบกำกับภาษี (AR/IV) เท่านั้น");
  }
  if (principal.status !== "issued") throw new HttpError(400, "ใบกำกับภาษีนี้ถูกยกเลิกแล้ว ไม่สามารถออกใบเสร็จได้");

  const arDocuments = await arDocumentsCollection();
  const existing = await arDocuments.findOne({
    docType: "RE", status: "issued", "lines.linkedArDocumentId": principal._id.toString(),
  });
  if (existing) throw new HttpError(400, `ใบกำกับภาษี ${principal.docNo} มีใบเสร็จรับเงิน ${existing.docNo} อยู่แล้ว`);

  const counters = await countersCollection();
  const docNo = await nextArDocNumber(counters, "RE");
  const now = nowIso();
  const docDate = now.slice(0, 10);
  const line: ArDocumentLine = {
    seq: 1,
    description: `รับชำระตามใบกำกับภาษีเลขที่ ${principal.docNo}`,
    qty: 1, unit: "รายการ",
    unitPrice: principal.netTotal, amount: principal.netTotal,
    linkedArDocumentId: principal._id.toString(),
  };
  const reDoc: ArDocumentFields = {
    scopeOfWorkId: principal.scopeOfWorkId,
    milestoneId: principal.milestoneId,
    docType: "RE",
    docNo,
    docDate,
    dueDate: docDate,
    paymentType: principal.paymentType,
    customerSnapshot: principal.customerSnapshot,
    reference: principal.docNo,
    lines: [line],
    subtotal: principal.netTotal, discount: 0, valueAmount: principal.netTotal,
    vatRate: 0, vatAmount: 0, netTotal: principal.netTotal,
    amountTextTh: bahtText(principal.netTotal),
    // Carries over the tax invoice's job-number/PO remarks; drops its first "% of contract value"
    // line, which describes the invoice's own amount breakdown, not the payment received.
    remarks: principal.remarks.slice(1),
    stockDeducted: false,
    isManual: principal.isManual,
    status: "issued",
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const insert = await arDocuments.insertOne(reDoc);

  // A manually-created principal has no milestone at all (milestoneId "") — toObjectId("") throws,
  // so this lookup must be skipped entirely for it rather than erroring the receipt out.
  if (principal.milestoneId) {
    const milestones = await arMilestonesCollection();
    const milestone = await milestones.findOne({ _id: toObjectId(principal.milestoneId) });
    if (milestone && !milestone.isDownPayment && milestone.billingStatus === "work_open") {
      await milestones.updateOne({ _id: milestone._id }, { $set: { billingStatus: "closed", updatedAt: now, updatedBy: ctx.user.id } });
    }
  }

  await writeArAuditEntry(ctx, "AR Receipt Issued (RE)", `ออกใบเสร็จรับเงิน ${docNo} สำหรับใบกำกับภาษี ${principal.docNo}`, {
    scopeOfWorkId: principal.scopeOfWorkId,
  });
  res.status(201).json({ document: withStringId({ ...reDoc, _id: insert.insertedId }) });
}

/** Cuts stock against an issued IV (ใบกำกับภาษี/ใบส่งสินค้า) — added 2026-08-18. Deliberately a
 * separate, incremental action rather than something that happens automatically at issue time: a
 * Quotation line item has no reliable link back to a real Product (QuoteLine carries no
 * `productId` — ProductPickerModal only ever copies name/unit/price into a fresh line once), so
 * staff pick which product(s)/quantities correspond to what actually left the warehouse, and may
 * do so in more than one pass over time (a single invoice can ship in parts). Each call writes one
 * StockMovementFields row per line via applyStockMovement() (the shared ledger, see
 * collections.ts) and flips `stockDeducted` true so the print stamp reflects it — never flipped
 * back false by a later call, since a document that's had ANY stock cut against it should read as
 * "ตัดสต๊อกแล้ว" from that point on. */
async function handleStockDeduction(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const doc = await loadDocumentOrThrow(id);
  if (doc.docType !== "IV") throw new HttpError(400, "ตัดสต๊อกได้เฉพาะใบกำกับภาษี/ใบส่งสินค้า (IV) เท่านั้น");
  if (doc.status !== "issued") throw new HttpError(400, "เอกสารนี้ถูกยกเลิกแล้ว ไม่สามารถตัดสต๊อกได้");

  const body = req.body ?? {};
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: { productId: string; qty: number }[] = rawLines
    .filter((l: unknown): l is { productId: unknown; qty: unknown } => typeof l === "object" && l !== null)
    .map((l: { productId: unknown; qty: unknown }) => ({
      productId: typeof l.productId === "string" ? l.productId : "",
      qty: typeof l.qty === "number" ? l.qty : NaN,
    }))
    .filter((l: { productId: string; qty: number }) => l.productId && Number.isFinite(l.qty) && l.qty > 0);
  if (lines.length === 0) throw new HttpError(400, "กรุณาเลือกสินค้าและระบุจำนวนอย่างน้อย 1 รายการ");

  const movements: (StockMovementFields & { id: string })[] = [];
  for (const line of lines) {
    const { movement } = await applyStockMovement({
      productId: line.productId,
      kind: "deduct",
      delta: -line.qty,
      reason: `ตัดสต๊อกตามใบกำกับภาษี ${doc.docNo}`,
      sourceType: "ar_document",
      sourceId: doc._id.toString(),
      sourceLabel: doc.docNo,
      userId: ctx.user.id,
    });
    movements.push(movement);
  }

  if (!doc.stockDeducted) {
    const arDocuments = await arDocumentsCollection();
    await arDocuments.updateOne({ _id: doc._id }, { $set: { stockDeducted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  }
  await writeArAuditEntry(ctx, "AR Stock Deducted", `ตัดสต๊อก ${lines.length} รายการสำหรับใบกำกับภาษี ${doc.docNo}`, {
    scopeOfWorkId: doc.scopeOfWorkId,
  });
  const updatedDoc = await loadDocumentOrThrow(id);
  res.status(201).json({ document: withStringId(updatedDoc), movements });
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
  // Cancelling the receipt that closed a non-deposit milestone reopens it — otherwise the job would
  // stay "จบ" with no active receipt backing that state.
  if (doc.docType === "RE") {
    const milestones = await arMilestonesCollection();
    const milestone = await milestones.findOne({ _id: toObjectId(doc.milestoneId) });
    if (milestone && !milestone.isDownPayment && milestone.billingStatus === "closed") {
      await milestones.updateOne({ _id: milestone._id }, { $set: { billingStatus: "work_open", updatedAt: now, updatedBy: ctx.user.id } });
    }
  }
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

// ─── Dashboard ──────────────────────────────────────────────────────────────

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const AR_DASHBOARD_TREND_MONTHS = 12;

/** "2026-08" -> "ส.ค. 69" — short Thai month label for the trend chart's x-axis. */
const THAI_MONTH_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return `${THAI_MONTH_SHORT[m - 1]} ${String((y + 543) % 100).padStart(2, "0")}`;
}

const AGING_BUCKETS = [
  { key: "notDue", label: "ยังไม่ครบกำหนด", max: 0 },
  { key: "d1_30", label: "เกินกำหนด 1-30 วัน", max: 30 },
  { key: "d31_60", label: "เกินกำหนด 31-60 วัน", max: 60 },
  { key: "d61_90", label: "เกินกำหนด 61-90 วัน", max: 90 },
  { key: "d90plus", label: "เกินกำหนดมากกว่า 90 วัน", max: Infinity },
] as const;

const BILLING_STATUS_ORDER: ArBillingStatus[] = ["not_billed", "billed", "work_open", "closed"];
const DOC_TYPE_ORDER: ArDocumentType[] = ["AR", "IV", "BI", "RE"];

/** Accounting Dashboard (added 2026-08-18) — a detail view separate from the main cross-module
 * Dashboard (`api/dashboard/index.ts`), scoped entirely to `ar_documents`/`ar_milestones`. Unlike
 * the main Dashboard, this needs no revision-chain dedup (AR documents have no revision concept —
 * a cancelled document just carries `status:"cancelled"` forever), so period sections use a single
 * date-bounded `find()` reduced in JS, same shape as every other route in this file, rather than a
 * Mongo aggregation pipeline.
 *
 * `from`/`to` (default: current month) scope the period-based sections (issued totals, VAT,
 * doc-type breakdown, top customers). **Aging, the billing funnel, and the deposit-not-billed count
 * are deliberately NOT period-filtered** — they're current-state snapshots ("what's outstanding
 * right now"), the only meaningful framing for an AR aging report; scoping them to `from`/`to` would
 * silently hide a still-unpaid invoice issued before the selected period. The trend chart is also
 * unaffected by `from`/`to` — it always shows a fixed rolling 12-month window, since the whole point
 * of a trend line is to give period selection something to compare against. See "Filter Honesty" in
 * docs/UI_GUIDELINES.md — the client must not imply these sections respect the date filter.
 *
 * `salesperson` (added 2026-08-18, matching the main Dashboard's own salesperson filter — "เหมือน
 * แดชบอร์ดภาพรวมเลย") is different in kind from `from`/`to`: it's an ownership dimension, not a time
 * window, so unlike the date filter it DOES apply to every section including the current-state
 * ones — "my outstanding invoices" is a meaningful filter, "my invoices issued last month" isn't a
 * reason to hide "my invoice from two months ago that's still unpaid." Resolved by joining through
 * each document's `scopeOfWorkId` to `ScopeOfWork.quotationSalesperson` (the snapshotted salesperson
 * name from the source Quote — `ScopeOfWork` has no salesperson field of its own; AR documents don't
 * carry one directly either, so this join is the only path to the same person concept the main
 * Dashboard filters `Quote.salesperson` by directly). */
async function handleDashboard(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "ar:view");

  const todayIso = nowIso().slice(0, 10);
  const toParam = typeof req.query.to === "string" ? req.query.to : "";
  const fromParam = typeof req.query.from === "string" ? req.query.from : "";
  const to = DATE_ONLY_RE.test(toParam) ? toParam : todayIso;
  const from = DATE_ONLY_RE.test(fromParam) ? fromParam : `${to.slice(0, 7)}-01`;
  if (from > to) throw new HttpError(400, "ช่วงวันที่ไม่ถูกต้อง (วันเริ่มต้นต้องไม่เกินวันสิ้นสุด)");
  const salesperson = typeof req.query.salesperson === "string" ? req.query.salesperson.trim() : "";

  const toDate = new Date(`${to}T00:00:00Z`);
  const trendStart = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() - (AR_DASHBOARD_TREND_MONTHS - 1), 1));
  const trendFrom = trendStart.toISOString().slice(0, 10);
  const queryFrom = trendFrom < from ? trendFrom : from;

  const arDocuments = await arDocumentsCollection();
  const [periodDocsAll, taxInvoicesAll, receipts, milestonesAll, scopesAll] = await Promise.all([
    arDocuments.find({ docDate: { $gte: queryFrom, $lte: to } })
      .project<Pick<ArDocumentFields, "docType" | "docDate" | "status" | "netTotal" | "vatAmount" | "customerSnapshot" | "scopeOfWorkId">>(
        { docType: 1, docDate: 1, status: 1, netTotal: 1, vatAmount: 1, customerSnapshot: 1, scopeOfWorkId: 1 },
      ).toArray(),
    arDocuments.find({ docType: { $in: ["AR", "IV"] }, status: "issued" })
      .project<Pick<ArDocumentFields, "docNo" | "docType" | "dueDate" | "netTotal" | "scopeOfWorkId" | "customerSnapshot"> & { _id: unknown }>(
        { docNo: 1, docType: 1, dueDate: 1, netTotal: 1, scopeOfWorkId: 1, customerSnapshot: 1 },
      ).toArray(),
    arDocuments.find({ docType: "RE", status: "issued" }).project<{ lines: ArDocumentLine[] }>({ lines: 1 }).toArray(),
    (await arMilestonesCollection()).find({}).project<Pick<ArMilestoneFields, "billingStatus" | "isDownPayment" | "scopeOfWorkId">>(
      { billingStatus: 1, isDownPayment: 1, scopeOfWorkId: 1 },
    ).toArray(),
    (await scopeOfWorksCollection()).find({ isDeleted: { $ne: true } })
      .project<{ _id: unknown; scopeNumber: string; quotationSalesperson?: string }>({ scopeNumber: 1, quotationSalesperson: 1 }).toArray(),
  ]);

  // พนักงานขาย ผูกผ่าน scopeOfWorkId -> ScopeOfWork.quotationSalesperson (snapshot จากใบเสนอราคาต้นทาง)
  // — เอกสารบัญชีเองไม่มีฟิลด์พนักงานขายโดยตรง ดู doc comment ของฟังก์ชันนี้
  const salespersonByScopeId = new Map(scopesAll.map((s) => [String(s._id), (s.quotationSalesperson ?? "").trim()]));
  const availableSalespeople = [...new Set(scopesAll.map((s) => (s.quotationSalesperson ?? "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "th"));
  const matchesSalesperson = (scopeOfWorkId: string) => !salesperson || salespersonByScopeId.get(scopeOfWorkId) === salesperson;

  const periodDocs = periodDocsAll.filter((d) => matchesSalesperson(d.scopeOfWorkId));
  const taxInvoices = taxInvoicesAll.filter((d) => matchesSalesperson(d.scopeOfWorkId));
  const milestones = milestonesAll.filter((m) => matchesSalesperson(m.scopeOfWorkId));
  const scopes = scopesAll.filter((s) => matchesSalesperson(String(s._id)));

  const paidInvoiceIds = new Set<string>();
  for (const re of receipts) {
    for (const line of re.lines) {
      if (line.linkedArDocumentId) paidInvoiceIds.add(line.linkedArDocumentId);
    }
  }
  const outstandingInvoices = taxInvoices.filter((d) => !paidInvoiceIds.has(String(d._id)));

  // เลขที่งาน (Scope of Work) สำหรับใบที่ค้างชำระ — ใช้รายการเต็มเสมอ (ไม่กรองตามพนักงานขาย) เพราะแค่
  // แปลง scopeOfWorkId เป็นเลขที่งานที่อ่านง่าย ไม่ใช่ข้อมูลที่ต้องกรอง
  const scopeNumberById = new Map(scopesAll.map((s) => [String(s._id), s.scopeNumber]));

  const now = new Date(`${todayIso}T00:00:00Z`).getTime();
  const agingBucketCounts = AGING_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: 0, amount: 0 }));
  const agingInvoices = outstandingInvoices
    .map((d) => {
      const daysOverdue = Math.round((now - new Date(`${d.dueDate}T00:00:00Z`).getTime()) / 86_400_000);
      const bucketIndex = AGING_BUCKETS.findIndex((b) => daysOverdue <= b.max);
      const bucket = AGING_BUCKETS[bucketIndex === -1 ? AGING_BUCKETS.length - 1 : bucketIndex];
      agingBucketCounts[bucketIndex === -1 ? AGING_BUCKETS.length - 1 : bucketIndex].count += 1;
      agingBucketCounts[bucketIndex === -1 ? AGING_BUCKETS.length - 1 : bucketIndex].amount += d.netTotal;
      return {
        id: String(d._id), docNo: d.docNo, docType: d.docType as "AR" | "IV",
        scopeOfWorkId: d.scopeOfWorkId, scopeNumber: scopeNumberById.get(d.scopeOfWorkId) ?? "",
        customerName: d.customerSnapshot.companyName, dueDate: d.dueDate, daysOverdue, amount: d.netTotal,
        bucketKey: bucket.key,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 30);

  const billedDepositScopeIds = new Set(taxInvoices.filter((d) => d.docType === "AR").map((d) => d.scopeOfWorkId));
  const depositNotBilledJobs = scopes.filter((s) => !billedDepositScopeIds.has(String(s._id))).length;

  const billingFunnelCounts = new Map<ArBillingStatus, number>(BILLING_STATUS_ORDER.map((s) => [s, 0]));
  for (const m of milestones) billingFunnelCounts.set(m.billingStatus, (billingFunnelCounts.get(m.billingStatus) ?? 0) + 1);
  const billingFunnel = BILLING_STATUS_ORDER.map((status) => ({ status, count: billingFunnelCounts.get(status) ?? 0 }));

  // Trend: ยอดใบกำกับภาษี (AR+IV เท่านั้น — ไม่รวม BI/RE ที่แค่อ้างถึงยอดเดียวกันซ้ำ) รายเดือน 12 เดือนล่าสุด
  const monthBuckets: { month: string; label: string; netTotal: number; count: number }[] = [];
  for (let i = AR_DASHBOARD_TREND_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() - i, 1));
    const month = d.toISOString().slice(0, 7);
    monthBuckets.push({ month, label: monthLabel(month), netTotal: 0, count: 0 });
  }
  const monthIndex = new Map(monthBuckets.map((b, i) => [b.month, i]));
  for (const d of periodDocs) {
    if (d.status !== "issued" || (d.docType !== "AR" && d.docType !== "IV")) continue;
    const idx = monthIndex.get(d.docDate.slice(0, 7));
    if (idx === undefined) continue;
    monthBuckets[idx].netTotal = round2(monthBuckets[idx].netTotal + d.netTotal);
    monthBuckets[idx].count += 1;
  }

  // ช่วงที่เลือก (from..to) — สำหรับ KPI/สัดส่วนประเภทเอกสาร/ลูกค้ารายใหญ่ เท่านั้น
  const inPeriod = periodDocs.filter((d) => d.docDate >= from && d.docDate <= to);
  const inPeriodIssued = inPeriod.filter((d) => d.status === "issued");
  const inPeriodTaxInvoices = inPeriodIssued.filter((d) => d.docType === "AR" || d.docType === "IV");

  const docTypeBreakdown = DOC_TYPE_ORDER.map((docType) => {
    const docs = inPeriodIssued.filter((d) => d.docType === docType);
    return { docType, count: docs.length, netTotal: round2(docs.reduce((s, d) => s + d.netTotal, 0)) };
  });

  const outstandingByCustomer = new Map<string, number>();
  for (const d of outstandingInvoices) {
    const key = d.customerSnapshot.companyName;
    outstandingByCustomer.set(key, (outstandingByCustomer.get(key) ?? 0) + d.netTotal);
  }
  const customerTotals = new Map<string, { count: number; netTotal: number }>();
  for (const d of inPeriodTaxInvoices) {
    const key = d.customerSnapshot.companyName;
    const cur = customerTotals.get(key) ?? { count: 0, netTotal: 0 };
    customerTotals.set(key, { count: cur.count + 1, netTotal: round2(cur.netTotal + d.netTotal) });
  }
  const topCustomers = [...customerTotals.entries()]
    .map(([customerName, v]) => ({ customerName, count: v.count, netTotal: v.netTotal, outstandingNet: round2(outstandingByCustomer.get(customerName) ?? 0) }))
    .sort((a, b) => b.netTotal - a.netTotal)
    .slice(0, 8);

  res.status(200).json({
    hasAnyData: taxInvoicesAll.length > 0 || periodDocsAll.length > 0,
    filters: { from, to, salesperson },
    availableSalespeople,
    kpis: {
      issuedNet: round2(inPeriodTaxInvoices.reduce((s, d) => s + d.netTotal, 0)),
      issuedCount: inPeriodTaxInvoices.length,
      vatAmount: round2(inPeriodTaxInvoices.reduce((s, d) => s + d.vatAmount, 0)),
      outstandingNet: round2(outstandingInvoices.reduce((s, d) => s + d.netTotal, 0)),
      outstandingCount: outstandingInvoices.length,
      depositNotBilledJobs,
      cancelledCount: inPeriod.filter((d) => d.status === "cancelled").length,
    },
    trend: monthBuckets,
    docTypeBreakdown,
    billingFunnel,
    aging: { buckets: agingBucketCounts, invoices: agingInvoices },
    topCustomers,
  });
}

// ─── Dispatch ─────────────────────────────────────────────────────────────

export async function handleAr(req: VercelRequest, res: VercelResponse): Promise<void> {
  const pathname = (req.url ?? "").split("?")[0];

  if (pathname === "/api/ar-dashboard") return handleDashboard(req, res);

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
  if (pathname === "/api/ar-documents/manual") return handleManualIssue(req, res);
  const docParts = getPathSegments(req, "/api/ar-documents");
  if (docParts.length === 1) return handleDocumentOne(req, res, docParts[0]);
  if (docParts.length === 2 && docParts[1] === "receipt") return handleIssueReceipt(req, res, docParts[0]);
  if (docParts.length === 2 && docParts[1] === "cancel") return handleDocumentCancel(req, res, docParts[0]);
  if (docParts.length === 2 && docParts[1] === "stock-deduction") return handleStockDeduction(req, res, docParts[0]);

  throw new HttpError(404, "Not found");
}
