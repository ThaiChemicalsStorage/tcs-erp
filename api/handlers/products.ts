import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requirePermission, requireOneOfPermissions } from "../_lib/auth.js";
import { productsCollection, categoriesCollection, auditLogCollection, toObjectId, withStringId } from "../_lib/collections.js";
import { escapeRegExp } from "../_lib/searchShared.js";
import { PRODUCT_IMPORT_MAX_ROWS } from "../../src/lib/productImport.js";
import { nowIso } from "../../src/lib/products.js";
import { handleStock, backfillProductStockDefaults } from "../_lib/stockHandler.js";
import { handleToolHoldings } from "../_lib/toolHoldingsHandler.js";

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // stock:view-only holders (e.g. accounting_user) reach the Stock page without products:view —
    // it needs the product catalog to show stock levels, not full Product Library management.
    await requireOneOfPermissions(req, ["products:view", "stock:view"]);
    // Products created before `stockQty` existed (2026-08-18) carry no such field, but the type
    // declares it a required number — backfill once per process before serving them, or the Stock
    // page's `p.stockQty.toLocaleString()` throws. See backfillProductStockDefaults().
    await backfillProductStockDefaults();
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
      // Never accepted from the client here — only /api/stock-movements (stockHandler.ts) may change
      // it, so every change is traceable through a StockMovement row. See docs/MODULES/Product.md.
      stockQty: 0,
      reorderPoint: 0,
      avgCost: 0,
      isTool: body.isTool === true,
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

/**
 * นำเข้าสินค้าทีละหลายรายการจากไฟล์ Excel (2026-09-04) — เจ้าของสั่งว่าเวลาย้ายสินค้าจากอีกระบบเข้ามา
 * ต้อง *"โยนไฟล์ exel เข้าไปแล้วสินค้าเข้ามาเลย"*
 *
 * **ไม่ทับของเดิมเด็ดขาด** รหัสที่มีอยู่แล้วถูกข้าม ไม่ใช่อัปเดต — การนำเข้าเป็นท่าที่คนกดผิดไฟล์ได้ง่าย
 * และการเขียนทับแคตตาล็อกทั้งชุดคือความเสียหายที่ย้อนไม่ได้ · เทียบรหัส**ไม่สนตัวพิมพ์เล็ก/ใหญ่**
 * ต่างจากตอนสร้างทีละตัวที่เทียบตรงตัว เพราะไฟล์ที่ย้ายมาจากระบบอื่นมักสลับตัวพิมพ์
 *
 * หมวดหมู่รับมาเป็น **ชื่อ** แล้วจับคู่/สร้างที่นี่ (ไฟล์ Excel ไม่มีทางรู้ `categoryId`) — สร้างหมวดหมู่
 * ใช้สิทธิ์ `products:create` ตัวเดียวกับที่ `api/handlers/categories.ts` ใช้อยู่แล้ว จึงไม่ต้องมีสิทธิ์ใหม่
 * และไม่ต้องทำ RBAC migration
 *
 * `stockQty`/`avgCost` เริ่มที่ 0 เสมอเหมือนการสร้างทีละตัว — ยอดสต๊อกเปลี่ยนได้ทาง
 * `POST /api/stock-movements` ทางเดียว ทุกการเปลี่ยนแปลงจึงมีแถว StockMovement กำกับ (ดู Product.md)
 */
async function handleImport(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "products:create");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawRows = Array.isArray(body.products) ? body.products : [];
  if (rawRows.length === 0) throw new HttpError(400, "ไม่มีรายการให้นำเข้า");
  if (rawRows.length > PRODUCT_IMPORT_MAX_ROWS) {
    throw new HttpError(400, `นำเข้าได้ครั้งละไม่เกิน ${PRODUCT_IMPORT_MAX_ROWS} รายการ`);
  }

  const products = await productsCollection();
  const categories = await categoriesCollection();
  const now = nowIso();

  // จับคู่หมวดหมู่ด้วยชื่อแบบไม่สนตัวพิมพ์ — อ่านของที่มีอยู่ครั้งเดียว แล้วเติมของที่สร้างใหม่ลงแมปเดิม
  const categoryIdByName = new Map<string, string>();
  for (const doc of await categories.find({}).toArray()) {
    const key = String(doc.name ?? "").trim().toLowerCase();
    if (key && !categoryIdByName.has(key)) categoryIdByName.set(key, doc._id.toString());
  }
  const categoriesCreated: string[] = [];

  let created = 0;
  let skipped = 0;
  for (const raw of rawRows as Record<string, unknown>[]) {
    const code = typeof raw.code === "string" ? raw.code.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!code || !name) { skipped += 1; continue; }

    const existing = await products.findOne({ code: { $regex: `^${escapeRegExp(code)}$`, $options: "i" } });
    if (existing) { skipped += 1; continue; }

    const categoryName = typeof raw.categoryName === "string" ? raw.categoryName.trim() : "";
    let categoryId = "";
    if (categoryName) {
      const key = categoryName.toLowerCase();
      const known = categoryIdByName.get(key);
      if (known) {
        categoryId = known;
      } else {
        const inserted = await categories.insertOne({
          name: categoryName, archived: false,
          createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
        });
        categoryId = inserted.insertedId.toString();
        categoryIdByName.set(key, categoryId);
        categoriesCreated.push(categoryName);
      }
    }

    await products.insertOne({
      code,
      name,
      categoryId,
      unit: typeof raw.unit === "string" ? raw.unit.trim() : "",
      defaultPrice: typeof raw.defaultPrice === "number" && Number.isFinite(raw.defaultPrice) ? raw.defaultPrice : 0,
      description: typeof raw.description === "string" ? raw.description : "",
      specifications: typeof raw.specifications === "string" ? raw.specifications : "",
      archived: false,
      stockQty: 0,
      reorderPoint: typeof raw.reorderPoint === "number" && Number.isFinite(raw.reorderPoint) ? raw.reorderPoint : 0,
      avgCost: 0,
      isTool: raw.isTool === true,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    });
    created += 1;
  }

  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id,
    userName: ctx.user.fullName,
    roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "คลังสินค้า",
    action: "Products Imported",
    details: `นำเข้าสินค้าจากไฟล์ สร้างใหม่ ${created} ข้าม ${skipped}` +
      (categoriesCreated.length > 0 ? ` · หมวดหมู่ใหม่ ${categoriesCreated.length}` : ""),
    createdAt: now,
  });

  res.status(200).json({ created, skipped, categoriesCreated });
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
    // จุดเตือนของใกล้หมด (2026-09-02) — ค่าติดลบไม่มีความหมาย ปัดขึ้นเป็น 0 (= ปิดการเตือน)
    if (typeof body.reorderPoint === "number" && Number.isFinite(body.reorderPoint)) {
      update.reorderPoint = Math.max(0, Math.floor(body.reorderPoint));
    }
    // "เครื่องมือ — ต้องคืน" (2026-09-03) — ธง ไม่ใช่ตัวเลข จึงไม่ต้องตรวจอะไรนอกจากชนิด
    // `avgCost` ไม่รับจาก client เลย เหมือน `stockQty` — เปลี่ยนได้ทาง applyStockMovement() เท่านั้น
    if (typeof body.isTool === "boolean") update.isTool = body.isTool;

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
    // Stock movements share this function slot with Products — see the multi-resource-sharing
    // convention documented in docs/CLAUDE.md (e.g. customers.ts also serves /api/search).
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname === "/api/stock-movements" || pathname.startsWith("/api/stock-movements/")) return handleStock(req, res);
    // เครื่องมือประจำทีม (2026-09-03) — มุมมองของบัญชีสต๊อก จึงอยู่ในช่องเดียวกัน
    if (pathname === "/api/tool-holdings" || pathname.startsWith("/api/tool-holdings/")) return handleToolHoldings(req, res);

    const parts = getPathSegments(req, "/api/products");
    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1 && parts[0] === "import") return handleImport(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
