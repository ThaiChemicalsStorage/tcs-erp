import { useEffect, useId, useRef, type ReactNode } from "react";
import { ChevronRight, MoreHorizontal, Search, X, type LucideIcon } from "lucide-react";
import { MoreMenu, type MoreMenuItem } from "../../components/ui/MoreMenu";
import { useI18n } from "../../lib/i18n";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { btn, field } from "../../components/ui/styles";
import type { ArBillingStatus, ArDocumentStatus } from "../../lib/accounting";
import { BILLING_STATUS_LABEL_KEY } from "../../lib/accounting";

/**
 * ชิ้นส่วนหน้าตาที่หน้าบัญชีใช้ร่วมกัน (ดีไซน์ใหม่ 2026-09-30) — ของที่ชุด `components/ui` ยังไม่มี
 * (ป้ายสถานะโทนฟ้า/เหลือง, กล่องยืนยันที่มีกล่องสรุปเอกสาร, หน้าต่างเลือกแบบกดแถวแล้วไปต่อ, แถบยอดรวม)
 * สร้างไว้เฉพาะโมดูลนี้ตามกติกาของงานย้ายดีไซน์
 */

export const PAGE_CLASS = "flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5";

export type PillTone = "grey" | "amber" | "blue" | "green" | "red";

const PILL_TONES: Record<PillTone, { pill: string; dot: string }> = {
  grey: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  amber: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  blue: { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
  green: { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  red: { pill: "bg-[#fcebeb] text-[#b93636]", dot: "bg-[#b93636]" },
};

/** ป้ายสถานะ 26px จุดสีนำหน้า · `struck` = ขีดฆ่า (เอกสารที่ยกเลิก) */
export function Pill({ tone, label, struck = false }: { tone: PillTone; label: string; struck?: boolean }) {
  const style = PILL_TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${style.pill} ${struck ? "line-through" : ""}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {label}
    </span>
  );
}

/** ใช้งาน = ฟ้า · ยกเลิกแล้ว = เทาขีดฆ่า */
export function DocStatusPill({ status }: { status: ArDocumentStatus }) {
  const { t } = useI18n();
  return status === "issued"
    ? <Pill tone="blue" label={t("accounting.list.status.issued")} />
    : <Pill tone="grey" label={t("accounting.list.status.cancelled")} struck />;
}

const BILLING_TONE: Record<ArBillingStatus, PillTone> = { not_billed: "grey", billed: "blue", work_open: "amber", closed: "green" };

export function BillingStatusPill({ status }: { status: ArBillingStatus }) {
  const { t } = useI18n();
  return <Pill tone={BILLING_TONE[status]} label={t(BILLING_STATUS_LABEL_KEY[status])} />;
}

/** ปุ่มไอคอนท้ายแถว 32px — มองเห็นตลอด ไม่ซ่อนรอ hover */
export function RowIconButton({ icon: Icon, label, onClick, active = false }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-lg flex items-center justify-center text-[#5f7293] hover:bg-[#eef1f6] hover:text-foreground transition-colors ${active ? "bg-[#eef1f6]" : ""}`}
    >
      <Icon size={16} />
    </button>
  );
}

/**
 * เมนู ⋯ ท้ายแถว (MoreMenu ของชุดกลาง + ปุ่มไอคอน) · `onOpenChange` บอกหน้าว่าเมนูเปิดอยู่ เพื่อเผื่อที่ใต้ตาราง —
 * ตารางอยู่ในกรอบเลื่อนแนวนอน (overflow) เมนูของแถวล่าง ๆ จะถูกตัดถ้าไม่เผื่อที่ไว้
 */
export function RowMoreMenu({ items, label, onOpenChange }: { items: (MoreMenuItem | false | null | undefined)[]; label: string; onOpenChange?: (open: boolean) => void }) {
  return (
    <MoreMenu
      items={items}
      trigger={({ open, toggle }) => (
        <>
          <OpenSync open={open} onChange={onOpenChange} />
          <RowIconButton icon={MoreHorizontal} label={label} onClick={toggle} active={open} />
        </>
      )}
    />
  );
}

// แจ้งเฉพาะตอนสถานะเปิด/ปิดเปลี่ยนจริง — เก็บ callback ล่าสุดไว้ใน ref เพื่อให้ผู้เรียกส่งฟังก์ชันใหม่ทุกรอบได้
// โดยไม่ทำให้ effect วิ่งซ้ำทุกครั้งที่หน้ารีเรนเดอร์
function OpenSync({ open, onChange }: { open: boolean; onChange?: (open: boolean) => void }) {
  const latest = useRef(onChange);
  useEffect(() => { latest.current = onChange; });
  useEffect(() => { latest.current?.(open); }, [open]);
  return null;
}

/** ช่องเลือกเดือนของหน้ารายงาน — ชื่อช่องอยู่ซ้าย (แบบบอร์ด) กล่องขาวขอบเทา */
export function MonthField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5">
      <span className={field.label}>{label}</span>
      <input type="month" value={value} onChange={(e) => { if (e.target.value) onChange(e.target.value); }} aria-label={label} className={`${field.input} w-[190px]`} />
    </label>
  );
}

/**
 * แถบตัวเลขรวมแนวนอนในการ์ดขาว (สรุปเอกสารประจำเดือน / ทะเบียนภาษีซื้อ / ทะเบียนเจ้าหนี้) —
 * ช่องแรกกว้าง 220 ที่เหลือแบ่งเท่ากัน ตัวเลขเงินชิดขวา · `strong` = ช่องยอดรวมสุทธิ (พื้นเทาอ่อน ช่องสุดท้าย) ·
 * `bold` = ตัวเลขหนาอย่างเดียว
 */
export function TotalsStrip({ title, sub, items }: {
  title?: ReactNode;
  sub?: ReactNode;
  items: { label: ReactNode; value: ReactNode; unit?: ReactNode; dot?: string; strong?: boolean; bold?: boolean; alignEnd?: boolean }[];
}) {
  const cols = items.length === 4 ? "lg:grid-cols-[220px_repeat(3,minmax(0,1fr))]" : "lg:grid-cols-[220px_repeat(2,minmax(0,1fr))]";
  return (
    <section className="bg-card border border-border rounded-xl print:border-black" style={{ breakInside: "avoid" }}>
      {title && (
        <div className="px-6 py-4 print:px-2 print:py-1.5 border-b border-[#eef1f6] flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {sub && <span className="text-[13px] text-muted-foreground">{sub}</span>}
        </div>
      )}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols}`}>
        {items.map((it, i) => (
          <div
            key={i}
            className={`px-6 py-[18px] print:px-2 print:py-1.5 flex flex-col gap-1 ${i > 0 ? "border-t sm:border-t-0 lg:border-l border-[#eef1f6]" : ""} ${it.alignEnd ? "lg:items-end" : ""} ${it.strong ? "bg-[#f8f9fc] lg:rounded-br-xl print:bg-transparent" : ""}`}
          >
            <span className={`text-[13px] inline-flex items-center gap-1.5 ${it.strong ? "font-semibold text-foreground" : "text-[#3d5173]"}`}>
              {it.dot && <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: it.dot }} />}
              {it.label}
            </span>
            <span className={`text-2xl print:text-base leading-tight tabular-nums text-foreground ${it.strong || it.bold ? "font-bold" : "font-semibold"}`}>
              {it.value}
              {it.unit && <span className="text-sm font-medium text-muted-foreground"> {it.unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** กล่องสรุปเอกสารสีเทาอ่อนในกล่องยืนยัน — ซ้ายชื่อ/รายละเอียด ขวายอดเงิน */
export function SummaryBox({ primary, secondary, amountLabel, amount, mono = false }: {
  primary: ReactNode;
  secondary?: ReactNode;
  amountLabel?: ReactNode;
  amount: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg flex items-center gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`text-[13px] truncate ${mono ? "font-mono font-medium text-foreground" : "font-medium text-foreground"}`}>{primary}</span>
        {secondary && <span className="text-[13px] text-[#3d5173] truncate">{secondary}</span>}
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        {amountLabel && <span className="text-xs text-muted-foreground">{amountLabel}</span>}
        <span className="font-semibold tabular-nums text-foreground">{amount}</span>
      </div>
    </div>
  );
}

const ICON_TONES = {
  info: "bg-[#e8f0fb] text-[#1a5fb4]",
  success: "bg-[#e6f4ec] text-[#1b7f4f]",
  danger: "bg-[#fcebeb] text-[#b93636]",
} as const;

/**
 * กล่องยืนยันแบบมีกล่องสรุปเอกสาร (ออกใบเสร็จ / ยกเลิกเอกสาร / บันทึกจ่ายแล้ว / ตั้งค่าฟอร์ม NCR) —
 * เปลือกเดียวกับ ConfirmDialog (480 · วงไอคอน 44 · ปุ่มชิดขวา) แต่มีช่องใส่เนื้อหาใต้ข้อความ
 * `footerLeft` = ปุ่มรองชิดซ้ายของแถบท้าย (เช่น "ค่าเริ่มต้น") · `extraActions` = ปุ่มรองก่อนปุ่มหลัก
 */
export function AccountingDialog(props: {
  open: boolean;
  tone: keyof typeof ICON_TONES;
  icon: LucideIcon;
  title: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  confirmIcon?: LucideIcon;
  danger?: boolean;
  busy?: boolean;
  wide?: boolean;
  footerLeft?: ReactNode;
  extraActions?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return <AccountingDialogPanel {...props} />;
}

function AccountingDialogPanel({ tone, icon: Icon, title, message, children, confirmLabel, confirmIcon: ConfirmIcon, danger = false, busy = false, wide = false, footerLeft, extraActions, onConfirm, onCancel }: Parameters<typeof AccountingDialog>[0]) {
  const { t } = useI18n();
  const close = () => { if (!busy) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const messageId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className={`relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full ${wide ? "max-w-[520px]" : "max-w-[480px]"} max-h-[90vh] overflow-y-auto flex flex-col`}
      >
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${ICON_TONES[tone]}`}>
            <Icon size={20} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            {message && <p id={messageId} className="text-sm text-[#3d5173] leading-relaxed">{message}</p>}
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-60">
            <X size={18} />
          </button>
        </div>
        {children ? <div className="px-6 pt-5 pb-6 flex flex-col gap-[18px]">{children}</div> : <div className="h-6" />}
        <div className="flex items-center gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
          {footerLeft}
          <span className="flex-1" />
          <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          {extraActions}
          <button type="button" onClick={onConfirm} disabled={busy} className={danger ? btn.danger : btn.primary}>
            {ConfirmIcon && <ConfirmIcon size={16} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * หน้าต่างเลือกรายการแบบ "กดที่แถวเพื่อไปต่อ" (880 · สูง 80%) — ใช้กับการเลือกงานวางบิลและเลือกใบกำกับภาษี
 * ที่จะออกใบเสร็จ: การกดแถวไม่ได้ทำงานทันที แต่เปิดหน้างาน/กล่องยืนยันต่อ จึงไม่ต้องมีปุ่มยืนยันซ้ำ
 * `gridClass` = คอลัมน์ของหัวตารางและทุกแถว (ต้องใช้ชุดเดียวกัน)
 */
export function RowPickerDialog({ title, subtitle, search, onSearch, searchPlaceholder, countLabel, gridClass, headers, children, footerNote, onClose }: {
  title: ReactNode;
  subtitle?: ReactNode;
  search: string;
  onSearch: (v: string) => void;
  searchPlaceholder: string;
  countLabel?: ReactNode;
  gridClass: string;
  headers: ReactNode;
  children: ReactNode;
  footerNote?: ReactNode;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onClose);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-[880px] h-[80vh] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-[#eef1f6]">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="w-9 h-9 -mr-2 -mt-1 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center gap-2.5 px-6 py-3.5 border-b border-[#eef1f6]">
          <label className={`${field.box} w-full sm:w-[340px]`}>
            <Search size={16} className="text-muted-foreground flex-shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
            />
          </label>
          <span className="flex-1" />
          {countLabel !== undefined && <span className="text-[13px] text-muted-foreground whitespace-nowrap">{countLabel}</span>}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="min-w-[640px]">
            <div className={`grid ${gridClass} gap-3 items-center px-6 h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173] sticky top-0`}>
              {headers}
            </div>
            {children}
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-6 py-3.5 border-t border-border">
          <span className="flex-1 text-[13px] text-muted-foreground">{footerNote}</span>
          <button type="button" onClick={onClose} className={btn.secondary}>{t("common.cancel")}</button>
        </div>
      </div>
    </div>
  );
}

/** แถวหนึ่งแถวของ RowPickerDialog — ทั้งแถวเป็นปุ่ม (กด Enter/Space ได้) มีลูกศรท้ายแถว */
export function PickerRow({ gridClass, onClick, children }: { gridClass: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`group w-full text-left grid ${gridClass} gap-3 items-center px-6 h-[52px] border-b border-[#eef1f6] bg-white hover:bg-[#f8f9fc] focus-visible:bg-[#f8f9fc] outline-none transition-colors`}>
      {children}
      <ChevronRight size={16} className="justify-self-end text-[#a3aec2] group-hover:text-foreground" />
    </button>
  );
}
