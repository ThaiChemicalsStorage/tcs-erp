import { useState, type ReactNode } from "react";
import { ShoppingCart, Search, X } from "lucide-react";
import type { DriveStep } from "driver.js";
import { EmptyState } from "../../components/EmptyState";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import type { PurchaseRequestSummary, PurchaseRequestStatus } from "../../lib/purchaseRequest";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

const FILTER_ALL = "all";

const statusStyle: Record<PurchaseRequestStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  Final: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

// แสดงตารางรายการใบขอซื้อ พร้อมตัวกรองสถานะและช่องค้นหา
// Renders the Purchase Request list table with a status filter and search box.
export function PurchaseRequestList({
  purchaseRequests,
  currentUserId,
  onOpen,
  headerAction,
}: {
  purchaseRequests: PurchaseRequestSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
  /** ปุ่ม "+ สร้าง" ของหน้านั้นๆ — หน้า Page เป็นเจ้าของ state ของกล่องเลือกต้นทาง (2026-08-20) */
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel: Record<PurchaseRequestStatus, string> = { Draft: t("materialRequisition.status.draft"), Final: t("materialRequisition.status.final") };
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="pr-filters"]', popover: { title: t("tour.pr.filters.title"), description: t("tour.pr.filters.desc"), side: "bottom" } },
    { element: '[data-tour="pr-table"]', popover: { title: t("tour.pr.table.title"), description: t("tour.pr.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("purchaseRequest", currentUserId, tourSteps);
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = purchaseRequests.map((p) => ({ ...p, jobCode: p.jobCode ?? "", status: p.status ?? "Draft" }));
  const filtered = items
    .filter((p) => filterStatus === FILTER_ALL || p.status === filterStatus)
    .filter((p) => !normalizedSearch || [p.id, p.jobCode].some((v) => v.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseRequest.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("purchaseRequest.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerAction}
          <TourReplayButton onClick={tour.start} />
        </div>
      </div>

      <div data-tour="pr-filters" className="flex items-center gap-3 flex-wrap">
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("purchaseRequest.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {([FILTER_ALL, "Draft", "Final"] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as PurchaseRequestStatus]}
            </button>
          ))}
        </div>
      </div>

      <div data-tour="pr-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={ShoppingCart} title={t("purchaseRequest.empty.title")} description={t("purchaseRequest.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <ShoppingCart size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("purchaseRequest.noFilterResults")}</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[t("purchaseRequest.col.id"), t("purchaseRequest.col.jobCode"), t("purchaseRequest.col.status"), t("purchaseRequest.col.updatedAt")].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                tabIndex={0}
                role="button"
                aria-label={`${t("purchaseRequest.openRow")} ${p.id}`}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id); } }}
                className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
              >
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{p.id}</td>
                <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{p.jobCode || "—"}</td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[p.status]}`}>
                    {statusLabel[p.status]}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(p.updatedAt)}</td>
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
