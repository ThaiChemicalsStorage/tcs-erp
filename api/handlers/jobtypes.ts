import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requirePermission } from "../_lib/auth.js";
import { jobTypesCollection, toObjectId, withStringId } from "../_lib/collections.js";
import { seedJobTypesIfEmpty } from "../_lib/systemSeed.js";
import { handleQuotationTemplates } from "../_lib/quotationTemplatesHandler.js";
import { nowIso } from "../../src/lib/products.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    await requirePermission(req, "quotations:view");
    await seedJobTypesIfEmpty();
    const jobTypes = await jobTypesCollection();
    const docs = await jobTypes.find({}).sort({ code: 1 }).toArray();
    res.status(200).json({ jobTypes: docs.map(withStringId) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "company:manage");
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!code || !name) throw new HttpError(400, "กรุณากรอกรหัสและชื่อประเภทงาน");

    const jobTypes = await jobTypesCollection();
    const taken = await jobTypes.findOne({ code: { $regex: `^${escapeRegExp(code)}$`, $options: "i" } });
    if (taken) throw new HttpError(409, "มีรหัสประเภทงานนี้อยู่แล้ว");

    const now = nowIso();
    const insertResult = await jobTypes.insertOne({
      code, name, isActive: true, createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
    });
    const doc = await jobTypes.findOne({ _id: insertResult.insertedId });
    if (!doc) throw new HttpError(500, "Failed to create job type");
    res.status(201).json({ jobType: withStringId(doc) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "company:manage");

  const objectId = toObjectId(id);
  const jobTypes = await jobTypesCollection();
  const target = await jobTypes.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบประเภทงาน");

  const body = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (typeof body.code === "string" && body.code.trim()) {
    const code = body.code.trim();
    const taken = await jobTypes.findOne({ _id: { $ne: objectId }, code: { $regex: `^${escapeRegExp(code)}$`, $options: "i" } });
    if (taken) throw new HttpError(409, "มีรหัสประเภทงานนี้อยู่แล้ว");
    update.code = code;
  }
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.isActive === "boolean") update.isActive = body.isActive;

  if (Object.keys(update).length > 0) {
    update.updatedAt = nowIso();
    update.updatedBy = ctx.user.id;
    await jobTypes.updateOne({ _id: objectId }, { $set: update });
  }
  const updated = await jobTypes.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบประเภทงาน");
  res.status(200).json({ jobType: withStringId(updated) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(res, async () => {
    // Quotation Templates (added 2026-07-14) shares this function file rather than getting its
    // own — Vercel Hobby's 12-function cap is still fully used (see docs/ARCHITECTURE.md).
    // Checked first, on the raw pathname, before falling through to the Job Types logic below —
    // the same established sharing pattern api/handlers/customers.ts already uses for
    // `/api/search`. Thematically the closest existing handler: templates are keyed by Job Type.
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname === "/api/quotation-templates" || pathname.startsWith("/api/quotation-templates/")) {
      return handleQuotationTemplates(req, res);
    }

    const parts = getPathSegments(req, "/api/jobtypes");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
