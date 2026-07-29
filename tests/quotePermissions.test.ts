import { describe, it, expect } from "vitest";
import { computeQuotePermissions, type Quote, type QuoteStatus } from "../src/lib/quotes";
import { defaultRoles } from "../src/lib/roles";
import type { User } from "../src/lib/users";

function makeUser(id: string, roleKey: string): User {
  return {
    id, employeeId: "E1", fullName: "User " + id, username: "u" + id, email: `${id}@t.co`,
    phone: "", department: "", position: "", roleKey, status: "active",
    profilePictureDataUrl: "", signatureDataUrl: "", createdAt: "", updatedAt: "",
  };
}

function makeQuote(status: QuoteStatus, createdByUserId: string): Quote {
  return { id: "QT-2569-0001", status, createdByUserId } as unknown as Quote;
}

const sales = makeUser("sales1", "sales_user");
const otherSales = makeUser("sales2", "sales_user");
const approver = makeUser("appr1", "approver_1");
const viewer = makeUser("view1", "viewer");

describe("computeQuotePermissions — the client-side mirror of the server's ownership rules", () => {
  it("a sales user fully controls their own Draft", () => {
    const p = computeQuotePermissions(makeQuote("ร่าง", sales.id), false, sales, defaultRoles);
    expect(p.canEdit).toBe(true);
    expect(p.canSubmit).toBe(true);
    expect(p.canApprove).toBe(false);
    expect(p.canReject).toBe(false);
  });

  it("a sales user can neither edit nor submit a colleague's Draft", () => {
    const p = computeQuotePermissions(makeQuote("ร่าง", otherSales.id), false, sales, defaultRoles);
    expect(p.canEdit).toBe(false);
    expect(p.canSubmit).toBe(false);
  });

  it("an approver can approve/reject only while Pending Approval", () => {
    const pending = computeQuotePermissions(makeQuote("รออนุมัติ", sales.id), false, approver, defaultRoles);
    expect(pending.canApprove).toBe(true);
    expect(pending.canReject).toBe(true);
    const draft = computeQuotePermissions(makeQuote("ร่าง", sales.id), false, approver, defaultRoles);
    expect(draft.canApprove).toBe(false);
    const approved = computeQuotePermissions(makeQuote("อนุมัติแล้ว", sales.id), false, approver, defaultRoles);
    expect(approved.canApprove).toBe(false);
  });

  it("the submitter can NOT approve their own quote (sales_user lacks quotations:approve)", () => {
    const p = computeQuotePermissions(makeQuote("รออนุมัติ", sales.id), false, sales, defaultRoles);
    expect(p.canApprove).toBe(false);
    expect(p.canReject).toBe(false);
  });

  it("post-approval customer actions belong to the owner or an approver, not other sales", () => {
    const owner = computeQuotePermissions(makeQuote("อนุมัติแล้ว", sales.id), false, sales, defaultRoles);
    expect(owner.canSendToCustomer).toBe(true);
    const approverView = computeQuotePermissions(makeQuote("อนุมัติแล้ว", sales.id), false, approver, defaultRoles);
    expect(approverView.canSendToCustomer).toBe(true);
    const other = computeQuotePermissions(makeQuote("อนุมัติแล้ว", sales.id), false, otherSales, defaultRoles);
    expect(other.canSendToCustomer).toBe(false);
  });

  it("a viewer can do nothing but export nothing — every action gate is closed", () => {
    const p = computeQuotePermissions(makeQuote("รออนุมัติ", sales.id), false, viewer, defaultRoles);
    expect(Object.values(p).some(Boolean)).toBe(false);
  });

  it("a legacy quote with no creator recorded counts as owned by whoever opens it", () => {
    const p = computeQuotePermissions(makeQuote("ร่าง", ""), false, sales, defaultRoles);
    expect(p.canEdit).toBe(true);
    expect(p.canSubmit).toBe(true);
  });

  it("Rewrite/Duplicate follow quotations:create, detail-view only", () => {
    const p = computeQuotePermissions(makeQuote("ปิดการขายสำเร็จ", sales.id), false, sales, defaultRoles);
    expect(p.canDuplicate).toBe(true);
    expect(p.canRewrite).toBe(true);
    const v = computeQuotePermissions(makeQuote("ปิดการขายสำเร็จ", sales.id), false, viewer, defaultRoles);
    expect(v.canRewrite).toBe(false);
  });
});
