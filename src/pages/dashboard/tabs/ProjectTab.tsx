import { FileClock, CalendarClock, PackageMinus, ShoppingCart } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { DeliveryOrderSummary } from "../DeliveryOrderSummary";
import { DASHBOARD_TAB_META } from "./tabMeta";
import {
  DepartmentTabFrame, DueListTable, OpenListButton, StatTile, StatusBreakdownCard, TabIntro, TileGrid,
  type DepartmentTabProps,
} from "./DepartmentWidgets";
import { fmtCount } from "./countFormat";

/**
 * แท็บโครงการ — ใบสั่งงาน ใบเบิก/ใบขอซื้อของโครงการ และใบส่งมอบ
 * ไม่มีตัวเลขของหน้า "โครงการ" เพราะเจ้าของสั่งเอาหน้านั้นออกจากเมนูแล้ว (2026-09-10 "ไม่ได้ใช้")
 */
export function ProjectTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
  const accent = DASHBOARD_TAB_META.project.accent;
  return (
    <DepartmentTabFrame dept="project" result={result} onRetry={onRetry}>
      {(block, response) => {
        const s = block.summary;
        const d = block.detail;
        return (
          <>
            <TabIntro scope={block.scope} />
            <TileGrid>
              {s.jobOrderPending !== null && <StatTile icon={FileClock} label={t("dashboard.project.jobOrderPending")} value={fmtCount(s.jobOrderPending)} accent="#e08a3c" />}
              {s.jobOrderDueSoon !== null && <StatTile icon={CalendarClock} label={t("dashboard.project.jobOrderDueSoon")} value={fmtCount(s.jobOrderDueSoon)} accent={accent} tone={s.jobOrderDueSoon > 0 ? "warn" : undefined} />}
              {s.mrAwaitingIssue !== null && <StatTile icon={PackageMinus} label={t("dashboard.project.mrAwaitingIssue")} value={fmtCount(s.mrAwaitingIssue)} accent="#5a7299" />}
              {s.prOpen !== null && <StatTile icon={ShoppingCart} label={t("dashboard.project.prOpen")} value={fmtCount(s.prOpen)} accent="#7c4dbb" help={t("dashboard.project.prOpenHelp")} />}
            </TileGrid>

            {d && (
              <>
                {d.jobOrderStatus && (
                  <StatusBreakdownCard
                    title={t("dashboard.project.status.title")} counts={d.jobOrderStatus}
                    actions={<OpenListButton onClick={() => onNavigatePage("jobOrder")} />}
                    footer={d.jobOrderStartedInPeriod !== null && (
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.project.startedInPeriod")}: <span className="font-mono font-semibold text-foreground">{fmtCount(d.jobOrderStartedInPeriod)}</span>
                      </p>
                    )}
                  />
                )}

                {d.dueList && (
                  <DueListTable
                    title={t("dashboard.project.due.title")} sub={t("dashboard.project.due.sub")}
                    rows={d.dueList} dateLabel={t("dashboard.project.due.dateCol")} today={response.today}
                    empty={t("dashboard.project.due.empty")}
                  />
                )}

                {(d.requisitionStatus || d.purchaseRequestStatus) && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {d.requisitionStatus && (
                      <StatusBreakdownCard
                        title={t("dashboard.project.mr.title")} counts={d.requisitionStatus}
                        actions={<OpenListButton onClick={() => onNavigatePage("materialRequisition")} />}
                      />
                    )}
                    {d.purchaseRequestStatus && (
                      <StatusBreakdownCard
                        title={t("dashboard.project.pr.title")} counts={d.purchaseRequestStatus}
                        actions={<OpenListButton onClick={() => onNavigatePage("purchaseRequest")} />}
                      />
                    )}
                  </div>
                )}

                {d.deliveryOrder && <DeliveryOrderSummary data={d.deliveryOrder} sub={t("dashboard.dept.deliveryOrderShared")} />}
              </>
            )}
          </>
        );
      }}
    </DepartmentTabFrame>
  );
}
