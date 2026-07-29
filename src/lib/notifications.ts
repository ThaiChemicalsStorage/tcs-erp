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
  // "ทวงเลข PO" — added 2026-07-29 (the PO-chasing feature, see docs/MODULES/ScopeOfWork.md
  // "PO Chasing"): fired to the record's resolved salesperson (name-matched user → seller link →
  // creator) when someone presses the chase button on a record with no PO number yet.
  | "scope_of_work_po_chase"
  // Approval workflow for Scope of Work + Delivery Order — added 2026-07-24 (direct user
  // request). submitted → every active `*:finalize` holder; approved/rejected → the creator.
  | "scope_of_work_submitted"
  | "scope_of_work_approved"
  | "scope_of_work_rejected"
  | "delivery_order_submitted"
  | "delivery_order_approved"
  | "delivery_order_rejected";

export interface Notification {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  description: string;
  module: string;
  relatedQuoteId?: string;
  /** Added 2026-07-23 for "scope_of_work_document_sent" — same optional/backward-compatible
   * provenance as `relatedQuoteId`, naming convention matches `AuditLogEntry.relatedScopeId`/
   * `.relatedScopeNumber` (src/lib/auditLog.ts). */
  relatedScopeId?: string;
  relatedScopeNumber?: string;
  /** Added 2026-07-24 for the `delivery_order_*` approval-workflow types — deep-links to the
   * record on the standalone Delivery Order page (checked before `relatedScopeId` in
   * `App.tsx`'s bell `onNavigate`). */
  relatedDeliveryOrderId?: string;
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

/** Added 2026-07-23, Scope of Work "Document Recipients" feature — sent alongside the actual email
 * (see api/_lib/email.ts) when "ส่งอีเมลแจ้งผู้รับเอกสาร" runs, so a recipient sees it in-app too,
 * not only in their inbox. Server-side (`handleSendDocumentNotifications()`,
 * api/_lib/scopeOfWorkHandler.ts) hand-rolls this same shape directly rather than calling this
 * function — same convention `api/handlers/quotes.ts`'s workflow-notification writer already
 * follows for the quotation builders above, since the server never needs this function's synthetic
 * `id`/`recipientUserId`-per-array-element convenience, only the doc shape. Kept here as the
 * canonical field reference. */
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
