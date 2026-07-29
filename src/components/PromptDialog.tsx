import { useState } from "react";

/**
 * Styled replacement for `window.prompt()` (added 2026-07-29, UX pass) — the native prompt broke
 * the app's visual language entirely (unstyled browser chrome, no Thai font, awkward on mobile)
 * at exactly the moments that matter most (rejecting an approval, numbering a duplicate). Same
 * shell/overlay/button conventions as ConfirmDialog.tsx — reuse this for any single-value text
 * prompt; never reach for `window.prompt` again.
 */
export interface PromptDialogProps {
  open: boolean;
  title: string;
  /** Explanatory sentence under the title — keep it short; this is a prompt, not a form. */
  message?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** When set, a blank submission shows this error instead of calling onConfirm. */
  requiredMessage?: string;
  /** Textarea instead of a single-line input — for reasons/comments rather than codes. */
  multiline?: boolean;
  /** Monospace input — for document numbers/codes. */
  mono?: boolean;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog(props: PromptDialogProps) {
  // The form is a separate component mounted only while open, so its input/error state starts
  // fresh on every open with no reset-in-effect needed (react-hooks/set-state-in-effect).
  if (!props.open) return null;
  return <PromptDialogForm {...props} />;
}

function PromptDialogForm({
  title, message, label, placeholder, confirmLabel, cancelLabel = "ยกเลิก",
  requiredMessage, multiline = false, mono = false, busy = false, onConfirm, onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed && requiredMessage) { setError(requiredMessage); return; }
    onConfirm(trimmed);
  };

  const inputClass = `w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors ${mono ? "font-mono" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
        <p className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</p>
        {message && <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{message}</p>}
        <label className="text-xs text-muted-foreground block mb-1.5">{label} {requiredMessage && <span className="text-[#e05252]">*</span>}</label>
        {multiline ? (
          <textarea
            autoFocus
            rows={3}
            className={`${inputClass} resize-none leading-relaxed`}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            placeholder={placeholder}
          />
        ) : (
          <input
            autoFocus
            className={inputClass}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={placeholder}
          />
        )}
        {error && <p className="text-xs text-[#e05252] mt-1.5">{error}</p>}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">{cancelLabel}</button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-3.5 py-1.5 text-xs rounded-lg font-semibold transition-colors bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
