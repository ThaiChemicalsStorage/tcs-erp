import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for **นำเข้าสินค้าจากไฟล์ Excel** (`POST /api/products/import`, 2026-09-04),
 * built from the owner's request: *"หน้าเพิ่มสินค้าอะทำให้รองรับไฟล์ exel ให้หน่อย เวลาย้ายสินค้าจาก
 * อีกระบบเข้ามาจะได้ง่ายๆ แบบโยนไฟล์ exel เข้าไปแล้วสินค้าเข้ามาเลย"*
 *
 * The parsing itself is unit-tested in `tests/productImport.test.ts`. What is pinned *here* is the
 * behaviour that only shows up against a real database, and that would be expensive to get wrong:
 *
 *   1. **An existing code is skipped, never overwritten** — re-importing the same file (a normal
 *      thing to do while migrating) must not eat names, prices or categories that were edited in
 *      the app afterwards.
 *   2. **The duplicate check is case-insensitive**, unlike single-product create — files exported
 *      from another system routinely change the case of a code, and a case-twin catalog is far
 *      harder to unpick than a skipped row.
 *   3. **Categories are matched/created by name**, once per name, because a spreadsheet cannot
 *      know a `categoryId`.
 *   4. **Stock stays at zero.** Import may never set `stockQty`/`avgCost`: those move only through
 *      a StockMovement row (docs/MODULES/Product.md). A file column called "คงเหลือ" must not
 *      become an untraceable opening balance.
 *   5. **The route is mounted in `server/app.ts`** — a missed Express mapping 404s locally while
 *      still working on Vercel; a 401 without a cookie proves it is wired.
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;

type ProductDoc = {
  id: string; code: string; name: string; categoryId: string; unit: string;
  defaultPrice: number; description: string; specifications: string;
  stockQty: number; avgCost?: number; reorderPoint?: number; isTool?: boolean; archived: boolean;
};

type CategoryDoc = { id: string; name: string };

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}

async function importRows(rows: Record<string, unknown>[]): Promise<Response> {
  return api("/api/products/import", { method: "POST", body: JSON.stringify({ products: rows }) });
}

async function listProducts(): Promise<ProductDoc[]> {
  const res = await api("/api/products");
  expect(res.status).toBe(200);
  return ((await res.json()) as { products: ProductDoc[] }).products;
}

async function listCategories(): Promise<CategoryDoc[]> {
  const res = await api("/api/categories");
  expect(res.status).toBe(200);
  return ((await res.json()) as { categories: CategoryDoc[] }).categories;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("นำเข้าสินค้า — เส้นทางและการตรวจเบื้องต้น", () => {
  it("เส้นทางถูก map ใน Express จริง (ไม่มีคุกกี้ = 401 ไม่ใช่ 404)", async () => {
    const res = await fetch(`${baseUrl}/api/products/import`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("ส่งรายการว่างมาถูกปฏิเสธ ไม่ใช่ตอบสำเร็จแบบไม่ได้ทำอะไร", async () => {
    const res = await importRows([]);
    expect(res.status).toBe(400);
  });

  it("แถวที่ไม่ใช่อ็อบเจ็กต์ถูกข้าม ไม่ใช่ทำให้ทั้งคำขอพัง 500", async () => {
    const res = await importRows([null, "PD-1", 7] as unknown as Record<string, unknown>[]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: 0, skipped: 3 });
    expect(await listProducts()).toHaveLength(0);
  });

  it("เกินเพดานต่อครั้งถูกปฏิเสธทั้งชุด ไม่ใช่นำเข้าครึ่งเดียว", async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({ code: `X-${i}`, name: `ของ ${i}` }));
    const res = await importRows(rows);
    expect(res.status).toBe(400);
    expect(await listProducts()).toHaveLength(0);
  });
});

describe("นำเข้าสินค้า — สร้างสินค้าและหมวดหมู่", () => {
  it("สร้างสินค้าครบทุกช่อง และสร้างหมวดหมู่ใหม่ให้ตามชื่อที่อยู่ในไฟล์", async () => {
    const res = await importRows([
      { code: "PD-9001", name: "ดอกสว่านไทเทเนียม 6mm", categoryName: "วัสดุสิ้นเปลือง", unit: "ดอก", defaultPrice: 45, reorderPoint: 10, isTool: false, description: "ใช้กับงานเจาะเหล็ก", specifications: "HSS-Co 5%" },
      { code: "T-9002", name: "สว่านไฟฟ้า", categoryName: "เครื่องมือช่าง", unit: "ตัว", defaultPrice: 3500, isTool: true },
    ]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: 2, skipped: 0 });

    const products = await listProducts();
    expect(products).toHaveLength(2);
    const drill = products.find((p) => p.code === "PD-9001")!;
    expect(drill).toMatchObject({
      name: "ดอกสว่านไทเทเนียม 6mm", unit: "ดอก", defaultPrice: 45,
      reorderPoint: 10, isTool: false, description: "ใช้กับงานเจาะเหล็ก", specifications: "HSS-Co 5%", archived: false,
    });

    const categories = await listCategories();
    expect(categories.map((c) => c.name).sort()).toEqual(["วัสดุสิ้นเปลือง", "เครื่องมือช่าง"].sort());
    expect(drill.categoryId).toBe(categories.find((c) => c.name === "วัสดุสิ้นเปลือง")!.id);
  });

  it("ยอดสต๊อกและต้นทุนเริ่มที่ 0 เสมอ — นำเข้าตั้งยอดตั้งต้นไม่ได้", async () => {
    const res = await importRows([{ code: "PD-9010", name: "ของที่พยายามยัดยอดมาด้วย", stockQty: 99, avgCost: 55 }]);
    expect(res.status).toBe(200);
    const product = (await listProducts()).find((p) => p.code === "PD-9010")!;
    expect(product.stockQty).toBe(0);
    expect(product.avgCost).toBe(0);
  });

  it("หมวดหมู่ชื่อเดียวกันหลายแถว ถูกสร้างครั้งเดียวและใช้ร่วมกัน", async () => {
    const before = await listCategories();
    const res = await importRows([
      { code: "PD-9021", name: "ก", categoryName: "หมวดร่วม" },
      { code: "PD-9022", name: "ข", categoryName: "หมวดร่วม" },
    ]);
    expect(await res.json()).toMatchObject({ created: 2, categoriesCreated: ["หมวดร่วม"] });
    const after = await listCategories();
    expect(after).toHaveLength(before.length + 1);
    const products = await listProducts();
    const a = products.find((p) => p.code === "PD-9021")!;
    const b = products.find((p) => p.code === "PD-9022")!;
    expect(a.categoryId).toBe(b.categoryId);
    expect(a.categoryId).not.toBe("");
  });

  it("หมวดหมู่ที่มีอยู่แล้วถูกใช้ซ้ำ ไม่สร้างซ้ำ แม้พิมพ์คนละตัวพิมพ์", async () => {
    const res = await importRows([{ code: "PD-9030", name: "ค", categoryName: "หมวดร่วม" }]);
    expect(await res.json()).toMatchObject({ created: 1, categoriesCreated: [] });
    expect((await listCategories()).filter((c) => c.name === "หมวดร่วม")).toHaveLength(1);
  });

  it("ไม่มีหมวดหมู่ในไฟล์ก็นำเข้าได้ ปล่อยหมวดว่างไว้", async () => {
    const res = await importRows([{ code: "PD-9040", name: "ของไม่ระบุหมวด" }]);
    expect(res.status).toBe(200);
    expect((await listProducts()).find((p) => p.code === "PD-9040")!.categoryId).toBe("");
  });
});

describe("นำเข้าสินค้า — ไม่ทับของเดิม", () => {
  it("รหัสที่มีอยู่แล้วถูกข้าม และข้อมูลเดิมไม่ถูกแก้", async () => {
    const before = (await listProducts()).find((p) => p.code === "PD-9001")!;
    const res = await importRows([{ code: "PD-9001", name: "ชื่อใหม่ที่ไม่ควรถูกเขียนทับ", defaultPrice: 99999 }]);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: 0, skipped: 1 });
    const after = (await listProducts()).find((p) => p.code === "PD-9001")!;
    expect(after.name).toBe(before.name);
    expect(after.defaultPrice).toBe(before.defaultPrice);
  });

  it("รหัสซ้ำแบบสลับตัวพิมพ์ก็ถูกข้าม ไม่สร้างเป็นสินค้าคนละตัว", async () => {
    const res = await importRows([{ code: "pd-9001", name: "ตัวพิมพ์เล็ก" }]);
    expect(await res.json()).toMatchObject({ created: 0, skipped: 1 });
    expect((await listProducts()).filter((p) => p.code.toLowerCase() === "pd-9001")).toHaveLength(1);
  });

  it("นำเข้าไฟล์เดิมซ้ำอีกรอบ ไม่เพิ่มอะไรและไม่ล้ม", async () => {
    const before = await listProducts();
    const res = await importRows(before.map((p) => ({ code: p.code, name: p.name })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: 0, skipped: before.length });
    expect(await listProducts()).toHaveLength(before.length);
  });

  it("แถวที่ขาดรหัสหรือชื่อถูกนับเป็นข้าม แถวที่เหลือยังเข้าตามปกติ", async () => {
    const res = await importRows([
      { code: "", name: "ไม่มีรหัส" },
      { code: "PD-9050", name: "" },
      { code: "PD-9051", name: "แถวที่ครบ" },
    ]);
    expect(await res.json()).toMatchObject({ created: 1, skipped: 2 });
    expect((await listProducts()).some((p) => p.code === "PD-9051")).toBe(true);
  });
});
