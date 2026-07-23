import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WithId, ObjectId } from "mongodb";
import { MongoServerError } from "mongodb";
import { randomUUID } from "node:crypto";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import {
  scopeOfWorksCollection, quotesCollection, usersCollection, countersCollection, auditLogCollection,
  toObjectId, withStringId, type ScopeOfWorkFields, type QuoteFields,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, validateIsoDateOrEmpty, sanitizeBoolean } from "./quoteValidation.js";
import { buildDefaultChecklistGroups, withDefaultChecklistGroups, sanitizeChecklistGroups } from "./documentRequirements.js";
import { validateScopeOfWorkForFinalization, validateScopeOfWorkForPrint } from "../../src/lib/validation/scopeOfWorkValidation.js";
import { getRevisionRoot } from "./quoteRevisions.js";
import type { ChecklistGroup } from "../../src/lib/documentRequirements.js";
import { normalizePaymentConditions } from "../../src/lib/scopeOfWork.js";
import type {
  ScopeOfWork, ScopeOfWorkSummary, ScopeOfWorkListItem, ScopeOfWorkStatus,
  ScopeOfWorkItem, ScopeOfWorkSpecLine, ScopeOfWorkPaymentConditions, ScopeOfWorkPaymentInstallment,
  ScopeOfWorkPaymentType, ScopeOfWorkSignatory, ScopeOfWorkCustomerSnapshot,
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

// ─── Scope number generation (server-side only, per business requirement) ────────────────────────

/** `PQ{YYYYMM}-{jobSequence}-{jobTypeCode}-{secondaryCode}` — see src/lib/scopeOfWork.ts.
 * `secondaryCode` is omitted from the string (not padded with a trailing dash) while still blank,
 * since the business meaning of that final segment isn't yet confirmed (see docs/MODULES/
 * ScopeOfWork.md "Secondary Code — Open Business Question") and the code must never invent one. */
function computeScopeNumber(yearMonth: string, jobSequence: number, jobTypeCode: string, secondaryCode: string): string {
  const base = `PQ${yearMonth}-${jobSequence}-${jobTypeCode || "XX"}`;
  return secondaryCode ? `${base}-${secondaryCode}` : base;
}

function yearMonthFromIsoDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate);
  if (!match) return isoDate; // caller already validated isoDate via validateIsoDateOrEmpty
  return `${match[1]}${match[2]}`;
}

/** Atomically reserves the next job sequence number for a given calendar month — same pattern as
 * `nextQuoteId()` in api/handlers/quotes.ts, keyed by `scope_{yearMonth}` instead of quote year.
 * No legacy-data bootstrap step is needed (unlike the quote counter): this is a brand-new
 * collection with no pre-existing documents to reconcile against. */
async function nextJobSequence(
  counters: Awaited<ReturnType<typeof countersCollection>>,
  yearMonth: string,
): Promise<number> {
  const result = await counters.findOneAndUpdate(
    { _id: `scope_${yearMonth}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return result?.seq ?? 1;
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
    // Own-records-only scoping (added 2026-07-23, per direct user request mirroring Quotation's
    // `quotations:viewAll`) — a caller without `scopeOfWork:viewAll` only sees, on the standalone
    // browse-everything page, records it created itself. Legacy/seed records with an empty
    // `createdBy` (ownerless — same convention `isOwnerOf()` uses) stay visible to everyone
    // regardless, since there's no real "someone else" to exclude them for. Deliberately NOT applied
    // to the by-quotation lookup below — that's an existence check ("does a Scope of Work already
    // exist for THIS quotation, which the caller can already see via quotations:view"), not a browse
    // view, and hiding a colleague's already-created record there would risk the caller creating a
    // duplicate one instead of opening the existing one.
    const ownershipMatch = roleHasPermission(ctx.role, "scopeOfWork:viewAll")
      ? {}
      : { $or: [{ createdBy: ctx.user.id }, { createdBy: "" }] };
    const docs = await scopeOfWorks.find({ isDeleted: false, ...ownershipMatch }).sort({ updatedAt: -1 }).toArray();
    res.status(200).json({ scopeOfWorks: docs.map(toListItem) });
    return;
  }

  const docs = await scopeOfWorks.find({ quotationId, isDeleted: false }).sort({ updatedAt: -1 }).toArray();
  res.status(200).json({ scopeOfWorks: docs.map(toSummary) });
}

/** Bounded retry for the (extremely unlikely, since `jobSequence` is atomically reserved per
 * month) case of a duplicate-key error on insert — 2026-07-15, Codex review Critical-section
 * recommendation. Re-reserves a fresh sequence number for the same month on each retry rather than
 * failing outright, so a genuine race never surfaces as a raw 500/E11000 to the client. */
const MAX_SCOPE_NUMBER_ATTEMPTS = 3;

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:create");
  if (!roleHasPermission(ctx.role, "quotations:view")) throw new HttpError(403, "Forbidden");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const quotationId = typeof body.quotationId === "string" ? body.quotationId.trim() : "";
  if (!quotationId) throw new HttpError(400, "กรุณาระบุใบเสนอราคา");
  // 2026-07-15, Codex review High Priority fix: previously always blank on creation, so the
  // generated code never actually had its required 4th segment (`PQ{YYYYMM}-{seq}-{jobType}` with
  // no suffix at all). Now required up front — the *value* is still never invented by this code
  // (see docs/MODULES/ScopeOfWork.md "Open Business Question"), only its presence is now enforced;
  // the user supplies the real value themselves before the record (and its permanent job code)
  // is even created.
  const secondaryCode = sanitizeShortText(body.secondaryCode, "รหัสอ้างอิงท้ายงาน", true);

  const [quotes, scopeOfWorks, counters] = await Promise.all([quotesCollection(), scopeOfWorksCollection(), countersCollection()]);
  const quote = await quotes.findOne({ _id: quotationId });
  if (!quote) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const derived = deriveFromQuotation(quote);
  const seller = await resolveDefaultSeller(quote, ctx);
  const issueDate = nowIso().slice(0, 10);
  const yearMonth = yearMonthFromIsoDate(issueDate);
  const now = nowIso();

  let created: (ScopeOfWorkFields & { _id: ObjectId }) | null = null;
  let lastDuplicateErr: unknown;
  for (let attempt = 0; attempt < MAX_SCOPE_NUMBER_ATTEMPTS && !created; attempt++) {
    const jobSequence = await nextJobSequence(counters, yearMonth);
    const scopeNumber = computeScopeNumber(yearMonth, jobSequence, derived.jobTypeCode, secondaryCode);
    const doc: ScopeOfWorkFields = {
      scopeNumber, yearMonth, jobSequence, secondaryCode,
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
      remarks: derived.remarks,
      seller,
      approver: { name: "", userId: "", date: "" },
      status: "Draft",
      version: 1,
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
      isDeleted: false,
    };
    try {
      const result = await scopeOfWorks.insertOne(doc);
      created = { ...doc, _id: result.insertedId };
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) { lastDuplicateErr = err; continue; }
      throw err;
    }
  }
  if (!created) {
    console.error("[scope-of-works] exhausted retries reserving a unique scope number", lastDuplicateErr);
    throw new HttpError(409, "ไม่สามารถสร้างรหัสงานที่ไม่ซ้ำกันได้ กรุณาลองใหม่อีกครั้ง");
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

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requireUser(req);
  const doc = await loadScopeOrThrow(id);
  if (!canEditScope(ctx, doc)) throw new HttpError(403, "Forbidden");
  // Final is a terminal state — locked against further edits entirely (use "ทำสำเนา" to keep
  // working from a copy). No un-finalize action exists; keeping this unconditional (not gated on
  // scopeOfWork:finalize) is a deliberate simplicity choice, matching "Keep it practical" in spec.
  if (doc.status === "Final") {
    throw new HttpError(400, "Scope of Work นี้เป็นสถานะ Final แล้ว ไม่สามารถแก้ไขได้ กรุณาทำสำเนาหากต้องการแก้ไขต่อ");
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Partial<ScopeOfWorkFields> = {};

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
  if ("remarks" in body) update.remarks = sanitizeLongText(body.remarks, "หมายเหตุ");
  if ("seller" in body) update.seller = await sanitizeSignatory(body.seller, "ผู้ขาย");
  if ("approver" in body) update.approver = await sanitizeSignatory(body.approver, "ผู้อนุมัติ");

  // Recompute scopeNumber whenever a component actually changed — see computeScopeNumber() above.
  // jobTypeCode never changes after creation. jobSequence normally doesn't either, EXCEPT when
  // editing `issueDate` moves it into a different calendar month: `jobSequence` is only unique
  // *within the month it was allocated for* (see nextJobSequence()/the {yearMonth,jobSequence}
  // unique index in api/_lib/collections.ts), so silently keeping the old sequence number under a
  // new yearMonth could collide with a different Scope of Work that was allocated that same
  // sequence number in the *actually*-that month. A fresh sequence is atomically reserved for the
  // new month instead, exactly like a brand-new creation would get.
  const effectiveIssueDate = update.issueDate ?? doc.issueDate;
  const effectiveSecondaryCode = update.secondaryCode ?? doc.secondaryCode;
  const effectiveYearMonth = yearMonthFromIsoDate(effectiveIssueDate);
  let effectiveJobSequence = doc.jobSequence;
  if (effectiveYearMonth !== doc.yearMonth) {
    const counters = await countersCollection();
    effectiveJobSequence = await nextJobSequence(counters, effectiveYearMonth);
    update.yearMonth = effectiveYearMonth;
    update.jobSequence = effectiveJobSequence;
  }
  if (effectiveYearMonth !== doc.yearMonth || effectiveSecondaryCode !== doc.secondaryCode) {
    update.scopeNumber = computeScopeNumber(effectiveYearMonth, effectiveJobSequence, doc.jobTypeCode, effectiveSecondaryCode);
  }

  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;
  const scopeOfWorks = await scopeOfWorksCollection();
  await scopeOfWorks.updateOne({ _id: doc._id }, { $set: update });
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Updated", `แก้ไข Scope of Work ${updated.scopeNumber}`, {
    scopeId: id, scopeNumber: updated.scopeNumber, quoteId: updated.quotationId,
  });
  res.status(200).json({ scopeOfWork: normalizeScope(withStringId(updated)) });
}

async function handleFinalize(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "scopeOfWork:finalize");
  const doc = await loadScopeOrThrow(id);
  if (doc.status === "Final") throw new HttpError(400, "Scope of Work นี้เป็นสถานะ Final อยู่แล้ว");
  throwIfIncomplete(
    validateScopeOfWorkForFinalization(toValidationInput(doc)),
    "กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนยืนยันสถานะ Final",
  );

  const scopeOfWorks = await scopeOfWorksCollection();
  const now = nowIso();
  await scopeOfWorks.updateOne({ _id: doc._id }, { $set: { status: "Final" as ScopeOfWorkStatus, updatedAt: now, updatedBy: ctx.user.id } });
  const updated = await scopeOfWorks.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Scope of Work");
  await writeScopeAuditEntry(ctx, "Scope of Work Finalized", `ยืนยันสถานะ Final ของ Scope of Work ${updated.scopeNumber}`, {
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

  const [scopeOfWorks, counters] = await Promise.all([scopeOfWorksCollection(), countersCollection()]);
  const issueDate = nowIso().slice(0, 10);
  const yearMonth = yearMonthFromIsoDate(issueDate);
  // Source record's own `secondaryCode` carries over rather than resetting to blank — it already
  // satisfied the required-non-empty rule at the source's own creation time (see `handleCreate`),
  // and a duplicate is usually still "the same job," just a fresh editable copy.
  const secondaryCode = source.secondaryCode;
  const now = nowIso();

  const { _id: _sourceId, ...rest } = source;
  let created: (ScopeOfWorkFields & { _id: ObjectId }) | null = null;
  let lastDuplicateErr: unknown;
  for (let attempt = 0; attempt < MAX_SCOPE_NUMBER_ATTEMPTS && !created; attempt++) {
    const jobSequence = await nextJobSequence(counters, yearMonth);
    const scopeNumber = computeScopeNumber(yearMonth, jobSequence, source.jobTypeCode, secondaryCode);
    const doc: ScopeOfWorkFields = {
      ...rest,
      scopeNumber, yearMonth, jobSequence, secondaryCode,
      issueDate,
      items: source.items.map((it) => ({ ...it, id: randomUUID(), specifications: it.specifications.map((s) => ({ ...s, id: randomUUID() })) })),
      checklistGroups: cloneChecklistGroups(source.checklistGroups),
      status: "Draft",
      version: 1,
      seller: { name: ctx.user.fullName, userId: ctx.user.id, date: "" },
      approver: { name: "", userId: "", date: "" },
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
      isDeleted: false,
    };
    try {
      const result = await scopeOfWorks.insertOne(doc);
      created = { ...doc, _id: result.insertedId };
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) { lastDuplicateErr = err; continue; }
      throw err;
    }
  }
  if (!created) {
    console.error("[scope-of-works] exhausted retries reserving a unique scope number on duplicate", lastDuplicateErr);
    throw new HttpError(409, "ไม่สามารถสร้างรหัสงานที่ไม่ซ้ำกันได้ กรุณาลองใหม่อีกครั้ง");
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
 * `PQ202607-6-TA-SK-R1`, then `-R2`) instead of an unrelated freshly-reserved job sequence, and
 * `yearMonth`/`jobSequence`/`secondaryCode`/`issueDate` all carry over unchanged from the source
 * (via the `...rest` spread, deliberately never overridden here) rather than being regenerated the
 * way Duplicate regenerates them — a rewrite is "a new revision of the same job," not a new one.
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

  const [scopeOfWorks, counters] = await Promise.all([scopeOfWorksCollection(), countersCollection()]);
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
  if (doc.status === "Final") throw new HttpError(400, "Scope of Work นี้เป็นสถานะ Final แล้ว ไม่สามารถอัปเดตข้อมูลได้");
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
  if (parts.length === 2 && parts[1] === "duplicate") return handleDuplicate(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "rewrite") return handleRewrite(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "refresh") return handleRefresh(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "print") return handlePrint(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
