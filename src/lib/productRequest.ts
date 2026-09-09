import { apiFetch } from "./apiClient.js";

/**
 * คำขอเพิ่มสินค้า (Product Request) — เพิ่ม 2026-08-27 ตามที่ฝ่ายโครงการขอในการประชุม:
 *
 * > เพิ่มหน้าแผนกอื่นสามารถขอเพิ่มสินค้าได้แต่ไม่สามารถตั้งรหัสได้
 * > เมื่อสโตร์กดอนุมัติให้แจ้งเตือนผู้ขอเพิ่มสินค้าว่าสินค้าได้รับการตั้งรหัสสินค้าแล้ว
 *
 * **หัวใจของฟีเจอร์นี้คือ "ใครตั้งรหัสได้"** — ผู้ขอกรอกได้ทุกช่อง **ยกเว้นรหัสสินค้า** ซึ่งไม่มีอยู่ใน
 * ฟอร์มขอเลย และเซิร์ฟเวอร์ก็ไม่รับค่านั้นจากเส้นทางการสร้างคำขอ รหัสถูกกรอกโดยสโตร์ตอนกดอนุมัติ
 * เท่านั้น (สิทธิ์ `productRequest:review`) แล้วระบบจึงสร้าง `Product` จริงให้
 *
 * ก่อนหน้านี้ระบบ**ไม่มีอะไรใกล้เคียงเลย**: `Product` ไม่มีสถานะ ไม่มี workflow และ `code` เป็นช่องที่
 * ใครก็ตามที่มีสิทธิ์ `products:create` พิมพ์เองได้ ทางออกเดิมของหน้างานคือพิมพ์ชื่อสินค้าลงใบขอซื้อ
 * แบบอิสระ (บรรทัดที่ไม่มี `productId`) ซึ่งไม่เคยกลายเป็นสินค้าในคลังเลย
 */

export type ProductRequestStatus = "Pending" | "Approved" | "Rejected";

export interface ProductRequest {
  id: string;
  /** ชื่อสินค้าที่ขอ — ผู้ขอกรอก */
  name: string;
  unit: string;
  /** หมวดหมู่ที่ผู้ขอเสนอ (อ้าง ProductCategory.id) — สโตร์เปลี่ยนได้ตอนอนุมัติ */
  categoryId: string;
  /** สเปก/รายละเอียดที่ช่วยให้สโตร์ตั้งรหัสได้ถูก */
  specifications: string;
  /** เหตุผลที่ต้องใช้ เช่น ชื่องานหรือเลขที่ใบขอซื้อที่จะเอาไปใช้ */
  reason: string;

  status: ProductRequestStatus;
  /**
   * รหัสสินค้าที่สโตร์ตั้งให้ — **ว่างเสมอจนกว่าจะอนุมัติ** ผู้ขอไม่มีทางเขียนค่านี้ได้
   * เก็บไว้บนคำขอด้วย (ไม่ใช่แค่บน Product) เพื่อให้ผู้ขอเห็นรหัสในหน้าคำขอของตัวเองและในแจ้งเตือน
   */
  assignedProductCode: string;
  /** Product ที่ถูกสร้างขึ้นจริงตอนอนุมัติ */
  assignedProductId: string;
  rejectionComment: string;

  /** ใบขอซื้อต้นทาง ถ้าคำขอนี้เกิดจากบรรทัดที่พิมพ์เองในใบขอซื้อ (ข้อ J5) */
  sourcePurchaseRequestId: string;

  requestedBy: string;
  requestedByName: string;
  requestedByDepartment: string;
  requestedAt: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string;

  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface ProductRequestFieldsInput {
  name: string;
  unit: string;
  categoryId: string;
  specifications: string;
  reason: string;
  sourcePurchaseRequestId?: string;
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchProductRequests(): Promise<ProductRequest[]> {
  const { productRequests } = await apiFetch<{ productRequests: ProductRequest[] }>("/product-requests");
  return productRequests;
}

export async function fetchProductRequest(id: string): Promise<ProductRequest> {
  const { productRequest } = await apiFetch<{ productRequest: ProductRequest }>(`/product-requests/${encodeURIComponent(id)}`);
  return productRequest;
}

/** สร้างคำขอ — สังเกตว่าไม่มีช่องรหัสสินค้าให้ส่งเลย ตามเจตนาของฟีเจอร์ */
export async function createProductRequest(fields: ProductRequestFieldsInput): Promise<ProductRequest> {
  const { productRequest } = await apiFetch<{ productRequest: ProductRequest }>("/product-requests", {
    method: "POST", body: JSON.stringify(fields),
  });
  return productRequest;
}

export async function updateProductRequest(id: string, fields: Partial<ProductRequestFieldsInput>): Promise<ProductRequest> {
  const { productRequest } = await apiFetch<{ productRequest: ProductRequest }>(`/product-requests/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
  return productRequest;
}

/**
 * สโตร์อนุมัติ + ตั้งรหัส — สร้าง `Product` จริงแล้วแจ้งเตือนกลับผู้ขอ
 * รหัสซ้ำจะได้ 409 พร้อมข้อความไทย เหมือนกับการเพิ่มสินค้าตรง ๆ ในหน้าคลังสินค้า
 */
/**
 * สโตร์อนุมัติและตั้งรหัส · ส่ง `newCategoryName` มาแทน `categoryId` ได้ถ้าหมวดที่ต้องใช้ยังไม่มี
 * (2026-09-09) — เซิร์ฟเวอร์สร้างหมวดให้ในจังหวะเดียวกัน และใช้หมวดเดิมถ้าชื่อซ้ำกับที่มีอยู่แล้ว
 */
export async function approveProductRequest(
  id: string, code: string, categoryId: string, newCategoryName?: string,
): Promise<ProductRequest> {
  const { productRequest } = await apiFetch<{ productRequest: ProductRequest }>(`/product-requests/${encodeURIComponent(id)}/approve`, {
    method: "POST", body: JSON.stringify({ code, categoryId, ...(newCategoryName ? { newCategoryName } : {}) }),
  });
  return productRequest;
}

export async function rejectProductRequest(id: string, comment: string): Promise<ProductRequest> {
  const { productRequest } = await apiFetch<{ productRequest: ProductRequest }>(`/product-requests/${encodeURIComponent(id)}/reject`, {
    method: "POST", body: JSON.stringify({ comment }),
  });
  return productRequest;
}

export async function deleteProductRequest(id: string): Promise<void> {
  await apiFetch(`/product-requests/${encodeURIComponent(id)}`, { method: "DELETE" });
}
