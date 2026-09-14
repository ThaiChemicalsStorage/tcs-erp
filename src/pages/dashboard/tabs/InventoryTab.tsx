import { Wallet, AlertTriangle, PackageMinus, PackageCheck, Truck, ShoppingCart, PackagePlus } from "lucide-react";
import { useI18n } from "../../../lib/i18n";
import { STOCK_MOVEMENT_KIND_LABEL_KEY } from "../../../lib/stock";
import { ChartCard } from "../ChartCard";
import { ProductsByCategoryChart } from "../DashboardCharts";
import { fmtShort } from "../format";
import { DASHBOARD_TAB_META } from "./tabMeta";
import {
  CardTable, DepartmentTabFrame, OpenListButton, StatTile, TabIntro, TileGrid, type DepartmentTabProps,
} from "./DepartmentWidgets";
import { fmtCount } from "./countFormat";

/** แท็บคลังสินค้า — มูลค่าสต๊อก ของใกล้หมด คิวจ่ายของ/รับของ และความเคลื่อนไหวในช่วงที่เลือก */
export function InventoryTab({ result, onRetry, onNavigatePage }: DepartmentTabProps) {
  const { t } = useI18n();
  const accent = DASHBOARD_TAB_META.inventory.accent;
  return (
    <DepartmentTabFrame dept="inventory" result={result} onRetry={onRetry}>
      {(block) => {
        const s = block.summary;
        const d = block.detail;
        const periodTag = t("dashboard.dept.periodTag");
        return (
          <>
            <TabIntro scope={block.scope} />
            <TileGrid>
              {s.stockValue !== null && <StatTile icon={Wallet} label={t("dashboard.inventory.stockValue")} value={fmtShort(s.stockValue)} accent={accent} help={t("dashboard.inventory.stockValueHelp")} />}
              {s.lowStock !== null && <StatTile icon={AlertTriangle} label={t("dashboard.inventory.lowStock")} value={fmtCount(s.lowStock)} accent="#e08a3c" tone={s.lowStock > 0 ? "warn" : undefined} />}
              {s.mrAwaitingIssue !== null && <StatTile icon={PackageMinus} label={t("dashboard.inventory.mrAwaitingIssue")} value={fmtCount(s.mrAwaitingIssue)} accent="#3b6fc9" />}
              {s.openReceivingReports !== null && <StatTile icon={PackageCheck} label={t("dashboard.inventory.openReceivingReports")} value={fmtCount(s.openReceivingReports)} accent="#2aa36b" />}
            </TileGrid>

            {d && (
              <>
                {(d.outstandingReceiveValue !== null || d.prAwaitingStore !== null || d.pendingProductRequests !== null) && (
                  <TileGrid>
                    {d.outstandingReceiveValue !== null && <StatTile icon={Truck} label={t("dashboard.inventory.outstandingReceiveValue")} value={fmtShort(d.outstandingReceiveValue)} accent="#5a7299" />}
                    {d.prAwaitingStore !== null && <StatTile icon={ShoppingCart} label={t("dashboard.inventory.prAwaitingStore")} value={fmtCount(d.prAwaitingStore)} accent="#7c4dbb" />}
                    {d.pendingProductRequests !== null && <StatTile icon={PackagePlus} label={t("dashboard.inventory.pendingProductRequests")} value={fmtCount(d.pendingProductRequests)} accent="#1f9d8a" />}
                  </TileGrid>
                )}

                {d.lowStockItems && (
                  <CardTable
                    title={t("dashboard.inventory.lowStockTable.title")} sub={t("dashboard.inventory.lowStockTable.sub")}
                    headers={[t("dashboard.inventory.col.code"), t("dashboard.inventory.col.product"), t("dashboard.inventory.col.remaining"), t("dashboard.inventory.col.reorderPoint")]}
                    empty={t("dashboard.inventory.lowStockTable.empty")} isEmpty={d.lowStockItems.length === 0}
                    actions={<OpenListButton onClick={() => onNavigatePage("stock")} />}
                  >
                    {d.lowStockItems.map((p) => (
                      <tr key={p.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-2.5 text-xs font-mono text-foreground font-semibold whitespace-nowrap">{p.code}</td>
                        <td className="px-4 py-2.5 text-sm text-foreground max-w-[320px] truncate" title={p.name}>{p.name}</td>
                        <td className={`px-4 py-2.5 text-xs font-mono whitespace-nowrap ${p.stockQty <= 0 ? "text-[#d22626]" : "text-[#a75d1a]"}`}>{fmtCount(p.stockQty)} {p.unit}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{fmtCount(p.reorderPoint)}</td>
                      </tr>
                    ))}
                  </CardTable>
                )}

                {d.movementsByKind && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <ChartCard title={t("dashboard.inventory.movements.title")} sub={periodTag}>
                      <div className="grid grid-cols-2 gap-3">
                        {d.movementsByKind.map((m) => (
                          <div key={m.kind} className="border border-border rounded-lg p-3 min-w-0">
                            <p className="text-xs text-muted-foreground truncate">{t(STOCK_MOVEMENT_KIND_LABEL_KEY[m.kind])}</p>
                            <p className="text-lg font-bold font-mono text-foreground leading-tight mt-1">{fmtCount(m.count)} <span className="text-xs font-normal text-muted-foreground">{t("dashboard.inventory.movements.unit")}</span></p>
                            <p className="text-xs font-mono text-muted-foreground mt-0.5">{fmtShort(m.amount)}</p>
                          </div>
                        ))}
                      </div>
                    </ChartCard>

                    {d.recentMovements && (
                      <CardTable
                        title={t("dashboard.inventory.recent.title")} sub={periodTag}
                        headers={[t("dashboard.inventory.col.product"), t("dashboard.inventory.col.kind"), t("dashboard.inventory.col.qty"), t("dashboard.inventory.col.time")]}
                        empty={t("dashboard.inventory.recent.empty")} isEmpty={d.recentMovements.length === 0}
                      >
                        {d.recentMovements.map((m) => (
                          <tr key={m.id} className="border-b border-border/50 last:border-0">
                            <td className="px-4 py-2.5 text-sm text-foreground max-w-[220px] truncate" title={`${m.productCode} ${m.productName}`}>
                              <span className="font-mono text-xs text-muted-foreground mr-1.5">{m.productCode}</span>{m.productName}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{t(STOCK_MOVEMENT_KIND_LABEL_KEY[m.kind])}</td>
                            <td className={`px-4 py-2.5 text-xs font-mono whitespace-nowrap ${m.delta < 0 ? "text-[#d22626]" : "text-[#207e52]"}`}>{m.delta > 0 ? "+" : ""}{fmtCount(m.delta)}</td>
                            <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{new Date(m.createdAt).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</td>
                          </tr>
                        ))}
                      </CardTable>
                    )}
                  </div>
                )}

                <ProductsByCategoryChart categoryBreakdown={d.categoryBreakdown} />
              </>
            )}
          </>
        );
      }}
    </DepartmentTabFrame>
  );
}
