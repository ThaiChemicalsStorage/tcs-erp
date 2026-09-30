import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import type { Product } from "../../lib/products";
import { createCommonTool, setCommonToolStock } from "../../lib/toolHoldings";

/**
 * เครื่องมือกองกลาง (2026-09-29) — เพิ่มเครื่องมือจากหน้าเครื่องมือประจำทีมโดยตรง และกดรหัส/ชื่อเพื่ออัปเดตยอดสต๊อก
 * ทั้งสองกล่อง mount เฉพาะตอนเปิด ค่าที่กรอกจึงเริ่มใหม่ทุกครั้ง (แบบเดียวกับ PromptDialog)
 */
const inputCls = "w-full text-sm text-foreground bg-white border border-[#c3ccda] rounded-lg px-3 py-2 outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors";

function DialogShell({ title, message, busy, error, confirmLabel, onConfirm, onCancel, children }: {
  title: string;
  message?: string;
  busy: boolean;
  error: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={busy ? undefined : onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
        <form
          onSubmit={(e) => { e.preventDefault(); if (!busy) onConfirm(); }}
          className="space-y-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-foreground">{title}</h2>
            {message && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{message}</p>}
          </div>
          {children}
          {error && <p className="text-xs text-[#e05252]" role="alert">{error}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} disabled={busy} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60">
              {t("toolControl.commonTool.cancel")}
            </button>
            <button type="submit" disabled={busy} className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-semibold transition-colors bg-[#0b1d3a] text-white hover:bg-[#1a2f55] disabled:opacity-60">
              {busy && <Loader2 size={12} className="animate-spin" />} {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function parseQty(v: string): number | null {
  if (v.trim() === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function AddCommonToolDialog({ onSaved, onCancel }: { onSaved: (product: Product) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) { setError(t("toolControl.commonTool.errorName")); return; }
    const n = parseQty(qty);
    if (n === null) { setError(t("toolControl.commonTool.errorQty")); return; }
    setBusy(true);
    setError("");
    try {
      onSaved(await createCommonTool({ code: code.trim() || undefined, name: name.trim(), unit: unit.trim(), qty: n }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("toolControl.commonTool.errorSave"));
      setBusy(false);
    }
  };

  return (
    <DialogShell title={t("toolControl.commonTool.addTitle")} message={t("toolControl.commonTool.addHint")}
      busy={busy} error={error} confirmLabel={t("toolControl.commonTool.addConfirm")} onConfirm={() => void save()} onCancel={onCancel}>
      <label className="block text-xs text-muted-foreground space-y-1.5">
        <span className="block">{t("toolControl.commonTool.code")}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("toolControl.commonTool.codePlaceholder")} className={`${inputCls} font-mono`} />
      </label>
      <label className="block text-xs text-muted-foreground space-y-1.5">
        <span className="block">{t("toolControl.commonTool.name")} <span className="text-[#e05252]">*</span></span>
        <input autoFocus value={name} onChange={(e) => { setName(e.target.value); setError(""); }} className={inputCls} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-muted-foreground space-y-1.5">
          <span className="block">{t("toolControl.commonTool.unit")}</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs text-muted-foreground space-y-1.5">
          <span className="block">{t("toolControl.commonTool.initialQty")}</span>
          <input type="number" min={0} value={qty} onChange={(e) => { setQty(e.target.value); setError(""); }} className={`${inputCls} font-mono text-right`} />
        </label>
      </div>
    </DialogShell>
  );
}

export function CommonToolStockDialog({ product, onSaved, onCancel }: { product: Product; onSaved: (product: Product) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const current = product.stockQty ?? 0;
  const [qty, setQty] = useState(String(current));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = parseQty(qty);
  const diff = n === null ? 0 : n - current;

  const save = async () => {
    if (n === null || qty.trim() === "") { setError(t("toolControl.commonTool.errorQty")); return; }
    if (diff === 0) { onCancel(); return; }
    setBusy(true);
    setError("");
    try {
      onSaved(await setCommonToolStock(product.id, n, note.trim() || undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("toolControl.commonTool.errorSave"));
      setBusy(false);
    }
  };

  return (
    <DialogShell title={t("toolControl.commonTool.stockTitle")} message={`${product.code} · ${product.name}`}
      busy={busy} error={error} confirmLabel={t("toolControl.commonTool.stockConfirm")} onConfirm={() => void save()} onCancel={onCancel}>
      <p className="text-xs text-muted-foreground">
        {t("toolControl.commonTool.current")} <span className="font-mono text-foreground">{current.toLocaleString("th-TH")}</span> {product.unit}
      </p>
      <label className="block text-xs text-muted-foreground space-y-1.5">
        <span className="block">{t("toolControl.commonTool.newQty")}</span>
        <input autoFocus type="number" min={0} value={qty} onChange={(e) => { setQty(e.target.value); setError(""); }}
          onFocus={(e) => e.target.select()} className={`${inputCls} font-mono text-right`} />
      </label>
      {diff !== 0 && (
        <p className={`text-xs ${diff > 0 ? "text-[#207e52]" : "text-[#a75d1a]"}`}>
          {(diff > 0 ? t("toolControl.commonTool.diffUp") : t("toolControl.commonTool.diffDown")).replace("{n}", Math.abs(diff).toLocaleString("th-TH")).replace("{unit}", product.unit ?? "")}
        </p>
      )}
      <label className="block text-xs text-muted-foreground space-y-1.5">
        <span className="block">{t("toolControl.commonTool.note")}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("toolControl.commonTool.notePlaceholder")} className={inputCls} />
      </label>
    </DialogShell>
  );
}
