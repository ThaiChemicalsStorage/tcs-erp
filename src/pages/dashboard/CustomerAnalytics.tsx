import { useState } from "react";
import type { CustomerAnalytics as CustomerAnalyticsData, CustomerStat } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { fmtShort, fmtPercent } from "./format";

type Tab = "revenue" | "quotationCount" | "wonCount" | "repeat";

export function CustomerAnalytics({ data }: { data: CustomerAnalyticsData }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("revenue");

  const tabs: { key: Tab; label: string; rows: CustomerStat[] }[] = [
    { key: "revenue", label: t("dashboard.customer.tab.revenue"), rows: data.topByRevenue },
    { key: "quotationCount", label: t("dashboard.customer.tab.quotationCount"), rows: data.topByQuotationCount },
    { key: "wonCount", label: t("dashboard.customer.tab.wonCount"), rows: data.topByWonCount },
    { key: "repeat", label: t("dashboard.customer.tab.repeat"), rows: data.topByRepeat },
  ];
  const rows = tabs.find((tb) => tb.key === tab)?.rows ?? [];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.customer.title")}</h2>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("dashboard.customer.sub")} · {t("dashboard.customer.repeatRate")}: {fmtPercent(data.repeatCustomerPercentage)}</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1 flex-wrap">
          {tabs.map((tb) => (
            <button key={tb.key} onClick={() => setTab(tb.key)}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-all ${tab === tb.key ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {tb.label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.customer.col.customer")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.customer.col.quotations")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.customer.col.totalValue")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.customer.col.wonValue")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("dashboard.customer.col.lastQuotationDate")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.client} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2.5 text-xs text-foreground font-medium">
                    <span className="text-muted-foreground font-mono mr-2">#{i + 1}</span>{c.client}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{c.quotationCount}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-foreground">{fmtShort(c.totalValue)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-[#157347] font-semibold">{fmtShort(c.revenue)}</td>
                  <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{c.lastQuotationDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
