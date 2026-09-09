import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * คำขอเพิ่มสินค้า (2026-08-27) + **การเติมรหัสกลับเข้าใบขอซื้อ (2026-09-09)**
 *
 * เจ้าของรายงานเมื่อ 2026-09-09 ว่า *"ขอเพิ่มสินค้าใน stock พอตั้งรหัสเสร็จแล้วเวลาจะไปกดเพิ่มสินค้าใน
 * หน้าต่างๆแล้วมันไม่ขึ้นสินค้าเลย"* และ *"พอเค้าตั้งเสร็จแล้วอยากให้มันขึ้นมาเลยไม่ต้องมากดลบแล้วเพิ่มใหม่"*
 *
 * สิ่งที่ตรึงไว้ เพราะทั้งสองข้อเป็นเส้นทางที่ผู้ใช้เจอจริงแล้วพังเงียบ ๆ:
 *   1. อนุมัติแล้วต้องเกิด `Product` จริงในคลัง พร้อมฟิลด์ครบชุดเหมือนสร้างทางหน้า "สินค้า"
 *      (`reorderPoint`/`avgCost`/`isTool` เคยขาดไป ทำให้สินค้าที่ได้ไม่มีวันขึ้นในตัวเลือกเครื่องมือ)
 *   2. **รหัสถูกเติมกลับเข้าบรรทัดของใบขอซื้อต้นทางให้เอง** แม้ใบนั้นจะอนุมัติแล้ว — ไม่ต้องลบบรรทัด
 *      แล้วเลือกสินค้าใหม่ · เขียนแค่ `productId`/`productCode`/`unit` ของบรรทัดนั้น ไม่แตะอย่างอื่น
 *   3. รหัสซ้ำ → 409 **และคำขอยังเป็น Pending** ให้แก้รหัสแล้วกดใหม่ได้ (ลำดับการเขียนมีผล)
 *   4. รหัสสินค้าเข้ามาได้ทางเดียวคือการอนุมัติ — ส่ง `code` มาตอนสร้างคำขอต้องไม่มีผลอะไรเลย
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;
let categoryId: string;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

type ProductRequestDoc = {
  id: string; name: string; unit: string; status: string;
  assignedProductCode: string; assignedProductId: string; sourcePurchaseRequestId: string;
};
type ProductDoc = {
  id: string; code: string; name: string; unit: string; categoryId: string;
  stockQty: number; reorderPoint?: number; avgCost?: number; isTool?: boolean;
};
type PurchaseRequestDoc = {
  id: string; status: string;
  lines: { id: string; productId: string; productCode: string; description: string; unit: string; qtyRequested: number | null }[];
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Store Admin", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const cat = await api("/api/categories", { method: "POST", body: JSON.stringify({ name: "หมวดใหม่ที่ไม่ใช่หมวดคลัง" }) });
  expect(cat.status).toBe(201);
  categoryId = (await json<{ category: { id: string } }>(cat)).category.id;
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

async function createRequest(body: Record<string, unknown>): Promise<ProductRequestDoc> {
  const res = await api("/api/product-requests", { method: "POST", body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await json<{ productRequest: ProductRequestDoc }>(res)).productRequest;
}

async function productByCode(code: string): Promise<ProductDoc | undefined> {
  const { products } = await json<{ products: ProductDoc[] }>(await api("/api/products"));
  return products.find((p) => p.code === code);
}

describe("คำขอเพิ่มสินค้า — ตั้งรหัสแล้วเกิดสินค้าจริง", () => {
  it("อนุมัติแล้วได้ Product ครบฟิลด์ และคำขอถือรหัสที่ตั้งให้", async () => {
    const req = await createRequest({ name: "กาวอีพ็อกซี่ 2 ส่วน", unit: "ชุด", specifications: "A+B 1 กก.", reason: "งานซ่อมถัง" });
    const approved = await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "pr-new-1", categoryId }),
    });
    expect(approved.status).toBe(200);
    const updated = (await json<{ productRequest: ProductRequestDoc }>(approved)).productRequest;
    expect(updated.status).toBe("Approved");
    expect(updated.assignedProductCode, "รหัสถูกทำเป็นตัวพิมพ์ใหญ่").toBe("PR-NEW-1");

    const product = await productByCode("PR-NEW-1");
    expect(product, "ต้องมีสินค้าจริงในคลัง").toBeTruthy();
    expect(product?.name).toBe("กาวอีพ็อกซี่ 2 ส่วน");
    expect(product?.unit).toBe("ชุด");
    expect(product?.categoryId).toBe(categoryId);
    expect(product?.stockQty, "ยอดเริ่มต้นเป็นศูนย์เสมอ — จำนวนเข้ามาทางหน้าสต๊อกเท่านั้น").toBe(0);
    expect(product?.reorderPoint, "ต้องมีครบเหมือนสร้างทางหน้าสินค้า").toBe(0);
    expect(product?.avgCost).toBe(0);
    expect(product?.isTool).toBe(false);
  });

  it("รหัสซ้ำ → 409 และคำขอยังเป็น Pending ให้แก้รหัสแล้วกดใหม่ได้", async () => {
    const req = await createRequest({ name: "ของซ้ำรหัส", unit: "ชิ้น" });
    const clash = await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "PR-NEW-1", categoryId }),
    });
    expect(clash.status).toBe(409);
    const { productRequest } = await json<{ productRequest: ProductRequestDoc }>(
      await api(`/api/product-requests/${encodeURIComponent(req.id)}`),
    );
    expect(productRequest.status).toBe("Pending");

    const retry = await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "PR-NEW-2", categoryId }),
    });
    expect(retry.status).toBe(200);
  });

  it("ส่ง code มาตอนสร้างคำขอไม่มีผล — รหัสมาจากการอนุมัติเท่านั้น", async () => {
    const req = await createRequest({ name: "ของที่พยายามตั้งรหัสเอง", unit: "ชิ้น", code: "HACKED-1" });
    expect(req.assignedProductCode).toBe("");
    expect(await productByCode("HACKED-1")).toBeUndefined();
  });
});

describe("คำขอจากใบขอซื้อ — เติมรหัสกลับเข้าบรรทัดให้เอง", () => {
  /** ใบขอซื้อเปล่าที่มีบรรทัดพิมพ์เองหนึ่งบรรทัด ในสถานะที่ระบุ */
  async function purchaseRequestWithFreeLine(status: "Draft" | "Final", description: string): Promise<PurchaseRequestDoc> {
    const created = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
    expect(created.status).toBe(201);
    const pr = (await json<{ purchaseRequest: PurchaseRequestDoc }>(created)).purchaseRequest;
    const patched = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        lines: [{ id: "free1", productId: null, productCode: "", description, subDetails: [], unit: "", qtyRequested: 3, remark: "" }],
      }),
    });
    expect(patched.status).toBe(200);
    if (status === "Final") {
      expect((await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/submit-approval`, { method: "POST" })).status).toBe(200);
      expect((await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/approve`, { method: "POST" })).status).toBe(200);
    }
    return (await json<{ purchaseRequest: PurchaseRequestDoc }>(
      await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`),
    )).purchaseRequest;
  }

  it("ใบที่อนุมัติแล้วก็ถูกเติมรหัสให้ — ไม่ต้องลบบรรทัดแล้วเลือกใหม่", async () => {
    const pr = await purchaseRequestWithFreeLine("Final", "ปั๊มลมพิเศษ");
    const req = await createRequest({
      name: "ปั๊มลมพิเศษ", unit: "ตัว", reason: `ใช้กับใบขอซื้อ ${pr.id}`, sourcePurchaseRequestId: pr.id,
    });
    expect((await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "BACKFILL-1", categoryId }),
    })).status).toBe(200);

    const after = (await json<{ purchaseRequest: PurchaseRequestDoc }>(
      await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`),
    )).purchaseRequest;
    const line = after.lines.find((l) => l.id === "free1");
    expect(line?.productCode).toBe("BACKFILL-1");
    expect(line?.productId).not.toBe("");
    expect(line?.unit, "หน่วยที่ว่างอยู่ถูกเติมจากคำขอ").toBe("ตัว");
    expect(line?.qtyRequested, "จำนวนที่ผู้ขอกรอกไว้ต้องไม่ถูกแตะ").toBe(3);
    expect(after.status, "ใบยังเป็นใบที่อนุมัติแล้ว ไม่ถูกตีกลับเป็นร่าง").toBe("Final");
  });

  it("เลือกบรรทัดที่ชื่อตรงกับคำขอ ไม่ใช่บรรทัดแรกมั่ว ๆ", async () => {
    const created = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
    const pr = (await json<{ purchaseRequest: PurchaseRequestDoc }>(created)).purchaseRequest;
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        lines: [
          { id: "a", productId: null, productCode: "", description: "ของอื่น", subDetails: [], unit: "", qtyRequested: 1, remark: "" },
          { id: "b", productId: null, productCode: "", description: "ตัวที่ขอรหัส", subDetails: [], unit: "", qtyRequested: 2, remark: "" },
        ],
      }),
    });
    const req = await createRequest({ name: "ตัวที่ขอรหัส", unit: "ชิ้น", sourcePurchaseRequestId: pr.id });
    expect((await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "BACKFILL-2", categoryId }),
    })).status).toBe(200);

    const after = (await json<{ purchaseRequest: PurchaseRequestDoc }>(
      await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`),
    )).purchaseRequest;
    expect(after.lines.find((l) => l.id === "a")?.productCode, "บรรทัดที่ไม่เกี่ยวต้องไม่ถูกแตะ").toBe("");
    expect(after.lines.find((l) => l.id === "b")?.productCode).toBe("BACKFILL-2");
  });

  it("คำขอที่ไม่มีใบขอซื้อต้นทาง — อนุมัติได้ปกติ ไม่พังและไม่ไปแก้ใบใคร", async () => {
    const req = await createRequest({ name: "ของที่ไม่ผูกใบ", unit: "ชิ้น" });
    expect((await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "NO-SOURCE-1", categoryId }),
    })).status).toBe(200);
    expect(await productByCode("NO-SOURCE-1")).toBeTruthy();
  });
});

/**
 * **ตั้งหมวดหมู่ใหม่ในจังหวะเดียวกับที่ตั้งรหัส (2026-09-09)** — เจ้าของขอให้ "จัดการหมวดหมู่สินค้าได้ด้วย"
 *
 * ตรึงไว้สามข้อ:
 *   1. ส่ง `newCategoryName` มาแทน `categoryId` แล้วต้องได้หมวดจริงและสินค้าลงหมวดนั้น
 *   2. ชื่อที่มีอยู่แล้ว **ไม่สร้างซ้ำ** และไม่สนตัวพิมพ์ — ไม่งั้นช่องเลือกหมวดจะมีชื่อซ้ำกันเต็มไปหมด
 *   3. ไม่ส่งอะไรมาสักอย่างต้องได้ 400 เหมือนเดิม (ยังบังคับให้เลือกหมวด)
 */
describe("คำขอเพิ่มสินค้า — ตั้งหมวดหมู่ใหม่ตอนอนุมัติ", () => {
  async function categoriesNamed(name: string): Promise<{ id: string; name: string }[]> {
    const { categories } = await json<{ categories: { id: string; name: string }[] }>(await api("/api/categories"));
    return categories.filter((c) => c.name.toLowerCase() === name.toLowerCase());
  }

  it("พิมพ์ชื่อหมวดใหม่แล้วได้หมวดจริง และสินค้าลงหมวดนั้น", async () => {
    const req = await createRequest({ name: "เทปพันเกลียว", unit: "ม้วน" });
    const approved = await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "NEWCAT-1", newCategoryName: "อุปกรณ์ประปา" }),
    });
    expect(approved.status).toBe(200);

    const created = await categoriesNamed("อุปกรณ์ประปา");
    expect(created).toHaveLength(1);
    expect((await productByCode("NEWCAT-1"))?.categoryId).toBe(created[0].id);
  });

  it("ชื่อซ้ำกับหมวดที่มีอยู่ (ไม่สนตัวพิมพ์) ใช้หมวดเดิม ไม่สร้างใหม่", async () => {
    const before = await categoriesNamed("อุปกรณ์ประปา");
    expect(before).toHaveLength(1);

    const req = await createRequest({ name: "ข้อต่อสามทาง", unit: "ตัว" });
    expect((await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "NEWCAT-2", newCategoryName: "  อุปกรณ์ประปา  " }),
    })).status).toBe(200);

    expect(await categoriesNamed("อุปกรณ์ประปา"), "ต้องไม่มีหมวดชื่อซ้ำเกิดขึ้น").toHaveLength(1);
    expect((await productByCode("NEWCAT-2"))?.categoryId).toBe(before[0].id);
  });

  it("ชื่อที่มีอักขระพิเศษของ regex ก็จับซ้ำได้ถูกต้อง", async () => {
    const name = "อื่นๆ (คลัง) [ทดสอบ]";
    const first = await createRequest({ name: "ของทดสอบวงเล็บ", unit: "ชิ้น" });
    expect((await api(`/api/product-requests/${encodeURIComponent(first.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "REGEX-1", newCategoryName: name }),
    })).status).toBe(200);

    const second = await createRequest({ name: "ของทดสอบวงเล็บสอง", unit: "ชิ้น" });
    expect((await api(`/api/product-requests/${encodeURIComponent(second.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "REGEX-2", newCategoryName: name }),
    })).status).toBe(200);

    expect(await categoriesNamed(name)).toHaveLength(1);
  });

  it("ไม่ส่งทั้ง categoryId และ newCategoryName → 400", async () => {
    const req = await createRequest({ name: "ของไม่มีหมวด", unit: "ชิ้น" });
    const res = await api(`/api/product-requests/${encodeURIComponent(req.id)}/approve`, {
      method: "POST", body: JSON.stringify({ code: "NOCAT-1" }),
    });
    expect(res.status).toBe(400);
    expect(await productByCode("NOCAT-1")).toBeUndefined();
  });
});
