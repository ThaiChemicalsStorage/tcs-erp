import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WithId } from "mongodb";
import { ObjectId, MongoServerError } from "mongodb";
import { createHash, randomUUID } from "node:crypto";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, type AuthContext } from "./auth.js";
import { quotationTemplatesCollection, productsCollection, auditLogCollection, toObjectId, withStringId, type QuotationTemplateFields } from "./collections.js";
import { QUOTATION_TEMPLATE_SEEDS, type TemplateSeed } from "./templateSeedData.js";
import { fingerprintSourceWorkbook } from "./templateWorkbookParser.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import type { Permission } from "../../src/lib/permissions.js";
import type { Product } from "../../src/lib/products.js";
import type {
  TemplateImportReport, QuotationTemplateSummary, QuotationTemplate,
  TemplateSection, TemplateItem, TemplateTermLine, TemplateEditableParameter, TemplateItemType,
  TemplateDynamicField, TemplateFieldType, TemplateFieldOption,
} from "../../src/lib/quotationTemplates.js";

/**
 * Quotation Templates API (added 2026-07-14, extended 2026-07-15 with the Template Management
 * module — create/edit/duplicate + granular RBAC + audit logging) — `api/handlers/jobtypes.ts`
 * dispatches `/api/quotation-templates` here on the raw pathname, sharing that function file rather
 * than getting its own (Vercel Hobby's 12-function cap is still fully used — see
 * docs/ARCHITECTURE.md). See docs/MODULES/QuotationTemplates.md for the full feature writeup.
 */

function requireAnyPermission(ctx: AuthContext, permissions: Permission[]): void {
  if (roleHasPermission(ctx.role, "quotationTemplates:manage")) return;
  if (permissions.some((p) => roleHasPermission(ctx.role, p))) return;
  throw new HttpError(403, "Forbidden");
}
function hasAnyPermission(ctx: AuthContext, permissions: Permission[]): boolean {
  return roleHasPermission(ctx.role, "quotationTemplates:manage") || permissions.some((p) => roleHasPermission(ctx.role, p));
}

async function writeTemplateAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
  related: { templateId?: string; templateName: string; jobTypeCode?: string },
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "Template ใบเสนอราคา",
    action,
    details,
    createdAt: nowIso(),
    ...(related.templateId ? { relatedTemplateId: related.templateId } : {}),
    relatedTemplateName: related.templateName,
    ...(related.jobTypeCode ? { relatedJobTypeCode: related.jobTypeCode } : {}),
  });
}

/** Deterministic content hash — anything that would make two imports of the "same" template
 * produce different output changes this hash, so idempotency (`sourceHash` unchanged → skip) is
 * driven by real content, not by a manually-maintained version counter that could drift out of
 * sync. `version`/`templateCode`/`jobTypeCode` are intentionally excluded: a version bump alone
 * (no content change) shouldn't force a "content updated" report line, and the code/jobType are
 * already the upsert key, not content. */
function computeSourceHash(content: {
  templateName: string; description: string; sourceFileName?: string; sourceSheetName?: string;
  sections: TemplateSection[]; defaultTerms: TemplateTermLine[]; internalNotes: string[];
  defaultNotes?: string[]; conditions?: QuotationTemplate["conditions"];
}): string {
  const canonical = JSON.stringify({
    templateName: content.templateName, description: content.description,
    sourceFileName: content.sourceFileName ?? "", sourceSheetName: content.sourceSheetName ?? "",
    sections: content.sections, defaultTerms: content.defaultTerms, internalNotes: content.internalNotes,
    // Added 2026-07-20 — a content-only change to Notes/Condition (no section/term change) must
    // still be detected as "updated," not silently treated as identical.
    defaultNotes: content.defaultNotes ?? [], conditions: content.conditions ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function countInternalNotes(seed: TemplateSeed): number {
  return seed.internalNotes.length
    + seed.sections.reduce((s, sec) => s + sec.items.reduce((s2, it) => s2 + it.internalNotes.length, 0), 0);
}

/** The real idempotent import/upsert — re-running it against unchanged `QUOTATION_TEMPLATE_SEEDS`
 * produces an all-"skipped" report and zero writes, satisfying "importing the same workbook more
 * than once must not create duplicate templates." Upsert key is `templateCode` (a stable natural
 * key, e.g. "TA-FRP-TANK") — never the MongoDB `_id`, so re-running recognizes "the same template"
 * across runs regardless of `_id` generation. Deliberately audit-log-free — both the defensive
 * `seedQuotationTemplatesIfEmpty()` bootstrap (actor "system") and the explicit admin-triggered
 * `handleImport()` call this; only the latter writes an audit entry, from the caller, once, with the
 * real actor identity.
 *
 * **2026-07-15, second Codex-review fix pass** — two changes from the original version:
 * 1. **Real workbook-derived change detection** (High Priority #1): `fingerprintSourceWorkbook()`
 *    reads the actual `.xlsx` file and hashes each sheet's raw content. Every `excel_import` seed's
 *    `sourceWorkbookHash` is set from its matching sheet's fingerprint; if a template's *previously
 *    stored* `sourceWorkbookHash` no longer matches the freshly computed one, a warning is added —
 *    genuinely detecting "the workbook file changed," which was previously impossible (the old
 *    `sourceHash` only ever reflected the hand-transcribed seed, never the workbook itself). If the
 *    workbook can't be read in this environment, fingerprinting is skipped entirely (never fails the
 *    import) — see `templateWorkbookParser.ts`.
 * 2. **Race-safe insert** (Medium Priority, non-atomic upsert): the not-yet-existing branch's
 *    `insertOne()` is now wrapped to treat a duplicate-key error (E11000 on the unique `templateCode`
 *    index — i.e. a concurrent import run inserted it first) as a clean "skipped" outcome instead of
 *    an unhandled 500, since the unique index guarantees no actual duplicate document was created
 *    either way. Still a find-then-write pattern (not a single atomic `findOneAndUpdate`) —
 *    deliberately, to preserve the tested "zero writes when content is genuinely unchanged"
 *    guarantee, which an always-`$set` atomic upsert would break (it would bump `updatedAt` on every
 *    run regardless of content). A genuinely concurrent *content-changing* race remains a documented,
 *    accepted edge case (last-write-wins), not fully serialized — true multi-writer serialization
 *    would need a distributed lock, disproportionate for an admin-triggered, low-frequency action.
 */
export async function upsertQuotationTemplates(actorUserId: string): Promise<TemplateImportReport> {
  const templates = await quotationTemplatesCollection();
  const report: TemplateImportReport = { created: [], updated: [], skipped: [], warnings: [], unrecognizedRows: [], internalNotesDetected: 0 };

  const workbook = fingerprintSourceWorkbook();
  if (!workbook) {
    report.warnings.push("ไม่สามารถอ่านไฟล์ Excel ต้นฉบับได้ในสภาพแวดล้อมนี้ — ข้ามการตรวจสอบการเปลี่ยนแปลงไฟล์รอบนี้ (ไม่กระทบข้อมูล Template ที่มีอยู่)");
  }
  const sheetFingerprint = new Map(workbook?.sheets.map((s) => [s.sheetName, s]) ?? []);

  for (const seed of QUOTATION_TEMPLATE_SEEDS) {
    // Defensive structural check (2026-07-20, Codex review fix pass) — `validateDynamicFieldSchema()`
    // is otherwise only reached via the admin-form path (`sanitizeItem()`); this hardcoded seed data
    // bypasses that path entirely (built straight from `templateSeedData.ts`, not client input), so
    // without this check a future accidental edit to that file (a duplicate field/option key, an
    // empty option list, a dangling `visibleWhen` reference) would silently persist to MongoDB via
    // this import/auto-seed path. Catches per-seed rather than letting one broken template's error
    // propagate and abort the whole loop — an import/auto-seed that processes 4 valid templates and
    // skips 1 broken one (with a clear warning) is far safer than one that 500s outright, especially
    // since `seedQuotationTemplatesIfEmpty()` runs from `GET /api/quotation-templates`/`GET
    // /api/jobtypes` on a fresh/empty database — an unhandled throw here would take those routes down.
    try {
      for (const section of seed.sections) {
        for (const item of section.items) {
          if (item.dynamicFields && item.dynamicFields.length > 0) {
            validateDynamicFieldSchema(`${seed.templateCode}: ${item.name}`, item.dynamicFields);
          }
        }
      }
    } catch (err) {
      report.warnings.push(
        `Template "${seed.templateCode}" มีปัญหาโครงสร้างข้อมูล dynamicFields — ข้ามการนำเข้ารายการนี้: ${err instanceof HttpError ? err.message : String(err)}`,
      );
      report.skipped.push(seed.templateCode);
      continue;
    }

    const sourceHash = computeSourceHash(seed);
    report.internalNotesDetected += countInternalNotes(seed);
    const workbookSheet = sheetFingerprint.get(seed.sourceSheetName);
    const sourceWorkbookHash = workbookSheet?.hash;
    const existing = await templates.findOne({ templateCode: seed.templateCode });
    const now = nowIso();

    if (!existing) {
      const doc: QuotationTemplateFields = {
        ...seed, sourceHash, ...(sourceWorkbookHash ? { sourceWorkbookHash } : {}), isActive: true, isDeleted: false,
        createdAt: now, updatedAt: now, createdBy: actorUserId, updatedBy: actorUserId,
      };
      try {
        await templates.insertOne(doc);
        report.created.push(seed.templateCode);
      } catch (err) {
        if (err instanceof MongoServerError && err.code === 11000) {
          // Lost a concurrent-insert race — another run already created this templateCode. The
          // unique index means no duplicate was written; report it as skipped, same as if this
          // run's own `findOne` above had seen it.
          report.skipped.push(seed.templateCode);
        } else {
          throw err;
        }
      }
      continue;
    }
    if (existing.sourceHash === sourceHash) {
      report.skipped.push(seed.templateCode);
      if (sourceWorkbookHash && existing.sourceWorkbookHash && existing.sourceWorkbookHash !== sourceWorkbookHash) {
        report.warnings.push(
          `ชีต "${seed.sourceSheetName}" ในไฟล์ Excel มีการเปลี่ยนแปลงตั้งแต่ครั้งล่าสุดที่คัดลอกเนื้อหาลง templateSeedData.ts (Template: ${seed.templateCode}) — กรุณาตรวจสอบและปรับปรุงเนื้อหาด้วยตนเอง`,
        );
      }
      // A workbook change alongside an already-changed seed hash falls through to the "updated"
      // branch below instead — the seed content already reflects a re-transcription, so no
      // separate "still needs review" warning is needed in that case.
      continue;
    }
    await templates.updateOne(
      { _id: existing._id },
      { $set: { ...seed, sourceHash, ...(sourceWorkbookHash ? { sourceWorkbookHash } : {}), updatedAt: now, updatedBy: actorUserId } },
    );
    report.updated.push(seed.templateCode);
  }

  return report;
}

let indexesEnsured = false;
async function ensureTemplateIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const templates = await quotationTemplatesCollection();
  try {
    await Promise.all([
      templates.createIndex({ templateCode: 1 }, { unique: true }),
      templates.createIndex({ jobTypeCode: 1 }),
      templates.createIndex({ isActive: 1 }),
      templates.createIndex({ isDeleted: 1 }),
    ]);
  } catch (err) {
    console.error("[quotation-templates] ensureTemplateIndexes failed", err);
  }
  indexesEnsured = true;
}

/** Same lazy defensive pattern as `seedJobTypesIfEmpty()` (see api/_lib/systemSeed.ts /
 * api/handlers/jobtypes.ts) — `ensureIndexes()` only ever runs from the one-time Setup Wizard
 * bootstrap, permanently unreachable on an already-provisioned deployment, so an already-live
 * deployment would otherwise never get the 5 templates without a human remembering to call
 * `POST /api/quotation-templates/import`. Only runs the (cheap) real upsert when the collection is
 * genuinely empty — an explicit import call is still required to pick up *content* changes to
 * `templateSeedData.ts` after the first successful seed. */
async function seedQuotationTemplatesIfEmpty(): Promise<void> {
  const templates = await quotationTemplatesCollection();
  const count = await templates.estimatedDocumentCount();
  if (count > 0) return;
  try {
    await upsertQuotationTemplates("system");
  } catch (err) {
    console.error("[quotation-templates] seedQuotationTemplatesIfEmpty failed", err);
  }
}

function toSummary(doc: WithId<QuotationTemplateFields>): QuotationTemplateSummary {
  const {
    id, templateCode, templateName, jobTypeCode, jobTypeName, description, version,
    sourceType, sourceFileName, sourceSheetName, sections, isActive, isDeleted, updatedAt, updatedBy,
  } = withStringId(doc);
  const itemCount = sections.reduce((s, sec) => s + sec.items.length, 0);
  return {
    id, templateCode, templateName, jobTypeCode, jobTypeName, description, version,
    sourceType, sourceFileName, sourceSheetName, sectionCount: sections.length, itemCount,
    isActive, isDeleted, updatedAt, updatedBy,
  };
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method === "POST") return handleCreate(req, res);
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  // Same "manage vs. pick-for-a-quotation" carve-out already established for Customers
  // (api/_lib/customersHandler.ts) — a Sales user with only `quotations:create` (no template
  // management permission) still needs to browse templates while starting a new quotation.
  const ctx = await requireUser(req);
  const canViewAdmin = hasAnyPermission(ctx, ["quotationTemplates:view"]);
  const canReadForQuotation = roleHasPermission(ctx.role, "quotations:create");
  if (!canViewAdmin && !canReadForQuotation) throw new HttpError(403, "Forbidden");

  await ensureTemplateIndexes();
  await seedQuotationTemplatesIfEmpty();

  const jobTypeCode = typeof req.query.jobTypeCode === "string" ? req.query.jobTypeCode : "";
  const includeArchived = canViewAdmin && req.query.includeArchived === "true";
  const filter: Record<string, unknown> = includeArchived ? {} : { isDeleted: false };
  if (!canViewAdmin) filter.isActive = true;
  if (jobTypeCode) filter.jobTypeCode = jobTypeCode;

  const templates = await quotationTemplatesCollection();
  const docs = await templates.find(filter).sort({ jobTypeCode: 1, templateName: 1 }).toArray();
  res.status(200).json({ templates: docs.map(toSummary) });
}

/** Fields a create/edit form actually submits — see `TemplateContentDraft` in
 * src/lib/quotationTemplates.ts. Defensive but not exhaustively strict (an admin-only authenticated
 * tool, not customer-facing input): coerces types, drops malformed entries, ensures every
 * section/item has a stable non-empty id (regenerating one server-side if the client omitted it). */
function sanitizeParam(raw: unknown): TemplateEditableParameter {
  const p = (raw ?? {}) as Partial<TemplateEditableParameter>;
  return { label: String(p.label ?? ""), value: "", unit: String(p.unit ?? ""), editable: true };
}
function sanitizeStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
}

const DYNAMIC_FIELD_TYPES = new Set<TemplateFieldType>(["dropdown", "radio", "checkboxGroup", "text", "number"]);
function sanitizeFieldOption(raw: unknown): TemplateFieldOption | null {
  const o = (raw ?? {}) as Partial<TemplateFieldOption>;
  const label = String(o.label ?? "").trim();
  if (!label) return null;
  return {
    key: typeof o.key === "string" && o.key ? o.key : randomUUID(),
    label,
    ...(typeof o.defaultChecked === "boolean" ? { defaultChecked: o.defaultChecked } : {}),
    ...(typeof o.omitFromCustomerDisplay === "boolean" ? { omitFromCustomerDisplay: o.omitFromCustomerDisplay } : {}),
  };
}
function sanitizeVisibilityRule(raw: unknown): TemplateDynamicField["visibleWhen"] {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as { fieldKey?: unknown; equalsAny?: unknown };
  const fieldKey = typeof r.fieldKey === "string" ? r.fieldKey.trim() : "";
  if (!fieldKey) return undefined;
  const equalsAny = Array.isArray(r.equalsAny) ? r.equalsAny.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];
  if (equalsAny.length === 0) return undefined;
  return { fieldKey, equalsAny };
}
/** Admin-authored schema for one item's dynamic fields — same "loose but type-safe, admin-only
 * tool" trust level as `sanitizeItem`/`sanitizeSection` below, not the stricter customer-input
 * validation `quoteValidation.ts` applies to a QuoteLine's dynamic-field *values*. Structurally
 * invalid combinations (empty option lists, duplicate keys, dangling `visibleWhen` references) are
 * NOT silently coerced/dropped here — see `validateDynamicFieldSchema()` below, which runs as a
 * second pass over the whole item and rejects those with a field-specific 400 instead (2026-07-20,
 * Codex review Medium Priority fix — this function alone can only sanitize one field in isolation,
 * it has no visibility into its siblings, so it was never the right place to catch a duplicate key
 * or a dangling cross-field reference). */
function sanitizeDynamicField(raw: unknown, sortOrder: number): TemplateDynamicField | null {
  const f = (raw ?? {}) as Partial<TemplateDynamicField>;
  const label = String(f.label ?? "").trim();
  if (!label) return null;
  const type: TemplateFieldType = DYNAMIC_FIELD_TYPES.has(f.type as TemplateFieldType) ? (f.type as TemplateFieldType) : "text";
  const field: TemplateDynamicField = { key: typeof f.key === "string" && f.key ? f.key : randomUUID(), label, type, sortOrder };
  if (type === "dropdown" || type === "radio" || type === "checkboxGroup") {
    field.options = Array.isArray(f.options) ? f.options.map(sanitizeFieldOption).filter((o): o is TemplateFieldOption => o !== null) : [];
  }
  if (type === "text" || type === "number") {
    const unitSuffix = typeof f.unitSuffix === "string" ? f.unitSuffix.trim() : "";
    if (unitSuffix) field.unitSuffix = unitSuffix;
    const placeholder = typeof f.placeholder === "string" ? f.placeholder.trim() : "";
    if (placeholder) field.placeholder = placeholder;
  }
  const visibleWhen = sanitizeVisibilityRule(f.visibleWhen);
  if (visibleWhen) field.visibleWhen = visibleWhen;
  if (type === "checkboxGroup" && f.generateIncludedExcluded === true) field.generateIncludedExcluded = true;
  return field;
}
/** Second-pass structural validation across one item's FULL dynamic-field list (2026-07-20, Codex
 * review Medium Priority fix) — `sanitizeDynamicField()`/`sanitizeFieldOption()`/
 * `sanitizeVisibilityRule()` above each only ever see one field/option/rule in isolation, so none of
 * them could catch a problem that only exists in the RELATIONSHIP between two fields on the same
 * item. Throws a field-specific 400 (no partial write happens — `sanitizeContent()`'s caller only
 * persists after every item validates) instead of persisting a template whose UI/print/validation
 * behavior would silently break: a dropdown/radio/checkboxGroup with no options is unselectable, a
 * duplicate field or option key makes lookups by key ambiguous, and a `visibleWhen.fieldKey` that
 * doesn't name a real sibling field (or `equalsAny` values that don't name real options of that
 * sibling) can never actually become visible. */
export function validateDynamicFieldSchema(itemLabel: string, fields: TemplateDynamicField[]): void {
  const seenFieldKeys = new Set<string>();
  for (const field of fields) {
    if (seenFieldKeys.has(field.key)) {
      throw new HttpError(400, `Template item "${itemLabel}": ฟิลด์ "${field.label}" มี key ซ้ำกับฟิลด์อื่น (${field.key})`);
    }
    seenFieldKeys.add(field.key);

    if (field.type === "dropdown" || field.type === "radio" || field.type === "checkboxGroup") {
      const options = field.options ?? [];
      if (options.length === 0) {
        throw new HttpError(400, `Template item "${itemLabel}": ฟิลด์ "${field.label}" ต้องมีตัวเลือกอย่างน้อย 1 ตัวเลือก`);
      }
      const seenOptionKeys = new Set<string>();
      for (const opt of options) {
        if (seenOptionKeys.has(opt.key)) {
          throw new HttpError(400, `Template item "${itemLabel}": ฟิลด์ "${field.label}" มีตัวเลือกที่มี key ซ้ำ (${opt.key})`);
        }
        seenOptionKeys.add(opt.key);
      }
    }
  }
  for (const field of fields) {
    const rule = field.visibleWhen;
    if (!rule) continue;
    const controlling = fields.find((f) => f.key === rule.fieldKey);
    if (!controlling) {
      throw new HttpError(400, `Template item "${itemLabel}": เงื่อนไขการแสดงผลของฟิลด์ "${field.label}" อ้างอิงฟิลด์ที่ไม่มีอยู่จริง (${rule.fieldKey})`);
    }
    if (controlling.options) {
      const validKeys = new Set(controlling.options.map((o) => o.key));
      const invalidValues = rule.equalsAny.filter((k) => !validKeys.has(k));
      if (invalidValues.length > 0) {
        throw new HttpError(400, `Template item "${itemLabel}": เงื่อนไขการแสดงผลของฟิลด์ "${field.label}" อ้างอิงตัวเลือกที่ไม่มีอยู่จริงในฟิลด์ "${controlling.label}" (${invalidValues.join(", ")})`);
      }
    }
  }
}
/** `undefined` means "the admin never enabled the Condition section" (`raw` itself is absent/not an
 * object — the client only ever sends a `conditions` object at all once the toggle is checked, see
 * `toggleConditions()` in TemplateEditorView.tsx). Deliberately does NOT collapse back to `undefined`
 * just because every sub-field is currently blank — an admin who enables Condition and then clears
 * all its text fields (e.g. wants no Warranty/Delivery suffix wording) has still explicitly enabled
 * it; silently reverting that to "disabled" on save would discard their action with no warning and
 * make the checkbox appear unchecked again next time the template is opened. */
function sanitizeConditions(raw: unknown): QuotationTemplate["conditions"] {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Partial<NonNullable<QuotationTemplate["conditions"]>>;
  return {
    vatConditionText: String(c.vatConditionText ?? "").trim(),
    warrantyUnit: String(c.warrantyUnit ?? "").trim(),
    deliveryUnit: String(c.deliveryUnit ?? "").trim(),
    paymentPresets: sanitizeStringArray(c.paymentPresets),
  };
}

/** Collects every distinct `productId` referenced anywhere in a raw content-draft body, for one
 * batched lookup (see `loadProductMap`) instead of an N+1 query per item. */
function collectProductIds(body: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const sections = Array.isArray(body.sections) ? body.sections : [];
  for (const sec of sections) {
    const items = Array.isArray((sec as Record<string, unknown> | null)?.items) ? (sec as { items: unknown[] }).items : [];
    for (const it of items) {
      const productId = (it as Record<string, unknown> | null)?.productId;
      if (typeof productId === "string" && productId) ids.add(productId);
    }
  }
  return [...ids];
}

/**
 * **2026-07-15, second Codex-review fix pass — Medium Priority fix**: previously `sanitizeItem()`
 * trusted a caller-submitted `productId`/`productSnapshot` verbatim, so a direct (authorized) API
 * call could save a nonexistent product id or an entirely forged `productSnapshot` — the UI picker
 * always supplied genuine data, but the server never actually checked. Now every referenced
 * `productId` is resolved against a real, non-archived `products` record in one batched query
 * *before* sanitizing any item, and `productSnapshot` is always rebuilt server-side from that real
 * record — a client-submitted `productSnapshot` is never persisted verbatim. An unresolvable
 * `productId` (archived, deleted, or simply fabricated) is silently dropped rather than rejecting
 * the whole save: the item keeps whatever name/unit/specs the admin already typed and just becomes
 * an unlinked custom item, matching this feature's existing "custom items are a first-class,
 * non-error case" design rather than treating a stale product reference as a hard validation
 * failure.
 */
async function loadProductMap(productIds: string[]): Promise<Map<string, Product>> {
  if (productIds.length === 0) return new Map();
  const products = await productsCollection();
  const objectIds = productIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (objectIds.length === 0) return new Map();
  const docs = await products.find({ _id: { $in: objectIds }, archived: { $ne: true } }).toArray();
  return new Map(docs.map((d) => [d._id.toString(), withStringId(d)]));
}

function sanitizeItem(raw: unknown, sortOrder: number, productMap: Map<string, Product>): TemplateItem {
  const it = (raw ?? {}) as Partial<TemplateItem>;
  const itemType: TemplateItemType = it.itemType === "subItem" || it.itemType === "specification" ? it.itemType : "item";
  const dynamicFields = Array.isArray(it.dynamicFields)
    ? it.dynamicFields.map((f, i) => sanitizeDynamicField(f, i)).filter((f): f is TemplateDynamicField => f !== null)
    : [];
  if (dynamicFields.length > 0) {
    validateDynamicFieldSchema(String(it.name ?? "").trim() || String(it.id ?? "?"), dynamicFields);
  }
  const item: TemplateItem = {
    id: typeof it.id === "string" && it.id ? it.id : randomUUID(),
    itemType,
    itemCode: String(it.itemCode ?? String(sortOrder + 1)),
    name: String(it.name ?? "").trim(),
    description: String(it.description ?? it.name ?? "").trim(),
    quantity: typeof it.quantity === "number" && Number.isFinite(it.quantity) ? it.quantity : null,
    unit: String(it.unit ?? ""),
    specifications: sanitizeStringArray(it.specifications),
    subDetails: sanitizeStringArray(it.subDetails),
    editableParameters: Array.isArray(it.editableParameters) ? it.editableParameters.map(sanitizeParam) : [],
    internalNotes: sanitizeStringArray(it.internalNotes),
    visibleToCustomer: it.visibleToCustomer !== false,
    sortOrder,
    ...(dynamicFields.length ? { dynamicFields } : {}),
  };
  if (typeof it.productId === "string" && it.productId) {
    const product = productMap.get(it.productId);
    if (product) {
      item.productId = it.productId;
      item.productSnapshot = { code: product.code, name: product.name, unit: product.unit, defaultPrice: product.defaultPrice };
    }
    // else: the referenced product doesn't resolve (archived/deleted/forged) — link dropped, item
    // kept as-is. See this function group's doc comment above.
  }
  return item;
}
function sanitizeSection(raw: unknown, sortOrder: number, productMap: Map<string, Product>): TemplateSection {
  const sec = (raw ?? {}) as Partial<TemplateSection>;
  return {
    id: typeof sec.id === "string" && sec.id ? sec.id : randomUUID(),
    title: String(sec.title ?? "").trim(),
    description: String(sec.description ?? ""),
    sortOrder,
    items: Array.isArray(sec.items) ? sec.items.map((it, i) => sanitizeItem(it, i, productMap)) : [],
  };
}
function sanitizeTerm(raw: unknown): TemplateTermLine | null {
  const t = (raw ?? {}) as Partial<TemplateTermLine>;
  if (t.type !== "paymentTerm" && t.type !== "warrantyTerm" && t.type !== "taxNote") return null;
  const text = String(t.text ?? "").trim();
  if (!text) return null;
  return { type: t.type, text };
}

/** Deliberately excludes `isActive` — that dimension is always handled by the caller's own
 * dedicated `touchesActive` branch (compared against the persisted value, gating on
 * `quotationTemplates:activate`), never bundled into a content save, so an `:edit`-only holder
 * saving unrelated content changes can never accidentally also flip (or be blocked by) active
 * status. See the "Every touched dimension needs its own grant" comment in `handleOne`. */
interface SanitizedContent {
  templateCode: string; templateName: string; jobTypeCode: string; jobTypeName: string;
  description: string; version: string; sections: TemplateSection[]; defaultTerms: TemplateTermLine[];
  internalNotes: string[]; defaultNotes: string[]; conditions?: QuotationTemplate["conditions"];
}
async function sanitizeContent(body: Record<string, unknown>): Promise<SanitizedContent> {
  const templateCode = String(body.templateCode ?? "").trim();
  const templateName = String(body.templateName ?? "").trim();
  const jobTypeCode = String(body.jobTypeCode ?? "").trim();
  if (!templateCode) throw new HttpError(400, "กรุณาระบุ Template Code");
  if (!templateName) throw new HttpError(400, "กรุณาระบุชื่อ Template");
  if (!jobTypeCode) throw new HttpError(400, "กรุณาเลือกประเภทงาน");
  const productMap = await loadProductMap(collectProductIds(body));
  const conditions = sanitizeConditions(body.conditions);
  return {
    templateCode, templateName, jobTypeCode,
    jobTypeName: String(body.jobTypeName ?? ""),
    description: String(body.description ?? ""),
    version: String(body.version ?? "1.0").trim() || "1.0",
    sections: Array.isArray(body.sections) ? body.sections.map((s, i) => sanitizeSection(s, i, productMap)) : [],
    defaultTerms: Array.isArray(body.defaultTerms) ? body.defaultTerms.map(sanitizeTerm).filter((t): t is TemplateTermLine => t !== null) : [],
    internalNotes: sanitizeStringArray(body.internalNotes),
    defaultNotes: sanitizeStringArray(body.defaultNotes),
    ...(conditions ? { conditions } : {}),
  };
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  const ctx = await requireUser(req);
  requireAnyPermission(ctx, ["quotationTemplates:create"]);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const content = await sanitizeContent(body);

  const templates = await quotationTemplatesCollection();
  const existing = await templates.findOne({ templateCode: content.templateCode });
  if (existing) throw new HttpError(409, "มี Template Code นี้อยู่แล้ว");

  const now = nowIso();
  // A brand-new record has no "previous active state" to protect, so `:create` alone controls its
  // initial `isActive` — unlike an edit-save on an *existing* template, where flipping `isActive`
  // requires the separate `:activate` grant (see `handleOne`'s PATCH `touchesActive`).
  const doc: QuotationTemplateFields = {
    ...content,
    isActive: body.isActive === true,
    sourceType: "manual",
    sourceFileName: "",
    sourceSheetName: "",
    sourceHash: computeSourceHash(content),
    isDeleted: false,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const result = await templates.insertOne(doc);
  const created = { ...doc, _id: result.insertedId };
  await writeTemplateAuditEntry(
    ctx, "Template Created", `สร้าง Template ใหม่: ${content.templateName} (${content.templateCode})`,
    { templateId: result.insertedId.toString(), templateName: content.templateName, jobTypeCode: content.jobTypeCode },
  );
  res.status(201).json({ template: withStringId(created) satisfies QuotationTemplate });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") {
    const ctx = await requireUser(req);
    const canViewAdmin = hasAnyPermission(ctx, ["quotationTemplates:view"]);
    const canReadForQuotation = roleHasPermission(ctx.role, "quotations:create");
    if (!canViewAdmin && !canReadForQuotation) throw new HttpError(403, "Forbidden");

    const templates = await quotationTemplatesCollection();
    const doc = await templates.findOne({ _id: toObjectId(id), ...(canViewAdmin ? {} : { isDeleted: false }) });
    if (!doc) throw new HttpError(404, "ไม่พบ Template");
    if (!canViewAdmin && !doc.isActive) throw new HttpError(404, "ไม่พบ Template");
    res.status(200).json({ template: withStringId(doc) });
    return;
  }

  if (req.method === "PATCH") {
    const ctx = await requireUser(req);
    const body = (req.body ?? {}) as Record<string, unknown>;

    const templates = await quotationTemplatesCollection();
    const objectId = toObjectId(id);
    const target = await templates.findOne({ _id: objectId });
    if (!target) throw new HttpError(404, "ไม่พบ Template");

    // Compared against the *persisted* value, not just field presence — the edit form's full
    // `TemplateContentDraft` always includes `isActive` (it needs to display current status), so a
    // plain content save that leaves `isActive` unchanged must not also require `:activate`. Only
    // an actual change to that dimension pulls in its dedicated permission.
    const touchesActive = typeof body.isActive === "boolean" && body.isActive !== target.isActive;
    const touchesArchive = typeof body.isDeleted === "boolean" && body.isDeleted !== target.isDeleted;
    const touchesContent = "templateCode" in body || "sections" in body;

    const requiredPerms: Permission[] = [];
    if (touchesActive) requiredPerms.push("quotationTemplates:activate");
    if (touchesArchive) requiredPerms.push("quotationTemplates:archive");
    if (touchesContent) requiredPerms.push("quotationTemplates:edit");
    if (requiredPerms.length === 0 && !("isActive" in body) && !("isDeleted" in body) && !touchesContent) {
      throw new HttpError(400, "ไม่มีข้อมูลที่จะอัปเดต");
    }
    // Every touched dimension needs its own grant (or the blanket :manage) — an "activate"-only
    // holder can flip isActive but can't sneak a content edit through the same call.
    if (!roleHasPermission(ctx.role, "quotationTemplates:manage") && !requiredPerms.every((p) => roleHasPermission(ctx.role, p))) {
      throw new HttpError(403, "Forbidden");
    }

    const update: Record<string, unknown> = {};
    let auditAction = "";
    let auditDetails = "";

    if (touchesContent) {
      const content = await sanitizeContent(body);
      if (content.templateCode !== target.templateCode) {
        const clash = await templates.findOne({ templateCode: content.templateCode, _id: { $ne: objectId } });
        if (clash) throw new HttpError(409, "มี Template Code นี้อยู่แล้ว");
      }
      Object.assign(update, content, { sourceHash: computeSourceHash(content) });
      auditAction = "Template Updated";
      auditDetails = `แก้ไข Template: ${content.templateName} (${content.templateCode})`;
    }
    if (touchesActive) {
      update.isActive = body.isActive as boolean;
      if (!auditAction) {
        auditAction = update.isActive ? "Template Activated" : "Template Deactivated";
        auditDetails = `${update.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"} Template: ${target.templateName} (${target.templateCode})`;
      }
    }
    if (touchesArchive) {
      update.isDeleted = body.isDeleted as boolean;
      if (!auditAction) {
        auditAction = update.isDeleted ? "Template Archived" : "Template Unarchived";
        auditDetails = `${update.isDeleted ? "เก็บถาวร" : "กู้คืน"} Template: ${target.templateName} (${target.templateCode})`;
      }
    }

    update.updatedAt = nowIso();
    update.updatedBy = ctx.user.id;
    await templates.updateOne({ _id: objectId }, { $set: update });
    const updated = await templates.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบ Template");
    await writeTemplateAuditEntry(ctx, auditAction, auditDetails, {
      templateId: id, templateName: updated.templateName, jobTypeCode: updated.jobTypeCode,
    });
    res.status(200).json({ template: touchesContent ? withStringId(updated) : toSummary(updated) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

/** Generates a fresh, unique `templateCode` for a duplicate when the caller doesn't supply one —
 * `<original>-COPY`, then `-COPY-2`, `-COPY-3`... until a free one is found. */
async function generateCopyCode(base: string): Promise<string> {
  const templates = await quotationTemplatesCollection();
  let candidate = `${base}-COPY`;
  let n = 2;
  while (await templates.findOne({ templateCode: candidate })) {
    candidate = `${base}-COPY-${n}`;
    n += 1;
  }
  return candidate;
}

async function handleDuplicate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  requireAnyPermission(ctx, ["quotationTemplates:duplicate"]);

  const templates = await quotationTemplatesCollection();
  const source = await templates.findOne({ _id: toObjectId(id) });
  if (!source) throw new HttpError(404, "ไม่พบ Template");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const requestedCode = typeof body.newTemplateCode === "string" ? body.newTemplateCode.trim() : "";
  const newTemplateCode = requestedCode || (await generateCopyCode(source.templateCode));
  if (requestedCode) {
    const clash = await templates.findOne({ templateCode: newTemplateCode });
    if (clash) throw new HttpError(409, "มี Template Code นี้อยู่แล้ว");
  }

  // Deep-clone with fresh ids — a duplicate must never share a section/item id with its source, so
  // editing either afterward can't accidentally collide client-side.
  const sections: TemplateSection[] = source.sections.map((sec) => ({
    ...sec,
    id: randomUUID(),
    items: sec.items.map((it) => ({ ...it, id: randomUUID() })),
  }));

  const now = nowIso();
  const content = {
    templateCode: newTemplateCode,
    templateName: `${source.templateName} (Copy)`,
    jobTypeCode: source.jobTypeCode,
    jobTypeName: source.jobTypeName,
    description: source.description,
    version: "1.0",
    sections,
    defaultTerms: [...source.defaultTerms],
    internalNotes: [...source.internalNotes],
    defaultNotes: [...(source.defaultNotes ?? [])],
    ...(source.conditions ? { conditions: source.conditions } : {}),
    isActive: false,
  };
  const doc: QuotationTemplateFields = {
    ...content,
    sourceType: "manual",
    sourceFileName: source.sourceFileName,
    sourceSheetName: source.sourceSheetName,
    sourceHash: computeSourceHash(content),
    isDeleted: false,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const result = await templates.insertOne(doc);
  const created = { ...doc, _id: result.insertedId };
  await writeTemplateAuditEntry(
    ctx, "Template Duplicated", `ทำสำเนา Template จาก ${source.templateCode} เป็น ${newTemplateCode}`,
    { templateId: result.insertedId.toString(), templateName: content.templateName, jobTypeCode: content.jobTypeCode },
  );
  res.status(201).json({ template: withStringId(created) satisfies QuotationTemplate });
}

async function handleImport(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  requireAnyPermission(ctx, ["quotationTemplates:import"]);
  await ensureTemplateIndexes();
  const report = await upsertQuotationTemplates(ctx.user.id);
  // Warnings (e.g. "the workbook sheet changed but templateSeedData.ts wasn't re-transcribed") are
  // appended to the audit details so they leave a permanent record — the client-side toast is
  // transient (2.8s auto-dismiss), so Audit Log is the durable place to actually see them later.
  const warningsSuffix = report.warnings.length > 0 ? ` — คำเตือน ${report.warnings.length} รายการ: ${report.warnings.join(" | ")}` : "";
  await writeTemplateAuditEntry(
    ctx, "Templates Imported",
    `นำเข้า Template จาก Excel — สร้างใหม่ ${report.created.length}, อัปเดต ${report.updated.length}, ข้าม ${report.skipped.length} รายการ${warningsSuffix}`,
    { templateName: "Excel Import" },
  );
  res.status(200).json(report);
}

export async function handleQuotationTemplates(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/quotation-templates");

  if (parts.length === 0) return handleList(req, res);
  if (parts.length === 1 && parts[0] === "import") return handleImport(req, res);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "duplicate") return handleDuplicate(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
