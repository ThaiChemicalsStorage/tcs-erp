import { useEffect, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { fetchAllPurchaseOrders, type PurchaseOrderSummary } from "../../lib/purchaseOrder";
import { fetchAllReceivingReports } from "../../lib/receivingReport";
import { formatQuoteDateThai } from "../../lib/quotes";

/**
 * เลือกใบสั่งซื้อก่อนเปิดใบรับสินค้า
 *
 * แสดงเฉพาะใบที่ **อนุมัติแล้ว (Final)** และ **ยังไม่มีใบรับสินค้า** — ข้อหลังเป็นเรื่องความสะดวก
 * ไม่ใช่การบังคับกติกา ตัวบังคับจริงคือ unique index ฝั่งฐานข้อมูล (1 ใบสั่งซื้อ = 1 ใบรับสินค้า)
 * ถ้ารายการนี้ล้าสมัยไปหนึ่งจังหวะเพราะเพื่อนเพิ่งเปิดใบ เซิร์ฟเวอร์จะตอบ 409 แล้วหน้าจอพาไป
 * เปิดใบเดิมให้แทน ไม่ใช่ทางตัน
 */
export function PurchaseOrderPickerDialog({
  onPick, onCancel,
}: {
  onPick: (purchaseOrderId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const [rows, setRows] = useState<PurchaseOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllPurchaseOrders(), fetchAllReceivingReports()])
      .then(([orders, reports]) => {
        if (cancelled) return;
        const taken = new Set(reports.map((r) => r.purchaseOrderId));
        setRows(orders.filter((o) => o.status === "Final" && !taken.has(o.id)));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || [r.id, r.documentNumber, r.vendorName, r.jobCode].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("receivingReport.picker.title")}
        className="relative w-full max-w-2xl max-h-[80vh] flex flex-col bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("receivingReport.picker.title")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("receivingReport.picker.subtitle")}</p>
          </div>
          <button onClick={onCancel} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <div className="relative h-9">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("receivingReport.picker.searchPlaceholder")}
              className="h-9 w-full pl-9 pr-3 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12 px-5">{t("receivingReport.picker.empty")}</p>
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => onPick(r.id)}
                className="w-full text-left px-5 py-3 border-b border-border/50 hover:bg-secondary/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-mono font-semibold text-[#c9a84c]">{r.documentNumber || r.id}</span>
                  <span className="text-xs font-mono text-muted-foreground">{formatQuoteDateThai(r.updatedAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{r.vendorName || "—"} · {r.jobCode || "—"}</p>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-border">
          <button onClick={onCancel} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
