import { useEffect, useRef, useState } from "react";
import type { Company } from "../../lib/storage";
import type { Product, ProductCategory } from "../../lib/products";
import type { JobType } from "../../lib/jobTypes";
import type { User } from "../../lib/users";
import type { Role } from "../../lib/roles";
import {
  type Quote, type QuoteInterest, type QuoteDraftFields, type ApprovalAction,
  createQuote, updateQuote, duplicateQuote, performWorkflowAction, approvalActionLabel, approvalActionLabelKey, computeQuotePermissions, nextQuoteId,
} from "../../lib/quotes";
import { ApiError } from "../../lib/apiClient";
import type { QuotationListFilter } from "../dashboard/DashboardPage";
import { QuoteList } from "./QuoteList";
import { QuoteDocument } from "./QuoteDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

export function QuotationPage({
  quotes,
  setQuotes,
  company,
  currentUser,
  users,
  roles,
  products,
  categories,
  jobTypes,
  initialFilter,
  onFilterConsumed,
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
  jobTypes: JobType[];
  /** Set by the Dashboard's pipeline/follow-up click-through — consumed once on mount then cleared, see App.tsx. */
  initialFilter: QuotationListFilter | null;
  onFilterConsumed: () => void;
  onNotify: () => void;
  onAudit: (action: string, details: string) => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Consumed exactly once per mount (a ref guard rather than a `[]` dep array, so this stays
  // exhaustive-deps clean even though `onFilterConsumed` is a fresh function identity every
  // App.tsx render). QuotationPage itself fully unmounts/remounts every time nav switches away
  // from and back to "quotations", so "once per mount" already means "once per fresh visit".
  const consumedInitialFilter = useRef(false);
  useEffect(() => {
    if (consumedInitialFilter.current) return;
    consumedInitialFilter.current = true;
    if (initialFilter) onFilterConsumed();
  }, [initialFilter, onFilterConsumed]);
  const toast = useToast();

  const selectedQuote = quotes.find((q) => q.id === selectedId);

  const setInterest = async (id: string, v: QuoteInterest) => {
    const updated = await updateQuote(id, { interest: v });
    setQuotes((prev) => prev.map((q) => (q.id === id ? updated : q)));
  };

  const handleSave = async (data: QuoteDraftFields) => {
    try {
      if (view === "new") {
        const created = await createQuote(data);
        setQuotes((prev) => [created, ...prev]);
        onAudit("Quotation Created", `สร้างใบเสนอราคา ${created.id} (${created.client})`);
        setSelectedId(created.id);
        setView("detail");
      } else if (selectedQuote) {
        const updated = await updateQuote(selectedQuote.id, data);
        setQuotes((prev) => prev.map((q) => (q.id === selectedQuote.id ? updated : q)));
        onAudit("Quotation Updated", `แก้ไขใบเสนอราคา ${selectedQuote.id}`);
      }
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("quotation.saveErrorToast"));
    }
  };

  const handleDuplicate = async () => {
    if (!selectedQuote) return;
    try {
      const created = await duplicateQuote(selectedQuote.id);
      setQuotes((prev) => [created, ...prev]);
      setSelectedId(created.id);
      onAudit("Quotation Created", `คัดลอกใบเสนอราคาเป็น ${created.id} จาก ${selectedQuote.id}`);
      toast.show(t("quotation.duplicateSuccessToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("quotation.duplicateErrorToast"));
    }
  };

  const handleWorkflowAction = async (action: ApprovalAction, comment: string, draft: QuoteDraftFields) => {
    if (!selectedQuote) return;
    try {
      // Send the current on-screen draft (not just selectedQuote as last saved) so any unsaved
      // edit made right before triggering a workflow action isn't silently discarded.
      const updated = await performWorkflowAction(selectedQuote.id, action, comment, draft);
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      onNotify();

      const auditAction =
        action === "submitted" ? "Quotation Submitted" :
        action === "approved" ? "Quotation Approved" :
        action === "rejected" ? "Quotation Rejected" :
        "Status Changed";
      onAudit(auditAction, `${approvalActionLabel[action]} ใบเสนอราคา ${updated.id}${comment ? ` — ${comment}` : ""}`);
      toast.show(t("quotation.actionCompletedToast").replace("{action}", t(approvalActionLabelKey[action])));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("quotation.workflowErrorToast"));
    }
  };

  if (view === "list") {
    return (
      <>
        <QuoteList
          quotes={quotes}
          jobTypes={jobTypes}
          initialFilter={initialFilter}
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
        jobTypes={jobTypes}
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
