import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import type { JobOrderSummary, JobOrderStatus } from "../../lib/jobOrder";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ApprovalPill, ListDateRangeSelect, paginate, rowOpenProps, useApprovalStatusLabel } from "../project/projectUi";

type TabKey = "all" | JobOrderStatus;

// แสดงตารางรายการใบสั่งงาน พร้อมแท็บสถานะ ช่องค้นหา และตัวกรองช่วงวันที่ (ดีไซน์ใหม่ 2026-09-30)
// Renders the Job Order list: status tabs with counts, search + date-range toolbar, paged table.
export function JobOrderList({
  jobOrders,
  currentUserId,
  onOpen,
  headerAction,
}: {
  jobOrders: JobOrderSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  /** ปุ่ม "+ สร้าง" ของหน้านั้นๆ — หน้า Page เป็นเจ้าของ state ของกล่องเลือกต้นทาง (2026-08-20) */
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel = useApprovalStatusLabel();
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="jo-filters"]', popover: { title: t("tour.jo.filters.title"), description: t("tour.jo.filters.desc"), side: "bottom" } },
    { element: '[data-tour="jo-table"]', popover: { title: t("tour.jo.table.title"), description: t("tour.jo.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("jobOrder", currentUserId, tourSteps);
  const [tab, setTab] = useState<TabKey>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = jobOrders.map((j) => ({ ...j, jobCode: j.jobCode ?? "", status: j.status ?? "Draft" }));
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: t("quotation.filterAll"), count: items.length },
    ...(["Draft", "PendingApproval", "Final"] as const).map((s) => ({ key: s, label: statusLabel(s), count: items.filter((j) => j.status === s).length })),
  ];
  const dateRangeResolved = resolveRange(dateRange);
  const filtered = items
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((j) => tab === "all" || j.status === tab)
    .filter((j) => !normalizedSearch || [j.id, j.jobCode].some((v) => v.toLowerCase().includes(normalizedSearch)));
  const paged = paginate(filtered, page);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={
          <span className="inline-flex items-center gap-2">
            {t("nav.group.project")}
            <span className="text-[#c3ccda]" aria-hidden="true">·</span>
            <span className="font-mono text-xs" title={t("project.list.formCode")}>{t("jobOrder.pageSubtitle")}</span>
          </span>
        }
        title={t("jobOrder.pageTitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={headerAction}
      />

      <ListCard>
        <ListTabs tabs={tabs} active={tab} onChange={resetPage(setTab)} ariaLabel={t("jobOrder.list.tabsAria")} />
        <div data-tour="jo-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={resetPage(setSearchQuery)}
            searchPlaceholder={t("jobOrder.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <ListDateRangeSelect value={dateRange} onChange={resetPage(setDateRange)} />
          </ListToolbar>
        </div>

        <div data-tour="jo-table" className="min-w-0">
          {items.length === 0 ? (
            <ListEmpty title={t("jobOrder.empty.title")} hint={t("jobOrder.empty.description")} />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("jobOrder.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("jobOrder.col.id")}</th>
                    <th className={table.th}>{t("jobOrder.col.jobCode")}</th>
                    <th className={table.th}>{t("jobOrder.col.status")}</th>
                    <th className={table.th}>{t("jobOrder.col.updatedAt")}</th>
                    <th className={`${table.th} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((j) => (
                    <tr
                      key={j.id}
                      {...rowOpenProps(() => onOpen(j.id), `${t("jobOrder.openRow")} ${j.id}`)}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} ${table.code} whitespace-nowrap`}>{j.id}</td>
                      <td className={`${table.td} font-mono text-[13px] text-[#3d5173] whitespace-nowrap`}>{j.jobCode || <span className="text-[#8a97ad]">—</span>}</td>
                      <td className={table.td}><ApprovalPill status={j.status} /></td>
                      <td className={`${table.td} text-[13px] text-muted-foreground whitespace-nowrap`}>{formatQuoteDateThai(j.updatedAt)}</td>
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
          <ListPagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={filtered.length} onPage={setPage} />
        )}
      </ListCard>
    </div>
  );
}
