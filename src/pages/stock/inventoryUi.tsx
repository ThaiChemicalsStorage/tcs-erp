import { useId, type DragEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertTriangle, CalendarRange, ChevronDown, FileSpreadsheet, Loader2, X, type LucideIcon } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import type { DateRangePreset, DateRangeValue } from "../../lib/dateRanges";
import { btn, field } from "../../components/ui/styles";

/**
 * ชิ้นส่วนหน้าตาที่หน้าคลังสินค้า/สต๊อก/เครื่องมือ/คำขอเพิ่มสินค้าใช้ร่วมกัน (ดีไซน์ใหม่ 2026-09-30)
 * ชุดกลาง `components/ui/` ยังไม่มีกล่องกรอกข้อมูล 480 แบบมีไอคอน กล่องนำเข้าไฟล์ 880 และป้ายสีแบบมีจุด
 * จึงสร้างไว้ในโมดูลนี้ก่อน — ถ้าชุดกลางมีภายหลังให้ย้ายไปใช้ของกลาง
 */

export type PillTone = "green" | "amber" | "blue" | "grey" | "red" | "gold";

const PILL_TONE: Record<PillTone, { pill: string; dot: string }> = {
  green: { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  amber: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  blue: { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
  grey: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  red: { pill: "bg-[#fcebeb] text-[#b93636]", dot: "bg-[#b93636]" },
  gold: { pill: "bg-[#fbf3dc] text-[#7d6420]", dot: "bg-[#c9a84c]" },
};

/** ป้ายสถานะ/ประเภทแบบพื้นอ่อน + จุดสีนำหน้า (สูตรเดียวกับ StatusBadge) */
export function Pill({ tone, children, dot = true }: { tone: PillTone; children: ReactNode; dot?: boolean }) {
  const s = PILL_TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap ${s.pill}`}>
      {dot && <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />}
      {children}
    </span>
  );
}

/** ป้ายสี่เหลี่ยมเล็กต่อท้ายชื่อ (สินค้าชุด / เครื่องมือ / กองกลาง) */
export function Tag({ tone, children, icon: Icon }: { tone: "blue" | "grey" | "gold"; children: ReactNode; icon?: LucideIcon }) {
  const cls = tone === "blue" ? "bg-[#e8f0fb] text-[#1a5fb4]" : tone === "gold" ? "bg-[#fbf3dc] text-[#7d6420]" : "bg-[#eef1f6] text-[#3d5173]";
  return (
    <span className={`inline-flex items-center gap-1.5 h-5 px-[7px] rounded-md text-xs font-semibold whitespace-nowrap flex-shrink-0 ${cls}`}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** การ์ดตัวเลขสรุปบนหน้ารายการ — ชื่อเล็ก ตัวเลขใหญ่ หน่วย/คำอธิบายรอง */
export function StatCard({ label, value, unit, sub, tone = "default" }: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "red" | "amber" | "green";
}) {
  const color = tone === "red" ? "text-[#b93636]" : tone === "amber" ? "text-[#8a5a00]" : tone === "green" ? "text-[#1b7f4f]" : "text-foreground";
  return (
    <section className="bg-card border border-border rounded-xl px-[18px] py-4 flex flex-col gap-1 min-w-0">
      <span className="text-[13px] font-medium text-[#3d5173]">{label}</span>
      <span className="flex items-baseline gap-1.5 min-w-0">
        <span className={`text-2xl leading-tight font-semibold tabular-nums truncate ${color}`}>{value}</span>
        {unit && <span className="text-[13px] text-muted-foreground">{unit}</span>}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </section>
  );
}

const DATE_PRESETS: DateRangePreset[] = ["all", "today", "thisMonth", "lastMonth", "thisYear", "custom"];

/** ตัวเลือกช่วงวันที่แบบ select (ไอคอนปฏิทินซ้าย) — พรีเซ็ตชุดเดียวกับ DateRangeFilter · "กำหนดเอง" มีช่องวันที่สองช่อง */
export function DateRangeSelect({ value, onChange, className = "w-[168px]" }: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const label: Record<string, string> = {
    all: t("dateFilter.all"),
    today: t("dateFilter.today"),
    thisMonth: t("dateFilter.thisMonth"),
    lastMonth: t("dateFilter.lastMonth"),
    thisYear: t("dateFilter.thisYear"),
    custom: t("dateFilter.custom"),
  };
  return (
    <div className="flex items-center gap-2 flex-wrap" data-tour="date-filter">
      <span className={`relative block ${className}`}>
        <CalendarRange size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <select
          aria-label={t("dateFilter.label")}
          value={value.preset}
          onChange={(e) => {
            const preset = e.target.value as DateRangePreset;
            onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" });
          }}
          className={`${field.input} w-full pl-[38px] pr-9 appearance-none cursor-pointer`}
        >
          {DATE_PRESETS.map((p) => <option key={p} value={p}>{label[p]}</option>)}
        </select>
        <ChevronDown size={16} aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </span>
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={value.from} max={value.to || undefined} aria-label={t("dateFilter.from")}
            onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })} className={`${field.input} w-[150px]`} />
          <span className="text-sm text-muted-foreground">–</span>
          <input type="date" value={value.to} min={value.from || undefined} aria-label={t("dateFilter.to")}
            onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })} className={`${field.input} w-[150px]`} />
          {(value.from || value.to) && (
            <button type="button" onClick={() => onChange({ preset: "custom", from: "", to: "" })} aria-label={t("dateFilter.clear")} className={btn.icon}>
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** ช่องตัวเลขที่มีหน่วยต่อท้ายในกล่องเดียว (จำนวน [ใบ] · ราคา [บาท]) */
export function UnitInput({ unit, small = false, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & {
  unit?: ReactNode;
  /** 36px สำหรับในตาราง */
  small?: boolean;
}) {
  return (
    <span className={`${small ? "h-9" : "h-10"} rounded-lg border border-[#c3ccda] bg-white flex items-stretch overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors ${className}`}>
      <input {...props} className={`flex-1 min-w-0 ${small ? "px-2" : "px-3"} bg-transparent text-sm text-foreground text-right tabular-nums outline-none placeholder:text-[#8a97ad] disabled:text-muted-foreground`} />
      {unit && <span className="px-3 flex items-center bg-[#f4f6fa] border-l border-border text-[13px] text-[#3d5173] whitespace-nowrap">{unit}</span>}
    </span>
  );
}

/**
 * กล่องกรอกข้อมูลกว้าง 480 (ดีไซน์ใหม่) — ไอคอนในวงกลม หัวเรื่อง คำอธิบาย ✕ · เนื้อหา · ท้าย [ยกเลิก][ยืนยัน]
 * เป็น `<form>` กด Enter เท่ากับกดยืนยัน · mount เฉพาะตอนเปิด ค่าที่กรอกจึงเริ่มใหม่ทุกครั้ง
 */
export function FormDialog({ icon: Icon, tone = "info", title, description, busy, error, confirmLabel, confirmIcon: ConfirmIcon, confirmTone = "primary", confirmDisabled, onConfirm, onCancel, children }: {
  icon: LucideIcon;
  tone?: "info" | "success" | "warning" | "danger";
  title: ReactNode;
  description?: ReactNode;
  busy: boolean;
  error?: ReactNode;
  confirmLabel: ReactNode;
  confirmIcon?: LucideIcon;
  confirmTone?: "primary" | "danger";
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const iconCls = tone === "success" ? "bg-[#e6f4ec] text-[#1b7f4f]" : tone === "warning" ? "bg-[#fdf3e0] text-[#8a5a00]" : tone === "danger" ? "bg-[#fcebeb] text-[#b93636]" : "bg-[#e8f0fb] text-[#1a5fb4]";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] max-h-[90vh] flex flex-col">
        <form onSubmit={(e) => { e.preventDefault(); if (!busy && !confirmDisabled) onConfirm(); }} noValidate className="flex flex-col min-h-0">
          <div className="flex items-start gap-4 px-6 pt-6">
            <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${iconCls}`}><Icon size={20} /></span>
            <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-1">
              <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
              {description && <div className="text-sm text-[#3d5173] leading-relaxed">{description}</div>}
            </div>
            <button type="button" onClick={close} disabled={busy} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-60">
              <X size={18} />
            </button>
          </div>
          <div className="px-6 pt-5 pb-6 flex flex-col gap-4 overflow-y-auto">
            {children}
            {error && <p role="alert" className={`${field.error} flex items-center gap-1`}><AlertTriangle size={13} className="flex-shrink-0" />{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
            <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
            <button type="submit" disabled={busy || confirmDisabled} className={`${confirmTone === "danger" ? btn.danger : btn.primary} min-w-[88px]`}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : ConfirmIcon && <ConfirmIcon size={16} />}
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * หน้าต่างนำเข้าไฟล์ Excel กว้าง 880 (ดีไซน์ใหม่) — หัว (ชื่อ + คำอธิบาย + ✕) · เนื้อหาเลื่อนได้ ·
 * ท้าย: สรุปซ้าย [ยกเลิก/ปิด][นำเข้า N รายการ] ขวา · Escape/คลิกพื้นหลังปิดไม่ได้ระหว่าง busy
 */
export function ImportDialogShell({ title, subtitle, busy, onClose, footerSummary, footerActions, children }: {
  title: ReactNode;
  subtitle: ReactNode;
  busy: boolean;
  onClose: () => void;
  footerSummary?: ReactNode;
  footerActions: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onClose(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[880px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-[#eef1f6]">
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{subtitle}</p>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label={t("common.close")} className="w-9 h-9 -mt-1 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-60">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-4">{children}</div>
        <div className="flex items-center gap-2.5 px-6 py-3.5 border-t border-border flex-wrap">
          <span className="flex-1 min-w-0 text-sm text-[#3d5173]">{footerSummary}</span>
          {footerActions}
        </div>
      </div>
    </div>
  );
}

/** แถบเลือกไฟล์ (ลากวางได้) — ยังไม่เลือก = ข้อความชวนเลือก · เลือกแล้ว = ชื่อไฟล์ + "เปลี่ยนไฟล์" */
export function ImportFileDrop({ fileName, placeholder, hint, reading, disabled, dragging, onDragging, onFile }: {
  fileName: string;
  placeholder: string;
  hint: string;
  reading: boolean;
  disabled: boolean;
  dragging: boolean;
  onDragging: (v: boolean) => void;
  onFile: (file: File) => void;
}) {
  const { t } = useI18n();
  const inputId = useId();
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    onDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };
  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) onDragging(true); }}
      onDragLeave={() => onDragging(false)}
      onDrop={onDrop}
      className={`relative flex-1 min-w-0 min-h-[60px] px-4 py-2.5 border border-dashed rounded-[10px] flex items-center gap-3 transition-colors ${
        disabled ? "opacity-60 cursor-wait" : "cursor-pointer"
      } ${dragging ? "border-[#1a5fb4] bg-[#e8f0fb]" : "border-[#a3aec2] bg-[#f8f9fc] hover:border-[#1a5fb4]"}`}
    >
      <span className="w-9 h-9 rounded-lg bg-[#e6f4ec] text-[#1b7f4f] flex items-center justify-center flex-shrink-0">
        {reading ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
      </span>
      <span className="flex-1 min-w-0 flex flex-col leading-snug">
        <span className="text-sm font-medium text-foreground truncate">{fileName || placeholder}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
      {fileName && <span className="text-[13px] font-medium text-[#1a5fb4] whitespace-nowrap">{t("inventory.import.changeFile")}</span>}
      <input
        id={inputId} type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={disabled}
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onFile(file); }}
      />
    </label>
  );
}

/** กล่องตัวเลขสรุปของหน้าต่างนำเข้า */
export function ImportStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "green" | "blue" | "red" }) {
  const color = tone === "green" ? "text-[#1b7f4f]" : tone === "blue" ? "text-[#1a5fb4]" : tone === "red" ? "text-[#b93636]" : "text-foreground";
  return (
    <div className="px-4 py-3 border border-border rounded-[10px] flex flex-col gap-0.5">
      <span className="text-[13px] text-[#3d5173]">{label}</span>
      <span className={`text-[22px] font-semibold leading-tight tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

/** กล่องเตือนสีเหลือง (แถวที่ถูกข้าม ฯลฯ) */
export function WarningBox({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-4 py-3 bg-[#fdf3e0] border border-[#efd3a0] rounded-[10px] flex gap-2.5 text-[#6b4600] text-[13px]">
      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-[#8a5a00]" />
      <div className="flex flex-col gap-0.5 min-w-0 max-h-40 overflow-y-auto">
        <strong className="font-semibold text-[#8a5a00]">{title}</strong>
        {children}
      </div>
    </div>
  );
}

/** กล่องแจ้งผลสำเร็จ/ผิดพลาดในหน้าต่าง */
export function NoticeBox({ tone, icon: Icon, children }: { tone: "success" | "error"; icon: LucideIcon; children: ReactNode }) {
  const cls = tone === "success" ? "bg-[#e6f4ec] border-[#b9dfc9] text-[#1b7f4f]" : "bg-[#fcebeb] border-[#f0c4c4] text-[#b93636]";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`px-4 py-3 border rounded-[10px] flex gap-2.5 text-[13px] ${cls}`}>
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

/** แทน `{n}` ในข้อความด้วยตัวเลขตัวหนา — "จะสร้างใหม่ **42** รายการ" */
export function BoldCount({ template, value }: { template: string; value: ReactNode }) {
  const [before, after = ""] = template.split("{n}");
  return <>{before}<strong className="font-semibold text-foreground">{value}</strong>{after}</>;
}
