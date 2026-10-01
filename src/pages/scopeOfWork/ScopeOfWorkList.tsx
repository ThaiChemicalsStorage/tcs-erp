import { useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar, FilterSelect } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import { scopePoNumbers, scopeQuotationNumbers, type ScopeOfWorkListItem, type ScopeOfWorkStatus } from "../../lib/scopeOfWork";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ApprovalStatusPill, ListDateRangeSelect } from "./sowDoShared";

const FILTER_ALL = "all";
const PAGE_SIZE = 25;

type ListTabKey = "all" | ScopeOfWorkStatus | "noPo";

// แสดงตารางรายการ Scope of Work พร้อมแท็บสถานะ ตัวกรอง และช่องค้นหา (ดีไซน์ใหม่ 2026-09-30)
// Renders the Scope of Work list: status tabs (incl. "no PO yet"), filters, search, and a paged table.
export function ScopeOfWorkList({
  scopeOfWorks,
  currentUserId,
  onOpen,
}: {
  scopeOfWorks: ScopeOfWorkListItem[];
  currentUserId: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  // ตัวกรอง "ยังไม่มี PO" กลายเป็นแท็บสุดท้าย — ขั้นทัวร์ของมันจึงชี้ไปที่แท็บนั้นตรง ๆ
  const tourSteps: TourStep[] = [
    { element: '[data-tour="sow-create-hint"]', manual: "ch7-1", popover: { title: t("tour.sow.create.title"), description: t("tour.sow.create.desc"), side: "bottom" } },
    { element: '[data-tour="sow-summary"]', manual: "ch7-3", popover: { title: t("tour.sow.tabs.title"), description: t("tour.sow.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="sow-summary"] [role="tab"]:last-child', manual: "ch7-4", popover: { title: t("tour.sow.nopo.title"), description: t("tour.sow.nopo.desc"), side: "bottom" } },
    { element: '[data-tour="sow-filters"]', manual: "ch7-3", popover: { title: t("tour.sow.filters.title"), description: t("tour.sow.filters.desc"), side: "bottom" } },
    { element: '[data-tour="sow-table"]', manual: "ch7-2", popover: { title: t("tour.sow.table.title"), description: t("tour.sow.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("scopeOfWork", currentUserId, tourSteps);

  const [tab, setTab] = useState<ListTabKey>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [filterJobType, setFilterJobType] = useState<string>(FILTER_ALL);
  const [filterSalesperson, setFilterSalesperson] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = scopeOfWorks.map((s) => ({
    ...s,
    scopeNumber: s.scopeNumber ?? "",
    customerName: s.customerName ?? "",
    quotationNumber: s.quotationNumber ?? "",
    jobTypeCode: s.jobTypeCode ?? "",
    quotationSalesperson: s.quotationSalesperson ?? "",
    customerPoNumber: s.customerPoNumber ?? "",
    status: s.status ?? "Draft",
    // เลขทุกเลขของใบนั้นต่อกันแล้ว — ใช้ทั้งแสดงในตารางและค้นหา (หนึ่ง Scope มีได้หลายใบเสนอราคา/PO)
    poNumbersText: scopePoNumbers(s).join(", "),
    quotationNumbersText: scopeQuotationNumbers(s).join(", "),
  }));

  const jobTypesInList = [...new Set(items.map((s) => s.jobTypeCode).filter((c) => c.trim()))].sort();
  const salespeopleInList = [...new Set(items.map((s) => s.quotationSalesperson).filter((n) => n.trim()))].sort();

  // ตัวนับ/แท็บ "ยังไม่มี PO" ตัดสินจากเลขหลักเหมือนเดิม — หน้าจอแก้ไขเขียนเลขแรกลงช่องนั้นเสมอ
  const matchesTab = (s: (typeof items)[number], key: ListTabKey) =>
    key === "all" ? true : key === "noPo" ? !s.customerPoNumber.trim() : s.status === key;

  const tabs: { key: ListTabKey; label: string; count: number }[] = [
    { key: "all", label: t("quotation.filterAll"), count: items.filter((s) => matchesTab(s, "all")).length },
    { key: "Draft", label: "Draft", count: items.filter((s) => matchesTab(s, "Draft")).length },
    { key: "PendingApproval", label: t("approval.step.pending"), count: items.filter((s) => matchesTab(s, "PendingApproval")).length },
    { key: "Final", label: "Final", count: items.filter((s) => matchesTab(s, "Final")).length },
    { key: "noPo", label: t("scopeOfWork.noPoBadge"), count: items.filter((s) => matchesTab(s, "noPo")).length },
  ];

  const dateRangeResolved = resolveRange(dateRange);
  const filtered = items
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((s) => matchesTab(s, tab))
    .filter((s) => filterJobType === FILTER_ALL || s.jobTypeCode === filterJobType)
    .filter((s) => filterSalesperson === FILTER_ALL || s.quotationSalesperson === filterSalesperson)
    .filter((s) => !normalizedSearch || [s.scopeNumber, s.customerName, s.quotationNumbersText, s.poNumbersText, s.jobTypeCode].some((v) => v.toLowerCase().includes(normalizedSearch)));

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // เปลี่ยนตัวกรองแล้วกลับไปหน้าแรกเสมอ ไม่งั้นค้างอยู่หน้าที่ไม่มีข้อมูล
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const headers = [
    t("scopeOfWork.col.scopeNumber"),
    t("scopeOfWork.col.customer"),
    t("scopeOfWork.col.jobType"),
    t("scopeOfWork.col.po"),
    t("scopeOfWork.col.deliveryDate"),
    t("scopeOfWork.col.status"),
    t("scopeOfWork.col.updatedAt"),
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.sales")}
        title="Scope of Work"
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={
          <p data-tour="sow-create-hint" className="max-w-[460px] text-[13px] leading-relaxed text-muted-foreground flex items-start gap-2 sm:text-right">
            <Info size={16} className="text-[#1a5fb4] flex-shrink-0 mt-0.5" />
            <span>{t("scopeOfWork.empty.description")}</span>
          </p>
        }
      />

      <ListCard>
        <div data-tour="sow-summary">
          <ListTabs tabs={tabs} active={tab} onChange={resetPage(setTab)} ariaLabel={t("scopeOfWork.tabsAria")} />
        </div>
        <div data-tour="sow-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={resetPage(setSearchQuery)}
            searchPlaceholder={t("scopeOfWork.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <ListDateRangeSelect value={dateRange} onChange={resetPage(setDateRange)} />
            <FilterSelect
              label={t("scopeOfWork.filterJobType")}
              value={filterJobType}
              options={[{ value: FILTER_ALL, label: t("quotation.filterAll") }, ...jobTypesInList.map((code) => ({ value: code, label: code }))]}
              onChange={resetPage(setFilterJobType)}
            />
            <FilterSelect
              label={t("scopeOfWork.filterSalesperson")}
              value={filterSalesperson}
              options={[{ value: FILTER_ALL, label: t("quotation.filterAll") }, ...salespeopleInList.map((name) => ({ value: name, label: name }))]}
              onChange={resetPage(setFilterSalesperson)}
            />
          </ListToolbar>
        </div>

        <div data-tour="sow-table" className="min-w-0">
          {scopeOfWorks.length === 0 ? (
            <ListEmpty title={t("scopeOfWork.empty.title")} hint={t("scopeOfWork.empty.description")} />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("scopeOfWork.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px]">
                <thead>
                  <tr className={table.head}>
                    {headers.map((h) => <th key={h} className={table.th}>{h}</th>)}
                    <th className={`${table.th} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => (
                    <tr
                      key={s.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${t("scopeOfWork.openRow")} ${s.scopeNumber}`}
                      onClick={() => onOpen(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(s.id);
                        }
                      }}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} max-w-[240px]`}>
                        <span className="flex flex-col min-w-0 leading-snug">
                          <span className={`${table.code} truncate`}>{s.scopeNumber}</span>
                          {s.quotationNumbersText && (
                            <span className="text-xs text-muted-foreground truncate" title={s.quotationNumbersText}>
                              {t("scopeOfWork.fromQuotation")} <span className="font-mono">{s.quotationNumbersText}</span>
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`${table.td} max-w-[300px]`}>
                        <span className="flex flex-col min-w-0 leading-snug">
                          <span className="text-sm font-medium text-foreground truncate" title={s.customerName}>{s.customerName}</span>
                          {s.quotationSalesperson && <span className="text-xs text-muted-foreground truncate">{s.quotationSalesperson}</span>}
                        </span>
                      </td>
                      <td className={table.td}>
                        {s.jobTypeCode ? (
                          <span className="h-[22px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold font-mono inline-flex items-center">{s.jobTypeCode}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={`${table.td} max-w-[180px]`}>
                        {s.poNumbersText ? (
                          <span className="font-mono text-[13px] text-[#3d5173] truncate block" title={s.poNumbersText}>{s.poNumbersText}</span>
                        ) : (
                          <span className="h-[22px] px-2 rounded-md bg-[#fdf3e0] text-[#8a5a00] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap">
                            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#d89614]" />
                            {t("scopeOfWork.noPoBadge")}
                          </span>
                        )}
                      </td>
                      <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{formatQuoteDateThai(s.deliveryDate)}</td>
                      <td className={table.td}><ApprovalStatusPill status={s.status} /></td>
                      <td className={`${table.td} text-[13px] text-muted-foreground whitespace-nowrap`}>{formatQuoteDateThai(s.updatedAt)}</td>
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
