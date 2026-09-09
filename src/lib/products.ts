import { apiFetch } from "./apiClient.js";

export interface ProductCategory {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
  archived: boolean;
  /** Current on-hand quantity (added 2026-08-18 for the Stock module) — never set directly via
   * create/edit; only `POST /api/stock-movements` (src/lib/stock.ts) or an AR/IV stock deduction
   * may change it, so every change is traceable through a StockMovement row. Defaults to 0 on
   * create — see docs/MODULES/Product.md "Stock". */
  stockQty: number;
  /**
   * จุดเตือนของใกล้หมด (2026-09-02) — เจ้าของสั่งว่า *"เวลาของใกล้หมดให้แจ้งเตือน"*
   *
   * ทุกครั้งที่ยอดคงเหลือถูกตัดลงมาถึงหรือต่ำกว่าค่านี้ ระบบจะแจ้งเตือนฝ่ายคลังสินค้า
   * **0 หรือไม่มีค่า = ปิดการเตือนของสินค้าตัวนั้น** ไม่ใช่ "เตือนตลอดเวลา" — ไม่งั้นสินค้าทุกตัว
   * ที่ยังไม่เคยตั้งค่าจะยิงแจ้งเตือนพร้อมกันหมดในวันแรกที่เปิดใช้ จนไม่มีใครอ่านกระดิ่งอีกเลย
   *
   * optional เพราะสินค้าที่สร้างก่อนวันนี้ไม่มีฟิลด์นี้ — อ่านออกมาเป็น 0 ตอนใช้งาน ไม่ได้ทำ migration
   */
  reorderPoint?: number;
  /**
   * ต้นทุนถัวเฉลี่ยเคลื่อนที่ต่อหน่วย (2026-09-03) — server-set-only เหมือน `stockQty`: เปลี่ยนได้ทาง
   * `applyStockMovement()` เท่านั้น ทุกครั้งที่รับของเข้าพร้อมต้นทุน (ใบรับสินค้า / รับเข้าด้วยมือที่กรอก
   * ต้นทุน) ค่าจะถูกถัวใหม่ · **มูลค่าสต๊อก = stockQty × avgCost** คำนวณตอนอ่าน ไม่เก็บ
   * ไม่ใช่ `defaultPrice` ซึ่งเป็นราคาขาย · optional เพราะสินค้าเก่าไม่มีฟิลด์นี้ อ่านเป็น 0
   */
  avgCost?: number;
  /**
   * **ราคาซื้อล่าสุดต่อหน่วย** (2026-09-09) — ต้นทุนของการ "รับเข้าพร้อมราคา" ครั้งล่าสุด (ใบรับสินค้า
   * หรือรับเข้าด้วยมือที่กรอกต้นทุน) พร้อมวันที่ของครั้งนั้น
   *
   * เจ้าของเลือกให้**การรับของคืนเข้าคลังลงบัญชีด้วยราคานี้** ไม่ใช่ราคาถัวเฉลี่ย และให้โชว์บนหน้าจอ
   * ตอนกรอกจำนวนคืน · **มูลค่าสต๊อกรวมยังเป็น `stockQty × avgCost` ตามเดิม** ราคานี้มีผลกับมูลค่าของ
   * แถวในบัญชีเดินสะพัด/การ์ดสต๊อก และการแสดงผลเท่านั้น ไม่ได้เปลี่ยนวิธีคิดต้นทุนของคลัง
   *
   * server-set-only เหมือน `stockQty`/`avgCost` — เปลี่ยนได้ทาง `applyStockMovement()` เท่านั้น
   * optional เพราะสินค้าเก่าไม่มีฟิลด์นี้ อ่านเป็น 0/"" ไม่ได้ทำ migration
   */
  lastCost?: number;
  lastCostAt?: string;
  /**
   * "เครื่องมือ — ต้องคืน" (2026-09-03) — เจ้าของสั่ง *"เพิ่มหน้าคุมเครื่องมือ ว่าทีมนี้มีเครื่องมืออะไร
   * ในครอบครอง"* สินค้าที่ติ๊กไว้จะถูกนับในทะเบียนเครื่องมือประจำทีม (เบิกแล้วยังไม่คืน = ถืออยู่)
   * วัสดุสิ้นเปลืองไม่ติ๊ก เพราะเบิกไปแล้วใช้หมด ไม่ใช่ของที่ทีม "ถือ"
   */
  isTool?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// สร้างรหัส id ที่ไม่ซ้ำกันโดยมี prefix นำหน้า
// Generates a unique id string prefixed with the given prefix
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// คืนค่าวันเวลาปัจจุบันในรูปแบบ ISO string
// Returns the current timestamp as an ISO string
export function nowIso(): string {
  return new Date().toISOString();
}

export interface ProductFields {
  code: string;
  name: string;
  categoryId: string;
  unit?: string;
  defaultPrice?: number;
  description?: string;
  specifications?: string;
  /** "เครื่องมือ — ต้องคืน" ดู `Product.isTool` */
  isTool?: boolean;
}

// ดึงรายการสินค้าทั้งหมดจากเซิร์ฟเวอร์
// Fetches all products from the server
export async function fetchProducts(): Promise<Product[]> {
  const { products } = await apiFetch<{ products: Product[] }>("/products");
  return products;
}
// สร้างสินค้าใหม่ด้วยข้อมูลที่กำหนด
// Creates a new product with the given fields
export async function createProduct(fields: ProductFields): Promise<Product> {
  const { product } = await apiFetch<{ product: Product }>("/products", { method: "POST", body: JSON.stringify(fields) });
  return product;
}
// แก้ไขข้อมูลสินค้าที่มีอยู่ตาม id
// Updates an existing product identified by id
/** `reorderPoint` แก้ได้จากหน้าสต๊อก ไม่ใช่หน้าคลังสินค้า จึงไม่ได้อยู่ใน `ProductFields` */
export async function updateProduct(id: string, fields: Partial<ProductFields & { archived: boolean; reorderPoint: number }>): Promise<Product> {
  const { product } = await apiFetch<{ product: Product }>(`/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return product;
}
// ลบสินค้าตาม id
// Deletes a product identified by id
export async function deleteProduct(id: string): Promise<void> {
  await apiFetch<void>(`/products/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** หนึ่งแถวที่ส่งไปนำเข้า — `categoryName` เป็น *ชื่อ* ไม่ใช่ id เพราะไฟล์ Excel ไม่มีทางรู้ id */
export interface ProductImportPayloadRow {
  code: string;
  name: string;
  categoryName?: string;
  unit?: string;
  defaultPrice?: number;
  description?: string;
  specifications?: string;
  isTool?: boolean;
  reorderPoint?: number;
}

export interface ProductImportResult {
  created: number;
  /** รหัสที่มีอยู่แล้ว — นำเข้าไม่ทับของเดิม */
  skipped: number;
  /** ชื่อหมวดหมู่ที่ถูกสร้างใหม่ระหว่างนำเข้า */
  categoriesCreated: string[];
}

// นำเข้าสินค้าหลายรายการพร้อมกันจากไฟล์ Excel (2026-09-04)
// Bulk-creates products from a spreadsheet import; existing codes are skipped, never overwritten.
export async function importProducts(rows: ProductImportPayloadRow[]): Promise<ProductImportResult> {
  return apiFetch<ProductImportResult>("/products/import", { method: "POST", body: JSON.stringify({ products: rows }) });
}

// ดึงรายการหมวดหมู่สินค้าทั้งหมดจากเซิร์ฟเวอร์
// Fetches all product categories from the server
export async function fetchCategories(): Promise<ProductCategory[]> {
  const { categories } = await apiFetch<{ categories: ProductCategory[] }>("/categories");
  return categories;
}
// สร้างหมวดหมู่สินค้าใหม่ด้วยชื่อที่กำหนด
// Creates a new product category with the given name
export async function createCategory(name: string): Promise<ProductCategory> {
  const { category } = await apiFetch<{ category: ProductCategory }>("/categories", { method: "POST", body: JSON.stringify({ name }) });
  return category;
}
// แก้ไขข้อมูลหมวดหมู่สินค้าที่มีอยู่ตาม id
// Updates an existing product category identified by id
export async function updateCategory(id: string, fields: { name?: string; archived?: boolean }): Promise<ProductCategory> {
  const { category } = await apiFetch<{ category: ProductCategory }>(`/categories/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return category;
}
