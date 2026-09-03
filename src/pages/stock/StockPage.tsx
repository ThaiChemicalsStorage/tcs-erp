import { useEffect, useMemo, useState } from "react";
import { Boxes, Search, X, History, Printer, AlertTriangle, ClipboardList } from "lucide-react";
import { type Product, type ProductCategory, updateProduct } from "../../lib/products";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { StockCountSheetPrintDocument } from "./StockCountSheetPrintDocument";
import { StockCardPrintDocument } from "./StockCardPrintDocument";
import { fetchStockMovements, createStockMovement, stockValueOf, STOCK_MOVEMENT_KIND_LABEL_KEY, type StockMovement, type StockMovementKind } from "../../lib/stock";
import { EmptyState } from "../../components/EmptyState";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

const KIND_FILTERS = ["all", "receive", "deduct", "return", "adjust"] as const;
type KindFilter = (typeof KIND_FILTERS)[number];

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// หน้าสต๊อกสินค้า — เพิ่ม 2026-08-18 เป็นโครงสร้างที่ตั้งใจให้ใช้ร่วมกันได้ในอนาคต (ไม่ใช่ของฝ่ายบัญชี
// เท่านั้น) ดูหมายเหตุใน api/_lib/collections.ts (StockMovementFields) — ตัวเลขคงเหลือ (stockQty) แก้ได้
// ทางเดียวคือผ่าน applyStockMovement() เท่านั้น ทุกการเปลี่ยนแปลงจึงมีประวัติย้อนหลังเสมอ
// 2026-09-03: มูลค่าสต๊อก (ต้นทุนถัวเฉลี่ย) · ประวัติแยก "คืนของ" และกรองตามประเภทได้ · การ์ดสต๊อกพิมพ์ได้
// The Stock page — added 2026-08-18, deliberately shared infrastructure (see the doc comment on
// StockMovementFields in api/_lib/collections.ts). Product.stockQty only ever changes through
// applyStockMovement(), so every change is traceable in the movement log below.
export function StockPage({
  products,
  onProductsChange,
  categories,
  canAdjust,
  company,
  currentUserName,
}: {
  products: Product[];
  onProductsChange: (products: Product[]) => void;
  categories: ProductCategory[];
  canAdjust: boolean;
  /** โปรไฟล์บริษัท — ใช้เฉพาะหัวจดหมายบนใบนับสต๊อกที่พิมพ์ออกไปเดินนับของ */
  company: Company;
  /** ชื่อคนที่กดพิมพ์ เติมให้ในช่อง "ผู้นับ" ของใบนับ */
  currentUserName: string;
}) {
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyRetryToken, setHistoryRetryToken] = useState(0);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  /** สินค้าที่กำลังจะพิมพ์การ์ดสต๊อก — โหลดประวัติทั้งหมด (ไม่ใช่ 200 แถวล่าสุด) แล้วค่อยสั่งพิมพ์ */
  const [cardProduct, setCardProduct] = useState<Product | null>(null);
  const [cardMovements, setCardMovements] = useState<StockMovement[] | null>(null);
  const toast = useToast();
  const { t } = useI18n();

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";

  const activeProducts = useMemo(() => products.filter((p) => !p.archived), [products]);
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = activeProducts.filter((p) =>
    !normalizedSearch || p.code.toLowerCase().includes(normalizedSearch) || p.name.toLowerCase().includes(normalizedSearch),
  );

  // เก็บผลลัพธ์พร้อม key ของรอบที่ fetch — loading คำนวณจากการเทียบ key แทนการ setState แบบ
  // synchronous ใน effect (ต้องห้ามตาม react-hooks/set-state-in-effect) — pattern เดียวกับ
  // AccountingDashboardPage.tsx
  const [movementsResult, setMovementsResult] = useState<{ key: string; movements?: StockMovement[]; error?: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = `${historyProduct?.id ?? ""}#${historyRetryToken}`;
    fetchStockMovements(historyProduct?.id ? { productId: historyProduct.id } : undefined)
      .then((movements) => { if (!cancelled) setMovementsResult({ key, movements }); })
      .catch(() => { if (!cancelled) { setMovementsResult({ key, error: true }); toast.show(t("stock.toast.loadHistoryFailed")); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyProduct?.id, historyRetryToken]);
  const movementsKey = `${historyProduct?.id ?? ""}#${historyRetryToken}`;
  const currentMovements = movementsResult?.key === movementsKey ? movementsResult : null;
  const loadingMovements = currentMovements === null;
  // ต้องแยกสถานะ "โหลดพัง" ออกจาก "ไม่มีประวัติ" — ไม่งั้นรอบที่ fetch ไม่สำเร็จจะขึ้นข้อความว่า
  // ยังไม่มีประวัติการปรับสต๊อก ซึ่งอ่านเหมือนข้อมูลจริงทั้งที่แค่โหลดไม่ได้ (pattern เดียวกับ ArMonthlyReportPage)
  const movementsError = currentMovements?.error === true;
  const allMovements = currentMovements?.movements ?? [];
  // กรองฝั่งจอจากชุดที่โหลดมาแล้ว — "คืนของ" คือสิ่งที่เจ้าของขอให้เห็นแยกออกมา (2026-09-03)
  const movements = kindFilter === "all" ? allMovements : allMovements.filter((m) => m.kind === kindFilter);

  const totalUnits = activeProducts.reduce((sum, p) => sum + p.stockQty, 0);
  const totalValue = activeProducts.reduce((sum, p) => sum + stockValueOf(p), 0);
  const zeroStockCount = activeProducts.filter((p) => p.stockQty <= 0).length;
  /** ของใกล้หมด = ตั้งจุดเตือนไว้แล้ว และยอดคงเหลือถึงหรือต่ำกว่าจุดนั้น (จุดเตือน 0 = ปิดการเตือน) */
  const isLowStock = (product: Product) => (product.reorderPoint ?? 0) > 0 && product.stockQty <= (product.reorderPoint ?? 0);
  const lowStockCount = activeProducts.filter(isLowStock).length;

  /** id ของสินค้าที่กำลังบันทึกจุดเตือนอยู่ — กันกดรัวจนยิงซ้อนกัน */
  const [savingReorderId, setSavingReorderId] = useState<string | null>(null);
  const saveReorderPoint = async (product: Product, raw: string) => {
    const next = Math.max(0, Math.floor(Number(raw) || 0));
    if (next === (product.reorderPoint ?? 0)) return;
    setSavingReorderId(product.id);
    try {
      const updated = await updateProduct(product.id, { reorderPoint: next });
      onProductsChange(products.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("stock.toast.reorderSaveFailed"));
    } finally {
      setSavingReorderId(null);
    }
  };

  // พิมพ์ใบนับสต๊อก — พิมพ์ "ตามที่เห็นบนจอ" คือรวมผลค้นหาที่กรองอยู่ด้วย เพื่อให้นับทีละหมวด/ทีละคำค้นได้
  const printedAt = new Date().toISOString().slice(0, 10);
  // ประกอบหัวจดหมายแบบเดียวกับที่ใบเบิก/ใบส่งมอบทำ — หน้านี้ถือ Company เต็มอยู่แล้ว
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  const handleAdjustSaved = (updatedProductId: string, movement: StockMovement) => {
    // ยอดและต้นทุนเฉลี่ยใหม่มาจาก movement ที่ server ตอบกลับ — มูลค่าคงเหลือ ÷ จำนวน = ค่าเฉลี่ยหลังรับ
    onProductsChange(products.map((p) => (p.id === updatedProductId
      ? { ...p, stockQty: movement.balanceAfter, avgCost: movement.balanceAfter > 0 && movement.balanceValueAfter !== undefined ? movement.balanceValueAfter / movement.balanceAfter : p.avgCost }
      : p)));
    setAdjustTarget(null);
    setHistoryRetryToken((n) => n + 1);
    toast.show(t("stock.toast.adjustSaved"));
  };

  /** การ์ดสต๊อก: โหลดประวัติทั้งหมดของสินค้าตัวนั้น (เก่า → ใหม่) แล้วสั่งพิมพ์เมื่อพร้อม */
  const printStockCard = async (product: Product) => {
    setCardProduct(product);
    setCardMovements(null);
    try {
      const all = await fetchStockMovements({ productId: product.id, limit: 2000 });
      setCardMovements([...all].reverse());
    } catch (err) {
      setCardProduct(null);
      toast.show(err instanceof ApiError ? err.message : t("stock.toast.loadCardFailed"));
    }
  };
  useEffect(() => {
    if (!cardProduct || cardMovements === null) return;
    const reset = () => { setCardProduct(null); setCardMovements(null); };
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [cardProduct, cardMovements]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 print:p-0 print:overflow-visible">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("stock.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("stock.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
        {[
          { label: t("stock.kpi.itemCount"), value: String(activeProducts.length) },
          { label: t("stock.kpi.totalUnits"), value: totalUnits.toLocaleString("th-TH") },
          { label: t("stock.kpi.stockValue"), value: money(totalValue) },
          { label: t("stock.kpi.zeroStock"), value: String(zeroStockCount) },
          { label: t("stock.kpi.lowStock"), value: String(lowStockCount) },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#5a7299]/15 to-[#5a7299]/5 flex items-center justify-center mb-3">
              <Boxes size={15} style={{ color: "#5a7299" }} />
            </div>
            <p className="text-xl font-bold text-foreground font-mono">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap print:hidden">
      <div className="relative h-9 w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("stock.search.placeholder")}
          className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        )}
      </div>
        <button
          onClick={() => window.print()}
          disabled={filtered.length === 0 || cardProduct !== null}
          className="h-9 flex items-center gap-1.5 px-3 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50"
        >
          <Printer size={13} /> {t("stock.printCountSheet")}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
        {activeProducts.length === 0 ? (
          <EmptyState icon={Boxes} title={t("stock.empty.title")} description={t("stock.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">{t("stock.noMatch")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[t("stock.table.code"), t("stock.table.name"), t("stock.table.category"), t("stock.table.unit"), t("stock.table.remaining"), t("stock.table.avgCost"), t("stock.table.value"), t("stock.table.reorderPoint"), ""].map((h, i) => (
                    <th key={i} className={`px-4 py-3 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${i === 5 || i === 6 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{p.code}</td>
                    <td className="px-4 py-3.5 text-sm text-foreground font-medium max-w-[280px] truncate" title={p.name}>
                      {p.name}
                      {p.isTool && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20">{t("stock.toolBadge")}</span>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{categoryName(p.categoryId)}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{p.unit || "—"}</td>
                    <td className={`px-4 py-3.5 text-sm font-mono font-semibold whitespace-nowrap ${p.stockQty <= 0 ? "text-[#c23f3f]" : isLowStock(p) ? "text-[#a75d1a]" : "text-foreground"}`}>
                      <span className="inline-flex items-center gap-1.5">
                        {p.stockQty.toLocaleString("th-TH")}
                        {isLowStock(p) && p.stockQty > 0 && <AlertTriangle size={12} aria-label={t("stock.lowStockBadge")} />}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground text-right whitespace-nowrap">{(p.avgCost ?? 0) > 0 ? money(p.avgCost ?? 0) : "—"}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-foreground text-right whitespace-nowrap">{stockValueOf(p) > 0 ? money(stockValueOf(p)) : "—"}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {canAdjust ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={p.reorderPoint ?? 0}
                          disabled={savingReorderId === p.id}
                          aria-label={`${t("stock.table.reorderPoint")} — ${p.name}`}
                          onBlur={(e) => void saveReorderPoint(p, e.target.value)}
                          className="w-20 h-8 px-2 text-xs font-mono text-center text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-50"
                        />
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground">{(p.reorderPoint ?? 0) || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setHistoryProduct(p)} className="text-muted-foreground opacity-50 hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity" title={t("stock.action.viewHistoryTitle")} aria-label={t("stock.action.viewHistoryTitle")}>
                          <History size={14} />
                        </button>
                        <button onClick={() => void printStockCard(p)} disabled={cardProduct !== null} className="text-muted-foreground opacity-50 hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity disabled:opacity-30" title={t("stock.action.stockCardTitle")} aria-label={t("stock.action.stockCardTitle")}>
                          <ClipboardList size={14} />
                        </button>
                        {canAdjust && (
                          <button
                            onClick={() => setAdjustTarget(p)}
                            className="px-2 py-1 text-xs border border-[#c9a84c]/40 text-[#a5813a] rounded-lg hover:bg-[#c9a84c]/10 transition-colors"
                          >
                            {t("stock.action.adjustBtn")}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {historyProduct ? `${t("stock.history.heading")} — ${historyProduct.name}` : t("stock.history.headingLatest")}
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-8 w-fit" role="group" aria-label={t("stock.history.col.kind")}>
              {KIND_FILTERS.map((k) => (
                <button key={k} onClick={() => setKindFilter(k)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-all ${kindFilter === k ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
                  {k === "all" ? t("stock.history.filter.all") : t(STOCK_MOVEMENT_KIND_LABEL_KEY[k])}
                </button>
              ))}
            </div>
            {historyProduct && (
              <button onClick={() => setHistoryProduct(null)} className="text-xs text-muted-foreground hover:text-foreground">{t("stock.history.showAll")}</button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <th className="text-left font-medium px-4 py-3">{t("stock.history.col.date")}</th>
                {!historyProduct && <th className="text-left font-medium px-4 py-3">{t("stock.history.col.product")}</th>}
                <th className="text-left font-medium px-4 py-3">{t("stock.history.col.kind")}</th>
                <th className="text-right font-medium px-4 py-3">{t("stock.history.col.qty")}</th>
                <th className="text-right font-medium px-4 py-3">{t("stock.history.col.unitCost")}</th>
                <th className="text-right font-medium px-4 py-3">{t("stock.history.col.amount")}</th>
                <th className="text-right font-medium px-4 py-3">{t("stock.history.col.balanceAfter")}</th>
                <th className="text-left font-medium px-4 py-3">{t("stock.history.col.chargeTo")}</th>
                <th className="text-left font-medium px-4 py-3">{t("stock.history.col.reason")}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{new Date(m.createdAt).toLocaleString("th-TH")}</td>
                  {!historyProduct && <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{m.productCode} — {m.productName}</td>}
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{t(STOCK_MOVEMENT_KIND_LABEL_KEY[m.kind])}</td>
                  <td className={`px-4 py-3 text-xs font-mono text-right whitespace-nowrap ${m.delta < 0 ? "text-[#c23f3f]" : "text-[#207e52]"}`}>{m.delta > 0 ? "+" : ""}{m.delta.toLocaleString("th-TH")}</td>
                  <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap text-muted-foreground">{m.unitCost !== undefined ? money(m.unitCost) : "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap">{m.amount !== undefined ? money(m.amount) : "—"}</td>
                  <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap">{m.balanceAfter.toLocaleString("th-TH")}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {[m.departmentName, m.teamName].filter(Boolean).join(" / ") || "—"}
                    {m.workTypeName && <span className="block text-xs">{m.workTypeName}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.sourceLabel ? `${m.sourceLabel} — ` : ""}{m.reason}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={historyProduct ? 8 : 9} className="text-center text-xs text-muted-foreground py-10">
                    {loadingMovements ? t("stock.history.loading") : movementsError ? (
                      <span className="inline-flex items-center gap-2">
                        {t("stock.toast.loadHistoryFailed")}
                        <button
                          onClick={() => setHistoryRetryToken((n) => n + 1)}
                          className="px-2 py-1 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
                        >
                          {t("stock.history.retry")}
                        </button>
                      </span>
                    ) : t("stock.history.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {adjustTarget && (
        <AdjustStockDialog
          product={adjustTarget}
          onSaved={handleAdjustSaved}
          onCancel={() => setAdjustTarget(null)}
        />
      )}
      <Toast message={toast.message} />

      {/* ใบนับสต๊อก — อยู่ใน DOM ตลอด ซ่อนอยู่จนกว่าจะพิมพ์ กด Ctrl+P ก็ได้ใบเดียวกัน
          ยกเว้นตอนกำลังพิมพ์การ์ดสต๊อกของสินค้าตัวหนึ่ง ซึ่งจะเข้ามาแทนที่ชั่วคราว */}
      {cardProduct && cardMovements !== null ? (
        <StockCardPrintDocument product={cardProduct} movements={cardMovements} companyHeader={companyHeader} printedAt={printedAt} />
      ) : (
        <StockCountSheetPrintDocument
          products={filtered}
          categories={categories}
          companyHeader={companyHeader}
          printedAt={printedAt}
          countedBy={currentUserName}
        />
      )}
    </div>
  );
}

function AdjustStockDialog({ product, onSaved, onCancel }: {
  product: Product;
  onSaved: (productId: string, movement: StockMovement) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<StockMovementKind>("receive");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { t } = useI18n();

  const handleSave = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 0 || (kind !== "adjust" && n <= 0)) {
      setError(kind === "adjust" ? t("stock.dialog.error.nonZeroRequired") : t("stock.dialog.error.positiveRequired"));
      return;
    }
    const cost = unitCost.trim() === "" ? undefined : Number(unitCost);
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      setError(t("stock.dialog.error.unitCostInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const movement = kind === "adjust"
        ? await createStockMovement({ productId: product.id, kind, delta: n, reason: reason.trim() })
        : await createStockMovement({ productId: product.id, kind, qty: n, reason: reason.trim(), unitCost: kind === "receive" ? cost : undefined });
      onSaved(product.id, movement);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("stock.dialog.error.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("stock.dialog.adjustTitle")} — {product.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{t("stock.dialog.currentBalancePrefix")} {product.stockQty.toLocaleString("th-TH")} {product.unit}</p>
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit">
          {(["receive", "deduct", "adjust"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${kind === k ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t(STOCK_MOVEMENT_KIND_LABEL_KEY[k])}
            </button>
          ))}
        </div>

        <label className="block text-xs text-muted-foreground space-y-1">
          <span>{kind === "adjust" ? t("stock.dialog.field.adjustQty") : t("stock.dialog.field.qty")}</span>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={kind === "adjust" ? t("stock.dialog.field.adjustPlaceholder") : "0"}
            className="h-9 w-full px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
        </label>

        {/* ต้นทุน/หน่วยตอนรับเข้า — ไม่บังคับ ถ้ากรอกจะถัวเฉลี่ยใหม่ (ใบรับสินค้าส่งราคาจริงมาเองอยู่แล้ว
            ช่องนี้สำหรับรับเข้าด้วยมือ เช่นยอดตั้งต้น) */}
        {kind === "receive" && (
          <label className="block text-xs text-muted-foreground space-y-1">
            <span>{t("stock.dialog.field.unitCost")}</span>
            <input
              type="number" min={0} step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder={(product.avgCost ?? 0) > 0 ? money(product.avgCost ?? 0) : "0.00"}
              className="h-9 w-full px-3 text-sm font-mono text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            <span className="block">{t("stock.dialog.unitCostHint")}</span>
          </label>
        )}

        <label className="block text-xs text-muted-foreground space-y-1">
          <span>{t("stock.dialog.field.reason")}</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={kind === "receive" ? t("stock.dialog.placeholder.receive") : kind === "deduct" ? t("stock.dialog.placeholder.deduct") : t("stock.dialog.placeholder.adjust")}
            className="h-9 w-full px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
        </label>

        {error && <p className="text-xs text-[#c23f3f]">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} disabled={busy} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">{t("stock.dialog.cancel")}</button>
          <button onClick={() => void handleSave()} disabled={busy} className="px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-medium hover:brightness-95 transition-all disabled:opacity-50">
            {busy ? t("stock.dialog.saving") : t("stock.dialog.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
