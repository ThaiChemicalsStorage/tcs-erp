import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WithId, ObjectId } from "mongodb";
import { MongoServerError } from "mongodb";
import { randomUUID, randomBytes } from "node:crypto";
import { HttpError, getPathSegments, isAutoSaveRequest } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildOwnershipClause } from "./visibility.js";
import {
  scopeOfWorksCollection, quotesCollection, usersCollection, countersCollection, auditLogCollection,
  notificationsCollection, scopeAttachmentFilesCollection, toObjectId, withStringId,
  type ScopeOfWorkFields, type QuoteFields,
} from "./collections.js";
import { Binary } from "mongodb";
import { roleHasPermission, findRole } from "../../src/lib/roles.js";
import { rolesCollection } from "./collections.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty, sanitizeBoolean } from "./quoteValidation.js";
import { buildDefaultChecklistGroups, withDefaultChecklistGroups, sanitizeChecklistGroups } from "./documentRequirements.js";
import { validateScopeOfWorkForFinalization, validateScopeOfWorkForPrint } from "../../src/lib/validation/scopeOfWorkValidation.js";
import { getRevisionRoot } from "./quoteRevisions.js";
import { assertScopeHasNoBilledMilestones } from "./arHandler.js";
import { ADDITIONAL_RECIPIENT_KEY, ALL_RECIPIENT_KEYS, DOCUMENT_RECIPIENT_DEPARTMENTS, type ChecklistGroup } from "../../src/lib/documentRequirements.js";
import { normalizePaymentConditions, normalizeDocumentRecipients } from "../../src/lib/scopeOfWork.js";
import type { NotificationType } from "../../src/lib/notifications.js";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_SCOPE } from "../../src/lib/scopeOfWork.js";
import type {
  ScopeOfWork, ScopeOfWorkSummary, ScopeOfWorkListItem, ScopeOfWorkStatus,
  ScopeOfWorkItem, ScopeOfWorkSpecLine, ScopeOfWorkPaymentConditions, ScopeOfWorkPaymentInstallment,
  ScopeOfWorkPaymentType, ScopeOfWorkSignatory, ScopeOfWorkCustomerSnapshot, ScopeOfWorkAttachment,
} from "../../src/lib/scopeOfWork.js";

/**
 * Scope of Work API (added 2026-07-15) — `api/handlers/quotes.ts` dispatches
 * `/api/scope-of-works` here on the raw pathname, sharing that function file rather than getting
 * its own (Vercel Hobby's 12-function cap is still fully used — see docs/ARCHITECTURE.md). Mounted
 * from the quotes handler (not jobtypes.ts) since a Scope of Work is created from, and always
 * belongs to, exactly one quotation. See docs/MODULES/ScopeOfWork.md for the full feature writeup
 * and PDF-to-field mapping.
 */

// ─── Audit ──────────────────────────────────────────────────────────────────────────────────────

async function writeScopeAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
  related: { scopeId?: string; scopeNumber?: string; quoteId?: string },
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "Scope of Work",
    action,
    details,
    createdAt: nowIso(),
    ...(related.scopeId ? { relatedScopeId: related.scopeId } : {}),
    ...(related.scopeNumber ? { relatedScopeNumber: related.scopeNumber } : {}),
    ...(related.quoteId ? { relatedQuoteId: related.quoteId } : {}),
  });
}

// ─── Scope number entry (manual-ONLY as of 2026-07-29, owner: "ระบบไม่ต้องสร้างเลขเองดิ") ────────
// The system no longer generates scope numbers at all — the user TYPES the document number at
// creation (and on Duplicate), completely free-form per the owner's explicit format decision
// (no forced prefix/pattern). The server's job is only: required-non-blank, and uniqueness
// (friendly pre-check + the unique `scopeNumber` index as the race-safe backstop). The old
// `PQ{YYYYMM}-{seq}-{jobType}-{secondaryCode}` generator, its atomic monthly counter, and the
// `yearMonth`/`jobSequence` fields are legacy: kept as-is on old records, written as ""/0 on new
// ones, never migrated. Rewrite still appends `-R{n}` to whatever was typed (see handleRewrite).

/** Uniform required-non-blank sanitation for a user-typed document number. Free text by explicit
 * owner decision (2026-07-29) — no format guardrails beyond non-blank + the shared length cap. */
function sanitizeScopeNumber(raw: unknown): string {
  return sanitizeShortText(raw, "เลขที่เอกสาร", true);
}

const DUPLICATE_SCOPE_NUMBER_MESSAGE = (scopeNumber: string) =>
  `เลขที่เอกสาร "${scopeNumber}" ถูกใช้กับ Scope of Work ใบอื่นแล้ว กรุณาใช้เลขอื่น`;

/** Friendly-duplicate pre-check. Soft-deleted records still hold their number (the unique index
 * doesn't exclude them), so they block reuse too — deliberate: "restoring" a number whose old
 * document still exists in the database would make the audit trail ambiguous. Race-safe only in
 * combination with the unique index (`insertOne`/`updateOne` catch 11000 → the same 409). */
async function assertScopeNumberAvailable(
  scopeOfWorks: Awaited<ReturnType<typeof scopeOfWorksCollection>>,
  scopeNumber: string,
  excludeId?: ObjectId,
): Promise<void> {
  const clash = await scopeOfWorks.findOne(
    { scopeNumber, ...(excludeId ? { _id: { $ne: excludeId } } : {}) },
    { projection: { _id: 1 } },
  );
  if (clash) throw new HttpError(409, DUPLICATE_SCOPE_NUMBER_MESSAGE(scopeNumber));
}

/** `ensureIndexes()` (api/_lib/collections.ts) only runs from the one-time Setup Wizard bootstrap,
 * permanently unreachable on an already-provisioned deployment — same gap and same
 * once-per-warm-instance defensive fix as `ensureAttachmentIndexes()` below. Guarantees the
 * unique `scopeNumber` index (now the ONE uniqueness mechanism for manually-typed numbers) really
 * exists, and drops the legacy `{yearMonth, jobSequence}` unique index if present — new records
 * all write `{"", 0}` there, which that index would reject from the second record onward. */
let scopeNumberIndexesEnsured = false;
async function ensureScopeNumberIndexes(
  scopeOfWorks: Awaited<ReturnType<typeof scopeOfWorksCollection>>,
): Promise<void> {
  if (scopeNumberIndexesEnsured) return;
  try {
    await scopeOfWorks.createIndex({ scopeNumber: 1 }, { unique: true });
  } catch (err) {
    // Most likely pre-existing duplicate data — the pre-check above still catches ordinary cases;
    // log loudly rather than block every create on an index-management problem.
    console.error("[scope-of-works] failed to ensure unique scopeNumber index", err);
  }
  try {
    await scopeOfWorks.dropIndex("yearMonth_1_jobSequence_1");
  } catch {
    // Already gone (or never created on this deployment — see the doc comment above): fine.
  }
  scopeNumberIndexesEnsured = true;
}

/** Atomically reserves the next revision number for a "Rewrite/แก้ไข" chain (see `handleRewrite()`
 * below), keyed by the chain's root `scopeNumber` — same `counters` collection +
 * `findOneAndUpdate($inc)` idiom as `nextJobSequence()` above and Quotation's `nextRevisionNumber()`
 * (`api/handlers/quotes.ts`). No bootstrap needed: a brand-new counter namespace with no
 * pre-existing `-R`-suffixed scope numbers to reconcile against. */
async function nextScopeRevisionNumber(
  counters: Awaited<ReturnType<typeof countersCollection>>,
  rootScopeNumber: string,
): Promise<number> {
  const result = await counters.findOneAndUpdate(
    { _id: `scope_revision_${rootScopeNumber}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return result?.seq ?? 1;
}

// ─── Quotation -> Scope of Work snapshot mapping ──────────────────────────────────────────────────

function mapLineToScopeItem(line: QuoteFields["lines"][number]): ScopeOfWorkItem {
  if (line.isSectionHeader) {
    return { id: randomUUID(), name: line.description, specifications: [], quantity: null, unit: "", remark: "", isSectionHeader: true };
  }
  // QuoteLine.notes/.specifications were removed 2026-07-21 (unused feature, see CHANGELOG.md) —
  // specLines now comes from subDetails alone (which already carries any former specifications
  // content, folded in at the QuoteLine level — see applyTemplate.ts), and remark starts blank
  // (freely editable afterward in ScopeOfWorkItemsEditor.tsx, same as any other snapshot field with
  // no upstream source left to seed it from).
  const specLines: ScopeOfWorkSpecLine[] = line.subDetails.filter((sd) => sd.text.trim()).map((sd) => ({ id: randomUUID(), text: sd.text.trim() }));
  return { id: randomUUID(), name: line.description, specifications: specLines, quantity: line.qty, unit: line.unit, remark: "", isSectionHeader: false };
}

function buildCustomerSnapshot(quote: QuoteFields): ScopeOfWorkCustomerSnapshot {
  const snap = quote.customerSnapshot;
  return {
    companyName: snap?.companyName || quote.client,
    // 2026-07-15, Codex review High Priority fix: the quotation's generic contact name was
    // previously dropped entirely instead of retained — real quotation data, not a sample value.
    contactName: snap?.contactName || quote.contactName,
    address: snap?.address || quote.address,
    taxId: snap?.taxId || quote.taxId,
    phone: snap?.phone || quote.contactPhone,
    email: snap?.email || quote.contactEmail,
    projectName: snap?.projectName || quote.project,
  };
}

/**
 * Default `seller` signatory for a newly created Scope of Work — 2026-07-15, Codex review High
 * Priority fix: previously always the creating user, which dropped the quotation's actual assigned
 * salesperson entirely. Now prefers `quote.salesperson` (real quotation data) when non-empty,
 * falling back to the creator only when the quotation itself has no salesperson recorded. When the
 * salesperson name matches a real ERP user account, that user's id is linked too (so their saved
 * `signatureDataUrl` renders at print time, same as the creator-fallback case) — a name-only match
 * (not stored anywhere as a foreign key on `Quote`, since `salesperson` is free text) is the best
 * available correlation; an unmatched name is still used as plain text with no `userId` link.
 * Always freely editable afterward — this is only the starting value.
 */
async function resolveDefaultSeller(quote: QuoteFields, ctx: AuthContext): Promise<ScopeOfWorkSignatory> {
  const salesperson = quote.salesperson.trim();
  if (!salesperson) return { name: ctx.user.fullName, userId: ctx.user.id, date: "" };
  const users = await usersCollection();
  const match = await users.findOne({ fullName: salesperson });
  return { name: salesperson, userId: match ? match._id.toString() : "", date: "" };
}

/** Deep-copies a checklist-groups array (fresh option objects per group) — used both here (snapshot
 * at Scope of Work creation) and by `handleDuplicate` below, so a later edit to one copy's option
 * objects can never be an aliased mutation of another record's array. */
function cloneChecklistGroups(groups: ChecklistGroup[]): ChecklistGroup[] {
  return groups.map((g) => ({ ...g, options: g.options.map((o) => ({ ...o })) }));
}

/**
 * The fields pulled/derived from a quotation at Scope of Work creation time — everything else
 * (header fields like drawingCode/deliveryDate, signatures) starts blank/default and is filled in by
 * the user afterward. Reused by both `handleCreate` and `handleRefresh` ("อัปเดตข้อมูลจากใบเสนอราคา")
 * so the two can never drift apart in what counts as "quotation-derived" content.
 *
 * `checklistGroups`: Quotation no longer carries a `checklistGroups` field of its own (2026-07-16,
 * "Make Quotation Fields Optional and Remove Document Requirements and Delivery" — that section was
 * removed from Quotation entirely per an explicit business decision). Scope of Work's own checklist
 * feature is unaffected — it still always starts from `buildDefaultChecklistGroups(jobTypeCode)`,
 * exactly as it did before the short-lived Quotation-side "copy from quotation" behavior existed.
 */
function deriveFromQuotation(quote: QuoteFields & { _id: string }): {
  quotationNumber: string; jobTypeCode: string; jobTypeName: string; quotationSalesperson: string;
  customerSnapshot: ScopeOfWorkCustomerSnapshot; customerPoNumber: string; deliveryLocation: string;
  remarks: string; items: ScopeOfWorkItem[]; paymentDescription: string; checklistGroups: ChecklistGroup[];
} {
  return {
    quotationNumber: quote._id,
    jobTypeCode: quote.jobTypeCode,
    jobTypeName: quote.jobTypeName,
    // 2026-07-15, Codex review High Priority fix: previously dropped entirely — see
    // `ScopeOfWork.quotationSalesperson`'s doc comment (src/lib/scopeOfWork.ts).
    quotationSalesperson: quote.salesperson,
    customerSnapshot: buildCustomerSnapshot(quote),
    customerPoNumber: quote.poRef,
    deliveryLocation: quote.deliveryAddress,
    remarks: quote.remarks,
    items: quote.lines.map(mapLineToScopeItem),
    paymentDescription: quote.paymentTerms,
    checklistGroups: buildDefaultChecklistGroups(quote.jobTypeCode),
  };
}

// ─── Permission helpers ────────────────────────────────────────────────────────────────────────

function isOwnerOf(ctx: AuthContext, doc: { createdBy: string }): boolean {
  return !doc.createdBy || doc.createdBy === ctx.user.id;
}

/** Sales can only edit their own Draft; anyone holding `scopeOfWork:finalize` (Sales Manager/Admin,
 * per the RBAC spec's "Sales Manager: view/edit/finalize") can edit any non-finalized record. */
function canEditScope(ctx: AuthContext, doc: { createdBy: string }): boolean {
  if (!roleHasPermission(ctx.role, "scopeOfWork:edit")) return false;
  return isOwnerOf(ctx, doc) || roleHasPermission(ctx.role, "scopeOfWork:finalize");
}

// ─── Sanitizers ─────────────────────────────────────────────────────────────────────────────────

const MAX_ITEMS = 300;
const MAX_SPEC_LINES = 100;

function sanitizeSpecLine(raw: unknown, itemIdx: number, specIdx: number): ScopeOfWorkSpecLine {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: typeof r.id === "string" && r.id ? r.id : randomUUID(),
    text: sanitizeShortText(r.text, `รายละเอียดย่อยที่ ${specIdx + 1} ของรายการที่ ${itemIdx + 1}`),
  };
}

function sanitizeScopeItem(raw: unknown, index: number): ScopeOfWorkItem {
  if (typeof raw !== "object" || raw === null) throw new HttpError(400, `รายการที่ ${index + 1} ไม่ถูกต้อง`);
  const r = raw as Record<string, unknown>;
  const rawSpecs = Array.isArray(r.specifications) ? r.specifications : [];
  if (rawSpecs.length > MAX_SPEC_LINES) throw new HttpError(400, `รายการที่ ${index + 1} มีรายละเอียดย่อยมากเกินไป`);
  const quantity = r.quantity === null || r.quantity === undefined ? null : (typeof r.quantity === "number" && Number.isFinite(r.quantity) ? r.quantity : null);
  return {
    id: typeof r.id === "string" && r.id ? r.id : randomUUID(),
    name: sanitizeShortText(r.name, `ชื่อรายการที่ ${index + 1}`),
    specifications: rawSpecs.map((s, i) => sanitizeSpecLine(s, index, i)),
    quantity,
    unit: sanitizeShortText(r.unit, `หน่วยของรายการที่ ${index + 1}`),
    remark: sanitizeLongText(r.remark, `หมายเหตุของรายการที่ ${index + 1}`),
    isSectionHeader: sanitizeBoolean(r.isSectionHeader, `ประเภทของรายการที่ ${index + 1}`),
  };
}

function sanitizeItems(raw: unknown): ScopeOfWorkItem[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "รูปแบบรายการไม่ถูกต้อง");
  if (raw.length > MAX_ITEMS) throw new HttpError(400, `มีรายการมากเกินไป (สูงสุด ${MAX_ITEMS} รายการ)`);
  return raw.map((it, i) => sanitizeScopeItem(it, i));
}

function sanitizePercent(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100) throw new HttpError(400, "เปอร์เซ็นต์ต้องอยู่ระหว่าง 0 ถึง 100");
  return v;
}

const MAX_PAYMENT_INSTALLMENTS = 20;
const VALID_PAYMENT_TYPES = new Set<ScopeOfWorkPaymentType>(["", "Cash", "Credit"]);
const MAX_PAYMENT_DAYS = 3650;

function sanitizePaymentType(v: unknown, index: number): ScopeOfWorkPaymentType {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v !== "string" || !VALID_PAYMENT_TYPES.has(v as ScopeOfWorkPaymentType)) {
    throw new HttpError(400, `วิธีการชำระเงินของงวดที่ ${index + 1} ไม่ถูกต้อง`);
  }
  return v as ScopeOfWorkPaymentType;
}

function sanitizePaymentDays(v: unknown, index: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > MAX_PAYMENT_DAYS || !Number.isInteger(v)) {
    throw new HttpError(400, `จำนวนวันของงวดที่ ${index + 1} ไม่ถูกต้อง`);
  }
  return v;
}

function sanitizePaymentInstallment(raw: unknown, index: number): ScopeOfWorkPaymentInstallment {
  if (typeof raw !== "object" || raw === null) throw new HttpError(400, `งวดชำระเงินที่ ${index + 1} ไม่ถูกต้อง`);
  const r = raw as Record<string, unknown>;
  return {
    id: typeof r.id === "string" && r.id ? r.id : randomUUID(),
    pct: sanitizePercent(r.pct),
    label: sanitizeShortText(r.label, `รายละเอียดงวดชำระเงินที่ ${index + 1}`),
    paymentType: sanitizePaymentType(r.paymentType, index),
    days: sanitizePaymentDays(r.days, index),
  };
}

/** `installments` replaced the previous fixed `{downPaymentPct, finalPaymentPct, method}` pair on
 * 2026-07-23 — see `ScopeOfWorkPaymentConditions` in src/lib/scopeOfWork.ts. A record saved before
 * that stays in the legacy shape in MongoDB until it's next edited through this function, at which
 * point it's persisted in the new shape for good; reads of an untouched legacy record are handled
 * separately by `normalizePaymentConditions()` (see `normalizeScope()`/`toValidationInput()` below). */
function sanitizePaymentConditions(raw: unknown): ScopeOfWorkPaymentConditions {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawInstallments = Array.isArray(r.installments) ? r.installments : [];
  if (rawInstallments.length > MAX_PAYMENT_INSTALLMENTS) throw new HttpError(400, `มีงวดชำระเงินมากเกินไป (สูงสุด ${MAX_PAYMENT_INSTALLMENTS} งวด)`);
  return {
    installments: rawInstallments.map((it, i) => sanitizePaymentInstallment(it, i)),
    description: sanitizeLongText(r.description, "รายละเอียดการชำระเงิน"),
    notes: sanitizeLongText(r.notes, "หมายเหตุการชำระเงิน"),
  };
}

const MAX_RECIPIENTS_PER_DEPARTMENT = 20;
const VALID_RECIPIENT_DEPARTMENT_KEYS = new Set(ALL_RECIPIENT_KEYS);

/** `documentRecipients` maps a `documentsToSend` checklist option key — or the free-pick
 * `ADDITIONAL_RECIPIENT_KEY` ("ผู้รับเพิ่มเติม", added 2026-08-07, not tied to any checklist
 * checkbox) — to the `User.id`s picked as recipients. Added 2026-07-23, see
 * `ScopeOfWork.documentRecipients`'s doc comment. Unknown keys (e.g. a stale checklist `"other"`
 * or a garbage key) are silently dropped rather than rejected, same defensive-clamp philosophy as
 * `sanitizeChecklistGroups()`'s single-selection clamp — a client can never route to something that
 * isn't a real routing target. Every referenced user id is verified to actually exist via one
 * batched query rather than N individual ones. */
async function sanitizeDocumentRecipients(raw: unknown): Promise<Record<string, string[]>> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new HttpError(400, "รูปแบบผู้รับเอกสารไม่ถูกต้อง");
  const entries = Object.entries(raw as Record<string, unknown>).filter(([key]) => VALID_RECIPIENT_DEPARTMENT_KEYS.has(key));
  const allIds = new Set<string>();
  for (const [, value] of entries) {
    if (!Array.isArray(value)) throw new HttpError(400, "รูปแบบผู้รับเอกสารไม่ถูกต้อง");
    if (value.length > MAX_RECIPIENTS_PER_DEPARTMENT) throw new HttpError(400, `มีผู้รับเอกสารมากเกินไป (สูงสุด ${MAX_RECIPIENTS_PER_DEPARTMENT} คนต่อแผนก)`);
    for (const id of value) {
      if (typeof id !== "string" || !id) throw new HttpError(400, "รูปแบบผู้รับเอกสารไม่ถูกต้อง");
      allIds.add(id);
    }
  }
  if (allIds.size === 0) return {};
  const objectIds = [...allIds].map((id) => toObjectId(id)); // throws HttpError(400) on a malformed id
  const users = await usersCollection();
  const found = await users.find({ _id: { $in: objectIds } }, { projection: { _id: 1 } }).toArray();
  const foundIds = new Set(found.map((u) => u._id.toString()));
  const missing = [...allIds].filter((id) => !foundIds.has(id));
  if (missing.length > 0) throw new HttpError(400, "ไม่พบผู้ใช้งานที่เลือกเป็นผู้รับเอกสารบางราย");
  const out: Record<string, string[]> = {};
  for (const [key, value] of entries) out[key] = [...new Set(value as string[])];
  return out;
}

async function sanitizeSignatory(raw: unknown, label: string): Promise<ScopeOfWorkSignatory> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const userId = typeof r.userId === "string" ? r.userId.trim() : "";
  if (userId) {
    const users = await usersCollection();
    const objectId = toObjectId(userId); // throws HttpError(400) on a malformed id
    const found = await users.findOne({ _id: objectId });
    if (!found) throw new HttpError(400, `ไม่พบผู้ใช้งานที่เลือกสำหรับ ${label}`);
  }
  return {
    name: sanitizeShortText(r.name, `ชื่อ${label}`),
    userId,
    date: validateIsoDateOrEmpty(r.date, `วันที่${label}`),
  };
}

// ─── Handlers ───────────────────────────────────────────────────────────────────────────────────

function toSummary(doc: WithId<ScopeOfWorkFields>): ScopeOfWorkSummary {
  const full = withStringId(doc);
  return { id: full.id, scopeNumber: full.scopeNumber, quotationId: full.quotationId, status: full.status, updatedAt: full.updatedAt };
}

/** Richer row shape for the standalone Scope of Work management page's list (added 2026-07-22) —
 * see `ScopeOfWorkListItem` in src/lib/scopeOfWork.ts for why this is a separate shape from
 * `toSummary()` above, which only ever needs to answer "does one exist for this quotation?"
 *
 * MongoDB enforces no schema — a record that predates a given field (or one written outside this
 * app's own API) could have any of these `undefined`, and `JSON.stringify()` silently *drops* an
 * `undefined`-valued key from the response entirely rather than sending `null` — the client would
 * then find the key simply missing and crash calling `.trim()`/`.toLowerCase()` on it (a real
 * incident: this shipped without these fallbacks and the standalone list page went blank white on
 * first real data, since this app has no top-level error boundary — see App.tsx's `ErrorBoundary`,
 * added the same day). Every field is defaulted here once, the same "normalize once, not at every
 * call site" pattern `api/dashboard/index.ts` already uses for `client ?? ""`/`salesperson ?? ""`. */
function toListItem(doc: WithId<ScopeOfWorkFields>): ScopeOfWorkListItem {
  const full = withStringId(doc);
  return {
    id: full.id,
    scopeNumber: full.scopeNumber ?? "",
    secondaryCode: full.secondaryCode ?? "",
    quotationId: full.quotationId ?? "",
    quotationNumber: full.quotationNumber ?? "",
    jobTypeCode: full.jobTypeCode ?? "",
    jobTypeName: full.jobTypeName ?? "",
    customerName: full.customerSnapshot?.companyName ?? "",
    // Added 2026-07-22 for the standalone list page's Salesperson filter, mirroring QuoteList.tsx —
    // `ScopeOfWork.quotationSalesperson` is a frozen-at-creation-time snapshot of the source
    // quotation's salesperson, same provenance rationale as every other snapshotted field here.
    quotationSalesperson: full.quotationSalesperson ?? "",
    // Added 2026-07-29 for the list's "ยังไม่มี PO" badge/filter (the "ทวง PO" feature).
    customerPoNumber: full.customerPoNumber ?? "",
    issueDate: full.issueDate ?? "",
    deliveryDate: full.deliveryDate ?? "",
    status: full.status ?? "Draft",
    updatedAt: full.updatedAt ?? "",
  };
}

/** Fills in any mandatory checklist group entirely missing from a stored record (see
 * withDefaultChecklistGroups()) before sending it to the client — never written back to the
 * database by this alone. See normalizeQuote() in api/handlers/quotes.ts for the equivalent.
 * Also normalizes `paymentConditions` (2026-07-23) into the current `installments`-array shape —
 * a record saved before that pass still has the legacy `{downPaymentPct, finalPaymentPct, method}`
 * pair in MongoDB; see `normalizePaymentConditions()` in src/lib/scopeOfWork.ts. */
function normalizeScope(scope: ScopeOfWork): ScopeOfWork {
  return {
    ...scope,
    checklistGroups: withDefaultChecklistGroups(scope.checklistGroups, scope.jobTypeCode),
    paymentConditions: normalizePaymentConditions(scope.paymentConditions),
    // A record saved before 2026-07-23 has no `documentRecipients` field in MongoDB at all — see
    // normalizeDocumentRecipients()'s own doc comment.
    documentRecipients: normalizeDocumentRecipients(scope.documentRecipients),
    // Same "record predates this field" defaulting as documentRecipients above.
    revisionNote: scope.revisionNote ?? "",
    documentRecipientMessage: scope.documentRecipientMessage ?? "",
    // Pre-2026-07-24 records have no `attachments` field at all — the client type declares it
    // non-optional, so default it here rather than trusting every consumer to `?? []`.
    attachments: scope.attachments ?? [],
  };
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:view");
  const quotationId = typeof req.query.quotationId === "string" ? req.query.quotationId : "";

  const scopeOfWorks = await scopeOfWorksCollection();
  // Omitting `quotationId` switches this from "does one exist for this quotation?" (used by
  // QuoteDocument.tsx's toolbar) to "list every Scope of Work company-wide" — added 2026-07-22 for
  // the new standalone Scope of Work management page (src/pages/scopeOfWork/ScopeOfWorkPage.tsx).
  if (!quotationId) {
    // Tiered visibility (added 2026-07-23 as own-only-vs-viewAll, extended 2026-08-14 with
    // viewTeam/viewDepartment for Sales' 2-team split) — see buildOwnershipClause() for the full
    // cascade. On top of whichever tier applies, a caller who was named as a **document
    // recipient** (added 2026-07-23, second pass — see "Document Recipients": a Purchase-department
    // recipient who never created the record still needs to be able to find it on their own list,
    // not just via the one-time email/notification link) always sees the record too, merged into
    // the same `$or`. Legacy/seed records with an empty `createdBy` (ownerless — same convention
    // `isOwnerOf()` uses) stay visible to everyone regardless, since there's no real "someone else"
    // to exclude them for. Deliberately NOT applied to the by-quotation lookup below — that's an
    // existence check ("does a Scope of Work already exist for THIS quotation, which the caller can
    // already see via quotations:view"), not a browse view, and hiding a colleague's already-created
    // record there would risk the caller creating a duplicate one instead of opening the existing one.
    const recipientMatch = ALL_RECIPIENT_KEYS.map((key) => ({ [`documentRecipients.${key}`]: ctx.user.id }));
    const ownershipClause = await buildOwnershipClause(ctx, "scopeOfWork", "createdBy");
    const ownershipMatch: Record<string, unknown> =
      "$or" in ownershipClause
        ? { $or: [...(ownershipClause.$or as Record<string, unknown>[]), ...recipientMatch] }
        : ownershipClause;
    const docs = await scopeOfWorks.find({ isDeleted: false, ...ownershipMatch }).sort({ updatedAt: -1 }).toArray();
    res.status(200).json({ scopeOfWorks: docs.map(toListItem) });
    return;
  }

  const docs = await scopeOfWorks.find({ quotationId, isDeleted: false }).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ scopeOfWorks: docs.map(toSummary) });
}

/** Bounded retry for the (extremely unlikely, since the revision number is atomically reserved)
 * case of a duplicate-key error on a Rewrite insert — 2026-07-15, Codex review Critical-section
 * recommendation. Since 2026-07-29 only `handleRewrite` still needs it (Create/Duplicate now use
 * the user's own typed number, where a duplicate is a real user error surfaced as a 409, not a
 * retryable allocation race). */
const MAX_SCOPE_NUMBER_ATTEMPTS = 3;

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:create");
  if (!roleHasPermission(ctx.role, "quotations:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const quotationId = typeof body.quotationId === "string" ? body.quotationId.trim() : "";
  if (!quotationId) throw new HttpError(400, "กรุณาระบุใบเสนอราคา");
  // Manual-ONLY document number (2026-07-29) — replaces both the auto `PQ{...}` generation and the
  // old required-`secondaryCode` prompt. The creator types the whole number themselves; the server
  // only enforces non-blank + uniqueness. `secondaryCode` still exists as an optional legacy
  // reference field on the record, but is no longer collected at creation.
  const scopeNumber = sanitizeScopeNumber(body.scopeNumber);

  const [quotes, scopeOfWorks] = await Promise.all([quotesCollection(), scopeOfWorksCollection()]);
  await ensureScopeNumberIndexes(scopeOfWorks);
  await assertScopeNumberAvailable(scopeOfWorks, scopeNumber);
  const quote = await quotes.findOne({ _id: quotationId });
  if (!quote) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const derived = deriveFromQuotation(quote);
  const seller = await resolveDefaultSeller(quote, ctx);
  const issueDate = nowIso().slice(0, 10);
  const now = nowIso();

  const doc: ScopeOfWorkFields = {
    // yearMonth/jobSequence are legacy fields from the removed auto-numbering scheme — written as
    // neutral empties on every new record (old records keep their real values, no migration).
    scopeNumber, yearMonth: "", jobSequence: 0, secondaryCode: "",
    quotationId, quotationNumber: derived.quotationNumber,
    jobTypeCode: derived.jobTypeCode, jobTypeName: derived.jobTypeName,
    quotationSalesperson: derived.quotationSalesperson,
    issueDate, deliveryDate: "", drawingCode: "",
    customerPoNumber: derived.customerPoNumber,
    customerSnapshot: derived.customerSnapshot,
    deliveryLocation: derived.deliveryLocation,
    shippingContact: "", shippingPhone: "", billingContact: "", billingPhone: "",
    checklistGroups: derived.checklistGroups,
    items: derived.items,
    paymentConditions: { installments: [], description: derived.paymentDescription, notes: "" },
    documentRecipients: {},
    documentRecipientMessage: "",
    revisionNote: "",
    attachments: [],
    remarks: derived.remarks,
    seller,
    approver: { name: "", userId: "", date: "" },
    status: "Draft",
    version: 1,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
    isDeleted: false,
  };
  let created: ScopeOfWorkFields & { _id: ObjectId };
  try {
    const result = await scopeOfWorks.insertOne(doc);
    created = { ...doc, _id: result.insertedId };
  } catch (err) {
    // Lost the race against a concurrent create typing the same number — same 409 the pre-check gives.
    if (err instanceof MongoServerError && err.code === 11000) throw new HttpError(409, DUPLICATE_SCOPE_NUMBER_MESSAGE(scopeNumber));
    throw err;
  }

  await writeScopeAuditEntry(ctx, "Scope of Work Created", `สร้าง Scope of Work ${created.scopeNumber} จากใบเสนอราคา ${quotationId}`, {
    scopeId: created._id.toString(), scopeNumber: created.scopeNumber, quoteId: quotationId,
  });
  res.status(201).json({ scopeOfWork: normalizeScope(withStringId(created)) satisfies ScopeOfWork });
}

async function loadScopeOrThrow(id: string): Promise<WithId<ScopeOfWorkFields>> {
  const scopeOfWorks = await scopeOfWorksCollection();
  const doc = await scopeOfWorks.findOne({ _id: toObjectId(id) });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบ Scope of Work");
  return doc;
}

/** Maps the stored document into the shape the shared required-field validators expect — a plain
 * object of just the fields they need, not the full Mongo document. See src/lib/validation/
 * scopeOfWorkValidation.ts. `withDefaultChecklistGroups` guards against a record saved before a
 * mandatory group existed (see "Existing Document Compatibility" in the validation spec). */
function toValidationInput(doc: WithId<ScopeOfWorkFields>) {
  return {
    scopeNumber: doc.scopeNumber,
    customerSnapshot: doc.customerSnapshot,
    issueDate: doc.issueDate,
    deliveryDate: doc.deliveryDate,
    drawingCode: doc.drawingCode,
    secondaryCode: doc.secondaryCode,
    customerPoNumber: doc.customerPoNumber,
    deliveryLocation: doc.deliveryLocation,
    shippingContact: doc.shippingContact,
    shippingPhone: doc.shippingPhone,
    billingContact: doc.billingContact,
    billingPhone: doc.billingPhone,
    checklistGroups: withDefaultChecklistGroups(doc.checklistGroups, doc.jobTypeCode),
    items: doc.items,
    paymentConditions: normalizePaymentConditions(doc.paymentConditions),
    remarks: doc.remarks,
    seller: doc.seller,
    approver: doc.approver,
  };
}

function throwIfIncomplete(validation: { valid: boolean; fieldErrors: Record<string, string>; groupErrors: Record<string, string[]> }, message: string): void {
  if (validation.valid) return;
  throw new HttpError(422, message, {
    code: "DOCUMENT_INCOMPLETE",
    details: { fieldErrors: validation.fieldErrors, groupErrors: validation.groupErrors },
  });
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  await requirePermission(req, "scopeOfWork:view");
  const doc = await loadScopeOrThrow(id);
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(doc)) });
}

/** Follow-up data exempt from the PendingApproval/Final edit lock (2026-07-29, the "ทวง PO"
 * pass's companion fix): a customer PO usually arrives AFTER the document is approved, so the
 * 2026-07-24 approval workflow's blanket lock made it impossible to ever record the PO number on
 * the very records that need it. These fields are follow-up bookkeeping, not approved document
 * content — item lists, payment terms, checklists, signatures, and the document number itself all
 * stay locked. Attachments (their own routes below) get the same exemption for the same reason. */
const FOLLOW_UP_FIELDS = new Set(["customerPoNumber", "documentRecipients", "documentRecipientMessage"]);

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  const autoSave = isAutoSaveRequest(req);
  const ctx = await requireUser(req);
  const doc = await loadScopeOrThrow(id);
  if (!canEditScope(ctx, doc)) throw new HttpError(403, "Forbidden");
  // บันทึกอัตโนมัติทำได้เฉพาะฉบับร่าง — ฟิลด์ติดตามผล (เลข PO/ผู้รับเอกสาร) ของเอกสารที่อนุมัติแล้ว
  // ยังต้องกดบันทึกเอง เพื่อให้มี audit log กำกับเสมอ
  // Auto-save is Draft-only. The follow-up fields still editable after approval (PO number,
  // document recipients) deliberately keep requiring a real Save, so a change to an approved
  // document always leaves an audit entry behind it.
  if (autoSave && doc.status !== "Draft") {
    throw new HttpError(409, "บันทึกอัตโนมัติได้เฉพาะ Scope of Work ที่เป็นฉบับร่างเท่านั้น");
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  // Final is a terminal state — locked against content edits entirely (use "ทำสำเนา"/Rewrite to
  // keep working from a copy), and PendingApproval locks the same way while under review. The ONLY
  // exception: a PATCH touching nothing but FOLLOW_UP_FIELDS (see above) is allowed through in any
  // status. No un-finalize action exists; keeping the content lock unconditional (not gated on
  // scopeOfWork:finalize) is a deliberate simplicity choice, matching "Keep it practical" in spec.
  if (doc.status !== "Draft" && Object.keys(body).some((k) => !FOLLOW_UP_FIELDS.has(k))) {
    throw new HttpError(400, doc.status === "PendingApproval"
      ? "Scope of Work นี้อยู่ระหว่างรออนุมัติ แก้ไขไม่ได้ — ถอนคำขออนุมัติก่อนหากต้องการแก้ไข (ยกเว้นเลข PO/ผู้รับเอกสาร ซึ่งบันทึกได้เสมอ)"
      : "Scope of Work นี้อนุมัติแล้ว (Final) ไม่สามารถแก้ไขได้ กรุณาใช้ แก้ไข (Rewrite) เพื่อสร้างฉบับแก้ไขใหม่ (ยกเว้นเลข PO/ผู้รับเอกสาร ซึ่งบันทึกได้เสมอ)");
  }

  const update: Partial<ScopeOfWorkFields> = {};

  // Draft-only by construction (the status guard above) — the moment a record is approved (Final)
  // its number is locked for good; only Rewrite (which appends `-R{n}`) changes it after that.
  if ("scopeNumber" in body) {
    const nextScopeNumber = sanitizeScopeNumber(body.scopeNumber);
    if (nextScopeNumber !== doc.scopeNumber) {
      const scopeOfWorks = await scopeOfWorksCollection();
      await ensureScopeNumberIndexes(scopeOfWorks);
      await assertScopeNumberAvailable(scopeOfWorks, nextScopeNumber, doc._id);
      update.scopeNumber = nextScopeNumber;
    }
  }
  if ("issueDate" in body) update.issueDate = validateIsoDateOrEmpty(body.issueDate, "วันที่") || doc.issueDate;
  if ("deliveryDate" in body) update.deliveryDate = validateIsoDateOrEmpty(body.deliveryDate, "วันที่ส่งของ/ส่งแบบอนุมัติ");
  if ("drawingCode" in body) update.drawingCode = sanitizeShortText(body.drawingCode, "รหัส Drawing");
  if ("customerPoNumber" in body) update.customerPoNumber = sanitizeShortText(body.customerPoNumber, "เอกสารใบสั่งซื้อเลขที่");
  if ("secondaryCode" in body) update.secondaryCode = sanitizeShortText(body.secondaryCode, "รหัสอ้างอิงท้ายงาน");
  if ("deliveryLocation" in body) update.deliveryLocation = sanitizeShortText(body.deliveryLocation, "สถานที่ส่งของ");
  if ("shippingContact" in body) update.shippingContact = sanitizeShortText(body.shippingContact, "ชื่อผู้ติดต่อส่งของ");
  if ("shippingPhone" in body) update.shippingPhone = sanitizeShortText(body.shippingPhone, "เบอร์โทรผู้ติดต่อส่งของ");
  if ("billingContact" in body) update.billingContact = sanitizeShortText(body.billingContact, "ชื่อผู้ติดต่อวางบิล");
  if ("billingPhone" in body) update.billingPhone = sanitizeShortText(body.billingPhone, "เบอร์โทรผู้ติดต่อวางบิล");
  if ("checklistGroups" in body) update.checklistGroups = sanitizeChecklistGroups(body.checklistGroups, withDefaultChecklistGroups(doc.checklistGroups, doc.jobTypeCode));
  if ("items" in body) update.items = sanitizeItems(body.items);
  if ("paymentConditions" in body) update.paymentConditions = sanitizePaymentConditions(body.paymentConditions);
  if ("documentRecipients" in body) update.documentRecipients = await sanitizeDocumentRecipients(body.documentRecipients);
  if ("documentRecipientMessage" in body) update.documentRecipientMessage = sanitizeLongText(body.documentRecipientMessage, "ข้อความถึงผู้รับเอกสาร");
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  if ("remarks" in body) update.remarks = sanitizeLongText(body.remarks, "หมายเหตุ");
  if ("seller" in body) update.seller = await sanitizeSignatory(body.seller, "ผู้ขาย");
  if ("approver" in body) update.approver = await sanitizeSignatory(body.approver, "ผู้อนุมัติ");

  // No scopeNumber recompute anymore (2026-07-29, manual-ONLY numbers): editing `issueDate` or
  // `secondaryCode` no longer touches the document number — it only changes when the user
  // explicitly retypes it (handled above).
  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const scopeOfWorks = await scopeOfWorksCollection();
  try {
    await scopeOfWorks.updateOne({ _id: doc._id }, { $set: update });
  } catch (err) {
    // Race-safe backstop for a concurrent save typing the same number (see the unique index).
    if (err instanceof MongoServerError && err.code === 11000 && update.scopeNumber) {
      throw new HttpError(409, DUPLICATE_SCOPE_NUMBER_MESSAGE(update.scopeNumber));
    }
    throw err;
  }
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  // การบันทึกอัตโนมัติไม่เขียน audit log — ดู isAutoSaveRequest() ใน api/_lib/http.ts
  if (!autoSave) {
    await writeScopeAuditEntry(ctx, "Scope of Work Updated", `แก้ไข Scope of Work ${updated.scopeNumber}`, {
      scopeId: id, scopeNumber: updated.scopeNumber, quoteId: updated.quotationId,
    });
  }
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

// ─── Approval workflow (added 2026-07-24, direct user request: "ทำส่งขออนุมัติ... ถ้ามีคนอนุมัติ
// แล้วมันจะไม่สามารถแก้ไขอะไรได้อีกต้องกด Rewrite เท่านั้น") ─────────────────────────────────────
// Draft → (ส่งขออนุมัติ, canEditScope) → PendingApproval → (อนุมัติ, `scopeOfWork:finalize`) → Final
//                                              │→ (ปฏิเสธ + comment, finalize holder) → Draft
//                                              │→ (ถอนคำขอ, canEditScope) → Draft
// Editing/refresh/attachments are Draft-only (see the guards above), so both PendingApproval and
// Final are locked; Final is terminal — Rewrite is the only way onward. `scopeOfWork:finalize` is
// reused as the approval authority (no new permission — every role that could Finalize before can
// Approve now). In-app notifications mirror the quotation workflow's: submit → every active
// finalize holder; approve/reject → the record's creator.

/** Notifies via the bell — same hand-rolled insertMany convention as the document-sent
 * notification above and `api/handlers/quotes.ts`'s workflow writer. */
async function notifyScopeApprovalEvent(
  recipientUserIds: string[],
  type: NotificationType,
  title: string,
  description: string,
  scopeId: string,
  scopeNumber: string,
): Promise<void> {
  const ids = [...new Set(recipientUserIds)].filter((uid) => uid !== "");
  if (ids.length === 0) return;
  const createdAt = nowIso();
  const notifications = await notificationsCollection();
  await notifications.insertMany(ids.map((recipientUserId) => ({
    recipientUserId, type, title, description,
    module: "Scope of Work", relatedScopeId: scopeId, relatedScopeNumber: scopeNumber,
    createdAt, read: false,
  })));
}

/** Every active user whose role holds `permission` — mirror of the quotation workflow's
 * approver-resolution query. */
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
  const doc = await loadScopeOrThrow(id);
  if (!canEditScope(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, "ส่งขออนุมัติได้เฉพาะฉบับร่างเท่านั้น");
  // Print-level completeness (not finalize-level): the approver signatory is filled by the
  // approver at approve time, so requiring it here would block every submission.
  throwIfIncomplete(
    validateScopeOfWorkForPrint({ ...toValidationInput(doc), status: doc.status }),
    "กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนส่งขออนุมัติ",
  );

  const scopeOfWorks = await scopeOfWorksCollection();
  await scopeOfWorks.updateOne({ _id: doc._id }, { $set: { status: "PendingApproval" as ScopeOfWorkStatus, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Submitted", `ส่งขออนุมัติ Scope of Work ${updated.scopeNumber}`, {
    scopeId: id, scopeNumber: updated.scopeNumber, quoteId: updated.quotationId,
  });
  await notifyScopeApprovalEvent(
    await activeUserIdsWithPermission("scopeOfWork:finalize"),
    "scope_of_work_submitted", "Scope of Work รออนุมัติ",
    `${ctx.user.fullName} ส่ง Scope of Work ${updated.scopeNumber} (${updated.customerSnapshot.companyName}) เพื่อขออนุมัติ`,
    id, updated.scopeNumber,
  );
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

/** `/finalize` now means "อนุมัติ" — kept under its original route name so the permission story
 * (`scopeOfWork:finalize`) and client function name stay unchanged. */
async function handleFinalize(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:finalize");
  const doc = await loadScopeOrThrow(id);
  if (doc.status === "Final") throw new HttpError(400, "Scope of Work นี้อนุมัติแล้ว (Final)");
  if (doc.status !== "PendingApproval") throw new HttpError(400, "ต้องส่งขออนุมัติก่อน จึงจะอนุมัติได้");

  // The approving user IS the approver signatory — filled here, not typed by the submitter
  // (which is why submission validates at print level; with this injected the record satisfies
  // finalize-level validation too).
  const approver = { name: ctx.user.fullName, userId: ctx.user.id, date: nowIso().slice(0, 10) };
  throwIfIncomplete(
    validateScopeOfWorkForFinalization(toValidationInput({ ...doc, approver })),
    "ข้อมูลยังไม่ครบถ้วนสำหรับการอนุมัติ",
  );

  const scopeOfWorks = await scopeOfWorksCollection();
  await scopeOfWorks.updateOne({ _id: doc._id }, { $set: { status: "Final" as ScopeOfWorkStatus, approver, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Approved", `อนุมัติ Scope of Work ${updated.scopeNumber}`, {
    scopeId: id, scopeNumber: updated.scopeNumber, quoteId: updated.quotationId,
  });
  await notifyScopeApprovalEvent(
    updated.createdBy && updated.createdBy !== ctx.user.id ? [updated.createdBy] : [],
    "scope_of_work_approved", "Scope of Work ได้รับอนุมัติ",
    `${ctx.user.fullName} อนุมัติ Scope of Work ${updated.scopeNumber} แล้ว`,
    id, updated.scopeNumber,
  );
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

async function handleRejectApproval(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:finalize");
  const doc = await loadScopeOrThrow(id);
  if (doc.status !== "PendingApproval") throw new HttpError(400, "ปฏิเสธได้เฉพาะเอกสารที่รออนุมัติเท่านั้น");
  const comment = sanitizeLongText((req.body as { comment?: unknown } | undefined)?.comment, "เหตุผลการปฏิเสธ");
  if (!comment.trim()) throw new HttpError(400, "กรุณาระบุเหตุผลการปฏิเสธ");

  const scopeOfWorks = await scopeOfWorksCollection();
  await scopeOfWorks.updateOne({ _id: doc._id }, { $set: { status: "Draft" as ScopeOfWorkStatus, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Rejected", `ปฏิเสธการอนุมัติ Scope of Work ${updated.scopeNumber}: ${comment.trim()}`, {
    scopeId: id, scopeNumber: updated.scopeNumber, quoteId: updated.quotationId,
  });
  await notifyScopeApprovalEvent(
    updated.createdBy && updated.createdBy !== ctx.user.id ? [updated.createdBy] : [],
    "scope_of_work_rejected", "Scope of Work ถูกตีกลับ",
    `${ctx.user.fullName} ปฏิเสธการอนุมัติ Scope of Work ${updated.scopeNumber}: ${comment.trim()}`,
    id, updated.scopeNumber,
  );
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

async function handleWithdrawApproval(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadScopeOrThrow(id);
  if (!canEditScope(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "PendingApproval") throw new HttpError(400, "ถอนคำขอได้เฉพาะเอกสารที่รออนุมัติเท่านั้น");

  const scopeOfWorks = await scopeOfWorksCollection();
  await scopeOfWorks.updateOne({ _id: doc._id }, { $set: { status: "Draft" as ScopeOfWorkStatus, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Approval Withdrawn", `ถอนคำขออนุมัติ Scope of Work ${updated.scopeNumber}`, {
    scopeId: id, scopeNumber: updated.scopeNumber, quoteId: updated.quotationId,
  });
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

async function handleDuplicate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:create");
  // Reading the source record's full content requires `:view` too — `:create` alone shouldn't let
  // a caller read out the content of an arbitrary Scope of Work by id (defense in depth; every
  // default role that holds `:create` also holds `:view`, but a future custom role might not).
  if (!roleHasPermission(ctx.role, "scopeOfWork:view")) throw new HttpError(403, "Forbidden");
  const source = await loadScopeOrThrow(id);

  // Manual-ONLY numbers (2026-07-29): Duplicate no longer mints a fresh auto number — the caller
  // asks the user for the copy's own document number and sends it here, same rules as Create
  // (required non-blank, unique, completely free-form).
  const scopeNumber = sanitizeScopeNumber((req.body as Record<string, unknown> | undefined)?.scopeNumber);

  const scopeOfWorks = await scopeOfWorksCollection();
  await ensureScopeNumberIndexes(scopeOfWorks);
  await assertScopeNumberAvailable(scopeOfWorks, scopeNumber);
  const issueDate = nowIso().slice(0, 10);
  const now = nowIso();

  const { _id: _sourceId, ...rest } = source;
  const doc: ScopeOfWorkFields = {
    ...rest,
    // `secondaryCode` (legacy reference field) carries over via `...rest`; the legacy
    // yearMonth/jobSequence pair resets to the same neutral empties Create writes.
    scopeNumber, yearMonth: "", jobSequence: 0,
    issueDate,
    items: source.items.map((it) => ({ ...it, id: randomUUID(), specifications: it.specifications.map((s) => ({ ...s, id: randomUUID() })) })),
    checklistGroups: cloneChecklistGroups(source.checklistGroups),
    status: "Draft",
    version: 1,
    seller: { name: ctx.user.fullName, userId: ctx.user.id, date: "" },
    approver: { name: "", userId: "", date: "" },
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
    isDeleted: false,
    // Never inherited from the source — see `ScopeOfWork.revisionNote`'s doc comment (src/lib/scopeOfWork.ts).
    revisionNote: "",
    // Never inherited either — a copy would share the source's underlying blob files, and
    // deleting an attachment from one record would break the other's link. See
    // `ScopeOfWork.attachments`'s doc comment (src/lib/scopeOfWork.ts).
    attachments: [],
  };
  let created: ScopeOfWorkFields & { _id: ObjectId };
  try {
    const result = await scopeOfWorks.insertOne(doc);
    created = { ...doc, _id: result.insertedId };
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) throw new HttpError(409, DUPLICATE_SCOPE_NUMBER_MESSAGE(scopeNumber));
    throw err;
  }

  await writeScopeAuditEntry(ctx, "Scope of Work Duplicated", `ทำสำเนา Scope of Work จาก ${source.scopeNumber} เป็น ${created.scopeNumber}`, {
    scopeId: created._id.toString(), scopeNumber: created.scopeNumber, quoteId: source.quotationId,
  });
  res.status(201).json({ scopeOfWork: normalizeScope(withStringId(created)) satisfies ScopeOfWork });
}

/**
 * "Rewrite/แก้ไข" (added 2026-07-22, per direct user request — mirrors Quotation's identical
 * feature, see `handleRewrite()` in api/handlers/quotes.ts) — creates a new revision of an existing
 * Scope of Work. Same clone semantics as `handleDuplicate()` above (fresh `_id`/item/spec ids,
 * status reset to Draft, fresh seller/blank approver) — the real difference is the new record's
 * `scopeNumber`: a revision-suffixed id derived from the source's own (`{root}-R{n}`, e.g.
 * `PQ202607-6-TA-SK-R1`, then `-R2`) instead of a brand-new number — since 2026-07-29 the root
 * number is whatever the user originally TYPED (manual-ONLY numbering), and the `-R{n}` suffix is
 * still appended automatically to it. `yearMonth`/`jobSequence` (legacy)/`secondaryCode`/
 * `issueDate` all carry over unchanged from the source (via the `...rest` spread, deliberately
 * never overridden here) rather than being replaced the way Duplicate replaces them (Duplicate now
 * asks the user for the copy's number) — a rewrite is "a new revision of the same job," not a new one.
 * `rootScopeNumber` is always derived from the *record actually being rewritten*, so rewriting an
 * already-rewritten `-R1` correctly advances to `-R2`, never `-R1-R1` — same guarantee Quotation's
 * Rewrite gives, via the same shared `getRevisionRoot()`. The source record is never modified.
 */
async function handleRewrite(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:create");
  // Same defense-in-depth as handleDuplicate — reading the source's full content needs `:view` too.
  if (!roleHasPermission(ctx.role, "scopeOfWork:view")) throw new HttpError(403, "Forbidden");
  const source = await loadScopeOrThrow(id);
  // Rewrite creates a brand-new document _id while installment ids carry over unchanged — that
  // would silently orphan any already-billed ar_milestones history (keyed on the old scopeOfWorkId)
  // from the record a user now sees. See docs/MODULES/Accounting.md decision #2.
  await assertScopeHasNoBilledMilestones(id);

  const [scopeOfWorks, counters] = await Promise.all([scopeOfWorksCollection(), countersCollection()]);
  // Also drops the legacy {yearMonth, jobSequence} unique index if present — the `...rest` spread
  // below carries the source's pair over unchanged, which that index would reject.
  await ensureScopeNumberIndexes(scopeOfWorks);
  const rootScopeNumber = getRevisionRoot(source.scopeNumber);
  const now = nowIso();

  const { _id: _sourceId, ...rest } = source;
  let created: (ScopeOfWorkFields & { _id: ObjectId }) | null = null;
  let lastRewriteErr: unknown;
  for (let attempt = 0; attempt < MAX_SCOPE_NUMBER_ATTEMPTS && !created; attempt++) {
    const revisionSeq = await nextScopeRevisionNumber(counters, rootScopeNumber);
    const scopeNumber = `${rootScopeNumber}-R${revisionSeq}`;
    const doc: ScopeOfWorkFields = {
      ...rest,
      scopeNumber,
      items: source.items.map((it) => ({ ...it, id: randomUUID(), specifications: it.specifications.map((s) => ({ ...s, id: randomUUID() })) })),
      checklistGroups: cloneChecklistGroups(source.checklistGroups),
      status: "Draft",
      version: 1,
      seller: { name: ctx.user.fullName, userId: ctx.user.id, date: "" },
      approver: { name: "", userId: "", date: "" },
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
      isDeleted: false,
      // Never inherited from the source — see `ScopeOfWork.revisionNote`'s doc comment (src/lib/scopeOfWork.ts).
      revisionNote: "",
      // Never inherited either — a copy would share the source's underlying blob files, and
      // deleting an attachment from one record would break the other's link. See
      // `ScopeOfWork.attachments`'s doc comment (src/lib/scopeOfWork.ts).
      attachments: [],
    };
    try {
      const result = await scopeOfWorks.insertOne(doc);
      created = { ...doc, _id: result.insertedId };
    } catch (err) {
      // Duplicate-key race on the reserved revision number — extremely unlikely since
      // `revisionSeq` is atomically reserved, but retried rather than surfaced as a raw 500, same
      // bounded-retry pattern as handleDuplicate() above and Quotation's own Rewrite.
      if (err instanceof MongoServerError && err.code === 11000) { lastRewriteErr = err; continue; }
      throw err;
    }
  }
  if (!created) {
    console.error("[scope-of-works] exhausted retries reserving a unique revision scope number on rewrite", lastRewriteErr);
    throw new HttpError(409, "ไม่สามารถสร้างรหัสงานที่ไม่ซ้ำกันได้ กรุณาลองใหม่อีกครั้ง");
  }

  await writeScopeAuditEntry(ctx, "Scope of Work Rewritten", `สร้าง Scope of Work แก้ไข ${created.scopeNumber} จาก ${source.scopeNumber}`, {
    scopeId: created._id.toString(), scopeNumber: created.scopeNumber, quoteId: source.quotationId,
  });
  res.status(201).json({ scopeOfWork: normalizeScope(withStringId(created)) satisfies ScopeOfWork });
}

/** "อัปเดตข้อมูลจากใบเสนอราคา" — an explicit, user-triggered re-pull of every quotation-derived
 * field (see `deriveFromQuotation`). Never automatic: a Draft Scope of Work otherwise never
 * silently changes just because the source quotation was edited later. Header fields the user has
 * been filling in by hand (drawingCode/deliveryDate/shippingContact/etc., checklistGroups,
 * paymentConditions percentages, seller/approver, secondaryCode) are left untouched — only the
 * fields this same action originally populated are refreshed. */
async function handleRefresh(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadScopeOrThrow(id);
  if (!canEditScope(ctx, doc)) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Draft") throw new HttpError(400, "ต้องเป็นฉบับร่างเท่านั้นจึงจะอัปเดตข้อมูลจากใบเสนอราคาได้ (เอกสารที่รออนุมัติ/อนุมัติแล้วถูกล็อก)");
  // 2026-07-15, Codex review Medium fix: `handleCreate` requires `quotations:view` to read the
  // source quotation; refresh previously only checked Scope of Work edit/ownership authorization
  // before reading it, with no equivalent source-quotation access check of its own.
  if (!roleHasPermission(ctx.role, "quotations:view")) throw new HttpError(403, "Forbidden");

  const quotes = await quotesCollection();
  const quote = await quotes.findOne({ _id: doc.quotationId });
  if (!quote) throw new HttpError(404, "ไม่พบใบเสนอราคาต้นทาง");
  const derived = deriveFromQuotation(quote);

  const scopeOfWorks = await scopeOfWorksCollection();
  const now = nowIso();
  const update: Partial<ScopeOfWorkFields> = {
    quotationNumber: derived.quotationNumber,
    quotationSalesperson: derived.quotationSalesperson,
    customerSnapshot: derived.customerSnapshot,
    customerPoNumber: derived.customerPoNumber,
    deliveryLocation: derived.deliveryLocation,
    remarks: derived.remarks,
    items: derived.items,
    updatedAt: now, updatedBy: ctx.user.id,
  };
  await scopeOfWorks.updateOne({ _id: doc._id }, { $set: update });
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Refreshed", `อัปเดตข้อมูลจากใบเสนอราคาให้ Scope of Work ${updated.scopeNumber}`, {
    scopeId: id, scopeNumber: updated.scopeNumber, quoteId: updated.quotationId,
  });
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

// ─── Attachments (added 2026-07-24, reworked to MongoDB storage the same day) ──────────────────
// Originally built on Vercel Blob; reworked after the user clarified the Vercel deployment is
// only a trial and the real hosting plan is elsewhere — file bytes now live in the separate
// `scope_attachment_files` MongoDB collection (see collections.ts) so attachments travel with
// the database to any future host. The "กลัว db เต็ม" concern is answered with hard limits
// instead of external storage: 2 MB/file × 5 files/record (see src/lib/scopeOfWork.ts).
// Managed only through these dedicated routes; `attachments` is deliberately NOT a PATCHable
// field, so a stale client can't accidentally wipe the array (and with it, track of live files).
// Downloads are served by an unauthenticated capability-URL route (random `downloadKey`) so the
// links in recipient emails open without an app session — same security model as the public
// unguessable Blob URLs the first design used.

/** Pre-2026-07-24 records have no `attachments` field at all. */
function currentAttachments(doc: WithId<ScopeOfWorkFields>): ScopeOfWorkAttachment[] {
  return Array.isArray(doc.attachments) ? doc.attachments : [];
}

/** `ensureIndexes()` in api/_lib/collections.ts only ever runs from the one-time Setup Wizard
 * bootstrap, permanently unreachable on an already-provisioned deployment — same gap and same
 * defensive-idempotent fix as `ensureSearchIndexes()` (api/_lib/searchHandler.ts), scoped once per
 * warm serverless instance. Without these, every download `findOne` is a full collection scan over
 * documents that each carry up to 2 MB of BSON Binary. */
let attachmentIndexesEnsured = false;
async function ensureAttachmentIndexes(
  files: Awaited<ReturnType<typeof scopeAttachmentFilesCollection>>,
): Promise<void> {
  if (attachmentIndexesEnsured) return;
  await Promise.all([
    files.createIndex({ attachmentId: 1 }, { unique: true }),
    files.createIndex({ scopeOfWorkId: 1 }),
  ]);
  attachmentIndexesEnsured = true;
}

async function handleAttachmentUpload(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadScopeOrThrow(id);
  if (!canEditScope(ctx, doc)) throw new HttpError(403, "Forbidden");
  // Deliberately NO Draft-only guard (removed 2026-07-29, the "ทวง PO" pass): attachments are
  // follow-up data — a customer PO file usually arrives after approval — same exemption as
  // FOLLOW_UP_FIELDS in handleUpdate above.

  const attachments = currentAttachments(doc);
  if (attachments.length >= MAX_ATTACHMENTS_PER_SCOPE) {
    throw new HttpError(400, `แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS_PER_SCOPE} ไฟล์ต่อเอกสาร — ลบไฟล์เดิมออกก่อน`);
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const fileName = sanitizeShortText(body.fileName, "ชื่อไฟล์");
  if (!fileName.trim()) throw new HttpError(400, "กรุณาระบุชื่อไฟล์");
  const contentType = typeof body.contentType === "string" && body.contentType.trim()
    ? body.contentType.trim().slice(0, 120)
    : "application/octet-stream";
  const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";
  if (!dataBase64) throw new HttpError(400, "ไม่พบข้อมูลไฟล์");
  // 4/3 base64 overhead — reject before decoding so an oversized payload can't cost a full decode.
  if (dataBase64.length > Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 8) {
    throw new HttpError(400, `ไฟล์ต้องมีขนาดไม่เกิน ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`);
  }
  // Node's base64 decoder never throws — it silently SKIPS invalid characters, so a corrupted
  // payload would otherwise be stored truncated without anyone noticing. Validate the charset up
  // front instead (the client's btoa() output is plain standard base64, no whitespace).
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) throw new HttpError(400, "ข้อมูลไฟล์ไม่ถูกต้อง");
  const data = Buffer.from(dataBase64, "base64");
  if (data.length === 0) throw new HttpError(400, "ไม่พบข้อมูลไฟล์");
  if (data.length > MAX_ATTACHMENT_BYTES) {
    throw new HttpError(400, `ไฟล์ต้องมีขนาดไม่เกิน ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`);
  }

  const attachmentId = randomUUID();
  const downloadKey = randomBytes(24).toString("base64url");
  const files = await scopeAttachmentFilesCollection();
  await ensureAttachmentIndexes(files);
  await files.insertOne({
    scopeOfWorkId: id,
    attachmentId,
    downloadKey,
    fileName,
    contentType,
    size: data.length,
    data: new Binary(data),
    createdAt: nowIso(),
  });

  const attachment: ScopeOfWorkAttachment = {
    id: attachmentId,
    fileName,
    url: `/api/scope-of-works/${id}/attachments/${attachmentId}/download?key=${downloadKey}`,
    size: data.length,
    contentType,
    uploadedBy: ctx.user.id,
    uploadedByName: ctx.user.fullName,
    uploadedAt: nowIso(),
  };
  const scopeOfWorks = await scopeOfWorksCollection();
  // Atomic `$push` with the per-record cap re-checked inside the filter itself ("slot N-1 must not
  // exist yet") — the previous read-modify-write `$set` of the whole array meant two concurrent
  // uploads could each start from the same snapshot, silently dropping one upload's metadata (while
  // its file bytes stayed behind as an orphan) and blowing past MAX_ATTACHMENTS_PER_SCOPE. The cast
  // is only because the driver's `Filter` key typing doesn't admit a computed dotted array path.
  const pushResult = await scopeOfWorks.updateOne(
    {
      _id: doc._id,
      [`attachments.${MAX_ATTACHMENTS_PER_SCOPE - 1}`]: { $exists: false },
    } as Parameters<typeof scopeOfWorks.updateOne>[0],
    { $push: { attachments: attachment }, $set: { updatedAt: nowIso(), updatedBy: ctx.user.id } },
  );
  if (pushResult.matchedCount === 0) {
    // Lost a concurrent race to the last free slot — remove the just-stored bytes so they can't
    // linger unreferenced, then surface the same "full" error the pre-check gives.
    await files.deleteOne({ attachmentId });
    throw new HttpError(400, `แนบไฟล์ได้สูงสุด ${MAX_ATTACHMENTS_PER_SCOPE} ไฟล์ต่อเอกสาร — ลบไฟล์เดิมออกก่อน`);
  }
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Attachment Added", `แนบไฟล์ "${fileName}" กับ Scope of Work ${doc.scopeNumber}`, {
    scopeId: id, scopeNumber: doc.scopeNumber, quoteId: doc.quotationId,
  });
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

async function handleAttachmentDelete(req: VercelRequest, res: VercelResponse, id: string, attachmentId: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const doc = await loadScopeOrThrow(id);
  if (!canEditScope(ctx, doc)) throw new HttpError(403, "Forbidden");
  // No Draft-only guard — same follow-up-data exemption as the upload route above (2026-07-29).

  const attachments = currentAttachments(doc);
  const target = attachments.find((a) => a.id === attachmentId);
  if (!target) throw new HttpError(404, "ไม่พบไฟล์แนบ");

  const files = await scopeAttachmentFilesCollection();
  await files.deleteOne({ attachmentId });
  const scopeOfWorks = await scopeOfWorksCollection();
  // `$pull` of just this entry (not a `$set` of a pre-read filtered array) so a concurrent upload's
  // freshly-pushed sibling entry can't be clobbered by a stale snapshot.
  await scopeOfWorks.updateOne(
    { _id: doc._id },
    { $pull: { attachments: { id: attachmentId } }, $set: { updatedAt: nowIso(), updatedBy: ctx.user.id } },
  );
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Attachment Removed", `ลบไฟล์แนบ "${target.fileName}" ออกจาก Scope of Work ${doc.scopeNumber}`, {
    scopeId: id, scopeNumber: doc.scopeNumber, quoteId: doc.quotationId,
  });
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

/** Content types allowed to render inline in the browser tab. Anything else — crucially text/html
 * and image/svg+xml, which can execute script — is served as a plain download under a neutral
 * content type instead: this route is unauthenticated and lives on the app's own origin, so
 * echoing an uploader-chosen `contentType` back with `inline` disposition would let any editor
 * store an HTML file that runs script (and reads the session token) in whoever opens the emailed
 * link. Vercel Blob never had this problem only because its public URLs were on a foreign origin. */
const INLINE_SAFE_CONTENT_TYPES = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain",
]);

/** RFC 5987 ext-value percent-encoding — `encodeURIComponent` alone leaves `'`, `(`, `)`, `*`
 * bare, and a bare `'` in particular breaks the `filename*=UTF-8''…` syntax (it's that field's own
 * delimiter), mangling downloads of e.g. `customer's PO (final).pdf`. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Serves an attachment's bytes. Deliberately NO session auth — access is gated by the random
 * `downloadKey` capability token baked into the URL instead, because these links go into recipient
 * emails and a mail client has no app session. The key is 24 random bytes (base64url), the same
 * unguessable-URL model Vercel Blob's public URLs use; a wrong/missing key is an opaque 404. */
async function handleAttachmentDownload(req: VercelRequest, res: VercelResponse, id: string, attachmentId: string) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!key) throw new HttpError(404, "ไม่พบไฟล์แนบ");

  const files = await scopeAttachmentFilesCollection();
  await ensureAttachmentIndexes(files);
  const file = await files.findOne({ scopeOfWorkId: id, attachmentId });
  if (!file || file.downloadKey !== key) throw new HttpError(404, "ไม่พบไฟล์แนบ");

  const buffer = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data.buffer);
  const storedType = (file.contentType || "").split(";")[0].trim().toLowerCase();
  const inlineSafe = INLINE_SAFE_CONTENT_TYPES.has(storedType);
  res.setHeader("Content-Type", inlineSafe ? storedType : "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `${inlineSafe ? "inline" : "attachment"}; filename*=UTF-8''${encodeRfc5987(file.fileName)}`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.status(200).send(buffer);
}

async function handlePrint(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:print");
  const doc = await loadScopeOrThrow(id);
  throwIfIncomplete(
    validateScopeOfWorkForPrint({ ...toValidationInput(doc), status: doc.status }),
    "กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนพิมพ์/ส่งออก PDF",
  );
  await writeScopeAuditEntry(ctx, "Scope of Work Printed", `พิมพ์ / ส่งออก Scope of Work ${doc.scopeNumber}`, {
    scopeId: id, scopeNumber: doc.scopeNumber, quoteId: doc.quotationId,
  });
  res.status(200).json({ ok: true });
}

/**
 * "ส่งแจ้งเตือนผู้รับเอกสาร" — added 2026-07-23 (as an email send), per direct user request to
 * actually route the `documentsToSend` checklist to real people (see
 * `ScopeOfWork.documentRecipients`'s doc comment and docs/MODULES/ScopeOfWork.md "Document
 * Recipients"). **Since 2026-08-07 (second pass, same day) this is in-app-notification-only** —
 * the user cut email delivery entirely ("ตัดการส่งอีเมลออกไปเลยเหลือไว้แค่ส่งในระบบพอ") after the
 * Gmail App Password flow proved too hard for staff to set up; the earlier same-day
 * person-to-person Gmail rewrite (and the original central Resend before it) are both gone.
 * Recipients get the bell notification and the record becomes visible to them — no email leaves
 * the system. Only departments that are BOTH currently checked in the checklist AND have at least
 * one picked recipient are notified — a department with recipients picked earlier but since
 * unchecked is skipped (the picks themselves are preserved for convenience if re-checked later).
 * `ADDITIONAL_RECIPIENT_KEY` picks ("ผู้รับเพิ่มเติม", 2026-08-07) are the exception: chosen freely
 * from the whole staff directory and always included, no checklist gate. Gated by
 * `scopeOfWork:edit` — originally `scopeOfWork:print` (reasoning: a distribution action like
 * Print), changed 2026-07-24 on direct user report: a view/print-only role could fire the send
 * while being unable to pick or change recipients, so sending now requires the same permission
 * that controls the recipient picker itself. Still no ownership check, and still works on a
 * `"Final"` record (unlike content edits, which are Draft-only) — it distributes the document,
 * it doesn't change it.
 */
async function handleSendDocumentNotifications(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:edit");
  const doc = await loadScopeOrThrow(id);

  const checklistGroups = withDefaultChecklistGroups(doc.checklistGroups, doc.jobTypeCode);
  const documentsToSendGroup = checklistGroups.find((g) => g.key === "documentsToSend");
  const checkedKeys = new Set((documentsToSendGroup?.options ?? []).filter((o) => o.checked).map((o) => o.key));
  const recipients = normalizeDocumentRecipients(doc.documentRecipients);

  const recipientUserIds = new Set<string>();
  for (const dept of DOCUMENT_RECIPIENT_DEPARTMENTS) {
    if (!checkedKeys.has(dept.key)) continue;
    for (const userId of recipients[dept.key] ?? []) recipientUserIds.add(userId);
  }
  // "ผู้รับเพิ่มเติม" (2026-08-07) is independent of the checklist — always included in a send.
  for (const userId of recipients[ADDITIONAL_RECIPIENT_KEY] ?? []) recipientUserIds.add(userId);
  if (recipientUserIds.size === 0) {
    throw new HttpError(400, 'กรุณาเลือกผู้รับเอกสารอย่างน้อย 1 คน — จากแผนกที่เลือกไว้ใน "เอกสารส่งถึง" หรือจาก "ผู้รับเพิ่มเติม"');
  }

  const users = await usersCollection();
  const userDocs = await users.find(
    { _id: { $in: [...recipientUserIds].map((uid) => toObjectId(uid)) } },
    { projection: { email: 1, fullName: 1 } },
  ).toArray();

  // In-app notification (bell) — the only delivery channel since 2026-08-07 (email removed, see
  // the function doc comment). Hand-rolled here rather than calling
  // `notifyScopeOfWorkDocumentSent()` (src/lib/notifications.ts), same convention
  // `api/handlers/quotes.ts`'s workflow-notification writer already follows for the quotation
  // builders — that function's synthetic `id` is redundant with Mongo's own generated `_id`.
  type NotifDoc = {
    recipientUserId: string; type: NotificationType; title: string; description: string;
    module: string; relatedScopeId: string; relatedScopeNumber: string; createdAt: string; read: boolean;
  };
  const notifCreatedAt = nowIso();
  const notifDocs: NotifDoc[] = userDocs.map((u) => ({
    recipientUserId: u._id.toString(),
    type: "scope_of_work_document_sent",
    title: "มีเอกสาร Scope of Work ส่งถึงคุณ",
    description: `${ctx.user.fullName} ส่งเอกสาร Scope of Work ${doc.scopeNumber} (${doc.customerSnapshot.companyName}) ถึงคุณ`,
    module: "Scope of Work",
    relatedScopeId: id,
    relatedScopeNumber: doc.scopeNumber,
    createdAt: notifCreatedAt,
    read: false,
  }));
  if (notifDocs.length > 0) {
    const notifications = await notificationsCollection();
    await notifications.insertMany(notifDocs);
  }

  await writeScopeAuditEntry(
    ctx, "Scope of Work Document Notification Sent",
    `ส่งแจ้งเตือนผู้รับเอกสารของ Scope of Work ${doc.scopeNumber} (${userDocs.length} คน)`,
    { scopeId: id, scopeNumber: doc.scopeNumber, quoteId: doc.quotationId },
  );

  // `sentCount` kept in the shape (now = notified recipients) so the client's success toast
  // logic keeps working unchanged.
  res.status(200).json({ ok: true, sentCount: userDocs.length, failedCount: 0, recipientCount: userDocs.length });
}

/**
 * "ทวงเลข PO" (added 2026-07-29, per the owner's go-ahead on the 2026-07-24 proposal recorded in
 * docs/TODO.md) — sends an in-app bell notification chasing the customer PO number to the person
 * responsible for the record. Recipient resolution, most-specific first: (1) the ERP user whose
 * `fullName` exactly matches the frozen `quotationSalesperson` snapshot (same name-only
 * correlation `resolveDefaultSeller()` already uses — `salesperson` is free text, not a foreign
 * key); (2) the record's `seller.userId` signatory link; (3) the record's creator. Gated by the
 * dedicated `scopeOfWork:chasePo` permission (changed 2026-07-29, same day, on direct owner
 * request — originally `scopeOfWork:view`, i.e. anyone who could see the record; the owner wants
 * chasing to be an explicitly-granted right, defaulting to Administrator + both Approver levels).
 * Every press is audit-logged, so it's deliberately repeatable with no cooldown (a second chase
 * after a quiet week is the whole point) and abuse stays traceable. Blocked with a clear 400 once
 * the record already has a PO number.
 */
async function handleChasePo(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:chasePo");
  const doc = await loadScopeOrThrow(id);
  if ((doc.customerPoNumber ?? "").trim()) {
    throw new HttpError(400, `Scope of Work นี้มีเลข PO แล้ว (${doc.customerPoNumber.trim()})`);
  }

  const users = await usersCollection();
  let targetId = "";
  let targetName = "";
  const salespersonName = (doc.quotationSalesperson ?? "").trim();
  if (salespersonName) {
    const match = await users.findOne({ fullName: salespersonName }, { projection: { fullName: 1 } });
    if (match) { targetId = match._id.toString(); targetName = match.fullName; }
  }
  if (!targetId && doc.seller?.userId) {
    try {
      const match = await users.findOne({ _id: toObjectId(doc.seller.userId) }, { projection: { fullName: 1 } });
      if (match) { targetId = match._id.toString(); targetName = match.fullName; }
    } catch { /* malformed legacy id — fall through to the next tier */ }
  }
  if (!targetId && doc.createdBy) {
    try {
      const match = await users.findOne({ _id: toObjectId(doc.createdBy) }, { projection: { fullName: 1 } });
      if (match) { targetId = match._id.toString(); targetName = match.fullName; }
    } catch { /* same */ }
  }
  if (!targetId) throw new HttpError(400, "ไม่พบบัญชีผู้ใช้ของพนักงานขาย/ผู้สร้างเอกสารนี้ในระบบ จึงส่งการแจ้งเตือนไม่ได้");

  const notifications = await notificationsCollection();
  await notifications.insertOne({
    recipientUserId: targetId,
    type: "scope_of_work_po_chase" satisfies NotificationType,
    title: "ทวงเลข PO",
    description: `${ctx.user.fullName} ขอให้ติดตามเลข PO ของ Scope of Work ${doc.scopeNumber} (${doc.customerSnapshot.companyName}) จากลูกค้า`,
    module: "Scope of Work",
    relatedScopeId: id,
    relatedScopeNumber: doc.scopeNumber,
    createdAt: nowIso(),
    read: false,
  });
  await writeScopeAuditEntry(ctx, "Scope of Work PO Chased", `ทวงเลข PO ของ Scope of Work ${doc.scopeNumber} ไปยัง ${targetName}`, {
    scopeId: id, scopeNumber: doc.scopeNumber, quoteId: doc.quotationId,
  });
  res.status(200).json({ ok: true, notifiedUserName: targetName });
}

async function handleDelete(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "DELETE") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:delete");
  const doc = await loadScopeOrThrow(id);
  if (!isOwnerOf(ctx, doc) && !roleHasPermission(ctx.role, "scopeOfWork:finalize")) throw new HttpError(403, "Forbidden");

  const scopeOfWorks = await scopeOfWorksCollection();
  await scopeOfWorks.updateOne({ _id: doc._id }, { $set: { isDeleted: true, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  await writeScopeAuditEntry(ctx, "Scope of Work Deleted", `ลบ Scope of Work ${doc.scopeNumber}`, {
    scopeId: id, scopeNumber: doc.scopeNumber, quoteId: doc.quotationId,
  });
  res.status(200).json({ ok: true });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleScopeOfWork(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/scope-of-works");

  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "finalize") return handleFinalize(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "submit-approval") return handleSubmitApproval(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "reject") return handleRejectApproval(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "withdraw-approval") return handleWithdrawApproval(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "duplicate") return handleDuplicate(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "rewrite") return handleRewrite(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "refresh") return handleRefresh(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "send-documents") return handleSendDocumentNotifications(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "chase-po") return handleChasePo(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "attachments") return handleAttachmentUpload(req, res, parts[0]);
  if (parts.length === 3 && parts[1] === "attachments") return handleAttachmentDelete(req, res, parts[0], parts[2]);
  if (parts.length === 4 && parts[1] === "attachments" && parts[3] === "download") {
    return handleAttachmentDownload(req, res, parts[0], parts[2]);
  }
  throw new HttpError(404, "Not found");
}
