import { useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import type { ServiceReportListItem, ServiceReportStatus } from "../../lib/serviceReports";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { DateRangeFilter } from "../../components/DateRangeFilter";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { btn, table } from "../../components/ui/styles";
import { ServiceStatusBadge } from "./serviceUi";

const FILTER_ALL = "all";
type StatusTab = typeof FILTER_ALL | ServiceReportStatus;
const PAGE_SIZE = 20;

// แสดงตารางรายการรายงานบริการ — ดีไซน์ใหม่ (บอร์ด ServiceList): แท็บสถานะพร้อมจำนวน → ค้นหา/ช่วงวันที่ → ตาราง → แบ่งหน้า
// Renders the Service Report list — REDESIGN board ServiceList: status tabs with counts → search/date → table → pagination.
export function ServiceList({
  serviceReports,
  currentUserId,
  canCreate,
  onOpen,
  onCreate,
}: {
  serviceReports: ServiceReportListItem[];
  currentUserId: string;
  canCreate: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="service-summary"]', popover: { title: t("tour.service.summary.title"), description: t("tour.service.summary.desc"), side: "bottom" } },
    { element: '[data-tour="service-filters"]', popover: { title: t("tour.service.filters.title"), description: t("tour.service.filters.desc"), side: "bottom" } },
    { element: '[data-tour="service-table"]', popover: { title: t("tour.service.table.title"), description: t("tour.service.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("service", currentUserId, tourSteps);

  const [filterStatus, setFilterStatus] = useState<StatusTab>(FILTER_ALL);
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const dateRangeResolved = resolveRange(dateRange);
  // ตัวเลขบนแท็บนับหลังกรองวันที่/คำค้น แต่ก่อนกรองสถานะ — แท็บตอบว่า "ในผลค้นหานี้ มีสถานะไหนกี่ใบ"
  const searched = serviceReports
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((s) => !normalizedSearch || [s.id, s.customerName, s.serviceLocation, s.serviceSystemName, s.projectOrJobCode, s.assignedServiceEngineerName]
      .some((v) => v.toLowerCase().includes(normalizedSearch)));
  const filtered = searched.filter((s) => filterStatus === FILTER_ALL || s.status === filterStatus);
  const countOf = (s: ServiceReportStatus) => searched.filter((r) => r.status === s).length;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 pt-6 pb-8 flex flex-col gap-5">
      <ListPageHeader
        module={t("service.pageTitle")}
        title={t("service.listTitle")}
        // The replay button sits outside the canCreate gate on purpose — a read-only role needs
        // the walkthrough as much as anyone, and this must never be conditional on tour state.
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={canCreate && (
          <button type="button" onClick={onCreate} className={btn.primary}>
            <Plus size={16} /> {t("service.newReport")}
          </button>
        )}
      />

      <ListCard>
        <div data-tour="service-summary">
          <ListTabs<StatusTab>
            ariaLabel={t("service.tabsAria")}
            active={filterStatus}
            onChange={resetPage(setFilterStatus)}
            tabs={[
              { key: FILTER_ALL, label: t("quotation.filterAll"), count: searched.length },
              { key: "Draft", label: t("service.status.draft"), count: countOf("Draft") },
              { key: "Completed", label: t("service.status.completed"), count: countOf("Completed") },
              { key: "Cancelled", label: t("service.status.cancelled"), count: countOf("Cancelled") },
            ]}
          />
        </div>
        <div data-tour="service-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={resetPage(setSearchQuery)}
            searchPlaceholder={t("service.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <DateRangeFilter value={dateRange} onChange={resetPage(setDateRange)} />
          </ListToolbar>
        </div>

        <div data-tour="service-table">
          {serviceReports.length === 0 ? (
            <ListEmpty
              title={t("service.empty.title")}
              hint={t("service.empty.description")}
              action={canCreate ? (
                <button type="button" onClick={onCreate} className={btn.primary}><Plus size={16} /> {t("service.newReport")}</button>
              ) : undefined}
            />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("service.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className={table.head}>
                    <th className={`${table.th} w-[170px]`}>{t("service.col.reportNo")}</th>
                    <th className={table.th}>{t("service.col.customerLocation")}</th>
                    <th className={`${table.th} w-[210px]`}>{t("service.col.system")}</th>
                    <th className={`${table.th} w-[150px]`}>{t("service.col.engineer")}</th>
                    <th className={`${table.th} w-[128px]`}>{t("service.col.inspectionDate")}</th>
                    <th className={`${table.th} w-[110px]`}>{t("service.col.status")}</th>
                    <th className={`${table.th} w-[118px]`}>{t("service.col.updatedAt")}</th>
                    <th className={`${table.th} w-10`}><span className="sr-only">{t("service.openRow")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => (
                    <tr
                      key={s.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${t("service.openRow")} ${s.id}`}
                      onClick={() => onOpen(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(s.id);
                        }
                      }}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} ${table.code} whitespace-nowrap`}>{s.id}</td>
                      <td className={`${table.td} max-w-0`}>
                        <span className="flex flex-col min-w-0 leading-snug">
                          <span className="text-sm font-medium text-foreground truncate" title={s.customerName}>{s.customerName || t("common.dash")}</span>
                          {s.serviceLocation && <span className="text-xs text-muted-foreground truncate" title={s.serviceLocation}>{s.serviceLocation}</span>}
                        </span>
                      </td>
                      <td className={`${table.td} max-w-[210px]`}>
                        <span className="block text-sm text-foreground truncate" title={s.serviceSystemName}>{s.serviceSystemName || t("common.dash")}</span>
                      </td>
                      <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap max-w-[150px] truncate`}>{s.assignedServiceEngineerName || t("common.dash")}</td>
                      <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{formatQuoteDateThai(s.inspectionDate) || t("common.dash")}</td>
                      <td className={table.td}><ServiceStatusBadge status={s.status} /></td>
                      <td className={`${table.td} text-[13px] text-muted-foreground whitespace-nowrap`}>{formatQuoteDateThai(s.updatedAt)}</td>
                      <td className={`${table.td} text-[#a3aec2] group-hover:text-foreground`}><ChevronRight size={16} className="ml-auto" /></td>
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
            to={(currentPage - 1) * PAGE_SIZE + pageRows.length}
            total={filtered.length}
            onPage={setPage}
          />
        )}
      </ListCard>
    </div>
  );
}
