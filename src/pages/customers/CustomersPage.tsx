import { useEffect, useMemo, useState } from "react";
import { Plus, Contact, ChevronRight } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import {
  type Customer, type CustomerDraft,
  createCustomer, updateCustomer, setCustomerArchived,
} from "../../lib/customers";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { btn, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";
import { CustomerDrawer } from "./CustomerDrawer";
import { customerStatus, fmtCustomerDate } from "./customerDisplay";

type StatusTab = "all" | "active" | "inactive";
const PAGE_SIZE = 20;

// หน้าจัดการข้อมูลหลักลูกค้า — รายการแบบแท็บสถานะ คลิกแถวเปิดแผงข้อมูลด้านขวา (สร้าง/แก้ไข/ดู)
// Customer master data page — status-tabbed list; a row opens the right-side drawer (create/edit/view)
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
  currentUserId: string;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  initialEditId?: string | null;
  onEditIdConsumed?: () => void;
  autoCreateSeq?: number | null;
  onAutoActionConsumed?: () => void;
}) {
  const { t } = useI18n();
  const { message, show } = useToast();

  const tourSteps: TourStep[] = [
    { element: '[data-tour="customers-create"]', manual: "ch10-1", popover: { title: t("tour.customers.create.title"), description: t("tour.customers.create.desc"), side: "bottom" } },
    { element: '[data-tour="customers-tabs"]', manual: "ch10-2", popover: { title: t("tour.customers.tabs.title"), description: t("tour.customers.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="customers-search"]', manual: "ch10-2", popover: { title: t("tour.customers.search.title"), description: t("tour.customers.search.desc"), side: "bottom" } },
    { element: '[data-tour="customers-table"]', manual: "ch10-3", popover: { title: t("tour.customers.table.title"), description: t("tour.customers.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("customers", currentUserId, tourSteps);

  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  /** id ของลูกค้าที่เปิดในแผง หรือ "new" — เก็บเป็น id เพื่อให้แผงเห็นสถานะล่าสุดหลังปิด/เปิดใช้งานจากเมนู */
  const [formTarget, setFormTarget] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Customer | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Customer | null>(null);

  const [appliedEditId, setAppliedEditId] = useState<string | null>(null);
  if (initialEditId && initialEditId !== appliedEditId) {
    setAppliedEditId(initialEditId);
    const target = customers.find((c) => c.id === initialEditId);
    if (target) {
      if (canEdit) {
        setFormTarget(target.id);
      } else {
        setSearch(target.companyName);
        setStatusTab("all");
        setShowArchived(true);
        setPage(1);
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

  const visible = useMemo(() => customers.filter((c) => (showArchived ? true : !c.isDeleted)), [customers, showArchived]);
  const counts = useMemo(() => ({
    all: visible.length,
    active: visible.filter((c) => c.isActive).length,
    inactive: visible.filter((c) => !c.isActive).length,
  }), [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible
      .filter((c) => (statusTab === "all" ? true : statusTab === "active" ? c.isActive : !c.isActive))
      .filter((c) => (q ? [c.companyName, c.contactName, c.phone, c.email, c.taxId].some((f) => f.toLowerCase().includes(q)) : true));
  }, [visible, search, statusTab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // สลับสถานะเปิด/ปิดใช้งานของลูกค้าตาม id
  // Toggles a customer's active/inactive status by id
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

  // สลับสถานะเก็บถาวร/กู้คืนของลูกค้าตาม id
  // Toggles a customer's archived/unarchived status by id
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

  // บันทึกฟอร์มลูกค้า สร้างใหม่หรืออัปเดตข้อมูลตามเป้าหมายที่แก้ไข
  // Saves the customer form — creates a new customer or updates the targeted one
  const handleSave = async (draft: CustomerDraft): Promise<string | null> => {
    try {
      if (formTarget === "new") {
        const created = await createCustomer(draft);
        onCustomersChange([...customers, created]);
        show(t("customers.toast.created"));
      } else if (formTarget) {
        const updated = await updateCustomer(formTarget, draft);
        onCustomersChange(customers.map((c) => (c.id === formTarget ? updated : c)));
        show(t("customers.toast.updated"));
      }
      setFormTarget(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t("customers.saveError");
    }
  };

  const drawerCustomer = formTarget && formTarget !== "new" ? customers.find((c) => c.id === formTarget) ?? null : null;
  const drawerOpen = formTarget === "new" ? canCreate : drawerCustomer !== null;

  const tabs = [
    { key: "all" as const, label: t("customers.filter.all"), count: counts.all },
    { key: "active" as const, label: t("customers.filter.active"), count: counts.active },
    { key: "inactive" as const, label: t("customers.filter.inactive"), count: counts.inactive },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.sales")}
        title={t("customers.pageTitle")}
        description={t("customers.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={canCreate && (
          <button data-tour="customers-create" onClick={() => setFormTarget("new")} className={btn.primary}>
            <Plus size={16} /> {t("customers.addNew")}
          </button>
        )}
      />

      <ListCard>
        {customers.length === 0 ? (
          <div data-tour="customers-table">
            <EmptyState icon={Contact} title={t("empty.customers.title")} description={t("empty.customers.sub")} actionLabel={canCreate ? t("empty.customers.action") : undefined} onAction={canCreate ? () => setFormTarget("new") : undefined} compact />
          </div>
        ) : (
          <>
            <div data-tour="customers-toolbar">
              <div data-tour="customers-tabs">
                <ListTabs tabs={tabs} active={statusTab} onChange={(k) => { setStatusTab(k); setPage(1); }} ariaLabel={t("customers.col.status")} />
              </div>
              <div data-tour="customers-search">
                <ListToolbar
                  search={search}
                  onSearch={(v) => { setSearch(v); setPage(1); }}
                  searchPlaceholder={t("customers.searchPlaceholder")}
                  count={t("ui.itemCount").replace("{n}", String(filtered.length))}
                >
                  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[#3d5173]">
                    <input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }} className="w-[18px] h-[18px] rounded accent-[#0b1d3a]" />
                    {t("customers.showArchived")}
                  </label>
                </ListToolbar>
              </div>
            </div>

            <div data-tour="customers-table">
              {filtered.length === 0 ? (
                <ListEmpty title={t("customers.noFilterResults")} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] table-fixed">
                    <thead>
                      <tr className={table.head}>
                        <th className={table.th}>{t("customers.col.companyName")}</th>
                        <th className={`${table.th} w-[260px]`}>{t("customers.col.contactName")}</th>
                        <th className={`${table.th} w-[150px]`}>{t("customers.col.phone")}</th>
                        <th className={`${table.th} w-[130px]`}>{t("customers.col.status")}</th>
                        <th className={`${table.th} w-[130px]`}>{t("customers.col.updatedAt")}</th>
                        <th className={`${table.th} w-12`}><span className="sr-only">{t("common.edit")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((c) => {
                        const st = customerStatus(c, t);
                        return (
                          <tr key={c.id} onClick={() => setFormTarget(c.id)} className={`${table.row} group cursor-pointer text-sm ${c.isDeleted ? "opacity-60" : ""}`}>
                            <td className={table.td}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setFormTarget(c.id); }}
                                title={c.companyName}
                                className="block max-w-full text-left font-medium text-foreground truncate rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40"
                              >
                                {c.companyName}
                              </button>
                              {c.taxId && (
                                <span className="block text-xs text-muted-foreground truncate">
                                  {t("customers.taxIdLine").split("{taxId}")[0]}<span className="font-mono">{c.taxId}</span>
                                </span>
                              )}
                            </td>
                            <td className={table.td}>
                              <span className={`block truncate ${c.contactName ? "text-foreground" : "text-[#8a97ad]"}`}>{c.contactName || "—"}</span>
                              <span className={`block text-xs truncate ${c.email ? "text-muted-foreground" : "text-[#8a97ad]"}`} title={c.email || undefined}>{c.email || t("customers.noEmail")}</span>
                            </td>
                            <td className={`${table.td} text-[#3d5173] tabular-nums whitespace-nowrap`}>{c.phone || "—"}</td>
                            <td className={table.td}><StatusBadge status={st.status} label={st.label} /></td>
                            <td className={`${table.td} text-[#3d5173] whitespace-nowrap`}>{fmtCustomerDate(c.updatedAt)}</td>
                            <td className={`${table.td} text-right`}>
                              <ChevronRight size={18} aria-hidden="true" className="inline text-[#a3aec2] group-hover:text-foreground transition-colors" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {filtered.length > 0 && (
              <ListPagination
                page={currentPage}
                pageCount={pageCount}
                from={(currentPage - 1) * PAGE_SIZE + 1}
                to={Math.min(currentPage * PAGE_SIZE, filtered.length)}
                total={filtered.length}
                onPage={setPage}
              />
            )}
          </>
        )}
      </ListCard>

      {drawerOpen && (
        <CustomerDrawer
          key={formTarget ?? ""}
          customer={drawerCustomer}
          canEdit={formTarget === "new" ? canCreate : canEdit}
          canArchive={canArchive}
          locked={deactivateTarget !== null || archiveTarget !== null}
          onSave={handleSave}
          onClose={() => setFormTarget(null)}
          onToggleActive={(c) => (c.isActive ? setDeactivateTarget(c) : void handleToggleActive(c.id))}
          onArchiveToggle={setArchiveTarget}
        />
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        title={t("customers.action.confirmDeactivateTitle")}
        message={t("customers.action.confirmDeactivateMessage")}
        confirmLabel={t("customers.action.deactivate")}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={() => { if (deactivateTarget) void handleToggleActive(deactivateTarget.id); setDeactivateTarget(null); }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget?.isDeleted ? t("customers.unarchiveConfirmTitle") : t("customers.archiveConfirmTitle")}
        message={archiveTarget?.isDeleted ? t("customers.unarchiveConfirmMessage") : t("customers.archiveConfirmMessage")}
        confirmLabel={archiveTarget?.isDeleted ? t("common.unarchive") : t("common.archive")}
        danger={!archiveTarget?.isDeleted}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => {
          if (archiveTarget) {
            void handleArchiveToggle(archiveTarget.id);
            if (!archiveTarget.isDeleted && !showArchived) setFormTarget(null);
          }
          setArchiveTarget(null);
        }}
      />

      <Toast message={message} />
    </div>
  );
}
