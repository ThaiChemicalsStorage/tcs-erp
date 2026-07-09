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
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

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

export async function fetchProducts(): Promise<Product[]> {
  const { products } = await apiFetch<{ products: Product[] }>("/products");
  return products;
}
export async function createProduct(fields: ProductFields): Promise<Product> {
  const { product } = await apiFetch<{ product: Product }>("/products", { method: "POST", body: JSON.stringify(fields) });
  return product;
}
export async function updateProduct(id: string, fields: Partial<ProductFields & { archived: boolean }>): Promise<Product> {
  const { product } = await apiFetch<{ product: Product }>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return product;
}
export async function deleteProduct(id: string): Promise<void> {
  await apiFetch<void>(`/products/${id}`, { method: "DELETE" });
}

export async function fetchCategories(): Promise<ProductCategory[]> {
  const { categories } = await apiFetch<{ categories: ProductCategory[] }>("/categories");
  return categories;
}
export async function createCategory(name: string): Promise<ProductCategory> {
  const { category } = await apiFetch<{ category: ProductCategory }>("/categories", { method: "POST", body: JSON.stringify({ name }) });
  return category;
}
export async function updateCategory(id: string, fields: { name?: string; archived?: boolean }): Promise<ProductCategory> {
  const { category } = await apiFetch<{ category: ProductCategory }>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return category;
}
