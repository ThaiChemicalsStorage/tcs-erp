import { useEffect, useState } from "react";
import { FilePlus2, Loader2, Search, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { fetchAllPurchaseOrders, type PurchaseOrderSummary } from "../../lib/purchaseOrder";
import {
  fetchAllReceivingReports, RECEIVING_REPORT_CODES, RECEIVING_REPORT_CODE_LABEL_KEY, type ReceivingReportCode,
} from "../../lib/receivingReport";
import { formatQuoteDateThai } from "../../lib/quotes";

/** แถวเลือกรหัสรับเข้า — ใช้ทั้งหน้าต่างสร้างใบและหน้าต่างเลือกรหัสจากปุ่ม "รับสินค้า" บนใบสั่งซื้อ */
export function ReceiveCodeOptions({ value, onChange }: { value: ReceivingReportCode; onChange: (code: ReceivingReportCode) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <legend className="sr-only">{t("receivingReport.code.label")}</legend>
      {RECEIVING_REPORT_CODES.map((c) => (
        <label
          key={c}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${value === c ? "bg-[#c9a84c]/10 border-[#c9a84c]/40" : "border-border hover:bg-secondary/50"}`}
        >
          <input type="radio" name="rr-code" value={c} checked={value === c} onChange={() => onChange(c)} className="accent-[#c9a84c]" />
          <span className="font-mono font-semibold text-sm text-[#866d28]">{c}</span>
          <span className="text-xs text-foreground">{t(RECEIVING_REPORT_CODE_LABEL_KEY[c])}</span>
        </label>
      ))}
    </fieldset>
  );
}

/**
 * สร้างใบรับสินค้า (2026-09-23) — เลือกรหัสรับเข้าก่อน แล้วเลือกใบสั่งซื้อที่อนุมัติแล้ว **หรือใบเปล่า**
 *
 * รายการใบสั่งซื้อแสดงเฉพาะใบ Final ที่ยังไม่มีใบรับสินค้า — ข้อหลังเป็นความสะดวก ตัวบังคับจริงคือ
 * unique index ฝั่งฐานข้อมูล ถ้ารายการนี้ช้าไปหนึ่งจังหวะ เซิร์ฟเวอร์ตอบ 409 แล้วหน้าจอพาไปเปิดใบเดิมแทน
 */
export function ReceivingReportCreateDialog({
  onCreate, onCancel,
}: {
  /** `purchaseOrderId` = null คือใบเปล่า */
  onCreate: (code: ReceivingReportCode, purchaseOrderId: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const [code, setCode] = useState<ReceivingReportCode>("RR");
  const [rows, setRows] = useState<PurchaseOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  /** "" = ใบเปล่า */
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllPurchaseOrders(), fetchAllReceivingReports()])
      .then(([orders, reports]) => {
        if (cancelled) return;
        const taken = new Set(reports.map((r) => r.purchaseOrderId).filter(Boolean));
        setRows(orders.filter((o) => o.status === "Final" && !taken.has(o.id)));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || [r.id, r.documentNumber, r.vendorName, r.jobCode].some((v) => (v ?? "").toLowerCase().includes(q)));

  const submit = async () => {
    if (source === null) return;
    setBusy(true);
    try { await onCreate(code, source || null); } finally { setBusy(false); }
  };

  const rowCls = (on: boolean) => `w-full text-left px-5 py-3 border-b border-border/50 transition-colors flex items-start gap-3 ${on ? "bg-[#c9a84c]/10" : "hover:bg-secondary/40"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("receivingReport.create.title")}
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("receivingReport.create.title")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("receivingReport.create.subtitle")}</p>
          </div>
          <button onClick={onCancel} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("receivingReport.create.codeStep")}</p>
          <ReceiveCodeOptions value={code} onChange={setCode} />
        </div>

        <div className="px-5 pt-4 pb-3 border-b border-border space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("receivingReport.create.sourceStep")}</p>
          <div className="relative h-9">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("receivingReport.picker.searchPlaceholder")}
              aria-label={t("receivingReport.picker.searchPlaceholder")}
              className="h-9 w-full pl-9 pr-3 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0" role="listbox" aria-label={t("receivingReport.create.sourceStep")}>
          <button role="option" aria-selected={source === ""} onClick={() => setSource("")} className={rowCls(source === "")}>
            <FilePlus2 size={16} className="text-[#866d28] mt-0.5 flex-shrink-0" />
            <span>
              <span className="block text-sm font-semibold text-foreground">{t("receivingReport.create.blank")}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{t("receivingReport.create.blankHint")}</span>
            </span>
          </button>
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10 px-5">{t("receivingReport.picker.empty")}</p>
          ) : (
            filtered.map((r) => (
              <button key={r.id} role="option" aria-selected={source === r.id} onClick={() => setSource(r.id)} className={rowCls(source === r.id)}>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-sm font-mono font-semibold text-[#866d28]">{r.documentNumber || r.id}</span>
                    <span className="text-xs font-mono text-muted-foreground">{formatQuoteDateThai(r.updatedAt)}</span>
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{r.vendorName || "—"} · {r.jobCode || "—"}</span>
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-secondary/30">
          <p className="text-xs text-muted-foreground">
            {t("receivingReport.create.numberPreview")} <span className="font-mono font-semibold text-foreground">{code}-</span>
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onCancel} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {t("common.cancel")}
            </button>
            <button
              onClick={() => void submit()}
              disabled={source === null || busy}
              className="flex items-center gap-1.5 px-4 py-2 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />} {t("receivingReport.create.submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** เลือกรหัสอย่างเดียว — ปุ่ม "รับสินค้า" บนใบสั่งซื้อรู้ใบสั่งซื้ออยู่แล้ว เหลือแค่รหัส */
export function ReceiveCodeDialog({
  onCreate, onCancel,
}: {
  onCreate: (code: ReceivingReportCode) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const [code, setCode] = useState<ReceivingReportCode>("RR");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await onCreate(code); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t("receivingReport.create.codeOnlyTitle")}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <h2 className="flex-1 text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("receivingReport.create.codeOnlyTitle")}</h2>
          <button onClick={onCancel} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5"><ReceiveCodeOptions value={code} onChange={setCode} /></div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onCancel} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">{t("common.cancel")}</button>
          <button onClick={() => void submit()} disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-50">
            {busy && <Loader2 size={13} className="animate-spin" />} {t("receivingReport.create.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
