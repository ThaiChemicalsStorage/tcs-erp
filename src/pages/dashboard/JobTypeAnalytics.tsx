import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { JobTypeStat } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { fmtShort, fmtPercent } from "./format";

type SortKey = "totalValue" | "revenue" | "count" | "winRate" | "avgDealSize";

export function JobTypeAnalytics({ jobTypeAnalytics }: { jobTypeAnalytics: JobTypeStat[] }) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("totalValue");

  const sorted = [...jobTypeAnalytics].sort((a, b) => b[sortKey] - a[sortKey]);

  const columns: { key: SortKey | null; label: string }[] = [
    { key: null, label: t("dashboard.jobType.col.name") },
    { key: "count", label: t("dashboard.jobType.col.count") },
    { key: "totalValue", label: t("dashboard.jobType.col.totalValue") },
    { key: "revenue", label: t("dashboard.jobType.col.wonValue") },
    { key: "winRate", label: t("dashboard.jobType.col.winRate") },
    { key: "avgDealSize", label: t("dashboard.jobType.col.avgDealSize") },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("dashboard.jobType.title")}</h2>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("dashboard.jobType.sub")}</p>
      </div>
      {sorted.length === 0 ? (
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
              {sorted.map((j) => (
                <tr key={j.jobTypeCode} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2.5 text-xs text-foreground font-medium">
                    <span className="font-mono text-muted-foreground mr-1.5">{j.jobTypeCode}</span>{j.jobTypeName}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{j.count}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-foreground">{fmtShort(j.totalValue)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-[#157347] font-semibold">{fmtShort(j.revenue)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{fmtPercent(j.winRate)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{fmtShort(j.avgDealSize)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
