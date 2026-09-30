import { useId, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { btn } from "../../components/ui/styles";

type Tone = "info" | "success" | "danger";
const ICON_TONE: Record<Tone, string> = {
  info: "bg-[#e8f0fb] text-[#1a5fb4]",
  success: "bg-[#e6f4ec] text-[#1b7f4f]",
  danger: "bg-[#fcebeb] text-[#b93636]",
};

/**
 * กล่องยืนยันของใบเสนอราคา (ดีไซน์ใหม่ 2026-09-30: Dlg-QuoteSubmit/Approve/Reject/Cancel/CreateScopeOfWork)
 * โครงเดียวกับ ConfirmDialog (480px, วงไอคอน 44px, หัว 18/600, ✕) แต่มีกล่องสรุปใบ (เลขที่ ลูกค้า ยอดเงิน)
 * และช่องกรอกหนึ่งช่อง — ความคิดเห็นของขั้นอนุมัติ หรือเลขที่ Scope of Work · ปุ่มยืนยันใช้ชื่อการกระทำจริง
 * ไม่ใช่ "ยืนยัน" · ตัวเลือก `confirmTone="danger"` สำหรับปฏิเสธ/ยกเลิก
 */
export function QuoteActionDialog({
  icon: Icon, tone, title, description, summary, children, error, cancelLabel, confirmLabel, confirmIcon: ConfirmIcon,
  confirmTone = "primary", busy, onConfirm, onCancel,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  description: string;
  summary: { id: string; line: string; amount?: string };
  children: ReactNode;
  error?: string;
  cancelLabel?: string;
  confirmLabel: string;
  confirmIcon?: LucideIcon;
  confirmTone?: "primary" | "danger";
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const descId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-[480px] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col"
      >
        <div className="px-6 pt-6 flex items-start gap-4">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${ICON_TONE[tone]}`}>
            <Icon size={20} />
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-1 pt-0.5">
            <h2 id={titleId} className="text-lg font-semibold leading-snug text-foreground">{title}</h2>
            <p id={descId} className="text-sm text-[#3d5173]">{description}</p>
          </div>
          <button type="button" onClick={close} aria-label={t("common.close")} className="w-9 h-9 -mr-2 -mt-1.5 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
          <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-mono text-[13px] font-medium text-foreground">{summary.id}</span>
              <span className="text-[13px] text-[#3d5173] truncate">{summary.line}</span>
            </div>
            {summary.amount && <span className="text-sm font-semibold tabular-nums text-foreground">{summary.amount}</span>}
          </div>
          {children}
          {error && <p role="alert" className="text-xs text-[#b93636]">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[#eef1f6] flex justify-end gap-2.5">
          <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{cancelLabel ?? t("common.cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={confirmTone === "danger" ? btn.danger : btn.primary}>
            {ConfirmIcon && <ConfirmIcon size={16} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
