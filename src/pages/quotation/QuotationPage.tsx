import { useEffect, useRef, useState } from "react";
import { FileQuestion } from "lucide-react";
import type { Company } from "../../lib/storage";
import type { Product, ProductCategory } from "../../lib/products";
import type { JobType } from "../../lib/jobTypes";
import type { User } from "../../lib/users";
import { type Role, hasPermission } from "../../lib/roles";
import type { Customer } from "../../lib/customers";
import {
  type Quote, type QuoteInterest, type QuoteDraftFields, type ApprovalAction, type QuotationListFilter,
  createQuote, updateQuote, duplicateQuote, rewriteQuote, performWorkflowAction, approvalActionLabelKey, computeQuotePermissions, nextQuoteId,
} from "../../lib/quotes";
import { ApiError } from "../../lib/apiClient";
import { QuoteList } from "./QuoteList";
import { QuoteDocument } from "./QuoteDocument";
import { ScopeOfWorkDocument } from "./ScopeOfWorkDocument";
import { QuotationTemplateWizard, type QuotationWizardResult } from "./QuotationTemplateWizard";
import { Toast } from "../../components/Toast";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าหลักของโมดูลใบเสนอราคา สลับมุมมองระหว่างรายการ ตัวช่วยสร้าง แบบฟอร์ม และ Scope of Work
// Main quotation module page, switching between list, wizard, document form, and Scope of Work views
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
  customers,
  initialFilter,
  onFilterConsumed,
  initialQuoteId,
  onQuoteIdConsumed,
  initialTemplateSelection,
  onTemplateSelectionConsumed,
  initialScopeOfWorkDeepLink,
  onScopeOfWorkDeepLinkConsumed,
  onNotify,
  canCreateTemplate,
  onCreateTemplateForJobType,
  canViewDeliveryOrder,
  canCreateDeliveryOrder,
  onOpenDeliveryOrder,
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
  customers: Customer[];
  initialFilter: QuotationListFilter | null;
  onFilterConsumed: () => void;
  initialQuoteId: string | null;
  onQuoteIdConsumed: () => void;
  initialTemplateSelection: { jobTypeCode: string; templateId: string } | null;
  onTemplateSelectionConsumed: () => void;
  initialScopeOfWorkDeepLink: { quotationId: string; scopeOfWorkId: string } | null;
  onScopeOfWorkDeepLinkConsumed: () => void;
  onNotify: () => void;
  canCreateTemplate: boolean;
  onCreateTemplateForJobType: (jobTypeCode: string, jobTypeName: string) => void;
  canViewDeliveryOrder: boolean;
  canCreateDeliveryOrder: boolean;
  onOpenDeliveryOrder: (deliveryOrderId: string) => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "wizard" | "new" | "detail" | "scopeOfWork">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scopeOfWorkId, setScopeOfWorkId] = useState<string | null>(null);
  const [wizardResult, setWizardResult] = useState<QuotationWizardResult | null>(null);

  const [listFilterSnapshot] = useState(initialFilter);

  const consumedInitialFilter = useRef(false);
  useEffect(() => {
    if (consumedInitialFilter.current) return;
    consumedInitialFilter.current = true;
    if (initialFilter) onFilterConsumed();
  }, [initialFilter, onFilterConsumed]);

  const [appliedQuoteId, setAppliedQuoteId] = useState<string | null>(null);
  if (initialQuoteId && initialQuoteId !== appliedQuoteId) {
    setAppliedQuoteId(initialQuoteId);
    setSelectedId(initialQuoteId);
    setView("detail");
  }
  useEffect(() => {
    if (initialQuoteId) onQuoteIdConsumed();
  }, [initialQuoteId, onQuoteIdConsumed]);

  const [appliedTemplateSelection, setAppliedTemplateSelection] = useState<{ jobTypeCode: string; templateId: string } | null>(null);
  if (initialTemplateSelection && initialTemplateSelection !== appliedTemplateSelection) {
    setAppliedTemplateSelection(initialTemplateSelection);
    setSelectedId(null);
    setWizardResult(null);
    setView("wizard");
  }
  useEffect(() => {
    if (initialTemplateSelection) onTemplateSelectionConsumed();
  }, [initialTemplateSelection, onTemplateSelectionConsumed]);

  const [appliedScopeOfWorkDeepLink, setAppliedScopeOfWorkDeepLink] = useState<{ quotationId: string; scopeOfWorkId: string } | null>(null);
  if (initialScopeOfWorkDeepLink && initialScopeOfWorkDeepLink !== appliedScopeOfWorkDeepLink) {
    setAppliedScopeOfWorkDeepLink(initialScopeOfWorkDeepLink);
    setSelectedId(initialScopeOfWorkDeepLink.quotationId);
    setScopeOfWorkId(initialScopeOfWorkDeepLink.scopeOfWorkId);
    setView("scopeOfWork");
  }
  useEffect(() => {
    if (initialScopeOfWorkDeepLink) onScopeOfWorkDeepLinkConsumed();
  }, [initialScopeOfWorkDeepLink, onScopeOfWorkDeepLinkConsumed]);

  const toast = useToast();

  const selectedQuote = quotes.find((q) => q.id === selectedId);

  const canViewScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:view");
  const canCreateScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:create");
  const canEditScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:edit");
  const canFinalizeScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:finalize");
  const canPrintScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:print");
  const canDeleteScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:delete");
  const openScopeOfWork = (id: string) => { setScopeOfWorkId(id); setView("scopeOfWork"); };

  // บันทึกสถานะความสนใจของใบเสนอราคาไปยังเซิร์ฟเวอร์แล้วอัปเดต state ในหน้า
  // Saves a quote's interest status to the server and updates local state
  const setInterest = async (id: string, v: QuoteInterest) => {
    const updated = await updateQuote(id, { interest: v });
    setQuotes((prev) => prev.map((q) => (q.id === id ? updated : q)));
  };

  // สร้างใบเสนอราคาใหม่หรือบันทึกการแก้ไข แล้วแจ้งเตือนถ้าล้มเหลว
  // Creates a new quote or saves edits to an existing one, showing a toast on failure
  const handleSave = async (data: QuoteDraftFields) => {
    try {
      if (view === "new") {
        const created = await createQuote(data);
        setQuotes((prev) => [created, ...prev]);
        setSelectedId(created.id);
        setView("detail");
      } else if (selectedQuote) {
        const updated = await updateQuote(selectedQuote.id, data);
        setQuotes((prev) => prev.map((q) => (q.id === selectedQuote.id ? updated : q)));
      }
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("quotation.saveErrorToast"));
      throw err;
    }
  };

  // ทำสำเนาใบเสนอราคาที่เลือกอยู่แล้วเปิดสำเนาใหม่ขึ้นมาแทน
  // Duplicates the currently selected quote and switches to viewing the copy
  const handleDuplicate = async () => {
    if (!selectedQuote) return;
    try {
      const created = await duplicateQuote(selectedQuote.id);
      setQuotes((prev) => [created, ...prev]);
      setSelectedId(created.id);
      toast.show(t("quotation.duplicateSuccessToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("quotation.duplicateErrorToast"));
    }
  };

  // เขียนใบเสนอราคาใหม่จากใบเดิมแล้วเปิดฉบับที่เขียนใหม่ขึ้นมาแทน
  // Rewrites the current quote into a fresh one and switches to viewing it
  const handleRewrite = async () => {
    if (!selectedQuote) return;
    try {
      const created = await rewriteQuote(selectedQuote.id);
      setQuotes((prev) => [created, ...prev]);
      setSelectedId(created.id);
      toast.show(t("quotation.rewriteSuccessToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("quotation.rewriteErrorToast"));
    }
  };

  // ดำเนินการตามขั้นตอนอนุมัติ (เช่น ส่งอนุมัติ/อนุมัติ/ตีกลับ) โดยใช้ข้อมูลร่างล่าสุดบนหน้าจอ
  // Performs a workflow action (e.g. submit/approve/reject) using the current on-screen draft
  const handleWorkflowAction = async (action: ApprovalAction, comment: string, draft: QuoteDraftFields) => {
    if (!selectedQuote) return;
    try {
      const updated = await performWorkflowAction(selectedQuote.id, action, comment, draft);
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      onNotify();
      toast.show(t("quotation.actionCompletedToast").replace("{action}", t(approvalActionLabelKey[action])));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("quotation.workflowErrorToast"));
      throw err;
    }
  };

  if (view === "list") {
    return (
      <>
        <QuoteList
          quotes={quotes}
          jobTypes={jobTypes}
          initialFilter={listFilterSnapshot}
          currentUserId={currentUser.id}
          onOpen={(id) => { setSelectedId(id); setView("detail"); }}
          onCreateNew={() => {
            setSelectedId(null);
            setWizardResult(null);
            setAppliedTemplateSelection(null);
            setView("wizard");
          }}
          onInterestChange={setInterest}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (view === "wizard") {
    return (
      <>
        <QuotationTemplateWizard
          jobTypes={jobTypes}
          onCancel={() => setView("list")}
          onComplete={(result) => { setWizardResult(result); setView("new"); }}
          showToast={toast.show}
          initialSelection={appliedTemplateSelection}
          canCreateTemplate={canCreateTemplate}
          onCreateTemplateForJobType={onCreateTemplateForJobType}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (view === "scopeOfWork" && scopeOfWorkId) {
    return (
      <>
        <ScopeOfWorkDocument
          key={scopeOfWorkId}
          scopeOfWorkId={scopeOfWorkId}
          company={company}
          users={users}
          currentUserId={currentUser.id}
          canEdit={canEditScopeOfWork}
          canFinalize={canFinalizeScopeOfWork}
          canPrint={canPrintScopeOfWork}
          canDelete={canDeleteScopeOfWork}
          canCreate={canCreateScopeOfWork}
          canChasePo={hasPermission(currentUser, roles, "scopeOfWork:chasePo")}
          canViewDeliveryOrder={canViewDeliveryOrder}
          canCreateDeliveryOrder={canCreateDeliveryOrder}
          onOpenDeliveryOrder={onOpenDeliveryOrder}
          onBack={() => setView("detail")}
          onDuplicated={(newId) => setScopeOfWorkId(newId)}
          onRewritten={(newId) => setScopeOfWorkId(newId)}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (view === "detail" && !selectedQuote) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <EmptyState
          icon={FileQuestion}
          title={t("quotation.notFound.title")}
          description={t("quotation.notFound.desc")}
          actionLabel={t("quotation.notFound.action")}
          onAction={() => setView("list")}
        />
      </div>
    );
  }

  const permissions = computeQuotePermissions(view === "detail" ? selectedQuote : undefined, view === "new", currentUser, roles);

  return (
    <>
      <QuoteDocument
        key={view === "detail" ? selectedId ?? "new" : "new"}
        mode={view === "detail" ? "detail" : "new"}
        quote={view === "detail" ? selectedQuote : undefined}
        allQuotes={quotes}
        wizardResult={view === "new" ? wizardResult : null}
        nextId={nextQuoteId(quotes)}
        company={company}
        currentUser={currentUser}
        users={users}
        products={products}
        categories={categories}
        jobTypes={jobTypes}
        customers={customers}
        permissions={permissions}
        canViewScopeOfWork={canViewScopeOfWork}
        canCreateScopeOfWork={canCreateScopeOfWork}
        onOpenScopeOfWork={openScopeOfWork}
        onBack={() => setView("list")}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onRewrite={handleRewrite}
        onInterestChange={(v) => selectedQuote && setInterest(selectedQuote.id, v)}
        onWorkflowAction={handleWorkflowAction}
        showToast={toast.show}
      />
      <Toast message={toast.message} />
    </>
  );
}
