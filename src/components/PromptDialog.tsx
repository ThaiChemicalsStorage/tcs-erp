import { useId, useState } from "react";
import { useDialogA11y } from "../hooks/useDialogA11y";

export interface PromptDialogProps {
  open: boolean;
  title: string;
  message?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel?: string;
  requiredMessage?: string;
  error?: string;
  multiline?: boolean;
  mono?: boolean;
  busy?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

// กล่องโต้ตอบสำหรับกรอกข้อความแทน window.prompt() ของเบราว์เซอร์ ให้สไตล์ตรงกับแอป
// Styled dialog that replaces the browser's native window.prompt()
export function PromptDialog(props: PromptDialogProps) {
  if (!props.open) return null;
  return <PromptDialogForm {...props} />;
}

// ฟอร์มจริงของกล่องโต้ตอบ ทำงานเฉพาะตอนเปิดเท่านั้น เพื่อให้ค่าที่กรอกรีเซ็ตใหม่ทุกครั้ง
// The actual form, mounted only while open so its input state always starts fresh
function PromptDialogForm({
  title, message, label, placeholder, confirmLabel, cancelLabel = "ยกเลิก",
  requiredMessage, error: externalError, multiline = false, mono = false, busy = false, onConfirm, onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState("");
  const [blankError, setBlankError] = useState("");
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();

  const submit = () => {
    if (busy) return;
    const trimmed = value.trim();
    if (!trimmed && requiredMessage) { setBlankError(requiredMessage); return; }
    onConfirm(trimmed);
  };

  const displayError = externalError || blankError;
  const inputClass = `w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors ${mono ? "font-mono" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h2 id={titleId} className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
        {message && <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{message}</p>}
        <label className="text-xs text-muted-foreground block mb-1.5">{label} {requiredMessage && <span className="text-[#e05252]">*</span>}</label>
        {multiline ? (
          <textarea
            autoFocus
            rows={3}
            className={`${inputClass} resize-none leading-relaxed`}
            value={value}
            onChange={(e) => { setValue(e.target.value); setBlankError(""); }}
            placeholder={placeholder}
          />
        ) : (
          <input
            autoFocus
            className={inputClass}
            value={value}
            onChange={(e) => { setValue(e.target.value); setBlankError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder={placeholder}
          />
        )}
        {displayError && <p className="text-xs text-[#e05252] mt-1.5">{displayError}</p>}
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onCancel} disabled={busy} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60">{cancelLabel}</button>
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
