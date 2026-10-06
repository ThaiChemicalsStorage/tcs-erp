import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, FileText, Loader2, Search, Sheet } from "lucide-react";
import { Combobox } from "../../components/Combobox";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { fmt } from "../../lib/quotes";
import { ALL_DATES, resolveRange, type DateRangeValue } from "../../lib/dateRanges";
import type { Product } from "../../lib/products";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { downloadXlsx, exportFileName, type ExportSheet } from "../../lib/tableExport";
import { stockCardSheet, stockHistorySheet } from "../../lib/stockExport";
import { printDate } from "../../lib/printFormat";
import { TablePrintDocument } from "../../components/TablePrintDocument";
import { StockCardPrintDocument } from "./StockCardPrintDocument";
import {
  fetchStockHistory, stockValueOf, STOCK_MOVEMENT_KIND_LABEL_KEY,
  type StockHistoryRow, type StockHistoryResult, type StockMovementKind, type StockMovementSourceType,
} from "../../lib/stock";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { SelectBox } from "../../components/ui/Field";
import { btn, field, surface, table } from "../../components/ui/styles";
import { LoadErrorState } from "../receivingReport/receivingUi";
import { DateRangeSelect, Pill, StatCard, type PillTone } from "./inventoryUi";
import { rowOpenProps } from "./inventoryFormat";
import { formatDisplayDate, formatDisplayTime } from "../../lib/displayDate";

/**
 * หน้าประวัติความเคลื่อนไหวสต๊อก (2026-09-23) — แยกออกจากการ์ดท้ายหน้าสต๊อกสินค้า ตามคำสั่งเจ้าของ
 * *"แยกประวัติปรับสต๊อกออกมาเป็นหน้าใหม่และสามารถค้นหาดูได้ว่าของชิ้นนี้ตัดไปกับงานไหนบ้างเข้ายังไงบ้าง"*
 *
 * สองแท็บ:
 *  - **ทุกความเคลื่อนไหว** — ตาราง + ตัวกรอง (ค้นหา/ประเภท/ที่มา/ช่วงวันที่) แบ่งหน้าจากเซิร์ฟเวอร์ และสรุปยอด
 *    ของทั้งชุดที่กรอง · กดที่แถวไหนก็ได้เพื่อไปติดตามสินค้าตัวนั้น (ดีไซน์ใหม่ 2026-09-30 — เดิมกดได้แค่ชื่อสินค้า)
 *  - **ติดตามรายสินค้า** — เลือกสินค้าหนึ่งตัว แล้วตอบคำถามของเจ้าของตรง ๆ: ตัดไปงานไหนบ้าง (รวมตามงาน)
 *    และรับเข้ามาจากไหน (ใบรับสินค้า/ใบสั่งซื้อ/ผู้ขาย) พร้อมสต๊อกการ์ดไล่ยอดคงเหลือ
 *
 * ตัวเลขทุกตัวมาจากแถวสต๊อกจริง ไม่มีการเก็บยอดสรุปซ้ำ · งาน/ผู้ขายเซิร์ฟเวอร์ตามไปอ่านจากเอกสารต้นทาง
 * (`api/_lib/stockHistory.ts`)
 */

const PAGE_SIZE = 50;
/** ส่งออกทั้งชุดที่กรองได้ไม่เกินนี้ (ดึงทีละ 500 ตามเพดานของเซิร์ฟเวอร์) — เกินแล้วบอกให้ย่อช่วงวันที่ */
const EXPORT_MAX = 5000;
const EXPORT_BATCH = 500;

/** งานพิมพ์ของหน้านี้ (2026-09-24) — รายงานประวัติ หรือการ์ดสต๊อกของสินค้าที่ติดตามอยู่ */
type PrintJob = { kind: "list"; sheet: ExportSheet } | { kind: "card"; product: Product; rows: StockHistoryRow[] };
type Tab = "all" | "trace";

/** แท็บติดตามรายสินค้าดึงครั้งเดียวไม่เกินนี้ — เกินแล้วบอกผู้ใช้ให้ย่อช่วงวันที่ */
const TRACE_LIMIT = 500;

const KINDS: StockMovementKind[] = ["receive", "deduct", "return", "adjust"];
const SOURCE_TYPES: StockMovementSourceType[] = [
  "material_requisition", "receiving_report", "store_receipt", "purchase_request", "tool_issue", "ar_document", "stock_import", "manual",
];
const SOURCE_LABEL_KEY: Record<StockMovementSourceType, TranslationKey> = {
  manual: "stockHistory.source.manual",
  ar_document: "stockHistory.source.ar_document",
  material_requisition: "stockHistory.source.material_requisition",
  receiving_report: "stockHistory.source.receiving_report",
  tool_issue: "stockHistory.source.tool_issue",
  purchase_request: "stockHistory.source.purchase_request",
  stock_import: "stockHistory.source.stock_import",
  store_receipt: "stockHistory.source.store_receipt",
};
/** ป้ายประเภท — รับเข้าเขียว · ตัดออกเหลือง · คืนของฟ้า · ปรับยอดเทา (ตามบอร์ดดีไซน์ใหม่) */
const KIND_TONE: Record<StockMovementKind, PillTone> = {
  receive: "green",
  deduct: "amber",
  return: "blue",
  adjust: "grey",
};
/** สีตัวเลขในกล่องไล่ยอดของแท็บติดตาม */
const KIND_TEXT: Record<StockMovementKind, string> = {
  receive: "text-[#1b7f4f]",
  deduct: "text-[#8a5a00]",
  return: "text-[#1a5fb4]",
  adjust: "text-[#3d5173]",
};

function timeOf(iso: string): string {
  return formatDisplayTime(iso, { timeZone: "Asia/Bangkok" });
}
/** จำนวนนับ (รายการ/ครั้ง) — ไม่มีทศนิยม */
function int(n: number): string {
  return n.toLocaleString("th-TH");
}
function signed(n: number): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

function KindPill({ kind }: { kind: StockMovementKind }) {
  const { t } = useI18n();
  return <Pill tone={KIND_TONE[kind]}>{t(STOCK_MOVEMENT_KIND_LABEL_KEY[kind])}</Pill>;
}

/** "ไปใช้กับงาน / มาจาก" ของหนึ่งแถว — ข้อความเดียวกันทั้งตารางรวมและสต๊อกการ์ด */
function LinkCell({ row }: { row: StockHistoryRow }) {
  const { t } = useI18n();
  const l = row.link;
  let main: string;
  let sub = "";
  let mono = true;
  if (row.sourceType === "receiving_report" || (row.kind === "receive" && (l.purchaseOrderNumber || l.vendorName))) {
    main = l.purchaseOrderNumber || "—";
    sub = l.vendorName || "";
  } else if (row.sourceType === "ar_document") {
    main = t("stockHistory.link.directSale");
    mono = false;
  } else {
    main = l.jobCode || "—";
    sub = [l.jobOrderCode && `${t("stockHistory.link.jobOrder")} ${l.jobOrderCode}`, l.productionOrderId && `${t("stockHistory.link.productionOrder")} ${l.productionOrderId}`, l.customerName]
      .filter(Boolean).join(" · ");
  }
  const empty = main === "—";
  return (
    <span className="flex flex-col min-w-0">
      <span className={`truncate ${mono ? "font-mono text-[12.5px]" : "text-[13px]"} ${empty ? "text-[#8a97ad]" : "text-foreground"}`}>{main}</span>
      {sub && <span className="text-xs text-muted-foreground truncate" title={sub}>{sub}</span>}
    </span>
  );
}

export function StockHistoryPage({
  currentUserId, products, company, initialProductId, onInitialProductConsumed,
}: {
  currentUserId: string;
  products: Product[];
  /** หัวจดหมายของใบพิมพ์ (ปุ่ม PDF — 2026-09-24) */
  company: Company;
  /** เปิดมาจากปุ่มประวัติของสินค้าในหน้าสต๊อก — เข้าแท็บติดตามรายสินค้าของตัวนั้นเลย */
  initialProductId?: string | null;
  onInitialProductConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>(initialProductId ? "trace" : "all");
  const [traceProductId, setTraceProductId] = useState<string>(initialProductId ?? "");
  /** จำนวนรายการของแท็บ "ทุกความเคลื่อนไหว" — ตัวเลขบนแท็บ */
  const [allTotal, setAllTotal] = useState<number | undefined>(undefined);

  const [applied, setApplied] = useState<string | null>(null);
  if (initialProductId && initialProductId !== applied) {
    setApplied(initialProductId);
    setTraceProductId(initialProductId);
    setTab("trace");
  }
  useEffect(() => {
    if (initialProductId) onInitialProductConsumed?.();
  }, [initialProductId, onInitialProductConsumed]);

  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  useEffect(() => {
    if (!printJob) return;
    const reset = () => setPrintJob(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [printJob]);
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const today = new Date().toLocaleDateString("sv-SE");

  // แท็บ "ทุกความเคลื่อนไหว" กับ "ติดตามรายสินค้า" มีส่วนต่างกัน — ขั้นที่ไม่อยู่ในแท็บที่เปิดอยู่ถูกข้ามเอง
  // เริ่มเองเฉพาะตอนอยู่แท็บแรก (เปิดมาจากปุ่มประวัติของหน้าสต๊อกจะเข้าแท็บติดตามเลย ซึ่งเห็นได้แค่ 2 ขั้น)
  const tourSteps: TourStep[] = [
    { element: '[data-tour="sh-kpis"]', manual: "ch22-3", popover: { title: t("tour.stockHistory.kpis.title"), description: t("tour.stockHistory.kpis.desc"), side: "bottom" } },
    { element: '[data-tour="sh-tabs"]', manual: "ch22-2", popover: { title: t("tour.stockHistory.tabs.title"), description: t("tour.stockHistory.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="sh-trace-pick"]', manual: "ch22-2", popover: { title: t("tour.stockHistory.trace.title"), description: t("tour.stockHistory.trace.desc"), side: "bottom" } },
    { element: '[data-tour="sh-filters"]', manual: "ch22-3", popover: { title: t("tour.stockHistory.filters.title"), description: t("tour.stockHistory.filters.desc"), side: "bottom" } },
    { element: '[data-tour="sh-table"]', manual: "ch22-3", popover: { title: t("tour.stockHistory.table.title"), description: t("tour.stockHistory.table.desc"), side: "top" } },
    { element: '[data-tour="sh-export"]', manual: "ch22-7", popover: { title: t("tour.stockHistory.export.title"), description: t("tour.stockHistory.export.desc"), side: "bottom" } },
  ];
  const tour = useModuleTour("stockHistory", currentUserId, tourSteps, { autoStart: tab === "all" });
  const help = <TourReplayButton variant="title" onClick={tour.start} />;

  const tabs = (
    <div data-tour="sh-tabs">
    <ListTabs<Tab>
      tabs={[
        { key: "all", label: t("stockHistory.tab.all"), count: allTotal },
        { key: "trace", label: t("stockHistory.tab.trace") },
      ]}
      active={tab}
      onChange={setTab}
      ariaLabel={t("stockHistory.title")}
    />
    </div>
  );

  return (
    <>
    {printJob?.kind === "list" && <TablePrintDocument sheet={printJob.sheet} companyHeader={companyHeader} docLabel="STOCK" printedAt={printDate(today)} />}
    {printJob?.kind === "card" && <StockCardPrintDocument product={printJob.product} movements={printJob.rows} companyHeader={companyHeader} printedAt={today} />}
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5 print:hidden">
      {tab === "all"
        ? <AllMovements tabs={tabs} help={help} onTotal={setAllTotal} onTrace={(pid) => { setTraceProductId(pid); setTab("trace"); }} onPrint={setPrintJob} />
        : <ItemTrace tabs={tabs} help={help} products={products} productId={traceProductId} onProductChange={setTraceProductId} onPrint={setPrintJob} />}
    </div>
    </>
  );
}

function PageHeader({ actions, help }: { actions?: ReactNode; help?: ReactNode }) {
  const { t } = useI18n();
  return (
    <ListPageHeader
      module={t("nav.group.inventory")}
      title={t("stockHistory.title")}
      description={t("stockHistory.subtitle")}
      help={help}
      actions={actions}
    />
  );
}

function AllMovements({ tabs, help, onTotal, onTrace, onPrint }: {
  tabs: ReactNode;
  help: ReactNode;
  onTotal: (n: number) => void;
  onTrace: (productId: string) => void;
  onPrint: (job: PrintJob) => void;
}) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [kind, setKind] = useState<StockMovementKind | "">("");
  const [sourceType, setSourceType] = useState<StockMovementSourceType | "">("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  // ผลลัพธ์ผูกกับกุญแจของคำขอ — "กำลังโหลด" คือกุญแจยังไม่ตรง (แพตเทิร์นเดียวกับหน้าสต๊อก ไม่ setState ใน effect)
  const [fetched, setFetched] = useState<{ key: string; result?: StockHistoryResult; error?: boolean } | null>(null);

  useEffect(() => {
    const h = setTimeout(() => { setDebounced(query.trim()); setPage(0); }, 300);
    return () => clearTimeout(h);
  }, [query]);

  const range = resolveRange(dateRange);
  const from = range?.from && range.from !== "0000-01-01" ? range.from : "";
  const to = range?.to && range.to !== "9999-12-31" ? range.to : "";

  const requestKey = JSON.stringify([debounced, kind, sourceType, from, to, page, retry]);
  useEffect(() => {
    let cancelled = false;
    fetchStockHistory({ q: debounced, kind, sourceType, from, to, skip: page * PAGE_SIZE, limit: PAGE_SIZE })
      .then((r) => { if (!cancelled) { setFetched({ key: requestKey, result: r }); onTotal(r.total); } })
      .catch(() => { if (!cancelled) setFetched({ key: requestKey, error: true }); });
    return () => { cancelled = true; };
    // onTotal เป็น setState ของหน้าแม่ (identity คงที่)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, debounced, kind, sourceType, from, to, page]);
  const loading = fetched?.key !== requestKey;
  const error = !loading && !!fetched?.error;
  // ระหว่างโหลดหน้าใหม่ยังโชว์ผลเดิมจาง ๆ ไว้ ไม่ให้ตารางกระพริบว่าง
  const [lastResult, setLastResult] = useState<StockHistoryResult | null>(null);
  if (fetched?.result && fetched.result !== lastResult) setLastResult(fetched.result);
  const result = lastResult;

  const summaryOf = (k: StockMovementKind) => result?.summary.find((s) => s.kind === k) ?? { kind: k, count: 0, amount: 0 };
  const total = result?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const clear = () => { setQuery(""); setDebounced(""); setKind(""); setSourceType(""); setDateRange(ALL_DATES); setPage(0); };

  /**
   * ส่งออก "ทั้งชุดที่กรองอยู่" ไม่ใช่แค่หน้าที่เห็น (2026-09-24) — ดึงทีละ 500 แถวตามเพดานของเซิร์ฟเวอร์ จนครบหรือถึง EXPORT_MAX
   * ตัวกรองเดียวกับตาราง (ค้นหา/ประเภท/ที่มา/ช่วงวันที่)
   */
  const exportRows = async (mode: "excel" | "pdf") => {
    if (total > EXPORT_MAX) { setExportError(t("stock.export.tooMany").replace("{n}", fmt(EXPORT_MAX))); return; }
    setExportError("");
    setExporting(mode);
    try {
      const all: StockHistoryRow[] = [];
      for (let skip = 0; skip < Math.max(total, 1); skip += EXPORT_BATCH) {
        const r = await fetchStockHistory({ q: debounced, kind, sourceType, from, to, skip, limit: EXPORT_BATCH });
        all.push(...r.movements);
        if (r.movements.length < EXPORT_BATCH) break;
      }
      const note = [
        debounced && `ค้นหา "${debounced}"`,
        kind && `ประเภท ${t(STOCK_MOVEMENT_KIND_LABEL_KEY[kind])}`,
        sourceType && `ที่มา ${t(SOURCE_LABEL_KEY[sourceType])}`,
        (from || to) && `ช่วง ${from ? printDate(from) : "…"} – ${to ? printDate(to) : "…"}`,
      ].filter(Boolean).join(" · ");
      const sheet = stockHistorySheet(all, (r) => t(SOURCE_LABEL_KEY[r.sourceType] ?? "stockHistory.source.manual"), note);
      if (mode === "excel") await downloadXlsx(exportFileName("ประวัติสต๊อก"), [sheet]);
      else onPrint({ kind: "list", sheet });
    } catch {
      setExportError(t("stock.export.failed"));
    } finally {
      setExporting(null);
    }
  };

  const movements = result?.movements ?? [];

  return (
    <>
      <PageHeader
        help={help}
        actions={(
          <div data-tour="sh-export" className="flex items-center gap-2.5 flex-wrap">
            <button type="button" onClick={() => void exportRows("excel")} disabled={total === 0 || exporting !== null} className={btn.secondary}>
              {exporting === "excel" ? <Loader2 size={16} className="animate-spin" /> : <Sheet size={16} />} {t("stock.export.excel")}
            </button>
            <button type="button" onClick={() => void exportRows("pdf")} disabled={total === 0 || exporting !== null} title={t("stock.export.pdfHint")} className={btn.secondary}>
              {exporting === "pdf" ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} {t("stock.export.pdf")}
            </button>
          </div>
        )}
      />
      {exportError && <p className={`${field.error} -mt-2`} role="alert">{exportError}</p>}

      <div data-tour="sh-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={t("stockHistory.kpi.total")} value={int(total)} sub={t("stockHistory.kpi.inFilter")} />
        <StatCard label={t("stockHistory.kpi.receive")} value={`฿${fmt(summaryOf("receive").amount)}`} tone="green" sub={t("stockHistory.kpi.count").replace("{n}", int(summaryOf("receive").count))} />
        <StatCard label={t("stockHistory.kpi.deduct")} value={`฿${fmt(summaryOf("deduct").amount)}`} tone="amber" sub={t("stockHistory.kpi.count").replace("{n}", int(summaryOf("deduct").count))} />
        <StatCard label={t("stockHistory.kpi.returnAdjust")} value={`${int(summaryOf("return").count)} / ${int(summaryOf("adjust").count)}`} sub={t("stockHistory.kpi.inFilter")} />
      </div>

      <ListCard>
        {tabs}
        <div data-tour="sh-filters">
        <ListToolbar
          search={query}
          onSearch={setQuery}
          searchPlaceholder={t("stockHistory.search.placeholder")}
          searchLabel={t("stockHistory.search.label")}
          count={t("ui.itemCount").replace("{n}", int(total))}
        >
          <DateRangeSelect value={dateRange} onChange={(v) => { setDateRange(v); setPage(0); }} />
          <SelectBox aria-label={t("stockHistory.filter.source")} value={sourceType} className="w-[200px]"
            onChange={(e) => { setSourceType(e.target.value as StockMovementSourceType | ""); setPage(0); }}>
            <option value="">{t("stockHistory.filter.allSources")}</option>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{t(SOURCE_LABEL_KEY[s])}</option>)}
          </SelectBox>
          <SelectBox aria-label={t("stockHistory.col.kind")} value={kind} className="w-[150px]"
            onChange={(e) => { setKind(e.target.value as StockMovementKind | ""); setPage(0); }}>
            <option value="">{t("stockHistory.filter.allKindsLong")}</option>
            {KINDS.map((k) => <option key={k} value={k}>{t(STOCK_MOVEMENT_KIND_LABEL_KEY[k])}</option>)}
          </SelectBox>
          <button type="button" onClick={clear} className={btn.text}>{t("stockHistory.filter.clear")}</button>
        </ListToolbar>
        </div>

        {error ? (
          <LoadErrorState message={t("stockHistory.loadError")} retryLabel={t("stockHistory.retry")} onRetry={() => setRetry((n) => n + 1)} />
        ) : !loading && result && movements.length === 0 ? (
          <ListEmpty title={t("stockHistory.empty")} />
        ) : (
          <div data-tour="sh-table" className="overflow-x-auto">
            <table className="w-full min-w-[1180px] table-fixed">
              <thead>
                <tr className={table.head}>
                  <th className={`${table.th} w-[104px]`}>{t("stockHistory.col.dateTime")}</th>
                  <th className={table.th}>{t("stockHistory.col.product")}</th>
                  <th className={`${table.th} w-[100px]`}>{t("stockHistory.col.kind")}</th>
                  <th className={`${table.th} w-[150px] text-right`}>{t("stockHistory.col.qtyAmount")}</th>
                  <th className={`${table.th} w-[100px] text-right`}>{t("stockHistory.col.balance")}</th>
                  <th className={`${table.th} w-[160px]`}>{t("stockHistory.col.source")}</th>
                  <th className={`${table.th} w-[190px]`}>{t("stockHistory.col.link")}</th>
                  <th className={`${table.th} w-[150px]`}>{t("stockHistory.col.user")}</th>
                </tr>
              </thead>
              <tbody className={loading ? "opacity-50" : ""}>
                {movements.map((m) => {
                  const charge = [m.departmentName, m.teamName].filter(Boolean).join(" / ");
                  return (
                    <tr
                      key={m.id}
                      {...rowOpenProps(() => onTrace(m.productId), `${t("stockHistory.tab.trace")} ${m.productCode} ${m.productName}`)}
                      className="h-16 border-b border-[#eef1f6] bg-white hover:bg-[#f8f9fc] transition-colors text-sm cursor-pointer outline-none focus-visible:bg-[#f8f9fc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40"
                    >
                      <td className={table.td}>
                        <span className="block text-[#3d5173] whitespace-nowrap">{formatDisplayDate(m.createdAt)}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{timeOf(m.createdAt)}</span>
                      </td>
                      <td className={table.td}>
                        <span className="block font-medium text-foreground truncate" title={m.productName}>{m.productName}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          <span className="font-mono">{m.productCode}</span>
                          {/* ตัด/คืนแทนสินค้าชุด (2026-09-29) — เจ้าของเลือกโชว์ทั้งชุดและชิ้นส่วน */}
                          {m.kitProductId && ` · ${t("kit.fromKit").replace("{kit}", m.kitProductName || m.kitProductCode || "").replace("{n}", (m.kitQty ?? 0).toLocaleString())}`}
                        </span>
                      </td>
                      <td className={table.td}><KindPill kind={m.kind} /></td>
                      <td className={`${table.td} text-right tabular-nums`}>
                        <span className={`block font-semibold ${m.delta >= 0 ? "text-[#1b7f4f]" : "text-[#b93636]"}`}>{signed(m.delta)}</span>
                        {(m.amount !== undefined || m.unitCost !== undefined) && (
                          <span className="block text-xs text-muted-foreground whitespace-nowrap">
                            {[m.amount !== undefined ? fmt(m.amount) : "", m.unitCost !== undefined ? `@${fmt(m.unitCost)}` : ""].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className={`${table.td} text-right font-medium tabular-nums`}>{fmt(m.balanceAfter)}</td>
                      <td className={table.td}>
                        <span className="block font-mono text-[12.5px] font-medium text-foreground truncate" title={m.sourceLabel || m.reason}>{m.sourceLabel || m.reason || "—"}</span>
                        <span className="block text-xs text-muted-foreground truncate">{t(SOURCE_LABEL_KEY[m.sourceType] ?? "stockHistory.source.manual")}</span>
                      </td>
                      <td className={table.td}><LinkCell row={m} /></td>
                      <td className={table.td}>
                        <span className="block truncate">{m.createdByName || "—"}</span>
                        {charge && <span className="block text-xs text-muted-foreground truncate" title={charge}>{charge}</span>}
                      </td>
                    </tr>
                  );
                })}
                {loading && !result && (
                  <tr><td colSpan={8} className="py-12 text-center text-sm text-muted-foreground" role="status">{t("stockHistory.loading")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <ListPagination
            page={page + 1}
            pageCount={pageCount}
            from={page * PAGE_SIZE + 1}
            to={Math.min(total, (page + 1) * PAGE_SIZE)}
            total={total}
            onPage={(p) => { if (!loading) setPage(Math.max(0, Math.min(pageCount, p) - 1)); }}
          />
        )}
      </ListCard>
    </>
  );
}

interface JobGroup {
  key: string;
  title: string;
  sub: string;
  out: number;
  returned: number;
  value: number;
  rows: StockHistoryRow[];
}

/** ปลายทางของของที่ออกจากคลัง — งานก่อน แล้วค่อยเอกสาร/แผนก เพื่อให้คำตอบของ "ไปงานไหน" รวมกลุ่มได้จริง */
function destinationOf(row: StockHistoryRow, noJob: string, directSale: string): { key: string; title: string; sub: string } {
  const l = row.link;
  if (row.sourceType === "ar_document") return { key: "__sale", title: directSale, sub: "" };
  const job = l.jobCode || l.jobOrderCode || l.productionOrderId;
  if (job) return { key: `job:${job}`, title: job, sub: [l.jobOrderCode !== job ? l.jobOrderCode : "", l.customerName].filter(Boolean).join(" · ") };
  if (row.teamName || row.departmentName) {
    const who = [row.departmentName, row.teamName].filter(Boolean).join(" / ");
    return { key: `dept:${who}`, title: who, sub: noJob };
  }
  return { key: "__none", title: noJob, sub: "" };
}

function CardHead({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`${surface.cardHead} flex-wrap`}>
      <h2 className={surface.cardTitle}>{title}</h2>
      {sub && <span className="text-[13px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function ItemTrace({ tabs, help, products, productId, onProductChange, onPrint }: {
  tabs: ReactNode;
  help: ReactNode;
  products: Product[];
  productId: string;
  onProductChange: (id: string) => void;
  onPrint: (job: PrintJob) => void;
}) {
  const { t } = useI18n();
  const product = products.find((p) => p.id === productId) ?? null;
  const [search, setSearch] = useState(product ? `${product.code} — ${product.name}` : "");
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [fetched, setFetched] = useState<{ key: string; result?: StockHistoryResult; error?: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const [syncedId, setSyncedId] = useState(productId);
  if (productId !== syncedId) {
    setSyncedId(productId);
    setSearch(product ? `${product.code} — ${product.name}` : "");
  }

  const range = resolveRange(dateRange);
  const from = range?.from && range.from !== "0000-01-01" ? range.from : "";
  const to = range?.to && range.to !== "9999-12-31" ? range.to : "";

  const requestKey = JSON.stringify([productId, from, to]);
  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    fetchStockHistory({ productId, from, to, limit: TRACE_LIMIT })
      .then((r) => { if (!cancelled) setFetched({ key: requestKey, result: r }); })
      .catch(() => { if (!cancelled) setFetched({ key: requestKey, error: true }); });
    return () => { cancelled = true; };
  }, [requestKey, productId, from, to]);
  const loading = !!productId && fetched?.key !== requestKey;
  const error = !loading && fetched?.key === requestKey && !!fetched.error;
  const result = fetched?.key === requestKey ? fetched.result ?? null : null;

  const options = useMemo(
    () => products.filter((p) => !p.archived).map((p) => ({ value: `${p.code} — ${p.name}`, label: `${p.code} — ${p.name}`, hint: `${fmt(p.stockQty)} ${p.unit}` })),
    [products],
  );

  const rows = useMemo(() => [...(result?.movements ?? [])].reverse(), [result]);
  const noJob = t("stockHistory.trace.noJob");
  const directSale = t("stockHistory.link.directSale");

  const analysis = useMemo(() => {
    const sum = (k: StockMovementKind) => rows.filter((r) => r.kind === k).reduce((s, r) => s + r.delta, 0);
    const times = (k: StockMovementKind) => rows.filter((r) => r.kind === k).length;
    const groups = new Map<string, JobGroup>();
    for (const r of rows) {
      if (r.kind !== "deduct" && !(r.kind === "return" && r.sourceType !== "receiving_report")) continue;
      const d = destinationOf(r, noJob, directSale);
      const g = groups.get(d.key) ?? { key: d.key, title: d.title, sub: d.sub, out: 0, returned: 0, value: 0, rows: [] };
      if (r.kind === "deduct") { g.out += -r.delta; g.value += r.amount ?? 0; } else { g.returned += r.delta; g.value -= r.amount ?? 0; }
      g.rows.push(r);
      groups.set(d.key, g);
    }
    const jobs = [...groups.values()].sort((a, b) => (b.out - b.returned) - (a.out - a.returned));
    return {
      opening: rows.length ? rows[0].balanceAfter - rows[0].delta : 0,
      closing: rows.length ? rows[rows.length - 1].balanceAfter : product?.stockQty ?? 0,
      receive: sum("receive"), deduct: -sum("deduct"), ret: sum("return"), adjust: sum("adjust"),
      receiveTimes: times("receive"), deductTimes: times("deduct"), returnTimes: times("return"), adjustTimes: times("adjust"),
      jobs,
      receipts: rows.filter((r) => r.kind === "receive"),
      others: rows.filter((r) => r.kind === "adjust"),
    };
  }, [rows, product, noJob, directSale]);

  const maxNet = Math.max(1, ...analysis.jobs.map((g) => g.out - g.returned));
  const unit = product?.unit ?? "";
  const timesText = (n: number) => t("stockHistory.trace.times").replace("{n}", String(n));

  const flow: { label: string; value: string; sub: string; op: string; color: string; dark?: boolean }[] = [
    { label: t("stockHistory.trace.opening"), value: fmt(analysis.opening), sub: "", op: "+", color: "text-foreground" },
    { label: t("stock.movementKind.receive"), value: fmt(analysis.receive), sub: timesText(analysis.receiveTimes), op: "+", color: KIND_TEXT.receive },
    { label: t("stock.movementKind.return"), value: fmt(analysis.ret), sub: timesText(analysis.returnTimes), op: "−", color: KIND_TEXT.return },
    { label: t("stock.movementKind.deduct"), value: fmt(analysis.deduct), sub: timesText(analysis.deductTimes), op: "±", color: KIND_TEXT.deduct },
    { label: t("stock.movementKind.adjust"), value: signed(analysis.adjust), sub: timesText(analysis.adjustTimes), op: "=", color: KIND_TEXT.adjust },
    { label: t("stockHistory.trace.closing"), value: fmt(analysis.closing), sub: unit, op: "", color: "text-white", dark: true },
  ];

  return (
    <>
      <PageHeader
        help={help}
        actions={(
          // การ์ดสต๊อกของสินค้าที่เลือก ตามช่วงวันที่ที่กรอง (2026-09-24) — คอลัมน์เดียวกับใบพิมพ์การ์ดสต๊อก
          <>
            <button type="button" disabled={!product || loading || !result} className={btn.secondary}
              onClick={() => { if (product) void downloadXlsx(exportFileName(`การ์ดสต๊อก-${product.code}`), [stockCardSheet(product, rows, from || to ? `ช่วง ${from ? printDate(from) : "…"} – ${to ? printDate(to) : "…"}` : "")]); }}>
              <Sheet size={16} /> {t("stock.export.cardExcel")}
            </button>
            <button type="button" disabled={!product || loading || !result} title={t("stock.export.pdfHint")} className={btn.secondary}
              onClick={() => { if (product) onPrint({ kind: "card", product, rows }); }}>
              <FileText size={16} /> {t("stock.export.cardPdf")}
            </button>
          </>
        )}
      />

      <section className={`${surface.card} flex-shrink-0`}>
        {tabs}
        <div data-tour="sh-trace-pick" className="flex items-end gap-4 flex-wrap px-5 py-4">
          <div className="w-full sm:w-[460px] flex flex-col gap-1.5">
            <span className={field.label}>{t("stockHistory.trace.pickProduct")}</span>
            <span className={field.box}>
              <Search size={16} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
              <Combobox
                value={search}
                onChange={setSearch}
                options={options}
                placeholder={t("stockHistory.trace.pickPlaceholder")}
                ariaLabel={t("stockHistory.trace.pickProduct")}
                className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none"
                onPick={(opt) => {
                  const p = products.find((x) => `${x.code} — ${x.name}` === opt.value);
                  if (p) { onProductChange(p.id); setOpen(null); }
                }}
              />
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={field.label}>{t("inventoryUi.dateRange")}</span>
            <DateRangeSelect value={dateRange} onChange={setDateRange} className="w-[200px]" />
          </div>
        </div>
      </section>

      {!product ? (
        <section className={surface.card}>
          <ListEmpty title={t("stockHistory.tab.trace")} hint={t("stockHistory.trace.pickHint")} />
        </section>
      ) : error ? (
        <section className={surface.card}>
          <ListEmpty title={t("stockHistory.loadError")} />
        </section>
      ) : (
        <div className={`flex flex-col gap-5 ${loading ? "opacity-60" : ""}`}>
          <div className="flex flex-col xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full flex flex-col gap-5">
              {/* ที่มาของยอด: ยกมา + รับ + คืน − ตัด ± ปรับ = คงเหลือท้ายช่วง */}
              <section className={surface.card}>
                <CardHead title={t("stockHistory.trace.flowTitle")} />
                <div className="px-6 py-5 flex flex-col gap-3">
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("stockHistory.trace.none")}</p>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {flow.map((b) => (
                        <div key={b.label} className="flex items-center gap-2 flex-1 min-w-[112px]">
                          <div className={`flex-1 min-w-0 px-3 py-2.5 rounded-[10px] border flex flex-col gap-0.5 ${b.dark ? "bg-[#0b1d3a] border-[#0b1d3a]" : "bg-[#f8f9fc] border-border"}`}>
                            <span className={`text-xs whitespace-nowrap ${b.dark ? "text-[#c5d3e8]" : "text-muted-foreground"}`}>{b.label}</span>
                            <span className={`text-xl leading-tight font-semibold tabular-nums truncate ${b.color}`}>{b.value}</span>
                            {b.sub && <span className={`text-xs ${b.dark ? "text-[#c5d3e8]" : "text-muted-foreground"}`}>{b.sub}</span>}
                          </div>
                          {b.op && <span className="w-3.5 text-center text-lg font-semibold text-[#8a97ad]" aria-hidden="true">{b.op}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {result && result.total > rows.length && (
                    <p className="text-xs text-[#8a5a00]">{t("stockHistory.trace.truncated").replace("{n}", fmt(rows.length))}</p>
                  )}
                </div>
              </section>

              {/* ตัดไปใช้กับงานไหนบ้าง */}
              <section className={`${surface.card} overflow-hidden`}>
                <CardHead
                  title={t("stockHistory.trace.jobsTitle")}
                  sub={t("stockHistory.trace.jobsSummary").replace("{qty}", `${fmt(analysis.deduct - analysis.ret)} ${unit}`).replace("{n}", String(analysis.jobs.length))}
                />
                {analysis.jobs.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-muted-foreground">{t("stockHistory.trace.emptyGroup")}</p>
                ) : analysis.jobs.map((g) => {
                  const net = g.out - g.returned;
                  const isOpen = open === g.key;
                  const docs = new Set(g.rows.map((r) => r.sourceLabel || r.id)).size;
                  return (
                    <div key={g.key} className="border-b border-[#eef1f6] last:border-b-0">
                      <button type="button" onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen}
                        className={`w-full min-h-[60px] px-6 py-2 text-left grid grid-cols-[20px_minmax(0,1fr)_100px_90px] sm:grid-cols-[20px_minmax(0,1fr)_140px_90px_110px] gap-3 items-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 ${isOpen ? "bg-[#f8f9fc]" : "bg-white hover:bg-[#f8f9fc]"}`}>
                        <ChevronRight size={16} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true" />
                        <span className="min-w-0 flex flex-col leading-snug">
                          <span className="font-mono text-[13px] font-medium text-foreground truncate">{g.title}</span>
                          <span className="text-xs text-muted-foreground truncate">{[g.sub, t("stockHistory.trace.docsCount").replace("{n}", String(docs))].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className="h-1.5 rounded-full bg-[#eef1f6] overflow-hidden" aria-hidden="true">
                          <span className="block h-1.5 rounded-full bg-[#1a5fb4]" style={{ width: `${Math.max(4, (net / maxNet) * 100)}%` }} />
                        </span>
                        <span className="text-right font-semibold tabular-nums whitespace-nowrap">{fmt(net)} <span className="text-[13px] font-normal text-muted-foreground">{unit}</span></span>
                        <span className="hidden sm:block text-right text-[#3d5173] tabular-nums">{fmt(g.value)}</span>
                      </button>
                      {isOpen && (
                        <div className="px-6 pl-14 pt-1 pb-3 bg-[#f8f9fc]">
                          {g.rows.map((r) => (
                            <div key={r.id} className="grid grid-cols-[96px_minmax(0,1fr)_60px] sm:grid-cols-[96px_minmax(0,1fr)_180px_60px] gap-3 items-center min-h-[38px] py-1 border-b border-[#eef1f6] last:border-b-0 text-[13px]">
                              <span className="text-muted-foreground">{formatDisplayDate(r.createdAt)}</span>
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="font-mono font-medium text-foreground truncate">{r.sourceLabel || "—"}</span>
                                <KindPill kind={r.kind} />
                              </span>
                              <span className="hidden sm:block text-[#3d5173] truncate">{[r.departmentName, r.teamName].filter(Boolean).join(" / ") || "—"}</span>
                              <span className={`text-right font-semibold tabular-nums ${r.delta >= 0 ? "text-[#1b7f4f]" : "text-[#b93636]"}`}>{signed(r.delta)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </div>

            {/* แถบขวา: ยอดตอนนี้ + รับเข้ามาจากไหน */}
            <aside className="w-full xl:w-[320px] flex-shrink-0 flex flex-col gap-4">
              <section className="rounded-xl bg-[#0b1d3a] text-white p-5 flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[12.5px] text-[#c5d3e8]">{product.code}{unit ? ` · ${unit}` : ""}</span>
                  <span className="text-base font-semibold leading-snug">{product.name}</span>
                </div>
                <div className="h-px bg-white/10" />
                <span className="text-[13px] text-[#c5d3e8]">{t("stockHistory.trace.currentStock")}</span>
                <span className="text-[26px] font-bold leading-tight tabular-nums">
                  {fmt(product.stockQty)} <span className="text-base font-medium text-[#c5d3e8]">{unit}</span>
                </span>
                <div className="flex justify-between text-[13px] text-[#c5d3e8]"><span>{t("stockHistory.trace.avgCost")}</span><span className="tabular-nums text-white">฿{fmt(product.avgCost ?? 0)}</span></div>
                <div className="flex justify-between text-[13px] text-[#c5d3e8]"><span>{t("stockHistory.trace.value")}</span><span className="tabular-nums text-white">฿{fmt(stockValueOf(product))}</span></div>
              </section>

              <section className={`${surface.card} overflow-hidden`}>
                <div className="px-5 py-4 border-b border-[#eef1f6]">
                  <h2 className="text-[15px] font-semibold text-foreground">{t("stockHistory.trace.receiptsTitle")}</h2>
                </div>
                {analysis.receipts.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">{t("stockHistory.trace.emptyGroup")}</p>
                ) : analysis.receipts.map((r) => (
                  <div key={r.id} className="px-5 py-3 border-b border-[#eef1f6] flex gap-3">
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5 leading-snug">
                      <span className="text-xs text-muted-foreground truncate">{formatDisplayDate(r.createdAt)}{r.link.vendorName ? ` · ${r.link.vendorName}` : ""}</span>
                      <span className="font-mono text-[12.5px] font-medium text-foreground truncate">
                        {r.sourceLabel || t(SOURCE_LABEL_KEY[r.sourceType])}
                        {r.link.purchaseOrderNumber && <span className="font-normal text-muted-foreground"> · {r.link.purchaseOrderNumber}</span>}
                      </span>
                    </span>
                    <span className="flex flex-col items-end leading-snug tabular-nums">
                      <span className="font-semibold text-[#1b7f4f]">{signed(r.delta)}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {[r.amount !== undefined ? fmt(r.amount) : "—", r.unitCost !== undefined ? `@${fmt(r.unitCost)}` : ""].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </div>
                ))}
                <div className="px-5 py-2 bg-[#f8f9fc] border-b border-[#eef1f6] text-xs font-semibold text-[#3d5173]">{t("stockHistory.trace.otherTitle")}</div>
                {analysis.others.length === 0 ? (
                  <p className="px-5 py-3 text-[13px] text-muted-foreground">{t("stockHistory.trace.emptyGroup")}</p>
                ) : analysis.others.map((r) => (
                  <div key={r.id} className="px-5 py-3 border-b border-[#eef1f6] last:border-b-0 flex gap-3">
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5 leading-snug">
                      <span className="text-xs text-muted-foreground truncate">{formatDisplayDate(r.createdAt)}{r.createdByName ? ` · ${r.createdByName}` : ""}</span>
                      <span className="text-[13px] text-foreground truncate">{r.reason || r.sourceLabel || "—"}</span>
                    </span>
                    <span className="flex flex-col items-end leading-snug tabular-nums">
                      <span className={`font-semibold ${r.delta >= 0 ? "text-[#1b7f4f]" : "text-[#b93636]"}`}>{signed(r.delta)}</span>
                      <span className="text-xs text-muted-foreground">{r.amount !== undefined ? fmt(r.amount) : "—"}</span>
                    </span>
                  </div>
                ))}
              </section>
            </aside>
          </div>

          {/* สต๊อกการ์ด */}
          <section className={`${surface.card} overflow-hidden`}>
            <CardHead title={t("stockHistory.trace.ledgerShort")} sub={t("stockHistory.trace.ledgerSub").replace("{n}", rows.length.toLocaleString("th-TH"))} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] table-fixed">
                <thead>
                  <tr className={table.head}>
                    <th className={`${table.th} w-[110px]`}>{t("stockHistory.col.date")}</th>
                    <th className={`${table.th} w-[110px]`}>{t("stockHistory.col.kind")}</th>
                    <th className={`${table.th} w-[200px]`}>{t("stockHistory.col.source")}</th>
                    <th className={table.th}>{t("stockHistory.col.link")}</th>
                    <th className={`${table.th} w-[96px] text-right`}>{t("stockHistory.trace.in")}</th>
                    <th className={`${table.th} w-[96px] text-right`}>{t("stockHistory.trace.out")}</th>
                    <th className={`${table.th} w-[110px] text-right`}>{t("stockHistory.col.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 && (
                    <tr className="h-11 border-b border-[#eef1f6] bg-[#fbfcfe] text-sm text-muted-foreground">
                      <td className={table.td}>{formatDisplayDate(rows[0].createdAt)}</td>
                      <td colSpan={5} className={table.td}>{t("stockHistory.trace.opening")}</td>
                      <td className={`${table.td} text-right font-semibold text-foreground tabular-nums`}>{fmt(analysis.opening)}</td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="h-14 border-b border-[#eef1f6] bg-white text-sm">
                      <td className={`${table.td} text-[#3d5173] whitespace-nowrap`}>{formatDisplayDate(r.createdAt)}</td>
                      <td className={table.td}><KindPill kind={r.kind} /></td>
                      <td className={`${table.td} truncate ${r.sourceLabel ? "font-mono text-[13px] font-medium" : "text-[13px]"}`} title={r.sourceLabel || r.reason}>{r.sourceLabel || r.reason || "—"}</td>
                      <td className={table.td}><LinkCell row={r} /></td>
                      <td className={`${table.td} text-right font-semibold text-[#1b7f4f] tabular-nums`}>{r.delta > 0 ? fmt(r.delta) : ""}</td>
                      <td className={`${table.td} text-right font-semibold text-[#b93636] tabular-nums`}>{r.delta < 0 ? fmt(-r.delta) : ""}</td>
                      <td className={`${table.td} text-right font-semibold tabular-nums`}>{fmt(r.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
