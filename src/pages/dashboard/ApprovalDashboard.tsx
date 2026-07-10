import { ClipboardCheck } from "lucide-react";
import type { ApprovalDashboard as ApprovalDashboardData } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { fmtDaysOrDash } from "./format";

export function ApprovalDashboard({ data }: { data: ApprovalDashboardData }) {
  const { t } = useI18n();
  const items = [
    { label: t("dashboard.approval.pending"), value: data.pendingApprovals.toLocaleString("th-TH"), accent: "#c9a84c" },
    { label: t("dashboard.approval.approvedToday"), value: data.approvedToday.toLocaleString("th-TH"), accent: "#2aa36b" },
    { label: t("dashboard.approval.rejectedToday"), value: data.rejectedToday.toLocaleString("th-TH"), accent: "#e05252" },
    { label: t("dashboard.kpi.averageApprovalTime"), value: fmtDaysOrDash(data.averageApprovalTime, t("dashboard.unit.days")), accent: "#5a7299" },
  ];
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', serif" }}>
        <ClipboardCheck size={15} /> {t("dashboard.approval.title")}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg bg-secondary/40 p-3">
            <p className="text-lg font-bold font-mono" style={{ color: it.accent }}>{it.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{it.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
