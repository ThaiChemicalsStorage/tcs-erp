import { ShoppingCart, FileClock, Truck, AlarmClock, FileCheck2, Wallet, Warehouse, PackageCheck } from "lucide-react";
import { useI18n, type TranslationKey } from "../../../lib/i18n";
import { ChartCard } from "../ChartCard";
import { fmtShort } from "../format";
import { DASHBOARD_TAB_META } from "./tabMeta";
import {
  CardTable, DepartmentTabFrame, DueListTable, OpenListButton, StatTile, StatusBreakdownCard, TabIntro, TileGrid,
  type DepartmentTabProps,
} from "./DepartmentWidgets";
import { fmtCount } from "./countFormat";

const PR_DEPARTMENT_LABEL: Record<"project" | "production" | "general", TranslationKey> = {
  project: "dashboard.purchasing.pr.dept.project",
  production: "dashboard.purchasing.pr.dept.production",
  general: "dashboard.purchasing.pr.dept.general",
};

/** แท็บจัดซื้อ — ใบขอซื้อที่ถึงคิว ใบสั่งซื้อที่รออนุมัติ/รอรับของ และใบที่เลยวันต้องการรับของ */
export function PurchasingTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
  const accent = DASHBOARD_TAB_META.purchasing.accent;
  return (
    <DepartmentTabFrame dept="purchasing" result={result} onRetry={onRetry}>
      {(block, response) => {
        const s = block.summary;
        const d = block.detail;
        return (
          <>
            <TabIntro scope={block.scope} />
            <TileGrid>
              {s.prAwaitingPo !== null && <StatTile icon={ShoppingCart} label={t("dashboard.purchasing.prAwaitingPo")} value={fmtCount(s.prAwaitingPo)} accent={accent} />}
              {s.poPending !== null && <StatTile icon={FileClock} label={t("dashboard.purchasing.poPending")} value={fmtCount(s.poPending)} accent="#e08a3c" />}
              {s.poAwaitingReceipt !== null && <StatTile icon={Truck} label={t("dashboard.purchasing.poAwaitingReceipt")} value={fmtCount(s.poAwaitingReceipt)} accent="#3b6fc9" />}
              {s.poOverdue !== null && <StatTile icon={AlarmClock} label={t("dashboard.purchasing.poOverdue")} value={fmtCount(s.poOverdue)} accent="#e05252" tone={s.poOverdue > 0 ? "alert" : undefined} />}
            </TileGrid>

            {d && (
              <>
                {(d.poStatus || d.poApprovedInPeriod) && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {d.poStatus && (
                      <StatusBreakdownCard
                        title={t("dashboard.purchasing.poStatus.title")} counts={d.poStatus}
                        actions={<OpenListButton onClick={() => onNavigatePage("purchaseOrder")} />}
                      />
                    )}
                    {d.poApprovedInPeriod && (
                      <ChartCard title={t("dashboard.purchasing.poApproved.title")} sub={t("dashboard.purchasing.poApproved.sub")}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <StatTile variant="inset" icon={FileCheck2} label={t("dashboard.purchasing.poApproved.count")} value={fmtCount(d.poApprovedInPeriod.count)} accent="#2aa36b" />
                          <StatTile variant="inset" icon={Wallet} label={t("dashboard.purchasing.poApproved.value")} value={fmtShort(d.poApprovedInPeriod.value)} accent={accent} />
                        </div>
                      </ChartCard>
                    )}
                  </div>
                )}

                {d.overduePurchaseOrders && (
                  <DueListTable
                    title={t("dashboard.purchasing.overdue.title")} sub={t("dashboard.purchasing.overdue.sub")}
                    rows={d.overduePurchaseOrders} dateLabel={t("dashboard.purchasing.overdue.dateCol")} today={response.today}
                    empty={t("dashboard.purchasing.overdue.empty")}
                    actions={<OpenListButton onClick={() => onNavigatePage("purchaseOrder")} />}
                  />
                )}

                {(d.prStatusByDepartment || d.prStage) && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {d.prStatusByDepartment && (
                      <CardTable
                        title={t("dashboard.purchasing.pr.title")} sub={t("dashboard.dept.allDocsNow")}
                        headers={[t("dashboard.purchasing.pr.col.department"), t("dashboard.dept.status.draft"), t("dashboard.dept.status.pending"), t("dashboard.dept.status.final")]}
                        empty="" isEmpty={false}
                        actions={<OpenListButton onClick={() => onNavigatePage("purchasingRequestInbox")} />}
                      >
                        {d.prStatusByDepartment.map((row) => (
                          <tr key={row.ownerDepartment} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-2.5 text-sm text-foreground whitespace-nowrap">{t(PR_DEPARTMENT_LABEL[row.ownerDepartment])}</td>
                            <td className="px-4 py-2.5 text-xs font-mono text-foreground">{fmtCount(row.counts.draft)}</td>
                            <td className="px-4 py-2.5 text-xs font-mono text-foreground">{fmtCount(row.counts.pending)}</td>
                            <td className="px-4 py-2.5 text-xs font-mono text-foreground">{fmtCount(row.counts.final)}</td>
                          </tr>
                        ))}
                      </CardTable>
                    )}
                    {d.prStage && (
                      <ChartCard title={t("dashboard.purchasing.stage.title")} sub={t("dashboard.purchasing.stage.sub")}>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <StatTile variant="inset" icon={Warehouse} label={t("dashboard.purchasing.stage.atStore")} value={fmtCount(d.prStage.atStore)} accent="#e08a3c" />
                          <StatTile variant="inset" icon={ShoppingCart} label={t("dashboard.purchasing.stage.atPurchasing")} value={fmtCount(d.prStage.atPurchasing)} accent={accent} />
                          <StatTile variant="inset" icon={PackageCheck} label={t("dashboard.purchasing.stage.closedByStore")} value={fmtCount(d.prStage.closedByStore)} accent="#2aa36b" />
                        </div>
                      </ChartCard>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        );
      }}
    </DepartmentTabFrame>
  );
}
