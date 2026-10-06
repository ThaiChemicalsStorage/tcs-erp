import { useEffect, useMemo, useState } from "react";
import { Printer, Ban, FileText, Settings2, Boxes, Plus, Receipt, RotateCcw } from "lucide-react";
import {
  fetchArDocuments, fetchArDocument, cancelArDocument, issueArReceipt,
  DOC_TYPE_LABEL_KEY, receiptByInvoiceId as buildReceiptByInvoiceId, paidByInvoiceId as buildPaidByInvoiceId,
  type ArDocument, type ArDocumentType,
} from "../../lib/accounting";
import { fetchAllScopeOfWorks } from "../../lib/scopeOfWork";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { ArDocumentPrintDocument, type ArPaidByInvoiceId } from "./ArDocumentPrintDocument";
import { ArDocumentNcrPrintDocument, NcrCalibrationTestPage, prepareNcrFonts } from "./ArDocumentNcrPrintDocument";
import { loadNcrSettings, saveNcrSettings, DEFAULT_NCR_SETTINGS, type NcrPrintSettings } from "../../lib/ncrPrintSettings";
import { ArStockPanel } from "./ArStockPanel";
import { ManualTaxInvoicePage } from "./ManualTaxInvoicePage";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, FilterSelect, ListEmpty } from "../../components/ui/ListPage";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { AccountingDialog, DocStatusPill, PAGE_CLASS, PickerRow, RowIconButton, RowMoreMenu, RowPickerDialog, SummaryBox } from "./accountingUi";
import { money, monthsPresent } from "./accountingFormat";
import { formatDisplayDate, formatDisplayMonth } from "../../lib/displayDate";

type StatusTab = "all" | "issued" | "cancelled";

// หน้ารายการเอกสารบัญชีแยกตามประเภท — "1 ใบคือ 1 หน้า" ตามที่เจ้าของสั่ง (2026-08-18) ให้แต่ละ
// ประเภทเอกสาร (ใบรับเงินมัดจำ/ใบกำกับภาษี, ใบแจ้งหนี้/ใบวางบิล, ใบเสร็จรับเงิน, ใบกำกับภาษี/ใบส่งสินค้า)
// เป็นหน้ารายการของตัวเองแบบเดียวกับโมดูลฝ่ายขาย — ใช้ component เดียวกันทั้ง 4 หน้า ต่างกันที่ docType
// Per-document-type accounting list page — one shared component parameterized by docType,
// matching the Sales modules' standalone-list pattern per the owner's 2026-08-18 instruction.
export function ArDocumentListPage({
  currentUserId, docType, canIssue, canCancel, canCreate, canViewStock, canAdjustStock,
  initialArDocumentId, onArDocumentIdConsumed,
}: {
  currentUserId: string;
  docType: ArDocumentType;
  canIssue: boolean;
  canCancel: boolean;
  /** Gates the "+ สร้างใบกำกับภาษี (Manual)" button (added 2026-08-18) — only rendered on the AR/IV
   * pages, see `isManualCreatable` below. */
  canCreate: boolean;
  canViewStock: boolean;
  canAdjustStock: boolean;
  /** เปิดเอกสารใบนี้ทันทีเมื่อเข้าหน้า — มาจากผลค้นหา (2026-08-28) ดู `initial<X>Id` ของโมดูลอื่น */
  initialArDocumentId?: string | null;
  onArDocumentIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [documents, setDocuments] = useState<ArDocument[]>([]);
  const [receipts, setReceipts] = useState<ArDocument[]>([]);
  const [scopeNumbers, setScopeNumbers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusTab>("all");
  const [printDoc, setPrintDoc] = useState<ArDocument | null>(null);
  // พิมพ์ลงฟอร์ม NCR (เฉพาะข้อมูล ลงกระดาษเคมีที่มีกรอบพิมพ์มาแล้ว) — แยก state จากพิมพ์กระดาษเปล่า
  const [ncrPrintDoc, setNcrPrintDoc] = useState<ArDocument | null>(null);
  const [ncrTestPrinting, setNcrTestPrinting] = useState(false);
  const [ncrSettingsOpen, setNcrSettingsOpen] = useState(false);
  const [ncrSettings, setNcrSettings] = useState<NcrPrintSettings>(loadNcrSettings);
  const [cancelTarget, setCancelTarget] = useState<ArDocument | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<ArDocument | null>(null);
  const [detailDoc, setDetailDoc] = useState<ArDocument | null>(null);
  // หน้าสร้างใบกำกับภาษี (Manual) — เดิมเป็นกล่องโต้ตอบ ดีไซน์ใหม่เป็นหน้าเต็มที่สลับแทนหน้ารายการ
  const [manualOpen, setManualOpen] = useState(false);
  const [receiptPickerOpen, setReceiptPickerOpen] = useState(false);
  const [menuRowId, setMenuRowId] = useState<string | null>(null);
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

  // เปิดเอกสารที่ส่งมาจากผลค้นหา (2026-08-28) — ต้องรอให้โหลดรายการเสร็จก่อน เพราะกล่องรายละเอียด
  // รับเอกสารทั้งก้อน ไม่ใช่ id เหมือนโมดูลอื่น หน้านี้ถูก remount ด้วย key={docType} และ App.tsx
  // เลือกหน้าให้ตรงชนิดเอกสารมาแล้ว ใบที่ขอจึงอยู่ใน `documents` เสมอ
  const [appliedArDocumentId, setAppliedArDocumentId] = useState<string | null>(null);
  if (initialArDocumentId && !loading && initialArDocumentId !== appliedArDocumentId) {
    setAppliedArDocumentId(initialArDocumentId);
    const target = documents.find((d) => d.id === initialArDocumentId);
    if (target) setDetailDoc(target);
  }
  useEffect(() => {
    if (initialArDocumentId && !loading) onArDocumentIdConsumed?.();
  }, [initialArDocumentId, loading, onArDocumentIdConsumed]);

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

  const months = useMemo(() => monthsPresent(documents.map((d) => d.docDate)), [documents]);

  const normalizedSearch = search.trim().toLowerCase();
  // ทุกตัวกรอง "ยกเว้น" สถานะ — ตัวเลขบนแท็บนับจากชุดนี้ ไม่ใช่ documents ดิบ ถ้านับจาก documents ดิบ
  // ตัวเลขบนแท็บจะขัดกับแถวที่เห็นในตารางทันทีที่ผู้ใช้กรองเดือน/ค้นหา (ดู "Filter Honesty" ใน docs/UI_GUIDELINES.md)
  // แท็บแทนการ์ดนับสามใบเดิม (ดีไซน์ใหม่ 2026-09-30) — ยอดรวมเดือนนี้ยังอยู่ในสรุปเอกสารประจำเดือน
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
      const [doc] = await Promise.all([fetchArDocument(id), prepareNcrFonts()]);
      setNcrPrintDoc(doc);
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

  // คำแนะนำประจำหน้า — 4 หน้าใช้ component เดียวกัน แต่ปุ่ม/คอลัมน์ต่างกันตามประเภท จึงแยก tourKey ต่อประเภท
  // (ดูครั้งเดียวต่อหน้า ไม่ใช่ดูหน้า AR แล้วหน้า RE ไม่เล่นให้) · ขั้นที่หาปุ่มไม่เจอ (ไม่มีสิทธิ์/ไม่มีแถว) ถูกข้ามเอง
  // เล่นเองหลังโหลดรายการเสร็จ เพราะปุ่มท้ายแถวยังไม่อยู่บนจอระหว่างโหลด
  const tourSteps: TourStep[] = [
    isTaxInvoicePage
      ? { element: '[data-tour="arlist-create"]', manual: "ch13-5", popover: { title: t("tour.arList.manual.title"), description: t("tour.arList.manual.desc"), side: "bottom" } }
      : docType === "RE"
      ? { element: '[data-tour="arlist-create"]', manual: "ch13-2", popover: { title: t("tour.arList.receipt.title"), description: t("tour.arList.receipt.desc"), side: "bottom" } }
      : { element: '[data-tour="arlist-intro"]', manual: "ch13-2", popover: { title: t("tour.arList.intro.title"), description: t("tour.arList.intro.desc"), side: "bottom" } },
    { element: '[data-tour="arlist-ncr"]', manual: "ch13-5", popover: { title: t("tour.arList.ncr.title"), description: t("tour.arList.ncr.desc"), side: "bottom" } },
    { element: '[data-tour="arlist-filters"]', manual: "ch13-2", popover: { title: t("tour.arList.filters.title"), description: t("tour.arList.filters.desc"), side: "bottom" } },
    ...(isStockPage ? [] : [isTaxInvoicePage
      ? { element: '[data-tour="arlist-refcol"]', manual: "ch13-1", popover: { title: t("tour.arList.receiptCol.title"), description: t("tour.arList.receiptCol.desc"), side: "bottom" as const } }
      : { element: '[data-tour="arlist-refcol"]', manual: "ch13-1", popover: { title: t("tour.arList.refCol.title"), description: t("tour.arList.refCol.desc"), side: "bottom" as const } }]),
    isTaxInvoicePage
      ? { element: '[data-tour="arlist-row"]', manual: "ch13-5", popover: { title: t("tour.arList.rowTax.title"), description: t("tour.arList.rowTax.desc"), side: "left" } }
      : { element: '[data-tour="arlist-row"]', manual: "ch13-5", popover: { title: t("tour.arList.row.title"), description: t("tour.arList.row.desc"), side: "left" } },
    ...(isStockPage ? [{ element: '[data-tour="arlist-stock"]', manual: "ch22-5", popover: { title: t("tour.arList.stock.title"), description: t("tour.arList.stock.desc"), side: "left" as const } }] : []),
  ];
  const tour = useModuleTour(`arDocuments${docType}`, currentUserId, tourSteps, { autoStart: !loading && !detailDoc && !manualOpen });

  const typeLabel = t(DOC_TYPE_LABEL_KEY[docType]);
  const backToAll = t("accounting.list.backToAll").replace("{type}", typeLabel);
  const canManual = isTaxInvoicePage && canCreate && canIssue;

  const tabs = [
    { key: "all" as const, label: t("accounting.list.status.all"), count: scoped.length },
    { key: "issued" as const, label: t("accounting.list.status.issued"), count: scoped.filter((d) => d.status === "issued").length },
    { key: "cancelled" as const, label: t("accounting.list.status.cancelled"), count: scoped.filter((d) => d.status === "cancelled").length },
  ];

  const listView = (
    <div className={`${PAGE_CLASS} print:hidden`}>
      <ListPageHeader
        module={t("nav.group.accounting")}
        title={typeLabel}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        description={<span data-tour={docType === "BI" ? "arlist-intro" : undefined}>
          {t("accounting.list.subtitle.before")} <span className="font-mono text-[#3d5173]">{docType}</span> {t("accounting.list.subtitle.after")}
          {canManual ? ` ${t("accounting.list.subtitle.orManualTop")}` : ""}
          {docType === "RE" && canIssue ? ` ${t("accounting.list.subtitle.orReceiptHere")}` : ""}
        </span>}
        actions={<>
          <button type="button" data-tour="arlist-ncr" onClick={() => setNcrSettingsOpen(true)} className={btn.secondary} title={t("accounting.list.ncr.settingsTitle")}>
            <Settings2 size={16} /> {t("accounting.list.ncr.settingsBtn")}
          </button>
          {canManual && (
            <button type="button" data-tour="arlist-create" onClick={() => setManualOpen(true)} className={btn.primary}>
              <Plus size={16} /> {t("accounting.list.btn.createManual")}
            </button>
          )}
          {docType === "RE" && canIssue && (
            <button type="button" data-tour="arlist-create" onClick={() => setReceiptPickerOpen(true)} className={btn.primary}>
              <Plus size={16} /> {t("accounting.list.btn.createReceipt")}
            </button>
          )}
        </>}
      />

      <ListCard>
        <div data-tour="arlist-filters">
        <ListTabs tabs={tabs} active={statusFilter} onChange={setStatusFilter} ariaLabel={t("accounting.list.statusTabs")} />
        <ListToolbar
          search={search}
          onSearch={setSearch}
          searchPlaceholder={t("accounting.list.search.placeholder")}
          count={loading || loadError ? undefined : t("ui.itemCount").replace("{n}", String(filtered.length))}
        >
          <FilterSelect
            label={t("accounting.list.filter.month")}
            value={monthFilter}
            options={[{ value: "", label: t("accounting.list.status.all") }, ...months.map((m) => ({ value: m, label: formatDisplayMonth(m) }))]}
            onChange={setMonthFilter}
          />
        </ListToolbar>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : loadError ? (
          <ListEmpty
            title={t("accounting.list.error.loadFailed")}
            action={<button type="button" onClick={load} className={btn.secondary}>{t("accounting.list.error.retry")}</button>}
          />
        ) : documents.length === 0 ? (
          <ListEmpty
            title={`${t("accounting.list.empty.titlePrefix")}${typeLabel}`}
            hint={docType === "RE" ? t("accounting.list.empty.descRE") : t("accounting.list.empty.descOther")}
          />
        ) : filtered.length === 0 ? (
          <ListEmpty title={t("accounting.list.noMatch")} />
        ) : (
          <div className={`overflow-x-auto ${menuRowId ? "pb-28" : ""}`}>
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className={table.head}>
                  <th className={table.th}>{t("accounting.list.col.docNo")}</th>
                  <th className={table.th}>{t("accounting.list.col.date")}</th>
                  <th className={table.th}>{t("accounting.list.col.customer")}</th>
                  <th className={table.th}>{t("accounting.list.col.scopeNumber")}</th>
                  {/* AR/IV = ใบเสร็จที่ออกให้ใบนี้แล้ว · BI/RE = เลขที่ใบกำกับภาษี (AR/IV) ที่ใบนี้อ้างถึง (field `reference`
                      ซึ่งเซิร์ฟเวอร์ใส่เป็นเลขที่ใบกำกับภาษีต้นทางตอนออก BI/RE) — เดิมหน้า BI ใช้หัวว่า "ใบเสร็จรับเงิน"
                      ทั้งที่แสดงเลขที่ใบกำกับภาษี แก้หัวให้ตรงกับข้อมูล 2026-09-30 */}
                  <th data-tour="arlist-refcol" className={table.th}>{isTaxInvoicePage ? t("accounting.list.col.receipt") : t("accounting.list.col.refInvoice")}</th>
                  <th className={table.th.replace("text-left", "text-right")}>{t("accounting.list.col.netTotal")}</th>
                  <th className={table.th}>{t("accounting.list.col.status")}</th>
                  <th className={table.th}><span className="sr-only">{t("accounting.list.col.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d, rowIndex) => {
                  const receipt = isTaxInvoicePage ? receiptByInvoiceId[d.id] : undefined;
                  const cancelled = d.status === "cancelled";
                  const scopeNo = scopeNumbers[d.scopeOfWorkId];
                  return (
                    <tr key={d.id} className={table.row}>
                      <td className={`${table.td} whitespace-nowrap`}>
                        <span className="flex flex-col items-start leading-snug">
                          <span className={`font-mono text-[13px] font-medium ${cancelled ? "text-muted-foreground" : "text-foreground"}`}>{d.docNo}</span>
                          {d.isManual && (
                            <span className="mt-0.5 h-[18px] px-1.5 rounded bg-[#eef1f6] text-[#3d5173] text-xs font-semibold inline-flex items-center" title={t("accounting.list.badge.manualTitle")}>
                              {t("accounting.list.badge.manual")}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{formatDisplayDate(d.docDate)}</td>
                      <td className={`${table.td} text-sm font-medium text-foreground max-w-[260px] truncate`} title={d.customerSnapshot.companyName}>{d.customerSnapshot.companyName}</td>
                      <td className={`${table.td} font-mono text-[13px] whitespace-nowrap ${scopeNo ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{scopeNo ?? "—"}</td>
                      <td className={`${table.td} text-[13px] whitespace-nowrap`}>
                        {isTaxInvoicePage
                          ? (receipt
                            ? <span className="font-mono text-[#1b7f4f]">{receipt.docNo}</span>
                            : <span className="text-[#8a97ad]">{t("accounting.list.receiptNotIssued")}</span>)
                          : <span className={`font-mono ${d.reference ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{d.reference || "—"}</span>}
                      </td>
                      <td className={`${table.td} ${table.money} whitespace-nowrap ${cancelled ? "text-[#8a97ad] line-through" : "text-foreground"}`}>{money(d.netTotal)}</td>
                      <td className={table.td}><DocStatusPill status={d.status} /></td>
                      <td className={`${table.td} whitespace-nowrap`}>
                        <div data-tour={rowIndex === 0 ? "arlist-row" : undefined} className="flex items-center justify-end gap-1">
                          {isTaxInvoicePage && canIssue && d.status === "issued" && !receipt && (
                            <button type="button" onClick={() => setReceiptTarget(d)} className={`${btn.secondarySm.replace("h-9", "h-8")} mr-1`}>
                              {t("accounting.list.action.issueReceipt")}
                            </button>
                          )}
                          {isStockPage && canViewStock && (
                            <span data-tour={rowIndex === 0 ? "arlist-stock" : undefined} className="inline-flex">
                              <RowIconButton icon={Boxes} label={t("accounting.list.action.viewStockTitle")} onClick={() => void handleOpenStock(d.id)} />
                            </span>
                          )}
                          <RowIconButton icon={Printer} label={t("accounting.list.action.printTitle")} onClick={() => void handlePrint(d.id)} />
                          <RowMoreMenu
                            label={t("ui.more")}
                            onOpenChange={(open) => setMenuRowId((prev) => (open ? d.id : prev === d.id ? null : prev))}
                            items={[
                              { key: "ncr", label: t("accounting.list.action.ncrPrint"), icon: FileText, hint: t("accounting.list.action.ncrPrintTitle"), onSelect: () => void handleNcrPrint(d.id) },
                              canCancel && d.status === "issued" && { key: "cancel", label: t("accounting.list.action.cancelTitle"), icon: Ban, danger: true, onSelect: () => setCancelTarget(d) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ListCard>

      {cancelTarget && (
        <CancelDocumentDialog
          doc={cancelTarget}
          busy={busy}
          onConfirm={(reason) => void handleCancel(reason)}
          onCancel={() => setCancelTarget(null)}
        />
      )}
      <AccountingDialog
        open={receiptTarget !== null}
        tone="success"
        icon={Receipt}
        title={t("accounting.list.receiptDialog.title")}
        message={t("accounting.receiptDialog.message")}
        confirmLabel={busy ? t("accounting.list.receiptDialog.busy") : t("accounting.list.receiptDialog.confirm")}
        confirmIcon={Receipt}
        busy={busy}
        onConfirm={() => void handleIssueReceipt()}
        onCancel={() => setReceiptTarget(null)}
      >
        {receiptTarget && (
          <SummaryBox
            mono
            primary={receiptTarget.docNo}
            secondary={`${receiptTarget.customerSnapshot.companyName} · ${scopeNumbers[receiptTarget.scopeOfWorkId] ?? "—"}`}
            amountLabel={t("accounting.summary.netTotal")}
            amount={`฿${money(receiptTarget.netTotal)}`}
          />
        )}
      </AccountingDialog>
      {ncrSettingsOpen && (
        <NcrSettingsDialog
          settings={ncrSettings}
          onSave={(next) => { saveNcrSettings(next); setNcrSettings(next); setNcrSettingsOpen(false); toast.show(t("accounting.list.ncr.savedToast")); }}
          onTestPrint={(next) => { saveNcrSettings(next); setNcrSettings(next); setNcrSettingsOpen(false); setNcrTestPrinting(true); }}
          onClose={() => setNcrSettingsOpen(false)}
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
  );

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
        backLabel={t("accounting.list.backToAll").replace("{type}", t(DOC_TYPE_LABEL_KEY[detailDoc.docType]))}
        receiptDocNo={receiptByInvoiceId[detailDoc.id]?.docNo}
        canAdjust={canAdjustStock}
        onBack={() => setDetailDoc(null)}
        onDocumentUpdated={(updated) => {
          setDetailDoc(updated);
          setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        }}
        onPrint={() => void handlePrint(detailDoc.id)}
        onNcrPrint={() => void handleNcrPrint(detailDoc.id)}
      />
    ) : manualOpen ? (
      <ManualTaxInvoicePage
        docType={docType === "IV" ? "IV" : "AR"}
        backLabel={backToAll}
        onBack={() => setManualOpen(false)}
        onIssued={(issued) => {
          setManualOpen(false);
          toast.show(`${t("accounting.list.toast.issuedPrefix")} ${issued.map((d) => d.docNo).join(` ${t("accounting.list.and")} `)} ${t("accounting.list.suffixDone")}`);
          load();
        }}
      />
    ) : listView}
    {printDoc && <ArDocumentPrintDocument document={printDoc} paidByInvoiceId={paidByInvoiceId} />}
    {ncrPrintDoc && <ArDocumentNcrPrintDocument document={ncrPrintDoc} settings={ncrSettings} paidByInvoiceId={paidByInvoiceId} />}
    {ncrTestPrinting && <NcrCalibrationTestPage settings={ncrSettings} variant={docType === "BI" ? "billingNote" : "standard"} />}
    </>
  );
}

// กล่องยืนยันการยกเลิกเอกสาร — ต้องใส่เหตุผลเสมอ (เดิมใช้ PromptDialog ดีไซน์ใหม่มีกล่องสรุปเอกสารให้เห็นว่ายกเลิกใบไหน)
function CancelDocumentDialog({ doc, busy, onConfirm, onCancel }: {
  doc: ArDocument;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [blankError, setBlankError] = useState("");
  const submit = () => {
    if (busy) return;
    const trimmed = reason.trim();
    if (!trimmed) { setBlankError(t("accounting.list.cancelDialog.required")); return; }
    onConfirm(trimmed);
  };
  return (
    <AccountingDialog
      open
      tone="danger"
      icon={Ban}
      title={<>{t("accounting.list.action.cancelTitle")} <span className="font-mono font-medium">{doc.docNo}</span></>}
      message={t("accounting.list.cancelDialog.message")}
      confirmLabel={busy ? t("accounting.list.cancelDialog.busy") : t("accounting.list.action.cancelTitle")}
      confirmIcon={Ban}
      danger
      busy={busy}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <SummaryBox
        primary={<span className="font-normal text-[#3d5173]">{t(DOC_TYPE_LABEL_KEY[doc.docType])} · {formatDisplayDate(doc.docDate)}</span>}
        secondary={doc.customerSnapshot.companyName}
        amount={`฿${money(doc.netTotal)}`}
      />
      <Field label={t("accounting.list.cancelDialog.label")} required htmlFor="ar-cancel-reason" error={blankError || undefined}>
        <input
          id="ar-cancel-reason"
          autoFocus
          value={reason}
          onChange={(e) => { setReason(e.target.value); setBlankError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          aria-invalid={blankError ? true : undefined}
          className={`${blankError ? field.input.replace("border-[#c3ccda]", "border-[#b93636]") : field.input} w-full`}
        />
      </Field>
    </AccountingDialog>
  );
}

type NcrKey = keyof NcrPrintSettings;
const NCR_FIELDS: { key: NcrKey; label: "accounting.list.ncr.label.pageWidth" | "accounting.list.ncr.label.pageHeight" | "accounting.list.ncr.label.offsetX" | "accounting.list.ncr.label.offsetY" }[] = [
  { key: "pageWidthMm", label: "accounting.list.ncr.label.pageWidth" },
  { key: "pageHeightMm", label: "accounting.list.ncr.label.pageHeight" },
  { key: "offsetXMm", label: "accounting.list.ncr.label.offsetX" },
  { key: "offsetYMm", label: "accounting.list.ncr.label.offsetY" },
];

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
  return (
    <AccountingDialog
      open
      wide
      tone="info"
      icon={Settings2}
      title={t("accounting.list.ncr.settingsBtn")}
      message={t("accounting.list.ncr.description")}
      confirmLabel={t("accounting.list.ncr.save")}
      footerLeft={
        <button type="button" onClick={() => setDraft({ ...DEFAULT_NCR_SETTINGS })} className={btn.text}>
          <RotateCcw size={16} /> {t("accounting.list.ncr.reset")}
        </button>
      }
      extraActions={
        <button type="button" onClick={() => onTestPrint(draft)} className={btn.secondary}>
          <Printer size={16} /> {t("accounting.list.ncr.testPrint")}
        </button>
      }
      onConfirm={() => onSave(draft)}
      onCancel={onClose}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:pl-[60px]">
        {NCR_FIELDS.map(({ key, label }) => (
          <Field key={key} label={t(label)} htmlFor={`ncr-${key}`}>
            <span data-field-box className="h-10 rounded-lg border border-[#c3ccda] bg-white flex items-stretch overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
              <input
                id={`ncr-${key}`}
                type="number"
                step="0.5"
                inputMode="decimal"
                value={draft[key]}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: num(e.target.value, d[key], key === "pageWidthMm" || key === "pageHeightMm") }))}
                className="flex-1 min-w-0 h-full px-3 bg-transparent text-sm text-right tabular-nums text-foreground outline-none"
              />
              <span className="px-3 flex items-center bg-[#f4f6fa] border-l border-border text-[13px] text-[#3d5173]">{t("accounting.list.ncr.unitMm")}</span>
            </span>
          </Field>
        ))}
        <p className={`${field.help} sm:col-span-2`}>{t("accounting.list.ncr.localNote")}</p>
      </div>
    </AccountingDialog>
  );
}

const RECEIPT_PICKER_GRID = "grid-cols-[110px_200px_minmax(0,1fr)_108px_120px_20px]";

// Dialog เปิดจากปุ่ม "+ ออกใบเสร็จ" บนหน้า RE เอง — ให้เลือกใบกำกับภาษี (AR/IV) ที่ออกแล้วและยังไม่มี
// ใบเสร็จมาออกได้ตรงนี้เลย (เดิมต้องไปกดปุ่ม "ออกใบเสร็จ" ที่แถวเอกสารในหน้า AR/IV เท่านั้น) — เหมือน
// action "Register Payment" ของ Odoo ที่อยู่บนตัวเอกสารต้นทาง เพียงแต่เพิ่มทางเข้าอีกทางจากหน้า RE เอง
// กดแถวแล้วไปที่กล่องยืนยันออกใบเสร็จ (ยังไม่ออกทันที)
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
    <RowPickerDialog
      title={t("accounting.list.receiptPicker.title")}
      subtitle={t("accounting.list.receiptPicker.description")}
      search={search}
      onSearch={setSearch}
      searchPlaceholder={t("accounting.list.search.placeholder")}
      countLabel={loading || loadError ? undefined : t("ui.itemCount").replace("{n}", String(filtered.length))}
      gridClass={RECEIPT_PICKER_GRID}
      headers={<>
        <span>{t("accounting.list.col.docNo")}</span>
        <span>{t("accounting.jobBilling.col.type")}</span>
        <span>{t("accounting.list.col.customer")}</span>
        <span>{t("accounting.list.col.scopeNumber")}</span>
        <span className="text-right">{t("accounting.list.col.netTotal")}</span>
        <span />
      </>}
      footerNote={t("accounting.list.receiptPicker.footer")}
      onClose={onClose}
    >
      {loading ? (
        <div className="p-6 space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : loadError ? (
        <ListEmpty title={t("accounting.list.error.loadFailed")} />
      ) : filtered.length === 0 ? (
        <ListEmpty title={t("accounting.list.receiptPicker.empty.title")} hint={t("accounting.list.receiptPicker.empty.description")} />
      ) : (
        filtered.map((d) => {
          const scopeNo = scopeNumbers[d.scopeOfWorkId];
          return (
            <PickerRow key={d.id} gridClass={RECEIPT_PICKER_GRID} onClick={() => onSelect(d)}>
              <span className={table.code}>{d.docNo}</span>
              <span className="text-[13px] text-[#3d5173] truncate">{t(DOC_TYPE_LABEL_KEY[d.docType])}</span>
              <span className="text-sm font-medium text-foreground truncate">{d.customerSnapshot.companyName}</span>
              <span className={`font-mono text-[13px] ${scopeNo ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{scopeNo ?? "—"}</span>
              <span className="text-right text-sm font-semibold tabular-nums text-foreground">{money(d.netTotal)}</span>
            </PickerRow>
          );
        })
      )}
    </RowPickerDialog>
  );
}
