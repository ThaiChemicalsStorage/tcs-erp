import { useEffect, useMemo, useState } from "react";
import { Receipt, Search, X, Printer, Ban, FileText, Settings2, Boxes, Plus } from "lucide-react";
import {
  fetchArDocuments, fetchArDocument, cancelArDocument, issueArReceipt,
  DOC_TYPE_LABEL_KEY, receiptByInvoiceId as buildReceiptByInvoiceId, paidByInvoiceId as buildPaidByInvoiceId,
  type ArDocument, type ArDocumentType,
} from "../../lib/accounting";
import { fetchAllScopeOfWorks } from "../../lib/scopeOfWork";
import { formatQuoteDateThai } from "../../lib/quotes";
import { EmptyState } from "../../components/EmptyState";
import { PromptDialog } from "../../components/PromptDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { ArDocumentPrintDocument, type ArPaidByInvoiceId } from "./ArDocumentPrintDocument";
import { ArDocumentNcrPrintDocument, NcrCalibrationTestPage } from "./ArDocumentNcrPrintDocument";
import { loadNcrSettings, saveNcrSettings, DEFAULT_NCR_SETTINGS, type NcrPrintSettings } from "../../lib/ncrPrintSettings";
import { ArStockPanel } from "./ArStockPanel";
import { ManualTaxInvoiceDialog } from "./ManualTaxInvoiceDialog";
import { useI18n } from "../../lib/i18n";

// หน้ารายการเอกสารบัญชีแยกตามประเภท — "1 ใบคือ 1 หน้า" ตามที่เจ้าของสั่ง (2026-08-18) ให้แต่ละ
// ประเภทเอกสาร (ใบรับเงินมัดจำ/ใบกำกับภาษี, ใบแจ้งหนี้/ใบวางบิล, ใบเสร็จรับเงิน, ใบกำกับภาษี/ใบส่งสินค้า)
// เป็นหน้ารายการของตัวเองแบบเดียวกับโมดูลฝ่ายขาย — ใช้ component เดียวกันทั้ง 4 หน้า ต่างกันที่ docType
// Per-document-type accounting list page — one shared component parameterized by docType,
// matching the Sales modules' standalone-list pattern per the owner's 2026-08-18 instruction.
export function ArDocumentListPage({
  docType, canIssue, canCancel, canCreate, canViewStock, canAdjustStock,
}: {
  docType: ArDocumentType;
  canIssue: boolean;
  canCancel: boolean;
  /** Gates the "+ สร้างใบกำกับภาษี (Manual)" button (added 2026-08-18) — only rendered on the AR/IV
   * pages, see `isManualCreatable` below. */
  canCreate: boolean;
  canViewStock: boolean;
  canAdjustStock: boolean;
}) {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<ArDocument[]>([]);
  const [receipts, setReceipts] = useState<ArDocument[]>([]);
  const [scopeNumbers, setScopeNumbers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "issued" | "cancelled">("all");
  const [printDoc, setPrintDoc] = useState<ArDocument | null>(null);
  // พิมพ์ลงฟอร์ม NCR (เฉพาะข้อมูล ลงกระดาษเคมีที่มีกรอบพิมพ์มาแล้ว) — แยก state จากพิมพ์กระดาษเปล่า
  const [ncrPrintDoc, setNcrPrintDoc] = useState<ArDocument | null>(null);
  const [ncrTestPrinting, setNcrTestPrinting] = useState(false);
  const [ncrSettingsOpen, setNcrSettingsOpen] = useState(false);
  const [ncrSettings, setNcrSettings] = useState<NcrPrintSettings>(loadNcrSettings);
  const [cancelTarget, setCancelTarget] = useState<ArDocument | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<ArDocument | null>(null);
  const [detailDoc, setDetailDoc] = useState<ArDocument | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [receiptPickerOpen, setReceiptPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const isTaxInvoicePage = docType === "AR" || docType === "IV";
  // ตัดสต๊อกได้เฉพาะ IV — มีแต่ประเภทนี้ที่บรรทัดเป็นรายการสินค้า/บริการจริงจาก Quotation
  // (AR เป็นได้แค่บรรทัดเงินมัดจำ, BI/RE อ้างอิงยอดรวม ไม่ใช่บรรทัดสินค้า) ดู buildDocumentLines()
  const isStockPage = docType === "IV";
  // AR/IV pages show receipt-linkage per row; the BI page needs receipts too, to compute each
  // billing note's ชำระแล้ว/เงินคงค้าง print columns (added 2026-08-18, real BI reference form).
  const needsReceipts = isTaxInvoicePage || docType === "BI";

  const fetchAll = () => Promise.all([
    fetchArDocuments({ docType }),
    needsReceipts ? fetchArDocuments({ docType: "RE" }) : Promise.resolve([]),
    // ใช้เทียบเลขที่งาน (Scope of Work) — ถ้าผู้ใช้ไม่มีสิทธิ์ดู Scope of Work ให้แสดง "—" แทน ไม่ถือว่าโหลดพัง
    fetchAllScopeOfWorks().catch(() => []),
  ] as const);

  const applyResults = ([docs, res, scopes]: Awaited<ReturnType<typeof fetchAll>>) => {
    setDocuments(docs);
    setReceipts(res);
    setScopeNumbers(Object.fromEntries(scopes.map((s) => [s.id, s.scopeNumber])));
    setLoading(false);
  };

  // ใช้หลังกดปุ่ม (retry/ยกเลิก/ออกใบเสร็จ) — ไม่ส่งเข้า useEffect ตรงๆ เพราะเรียก setLoading(true)
  // แบบ synchronous; mount effect ด้านล่าง fetch แบบ inline แทน (loading เริ่มเป็น true อยู่แล้ว)
  // — pattern เดียวกับ loadList()/mount-effect split ของ DeliveryOrderPage
  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetchAll().then(applyResults).catch(() => { setLoadError(true); setLoading(false); });
  };

  // เปลี่ยนประเภทเอกสารแล้ว component ถูก remount ผ่าน key={docType} ใน App.tsx — effect นี้จึงทำงานครั้งเดียวต่อหน้า
  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((results) => { if (!cancelled) applyResults(results); })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!printDoc) return;
    const reset = () => setPrintDoc(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [printDoc]);

  useEffect(() => {
    if (!ncrPrintDoc) return;
    const reset = () => setNcrPrintDoc(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [ncrPrintDoc]);

  useEffect(() => {
    if (!ncrTestPrinting) return;
    const reset = () => setNcrTestPrinting(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [ncrTestPrinting]);

  // ใบเสร็จที่ยังไม่ถูกยกเลิก จับคู่กับใบกำกับภาษีต้นทางผ่าน linkedArDocumentId (ดู lib/accounting.ts)
  const receiptByInvoiceId = useMemo(() => buildReceiptByInvoiceId(receipts), [receipts]);

  // ยอดชำระแล้วต่อใบกำกับภาษี — สำหรับพิมพ์ใบแจ้งหนี้/ใบวางบิล (คอลัมน์ชำระแล้ว/เงินคงค้าง)
  const paidByInvoiceId: ArPaidByInvoiceId = useMemo(() => buildPaidByInvoiceId(receipts), [receipts]);

  // เฉพาะหน้า RE เอง — `documents` ที่โหลดไว้แล้วคือรายการใบเสร็จทั้งหมด ใช้หาว่าใบกำกับภาษีไหน (id)
  // มีใบเสร็จ (ยังใช้งาน) แล้วบ้าง เพื่อกรองออกจาก ReceiptSourcePickerDialog — ไม่ต้อง fetch ซ้ำ
  const invoiceIdsWithReceipt = useMemo(() => {
    if (docType !== "RE") return new Set<string>();
    const ids = new Set<string>();
    for (const d of documents) {
      if (d.status !== "issued") continue;
      for (const line of d.lines) if (line.linkedArDocumentId) ids.add(line.linkedArDocumentId);
    }
    return ids;
  }, [documents, docType]);

  const normalizedSearch = search.trim().toLowerCase();
  // ทุกตัวกรอง "ยกเว้น" สถานะ — การ์ดสรุปด้านล่างนับจากชุดนี้ ไม่ใช่ documents ดิบ เพราะการ์ดสามใบ
  // สะท้อนแท็บสถานะแบบ 1:1 ถ้านับจาก documents ดิบ ตัวเลขบนการ์ดจะขัดกับแถวที่เห็นในตารางทันทีที่
  // ผู้ใช้กรองเดือน/ค้นหา (ดู "Filter Honesty" ใน docs/UI_GUIDELINES.md)
  const scoped = documents
    .filter((d) => !monthFilter || d.docDate.startsWith(monthFilter))
    .filter((d) => !normalizedSearch
      || d.docNo.toLowerCase().includes(normalizedSearch)
      || d.customerSnapshot.companyName.toLowerCase().includes(normalizedSearch)
      || (scopeNumbers[d.scopeOfWorkId] ?? "").toLowerCase().includes(normalizedSearch)
      || d.reference.toLowerCase().includes(normalizedSearch));
  const filtered = scoped.filter((d) => statusFilter === "all" || d.status === statusFilter);

  const handlePrint = async (id: string) => {
    try {
      setPrintDoc(await fetchArDocument(id));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("accounting.list.toast.openFailed"));
    }
  };

  const handleOpenStock = async (id: string) => {
    try {
      setDetailDoc(await fetchArDocument(id));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("accounting.list.toast.openFailed"));
    }
  };

  const handleNcrPrint = async (id: string) => {
    try {
      setNcrPrintDoc(await fetchArDocument(id));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("accounting.list.toast.openFailed"));
    }
  };

  const handleCancel = async (reason: string) => {
    if (!cancelTarget || busy) return;
    setBusy(true);
    try {
      await cancelArDocument(cancelTarget.id, reason);
      toast.show(`${t("accounting.list.toast.cancelledPrefix")} ${cancelTarget.docNo} ${t("accounting.list.suffixDone")}`);
      setCancelTarget(null);
      load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("accounting.list.toast.cancelFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleIssueReceipt = async () => {
    if (!receiptTarget || busy) return;
    setBusy(true);
    try {
      const re = await issueArReceipt(receiptTarget.id);
      toast.show(`${t("accounting.list.toast.receiptIssuedPrefix")} ${re.docNo} ${t("accounting.list.suffixDone")}`);
      setReceiptTarget(null);
      load();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("accounting.list.toast.receiptFailed"));
    } finally {
      setBusy(false);
    }
  };

  const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

  return (
    <>
    {/* ส่วนแสดงผลบนหน้าจอทั้งหมดต้องซ่อนตอนพิมพ์ — เอกสารพิมพ์ (ArDocumentPrintDocument ด้านล่าง)
        ต้องเป็นสิ่งเดียวที่ออกกระดาษ (pattern เดียวกับ DeliveryOrderDocument's print:hidden blocks).
        ArStockPanel เป็นอีก view หนึ่งของหน้าเดียวกัน (ไม่ early-return ทิ้ง fragment) เพื่อให้ปุ่มพิมพ์ใน
        panel นั้นยังเรียก printDoc/ncrPrintDoc state เดียวกับด้านล่างได้ — พิมพ์ได้ทันทีหลังตัดสต๊อกเสร็จ
        โดยไม่ต้องย้อนกลับไปหน้ารายการก่อน (ตามคำขอ "พอเสร็จก็สามารถเลือกได้ว่าจะกดปริ้นอันไหน") */}
    {detailDoc ? (
      <ArStockPanel
        doc={detailDoc}
        canAdjust={canAdjustStock}
        onBack={() => setDetailDoc(null)}
        onDocumentUpdated={(updated) => {
          setDetailDoc(updated);
          setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        }}
        onPrint={() => void handlePrint(detailDoc.id)}
        onNcrPrint={() => void handleNcrPrint(detailDoc.id)}
      />
    ) : (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 print:hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t(DOC_TYPE_LABEL_KEY[docType])}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">
            {t("accounting.list.subtitle.before")} {docType} {t("accounting.list.subtitle.after")}
            {isTaxInvoicePage && canCreate && canIssue ? ` ${t("accounting.list.subtitle.orManual")}` : ""}
            {docType === "RE" && canIssue ? ` ${t("accounting.list.subtitle.orReceiptHere")}` : ""}
          </p>
        </div>
        {isTaxInvoicePage && canCreate && canIssue && (
          <button
            onClick={() => setManualDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
          >
            <Plus size={15} /> {t("accounting.list.btn.createManual")}
          </button>
        )}
        {docType === "RE" && canIssue && (
          <button
            onClick={() => setReceiptPickerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
          >
            <Plus size={15} /> {t("accounting.list.btn.createReceipt")}
          </button>
        )}
      </div>

      {/* การ์ดสรุปสถานะ 3 ใบ ตรงกับแท็บกรองสถานะด้านล่างแบบ 1:1 เสมอ (ทั้งหมด/ใช้งาน/ยกเลิกแล้ว) — สีเดียวกับ
          badge สถานะในตาราง (เขียว = ใช้งาน, แดง = ยกเลิกแล้ว) เพื่อให้เห็นความหมายตรงกันทั้งหน้า ปรับ
          layout ให้ตรงกับหน้าใบส่งมอบสินค้า (Delivery Order) ตามคำขอ 2026-08-18 — ยอดรวมเดือนนี้ (บาท) ที่
          เคยอยู่ตรงนี้ยังคงอยู่ในสรุปเอกสารประจำเดือน (ArMonthlyReportPage) ไม่ได้หายไปจากระบบ
          Status-summary cards mirror the filter tabs below 1:1 (ทั้งหมด/ใช้งาน/ยกเลิกแล้ว), same color
          language as the table's own status badges — matches Delivery Order's card layout per direct
          request. The this-month money total previously shown here still lives on the monthly report page. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: t("accounting.list.status.all"), value: String(scoped.length), color: "#5a7299", bg: "from-[#5a7299]/15 to-[#5a7299]/5" },
          { label: t("accounting.list.status.issued"), value: String(scoped.filter((d) => d.status === "issued").length), color: "#2aa36b", bg: "from-[#2aa36b]/15 to-[#2aa36b]/5" },
          { label: t("accounting.list.status.cancelled"), value: String(scoped.filter((d) => d.status === "cancelled").length), color: "#e05252", bg: "from-[#e05252]/15 to-[#e05252]/5" },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 hover:border-[#c9a84c]/30 transition-all">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.bg} flex items-center justify-center mb-3`}>
              <Receipt size={15} style={{ color: s.color }} />
            </div>
            <p className="text-xl font-bold text-foreground font-mono">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative h-9 w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("accounting.list.search.placeholder")}
              className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={13} />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("accounting.list.filter.month")}
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            {monthFilter && (
              <button onClick={() => setMonthFilter("")} className="text-muted-foreground hover:text-foreground" title={t("accounting.list.filter.clearMonth")}>
                <X size={13} />
              </button>
            )}
          </label>
          <button
            onClick={() => setNcrSettingsOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all ml-auto"
            title={t("accounting.list.ncr.settingsTitle")}
          >
            <Settings2 size={13} /> {t("accounting.list.ncr.settingsBtn")}
          </button>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {([["all", t("accounting.list.status.all")], ["issued", t("accounting.list.status.issued")], ["cancelled", t("accounting.list.status.cancelled")]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${statusFilter === key ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">{t("accounting.list.error.loadFailed")}</p>
            <button onClick={load} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">{t("accounting.list.error.retry")}</button>
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={`${t("accounting.list.empty.titlePrefix")}${t(DOC_TYPE_LABEL_KEY[docType])}`}
            description={docType === "RE"
              ? t("accounting.list.empty.descRE")
              : t("accounting.list.empty.descOther")}
            compact
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <FileText size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("accounting.list.noMatch")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[t("accounting.list.col.docNo"), t("accounting.list.col.date"), t("accounting.list.col.customer"), t("accounting.list.col.scopeNumber"), docType === "RE" ? t("accounting.list.col.refInvoice") : t("accounting.list.col.receipt"), t("accounting.list.col.netTotal"), t("accounting.list.col.status"), ""].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const receipt = isTaxInvoicePage ? receiptByInvoiceId[d.id] : undefined;
                  return (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">
                        {d.docNo}
                        {d.isManual && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-sans font-medium bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20 align-middle" title={t("accounting.list.badge.manualTitle")}>
                            {t("accounting.list.badge.manual")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(d.docDate)}</td>
                      <td className="px-4 py-3.5 text-sm text-foreground font-medium max-w-[240px] truncate" title={d.customerSnapshot.companyName}>{d.customerSnapshot.companyName}</td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{scopeNumbers[d.scopeOfWorkId] ?? "—"}</td>
                      <td className="px-4 py-3.5 text-xs font-mono whitespace-nowrap">
                        {docType === "RE"
                          ? <span className="text-muted-foreground">{d.reference || "—"}</span>
                          : isTaxInvoicePage
                          ? (receipt
                            ? <span className="text-[#207e52]">{receipt.docNo}</span>
                            : <span className="text-muted-foreground">{t("accounting.list.receiptNotIssued")}</span>)
                          : <span className="text-muted-foreground">{d.reference || "—"}</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-foreground font-mono whitespace-nowrap">{money(d.netTotal)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${d.status === "issued" ? "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20" : "bg-[#e05252]/10 text-[#c23f3f] border border-[#e05252]/20"}`}>
                          {d.status === "issued" ? t("accounting.list.status.issued") : t("accounting.list.status.cancelled")}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {isTaxInvoicePage && canIssue && d.status === "issued" && !receipt && (
                            <button
                              onClick={() => setReceiptTarget(d)}
                              className="px-2 py-1 text-xs border border-[#c9a84c]/40 text-[#a5813a] rounded-lg hover:bg-[#c9a84c]/10 transition-colors"
                            >
                              {t("accounting.list.action.issueReceipt")}
                            </button>
                          )}
                          {isStockPage && canViewStock && (
                            <button onClick={() => void handleOpenStock(d.id)} className="text-muted-foreground hover:text-foreground transition-colors" title={t("accounting.list.action.viewStockTitle")}>
                              <Boxes size={14} />
                            </button>
                          )}
                          <button onClick={() => void handlePrint(d.id)} className="text-muted-foreground hover:text-foreground transition-colors" title={t("accounting.list.action.printTitle")}>
                            <Printer size={14} />
                          </button>
                          <button
                            onClick={() => void handleNcrPrint(d.id)}
                            className="px-1.5 py-0.5 text-xs font-mono border border-border rounded text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
                            title={t("accounting.list.action.ncrPrintTitle")}
                          >
                            NCR
                          </button>
                          {canCancel && d.status === "issued" && (
                            <button onClick={() => setCancelTarget(d)} className="text-muted-foreground hover:text-[#e05252] transition-colors" title={t("accounting.list.action.cancelTitle")}>
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PromptDialog
        open={cancelTarget !== null}
        title={`${t("accounting.list.action.cancelTitle")} ${cancelTarget?.docNo ?? ""}`}
        message={t("accounting.list.cancelDialog.message")}
        label={t("accounting.list.cancelDialog.label")}
        confirmLabel={busy ? t("accounting.list.cancelDialog.busy") : t("accounting.list.action.cancelTitle")}
        requiredMessage={t("accounting.list.cancelDialog.required")}
        busy={busy}
        onConfirm={(reason) => void handleCancel(reason)}
        onCancel={() => setCancelTarget(null)}
      />
      <ConfirmDialog
        open={receiptTarget !== null}
        title={t("accounting.list.receiptDialog.title")}
        message={`${t("accounting.list.receiptDialog.messageBefore")} ${receiptTarget?.docNo ?? ""} ${t("accounting.list.receiptDialog.messageMid")} ${receiptTarget ? money(receiptTarget.netTotal) : ""} ${t("accounting.list.receiptDialog.messageAfter")}`}
        confirmLabel={busy ? t("accounting.list.receiptDialog.busy") : t("accounting.list.receiptDialog.confirm")}
        busy={busy}
        onConfirm={() => void handleIssueReceipt()}
        onCancel={() => setReceiptTarget(null)}
      />
      {ncrSettingsOpen && (
        <NcrSettingsDialog
          settings={ncrSettings}
          onSave={(next) => { saveNcrSettings(next); setNcrSettings(next); setNcrSettingsOpen(false); toast.show(t("accounting.list.ncr.savedToast")); }}
          onTestPrint={(next) => { saveNcrSettings(next); setNcrSettings(next); setNcrSettingsOpen(false); setNcrTestPrinting(true); }}
          onClose={() => setNcrSettingsOpen(false)}
        />
      )}
      {manualDialogOpen && (
        <ManualTaxInvoiceDialog
          docType={docType === "IV" ? "IV" : "AR"}
          onClose={() => setManualDialogOpen(false)}
          onIssued={(issued) => {
            setManualDialogOpen(false);
            toast.show(`${t("accounting.list.toast.issuedPrefix")} ${issued.map((d) => d.docNo).join(` ${t("accounting.list.and")} `)} ${t("accounting.list.suffixDone")}`);
            load();
          }}
        />
      )}
      {receiptPickerOpen && (
        <ReceiptSourcePickerDialog
          excludeIds={invoiceIdsWithReceipt}
          onClose={() => setReceiptPickerOpen(false)}
          onSelect={(doc) => { setReceiptTarget(doc); setReceiptPickerOpen(false); }}
        />
      )}
      <Toast message={toast.message} />
    </div>
    )}
    {printDoc && <ArDocumentPrintDocument document={printDoc} paidByInvoiceId={paidByInvoiceId} />}
    {ncrPrintDoc && <ArDocumentNcrPrintDocument document={ncrPrintDoc} settings={ncrSettings} paidByInvoiceId={paidByInvoiceId} />}
    {ncrTestPrinting && <NcrCalibrationTestPage settings={ncrSettings} variant={docType === "BI" ? "billingNote" : "standard"} />}
    </>
  );
}

// กล่องตั้งค่าตำแหน่งพิมพ์ลงฟอร์ม NCR — ค่าเก็บใน localStorage ต่อเครื่อง (การเยื้องเป็นเรื่องของ
// เครื่องพิมพ์/เครื่องคอมแต่ละตัว ไม่ใช่ข้อมูลธุรกิจ) ใช้ร่วมกันทุกประเภทเอกสารเพราะฟอร์มจริงเป็นผังเดียวกัน
function NcrSettingsDialog({ settings, onSave, onTestPrint, onClose }: {
  settings: NcrPrintSettings;
  onSave: (next: NcrPrintSettings) => void;
  onTestPrint: (next: NcrPrintSettings) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<NcrPrintSettings>(settings);
  // ขนาดกระดาษต้องมากกว่า 0 เสมอ — Number("") คือ 0 ซึ่งผ่าน Number.isFinite() ทำให้ล้างช่องแล้วได้
  // 0 แล้วไปโผล่เป็น `@page { size: 0mm 0mm }` ตอนสั่งพิมพ์ (loadNcrSettings() กันค่านี้ตอนอ่านจาก
  // localStorage อยู่แล้ว แต่ state ในหน้านี้ถูกใช้พิมพ์ตรง ๆ จึงต้องกันซ้ำที่นี่ด้วย)
  const num = (v: string, fallback: number, positiveOnly: boolean) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return positiveOnly && n <= 0 ? fallback : n;
  };
  const field = (label: string, key: keyof NcrPrintSettings) => (
    <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      {label}
      <input
        type="number"
        step="0.5"
        value={draft[key]}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: num(e.target.value, d[key], key === "pageWidthMm" || key === "pageHeightMm") }))}
        className="w-24 h-8 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors font-mono text-right"
      />
    </label>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("accounting.list.ncr.settingsBtn")}</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t("accounting.list.ncr.description")}
        </p>
        {field(t("accounting.list.ncr.field.pageWidth"), "pageWidthMm")}
        {field(t("accounting.list.ncr.field.pageHeight"), "pageHeightMm")}
        {field(t("accounting.list.ncr.field.offsetX"), "offsetXMm")}
        {field(t("accounting.list.ncr.field.offsetY"), "offsetYMm")}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() => setDraft({ ...DEFAULT_NCR_SETTINGS })}
            className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("accounting.list.ncr.reset")}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTestPrint(draft)}
              className="px-3 py-1.5 text-xs border border-[#c9a84c]/40 text-[#a5813a] rounded-lg hover:bg-[#c9a84c]/10 transition-colors"
            >
              {t("accounting.list.ncr.testPrint")}
            </button>
            <button
              onClick={() => onSave(draft)}
              className="px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
            >
              {t("accounting.list.ncr.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Dialog เปิดจากปุ่ม "+ ออกใบเสร็จ" บนหน้า RE เอง — ให้เลือกใบกำกับภาษี (AR/IV) ที่ออกแล้วและยังไม่มี
// ใบเสร็จมาออกได้ตรงนี้เลย (เดิมต้องไปกดปุ่ม "ออกใบเสร็จ" ที่แถวเอกสารในหน้า AR/IV เท่านั้น) — เหมือน
// action "Register Payment" ของ Odoo ที่อยู่บนตัวเอกสารต้นทาง เพียงแต่เพิ่มทางเข้าอีกทางจากหน้า RE เอง
function ReceiptSourcePickerDialog({ excludeIds, onClose, onSelect }: {
  excludeIds: Set<string>;
  onClose: () => void;
  onSelect: (doc: ArDocument) => void;
}) {
  const { t } = useI18n();
  const [invoices, setInvoices] = useState<ArDocument[]>([]);
  const [scopeNumbers, setScopeNumbers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchArDocuments({ docType: "AR", status: "issued" }),
      fetchArDocuments({ docType: "IV", status: "issued" }),
      fetchAllScopeOfWorks().catch(() => []),
    ])
      .then(([ar, iv, scopes]) => {
        if (cancelled) return;
        setInvoices([...ar, ...iv]);
        setScopeNumbers(Object.fromEntries(scopes.map((s) => [s.id, s.scopeNumber])));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = invoices
    .filter((d) => !excludeIds.has(d.id))
    .filter((d) => !normalizedSearch
      || d.docNo.toLowerCase().includes(normalizedSearch)
      || d.customerSnapshot.companyName.toLowerCase().includes(normalizedSearch)
      || (scopeNumbers[d.scopeOfWorkId] ?? "").toLowerCase().includes(normalizedSearch));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col p-5 gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t("accounting.list.receiptPicker.title")}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" title={t("accounting.manual.close")}>
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("accounting.list.receiptPicker.description")}</p>

        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 flex-shrink-0">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("accounting.list.search.placeholder")}
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : loadError ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("accounting.list.error.loadFailed")}</p>
          ) : filtered.length === 0 ? (
            <EmptyState icon={FileText} title={t("accounting.list.receiptPicker.empty.title")} description={t("accounting.list.receiptPicker.empty.description")} compact />
          ) : (
            <div className="space-y-1.5">
              {filtered.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onSelect(d)}
                  className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-border/60 hover:bg-secondary/40 hover:border-[#c9a84c]/40 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-medium text-foreground truncate">
                      {d.docNo} <span className="text-muted-foreground font-sans">· {t(DOC_TYPE_LABEL_KEY[d.docType])}</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {d.customerSnapshot.companyName} · {scopeNumbers[d.scopeOfWorkId] ?? "—"}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-foreground flex-shrink-0">฿{d.netTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
