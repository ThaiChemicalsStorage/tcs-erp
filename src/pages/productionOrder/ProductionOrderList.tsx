import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import type { ProductionOrderSummary, ProductionOrderStatus } from "../../lib/productionOrder";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ApprovalStatusPill, ListDateRangeSelect } from "../purchaseRequest/docShared";

const PAGE_SIZE = 25;

type ListTabKey = "all" | ProductionOrderStatus;

// ตารางรายการใบสั่งผลิต: แท็บสถานะพร้อมจำนวน ค้นหา ช่วงวันที่ และแบ่งหน้า (ดีไซน์ใหม่ 2026-09-30)
export function ProductionOrderList({
  productionOrders, currentUserId, onOpen, headerAction,
}: {
  productionOrders: ProductionOrderSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  // ปุ่มสร้าง (data-tour="po-create") อยู่ใน headerAction ที่ ProductionOrderPage ส่งมา — มีเฉพาะคนที่มีสิทธิ์สร้าง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="po-create"]', manual: "ch17-2", popover: { title: t("tour.po.create.title"), description: t("tour.po.create.desc"), side: "bottom" } },
    { element: '[data-tour="po-tabs"]', manual: "ch16-5", popover: { title: t("tour.po.tabs.title"), description: t("tour.po.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="po-filters"]', manual: "ch2-6", popover: { title: t("tour.po.filters.title"), description: t("tour.po.filters.desc"), side: "bottom" } },
    { element: '[data-tour="po-table"]', manual: "ch17-1", popover: { title: t("tour.po.table.title"), description: t("tour.po.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("productionOrder", currentUserId, tourSteps);
  const [tab, setTab] = useState<ListTabKey>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = searchQuery.trim().toLowerCase();

  const tabs = [
    { key: "all" as const, label: t("quotation.filterAll"), count: productionOrders.length },
    { key: "Draft" as const, label: t("materialRequisition.status.draft"), count: productionOrders.filter((p) => p.status === "Draft").length },
    { key: "PendingApproval" as const, label: t("materialRequisition.status.pendingApproval"), count: productionOrders.filter((p) => p.status === "PendingApproval").length },
    { key: "Final" as const, label: t("materialRequisition.status.final"), count: productionOrders.filter((p) => p.status === "Final").length },
  ];

  const dateRangeResolved = resolveRange(dateRange);
  const filtered = productionOrders
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((p) => tab === "all" || p.status === tab)
    .filter((p) => !q || [p.id, p.documentNumber, p.jobCode, p.customerCompanyName, p.productName].some((v) => (v ?? "").toLowerCase().includes(q)));

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={<span className="inline-flex items-center gap-2">{t("nav.group.production")}<span className="text-[#c3ccda]">·</span><span className="font-mono text-xs">{t("productionOrder.formCode")}</span></span>}
        title={t("productionOrder.pageTitle")}
        description={t("productionOrder.pageDescription")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={headerAction}
      />

      <ListCard>
        <div data-tour="po-tabs">
          <ListTabs tabs={tabs} active={tab} onChange={resetPage(setTab)} ariaLabel={t("purchaseRequest.tabsAria")} />
        </div>
        <div data-tour="po-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={resetPage(setSearchQuery)}
            searchPlaceholder={t("productionOrder.searchPlaceholder")}
            count={<span role="status" aria-live="polite">{t("purchaseRequest.stageFilter.count").replace("{n}", String(filtered.length))}</span>}
          >
            <ListDateRangeSelect value={dateRange} onChange={resetPage(setDateRange)} />
          </ListToolbar>
        </div>

        <div data-tour="po-table" className="min-w-0">
          {productionOrders.length === 0 ? (
            <ListEmpty title={t("productionOrder.empty.title")} hint={t("productionOrder.empty.description")} />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("productionOrder.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("productionOrder.col.id")}</th>
                    <th className={table.th}>{t("productionOrder.col.jobCode")}</th>
                    <th className={table.th}>{t("productionOrder.col.customer")}</th>
                    <th className={table.th}>{t("productionOrder.col.productName")}</th>
                    <th className={table.th}>{t("productionOrder.col.status")}</th>
                    <th className={table.th}>{t("productionOrder.col.updatedAt")}</th>
                    <th className={`${table.th} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((p) => (
                    <tr
                      key={p.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${t("productionOrder.openRow")} ${p.documentNumber || p.id}`}
                      onClick={() => onOpen(p.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id); } }}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} ${table.code} whitespace-nowrap`}>{p.documentNumber || p.id}</td>
                      <td className={`${table.td} font-mono text-[13px] whitespace-nowrap ${p.jobCode ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{p.jobCode || "—"}</td>
                      <td className={`${table.td} max-w-[260px]`}>
                        <span className="block text-sm font-medium text-foreground truncate" title={p.customerCompanyName}>{p.customerCompanyName || "—"}</span>
                      </td>
                      <td className={`${table.td} max-w-[260px]`}>
                        <span className="block text-sm text-[#3d5173] truncate" title={p.productName}>{p.productName || "—"}</span>
                      </td>
                      <td className={table.td}><ApprovalStatusPill status={p.status} /></td>
                      <td className={`${table.td} text-[13px] text-[#3d5173] whitespace-nowrap`}>{formatQuoteDateThai(p.updatedAt)}</td>
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
