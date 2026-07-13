import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection } from "mongodb";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requirePermission, type AuthContext } from "../_lib/auth.js";
import { companyProfilesCollection, auditLogCollection, toObjectId, withStringId, type CompanyProfileFields } from "../_lib/collections.js";
import { validateCompanyProfileDraft } from "../_lib/companyProfileValidation.js";
import { nowIso } from "../../src/lib/products.js";
import type { CompanyProfileDraft } from "../../src/lib/companyProfiles.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDuplicateKeyError(err: unknown): err is Error {
  return err instanceof Error && err.message.includes("E11000");
}

/**
 * `company_profiles` was added after this deployment was already provisioned, so the one-time
 * Setup Wizard path (`ensureIndexes()`) will never actually create its indexes in production —
 * same defensive-idempotent-createIndex pattern already used by `seedJobTypesIfEmpty()` and
 * `ensureQuoteAnalyticsIndexes()` in api/dashboard/index.ts, for the same reason.
 */
let companyProfileIndexesEnsured = false;
async function ensureCompanyProfileIndexes(companyProfiles: Collection<CompanyProfileFields>) {
  if (companyProfileIndexesEnsured) return;
  await Promise.all([
    companyProfiles.createIndex({ companyCode: 1 }, { unique: true }),
    companyProfiles.createIndex({ isActive: 1 }),
    companyProfiles.createIndex({ isDeleted: 1 }),
  ]);
  // Partial unique index — 2026-07-13 Codex review, High Priority: the database itself now
  // guarantees at most one document can have `isDefault: true`, closing a real gap where
  // concurrent set-default/first-create requests could otherwise leave two simultaneous
  // defaults (a plain, non-unique `isDefault` index provided no such guarantee — the
  // application-level "unset-then-set" sequencing in handleSetDefault below reduces the *window*
  // for a race but can't eliminate it without a database-level constraint). Created outside the
  // Promise.all above and defensively: an index with the same key pattern but different options
  // from an earlier local run would otherwise throw "IndexOptionsConflict" on every cold start.
  try {
    await companyProfiles.createIndex({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
  } catch (err) {
    if (err instanceof Error && err.message.includes("IndexOptionsConflict")) {
      await companyProfiles.dropIndex("isDefault_1").catch(() => {});
      await companyProfiles.createIndex({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });
    } else {
      throw err;
    }
  }
  companyProfileIndexesEnsured = true;
}

const FIELD_LABELS_TH: Partial<Record<keyof CompanyProfileDraft, string>> = {
  companyCode: "รหัสบริษัท", companyNameTh: "ชื่อบริษัท (ไทย)", companyNameEn: "ชื่อบริษัท (อังกฤษ)",
  displayName: "ชื่อที่แสดง", addressTh: "ที่อยู่ (ไทย)", addressEn: "ที่อยู่ (อังกฤษ)", taxId: "เลขประจำตัวผู้เสียภาษี",
  branchName: "ชื่อสาขา", branchCode: "รหัสสาขา", phone: "เบอร์โทรศัพท์", fax: "แฟกซ์", email: "อีเมล",
  website: "เว็บไซต์", bankAccounts: "บัญชีธนาคาร", quotationPrefix: "คำนำหน้าเลขที่ใบเสนอราคา",
  quotationNumberFormat: "รูปแบบเลขที่ใบเสนอราคา", quotationTerms: "เงื่อนไขใบเสนอราคา",
  quotationFooter: "ข้อความท้ายเอกสาร", signatureLabel: "ป้ายกำกับลายเซ็น", isActive: "สถานะเปิดใช้งาน",
  logoDataUrl: "โลโก้บริษัท", stampDataUrl: "ตราประทับบริษัท",
};

/** Human-readable Thai summary of which fields changed, for the audit `details` text — deliberately calls out logo/stamp by name (2026-07-13 Codex review: "distinct logo/stamp upload events"), not folded into a generic "field updated" message. */
function describeFieldChanges(update: Partial<CompanyProfileDraft>): string {
  const labels = (Object.keys(update) as (keyof CompanyProfileDraft)[]).map((k) => FIELD_LABELS_TH[k] ?? k);
  return labels.length ? `แก้ไข: ${labels.join(", ")}` : "แก้ไขข้อมูล";
}

/**
 * Writes an authoritative, server-side audit-log entry for a Company Profile mutation — identity
 * always comes from the already-verified `ctx`, never client input. Added 2026-07-13 per the
 * Codex review's High Priority finding: entries were previously written by the *client* calling
 * the generic `POST /api/audit-log` after each mutation succeeded, which any authenticated caller
 * could forge as an arbitrary Company Profile action, and which omitted structured linkage
 * (`companyProfileId`, which company, which fields changed). `POST /api/audit-log` now rejects
 * the `"โปรไฟล์บริษัท"` module outright (see api/audit-log/index.ts), so this is the only path
 * Company Profile audit entries can be written through — same pattern as `writeQuoteAuditEntry()`
 * in api/handlers/quotes.ts.
 */
async function writeCompanyProfileAuditEntry(
  ctx: AuthContext,
  action: string,
  details: string,
  profile: { id: string; companyNameTh: string },
): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "โปรไฟล์บริษัท",
    action,
    details,
    createdAt: nowIso(),
    relatedCompanyProfileId: profile.id,
    relatedCompanyProfileName: profile.companyNameTh,
  });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  const companyProfiles = await companyProfilesCollection();
  await ensureCompanyProfileIndexes(companyProfiles);

  if (req.method === "GET") {
    await requirePermission(req, "companyProfiles:view");
    // Returns every profile, including archived/inactive ones — the list page filters client-side
    // (same "show archived" toggle pattern as ProductList.tsx) rather than the server silently
    // hiding rows the admin might specifically be looking for.
    const docs = await companyProfiles.find({}).sort({ isDefault: -1, companyNameTh: 1 }).toArray();
    res.status(200).json({ companyProfiles: docs.map(withStringId) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "companyProfiles:create");
    const draft = validateCompanyProfileDraft(req.body, false);

    const taken = await companyProfiles.findOne({ companyCode: { $regex: `^${escapeRegExp(draft.companyCode!)}$`, $options: "i" } });
    if (taken) throw new HttpError(409, "มีรหัสบริษัทนี้อยู่แล้ว");

    // The very first company profile ever created is always the default — "if only one company
    // profile exists, it should automatically be treated as default" — regardless of what the
    // client sends (CompanyProfileDraft has no isDefault field at all; only the dedicated
    // set-default action can change it once a second profile exists).
    const existingCount = await companyProfiles.countDocuments({});
    const isFirstProfile = existingCount === 0;
    const now = nowIso();
    const baseDoc = {
      companyCode: draft.companyCode!,
      companyNameTh: draft.companyNameTh!,
      companyNameEn: draft.companyNameEn ?? "",
      displayName: draft.displayName ?? "",
      logoDataUrl: draft.logoDataUrl ?? "",
      addressTh: draft.addressTh ?? "",
      addressEn: draft.addressEn ?? "",
      taxId: draft.taxId ?? "",
      branchName: draft.branchName ?? "",
      branchCode: draft.branchCode ?? "",
      phone: draft.phone ?? "",
      fax: draft.fax ?? "",
      email: draft.email ?? "",
      website: draft.website ?? "",
      bankAccounts: draft.bankAccounts ?? [],
      quotationPrefix: draft.quotationPrefix ?? "",
      quotationNumberFormat: draft.quotationNumberFormat ?? "",
      quotationTerms: draft.quotationTerms ?? "",
      quotationFooter: draft.quotationFooter ?? "",
      stampDataUrl: draft.stampDataUrl ?? "",
      signatureLabel: draft.signatureLabel ?? "",
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    };

    let insertResult;
    try {
      insertResult = await companyProfiles.insertOne({
        ...baseDoc,
        isDefault: isFirstProfile,
        // 2026-07-13 Codex review, Medium: an inactive default is a real invariant break ("at
        // least one active default" only holds if the auto-assigned first default is actually
        // active) — force it, regardless of what the create form's Active checkbox was set to.
        isActive: isFirstProfile ? true : (draft.isActive ?? true),
      });
    } catch (err) {
      // A genuinely concurrent "first create" race: two requests both computed
      // existingCount === 0 and both tried isDefault: true, but the partial unique index only
      // lets one of them succeed. The loser retries once as a non-default profile instead of
      // surfacing a confusing 500 — there is now definitely already a default (the winner), so
      // isDefault: false is the correct outcome for this insert, not a bug.
      if (isFirstProfile && isDuplicateKeyError(err) && err.message.includes("isDefault")) {
        insertResult = await companyProfiles.insertOne({ ...baseDoc, isDefault: false, isActive: draft.isActive ?? true });
      } else {
        throw err;
      }
    }
    const doc = await companyProfiles.findOne({ _id: insertResult.insertedId });
    if (!doc) throw new HttpError(500, "Failed to create company profile");
    const created = withStringId(doc);
    await writeCompanyProfileAuditEntry(ctx, "Company Profile Created", `เพิ่มข้อมูลบริษัท: ${created.companyNameTh} (${created.companyCode})`, created);
    res.status(201).json({ companyProfile: created });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  const objectId = toObjectId(id);
  const companyProfiles = await companyProfilesCollection();

  if (req.method === "GET") {
    await requirePermission(req, "companyProfiles:view");
    const doc = await companyProfiles.findOne({ _id: objectId });
    if (!doc) throw new HttpError(404, "ไม่พบข้อมูลบริษัท");
    res.status(200).json({ companyProfile: withStringId(doc) });
    return;
  }

  if (req.method === "PATCH") {
    const ctx = await requirePermission(req, "companyProfiles:edit");
    const target = await companyProfiles.findOne({ _id: objectId });
    if (!target) throw new HttpError(404, "ไม่พบข้อมูลบริษัท");

    // isDefault/isDeleted are deliberately never accepted here — validateCompanyProfileDraft only
    // ever produces CompanyProfileDraft fields, and those two flags have their own dedicated,
    // invariant-checked actions below (set-default / archive) precisely so a plain field edit can
    // never silently bypass "only one default" or "can't archive the default" checks.
    const update = validateCompanyProfileDraft(req.body, true);
    if (update.companyCode && update.companyCode.toLowerCase() !== target.companyCode.toLowerCase()) {
      const taken = await companyProfiles.findOne({ _id: { $ne: objectId }, companyCode: { $regex: `^${escapeRegExp(update.companyCode)}$`, $options: "i" } });
      if (taken) throw new HttpError(409, "มีรหัสบริษัทนี้อยู่แล้ว");
    }
    // 2026-07-13 Codex review, High Priority: "a current default company can be deactivated
    // without reassignment" — same rule as the archive block below, an admin must set another
    // profile as default first.
    if (update.isActive === false && target.isDefault) {
      throw new HttpError(400, "ไม่สามารถปิดใช้งานบริษัทที่ตั้งเป็นค่าเริ่มต้นได้ กรุณาตั้งบริษัทอื่นเป็นค่าเริ่มต้นก่อน");
    }

    if (Object.keys(update).length > 0) {
      await companyProfiles.updateOne({ _id: objectId }, { $set: { ...update, updatedAt: nowIso(), updatedBy: ctx.user.id } });
    }
    const updated = await companyProfiles.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบข้อมูลบริษัท");
    const updatedPublic = withStringId(updated);
    if (Object.keys(update).length > 0) {
      await writeCompanyProfileAuditEntry(ctx, "Company Profile Updated", describeFieldChanges(update), updatedPublic);
    }
    res.status(200).json({ companyProfile: updatedPublic });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleArchive(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "companyProfiles:archive");

  const objectId = toObjectId(id);
  const companyProfiles = await companyProfilesCollection();
  const target = await companyProfiles.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบข้อมูลบริษัท");

  const isDeleted = req.body?.isDeleted === true;
  // "Do not allow deleting default company profile directly" — archiving IS this app's only form
  // of delete (soft), so the same rule applies here: reassign the default to another profile
  // first via the dedicated set-default action, then archive this one.
  if (isDeleted && target.isDefault) {
    throw new HttpError(400, "ไม่สามารถเก็บถาวรบริษัทที่ตั้งเป็นค่าเริ่มต้นได้ กรุณาตั้งบริษัทอื่นเป็นค่าเริ่มต้นก่อน");
  }

  await companyProfiles.updateOne({ _id: objectId }, { $set: { isDeleted, updatedAt: nowIso(), updatedBy: ctx.user.id } });
  const updated = await companyProfiles.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบข้อมูลบริษัท");
  const updatedPublic = withStringId(updated);
  await writeCompanyProfileAuditEntry(
    ctx,
    isDeleted ? "Company Profile Archived" : "Company Profile Restored",
    `${isDeleted ? "เก็บถาวร" : "กู้คืน"}ข้อมูลบริษัท: ${updatedPublic.companyNameTh}`,
    updatedPublic,
  );
  res.status(200).json({ companyProfile: updatedPublic });
}

async function handleSetDefault(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "companyProfiles:setDefault");

  const objectId = toObjectId(id);
  const companyProfiles = await companyProfilesCollection();
  const target = await companyProfiles.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบข้อมูลบริษัท");
  if (target.isDeleted) throw new HttpError(400, "ไม่สามารถตั้งบริษัทที่เก็บถาวรแล้วเป็นค่าเริ่มต้นได้");
  if (!target.isActive) throw new HttpError(400, "ไม่สามารถตั้งบริษัทที่ปิดใช้งานเป็นค่าเริ่มต้นได้");

  const now = nowIso();
  // Sequenced, not a single atomic multi-document transaction (this app doesn't use Mongo
  // transactions anywhere else at this scale) — unset every other default first, then set the
  // target, so a crash between the two writes leaves at most a *missing* default (safe,
  // re-settable) rather than two documents simultaneously claiming isDefault: true. The partial
  // unique index on `isDefault` (see ensureCompanyProfileIndexes above) is what actually
  // guarantees the invariant under true concurrency — if two set-default calls race on different
  // targets, the second `updateOne` below fails with a duplicate-key error instead of silently
  // creating two defaults, caught and surfaced as a clear "try again" message.
  await companyProfiles.updateMany({ isDefault: true, _id: { $ne: objectId } }, { $set: { isDefault: false, updatedAt: now, updatedBy: ctx.user.id } });
  try {
    await companyProfiles.updateOne({ _id: objectId }, { $set: { isDefault: true, updatedAt: now, updatedBy: ctx.user.id } });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new HttpError(409, "มีการเปลี่ยนบริษัทเริ่มต้นพร้อมกันจากคำขออื่น กรุณาลองใหม่อีกครั้ง");
    }
    throw err;
  }

  const updated = await companyProfiles.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบข้อมูลบริษัท");
  const updatedPublic = withStringId(updated);
  await writeCompanyProfileAuditEntry(ctx, "Default Company Changed", `ตั้งเป็นบริษัทเริ่มต้น: ${updatedPublic.companyNameTh}`, updatedPublic);
  res.status(200).json({ companyProfile: updatedPublic });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(res, async () => {
    const parts = getPathSegments(req, "/api/company-profiles");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    if (parts.length === 2 && parts[1] === "archive") return handleArchive(req, res, parts[0]);
    if (parts.length === 2 && parts[1] === "set-default") return handleSetDefault(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
