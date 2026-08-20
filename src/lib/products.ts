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
export async function updateProduct(id: string, fields: Partial<ProductFields & { archived: boolean }>): Promise<Product> {
  const { product } = await apiFetch<{ product: Product }>(`/products/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return product;
}
// ลบสินค้าตาม id
// Deletes a product identified by id
export async function deleteProduct(id: string): Promise<void> {
  await apiFetch<void>(`/products/${encodeURIComponent(id)}`, { method: "DELETE" });
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
