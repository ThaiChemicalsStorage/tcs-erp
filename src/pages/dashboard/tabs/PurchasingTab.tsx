import { useI18n } from "../../../lib/i18n";
import { fmtShort } from "../format";
import { ErrorState } from "../DashboardStates";
import { HeaderFigure } from "../ChartCard";
import {
  ChartCard, DepartmentViewFrame, Donut, DueListTable, KpiCard, KpiGrid, MonthlyBars, OpenListButton, RankBars,
  SplitRow, TabIntro, type DepartmentTabProps
} from "./DepartmentWidgets";
import { CHART, TONE } from "./dashboardTokens";
import { daysBetweenIso, fmtAxis, fmtCount } from "./countFormat";
import { PurchasingLeadTimeSection } from "./PurchasingLeadTime";

/**
 * แท็บจัดซื้อ — ใบขอซื้อที่ถึงคิว ใบสั่งซื้อที่รออนุมัติ/รอรับของ/เลยกำหนด · มูลค่าใบสั่งซื้อ 12 เดือน
 * · ผู้ขายยอดสูงสุด · ใบขอซื้ออยู่ขั้นไหน (docs/DASHBOARD_DESIGN.md ข้อ 7 · บอร์ด Dashboard-Purchasing)
 * ยอดเงินในแท็บนี้คิดแบบเดิมทุกตัว (รวม VAT ตามใบ) — เจ้าของสั่งคงไว้ 2026-09-30 ไม่เปลี่ยนเป็นก่อนภาษีตามบอร์ด
 */
export function PurchasingTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
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
        const now = t("dashboard.dept.caption.asOfNow");
        return (
          <>
            <TabIntro scope={block.scope} />
            <KpiGrid>
              {s.prAwaitingPo !== null && (
                <KpiCard
                  label={t("dashboard.purchasing.prAwaitingPo")} value={fmtCount(s.prAwaitingPo)} unit={docs} scope={now}
                  segments={byDept ? [
                    { key: "project", label: t("dashboard.purchasing.pr.dept.project"), value: byDept.project, color: CHART.orange },
                    { key: "production", label: t("dashboard.purchasing.pr.dept.production"), value: byDept.production, color: CHART.blue },
                    { key: "general", label: t("dashboard.purchasing.pr.dept.general"), value: byDept.general, color: CHART.violet },
                  ] : undefined}
                />
              )}
              {s.poPending !== null && (
                <KpiCard label={t("dashboard.purchasing.poPending")} value={fmtCount(s.poPending)} unit={docs} scope={now} caption={t("dashboard.purchasing.poPendingCaption")} />
              )}
              {s.poAwaitingReceipt !== null && (
                <KpiCard
                  label={t("dashboard.purchasing.poAwaitingReceipt")} value={fmtCount(s.poAwaitingReceipt)} unit={docs} scope={now}
                  progress={d?.receiptProgress ? { value: d.receiptProgress.received, max: d.receiptProgress.approved, color: TONE.good } : undefined}
                  caption={d?.receiptProgress
                    ? t("dashboard.purchasing.receiptProgress").replace("{received}", fmtCount(d.receiptProgress.received)).replace("{approved}", fmtCount(d.receiptProgress.approved))
                    : undefined}
                />
              )}
              {s.poOverdue !== null && (
                <KpiCard
                  tone={s.poOverdue > 0 ? "alert" : undefined} scope={now}
                  label={t("dashboard.purchasing.poOverdue")} value={fmtCount(s.poOverdue)} unit={docs}
                  caption={oldestOverdue
                    ? t("dashboard.purchasing.oldestOverdue").replace("{n}", String(-daysBetweenIso(response.today, oldestOverdue.date)))
                    : undefined}
                />
              )}
            </KpiGrid>

            {/* KPI ระยะเวลาออกใบสั่งซื้อ (เจ้าของสั่ง 2026-10-02) — ต่อจากตัวเลขหลักเดิม ตามบอร์ดใน canvas */}
            {d?.leadTime && (
              <PurchasingLeadTimeSection data={d.leadTime} onOpenInbox={() => onNavigatePage("purchasingRequestInbox")} />
            )}

            {d && (
              <>
                <SplitRow
                  main={d.poValueByMonth && (
                    <ChartCard
                      fill title={t("dashboard.purchasing.poValueByMonth.title")} sub={t("dashboard.purchasing.poValueByMonth.sub")}
                      actions={d.poApprovedInPeriod && (
                        <HeaderFigure label={`${t("dashboard.dept.periodTag")} · ${fmtCount(d.poApprovedInPeriod.count)} ${docs}`} value={fmtShort(d.poApprovedInPeriod.value)} />
                      )}
                    >
                      <MonthlyBars
                        rows={d.poValueByMonth} series={[{ key: "value", name: t("dashboard.purchasing.poValueByMonth.series") }]}
                        format={fmtShort} axisFormat={fmtAxis} empty={t("dashboard.purchasing.poValueByMonth.empty")}
                      />
                    </ChartCard>
                  )}
                  side={d.topVendors && (
                    <ChartCard title={t("dashboard.purchasing.topVendors.title")} sub={t("dashboard.purchasing.topVendors.sub")} className="h-full">
                      <RankBars
                        rows={d.topVendors.map((v) => ({ key: v.name, label: v.name, value: v.value, display: fmtShort(v.value), sub: `${fmtCount(v.count)} ${docs}` }))}
                        empty={t("dashboard.purchasing.topVendors.empty")}
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
                      actions={<OpenListButton label={t("dashboard.dept.openItems")} onClick={() => onNavigatePage("purchasingRequestInbox")} />}
                    >
                      <Donut
                        unit={docs} empty={t("dashboard.purchasing.stage.empty")}
                        slices={[
                          { key: "atStore", label: t("dashboard.purchasing.stage.atStore"), value: d.prStage.atStore, color: TONE.warn },
                          { key: "atPurchasing", label: t("dashboard.purchasing.stage.atPurchasing"), value: d.prStage.atPurchasing, color: CHART.blue },
                          { key: "closedByStore", label: t("dashboard.purchasing.stage.closedByStore"), value: d.prStage.closedByStore, color: TONE.good },
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
