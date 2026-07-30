import { useId } from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useDialogA11y } from "../hooks/useDialogA11y";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  /** Disables both buttons while the confirmed action is still in flight — pass this whenever
   * `onConfirm` kicks off an async request (accessibility/correctness hardening pass: without it, a
   * double-click on Confirm during a slow request could fire the action twice, which matters most
   * for the irreversible actions — finalize, delete — this dialog is usually guarding). */
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${danger ? "bg-[#e05252]/10" : "bg-[#c9a84c]/10"}`}>
            <AlertTriangle size={17} className={danger ? "text-[#e05252]" : "text-[#c9a84c]"} />
          </div>
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`px-3.5 py-1.5 text-xs rounded-lg font-semibold transition-colors disabled:opacity-60 ${
              danger ? "bg-[#e05252] text-white hover:bg-[#c94444]" : "bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040]"
            }`}
          >
            {confirmLabel ?? t("quotation.modal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
