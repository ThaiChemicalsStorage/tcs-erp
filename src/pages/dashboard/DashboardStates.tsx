import { AlertTriangle, RotateCw } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { btn } from "../../components/ui/styles";

// แท่งกะพริบแทนค่าที่ยังโหลดไม่เสร็จ
// A single pulsing placeholder bar standing in for a not-yet-loaded value.
export function SkeletonBar({ className = "h-4 w-16" }: { className?: string }) {
  return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

// การ์ด KPI แบบกะพริบ — ผังเดียวกับการ์ดจริง (ชื่อ · ตัวเลข · แถบ)
// A pulsing KPI card placeholder laid out like the real card.
export function KpiSkeleton({ label }: { label?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-[18px] space-y-3" aria-hidden="true">
      {label ? <p className="text-[13px] font-medium text-[#3d5173] truncate">{label}</p> : <SkeletonBar className="h-3.5 w-28" />}
      <SkeletonBar className="h-8 w-24" />
      <SkeletonBar className="h-2 w-full" />
    </div>
  );
}

// โครงหน้าจอแบบกะพริบของแท็บขาย สำหรับตอนโหลดครั้งแรกเท่านั้น ไม่ครอบหัวข้อ/แท็บ/ตัวกรองด้านบน
// Skeleton for the Sales tab's first load only; mirrors the real section layout so nothing jumps when data arrives.
export function DashboardContentSkeleton() {
  const { t } = useI18n();
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {[
          t("dashboard.kpi.totalQuotations"), t("dashboard.kpi.totalQuotationValue"),
          t("dashboard.kpi.closedSales"), t("dashboard.kpi.expectedSales"),
        ].map((title) => <KpiSkeleton key={title} label={title} />)}
      </div>
      {[0, 1].map((row) => (
        <div key={row} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
          <div className="h-72 rounded-xl bg-muted animate-pulse" />
          <div className="h-72 rounded-xl bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// โครงกะพริบของแท็บแผนก — วางผังเหมือนของจริง (KPI 4 ช่อง · กล่องหลัก + กล่องข้างสองแถว) ตาม DASHBOARD_DESIGN.md ข้อ 8
// Generic skeleton for a department tab, laid out like the real page: 4 KPI cards and two main/side rows.
export function DepartmentTabSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {[...Array(4)].map((_, i) => <KpiSkeleton key={i} />)}
      </div>
      {[0, 1].map((row) => (
        <div key={row} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5">
          <div className="h-72 rounded-xl bg-muted animate-pulse" />
          <div className="h-72 rounded-xl bg-muted animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// แสดงสถานะโหลดข้อมูลล้มเหลว พร้อมปุ่มลองใหม่
// Renders an error state with a retry button when a dashboard tab fails to load.
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center p-12 text-center">
      <span className="w-14 h-14 rounded-full bg-[#fcebeb] flex items-center justify-center mb-4">
        <AlertTriangle size={22} className="text-[#b93636]" />
      </span>
      <p className="text-base font-semibold text-foreground">{t("dashboard.error.title")}</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{t("dashboard.error.sub")}</p>
      <button type="button" onClick={onRetry} className={`${btn.primary} mt-5`}>
        <RotateCw size={15} /> {t("dashboard.error.retry")}
      </button>
    </div>
  );
}
