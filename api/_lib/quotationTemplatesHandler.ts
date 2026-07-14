import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WithId } from "mongodb";
import { createHash } from "node:crypto";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, requireUser } from "./auth.js";
import { quotationTemplatesCollection, toObjectId, withStringId, type QuotationTemplateFields } from "./collections.js";
import { QUOTATION_TEMPLATE_SEEDS, type TemplateSeed } from "./templateSeedData.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import type { TemplateImportReport, QuotationTemplateSummary } from "../../src/lib/quotationTemplates.js";

/**
 * Quotation Templates API (added 2026-07-14) — `api/handlers/jobtypes.ts` dispatches
 * `/api/quotation-templates` here on the raw pathname, sharing that function file rather than
 * getting its own (Vercel Hobby's 12-function cap is still fully used — see
 * docs/ARCHITECTURE.md). Thematically the closest existing handler, since templates are keyed by
 * Job Type. See docs/MODULES/QuotationTemplates.md for the full feature writeup.
 */

/** Deterministic content hash — anything that would make two imports of the "same" template
 * produce different output changes this hash, so idempotency (`sourceHash` unchanged → skip) is
 * driven by real content, not by a manually-maintained version counter that could drift out of
 * sync. `version`/`templateCode`/`jobTypeCode` are intentionally excluded: a version bump alone
 * (no content change) shouldn't force a "content updated" report line, and the code/jobType are
 * already the upsert key, not content. */
function computeSourceHash(seed: TemplateSeed): string {
  const canonical = JSON.stringify({
    templateName: seed.templateName, description: seed.description,
    sourceFileName: seed.sourceFileName, sourceSheetName: seed.sourceSheetName,
    sections: seed.sections, defaultTerms: seed.defaultTerms, internalNotes: seed.internalNotes,
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
 * across runs regardless of `_id` generation. */
export async function upsertQuotationTemplates(actorUserId: string): Promise<TemplateImportReport> {
  const templates = await quotationTemplatesCollection();
  const report: TemplateImportReport = { created: [], updated: [], skipped: [], warnings: [], unrecognizedRows: [], internalNotesDetected: 0 };

  for (const seed of QUOTATION_TEMPLATE_SEEDS) {
    const sourceHash = computeSourceHash(seed);
    report.internalNotesDetected += countInternalNotes(seed);
    const existing = await templates.findOne({ templateCode: seed.templateCode });
    const now = nowIso();

    if (!existing) {
      const doc: QuotationTemplateFields = {
        ...seed, sourceHash, isActive: true, isDeleted: false,
        createdAt: now, updatedAt: now, createdBy: actorUserId, updatedBy: actorUserId,
      };
      await templates.insertOne(doc);
      report.created.push(seed.templateCode);
      continue;
    }
    if (existing.sourceHash === sourceHash) {
      report.skipped.push(seed.templateCode);
      continue;
    }
    await templates.updateOne(
      { _id: existing._id },
      { $set: { ...seed, sourceHash, updatedAt: now, updatedBy: actorUserId } },
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
  const { id, templateCode, templateName, jobTypeCode, jobTypeName, description, version, sourceFileName, sourceSheetName, sections, isActive } = withStringId(doc);
  const itemCount = sections.reduce((s, sec) => s + sec.items.length, 0);
  return { id, templateCode, templateName, jobTypeCode, jobTypeName, description, version, sourceFileName, sourceSheetName, sectionCount: sections.length, itemCount, isActive };
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  // Same "manage vs. pick-for-a-quotation" carve-out already established for Customers
  // (api/_lib/customersHandler.ts) — a Sales user with only `quotations:create` (no
  // `quotationTemplates:manage`) still needs to browse templates while starting a new quotation.
  const ctx = await requireUser(req);
  const canManage = roleHasPermission(ctx.role, "quotationTemplates:manage");
  const canReadForQuotation = roleHasPermission(ctx.role, "quotations:create");
  if (!canManage && !canReadForQuotation) throw new HttpError(403, "Forbidden");

  await ensureTemplateIndexes();
  await seedQuotationTemplatesIfEmpty();

  const jobTypeCode = typeof req.query.jobTypeCode === "string" ? req.query.jobTypeCode : "";
  const filter: Record<string, unknown> = canManage ? { isDeleted: false } : { isDeleted: false, isActive: true };
  if (jobTypeCode) filter.jobTypeCode = jobTypeCode;

  const templates = await quotationTemplatesCollection();
  const docs = await templates.find(filter).sort({ jobTypeCode: 1, templateName: 1 }).toArray();
  res.status(200).json({ templates: docs.map(toSummary) });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") {
    const ctx = await requireUser(req);
    const canManage = roleHasPermission(ctx.role, "quotationTemplates:manage");
    const canReadForQuotation = roleHasPermission(ctx.role, "quotations:create");
    if (!canManage && !canReadForQuotation) throw new HttpError(403, "Forbidden");

    const templates = await quotationTemplatesCollection();
    const doc = await templates.findOne({ _id: toObjectId(id), isDeleted: false });
    if (!doc) throw new HttpError(404, "ไม่พบ Template");
    if (!canManage && !doc.isActive) throw new HttpError(404, "ไม่พบ Template");
    res.status(200).json({ template: withStringId(doc) });
    return;
  }

  if (req.method === "PATCH") {
    const ctx = await requirePermission(req, "quotationTemplates:manage");
    const templates = await quotationTemplatesCollection();
    const objectId = toObjectId(id);
    const target = await templates.findOne({ _id: objectId });
    if (!target) throw new HttpError(404, "ไม่พบ Template");

    const body = req.body ?? {};
    const update: Record<string, unknown> = {};
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;
    if (typeof body.isDeleted === "boolean") update.isDeleted = body.isDeleted;
    if (Object.keys(update).length > 0) {
      update.updatedAt = nowIso();
      update.updatedBy = ctx.user.id;
      await templates.updateOne({ _id: objectId }, { $set: update });
    }
    const updated = await templates.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบ Template");
    res.status(200).json({ template: toSummary(updated) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleImport(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "quotationTemplates:manage");
  await ensureTemplateIndexes();
  const report = await upsertQuotationTemplates(ctx.user.id);
  res.status(200).json(report);
}

export async function handleQuotationTemplates(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/quotation-templates");

  if (parts.length === 0) return handleList(req, res);
  if (parts.length === 1 && parts[0] === "import") return handleImport(req, res);
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
