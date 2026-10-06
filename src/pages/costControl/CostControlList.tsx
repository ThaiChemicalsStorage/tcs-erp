import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import { type CostControlSummary, type CostControlStatus } from "../../lib/costControl";
import { useI18n } from "../../lib/i18n";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { CostControlDateRangeSelect, CostControlStatusPill } from "./costControlUi";
import { useCostControlStatusLabel } from "./costControlHooks";
import { formatDisplayDate } from "../../lib/displayDate";

const PAGE_SIZE = 25;

type ListTabKey = "all" | CostControlStatus;

// รายการ Cost Control ตามดีไซน์ใหม่ (2026-09-30): แท็บสถานะพร้อมจำนวน → ค้นหา + ช่วงวันที่ → ตาราง → แบ่งหน้า
export function CostControlList({ costControls, currentUserId, onOpen, headerAction }: {
  costControls: CostControlSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel = useCostControlStatusLabel();
  // ปุ่มสร้างมีเฉพาะผู้มีสิทธิ์สร้าง — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="cc-create-excel"]', manual: "ch20-2", popover: { title: t("tour.cc.excel.title"), description: t("tour.cc.excel.desc"), side: "bottom" } },
    { element: '[data-tour="cc-create-blank"]', manual: "ch20-1", popover: { title: t("tour.cc.blank.title"), description: t("tour.cc.blank.desc"), side: "bottom" } },
    { element: '[data-tour="cc-tabs"]', manual: "ch20-5", popover: { title: t("tour.cc.tabs.title"), description: t("tour.cc.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="cc-search"]', manual: "ch2-6", popover: { title: t("tour.cc.search.title"), description: t("tour.cc.search.desc"), side: "bottom" } },
    { element: '[data-tour="cc-table"]', manual: "ch20-3", popover: { title: t("tour.cc.table.title"), description: t("tour.cc.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("costControl", currentUserId, tourSteps);
  const [tab, setTab] = useState<ListTabKey>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = searchQuery.trim().toLowerCase();

  // แท็บนับตามช่วงวันที่และคำค้นที่ใช้อยู่ — ตัวเลขบนแท็บจึงตรงกับสิ่งที่จะเห็นเมื่อกดแท็บนั้น
  const dateRangeResolved = resolveRange(dateRange);
  const base = costControls
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((c) => !q || [c.documentNumber, c.id, c.jobName, c.jobOrder].some((v) => (v ?? "").toLowerCase().includes(q)));
  const filtered = base.filter((c) => tab === "all" || c.status === tab);

  const tabs: { key: ListTabKey; label: string; count: number }[] = [
    { key: "all", label: t("quotation.filterAll"), count: base.length },
    ...(["Draft", "PendingApproval", "Final"] as const).map((s) => ({
      key: s, label: statusLabel(s), count: base.filter((c) => c.status === s).length,
    })),
  ];

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // เปลี่ยนตัวกรองแล้วกลับไปหน้าแรกเสมอ ไม่งั้นค้างอยู่หน้าที่ไม่มีข้อมูล
  const resetPage = <V,>(set: (v: V) => void) => (v: V) => { set(v); setPage(1); };

  const headers = [
    t("costControl.col.id"), t("costControl.col.jobName"), t("costControl.col.jobOrder"),
    t("costControl.col.status"), t("costControl.col.updatedAt"),
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.bd")}
        title={t("costControl.pageTitle")}
        description={t("costControl.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={headerAction}
      />

      <ListCard>
        <div data-tour="cc-tabs">
          <ListTabs tabs={tabs} active={tab} onChange={resetPage(setTab)} ariaLabel={t("costControl.tabsAria")} />
        </div>
        <div data-tour="cc-search">
        <ListToolbar
          search={searchQuery}
          onSearch={resetPage(setSearchQuery)}
          searchPlaceholder={t("costControl.searchPlaceholder")}
          count={t("ui.itemCount").replace("{n}", String(filtered.length))}
        >
          <CostControlDateRangeSelect value={dateRange} onChange={resetPage(setDateRange)} />
        </ListToolbar>
        </div>

        <div data-tour="cc-table" className="min-w-0">
        {costControls.length === 0 ? (
          <ListEmpty title={t("costControl.empty.title")} hint={t("costControl.empty.description")} />
        ) : filtered.length === 0 ? (
          <ListEmpty title={t("costControl.noFilterResults")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className={table.head}>
                  {headers.map((h) => <th key={h} className={table.th}>{h}</th>)}
                  <th className={`${table.th} w-10`} aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${t("costControl.openRow")} ${c.documentNumber || c.id}`}
                    onClick={() => onOpen(c.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(c.id); } }}
                    className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                  >
                    <td className={`${table.td} whitespace-nowrap`}><span className={table.code}>{c.documentNumber || c.id}</span></td>
                    <td className={`${table.td} max-w-[420px]`}>
                      <span className="block text-sm font-medium text-foreground truncate" title={c.jobName}>{c.jobName || "—"}</span>
                    </td>
                    <td className={`${table.td} whitespace-nowrap`}>
                      {c.jobOrder
                        ? <span className="font-mono text-[13px] text-[#3d5173]">{c.jobOrder}</span>
                        : <span className="text-[#8a97ad]">—</span>}
                    </td>
                    <td className={table.td}><CostControlStatusPill status={c.status} /></td>
                    <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{formatDisplayDate(c.updatedAt)}</td>
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
