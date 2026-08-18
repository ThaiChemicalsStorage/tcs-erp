import { useEffect, useMemo, useState } from "react";
import { Boxes, Search, X, History } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";
import { fetchStockMovements, createStockMovement, STOCK_MOVEMENT_KIND_LABELS, type StockMovement, type StockMovementKind } from "../../lib/stock";
import { EmptyState } from "../../components/EmptyState";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";

// หน้าสต๊อกสินค้า — เพิ่ม 2026-08-18 เป็นโครงสร้างที่ตั้งใจให้ใช้ร่วมกันได้ในอนาคต (ไม่ใช่ของฝ่ายบัญชี
// เท่านั้น) ดูหมายเหตุใน api/_lib/collections.ts (StockMovementFields) — ตัวเลขคงเหลือ (stockQty) แก้ได้
// ทางเดียวคือผ่าน applyStockMovement() เท่านั้น ทุกการเปลี่ยนแปลงจึงมีประวัติย้อนหลังเสมอ
// The Stock page — added 2026-08-18, deliberately shared infrastructure (see the doc comment on
// StockMovementFields in api/_lib/collections.ts). Product.stockQty only ever changes through
// applyStockMovement(), so every change is traceable in the movement log below.
export function StockPage({
  products,
  onProductsChange,
  categories,
  canAdjust,
}: {
  products: Product[];
  onProductsChange: (products: Product[]) => void;
  categories: ProductCategory[];
  canAdjust: boolean;
}) {
  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [historyRetryToken, setHistoryRetryToken] = useState(0);
  const toast = useToast();

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
      .catch(() => { if (!cancelled) { setMovementsResult({ key, error: true }); toast.show("โหลดประวัติการปรับสต๊อกไม่สำเร็จ"); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyProduct?.id, historyRetryToken]);
  const movementsKey = `${historyProduct?.id ?? ""}#${historyRetryToken}`;
  const currentMovements = movementsResult?.key === movementsKey ? movementsResult : null;
  const loadingMovements = currentMovements === null;
  const movements = currentMovements?.movements ?? [];

  const totalUnits = activeProducts.reduce((sum, p) => sum + p.stockQty, 0);
  const zeroStockCount = activeProducts.filter((p) => p.stockQty <= 0).length;

  const handleAdjustSaved = (updatedProductId: string, newQty: number) => {
    onProductsChange(products.map((p) => (p.id === updatedProductId ? { ...p, stockQty: newQty } : p)));
    setAdjustTarget(null);
    setHistoryRetryToken((n) => n + 1);
    toast.show("บันทึกการปรับสต๊อกแล้ว");
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>สต๊อกสินค้า</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">จำนวนคงเหลือปัจจุบันต่อสินค้า และประวัติการรับเข้า/ตัดออก/ปรับยอด</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: "รายการสินค้าที่มีสต๊อก", value: String(activeProducts.length) },
          { label: "จำนวนรวมทุกสินค้า (หน่วย)", value: totalUnits.toLocaleString("th-TH") },
          { label: "สินค้าคงเหลือ 0", value: String(zeroStockCount) },
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

      <div className="relative h-9 w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหารหัส / ชื่อสินค้า"
          className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X size={13} />
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {activeProducts.length === 0 ? (
          <EmptyState icon={Boxes} title="ยังไม่มีสินค้า" description="เพิ่มสินค้าได้ที่หน้าคลังสินค้า" compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">ไม่พบสินค้าตามเงื่อนไขที่ค้นหา</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["รหัสสินค้า", "ชื่อสินค้า", "หมวดหมู่", "หน่วย", "คงเหลือ", ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{p.code}</td>
                    <td className="px-4 py-3.5 text-sm text-foreground font-medium max-w-[280px] truncate" title={p.name}>{p.name}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{categoryName(p.categoryId)}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{p.unit || "—"}</td>
                    <td className={`px-4 py-3.5 text-sm font-mono font-semibold whitespace-nowrap ${p.stockQty <= 0 ? "text-[#c23f3f]" : "text-foreground"}`}>{p.stockQty.toLocaleString("th-TH")}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setHistoryProduct(p)} className="text-muted-foreground hover:text-foreground transition-colors" title="ดูประวัติการปรับสต๊อก">
                          <History size={14} />
                        </button>
                        {canAdjust && (
                          <button
                            onClick={() => setAdjustTarget(p)}
                            className="px-2 py-1 text-xs border border-[#c9a84c]/40 text-[#a5813a] rounded-lg hover:bg-[#c9a84c]/10 transition-colors"
                          >
                            ปรับสต๊อก
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

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            ประวัติการปรับสต๊อก{historyProduct ? ` — ${historyProduct.name}` : "ล่าสุด"}
          </h2>
          {historyProduct && (
            <button onClick={() => setHistoryProduct(null)} className="text-xs text-muted-foreground hover:text-foreground">แสดงทุกสินค้า</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <th className="text-left font-medium px-4 py-3">วันที่</th>
                {!historyProduct && <th className="text-left font-medium px-4 py-3">สินค้า</th>}
                <th className="text-left font-medium px-4 py-3">ประเภท</th>
                <th className="text-right font-medium px-4 py-3">จำนวน</th>
                <th className="text-right font-medium px-4 py-3">คงเหลือหลัง</th>
                <th className="text-left font-medium px-4 py-3">เหตุผล / อ้างอิง</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{new Date(m.createdAt).toLocaleString("th-TH")}</td>
                  {!historyProduct && <td className="px-4 py-3 text-xs text-foreground whitespace-nowrap">{m.productCode} — {m.productName}</td>}
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{STOCK_MOVEMENT_KIND_LABELS[m.kind]}</td>
                  <td className={`px-4 py-3 text-xs font-mono text-right whitespace-nowrap ${m.delta < 0 ? "text-[#c23f3f]" : "text-[#207e52]"}`}>{m.delta > 0 ? "+" : ""}{m.delta.toLocaleString("th-TH")}</td>
                  <td className="px-4 py-3 text-xs font-mono text-right whitespace-nowrap">{m.balanceAfter.toLocaleString("th-TH")}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.sourceLabel ? `${m.sourceLabel} — ` : ""}{m.reason}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={historyProduct ? 5 : 6} className="text-center text-xs text-muted-foreground py-10">
                    {loadingMovements ? "กำลังโหลด..." : "ยังไม่มีประวัติการปรับสต๊อก"}
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
    </div>
  );
}

function AdjustStockDialog({ product, onSaved, onCancel }: {
  product: Product;
  onSaved: (productId: string, newQty: number) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<StockMovementKind>("receive");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 0 || (kind !== "adjust" && n <= 0)) {
      setError(kind === "adjust" ? "กรุณาระบุจำนวนที่ไม่เป็นศูนย์" : "กรุณาระบุจำนวนที่มากกว่า 0");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const movement = kind === "adjust"
        ? await createStockMovement({ productId: product.id, kind, delta: n, reason: reason.trim() })
        : await createStockMovement({ productId: product.id, kind, qty: n, reason: reason.trim() });
      onSaved(product.id, movement.balanceAfter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>ปรับสต๊อก — {product.name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">คงเหลือปัจจุบัน {product.stockQty.toLocaleString("th-TH")} {product.unit}</p>
        </div>

        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit">
          {(["receive", "deduct", "adjust"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${kind === k ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}
            >
              {STOCK_MOVEMENT_KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <label className="block text-xs text-muted-foreground space-y-1">
          <span>{kind === "adjust" ? "จำนวนที่ปรับ (+/-)" : "จำนวน"}</span>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={kind === "adjust" ? "เช่น -3 หรือ 5" : "0"}
            className="h-9 w-full px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
        </label>

        <label className="block text-xs text-muted-foreground space-y-1">
          <span>เหตุผล / หมายเหตุ</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={kind === "receive" ? "เช่น รับเข้าจาก PO เลขที่..." : kind === "deduct" ? "เช่น ตัดออกเพื่อ..." : "เช่น ปรับยอดจากการตรวจนับ"}
            className="h-9 w-full px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
        </label>

        {error && <p className="text-xs text-[#c23f3f]">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} disabled={busy} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void handleSave()} disabled={busy} className="px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-medium hover:brightness-95 transition-all disabled:opacity-50">
            {busy ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
