import { newId, nowIso } from "./products.js";
import { apiFetch } from "./apiClient.js";

export type NotificationType =
  | "quotation_submitted"
  | "quotation_approved"
  | "quotation_rejected"
  | "quotation_high_value"
  | "quotation_customer_accepted"
  | "quotation_customer_rejected";

export interface Notification {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  description: string;
  module: string;
  relatedQuoteId?: string;
  createdAt: string;
  read: boolean;
}

/** Quote total (THB) above which the CEO/Approver Level 2 is notified directly. */
export const HIGH_VALUE_THRESHOLD = 500000;

export function unreadCountFor(notifications: Notification[], userId: string): number {
  return notifications.filter((n) => n.recipientUserId === userId && !n.read).length;
}

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

export function notifyQuotationSubmitted(recipientUserIds: string[], quoteId: string, client: string, submittedBy: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_submitted",
    title: "ใบเสนอราคารออนุมัติ",
    description: `${submittedBy} ส่งใบเสนอราคา ${quoteId} (${client}) เพื่อขออนุมัติ`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

export function notifyQuotationApproved(recipientUserIds: string[], quoteId: string, client: string, approvedBy: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_approved",
    title: "ใบเสนอราคาได้รับการอนุมัติ",
    description: `${approvedBy} อนุมัติใบเสนอราคา ${quoteId} (${client})`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

export function notifyQuotationRejected(recipientUserIds: string[], quoteId: string, client: string, rejectedBy: string, reason: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_rejected",
    title: "ใบเสนอราคาถูกปฏิเสธ",
    description: `${rejectedBy} ปฏิเสธใบเสนอราคา ${quoteId} (${client})${reason ? ` — เหตุผล: ${reason}` : ""}`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

export function notifyHighValueQuotation(recipientUserIds: string[], quoteId: string, client: string, amount: number): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_high_value",
    title: "ใบเสนอราคามูลค่าสูงรออนุมัติ",
    description: `ใบเสนอราคา ${quoteId} (${client}) มูลค่า ${amount.toLocaleString("th-TH")} บาท ต้องได้รับการอนุมัติ`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

export function notifyQuotationCustomerAccepted(recipientUserIds: string[], quoteId: string, client: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_customer_accepted",
    title: "ลูกค้ายอมรับใบเสนอราคา",
    description: `ลูกค้ายอมรับใบเสนอราคา ${quoteId} (${client})`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

export function notifyQuotationCustomerRejected(recipientUserIds: string[], quoteId: string, client: string, reason: string): Notification[] {
  return buildFor(recipientUserIds, {
    type: "quotation_customer_rejected",
    title: "ลูกค้าปฏิเสธใบเสนอราคา",
    description: `ลูกค้าปฏิเสธใบเสนอราคา ${quoteId} (${client})${reason ? ` — เหตุผล: ${reason}` : ""}`,
    module: "ใบเสนอราคา",
    relatedQuoteId: quoteId,
  });
}

export async function fetchNotifications(): Promise<Notification[]> {
  const { notifications } = await apiFetch<{ notifications: Notification[] }>("/notifications");
  return notifications;
}
export async function markNotificationRead(id: string): Promise<Notification> {
  const { notification } = await apiFetch<{ notification: Notification }>(`/notifications/${id}`, { method: "PATCH" });
  return notification;
}
export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch<void>("/notifications/mark-all-read", { method: "POST" });
}
export async function deleteNotification(id: string): Promise<void> {
  await apiFetch<void>(`/notifications/${id}`, { method: "DELETE" });
}
