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
 *
 * **2026-09-03 — ต้นทุนและมูลค่า.** เจ้าของสั่ง *"ยอดรวมมูลค่า Stock ตอนรับเข้ามาจะมีมูลค่าโชว์"* และ
 * *"การ์ด stock"* ตัวเลขจึงไม่พอ ต้องมีต้นทุนด้วย · ใช้**ถัวเฉลี่ยเคลื่อนที่** (`Product.avgCost`): รับเข้า
 * พร้อมต้นทุน → ถัวใหม่ในคำสั่ง update เดียวกับที่บวกจำนวน (pipeline update, ยัง atomic) · จ่ายออก/คืน/
 * ปรับ → ใช้ต้นทุนถัวเฉลี่ย ณ ตอนนั้นเป็นต้นทุนของแถว ไม่แตะค่าเฉลี่ย · ไม่ใช่ FIFO เพราะไม่มี lot
 * ให้ไล่ และการ์ดสต๊อกของบริษัทอ่านเป็นราคาเฉลี่ยอยู่แล้ว
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

/** ต้นทุนต่อหน่วยของสินค้าหนึ่งตัว ณ ปัจจุบัน — ถัวเฉลี่ย (มูลค่าคลัง) และราคาซื้อล่าสุด (ใช้ตอนคืนของ) */
export interface ProductCostBasis {
  avgCost: number;
  lastCost: number;
}

/**
 * อ่านต้นทุนของสินค้าหลายตัวในคำขอเดียว (2026-09-09) — ใช้สองทาง: ส่งให้หน้าจอโชว์ "ราคาล่าสุด"
 * ข้างช่องคืนของ และให้ผู้เรียกส่งต่อเป็น `rowUnitCost` ตอนคืนของเข้าคลัง
 *
 * `lastCost` ของสินค้าที่ยังไม่เคยรับเข้าพร้อมราคาจะเป็น 0 — ผู้เรียกควร fallback เป็น `avgCost`
 * (ดู `returnUnitCostOf()`) ไม่ใช่ลงศูนย์ ไม่งั้นของที่เคยตั้งยอดตั้งต้นด้วยมือจะคืนเข้ามาแบบไร้มูลค่า
 */
export async function productCostBasis(productIds: string[]): Promise<Record<string, ProductCostBasis>> {
  const ids = [...new Set(productIds.filter((id) => id))];
  if (ids.length === 0) return {};
  const products = await productsCollection();
  const docs = await products
    .find({ _id: { $in: ids.map((id) => toObjectId(id)) } }, { projection: { avgCost: 1, lastCost: 1 } })
    .toArray();
  return Object.fromEntries(docs.map((p) => [p._id.toString(), { avgCost: p.avgCost ?? 0, lastCost: p.lastCost ?? 0 }]));
}

/** ราคาที่ใช้ลงบัญชีตอนของกลับเข้าคลัง — ราคาซื้อล่าสุด ถ้าไม่เคยมีก็ถัวเฉลี่ยปัจจุบัน */
export function returnUnitCostOf(basis: ProductCostBasis | undefined): number | undefined {
  if (!basis) return undefined;
  return basis.lastCost > 0 ? basis.lastCost : (basis.avgCost > 0 ? basis.avgCost : undefined);
}

/** แผนก/ทีม/ประเภทงานที่ประทับลง movement — ดู StockMovementFields */
export interface StockMovementOrgTags {
  departmentId?: string;
  departmentName?: string;
  teamId?: string;
  teamName?: string;
  workTypeCode?: string;
  workTypeName?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  /** ต้นทุน/หน่วยของของที่รับเข้า — มีผลเฉพาะ delta > 0 · ไม่ส่ง = รับเข้าด้วยต้นทุนถัวเฉลี่ยเดิม (ค่าเฉลี่ยไม่เปลี่ยน) */
  unitCost?: number;
  /**
   * ต้นทุน/หน่วยที่จะ**ประทับลงแถวนี้** โดย**ไม่แตะค่าเฉลี่ยของสินค้า** (2026-09-09)
   *
   * ต่างจาก `unitCost` ตรงนี้คือจุดสำคัญ: `unitCost` คือ "รับของเข้ามาที่ราคานี้" จึงถัวเฉลี่ยใหม่
   * ส่วนตัวนี้คือ "แถวนี้มีมูลค่าเท่านี้" ใช้กับการคืนของซึ่งเจ้าของสั่งให้ลงด้วย**ราคาซื้อล่าสุด** —
   * ถ้าเอา `unitCost` ไปใช้แทน ค่าเฉลี่ยของคลังจะถูกคิดใหม่ทุกครั้งที่มีคนคืนของ ซึ่งเป็นการเปลี่ยน
   * วิธีคิดต้นทุนที่ไม่มีใครสั่ง · ถูกมองข้ามเมื่อส่ง `unitCost` มาด้วย (รับเข้าจริงชนะเสมอ)
   */
  rowUnitCost?: number;
  org?: StockMovementOrgTags;
}): Promise<{ movement: StockMovementFields & { id: string }; balanceAfter: number }> {
  if (!Number.isFinite(params.delta) || params.delta === 0) throw new HttpError(400, "จำนวนต้องไม่เป็นศูนย์");
  const costIn = params.delta > 0 && typeof params.unitCost === "number" && Number.isFinite(params.unitCost) && params.unitCost >= 0
    ? params.unitCost
    : null;

  await backfillProductStockDefaults();
  const products = await productsCollection();
  const productObjectId = toObjectId(params.productId);
  // Atomic: the `stockQty: { $gte: ... }` filter only matches (and the update only applies) when
  // there's enough stock to deduct — no separate read-then-write race window, no Mongo transaction
  // needed for a single-document update.
  const filter = params.delta < 0
    ? { _id: productObjectId, stockQty: { $gte: -params.delta } }
    : { _id: productObjectId };
  // pipeline update — ถัวเฉลี่ยต้องอ่าน stockQty/avgCost "ก่อน" ในคำสั่งเดียวกับที่บวกจำนวน ไม่งั้นสองใบรับ
  // ที่ชนกันจะถัวจากค่าเก่าทั้งคู่ · ถ้าของเดิมเป็นศูนย์หรือติดลบ ค่าเฉลี่ยใหม่ = ต้นทุนที่รับเข้า
  const qtyBefore = { $ifNull: ["$stockQty", 0] };
  const avgBefore = { $ifNull: ["$avgCost", 0] };
  const qtyAfter = { $add: [qtyBefore, params.delta] };
  const avgAfter = costIn === null
    ? avgBefore
    : {
        $cond: [
          { $lte: [qtyBefore, 0] },
          costIn,
          { $divide: [{ $add: [{ $multiply: [qtyBefore, avgBefore] }, params.delta * costIn] }, qtyAfter] },
        ],
      };
  // ราคาซื้อล่าสุด (2026-09-09) — เขียนเฉพาะตอนรับเข้าพร้อมราคา ในคำสั่งเดียวกับจำนวนและค่าเฉลี่ย
  // จะได้ไม่มีช่วงที่ตัวเลขสองตัวนี้ไม่ตรงกัน และไม่ต้องมีผู้เขียน Product รายที่สอง
  const receivedAt = nowIso();
  const lastCostFields = costIn === null ? {} : { lastCost: costIn, lastCostAt: receivedAt };
  const updated = await products.findOneAndUpdate(
    filter,
    [{ $set: { stockQty: qtyAfter, avgCost: avgAfter, ...lastCostFields, updatedAt: receivedAt } }],
    { returnDocument: "after" },
  );
  if (!updated) {
    const exists = await products.findOne({ _id: productObjectId });
    if (!exists) throw new HttpError(404, "ไม่พบสินค้า");
    throw new HttpError(400, `สต๊อกคงเหลือไม่พอ (คงเหลือ ${exists.stockQty ?? 0} หน่วย)`);
  }

  // ต้นทุนของแถว: รับเข้าพร้อมราคา = ราคานั้น · มี rowUnitCost = ราคานั้น (เช่นคืนของใช้ราคาซื้อล่าสุด)
  // · นอกนั้น = ค่าเฉลี่ยที่ใช้อยู่ (ซึ่งไม่เปลี่ยนในสองกรณีหลัง)
  const rowCost = typeof params.rowUnitCost === "number" && Number.isFinite(params.rowUnitCost) && params.rowUnitCost >= 0
    ? params.rowUnitCost
    : null;
  const unitCost = round2(costIn ?? rowCost ?? (updated.avgCost ?? 0));
  const now = receivedAt;
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
    unitCost,
    amount: round2(Math.abs(params.delta) * unitCost),
    balanceValueAfter: round2(Math.max(0, updated.stockQty) * (updated.avgCost ?? 0)),
    ...(params.org?.departmentId ? { departmentId: params.org.departmentId } : {}),
    ...(params.org?.departmentName ? { departmentName: params.org.departmentName } : {}),
    ...(params.org?.teamId ? { teamId: params.org.teamId } : {}),
    ...(params.org?.teamName ? { teamName: params.org.teamName } : {}),
    ...(params.org?.workTypeCode ? { workTypeCode: params.org.workTypeCode } : {}),
    ...(params.org?.workTypeName ? { workTypeName: params.org.workTypeName } : {}),
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

/** เพดานแถวของประวัติ — หน้าสต๊อกรวมทุกสินค้าใช้ 200 เหมือนเดิม การ์ดสต๊อกของสินค้าตัวเดียวขอได้ถึง 2000 */
const DEFAULT_LIST_LIMIT = 200;
const MAX_LIST_LIMIT = 2000;

async function handleMovementsList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "stock:view");
  const movements = await stockMovementsCollection();
  const productId = typeof req.query?.productId === "string" ? req.query.productId : undefined;
  const sourceId = typeof req.query?.sourceId === "string" ? req.query.sourceId : undefined;
  const requested = typeof req.query?.limit === "string" ? Number.parseInt(req.query.limit, 10) : NaN;
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIST_LIMIT) : DEFAULT_LIST_LIMIT;
  const filter = { ...(productId ? { productId } : {}), ...(sourceId ? { sourceId } : {}) };
  const docs = await movements.find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  res.status(200).json({ movements: docs.map(withStringId) });
}

const MOVEMENT_KINDS: StockMovementKind[] = ["receive", "deduct", "adjust", "return"];

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
    delta = kind === "deduct" ? -qty : qty;
  }
  const unitCost = typeof body.unitCost === "number" && Number.isFinite(body.unitCost) && body.unitCost >= 0 ? body.unitCost : undefined;

  const { movement } = await applyStockMovement({
    productId, kind, delta, reason, sourceType: "manual", userId: ctx.user.id, unitCost,
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
