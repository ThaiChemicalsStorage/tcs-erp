import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { PURCHASE_REQUEST_CODES, PURCHASE_REQUEST_CODE_LABEL_KEY, type PurchaseRequestCode } from "../../lib/purchaseRequest";

/**
 * เลือกฝ่ายที่ขอซื้อก่อนเปิดใบเปล่า (2026-09-23) — รหัสจะไปอยู่หน้าเลขที่ใบ จึงต้องเลือก *ก่อน* สร้าง
 * ใบที่สร้างจากโครงการหรือใบสั่งผลิตไม่ผ่านหน้าต่างนี้ เพราะรหัสรู้อยู่แล้วจากต้นทาง (ED / FD)
 */
export function PurchaseRequestCodeDialog({
  onCreate, onCancel,
}: {
  onCreate: (code: PurchaseRequestCode) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const [code, setCode] = useState<PurchaseRequestCode>("PR");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try { await onCreate(code); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("purchaseRequest.code.pickTitle")}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseRequest.code.pickTitle")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("purchaseRequest.code.pickHint")}</p>
          </div>
          <button onClick={onCancel} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <fieldset className="p-3 space-y-1">
          <legend className="sr-only">{t("purchaseRequest.code.label")}</legend>
          {PURCHASE_REQUEST_CODES.map((c) => (
            <label
              key={c}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${code === c ? "bg-[#c9a84c]/10 border-[#c9a84c]/40" : "border-transparent hover:bg-secondary/50"}`}
            >
              <input type="radio" name="pr-code" value={c} checked={code === c} onChange={() => setCode(c)} className="accent-[#c9a84c]" />
              <span className="font-mono font-semibold text-sm text-[#866d28] w-8">{c}</span>
              <span className="text-sm text-foreground">{t(PURCHASE_REQUEST_CODE_LABEL_KEY[c])}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onCancel} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t("common.cancel")}
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60"
          >
            {busy && <Loader2 size={13} className="animate-spin" />} {t("purchaseRequest.code.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
