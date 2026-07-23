import { FileStack, FilePen, FileCheck2, type LucideIcon } from "lucide-react";
import type { ScopeOfWorkSummary as ScopeOfWorkSummaryData } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";

function Tile({ icon: Icon, label, count, accent }: { icon: LucideIcon; label: string; count: number; accent: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border min-w-0">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}18` }}>
        <Icon size={16} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold font-mono text-foreground leading-none">{count.toLocaleString("th-TH")}</p>
        <p className="text-xs text-muted-foreground mt-1 truncate" title={label}>{label}</p>
      </div>
    </div>
  );
}

/**
 * Company-wide Scope of Work document counts (Total/Draft/Final) — added to the "supporting
 * detail" section per a user request to show how many SOW documents exist. Deliberately not a 5th
 * `ExecutiveSummaryCards` tile: that row is a documented, repeatedly-reaffirmed "exactly 4 cards"
 * business requirement (see ExecutiveSummaryCards.tsx), so a new metric goes in supporting detail
 * instead, same tier as `ActivityFollowUpSummary`. Not rendered at all when `stats.scopeOfWork` is
 * null (caller lacks scopeOfWork:view) — same pattern as `approvalDashboard`/`activityTimeline`.
 */
export function ScopeOfWorkSummary({ data }: { data: ScopeOfWorkSummaryData }) {
  const { t } = useI18n();
  const items: { icon: LucideIcon; label: string; count: number; accent: string }[] = [
    { icon: FileStack, label: t("dashboard.scopeOfWork.total"), count: data.total, accent: "#5a7299" },
    { icon: FilePen, label: t("dashboard.scopeOfWork.draft"), count: data.draft, accent: "#e08a3c" },
    { icon: FileCheck2, label: t("dashboard.scopeOfWork.final"), count: data.final, accent: "#2aa36b" },
  ];
  return (
    <ChartCard title={t("dashboard.scopeOfWork.title")} sub={t("dashboard.scopeOfWork.sub")}>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => <Tile key={item.label} {...item} />)}
      </div>
    </ChartCard>
  );
}
