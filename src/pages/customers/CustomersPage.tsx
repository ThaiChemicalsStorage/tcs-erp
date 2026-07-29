import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Power, Archive, ArchiveRestore, Contact, X, HelpCircle } from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import {
  type Customer, type CustomerDraft, emptyCustomerDraft,
  createCustomer, updateCustomer, setCustomerArchived,
} from "../../lib/customers";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

type StatusFilter = "all" | "active" | "inactive";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Customer master data admin page (added 2026-07-14) — where saved customers used by the
 * Quotation form's Customer selector actually get created/edited. Deliberately a single
 * list+modal-form page (unlike Company Profiles' list/form/detail three-file split) since a
 * Customer record has far fewer fields and no logo/bank-account/multi-section complexity.
 */
export function CustomersPage({
  customers,
  onCustomersChange,
  currentUserId,
  canCreate,
  canEdit,
  canArchive,
  initialEditId,
  onEditIdConsumed,
  autoCreateSeq,
  onAutoActionConsumed,
}: {
  customers: Customer[];
  onCustomersChange: (customers: Customer[]) => void;
  /** For the one-time guided tour "seen" tracking (see useModuleTour). */
  currentUserId: string;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  /** Set by a Global Search customer result click — opens that customer's edit form directly, whether CustomersPage is mounting fresh or already on-screen (reacts to every change, like QuotationPage's initialQuoteId, since a second search click while already here should still jump to the newly-clicked customer). Optional: pages composed without a search feature (none today) simply never set it. */
  initialEditId?: string | null;
  onEditIdConsumed?: () => void;
  /** Set (to a fresh, ever-increasing number) by the Global Search "Add Customer" page result — opens the create form once per dispatch. A monotonic sequence number rather than a boolean so two consecutive identical dispatches (e.g. the same result clicked twice) both still fire, not just the first. */
  autoCreateSeq?: number | null;
  onAutoActionConsumed?: () => void;
}) {
  const { t } = useI18n();
  const { message, show } = useToast();

  // Page tour (added 2026-07-29) — same one-time-per-user auto-start + replay-button convention
  // as the other list pages' tours.
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="customers-create"]', popover: { title: t("tour.customers.create.title"), description: t("tour.customers.create.desc"), side: "bottom" } },
    { element: '[data-tour="customers-toolbar"]', popover: { title: t("tour.customers.toolbar.title"), description: t("tour.customers.toolbar.desc"), side: "bottom" } },
    { element: '[data-tour="customers-table"]', popover: { title: t("tour.customers.table.title"), description: t("tour.customers.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("customers", currentUserId, tourSteps);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [formTarget, setFormTarget] = useState<Customer | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Customer | null>(null);

  // React's "adjust state during rendering" pattern (see QuotationPage.tsx's identical
  // initialQuoteId handling) — reacts to every change of initialEditId, not just once per mount.
  // 2026-07-14, Codex review Medium fix: only actually opens the edit form when `canEdit` is true
  // — previously this bypassed the same permission gate the list's own edit (pencil) button
  // already respects, dropping a view-only user (`customers:view` without `customers:edit`) into
  // an editable form they could never normally reach from this page's own UI. A view-only search
  // click instead lands on the list, filtered down to just that customer (status/archived filters
  // reset so the record is guaranteed visible regardless of its own active/archived state) — a
  // real "found it" result without an edit affordance the server would reject anyway.
  const [appliedEditId, setAppliedEditId] = useState<string | null>(null);
  if (initialEditId && initialEditId !== appliedEditId) {
    setAppliedEditId(initialEditId);
    const target = customers.find((c) => c.id === initialEditId);
    if (target) {
      if (canEdit) {
        setFormTarget(target);
      } else {
        setSearch(target.companyName);
        setStatusFilter("all");
        setShowArchived(true);
      }
    }
  }
  useEffect(() => {
    if (initialEditId) onEditIdConsumed?.();
  }, [initialEditId, onEditIdConsumed]);

  const [appliedAutoCreateSeq, setAppliedAutoCreateSeq] = useState<number | null>(null);
  if (autoCreateSeq != null && autoCreateSeq !== appliedAutoCreateSeq) {
    setAppliedAutoCreateSeq(autoCreateSeq);
    setFormTarget("new");
  }
  useEffect(() => {
    if (autoCreateSeq != null) onAutoActionConsumed?.();
  }, [autoCreateSeq, onAutoActionConsumed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter((c) => (showArchived ? true : !c.isDeleted))
      .filter((c) => (statusFilter === "all" ? true : statusFilter === "active" ? c.isActive : !c.isActive))
      .filter((c) => (q ? [c.companyName, c.contactName, c.phone, c.email, c.taxId].some((f) => f.toLowerCase().includes(q)) : true));
  }, [customers, search, statusFilter, showArchived]);

  const handleToggleActive = async (id: string) => {
    const target = customers.find((c) => c.id === id);
    if (!target) return;
    try {
      const updated = await updateCustomer(id, { isActive: !target.isActive });
      onCustomersChange(customers.map((c) => (c.id === id ? updated : c)));
      show(updated.isActive ? t("customers.toast.activated") : t("customers.toast.deactivated"));
    } catch (err) {
      show(err instanceof Error ? err.message : t("customers.saveError"));
    }
  };

  const handleArchiveToggle = async (id: string) => {
    const target = customers.find((c) => c.id === id);
    if (!target) return;
    try {
      const updated = await setCustomerArchived(id, !target.isDeleted);
      onCustomersChange(customers.map((c) => (c.id === id ? updated : c)));
      show(updated.isDeleted ? t("customers.toast.archived") : t("customers.toast.unarchived"));
    } catch (err) {
      show(err instanceof Error ? err.message : t("customers.saveError"));
    }
  };

  const handleSave = async (draft: CustomerDraft): Promise<string | null> => {
    try {
      if (formTarget === "new") {
        const created = await createCustomer(draft);
        onCustomersChange([...customers, created]);
        show(t("customers.toast.created"));
      } else if (formTarget) {
        const updated = await updateCustomer(formTarget.id, draft);
        onCustomersChange(customers.map((c) => (c.id === formTarget.id ? updated : c)));
        show(t("customers.toast.updated"));
      }
      setFormTarget(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t("customers.saveError");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("customers.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("customers.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={tour.start}
            title={t("tour.replay")}
            aria-label={t("tour.replay")}
            className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
          >
            <HelpCircle size={15} />
          </button>
          {canCreate && (
            <button data-tour="customers-create" onClick={() => setFormTarget("new")} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              <Plus size={15} /> {t("customers.addNew")}
            </button>
          )}
        </div>
      </div>

      {customers.length > 0 && (
        <div data-tour="customers-toolbar" className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("customers.searchPlaceholder")}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none">
            <option value="all">{t("customers.filter.all")}</option>
            <option value="active">{t("customers.filter.active")}</option>
            <option value="inactive">{t("customers.filter.inactive")}</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground ml-auto">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("customers.showArchived")}
          </label>
        </div>
      )}

      <div data-tour="customers-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {customers.length === 0 ? (
          <EmptyState icon={Contact} title={t("empty.customers.title")} description={t("empty.customers.sub")} actionLabel={canCreate ? t("empty.customers.action") : undefined} onAction={canCreate ? () => setFormTarget("new") : undefined} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Contact size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("customers.noFilterResults")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("customers.col.companyName")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("customers.col.contactName")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("customers.col.phone")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("customers.col.email")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("customers.col.taxId")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("customers.col.status")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("customers.col.updatedAt")}</th>
                  <th className="px-4 py-3 w-32" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors group ${c.isDeleted ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 text-sm text-foreground font-medium max-w-[220px] truncate" title={c.companyName}>{c.companyName}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{c.contactName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{c.phone || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate" title={c.email}>{c.email || "—"}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{c.taxId || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={c.isDeleted ? "archived" : c.isActive ? "active" : "inactive"}
                        label={c.isDeleted ? t("common.status.archived") : c.isActive ? t("common.status.active") : t("customers.status.inactive")}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">{fmtDate(c.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                          <button onClick={() => setFormTarget(c)} title={t("common.edit")} aria-label={`${t("common.edit")} ${c.companyName}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canEdit && !c.isDeleted && (
                          <button
                            onClick={() => (c.isActive ? setDeactivateTarget(c) : handleToggleActive(c.id))}
                            title={c.isActive ? t("customers.action.deactivate") : t("customers.action.activate")}
                            aria-label={`${c.isActive ? t("customers.action.deactivate") : t("customers.action.activate")} ${c.companyName}`}
                            className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"
                          >
                            <Power size={14} />
                          </button>
                        )}
                        {canArchive && (
                          <button onClick={() => setArchiveTarget(c)} title={c.isDeleted ? t("common.unarchive") : t("common.archive")} aria-label={`${c.isDeleted ? t("common.unarchive") : t("common.archive")} ${c.companyName}`} className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors">
                            {c.isDeleted ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formTarget && (
        <CustomerFormModal
          initial={formTarget === "new" ? emptyCustomerDraft : formTarget}
          onSave={handleSave}
          onCancel={() => setFormTarget(null)}
        />
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={t("customers.action.confirmDeactivateTitle")}
        message={t("customers.action.confirmDeactivateMessage")}
        confirmLabel={t("customers.action.deactivate")}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => { if (deactivateTarget) handleToggleActive(deactivateTarget.id); setDeactivateTarget(null); }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget?.isDeleted ? t("customers.unarchiveConfirmTitle") : t("customers.archiveConfirmTitle")}
        message={archiveTarget?.isDeleted ? t("customers.unarchiveConfirmMessage") : t("customers.archiveConfirmMessage")}
        confirmLabel={archiveTarget?.isDeleted ? t("common.unarchive") : t("common.archive")}
        danger={!archiveTarget?.isDeleted}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => { if (archiveTarget) handleArchiveToggle(archiveTarget.id); setArchiveTarget(null); }}
      />

      <Toast message={message} />
    </div>
  );
}

function CustomerFormModal({
  initial,
  onSave,
  onCancel,
}: {
  initial: CustomerDraft;
  onSave: (draft: CustomerDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CustomerDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const field = (key: keyof CustomerDraft) => ({
    value: draft[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  const handleSubmit = async () => {
    if (!draft.companyName.trim()) { setError(t("customers.form.error.companyName")); return; }
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t("customers.form.title")}
          </p>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.clientName")} <span className="text-[#e05252]">*</span></label>
            <input {...field("companyName")} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.contactName")}</label>
              <input {...field("contactName")} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.contactPhone")}</label>
              <input {...field("phone")} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.contactEmail")}</label>
            <input {...field("email")} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.address")}</label>
            <input {...field("address")} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.taxId")}</label>
            <input {...field("taxId")} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.deliveryMethod")}</label>
              <input {...field("deliveryMethod")} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.project")}</label>
              <input {...field("projectName")} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">{t("quotation.field.deliveryAddress")}</label>
            <input {...field("deliveryAddress")} className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-foreground">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("customers.form.active")}
          </label>
        </div>

        {error && <p className="text-xs text-[#e05252] mt-3">{error}</p>}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">{t("common.cancel")}</button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-3.5 py-1.5 text-xs rounded-lg font-semibold bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] transition-colors disabled:opacity-60"
          >
            {t("customers.form.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
