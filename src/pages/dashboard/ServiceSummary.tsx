import { Wrench, FilePen, CheckCircle2, XCircle, CalendarCheck, type LucideIcon } from "lucide-react";
import type { ServiceSummary as ServiceSummaryData } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";

// การ์ดแสดงไอคอนและจำนวนตัวเลขหนึ่งค่าพร้อมป้ายกำกับ
// Renders a single icon + count tile with a label
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

// สรุปจำนวนรายงานบริการทั้งหมดของบริษัท แยกตามสถานะ
// Shows company-wide Service report counts, broken down by status
export function ServiceSummary({ data }: { data: ServiceSummaryData }) {
  const { t } = useI18n();
  const items: { icon: LucideIcon; label: string; count: number; accent: string }[] = [
    { icon: Wrench, label: t("dashboard.service.total"), count: data.total, accent: "#5a7299" },
    { icon: FilePen, label: t("dashboard.service.draft"), count: data.draft, accent: "#5a7299" },
    { icon: CheckCircle2, label: t("dashboard.service.completed"), count: data.completed, accent: "#2aa36b" },
    { icon: XCircle, label: t("dashboard.service.cancelled"), count: data.cancelled, accent: "#c14e4e" },
    { icon: CalendarCheck, label: t("dashboard.service.thisMonth"), count: data.thisMonth, accent: "#e08a3c" },
  ];
  return (
    <ChartCard title={t("dashboard.service.title")} sub={t("dashboard.service.sub")}>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {items.map((item) => <Tile key={item.label} {...item} />)}
      </div>
    </ChartCard>
  );
}
