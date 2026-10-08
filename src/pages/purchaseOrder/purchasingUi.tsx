import { useId, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { FilterSelect } from "../../components/ui/ListPage";
import { btn, field } from "../../components/ui/styles";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import type { DateRangePreset, DateRangeValue } from "../../lib/dateRanges";
import { useI18n } from "../../lib/i18n";
import { usePurchaseOrderStatusLabel } from "./purchasingHooks";
import type { PurchaseOrderStatus } from "../../lib/purchaseOrder";
import { DateInput } from "../../components/DateInput";

/**
 * ชิ้นส่วนหน้าจอที่ใช้ร่วมกันในกลุ่มจัดซื้อ (ใบสั่งซื้อ · ทะเบียนผู้ขาย · ทะเบียนรหัส) — ดีไซน์ใหม่ 2026-09-30
 *
 * อยู่ในโมดูลนี้ ไม่ใช่ใน `components/ui/` เพราะชุดกลางเป็นของส่วนกลาง แก้จากงานของโมดูลไม่ได้
 * ทุกชิ้นเป็นแค่การแสดงผล — สิทธิ์และลำดับสถานะจริงอยู่ที่เซิร์ฟเวอร์ทั้งหมด
 */

export type PillTone = "neutral" | "warning" | "info" | "success" | "danger";

const PILL_TONE: Record<PillTone, { pill: string; dot: string }> = {
  neutral: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  warning: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  info: { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
  success: { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  danger: { pill: "bg-[#fcebeb] text-[#b93636]", dot: "bg-[#b93636]" },
};

/** ป้ายสถานะแบบจุดสี (26px) ตาม DESIGN.md "Status Pills" */
export function TonePill({ tone, label }: { tone: PillTone; label: string }) {
  const c = PILL_TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${c.pill}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      {label}
    </span>
  );
}

const PO_TONE: Record<PurchaseOrderStatus, PillTone> = { Draft: "neutral", PendingApproval: "warning", Final: "info" };

export function PurchaseOrderStatusPill({ status }: { status: PurchaseOrderStatus }) {
  const label = usePurchaseOrderStatusLabel();
  return <TonePill tone={PO_TONE[status]} label={label[status]} />;
}

const DATE_PRESETS: DateRangePreset[] = ["all", "today", "thisMonth", "lastMonth", "thisYear", "custom"];

/**
 * ตัวกรองช่วงวันที่แบบปุ่มของแถบเครื่องมือใหม่ ("ช่วงวันที่: ทั้งหมด ▾") — พรีเซ็ตชุดเดียวกับ
 * `DateRangeFilter` เดิม ตรรกะช่วงวันที่ยังอยู่ที่ `lib/dateRanges.ts` ที่เดียว · "กำหนดเอง" มีช่องวันที่สองช่อง
 */
export function DateRangeSelect({ value, onChange }: { value: DateRangeValue; onChange: (next: DateRangeValue) => void }) {
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
      <FilterSelect<DateRangePreset>
        label={t("purchaseOrder.dateRange")}
        value={value.preset}
        options={DATE_PRESETS.map((p) => ({ value: p, label: label[p] }))}
        onChange={(preset) => onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" })}
      />
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <DateInput
            value={value.from}
            max={value.to || undefined}
            onChange={(v) => onChange({ ...value, preset: "custom", from: v })}
            ariaLabel={t("dateFilter.from")}
            className={`${field.input} w-[150px]`}
          />
          <span className="text-sm text-muted-foreground">–</span>
          <DateInput
            value={value.to}
            min={value.from || undefined}
            onChange={(v) => onChange({ ...value, preset: "custom", to: v })}
            ariaLabel={t("dateFilter.to")}
            className={`${field.input} w-[150px]`}
          />
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

/**
 * กล่องยืนยันที่มีช่องกรอกด้วย (เหตุผลถอนการอนุมัติ / เหตุผลที่ไม่อนุมัติผู้ขาย) — หน้าตาเดียวกับ
 * `ConfirmDialog` แบบใหม่ (กว้าง 480 · ไอคอนในวงกลม · กล่องสรุปรายการ) แต่รับเนื้อหาฟอร์มเป็น children
 * เพราะ `ConfirmDialog` รับได้แค่ข้อความ และ `PromptDialog` ไม่มีกล่องสรุปกับรายการผลกระทบ
 */
export function ReasonDialog(props: {
  open: boolean;
  title: string;
  message: string;
  tone: "warning" | "danger" | "info";
  summary?: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  /** ปุ่มยืนยันสีแดง — เฉพาะเรื่องที่ย้อนกลับไม่ได้ */
  danger?: boolean;
  confirmDisabled?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!props.open) return null;
  return <ReasonDialogPanel {...props} />;
}

function ReasonDialogPanel({ title, message, tone, summary, children, confirmLabel, danger = false, confirmDisabled = false, busy = false, onConfirm, onCancel }: {
  title: string; message: string; tone: "warning" | "danger" | "info"; summary?: ReactNode; children?: ReactNode;
  confirmLabel: ReactNode; danger?: boolean; confirmDisabled?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const messageId = useId();
  const iconTone = tone === "danger" ? "bg-[#fcebeb] text-[#b93636]" : tone === "warning" ? "bg-[#fdf3e0] text-[#8a5a00]" : "bg-[#e8f0fb] text-[#1a5fb4]";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] max-h-[90vh] flex flex-col"
      >
        <div className="flex items-start gap-4 px-6 pt-6 overflow-y-auto">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${iconTone}`}>
            <AlertTriangle size={20} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            <p id={messageId} className="text-sm text-[#3d5173] leading-relaxed">{message}</p>
            {summary && <div className="mt-3 px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg text-sm">{summary}</div>}
            {children && <div className="mt-4 flex flex-col gap-3">{children}</div>}
          </div>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            aria-label={t("common.close")}
            className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-60"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 mt-6 border-t border-[#eef1f6]">
          <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled} className={danger ? btn.danger : btn.primary}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** กล่องสรุปรายการในกล่องยืนยัน: บรรทัดหลัก (เลขที่/ชื่อ) + บรรทัดรอง · ค่าด้านขวา (ยอดเงิน/รหัส) */
export function DialogSummary({ title, sub, aside, mono = false }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className={`font-medium text-foreground break-words ${mono ? "font-mono text-[13px]" : ""}`}>{title}</span>
        {sub && <span className="text-[13px] text-muted-foreground break-words">{sub}</span>}
      </div>
      {aside && <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">{aside}</span>}
    </div>
  );
}
