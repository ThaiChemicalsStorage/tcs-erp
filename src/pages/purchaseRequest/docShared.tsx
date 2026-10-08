import { useId, useState, type ReactNode } from "react";
import { AlertTriangle, Info, X, type LucideIcon } from "lucide-react";
import { FilterSelect } from "../../components/ui/ListPage";
import { btn, field } from "../../components/ui/styles";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import type { DateRangePreset, DateRangeValue } from "../../lib/dateRanges";
import { useI18n } from "../../lib/i18n";
import { DateInput } from "../../components/DateInput";

/**
 * ชิ้นส่วนที่ใบขอซื้อกับใบสั่งผลิตใช้ร่วมกัน (ดีไซน์ใหม่ 2026-09-30) — สองเอกสารมีสถานะ
 * Draft → PendingApproval → Final ชุดเดียวกัน จึงใช้ป้ายสถานะ ปุ่มอนุมัติ และกล่องโต้ตอบแบบเดียวกัน
 * ของที่ชุดเครื่องมือกลาง (`components/ui`) ยังไม่มีถูกสร้างไว้ที่นี่ ไม่ได้แก้ชุดกลาง
 */

export type ApprovableStatus = "Draft" | "PendingApproval" | "Final";

const PILL: Record<ApprovableStatus, { pill: string; dot: string }> = {
  Draft: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  PendingApproval: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  Final: { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
};

/** ป้ายสถานะ (จุดสี + คำ) — คำเดิมของแอป Draft / รออนุมัติ / Final ไม่แปลงเป็นไทย */
export function ApprovalStatusPill({ status }: { status: ApprovableStatus }) {
  const { t } = useI18n();
  const style = PILL[status] ?? PILL.Draft;
  const label = status === "Draft" ? t("materialRequisition.status.draft")
    : status === "PendingApproval" ? t("materialRequisition.status.pendingApproval")
    : t("materialRequisition.status.final");
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${style.pill}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
      {label}
    </span>
  );
}

const TAG: Record<"grey" | "amber" | "blue" | "green" | "red" | "urgent", string> = {
  grey: "bg-[#eef1f6] text-[#3d5173]",
  amber: "bg-[#fdf3e0] text-[#8a5a00]",
  blue: "bg-[#e8f0fb] text-[#1a5fb4]",
  green: "bg-[#e6f4ec] text-[#1b7f4f]",
  // เกินเป้า (2026-10-02)
  red: "bg-[#fcebeb] text-[#b93636]",
  // งานด่วน — สีส้มที่เจ้าของอนุมัติ 2026-10-02 แยกจากแดงของ "เกินเป้า"
  urgent: "bg-[#fcebeb] text-[#b93636]",
};

/** ป้ายเหลี่ยมเล็ก 22px — ขั้นหลังอนุมัติ แผนก ผลของบรรทัด */
export function StageTag({ tone, children, mono = false }: { tone: keyof typeof TAG; children: ReactNode; mono?: boolean }) {
  return (
    <span className={`h-[22px] px-2 rounded-md text-xs font-semibold inline-flex items-center whitespace-nowrap ${mono ? "font-mono" : ""} ${TAG[tone]}`}>
      {children}
    </span>
  );
}

const DATE_PRESETS: DateRangePreset[] = ["all", "today", "thisMonth", "lastMonth", "thisYear", "custom"];

/**
 * ตัวกรองช่วงวันที่แบบปุ่ม "ช่วงวันที่: ทั้งหมด ▾" — พรีเซ็ตชุดเดียวกับ `DateRangeFilter`
 * (ตรรกะช่วงวันที่ยังอยู่ที่ `lib/dateRanges.ts` ที่เดียว) · "กำหนดเอง" มีช่องวันที่สองช่อง
 */
export function ListDateRangeSelect({ value, onChange }: { value: DateRangeValue; onChange: (next: DateRangeValue) => void }) {
  const { t } = useI18n();
  const label: Record<DateRangePreset, string> = {
    all: t("dateFilter.all"), today: t("dateFilter.today"), yesterday: t("dateFilter.yesterday"),
    last7: t("dateFilter.last7"), last14: t("dateFilter.last14"), thisMonth: t("dateFilter.thisMonth"),
    lastMonth: t("dateFilter.lastMonth"), thisQuarter: t("dateFilter.thisQuarter"), thisYear: t("dateFilter.thisYear"),
    custom: t("dateFilter.custom"),
  } as Record<DateRangePreset, string>;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FilterSelect<DateRangePreset>
        label={t("purchaseRequest.dateRange")}
        value={value.preset}
        options={DATE_PRESETS.map((p) => ({ value: p, label: label[p] }))}
        onChange={(preset) => onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" })}
      />
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <DateInput value={value.from} max={value.to || undefined} ariaLabel={t("dateFilter.from")}
            onChange={(v) => onChange({ ...value, preset: "custom", from: v })} className={`${field.input} w-[150px]`} />
          <span className="text-sm text-muted-foreground">–</span>
          <DateInput value={value.to} min={value.from || undefined} ariaLabel={t("dateFilter.to")}
            onChange={(v) => onChange({ ...value, preset: "custom", to: v })} className={`${field.input} w-[150px]`} />
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

/** การ์ดสรุปสีกรมท่าบนคอลัมน์ขวา — หัวเล็ก ค่าใหญ่ (+หน่วย) แถบความคืบหน้า (ถ้ามี) และแถวข้อมูลย่อย */
export function RailSummaryCard({ label, value, valueNote, subValue, progress, rows, mono = false }: {
  label: ReactNode;
  value: ReactNode;
  valueNote?: ReactNode;
  /** บรรทัดใต้ค่าใหญ่ (เช่นชื่อลูกค้าใต้รหัสงาน) */
  subValue?: ReactNode;
  progress?: { value: number; max: number; label: string };
  rows: { label: ReactNode; value: ReactNode }[];
  mono?: boolean;
}) {
  const pct = progress && progress.max > 0 ? Math.max(0, Math.min(100, (progress.value / progress.max) * 100)) : 0;
  return (
    <section className="rounded-xl bg-[#0b1d3a] text-white p-5 flex flex-col gap-3">
      <div className="text-[13px] text-[#c5d3e8]">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={mono ? "font-mono text-xl font-medium leading-tight break-all" : "text-[26px] font-semibold leading-tight tabular-nums"}>{value}</span>
        {valueNote && <span className="text-[15px] font-medium text-[#c5d3e8]">{valueNote}</span>}
      </div>
      {subValue && <div className="text-[13px] text-white leading-snug">{subValue}</div>}
      {progress && (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={progress.max} aria-valuenow={progress.value} aria-label={progress.label} className="h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full rounded-full bg-white transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {rows.length > 0 && <div className="h-px bg-white/10" />}
      {rows.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-[13px] text-[#c5d3e8]">
          <span className="flex-shrink-0">{r.label}</span>
          <span className="text-white text-right min-w-0 break-words">{r.value}</span>
        </div>
      ))}
    </section>
  );
}

/** แถวบุคคลในการ์ด "ผู้เกี่ยวข้อง" — วงกลมอักษรย่อ + บทบาท + ชื่อ + วันที่ · ยังไม่มีชื่อ = ขีด */
export function PersonRow({ role, name, date }: { role: ReactNode; name: string; date?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0)).join("");
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className={`w-[34px] h-[34px] rounded-full text-[13px] font-semibold flex items-center justify-center flex-shrink-0 ${initials ? "bg-[#e8edf7] text-[#1a3a6b]" : "border border-dashed border-[#c3ccda]"}`}>
        {initials}
      </span>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{role}</span>
        <span className={`text-sm font-medium leading-snug break-words ${name.trim() ? "text-foreground" : "text-[#8a97ad]"}`}>{name.trim() || "—"}</span>
      </div>
      {date && <span className="text-[12.5px] text-[#3d5173] whitespace-nowrap">{date}</span>}
    </div>
  );
}

/**
 * กล่อง "ขั้นต่อไป" — ฟ้าสำหรับงานที่ผู้ใช้ต้องทำ · เหลือง (amber) เมื่อใบกำลังรอคนอื่น (รออนุมัติ)
 * ตัวฟ้าเหมือน `NextStepHint` ในชุดกลาง แต่ชุดกลางยังไม่มีโทนเหลือง
 */
export function StepHint({ tone = "info", title, children }: { tone?: "info" | "waiting"; title: ReactNode; children: ReactNode }) {
  const waiting = tone === "waiting";
  const Icon = waiting ? AlertTriangle : Info;
  return (
    <div className={`rounded-xl px-4 py-3.5 flex gap-2.5 border ${waiting ? "bg-[#fdf3e0] border-[#efd3a0] text-[#6b4600]" : "bg-[#e8f0fb] border-[#b9d0f0] text-[#16407a]"}`}>
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <p className="text-[13px] leading-relaxed min-w-0"><strong className="font-semibold">{title}</strong> {children}</p>
    </div>
  );
}

/** กล่องสรุปในกล่องยืนยัน: บรรทัดบนตัว mono (เลขที่) บรรทัดล่างข้อความ และค่าชิดขวา (ถ้ามี) */
export function SummaryBox({ primary, secondary, aside, monoPrimary = true }: { primary: ReactNode; secondary?: ReactNode; aside?: ReactNode; monoPrimary?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`${monoPrimary ? "font-mono text-[13px]" : "text-sm"} font-semibold text-foreground break-words`}>{primary}</span>
        {secondary && <span className="text-[13px] text-[#3d5173] break-words">{secondary}</span>}
      </div>
      {aside && <span className="text-[13px] text-[#3d5173] whitespace-nowrap flex-shrink-0">{aside}</span>}
    </div>
  );
}

export interface ChoiceOption<K extends string> {
  key: K;
  label: ReactNode;
  /** ป้าย mono เล็กหน้าชื่อ (เช่นรหัสฝ่าย) */
  code?: string;
  /** รายการย่อยใต้ชื่อ (ชื่อ + จำนวน) */
  items?: { label: string; qty: string }[];
  disabled?: boolean;
}

/**
 * กล่องเลือกหนึ่งตัวเลือกแล้วกดยืนยัน (480px) — การ์ดตัวเลือกแบบ radio ใช้ลูกศรขึ้น/ลงเลื่อนได้
 * ใช้กับ "เลือกฝ่ายที่ขอซื้อ" และ "ออกใบสั่งซื้อ: ทั้งหมด / เฉพาะที่ติ๊ก"
 */
export function ChoiceDialog<K extends string>({ title, description, icon: Icon, groupLabel, required, options, value, onChange, confirmLabel, confirmIcon: ConfirmIcon, busy, confirmDisabled, onConfirm, onCancel }: {
  title: string;
  description?: string;
  icon: LucideIcon;
  groupLabel?: string;
  required?: boolean;
  options: ChoiceOption<K>[];
  value: K;
  onChange: (k: K) => void;
  confirmLabel: ReactNode;
  confirmIcon?: LucideIcon;
  busy: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const descId = useId();
  const labelId = useId();
  const enabled = options.filter((o) => !o.disabled);
  const move = (dir: 1 | -1) => {
    const i = enabled.findIndex((o) => o.key === value);
    const next = enabled[(i + dir + enabled.length) % enabled.length];
    if (next) {
      onChange(next.key);
      panelRef.current?.querySelector<HTMLElement>(`[data-choice="${next.key}"]`)?.focus();
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
        className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] max-h-[90vh] flex flex-col">
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className="w-11 h-11 rounded-full bg-[#e8f0fb] text-[#1a5fb4] flex items-center justify-center flex-shrink-0">
            <Icon size={20} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            {description && <p id={descId} className="text-sm text-[#3d5173] leading-relaxed">{description}</p>}
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pt-5 pb-6 flex flex-col gap-2 overflow-y-auto">
          {groupLabel && (
            <span id={labelId} className={field.label}>
              {groupLabel}{required && <span className="text-[#b93636]"> *</span>}
            </span>
          )}
          <div role="radiogroup" aria-labelledby={groupLabel ? labelId : titleId} className="flex flex-col gap-2">
            {options.map((o) => {
              const on = o.key === value;
              return (
                <div
                  key={o.key}
                  data-choice={o.key}
                  role="radio"
                  aria-checked={on}
                  aria-disabled={o.disabled || undefined}
                  tabIndex={on ? 0 : -1}
                  onClick={() => { if (!o.disabled) onChange(o.key); }}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); move(1); }
                    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
                    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!o.disabled) onChange(o.key); }
                  }}
                  className={`px-3.5 rounded-lg border flex gap-3 outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 transition-colors ${o.items ? "py-3 items-start" : "h-[52px] items-center"} ${
                    o.disabled ? "opacity-50 cursor-not-allowed border-border" : on ? "border-[#0b1d3a] bg-[#f4f7fc] cursor-pointer" : "border-border bg-white hover:bg-[#f8f9fc] cursor-pointer"
                  }`}
                >
                  <span aria-hidden="true" className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 ${o.items ? "mt-0.5" : ""} ${on ? "border-[#0b1d3a]" : "border-[#a3aec2]"}`}>
                    {on && <span className="w-2 h-2 rounded-full bg-[#0b1d3a]" />}
                  </span>
                  {o.code && (
                    <span className="w-10 h-6 rounded-md bg-[#eef1f6] text-[#3d5173] font-mono text-[12.5px] font-semibold inline-flex items-center justify-center flex-shrink-0">{o.code}</span>
                  )}
                  <span className="flex-1 min-w-0 flex flex-col gap-1">
                    <span className={o.items ? "font-semibold text-sm text-foreground" : "font-medium text-sm text-foreground"}>{o.label}</span>
                    {o.items?.map((it, i) => (
                      <span key={i} className="text-[13px] text-[#3d5173] flex justify-between gap-3">
                        <span className="min-w-0 truncate">{it.label}</span>
                        <span className="flex-shrink-0 tabular-nums text-muted-foreground">{it.qty}</span>
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
          <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled} className={btn.primary}>
            {ConfirmIcon && <ConfirmIcon size={16} className={busy ? "animate-pulse" : ""} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * กล่อง "ไม่อนุมัติเอกสาร" แบบใหม่ — มีกล่องสรุปเอกสารและปุ่มแดง (PromptDialog กลางยังไม่มีสองอย่างนี้)
 * เหตุผลบังคับกรอก เหมือนกล่องเดิมของ DocumentApprovalActions ทุกประการ
 */
export function RejectDialog({ summary, busy, onConfirm, onCancel }: {
  summary?: ReactNode;
  busy: boolean;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const close = () => { if (!busy) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const descId = useId();
  const inputId = useId();
  const submit = () => {
    if (busy) return;
    const trimmed = value.trim();
    if (!trimmed) { setError(t("approval.rejectDialog.required")); return; }
    onConfirm(trimmed);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div ref={panelRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
        className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] flex flex-col">
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className="w-11 h-11 rounded-full bg-[#fcebeb] text-[#b93636] flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{t("approval.rejectDialog.title")}</h2>
            <p id={descId} className="text-sm text-[#3d5173] leading-relaxed">{t("approval.rejectDialog.message")}</p>
          </div>
          <button type="button" onClick={close} disabled={busy} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
          {summary && <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg">{summary}</div>}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={inputId} className={field.label}>{t("approval.rejectDialog.label")} <span className="text-[#b93636]">*</span></label>
            <textarea id={inputId} autoFocus rows={3} value={value} disabled={busy}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              className={`${field.textarea} w-full resize-y`} />
            {error ? <p className={field.error}>{error}</p> : <p className={field.help}>{t("purchaseRequest.shared.rejectHelp")}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
          <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={submit} disabled={busy} className={btn.danger}>
            {busy ? t("approval.rejecting") : t("approval.reject")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ปุ่ม "ไม่อนุมัติ" บนหัวเอกสาร — ปุ่มรองตัวแดง (ตามบอร์ด) ไม่ใช่ปุ่มแดงทึบ เพราะยังย้อนกลับได้ */
export const rejectButtonClass = "h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[#c3ccda] bg-white text-[#b93636] text-sm font-medium hover:bg-[#fcebeb] transition-colors disabled:opacity-60 whitespace-nowrap";
