import { useState, type ReactNode } from "react";
import { FileStack, Search, X } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { DateRangeFilter } from "../../components/DateRangeFilter";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { formatQuoteDateThai, fmt } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import type { VendorBillSummary } from "../../lib/vendorBill";

/** รายการใบรับวางบิล — ไม่มีสถานะอนุมัติ ป้ายบอกแค่ว่าจ่ายครบแล้วหรือยังค้าง (อ่านจากทะเบียนเจ้าหนี้) */
export function VendorBillList({ vendorBills, onOpen, headerAction }: {
  vendorBills: VendorBillSummary[];
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const q = searchQuery.trim().toLowerCase();
  const range = resolveRange(dateRange);
  const filtered = vendorBills
    .filter((b) => isWithinRange(b.billDate || b.updatedAt, range))
    .filter((b) => !q || [b.id, b.documentNumber, b.vendorName].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("vendorBill.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("vendorBill.pageSubtitle")}</p>
        </div>
        {headerAction}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("vendorBill.searchPlaceholder")}
            aria-label={t("vendorBill.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} aria-label={t("vendorBill.clearSearch")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {vendorBills.length === 0 ? (
          <EmptyState icon={FileStack} title={t("vendorBill.empty.title")} description={t("vendorBill.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("vendorBill.noFilterResults")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[
                    t("vendorBill.col.id"), t("vendorBill.col.vendor"), t("vendorBill.col.billDate"), t("vendorBill.col.rows"),
                    t("vendorBill.col.total"), t("vendorBill.col.outstanding"), t("vendorBill.col.paymentDate"),
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr
                    key={b.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${t("vendorBill.openRow")} ${b.documentNumber}`}
                    onClick={() => onOpen(b.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(b.id); } }}
                    className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
                  >
                    <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{b.documentNumber}</td>
                    <td className="px-4 py-3.5 text-sm text-foreground max-w-[260px] truncate" title={b.vendorName}>{b.vendorName}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{b.billDate ? formatQuoteDateThai(b.billDate) : "—"}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground text-right">{b.rowCount}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-foreground text-right whitespace-nowrap">{fmt(b.total)}</td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {b.outstanding > 0 ? (
                        <span className="text-xs font-mono font-semibold text-[#a75d1a]">{fmt(b.outstanding)}</span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20">{t("vendorBill.paidInFull")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{b.paymentDate ? formatQuoteDateThai(b.paymentDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
