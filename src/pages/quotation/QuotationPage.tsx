import { useEffect, useRef, useState } from "react";
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
  /** Set by the Dashboard's pipeline/follow-up click-through — consumed once on mount then cleared, see App.tsx. */
  initialFilter: QuotationListFilter | null;
  onFilterConsumed: () => void;
  /** Set by a notification click with a `relatedQuoteId` — opens that quote's detail view directly, whether QuotationPage is mounting fresh or already on-screen (unlike `initialFilter`, this reacts to every change, not just the first one, since a second notification click while already here should still jump to the new quote). */
  initialQuoteId: string | null;
  onQuoteIdConsumed: () => void;
  /** Set by a Global Search "Template ใบเสนอราคา" result click — opens the wizard with this Job
   * Type + Template preselected (see QuotationTemplateWizard.tsx's `initialSelection`), instead of
   * making the user reselect what they just found via search. Same "reacts to every change"
   * requirement as `initialQuoteId` above (a second template result click while the wizard is
   * already open must still jump to the newly-clicked one). */
  initialTemplateSelection: { jobTypeCode: string; templateId: string } | null;
  onTemplateSelectionConsumed: () => void;
  /** Set by a Global Search "Scope of Work" result click (added 2026-07-15, Codex review High
   * Priority fix) — jumps straight to that quotation's detail view then opens the given Scope of
   * Work's editor, instead of just opening the quotation and making the user find the button
   * again. Same "reacts to every change" requirement as `initialQuoteId` above. */
  initialScopeOfWorkDeepLink: { quotationId: string; scopeOfWorkId: string } | null;
  onScopeOfWorkDeepLinkConsumed: () => void;
  onNotify: () => void;
  /** Whether the current user can reach the Template Management create flow — gates the wizard's
   * "สร้าง Template ใหม่สำหรับประเภทงานนี้" affordance, see QuotationTemplateWizard.tsx. */
  canCreateTemplate: boolean;
  onCreateTemplateForJobType: (jobTypeCode: string, jobTypeName: string) => void;
  /** Threaded straight through to ScopeOfWorkDocument.tsx's "สร้าง/เปิดใบส่งมอบสินค้า" button
   * (added 2026-07-23) — see that component's own doc comment. */
  canViewDeliveryOrder: boolean;
  canCreateDeliveryOrder: boolean;
  onOpenDeliveryOrder: (deliveryOrderId: string) => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "wizard" | "new" | "detail" | "scopeOfWork">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Which Scope of Work is open when `view === "scopeOfWork"` — set by QuoteDocument's "สร้าง /
   * เปิด Scope of Work" toolbar button, or by ScopeOfWorkDocument's "ทำสำเนา" action pointing at
   * the freshly duplicated record. See docs/MODULES/ScopeOfWork.md. */
  const [scopeOfWorkId, setScopeOfWorkId] = useState<string | null>(null);
  // Result of the "สร้างใบเสนอราคา" wizard (Job Type -> Template -> Preview), consumed once when
  // QuoteDocument mounts in "new" mode — see QuotationTemplateWizard.tsx. Cleared whenever a new
  // wizard run starts so a stale template can never leak into an unrelated "start blank" quote.
  const [wizardResult, setWizardResult] = useState<QuotationWizardResult | null>(null);

  // Snapshotted once via useState's lazy initializer — stable for QuotationPage's whole mount
  // lifetime, independent of `initialFilter` going back to null once consumed (see the effect
  // below). This matters because QuoteList (the actual consumer) remounts on every internal
  // view toggle (list -> detail -> list is a plain conditional-render swap with no key, not a
  // stable component instance) — if QuoteList seeded straight from the live `initialFilter` prop,
  // opening any one quote and clicking Back would silently drop the filter the moment it remounts,
  // since by then App.tsx's copy has already been nulled out by the effect below.
  const [listFilterSnapshot] = useState(initialFilter);

  // Tells App.tsx it can forget its copy — consumed exactly once per mount (a ref guard rather
  // than a `[]` dep array, so this stays exhaustive-deps clean even though `onFilterConsumed` is
  // a fresh function identity every App.tsx render). This is a separate concern from what
  // QuoteList should keep seeding itself with above; conflating the two was the bug.
  const consumedInitialFilter = useRef(false);
  useEffect(() => {
    if (consumedInitialFilter.current) return;
    consumedInitialFilter.current = true;
    if (initialFilter) onFilterConsumed();
  }, [initialFilter, onFilterConsumed]);

  // React's "adjust state during rendering" pattern (not an effect — a bare setState call at the
  // top of an effect body trips react-hooks/set-state-in-effect, and this only touches this
  // component's own local state, which is exactly what that pattern is for: not an effect
  // synchronizing with an external system). Reacts to every change of `initialQuoteId`, not just
  // once per mount like `initialFilter` above — a second notification click while QuotationPage is
  // already open and showing some other quote must still jump straight to the newly-clicked one.
  const [appliedQuoteId, setAppliedQuoteId] = useState<string | null>(null);
  if (initialQuoteId && initialQuoteId !== appliedQuoteId) {
    setAppliedQuoteId(initialQuoteId);
    setSelectedId(initialQuoteId);
    setView("detail");
  }
  // Telling App.tsx it can forget its copy genuinely is a synchronization-with-a-parent concern
  // (not local state), so this part alone stays in an effect.
  useEffect(() => {
    if (initialQuoteId) onQuoteIdConsumed();
  }, [initialQuoteId, onQuoteIdConsumed]);

  // Same "adjust state during rendering" pattern as `initialQuoteId` above, applied to a Global
  // Search template result click instead of a notification click.
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

  // Same "adjust state during rendering" pattern as `initialQuoteId`/`initialTemplateSelection`
  // above, applied to a Global Search "Scope of Work" result click (added 2026-07-15, Codex review
  // High Priority fix).
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

  // Scope of Work permissions (added 2026-07-15) — computed once here and shared by both the
  // "สร้าง / เปิด Scope of Work" button on QuoteDocument's toolbar and ScopeOfWorkDocument itself.
  const canViewScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:view");
  const canCreateScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:create");
  const canEditScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:edit");
  const canFinalizeScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:finalize");
  const canPrintScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:print");
  const canDeleteScopeOfWork = hasPermission(currentUser, roles, "scopeOfWork:delete");
  const openScopeOfWork = (id: string) => { setScopeOfWorkId(id); setView("scopeOfWork"); };

  const setInterest = async (id: string, v: QuoteInterest) => {
    const updated = await updateQuote(id, { interest: v });
    setQuotes((prev) => prev.map((q) => (q.id === id ? updated : q)));
  };

  // Audit-log entries for create/update/duplicate/workflow are written server-side now (see the
  // 2026-07-10 Codex review's "Audit integrity" Critical finding + api/handlers/quotes.ts) — this
  // page no longer calls onAudit() for any of them, since a client-forgeable audit trail (with the
  // exact same action text Sales Activity Analytics counts from) was the actual defect.
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
    }
  };

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

  const handleWorkflowAction = async (action: ApprovalAction, comment: string, draft: QuoteDraftFields) => {
    if (!selectedQuote) return;
    try {
      // Send the current on-screen draft (not just selectedQuote as last saved) so any unsaved
      // edit made right before triggering a workflow action isn't silently discarded.
      const updated = await performWorkflowAction(selectedQuote.id, action, comment, draft);
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      onNotify();
      toast.show(t("quotation.actionCompletedToast").replace("{action}", t(approvalActionLabelKey[action])));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("quotation.workflowErrorToast"));
      // Rethrown (2026-07-16, Codex review Medium Priority fix) so QuoteDocument.tsx's own
      // confirmAction() can also catch it and map a 422 DOCUMENT_INCOMPLETE's fieldErrors/
      // groupErrors into inline highlighting — this toast is shown either way.
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
          onOpen={(id) => { setSelectedId(id); setView("detail"); }}
          onCreateNew={() => {
            setSelectedId(null);
            setWizardResult(null);
            // Clear any earlier Global Search template deep link — a plain "สร้างใบเสนอราคา"
            // click must always start at Step 1, never silently reuse a stale preselection from
            // an unrelated search click earlier in this page's lifetime.
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
          users={users}
          canEdit={canEditScopeOfWork}
          canFinalize={canFinalizeScopeOfWork}
          canPrint={canPrintScopeOfWork}
          canDelete={canDeleteScopeOfWork}
          canCreate={canCreateScopeOfWork}
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
