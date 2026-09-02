import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, type AuthContext } from "./auth.js";
import {
  productsCollection, stockMovementsCollection, toObjectId, withStringId,
  type StockMovementFields, type StockMovementKind, type StockMovementSourceType,
} from "./collections.js";
import { nowIso } from "../../src/lib/products.js";
import { notifyDepartments, STORE_DEPARTMENT_NAMES } from "./departmentNotify.js";

/**
 * Product Stock (added 2026-08-18) — see the collections.ts doc comment above
 * StockMovementFields for why this ledger is deliberately shared/document-agnostic rather than an
 * Accounting-only private stock number. `applyStockMovement()` is the ONLY code path allowed to
 * change `Product.stockQty` — both the manual Stock page (handleMovementCreate below) and
 * Accounting's IV stock-cutting action (arHandler.ts's handleStockDeduction) call it, so every
 * balance change is always traceable through a StockMovementFields row.
 */

let stockDefaultsBackfilled = false;

/**
 * One-per-process catch-up for an already-provisioned database: `Product.stockQty` was added
 * 2026-08-18 and `ensureIndexes()` only ever runs from the one-time Setup Wizard, so every product
 * created before that date has NO `stockQty` field at all. `Product.stockQty` is declared a
 * required `number` (src/lib/products.ts), so the Stock page's `p.stockQty.toLocaleString()` threw
 * on those rows and `applyStockMovement()`'s `$gte` guard could never match them. Guarded in memory
 * exactly like `bootstrapRbac()` (api/_lib/rbacSeed.ts) — one `updateMany` per warm process, a
 * no-op once every row carries the field.
 */
export async function backfillProductStockDefaults(): Promise<void> {
  if (stockDefaultsBackfilled) return;
  const products = await productsCollection();
  await products.updateMany({ stockQty: { $exists: false } }, { $set: { stockQty: 0 } });
  stockDefaultsBackfilled = true;
}

/**
 * Pre-flight balance check for a caller about to apply SEVERAL movements in a row (Accounting's IV
 * stock-cutting, arHandler.ts's handleStockDeduction). `applyStockMovement()` is atomic per
 * product, but a loop over it is not — without this, line 3 running out of stock would leave lines
 * 1-2 permanently cut behind an error response. Takes the already-summed quantity per product, so
 * two lines for the same product are checked against one shared balance rather than twice against
 * the full one. Does not replace applyStockMovement()'s own `$gte` guard, which still closes the
 * remaining race window between this check and the writes.
 */
export async function assertProductsHaveStock(qtyByProductId: Map<string, number>): Promise<void> {
  await backfillProductStockDefaults();
  const products = await productsCollection();
  for (const [productId, qty] of qtyByProductId) {
    const product = await products.findOne({ _id: toObjectId(productId) });
    if (!product) throw new HttpError(404, "ไม่พบสินค้า");
    if ((product.stockQty ?? 0) < qty) {
      throw new HttpError(400, `สต๊อก ${product.code} ไม่พอ (ต้องการ ${qty} คงเหลือ ${product.stockQty ?? 0} หน่วย)`);
    }
  }
}

export async function applyStockMovement(params: {
  productId: string;
  kind: StockMovementKind;
  delta: number;
  reason: string;
  sourceType: StockMovementSourceType;
  sourceId?: string;
  sourceLabel?: string;
  userId: string;
}): Promise<{ movement: StockMovementFields & { id: string }; balanceAfter: number }> {
  if (!Number.isFinite(params.delta) || params.delta === 0) throw new HttpError(400, "จำนวนต้องไม่เป็นศูนย์");

  await backfillProductStockDefaults();
  const products = await productsCollection();
  const productObjectId = toObjectId(params.productId);
  // Atomic: the `stockQty: { $gte: ... }` filter only matches (and the update only applies) when
  // there's enough stock to deduct — no separate read-then-write race window, no Mongo transaction
  // needed for a single-document update.
  const filter = params.delta < 0
    ? { _id: productObjectId, stockQty: { $gte: -params.delta } }
    : { _id: productObjectId };
  const updated = await products.findOneAndUpdate(
    filter,
    { $inc: { stockQty: params.delta }, $set: { updatedAt: nowIso() } },
    { returnDocument: "after" },
  );
  if (!updated) {
    const exists = await products.findOne({ _id: productObjectId });
    if (!exists) throw new HttpError(404, "ไม่พบสินค้า");
    throw new HttpError(400, `สต๊อกคงเหลือไม่พอ (คงเหลือ ${exists.stockQty ?? 0} หน่วย)`);
  }

  const now = nowIso();
  const movementFields: StockMovementFields = {
    productId: params.productId,
    productCode: updated.code,
    productName: updated.name,
    kind: params.kind,
    delta: params.delta,
    balanceAfter: updated.stockQty,
    reason: params.reason,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    sourceLabel: params.sourceLabel,
    createdAt: now,
    createdBy: params.userId,
  };
  const movements = await stockMovementsCollection();
  const insert = await movements.insertOne(movementFields);

  await notifyIfLowStock({
    productCode: updated.code,
    productName: updated.name,
    balanceAfter: updated.stockQty,
    reorderPoint: updated.reorderPoint ?? 0,
    delta: params.delta,
    actingUserId: params.userId,
  });

  return {
    movement: withStringId({ _id: insert.insertedId, ...movementFields }),
    balanceAfter: updated.stockQty,
  };
}

/**
 * แจ้งฝ่ายคลังสินค้าเมื่อยอดคงเหลือถูกตัดลงมาถึงจุดเตือน — เจ้าของสั่ง 2026-09-02
 * *"เวลาของใกล้หมดให้แจ้งเตือน"*
 *
 * เกาะอยู่กับ `applyStockMovement()` ตัวเดียว ซึ่งเป็นทางเดียวที่ `Product.stockQty` เปลี่ยนค่าได้
 * ทั้งระบบ — จึงครอบคลุมทั้งการตัดของอัตโนมัติจากใบเบิก การตัดจากใบกำกับภาษี และการปรับสต๊อกด้วยมือ
 * โดยไม่ต้องไปเติมโค้ดที่ผู้เรียกทีละที่ (ซึ่งจะลืมทีละที่แน่นอน)
 *
 * เงื่อนไขสามข้อ ต้องครบทั้งหมดถึงจะยิง:
 *   1. เป็นการ**ตัดออก** (`delta < 0`) — การรับของเข้าไม่ควรยิงเตือนของใกล้หมด
 *   2. สินค้าตัวนั้น**ตั้งจุดเตือนไว้แล้ว** (`reorderPoint > 0`) — ดูเหตุผลที่ 0 = ปิด ใน products.ts
 *   3. ยอด**หลัง**ตัดถึงหรือต่ำกว่าจุดเตือน แต่ยอด**ก่อน**ตัดยังไม่ถึง — ยิงเฉพาะตอน "ข้ามเส้น"
 *      ไม่ใช่ทุกครั้งที่เบิกของที่ต่ำอยู่แล้ว ไม่งั้นสินค้าตัวเดียวจะยิงซ้ำทุกใบเบิกจนกระดิ่งล้น
 *
 * **best-effort โดยตั้งใจ** — การตัดสต๊อกสำเร็จไปแล้วตอนถึงบรรทัดนี้ ห้ามให้การแจ้งเตือนที่ส่งไม่ออก
 * ย้อนกลับไปทำให้การตัดล้ม (แนวเดียวกับการส่งต่อหลังอนุมัติทุกจุดในระบบนี้)
 */
async function notifyIfLowStock(params: {
  productCode: string;
  productName: string;
  balanceAfter: number;
  reorderPoint: number;
  delta: number;
  actingUserId: string;
}): Promise<void> {
  const { productCode, productName, balanceAfter, reorderPoint, delta, actingUserId } = params;
  if (delta >= 0 || reorderPoint <= 0) return;
  const balanceBefore = balanceAfter - delta;
  if (balanceAfter > reorderPoint || balanceBefore <= reorderPoint) return;

  try {
    const sent = await notifyDepartments(STORE_DEPARTMENT_NAMES, actingUserId, {
      type: "stock_low",
      title: "สต๊อกใกล้หมด",
      description: `${productCode} ${productName} เหลือ ${balanceAfter} หน่วย (จุดเตือน ${reorderPoint})`,
      module: "สต๊อกสินค้า",
      related: {},
    });
    if (sent === 0) {
      console.warn("[stock] low-stock alert for", productCode, "reached nobody —",
        "no active user has User.department matching", STORE_DEPARTMENT_NAMES.join("/"));
    }
  } catch (err) {
    console.error("[stock] failed to send low-stock alert for", productCode, err);
  }
}

async function handleMovementsList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "stock:view");
  const movements = await stockMovementsCollection();
  const productId = typeof req.query?.productId === "string" ? req.query.productId : undefined;
  const sourceId = typeof req.query?.sourceId === "string" ? req.query.sourceId : undefined;
  const filter = { ...(productId ? { productId } : {}), ...(sourceId ? { sourceId } : {}) };
  const docs = await movements.find(filter).sort({ createdAt: -1 }).limit(200).toArray();
  res.status(200).json({ movements: docs.map(withStringId) });
}

const MOVEMENT_KINDS: StockMovementKind[] = ["receive", "deduct", "adjust"];

async function handleMovementCreate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx: AuthContext = await requirePermission(req, "stock:adjust");
  const body = req.body ?? {};
  const productId = typeof body.productId === "string" ? body.productId : "";
  const kind: StockMovementKind = MOVEMENT_KINDS.includes(body.kind) ? body.kind : ("" as StockMovementKind);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!productId || !kind) throw new HttpError(400, "กรุณาระบุสินค้าและประเภทการปรับสต๊อก");

  let delta: number;
  if (kind === "adjust") {
    delta = typeof body.delta === "number" ? body.delta : NaN;
  } else {
    const qty = typeof body.qty === "number" ? body.qty : NaN;
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, "กรุณาระบุจำนวนที่มากกว่า 0");
    delta = kind === "receive" ? qty : -qty;
  }

  const { movement } = await applyStockMovement({
    productId, kind, delta, reason, sourceType: "manual", userId: ctx.user.id,
  });
  res.status(201).json({ movement });
}

export async function handleStock(req: VercelRequest, res: VercelResponse): Promise<void> {
  // getPathSegments() already drops the prefix and any trailing slash, so a bare
  // /api/stock-movements (with or without one) is exactly the zero-segment case — routing it
  // through the same branch keeps POST from falling through to the list handler.
  const parts = getPathSegments(req, "/api/stock-movements");
  if (parts.length === 0) {
    return req.method === "POST" ? handleMovementCreate(req, res) : handleMovementsList(req, res);
  }
  throw new HttpError(404, "Not found");
}
