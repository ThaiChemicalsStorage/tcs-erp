import { newId, nowIso } from "./products.js";
import { apiFetch } from "./apiClient.js";

export type NotificationType =
  | "quotation_submitted"
  | "quotation_approved"
  | "quotation_rejected"
  | "quotation_high_value"
  | "quotation_customer_accepted"
  | "quotation_customer_rejected"
  | "quotation_won"
  | "quotation_lost"
  | "quotation_cancelled"
  | "scope_of_work_document_sent"
  | "scope_of_work_po_chase"
  | "scope_of_work_submitted"
  | "scope_of_work_approved"
  | "scope_of_work_rejected"
  | "delivery_order_sent_to_department"
  | "delivery_order_submitted"
  | "delivery_order_approved"
  | "delivery_order_rejected"
  | "service_report_created"
  | "service_report_completed"
  | "service_report_customer_approved"
  | "service_report_customer_rejected"
  // ── ส่งต่อหลังอนุมัติ (2026-08-27) — ก่อนหน้านี้เอกสารกลุ่มโครงการ/ผลิตไม่มีการแจ้งเตือนเลยแม้แต่ตัวเดียว
  //    ตัวช่วยอนุมัติร่วม (api/_lib/documentApproval.ts) เขียนแค่ audit log เท่านั้น
  | "material_requisition_approved"
  | "purchase_request_approved"
  /** ฝ่ายจัดซื้อแก้ใบขอซื้อที่อนุมัติแล้ว (2026-09-09) — แจ้งผู้สร้างใบ เพราะเนื้อหาใบที่เขาเซ็นไปแล้วเปลี่ยน */
  | "purchase_request_edited"
  /** ฝ่ายจัดซื้ออนุมัติใบขอซื้อ (2026-09-21) — ขั้นสุดท้ายก่อนเปิดใบสั่งซื้อ แจ้งผู้สร้างใบว่าเดินต่อแล้ว */
  | "purchase_request_purchasing_approved"
  // ── ทะเบียนผู้ขายต้องผ่านบัญชี (2026-09-21) — คำสั่งเจ้าของข้อ 5 ──
  | "vendor_submitted"
  | "vendor_approved"
  | "vendor_rejected"
  // ── รออนุมัติ (2026-08-31) — เจ้าของขอไว้ 2026-08-28: "ทำแจ้งเตือนให้ด้วยถ้ามีคนกดขอส่งอนุมัติ
  //    ให้แจ้งเตือนคนที่มีสิทธิ์อนุมัติ" · เอกสาร 6 ใบบนเครื่องอนุมัติร่วมเคยเขียนแค่ audit log
  | "material_requisition_submitted"
  | "purchase_request_submitted"
  | "job_order_submitted"
  | "production_order_submitted"
  | "purchase_order_submitted"
  | "cost_control_submitted"
  // ── คำขอเพิ่มสินค้า (2026-08-27) ──
  | "product_request_submitted"
  | "product_request_approved"
  | "product_request_rejected"
  // ── สต๊อกใกล้หมด (2026-09-02) — เจ้าของสั่ง "เวลาของใกล้หมดให้แจ้งเตือน"
  //    ยิงจาก applyStockMovement() ทางเดียว จึงครอบคลุมทั้งการตัดของอัตโนมัติและการปรับสต๊อกด้วยมือ
  | "stock_low";

export interface Notification {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  description: string;
  module: string;
  relatedQuoteId?: string;
  relatedScopeId?: string;
  relatedScopeNumber?: string;
  relatedDeliveryOrderId?: string;
  relatedServiceReportId?: string;
  /**
   * deep-link ของเอกสารกลุ่มโครงการ/ผลิต และคำขอเพิ่มสินค้า (2026-08-27) — ถ้าไม่มีฟิลด์พวกนี้
   * กระดิ่งจะได้แจ้งเตือนที่กดแล้วไม่ไปไหน ซึ่ง deliveryOrderHandler.ts เตือนไว้ตรง ๆ ว่าเคยเจอมาแล้ว
   */
  relatedMaterialRequisitionId?: string;
  relatedPurchaseRequestId?: string;
  relatedProductRequestId?: string;
  /**
   * deep-link ของอีก 4 ใบบนเครื่องอนุมัติร่วม (2026-08-31) — เพิ่มพร้อมแจ้งเตือน "รออนุมัติ"
   * ไม่มีฟิลด์พวกนี้ = กดแจ้งเตือนแล้วไปไหนไม่ได้ ซึ่งเป็นสิ่งที่ TODO เตือนไว้ก่อนเริ่มทำ
   */
  relatedJobOrderId?: string;
  relatedProductionOrderId?: string;
  relatedPurchaseOrderId?: string;
  relatedCostControlId?: string;
  createdAt: string;
  read: boolean;
}

export const HIGH_VALUE_THRESHOLD = 500000;

// นับจำนวนการแจ้งเตือนที่ยังไม่ได้อ่านของผู้ใช้ที่กำหนด
// Counts unread notifications for the given user
export function unreadCountFor(notifications: Notification[], userId: string): number {
  return notifications.filter((n) => n.recipientUserId === userId && !n.read).length;
}

// สร้างรายการแจ้งเตือนให้ผู้รับหลายคนจากข้อมูลที่กำหนด (ตัด id ซ้ำออก)
// Builds notification objects for multiple recipients from the given fields (deduped)
function buildFor(recipientUserIds: string[], fields: Omit<Notification, "id" | "recipientUserId" | "createdAt" | "read">): Notification[] {
  const createdAt = nowIso();
  const uniqueRecipients = [...new Set(recipientUserIds)];
  return uniqueRecipients.map((recipientUserId) => ({
    ...fields,
    id: newId("notif"),
    recipientUserId,
    createdAt,
    read: false,
  }));
}

// สร้างการแจ้งเตือนเมื่อมีการส่งใบเสนอราคาขออนุมัติ
// Creates a notification for when a quotation is submitted for approval
export function notifyQuotationSubmitted(recipientUserIds: string[], quoteId: string, client: string, submittedBy: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_submitted",
    title: "ใบเสนอราคารออนุมัติ",
    description: `${submittedBy} ส่งใบเสนอราคา ${quoteId} (${client}) เพื่อขออนุมัติ`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

// สร้างการแจ้งเตือนเมื่อใบเสนอราคาได้รับการอนุมัติ
// Creates a notification for when a quotation is approved
export function notifyQuotationApproved(recipientUserIds: string[], quoteId: string, client: string, approvedBy: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_approved",
    title: "ใบเสนอราคาได้รับการอนุมัติ",
    description: `${approvedBy} อนุมัติใบเสนอราคา ${quoteId} (${client})`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

// สร้างการแจ้งเตือนเมื่อใบเสนอราคาถูกปฏิเสธ
// Creates a notification for when a quotation is rejected
export function notifyQuotationRejected(recipientUserIds: string[], quoteId: string, client: string, rejectedBy: string, reason: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_rejected",
    title: "ใบเสนอราคาถูกปฏิเสธ",
    description: `${rejectedBy} ปฏิเสธใบเสนอราคา ${quoteId} (${client})${reason ? ` — เหตุผล: ${reason}` : ""}`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

// สร้างการแจ้งเตือนเมื่อใบเสนอราคามูลค่าสูงรออนุมัติ
// Creates a notification for a high-value quotation awaiting approval
export function notifyHighValueQuotation(recipientUserIds: string[], quoteId: string, client: string, amount: number): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_high_value",
    title: "ใบเสนอราคามูลค่าสูงรออนุมัติ",
    description: `ใบเสนอราคา ${quoteId} (${client}) มูลค่า ${amount.toLocaleString("th-TH")} บาท ต้องได้รับการอนุมัติ`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

// สร้างการแจ้งเตือนเมื่อลูกค้ายอมรับใบเสนอราคา
// Creates a notification for when the customer accepts the quotation
export function notifyQuotationCustomerAccepted(recipientUserIds: string[], quoteId: string, client: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_customer_accepted",
    title: "ลูกค้ายอมรับใบเสนอราคา",
    description: `ลูกค้ายอมรับใบเสนอราคา ${quoteId} (${client})`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

// สร้างการแจ้งเตือนเมื่อลูกค้าปฏิเสธใบเสนอราคา
// Creates a notification for when the customer rejects the quotation
export function notifyQuotationCustomerRejected(recipientUserIds: string[], quoteId: string, client: string, reason: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_customer_rejected",
    title: "ลูกค้าปฏิเสธใบเสนอราคา",
    description: `ลูกค้าปฏิเสธใบเสนอราคา ${quoteId} (${client})${reason ? ` — เหตุผล: ${reason}` : ""}`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

// สร้างการแจ้งเตือนในแอปเมื่อมีการส่งเอกสาร Scope of Work ให้ผู้รับ
// Creates an in-app notification for when a Scope of Work document is sent to recipients
export function notifyScopeOfWorkDocumentSent(recipientUserIds: string[], scopeId: string, scopeNumber: string, customerName: string, sentBy: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "scope_of_work_document_sent",
    title: "มีเอกสาร Scope of Work ส่งถึงคุณ",
    description: `${sentBy} ส่งเอกสาร Scope of Work ${scopeNumber} (${customerName}) ถึงคุณ`,
    module: "Scope of Work",
    relatedScopeId: scopeId,
    relatedScopeNumber: scopeNumber,
  });
}

// ดึงรายการแจ้งเตือนของผู้ใช้ปัจจุบันจากเซิร์ฟเวอร์
// Fetches the current user's notifications from the server
export async function fetchNotifications(): Promise<Notification[]> {
  const { notifications } = await apiFetch<{ notifications: Notification[] }>("/notifications");
  return notifications;
}
// ทำเครื่องหมายว่าอ่านการแจ้งเตือนรายการนี้แล้ว
// Marks a single notification as read
export async function markNotificationRead(id: string): Promise<Notification> {
  const { notification } = await apiFetch<{ notification: Notification }>(`/notifications/${encodeURIComponent(id)}`, { method: "PATCH" });
  return notification;
}
// ทำเครื่องหมายว่าอ่านการแจ้งเตือนทั้งหมดแล้ว
// Marks all notifications as read
export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch<void>("/notifications/mark-all-read", { method: "POST" });
}
// ลบการแจ้งเตือนตาม id
// Deletes a notification identified by id
export async function deleteNotification(id: string): Promise<void> {
  await apiFetch<void>(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
}
