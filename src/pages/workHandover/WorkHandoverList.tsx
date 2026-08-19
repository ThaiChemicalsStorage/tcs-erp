import { useState } from "react";
import { FileSignature, Search, X } from "lucide-react";
import type { DriveStep } from "driver.js";
import { EmptyState } from "../../components/EmptyState";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import type { WorkHandoverSummary } from "../../lib/workHandover";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

const FILTER_ALL = "all";

const statusStyle: Record<"draft" | "signed", string> = {
  draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  signed: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

// แสดงตารางรายการใบส่งมอบงาน พร้อมตัวกรองสถานะและช่องค้นหา
// Renders the Work Handover Note list table with a status filter and search box.
export function WorkHandoverList({
  workHandovers,
  currentUserId,
  onOpen,
}: {
  workHandovers: WorkHandoverSummary[];
  currentUserId: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const statusLabel: Record<"draft" | "signed", string> = { draft: t("workHandover.status.draft"), signed: t("workHandover.status.signed") };
  const tourSteps: DriveStep[] = [
    { element: '[data-tour="wh-filters"]', popover: { title: t("tour.wh.filters.title"), description: t("tour.wh.filters.desc"), side: "bottom" } },
    { element: '[data-tour="wh-table"]', popover: { title: t("tour.wh.table.title"), description: t("tour.wh.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("workHandover", currentUserId, tourSteps);
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const items = workHandovers.map((w) => ({ ...w, jobCode: w.jobCode ?? "", statusKey: (w.isSigned ? "signed" : "draft") as "draft" | "signed" }));
  const filtered = items
    .filter((w) => filterStatus === FILTER_ALL || w.statusKey === filterStatus)
    .filter((w) => !normalizedSearch || [w.id, w.jobCode].some((v) => v.toLowerCase().includes(normalizedSearch)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("workHandover.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("workHandover.pageSubtitle")}</p>
        </div>
        <TourReplayButton onClick={tour.start} />
      </div>

      <div data-tour="wh-filters" className="flex items-center gap-3 flex-wrap">
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("workHandover.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {([FILTER_ALL, "draft", "signed"] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as "draft" | "signed"]}
            </button>
          ))}
        </div>
      </div>

      <div data-tour="wh-table" className="bg-card border border-border rounded-xl overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={FileSignature} title={t("workHandover.empty.title")} description={t("workHandover.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <FileSignature size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("workHandover.noFilterResults")}</p>
          </div>
        ) : (
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {[t("workHandover.col.id"), t("workHandover.col.jobCode"), t("workHandover.col.status"), t("workHandover.col.updatedAt")].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => (
              <tr
                key={w.id}
                tabIndex={0}
                role="button"
                aria-label={`${t("workHandover.openRow")} ${w.id}`}
                onClick={() => onOpen(w.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(w.id); } }}
                className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
              >
                <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{w.id}</td>
                <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{w.jobCode || "—"}</td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[w.statusKey]}`}>
                    {statusLabel[w.statusKey]}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(w.updatedAt)}</td>
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
