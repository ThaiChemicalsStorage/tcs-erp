import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

/**
 * Verifies `seedMaterialCatalogIfEmpty()` (api/_lib/materialCatalogSeedData.ts) actually runs and
 * inserts real documents — added 2026-08-18, Stage 4, per the explicit "confirm this before building
 * a Product-picker UI on top of it" instruction. Runs against a throwaway in-memory MongoDB, the same
 * standing substitute this codebase's test suite always uses in place of a live database connection
 * (no live MongoDB credentials are available in this session).
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let seedMaterialCatalogIfEmpty: typeof import("../../api/_lib/materialCatalogSeedData.js").seedMaterialCatalogIfEmpty;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  seedMaterialCatalogIfEmpty = (await import("../../api/_lib/materialCatalogSeedData.js")).seedMaterialCatalogIfEmpty;
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("seedMaterialCatalogIfEmpty()", () => {
  it("inserts real category + product documents into an empty database", async () => {
    const result = await seedMaterialCatalogIfEmpty();
    console.log("categoriesCreated:", result.categoriesCreated.length, result.categoriesCreated);
    console.log("productsCreated:", result.productsCreated.length);

    const db = client.db("tcs_erp");
    const categoryCount = await db.collection("categories").countDocuments();
    const productCount = await db.collection("products").countDocuments();
    console.log("categories in DB:", categoryCount);
    console.log("products in DB:", productCount);

    const sample = await db.collection("products").find({}).sort({ code: 1 }).limit(4).toArray();
    console.log("sample rows:", JSON.stringify(sample.map((p) => ({ code: p.code, name: p.name, unit: p.unit, categoryId: p.categoryId, defaultPrice: p.defaultPrice })), null, 2));

    expect(categoryCount).toBe(4);
    expect(productCount).toBeGreaterThan(0);
    expect(result.productsCreated.length).toBe(productCount);

    // Every product resolves to a real category id.
    const categoryIds = new Set((await db.collection("categories").find({}).toArray()).map((c) => c._id.toString()));
    const allProducts = await db.collection("products").find({}).toArray();
    for (const p of allProducts) {
      expect(categoryIds.has(p.categoryId), `product ${p.code} has an unresolved categoryId`).toBe(true);
    }

    // No duplicate codes.
    const codes = allProducts.map((p) => p.code);
    expect(new Set(codes).size, "duplicate product codes in the seed data").toBe(codes.length);
  });

  it("is idempotent — a second run inserts nothing new", async () => {
    const before = await client.db("tcs_erp").collection("products").countDocuments();
    const result = await seedMaterialCatalogIfEmpty();
    const after = await client.db("tcs_erp").collection("products").countDocuments();
    expect(result.categoriesCreated).toEqual([]);
    expect(result.productsCreated).toEqual([]);
    expect(after).toBe(before);
  });
});
