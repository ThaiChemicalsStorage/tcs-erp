import { productsCollection, categoriesCollection } from "./collections.js";
import { nowIso } from "../../src/lib/products.js";

/**
 * Real store-item catalog, hand-transcribed directly from every row of
 * public/reference/FM-ST-04_-_Rev.02_1.pdf through _4.pdf (Material Requisition & Return, added
 * 2026-08-18 for the Project module's Stage 2 data layer) — see docs/MODULES/Product.md's
 * Products-catalog-reuse discussion (conversation, Stage 1): Material Requisition/Purchase Request
 * lines reference these by `Product.id` rather than a duplicate parallel catalog, the same
 * snapshot-by-id convention QuoteLine/ScopeOfWorkItem already use.
 *
 * `defaultPrice: 0` for every row — the source form carries no pricing at all (this is an internal
 * store/stock catalog, not a sales price list); `Product.defaultPrice` already accommodates 0
 * without any schema change.
 *
 * **Wired in as of Stage 3 (2026-08-18)**: `ensureMaterialCatalogSeeded()` is called defensively from
 * `handleMaterialRequisition()`'s entry point (`api/_lib/materialRequisitionHandler.ts`) — the same
 * "seed on first request to this resource" pattern `seedJobTypesIfEmpty()`/
 * `seedQuotationTemplatesIfEmpty()` already established, guarded by an in-memory `seeded` flag (same
 * one-check-per-warm-instance convention as `bootstrapRbac()` in rbacSeed.ts) so the real idempotent
 * work in `seedMaterialCatalogIfEmpty()` below only actually runs once per process. Still not yet
 * verified against a real deployment — this session has no live MongoDB credentials, the standing
 * limitation noted throughout this codebase's docs.
 */

export const MATERIAL_CATEGORY_SEEDS = [
  { name: "อื่นๆ (คลัง)", categoryKey: "other" as const },
  { name: "น็อตและสกรู", categoryKey: "hardware" as const },
  { name: "วัสดุสิ้นเปลือง", categoryKey: "consumable" as const },
  { name: "เคมี/เรซิ่น", categoryKey: "chemical" as const },
];

export type MaterialCategoryKey = (typeof MATERIAL_CATEGORY_SEEDS)[number]["categoryKey"];

export interface MaterialProductSeed {
  code: string;
  name: string;
  unit: string;
  categoryKey: MaterialCategoryKey;
}

/** Every row transcribed in the reference PDFs' own printed order (page 1 -> 4). Codes/names/units
 * are reproduced verbatim, including inconsistent internal spacing in a couple of source codes (e.g.
 * "MA-SILLICA FUME-A200") — not normalized, so the seeded code always matches what's printed on the
 * real form. */
export const MATERIAL_PRODUCT_SEEDS: MaterialProductSeed[] = [
  // ── หมวดอื่นๆ (Other) — page 1 + continued on page 2 ──────────────────────────────────────────
  { code: "PD-0189", name: "ดอกสว่านไทเทเนียม 8mm", unit: "ดอก", categoryKey: "other" },
  { code: "PD-0150", name: "ดอกสว่านไทเทเนียม 9mm", unit: "ดอก", categoryKey: "other" },
  { code: "PD-0151", name: "ดอกสว่านไทเทเนียม 10mm", unit: "ดอก", categoryKey: "other" },
  { code: "PD-0152", name: "ดอกสว่านไทเทเนียม 12mm", unit: "ดอก", categoryKey: "other" },
  { code: "S-0222", name: "พุ๊กเคมี+สตัด 16x190mm. SUS304 แบบตอก", unit: "ชุด", categoryKey: "other" },
  { code: "PD-0045", name: "ดอกสว่านไทเทเนียม 3mm.(1/8\")", unit: "ดอก", categoryKey: "other" },
  { code: "PD-0170", name: "ดอกสว่านไทเทเนียม 4mm", unit: "ดอก", categoryKey: "other" },
  { code: "PD-0046", name: "ดอกสว่านไทเทเนียม 5mm", unit: "ดอก", categoryKey: "other" },
  { code: "PD-0176", name: "ดอกสว่านไทเทเนียม 6mm", unit: "ดอก", categoryKey: "other" },

  // ── หมวดน๊อตสกรู (Nuts & Bolts) — page 2 ───────────────────────────────────────────────────────
  { code: "ชุดSUS-M8-25", name: "ชุดน๊อต SUS304 M8x25 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M10-30", name: "ชุดน๊อต SUS304 M10x30 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M10-40", name: "ชุดน๊อต SUS304 M10x40 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M10-50", name: "ชุดน๊อต SUS304 M10x50 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M10-60", name: "ชุดน๊อต SUS304 M10x60 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M10-70", name: "ชุดน๊อต SUS304 M10x70 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M10-80", name: "ชุดน๊อต SUS304 M10x80 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M12-30", name: "ชุดน๊อต SUS304 M12x30 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M12-40", name: "ชุดน๊อต SUS304 M12x40 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M12-50", name: "ชุดน๊อต SUS304 M12x50 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M12-60", name: "ชุดน๊อต SUS304 M12x60 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M12-70", name: "ชุดน๊อต SUS304 M12x70 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M12-80", name: "ชุดน๊อต SUS304 M12x80 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M16-50", name: "ชุดน๊อต SUS304 M16x50 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M16-60", name: "ชุดน๊อต SUS304 M16x60 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M16-70", name: "ชุดน๊อต SUS304 M16x70 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M16-80", name: "ชุดน๊อต SUS304 M16x80 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "ชุดSUS-M20-90", name: "ชุดน๊อต SUS304 M20x90 mm.", unit: "ชุด", categoryKey: "hardware" },
  { code: "S-0005", name: "พุ๊กเหล็ก 3/8''", unit: "ตัว", categoryKey: "hardware" },
  { code: "S-0020", name: "พุ๊กเหล็ก 5/16''", unit: "ตัว", categoryKey: "hardware" },
  { code: "S-0006", name: "เกลียวปล่อย SUS JF+#8x1\"", unit: "ตัว", categoryKey: "hardware" },

  // ── หมวดอุปกรณ์สิ้นเปลือง (Consumables) — page 3 + continued on page 4 ────────────────────────
  { code: "PD-0034", name: "เศษผ้า", unit: "ผืน", categoryKey: "consumable" },
  { code: "PD-0032", name: "ใบตัดเหล็กบาง 4''", unit: "ใบ", categoryKey: "consumable" },
  { code: "PD-0110", name: "ใบเจียร์เหล็กบาง 4''", unit: "ใบ", categoryKey: "consumable" },
  { code: "PD-0111", name: "ใบขัดทรายกลมบาง 4''", unit: "ใบ", categoryKey: "consumable" },
  { code: "PD-0043", name: "กาวแท่ง", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0084", name: "เทปกาว 1.1/2''", unit: "ม้วน", categoryKey: "consumable" },
  { code: "PD-0117", name: "เทปใส 2''", unit: "ม้วน", categoryKey: "consumable" },
  { code: "PD-0006", name: "ปากกาเคมี", unit: "ด้าม", categoryKey: "consumable" },
  { code: "PD-0009", name: "ดินสอช่าง (แดง) 741", unit: "ด้าม", categoryKey: "consumable" },
  { code: "PD-0027", name: "ลูกรีเวท #10", unit: "ตัว", categoryKey: "consumable" },
  { code: "PD-0382", name: "ลวดชุบขาวอ่อน", unit: "kg", categoryKey: "consumable" },
  { code: "PD-0645", name: "ถุงมือยาง (ไนไตรบาง)", unit: "คู่", categoryKey: "consumable" },
  { code: "PD-0004", name: "ถุงมือผ้า", unit: "คู่", categoryKey: "consumable" },
  { code: "PD-0166", name: "ใบมีดคัตเตอร์", unit: "กล่องย่อย", categoryKey: "consumable" },
  { code: "PD-0066", name: "หินชมพู 1/2\" (ลูกบอส)", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0050", name: "หินชมพู 3/4\" (ลูกบอส)", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0164", name: "หินชมพู 1\" (ลูกบอส)", unit: "อัน", categoryKey: "consumable" },
  { code: "RM-0044", name: "ปะเก็นยางธรรมดา 3mm. หน้ากว้าง 1M", unit: "kg", categoryKey: "consumable" },
  { code: "RM-0043", name: "ปะเก็นยางธรรมดา 5mm. หน้ากว้าง 1M", unit: "kg", categoryKey: "consumable" },
  { code: "RM-0421", name: "ปะเก็น EPDM 3mm.", unit: "เมตร", categoryKey: "consumable" },
  { code: "PD-0028", name: "เทปพันเกลียว", unit: "ม้วน", categoryKey: "consumable" },
  { code: "PD-0161", name: "เทปพันสายไฟ", unit: "ม้วน", categoryKey: "consumable" },
  { code: "PD-0080", name: "ผ้าใบฟ้า-ขาว (ผ้าบลูชีท)", unit: "ม้วน", categoryKey: "consumable" },
  { code: "PD-0048", name: "ไม้กวาดดอกหญ้า", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0089", name: "ไม้กวาดก้านมะพร้าว", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0655", name: "กาวยาง 170 กรัม", unit: "กระป๋อง", categoryKey: "consumable" },
  { code: "PD-0160", name: "มีดคัตเตอร์ (ใหญ่)", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0142", name: "แปรง 1\"", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0143", name: "แปรง 2\"", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0140", name: "อะไหล่ลูกกลิ้ง 4''", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0141", name: "ลูกกลิ้ง 4''", unit: "ด้าม", categoryKey: "consumable" },
  { code: "PD-0035", name: "ลูกกลิ้ง 7''", unit: "ด้าม", categoryKey: "consumable" },
  { code: "PD-0095", name: "ลูกกลิ้งขนหมู 4''(22mm.)", unit: "อัน", categoryKey: "consumable" },
  { code: "PD-0139", name: "ขันมีด้ามจับ", unit: "ใบ", categoryKey: "consumable" },
  { code: "PD-0026", name: "ถังดำ", unit: "ใบ", categoryKey: "consumable" },
  { code: "PD-0062", name: "Wax Mold (WAX MOLD RELEASE 1000P)", unit: "กระป๋อง", categoryKey: "consumable" },
  { code: "PD-0036", name: "กระดาษทราย #80", unit: "ใบ", categoryKey: "consumable" },

  // ── หมวดน้ำยาเคมี (Chemicals/Resins) — page 4 ─────────────────────────────────────────────────
  { code: "MA-RE-OR-P9539NWA-6", name: "น้ำยา Resin Ortho P9539NWA-6", unit: "kg", categoryKey: "chemical" },
  { code: "MA-RE-OR-2504", name: "น้ำยา Resin Eterset2504PT-N (Ortho)", unit: "kg", categoryKey: "chemical" },
  { code: "MA-RE-VL-901P", name: "น้ำยา Resin (SWANCOR901P)", unit: "kg", categoryKey: "chemical" },
  { code: "MA-RE-VL-907", name: "น้ำยา Resin (SWANCOR907)", unit: "kg", categoryKey: "chemical" },
  { code: "MA-RE-VL-VI003", name: "น้ำยา Resin Luxchem VI003 (Vinyl)", unit: "kg", categoryKey: "chemical" },
  { code: "MA-RE-VL-6655", name: "Resin H6655PT FOOD GRADE", unit: "kg", categoryKey: "chemical" },
  { code: "MA-EMC450-1040", name: "ใยแก้ว JUSHI (M450)", unit: "kg", categoryKey: "chemical" },
  { code: "MA-ERW600-100", name: "ใยทอ JUSHI#600 (ใยตาสาน)", unit: "kg", categoryKey: "chemical" },
  { code: "MA-TISSUE", name: "ใยผิว (GLASS TISSUE)", unit: "kg", categoryKey: "chemical" },
  { code: "MA-BU-M60", name: "ฮาร์ดเดนเนอร์ HARD BUTANOX M60", unit: "kg", categoryKey: "chemical" },
  { code: "MA-AC-70-30", name: "อะซิโตน ACETONE", unit: "kg", categoryKey: "chemical" },
  { code: "MA-SILLICA FUME-A200", name: "ผงเบา SILLICA FUME A-200", unit: "kg", categoryKey: "chemical" },
  { code: "MA-UV", name: "น้ำยา UV (กันแสง)", unit: "kg", categoryKey: "chemical" },
  { code: "MA-MONO-W", name: "โมโนแว็ก MONO WAX", unit: "kg", categoryKey: "chemical" },
  { code: "MA-COBLT", name: "โคบอล COBLAT", unit: "kg", categoryKey: "chemical" },
];

/**
 * Idempotent: inserts the 4 categories (by stable `name`) and every seed product (by stable `code`)
 * that don't already exist, in the same find-then-insert-if-missing pattern
 * `upsertQuotationTemplates()` uses. Safe to call repeatedly — never a coarse "collection empty"
 * gate, since `products`/`categories` won't be empty in a real deployment (Quotation's own products
 * already live there). Call `ensureMaterialCatalogSeeded()` below from a route instead of this
 * directly — it adds the one-per-process in-memory guard so a warm instance doesn't re-run the
 * per-item `findOne` checks on every single request.
 */
export async function seedMaterialCatalogIfEmpty(actorUserId = "system"): Promise<{
  categoriesCreated: string[];
  productsCreated: string[];
}> {
  const categories = await categoriesCollection();
  const products = await productsCollection();
  const now = nowIso();

  const categoryIdByKey = new Map<MaterialCategoryKey, string>();
  const categoriesCreated: string[] = [];
  for (const seed of MATERIAL_CATEGORY_SEEDS) {
    const existing = await categories.findOne({ name: seed.name });
    if (existing) {
      categoryIdByKey.set(seed.categoryKey, existing._id.toString());
      continue;
    }
    const result = await categories.insertOne({
      name: seed.name, archived: false,
      createdAt: now, updatedAt: now, createdBy: actorUserId, updatedBy: actorUserId,
    });
    categoryIdByKey.set(seed.categoryKey, result.insertedId.toString());
    categoriesCreated.push(seed.name);
  }

  const productsCreated: string[] = [];
  for (const seed of MATERIAL_PRODUCT_SEEDS) {
    const existing = await products.findOne({ code: seed.code });
    if (existing) continue;
    const categoryId = categoryIdByKey.get(seed.categoryKey) ?? "";
    try {
      await products.insertOne({
        code: seed.code, name: seed.name, categoryId, unit: seed.unit,
        defaultPrice: 0, description: "", specifications: "", archived: false, stockQty: 0,
        createdAt: now, updatedAt: now, createdBy: actorUserId, updatedBy: actorUserId,
      });
      productsCreated.push(seed.code);
    } catch {
      // A concurrent seed run already inserted this code between our findOne and this insertOne —
      // harmless, same race-tolerance convention upsertQuotationTemplates() uses.
    }
  }

  return { categoriesCreated, productsCreated };
}

let materialCatalogSeeded = false;

/** One-per-process guard around `seedMaterialCatalogIfEmpty()` — same convention as
 * `bootstrapRbac()` in rbacSeed.ts. Called from `handleMaterialRequisition()`'s entry point
 * (api/_lib/materialRequisitionHandler.ts), the resource whose line-item picker actually needs this
 * catalog to exist. */
export async function ensureMaterialCatalogSeeded(): Promise<void> {
  if (materialCatalogSeeded) return;
  await seedMaterialCatalogIfEmpty();
  materialCatalogSeeded = true;
}
