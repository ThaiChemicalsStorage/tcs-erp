import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requirePermission } from "../_lib/auth.js";
import { productsCollection, toObjectId, withStringId } from "../_lib/collections.js";
import { nowIso } from "../../src/lib/products.js";

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    await requirePermission(req, "products:view");
    const products = await productsCollection();
    const docs = await products.find({}).sort({ code: 1 }).toArray();
    res.status(200).json({ products: docs.map(withStringId) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "products:create");
    const body = req.body ?? {};
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!code || !name || !body.categoryId) throw new HttpError(400, "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");

    const products = await productsCollection();
    if (await products.findOne({ code })) throw new HttpError(409, "รหัสสินค้านี้มีอยู่แล้ว");

    const now = nowIso();
    const insertResult = await products.insertOne({
      code,
      name,
      categoryId: body.categoryId,
      unit: typeof body.unit === "string" ? body.unit.trim() : "",
      defaultPrice: typeof body.defaultPrice === "number" ? body.defaultPrice : 0,
      description: typeof body.description === "string" ? body.description : "",
      specifications: typeof body.specifications === "string" ? body.specifications : "",
      archived: false,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    });
    const doc = await products.findOne({ _id: insertResult.insertedId });
    if (!doc) throw new HttpError(500, "Failed to create product");
    res.status(201).json({ product: withStringId(doc) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  const objectId = toObjectId(id);
  const products = await productsCollection();

  if (req.method === "PATCH") {
    const ctx = await requirePermission(req, "products:edit");
    const target = await products.findOne({ _id: objectId });
    if (!target) throw new HttpError(404, "ไม่พบสินค้า");

    const body = req.body ?? {};
    const update: Record<string, unknown> = {};
    if (typeof body.code === "string" && body.code.trim()) {
      const code = body.code.trim();
      if (await products.findOne({ _id: { $ne: objectId }, code })) throw new HttpError(409, "รหัสสินค้านี้มีอยู่แล้ว");
      update.code = code;
    }
    if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
    if (typeof body.categoryId === "string") update.categoryId = body.categoryId;
    if (typeof body.unit === "string") update.unit = body.unit.trim();
    if (typeof body.defaultPrice === "number") update.defaultPrice = body.defaultPrice;
    if (typeof body.description === "string") update.description = body.description;
    if (typeof body.specifications === "string") update.specifications = body.specifications;
    if (typeof body.archived === "boolean") update.archived = body.archived;

    if (Object.keys(update).length > 0) {
      update.updatedAt = nowIso();
      update.updatedBy = ctx.user.id;
      await products.updateOne({ _id: objectId }, { $set: update });
    }
    const updated = await products.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบสินค้า");
    res.status(200).json({ product: withStringId(updated) });
    return;
  }

  if (req.method === "DELETE") {
    await requirePermission(req, "products:delete");
    await products.deleteOne({ _id: objectId });
    res.status(204).end();
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    const parts = getPathSegments(req, "/api/products");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
