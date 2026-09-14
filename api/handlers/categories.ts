import type { ApiRequest, ApiResponse } from "../_lib/httpTypes.js";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requirePermission, requireOneOfPermissions } from "../_lib/auth.js";
import { categoriesCollection, toObjectId, withStringId } from "../_lib/collections.js";
import { nowIso } from "../../src/lib/products.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  if (req.method === "GET") {
    // stock:view-only holders (e.g. accounting_user) need category names on the Stock page too —
    // same reasoning as GET /api/products, see that handler's comment.
    await requireOneOfPermissions(req, ["products:view", "stock:view"]);
    const categories = await categoriesCollection();
    const docs = await categories.find({}).sort({ name: 1 }).toArray();
    res.status(200).json({ categories: docs.map(withStringId) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "products:create");
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) throw new HttpError(400, "กรุณากรอกชื่อหมวดหมู่");

    const categories = await categoriesCollection();
    const taken = await categories.findOne({ name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
    if (taken) throw new HttpError(409, "มีหมวดหมู่นี้อยู่แล้ว");

    const now = nowIso();
    const insertResult = await categories.insertOne({
      name, archived: false, createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
    });
    const doc = await categories.findOne({ _id: insertResult.insertedId });
    if (!doc) throw new HttpError(500, "Failed to create category");
    res.status(201).json({ category: withStringId(doc) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "products:edit");

  const objectId = toObjectId(id);
  const categories = await categoriesCollection();
  const target = await categories.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบหมวดหมู่");

  const body = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim();
    const taken = await categories.findOne({ _id: { $ne: objectId }, name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
    if (taken) throw new HttpError(409, "มีหมวดหมู่นี้อยู่แล้ว");
    update.name = name;
  }
  if (typeof body.archived === "boolean") update.archived = body.archived;

  if (Object.keys(update).length > 0) {
    update.updatedAt = nowIso();
    update.updatedBy = ctx.user.id;
    await categories.updateOne({ _id: objectId }, { $set: update });
  }
  const updated = await categories.findOne({ _id: objectId });
  if (!updated) throw new HttpError(404, "ไม่พบหมวดหมู่");
  res.status(200).json({ category: withStringId(updated) });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  await withErrorHandling(req, res, async () => {
    const parts = getPathSegments(req, "/api/categories");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
