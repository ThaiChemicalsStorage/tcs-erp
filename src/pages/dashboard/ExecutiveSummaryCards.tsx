import { FileText, Wallet, TrendingUp, Target, type LucideIcon } from "lucide-react";
import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { MetricInfoTooltip } from "../../components/MetricInfoTooltip";
import { fmtShort } from "./format";

function SummaryCard({ title, value, icon: Icon, accent, help, helper }: { title: string; value: string; icon: LucideIcon; accent: string; help?: string; helper: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all duration-200">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}18` }}>
            <Icon size={16} style={{ color: accent }} />
          </div>
          <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
        </div>
        {help && <MetricInfoTooltip label={title} text={help} />}
      </div>
      <p className="text-2xl font-bold text-foreground font-mono tracking-tight">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1 truncate" title={helper}>{helper}</p>
    </div>
  );
}

/**
 * The 4 numbers an office user needs first, at a glance — deliberately just 4, not a wall of
 * cards (2026-07-13, third simplification pass: direct user feedback that a 22-card flat grid
 * still "feels like a generated template" and "everything looks equally important"). Everything
 * else `DashboardKpis` computes now lives in a compact panel/list further down the page instead
 * of a same-size card: see `QuotationStatusSummary.tsx` (Won/Lost/Active/Non-Active),
 * `SalesPerformancePanel.tsx` (rates + cycle times), `ActivityFollowUpSummary.tsx` (pending
 * approvals/follow-ups/expired/new customers). `totalCustomers`/`totalLeads`/`totalProducts`/
 * `repeatCustomers` are no longer given their own dashboard tile at all — they're still computed
 * server-side (untouched), just not part of this executive-overview spec; total customers/repeat
 * customers remain visible in the richer `CustomerAnalytics.tsx` table further down the page, and
 * total products on the Products page itself.
 *
 * **2026-07-13, P'Keng/P'Kee requirement**: each card now shows a one-line `helper` caption below
 * the value (was previously bare value + label, with an (i) tooltip only on Expected Sales) —
 * the business requirement calls for explicit helper text under all 4, not just the one with a
 * non-obvious calculation.
 */
export function ExecutiveSummaryCards({ kpis }: { kpis: DashboardKpis }) {
  const { t } = useI18n();
  const cards: { title: string; value: string; icon: LucideIcon; accent: string; help?: string; helper: string }[] = [
    { title: t("dashboard.kpi.totalQuotations"), value: kpis.totalQuotations.toLocaleString("th-TH"), icon: FileText, accent: "#1a5fb4", helper: t("dashboard.kpi.helper.totalQuotations") },
    { title: t("dashboard.kpi.totalQuotationValue"), value: fmtShort(kpis.totalQuotationValue), icon: Wallet, accent: "#5a7299", helper: t("dashboard.kpi.helper.totalQuotationValue") },
    { title: t("dashboard.kpi.closedSales"), value: fmtShort(kpis.closedSales), icon: TrendingUp, accent: "#157347", helper: t("dashboard.kpi.helper.closedSales") },
    { title: t("dashboard.kpi.expectedSales"), value: fmtShort(kpis.expectedSales), icon: Target, accent: "#c9a84c", help: t("dashboard.kpi.help.expectedSales"), helper: t("dashboard.kpi.helper.expectedSales") },
  ];
  return (
    <div>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("dashboard.section.overview")}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => <SummaryCard key={c.title} {...c} />)}
      </div>
    </div>
  );
}
