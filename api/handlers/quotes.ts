import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requireUser, requirePermission, type AuthContext } from "../_lib/auth.js";
import { quotesCollection, usersCollection, rolesCollection, notificationsCollection, jobTypesCollection, quotationTemplatesCollection, countersCollection, auditLogCollection, customersCollection, toObjectId, withStringId, type QuoteFields } from "../_lib/collections.js";
import { handleScopeOfWork } from "../_lib/scopeOfWorkHandler.js";
import { handleDeliveryOrder } from "../_lib/deliveryOrderHandler.js";
import { roleHasPermission, findRole } from "../../src/lib/roles.js";
import { workflowTransitions, isWorkflowActionAllowed, REQUIRED_PERMISSION_HINT, approvalActionLabel, COMMENT_REQUIRED_ACTIONS, type ApprovalAction } from "../_lib/quoteWorkflow.js";
import { HIGH_VALUE_THRESHOLD, type NotificationType } from "../../src/lib/notifications.js";
import { PERMISSION_LABELS } from "../../src/lib/permissions.js";
import { nowIso } from "../../src/lib/products.js";
import {
  validateLines, validateIsoDateOrEmpty, validateJobType, validateQuotationTemplate, computeQuoteAmount,
  sanitizeShortText, sanitizeLongText, sanitizeDiscountPct, sanitizeBoolean,
} from "../_lib/quoteValidation.js";
import { validateQuotationForFinalization, validateQuotationForPrint, type QuotationValidationInput } from "../../src/lib/validation/quotationValidation.js";
import { getRevisionRoot } from "../_lib/quoteRevisions.js";

/**
 * Writes an authoritative, server-side audit-log entry for a quotation mutation — identity
 * (userId/userName/roleName) always comes from the already-verified `ctx`, never the request
 * body. Added per the 2026-07-10 Codex review's Critical finding: quotation audit events
 * (Created/Updated/workflow transitions) used to be written by the *client* calling the generic
 * `POST /api/audit-log`, which any authenticated caller could forge with arbitrary text — and
 * these exact events are what `salesActivity` on the Dashboard counts from. `POST /api/audit-log`
 * now rejects the `"ใบเสนอราคา"` module outright (see api/audit-log/index.ts), so this is the
 * only path quotation audit entries can be written through.
 */
async function writeQuoteAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
  // Structured related-record fields (2026-07-13, P'Keng/P'Kee business requirement) — the
  // quotation number and customer name were already embedded in `details` as free text, but the
  // Dashboard's Recent Activities list needs them as real fields to render as their own
  // columns/link instead of parsing prose. Optional so this stays backward-compatible with older
  // entries (audit_log has no schema, missing fields just render as blank in the UI).
  related?: { quoteId?: string; customerName?: string },
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ใบเสนอราคา",
    action,
    details,
    createdAt: nowIso(),
    ...(related?.quoteId ? { relatedQuoteId: related.quoteId } : {}),
    ...(related?.customerName ? { relatedCustomerName: related.customerName } : {}),
  });
}

/** The Customer Information fields a quotation actually carries — used both to build/refresh `customerSnapshot` and to type the merge of "already on the target document" + "what this request is changing." */
type CustomerFieldSet = Pick<
  QuoteFields,
  "client" | "contactName" | "contactPhone" | "contactEmail" | "address" | "taxId" | "deliveryMethod" | "project" | "deliveryAddress"
>;

/** Builds `customerSnapshot` from a quotation's current Customer Information field values — always server-derived, mirrors these same fields 1:1 (see `CustomerSnapshot` in src/lib/customers.ts). */
function buildCustomerSnapshot(fields: CustomerFieldSet): NonNullable<QuoteFields["customerSnapshot"]> {
  return {
    companyName: fields.client,
    contactName: fields.contactName,
    phone: fields.contactPhone,
    email: fields.contactEmail,
    address: fields.address,
    taxId: fields.taxId,
    deliveryMethod: fields.deliveryMethod,
    projectName: fields.project,
    deliveryAddress: fields.deliveryAddress,
  };
}

/**
 * Resolves a client-sent `customerId` into the id to actually persist — added 2026-07-14
 * (replacing the earlier, wrong "issuer company" feature). Returns `undefined` when the field
 * wasn't present in the request at all (caller should leave the quote's existing `customerId`
 * untouched). Returns `""` when the client explicitly sent an empty string (un-linking the
 * customer — the quote reverts to a plain manually-entered record, still keeping whatever
 * Customer Information fields are on it). Otherwise validates the referenced customer exists and
 * isn't deleted, throwing a clear Thai `400` if not.
 */
async function resolveCustomerIdUpdate(rawValue: unknown): Promise<string | undefined> {
  if (rawValue === undefined) return undefined;
  if (typeof rawValue !== "string") throw new HttpError(400, "รหัสลูกค้าไม่ถูกต้อง");
  const trimmed = rawValue.trim();
  if (!trimmed) return "";

  const objectId = toObjectId(trimmed); // throws HttpError(400) on a malformed id
  const customers = await customersCollection();
  const customer = await customers.findOne({ _id: objectId });
  if (!customer) throw new HttpError(400, "ไม่พบข้อมูลลูกค้าที่เลือก");
  if (customer.isDeleted) throw new HttpError(400, "ลูกค้าที่เลือกถูกเก็บถาวรแล้ว กรุณาเลือกลูกค้าอื่น");
  return trimmed;
}

const QUOTE_YEAR = 2567;

type JobTypeMasterEntry = { code: string; name: string; isActive: boolean };

async function loadJobTypeMaster(): Promise<JobTypeMasterEntry[]> {
  const jobTypes = await jobTypesCollection();
  return jobTypes.find({}, { projection: { code: 1, name: 1, isActive: 1 } }).toArray();
}

type TemplateMasterEntry = { id: string; templateName: string; version: string; jobTypeCode: string; isDeleted: boolean };

/** Same "load the small master list, then validate against it" pattern as `loadJobTypeMaster()` —
 * see `validateQuotationTemplate()` in api/_lib/quoteValidation.ts. Only called on create, since a
 * template can never be attached to an existing quote after the fact. Includes `jobTypeCode` (2026-07-14,
 * Codex review High Priority fix) so `validateQuotationTemplate()` can reject a template whose own
 * Job Type doesn't match the quote's validated Job Type — without this, a direct API caller could
 * create e.g. a TA quotation carrying LI template provenance. */
async function loadTemplateMaster(): Promise<TemplateMasterEntry[]> {
  const templates = await quotationTemplatesCollection();
  const docs = await templates.find({}, { projection: { templateName: 1, version: 1, jobTypeCode: 1, isDeleted: 1 } }).toArray();
  return docs.map((d) => ({ id: d._id.toString(), templateName: d.templateName, version: d.version, jobTypeCode: d.jobTypeCode, isDeleted: d.isDeleted }));
}

/** Fetches the one full template document needed to freeze `Quote.templateSnapshot` (see
 * src/lib/quotes.tsx) — only called when `validateQuotationTemplate()` above already confirmed
 * `quotationTemplateId` matches a real, non-deleted record, so this should never come back empty in
 * practice; a `null` here (e.g. a genuinely lost race with a hard delete) just means the quote is
 * created without a snapshot rather than failing the whole request — the 3 provenance strings
 * already validated are enough to still record what was intended. */
async function loadTemplateSnapshot(quotationTemplateId: string): Promise<QuoteFields["templateSnapshot"] | null> {
  const templates = await quotationTemplatesCollection();
  const doc = await templates.findOne({ _id: toObjectId(quotationTemplateId) });
  if (!doc) return null;
  return {
    sections: doc.sections,
    defaultTerms: doc.defaultTerms,
    internalNotes: doc.internalNotes,
    sourceHash: doc.sourceHash,
    capturedAt: nowIso(),
  };
}

function isApprovalAction(v: unknown): v is ApprovalAction {
  return typeof v === "string" && v in workflowTransitions;
}

function isValidInterest(v: unknown): v is QuoteFields["interest"] {
  return v === null || v === "น่าสนใจ" || v === "ไม่น่าสนใจ";
}

const QUOTE_COUNTER_ID = `quote_${QUOTE_YEAR}`;

/**
 * Bootstraps the atomic counter from the current max `_id` sequence number, exactly once per warm
 * serverless instance — needed because this counter doc doesn't exist yet on an already-provisioned
 * deployment (quotes created before this fix have no counter tracking their numbers). Uses `$max`
 * (not `$set`) so a concurrent bootstrap racing this one can never regress the counter below the
 * true current max, and a duplicate-key error from a genuinely concurrent first-insert race is
 * swallowed as "someone else already bootstrapped it" rather than surfaced as a real failure.
 */
let quoteCounterBootstrapped = false;
async function ensureQuoteCounterBootstrapped(
  counters: Awaited<ReturnType<typeof countersCollection>>,
  quotes: Awaited<ReturnType<typeof quotesCollection>>,
): Promise<void> {
  if (quoteCounterBootstrapped) return;
  const existing = await counters.findOne({ _id: QUOTE_COUNTER_ID });
  if (!existing) {
    const docs = await quotes.find({}, { projection: { _id: 1 } }).toArray();
    const maxNum = docs
      .map((d) => parseInt(d._id.split("-").pop() ?? "0", 10))
      .filter((n) => !Number.isNaN(n))
      .reduce((max, n) => Math.max(max, n), 0);
    try {
      await counters.updateOne({ _id: QUOTE_COUNTER_ID }, { $max: { seq: maxNum } }, { upsert: true });
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes("E11000")) throw err;
    }
  }
  quoteCounterBootstrapped = true;
}

/** Atomically reserves the next sequence number — replaces the previous scan-all-quotes-then-max+1 approach, which could race two concurrent creates into the same id (see the 2026-07-10 Codex review). */
async function nextQuoteId(
  counters: Awaited<ReturnType<typeof countersCollection>>,
  quotes: Awaited<ReturnType<typeof quotesCollection>>,
): Promise<string> {
  await ensureQuoteCounterBootstrapped(counters, quotes);
  const result = await counters.findOneAndUpdate(
    { _id: QUOTE_COUNTER_ID },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  const seq = result?.seq ?? 1;
  return `QT-${QUOTE_YEAR}-${String(seq).padStart(4, "0")}`;
}

/** Atomically reserves the next revision number for a rewrite chain, keyed by the chain's root
 * quote id — same `counters` collection + `findOneAndUpdate($inc)` idiom as `nextQuoteId()` above
 * (and Scope of Work's `nextJobSequence()`). No bootstrap needed: this is a brand-new counter
 * namespace with no pre-existing `-R`-suffixed quotes to reconcile against. */
async function nextRevisionNumber(
  counters: Awaited<ReturnType<typeof countersCollection>>,
  rootId: string,
): Promise<number> {
  const result = await counters.findOneAndUpdate(
    { _id: `quote_revision_${rootId}` },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  );
  return result?.seq ?? 1;
}

function thaiDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function cloneLines(lines: QuoteFields["lines"]): QuoteFields["lines"] {
  let idCounter = Date.now();
  return lines.map((l) => ({
    ...l,
    id: idCounter++,
    tags: [...l.tags],
    subDetails: l.subDetails.map((sd, i) => ({ ...sd, id: `sd-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}` })),
  }));
}

/**
 * Validates and sanitizes whichever of `body`'s free-text/date/boolean fields are present, for a
 * PATCH-style partial update — added per the 2026-07-10 Codex review's Critical finding that quote
 * writes previously copied raw client fields into MongoDB with no schema validation. Each field is
 * only included in the returned partial when present in `body` (so an omitted field never
 * overwrites the stored value) — mirrors the previous generic "if (field in body)" copy loop, but
 * validated per-field instead of copied blindly. `interest` is handled by the caller, since only
 * plain edits (not workflow drafts) may move it.
 */
function sanitizePartialQuoteFields(body: Record<string, unknown>): Partial<QuoteFields> {
  const update: Partial<QuoteFields> = {};
  if ("client" in body) update.client = sanitizeShortText(body.client, "ชื่อลูกค้า", true);
  if ("salesperson" in body) update.salesperson = sanitizeShortText(body.salesperson, "พนักงานขาย");
  if ("lines" in body) update.lines = validateLines(body.lines);
  if ("discount" in body) update.discount = sanitizeDiscountPct(body.discount);
  if ("contactName" in body) update.contactName = sanitizeShortText(body.contactName, "ชื่อผู้ติดต่อ");
  if ("contactPhone" in body) update.contactPhone = sanitizeShortText(body.contactPhone, "เบอร์โทรผู้ติดต่อ");
  if ("contactEmail" in body) update.contactEmail = sanitizeShortText(body.contactEmail, "อีเมลผู้ติดต่อ");
  if ("address" in body) update.address = sanitizeShortText(body.address, "ที่อยู่");
  if ("taxId" in body) update.taxId = sanitizeShortText(body.taxId, "เลขประจำตัวผู้เสียภาษี");
  if ("deliveryMethod" in body) update.deliveryMethod = sanitizeShortText(body.deliveryMethod, "วิธีจัดส่ง");
  if ("deliveryAddress" in body) update.deliveryAddress = sanitizeShortText(body.deliveryAddress, "ที่อยู่จัดส่ง");
  if ("project" in body) update.project = sanitizeShortText(body.project, "โครงการ");
  if ("poRef" in body) update.poRef = sanitizeShortText(body.poRef, "เลขที่ใบสั่งซื้อ");
  if ("paymentTerms" in body) update.paymentTerms = sanitizeShortText(body.paymentTerms, "เงื่อนไขการชำระเงิน");
  if ("issueDate" in body) update.issueDate = validateIsoDateOrEmpty(body.issueDate, "วันที่ออกใบเสนอราคา");
  if ("expiryDate" in body) update.expiryDate = validateIsoDateOrEmpty(body.expiryDate, "วันหมดอายุ");
  if ("remarks" in body) update.remarks = sanitizeLongText(body.remarks, "หมายเหตุ");
  if ("revisionNote" in body) update.revisionNote = sanitizeLongText(body.revisionNote, "หมายเหตุการแก้ไข");
  if ("isPotentialOpportunity" in body) update.isPotentialOpportunity = sanitizeBoolean(body.isPotentialOpportunity, "โอกาสในการขาย");
  if ("followUpDate" in body) update.followUpDate = validateIsoDateOrEmpty(body.followUpDate, "วันที่ติดตาม");
  return update;
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const ctx = await requirePermission(req, "quotations:view");
    const quotes = await quotesCollection();
    // Own-quotes-only scoping (added 2026-07-22, per direct user request) — a role holding
    // `quotations:view` but not the new `quotations:viewAll` only sees quotes it created itself.
    // Legacy/seed quotes with an empty `createdByUserId` (ownerless — see the PATCH ownership
    // check below) are visible to everyone regardless, since there's no real "someone else" to
    // exclude them for. `quotations:viewAll` holders (and Super Admin, which bypasses every check)
    // are unaffected and still see every quote, exactly as before this change.
    const filter = roleHasPermission(ctx.role, "quotations:viewAll")
      ? {}
      : { $or: [{ createdByUserId: ctx.user.id }, { createdByUserId: "" }] };
    const docs = await quotes.find(filter).toArray();
    res.status(200).json({ quotes: docs.map(withStringId) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "quotations:create");
    const body: Record<string, unknown> = req.body ?? {};
    const client = sanitizeShortText(body.client, "ชื่อลูกค้า", true);

    const jobTypeMaster = await loadJobTypeMaster();
    const { jobTypeCode, jobTypeName } = validateJobType(body.jobTypeCode, jobTypeMaster, { required: true });
    const templateMaster = await loadTemplateMaster();
    const { quotationTemplateId, quotationTemplateName, quotationTemplateVersion } = validateQuotationTemplate(body.quotationTemplateId, templateMaster, jobTypeCode);
    // 2026-07-15, second Codex-review fix pass (High Priority #2): a real structured snapshot, not
    // just the 3 provenance strings above. `loadTemplateMaster()` only projects the lightweight
    // fields validation needs — this one extra targeted fetch (only when a template was actually
    // matched, never for a blank-start quote) gets the full sections/terms/notes/hash to freeze.
    const templateSnapshot = quotationTemplateId ? await loadTemplateSnapshot(quotationTemplateId) : null;
    const lines = validateLines(body.lines);
    const discount = sanitizeDiscountPct(body.discount);
    // Optional — a quotation may be created against a saved Customer (selected via
    // `src/pages/quotation/CustomerSelector.tsx`) or fully manually entered; either way the
    // Customer Information fields below are always what actually gets saved and shown.
    const customerId = await resolveCustomerIdUpdate(body.customerId);

    const [quotes, counters] = await Promise.all([quotesCollection(), countersCollection()]);
    const id = await nextQuoteId(counters, quotes);
    const today = new Date();
    const customerFields: CustomerFieldSet = {
      client,
      contactName: sanitizeShortText(body.contactName, "ชื่อผู้ติดต่อ"),
      contactPhone: sanitizeShortText(body.contactPhone, "เบอร์โทรผู้ติดต่อ"),
      contactEmail: sanitizeShortText(body.contactEmail, "อีเมลผู้ติดต่อ"),
      address: sanitizeShortText(body.address, "ที่อยู่"),
      taxId: sanitizeShortText(body.taxId, "เลขประจำตัวผู้เสียภาษี"),
      deliveryMethod: sanitizeShortText(body.deliveryMethod, "วิธีจัดส่ง"),
      project: sanitizeShortText(body.project, "โครงการ"),
      deliveryAddress: sanitizeShortText(body.deliveryAddress, "ที่อยู่จัดส่ง"),
    };
    const doc: QuoteFields & { _id: string } = {
      _id: id,
      date: thaiDate(today),
      valid: thaiDate(new Date(today.getTime() + 30 * 86400000)),
      amount: computeQuoteAmount(lines, discount),
      status: "ร่าง",
      salesperson: sanitizeShortText(body.salesperson, "พนักงานขาย"),
      interest: null,
      lines,
      discount,
      ...customerFields,
      poRef: sanitizeShortText(body.poRef, "เลขที่ใบสั่งซื้อ"),
      paymentTerms: sanitizeShortText(body.paymentTerms, "เงื่อนไขการชำระเงิน"),
      issueDate: validateIsoDateOrEmpty(body.issueDate, "วันที่ออกใบเสนอราคา"),
      expiryDate: validateIsoDateOrEmpty(body.expiryDate, "วันหมดอายุ"),
      remarks: sanitizeLongText(body.remarks, "หมายเหตุ"),
      revisionNote: "",
      jobTypeCode,
      jobTypeName,
      isPotentialOpportunity: sanitizeBoolean(body.isPotentialOpportunity, "โอกาสในการขาย"),
      followUpDate: validateIsoDateOrEmpty(body.followUpDate, "วันที่ติดตาม"),
      createdByUserId: ctx.user.id,
      updatedBy: ctx.user.id,
      approvalHistory: [],
      customerSnapshot: buildCustomerSnapshot(customerFields),
      ...(customerId ? { customerId } : {}),
      ...(quotationTemplateId ? { quotationTemplateId, quotationTemplateName, quotationTemplateVersion } : {}),
      ...(templateSnapshot ? { templateSnapshot } : {}),
    };
    await quotes.insertOne(doc);
    // Distinguishes a template-seeded quotation from a Job Type's "start blank" fallback — per the
    // Template Management spec's "Audit Logs" requirement (both are their own tracked event, not
    // just a generic "Quotation Created"). `quotationTemplateId` is already server-validated above
    // (`validateQuotationTemplate()`), so its presence here reliably means the wizard's "ใช้
    // Template นี้" path was taken, not "เริ่มจากแบบฟอร์มเปล่า".
    await writeQuoteAuditEntry(
      ctx,
      quotationTemplateId ? "Quotation Created from Template" : "Quotation Created (Blank)",
      quotationTemplateId
        ? `สร้างใบเสนอราคา ${id} (${client}) จาก Template: ${quotationTemplateName} (v${quotationTemplateVersion})`
        : `สร้างใบเสนอราคา ${id} (${client}) แบบฟอร์มเปล่า สำหรับประเภทงาน ${jobTypeCode}`,
      { quoteId: id, customerName: client },
    );
    res.status(201).json({ quote: withStringId(doc) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");

  const ctx = await requireUser(req);
  const quotes = await quotesCollection();
  const target = await quotes.findOne({ _id: id });
  if (!target) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const isOwner = !target.createdByUserId || target.createdByUserId === ctx.user.id;
  const hasEdit = roleHasPermission(ctx.role, "quotations:edit");
  const hasApprove = roleHasPermission(ctx.role, "quotations:approve");
  if (!hasEdit || !(isOwner || hasApprove)) throw new HttpError(403, "Forbidden");

  const body: Record<string, unknown> = req.body ?? {};
  const update: Partial<QuoteFields> = sanitizePartialQuoteFields(body);
  if ("interest" in body) {
    if (!isValidInterest(body.interest)) throw new HttpError(400, "ค่าความสนใจไม่ถูกต้อง");
    update.interest = body.interest;
  }
  if ("jobTypeCode" in body) {
    const jobTypeMaster = await loadJobTypeMaster();
    // Not required on a plain edit — a legacy quote may already be blank, and forcing every save
    // of some unrelated field to also assign a Job Type would be a real regression, not a fix.
    // A non-blank code, however, must be real: this is the actual gap the review flagged.
    const { jobTypeCode, jobTypeName } = validateJobType(body.jobTypeCode, jobTypeMaster, { required: false });
    update.jobTypeCode = jobTypeCode;
    update.jobTypeName = jobTypeName;
  }

  // The linked customer can only change while the quote is still a Draft (2026-07-14, replacing
  // the earlier "issuer company" feature's identical rule) — once submitted, who the quotation is
  // for is part of what an approver is approving. `"customerId" in body` (not `update.customerId`)
  // so an explicit clear (empty string, un-linking back to a plain manual entry) is still detected.
  let customerLinkChanged = false;
  if ("customerId" in body) {
    if (target.status !== "ร่าง") {
      throw new HttpError(400, "ไม่สามารถเปลี่ยนลูกค้าที่เลือกได้ เนื่องจากใบเสนอราคานี้ไม่ได้อยู่ในสถานะร่างแล้ว");
    }
    const resolvedCustomerId = await resolveCustomerIdUpdate(body.customerId);
    if (resolvedCustomerId !== undefined) {
      customerLinkChanged = true;
      update.customerId = resolvedCustomerId;
    }
  }

  // `customerSnapshot` is refreshed whenever the linked customer changes or any Customer
  // Information field on this PATCH changes, from the *resulting* (already-sanitized) values —
  // otherwise it's left untouched, preserving what a reopened quotation already had (per the
  // business requirement: "Preserve customerSnapshot when reopening quotation").
  const CUSTOMER_FIELD_KEYS = ["client", "contactName", "contactPhone", "contactEmail", "address", "taxId", "deliveryMethod", "project", "deliveryAddress"] as const;
  if (customerLinkChanged || CUSTOMER_FIELD_KEYS.some((k) => k in body)) {
    update.customerSnapshot = buildCustomerSnapshot({
      client: update.client ?? target.client,
      contactName: update.contactName ?? target.contactName,
      contactPhone: update.contactPhone ?? target.contactPhone,
      contactEmail: update.contactEmail ?? target.contactEmail,
      address: update.address ?? target.address,
      taxId: update.taxId ?? target.taxId,
      deliveryMethod: update.deliveryMethod ?? target.deliveryMethod,
      project: update.project ?? target.project,
      deliveryAddress: update.deliveryAddress ?? target.deliveryAddress,
    });
  }

  // `amount` is never client-writable (see quoteValidation.ts) — always server-derived from the
  // resulting effective lines/discount so the two can never drift apart, whether or not this
  // particular PATCH touched either of them.
  const effectiveLines = update.lines ?? target.lines;
  const effectiveDiscount = update.discount ?? target.discount;
  update.amount = computeQuoteAmount(effectiveLines, effectiveDiscount);

  update.updatedBy = ctx.user.id;
  await quotes.updateOne({ _id: id }, { $set: update });
  const updated = await quotes.findOne({ _id: id });
  if (!updated) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  // Only an "interest" toggle (the list-view น่าสนใจ/ไม่น่าสนใจ buttons) skips the audit entry —
  // mirrors the client's previous behavior exactly (only the full edit form's save called
  // onAudit("Quotation Updated", ...); the interest toggle never did), now enforced server-side
  // instead of trusted from the client.
  const bodyKeys = Object.keys(body);
  const isInterestOnlyUpdate = bodyKeys.length > 0 && bodyKeys.every((k) => k === "interest");
  if (!isInterestOnlyUpdate) {
    // A dedicated action name when the linked customer specifically changed — one audit entry per
    // PATCH call either way, not a second entry stacked on top of "Quotation Updated".
    if (customerLinkChanged) {
      await writeQuoteAuditEntry(
        ctx,
        "Quotation Customer Changed",
        updated.customerId ? `เปลี่ยนลูกค้าของใบเสนอราคา ${id} เป็น: ${updated.client}` : `ยกเลิกการเชื่อมโยงลูกค้าของใบเสนอราคา ${id}`,
        { quoteId: id, customerName: updated.client },
      );
    } else {
      await writeQuoteAuditEntry(ctx, "Quotation Updated", `แก้ไขใบเสนอราคา ${id}`, { quoteId: id, customerName: updated.client });
    }
  }

  res.status(200).json({ quote: withStringId(updated) });
}

async function handleDuplicate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "quotations:create");

  const [quotes, counters] = await Promise.all([quotesCollection(), countersCollection()]);
  const source = await quotes.findOne({ _id: id });
  if (!source) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const { _id: _sourceId, ...rest } = source;
  const newId = await nextQuoteId(counters, quotes);
  const lines = cloneLines(source.lines);
  const doc = {
    _id: newId,
    ...rest,
    status: "ร่าง" as const,
    interest: null,
    lines,
    // Recomputed rather than copied from `source.amount` — cheap, and guarantees the invariant
    // holds even if a past write (pre-dating this validation pass) ever left it inconsistent.
    amount: computeQuoteAmount(lines, source.discount),
    createdByUserId: ctx.user.id,
    updatedBy: ctx.user.id,
    approvalHistory: [],
    // Never inherited from the source — see `Quote.revisionNote`'s doc comment (src/lib/quotes.tsx).
    revisionNote: "",
  };
  await quotes.insertOne(doc);
  await writeQuoteAuditEntry(ctx, "Quotation Created", `คัดลอกใบเสนอราคาเป็น ${newId} จาก ${id}`, { quoteId: newId, customerName: doc.client });
  res.status(201).json({ quote: withStringId(doc) });
}

const MAX_REWRITE_ATTEMPTS = 3;

/**
 * "Rewrite/แก้ไข" — creates a new revision of an existing quote (`{root}-R{n}`, e.g.
 * `QT-2567-0041-R1`, then `-R2`, ...). Deliberately modeled on `handleDuplicate()` above (same
 * status-reset/fresh-line/fresh-ownership semantics) — the only real difference is the id: instead
 * of an unrelated fresh sequence number, it's the source's revision root plus an atomically
 * reserved next revision number, so the new record is traceable back to its origin purely through
 * its own `_id` (no new schema field needed). The source quote is never modified. `rootId` is
 * always derived from the *quote actually being rewritten* (`id`), not from any prior revision's
 * root passed by the client, so rewriting an `-R1` correctly advances to `-R2`, never `-R1-R1`.
 */
async function handleRewrite(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "quotations:create");

  const [quotes, counters] = await Promise.all([quotesCollection(), countersCollection()]);
  const source = await quotes.findOne({ _id: id });
  if (!source) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const { _id: _sourceId, ...rest } = source;
  const rootId = getRevisionRoot(id);
  const lines = cloneLines(source.lines);

  for (let attempt = 1; attempt <= MAX_REWRITE_ATTEMPTS; attempt++) {
    const revisionSeq = await nextRevisionNumber(counters, rootId);
    const newId = `${rootId}-R${revisionSeq}`;
    const doc = {
      _id: newId,
      ...rest,
      status: "ร่าง" as const,
      interest: null,
      lines,
      // Recomputed rather than copied from `source.amount` — same defensive invariant as Duplicate.
      amount: computeQuoteAmount(lines, source.discount),
      createdByUserId: ctx.user.id,
      updatedBy: ctx.user.id,
      approvalHistory: [],
      // Never inherited from the source — see `Quote.revisionNote`'s doc comment (src/lib/quotes.tsx).
      revisionNote: "",
    };
    try {
      await quotes.insertOne(doc);
    } catch (err) {
      // Duplicate-key race on `_id` — extremely unlikely since `revisionSeq` is atomically
      // reserved per root, but retry with a freshly-reserved number rather than surfacing a raw
      // 500 to the client (same bounded-retry pattern as Scope of Work's insert race, see
      // scopeOfWorkHandler.ts).
      const isDuplicateKey = err instanceof Error && err.message.includes("E11000");
      if (!isDuplicateKey || attempt === MAX_REWRITE_ATTEMPTS) throw err;
      continue;
    }
    // The quote now genuinely exists in MongoDB — everything below is a best-effort side effect.
    // Its failure must never surface as a client-facing error implying the rewrite itself failed,
    // since that would be false (a real new quote document was just created).
    try {
      await writeQuoteAuditEntry(ctx, "Quotation Rewritten", `สร้างใบเสนอราคาแก้ไข ${newId} จากใบเสนอราคา ${id}`, { quoteId: newId, customerName: doc.client });
    } catch (auditErr) {
      console.error(`Rewrite ${newId}: failed to write audit-log entry`, auditErr);
    }
    res.status(201).json({ quote: withStringId(doc) });
    return;
  }
}

/**
 * Server-side print/PDF gate (added 2026-07-16) — previously printing a Quotation was 100%
 * client-side (`window.print()`, no network call at all — see QuoteDocument.tsx), so an incomplete
 * document could always be printed by opening the browser's print dialog directly. The frontend
 * now calls this endpoint first and only proceeds to `window.print()` on success; a direct call to
 * this URL for an incomplete quote is blocked the same way. Requires `quotations:export` (the same
 * permission that already gates the print button's visibility) rather than `:edit`, since printing
 * doesn't modify the document.
 */
async function handlePrintQuote(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "quotations:export");
  const quotes = await quotesCollection();
  const target = await quotes.findOne({ _id: id });
  if (!target) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const validation = validateQuotationForPrint({
    client: target.client,
    salesperson: target.salesperson,
    contactName: target.contactName,
    contactPhone: target.contactPhone,
    contactEmail: target.contactEmail,
    address: target.address,
    taxId: target.taxId,
    deliveryMethod: target.deliveryMethod,
    deliveryAddress: target.deliveryAddress,
    project: target.project,
    poRef: target.poRef,
    paymentTerms: target.paymentTerms,
    issueDate: target.issueDate,
    expiryDate: target.expiryDate,
    jobTypeCode: target.jobTypeCode,
    remarks: target.remarks,
    followUpDate: target.followUpDate,
    isPotentialOpportunity: target.isPotentialOpportunity,
  });
  if (!validation.valid) {
    throw new HttpError(422, "กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนพิมพ์/ส่งออก PDF", {
      code: "DOCUMENT_INCOMPLETE",
      details: { fieldErrors: validation.fieldErrors, groupErrors: validation.groupErrors },
    });
  }
  res.status(200).json({ ok: true });
}

async function handleWorkflow(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);

  const body = req.body ?? {};
  const rawAction = body.action;
  if (!isApprovalAction(rawAction)) throw new HttpError(400, "Invalid action");
  const action: ApprovalAction = rawAction;
  const comment: string = typeof body.comment === "string" ? body.comment.trim() : "";
  const draft: Record<string, unknown> = typeof body.draft === "object" && body.draft !== null ? body.draft : {};

  // The UI (QuoteDocument.tsx) already requires a comment for these actions and refuses to submit
  // without one, but that's only a client-side check — calling this API directly bypasses it.
  // Flagged by the 2026-07-10 Codex review ("rejection/reject/cancel comments enforced only in UI").
  if (COMMENT_REQUIRED_ACTIONS.has(action) && !comment) {
    throw new HttpError(400, "กรุณาระบุเหตุผล");
  }

  const quotes = await quotesCollection();
  const target = await quotes.findOne({ _id: id });
  if (!target) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const transition = workflowTransitions[action];
  if (!transition.from.includes(target.status)) throw new HttpError(400, "สถานะปัจจุบันไม่รองรับการดำเนินการนี้");

  const isOwner = !target.createdByUserId || target.createdByUserId === ctx.user.id;
  const perms = {
    create: roleHasPermission(ctx.role, "quotations:create"),
    edit: roleHasPermission(ctx.role, "quotations:edit"),
    approve: roleHasPermission(ctx.role, "quotations:approve"),
    reject: roleHasPermission(ctx.role, "quotations:reject"),
    delete: roleHasPermission(ctx.role, "quotations:delete"),
  };
  if (!isWorkflowActionAllowed(action, isOwner, perms)) {
    throw new HttpError(403, `ต้องมีสิทธิ์ "${PERMISSION_LABELS[REQUIRED_PERMISSION_HINT[action]]}"`);
  }

  // Workflow drafts may not move `interest` (plain-edit-only field) — `sanitizePartialQuoteFields`
  // never looks at it, so it's already excluded without needing a second field allowlist.
  const update: Partial<QuoteFields> = sanitizePartialQuoteFields(draft);
  if ("jobTypeCode" in draft) {
    const jobTypeMaster = await loadJobTypeMaster();
    const { jobTypeCode, jobTypeName } = validateJobType(draft.jobTypeCode, jobTypeMaster, { required: false });
    update.jobTypeCode = jobTypeCode;
    update.jobTypeName = jobTypeName;
  }

  // Same Draft-only customer-change rule as the plain PATCH above — `target.status` here is the
  // quote's status *before* this transition applies (e.g. still "ร่าง" for a "submitted" action),
  // so bundling a last-second customer change with the Submit click is fine; any later transition
  // (approve/send/etc.) locks it.
  let workflowCustomerLinkChanged = false;
  if ("customerId" in draft) {
    if (target.status !== "ร่าง") {
      throw new HttpError(400, "ไม่สามารถเปลี่ยนลูกค้าที่เลือกได้ เนื่องจากใบเสนอราคานี้ไม่ได้อยู่ในสถานะร่างแล้ว");
    }
    const resolvedCustomerId = await resolveCustomerIdUpdate(draft.customerId);
    if (resolvedCustomerId !== undefined) {
      workflowCustomerLinkChanged = true;
      update.customerId = resolvedCustomerId;
    }
  }

  const WORKFLOW_CUSTOMER_FIELD_KEYS = ["client", "contactName", "contactPhone", "contactEmail", "address", "taxId", "deliveryMethod", "project", "deliveryAddress"] as const;
  if (workflowCustomerLinkChanged || WORKFLOW_CUSTOMER_FIELD_KEYS.some((k) => k in draft)) {
    update.customerSnapshot = buildCustomerSnapshot({
      client: update.client ?? target.client,
      contactName: update.contactName ?? target.contactName,
      contactPhone: update.contactPhone ?? target.contactPhone,
      contactEmail: update.contactEmail ?? target.contactEmail,
      address: update.address ?? target.address,
      taxId: update.taxId ?? target.taxId,
      deliveryMethod: update.deliveryMethod ?? target.deliveryMethod,
      project: update.project ?? target.project,
      deliveryAddress: update.deliveryAddress ?? target.deliveryAddress,
    });
  }

  const effectiveLines = update.lines ?? target.lines;
  const effectiveDiscount = update.discount ?? target.discount;
  update.amount = computeQuoteAmount(effectiveLines, effectiveDiscount);

  // Required-field/mandatory-selection gate (added 2026-07-16) — every transition except back-to-
  // Draft ("rejected") and abandoning the quote ("cancelled") must leave the document complete.
  // "ร่าง" itself may stay incomplete forever; nothing past it may. Validates the *effective*
  // document (already-saved fields overlaid with this request's draft), not just what changed, so
  // a field left incomplete on an earlier save still blocks a later submit/approve/etc.
  const VALIDATION_EXEMPT_ACTIONS = new Set<ApprovalAction>(["rejected", "cancelled"]);
  if (!VALIDATION_EXEMPT_ACTIONS.has(action)) {
    const effectiveForValidation: QuotationValidationInput = {
      client: update.client ?? target.client,
      salesperson: update.salesperson ?? target.salesperson,
      contactName: update.contactName ?? target.contactName,
      contactPhone: update.contactPhone ?? target.contactPhone,
      contactEmail: update.contactEmail ?? target.contactEmail,
      address: update.address ?? target.address,
      taxId: update.taxId ?? target.taxId,
      deliveryMethod: update.deliveryMethod ?? target.deliveryMethod,
      deliveryAddress: update.deliveryAddress ?? target.deliveryAddress,
      project: update.project ?? target.project,
      poRef: update.poRef ?? target.poRef,
      paymentTerms: update.paymentTerms ?? target.paymentTerms,
      issueDate: update.issueDate ?? target.issueDate,
      expiryDate: update.expiryDate ?? target.expiryDate,
      jobTypeCode: update.jobTypeCode ?? target.jobTypeCode,
      remarks: update.remarks ?? target.remarks,
      followUpDate: update.followUpDate ?? target.followUpDate,
      isPotentialOpportunity: update.isPotentialOpportunity ?? target.isPotentialOpportunity,
    };
    const validation = validateQuotationForFinalization(effectiveForValidation);
    if (!validation.valid) {
      throw new HttpError(422, "กรุณากรอกข้อมูลที่จำเป็นให้ครบก่อนดำเนินการ", {
        code: "DOCUMENT_INCOMPLETE",
        details: { fieldErrors: validation.fieldErrors, groupErrors: validation.groupErrors },
      });
    }
  }

  update.status = transition.to;
  update.createdByUserId = target.createdByUserId || ctx.user.id;
  update.updatedBy = ctx.user.id;
  update.approvalHistory = [
    ...target.approvalHistory,
    {
      id: crypto.randomUUID(),
      userId: ctx.user.id,
      userName: ctx.user.fullName,
      roleName: ctx.role?.name ?? ctx.user.roleKey,
      action,
      comment,
      createdAt: new Date().toISOString(),
    },
  ];

  await quotes.updateOne({ _id: id }, { $set: update });
  const updated = await quotes.findOne({ _id: id });
  if (!updated) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  await createWorkflowNotifications(action, updated, ctx.user.fullName, comment);

  // Matches the exact audit-action naming the client used to send from QuotationPage.tsx's
  // handleWorkflowAction — moved server-side so it can no longer be forged or omitted, not
  // changed in shape (the Audit Log page and Sales Activity Analytics should see identical text).
  const auditAction =
    action === "submitted" ? "Quotation Submitted" :
    action === "approved" ? "Quotation Approved" :
    action === "rejected" ? "Quotation Rejected" :
    "Status Changed";
  await writeQuoteAuditEntry(
    ctx,
    auditAction,
    `${approvalActionLabel[action]} ใบเสนอราคา ${id}${comment ? ` — ${comment}` : ""}`,
    { quoteId: id, customerName: updated.client },
  );

  res.status(200).json({ quote: withStringId(updated) });
}

async function createWorkflowNotifications(
  action: ApprovalAction,
  quote: QuoteFields & { _id: string },
  actorName: string,
  comment: string,
): Promise<void> {
  const createdAt = new Date().toISOString();
  type NotifDoc = {
    recipientUserId: string;
    type: NotificationType;
    title: string;
    description: string;
    module: string;
    relatedQuoteId: string;
    createdAt: string;
    read: boolean;
  };
  const docs: NotifDoc[] = [];
  const add = (recipientUserIds: string[], fields: Omit<NotifDoc, "recipientUserId" | "createdAt" | "read">) => {
    for (const recipientUserId of new Set(recipientUserIds)) {
      docs.push({ ...fields, recipientUserId, createdAt, read: false });
    }
  };

  if (action === "submitted") {
    const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
    const roleList = await roles.find({}).toArray();
    const activeUsers = await users.find({ status: "active" }).toArray();
    const approverIds = activeUsers.filter((u) => roleHasPermission(findRole(roleList, u.roleKey), "quotations:approve")).map((u) => u._id.toString());
    add(approverIds, {
      type: "quotation_submitted",
      title: "ใบเสนอราคารออนุมัติ",
      description: `${actorName} ส่งใบเสนอราคา ${quote._id} (${quote.client}) เพื่อขออนุมัติ`,
      module: "ใบเสนอราคา",
      relatedQuoteId: quote._id,
    });
    if (quote.amount >= HIGH_VALUE_THRESHOLD) {
      const level2Ids = activeUsers.filter((u) => u.roleKey === "approver_2").map((u) => u._id.toString());
      add(level2Ids, {
        type: "quotation_high_value",
        title: "ใบเสนอราคามูลค่าสูงรออนุมัติ",
        description: `ใบเสนอราคา ${quote._id} (${quote.client}) มูลค่า ${quote.amount.toLocaleString("th-TH")} บาท ต้องได้รับการอนุมัติ`,
        module: "ใบเสนอราคา",
        relatedQuoteId: quote._id,
      });
    }
  } else if (quote.createdByUserId) {
    const creatorId = quote.createdByUserId;
    if (action === "approved") {
      add([creatorId], {
        type: "quotation_approved", title: "ใบเสนอราคาได้รับการอนุมัติ",
        description: `${actorName} อนุมัติใบเสนอราคา ${quote._id} (${quote.client})`, module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "rejected") {
      add([creatorId], {
        type: "quotation_rejected", title: "ใบเสนอราคาถูกปฏิเสธ",
        description: `${actorName} ปฏิเสธใบเสนอราคา ${quote._id} (${quote.client})${comment ? ` — เหตุผล: ${comment}` : ""}`,
        module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "customer_accepted") {
      add([creatorId], {
        type: "quotation_customer_accepted", title: "ลูกค้ายอมรับใบเสนอราคา",
        description: `ลูกค้ายอมรับใบเสนอราคา ${quote._id} (${quote.client})`, module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "customer_rejected") {
      add([creatorId], {
        type: "quotation_customer_rejected", title: "ลูกค้าปฏิเสธใบเสนอราคา",
        description: `ลูกค้าปฏิเสธใบเสนอราคา ${quote._id} (${quote.client})${comment ? ` — เหตุผล: ${comment}` : ""}`,
        module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "marked_won") {
      // Added per the 2026-07-10 Codex review ("workflow notifications omit cancellation/Won/Lost
      // events") — submitted/approved/rejected/customer_accepted/customer_rejected already
      // notified the creator; the three terminal actions below silently didn't.
      add([creatorId], {
        type: "quotation_won", title: "ปิดการขายสำเร็จ",
        description: `${actorName} ทำเครื่องหมายใบเสนอราคา ${quote._id} (${quote.client}) เป็นปิดการขายสำเร็จ`,
        module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "marked_lost") {
      add([creatorId], {
        type: "quotation_lost", title: "ปิดการขายไม่สำเร็จ",
        description: `${actorName} ทำเครื่องหมายใบเสนอราคา ${quote._id} (${quote.client}) เป็นปิดการขายไม่สำเร็จ`,
        module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "cancelled") {
      add([creatorId], {
        type: "quotation_cancelled", title: "ใบเสนอราคาถูกยกเลิก",
        description: `${actorName} ยกเลิกใบเสนอราคา ${quote._id} (${quote.client})${comment ? ` — เหตุผล: ${comment}` : ""}`,
        module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    }
  }

  if (docs.length > 0) {
    const notifications = await notificationsCollection();
    await notifications.insertMany(docs);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    // Scope of Work (added 2026-07-15) shares this function file rather than getting its own —
    // Vercel Hobby's 12-function cap is still fully used (see docs/ARCHITECTURE.md). Checked first,
    // on the raw pathname, before falling through to the quotes logic below — same established
    // sharing pattern as api/handlers/customers.ts (/api/search) and api/handlers/jobtypes.ts
    // (/api/quotation-templates). Mounted here specifically (not jobtypes.ts) since a Scope of Work
    // is always created from, and belongs to, exactly one quotation.
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname === "/api/scope-of-works" || pathname.startsWith("/api/scope-of-works/")) {
      return handleScopeOfWork(req, res);
    }
    // Delivery Order (added 2026-07-23) — same sharing pattern as Scope of Work above, created
    // from and always belonging to exactly one Scope of Work, so mounted here rather than getting
    // its own function file (Vercel Hobby's 12-function cap is still fully used).
    if (pathname === "/api/delivery-orders" || pathname.startsWith("/api/delivery-orders/")) {
      return handleDeliveryOrder(req, res);
    }

    const parts = getPathSegments(req, "/api/quotes");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    if (parts.length === 2 && parts[1] === "duplicate") return handleDuplicate(req, res, parts[0]);
    if (parts.length === 2 && parts[1] === "rewrite") return handleRewrite(req, res, parts[0]);
    if (parts.length === 2 && parts[1] === "workflow") return handleWorkflow(req, res, parts[0]);
    if (parts.length === 2 && parts[1] === "print") return handlePrintQuote(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
