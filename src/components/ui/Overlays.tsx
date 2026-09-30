import { useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { btn } from "./styles";

/**
 * แผงด้านข้าง (ดีไซน์ใหม่ 2026-09-30) — ข้อมูลหลัก (ลูกค้า ผู้ขาย สินค้า ผู้ใช้ รหัส) เปิดดู/แก้จากรายการ
 * โดยไม่ทิ้งหน้ารายการ · กว้าง 560 (หรือ 880 สำหรับงานกว้าง) เต็มความสูง · หัว (ชื่อ + ✕) · เนื้อหาเลื่อนได้ ·
 * ท้ายติดล่าง: ซ้ายคำสั่งรอง/เมนูเพิ่มเติม · ขวา [ยกเลิก][บันทึก]
 */
export function Drawer({ open, title, subtitle, onClose, children, footerLeft, footerRight, wide = false, busy = false }: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  wide?: boolean;
  busy?: boolean;
}) {
  if (!open) return null;
  return <DrawerPanel {...{ title, subtitle, onClose, children, footerLeft, footerRight, wide, busy }} />;
}

function DrawerPanel({ title, subtitle, onClose, children, footerLeft, footerRight, wide, busy }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode;
  footerLeft?: ReactNode; footerRight?: ReactNode; wide: boolean; busy: boolean;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onClose(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`drawer-in relative h-full w-full ${wide ? "sm:w-[880px]" : "sm:w-[560px]"} bg-card shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col`}
      >
        <div className="flex items-start gap-3 px-6 py-5 border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug truncate">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={close} aria-label={t("common.close")} className="w-9 h-9 -mr-2 -mt-1 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {(footerLeft || footerRight) && (
          <div className="flex items-center gap-2.5 px-6 py-4 border-t border-border bg-card">
            <div className="flex items-center gap-2">{footerLeft}</div>
            <span className="flex-1" />
            <div className="flex items-center gap-2.5">{footerRight}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * หน้าต่างเลือกรายการ (880px สูงไม่เกิน 80%) — ค้นหา/ตัวกรองด้านบน ตารางติ๊กเลือกได้ ·
 * ท้าย: "เลือกแล้ว N รายการ" ซ้าย · [ยกเลิก][ยืนยัน] ขวา · เลือกแล้วต้องกดยืนยันเสมอ (ไม่ทำงานทันทีที่คลิก)
 */
export function PickerDialog({ open, title, subtitle, onClose, toolbar, children, selectedCount, confirmLabel, onConfirm, confirmDisabled, busy = false, footerNote }: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  toolbar?: ReactNode;
  children: ReactNode;
  selectedCount?: number;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  busy?: boolean;
  footerNote?: ReactNode;
}) {
  if (!open) return null;
  return <PickerPanel {...{ title, subtitle, onClose, toolbar, children, selectedCount, confirmLabel, onConfirm, confirmDisabled, busy, footerNote }} />;
}

function PickerPanel({ title, subtitle, onClose, toolbar, children, selectedCount, confirmLabel, onConfirm, confirmDisabled, busy, footerNote }: {
  title: ReactNode; subtitle?: ReactNode; onClose: () => void; toolbar?: ReactNode; children: ReactNode;
  selectedCount?: number; confirmLabel: ReactNode; onConfirm: () => void; confirmDisabled?: boolean; busy: boolean; footerNote?: ReactNode;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onClose(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-[880px] max-h-[80vh] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={close} aria-label={t("common.close")} className="w-9 h-9 -mr-2 -mt-1 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        {toolbar && <div className="px-6 pb-3 flex items-center gap-2.5 flex-wrap">{toolbar}</div>}
        <div className="flex-1 min-h-0 overflow-y-auto border-y border-border">{children}</div>
        <div className="flex items-center gap-2.5 px-6 py-4">
          <span className="text-[13px] text-muted-foreground">
            {selectedCount !== undefined ? t("ui.selectedCount").replace("{n}", String(selectedCount)) : footerNote}
          </span>
          <span className="flex-1" />
          <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled} className={btn.primary}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
