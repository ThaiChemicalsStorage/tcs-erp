import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { receivingReportCodeOf, RECEIVING_REPORT_CODE_LABEL_KEY, type ReceivingReportSummary, type ReceivingReportStatus } from "../../lib/receivingReport";
import { fmt } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import { PAGE_CLASS, Pill, ListDateRangeSelect, rowOpenClass } from "./receivingUi";
import { paginate, rowOpenProps } from "./receivingFormat";
import { formatDisplayDate } from "../../lib/displayDate";

type Tab = "all" | ReceivingReportStatus;

/** ใบรับสินค้ามีแค่สองสถานะ — เปิดอยู่ (ยังรับได้) กับปิดแล้ว ไม่มีขั้นอนุมัติ */
export function ReceivingReportStatusPill({ status }: { status: ReceivingReportStatus }) {
  const { t } = useI18n();
  return status === "Open"
    ? <Pill tone="amber" label={t("receivingReport.status.open")} />
    : <Pill tone="green" label={t("receivingReport.status.closed")} />;
}

export function ReceivingReportList({
  receivingReports, currentUserId, onOpen, headerAction,
}: {
  receivingReports: ReceivingReportSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  // ปุ่มสร้างมีเฉพาะผู้มีสิทธิ์ และตารางมีเฉพาะเมื่อมีใบ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="rr-create"]', manual: "ch23-1", popover: { title: t("tour.rr.create.title"), description: t("tour.rr.create.desc"), side: "bottom" } },
    { element: '[data-tour="rr-tabs"]', manual: "ch23", popover: { title: t("tour.rr.tabs.title"), description: t("tour.rr.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="rr-filters"]', manual: "ch2-6", popover: { title: t("tour.rr.filters.title"), description: t("tour.rr.filters.desc"), side: "bottom" } },
    { element: '[data-tour="rr-table"]', manual: "ch23", popover: { title: t("tour.rr.table.title"), description: t("tour.rr.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("receivingReport", currentUserId, tourSteps);
  const [tab, setTab] = useState<Tab>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = searchQuery.trim().toLowerCase();
  const withReset = <V,>(set: (v: V) => void) => (v: V) => { set(v); setPage(1); };

  // ตัวกรองในแถบค้นหากรองก่อน แล้วแท็บนับ/กรองต่อจากผลนั้น — ตัวเลขบนแท็บจึงตรงกับสิ่งที่จะเห็นเมื่อกด
  const dateRangeResolved = resolveRange(dateRange);
  const toolbarFiltered = receivingReports
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((r) => !q || [r.id, r.documentNumber, r.purchaseOrderNumber, r.vendorName, r.jobCode].some((v) => (v ?? "").toLowerCase().includes(q)));
  const filtered = toolbarFiltered.filter((r) => tab === "all" || r.status === tab);
  const paged = paginate(filtered, page);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: t("quotation.filterAll"), count: toolbarFiltered.length },
    { key: "Open", label: t("receivingReport.status.open"), count: toolbarFiltered.filter((r) => r.status === "Open").length },
    { key: "Closed", label: t("receivingReport.status.closed"), count: toolbarFiltered.filter((r) => r.status === "Closed").length },
  ];

  const columns: { label: string; right?: boolean }[] = [
    { label: t("receivingReport.col.id") },
    { label: t("receivingReport.list.vendorPo") },
    { label: t("receivingReport.col.ordered"), right: true },
    { label: t("receivingReport.col.received"), right: true },
    { label: t("receivingReport.col.outstanding"), right: true },
    { label: t("receivingReport.col.status") },
    { label: t("receivingReport.col.updatedAt") },
    { label: "" },
  ];

  return (
    <div className={PAGE_CLASS}>
      <ListPageHeader
        module={t("nav.group.inventory")}
        title={t("receivingReport.pageTitle")}
        description={t("receivingReport.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={headerAction}
      />

      <ListCard>
        <div data-tour="rr-tabs">
          <ListTabs tabs={tabs} active={tab} onChange={withReset(setTab)} ariaLabel={t("receivingReport.col.status")} />
        </div>
        <div data-tour="rr-filters">
          <ListToolbar
            search={searchQuery}
            onSearch={withReset(setSearchQuery)}
            searchPlaceholder={t("receivingReport.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <ListDateRangeSelect value={dateRange} onChange={withReset(setDateRange)} />
          </ListToolbar>
        </div>

        {receivingReports.length === 0 ? (
          <ListEmpty title={t("receivingReport.empty.title")} hint={t("receivingReport.empty.description")} />
        ) : filtered.length === 0 ? (
          <ListEmpty title={t("receivingReport.noFilterResults")} />
        ) : (
          <div data-tour="rr-table" className="overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead>
                <tr className={table.head}>
                  {columns.map((c, i) => (
                    <th key={i} className={c.right ? table.th.replace("text-left", "text-right") : table.th}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((r) => {
                  const code = receivingReportCodeOf(r);
                  return (
                    <tr key={r.id} {...rowOpenProps(() => onOpen(r.id), `${t("receivingReport.openRow")} ${r.documentNumber || r.id}`)} className={`${table.row} group ${rowOpenClass}`}>
                      <td className={`${table.td} whitespace-nowrap`}>
                        <div className="flex flex-col leading-snug">
                          <span className={table.code}>{r.documentNumber || r.id}</span>
                          <span className="text-xs text-muted-foreground">{code} · {t(RECEIVING_REPORT_CODE_LABEL_KEY[code])}</span>
                        </div>
                      </td>
                      <td className={`${table.td} max-w-[320px]`}>
                        <div className="flex flex-col min-w-0 leading-snug">
                          <span className="text-sm font-medium text-foreground truncate" title={r.vendorName}>{r.vendorName || "—"}</span>
                          <span className="text-xs font-mono text-muted-foreground truncate">{r.purchaseOrderNumber || t("receivingReportDoc.blankBadge")}</span>
                        </div>
                      </td>
                      <td className={`${table.td} text-right tabular-nums text-sm text-[#3d5173] whitespace-nowrap`}>{fmt(r.orderedValue)}</td>
                      <td className={`${table.td} text-right tabular-nums text-sm text-foreground whitespace-nowrap`}>{fmt(r.receivedValue)}</td>
                      <td className={`${table.td} text-right tabular-nums text-sm whitespace-nowrap ${r.outstandingValue > 0 ? "font-semibold text-[#8a5a00]" : "text-[#8a97ad]"}`}>{fmt(r.outstandingValue)}</td>
                      <td className={table.td}><ReceivingReportStatusPill status={r.status} /></td>
                      <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{formatDisplayDate(r.updatedAt)}</td>
                      <td className={`${table.td} w-10`}>
                        <ChevronRight size={18} className="text-[#a3aec2] group-hover:text-foreground transition-colors" aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && (
          <ListPagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={filtered.length} onPage={setPage} />
        )}
      </ListCard>
    </div>
  );
}
