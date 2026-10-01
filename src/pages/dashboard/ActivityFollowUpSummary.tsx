import type { DashboardKpis } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { StatCells } from "./tabs/DepartmentWidgets";
import { fmtCount } from "./tabs/countFormat";

// แถวสรุปสิ่งที่ต้องติดตามด่วน — รออนุมัติ (กดเปิดรายการ) · การติดตามที่เลยกำหนด · ใบหมดอายุ · ลูกค้าใหม่
// บอร์ดดีไซน์ใหม่ตัดการ์ดนี้ออก แต่เจ้าของสั่งคงข้อมูลไว้ (2026-09-30) จึงเป็นแถบตัวเลขแบบเดียวกับการ์ดอื่นในแท็บ
// Compact strip of "needs attention now" counts; the pending-approvals cell opens the filtered quotation list
export function ActivityFollowUpSummary({ kpis, onPendingApprovalsClick }: { kpis: DashboardKpis; onPendingApprovalsClick: () => void }) {
  const { t } = useI18n();
  return (
    <ChartCard flush title={t("dashboard.actionItems.title")} sub={t("dashboard.actionItems.sub")}>
      <StatCells
        cells={[
          { key: "pending", label: t("dashboard.kpi.pendingApprovals"), value: fmtCount(kpis.pendingApprovals), tone: kpis.pendingApprovals > 0 ? "warn" : undefined, onClick: onPendingApprovalsClick },
          { key: "overdue", label: t("dashboard.kpi.overdueFollowups"), value: fmtCount(kpis.overdueFollowups), tone: kpis.overdueFollowups > 0 ? "alert" : undefined },
          { key: "expired", label: t("dashboard.kpi.expiredQuotations"), value: fmtCount(kpis.expiredQuotations) },
          { key: "newCustomers", label: t("dashboard.kpi.newCustomers"), value: fmtCount(kpis.newCustomers) },
        ]}
      />
    </ChartCard>
  );
}
