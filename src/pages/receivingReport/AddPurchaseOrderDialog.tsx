import { useEffect, useId, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { formatQuoteDateThai } from "../../lib/quotes";
import { fetchPurchaseOrderCandidates, type ReceivingPurchaseOrderCandidate } from "../../lib/receivingReport";

/**
 * เลือกใบสั่งซื้อเพิ่มเข้าใบรับสินค้า (2026-09-29 — ใบเดียวรับหลาย PO) · รายการมาจากเซิร์ฟเวอร์: อนุมัติแล้ว ผู้ขายเดียวกับใบหลัก
 * และยังไม่อยู่ในใบรับสินค้าใบไหน · กดแถว = เพิ่มทันที (หน้าต่างปิดเมื่อสำเร็จ)
 */
export function AddPurchaseOrderDialog({ receivingReportId, vendorName, busy, onPick, onCancel }: {
  receivingReportId: string;
  vendorName: string;
  busy: boolean;
  onPick: (purchaseOrderId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  const [rows, setRows] = useState<ReceivingPurchaseOrderCandidate[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPurchaseOrderCandidates(receivingReportId)
      .then((list) => { if (!cancelled) setRows(list); })
      .catch((err) => { if (!cancelled) { setRows([]); setError(err instanceof ApiError ? err.message : t("receivingReportDoc.addPo.loadError")); } });
    return () => { cancelled = true; };
  }, [receivingReportId, t]);

  const q = search.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !q || [r.documentNumber, r.jobCode].some((v) => v.toLowerCase().includes(q)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={busy ? undefined : onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col p-5 gap-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-foreground">{t("receivingReportDoc.addPo.title")}</h2>
            <p className="text-xs text-muted-foreground mt-1">{t("receivingReportDoc.addPo.hint").replace("{vendor}", vendorName || "—")}</p>
          </div>
          <button onClick={onCancel} disabled={busy} aria-label={t("receivingReportDoc.addPo.close")} className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60">
            <X size={16} />
          </button>
        </div>
        <div className="relative h-9">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("receivingReportDoc.addPo.search")}
            className="h-9 w-full pl-9 pr-3 text-xs text-foreground bg-white border border-[#c3ccda] rounded-lg outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors" />
        </div>
        <div className="flex-1 overflow-y-auto min-h-[8rem]">
          {rows === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground" role="status">
              <Loader2 size={14} className="animate-spin" /> {t("receivingReportDoc.addPo.loading")}
            </div>
          ) : error ? (
            <p className="text-xs text-[#e05252] py-6 text-center" role="alert">{error}</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">{t("receivingReportDoc.addPo.empty")}</p>
          ) : (
            <div className="space-y-1.5">
              {shown.map((r) => (
                <button key={r.id} onClick={() => onPick(r.id)} disabled={busy}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-[#c3ccda] bg-white/60 hover:bg-secondary/40 hover:bg-[#f4f6fa] transition-colors disabled:opacity-60">
                  <p className="text-sm font-mono font-medium text-foreground">{r.documentNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      r.orderDate ? formatQuoteDateThai(r.orderDate) : "",
                      r.jobCode,
                      t("receivingReportDoc.addPo.lineCount").replace("{n}", String(r.lineCount)),
                    ].filter(Boolean).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
