import { useEffect, useId, useState, type ReactNode } from "react";
import { FilePlus2, Loader2, PackageCheck, Plus, Search, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { fetchAllPurchaseOrders, type PurchaseOrderSummary } from "../../lib/purchaseOrder";
import {
  fetchAllReceivingReports, RECEIVING_REPORT_CODES, RECEIVING_REPORT_CODE_LABEL_KEY, type ReceivingReportCode,
} from "../../lib/receivingReport";
import { fmt } from "../../lib/quotes";
import { btn } from "../../components/ui/styles";
import { RadioDot } from "./receivingUi";
import { pickRowClass } from "./receivingFormat";
import { formatDisplayDate } from "../../lib/displayDate";

/**
 * แถวเลือกรหัสรับเข้า — ใช้ทั้งหน้าต่างสร้างใบและหน้าต่างเลือกรหัสจากปุ่ม "รับสินค้า" บนใบสั่งซื้อ
 * การ์ดรหัสห่อ radio จริงของเบราว์เซอร์ไว้ (ซ่อนด้วยตา) ลูกศรขึ้น/ลงจึงเลื่อนตัวเลือกได้เหมือนเดิม
 */
export function ReceiveCodeOptions({ value, onChange, layout = "row" }: {
  value: ReceivingReportCode;
  onChange: (code: ReceivingReportCode) => void;
  /** row = สามการ์ดเรียงแถว (หน้าต่างสร้างใบ) · list = เรียงลง (หน้าต่างเลือกรหัส) */
  layout?: "row" | "list";
}) {
  const { t } = useI18n();
  const name = useId();
  return (
    <div role="radiogroup" aria-label={t("receivingReport.code.label")} className={layout === "row" ? "grid grid-cols-1 sm:grid-cols-3 gap-3" : "flex flex-col gap-2"}>
      {RECEIVING_REPORT_CODES.map((c) => {
        const on = value === c;
        return (
          <label
            key={c}
            className={`${layout === "row" ? "h-14" : "h-12"} px-3.5 rounded-lg border flex items-center gap-3 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#1a5fb4]/40 ${
              on ? "border-[#0b1d3a] bg-[#f5f8fd] shadow-[0_0_0_1px_#0b1d3a]" : "border-[#c3ccda] bg-white hover:bg-[#f8f9fc]"
            }`}
          >
            <input type="radio" name={name} value={c} checked={on} onChange={() => onChange(c)} className="sr-only" />
            <RadioDot on={on} />
            <span className={`h-6 px-2 rounded-md font-mono text-[13px] font-medium inline-flex items-center ${on ? "bg-[#0b1d3a] text-white" : "bg-[#eef1f6] text-[#3d5173]"}`}>{c}</span>
            <span className="text-sm font-medium text-foreground">{t(RECEIVING_REPORT_CODE_LABEL_KEY[c])}</span>
          </label>
        );
      })}
    </div>
  );
}

/** เปลือกหน้าต่างกว้าง 880 (หัว + ✕ · เนื้อหาเลื่อนได้ · ท้าย) — หน้าต่างเลือกของโมดูลนี้ใช้ร่วมกัน */
export function WidePickerShell({ title, subtitle, onClose, busy = false, children, footer }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onClose(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative w-full max-w-[880px] max-h-[85vh] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-[#eef1f6]">
          <div className="flex-1 min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
            {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={close} aria-label={t("common.close")} className="w-9 h-9 -mr-2 -mt-1 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        {children}
        <div className="flex items-center gap-2.5 px-6 py-3.5 border-t border-border flex-wrap">{footer}</div>
      </div>
    </div>
  );
}

/** ช่องค้นหาในแถบบนของหน้าต่างเลือก (340px) */
export function PickerSearch({ value, onChange, placeholder, autoFocus = false }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="w-full sm:w-[340px] h-10 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
      <Search size={16} className="text-muted-foreground flex-shrink-0" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
      />
    </label>
  );
}

/**
 * สร้างใบรับสินค้า (2026-09-23) — เลือกรหัสรับเข้าก่อน แล้วเลือกใบสั่งซื้อที่อนุมัติแล้ว **หรือใบเปล่า**
 *
 * รายการใบสั่งซื้อแสดงเฉพาะใบ Final ที่ยังไม่มีใบรับสินค้า — ข้อหลังเป็นความสะดวก ตัวบังคับจริงคือ
 * unique index ฝั่งฐานข้อมูล ถ้ารายการนี้ช้าไปหนึ่งจังหวะ เซิร์ฟเวอร์ตอบ 409 แล้วหน้าจอพาไปเปิดใบเดิมแทน
 */
export function ReceivingReportCreateDialog({
  onCreate, onCancel,
}: {
  /** `purchaseOrderId` = null คือใบเปล่า */
  onCreate: (code: ReceivingReportCode, purchaseOrderId: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState<ReceivingReportCode>("RR");
  const [rows, setRows] = useState<PurchaseOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  /** "" = ใบเปล่า */
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllPurchaseOrders(), fetchAllReceivingReports()])
      .then(([orders, reports]) => {
        if (cancelled) return;
        const taken = new Set(reports.map((r) => r.purchaseOrderId).filter(Boolean));
        setRows(orders.filter((o) => o.status === "Final" && !taken.has(o.id)));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) => !q || [r.id, r.documentNumber, r.vendorName, r.jobCode].some((v) => (v ?? "").toLowerCase().includes(q)));
  const picked = source ? rows.find((r) => r.id === source) : null;

  const submit = async () => {
    if (source === null) return;
    setBusy(true);
    try { await onCreate(code, source || null); } finally { setBusy(false); }
  };

  const grid = "grid grid-cols-[20px_150px_110px_minmax(0,1fr)_150px] gap-3.5 items-center px-6";

  return (
    <WidePickerShell
      title={t("receivingReport.create.title")}
      subtitle={t("receivingReport.create.subtitle")}
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <p className="flex-1 min-w-0 text-sm text-[#3d5173] truncate">
            {t("receivingReport.create.numberPreview")} <span className="font-mono font-medium text-foreground">{code}-</span>
            {source !== null && (
              <>
                <span className="text-[#8a97ad]"> · </span>
                {source === "" ? t("receivingReport.create.blankPicked") : t("receivingReport.create.fromPicked").replace("{po}", picked?.documentNumber || picked?.id || "")}
              </>
            )}
          </p>
          <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={() => void submit()} disabled={source === null || busy} className={btn.primary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("receivingReport.create.submit")}
          </button>
        </>
      }
    >
      <fieldset className="m-0 px-6 py-4 border-0 border-b border-[#eef1f6] flex flex-col gap-2.5 flex-shrink-0">
        <legend className="float-left p-0 text-[13px] font-medium text-[#26395a]">
          {t("receivingReport.code.label")} <span className="text-[#b93636]">*</span>
        </legend>
        <div className="clear-both"><ReceiveCodeOptions value={code} onChange={setCode} /></div>
      </fieldset>

      <div className="px-6 py-3.5 flex items-center gap-2.5 flex-wrap border-b border-[#eef1f6] flex-shrink-0">
        <PickerSearch value={query} onChange={setQuery} placeholder={t("receivingReport.picker.searchPlaceholder")} />
        <span className="flex-1" />
        <span className="text-[13px] text-muted-foreground">{t("receivingReport.picker.subtitle")}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="min-w-[680px]">
          <div className={`${grid} h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173] sticky top-0`}>
            <span /><span>{t("receivingReport.picker.col.number")}</span><span>{t("receivingReport.picker.col.date")}</span>
            <span>{t("receivingReport.col.vendor")}</span><span>{t("receivingReportDoc.jobCode")}</span>
          </div>
          <div role="radiogroup" aria-label={t("receivingReport.create.sourceStep")}>
            <button type="button" role="radio" aria-checked={source === ""} onClick={() => setSource("")} className={`${pickRowClass(source === "")} ${grid} h-[60px]`}>
              <RadioDot on={source === ""} />
              <span className="col-span-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-[#eef1f6] text-[#3d5173] flex items-center justify-center flex-shrink-0"><FilePlus2 size={16} /></span>
                <span className="flex flex-col leading-snug">
                  <span className="text-sm font-medium text-foreground">{t("receivingReport.create.blank")}</span>
                  <span className="text-xs text-muted-foreground">{t("receivingReport.create.blankHint")}</span>
                </span>
              </span>
            </button>
            {loading ? (
              <div className="flex items-center justify-center py-10" role="status"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10 px-6">{t("receivingReport.picker.empty")}</p>
            ) : (
              filtered.map((r) => {
                const on = source === r.id;
                return (
                  <button key={r.id} type="button" role="radio" aria-checked={on} onClick={() => setSource(r.id)} className={`${pickRowClass(on)} ${grid} h-[52px]`}>
                    <RadioDot on={on} />
                    <span className="font-mono text-[13px] font-medium text-foreground truncate">{r.documentNumber || r.id}</span>
                    <span className="text-sm text-[#3d5173]">{formatDisplayDate(r.updatedAt)}</span>
                    <span className="text-sm font-medium text-foreground truncate" title={r.vendorName}>{r.vendorName || "—"}</span>
                    <span className={`font-mono text-[13px] truncate ${r.jobCode ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{r.jobCode || "—"}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </WidePickerShell>
  );
}

/** เลือกรหัสอย่างเดียว — ปุ่ม "รับสินค้า" บนใบสั่งซื้อรู้ใบสั่งซื้ออยู่แล้ว เหลือแค่รหัส */
export function ReceiveCodeDialog({
  onCreate, onCancel, purchaseOrder,
}: {
  onCreate: (code: ReceivingReportCode) => Promise<void>;
  onCancel: () => void;
  /** กล่องสรุปใบสั่งซื้อที่กำลังจะเปิดใบรับ (ไม่ส่ง = ไม่แสดงกล่อง) */
  purchaseOrder?: { number: string; vendorName: string; amount?: number };
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busy) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const descId = useId();
  const [code, setCode] = useState<ReceivingReportCode>("RR");
  const submit = async () => {
    setBusy(true);
    try { await onCreate(code); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
        className="relative w-full max-w-[480px] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col">
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className="w-11 h-11 rounded-full bg-[#e8f0fb] text-[#1a5fb4] flex items-center justify-center flex-shrink-0"><PackageCheck size={20} /></span>
          <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{t("receivingReport.create.codeOnlyTitle")}</h2>
            <p id={descId} className="text-sm text-[#3d5173] leading-relaxed">{t("receivingReport.create.codeOnlyHint")}</p>
          </div>
          <button type="button" onClick={close} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
          {purchaseOrder && (
            <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg flex items-center gap-3">
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="font-mono text-[13px] font-medium text-foreground">{purchaseOrder.number}</span>
                <span className="text-[13px] text-[#3d5173] truncate">{purchaseOrder.vendorName || "—"}</span>
              </div>
              {purchaseOrder.amount !== undefined && <span className="font-semibold tabular-nums whitespace-nowrap">฿{fmt(purchaseOrder.amount)}</span>}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-[#26395a]">{t("receivingReport.code.label")} <span className="text-[#b93636]">*</span></span>
            <ReceiveCodeOptions value={code} onChange={setCode} layout="list" />
            <span className="text-xs text-muted-foreground">
              {t("receivingReport.create.numberPreview")} <span className="font-mono text-[#3d5173]">{code}-</span>
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
          <button type="button" onClick={close} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className={btn.primary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("receivingReport.create.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
