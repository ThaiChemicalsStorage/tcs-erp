/**
 * Server-side mirror of the pure workflow data in src/lib/quotes.ts (ApprovalAction,
 * workflowTransitions, the permission rules inside computeQuotePermissions). Kept as a duplicate
 * rather than an import: importing the frontend module by value would pull `apiClient.ts` (and
 * everything it reaches) into a Node function to get three constants. **The original reason — that
 * quotes.tsx defined JSX (`statusIcon`) — no longer applies**: that moved to
 * src/pages/quotation/statusIcons.tsx on 2026-08-25 and the file is now plain TypeScript, so
 * merging these two copies is a real option if the drift ever costs more than the import would.
 * Until then, keep them in sync if the workflow changes.
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

/** Duplicated from src/lib/quotes.ts's `approvalActionLabel` (see file header) — used to build server-authoritative audit-log entries for workflow actions. */
export const approvalActionLabel: Record<ApprovalAction, string> = {
  submitted: "ส่งขออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ปฏิเสธ (ส่งกลับแก้ไข)",
  sent_to_customer: "ส่งให้ลูกค้า",
  customer_accepted: "ลูกค้ายอมรับ",
  customer_rejected: "ลูกค้าปฏิเสธ",
  marked_won: "ปิดการขายสำเร็จ",
  marked_lost: "ปิดการขายไม่สำเร็จ",
  cancelled: "ยกเลิกใบเสนอราคา",
};

/** Actions where a comment/reason is mandatory, not optional — enforced server-side since the UI-only check (QuoteDocument.tsx) can be bypassed by calling the API directly. */
export const COMMENT_REQUIRED_ACTIONS: ReadonlySet<ApprovalAction> = new Set(["rejected", "customer_rejected", "cancelled"]);

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

/**
 * ใบเสนอราคาล็อกหลังส่งขออนุมัติ (2026-09-30, เจ้าของอนุมัติกับดีไซน์ใหม่)
 *
 * พ้น "ร่าง" ไปแล้ว เนื้อหาที่ลูกค้าเห็น/ผู้อนุมัติอนุมัติ (ลูกค้า รายการ ราคา ส่วนลด เงื่อนไข ฯลฯ) แก้ไม่ได้อีก
 * ทางเปลี่ยนมีสองทางเท่านั้น: ผู้อนุมัติ "ปฏิเสธ (ส่งกลับแก้ไข)" ให้กลับเป็นร่าง หรือกด "แก้ไข" ออกใบ -R ใหม่
 *
 * Once a quotation leaves Draft its customer-facing content is frozen. Before this, `canEdit` was
 * status-independent and an approved/sent/won quotation could be rewritten in place with a plain
 * Save — the approver's approval then no longer described the document. The two ways to change
 * content are "rejected" (back to Draft) and Rewrite (`-R{n}`), both of which already exist.
 *
 * What stays writable after submit is exactly what the app used to let people maintain while a
 * quotation is out with the customer — sales follow-up, not content:
 *   - `interest` (the 👍/👎 buttons on the list and the document)
 *   - `poRef` (the customer's PO number usually arrives after approval)
 *   - `followUpDate`, `isPotentialOpportunity` (internal CRM fields, never printed)
 * `poRef` IS printed on the quotation, but it records the customer's order against the quotation
 * rather than changing what was offered, so it is follow-up.
 */
export const POST_SUBMIT_EDITABLE_FIELDS: ReadonlySet<string> = new Set([
  "interest", "poRef", "followUpDate", "isPotentialOpportunity",
]);

/** Every request key that writes quotation content (see `sanitizePartialQuoteFields` + jobType/customer in api/handlers/quotes.ts). */
export const QUOTE_CONTENT_FIELDS: readonly string[] = [
  "client", "salesperson", "lines", "discount", "discountMode",
  "contactName", "contactPhone", "contactEmail", "contacts",
  "address", "taxId", "deliveryMethod", "deliveryAddress", "project",
  "paymentTerms", "issueDate", "expiryDate", "remarks", "revisionNote",
  "jobTypeCode", "customerId",
];

/** The content keys a request is trying to write — empty when `status` is Draft (everything is editable there). */
export function lockedContentKeys(status: QuoteStatus, body: Record<string, unknown>): string[] {
  if (status === "ร่าง") return [];
  return QUOTE_CONTENT_FIELDS.filter((k) => k in body);
}

export const QUOTE_LOCKED_MESSAGE =
  "ใบเสนอราคานี้ส่งขออนุมัติแล้ว แก้ไขเนื้อหาไม่ได้ — ถ้าต้องแก้ ให้ผู้อนุมัติปฏิเสธกลับเป็นร่าง หรือเลือก \"แก้ไข\" เพื่อออกใบแก้ไข (-R) ใหม่";
