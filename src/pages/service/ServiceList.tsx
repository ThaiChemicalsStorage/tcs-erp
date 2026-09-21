import { useState } from "react";
import { Wrench, Search, X, Plus } from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { EmptyState } from "../../components/EmptyState";
import type { ServiceReportListItem, ServiceReportStatus } from "../../lib/serviceReports";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { DateRangeFilter } from "../../components/DateRangeFilter";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";

const FILTER_ALL = "all";

const statusStyle: Record<ServiceReportStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  Completed: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
  Cancelled: "bg-[#e05252]/10 text-[#c23f3f] border border-[#e05252]/20",
};

// แสดงตารางรายการรายงานบริการ พร้อมตัวกรองและช่องค้นหา
// Renders the Service Report list table with filters and search.
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

  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const statusLabel: Record<ServiceReportStatus, string> = {
    Draft: t("service.status.draft"),
    Completed: t("service.status.completed"),
    Cancelled: t("service.status.cancelled"),
  };

  const dateRangeResolved = resolveRange(dateRange);
  const filtered = serviceReports
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((s) => filterStatus === FILTER_ALL || s.status === filterStatus)
    .filter((s) => !normalizedSearch || [s.id, s.customerName, s.serviceLocation, s.serviceSystemName, s.projectOrJobCode, s.assignedServiceEngineerName]
      .some((v) => v.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("service.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("service.pageSubtitle")}</p>
        </div>
        {/* The replay button sits outside the canCreate gate on purpose — a read-only role needs
            the walkthrough as much as anyone, and this must never be conditional on tour state. */}
        <div className="flex items-center gap-2">
          <TourReplayButton onClick={tour.start} />
          {canCreate && (
            <button
              onClick={onCreate}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
            >
              <Plus size={15} /> {t("service.newReport")}
            </button>
          )}
        </div>
      </div>

      <div data-tour="service-summary" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t("quotation.filterAll"), count: serviceReports.length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: t("service.status.draft"), count: serviceReports.filter((s) => s.status === "Draft").length, color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: t("service.status.completed"), count: serviceReports.filter((s) => s.status === "Completed").length, color: "#2aa36b", bg: "from-[#2aa36b]/15 to-[#2aa36b]/5" },
          { label: t("service.status.cancelled"), count: serviceReports.filter((s) => s.status === "Cancelled").length, color: "#e05252", bg: "from-[#e05252]/15 to-[#e05252]/5" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center mb-3`}>
              <Wrench size={15} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-bold text-foreground font-mono">{s.count}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div data-tour="service-filters" className="flex items-center gap-3 flex-wrap">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("service.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {[FILTER_ALL, "Draft", "Completed", "Cancelled"].map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as ServiceReportStatus] ?? s}
            </button>
          ))}
        </div>
      </div>

      <div data-tour="service-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {serviceReports.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title={t("service.empty.title")}
            description={t("service.empty.description")}
            actionLabel={canCreate ? t("service.newReport") : undefined}
            onAction={canCreate ? onCreate : undefined}
            compact
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Wrench size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("service.noFilterResults")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[
                    t("service.col.reportNo"),
                    t("service.col.customer"),
                    t("service.col.system"),
                    t("service.col.engineer"),
                    t("service.col.inspectionDate"),
                    t("service.col.status"),
                    t("service.col.updatedAt"),
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
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
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
                  >
                    <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{s.id}</td>
                    <td className="px-4 py-3.5 text-sm text-foreground font-medium max-w-[220px] truncate" title={s.customerName}>{s.customerName || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground max-w-[180px] truncate" title={s.serviceSystemName}>{s.serviceSystemName || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{s.assignedServiceEngineerName || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(s.inspectionDate)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[s.status]}`}>
                        {statusLabel[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(s.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
