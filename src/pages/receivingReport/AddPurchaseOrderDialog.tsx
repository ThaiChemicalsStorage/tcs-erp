import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { fetchPurchaseOrderCandidates, type ReceivingPurchaseOrderCandidate } from "../../lib/receivingReport";
import { btn } from "../../components/ui/styles";
import { RadioDot } from "./receivingUi";
import { pickRowClass } from "./receivingFormat";
import { PickerSearch, WidePickerShell } from "./ReceivingReportCreateDialog";
import { formatDisplayDate } from "../../lib/displayDate";

/**
 * เลือกใบสั่งซื้อเพิ่มเข้าใบรับสินค้า (2026-09-29 — ใบเดียวรับหลาย PO) · รายการมาจากเซิร์ฟเวอร์: อนุมัติแล้ว ผู้ขายเดียวกับใบหลัก
 * และยังไม่อยู่ในใบรับสินค้าใบไหน · ดีไซน์ใหม่ (2026-09-30): เลือกแถวแล้วกด "เพิ่ม PO" ยืนยัน — ไม่เพิ่มทันทีที่คลิกแถวอีกต่อไป
 */
export function AddPurchaseOrderDialog({ receivingReportId, vendorName, busy, onPick, onCancel }: {
  receivingReportId: string;
  vendorName: string;
  busy: boolean;
  onPick: (purchaseOrderId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ReceivingPurchaseOrderCandidate[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPurchaseOrderCandidates(receivingReportId)
      .then((list) => { if (!cancelled) setRows(list); })
      .catch((err) => { if (!cancelled) { setRows([]); setError(err instanceof ApiError ? err.message : t("receivingReportDoc.addPo.loadError")); } });
    return () => { cancelled = true; };
  }, [receivingReportId, t]);

  const q = search.trim().toLowerCase();
  const shown = (rows ?? []).filter((r) => !q || [r.documentNumber, r.jobCode].some((v) => v.toLowerCase().includes(q)));
  const pickedRow = (rows ?? []).find((r) => r.id === picked);
  const grid = "grid grid-cols-[20px_170px_140px_minmax(0,1fr)_120px] gap-3.5 items-center px-6";

  return (
    <WidePickerShell
      title={t("receivingReportDoc.addPo.title")}
      subtitle={t("receivingReportDoc.addPo.hint").replace("{vendor}", vendorName || "—")}
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <p className="flex-1 min-w-0 text-sm text-[#3d5173] truncate">
            {pickedRow ? (
              <>{t("receivingReportDoc.addPo.picked")} <span className="font-mono font-medium text-foreground">{pickedRow.documentNumber}</span></>
            ) : t("ui.selectedCount").replace("{n}", "0")}
          </p>
          <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={() => { if (picked) onPick(picked); }} disabled={!picked || busy} className={btn.primary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("receivingReportDoc.addPo.button")}
          </button>
        </>
      }
    >
      <div className="px-6 py-3.5 flex items-center gap-2.5 flex-wrap border-b border-[#eef1f6] flex-shrink-0">
        <PickerSearch value={search} onChange={setSearch} placeholder={t("receivingReportDoc.addPo.search")} autoFocus />
        <span className="flex-1" />
        {rows !== null && !error && <span className="text-[13px] text-muted-foreground">{t("ui.itemCount").replace("{n}", String(shown.length))}</span>}
      </div>
      <div className="flex-1 min-h-[8rem] overflow-auto">
        {rows === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 size={16} className="animate-spin" /> {t("receivingReportDoc.addPo.loading")}
          </div>
        ) : error ? (
          <p className="text-sm text-[#b93636] py-8 text-center" role="alert">{error}</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">{t("receivingReportDoc.addPo.empty")}</p>
        ) : (
          <div className="min-w-[640px]">
            <div className={`${grid} h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173] sticky top-0`}>
              <span /><span>{t("receivingReport.picker.col.number")}</span><span>{t("receivingReport.picker.col.date")}</span>
              <span>{t("receivingReportDoc.jobCode")}</span><span className="text-right">{t("receivingReportDoc.col.item")}</span>
            </div>
            <div role="radiogroup" aria-label={t("receivingReportDoc.addPo.title")}>
              {shown.map((r) => {
                const on = picked === r.id;
                return (
                  <button key={r.id} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => setPicked(r.id)} className={`${pickRowClass(on)} ${grid} h-[52px]`}>
                    <RadioDot on={on} />
                    <span className="font-mono text-[13px] font-medium text-foreground truncate">{r.documentNumber}</span>
                    <span className="text-sm text-[#3d5173]">{r.orderDate ? formatDisplayDate(r.orderDate) : "—"}</span>
                    <span className={`font-mono text-[13px] truncate ${r.jobCode ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{r.jobCode || "—"}</span>
                    <span className="text-sm text-[#3d5173] text-right">{t("receivingReportDoc.addPo.lineCount").replace("{n}", String(r.lineCount))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </WidePickerShell>
  );
}
