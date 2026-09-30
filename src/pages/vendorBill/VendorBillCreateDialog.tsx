import { useEffect, useMemo, useState } from "react";
import { FileStack, Loader2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { fmt } from "../../lib/quotes";
import { fetchVendorBillCandidates, type VendorBillCandidate } from "../../lib/vendorBill";
import { btn } from "../../components/ui/styles";
import { RadioDot } from "../receivingReport/receivingUi";
import { pickRowClass } from "../receivingReport/receivingFormat";
import { PickerSearch, WidePickerShell } from "../receivingReport/ReceivingReportCreateDialog";

/**
 * เลือกผู้ขายที่มาวางบิล — แสดงเฉพาะผู้ขายที่ยังมีใบรับสินค้าค้างจ่ายและยังไม่ได้วางบิล พร้อมจำนวนใบและยอด
 * กดสร้างแล้วเซิร์ฟเวอร์ติ๊กทุกใบของผู้ขายนั้นให้ (เอาออกในหน้าเอกสารได้) · ดีไซน์ใหม่ (2026-09-30):
 * เลือกแถวแล้วกด "รับวางบิล" ยืนยัน — ไม่สร้างทันทีที่คลิกแถวอีกต่อไป
 */
export function VendorBillCreateDialog({ onCreate, onCancel }: {
  onCreate: (vendorName: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [candidates, setCandidates] = useState<VendorBillCandidate[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchVendorBillCandidates()
      .then((c) => { if (!cancelled) setCandidates(c); })
      .catch(() => { if (!cancelled) setLoadFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const vendors = useMemo(() => {
    const byVendor = new Map<string, { vendorName: string; count: number; total: number }>();
    for (const c of candidates ?? []) {
      const v = byVendor.get(c.vendorName) ?? { vendorName: c.vendorName, count: 0, total: 0 };
      byVendor.set(c.vendorName, { ...v, count: v.count + 1, total: v.total + c.outstanding });
    }
    const q = query.trim().toLowerCase();
    return [...byVendor.values()]
      .filter((v) => !q || v.vendorName.toLowerCase().includes(q))
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName, "th"));
  }, [candidates, query]);

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await onCreate(picked);
    } finally {
      setBusy(false);
    }
  };

  const grid = "grid grid-cols-[20px_minmax(0,1fr)_150px_150px] gap-3.5 items-center px-6";

  return (
    <WidePickerShell
      title={t("vendorBill.create.title")}
      subtitle={t("vendorBill.create.hint")}
      onClose={onCancel}
      busy={busy}
      footer={
        <>
          <p className="flex-1 min-w-0 text-sm text-[#3d5173] truncate">
            {picked
              ? <>{t("receivingReportDoc.addPo.picked")} <span className="font-semibold text-foreground">{picked}</span></>
              : t("ui.selectedCount").replace("{n}", "0")}
          </p>
          <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={() => void submit()} disabled={!picked || busy} className={btn.primary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileStack size={16} />} {t("vendorBill.createBtn")}
          </button>
        </>
      }
    >
      <div className="px-6 py-3.5 flex items-center gap-2.5 flex-wrap border-b border-[#eef1f6] flex-shrink-0">
        <PickerSearch value={query} onChange={setQuery} placeholder={t("vendorBill.create.search")} autoFocus />
        <span className="flex-1" />
        {candidates !== null && <span className="text-[13px] text-muted-foreground">{t("vendorBill.create.vendorCount").replace("{n}", String(vendors.length))}</span>}
      </div>
      <div className="flex-1 min-h-[8rem] overflow-auto">
        {loadFailed ? (
          <p className="text-sm text-[#b93636] py-8 text-center" role="alert">{t("vendorBill.loadError")}</p>
        ) : candidates === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status"><Loader2 size={16} className="animate-spin" /> {t("vendorBill.loading")}</div>
        ) : vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">{candidates.length === 0 ? t("vendorBill.create.none") : t("vendorBill.noFilterResults")}</p>
        ) : (
          <div className="min-w-[560px]">
            <div className={`${grid} h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173] sticky top-0`}>
              <span /><span>{t("vendorBill.col.vendor")}</span>
              <span className="text-right">{t("vendorBill.create.colReports")}</span><span className="text-right">{t("vendorBill.col.amount")}</span>
            </div>
            <div role="radiogroup" aria-label={t("vendorBill.create.title")}>
              {vendors.map((v) => {
                const on = picked === v.vendorName;
                return (
                  <button key={v.vendorName} type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => setPicked(v.vendorName)} className={`${pickRowClass(on)} ${grid} h-[52px]`}>
                    <RadioDot on={on} />
                    <span className="text-sm font-medium text-foreground truncate">{v.vendorName}</span>
                    <span className="text-sm text-right text-[#3d5173]">{t("vendorBill.create.count").replace("{n}", String(v.count))}</span>
                    <span className="text-sm text-right font-semibold tabular-nums text-foreground">{fmt(v.total)}</span>
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
