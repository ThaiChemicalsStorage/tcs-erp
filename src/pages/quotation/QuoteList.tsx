import { useState, type KeyboardEvent } from "react";
import { Plus, Target, X, ChevronRight } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, FilterSelect, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { btn, table } from "../../components/ui/styles";
import { type Quote, type QuoteStatus, type QuoteInterest, type QuotationListFilter, statusLabelKey, isRevisionQuote, fmt } from "../../lib/quotes";
import { QuoteStatusPill } from "./statusIcons";
import type { JobType } from "../../lib/jobTypes";
import { InterestButtons } from "./InterestButtons";
import { useI18n } from "../../lib/i18n";

const FILTER_ALL = "all";
const PAGE_SIZE = 20;

const statuses: QuoteStatus[] = [
  "ร่าง",
  "รออนุมัติ",
  "อนุมัติแล้ว",
  "ส่งให้ลูกค้าแล้ว",
  "ลูกค้ายอมรับ",
  "ปิดการขายสำเร็จ",
  "ลูกค้าปฏิเสธ",
  "เสียโอกาส",
  "ยกเลิก",
];

/**
 * แท็บของหน้ารายการ (ดีไซน์ใหม่ 2026-09-30) — แทนการ์ดสรุป 6 ใบเดิม (ทั้งหมด/รออนุมัติ/อนุมัติแล้ว/น่าสนใจ/
 * โอกาสในการขาย/ใบแก้ไข) ด้วยชุดเดียวกันแต่กดกรองได้ · สถานะอื่นทั้ง 9 ค่ายังกรองได้จากตัวเลือก "สถานะ" ในแถบค้นหา
 */
type ListTabKey = "all" | "pending" | "approved" | "interested" | "opportunity" | "revisions";
const TAB_MATCH: Record<ListTabKey, (q: Quote) => boolean> = {
  all: () => true,
  pending: (q) => q.status === "รออนุมัติ",
  approved: (q) => q.status === "อนุมัติแล้ว",
  interested: (q) => q.interest === "น่าสนใจ",
  opportunity: (q) => q.isPotentialOpportunity,
  revisions: (q) => isRevisionQuote(q.id),
};

// หน้ารายการใบเสนอราคาทั้งหมด: แท็บพร้อมจำนวน ค้นหา ตัวกรอง และตาราง (ทั้งแถวกดเปิดเอกสาร)
// Lists all quotations: count tabs, search, filters, and a table whose whole row opens the document
export function QuoteList({
  quotes,
  jobTypes,
  initialFilter,
  currentUserId,
  onOpen,
  onCreateNew,
  onInterestChange,
}: {
  quotes: Quote[];
  jobTypes: JobType[];
  initialFilter: QuotationListFilter | null;
  currentUserId: string;
  onOpen: (id: string) => void;
  onCreateNew: () => void;
  onInterestChange: (id: string, v: QuoteInterest) => void;
}) {
  const { t } = useI18n();

  const tourSteps: TourStep[] = [
    { element: '[data-tour="quotation-create"]', manual: "ch6-1", popover: { title: t("tour.quotation.create.title"), description: t("tour.quotation.create.desc"), side: "bottom" } },
    { element: '[data-tour="quotation-summary"]', manual: "ch6-6", popover: { title: t("tour.quotation.tabs.title"), description: t("tour.quotation.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="quotation-filters"]', manual: "ch6-6", popover: { title: t("tour.quotation.filters.title"), description: t("tour.quotation.filters.desc"), side: "bottom" } },
    { element: '[data-tour="quotation-table"]', manual: "ch6-6", popover: { title: t("tour.quotation.table.title"), description: t("tour.quotation.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("quotation", currentUserId, tourSteps);
  // ลิงก์จากแดชบอร์ดที่ขอ "รออนุมัติ"/"อนุมัติแล้ว" เปิดแท็บนั้นเลย สถานะอื่นไปอยู่ที่ตัวกรองสถานะ
  const initialStatus = initialFilter?.status;
  const [tab, setTab] = useState<ListTabKey>(initialStatus === "รออนุมัติ" ? "pending" : initialStatus === "อนุมัติแล้ว" ? "approved" : "all");
  const [filterStatus, setFilterStatus] = useState<string>(
    initialStatus && initialStatus !== "รออนุมัติ" && initialStatus !== "อนุมัติแล้ว" ? initialStatus : FILTER_ALL,
  );
  const [filterJobType, setFilterJobType] = useState<string>(FILTER_ALL);
  const [filterSalesperson, setFilterSalesperson] = useState<string>(FILTER_ALL);
  const [clientFilter, setClientFilter] = useState<string>(initialFilter?.client ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const salespeopleInList = [...new Set(quotes.map((q) => q.salesperson).filter((s) => s.trim()))].sort();

  // ตัวกรองในแถบค้นหากรองก่อน แล้วแท็บนับ/กรองต่อจากผลนั้น — ตัวเลขบนแท็บจึงตรงกับสิ่งที่จะเห็นเมื่อกด
  const toolbarFiltered = quotes
    .filter((q) => filterStatus === FILTER_ALL || q.status === filterStatus)
    .filter((q) => filterJobType === FILTER_ALL || q.jobTypeCode === filterJobType)
    .filter((q) => filterSalesperson === FILTER_ALL || q.salesperson === filterSalesperson)
    .filter((q) => !clientFilter || q.client === clientFilter)
    .filter((q) => !normalizedSearch || [q.id, q.client, q.salesperson, q.poRef].some((v) => v.toLowerCase().includes(normalizedSearch)));
  const filtered = toolbarFiltered.filter(TAB_MATCH[tab]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // เปลี่ยนตัวกรองใด ๆ แล้วกลับไปหน้าแรกเสมอ ไม่งั้นอาจค้างอยู่หน้าที่ไม่มีแถวแล้ว
  const withReset = <V,>(set: (v: V) => void) => (v: V) => { set(v); setPage(1); };

  const tabs = ([
    { key: "all", label: t("quotation.filterAll") },
    { key: "pending", label: t("quotation.status.pendingApproval") },
    { key: "approved", label: t("quotation.status.approved") },
    { key: "interested", label: t("quotation.interest.interested") },
    { key: "opportunity", label: t("quotation.tab.opportunity") },
    { key: "revisions", label: t("quotation.revisionCount") },
  ] as { key: ListTabKey; label: string }[]).map((tb) => ({ ...tb, count: toolbarFiltered.filter(TAB_MATCH[tb.key]).length }));

  const openOnKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(id); }
  };

  const columns: { label: string; right?: boolean }[] = [
    { label: t("quotation.col.id") },
    { label: t("quotation.col.client") },
    { label: t("quotation.col.jobType") },
    { label: t("quotation.col.salesperson") },
    { label: t("quotation.col.date") },
    { label: t("quotation.col.amount"), right: true },
    { label: t("quotation.col.status") },
    { label: t("quotation.col.interest") },
    { label: "" },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.sales")}
        title={t("quotation.pageTitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={
          <button type="button" data-tour="quotation-create" onClick={onCreateNew} className={btn.primary}>
            <Plus size={16} /> {t("quotation.createNew")}
          </button>
        }
      />

      <ListCard>
        <div data-tour="quotation-summary">
          <ListTabs tabs={tabs} active={tab} onChange={withReset(setTab)} ariaLabel={t("quotation.tab.ariaLabel")} />
        </div>
        <div data-tour="quotation-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={withReset(setSearchQuery)}
            searchPlaceholder={t("quotation.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <FilterSelect
              label={t("quotation.field.jobType")}
              value={filterJobType}
              onChange={withReset(setFilterJobType)}
              options={[{ value: FILTER_ALL, label: t("quotation.filterAll") }, ...jobTypes.map((jt) => ({ value: jt.code, label: `${jt.code} — ${jt.name}` }))]}
            />
            <FilterSelect
              label={t("quotation.col.salesperson")}
              value={filterSalesperson}
              onChange={withReset(setFilterSalesperson)}
              options={[{ value: FILTER_ALL, label: t("quotation.filterAll") }, ...salespeopleInList.map((name) => ({ value: name, label: name }))]}
            />
            <FilterSelect
              label={t("quotation.col.status")}
              value={filterStatus}
              onChange={withReset(setFilterStatus)}
              options={[{ value: FILTER_ALL, label: t("quotation.filterAll") }, ...statuses.map((s) => ({ value: s, label: t(statusLabelKey[s]) }))]}
            />
            {clientFilter && (
              <button
                type="button"
                onClick={() => { setClientFilter(""); setPage(1); }}
                className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg bg-[#e8f0fb] text-[#1a5fb4] text-sm font-medium hover:bg-[#dbe7f8] transition-colors"
              >
                {t("quotation.col.client")}: {clientFilter} <X size={14} />
              </button>
            )}
          </ListToolbar>
        </div>

        <div data-tour="quotation-table">
          {quotes.length === 0 ? (
            <ListEmpty
              title={t("empty.quotations.title")}
              hint={t("empty.quotations.sub")}
              action={<button type="button" onClick={onCreateNew} className={btn.primary}><Plus size={16} /> {t("empty.quotations.action")}</button>}
            />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("quotation.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px]">
                <thead>
                  <tr className={table.head}>
                    {columns.map((c, i) => (
                      <th key={i} className={c.right ? table.th.replace("text-left", "text-right") : table.th}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((q) => (
                    <tr
                      key={q.id}
                      tabIndex={0}
                      onClick={() => onOpen(q.id)}
                      onKeyDown={(e) => openOnKey(e, q.id)}
                      aria-label={`${q.id} — ${q.client}`}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:bg-[#f8f9fc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} ${table.code} whitespace-nowrap`}>{q.id}</td>
                      <td className={`${table.td} max-w-[280px]`}>
                        <div className="flex flex-col min-w-0 leading-snug">
                          <span className="text-sm font-medium text-foreground truncate" title={q.client}>{q.client}</span>
                          {q.project && <span className="text-xs text-muted-foreground truncate" title={q.project}>{q.project}</span>}
                        </div>
                      </td>
                      <td className={`${table.td} whitespace-nowrap`}>
                        {q.jobTypeCode ? (
                          <span className="inline-flex items-center h-[22px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold font-mono">{q.jobTypeCode}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {q.isPotentialOpportunity && (
                          <Target size={13} className="inline-block ml-1.5 text-[#1a5fb4] align-middle" aria-label={t("quotation.tab.opportunity")} />
                        )}
                      </td>
                      <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{q.salesperson || "—"}</td>
                      <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{q.date}</td>
                      <td className={`${table.td} ${table.money} text-sm whitespace-nowrap`}>฿{fmt(q.amount)}</td>
                      <td className={table.td}><QuoteStatusPill status={q.status} label={t(statusLabelKey[q.status])} /></td>
                      <td className={table.td}>
                        <InterestButtons compact value={q.interest} onChange={(v) => onInterestChange(q.id, v)} />
                      </td>
                      <td className={`${table.td} w-10`}>
                        <ChevronRight size={18} className="text-[#a3aec2] group-hover:text-foreground transition-colors" aria-hidden="true" />
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
