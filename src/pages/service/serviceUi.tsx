import { useId, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ServiceReportStatus } from "../../lib/serviceReports";
import { useI18n } from "../../lib/i18n";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { btn } from "../../components/ui/styles";

/**
 * ชิ้นส่วนหน้าตาที่ใช้ร่วมกันในโมดูลบริการ (REDESIGN 2026-09-30)
 * Shared service-module UI bits — kept local because the kit's StatusBadge only knows
 * archived/active/inactive and ConfirmDialog has no summary box.
 */

// ป้ายสถานะ: พื้นอ่อน + จุดสีนำหน้า · "ยกเลิก" ขีดฆ่าตามบอร์ด ServiceList
const STATUS_STYLE: Record<ServiceReportStatus, { pill: string; dot: string }> = {
  Draft: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  Completed: { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  Cancelled: { pill: "bg-[#eef1f6] text-[#5f7293] line-through", dot: "bg-[#8a97ad]" },
};

export function ServiceStatusBadge({ status }: { status: ServiceReportStatus }) {
  const { t } = useI18n();
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.Draft;
  const label = status === "Completed" ? t("service.status.completed") : status === "Cancelled" ? t("service.status.cancelled") : t("service.status.draft");
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${style.pill}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {label}
    </span>
  );
}

/**
 * กล่องยืนยันแบบบอร์ด Dlg-ServiceReportCancel / Delete / ChecklistRemove* — เหมือน ConfirmDialog กลาง
 * (480px ไอคอนในวงกลม ปุ่มชิดขวา) แต่มีกล่องสรุปสิ่งที่จะถูกกระทำ (เลขที่/ลูกค้า/จำนวนรูป) ใต้ข้อความ
 */
export function ServiceConfirmDialog({ open, title, message, summary, confirmLabel, busy = false, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  message: string;
  summary?: { primary?: ReactNode; secondary?: ReactNode; meta?: ReactNode } | null;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return <ServiceConfirmPanel {...{ title, message, summary, confirmLabel, busy, onConfirm, onCancel }} />;
}

function ServiceConfirmPanel({ title, message, summary, confirmLabel, busy, onConfirm, onCancel }: {
  title: string;
  message: string;
  summary?: { primary?: ReactNode; secondary?: ReactNode; meta?: ReactNode } | null;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const messageId = useId();
  const hasSummary = !!summary && (summary.primary || summary.secondary || summary.meta);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] flex flex-col"
      >
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className="w-11 h-11 rounded-full bg-[#fcebeb] text-[#b93636] flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5 space-y-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            <p id={messageId} className="text-sm text-[#3d5173] leading-relaxed">{message}</p>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-60">
            <X size={18} />
          </button>
        </div>
        {hasSummary ? (
          <div className="px-6 pt-5 pb-6">
            <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg flex items-center gap-3">
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                {summary!.primary && <span className="font-mono text-[13px] font-medium text-foreground truncate">{summary!.primary}</span>}
                {summary!.secondary && <span className="text-[13px] text-[#3d5173] truncate">{summary!.secondary}</span>}
              </div>
              {summary!.meta && <span className="text-[13px] text-muted-foreground flex-shrink-0">{summary!.meta}</span>}
            </div>
          </div>
        ) : (
          <div className="h-6" />
        )}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
          <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={btn.danger}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
