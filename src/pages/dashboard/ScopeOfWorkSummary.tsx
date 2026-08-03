import { FileStack, FilePen, FileClock, FileCheck2, BellRing, type LucideIcon } from "lucide-react";
import type { ScopeOfWorkSummary as ScopeOfWorkSummaryData } from "../../lib/dashboard";
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

// สรุปจำนวนเอกสาร Scope of Work ทั้งหมดของบริษัท แยกตามสถานะ
// Shows company-wide Scope of Work document counts, broken down by status
export function ScopeOfWorkSummary({ data }: { data: ScopeOfWorkSummaryData }) {
  const { t } = useI18n();
  const items: { icon: LucideIcon; label: string; count: number; accent: string }[] = [
    { icon: FileStack, label: t("dashboard.scopeOfWork.total"), count: data.total, accent: "#5a7299" },
    { icon: FilePen, label: t("dashboard.scopeOfWork.draft"), count: data.draft, accent: "#5a7299" },
    { icon: FileClock, label: t("dashboard.scopeOfWork.pending"), count: data.pending, accent: "#e08a3c" },
    { icon: FileCheck2, label: t("dashboard.scopeOfWork.final"), count: data.final, accent: "#2aa36b" },
    { icon: BellRing, label: t("dashboard.scopeOfWork.noPo"), count: data.noPo ?? 0, accent: "#e08a3c" },
  ];
  return (
    <ChartCard title={t("dashboard.scopeOfWork.title")} sub={t("dashboard.scopeOfWork.sub")}>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {items.map((item) => <Tile key={item.label} {...item} />)}
      </div>
    </ChartCard>
  );
}
