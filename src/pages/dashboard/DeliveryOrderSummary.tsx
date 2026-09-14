import { Truck, FilePen, FileClock, FileCheck2, type LucideIcon } from "lucide-react";
import type { DeliveryOrderSummary as DeliveryOrderSummaryData } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";

// การ์ดเล็กแสดงไอคอนพร้อมตัวเลขและป้ายกำกับหนึ่งรายการ
// A small tile showing an icon, a count, and a label.
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

// สรุปจำนวนเอกสารใบส่งของทั้งบริษัท (ทั้งหมด/ฉบับร่าง/รอดำเนินการ/ฉบับสมบูรณ์)
// Company-wide Delivery Order document counts — total, draft, pending, and final.
// `sub` override (2026-09-14): the ผลิต/โครงการ dashboard tabs show this same card and caption it as
// the one document shared by three departments.
export function DeliveryOrderSummary({ data, sub }: { data: DeliveryOrderSummaryData; sub?: string }) {
  const { t } = useI18n();
  const items: { icon: LucideIcon; label: string; count: number; accent: string }[] = [
    { icon: Truck, label: t("dashboard.deliveryOrder.total"), count: data.total, accent: "#5a7299" },
    { icon: FilePen, label: t("dashboard.deliveryOrder.draft"), count: data.draft, accent: "#5a7299" },
    { icon: FileClock, label: t("dashboard.deliveryOrder.pending"), count: data.pending, accent: "#e08a3c" },
    { icon: FileCheck2, label: t("dashboard.deliveryOrder.final"), count: data.final, accent: "#2aa36b" },
  ];
  return (
    <ChartCard title={t("dashboard.deliveryOrder.title")} sub={sub ?? t("dashboard.deliveryOrder.sub")}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map((item) => <Tile key={item.label} {...item} />)}
      </div>
    </ChartCard>
  );
}
