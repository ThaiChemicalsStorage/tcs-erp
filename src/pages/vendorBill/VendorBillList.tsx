import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { formatQuoteDateThai, fmt } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import type { VendorBillSummary } from "../../lib/vendorBill";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import { PAGE_CLASS, Pill, ListDateRangeSelect, rowOpenClass } from "../receivingReport/receivingUi";
import { paginate, rowOpenProps } from "../receivingReport/receivingFormat";

type Tab = "all" | "owing" | "paid";

/**
 * รายการใบรับวางบิล — ไม่มีสถานะอนุมัติ ป้ายบอกแค่ว่าจ่ายครบแล้วหรือยังค้าง (อ่านจากทะเบียนเจ้าหนี้)
 * แท็บ ค้างจ่าย / จ่ายครบแล้ว (ดีไซน์ใหม่ 2026-09-30) กรองจากยอดคงค้างของแต่ละใบ
 */
export function VendorBillList({ vendorBills, onOpen, headerAction }: {
  vendorBills: VendorBillSummary[];
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const withReset = <V,>(set: (v: V) => void) => (v: V) => { set(v); setPage(1); };
  const q = searchQuery.trim().toLowerCase();
  const range = resolveRange(dateRange);
  const toolbarFiltered = vendorBills
    .filter((b) => isWithinRange(b.billDate || b.updatedAt, range))
    .filter((b) => !q || [b.id, b.documentNumber, b.vendorName].some((v) => (v ?? "").toLowerCase().includes(q)));
  const matches = (b: VendorBillSummary, k: Tab) => k === "all" || (k === "owing" ? b.outstanding > 0 : b.outstanding <= 0);
  const filtered = toolbarFiltered.filter((b) => matches(b, tab));
  const paged = paginate(filtered, page);

  const tabs = ([
    { key: "all", label: t("quotation.filterAll") },
    { key: "owing", label: t("vendorBill.tab.owing") },
    { key: "paid", label: t("vendorBill.paidInFull") },
  ] as { key: Tab; label: string }[]).map((tb) => ({ ...tb, count: toolbarFiltered.filter((b) => matches(b, tb.key)).length }));

  const columns: { label: string; right?: boolean }[] = [
    { label: t("vendorBill.col.id") },
    { label: t("vendorBill.col.vendor") },
    { label: t("vendorBill.col.billDate") },
    { label: t("vendorBill.col.rows"), right: true },
    { label: t("vendorBill.col.total"), right: true },
    { label: t("vendorBill.col.outstanding"), right: true },
    { label: t("vendorBill.col.paymentDate") },
    { label: "" },
  ];

  return (
    <div className={PAGE_CLASS}>
      <ListPageHeader
        module={t("nav.group.inventory")}
        title={t("vendorBill.pageTitle")}
        description={t("vendorBill.pageSubtitle")}
        actions={headerAction}
      />

      <ListCard>
        <ListTabs tabs={tabs} active={tab} onChange={withReset(setTab)} ariaLabel={t("vendorBill.tab.ariaLabel")} />
        <ListToolbar
          search={searchQuery}
          onSearch={withReset(setSearchQuery)}
          searchPlaceholder={t("vendorBill.searchPlaceholder")}
          count={t("ui.itemCount").replace("{n}", String(filtered.length))}
        >
          <ListDateRangeSelect value={dateRange} onChange={withReset(setDateRange)} />
        </ListToolbar>

        {vendorBills.length === 0 ? (
          <ListEmpty title={t("vendorBill.empty.title")} hint={t("vendorBill.empty.description")} />
        ) : filtered.length === 0 ? (
          <ListEmpty title={t("vendorBill.noFilterResults")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className={table.head}>
                  {columns.map((c, i) => (
                    <th key={i} className={c.right ? table.th.replace("text-left", "text-right") : table.th}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((b) => (
                  <tr key={b.id} {...rowOpenProps(() => onOpen(b.id), `${t("vendorBill.openRow")} ${b.documentNumber}`)} className={`${table.row} group ${rowOpenClass}`}>
                    <td className={`${table.td} ${table.code} whitespace-nowrap`}>{b.documentNumber}</td>
                    <td className={`${table.td} max-w-[320px]`}>
                      <span className="block text-sm font-medium text-foreground truncate" title={b.vendorName}>{b.vendorName}</span>
                    </td>
                    <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{b.billDate ? formatQuoteDateThai(b.billDate) : "—"}</td>
                    <td className={`${table.td} text-sm text-right tabular-nums text-[#3d5173]`}>{b.rowCount}</td>
                    <td className={`${table.td} ${table.money} text-sm whitespace-nowrap`}>{fmt(b.total)}</td>
                    <td className={`${table.td} text-right whitespace-nowrap`}>
                      {b.outstanding > 0
                        ? <span className="text-sm font-semibold tabular-nums text-[#8a5a00]">{fmt(b.outstanding)}</span>
                        : <Pill tone="green" label={t("vendorBill.paidInFull")} />}
                    </td>
                    <td className={`${table.td} text-sm whitespace-nowrap ${b.paymentDate ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{b.paymentDate ? formatQuoteDateThai(b.paymentDate) : "—"}</td>
                    <td className={`${table.td} w-10`}>
                      <ChevronRight size={18} className="text-[#a3aec2] group-hover:text-foreground transition-colors" aria-hidden="true" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && (
          <ListPagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={filtered.length} onPage={setPage} />
        )}
      </ListCard>
    </div>
  );
}
