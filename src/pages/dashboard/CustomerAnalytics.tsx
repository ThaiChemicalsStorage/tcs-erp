import { useState } from "react";
import type { CustomerAnalytics as CustomerAnalyticsData, CustomerStat, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtShort, fmtPercent, fmtDateShort } from "./format";
import { Segmented } from "./tabs/DepartmentWidgets";
import { TD, TH, TR } from "./tabs/dashboardTokens";
import { fmtCount } from "./tabs/countFormat";

type Tab = "revenue" | "quotationCount" | "wonCount" | "repeat";

// การวิเคราะห์ลูกค้า (บอร์ด Dashboard-Sales) — ปุ่มแบ่งส่วนเลือกการจัดอันดับ (รายได้/จำนวนใบ/ปิดการขาย/ซื้อซ้ำ) + ตาราง
// Ranked customer table, switchable between revenue, quotation count, won count, and repeat customers.
export function CustomerAnalytics({ data, vatMode }: { data: CustomerAnalyticsData; vatMode: DashboardVatMode }) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>("revenue");
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");

  const tabs: { key: Tab; label: string; rows: CustomerStat[] }[] = [
    { key: "revenue", label: t("dashboard.customer.tab.revenue"), rows: data.topByRevenue },
    { key: "quotationCount", label: t("dashboard.customer.tab.quotationCount"), rows: data.topByQuotationCount },
    { key: "wonCount", label: t("dashboard.customer.tab.wonCount"), rows: data.topByWonCount },
    { key: "repeat", label: t("dashboard.customer.tab.repeat"), rows: data.topByRepeat },
  ];
  const rows = tabs.find((tb) => tb.key === tab)?.rows ?? [];

  return (
    <ChartCard
      flush
      title={t("dashboard.customer.title")} tag={vatSuffix}
      sub={`${t("dashboard.customer.sub")} · ${t("dashboard.customer.repeatRate")}: ${fmtPercent(data.repeatCustomerPercentage)}`}
      actions={<Segmented options={tabs.map((tb) => ({ key: tb.key, label: tb.label }))} value={tab} onChange={setTab} ariaLabel={t("dashboard.customer.sortLabel")} />}
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-border">
                <th className={`${TH} w-11`}><span className="sr-only">#</span></th>
                <th className={`${TH} text-left`}>{t("dashboard.customer.col.customer")}</th>
                <th className={`${TH} text-right`}>{t("dashboard.customer.col.quotations")}</th>
                <th className={`${TH} text-right`}>{t("dashboard.customer.col.totalValue")}</th>
                <th className={`${TH} text-right`}>{t("dashboard.customer.col.wonValue")}</th>
                <th className={`${TH} text-right`}>{t("dashboard.customer.col.lastQuotationDate")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((c, i) => (
                <tr key={c.client} className={`${TR} hover:bg-[#f8f9fc] transition-colors`}>
                  <td className={`${TD} text-[13px] text-[#8a97ad]`}>#{i + 1}</td>
                  <td className={`${TD} font-medium max-w-[360px] truncate`} title={c.client}>{c.client}</td>
                  <td className={`${TD} text-right`}>{fmtCount(c.quotationCount)}</td>
                  <td className={`${TD} text-right text-[#3d5173] whitespace-nowrap`}>{fmtShort(c.totalValue)}</td>
                  <td className={`${TD} text-right font-semibold whitespace-nowrap`}>{fmtShort(c.revenue)}</td>
                  <td className={`${TD} text-right text-[#3d5173] whitespace-nowrap`}>{/^\d{4}-\d{2}-\d{2}/.test(c.lastQuotationDate) ? fmtDateShort(c.lastQuotationDate.slice(0, 10), lang) : c.lastQuotationDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
