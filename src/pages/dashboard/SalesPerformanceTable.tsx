import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { SalesPerformanceEntry } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { fmtShort, fmtPercent, fmtDaysOrDash } from "./format";

type SortKey = "totalValue" | "revenue" | "quotationCount" | "won" | "lost" | "pending" | "conversionRate" | "avgClosingTime" | "avgDealSize" | "expectedRevenue";

/** Powers both the "Sales Performance" section (full list) and the "Executive Ranking" (top N, sorted by revenue by default) — same data, same table shape, per the plan's single-query design. */
export function SalesPerformanceTable({ title, sub, entries, limit }: { title: string; sub: string; entries: SalesPerformanceEntry[]; limit?: number }) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const days = t("dashboard.unit.days");

  // avgClosingTime can be null (no closed deals yet) — coerce to -1 so "no data" always sinks to the
  // bottom regardless of sort direction, rather than `null - number` silently coercing to 0 (which
  // would misplace it among genuinely-fast closers).
  const sorted = [...entries].sort((a, b) => (b[sortKey] ?? -1) - (a[sortKey] ?? -1));
  const rows = limit ? sorted.slice(0, limit) : sorted;

  const columns: { key: SortKey | null; label: string }[] = [
    { key: null, label: t("dashboard.ranking.col.salesperson") },
    { key: "quotationCount", label: t("dashboard.ranking.col.jobs") },
    { key: "totalValue", label: t("dashboard.ranking.col.totalValue") },
    { key: "revenue", label: t("dashboard.ranking.col.revenue") },
    { key: "expectedRevenue", label: t("dashboard.ranking.col.expectedRevenue") },
    { key: "won", label: t("dashboard.ranking.col.won") },
    { key: "lost", label: t("dashboard.ranking.col.lost") },
    { key: "pending", label: t("dashboard.ranking.col.pending") },
    { key: "conversionRate", label: t("dashboard.ranking.col.conversionRate") },
    { key: "avgDealSize", label: t("dashboard.ranking.col.avgDealSize") },
    { key: "avgClosingTime", label: t("dashboard.ranking.col.avgClosingTime") },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{title}</h2>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{sub}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {columns.map((c) => (
                  <th key={c.label} className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    {c.key ? (
                      <button onClick={() => setSortKey(c.key as SortKey)} className={`flex items-center gap-1 hover:text-foreground transition-colors ${sortKey === c.key ? "text-[#c9a84c]" : ""}`}>
                        {c.label} <ArrowUpDown size={9} />
                      </button>
                    ) : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.salesperson} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2.5 text-xs text-foreground font-medium whitespace-nowrap">
                    {limit && <span className="text-muted-foreground font-mono mr-2">#{i + 1}</span>}
                    {r.salesperson}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{r.quotationCount}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-foreground">{fmtShort(r.totalValue)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-foreground font-semibold">{fmtShort(r.revenue)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{fmtShort(r.expectedRevenue)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-[#157347]">{r.won}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-[#e05252]">{r.lost}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-[#c9a84c]">{r.pending}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{fmtPercent(r.conversionRate)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{fmtShort(r.avgDealSize)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{fmtDaysOrDash(r.avgClosingTime, days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
