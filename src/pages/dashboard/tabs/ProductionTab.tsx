import { FileClock, CalendarClock, AlarmClock, PackageMinus } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { DeliveryOrderSummary } from "../DeliveryOrderSummary";
import {
  DepartmentTabFrame, DueListTable, OpenListButton, StatTile, StatusBreakdownCard, TabIntro, TileGrid,
  type DepartmentTabProps,
} from "./DepartmentWidgets";
import { fmtCount } from "./countFormat";

/**
 * แท็บผลิต — ใบสั่งผลิต ใบเบิก/ใบขอซื้อของฝ่ายผลิต และใบส่งมอบ
 *
 * ใบสั่งผลิตไม่มีสถานะ "ผลิตเสร็จ" มีแต่ ร่าง/รออนุมัติ/อนุมัติแล้ว · "เลยกำหนด" จึงหมายถึงวันกำหนดเสร็จ
 * ที่เขียนบนใบที่อนุมัติแล้วผ่านมาแล้วเท่านั้น ป้ายและคำอธิบายต้องพูดตามนั้นตรง ๆ
 */
export function ProductionTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
  return (
    <DepartmentTabFrame dept="production" result={result} onRetry={onRetry}>
      {(block, response) => {
        const s = block.summary;
        const d = block.detail;
        return (
          <>
            <TabIntro scope={block.scope} />
            <TileGrid>
              <StatTile icon={FileClock} label={t("dashboard.production.pending")} value={fmtCount(s.pending)} accent="#e08a3c" />
              <StatTile icon={CalendarClock} label={t("dashboard.production.dueSoon")} value={fmtCount(s.dueSoon)} accent="#2aa36b" tone={s.dueSoon > 0 ? "warn" : undefined} />
              <StatTile icon={AlarmClock} label={t("dashboard.production.pastDue")} value={fmtCount(s.pastDue)} accent="#e05252" tone={s.pastDue > 0 ? "alert" : undefined} help={t("dashboard.production.pastDueHelp")} />
              {s.mrAwaitingIssue !== null && <StatTile icon={PackageMinus} label={t("dashboard.production.mrAwaitingIssue")} value={fmtCount(s.mrAwaitingIssue)} accent="#3b6fc9" />}
            </TileGrid>

            {d && (
              <>
                <StatusBreakdownCard
                  title={t("dashboard.production.status.title")} counts={d.status}
                  actions={<OpenListButton onClick={() => onNavigatePage("productionOrder")} />}
                  footer={
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.production.startedInPeriod")}: <span className="font-mono font-semibold text-foreground">{fmtCount(d.startedInPeriod)}</span>
                    </p>
                  }
                />

                <DueListTable
                  title={t("dashboard.production.due.title")} sub={t("dashboard.production.due.sub")}
                  rows={d.dueList} dateLabel={t("dashboard.production.due.dateCol")} today={response.today}
                  empty={t("dashboard.production.due.empty")}
                />

                {(d.requisitionStatus || d.purchaseRequestStatus) && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {d.requisitionStatus && (
                      <StatusBreakdownCard
                        title={t("dashboard.production.mr.title")} counts={d.requisitionStatus}
                        actions={<OpenListButton onClick={() => onNavigatePage("productionRequisition")} />}
                      />
                    )}
                    {d.purchaseRequestStatus && (
                      <StatusBreakdownCard
                        title={t("dashboard.production.pr.title")} counts={d.purchaseRequestStatus}
                        actions={<OpenListButton onClick={() => onNavigatePage("productionPurchase")} />}
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
