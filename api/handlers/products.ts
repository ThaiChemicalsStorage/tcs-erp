import type { ApiRequest, ApiResponse } from "../_lib/httpTypes.js";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requirePermission, requireOneOfPermissions, requireUser } from "../_lib/auth.js";
import { productsCollection, categoriesCollection, auditLogCollection, stockMovementsCollection, toObjectId, withStringId, type ProductFields } from "../_lib/collections.js";
import { kitAvailableQty, type KitComponent } from "../../src/lib/products.js";
import { PRODUCT_IMPORT_MAX_ROWS } from "../../src/lib/productImport.js";
import { nowIso } from "../../src/lib/products.js";
import { handleStock, backfillProductStockDefaults } from "../_lib/stockHandler.js";
import { handleToolHoldings } from "../_lib/toolHoldingsHandler.js";

async function handleList(req: ApiRequest, res: ApiResponse) {
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
    res.status(200).json({ products: withKitAvailability(docs).map(withStringId) });
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
      ...(Array.isArray(body.kitComponents) && body.kitComponents.length > 0
        ? { kitComponents: await sanitizeKitComponents(body.kitComponents, null, body.isTool === true) }
        : {}),
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
async function handleImport(req: ApiRequest, res: ApiResponse) {
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

  // รหัสที่มีอยู่แล้วอ่านครั้งเดียวลงเซ็ต ไม่ใช่ยิง `findOne` ต่อแถว — การเทียบแบบไม่สนตัวพิมพ์ต้องใช้
  // `$regex` ที่ใช้ index ไม่ได้ ถ้าถามทีละแถวคือสแกนทั้งคอลเลกชัน 2000 รอบต่อการนำเข้าหนึ่งครั้ง
  // (ช้าจนคำขอถูกตัดกลางคัน เหลือสินค้าเข้าไปครึ่งเดียวและไม่มีแถว audit log กำกับ)
  const existingCodes = new Set<string>();
  for (const doc of await products.find({}, { projection: { code: 1 } }).toArray()) {
    const key = String(doc.code ?? "").trim().toLowerCase();
    if (key) existingCodes.add(key);
  }

  const toInsert: ProductFields[] = [];
  let skipped = 0;
  for (const raw of rawRows as Record<string, unknown>[]) {
    // แถวที่ไม่ใช่อ็อบเจ็กต์ (เช่น `null` จากคำขอที่ประกอบเอง) ต้องถูกข้าม ไม่ใช่ทำให้ทั้งคำขอพัง 500
    if (typeof raw !== "object" || raw === null) { skipped += 1; continue; }
    const code = typeof raw.code === "string" ? raw.code.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!code || !name) { skipped += 1; continue; }

    // เติมรหัสที่เพิ่งรับไว้ลงเซ็ตด้วย ไฟล์/คำขอที่มีรหัสซ้ำกันเองจึงเข้าได้ตัวเดียวเหมือนเดิม
    if (existingCodes.has(code.toLowerCase())) { skipped += 1; continue; }
    existingCodes.add(code.toLowerCase());

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

    toInsert.push({
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
  }

  if (toInsert.length > 0) await products.insertMany(toInsert);
  const created = toInsert.length;

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

/**
 * **สินค้าชุด** (2026-09-29) — ดู `Product.kitComponents` ใน src/lib/products.ts
 *
 * ยอด `stockQty` ที่ส่งออกของสินค้าชุด = จำนวนชุดที่เบิกได้จากชิ้นส่วน (ในฐานข้อมูลเป็น 0 เสมอ ไม่เคยถูกเขียน) —
 * ทุกหน้าที่อ่านยอดจากรายการสินค้า (หน้าสต๊อก ตัวเลือกสินค้า ช่อง "คงเหลือ") จึงเห็นตัวเลขที่เบิกได้จริงโดยไม่ต้องรู้จักชุด ·
 * `avgCost` ของชุดยังเป็น 0 มูลค่าคลังจึงไม่ถูกนับซ้ำกับชิ้นส่วน
 */
function withKitAvailability<T extends ProductFields & { _id: unknown }>(docs: T[]): T[] {
  const stockById = new Map(docs.map((p) => [String(p._id), p.stockQty ?? 0]));
  return docs.map((p) => ((p.kitComponents?.length ?? 0) > 0 ? { ...p, stockQty: kitAvailableQty(p.kitComponents!, stockById) } : p));
}

function sameRecipe(raw: unknown, current: KitComponent[]): boolean {
  if (!Array.isArray(raw) || raw.length !== current.length) return false;
  return (raw as Record<string, unknown>[]).every((r, i) => r?.productId === current[i].productId && Number(r?.qty) === current[i].qty);
}

const MAX_KIT_COMPONENTS = 20;

/**
 * กติกาสูตรชุด — เจ้าของเลือก 2026-09-29: **ล็อกเมื่อชุดถูกเบิกแล้ว** (คืนของใช้สูตรปัจจุบัน ถ้าแก้ทีหลังของที่คืนจะไม่ตรงกับที่จ่ายไป
 * ให้สร้างรหัสชุดใหม่แทน) และ **ตั้งสูตรได้เมื่อสต๊อกของตัวชุดเป็น 0** (ชุดไม่มีสต๊อกของตัวเอง ยอดเดิมจะค้างเป็นของที่ไม่มีวันถูกตัด)
 * · ชิ้นส่วนต้องมีจริง ไม่ใช่ตัวเอง ไม่ใช่ชุด (ไม่ซ้อน) ไม่ซ้ำ จำนวน > 0 · ตัวชุดต้องไม่เป็นชิ้นส่วนของชุดอื่น · ชุดเป็นเครื่องมือไม่ได้
 * · ส่งรายการว่าง = เลิกเป็นชุด (ติดกติกาล็อกเหมือนกัน) · ชื่อ/รหัส/หน่วยของชิ้นส่วนอ่านจากทะเบียน ไม่เชื่อค่าจากหน้าจอ
 */
async function sanitizeKitComponents(raw: unknown, target: (ProductFields & { _id: unknown }) | null, isTool: boolean): Promise<KitComponent[]> {
  if (!Array.isArray(raw)) throw new HttpError(400, "ข้อมูลสูตรชุดไม่ถูกต้อง");
  if (raw.length > MAX_KIT_COMPONENTS) throw new HttpError(400, `ชิ้นส่วนในชุดต้องไม่เกิน ${MAX_KIT_COMPONENTS} รายการ`);
  const selfId = target ? String(target._id) : "";
  if (target) {
    const issued = await (await stockMovementsCollection()).findOne({ kitProductId: selfId }, { projection: { _id: 1 } });
    if (issued) throw new HttpError(400, "ชุดนี้ถูกเบิกไปแล้ว แก้สูตรไม่ได้ — ถ้าต้องเปลี่ยนชิ้นส่วน ให้สร้างรหัสชุดใหม่");
  }
  if (raw.length === 0) return [];
  if (isTool) throw new HttpError(400, "สินค้าชุดเป็นเครื่องมือไม่ได้ — เครื่องมือนับยอดถือครองต่อตัวสินค้า ส่วนชุดตัดสต๊อกที่ชิ้นส่วน");
  if (target && (target.stockQty ?? 0) !== 0) {
    throw new HttpError(400, `สินค้านี้มีสต๊อก ${target.stockQty} อยู่ — ปรับยอดเป็น 0 ก่อน แล้วรับเข้าเป็นชิ้นส่วนแทน (ชุดไม่มีสต๊อกของตัวเอง)`);
  }
  const products = await productsCollection();
  if (target && await products.findOne({ "kitComponents.productId": selfId } as never, { projection: { _id: 1 } })) {
    throw new HttpError(400, "สินค้านี้เป็นชิ้นส่วนของชุดอื่นอยู่ — ชุดซ้อนชุดไม่ได้");
  }
  const rows = raw as Record<string, unknown>[];
  const ids = rows.map((r, idx) => {
    const id = typeof r?.productId === "string" ? r.productId : "";
    if (!/^[0-9a-f]{24}$/i.test(id)) throw new HttpError(400, `ชิ้นส่วนลำดับที่ ${idx + 1}: กรุณาเลือกสินค้า`);
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "มีชิ้นส่วนซ้ำในสูตร — รวมเป็นบรรทัดเดียวแล้วใส่จำนวน");
  if (selfId && ids.includes(selfId)) throw new HttpError(400, "ใส่ตัวเองเป็นชิ้นส่วนไม่ได้");
  const found = new Map((await products.find({ _id: { $in: ids.map((id) => toObjectId(id)) } }).toArray()).map((p) => [String(p._id), p]));
  return rows.map((r, idx) => {
    const p = found.get(ids[idx]);
    if (!p) throw new HttpError(400, `ชิ้นส่วนลำดับที่ ${idx + 1}: ไม่พบสินค้า`);
    if ((p.kitComponents?.length ?? 0) > 0) throw new HttpError(400, `${p.code} เป็นสินค้าชุด — ชุดซ้อนชุดไม่ได้`);
    const qty = typeof r.qty === "number" ? r.qty : Number(r.qty);
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, `${p.code}: จำนวนต่อชุดต้องมากกว่า 0`);
    return { productId: ids[idx], code: p.code, name: p.name, unit: p.unit ?? "", qty };
  });
}

/** สูตรของสินค้าชุดทั้งหมด — ทุกคนที่ล็อกอิน (เอกสารทุกใบแตกชิ้นส่วนให้ดู) · ไม่มีราคา/ต้นทุน */
async function handleKits(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requireUser(req);
  const docs = await (await productsCollection())
    .find({ "kitComponents.0": { $exists: true } } as never, { projection: { code: 1, name: 1, unit: 1, kitComponents: 1 } })
    .toArray();
  res.status(200).json({
    kits: docs.map((p) => ({ id: String(p._id), code: p.code, name: p.name, unit: p.unit ?? "", components: p.kitComponents ?? [] })),
  });
}

async function handleOne(req: ApiRequest, res: ApiResponse, id: string) {
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
    // สูตรชุด (2026-09-29) — ส่งมาเฉพาะตอนเปลี่ยน (หน้าจอเทียบกับค่าเดิมก่อนส่ง) ดูกติกาที่ sanitizeKitComponents()
    if ("kitComponents" in body && !sameRecipe(body.kitComponents, target.kitComponents ?? [])) {
      update.kitComponents = await sanitizeKitComponents(body.kitComponents, target, (update.isTool ?? target.isTool) === true);
    } else if (update.isTool === true && (target.kitComponents?.length ?? 0) > 0) {
      throw new HttpError(400, "สินค้าชุดเป็นเครื่องมือไม่ได้ — เครื่องมือนับยอดถือครองต่อตัวสินค้า ส่วนชุดตัดสต๊อกที่ชิ้นส่วน");
    }

    if (Object.keys(update).length > 0) {
      update.updatedAt = nowIso();
      update.updatedBy = ctx.user.id;
      await products.updateOne({ _id: objectId }, { $set: update });
    }
    const updated = await products.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบสินค้า");
    const [withAvail] = (updated.kitComponents?.length ?? 0) > 0
      ? withKitAvailability([updated, ...(await products.find({ _id: { $in: updated.kitComponents!.map((c) => toObjectId(c.productId)) } }).toArray())])
      : [updated];
    res.status(200).json({ product: withStringId(withAvail) });
    return;
  }

  if (req.method === "DELETE") {
    await requirePermission(req, "products:delete");
    // ชิ้นส่วนของสินค้าชุด (2026-09-29) — ลบแล้วเบิกชุดนั้นไม่ได้อีก (ตัดชิ้นส่วนที่ไม่มีอยู่จริง)
    const usedIn = await products.findOne({ "kitComponents.productId": id } as never, { projection: { code: 1 } });
    if (usedIn) throw new HttpError(400, `สินค้านี้เป็นชิ้นส่วนของชุด ${usedIn.code} — เอาออกจากสูตรชุดก่อนจึงจะลบได้`);
    await products.deleteOne({ _id: objectId });
    res.status(204).end();
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
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
    if (parts.length === 1 && parts[0] === "kits") return handleKits(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
