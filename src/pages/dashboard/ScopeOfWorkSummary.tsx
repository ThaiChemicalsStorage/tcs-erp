import type { ReactNode } from "react";
import type { DeliveryOrderSummary, ScopeOfWorkSummary as ScopeOfWorkSummaryData } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { Num, StatusChip } from "./tabs/DepartmentWidgets";
import { fmtCount } from "./tabs/countFormat";

/**
 * Scope of Work และใบส่งมอบสินค้า (บอร์ด Dashboard-Sales) — รวมสองการ์ดตัวเลขเดิมเป็นการ์ดเดียว สองส่วน:
 * จำนวนรวม · ร่าง/รออนุมัติ/อนุมัติแล้ว · (SOW) ป้าย "ยังไม่มีเลข PO" — ทุกใบในระบบ ไม่ขึ้นกับตัวกรอง (เหมือนเดิม)
 */
export function ScopeOfWorkDeliverySummary({ scopeOfWork, deliveryOrder }: { scopeOfWork: ScopeOfWorkSummaryData | null; deliveryOrder: DeliveryOrderSummary | null }) {
  const { t } = useI18n();
  const docs = t("dashboard.unit.docs");
  const block = (title: string, total: number, parts: [string, number][], extra?: ReactNode, divider?: boolean) => (
    <div className={`px-5 py-3 flex flex-col gap-1.5 ${divider ? "border-t border-[#eef1f6]" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 text-sm font-semibold">{title}</span>
        <span className="text-lg font-semibold tabular-nums">{fmtCount(total)}</span>
        <span className="text-xs text-muted-foreground">{docs}</span>
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
        {parts.map(([label, n]) => <span key={label}>{label} <Num>{fmtCount(n)}</Num></span>)}
      </div>
      {extra}
    </div>
  );
  return (
    <ChartCard flush title={t("dashboard.sales.sowDo.title")} sub={t("dashboard.sales.sowDo.sub")} className="h-full">
      {scopeOfWork && block(
        t("dashboard.scopeOfWork.title"), scopeOfWork.total,
        [[t("dashboard.scopeOfWork.draft"), scopeOfWork.draft], [t("dashboard.scopeOfWork.pending"), scopeOfWork.pending], [t("dashboard.scopeOfWork.final"), scopeOfWork.final]],
        <div><StatusChip tone={(scopeOfWork.noPo ?? 0) > 0 ? "warn" : "neutral"}>{t("dashboard.scopeOfWork.noPo")} {fmtCount(scopeOfWork.noPo ?? 0)} {docs}</StatusChip></div>,
      )}
      {deliveryOrder && block(
        t("dashboard.deliveryOrder.title"), deliveryOrder.total,
        [[t("dashboard.deliveryOrder.draft"), deliveryOrder.draft], [t("dashboard.deliveryOrder.pending"), deliveryOrder.pending], [t("dashboard.deliveryOrder.final"), deliveryOrder.final]],
        undefined, !!scopeOfWork,
      )}
    </ChartCard>
  );
}
