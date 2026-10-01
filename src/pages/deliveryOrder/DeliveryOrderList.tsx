import { useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import type { DeliveryOrderListItem, DeliveryOrderStatus } from "../../lib/deliveryOrder";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ApprovalStatusPill, ListDateRangeSelect } from "../scopeOfWork/sowDoShared";

const PAGE_SIZE = 25;
const thRight = table.th.replace("text-left", "text-right");

type ListTabKey = "all" | DeliveryOrderStatus;

// แสดงรายการใบส่งมอบสินค้า พร้อมแท็บสถานะ ค้นหา และกรองช่วงวันที่ (ดีไซน์ใหม่ 2026-09-30)
// Renders the delivery order list with status tabs, search, a date-range filter, and a paged table
export function DeliveryOrderList({
  deliveryOrders,
  currentUserId,
  onOpen,
}: {
  deliveryOrders: DeliveryOrderListItem[];
  currentUserId: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const tourSteps: TourStep[] = [
    { element: '[data-tour="do-create-hint"]', manual: "ch9-1", popover: { title: t("tour.do.create.title"), description: t("tour.do.create.desc"), side: "bottom" } },
    { element: '[data-tour="do-summary"]', manual: "ch9-4", popover: { title: t("tour.do.tabs.title"), description: t("tour.do.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="do-filters"]', manual: "ch2-6", popover: { title: t("tour.do.filters.title"), description: t("tour.do.filters.desc"), side: "bottom" } },
    { element: '[data-tour="do-table"]', manual: "ch9-1", popover: { title: t("tour.do.table.title"), description: t("tour.do.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("deliveryOrder", currentUserId, tourSteps);

  const [tab, setTab] = useState<ListTabKey>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = deliveryOrders.map((d) => ({
    ...d,
    scopeNumber: d.scopeNumber ?? "",
    customerCompanyName: d.customerCompanyName ?? "",
    status: d.status ?? "Draft",
  }));

  const tabs: { key: ListTabKey; label: string; count: number }[] = [
    { key: "all", label: t("quotation.filterAll"), count: items.length },
    { key: "Draft", label: "Draft", count: items.filter((d) => d.status === "Draft").length },
    { key: "PendingApproval", label: t("approval.step.pending"), count: items.filter((d) => d.status === "PendingApproval").length },
    { key: "Final", label: "Final", count: items.filter((d) => d.status === "Final").length },
  ];

  const dateRangeResolved = resolveRange(dateRange);
  const filtered = items
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((d) => tab === "all" || d.status === tab)
    .filter((d) => !normalizedSearch || [d.scopeNumber, d.customerCompanyName].some((v) => v.toLowerCase().includes(normalizedSearch)));

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.sales")}
        title={t("deliveryOrder.pageTitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={
          <p data-tour="do-create-hint" className="max-w-[460px] text-[13px] leading-relaxed text-muted-foreground flex items-start gap-2 sm:text-right">
            <Info size={16} className="text-[#1a5fb4] flex-shrink-0 mt-0.5" />
            <span>{t("deliveryOrder.empty.description")}</span>
          </p>
        }
      />

      <ListCard>
        <div data-tour="do-summary">
          <ListTabs tabs={tabs} active={tab} onChange={resetPage(setTab)} ariaLabel={t("deliveryOrder.tabsAria")} />
        </div>
        <div data-tour="do-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={resetPage(setSearchQuery)}
            searchPlaceholder={t("deliveryOrder.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <ListDateRangeSelect value={dateRange} onChange={resetPage(setDateRange)} />
          </ListToolbar>
        </div>

        <div data-tour="do-table" className="min-w-0">
          {deliveryOrders.length === 0 ? (
            <ListEmpty title={t("deliveryOrder.empty.title")} hint={t("deliveryOrder.empty.description")} />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("deliveryOrder.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("deliveryOrder.col.scopeNumber")}</th>
                    <th className={table.th}>{t("deliveryOrder.col.customer")}</th>
                    <th className={thRight}>{t("deliveryOrder.col.installmentCount")}</th>
                    <th className={table.th}>{t("deliveryOrder.col.status")}</th>
                    <th className={table.th}>{t("deliveryOrder.col.updatedAt")}</th>
                    <th className={`${table.th} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((d) => (
                    <tr
                      key={d.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${t("deliveryOrder.openRow")} ${d.scopeNumber}`}
                      onClick={() => onOpen(d.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(d.id);
                        }
                      }}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} ${table.code} whitespace-nowrap`}>{d.scopeNumber}</td>
                      <td className={`${table.td} max-w-[360px]`}>
                        <span className="block text-sm font-medium text-foreground truncate" title={d.customerCompanyName}>{d.customerCompanyName}</span>
                      </td>
                      <td className={`${table.td} text-right tabular-nums text-[#3d5173]`}>{d.installmentCount}</td>
                      <td className={table.td}><ApprovalStatusPill status={d.status} /></td>
                      <td className={`${table.td} text-[13px] text-muted-foreground whitespace-nowrap`}>{formatQuoteDateThai(d.updatedAt)}</td>
                      <td className={table.td}>
                        <ChevronRight size={16} className="text-[#a3aec2] group-hover:text-foreground transition-colors ml-auto" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
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
      </ListCard>
    </div>
  );
}
