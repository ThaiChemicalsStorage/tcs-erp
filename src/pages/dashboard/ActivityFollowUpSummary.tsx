import { ClipboardCheck, CalendarClock, AlertTriangle, UserPlus, type LucideIcon } from "lucide-react";
import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";

// การ์ดแสดงตัวเลขสรุปหนึ่งรายการ คลิกได้ถ้ามีการกำหนด onClick
// A single summary count tile, clickable when an onClick handler is provided
function ActionItem({ icon: Icon, label, count, accent, onClick }: { icon: LucideIcon; label: string; count: number; accent: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-lg border border-border text-left min-w-0 ${onClick ? "hover:border-[#c9a84c]/40 hover:bg-secondary/30 transition-all cursor-pointer" : ""}`}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}18` }}>
        <Icon size={16} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold font-mono text-foreground leading-none">{count.toLocaleString("th-TH")}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate" title={label}>{label}</p>
      </div>
    </Tag>
  );
}

// แถวสรุปสิ่งที่ต้องติดตามด่วน เช่น รออนุมัติ เกินกำหนดติดตาม และใบเสนอราคาหมดอายุ
// Compact row of "needs attention now" tiles — pending approvals, overdue follow-ups, etc.
export function ActivityFollowUpSummary({ kpis, onPendingApprovalsClick }: { kpis: DashboardKpis; onPendingApprovalsClick: () => void }) {
  const { t } = useI18n();
  const items: { icon: LucideIcon; label: string; count: number; accent: string; onClick?: () => void }[] = [
    { icon: ClipboardCheck, label: t("dashboard.kpi.pendingApprovals"), count: kpis.pendingApprovals, accent: "#c9a84c", onClick: onPendingApprovalsClick },
    { icon: CalendarClock, label: t("dashboard.kpi.overdueFollowups"), count: kpis.overdueFollowups, accent: "#e05252" },
    { icon: AlertTriangle, label: t("dashboard.kpi.expiredQuotations"), count: kpis.expiredQuotations, accent: "#e08a3c" },
    { icon: UserPlus, label: t("dashboard.kpi.newCustomers"), count: kpis.newCustomers, accent: "#2aa36b" },
  ];
  return (
    <ChartCard title={t("dashboard.actionItems.title")} sub={t("dashboard.actionItems.sub")}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((item) => <ActionItem key={item.label} {...item} />)}
      </div>
    </ChartCard>
  );
}
