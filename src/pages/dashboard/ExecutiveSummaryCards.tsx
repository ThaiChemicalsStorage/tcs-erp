import { FileText, Wallet, TrendingUp, Target, type LucideIcon } from "lucide-react";
import type { DashboardKpis, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { MetricInfoTooltip } from "../../components/MetricInfoTooltip";
import { fmtShort } from "./format";

// การ์ดสรุปตัวเลขหนึ่งใบ พร้อมไอคอน คำอธิบายสั้น และ tooltip ช่วยเหลือ (ถ้ามี)
// A single KPI card with icon, value, helper caption, and an optional info tooltip.
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

// การ์ด KPI หลัก 4 ใบที่ผู้ใช้ต้องเห็นก่อนสิ่งอื่น: จำนวน/มูลค่าใบเสนอราคา ยอดขายที่ปิดแล้ว และยอดขายที่คาดว่าจะได้
// The 4 executive KPI cards a user needs first: quotation count/value, closed sales, expected sales.
export function ExecutiveSummaryCards({ kpis, vatMode }: { kpis: DashboardKpis; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const cards: { title: string; value: string; icon: LucideIcon; accent: string; help?: string; helper: string }[] = [
    { title: t("dashboard.kpi.totalQuotations"), value: kpis.totalQuotations.toLocaleString("th-TH"), icon: FileText, accent: "#1a5fb4", helper: t("dashboard.kpi.helper.totalQuotations") },
    { title: `${t("dashboard.kpi.totalQuotationValue")} ${vatSuffix}`, value: fmtShort(kpis.totalQuotationValue), icon: Wallet, accent: "#5a7299", helper: `${t("dashboard.kpi.helper.totalQuotationValue")} ${vatSuffix}` },
    { title: `${t("dashboard.kpi.closedSales")} ${vatSuffix}`, value: fmtShort(kpis.closedSales), icon: TrendingUp, accent: "#157347", helper: `${t("dashboard.kpi.helper.closedSales")} ${vatSuffix}` },
    { title: `${t("dashboard.kpi.expectedSales")} ${vatSuffix}`, value: fmtShort(kpis.expectedSales), icon: Target, accent: "#c9a84c", help: `${t("dashboard.kpi.help.expectedSales")} ${vatSuffix}`, helper: t("dashboard.kpi.helper.expectedSales") },
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
