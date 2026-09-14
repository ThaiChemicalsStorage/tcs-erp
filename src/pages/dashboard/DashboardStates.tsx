import { AlertTriangle, RotateCw } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";

// แท่งกะพริบแทนค่าที่ยังโหลดไม่เสร็จ
// A single pulsing placeholder bar standing in for a not-yet-loaded value.
export function SkeletonBar({ className = "h-4 w-16" }: { className?: string }) {
  return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

// โครงหน้าจอแบบกะพริบของแท็บขาย สำหรับตอนโหลดครั้งแรกเท่านั้น ไม่ครอบหัวข้อ/แท็บ/ตัวกรองด้านบน
// Skeleton for the Sales tab's first load only; mirrors the real section layout so nothing jumps when data arrives.
export function DashboardContentSkeleton() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t("dashboard.section.overview")}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            t("dashboard.kpi.totalQuotations"), t("dashboard.kpi.totalQuotationValue"),
            t("dashboard.kpi.closedSales"), t("dashboard.kpi.expectedSales"),
          ].map((title) => (
            <div key={title} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground font-medium truncate mb-2">{title}</p>
              <SkeletonBar className="h-6 w-24" />
            </div>
          ))}
        </div>
      </div>

      <ChartCard title={t("dashboard.statusSummary.title")} sub={t("dashboard.statusSummary.sub")}>
        <SkeletonBar className="h-40 w-full" />
      </ChartCard>

      <ChartCard title={t("dashboard.salesActivity.title")} sub={t("dashboard.salesActivity.sub")}>
        <SkeletonBar className="h-52 w-full" />
      </ChartCard>
    </div>
  );
}

// โครงกะพริบของแท็บแผนก — แถวตัวเลข 4 ช่อง + การ์ดรายละเอียด 2 ใบ
// Generic skeleton for a department tab: a 4-tile row and two detail cards.
export function DepartmentTabSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
      </div>
    </div>
  );
}

// แสดงสถานะโหลดข้อมูลล้มเหลว พร้อมปุ่มลองใหม่
// Renders an error state with a retry button when a dashboard tab fails to load.
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="w-14 h-14 rounded-xl bg-[#e05252]/10 flex items-center justify-center mb-4">
        <AlertTriangle size={22} className="text-[#e05252]" />
      </div>
      <p className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("dashboard.error.title")}</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">{t("dashboard.error.sub")}</p>
      <button onClick={onRetry} className="mt-4 flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
        <RotateCw size={14} /> {t("dashboard.error.retry")}
      </button>
    </div>
  );
}
