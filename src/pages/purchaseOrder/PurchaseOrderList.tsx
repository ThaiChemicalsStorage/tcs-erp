import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { PurchaseOrderSummary, PurchaseOrderStatus } from "../../lib/purchaseOrder";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { table } from "../../components/ui/styles";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { DateRangeSelect, PurchaseOrderStatusPill } from "./purchasingUi";
import { usePurchaseOrderStatusLabel } from "./purchasingHooks";

const PAGE_SIZE = 20;
type StatusTab = "all" | PurchaseOrderStatus;
const TABS: StatusTab[] = ["all", "Draft", "PendingApproval", "Final"];

/**
 * รายการใบสั่งซื้อ (ดีไซน์ใหม่ 2026-09-30, แบบ QuoteList) — หัวหน้า (ชื่อโมดูล + ชื่อหน้า + ปุ่มสร้าง) แล้วการ์ดเดียว:
 * แท็บสถานะพร้อมจำนวน (แทนปุ่มกรองสถานะเดิม) → ค้นหา + ช่วงวันที่ + จำนวน → ตาราง (ทั้งแถวกดเปิดเอกสาร) → แบ่งหน้า
 */
export function PurchaseOrderList({
  purchaseOrders, onOpen, headerAction,
}: {
  purchaseOrders: PurchaseOrderSummary[];
  onOpen: (id: string) => void;
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const statusLabel = usePurchaseOrderStatusLabel();
  const [tab, setTab] = useState<StatusTab>("all");
  /** กรองช่วงวันที่ (2026-09-21) — เอกสารเก็บ 10 ปี การเลื่อนหาเองไม่ใช่ทางเลือก */
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = searchQuery.trim().toLowerCase();

  // ช่วงวันที่และคำค้นกรองก่อน แล้วแท็บนับ/กรองต่อจากผลนั้น — ตัวเลขบนแท็บจึงตรงกับสิ่งที่จะเห็นเมื่อกด
  const dateRangeResolved = resolveRange(dateRange);
  const toolbarFiltered = purchaseOrders
    .filter((d) => isWithinRange(d.updatedAt, dateRangeResolved))
    .filter((p) => !q || [p.id, p.documentNumber, p.jobCode, p.vendorName, p.purchaseRequestId].some((v) => (v ?? "").toLowerCase().includes(q)));
  const filtered = toolbarFiltered.filter((p) => tab === "all" || p.status === tab);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const withReset = <V,>(set: (v: V) => void) => (v: V) => { set(v); setPage(1); };

  const tabs = TABS.map((key) => ({
    key,
    label: key === "all" ? t("quotation.filterAll") : statusLabel[key],
    count: toolbarFiltered.filter((p) => key === "all" || p.status === key).length,
  }));

  const openOnKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(id); }
  };

  const columns = [
    t("purchaseOrder.col.id"), t("purchaseOrder.col.vendor"), t("purchaseOrder.col.jobCode"),
    t("purchaseOrder.col.purchaseRequest"), t("purchaseOrder.col.neededBy"),
    t("purchaseOrder.col.status"), t("purchaseOrder.col.updatedAt"), "",
  ];
  const dash = <span className="text-[#8a97ad]">—</span>;

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={<span className="inline-flex items-center gap-2">{t("nav.group.purchasing")}<span className="text-[#c3ccda]">·</span>{t("purchaseOrder.pageSubtitle")}</span>}
        title={t("purchaseOrder.pageTitle")}
        actions={headerAction}
      />

      <ListCard>
        <ListTabs tabs={tabs} active={tab} onChange={withReset(setTab)} ariaLabel={t("purchaseOrder.col.status")} />
        <ListToolbar
          search={searchQuery}
          onSearch={withReset(setSearchQuery)}
          searchPlaceholder={t("purchaseOrder.searchPlaceholder")}
          count={t("purchaseOrder.countLabel").replace("{n}", String(filtered.length))}
        >
          <DateRangeSelect value={dateRange} onChange={withReset(setDateRange)} />
        </ListToolbar>

        {purchaseOrders.length === 0 ? (
          <ListEmpty title={t("purchaseOrder.empty.title")} hint={t("purchaseOrder.empty.description")} />
        ) : filtered.length === 0 ? (
          <ListEmpty title={t("purchaseOrder.noFilterResults")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead>
                <tr className={table.head}>
                  {columns.map((h, i) => <th key={i} className={table.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => (
                  <tr
                    key={p.id}
                    tabIndex={0}
                    aria-label={`${t("purchaseOrder.openRow")} ${p.documentNumber || p.id}`}
                    onClick={() => onOpen(p.id)}
                    onKeyDown={(e) => openOnKey(e, p.id)}
                    className={`${table.row} group cursor-pointer outline-none focus-visible:bg-[#f8f9fc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40`}
                  >
                    <td className={`${table.td} ${table.code} whitespace-nowrap`}>{p.documentNumber || p.id}</td>
                    <td className={`${table.td} max-w-[300px]`}>
                      <span className="block text-sm font-medium text-foreground truncate" title={p.vendorName}>{p.vendorName || dash}</span>
                    </td>
                    <td className={`${table.td} font-mono text-[13px] text-[#3d5173] whitespace-nowrap`}>{p.jobCode || dash}</td>
                    <td className={`${table.td} font-mono text-[13px] text-[#3d5173] whitespace-nowrap`}>{p.purchaseRequestId || dash}</td>
                    <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{p.neededByDate ? formatQuoteDateThai(p.neededByDate) : dash}</td>
                    <td className={table.td}><PurchaseOrderStatusPill status={p.status} /></td>
                    <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{formatQuoteDateThai(p.updatedAt)}</td>
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
          <ListPagination
            page={currentPage}
            pageCount={pageCount}
            from={(currentPage - 1) * PAGE_SIZE + 1}
            to={Math.min(currentPage * PAGE_SIZE, filtered.length)}
            total={filtered.length}
            onPage={setPage}
          />
        )}
      </ListCard>
    </div>
  );
}
