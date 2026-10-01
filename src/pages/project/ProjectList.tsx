import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import type { ProjectListItem, ProjectStatus } from "../../lib/project";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ListDateRangeSelect, ProjectStatusPill, paginate, rowOpenProps, useProjectStatusLabel } from "./projectUi";

type TabKey = "all" | ProjectStatus;

// แสดงตารางรายการโครงการ พร้อมแท็บสถานะ ช่องค้นหา และตัวกรองช่วงวันที่ (ดีไซน์ใหม่ 2026-09-30)
// Renders the Project list: status tabs with counts, search + date-range toolbar, paged table.
export function ProjectList({
  projects,
  currentUserId,
  onOpen,
  headerAction,
}: {
  projects: ProjectListItem[];
  currentUserId: string;
  onOpen: (id: string) => void;
  /** ปุ่ม "+ สร้าง" ของหน้านั้นๆ — ให้หน้า Page เป็นเจ้าของ state ของกล่องเลือกต้นทาง ส่วน List ยังเป็น
   * component แสดงผลล้วนเหมือนเดิม (2026-08-20) */
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel = useProjectStatusLabel();
  // ปุ่ม "สร้างโครงการ" อยู่ใน ProjectPage (headerAction) และขึ้นเฉพาะผู้มีสิทธิ์ — ไม่มีปุ่ม ขั้นนี้ถูกข้ามเอง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="project-create"]', manual: "ch15-1", popover: { title: t("tour.project.create.title"), description: t("tour.project.create.desc"), side: "bottom" } },
    { element: '[data-tour="project-summary"]', manual: "ch15-2", popover: { title: t("tour.project.summary.title"), description: t("tour.project.summary.desc"), side: "bottom" } },
    { element: '[data-tour="project-filters"]', manual: "ch2-6", popover: { title: t("tour.project.filters.title"), description: t("tour.project.filters.desc"), side: "bottom" } },
    { element: '[data-tour="project-table"]', manual: "ch15-2", popover: { title: t("tour.project.table.title"), description: t("tour.project.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("project", currentUserId, tourSteps);
  const [tab, setTab] = useState<TabKey>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = projects.map((p) => ({
    ...p,
    scopeNumber: p.scopeNumber ?? "",
    customerCompanyName: p.customerCompanyName ?? "",
    status: p.status ?? "Planning",
  }));

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: t("quotation.filterAll"), count: items.length },
    ...(["Planning", "InProgress", "Completed"] as const).map((s) => ({ key: s, label: statusLabel(s), count: items.filter((p) => p.status === s).length })),
  ];

  const dateRangeResolved = resolveRange(dateRange);
  const filtered = items
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((p) => tab === "all" || p.status === tab)
    .filter((p) => !normalizedSearch || [p.scopeNumber, p.customerCompanyName].some((v) => v.toLowerCase().includes(normalizedSearch)));
  const paged = paginate(filtered, page);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.project")}
        title={t("project.pageTitle")}
        description={t("project.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={headerAction}
      />

      <ListCard>
        <div data-tour="project-summary">
          <ListTabs tabs={tabs} active={tab} onChange={resetPage(setTab)} ariaLabel={t("project.list.tabsAria")} />
        </div>
        <div data-tour="project-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={resetPage(setSearchQuery)}
            searchPlaceholder={t("project.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <ListDateRangeSelect value={dateRange} onChange={resetPage(setDateRange)} />
          </ListToolbar>
        </div>

        <div data-tour="project-table" className="min-w-0">
          {items.length === 0 ? (
            <ListEmpty title={t("project.empty.title")} hint={t("project.empty.description")} />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("project.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("project.col.jobCode")}</th>
                    <th className={table.th}>{t("project.col.customer")}</th>
                    <th className={`${table.th} text-right`}>{t("project.col.itemCount")}</th>
                    <th className={table.th}>{t("project.col.status")}</th>
                    <th className={table.th}>{t("project.col.updatedAt")}</th>
                    <th className={`${table.th} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((p) => (
                    <tr
                      key={p.id}
                      {...rowOpenProps(() => onOpen(p.id), `${t("project.openRow")} ${p.scopeNumber}`)}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} ${table.code} whitespace-nowrap`}>{p.scopeNumber}</td>
                      <td className={`${table.td} max-w-[360px]`}>
                        <span className="block text-sm font-medium text-foreground truncate" title={p.customerCompanyName}>{p.customerCompanyName}</span>
                      </td>
                      <td className={`${table.td} text-right tabular-nums text-[#3d5173]`}>{p.itemCount}</td>
                      <td className={table.td}><ProjectStatusPill status={p.status} /></td>
                      <td className={`${table.td} text-[13px] text-muted-foreground whitespace-nowrap`}>{formatQuoteDateThai(p.updatedAt)}</td>
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
