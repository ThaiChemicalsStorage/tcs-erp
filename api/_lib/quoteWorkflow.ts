/**
 * Server-side mirror of the pure workflow data in src/lib/quotes.tsx (ApprovalAction,
 * workflowTransitions, the permission rules inside computeQuotePermissions). Duplicated rather
 * than imported because quotes.tsx also defines JSX (statusIcon) — importing it by value here
 * would drag React/JSX evaluation into a Node serverless function for no reason. Keep these two
 * copies in sync if the workflow ever changes.
 */
import type { Permission } from "../../src/lib/permissions.js";

export type QuoteStatus =
  | "ร่าง"
  | "รออนุมัติ"
  | "อนุมัติแล้ว"
  | "ส่งให้ลูกค้าแล้ว"
  | "ลูกค้ายอมรับ"
  | "ปิดการขายสำเร็จ"
  | "ลูกค้าปฏิเสธ"
  | "เสียโอกาส"
  | "ยกเลิก";

export type ApprovalAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "sent_to_customer"
  | "customer_accepted"
  | "customer_rejected"
  | "marked_won"
  | "marked_lost"
  | "cancelled";

export const workflowTransitions: Record<ApprovalAction, { from: QuoteStatus[]; to: QuoteStatus }> = {
  submitted: { from: ["ร่าง"], to: "รออนุมัติ" },
  approved: { from: ["รออนุมัติ"], to: "อนุมัติแล้ว" },
  rejected: { from: ["รออนุมัติ"], to: "ร่าง" },
  sent_to_customer: { from: ["อนุมัติแล้ว"], to: "ส่งให้ลูกค้าแล้ว" },
  customer_accepted: { from: ["ส่งให้ลูกค้าแล้ว"], to: "ลูกค้ายอมรับ" },
  customer_rejected: { from: ["ส่งให้ลูกค้าแล้ว"], to: "ลูกค้าปฏิเสธ" },
  marked_won: { from: ["ลูกค้ายอมรับ"], to: "ปิดการขายสำเร็จ" },
  marked_lost: { from: ["ลูกค้าปฏิเสธ"], to: "เสียโอกาส" },
  cancelled: { from: ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว"], to: "ยกเลิก" },
};

export interface WorkflowPermissions {
  create: boolean;
  edit: boolean;
  approve: boolean;
  reject: boolean;
  delete: boolean;
}

/** Mirrors computeQuotePermissions' can* rules for whichever ApprovalAction is being performed. */
export function isWorkflowActionAllowed(action: ApprovalAction, isOwner: boolean, perms: WorkflowPermissions): boolean {
  switch (action) {
    case "submitted":
      return (perms.create || perms.edit) && isOwner;
    case "approved":
      return perms.approve;
    case "rejected":
      return perms.reject;
    case "cancelled":
      return perms.delete;
    case "sent_to_customer":
    case "customer_accepted":
    case "customer_rejected":
    case "marked_won":
    case "marked_lost":
      return perms.edit && (isOwner || perms.approve);
  }
}

export const REQUIRED_PERMISSION_HINT: Record<ApprovalAction, Permission> = {
  submitted: "quotations:edit",
  approved: "quotations:approve",
  rejected: "quotations:reject",
  sent_to_customer: "quotations:edit",
  customer_accepted: "quotations:edit",
  customer_rejected: "quotations:edit",
  marked_won: "quotations:edit",
  marked_lost: "quotations:edit",
  cancelled: "quotations:delete",
};
