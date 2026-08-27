import { apiFetch, writeQuery, type WriteOptions } from "./apiClient.js";

export type DeliveryOrderStatus = "Draft" | "PendingApproval" | "Final";

export interface DeliveryOrderItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string;
  specifications: { id: string; text: string }[];
}

export interface DeliveryOrderInstallment {
  id: string;
  pct: number | null;
  label: string;
  paymentType: "" | "Cash" | "Credit";
  days: number | null;
  itemIds: string[];
  documentNumber: string;
  issueDate: string;
  remark: string;
}

export interface DeliveryOrder {
  id: string;
  scopeOfWorkId: string;
  scopeNumber: string;
  quotationId: string;
  customerCompanyName: string;
  customerAddress: string;
  items: DeliveryOrderItem[];
  installments: DeliveryOrderInstallment[];
  status: DeliveryOrderStatus;
  /**
   * แผนกที่เซลล์ติ๊กส่งเอกสารนี้ไปให้ (2026-08-20) — เก็บเป็น **id** ของ Department ไม่ใช่ชื่อ
   * เพราะแอดมินเปลี่ยนชื่อแผนกในหน้า "แผนกและทีม" ได้ตลอด ถ้าเก็บชื่อไว้ เอกสารเก่าจะหลุดทันทีที่
   * เปลี่ยนชื่อ ฝั่งเซิร์ฟเวอร์แปลง id เป็นชื่อ ณ เวลาที่ query แล้วค่อยจับคู่กับ `User.department`
   * (ซึ่งเก็บเป็นชื่อ — ดู docs/MODULES/DeliveryOrder.md "Department Routing")
   *
   * เป็น optional เพราะเอกสารที่สร้างก่อนฟีเจอร์นี้ไม่มีฟิลด์นี้ใน MongoDB เลย
   */
  sentToDepartmentIds?: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  isDeleted: boolean;
}

export interface DeliveryOrderSummary {
  id: string;
  scopeOfWorkId: string;
  status: DeliveryOrderStatus;
  updatedAt: string;
}

export interface DeliveryOrderListItem {
  id: string;
  scopeOfWorkId: string;
  scopeNumber: string;
  customerCompanyName: string;
  installmentCount: number;
  status: DeliveryOrderStatus;
  updatedAt: string;
}

export type DeliveryOrderUpdateFields = Partial<{
  installments: DeliveryOrderInstallment[];
}>;

export async function fetchDeliveryOrdersByScope(scopeOfWorkId: string): Promise<DeliveryOrderSummary[]> {
  const { deliveryOrders } = await apiFetch<{ deliveryOrders: DeliveryOrderSummary[] }>(`/delivery-orders?scopeOfWorkId=${encodeURIComponent(scopeOfWorkId)}`);
  return deliveryOrders;
}
// ดึงรายการใบส่งมอบสินค้าทั้งหมดในระบบ (ไม่กรองตาม Scope of Work) สำหรับหน้ารายการแบบแยกต่างหาก
// Fetches every Delivery Order company-wide, for the standalone management page's list
export async function fetchAllDeliveryOrders(): Promise<DeliveryOrderListItem[]> {
  const { deliveryOrders } = await apiFetch<{ deliveryOrders: DeliveryOrderListItem[] }>("/delivery-orders");
  return deliveryOrders;
}
export async function fetchDeliveryOrder(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}`);
  return deliveryOrder;
}
export async function createDeliveryOrderFromScope(scopeOfWorkId: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>("/delivery-orders", {
    method: "POST",
    body: JSON.stringify({ scopeOfWorkId }),
  });
  return deliveryOrder;
}
export async function updateDeliveryOrder(id: string, fields: DeliveryOrderUpdateFields, options?: WriteOptions): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}${writeQuery(options)}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  return deliveryOrder;
}
/**
 * ส่งเอกสารนี้ให้แผนกที่เกี่ยวข้อง (2026-08-20) — ทุกคนที่ถูกตั้งแผนกไว้ตรงกับแผนกที่ติ๊ก จะเห็นเอกสารนี้
 * ในหน้ารายการของตัวเอง (ดู/พิมพ์อย่างเดียว แก้ไม่ได้) และได้แจ้งเตือนที่กระดิ่ง
 *
 * แยกจาก PATCH ปกติเพราะ **ไม่ติดล็อก Final** — เซลล์มักส่งเอกสารต่อหลังอนุมัติแล้ว และการส่งต่อ
 * ไม่ได้แก้เนื้อหาเอกสารเลย (แนวเดียวกับ PO chasing ของ Scope of Work ที่ยกเว้นล็อก Final เหมือนกัน)
 */
export async function sendDeliveryOrderToDepartments(
  id: string, departmentIds: string[],
): Promise<{ deliveryOrder: DeliveryOrder; recipientCount: number }> {
  return apiFetch<{ deliveryOrder: DeliveryOrder; recipientCount: number }>(
    `/delivery-orders/${encodeURIComponent(id)}/send-to-departments`,
    { method: "POST", body: JSON.stringify({ departmentIds }) },
  );
}
// อนุมัติใบส่งมอบสินค้า (เปลี่ยนสถานะจาก PendingApproval เป็น Final)
// Approves a Delivery Order (PendingApproval -> Final)
/**
 * เลขที่/วันที่ของแต่ละงวด — route แยกที่ไม่ติดล็อค Final ต่างจาก `updateDeliveryOrder()` ที่แก้ได้เฉพาะฉบับร่าง
 * ฝ่ายโครงการขอไว้เมื่อ 2026-08-27 — ดู handleInstallmentNumbers() ใน api/_lib/deliveryOrderHandler.ts
 */
export async function updateDeliveryOrderInstallmentNumbers(
  id: string,
  installments: { id: string; documentNumber: string; issueDate: string }[],
): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}/installment-numbers`, {
    method: "POST", body: JSON.stringify({ installments }),
  });
  return deliveryOrder;
}

export async function finalizeDeliveryOrder(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}/finalize`, { method: "POST" });
  return deliveryOrder;
}
// ส่งขออนุมัติใบส่งมอบสินค้า (เปลี่ยนสถานะจาก Draft เป็น PendingApproval)
// Submits a Delivery Order for approval (Draft -> PendingApproval)
export async function submitDeliveryOrderApproval(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  return deliveryOrder;
}
// ปฏิเสธ/ตีกลับใบส่งมอบสินค้า กลับไปเป็นฉบับร่าง พร้อมเหตุผล
// Rejects a Delivery Order back to Draft, with a required comment
export async function rejectDeliveryOrder(id: string, comment: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: JSON.stringify({ comment }),
  });
  return deliveryOrder;
}
// ถอนคำขออนุมัติ กลับไปเป็นฉบับร่าง
// Withdraws a pending approval request back to Draft
export async function withdrawDeliveryOrderApproval(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}/withdraw-approval`, { method: "POST" });
  return deliveryOrder;
}
// สร้างฉบับร่างใหม่จากใบส่งมอบสินค้าที่อนุมัติแล้ว เพื่อแก้ไขได้โดยไม่ต้องปลดล็อกฉบับเดิม
// Creates a fresh Draft copy of a Final Delivery Order so it can be corrected without unlocking it
export async function rewriteDeliveryOrder(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}/rewrite`, { method: "POST" });
  return deliveryOrder;
}
export async function refreshDeliveryOrderFromScope(id: string): Promise<DeliveryOrder> {
  const { deliveryOrder } = await apiFetch<{ deliveryOrder: DeliveryOrder }>(`/delivery-orders/${encodeURIComponent(id)}/refresh`, { method: "POST" });
  return deliveryOrder;
}
export async function deleteDeliveryOrder(id: string): Promise<void> {
  await apiFetch<void>(`/delivery-orders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// สร้างข้อความ "Remark" เริ่มต้นสำหรับงวดชำระเงิน จากเปอร์เซ็นต์/ชื่องวด/วิธีชำระ/จำนวนวัน
// Builds the default "Remark" footer text for an installment from its pct/label/payment method/days
export function draftInstallmentRemark(installment: Pick<DeliveryOrderInstallment, "pct" | "label" | "paymentType" | "days">): string {
  const pctPart = installment.pct !== null ? `${installment.pct}% ` : "";
  const methodPart = installment.paymentType
    ? ` (${installment.paymentType}${installment.days !== null ? ` ${installment.days} Days` : ""})`
    : "";
  return `${pctPart}${installment.label}${methodPart}`.trim();
}
