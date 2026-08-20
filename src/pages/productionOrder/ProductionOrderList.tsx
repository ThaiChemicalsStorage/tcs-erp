import { useState, type ReactNode } from "react";
import { Factory, Search, X } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import type { ProductionOrderSummary, ProductionOrderStatus } from "../../lib/productionOrder";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";

const FILTER_ALL = "all";

const statusStyle: Record<ProductionOrderStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  PendingApproval: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Final: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

// ตารางรายการใบสั่งผลิต พร้อมตัวกรองสถานะและช่องค้นหา — รูปแบบเดียวกับหน้ารายการเอกสารอื่น
export function ProductionOrderList({
  productionOrders, onOpen, headerAction,
}: {
  productionOrders: ProductionOrderSummary[];
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel: Record<ProductionOrderStatus, string> = {
    Draft: t("materialRequisition.status.draft"),
    PendingApproval: t("materialRequisition.status.pendingApproval"),
    Final: t("materialRequisition.status.final"),
  };
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");
  const q = searchQuery.trim().toLowerCase();

  const filtered = productionOrders
    .filter((p) => filterStatus === FILTER_ALL || p.status === filterStatus)
    .filter((p) => !q || [p.id, p.jobCode, p.customerCompanyName, p.productName].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("productionOrder.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("productionOrder.pageSubtitle")}</p>
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
            placeholder={t("productionOrder.searchPlaceholder")}
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
              {s === FILTER_ALL ? t("quotation.filterAll") : statusLabel[s as ProductionOrderStatus]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {productionOrders.length === 0 ? (
          <EmptyState icon={Factory} title={t("productionOrder.empty.title")} description={t("productionOrder.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Factory size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("productionOrder.noFilterResults")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[t("productionOrder.col.id"), t("productionOrder.col.jobCode"), t("productionOrder.col.customer"), t("productionOrder.col.productName"), t("productionOrder.col.status"), t("productionOrder.col.updatedAt")].map((h) => (
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
                    aria-label={`${t("productionOrder.openRow")} ${p.id}`}
                    onClick={() => onOpen(p.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(p.id); } }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
                  >
                    <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{p.id}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{p.jobCode || "—"}</td>
                    <td className="px-4 py-3.5 text-sm text-foreground max-w-[200px] truncate" title={p.customerCompanyName}>{p.customerCompanyName || "—"}</td>
                    <td className="px-4 py-3.5 text-sm text-muted-foreground max-w-[240px] truncate" title={p.productName}>{p.productName || "—"}</td>
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
