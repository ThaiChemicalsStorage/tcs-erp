import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { WithId } from "mongodb";
import { MongoServerError } from "mongodb";
import { createHash, randomBytes } from "node:crypto";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission } from "./auth.js";
import { serviceTemplatesCollection, withStringId, toObjectId, type ServiceTemplateFields } from "./collections.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText, sanitizeBoolean } from "./quoteValidation.js";
import { SERVICE_TEMPLATE_SEED_DATA } from "./serviceTemplateSeedData.js";
import type {
  ServiceTemplate, ServiceTemplateSummary, ServiceChecklistSectionDef, ServiceChecklistGroupDef,
  ServiceChecklistItemDef, ServiceChecklistItemKind,
} from "../../src/lib/serviceTemplates.js";

/**
 * Service Checklist Template API (added 2026-08-06, Phase 1) — mounted from
 * `api/handlers/customers.ts` on the raw pathname (Vercel Hobby's 12-function cap is fully used —
 * see docs/ARCHITECTURE.md), the same sharing pattern that file already uses for `/api/search`.
 * See docs/MODULES/Service.md for the full feature writeup.
 */

// ─── Idempotent seed upsert ────────────────────────────────────────────────────────────────────

/** Deterministic content hash — a version bump alone shouldn't force a "content changed" report
 * line, so only the actual checklist content is hashed (same "hash real content, not a
 * manually-maintained counter" idea as quotationTemplatesHandler.ts's computeSourceHash()). */
function computeSourceHash(entry: { templateName: string; description: string; sections: ServiceChecklistSectionDef[] }): string {
  const canonical = JSON.stringify({ templateName: entry.templateName, description: entry.description, sections: entry.sections });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Idempotent — re-running against unchanged SERVICE_TEMPLATE_SEED_DATA produces zero writes.
 * Upsert key is `templateCode` (a stable natural key), never the MongoDB `_id`. */
export async function upsertServiceTemplates(actorUserId: string): Promise<void> {
  const serviceTemplates = await serviceTemplatesCollection();
  for (const seed of SERVICE_TEMPLATE_SEED_DATA) {
    const sourceHash = computeSourceHash(seed);
    const existing = await serviceTemplates.findOne({ templateCode: seed.templateCode });
    const now = nowIso();
    if (!existing) {
      const doc: ServiceTemplateFields = {
        templateCode: seed.templateCode, templateName: seed.templateName, description: seed.description,
        version: seed.version, sourceType: "seed", sourceFileName: seed.sourceFileName, sourceSheetName: seed.sourceSheetName,
        sourceHash, sections: seed.sections, isActive: true, isDeleted: false,
        createdAt: now, updatedAt: now, createdBy: actorUserId, updatedBy: actorUserId,
      };
      try {
        await serviceTemplates.insertOne(doc);
      } catch (err) {
        // Lost a concurrent-seed race — the unique templateCode index means no duplicate was written.
        if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
      }
      continue;
    }
    if (existing.sourceHash === sourceHash) continue;
    await serviceTemplates.updateOne(
      { _id: existing._id },
      { $set: { templateName: seed.templateName, description: seed.description, version: seed.version, sections: seed.sections, sourceHash, updatedAt: now, updatedBy: actorUserId } },
    );
  }
}

/** Same lazy "seed on first real request" idiom as `seedJobTypesIfEmpty()`/
 * `seedQuotationTemplatesIfEmpty()` — `ensureIndexes()` only ever runs from the one-time Setup
 * Wizard bootstrap, permanently unreachable on an already-provisioned deployment. */
async function seedServiceTemplatesIfEmpty(): Promise<void> {
  const serviceTemplates = await serviceTemplatesCollection();
  const count = await serviceTemplates.estimatedDocumentCount();
  if (count > 0) return;
  await upsertServiceTemplates("system");
}

let indexesEnsured = false;
async function ensureServiceTemplateIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const serviceTemplates = await serviceTemplatesCollection();
  try {
    await Promise.all([
      serviceTemplates.createIndex({ templateCode: 1 }, { unique: true }),
      serviceTemplates.createIndex({ isActive: 1 }),
      serviceTemplates.createIndex({ isDeleted: 1 }),
    ]);
  } catch (err) {
    console.error("[service-templates] ensureServiceTemplateIndexes failed", err);
  }
  indexesEnsured = true;
}

// ─── Sanitizers ─────────────────────────────────────────────────────────────────────────────────

const MAX_SECTIONS = 30;
const MAX_GROUPS_PER_SECTION = 30;
const MAX_ITEMS_PER_GROUP = 60;
const VALID_ITEM_KINDS = new Set<ServiceChecklistItemKind>(["normalAbnormal", "measurement"]);

function sanitizeItemKind(v: unknown): ServiceChecklistItemKind {
  if (typeof v === "string" && VALID_ITEM_KINDS.has(v as ServiceChecklistItemKind)) return v as ServiceChecklistItemKind;
  return "normalAbnormal";
}

function sanitizeItem(raw: unknown, index: number): ServiceChecklistItemDef {
  if (typeof raw !== "object" || raw === null) throw new HttpError(400, `รายการตรวจเช็คที่ ${index + 1} ไม่ถูกต้อง`);
  const r = raw as Record<string, unknown>;
  const label = sanitizeShortText(r.label, `ชื่อรายการตรวจเช็คที่ ${index + 1}`, true);
  const key = sanitizeShortText(r.key, `รหัสรายการตรวจเช็คที่ ${index + 1}`, false) || `item-${randomBytes(4).toString("hex")}`;
  const unit = sanitizeShortText(r.unit, `หน่วยของรายการที่ ${index + 1}`, false);
  return { key, label, kind: sanitizeItemKind(r.kind), sortOrder: index, ...(unit ? { unit } : {}) };
}

function sanitizeGroup(raw: unknown, index: number): ServiceChecklistGroupDef {
  if (typeof raw !== "object" || raw === null) throw new HttpError(400, `กลุ่มตรวจเช็คที่ ${index + 1} ไม่ถูกต้อง`);
  const r = raw as Record<string, unknown>;
  const title = sanitizeShortText(r.title, `ชื่อกลุ่มตรวจเช็คที่ ${index + 1}`, true);
  const key = sanitizeShortText(r.key, `รหัสกลุ่มตรวจเช็คที่ ${index + 1}`, false) || `group-${randomBytes(4).toString("hex")}`;
  const rawItems = Array.isArray(r.items) ? r.items : [];
  if (rawItems.length > MAX_ITEMS_PER_GROUP) throw new HttpError(400, `กลุ่ม "${title}" มีรายการมากเกินไป (สูงสุด ${MAX_ITEMS_PER_GROUP} รายการ)`);
  return { key, title, sortOrder: index, items: rawItems.map((it, i) => sanitizeItem(it, i)) };
}

function sanitizeSection(raw: unknown, index: number): ServiceChecklistSectionDef {
  if (typeof raw !== "object" || raw === null) throw new HttpError(400, `หมวดตรวจเช็คที่ ${index + 1} ไม่ถูกต้อง`);
  const r = raw as Record<string, unknown>;
  const title = sanitizeShortText(r.title, `ชื่อหมวดตรวจเช็คที่ ${index + 1}`, true);
  const key = sanitizeShortText(r.key, `รหัสหมวดตรวจเช็คที่ ${index + 1}`, false) || `section-${randomBytes(4).toString("hex")}`;
  const rawGroups = Array.isArray(r.groups) ? r.groups : [];
  if (rawGroups.length > MAX_GROUPS_PER_SECTION) throw new HttpError(400, `หมวด "${title}" มีกลุ่มมากเกินไป (สูงสุด ${MAX_GROUPS_PER_SECTION} กลุ่ม)`);
  return {
    key, title, sortOrder: index,
    isOptionalAddon: sanitizeBoolean(r.isOptionalAddon, `ประเภทของหมวด "${title}"`),
    groups: rawGroups.map((g, i) => sanitizeGroup(g, i)),
  };
}

function sanitizeSections(raw: unknown): ServiceChecklistSectionDef[] {
  if (!Array.isArray(raw)) throw new HttpError(400, "รูปแบบเช็คลิสต์ไม่ถูกต้อง");
  if (raw.length === 0) throw new HttpError(400, "กรุณาเพิ่มหมวดตรวจเช็คอย่างน้อย 1 หมวด");
  if (raw.length > MAX_SECTIONS) throw new HttpError(400, `มีหมวดตรวจเช็คมากเกินไป (สูงสุด ${MAX_SECTIONS} หมวด)`);
  return raw.map((s, i) => sanitizeSection(s, i));
}

function generateTemplateCode(): string {
  return `SVC-CUSTOM-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// ─── Handlers ───────────────────────────────────────────────────────────────────────────────────

function toSummary(doc: WithId<ServiceTemplateFields>): ServiceTemplateSummary {
  const full = withStringId(doc);
  const itemCount = full.sections.reduce((n, s) => n + s.groups.reduce((m, g) => m + g.items.length, 0), 0);
  return {
    id: full.id, templateCode: full.templateCode, templateName: full.templateName, version: full.version,
    sectionCount: full.sections.length, itemCount, isActive: full.isActive, isDeleted: full.isDeleted, updatedAt: full.updatedAt,
  };
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "serviceTemplates:view");
  await ensureServiceTemplateIndexes();
  await seedServiceTemplatesIfEmpty();
  const serviceTemplates = await serviceTemplatesCollection();
  const docs = await serviceTemplates.find({}).sort({ templateCode: 1 }).toArray();
  res.status(200).json({ serviceTemplates: docs.map(toSummary) });
}

async function loadTemplateOrThrow(id: string): Promise<WithId<ServiceTemplateFields>> {
  const serviceTemplates = await serviceTemplatesCollection();
  const doc = await serviceTemplates.findOne({ _id: toObjectId(id) });
  if (!doc) throw new HttpError(404, "ไม่พบ Template รายงานบริการ");
  return doc;
}

async function handleGetOne(req: VercelRequest, res: VercelResponse, id: string) {
  await requirePermission(req, "serviceTemplates:view");
  const doc = await loadTemplateOrThrow(id);
  res.status(200).json({ serviceTemplate: withStringId(doc) satisfies ServiceTemplate });
}

async function handleCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "serviceTemplates:create");
  await ensureServiceTemplateIndexes();
  const body = (req.body ?? {}) as Record<string, unknown>;
  const templateName = sanitizeShortText(body.templateName, "ชื่อ Template", true);
  const description = sanitizeLongText(body.description, "คำอธิบาย Template");
  const sections = sanitizeSections(body.sections);

  const serviceTemplates = await serviceTemplatesCollection();
  const now = nowIso();
  let templateCode = generateTemplateCode();
  const doc: ServiceTemplateFields = {
    templateCode, templateName, description, version: "1.0", sourceType: "manual",
    sourceFileName: "", sourceSheetName: "", sourceHash: computeSourceHash({ templateName, description, sections }),
    sections, isActive: true, isDeleted: false,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  let insertedId;
  try {
    const result = await serviceTemplates.insertOne(doc);
    insertedId = result.insertedId;
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) {
      // Astronomically unlikely random-code collision — retry once with a fresh code.
      templateCode = generateTemplateCode();
      const result = await serviceTemplates.insertOne({ ...doc, templateCode });
      insertedId = result.insertedId;
    } else {
      throw err;
    }
  }
  res.status(201).json({ serviceTemplate: withStringId({ ...doc, _id: insertedId }) satisfies ServiceTemplate });
}

async function handleUpdate(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requirePermission(req, "serviceTemplates:edit");
  const doc = await loadTemplateOrThrow(id);
  const body = (req.body ?? {}) as Record<string, unknown>;

  const update: Partial<ServiceTemplateFields> = {};
  if ("templateName" in body) update.templateName = sanitizeShortText(body.templateName, "ชื่อ Template", true);
  if ("description" in body) update.description = sanitizeLongText(body.description, "คำอธิบาย Template");
  if ("sections" in body) update.sections = sanitizeSections(body.sections);
  if ("isActive" in body) update.isActive = sanitizeBoolean(body.isActive, "สถานะเปิดใช้งาน");
  if (update.templateName !== undefined || update.description !== undefined || update.sections !== undefined) {
    update.sourceHash = computeSourceHash({
      templateName: update.templateName ?? doc.templateName,
      description: update.description ?? doc.description,
      sections: update.sections ?? doc.sections,
    });
    update.sourceType = "manual";
  }
  update.updatedAt = nowIso();
  update.updatedBy = ctx.user.id;

  const serviceTemplates = await serviceTemplatesCollection();
  await serviceTemplates.updateOne({ _id: doc._id }, { $set: update });
  const updated = await serviceTemplates.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Template รายงานบริการ");
  res.status(200).json({ serviceTemplate: withStringId(updated) satisfies ServiceTemplate });
}

async function handleDuplicate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "serviceTemplates:create");
  const source = await loadTemplateOrThrow(id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const templateName = sanitizeShortText(body.templateName, "ชื่อ Template", false) || `${source.templateName} (สำเนา)`;

  const serviceTemplates = await serviceTemplatesCollection();
  const now = nowIso();
  const doc: ServiceTemplateFields = {
    ...source, templateCode: generateTemplateCode(), templateName, sourceType: "manual",
    sourceHash: computeSourceHash({ templateName, description: source.description, sections: source.sections }),
    isActive: true, isDeleted: false,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  };
  const result = await serviceTemplates.insertOne(doc);
  res.status(201).json({ serviceTemplate: withStringId({ ...doc, _id: result.insertedId }) satisfies ServiceTemplate });
}

async function handleArchive(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "serviceTemplates:archive");
  const doc = await loadTemplateOrThrow(id);
  const isDeleted = sanitizeBoolean((req.body as Record<string, unknown> | undefined)?.isDeleted, "สถานะเก็บถาวร");
  const serviceTemplates = await serviceTemplatesCollection();
  await serviceTemplates.updateOne({ _id: doc._id }, { $set: { isDeleted, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await serviceTemplates.findOne({ _id: doc._id });
  if (!updated) throw new HttpError(404, "ไม่พบ Template รายงานบริการ");
  res.status(200).json({ serviceTemplate: withStringId(updated) satisfies ServiceTemplate });
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method === "GET") return handleGetOne(req, res, id);
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleServiceTemplate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/service-templates");
  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "duplicate") return handleDuplicate(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "archive") return handleArchive(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
