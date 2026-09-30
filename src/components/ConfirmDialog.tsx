import { useId, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useDialogA11y } from "../hooks/useDialogA11y";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** โทนไอคอน: ค่าเริ่มต้นตาม danger (แดง) หรือฟ้า · "warning" = เหลือง (ปิดใช้งาน ถอนอนุมัติ ฯลฯ) */
  tone?: "info" | "warning" | "danger";
  /** กล่องสรุปรายการที่กำลังจะทำ (เลขที่ + ชื่อ) ใต้ข้อความ */
  summary?: ReactNode;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// แสดงกล่องยืนยันการทำรายการ ซ่อนไว้จนกว่าจะเปิด
// Renders the confirm dialog, mounted only while open
export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmDialogPanel {...props} />;
}

// เนื้อหาจริงของกล่องยืนยัน แยกออกมาเพื่อให้ hook โฟกัส/trap ทำงานเฉพาะตอนเปิดเท่านั้น
// หน้าตาตามดีไซน์ใหม่ (2026-09-30): กว้าง 480 ไอคอนในวงกลม ปุ่มชิดขวา ปุ่มแดงเฉพาะเรื่องที่ย้อนกลับไม่ได้
// The actual dialog panel, split out so its focus-trap hook only wires up while shown
function ConfirmDialogPanel({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  tone,
  summary,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const iconTone = tone ?? (danger ? "danger" : "info");
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  const messageId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={busy ? undefined : onCancel} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] flex flex-col"
      >
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${iconTone === "danger" ? "bg-[#fcebeb] text-[#b93636]" : iconTone === "warning" ? "bg-[#fdf3e0] text-[#8a5a00]" : "bg-[#e8f0fb] text-[#1a5fb4]"}`}>
            <AlertTriangle size={20} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5 space-y-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            <p id={messageId} className="text-sm text-[#3d5173] leading-relaxed">{message}</p>
            {summary && <div className="mt-3 px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg text-sm">{summary}</div>}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label={cancelLabel ?? t("common.cancel")}
            className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-60"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 mt-6 border-t border-[#eef1f6]">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-10 px-4 text-sm font-medium border border-[#c3ccda] bg-white rounded-lg text-foreground hover:bg-[#f4f6fa] transition-colors disabled:opacity-60"
          >
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`h-10 px-4 text-sm rounded-lg font-semibold transition-colors disabled:opacity-60 ${
              danger ? "bg-[#b93636] text-white hover:bg-[#9e2c2c]" : "bg-[#0b1d3a] text-white hover:bg-[#1a2f55]"
            }`}
          >
            {confirmLabel ?? t("quotation.modal.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
