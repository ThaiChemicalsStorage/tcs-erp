import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import type { MaterialRequisitionSummary, MaterialRequisitionStatus } from "../../lib/materialRequisition";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ApprovalPill, ListDateRangeSelect, Tag, paginate, rowOpenProps, useApprovalStatusLabel } from "../project/projectUi";

type TabKey = "all" | MaterialRequisitionStatus;

// แสดงตารางรายการใบเบิกและใบคืนวัสดุ พร้อมแท็บสถานะ ช่องค้นหา และตัวกรองช่วงวันที่ (ดีไซน์ใหม่ 2026-09-30)
// Renders the Material Requisition list: status tabs with counts, search + date-range toolbar, paged table.
export function MaterialRequisitionList({
  materialRequisitions,
  currentUserId,
  onOpen,
  headerAction,
  moduleLabel,
}: {
  materialRequisitions: MaterialRequisitionSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  /** ปุ่ม "+ สร้าง" ของหน้านั้นๆ — หน้า Page เป็นเจ้าของ state ของกล่องเลือกต้นทาง (2026-08-20) */
  headerAction?: ReactNode;
  /** ชื่อกลุ่มเมนูเล็กเหนือชื่อหน้า — หน้านี้ถูกเมาต์ทั้งใต้ "โครงการ" และ "ผลิต" */
  moduleLabel?: string;
}) {
  const { t } = useI18n();
  const statusLabel = useApprovalStatusLabel();
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="mr-filters"]', popover: { title: t("tour.mr.filters.title"), description: t("tour.mr.filters.desc"), side: "bottom" } },
    { element: '[data-tour="mr-table"]', popover: { title: t("tour.mr.table.title"), description: t("tour.mr.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("materialRequisition", currentUserId, tourSteps);
  const [tab, setTab] = useState<TabKey>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = materialRequisitions.map((m) => ({
    ...m,
    documentNumber: m.documentNumber || m.id,
    jobCode: m.jobCode ?? "", productionOrderId: m.productionOrderId ?? "", status: m.status ?? "Draft",
    chargeTo: [m.chargeDepartmentName, m.chargeTeamName].filter(Boolean).join(" / "),
  }));
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all", label: t("quotation.filterAll"), count: items.length },
    ...(["Draft", "PendingApproval", "Final"] as const).map((s) => ({ key: s, label: statusLabel(s), count: items.filter((m) => m.status === s).length })),
  ];
  const dateRangeResolved = resolveRange(dateRange);
  const filtered = items
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((m) => tab === "all" || m.status === tab)
    .filter((m) => !normalizedSearch || [m.id, m.documentNumber, m.jobCode, m.productionOrderId, m.chargeTo, m.chargeWorkTypeName ?? ""].some((v) => v.toLowerCase().includes(normalizedSearch)));
  const paged = paginate(filtered, page);
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const dash = <span className="text-[#8a97ad]">—</span>;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={moduleLabel ?? t("nav.group.project")}
        title={
          <span className="inline-flex items-center gap-3 flex-wrap">
            {t("materialRequisition.pageTitle")}
            <span title={t("project.list.formCode")} className="h-[22px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold font-mono inline-flex items-center">{t("materialRequisition.pageSubtitle")}</span>
          </span>
        }
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={headerAction}
      />

      <ListCard>
        <ListTabs tabs={tabs} active={tab} onChange={resetPage(setTab)} ariaLabel={t("materialRequisition.list.tabsAria")} />
        <div data-tour="mr-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={resetPage(setSearchQuery)}
            searchPlaceholder={t("materialRequisition.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <ListDateRangeSelect value={dateRange} onChange={resetPage(setDateRange)} />
          </ListToolbar>
        </div>

        <div data-tour="mr-table" className="min-w-0">
          {items.length === 0 ? (
            <ListEmpty title={t("materialRequisition.empty.title")} hint={t("materialRequisition.empty.description")} />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("materialRequisition.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("materialRequisition.col.id")}</th>
                    <th className={table.th}>{t("materialRequisition.col.productionOrder")}</th>
                    <th className={table.th}>{t("materialRequisition.col.jobCode")}</th>
                    <th className={table.th}>{t("materialRequisition.col.chargeTo")}</th>
                    <th className={table.th}>{t("materialRequisition.col.status")}</th>
                    <th className={table.th}>{t("materialRequisition.col.updatedAt")}</th>
                    <th className={`${table.th} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((m) => (
                    <tr
                      key={m.id}
                      {...rowOpenProps(() => onOpen(m.id), `${t("materialRequisition.openRow")} ${m.documentNumber}`)}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                    >
                      <td className={`${table.td} whitespace-nowrap`}>
                        <span className={`block ${table.code}`}>{m.documentNumber}</span>
                        {/* เลขบนฟอร์มถูกพิมพ์ทับ — โชว์เลขรันของระบบไว้ใต้เลข ให้ค้นเจอทั้งสองทาง */}
                        {m.documentNumber !== m.id && <span className="block font-mono text-xs text-muted-foreground">{m.id}</span>}
                      </td>
                      <td className={`${table.td} font-mono text-[13px] whitespace-nowrap`}>{m.productionOrderId || dash}</td>
                      <td className={`${table.td} font-mono text-[13px] whitespace-nowrap`}>{m.jobCode || dash}</td>
                      <td className={`${table.td} max-w-[260px]`}>
                        <span className="block text-sm text-foreground truncate">{m.chargeTo || dash}</span>
                        {m.chargeWorkTypeName && <span className="block text-xs text-muted-foreground truncate">{m.chargeWorkTypeName}</span>}
                      </td>
                      <td className={table.td}>
                        <span className="flex items-center gap-1.5">
                          <ApprovalPill status={m.status} />
                          {m.hasOutstanding && <Tag tone="amber">{t("materialRequisition.outstandingBadge")}</Tag>}
                        </span>
                      </td>
                      <td className={`${table.td} text-[13px] text-muted-foreground whitespace-nowrap`}>{formatQuoteDateThai(m.updatedAt)}</td>
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
