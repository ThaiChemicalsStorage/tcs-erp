import { useState, type ReactNode } from "react";
import { PackageCheck, Search, X } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import type { ReceivingReportSummary, ReceivingReportStatus } from "../../lib/receivingReport";
import { formatQuoteDateThai, fmt } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

const FILTER_ALL = "all";

/** ใบรับสินค้ามีแค่สองสถานะ — เปิดอยู่ (ยังรับได้) กับปิดแล้ว ไม่มีขั้นอนุมัติ */
const statusStyle: Record<ReceivingReportStatus, string> = {
  Open: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Closed: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

export function ReceivingReportList({
  receivingReports, onOpen, headerAction,
}: {
  receivingReports: ReceivingReportSummary[];
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel: Record<ReceivingReportStatus, string> = {
    Open: t("receivingReport.status.open"),
    Closed: t("receivingReport.status.closed"),
  };
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const q = searchQuery.trim().toLowerCase();

  const filtered = receivingReports
    .filter((r) => filterStatus === FILTER_ALL || r.status === filterStatus)
    .filter((r) => !q || [r.id, r.documentNumber, r.purchaseOrderNumber, r.vendorName, r.jobCode].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("receivingReport.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("receivingReport.pageSubtitle")}</p>
        </div>
        {headerAction}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("receivingReport.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {([FILTER_ALL, "Open", "Closed"] as const).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as ReceivingReportStatus]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {receivingReports.length === 0 ? (
          <EmptyState icon={PackageCheck} title={t("receivingReport.empty.title")} description={t("receivingReport.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <PackageCheck size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("receivingReport.noFilterResults")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[
                    t("receivingReport.col.id"), t("receivingReport.col.purchaseOrder"), t("receivingReport.col.vendor"),
                    t("receivingReport.col.ordered"), t("receivingReport.col.received"), t("receivingReport.col.outstanding"),
                    t("receivingReport.col.status"), t("receivingReport.col.updatedAt"),
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${t("receivingReport.openRow")} ${r.documentNumber || r.id}`}
                    onClick={() => onOpen(r.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(r.id); } }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
                  >
                    <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{r.documentNumber || r.id}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.purchaseOrderNumber || "—"}</td>
                    <td className="px-4 py-3.5 text-sm text-foreground max-w-[220px] truncate" title={r.vendorName}>{r.vendorName || "—"}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground text-right whitespace-nowrap">{fmt(r.orderedValue)}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-foreground text-right whitespace-nowrap">{fmt(r.receivedValue)}</td>
                    <td className={`px-4 py-3.5 text-xs font-mono text-right whitespace-nowrap ${r.outstandingValue > 0 ? "text-[#a75d1a] font-semibold" : "text-muted-foreground"}`}>{fmt(r.outstandingValue)}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[r.status]}`}>
                        {statusLabel[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(r.updatedAt)}</td>
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
