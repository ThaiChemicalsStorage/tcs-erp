import { useState, type ReactNode } from "react";
import { Package2, Search, X } from "lucide-react";
import type { DriveStep } from "driver.js";
import { EmptyState } from "../../components/EmptyState";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import type { MaterialRequisitionSummary, MaterialRequisitionStatus } from "../../lib/materialRequisition";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { DateRangeFilter } from "../../components/DateRangeFilter";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";

const FILTER_ALL = "all";

const statusStyle: Record<MaterialRequisitionStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  PendingApproval: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Final: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

// แสดงตารางรายการใบเบิกและใบคืนวัสดุ พร้อมตัวกรองสถานะและช่องค้นหา
// Renders the Material Requisition list table with a status filter and search box.
export function MaterialRequisitionList({
  materialRequisitions,
  currentUserId,
  onOpen,
  headerAction,
}: {
  materialRequisitions: MaterialRequisitionSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  /** ปุ่ม "+ สร้าง" ของหน้านั้นๆ — หน้า Page เป็นเจ้าของ state ของกล่องเลือกต้นทาง (2026-08-20) */
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel: Record<MaterialRequisitionStatus, string> = { Draft: t("materialRequisition.status.draft"), PendingApproval: t("materialRequisition.status.pendingApproval"), Final: t("materialRequisition.status.final") };
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="mr-filters"]', popover: { title: t("tour.mr.filters.title"), description: t("tour.mr.filters.desc"), side: "bottom" } },
    { element: '[data-tour="mr-table"]', popover: { title: t("tour.mr.table.title"), description: t("tour.mr.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("materialRequisition", currentUserId, tourSteps);
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = materialRequisitions.map((m) => ({
    ...m,
    documentNumber: m.documentNumber || m.id,
    jobCode: m.jobCode ?? "", productionOrderId: m.productionOrderId ?? "", status: m.status ?? "Draft",
    chargeTo: [m.chargeDepartmentName, m.chargeTeamName].filter(Boolean).join(" / "),
  }));
  const dateRangeResolved = resolveRange(dateRange);
  const filtered = items
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((m) => filterStatus === FILTER_ALL || m.status === filterStatus)
    .filter((m) => !normalizedSearch || [m.id, m.documentNumber, m.jobCode, m.productionOrderId, m.chargeTo, m.chargeWorkTypeName ?? ""].some((v) => v.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("materialRequisition.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("materialRequisition.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <TourReplayButton onClick={tour.start} />
        </div>
      </div>

      <div data-tour="mr-filters" className="flex items-center gap-3 flex-wrap">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("materialRequisition.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {([FILTER_ALL, "Draft", "PendingApproval", "Final"] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as MaterialRequisitionStatus]}
            </button>
          ))}
        </div>
      </div>

      <div data-tour="mr-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={Package2} title={t("materialRequisition.empty.title")} description={t("materialRequisition.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Package2 size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("materialRequisition.noFilterResults")}</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[t("materialRequisition.col.id"), t("materialRequisition.col.productionOrder"), t("materialRequisition.col.jobCode"), t("materialRequisition.col.chargeTo"), t("materialRequisition.col.status"), t("materialRequisition.col.updatedAt")].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr
                key={m.id}
                tabIndex={0}
                role="button"
                aria-label={`${t("materialRequisition.openRow")} ${m.documentNumber}`}
                onClick={() => onOpen(m.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(m.id); } }}
                className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
              >
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">
                  {m.documentNumber}
                  {/* เลขบนฟอร์มถูกพิมพ์ทับ — โชว์เลขรันของระบบไว้ข้าง ๆ ให้ค้นเจอทั้งสองทาง */}
                  {m.documentNumber !== m.id && <span className="ml-1.5 font-normal text-muted-foreground">({m.id})</span>}
                </td>
                <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{m.productionOrderId || "—"}</td>
                <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{m.jobCode || "—"}</td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                  {m.chargeTo || "—"}
                  {m.chargeWorkTypeName && <span className="block text-xs">{m.chargeWorkTypeName}</span>}
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[m.status]}`}>
                    {statusLabel[m.status]}
                  </span>
                  {m.hasOutstanding && (
                    <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20">
                      {t("materialRequisition.outstandingBadge")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(m.updatedAt)}</td>
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
