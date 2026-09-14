import { Wallet, AlertTriangle, PackageMinus, PackageCheck } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { STOCK_MOVEMENT_KIND_LABEL_KEY } from "../../../lib/stock";
import { fmtShort } from "../format";
import { ErrorState } from "../DashboardStates";
import { DEPARTMENT_META } from "./tabMeta";
import {
  CardTable, ChartCard, DepartmentViewFrame, KpiCard, KpiGrid, MonthlyBars, OpenListButton, ProgressBar,
  RankBars, SplitRow, TabIntro, type DepartmentTabProps
} from "./DepartmentWidgets";
import { TD, TD_MONO, TR } from "./dashboardTokens";
import { fmtCount } from "./countFormat";

/**
 * แท็บคลังสินค้า — มูลค่าสต๊อก ของใกล้หมด คิวจ่ายของ/รับของ · รับเข้า vs ตัดจ่าย 12 เดือน · มูลค่าตามหมวดหมู่
 * · สินค้าถึงจุดเตือน · ความเคลื่อนไหวล่าสุด (docs/DASHBOARD_DESIGN.md ข้อ 7)
 */
export function InventoryTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
  const accent = DEPARTMENT_META.inventory.accent;
  return (
    <DepartmentViewFrame view="inventory" result={result} onRetry={onRetry}>
      {(response) => {
        const block = response.blocks.inventory;
        if (!block) return <ErrorState onRetry={onRetry} />;
        const s = block.summary;
        const d = block.detail;
        const periodTag = t("dashboard.dept.periodTag");
        const mrByDept = d?.mrAwaitingIssueByDepartment ?? null;
        const storeQueue = d && (d.prAwaitingStore !== null || d.pendingProductRequests !== null);
        return (
          <>
            <TabIntro scope={block.scope} />
            <KpiGrid>
              {s.stockValue !== null && (
                <KpiCard icon={Wallet} chip={accent} label={t("dashboard.inventory.stockValue")} value={fmtShort(s.stockValue)} help={t("dashboard.inventory.stockValueHelp")} caption={t("dashboard.dept.caption.asOfNow")} />
              )}
              {s.lowStock !== null && (
                <KpiCard
                  icon={AlertTriangle} chip="#e08a3c" tone={s.lowStock > 0 ? "warn" : undefined}
                  label={t("dashboard.inventory.lowStock")} value={fmtCount(s.lowStock)}
                  caption={d?.outOfStock !== null && d?.outOfStock !== undefined
                    ? <>{t("dashboard.inventory.outOfStock")} <span className={`font-mono ${d.outOfStock > 0 ? "text-[#d22626]" : "text-foreground"}`}>{fmtCount(d.outOfStock)}</span></>
                    : undefined}
                />
              )}
              {s.mrAwaitingIssue !== null && (
                <KpiCard
                  icon={PackageMinus} chip={accent} label={t("dashboard.inventory.mrAwaitingIssue")} value={fmtCount(s.mrAwaitingIssue)}
                  segments={mrByDept ? [
                    { key: "production", label: t("dashboard.tab.production"), value: mrByDept.production, color: "#2aa36b" },
                    { key: "project", label: t("dashboard.tab.project"), value: mrByDept.project, color: "#3b6fc9" },
                  ] : undefined}
                />
              )}
              {s.openReceivingReports !== null && (
                <KpiCard
                  icon={PackageCheck} chip={accent} label={t("dashboard.inventory.openReceivingReports")} value={fmtCount(s.openReceivingReports)}
                  caption={d?.outstandingReceiveValue !== null && d?.outstandingReceiveValue !== undefined
                    ? <>{t("dashboard.inventory.outstandingReceiveValue")} <span className="font-mono text-foreground">{fmtShort(d.outstandingReceiveValue)}</span></>
                    : undefined}
                />
              )}
            </KpiGrid>

            {d && (
              <>
                <SplitRow
                  main={d.movementsByMonth && (
                    <ChartCard title={t("dashboard.inventory.movementsByMonth.title")} sub={t("dashboard.inventory.movementsByMonth.sub")}>
                      <MonthlyBars
                        rows={d.movementsByMonth} format={fmtShort} empty={t("dashboard.inventory.movementsByMonth.empty")}
                        series={[
                          { key: "receive", name: t("dashboard.inventory.movementsByMonth.receive"), color: "#2aa36b" },
                          { key: "deduct", name: t("dashboard.inventory.movementsByMonth.deduct"), color: "#e08a3c" },
                        ]}
                      />
                    </ChartCard>
                  )}
                  side={d.stockValueByCategory && (
                    <ChartCard title={t("dashboard.inventory.valueByCategory.title")} sub={t("dashboard.inventory.valueByCategory.sub")} className="h-full">
                      <RankBars
                        rows={d.stockValueByCategory.map((c) => ({ key: c.categoryId || "none", label: c.categoryName, value: c.value, display: fmtShort(c.value) }))}
                        color={accent} empty={t("dashboard.inventory.valueByCategory.empty")}
                      />
                    </ChartCard>
                  )}
                />

                <SplitRow
                  main={d.recentMovements && (
                    <CardTable
                      title={t("dashboard.inventory.recent.title")} sub={periodTag}
                      headers={[{ label: t("dashboard.inventory.col.product") }, { label: t("dashboard.inventory.col.kind") }, { label: t("dashboard.inventory.col.qty"), align: "right" }, { label: t("dashboard.inventory.col.time") }]}
                      empty={t("dashboard.inventory.recent.empty")} isEmpty={d.recentMovements.length === 0}
                      actions={<OpenListButton onClick={() => onNavigatePage("stock")} />}
                    >
                      {d.recentMovements.map((m) => (
                        <tr key={m.id} className={TR}>
                          <td className={`${TD} max-w-[260px] truncate`} title={`${m.productCode} ${m.productName}`}>
                            <span className="font-mono text-xs text-muted-foreground mr-1.5">{m.productCode}</span>{m.productName}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{t(STOCK_MOVEMENT_KIND_LABEL_KEY[m.kind])}</td>
                          <td className={`${TD_MONO} text-right ${m.delta < 0 ? "text-[#d22626]" : "text-[#207e52]"}`}>{m.delta > 0 ? "+" : ""}{fmtCount(m.delta)}</td>
                          <td className={`${TD_MONO} text-muted-foreground`}>{new Date(m.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                        </tr>
                      ))}
                    </CardTable>
                  )}
                  side={(d.lowStockItems || storeQueue) && (
                    <ChartCard
                      title={t("dashboard.inventory.lowStockTable.title")} sub={t("dashboard.inventory.lowStockTable.sub")} className="h-full"
                      actions={d.lowStockItems ? <OpenListButton onClick={() => onNavigatePage("stock")} /> : undefined}
                    >
                      {d.lowStockItems && (d.lowStockItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-6">{t("dashboard.inventory.lowStockTable.empty")}</p>
                      ) : (
                        <ul className="space-y-3.5">
                          {d.lowStockItems.slice(0, 6).map((p) => (
                            <li key={p.id} className="space-y-1.5 min-w-0">
                              <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="truncate text-foreground min-w-0" title={`${p.code} ${p.name}`}>{p.name}</span>
                                <span className={`font-mono text-xs whitespace-nowrap ${p.stockQty <= 0 ? "text-[#d22626]" : "text-[#a75d1a]"}`}>
                                  {fmtCount(p.stockQty)} / {fmtCount(p.reorderPoint)} {p.unit}
                                </span>
                              </div>
                              <ProgressBar value={Math.max(0, p.stockQty)} max={p.reorderPoint} color={p.stockQty <= 0 ? "#e05252" : "#e08a3c"} />
                            </li>
                          ))}
                        </ul>
                      ))}
                      {storeQueue && (
                        <div className={`space-y-2 ${d.lowStockItems ? "mt-5 pt-4 border-t border-border" : ""}`}>
                          <p className="text-xs font-semibold text-muted-foreground">{t("dashboard.inventory.storeQueue.title")}</p>
                          {d.prAwaitingStore !== null && (
                            <button onClick={() => onNavigatePage("storeRequestInbox")} className="w-full flex items-center justify-between gap-3 text-sm hover:text-[#866d28] transition-colors">
                              <span>{t("dashboard.inventory.prAwaitingStore")}</span><span className="font-mono font-semibold">{fmtCount(d.prAwaitingStore)}</span>
                            </button>
                          )}
                          {d.pendingProductRequests !== null && (
                            <button onClick={() => onNavigatePage("productRequest")} className="w-full flex items-center justify-between gap-3 text-sm hover:text-[#866d28] transition-colors">
                              <span>{t("dashboard.inventory.pendingProductRequests")}</span><span className="font-mono font-semibold">{fmtCount(d.pendingProductRequests)}</span>
                            </button>
                          )}
                        </div>
                      )}
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
