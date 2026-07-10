import { useState } from "react";
import type { CustomerAnalytics as CustomerAnalyticsData, CustomerStat } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { fmtShort, fmtPercent } from "./format";

type Tab = "revenue" | "quotationCount" | "wonCount";

export function CustomerAnalytics({ data }: { data: CustomerAnalyticsData }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("revenue");

  const tabs: { key: Tab; label: string; rows: CustomerStat[] }[] = [
    { key: "revenue", label: t("dashboard.customer.tab.revenue"), rows: data.topByRevenue },
    { key: "quotationCount", label: t("dashboard.customer.tab.quotationCount"), rows: data.topByQuotationCount },
    { key: "wonCount", label: t("dashboard.customer.tab.wonCount"), rows: data.topByWonCount },
  ];
  const rows = tabs.find((tb) => tb.key === tab)?.rows ?? [];

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>{t("dashboard.customer.title")}</h2>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{t("dashboard.customer.sub")} · {t("dashboard.customer.repeatRate")}: {fmtPercent(data.repeatCustomerPercentage)}</p>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
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
        <div className="space-y-2">
          {rows.map((c, i) => (
            <div key={c.client} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
              <span className="text-foreground"><span className="text-muted-foreground font-mono mr-2">#{i + 1}</span>{c.client}</span>
              <span className="flex items-center gap-3 font-mono text-muted-foreground">
                <span>{c.quotationCount} {t("quotation.countUnit")}</span>
                <span className="text-[#157347]">{c.wonCount} {t("dashboard.kpi.wonDeals")}</span>
                <span className="text-foreground font-semibold w-20 text-right">{fmtShort(c.revenue)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
