import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { fmt } from "../../lib/quotes";
import { fetchVendorBillCandidates, type VendorBillCandidate } from "../../lib/vendorBill";

/**
 * เลือกผู้ขายที่มาวางบิล — แสดงเฉพาะผู้ขายที่ยังมีใบรับสินค้าค้างจ่ายและยังไม่ได้วางบิล พร้อมจำนวนใบและยอด
 * กดสร้างแล้วเซิร์ฟเวอร์ติ๊กทุกใบของผู้ขายนั้นให้ (เอาออกในหน้าเอกสารได้)
 */
export function VendorBillCreateDialog({ onCreate, onCancel }: {
  onCreate: (vendorName: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const [candidates, setCandidates] = useState<VendorBillCandidate[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [busyVendor, setBusyVendor] = useState<string | null>(null);

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

  const pick = async (vendorName: string) => {
    setBusyVendor(vendorName);
    try {
      await onCreate(vendorName);
    } finally {
      setBusyVendor(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t("vendorBill.create.title")}
        className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("vendorBill.create.title")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t("vendorBill.create.hint")}</p>
          </div>
          <button onClick={onCancel} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
        </div>
        <div className="px-5 pt-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
              placeholder={t("vendorBill.create.search")} aria-label={t("vendorBill.create.search")}
              className="w-full h-9 pl-9 pr-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          </div>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          {loadFailed ? (
            <p className="text-sm text-[#e05252]">{t("vendorBill.loadError")}</p>
          ) : candidates === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> {t("vendorBill.loading")}</div>
          ) : vendors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{candidates.length === 0 ? t("vendorBill.create.none") : t("vendorBill.noFilterResults")}</p>
          ) : (
            <ul className="space-y-2">
              {vendors.map((v) => (
                <li key={v.vendorName}>
                  <button onClick={() => void pick(v.vendorName)} disabled={busyVendor !== null}
                    className="w-full flex items-center gap-3 px-4 py-3 border border-border rounded-lg text-left hover:border-[#c9a84c]/50 hover:bg-secondary/40 transition-colors disabled:opacity-60">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{v.vendorName}</p>
                      <p className="text-xs text-muted-foreground">{t("vendorBill.create.count").replace("{n}", String(v.count))}</p>
                    </div>
                    <span className="text-sm font-mono font-semibold text-foreground">{fmt(v.total)}</span>
                    {busyVendor === v.vendorName && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
