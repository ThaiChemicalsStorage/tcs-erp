import { ChevronRight } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { STOCK_MOVEMENT_KIND_LABEL_KEY } from "../../../lib/stock";
import { fmtShort } from "../format";
import { ErrorState } from "../DashboardStates";
import {
  CardFooterLink, CardTable, ChartCard, DepartmentViewFrame, EmptyNote, KpiCard, KpiGrid, MonthlyBars, Num, OpenListButton, ProgressBar,
  RankBars, SeriesLegend, SplitRow, TabIntro, type DepartmentTabProps
} from "./DepartmentWidgets";
import { CHART, TD, TONE, TR } from "./dashboardTokens";
import { fmtAxis, fmtCount } from "./countFormat";

/**
 * แท็บคลังสินค้า — มูลค่าสต๊อก ของใกล้หมด คิวจ่ายของ/รับของ · รับเข้า vs ตัดจ่าย 12 เดือน · มูลค่าตามหมวดหมู่
 * · ความเคลื่อนไหวล่าสุด · สินค้าถึงจุดเตือน (docs/DASHBOARD_DESIGN.md ข้อ 7 · บอร์ด Dashboard-Inventory)
 */
export function InventoryTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
  return (
    <DepartmentViewFrame view="inventory" result={result} onRetry={onRetry}>
      {(response) => {
        const block = response.blocks.inventory;
        if (!block) return <ErrorState onRetry={onRetry} />;
        const s = block.summary;
        const d = block.detail;
        const now = t("dashboard.dept.caption.asOfNow");
        const items = t("dashboard.unit.items");
        const docs = t("dashboard.unit.docs");
        const mrByDept = d?.mrAwaitingIssueByDepartment ?? null;
        const storeQueue = d && (d.prAwaitingStore !== null || d.pendingProductRequests !== null);
        const movementSeries = [
          { key: "receive", name: t("dashboard.inventory.movementsByMonth.receive"), color: CHART.blue },
          { key: "deduct", name: t("dashboard.inventory.movementsByMonth.deduct"), color: CHART.orange },
        ];
        return (
          <>
            <TabIntro scope={block.scope} />
            <KpiGrid>
              {s.stockValue !== null && (
                <KpiCard
                  label={t("dashboard.inventory.stockValue")} value={fmtShort(s.stockValue)} scope={now}
                  help={t("dashboard.inventory.stockValueHelp")} caption={t("dashboard.inventory.stockValueCaption")}
                />
              )}
              {s.lowStock !== null && (
                <KpiCard
                  tone={s.lowStock > 0 ? "warn" : undefined} scope={now}
                  label={t("dashboard.inventory.lowStock")} value={fmtCount(s.lowStock)} unit={items}
                  caption={d?.outOfStock !== null && d?.outOfStock !== undefined
                    ? <>{t("dashboard.inventory.outOfStock")} <Num tone={d.outOfStock > 0 ? "alert" : undefined}>{fmtCount(d.outOfStock)}</Num> {items}</>
                    : undefined}
                />
              )}
              {s.mrAwaitingIssue !== null && (
                <KpiCard
                  label={t("dashboard.inventory.mrAwaitingIssue")} value={fmtCount(s.mrAwaitingIssue)} unit={docs} scope={now}
                  segments={mrByDept ? [
                    { key: "production", label: t("dashboard.tab.production"), value: mrByDept.production, color: CHART.blue },
                    { key: "project", label: t("dashboard.tab.project"), value: mrByDept.project, color: CHART.orange },
                  ] : undefined}
                />
              )}
              {s.openReceivingReports !== null && (
                <KpiCard
                  label={t("dashboard.inventory.openReceivingReports")} value={fmtCount(s.openReceivingReports)} unit={docs} scope={now}
                  caption={d?.outstandingReceiveValue !== null && d?.outstandingReceiveValue !== undefined
                    ? <>{t("dashboard.inventory.outstandingReceiveValue")} <Num>{fmtShort(d.outstandingReceiveValue)}</Num></>
                    : undefined}
                />
              )}
            </KpiGrid>

            {d && (
              <>
                <SplitRow
                  main={d.movementsByMonth && (
                    <ChartCard fill title={t("dashboard.inventory.movementsByMonth.title")} sub={t("dashboard.inventory.movementsByMonth.sub")} actions={<SeriesLegend series={movementSeries} />}>
                      <MonthlyBars rows={d.movementsByMonth} format={fmtShort} axisFormat={fmtAxis} empty={t("dashboard.inventory.movementsByMonth.empty")} series={movementSeries} />
                    </ChartCard>
                  )}
                  side={d.stockValueByCategory && (
                    <ChartCard title={t("dashboard.inventory.valueByCategory.title")} sub={t("dashboard.inventory.valueByCategory.sub")} className="h-full">
                      <RankBars
                        rows={d.stockValueByCategory.map((c) => ({ key: c.categoryId || "none", label: c.categoryName, value: c.value, display: fmtShort(c.value) }))}
                        empty={t("dashboard.inventory.valueByCategory.empty")}
                      />
                    </ChartCard>
                  )}
                />

                <SplitRow
                  main={d.recentMovements && (
                    <CardTable
                      title={t("dashboard.inventory.recent.title")} sub={t("dashboard.dept.periodTag")}
                      headers={[{ label: t("dashboard.inventory.col.product") }, { label: t("dashboard.inventory.col.kind") }, { label: t("dashboard.inventory.col.qty"), align: "right" }, { label: t("dashboard.inventory.col.time") }]}
                      empty={t("dashboard.inventory.recent.empty")} isEmpty={d.recentMovements.length === 0}
                      actions={<OpenListButton onClick={() => onNavigatePage("stock")} />}
                    >
                      {d.recentMovements.map((m) => (
                        <tr key={m.id} className={TR}>
                          <td className={`${TD} max-w-[300px]`} title={`${m.productCode} ${m.productName}`}>
                            <span className="flex flex-col leading-snug min-w-0">
                              <span className="font-mono text-[13px] font-medium truncate">{m.productCode}</span>
                              <span className="text-xs text-muted-foreground truncate">{m.productName}</span>
                            </span>
                          </td>
                          <td className={TD}>
                            <span className={`inline-flex items-center h-[22px] px-2 rounded-md text-xs font-semibold whitespace-nowrap ${m.delta > 0 ? "bg-[#e6f4ec] text-[#1b7f4f]" : "bg-[#eef1f6] text-[#3d5173]"}`}>
                              {t(STOCK_MOVEMENT_KIND_LABEL_KEY[m.kind])}
                            </span>
                          </td>
                          <td className={`${TD} text-right font-semibold tabular-nums whitespace-nowrap ${m.delta < 0 ? "text-[#b93636]" : "text-[#1b7f4f]"}`}>{m.delta > 0 ? "+" : ""}{fmtCount(m.delta)}</td>
                          <td className={`${TD} text-[#3d5173] whitespace-nowrap tabular-nums`}>{new Date(m.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                        </tr>
                      ))}
                    </CardTable>
                  )}
                  side={(d.lowStockItems || storeQueue) && (
                    <ChartCard title={t("dashboard.inventory.lowStockTable.title")} sub={t("dashboard.inventory.lowStockTable.sub")} className="h-full" bodyClassName="flex-1 flex flex-col">
                      {d.lowStockItems && (d.lowStockItems.length === 0 ? (
                        <EmptyNote>{t("dashboard.inventory.lowStockTable.empty")}</EmptyNote>
                      ) : (
                        <ul className="px-5 pt-4 pb-3 flex flex-col gap-[11px]">
                          {d.lowStockItems.slice(0, 6).map((p) => (
                            <li key={p.id} className="flex flex-col gap-1.5 min-w-0">
                              <div className="flex items-baseline gap-2 text-[13px]">
                                <span className="flex-1 min-w-0 truncate text-[#26395a]" title={`${p.code} ${p.name}`}>{p.name}</span>
                                <span className={`font-semibold tabular-nums whitespace-nowrap flex-shrink-0 ${p.stockQty <= 0 ? "text-[#b93636]" : "text-[#8a5a00]"}`}>
                                  {fmtCount(p.stockQty)} / {fmtCount(p.reorderPoint)} {p.unit}
                                </span>
                              </div>
                              <ProgressBar height={6} value={Math.max(0, p.stockQty)} max={p.reorderPoint} color={p.stockQty <= 0 ? TONE.alert : TONE.warn} label={`${p.name} ${fmtCount(p.stockQty)} / ${fmtCount(p.reorderPoint)} ${p.unit}`} />
                            </li>
                          ))}
                        </ul>
                      ))}
                      {storeQueue && (
                        <div className="px-3 pt-2 pb-2 border-t border-[#eef1f6] flex flex-col">
                          <span className="px-2 pb-1 text-xs font-semibold text-muted-foreground">{t("dashboard.inventory.storeQueue.title")}</span>
                          {d.prAwaitingStore !== null && (
                            <QueueLink label={t("dashboard.inventory.prAwaitingStore")} value={d.prAwaitingStore} dot={TONE.warn} onClick={() => onNavigatePage("storeRequestInbox")} />
                          )}
                          {d.pendingProductRequests !== null && (
                            <QueueLink label={t("dashboard.inventory.pendingProductRequests")} value={d.pendingProductRequests} dot={CHART.blue} onClick={() => onNavigatePage("productRequest")} />
                          )}
                        </div>
                      )}
                      {d.lowStockItems && <CardFooterLink label={t("dashboard.inventory.openStock")} onClick={() => onNavigatePage("stock")} />}
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

function QueueLink({ label, value, dot, onClick }: { label: string; value: number; dot: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-9 px-2 rounded-md flex items-center gap-2.5 text-sm text-left hover:bg-[#f4f6fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} aria-hidden="true" />
      <span className="flex-1 min-w-0 truncate text-[#26395a]">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{fmtCount(value)}</span>
      <ChevronRight size={14} className="text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
