import { useState } from "react";
import type { Company } from "../../lib/storage";
import type { Product, ProductCategory } from "../../lib/products";
import type { User } from "../../lib/users";
import type { Role } from "../../lib/roles";
import { hasPermission, roleNameFor } from "../../lib/roles";
import {
  type Quote, type QuoteInterest, type QuoteDraftFields, type ApprovalAction, type ApprovalHistoryEntry,
  cloneLines, nextQuoteId, newHistoryId, workflowTransitions, approvalActionLabel, computeQuotePermissions,
} from "../../lib/quotes";
import {
  type Notification, HIGH_VALUE_THRESHOLD,
  notifyQuotationSubmitted, notifyQuotationApproved, notifyQuotationRejected, notifyHighValueQuotation,
  notifyQuotationCustomerAccepted, notifyQuotationCustomerRejected,
} from "../../lib/notifications";
import { QuoteList } from "./QuoteList";
import { QuoteDocument } from "./QuoteDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

export function QuotationPage({
  quotes,
  setQuotes,
  company,
  currentUser,
  users,
  roles,
  products,
  categories,
  onNotify,
  onAudit,
}: {
  quotes: Quote[];
  setQuotes: React.Dispatch<React.SetStateAction<Quote[]>>;
  company: Company;
  currentUser: User;
  users: User[];
  roles: Role[];
  products: Product[];
  categories: ProductCategory[];
  onNotify: (notifications: Notification[]) => void;
  onAudit: (action: string, details: string) => void;
}) {
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toast = useToast();

  const selectedQuote = quotes.find((q) => q.id === selectedId);

  const setInterest = (id: string, v: QuoteInterest) =>
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, interest: v } : q)));

  const handleSave = (data: QuoteDraftFields) => {
    if (view === "new") {
      const id = nextQuoteId(quotes);
      const today = new Date();
      const newQuote: Quote = {
        ...data,
        status: "ร่าง",
        id,
        date: today.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
        valid: new Date(today.getTime() + 30 * 86400000).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
        interest: null,
        createdByUserId: currentUser.id,
        approvalHistory: [],
      };
      setQuotes((prev) => [newQuote, ...prev]);
      onAudit("Quotation Created", `สร้างใบเสนอราคา ${id} (${newQuote.client})`);
      setSelectedId(id);
      setView("detail");
    } else if (selectedQuote) {
      setQuotes((prev) => prev.map((q) => (q.id === selectedQuote.id ? { ...q, ...data, status: q.status } : q)));
      onAudit("Quotation Updated", `แก้ไขใบเสนอราคา ${selectedQuote.id}`);
    }
  };

  const handleDuplicate = () => {
    if (!selectedQuote) return;
    const id = nextQuoteId(quotes);
    const duplicate: Quote = {
      ...selectedQuote,
      id,
      status: "ร่าง",
      interest: null,
      lines: cloneLines(selectedQuote.lines),
      createdByUserId: currentUser.id,
      approvalHistory: [],
    };
    setQuotes((prev) => [duplicate, ...prev]);
    setSelectedId(id);
    onAudit("Quotation Created", `คัดลอกใบเสนอราคาเป็น ${id} จาก ${selectedQuote.id}`);
    toast.show("คัดลอกใบเสนอราคาเรียบร้อยแล้ว");
  };

  const handleWorkflowAction = (action: ApprovalAction, comment: string) => {
    if (!selectedQuote) return;
    const transition = workflowTransitions[action];
    const entry: ApprovalHistoryEntry = {
      id: newHistoryId(),
      userId: currentUser.id,
      userName: currentUser.fullName,
      roleName: roleNameFor(currentUser, roles),
      action,
      comment,
      createdAt: new Date().toISOString(),
    };
    const updated: Quote = {
      ...selectedQuote,
      status: transition.to,
      createdByUserId: selectedQuote.createdByUserId || currentUser.id,
      approvalHistory: [...selectedQuote.approvalHistory, entry],
    };
    setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));

    let notifs: Notification[] = [];
    const creatorId = updated.createdByUserId;
    if (action === "submitted") {
      const approverIds = users.filter((u) => u.status === "active" && hasPermission(u, roles, "quotations:approve")).map((u) => u.id);
      notifs = notifyQuotationSubmitted(approverIds, updated.id, updated.client, currentUser.fullName);
      if (updated.amount >= HIGH_VALUE_THRESHOLD) {
        const level2Ids = users.filter((u) => u.status === "active" && u.roleKey === "approver_2").map((u) => u.id);
        notifs = notifs.concat(notifyHighValueQuotation(level2Ids, updated.id, updated.client, updated.amount));
      }
    } else if (action === "approved" && creatorId) {
      notifs = notifyQuotationApproved([creatorId], updated.id, updated.client, currentUser.fullName);
    } else if (action === "rejected" && creatorId) {
      notifs = notifyQuotationRejected([creatorId], updated.id, updated.client, currentUser.fullName, comment);
    } else if (action === "customer_accepted" && creatorId) {
      notifs = notifyQuotationCustomerAccepted([creatorId], updated.id, updated.client);
    } else if (action === "customer_rejected" && creatorId) {
      notifs = notifyQuotationCustomerRejected([creatorId], updated.id, updated.client, comment);
    }
    if (notifs.length) onNotify(notifs);

    const auditAction =
      action === "submitted" ? "Quotation Submitted" :
      action === "approved" ? "Quotation Approved" :
      action === "rejected" ? "Quotation Rejected" :
      "Status Changed";
    onAudit(auditAction, `${approvalActionLabel[action]} ใบเสนอราคา ${updated.id}${comment ? ` — ${comment}` : ""}`);
    toast.show(`${approvalActionLabel[action]}เรียบร้อยแล้ว`);
  };

  if (view === "list") {
    return (
      <>
        <QuoteList
          quotes={quotes}
          onOpen={(id) => { setSelectedId(id); setView("detail"); }}
          onCreateNew={() => { setSelectedId(null); setView("new"); }}
          onInterestChange={setInterest}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  const permissions = computeQuotePermissions(view === "detail" ? selectedQuote : undefined, view === "new", currentUser, roles);

  return (
    <>
      <QuoteDocument
        key={view === "detail" ? selectedId ?? "new" : "new"}
        mode={view === "detail" ? "detail" : "new"}
        quote={view === "detail" ? selectedQuote : undefined}
        nextId={nextQuoteId(quotes)}
        company={company}
        currentUser={currentUser}
        users={users}
        products={products}
        categories={categories}
        permissions={permissions}
        onBack={() => setView("list")}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onInterestChange={(v) => selectedQuote && setInterest(selectedQuote.id, v)}
        onWorkflowAction={handleWorkflowAction}
        showToast={toast.show}
      />
      <Toast message={toast.message} />
    </>
  );
}
