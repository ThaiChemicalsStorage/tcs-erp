import { apiFetch } from "./apiClient.js";
import { newId } from "./products.js";
import type { Product } from "./products.js";
import type { MaterialRequisitionCategory, MaterialRequisitionLine } from "./materialRequisition.js";
import { resolveMaterialCategoryKey } from "./materialRequisition.js";

/**
 * เทมเพลตใบเบิกและใบคืนวัสดุ — เจ้าของสั่ง 2026-09-02:
 * *"เทมเพลตใบเบิกและคืนวัสดุ สร้างหน้าเพิ่มขึ้นมาเป็นเป็นหน้าเทมเพลต"*
 *
 * งานเบิกของซ้ำ ๆ กันเกือบทุกครั้ง (ชุดเคมี ชุดน็อต ชุดวัสดุสิ้นเปลืองประจำงานสี) การพิมพ์เลือกสินค้า
 * ทีละตัวใหม่ทุกใบจึงเป็นงานซ้ำที่ผิดพลาดง่าย เทมเพลตคือ "ชุดรายการที่ตั้งชื่อไว้" กดครั้งเดียวแล้ว
 * รายการทั้งชุดไหลลงใบเบิกพร้อมจำนวนตั้งต้น
 *
 * **จงใจไม่ทำเป็นโมดูลใหญ่แบบเทมเพลตใบเสนอราคา** — ตัวนั้นมีสิทธิ์ของตัวเองแปดตัว มีการนำเข้าจาก
 * Excel มีสถานะ active/archive ที่นี่ขอแค่ตั้งชื่อชุดรายการแล้วเรียกใช้ ถ้าวันหนึ่งต้องการมากกว่านี้
 * ค่อยขยาย · **ไม่มีสิทธิ์ใหม่** ใช้ `materialRequisition:create` สำหรับดู/ใช้ และ
 * `materialRequisition:edit` สำหรับแก้ทะเบียน — เพราะสิทธิ์ใหม่ต้องมี RBAC migration ไปแจกให้บทบาท
 * บนเครื่องจริง ซึ่งเป็นกับดักที่โมดูลก่อน ๆ ในระบบนี้เคยตกไปแล้วสองรอบ (เมนูขึ้นแต่ไม่มีใครเห็น)
 */

export interface MaterialRequisitionTemplateLine {
  id: string;
  /** -> Product.id · เก็บ snapshot ชื่อ/รหัส/หน่วยไว้ด้วย เหมือนรายการในใบเบิกจริง */
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  category: MaterialRequisitionCategory;
  /** จำนวนตั้งต้นที่จะเติมลงช่อง "เบิกของ" ตอนใช้เทมเพลต — ว่างได้ */
  plannedQty: number | null;
}

export interface MaterialRequisitionTemplate {
  id: string;
  name: string;
  description: string;
  lines: MaterialRequisitionTemplateLine[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export const MAX_TEMPLATE_LINES = 100;

/** สร้างบรรทัดเทมเพลตจากสินค้าที่เลือกในแคตตาล็อก — คู่กับ `blankMaterialRequisitionLine()` */
export function blankTemplateLine(product: Product, categoryName: string): MaterialRequisitionTemplateLine {
  return {
    id: newId("mrtline"),
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    unit: product.unit,
    category: resolveMaterialCategoryKey(categoryName),
    plannedQty: null,
  };
}

/**
 * แปลงรายการในเทมเพลตเป็นรายการของใบเบิกจริง — `id` ถูกสร้างใหม่ทุกบรรทัดโดยตั้งใจ ไม่งั้นการใช้
 * เทมเพลตเดียวกันสองครั้งในใบเดียวจะได้ `key` ซ้ำ และ React จะจับคู่แถวผิดตอนแก้จำนวน
 */
export function templateLinesToRequisitionLines(lines: MaterialRequisitionTemplateLine[]): MaterialRequisitionLine[] {
  return lines.map((l) => ({
    id: newId("mrline"),
    productId: l.productId,
    productCode: l.productCode,
    productName: l.productName,
    unit: l.unit,
    category: l.category,
    plannedQty: l.plannedQty,
    withdrawal1Qty: null,
    withdrawal2Qty: null,
    returnQty: null,
    actualUsedQty: null,
  }));
}

export async function fetchMaterialRequisitionTemplates(): Promise<MaterialRequisitionTemplate[]> {
  const { templates } = await apiFetch<{ templates: MaterialRequisitionTemplate[] }>("/material-requisition-templates");
  return templates;
}

export async function createMaterialRequisitionTemplate(
  fields: { name: string; description: string; lines: MaterialRequisitionTemplateLine[] },
): Promise<MaterialRequisitionTemplate> {
  const { template } = await apiFetch<{ template: MaterialRequisitionTemplate }>("/material-requisition-templates", {
    method: "POST", body: JSON.stringify(fields),
  });
  return template;
}

export async function updateMaterialRequisitionTemplate(
  id: string,
  fields: Partial<{ name: string; description: string; lines: MaterialRequisitionTemplateLine[] }>,
): Promise<MaterialRequisitionTemplate> {
  const { template } = await apiFetch<{ template: MaterialRequisitionTemplate }>(`/material-requisition-templates/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify(fields),
  });
  return template;
}

export async function deleteMaterialRequisitionTemplate(id: string): Promise<void> {
  await apiFetch<{ ok: true }>(`/material-requisition-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
}
