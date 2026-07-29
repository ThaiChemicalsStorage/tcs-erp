import { describe, it, expect } from "vitest";
import {
  workflowTransitions, isWorkflowActionAllowed, COMMENT_REQUIRED_ACTIONS,
  type ApprovalAction, type QuoteStatus, type WorkflowPermissions,
} from "../api/_lib/quoteWorkflow";

const ALL_STATUSES: QuoteStatus[] = [
  "ร่าง", "รออนุมัติ", "อนุมัติแล้ว", "ส่งให้ลูกค้าแล้ว", "ลูกค้ายอมรับ",
  "ปิดการขายสำเร็จ", "ลูกค้าปฏิเสธ", "เสียโอกาส", "ยกเลิก",
];

const noPerms: WorkflowPermissions = { create: false, edit: false, approve: false, reject: false, delete: false };

describe("quotation approval state machine (the server-authoritative workflowTransitions)", () => {
  it("encodes the documented 9-status flow exactly", () => {
    expect(workflowTransitions.submitted).toEqual({ from: ["ร่าง"], to: "รออนุมัติ" });
    expect(workflowTransitions.approved).toEqual({ from: ["รออนุมัติ"], to: "อนุมัติแล้ว" });
    expect(workflowTransitions.rejected).toEqual({ from: ["รออนุมัติ"], to: "ร่าง" });
    expect(workflowTransitions.sent_to_customer).toEqual({ from: ["อนุมัติแล้ว"], to: "ส่งให้ลูกค้าแล้ว" });
    expect(workflowTransitions.customer_accepted).toEqual({ from: ["ส่งให้ลูกค้าแล้ว"], to: "ลูกค้ายอมรับ" });
    expect(workflowTransitions.customer_rejected).toEqual({ from: ["ส่งให้ลูกค้าแล้ว"], to: "ลูกค้าปฏิเสธ" });
    expect(workflowTransitions.marked_won).toEqual({ from: ["ลูกค้ายอมรับ"], to: "ปิดการขายสำเร็จ" });
    expect(workflowTransitions.marked_lost).toEqual({ from: ["ลูกค้าปฏิเสธ"], to: "เสียโอกาส" });
    expect(workflowTransitions.cancelled).toEqual({ from: ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว"], to: "ยกเลิก" });
  });

  it("terminal statuses (Won/Lost/Cancelled) have no outgoing transition at all", () => {
    for (const terminal of ["ปิดการขายสำเร็จ", "เสียโอกาส", "ยกเลิก"] as QuoteStatus[]) {
      for (const action of Object.keys(workflowTransitions) as ApprovalAction[]) {
        expect(
          workflowTransitions[action].from.includes(terminal),
          `${action} must not be reachable from terminal status ${terminal}`,
        ).toBe(false);
      }
    }
  });

  it("no action can approve straight from Draft (submit must come first)", () => {
    expect(workflowTransitions.approved.from).not.toContain("ร่าง");
  });

  it("every status except terminals has at least one outgoing action", () => {
    const terminals = new Set<QuoteStatus>(["ปิดการขายสำเร็จ", "เสียโอกาส", "ยกเลิก"]);
    for (const status of ALL_STATUSES) {
      const hasOutgoing = (Object.values(workflowTransitions)).some((t) => t.from.includes(status));
      expect(hasOutgoing, `status ${status} outgoing`).toBe(!terminals.has(status));
    }
  });
});

describe("per-action authorization rules (isWorkflowActionAllowed)", () => {
  it("submit requires create-or-edit AND ownership — an editor can't submit someone else's draft", () => {
    expect(isWorkflowActionAllowed("submitted", true, { ...noPerms, edit: true })).toBe(true);
    expect(isWorkflowActionAllowed("submitted", true, { ...noPerms, create: true })).toBe(true);
    expect(isWorkflowActionAllowed("submitted", false, { ...noPerms, create: true, edit: true })).toBe(false);
  });

  it("approve/reject/cancel are pure permission checks, ownership-independent", () => {
    expect(isWorkflowActionAllowed("approved", false, { ...noPerms, approve: true })).toBe(true);
    expect(isWorkflowActionAllowed("approved", true, noPerms)).toBe(false);
    expect(isWorkflowActionAllowed("rejected", false, { ...noPerms, reject: true })).toBe(true);
    expect(isWorkflowActionAllowed("cancelled", false, { ...noPerms, delete: true })).toBe(true);
    expect(isWorkflowActionAllowed("cancelled", true, { ...noPerms, edit: true })).toBe(false);
  });

  it("post-approval actions need edit plus (ownership OR approve authority)", () => {
    const postApproval: ApprovalAction[] = ["sent_to_customer", "customer_accepted", "customer_rejected", "marked_won", "marked_lost"];
    for (const action of postApproval) {
      expect(isWorkflowActionAllowed(action, true, { ...noPerms, edit: true }), `${action} owner+edit`).toBe(true);
      expect(isWorkflowActionAllowed(action, false, { ...noPerms, edit: true, approve: true }), `${action} approver+edit`).toBe(true);
      expect(isWorkflowActionAllowed(action, false, { ...noPerms, edit: true }), `${action} non-owner edit only`).toBe(false);
      expect(isWorkflowActionAllowed(action, true, noPerms), `${action} owner without edit`).toBe(false);
    }
  });

  it("rejection-style actions require a comment; approvals don't", () => {
    expect(COMMENT_REQUIRED_ACTIONS.has("rejected")).toBe(true);
    expect(COMMENT_REQUIRED_ACTIONS.has("customer_rejected")).toBe(true);
    expect(COMMENT_REQUIRED_ACTIONS.has("cancelled")).toBe(true);
    expect(COMMENT_REQUIRED_ACTIONS.has("approved")).toBe(false);
    expect(COMMENT_REQUIRED_ACTIONS.has("submitted")).toBe(false);
  });
});
