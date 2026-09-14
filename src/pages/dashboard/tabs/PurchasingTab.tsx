import { ShoppingCart, FileClock, Truck, AlarmClock } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { fmtShort } from "../format";
import { ErrorState } from "../DashboardStates";
import { DEPARTMENT_META } from "./tabMeta";
import {
  ChartCard, DepartmentViewFrame, Donut, DueListTable, KpiCard, KpiGrid, MonthlyBars, OpenListButton, RankBars,
  SplitRow, TabIntro, type DepartmentTabProps
} from "./DepartmentWidgets";
import { GOLD } from "./dashboardTokens";
import { daysBetweenIso, fmtCount } from "./countFormat";

/**
 * แท็บจัดซื้อ — ใบขอซื้อที่ถึงคิว ใบสั่งซื้อที่รออนุมัติ/รอรับของ/เลยกำหนด · มูลค่าใบสั่งซื้อ 12 เดือน
 * · ผู้ขายยอดสูงสุด · ใบขอซื้ออยู่ขั้นไหน (docs/DASHBOARD_DESIGN.md ข้อ 7)
 */
export function PurchasingTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
  const accent = DEPARTMENT_META.purchasing.accent;
  return (
    <DepartmentViewFrame view="purchasing" result={result} onRetry={onRetry}>
      {(response) => {
        const block = response.blocks.purchasing;
        if (!block) return <ErrorState onRetry={onRetry} />;
        const s = block.summary;
        const d = block.detail;
        const byDept = d?.prAwaitingPoByDepartment ?? null;
        const oldestOverdue = d?.overduePurchaseOrders?.[0];
        const docs = t("dashboard.unit.docs");
        return (
          <>
            <TabIntro scope={block.scope} />
            <KpiGrid>
              {s.prAwaitingPo !== null && (
                <KpiCard
                  icon={ShoppingCart} chip={accent} label={t("dashboard.purchasing.prAwaitingPo")} value={fmtCount(s.prAwaitingPo)}
                  segments={byDept ? [
                    { key: "project", label: t("dashboard.purchasing.pr.dept.project"), value: byDept.project, color: "#3b6fc9" },
                    { key: "production", label: t("dashboard.purchasing.pr.dept.production"), value: byDept.production, color: "#2aa36b" },
                    { key: "general", label: t("dashboard.purchasing.pr.dept.general"), value: byDept.general, color: "#7c4dbb" },
                  ] : undefined}
                />
              )}
              {s.poPending !== null && (
                <KpiCard icon={FileClock} chip={GOLD} label={t("dashboard.purchasing.poPending")} value={fmtCount(s.poPending)} caption={t("dashboard.dept.caption.asOfNow")} />
              )}
              {s.poAwaitingReceipt !== null && (
                <KpiCard
                  icon={Truck} chip={accent} label={t("dashboard.purchasing.poAwaitingReceipt")} value={fmtCount(s.poAwaitingReceipt)}
                  progress={d?.receiptProgress ? { value: d.receiptProgress.received, max: d.receiptProgress.approved, color: "#2aa36b" } : undefined}
                  caption={d?.receiptProgress
                    ? t("dashboard.purchasing.receiptProgress").replace("{received}", fmtCount(d.receiptProgress.received)).replace("{approved}", fmtCount(d.receiptProgress.approved))
                    : undefined}
                />
              )}
              {s.poOverdue !== null && (
                <KpiCard
                  icon={AlarmClock} chip="#e05252" tone={s.poOverdue > 0 ? "alert" : undefined}
                  label={t("dashboard.purchasing.poOverdue")} value={fmtCount(s.poOverdue)}
                  caption={oldestOverdue
                    ? t("dashboard.purchasing.oldestOverdue").replace("{n}", String(-daysBetweenIso(response.today, oldestOverdue.date)))
                    : t("dashboard.dept.caption.asOfNow")}
                />
              )}
            </KpiGrid>

            {d && (
              <>
                <SplitRow
                  main={d.poValueByMonth && (
                    <ChartCard
                      fill title={t("dashboard.purchasing.poValueByMonth.title")} sub={t("dashboard.purchasing.poValueByMonth.sub")}
                      actions={d.poApprovedInPeriod && (
                        <div className="text-right">
                          <p className="text-lg font-semibold font-mono text-foreground leading-none">{fmtShort(d.poApprovedInPeriod.value)}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t("dashboard.dept.periodTag")} · {fmtCount(d.poApprovedInPeriod.count)} {docs}</p>
                        </div>
                      )}
                    >
                      <MonthlyBars
                        rows={d.poValueByMonth} series={[{ key: "value", name: t("dashboard.purchasing.poValueByMonth.series"), color: accent }]}
                        format={fmtShort} empty={t("dashboard.purchasing.poValueByMonth.empty")}
                      />
                    </ChartCard>
                  )}
                  side={d.topVendors && (
                    <ChartCard title={t("dashboard.purchasing.topVendors.title")} sub={t("dashboard.purchasing.topVendors.sub")} className="h-full">
                      <RankBars
                        rows={d.topVendors.map((v) => ({ key: v.name, label: v.name, value: v.value, display: fmtShort(v.value), sub: `${fmtCount(v.count)} ${docs}` }))}
                        color={accent} empty={t("dashboard.purchasing.topVendors.empty")}
                      />
                    </ChartCard>
                  )}
                />

                <SplitRow
                  main={d.overduePurchaseOrders && (
                    <DueListTable
                      title={t("dashboard.purchasing.overdue.title")} sub={t("dashboard.purchasing.overdue.sub")}
                      rows={d.overduePurchaseOrders} dateLabel={t("dashboard.purchasing.overdue.dateCol")} today={response.today}
                      empty={t("dashboard.purchasing.overdue.empty")}
                      actions={<OpenListButton onClick={() => onNavigatePage("purchaseOrder")} />}
                    />
                  )}
                  side={d.prStage && (
                    <ChartCard
                      title={t("dashboard.purchasing.stage.title")} sub={t("dashboard.purchasing.stage.sub")} className="h-full"
                      actions={<OpenListButton onClick={() => onNavigatePage("purchasingRequestInbox")} />}
                    >
                      <Donut
                        unit={docs} empty={t("dashboard.purchasing.stage.empty")}
                        slices={[
                          { key: "atStore", label: t("dashboard.purchasing.stage.atStore"), value: d.prStage.atStore, color: "#e08a3c" },
                          { key: "atPurchasing", label: t("dashboard.purchasing.stage.atPurchasing"), value: d.prStage.atPurchasing, color: "#7c4dbb" },
                          { key: "closedByStore", label: t("dashboard.purchasing.stage.closedByStore"), value: d.prStage.closedByStore, color: "#2aa36b" },
                        ]}
                      />
                    </ChartCard>
                  )}
                />
              </>
            )}
          </>
        );
      }}
    </DepartmentViewFrame>
  );
}
