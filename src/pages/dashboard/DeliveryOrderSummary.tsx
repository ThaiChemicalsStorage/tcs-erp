import { Truck, FilePen, FileCheck2, type LucideIcon } from "lucide-react";
import type { DeliveryOrderSummary as DeliveryOrderSummaryData } from "../../lib/dashboard";
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
 * Company-wide Delivery Order document counts (Total/Draft/Final) — added 2026-07-24 per a direct
 * user request to bring the newer modules' data onto the Dashboard, mirroring
 * `ScopeOfWorkSummary.tsx` exactly (same tier, same unfiltered all-time semantics, same
 * null-hides-card gating — here on `deliveryOrder:view`). Same "exactly 4 KPI cards" constraint
 * applies: supporting detail, never a 5th ExecutiveSummaryCards tile.
 */
export function DeliveryOrderSummary({ data }: { data: DeliveryOrderSummaryData }) {
  const { t } = useI18n();
  const items: { icon: LucideIcon; label: string; count: number; accent: string }[] = [
    { icon: Truck, label: t("dashboard.deliveryOrder.total"), count: data.total, accent: "#5a7299" },
    { icon: FilePen, label: t("dashboard.deliveryOrder.draft"), count: data.draft, accent: "#e08a3c" },
    { icon: FileCheck2, label: t("dashboard.deliveryOrder.final"), count: data.final, accent: "#2aa36b" },
  ];
  return (
    <ChartCard title={t("dashboard.deliveryOrder.title")} sub={t("dashboard.deliveryOrder.sub")}>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => <Tile key={item.label} {...item} />)}
      </div>
    </ChartCard>
  );
}
