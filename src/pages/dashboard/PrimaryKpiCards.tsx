import { FileText, Wallet, TrendingUp, Target, Percent, Activity, type LucideIcon } from "lucide-react";
import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { MetricInfoTooltip } from "../../components/MetricInfoTooltip";
import { fmtShort, fmtPercent } from "./format";

function PrimaryCard({ title, value, helper, icon: Icon, accent, help }: {
  title: string; value: string; helper: string; icon: LucideIcon; accent: string; help?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-[#c9a84c]/30 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: `${accent}18` }}>
          <Icon size={20} style={{ color: accent }} />
        </div>
        {help && <MetricInfoTooltip label={title} text={help} />}
      </div>
      <p className="text-[28px] font-bold text-foreground font-mono tracking-tight leading-none">{value}</p>
      <p className="text-sm text-foreground font-medium mt-2">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{helper}</p>
    </div>
  );
}

/**
 * The 6 metrics an executive actually needs to see first, at a glance — per the 2026-07-10 UI/UX
 * redesign request. Deliberately NOT the same ~20-card grid as before (`KpiGrid.tsx`, now split
 * into this + `SecondaryKpiSummary.tsx`): everything else is real and still on the page, just not
 * competing for attention at the very top.
 */
export function PrimaryKpiCards({ kpis }: { kpis: DashboardKpis }) {
  const { t } = useI18n();
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground mb-0.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("dashboard.section.overview")}</h2>
      <p className="text-xs text-muted-foreground font-mono mb-3">{t("dashboard.section.overview.sub")}</p>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <PrimaryCard title={t("dashboard.kpi.totalQuotations")} value={kpis.totalQuotations.toLocaleString("th-TH")} helper={t("dashboard.kpi.helper.totalQuotations")} icon={FileText} accent="#1a5fb4" />
        <PrimaryCard title={t("dashboard.kpi.totalQuotationValue")} value={fmtShort(kpis.totalQuotationValue)} helper={t("dashboard.kpi.helper.totalQuotationValue")} icon={Wallet} accent="#5a7299" />
        <PrimaryCard title={t("dashboard.kpi.closedSales")} value={fmtShort(kpis.closedSales)} helper={t("dashboard.kpi.helper.closedSales")} icon={TrendingUp} accent="#157347" />
        <PrimaryCard title={t("dashboard.kpi.expectedSales")} value={fmtShort(kpis.expectedSales)} helper={t("dashboard.kpi.helper.expectedSales")} icon={Target} accent="#c9a84c" help={t("dashboard.kpi.help.expectedSales")} />
        <PrimaryCard title={t("dashboard.kpi.winRate")} value={fmtPercent(kpis.winRate)} helper={t("dashboard.kpi.helper.winRate")} icon={Percent} accent="#2aa36b" help={t("dashboard.kpi.help.winRate")} />
        <PrimaryCard title={t("dashboard.kpi.activeQuotations")} value={kpis.activeQuotations.toLocaleString("th-TH")} helper={t("dashboard.kpi.helper.activeQuotations")} icon={Activity} accent="#3b6fc9" help={t("dashboard.kpi.help.activeQuotations")} />
      </div>
    </div>
  );
}
