import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, type Collection } from "mongodb";

/**
 * Integration test for the Product Stock ledger (api/_lib/stockHandler.ts, added 2026-08-18) against
 * a throwaway in-memory MongoDB — the same import-after-MONGODB_URI pattern
 * tests/api/rbacMigrations.test.ts established.
 *
 * `applyStockMovement()` is the ONLY writer of `Product.stockQty`, so the invariants it owns are
 * exactly the ones docs/CLAUDE.md's standing rule 8 calls "money math" for inventory: a balance can
 * never be driven negative, `balanceAfter` must be the real post-write balance (it's an audit
 * snapshot, never re-derived), and every balance change must leave a `stock_movements` row behind.
 * `assertProductsHaveStock()` is the multi-line pre-flight the AR/IV cutting loop relies on, since
 * that loop is not a transaction.
 */

interface ProductDoc {
  _id: ObjectId;
  code: string;
  name: string;
  unit: string;
  stockQty?: number;
  archived: boolean;
  updatedAt: string;
}

let mongod: MongoMemoryServer;
let client: MongoClient;
let products: Collection<ProductDoc>;
let movements: Collection<{ productId: string; delta: number; balanceAfter: number; kind: string; sourceType: string; sourceId?: string }>;
let stock: typeof import("../../api/_lib/stockHandler.js");

const PRODUCT_A = new ObjectId();
const PRODUCT_B = new ObjectId();
/** A product created before `stockQty` existed — the real production shape this module has to survive. */
const LEGACY_PRODUCT = new ObjectId();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  products = client.db("tcs_erp").collection<ProductDoc>("products");
  movements = client.db("tcs_erp").collection("stock_movements");
  // Import AFTER MONGODB_URI points at the memory server.
  stock = await import("../../api/_lib/stockHandler.js");
});

beforeEach(async () => {
  await products.deleteMany({});
  await movements.deleteMany({});
  await products.insertMany([
    { _id: PRODUCT_A, code: "P-A", name: "สินค้า A", unit: "ชิ้น", stockQty: 10, archived: false, updatedAt: "" },
    { _id: PRODUCT_B, code: "P-B", name: "สินค้า B", unit: "ชิ้น", stockQty: 3, archived: false, updatedAt: "" },
    // No stockQty key at all — exactly what every product created before 2026-08-18 looks like.
    { _id: LEGACY_PRODUCT, code: "P-OLD", name: "สินค้าเก่า", unit: "ชิ้น", archived: false, updatedAt: "" },
  ]);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

async function qtyOf(id: ObjectId): Promise<number | undefined> {
  return (await products.findOne({ _id: id }))?.stockQty;
}

describe("applyStockMovement (the only writer of Product.stockQty)", () => {
  it("a receive raises the balance and records a ledger row with the post-write balance", async () => {
    const { movement, balanceAfter } = await stock.applyStockMovement({
      productId: PRODUCT_A.toString(), kind: "receive", delta: 4,
      reason: "รับเข้า", sourceType: "manual", userId: "u1",
    });

    expect(await qtyOf(PRODUCT_A)).toBe(14);
    expect(balanceAfter).toBe(14);
    expect(movement.balanceAfter, "balanceAfter is an audit snapshot, never re-derived later").toBe(14);
    expect(movement.productCode, "code/name are snapshotted so the log survives a later rename").toBe("P-A");
    expect(await movements.countDocuments({ productId: PRODUCT_A.toString() })).toBe(1);
  });

  it("a deduct larger than the balance is refused and changes nothing", async () => {
    await expect(stock.applyStockMovement({
      productId: PRODUCT_B.toString(), kind: "deduct", delta: -4,
      reason: "ตัดออก", sourceType: "manual", userId: "u1",
    })).rejects.toMatchObject({ status: 400 });

    expect(await qtyOf(PRODUCT_B), "balance is untouched on a refused deduct").toBe(3);
    expect(await movements.countDocuments({}), "no ledger row is written for a refused movement").toBe(0);
  });

  it("a deduct of exactly the balance is allowed and lands on zero", async () => {
    await stock.applyStockMovement({
      productId: PRODUCT_B.toString(), kind: "deduct", delta: -3,
      reason: "ตัดออก", sourceType: "manual", userId: "u1",
    });
    expect(await qtyOf(PRODUCT_B)).toBe(0);
  });

  it("an adjust may be negative, but still never below zero", async () => {
    await stock.applyStockMovement({
      productId: PRODUCT_A.toString(), kind: "adjust", delta: -10,
      reason: "ปรับยอดตามการนับจริง", sourceType: "manual", userId: "u1",
    });
    expect(await qtyOf(PRODUCT_A)).toBe(0);

    await expect(stock.applyStockMovement({
      productId: PRODUCT_A.toString(), kind: "adjust", delta: -1,
      reason: "ปรับยอด", sourceType: "manual", userId: "u1",
    })).rejects.toMatchObject({ status: 400 });
  });

  it("a zero or non-finite delta is refused before any write", async () => {
    for (const delta of [0, NaN]) {
      await expect(stock.applyStockMovement({
        productId: PRODUCT_A.toString(), kind: "adjust", delta,
        reason: "", sourceType: "manual", userId: "u1",
      })).rejects.toMatchObject({ status: 400 });
    }
    expect(await qtyOf(PRODUCT_A)).toBe(10);
  });

  it("a missing product is a 404, not a silent no-op", async () => {
    await expect(stock.applyStockMovement({
      productId: new ObjectId().toString(), kind: "receive", delta: 1,
      reason: "", sourceType: "manual", userId: "u1",
    })).rejects.toMatchObject({ status: 404 });
  });

  it("backfills a pre-2026-08-18 product that has no stockQty field at all", async () => {
    expect(await qtyOf(LEGACY_PRODUCT), "precondition: the field genuinely does not exist").toBeUndefined();

    await stock.applyStockMovement({
      productId: LEGACY_PRODUCT.toString(), kind: "receive", delta: 5,
      reason: "รับเข้า", sourceType: "manual", userId: "u1",
    });

    // Every product now carries a real number — the Stock page calls p.stockQty.toLocaleString().
    expect(await qtyOf(LEGACY_PRODUCT)).toBe(5);
    expect(await products.countDocuments({ stockQty: { $exists: false } })).toBe(0);
  });
});

describe("assertProductsHaveStock (pre-flight for the non-transactional AR/IV cutting loop)", () => {
  it("passes when every product has enough, and writes nothing itself", async () => {
    await stock.assertProductsHaveStock(new Map([[PRODUCT_A.toString(), 10], [PRODUCT_B.toString(), 1]]));
    expect(await qtyOf(PRODUCT_A)).toBe(10);
    expect(await movements.countDocuments({})).toBe(0);
  });

  it("refuses BEFORE any line is applied when a later line would run out", async () => {
    await expect(
      stock.assertProductsHaveStock(new Map([[PRODUCT_A.toString(), 1], [PRODUCT_B.toString(), 99]])),
    ).rejects.toMatchObject({ status: 400 });

    expect(await qtyOf(PRODUCT_A), "the earlier line must not have been cut").toBe(10);
    expect(await qtyOf(PRODUCT_B)).toBe(3);
  });

  it("checks the summed quantity for a product named on two lines, not each line separately", async () => {
    // 2 + 2 against a balance of 3: each line alone would pass, the pair must not.
    await expect(
      stock.assertProductsHaveStock(new Map([[PRODUCT_B.toString(), 4]])),
    ).rejects.toMatchObject({ status: 400 });
  });
});

/**
 * แจ้งเตือน "ของใกล้หมด" (2026-09-02) — เจ้าของสั่งว่า *"เวลาของใกล้หมดให้แจ้งเตือน"*
 *
 * เกาะอยู่กับ `applyStockMovement()` ตัวเดียว จึงครอบคลุมทุกทางที่สต๊อกลดลง แต่นั่นแปลว่าเงื่อนไข
 * ต้องแม่นมาก ๆ ด้วย: ถ้ายิงทุกครั้งที่ตัดของที่ต่ำอยู่แล้ว กระดิ่งจะเต็มไปด้วยเรื่องเดิมจนไม่มีใครอ่าน
 * ซึ่งแย่กว่าไม่มีการเตือนเลย เทสต์ชุดนี้จึงคุม "ยิงเฉพาะตอนข้ามเส้น" เป็นหลัก
 */
describe("low-stock alert", () => {
  const STORE_USER = new ObjectId();

  async function seedStoreUser(): Promise<void> {
    await client.db("tcs_erp").collection("users").deleteMany({});
    await client.db("tcs_erp").collection("users").insertOne({
      _id: STORE_USER, fullName: "สโตร์ หนึ่ง", department: "ฝ่ายคลังสินค้า", status: "active",
    });
    await client.db("tcs_erp").collection("notifications").deleteMany({});
  }

  async function alertCount(): Promise<number> {
    return client.db("tcs_erp").collection("notifications").countDocuments({ type: "stock_low" });
  }

  beforeEach(async () => {
    await seedStoreUser();
  });

  it("แจ้งเตือนเมื่อยอดถูกตัดลงมาถึงจุดเตือน", async () => {
    await products.updateOne({ _id: PRODUCT_A }, { $set: { reorderPoint: 5 } });
    await stock.applyStockMovement({
      productId: PRODUCT_A.toString(), kind: "deduct", delta: -5,
      reason: "เบิก", sourceType: "manual", userId: "someone-else",
    });
    expect(await qtyOf(PRODUCT_A)).toBe(5);
    expect(await alertCount(), "ยอดหลังตัด (5) ถึงจุดเตือนพอดี ต้องแจ้ง").toBe(1);
  });

  it("ไม่แจ้งซ้ำเมื่อตัดของที่อยู่ต่ำกว่าจุดเตือนอยู่แล้ว", async () => {
    await products.updateOne({ _id: PRODUCT_A }, { $set: { reorderPoint: 8 } });
    await stock.applyStockMovement({
      productId: PRODUCT_A.toString(), kind: "deduct", delta: -3,
      reason: "เบิกครั้งแรก", sourceType: "manual", userId: "u1",
    });
    expect(await alertCount(), "ครั้งแรกคือการข้ามเส้น 10 -> 7").toBe(1);

    await stock.applyStockMovement({
      productId: PRODUCT_A.toString(), kind: "deduct", delta: -1,
      reason: "เบิกครั้งที่สอง", sourceType: "manual", userId: "u1",
    });
    expect(await alertCount(), "7 -> 6 ยังต่ำกว่าเส้นเหมือนเดิม ไม่ใช่การข้ามเส้นใหม่").toBe(1);
  });

  it("การรับของเข้าไม่แจ้งเตือน แม้ยอดจะยังต่ำกว่าจุดเตือน", async () => {
    await products.updateOne({ _id: PRODUCT_B }, { $set: { reorderPoint: 20 } });
    await stock.applyStockMovement({
      productId: PRODUCT_B.toString(), kind: "receive", delta: 2,
      reason: "รับเข้า", sourceType: "manual", userId: "u1",
    });
    expect(await alertCount()).toBe(0);
  });

  it("จุดเตือน 0 หรือไม่ได้ตั้งไว้ = ปิดการเตือนของสินค้าตัวนั้น", async () => {
    await stock.applyStockMovement({
      productId: PRODUCT_A.toString(), kind: "deduct", delta: -10,
      reason: "เบิกจนหมด", sourceType: "manual", userId: "u1",
    });
    expect(await qtyOf(PRODUCT_A)).toBe(0);
    expect(await alertCount(), "ไม่งั้นสินค้าทุกตัวที่ยังไม่ตั้งค่าจะยิงพร้อมกันหมดในวันแรก").toBe(0);
  });

  it("การแจ้งเตือนที่ส่งไม่ออกต้องไม่ทำให้การตัดสต๊อกล้ม", async () => {
    await client.db("tcs_erp").collection("users").deleteMany({});
    await products.updateOne({ _id: PRODUCT_A }, { $set: { reorderPoint: 5 } });
    await expect(stock.applyStockMovement({
      productId: PRODUCT_A.toString(), kind: "deduct", delta: -6,
      reason: "เบิก", sourceType: "manual", userId: "u1",
    })).resolves.toBeTruthy();
    expect(await qtyOf(PRODUCT_A), "สต๊อกถูกตัดจริงแม้ไม่มีใครรับแจ้งเตือน").toBe(4);
  });
});
