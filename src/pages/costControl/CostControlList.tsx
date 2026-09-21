import { useState, type ReactNode } from "react";
import { Calculator, Search, X } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { type CostControlSummary, type CostControlStatus } from "../../lib/costControl";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { DateRangeFilter } from "../../components/DateRangeFilter";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";

const FILTER_ALL = "all";

const statusStyle: Record<CostControlStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  PendingApproval: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Final: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

export function CostControlList({ costControls, onOpen, headerAction }: {
  costControls: CostControlSummary[];
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel: Record<CostControlStatus, string> = {
    Draft: t("materialRequisition.status.draft"),
    PendingApproval: t("materialRequisition.status.pendingApproval"),
    Final: t("materialRequisition.status.final"),
  };
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const q = searchQuery.trim().toLowerCase();

  const dateRangeResolved = resolveRange(dateRange);
  const filtered = costControls
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((c) => filterStatus === FILTER_ALL || c.status === filterStatus)
    .filter((c) => !q || [c.documentNumber, c.id, c.jobName, c.jobOrder].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("costControl.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("costControl.pageSubtitle")}</p>
        </div>
        {headerAction}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("costControl.searchPlaceholder")}
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
              {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as CostControlStatus]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {costControls.length === 0 ? (
          <EmptyState icon={Calculator} title={t("costControl.empty.title")} description={t("costControl.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Calculator size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("costControl.noFilterResults")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[t("costControl.col.id"), t("costControl.col.jobName"), t("costControl.col.jobOrder"),
                    t("costControl.col.status"), t("costControl.col.updatedAt")].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  return (
                    <tr
                      key={c.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`${t("costControl.openRow")} ${c.documentNumber || c.id}`}
                      onClick={() => onOpen(c.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(c.id); } }}
                      className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
                    >
                      <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{c.documentNumber || c.id}</td>
                      <td className="px-4 py-3.5 text-sm text-foreground max-w-[260px] truncate" title={c.jobName}>{c.jobName || "—"}</td>
                      <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{c.jobOrder || "—"}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[c.status]}`}>
                          {statusLabel[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(c.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
