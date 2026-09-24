import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, History, Loader2, Search, Sheet, X } from "lucide-react";
import { Tabs } from "../../components/Tabs";
import { Combobox } from "../../components/Combobox";
import { DateRangeFilter } from "../../components/DateRangeFilter";
import { EmptyState } from "../../components/EmptyState";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { fmt, formatQuoteDateThai } from "../../lib/quotes";
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

/**
 * หน้าประวัติความเคลื่อนไหวสต๊อก (2026-09-23) — แยกออกจากการ์ดท้ายหน้าสต๊อกสินค้า ตามคำสั่งเจ้าของ
 * *"แยกประวัติปรับสต๊อกออกมาเป็นหน้าใหม่และสามารถค้นหาดูได้ว่าของชิ้นนี้ตัดไปกับงานไหนบ้างเข้ายังไงบ้าง"*
 *
 * สองแท็บ:
 *  - **ทุกความเคลื่อนไหว** — ตาราง + ตัวกรอง (ค้นหา/ประเภท/ที่มา/ช่วงวันที่) แบ่งหน้าจากเซิร์ฟเวอร์ และสรุปยอด
 *    ของทั้งชุดที่กรอง
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

const exportBtnCls = "h-9 flex items-center gap-1.5 px-3 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50";
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
/** ป้ายประเภท — สูตร tinted pill ของ DESIGN.md: สีประจำ /10 · ขอบ /20 · ตัวอักษรสีเข้มของเฉดเดียวกัน */
const KIND_PILL: Record<StockMovementKind, string> = {
  receive: "bg-[#2aa36b]/10 text-[#207e52] border-[#2aa36b]/20",
  deduct: "bg-[#e08a3c]/10 text-[#a75d1a] border-[#e08a3c]/20",
  return: "bg-[#1f9d8a]/10 text-[#187c6d] border-[#1f9d8a]/20",
  adjust: "bg-[#7c4dbb]/10 text-[#6a3fa6] border-[#7c4dbb]/20",
};

const inputCls = "h-9 px-3 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors";
const thCls = "px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}
function signed(n: number): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

function KindPill({ kind }: { kind: StockMovementKind }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${KIND_PILL[kind]}`}>
      {t(STOCK_MOVEMENT_KIND_LABEL_KEY[kind])}
    </span>
  );
}

/** "ไปใช้กับงาน / มาจาก" ของหนึ่งแถว — ข้อความเดียวกันทั้งตารางรวมและสต๊อกการ์ด */
function LinkCell({ row }: { row: StockHistoryRow }) {
  const { t } = useI18n();
  const l = row.link;
  if (row.sourceType === "receiving_report" || (row.kind === "receive" && (l.purchaseOrderNumber || l.vendorName))) {
    return (
      <span>
        <span className="font-mono">{l.purchaseOrderNumber || "—"}</span>
        {l.vendorName && <span className="block text-muted-foreground">{l.vendorName}</span>}
      </span>
    );
  }
  if (row.sourceType === "ar_document") return <span className="text-muted-foreground">{t("stockHistory.link.directSale")}</span>;
  const job = l.jobCode || "";
  const sub = [l.jobOrderCode && `${t("stockHistory.link.jobOrder")} ${l.jobOrderCode}`, l.productionOrderId && `${t("stockHistory.link.productionOrder")} ${l.productionOrderId}`, l.customerName]
    .filter(Boolean).join(" · ");
  if (!job && !sub) return <span className="text-muted-foreground">—</span>;
  return (
    <span>
      <span className="font-mono">{job || "—"}</span>
      {sub && <span className="block text-muted-foreground">{sub}</span>}
    </span>
  );
}

export function StockHistoryPage({
  products, company, initialProductId, onInitialProductConsumed,
}: {
  products: Product[];
  /** หัวจดหมายของใบพิมพ์ (ปุ่ม PDF — 2026-09-24) */
  company: Company;
  /** เปิดมาจากปุ่มประวัติของสินค้าในหน้าสต๊อก — เข้าแท็บติดตามรายสินค้าของตัวนั้นเลย */
  initialProductId?: string | null;
  onInitialProductConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"all" | "trace">(initialProductId ? "trace" : "all");
  const [traceProductId, setTraceProductId] = useState<string>(initialProductId ?? "");

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

  return (
    <>
    {printJob?.kind === "list" && <TablePrintDocument sheet={printJob.sheet} companyHeader={companyHeader} docLabel="STOCK" printedAt={printDate(today)} />}
    {printJob?.kind === "card" && <StockCardPrintDocument product={printJob.product} movements={printJob.rows} companyHeader={companyHeader} printedAt={today} />}
    <div className="flex-1 overflow-y-auto p-6 space-y-5 print:hidden">
      <div>
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("stockHistory.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("stockHistory.subtitle")}</p>
      </div>
      <Tabs
        items={[{ key: "all", label: t("stockHistory.tab.all") }, { key: "trace", label: t("stockHistory.tab.trace") }]}
        active={tab}
        onChange={setTab}
        idPrefix="stock-history"
        ariaLabel={t("stockHistory.title")}
      />
      {tab === "all"
        ? <AllMovements onTrace={(pid) => { setTraceProductId(pid); setTab("trace"); }} onPrint={setPrintJob} />
        : <ItemTrace products={products} productId={traceProductId} onProductChange={setTraceProductId} onPrint={setPrintJob} />}
    </div>
    </>
  );
}

function AllMovements({ onTrace, onPrint }: { onTrace: (productId: string) => void; onPrint: (job: PrintJob) => void }) {
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
      .then((r) => { if (!cancelled) setFetched({ key: requestKey, result: r }); })
      .catch(() => { if (!cancelled) setFetched({ key: requestKey, error: true }); });
    return () => { cancelled = true; };
  }, [requestKey, debounced, kind, sourceType, from, to, page]);
  const loading = fetched?.key !== requestKey;
  const error = !loading && !!fetched?.error;
  // ระหว่างโหลดหน้าใหม่ยังโชว์ผลเดิมจาง ๆ ไว้ ไม่ให้ตารางกระพริบว่าง
  const [lastResult, setLastResult] = useState<StockHistoryResult | null>(null);
  if (fetched?.result && fetched.result !== lastResult) setLastResult(fetched.result);
  const result = lastResult;

  const summaryOf = (k: StockMovementKind) => result?.summary.find((s) => s.kind === k) ?? { kind: k, count: 0, amount: 0 };
  const total = result?.total ?? 0;
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="relative h-9 w-80">
          <span className="sr-only">{t("stockHistory.search.label")}</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("stockHistory.search.placeholder")}
            className={`${inputCls} w-full pl-9 pr-8`} />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t("stockHistory.filter.clear")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={13} /></button>
          )}
        </label>
        <DateRangeFilter value={dateRange} onChange={(v) => { setDateRange(v); setPage(0); }} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("stockHistory.filter.source")}
          <select value={sourceType} onChange={(e) => { setSourceType(e.target.value as StockMovementSourceType | ""); setPage(0); }} className={inputCls}>
            <option value="">{t("stockHistory.filter.allSources")}</option>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{t(SOURCE_LABEL_KEY[s])}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit" role="group" aria-label={t("stockHistory.col.kind")}>
          {(["", ...KINDS] as const).map((k) => (
            <button key={k || "all"} onClick={() => { setKind(k); setPage(0); }} aria-pressed={kind === k}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${kind === k ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {k === "" ? t("stockHistory.filter.allKinds") : t(STOCK_MOVEMENT_KIND_LABEL_KEY[k])}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 mr-1">{t("stockHistory.filter.clear")}</button>
          <button onClick={() => void exportRows("excel")} disabled={total === 0 || exporting !== null} className={exportBtnCls}>
            {exporting === "excel" ? <Loader2 size={13} className="animate-spin" /> : <Sheet size={13} />} {t("stock.export.excel")}
          </button>
          <button onClick={() => void exportRows("pdf")} disabled={total === 0 || exporting !== null} title={t("stock.export.pdfHint")} className={exportBtnCls}>
            {exporting === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} {t("stock.export.pdf")}
          </button>
        </div>
      </div>
      {exportError && <p className="text-xs text-[#c23f3f]" role="alert">{exportError}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("stockHistory.kpi.total"), value: fmt(total), sub: t("stockHistory.kpi.inFilter") },
          { label: t("stockHistory.kpi.receive"), value: fmt(summaryOf("receive").amount), sub: t("stockHistory.kpi.count").replace("{n}", fmt(summaryOf("receive").count)) },
          { label: t("stockHistory.kpi.deduct"), value: fmt(summaryOf("deduct").amount), sub: t("stockHistory.kpi.count").replace("{n}", fmt(summaryOf("deduct").count)) },
          { label: t("stockHistory.kpi.returnAdjust"), value: `${fmt(summaryOf("return").count)} / ${fmt(summaryOf("adjust").count)}`, sub: t("stockHistory.kpi.inFilter") },
        ].map((k) => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-xl font-bold font-mono text-foreground mt-1">{k.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <p className="text-sm text-muted-foreground">{t("stockHistory.loadError")}</p>
            <button onClick={() => setRetry((n) => n + 1)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40">{t("stockHistory.retry")}</button>
          </div>
        ) : !loading && result && result.movements.length === 0 ? (
          <EmptyState icon={History} title={t("stockHistory.title")} description={t("stockHistory.empty")} compact />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[t("stockHistory.col.dateTime"), t("stockHistory.col.product"), t("stockHistory.col.kind"), t("stockHistory.col.qty"), t("stockHistory.col.amount"), t("stockHistory.col.balance"), t("stockHistory.col.source"), t("stockHistory.col.link"), t("stockHistory.col.charge"), t("stockHistory.col.user")]
                    .map((h, i) => <th key={h} className={`${thCls} ${i >= 3 && i <= 5 ? "text-right" : ""}`}>{h}</th>)}
                </tr>
              </thead>
              <tbody className={loading ? "opacity-50" : ""}>
                {(result?.movements ?? []).map((m) => (
                  <tr key={m.id} className="border-b border-border/50 align-top hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-3 text-xs font-mono whitespace-nowrap">{formatQuoteDateThai(m.createdAt)}<span className="block text-muted-foreground">{timeOf(m.createdAt)}</span></td>
                    <td className="px-3 py-3 text-xs max-w-[220px]">
                      <button onClick={() => onTrace(m.productId)} className="text-left text-foreground font-medium hover:text-[#866d28] hover:underline">{m.productName}</button>
                      <span className="block font-mono text-muted-foreground">{m.productCode}</span>
                    </td>
                    <td className="px-3 py-3"><KindPill kind={m.kind} /></td>
                    <td className={`px-3 py-3 text-xs font-mono text-right whitespace-nowrap font-semibold ${m.delta >= 0 ? "text-[#207e52]" : "text-[#c23f3f]"}`}>{signed(m.delta)}</td>
                    <td className="px-3 py-3 text-xs font-mono text-right whitespace-nowrap">{m.amount !== undefined ? fmt(m.amount) : "—"}{m.unitCost !== undefined && <span className="block text-muted-foreground">@{fmt(m.unitCost)}</span>}</td>
                    <td className="px-3 py-3 text-xs font-mono text-right">{fmt(m.balanceAfter)}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className="block text-muted-foreground">{t(SOURCE_LABEL_KEY[m.sourceType] ?? "stockHistory.source.manual")}</span>
                      <span className="font-mono text-foreground">{m.sourceLabel || m.reason || "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-xs max-w-[220px]"><LinkCell row={m} /></td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{m.departmentName || "—"}{m.teamName && <span className="block">{m.teamName}</span>}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{m.createdByName || "—"}</td>
                  </tr>
                ))}
                {loading && !result && (
                  <tr><td colSpan={10} className="py-12 text-center text-xs text-muted-foreground" role="status">{t("stockHistory.loading")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border text-xs text-muted-foreground">
            <span>{t("stockHistory.pager").replace("{from}", fmt(page * PAGE_SIZE + 1)).replace("{to}", fmt(Math.min(total, (page + 1) * PAGE_SIZE))).replace("{total}", fmt(total))}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}
                className="px-3 py-1.5 border border-border rounded-lg hover:text-foreground hover:border-[#c9a84c]/40 disabled:opacity-40">{t("stockHistory.prev")}</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total || loading}
                className="px-3 py-1.5 border border-border rounded-lg hover:text-foreground hover:border-[#c9a84c]/40 disabled:opacity-40">{t("stockHistory.next")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
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

function ItemTrace({ products, productId, onProductChange, onPrint }: {
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

  return (
    <div className="space-y-5">
      <div className="bg-card border border-border rounded-xl p-4 flex items-end gap-4 flex-wrap">
        <label className="flex-1 min-w-[280px]">
          <span className="text-xs text-muted-foreground block mb-1">{t("stockHistory.trace.pickProduct")}</span>
          <Combobox
            value={search}
            onChange={setSearch}
            options={options}
            placeholder={t("stockHistory.trace.pickPlaceholder")}
            ariaLabel={t("stockHistory.trace.pickProduct")}
            className="w-full h-9 px-3 text-sm text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50"
            onPick={(opt) => {
              const p = products.find((x) => `${x.code} — ${x.name}` === opt.value);
              if (p) { onProductChange(p.id); setOpen(null); }
            }}
          />
        </label>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        {/* การ์ดสต๊อกของสินค้าที่เลือก ตามช่วงวันที่ที่กรอง (2026-09-24) — คอลัมน์เดียวกับใบพิมพ์การ์ดสต๊อก */}
        {product && (
          <div className="flex items-center gap-2">
            <button disabled={loading || !result} className={exportBtnCls}
              onClick={() => void downloadXlsx(exportFileName(`การ์ดสต๊อก-${product.code}`), [stockCardSheet(product, rows, from || to ? `ช่วง ${from ? printDate(from) : "…"} – ${to ? printDate(to) : "…"}` : "")])}>
              <Sheet size={13} /> {t("stock.export.cardExcel")}
            </button>
            <button disabled={loading || !result} title={t("stock.export.pdfHint")} className={exportBtnCls}
              onClick={() => onPrint({ kind: "card", product, rows })}>
              <FileText size={13} /> {t("stock.export.cardPdf")}
            </button>
          </div>
        )}
      </div>

      {!product ? (
        <EmptyState icon={History} title={t("stockHistory.tab.trace")} description={t("stockHistory.trace.pickHint")} compact />
      ) : error ? (
        <p className="text-sm text-muted-foreground text-center py-10">{t("stockHistory.loadError")}</p>
      ) : (
        <div className={`space-y-5 ${loading ? "opacity-60" : ""}`}>
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-mono text-muted-foreground">{product.code} · {unit}</p>
                <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{product.name}</h2>
              </div>
              <div className="flex gap-6 text-right">
                <div><p className="text-xs text-muted-foreground">{t("stockHistory.trace.currentStock")}</p><p className="text-xl font-bold font-mono">{fmt(product.stockQty)} <span className="text-xs font-normal text-muted-foreground">{unit}</span></p></div>
                <div><p className="text-xs text-muted-foreground">{t("stockHistory.trace.avgCost")}</p><p className="text-xl font-bold font-mono">{fmt(product.avgCost ?? 0)}</p></div>
                <div><p className="text-xs text-muted-foreground">{t("stockHistory.trace.value")}</p><p className="text-xl font-bold font-mono">{fmt(stockValueOf(product))}</p></div>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("stockHistory.trace.none")}</p>
            ) : (
              <div className="flex items-stretch gap-2 flex-wrap text-xs">
                {[
                  { label: t("stockHistory.trace.opening"), value: fmt(analysis.opening), cls: "bg-muted text-foreground border-transparent", op: "+" },
                  { label: `${t("stock.movementKind.receive")} · ${t("stockHistory.trace.times").replace("{n}", String(analysis.receiveTimes))}`, value: fmt(analysis.receive), cls: KIND_PILL.receive, op: "+" },
                  { label: `${t("stock.movementKind.return")} · ${t("stockHistory.trace.times").replace("{n}", String(analysis.returnTimes))}`, value: fmt(analysis.ret), cls: KIND_PILL.return, op: "−" },
                  { label: `${t("stock.movementKind.deduct")} · ${t("stockHistory.trace.times").replace("{n}", String(analysis.deductTimes))}`, value: fmt(analysis.deduct), cls: KIND_PILL.deduct, op: "±" },
                  { label: `${t("stock.movementKind.adjust")} · ${t("stockHistory.trace.times").replace("{n}", String(analysis.adjustTimes))}`, value: signed(analysis.adjust), cls: KIND_PILL.adjust, op: "=" },
                  { label: t("stockHistory.trace.closing"), value: fmt(analysis.closing), cls: "bg-[#0b1d3a] text-white border-transparent", op: "" },
                ].map((b) => (
                  <div key={b.label} className="flex items-center gap-2 flex-1 min-w-[120px]">
                    <div className={`flex-1 rounded-lg border px-3 py-2 ${b.cls}`}>
                      <p className="opacity-80">{b.label}</p>
                      <p className="text-base font-semibold font-mono">{b.value}</p>
                    </div>
                    {b.op && <span className="font-mono text-muted-foreground text-base" aria-hidden="true">{b.op}</span>}
                  </div>
                ))}
              </div>
            )}
            {result && result.total > rows.length && (
              <p className="text-xs text-[#a75d1a]">{t("stockHistory.trace.truncated").replace("{n}", fmt(rows.length))}</p>
            )}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("stockHistory.trace.jobsTitle")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t("stockHistory.trace.jobsSummary").replace("{qty}", `${fmt(analysis.deduct - analysis.ret)} ${unit}`).replace("{n}", String(analysis.jobs.length))}</p>
              </div>
              {analysis.jobs.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">{t("stockHistory.trace.emptyGroup")}</p>
              ) : analysis.jobs.map((g) => {
                const net = g.out - g.returned;
                const isOpen = open === g.key;
                const docs = new Set(g.rows.map((r) => r.sourceLabel || r.id)).size;
                return (
                  <div key={g.key} className="border-b border-border/50 last:border-0">
                    <button onClick={() => setOpen(isOpen ? null : g.key)} aria-expanded={isOpen}
                      className={`w-full text-left px-5 py-3 grid grid-cols-[16px_1fr_120px_90px_100px] gap-3 items-center transition-colors ${isOpen ? "bg-[#c9a84c]/5" : "hover:bg-secondary/30"}`}>
                      {isOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-mono font-semibold text-foreground truncate">{g.title}</span>
                        <span className="block text-xs text-muted-foreground truncate">{[g.sub, t("stockHistory.trace.docsCount").replace("{n}", String(docs))].filter(Boolean).join(" · ")}</span>
                      </span>
                      <span className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true"><span className="block h-2 rounded-full bg-[#e08a3c]" style={{ width: `${Math.max(4, (net / maxNet) * 100)}%` }} /></span>
                      <span className="text-sm font-mono font-semibold text-right">{fmt(net)} <span className="text-xs font-normal text-muted-foreground">{unit}</span></span>
                      <span className="text-xs font-mono text-right text-muted-foreground">{fmt(g.value)}</span>
                    </button>
                    {isOpen && (
                      <ul className="px-5 pb-3 pl-12 space-y-1.5">
                        {g.rows.map((r) => (
                          <li key={r.id} className="grid grid-cols-[90px_1fr_130px_60px] gap-3 items-center text-xs bg-secondary/40 rounded-lg px-3 py-2">
                            <span className="font-mono text-muted-foreground">{formatQuoteDateThai(r.createdAt)}</span>
                            <span className="font-mono text-foreground truncate">{r.sourceLabel || "—"} <span className="font-sans text-muted-foreground">{t(STOCK_MOVEMENT_KIND_LABEL_KEY[r.kind])}</span></span>
                            <span className="text-muted-foreground truncate">{[r.departmentName, r.teamName].filter(Boolean).join(" / ") || "—"}</span>
                            <span className={`font-mono font-semibold text-right ${r.delta >= 0 ? "text-[#207e52]" : "text-[#c23f3f]"}`}>{signed(r.delta)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("stockHistory.trace.receiptsTitle")}</h3>
              </div>
              {analysis.receipts.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">{t("stockHistory.trace.emptyGroup")}</p>
              ) : analysis.receipts.map((r) => (
                <div key={r.id} className="px-5 py-3 border-b border-border/50 last:border-0 grid grid-cols-[1fr_70px_100px] gap-3 items-center">
                  <div className="min-w-0 text-xs">
                    <p className="text-muted-foreground">{formatQuoteDateThai(r.createdAt)}{r.link.vendorName ? ` · ${r.link.vendorName}` : ""}</p>
                    <p className="text-foreground"><span className="font-mono font-medium">{r.sourceLabel || t(SOURCE_LABEL_KEY[r.sourceType])}</span>{r.link.purchaseOrderNumber && <span className="text-muted-foreground"> · <span className="font-mono">{r.link.purchaseOrderNumber}</span></span>}</p>
                  </div>
                  <span className="text-sm font-mono font-semibold text-right text-[#207e52]">{signed(r.delta)}</span>
                  <span className="text-xs font-mono text-right">{r.amount !== undefined ? fmt(r.amount) : "—"}{r.unitCost !== undefined && <span className="block text-muted-foreground">@{fmt(r.unitCost)}</span>}</span>
                </div>
              ))}
              <div className="px-5 py-2.5 bg-muted/40 text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground border-t border-border">{t("stockHistory.trace.otherTitle")}</div>
              {analysis.others.length === 0 ? (
                <p className="px-5 py-4 text-xs text-muted-foreground">{t("stockHistory.trace.emptyGroup")}</p>
              ) : analysis.others.map((r) => (
                <div key={r.id} className="px-5 py-3 border-b border-border/50 last:border-0 grid grid-cols-[1fr_70px_100px] gap-3 items-center text-xs">
                  <div className="min-w-0">
                    <p className="text-muted-foreground">{formatQuoteDateThai(r.createdAt)}{r.createdByName ? ` · ${r.createdByName}` : ""}</p>
                    <p className="text-foreground truncate">{r.reason || r.sourceLabel || "—"}</p>
                  </div>
                  <span className={`text-sm font-mono font-semibold text-right ${r.delta >= 0 ? "text-[#207e52]" : "text-[#c23f3f]"}`}>{signed(r.delta)}</span>
                  <span className="font-mono text-right">{r.amount !== undefined ? fmt(r.amount) : "—"}</span>
                </div>
              ))}
            </section>
          </div>

          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("stockHistory.trace.ledgerTitle")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[t("stockHistory.col.dateTime"), t("stockHistory.col.kind"), t("stockHistory.col.source"), t("stockHistory.col.link"), t("stockHistory.trace.in"), t("stockHistory.trace.out"), t("stockHistory.col.balance")]
                      .map((h, i) => <th key={h} className={`${thCls} ${i >= 4 ? "text-right" : ""}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 && (
                    <tr className="bg-secondary/40 text-xs">
                      <td className="px-3 py-2.5 font-mono">{formatQuoteDateThai(rows[0].createdAt)}</td>
                      <td colSpan={5} className="px-3 py-2.5 text-muted-foreground">{t("stockHistory.trace.opening")}</td>
                      <td className="px-3 py-2.5 font-mono text-right font-semibold">{fmt(analysis.opening)}</td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 text-xs">
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">{formatQuoteDateThai(r.createdAt)}</td>
                      <td className="px-3 py-2.5"><KindPill kind={r.kind} /></td>
                      <td className="px-3 py-2.5 font-mono">{r.sourceLabel || r.reason || "—"}</td>
                      <td className="px-3 py-2.5"><LinkCell row={r} /></td>
                      <td className="px-3 py-2.5 font-mono text-right text-[#207e52]">{r.delta > 0 ? fmt(r.delta) : ""}</td>
                      <td className="px-3 py-2.5 font-mono text-right text-[#c23f3f]">{r.delta < 0 ? fmt(-r.delta) : ""}</td>
                      <td className="px-3 py-2.5 font-mono text-right font-semibold">{fmt(r.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
