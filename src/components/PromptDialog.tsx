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
  const inputClass = `w-full text-sm text-foreground bg-white border border-[#c3ccda] rounded-lg px-3 py-2.5 outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors ${mono ? "font-mono" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={busy ? undefined : onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] flex flex-col">
        <div className="px-6 pt-6">
          <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug mb-1">{title}</h2>
          {message && <p className="text-sm text-[#3d5173] mb-4 leading-relaxed">{message}</p>}
          <label className="text-[13px] font-medium text-[#26395a] block mb-1.5">{label} {requiredMessage && <span className="text-[#b93636]">*</span>}</label>
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
          {displayError && <p className="text-xs text-[#b93636] mt-1.5">{displayError}</p>}
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 mt-6 border-t border-[#eef1f6]">
          <button onClick={onCancel} disabled={busy} className="h-10 px-4 text-sm font-medium border border-[#c3ccda] bg-white rounded-lg text-foreground hover:bg-[#f4f6fa] transition-colors disabled:opacity-60">{cancelLabel}</button>
          <button
            onClick={submit}
            disabled={busy}
            className="h-10 px-4 text-sm rounded-lg font-semibold transition-colors bg-[#0b1d3a] text-white hover:bg-[#1a2f55] disabled:opacity-60"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
