import { useEffect, useState } from "react";
import { CheckCircle2, CornerDownRight, Info, Loader2, LockOpen, PackageCheck, PackagePlus, Plus, Printer, RotateCcw, Save, Trash2, X } from "lucide-react";
import { Combobox } from "../../components/Combobox";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import { type Vendor, fetchVendors, vendorComboboxOptions } from "../../lib/vendors";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DocumentAttachmentsCard } from "../../components/DocumentAttachmentsCard";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { ApiError } from "../../lib/apiClient";
import { fmt } from "../../lib/quotes";
import { lineSubtotal } from "../../lib/quoteMath";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import type { CompanyHeaderInfo } from "../../lib/storage";
import {
  type ReceivingReport, type ReceivingReportUpdateFields, type ReceivingReportLine, type ReceiveBatchInput, type ReceivingReportPrintInfo,
  fetchReceivingReport, updateReceivingReport, deleteReceivingReport, postReceivingBatch, deleteReceivingBatch, setReceivingBatchChecked,
  logReceivingReportPrinted, uploadReceivingReportAttachment, deleteReceivingReportAttachment,
  receivingReportTotals, receivedQtyOf, receivedAmountOf, outstandingQtyOf,
  isBlankReceivingReport, receivingReportCodeOf, blankReceivingReportLine, RECEIVING_REPORT_CODE_LABEL_KEY,
  priceTypeOf, orderTotalsOf, dueDateOf, RECEIVING_PRICE_TYPES, RECEIVING_PRICE_TYPE_LABEL_KEY, type ReceivingPriceType,
  addPurchaseOrderToReceivingReport, removePurchaseOrderFromReceivingReport,
} from "../../lib/receivingReport";
import { AddPurchaseOrderDialog } from "./AddPurchaseOrderDialog";
import { ReceiveBatchDialog } from "./ReceiveBatchDialog";
import { ReceivingReportPrintDocument } from "./ReceivingReportPrintDocument";
import { useKitRecipes } from "../../hooks/useKitRecipes";
import { DocumentHeader, DocumentStepper, DocumentColumns, NextStepHint } from "../../components/ui/DocumentLayout";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field, ReadonlyField, SelectBox } from "../../components/ui/Field";
import { btn, field, surface, table } from "../../components/ui/styles";
import { ReceivingReportStatusPill } from "./ReceivingReportList";
import { DiscountInput, RailSummaryCard, SuffixInput, SummaryLine, Tag } from "./receivingUi";
import { discountText } from "./receivingFormat";
import { formatDisplayDate } from "../../lib/displayDate";
import { UnitCombobox } from "../../components/UnitCombobox";

/**
 * payload เดียวที่ใช้ทั้งกดบันทึกเองและบันทึกอัตโนมัติ — รอบการรับไม่เคยอยู่ในนี้
 * ใบเปล่า (2026-09-23) ส่งหัวใบและรายการด้วย เพราะใบเปล่าไม่มีใบสั่งซื้อให้ลอก สโตร์กรอกเองทั้งหมด
 */
function toUpdateFields(d: ReceivingReport): ReceivingReportUpdateFields {
  // เงื่อนไขบิล (2026-09-24) แก้ได้ทุกใบ — ค่าที่ไม่มีในใบเก่าเติมเป็นค่าตั้งต้นให้ตรงกับที่หน้าจอแสดง
  const terms: ReceivingReportUpdateFields = {
    documentNumber: d.documentNumber, remarks: d.remarks,
    priceType: priceTypeOf({ priceType: d.priceType, vatRate: d.orderVatRate }),
    orderVatRate: d.orderVatRate,
    orderDiscount: d.orderDiscount ?? null, orderDiscountMode: d.orderDiscountMode ?? "percent",
    creditDays: d.creditDays ?? null,
    billerCustom: !!d.billerCustom, billerName: d.billerName ?? "", billerTaxId: d.billerTaxId ?? "", billerAddress: d.billerAddress ?? "",
    // ส่วนลดรายบรรทัด (2026-09-29) แก้ได้ทุกใบ — ใบเปล่าเซิร์ฟเวอร์ใช้กับรายการหลังประกอบ `lines` แล้ว
    lineDiscounts: d.lines.map((l) => ({ lineId: l.id, discount: l.discount ?? null, discountMode: l.discountMode ?? "percent" })),
    // รายละเอียดย่อย (2026-10-06) แก้ได้ทุกใบเหมือนส่วนลดรายบรรทัด
    lineSubDetails: d.lines.map((l) => ({ lineId: l.id, subDetails: l.subDetails ?? [] })),
  };
  if (!isBlankReceivingReport(d)) return terms;
  return {
    ...terms,
    jobCode: d.jobCode, vendorName: d.vendorName, vendorTaxId: d.vendorTaxId, vendorAddress: d.vendorAddress,
    lines: d.lines.map((l) => ({
      id: l.id, productId: l.productId, productCode: l.productCode, description: l.description, unit: l.unit,
      qtyOrdered: l.qtyOrdered, unitPriceOrdered: l.unitPriceOrdered,
    })),
  };
}

/**
 * หน้าใบรับสินค้า — "ทั้งหมดนี้คือใบเดียวกัน" ตามที่เจ้าของสั่ง
 *
 * โครงหน้า: การ์ดสรุป สั่งซื้อ/รับแล้ว/ค้างรับ → ตาราง **รายการค้างรับ** → ตาราง **รับครบแล้ว**
 * (บรรทัดย้ายข้ามมาเองเมื่อค้างรับเหลือศูนย์) → ประวัติการรับทีละรอบ → ไฟล์แนบ
 *
 * บันทึกอัตโนมัติเฉพาะเลขที่บนฟอร์มกับหมายเหตุ — ทุกอย่างที่เหลือเป็นผลของการกดรับของ ซึ่งเป็น
 * การกระทำที่ตั้งใจ ไม่ใช่การพิมพ์ทิ้งไว้
 */
export function ReceivingReportDocument({
  receivingReportId, currentUserId, canEdit, canReceive, canCheck, canPrint, canDelete, companyHeader, onBack, onDeleted, showToast,
}: {
  receivingReportId: string;
  currentUserId: string;
  canEdit: boolean;
  canReceive: boolean;
  canCheck: boolean;
  canPrint: boolean;
  canDelete: boolean;
  companyHeader: CompanyHeaderInfo;
  onBack: () => void;
  onDeleted: () => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  // สินค้าชุด (2026-09-29) รับเข้าเป็นชุดไม่ได้ — เตือนตั้งแต่บรรทัด ให้สั่งซื้อ/รับเข้าเป็นชิ้นส่วน
  const kits = useKitRecipes();
  const [doc, setDoc] = useState<ReceivingReport | null>(null);
  const [draft, setDraft] = useState<ReceivingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  // ข้อมูลเสริมของใบพิมพ์ FM-ST-01 มากับการกดพิมพ์ · printBatchId = พิมพ์เฉพาะรอบนั้น (null = ทุกรอบ)
  const [printInfo, setPrintInfo] = useState<ReceivingReportPrintInfo | null>(null);
  const [printBatchId, setPrintBatchId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  /** ใบเดียวรับหลาย PO (2026-09-29) — หน้าต่างเลือกใบสั่งซื้อ และใบที่กำลังจะเอาออก (ยืนยันก่อน) */
  const [addPoOpen, setAddPoOpen] = useState(false);
  const [confirmRemovePo, setConfirmRemovePo] = useState<{ id: string; number: string } | null>(null);
  const blank = !!draft && isBlankReceivingReport(draft);

  // ใบเปล่าต้องใช้แคตตาล็อกกับทะเบียนผู้ขาย — โหลดเฉพาะใบเปล่าที่แก้ได้ ใบที่มาจากใบสั่งซื้อไม่ต้องใช้
  useEffect(() => {
    if (!blank || !canEdit) return;
    let cancelled = false;
    Promise.all([fetchProducts(), fetchCategories(), fetchVendors()])
      .then(([p, c, v]) => { if (!cancelled) { setProducts(p); setCategories(c); setVendors(v); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [blank, canEdit]);

  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  useEffect(() => {
    let cancelled = false;
    fetchReceivingReport(receivingReportId)
      .then((d) => { if (!cancelled) { setDoc(d); setDraft(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [receivingReportId]);

  // เลขที่เป็นฟิลด์บังคับ — ระหว่างที่ผู้ใช้ลบทิ้งเพื่อพิมพ์ใหม่ บันทึกอัตโนมัติจะยิงพอดีแล้วโดน 400
  // เติมกลับเป็น id เสมอ แบบเดียวกับใบสั่งซื้อ/ใบสั่งผลิต
  const autoSavePayload: ReceivingReportUpdateFields | null = draft && canEdit
    ? { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }
    : null;
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: !!draft && canEdit,
    onSave: async (fields) => {
      if (!draft) return;
      // อัปเดตแค่ `doc` ไม่แตะ `draft` เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      setDoc(await updateReceivingReport(draft.id, fields, { autoSave: true }));
    },
  });

  const applyServerDoc = (updated: ReceivingReport) => {
    setDoc(updated);
    setDraft(updated);
    dirty.markSaved(toUpdateFields(updated));
  };

  /** คืน true เมื่อบันทึกสำเร็จ — กล่อง "ยังไม่ได้บันทึก" ใช้ค่านี้ตัดสินว่าจะออกจากหน้าได้ไหม
   *  ถ้าบันทึกไม่ผ่าน ต้องค้างอยู่หน้าเดิมให้ผู้ใช้แก้ ไม่ใช่ออกไปแล้วงานหาย */
  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      applyServerDoc(await updateReceivingReport(draft.id, { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }));
      autoSave.markSaved(toUpdateFields(draft));
      showToast(t("receivingReportDoc.savedToast"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  useUnsavedChangesGuard(
    draft && canEdit
      ? {
        getRisk: () => assessUnsavedRisk({
          isDirty: dirty.isDirtyNow(), hasServerRecord: true,
          autoSaveEnabled: canEdit, autoSaveState: autoSave.state,
        }),
        documentLabel: draft.documentNumber || draft.id,
        save,
        // ไม่มีร่างเก็บในเครื่องให้ทิ้ง — หน้านี้แก้แค่เลขที่กับหมายเหตุ ไม่ได้ใช้ useDraftBackup
        discard: () => {},
      }
      : null,
  );

  // ปุ่มบันทึกรับของมีเฉพาะใบที่ยังรับไม่ครบ และเมนูเพิ่มเติมมีเฉพาะผู้มีสิทธิ์ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  const docTourSteps: TourStep[] = [
    { element: '[data-tour="rrdoc-receive"]', manual: "ch23-3", popover: { title: t("tour.rrdoc.receive.title"), description: t("tour.rrdoc.receive.desc"), side: "bottom" } },
    { element: '[data-tour="rrdoc-more"]', manual: "ch23-4", popover: { title: t("tour.rrdoc.more.title"), description: t("tour.rrdoc.more.desc"), side: "bottom" } },
    { element: '[data-tour="rrdoc-info"]', manual: "ch23-2", popover: { title: t("tour.rrdoc.info.title"), description: t("tour.rrdoc.info.desc"), side: "bottom" } },
    { element: '[data-tour="rrdoc-items"]', manual: "ch23-2", popover: { title: t("tour.rrdoc.items.title"), description: t("tour.rrdoc.items.desc"), side: "top" } },
    { element: '[data-tour="rrdoc-history"]', manual: "ch23-4", popover: { title: t("tour.rrdoc.history.title"), description: t("tour.rrdoc.history.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("receivingReportDoc", currentUserId, docTourSteps, { autoStart: !!doc });

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  if (loading) {
    return (
      <div className="flex-1 px-4 md:px-8 py-6 flex flex-col gap-5" role="status" aria-live="polite">
        <span className="sr-only">{t("receivingReport.loading")}</span>
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }
  if (loadError || !draft || !doc) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("receivingReport.loadError")}</p>
        <button type="button" onClick={onBack} className={btn.secondary}>{t("receivingReportDoc.backToList")}</button>
      </div>
    );
  }

  const totals = receivingReportTotals(draft);
  const orderTotals = orderTotalsOf(draft);
  const priceType = priceTypeOf({ priceType: draft.priceType, vatRate: draft.orderVatRate });
  // วันครบกำหนดนับจากวันที่ใบกำกับของรอบล่าสุด ยังไม่ได้รับของ = นับจากวันนี้ (แต่ละรอบเก็บวันครบกำหนดของตัวเองตอนรับ)
  // "วันนี้" ตามเวลาเครื่อง ไม่ใช่ UTC — ก่อน 07:00 น. เวลาไทย toISOString() ยังเป็นเมื่อวาน
  const dueBase = draft.batches[draft.batches.length - 1]?.invoiceDate || new Date().toLocaleDateString("sv-SE");
  const dueDate = dueDateOf(dueBase, draft.creditDays);
  const pendingLines = draft.lines.filter((l) => outstandingQtyOf(draft, l) > 0);
  const doneLines = draft.lines.filter((l) => outstandingQtyOf(draft, l) <= 0);
  const isOpen = draft.status === "Open";
  const extraPos = draft.extraPurchaseOrders ?? [];
  /** เอาใบสั่งซื้อที่เพิ่มออกได้เฉพาะเมื่อยังไม่รับของรายการไหนของใบนั้น (เซิร์ฟเวอร์ตรวจซ้ำ) */
  const poHasReceipts = (poId: string) => draft.lines.some((l) => l.purchaseOrderId === poId && receivedQtyOf(draft, l.id) > 0);


  // รายการ/เงื่อนไขบิลที่เพิ่งพิมพ์อาจยังไม่ถึงเซิร์ฟเวอร์ (บันทึกอัตโนมัติรอจังหวะอยู่) — บันทึกก่อนเปิดรับของ
  // เซิร์ฟเวอร์อ่านผู้ออกบิลจากใบตอนตั้งหนี้
  const openReceive = async () => {
    if (canEdit && dirty.isDirtyNow()) {
      const ok = await save();
      if (!ok) return;
    }
    setReceiveOpen(true);
  };

  const setLine = (id: string, patch: Partial<ReceivingReportLine>) =>
    setDraft((d) => d && { ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const addProductLine = (p: Product) => {
    setDraft((d) => d && {
      ...d,
      lines: [...d.lines, {
        ...blankReceivingReportLine(), productId: p.id, productCode: p.code, description: p.name, unit: p.unit,
        unitPriceOrdered: p.lastCost ?? p.avgCost ?? 0,
      }],
    });
    setProductPickerOpen(false);
  };

  const runReceive = async (batch: ReceiveBatchInput) => {
    setBusy(true);
    try {
      const updated = await postReceivingBatch(draft.id, batch);
      applyServerDoc(updated);
      setReceiveOpen(false);
      showToast(updated.status === "Closed" ? t("receivingReportDoc.receivedAllToast") : t("receivingReportDoc.receivedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorReceive"));
    } finally {
      setBusy(false);
    }
  };

  const runReverse = async (batchId: string) => {
    setBusy(true);
    try {
      applyServerDoc(await deleteReceivingBatch(draft.id, batchId));
      showToast(t("receivingReportDoc.reversedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorReverse"));
    } finally {
      setBusy(false);
      setConfirmReverse(null);
    }
  };

  // บัญชีตรวจสอบรอบการรับ (2026-10-08, Tuhmo #49) — ชื่อ/ลายเซ็น/วันที่ไปขึ้นช่อง "ผู้ตรวจสอบ" บนใบพิมพ์ของรอบนั้น
  const runCheck = async (batchId: string, checked: boolean) => {
    setBusy(true);
    try {
      applyServerDoc(await setReceivingBatchChecked(draft.id, batchId, checked));
      showToast(t(checked ? "receivingReportDoc.checkedToast" : "receivingReportDoc.uncheckedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorCheck"));
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async (batchId: string | null) => {
    setPrinting(true);
    try {
      setPrintInfo(await logReceivingReportPrinted(draft.id));
      setPrintBatchId(batchId);
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  // เพิ่ม/เอาใบสั่งซื้อออกตอบใบทั้งใบกลับมา (รายการเปลี่ยน) — บันทึกเลขที่/หมายเหตุ/เงื่อนไขบิลที่ค้างก่อน ไม่งั้นที่พิมพ์ไว้หาย
  const addPurchaseOrder = async (purchaseOrderId: string) => {
    if (canEdit && dirty.isDirtyNow() && !(await save())) return;
    setBusy(true);
    try {
      applyServerDoc(await addPurchaseOrderToReceivingReport(draft.id, purchaseOrderId));
      setAddPoOpen(false);
      showToast(t("receivingReportDoc.addPo.addedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
    } finally {
      setBusy(false);
    }
  };
  const removePurchaseOrder = async (purchaseOrderId: string) => {
    if (canEdit && dirty.isDirtyNow() && !(await save())) return;
    setBusy(true);
    try {
      applyServerDoc(await removePurchaseOrderFromReceivingReport(draft.id, purchaseOrderId));
      showToast(t("receivingReportDoc.addPo.removedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
    } finally {
      setBusy(false);
      setConfirmRemovePo(null);
    }
  };

  const toggleStatus = async () => {
    setBusy(true);
    try {
      applyServerDoc(await updateReceivingReport(draft.id, { status: isOpen ? "Closed" : "Open" }));
      showToast(isOpen ? t("receivingReportDoc.closedToast") : t("receivingReportDoc.reopenedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      await deleteReceivingReport(draft.id);
      showToast(t("receivingReportDoc.deletedToast"));
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const docNumber = draft.documentNumber || draft.id;
  const code = receivingReportCodeOf(draft);
  const poCount = new Set(draft.lines.map((l) => l.purchaseOrderId || draft.purchaseOrderId).filter(Boolean)).size;
  const receivedPct = totals.orderedValue > 0 ? (totals.receivedValue / totals.orderedValue) * 100 : 0;
  const receivedAmountTotal = draft.lines.reduce((sum, l) => sum + receivedAmountOf(draft, l.id), 0);
  const lastBatch = draft.batches[draft.batches.length - 1];
  const reverseTarget = confirmReverse ? draft.batches.find((b) => b.id === confirmReverse) : undefined;
  const removeTargetLines = confirmRemovePo ? draft.lines.filter((l) => l.purchaseOrderId === confirmRemovePo.id) : [];

  const steps = [
    { label: blank ? t("receivingReportDoc.step.openedBlank") : t("receivingReportDoc.step.opened") },
    {
      label: draft.batches.length > 0
        ? `${t("receivingReportDoc.step.receive")} · ${t("receivingReportDoc.step.receiveCount").replace("{n}", String(draft.batches.length))}`
        : t("receivingReportDoc.step.receive"),
    },
    { label: t("receivingReportDoc.step.closed") },
  ];

  /**
   * ช่องส่วนลดรายบรรทัด (2026-09-29) — ตัวเลข + %/฿ · แก้ได้ทุกใบ ตั้งต้นจากใบสั่งซื้อ เป็นค่าตั้งต้นของหน้าต่างรับของ
   * ความกว้างอยู่ที่ตัวห่อ ไม่ใส่ w-full ลงช่องเอง (บทเรียนช่องส่วนลดท้ายบิล 2026-09-24/29: w-full ชนะ w-20 แล้วช่องล้นทับกัน)
   */
  const discountCell = (line: ReceivingReportLine) => {
    if (!canEdit) {
      return <span className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">{discountText(line.discount, line.discountMode)}</span>;
    }
    return (
      <DiscountInput
        small
        value={line.discount ?? ""}
        mode={line.discountMode ?? "percent"}
        onValue={(v) => setLine(line.id, { discount: v === "" ? null : Math.max(0, Number(v) || 0) })}
        onMode={(m) => setLine(line.id, { discountMode: m })}
        ariaLabel={`${t("receivingReportDoc.col.discount")} ${line.description}`}
      />
    );
  };

  const lineGrid = "grid grid-cols-[28px_minmax(0,1fr)_60px_72px_72px_80px_112px_132px_116px] gap-2.5 items-center px-6";

  const lineRow = (line: ReceivingReportLine, n: number, done: boolean) => {
    const received = receivedQtyOf(draft, line.id);
    const outstanding = outstandingQtyOf(draft, line);
    const amount = receivedAmountOf(draft, line.id);
    return (
      <div key={line.id} className={`${lineGrid} py-2.5 border-b border-[#eef1f6]`}>
        <span className="text-[13px] text-muted-foreground">{n}</span>
        <span className="flex flex-col gap-0.5 min-w-0 leading-snug">
          <span className="text-sm font-medium text-foreground">{line.description}</span>
          <span className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <span className="font-mono">{line.productCode || "—"}</span>
            {extraPos.length > 0 && (
              <span className="h-5 px-1.5 rounded-[5px] bg-[#eef1f6] text-[#3d5173] font-mono text-[11.5px] font-medium inline-flex items-center">
                {line.purchaseOrderNumber || draft.purchaseOrderNumber}
              </span>
            )}
          </span>
          {/* รายละเอียดย่อย (2026-10-06) — เช่น Lot / วันหมดอายุ · แก้ได้ทุกใบ บันทึกอัตโนมัติไปกับส่วนลดรายบรรทัด · พิมพ์ใต้ชื่อในใบ FM-ST-01 */}
          {canEdit ? (line.subDetails ?? []).map((sd, i) => (
            <span key={i} className="flex items-center gap-1.5 mt-1">
              <CornerDownRight size={14} className="text-[#a3aec2] flex-shrink-0" aria-hidden="true" />
              <input
                value={sd}
                onChange={(e) => setLine(line.id, { subDetails: line.subDetails.map((x, j) => (j === i ? e.target.value : x)) })}
                placeholder={t("receivingReportDoc.subDetailPlaceholder")}
                aria-label={`${t("receivingReportDoc.subDetailPlaceholder")} ${line.description}`}
                className={`${field.cell} flex-1 min-w-0 h-8 text-[13px]`}
              />
              <button type="button" onClick={() => setLine(line.id, { subDetails: line.subDetails.filter((_, j) => j !== i) })}
                title={t("receivingReportDoc.removeSubDetail")} aria-label={t("receivingReportDoc.removeSubDetail")}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] flex-shrink-0">
                <X size={14} />
              </button>
            </span>
          )) : (line.subDetails ?? []).map((sd, i) => (
            <span key={i} className="text-xs text-muted-foreground flex gap-1.5"><span aria-hidden="true">•</span>{sd}</span>
          ))}
          {canEdit && (line.subDetails ?? []).length < 10 && (
            <button type="button" onClick={() => setLine(line.id, { subDetails: [...(line.subDetails ?? []), ""] })} className={`${btn.text} self-start h-7 text-[12.5px]`}>
              <Plus size={13} /> {t("receivingReportDoc.addSubDetail")}
            </button>
          )}
          {kits.has(line.productId ?? "") && <span className="text-xs text-[#b93636]">{t("kit.receiveBlocked")}</span>}
        </span>
        <span className="text-sm text-[#3d5173]">{line.unit || "—"}</span>
        <span className="text-sm text-right tabular-nums text-[#3d5173]">{fmt(line.qtyOrdered)}</span>
        <span className="text-sm text-right tabular-nums text-foreground">{fmt(received)}</span>
        <span className={`text-sm text-right tabular-nums ${done ? "text-[#8a97ad]" : "font-semibold text-[#8a5a00]"}`}>{fmt(outstanding)}</span>
        <span className="text-sm text-right tabular-nums text-[#3d5173]">{fmt(line.unitPriceOrdered)}</span>
        <span className="min-w-0">{discountCell(line)}</span>
        <span className={`text-sm text-right tabular-nums font-semibold ${amount === 0 ? "text-[#8a97ad]" : "text-foreground"}`}>{fmt(amount)}</span>
      </div>
    );
  };

  const groupBand = (tone: "pending" | "done", count: number) => (
    <div className={`flex items-center gap-2.5 px-6 h-10 border-b border-[#eef1f6] ${tone === "pending" ? "bg-[#fdf8ee]" : "bg-[#f3faf6]"}`}>
      {tone === "pending"
        ? <PackagePlus size={16} className="text-[#d89614]" aria-hidden="true" />
        : <PackageCheck size={16} className="text-[#1b7f4f]" aria-hidden="true" />}
      <span className={`text-[13px] font-semibold ${tone === "pending" ? "text-[#8a5a00]" : "text-[#14603b]"}`}>
        {tone === "pending" ? t("receivingReportDoc.pendingTitle") : t("receivingReportDoc.doneTitle")}
      </span>
      <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-white border border-border text-[#3d5173] text-xs font-semibold inline-flex items-center justify-center">{count}</span>
    </div>
  );

  // ช่องกรอกของหัวใบ — แก้ได้ = กล่องกรอก · แก้ไม่ได้ = ข้อความอ่านอย่างเดียว (ไม่มีกล่อง)
  const textField = (label: string, id: string, value: string, onChange: (v: string) => void, opts: { mono?: boolean; className?: string } = {}) =>
    canEdit ? (
      <Field label={label} htmlFor={id} className={opts.className}>
        <input id={id} className={`${field.input} w-full ${opts.mono ? "font-mono" : ""}`} value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
    ) : (
      <ReadonlyField label={label} value={value} mono={opts.mono} className={opts.className} />
    );

  const summaryRows = [
    { label: t("receivingReportDoc.summary.gross"), value: orderTotals.gross },
    { label: t("receivingReportDoc.summary.discount"), value: -orderTotals.discountAmt, hide: orderTotals.discountAmt === 0 },
    { label: t("receivingReportDoc.summary.afterDiscount"), value: orderTotals.afterDiscount, hide: orderTotals.discountAmt === 0 },
    { label: t("receivingReportDoc.summary.base"), value: orderTotals.base, hide: priceType !== "inclusive" },
    {
      label: priceType === "none"
        ? t("receivingReportDoc.summary.noVat")
        : t("receivingReportDoc.summary.vat").replace("{rate}", String(orderTotals.vatRate ?? 0)),
      value: orderTotals.vatAmt,
    },
  ].filter((r) => !r.hide);

  return (
    <>
      <div className="doc-form flex-1 overflow-y-auto print:hidden">
        <div className="sticky top-0 z-20">
          <DocumentHeader
            backLabel={t("receivingReportDoc.backToAll")}
            onBack={onBack}
            number={docNumber}
            status={
              <span className="flex items-center gap-2 flex-wrap">
                <ReceivingReportStatusPill status={draft.status} />
                <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold whitespace-nowrap">
                  <span className="font-mono">{code}</span>{t(RECEIVING_REPORT_CODE_LABEL_KEY[code])}
                </span>
                {blank && <Tag tone="grey">{t("receivingReportDoc.blankBadge")}</Tag>}
              </span>
            }
            meta={canEdit ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} /> : undefined}
            actions={
              <>
                <TourReplayButton variant="title" onClick={docTour.start} />
                {canPrint && (
                  <button type="button" onClick={() => void handlePrint(null)} disabled={printing} className={btn.secondary}>
                    {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} {t("receivingReportDoc.print")}
                  </button>
                )}
                {/* ปุ่มบันทึกคงไว้ตามที่เจ้าของสั่ง (2026-09-30) แม้มีบันทึกอัตโนมัติ */}
                {canEdit && (
                  <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("receivingReportDoc.save")}
                  </button>
                )}
                {(canReceive || canDelete) && <div data-tour="rrdoc-more"><MoreMenu
                  items={[
                    canReceive && (isOpen
                      ? { key: "close", label: t("receivingReportDoc.closeBtn"), icon: CheckCircle2, disabled: busy, hint: t("receivingReportDoc.closeHint"), onSelect: () => void toggleStatus() }
                      : {
                        key: "reopen", label: t("receivingReportDoc.reopenBtn"), icon: LockOpen,
                        disabled: busy || pendingLines.length === 0,
                        hint: pendingLines.length === 0 ? t("receivingReportDoc.reopenBlocked") : undefined,
                        onSelect: () => void toggleStatus(),
                      }),
                    canDelete && {
                      key: "delete", label: t("receivingReportDoc.confirmDelete.title"), icon: Trash2, danger: true,
                      disabled: draft.batches.length > 0,
                      hint: draft.batches.length > 0 ? t("receivingReportDoc.deleteBlockedHint") : undefined,
                      onSelect: () => setConfirmDelete(true),
                    },
                  ]}
                /></div>}
                {canReceive && isOpen && (
                  <button type="button" data-tour="rrdoc-receive" onClick={() => void openReceive()} disabled={busy || pendingLines.length === 0} className={btn.primary}>
                    <PackagePlus size={16} /> {t("receivingReportDoc.receiveBtn")}
                  </button>
                )}
              </>
            }
          />
        </div>

        <div className="px-4 md:px-8 py-6 flex flex-col gap-5">
          <DocumentStepper steps={steps} current={isOpen ? 1 : steps.length} ariaLabel={t("receivingReportDoc.stepsAria")} />

          <DocumentColumns
            main={
              <>
                <div data-tour="rrdoc-info">
                <SectionCard title={t("receivingReportDoc.sectionHeader")}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px] items-start">
                    {textField(t("receivingReportDoc.documentNumber"), "rr-number", draft.documentNumber, (v) => setDraft({ ...draft, documentNumber: v }), { mono: true })}
                    {blank ? (
                      <ReadonlyField label={t("receivingReportDoc.purchaseOrder")} value="" className="sm:col-span-2" />
                    ) : (
                      // ใบเดียวรับหลาย PO (2026-09-29) — ใบหลัก + ใบที่เพิ่ม (กด × เอาออกได้ถ้ายังไม่รับของของใบนั้น) + ปุ่มเพิ่ม
                      <div className="sm:col-span-2 flex flex-col gap-1.5 min-w-0">
                        <span className={field.label}>{t("receivingReportDoc.purchaseOrder")}</span>
                        <div className="min-h-10 flex flex-wrap items-center gap-2">
                          <span className="h-8 px-3 rounded-lg border border-border bg-[#f8f9fc] font-mono text-[13px] font-medium text-foreground inline-flex items-center">{draft.purchaseOrderNumber}</span>
                          {extraPos.map((p) => (
                            <span key={p.id} className="h-8 pl-3 pr-1 rounded-lg border border-border bg-[#f8f9fc] font-mono text-[13px] font-medium text-foreground inline-flex items-center gap-1">
                              {p.number}
                              {canEdit && !poHasReceipts(p.id) && (
                                <button type="button" onClick={() => setConfirmRemovePo(p)} disabled={busy}
                                  aria-label={t("receivingReportDoc.addPo.remove").replace("{po}", p.number)} title={t("receivingReportDoc.addPo.remove").replace("{po}", p.number)}
                                  className="w-6 h-6 rounded-md text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] flex items-center justify-center transition-colors disabled:opacity-60">
                                  <X size={14} />
                                </button>
                              )}
                            </span>
                          ))}
                          {canEdit && isOpen && (
                            <button type="button" onClick={() => setAddPoOpen(true)} disabled={busy} className={`${btn.text} mx-0 h-8`}>
                              <Plus size={16} /> {t("receivingReportDoc.addPo.button")}
                            </button>
                          )}
                        </div>
                        <span className={field.help}>{t("receivingReportDoc.addPo.help")}</span>
                      </div>
                    )}
                    {blank ? (
                      <>
                        {textField(t("receivingReportDoc.jobCode"), "rr-job", draft.jobCode, (v) => setDraft({ ...draft, jobCode: v }), { mono: true })}
                        {canEdit ? (
                          <Field label={t("receivingReportDoc.vendor")} className="sm:col-span-2">
                            <Combobox
                              className={`${field.input} w-full`}
                              value={draft.vendorName}
                              onChange={(next) => setDraft((d) => d && { ...d, vendorName: next })}
                              options={vendorComboboxOptions(vendors)}
                              ariaLabel={t("receivingReportDoc.vendor")}
                              onPick={(opt) => {
                                const v = vendors.find((x) => x.name === opt.value);
                                if (v) setDraft((d) => d && { ...d, vendorName: v.name, vendorTaxId: v.taxId, vendorAddress: v.address });
                              }}
                            />
                          </Field>
                        ) : (
                          <ReadonlyField label={t("receivingReportDoc.vendor")} value={draft.vendorName} className="sm:col-span-2" />
                        )}
                        {textField(t("receivingReportDoc.vendorTaxId"), "rr-tax", draft.vendorTaxId, (v) => setDraft({ ...draft, vendorTaxId: v }), { mono: true })}
                        {textField(t("receivingReportDoc.vendorAddress"), "rr-address", draft.vendorAddress, (v) => setDraft({ ...draft, vendorAddress: v }), { className: "sm:col-span-2" })}
                      </>
                    ) : (
                      <>
                        <ReadonlyField label={t("receivingReportDoc.vendor")} value={draft.vendorName} className="sm:col-span-2" />
                        <ReadonlyField label={t("receivingReportDoc.vendorTaxId")} value={draft.vendorTaxId} mono />
                        <ReadonlyField label={t("receivingReportDoc.jobCode")} value={draft.jobCode} mono />
                      </>
                    )}
                    {canEdit ? (
                      <Field label={t("receivingReportDoc.remarks")} htmlFor="rr-remarks" className="sm:col-span-3">
                        <textarea id="rr-remarks" rows={2} className={`${field.textarea} w-full`} value={draft.remarks}
                          onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} />
                      </Field>
                    ) : (
                      <ReadonlyField label={t("receivingReportDoc.remarks")} value={draft.remarks} className="sm:col-span-3" />
                    )}
                    <p className="sm:col-span-3 flex items-start gap-2 text-xs text-muted-foreground">
                      <Info size={14} className="flex-shrink-0 mt-px" aria-hidden="true" />
                      {blank ? t("receivingReportDoc.blankHeaderHint") : t("receivingReportDoc.headerHint")}
                    </p>
                  </div>
                </SectionCard>
                </div>

                {/* เงื่อนไขบิล (2026-09-24) — ประเภทราคา · ส่วนลด · เครดิต/ครบกำหนด · ผู้ออกบิล แก้ได้ทุกใบ เป็นค่าตั้งต้นของรอบรับ */}
                <SectionCard title={t("receivingReportDoc.termsTitle")} subtitle={t("receivingReportDoc.termsHint")}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px] items-start">
                    {canEdit ? (
                      <Field label={t("receivingReportDoc.priceType")} htmlFor="rr-price-type">
                        <SelectBox id="rr-price-type" value={priceType}
                          onChange={(e) => setDraft({ ...draft, priceType: e.target.value as ReceivingPriceType, orderVatRate: e.target.value === "none" ? draft.orderVatRate : draft.orderVatRate ?? 7 })}>
                          {RECEIVING_PRICE_TYPES.map((p) => <option key={p} value={p}>{t(RECEIVING_PRICE_TYPE_LABEL_KEY[p])}</option>)}
                        </SelectBox>
                      </Field>
                    ) : (
                      <ReadonlyField label={t("receivingReportDoc.priceType")} value={t(RECEIVING_PRICE_TYPE_LABEL_KEY[priceType])} />
                    )}
                    {canEdit && priceType !== "none" ? (
                      <Field label={t("receivingReportDoc.receive.vatRate")} htmlFor="rr-vat">
                        <SuffixInput id="rr-vat" min={0} max={100} suffix="%" value={draft.orderVatRate ?? ""}
                          onChange={(v) => setDraft({ ...draft, orderVatRate: v === "" ? null : Number(v) })} />
                      </Field>
                    ) : (
                      <ReadonlyField label={t("receivingReportDoc.receive.vatRate")} value={priceType === "none" || draft.orderVatRate === null ? "" : `${draft.orderVatRate}%`} />
                    )}
                    {canEdit ? (
                      <Field label={t("receivingReportDoc.discount")}>
                        <DiscountInput
                          value={draft.orderDiscount ?? ""}
                          mode={draft.orderDiscountMode ?? "percent"}
                          onValue={(v) => setDraft({ ...draft, orderDiscount: v === "" ? null : Math.max(0, Number(v) || 0) })}
                          onMode={(m) => setDraft({ ...draft, orderDiscountMode: m })}
                          ariaLabel={t("receivingReportDoc.discount")}
                        />
                      </Field>
                    ) : (
                      <ReadonlyField label={t("receivingReportDoc.discount")} value={discountText(draft.orderDiscount, draft.orderDiscountMode)} />
                    )}
                    {canEdit ? (
                      <Field label={t("receivingReportDoc.creditDays")} htmlFor="rr-credit">
                        <SuffixInput id="rr-credit" min={0} integer suffix={t("receivingReportDoc.daysUnit")} value={draft.creditDays ?? ""}
                          onChange={(v) => setDraft({ ...draft, creditDays: v === "" ? null : Math.max(0, Math.floor(Number(v) || 0)) })} />
                      </Field>
                    ) : (
                      <ReadonlyField label={t("receivingReportDoc.creditDays")} value={draft.creditDays ?? ""} />
                    )}
                    <div className="flex flex-col gap-0.5 min-w-0 pt-0.5">
                      <span className="text-xs text-muted-foreground">{t("receivingReportDoc.dueDate")}</span>
                      <span className={`text-sm font-medium ${dueDate ? "text-foreground" : "text-[#8a97ad]"}`}>{dueDate ? formatDisplayDate(dueDate) : "—"}</span>
                      <span className="text-xs text-muted-foreground">{t("receivingReportDoc.dueDateBase").replace("{date}", formatDisplayDate(dueBase))}</span>
                    </div>
                    {/* ผู้ออกบิลเป็นช่องพิมพ์ช่องเดียว (เจ้าของ 2026-09-24: "ให้ทำเป็นแค่ textbox พอเอาไปกรอกเอง") — ว่าง = ใช้ผู้ขาย
                        `billerCustom` ตามว่ามีชื่อไหม (billerOf() ยังอ่านธงนี้) · พิมพ์ใหม่ล้างเลขภาษี/ที่อยู่ของผู้ออกบิลเดิมที่ช่องถูกถอดไปแล้ว
                        ไม่งั้นค่าที่มองไม่เห็นจะยังไปโผล่ในทะเบียนเจ้าหนี้และใบพิมพ์ */}
                    {canEdit ? (
                      <Field label={t("receivingReportDoc.biller")} htmlFor="rr-biller">
                        <input id="rr-biller" className={`${field.input} w-full`} value={draft.billerCustom ? draft.billerName ?? "" : ""}
                          placeholder={t("receivingReportDoc.billerPlaceholder")}
                          onChange={(e) => setDraft({ ...draft, billerCustom: e.target.value.trim() !== "", billerName: e.target.value, billerTaxId: "", billerAddress: "" })} />
                      </Field>
                    ) : (
                      <ReadonlyField label={t("receivingReportDoc.biller")} value={draft.billerCustom ? draft.billerName ?? "" : draft.vendorName} />
                    )}
                  </div>
                </SectionCard>
              </>
            }
            rail={
              <>
                <RailSummaryCard
                  label={t("receivingReportDoc.kpi.outstanding")}
                  value={`฿${fmt(totals.outstandingValue)}`}
                  progress={receivedPct}
                  progressLabel={t("receivingReportDoc.receivedPct").replace("{pct}", String(Math.round(receivedPct)))}
                  rows={[
                    { label: blank ? t("receivingReportDoc.kpi.orderedBlank") : t("receivingReportDoc.kpi.ordered"), value: `฿${fmt(totals.orderedValue)}` },
                    { label: t("receivingReportDoc.kpi.received"), value: `฿${fmt(totals.receivedValue)}` },
                    {
                      label: t("receivingReportDoc.linesLabel"),
                      value: t("receivingReportDoc.linesSplit").replace("{pending}", String(pendingLines.length)).replace("{done}", String(doneLines.length)),
                    },
                  ]}
                />

                {/* สรุปยอดแบบใบเสนอราคา (2026-09-24) — ไว้เทียบกับบิลของผู้ขายว่าตรงกันไหม ก่อนกดรับของ */}
                <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2.5">
                  <h2 className="text-[15px] font-semibold text-foreground">{t("receivingReportDoc.summaryTitle")}</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">{t("receivingReportDoc.summaryHintRail")}</p>
                  <dl className="flex flex-col gap-2 pt-1">
                    {summaryRows.map((r) => (
                      <div key={r.label} className="flex justify-between gap-4 text-sm">
                        <dt className="text-[#3d5173]">{r.label}</dt>
                        <dd className="tabular-nums text-foreground">{fmt(r.value)}</dd>
                      </div>
                    ))}
                    <div className="h-px bg-border my-0.5" />
                    <div className="flex justify-between items-baseline gap-4">
                      <dt className="text-sm font-semibold text-foreground">{t("receivingReportDoc.summary.total")}</dt>
                      <dd className="text-lg font-bold tabular-nums text-foreground">{fmt(orderTotals.total)}</dd>
                    </div>
                  </dl>
                </section>

                <DocumentAttachmentsCard
                  attachments={draft.attachments ?? []}
                  disabled={!canEdit}
                  onUpload={async (file) => {
                    const updated = await uploadReceivingReportAttachment(draft.id, file);
                    setDraft((p) => (p ? { ...p, attachments: updated.attachments } : updated));
                    setDoc((p) => (p ? { ...p, attachments: updated.attachments } : updated));
                  }}
                  onDelete={async (attachmentId) => {
                    const updated = await deleteReceivingReportAttachment(draft.id, attachmentId);
                    setDraft((p) => (p ? { ...p, attachments: updated.attachments } : updated));
                    setDoc((p) => (p ? { ...p, attachments: updated.attachments } : updated));
                  }}
                />

                <NextStepHint title={t("receivingReportDoc.nextStep")}>
                  {isOpen ? t("receivingReportDoc.nextStep.open") : t("receivingReportDoc.nextStep.closed")}
                </NextStepHint>
              </>
            }
          />

          {blank && (
            <SectionCard
              title={t("receivingReportDoc.linesTitle")}
              subtitle={t("receivingReportDoc.linesHint")}
              bodyClassName=""
              actions={canEdit ? (
                <>
                  <button type="button" onClick={() => setProductPickerOpen(true)} className={btn.secondarySm}>
                    <Plus size={15} /> {t("receivingReportDoc.addFromCatalog")}
                  </button>
                  <button type="button" onClick={() => setDraft((d) => d && { ...d, lines: [...d.lines, blankReceivingReportLine()] })} className={btn.secondarySm}>
                    <Plus size={15} /> {t("receivingReportDoc.addTyped")}
                  </button>
                </>
              ) : undefined}
            >
              {draft.lines.length === 0 ? (
                <p className="px-6 py-8 text-sm text-muted-foreground text-center">{t("receivingReportDoc.linesEmpty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className={table.head}>
                        {[
                          { label: t("receivingReportDoc.col.productCode") }, { label: t("receivingReportDoc.col.description") },
                          { label: t("receivingReportDoc.col.unit") }, { label: t("receivingReportDoc.col.qty"), right: true },
                          { label: t("receivingReportDoc.col.unitPrice"), right: true }, { label: t("receivingReportDoc.col.discount") },
                          { label: t("receivingReportDoc.col.amount"), right: true }, { label: t("receivingReportDoc.col.received"), right: true }, { label: "" },
                        ].map((h, i) => (
                          <th key={`${i}-${h.label}`} className={h.right ? table.th.replace("text-left", "text-right") : table.th}>{h.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((l) => {
                        const received = receivedQtyOf(draft, l.id);
                        const fromCatalog = !!l.productId;
                        return (
                          <tr key={l.id} className="border-b border-[#eef1f6] last:border-b-0">
                            <td className="px-3 first:pl-6 py-2 w-36"><input className={`${field.cell} w-full font-mono`} disabled={!canEdit || fromCatalog} value={l.productCode} aria-label={t("receivingReportDoc.col.productCode")} onChange={(e) => setLine(l.id, { productCode: e.target.value })} /></td>
                            <td className="px-3 py-2"><input className={`${field.cell} w-full`} disabled={!canEdit} value={l.description} aria-label={t("receivingReportDoc.col.description")} onChange={(e) => setLine(l.id, { description: e.target.value })} /></td>
                            <td className="px-3 py-2 w-24"><UnitCombobox className={`${field.cell} w-full`} disabled={!canEdit || fromCatalog} value={l.unit} ariaLabel={t("receivingReportDoc.col.unit")} onChange={(next) => setLine(l.id, { unit: next })} /></td>
                            <td className="px-3 py-2 w-24"><input type="number" min={received} className={`${field.cell} w-full text-right tabular-nums`} disabled={!canEdit} value={l.qtyOrdered} aria-label={t("receivingReportDoc.col.qty")} onChange={(e) => setLine(l.id, { qtyOrdered: Number(e.target.value) || 0 })} /></td>
                            <td className="px-3 py-2 w-28"><input type="number" min={0} className={`${field.cell} w-full text-right tabular-nums`} disabled={!canEdit} value={l.unitPriceOrdered} aria-label={t("receivingReportDoc.col.unitPrice")} onChange={(e) => setLine(l.id, { unitPriceOrdered: Number(e.target.value) || 0 })} /></td>
                            <td className="px-3 py-2 w-36">{discountCell(l)}</td>
                            <td className="px-3 py-2 text-sm text-right tabular-nums text-foreground whitespace-nowrap">{fmt(lineSubtotal({ qty: l.qtyOrdered, unitPrice: l.unitPriceOrdered, discount: l.discount ?? 0, discountMode: l.discountMode }))}</td>
                            <td className="px-3 py-2 text-sm text-right tabular-nums text-muted-foreground whitespace-nowrap">{fmt(received)}</td>
                            <td className="px-3 last:pr-6 py-2 w-12">
                              {canEdit && received === 0 && (
                                <button type="button" onClick={() => setDraft((d) => d && { ...d, lines: d.lines.filter((x) => x.id !== l.id) })} aria-label={t("receivingReportDoc.removeLine")} title={t("receivingReportDoc.removeLine")}
                                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                                  <X size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          )}

          {/* รายการค้างรับ + รับครบแล้วในตารางเดียว (ดีไซน์ใหม่ 2026-09-30) — บรรทัดย้ายกลุ่มเองเมื่อค้างรับเหลือศูนย์ */}
          <section data-tour="rrdoc-items" className={surface.card}>
            <div className={`${surface.cardHead} flex-wrap`}>
              <h2 className={surface.cardTitle}>{t("receivingReportDoc.itemsTitle")}</h2>
              <span className="flex-1 text-[13px] text-muted-foreground">
                {poCount > 1
                  ? t("receivingReportDoc.itemsCountFromPos").replace("{n}", String(draft.lines.length)).replace("{po}", String(poCount))
                  : t("ui.itemCount").replace("{n}", String(draft.lines.length))}
              </span>
              <span className="text-xs text-muted-foreground">{t("receivingReportDoc.itemsDiscountHint")}</span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[960px]">
                <div className={`${lineGrid} h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]`}>
                  <span>#</span>
                  <span>{t("receivingReportDoc.col.item")}</span>
                  <span>{t("receivingReportDoc.col.unit")}</span>
                  <span className="text-right">{t("receivingReportDoc.col.ordered")}</span>
                  <span className="text-right">{t("receivingReportDoc.col.received")}</span>
                  <span className="text-right">{t("receivingReportDoc.col.outstanding")}</span>
                  <span className="text-right">{t("receivingReportDoc.col.poPrice")}</span>
                  <span>{t("receivingReportDoc.col.discount")}</span>
                  <span className="text-right">{t("receivingReportDoc.col.receivedAmount")}</span>
                </div>
                {groupBand("pending", pendingLines.length)}
                {pendingLines.length === 0
                  ? <p className="px-6 py-4 text-sm text-muted-foreground border-b border-[#eef1f6]">{t("receivingReportDoc.pendingEmpty")}</p>
                  : pendingLines.map((l, i) => lineRow(l, i + 1, false))}
                {groupBand("done", doneLines.length)}
                {doneLines.length === 0
                  ? <p className="px-6 py-4 text-sm text-muted-foreground border-b border-[#eef1f6]">{t("receivingReportDoc.doneEmpty")}</p>
                  : doneLines.map((l, i) => lineRow(l, pendingLines.length + i + 1, true))}
              </div>
            </div>
            <div className="flex justify-end items-center gap-6 px-6 pt-3.5 pb-[18px] text-sm text-[#3d5173]">
              <span>{t("receivingReportDoc.receivedAmountTotal")}</span>
              <span className="min-w-[116px] text-right font-semibold tabular-nums text-foreground">{fmt(receivedAmountTotal)}</span>
            </div>
          </section>

          <section data-tour="rrdoc-history" className={surface.card}>
            <div className={surface.cardHead}>
              <h2 className={surface.cardTitle}>{t("receivingReportDoc.historyTitle")}</h2>
              <span className="text-[13px] text-muted-foreground">{t("receivingReportDoc.historyCount").replace("{n}", String(draft.batches.length))}</span>
            </div>
            {draft.batches.length === 0 ? (
              <p className="px-6 py-8 text-sm text-muted-foreground text-center">{t("receivingReportDoc.historyEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px]">
                  <thead>
                    <tr className={table.head}>
                      {[
                        { label: t("receivingReportDoc.historyCol.batch") }, { label: t("receivingReportDoc.receive.invoiceDate") },
                        { label: t("receivingReportDoc.receive.receivedBy") }, { label: t("receivingReportDoc.checkCol") },
                        { label: t("receivingReportDoc.priceType") },
                        { label: t("receivingReportDoc.dueDate") }, { label: t("receivingReportDoc.receive.total"), right: true }, { label: "" },
                      ].map((h, i) => (
                        <th key={i} className={`${h.right ? table.th.replace("text-left", "text-right") : table.th} first:pl-6 last:pr-6`}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.batches.map((b) => (
                      <tr key={b.id} className="h-16 border-b border-[#eef1f6]">
                        <td className={`${table.td} first:pl-6`}>
                          <div className="flex flex-col leading-snug">
                            <span className="text-sm font-semibold text-foreground">{t("receivingReportDoc.batchSeq").replace("{seq}", String(b.seq))}</span>
                            <span className="text-xs font-mono text-muted-foreground">{b.invoiceNumber}</span>
                          </div>
                        </td>
                        <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{b.invoiceDate ? formatDisplayDate(b.invoiceDate) : "—"}</td>
                        <td className={`${table.td} text-sm text-[#3d5173]`}>{b.receivedBy || b.postedByName || "—"}</td>
                        <td className={`${table.td} text-sm`}>
                          {b.checkedBy ? (
                            <div className="flex flex-col leading-snug">
                              <span className="inline-flex items-center gap-1.5 text-[#1b7f4f] font-medium">
                                <CheckCircle2 size={14} aria-hidden="true" /> {b.checkedByName}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {b.checkedAt ? formatDisplayDate(b.checkedAt) : ""}
                                {canCheck && (
                                  <button type="button" onClick={() => void runCheck(b.id, false)} disabled={busy}
                                    className="ml-2 text-[#1a5fb4] hover:underline disabled:opacity-60">
                                    {t("receivingReportDoc.uncheckBtn")}
                                  </button>
                                )}
                              </span>
                            </div>
                          ) : canCheck ? (
                            <button type="button" onClick={() => void runCheck(b.id, true)} disabled={busy} className={btn.secondarySm}>
                              <CheckCircle2 size={15} aria-hidden="true" /> {t("receivingReportDoc.checkBtn")}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">{t("receivingReportDoc.notChecked")}</span>
                          )}
                        </td>
                        <td className={`${table.td} text-sm text-[#3d5173]`}>
                          {t(RECEIVING_PRICE_TYPE_LABEL_KEY[priceTypeOf(b)])}
                          {b.discountAmt ? <span className="block text-xs text-muted-foreground">{t("receivingReportDoc.summary.discount")} {fmt(b.discountAmt)}</span> : null}
                        </td>
                        <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{b.dueDate ? formatDisplayDate(b.dueDate) : "—"}</td>
                        <td className={`${table.td} text-sm text-right font-semibold tabular-nums whitespace-nowrap`}>{fmt(b.total)}</td>
                        <td className={`${table.td} last:pr-6`}>
                          <div className="flex items-center justify-end gap-2">
                            {/* ใบพิมพ์ FM-ST-01 คือหนึ่งบิลต่อหนึ่งใบ — พิมพ์เฉพาะรอบนี้ได้ (2026-09-23) */}
                            {canPrint && (
                              <button type="button" onClick={() => void handlePrint(b.id)} disabled={printing} className={btn.secondarySm}>
                                <Printer size={15} /> {t("receivingReportDoc.printBatch")}
                              </button>
                            )}
                            {/* ยกเลิกได้เฉพาะรอบล่าสุด — ต้นทุนถัวเฉลี่ยเดินไปตามลำดับการรับ ถอนรอบกลางย้อนไม่ได้ */}
                            {canReceive && b.id === lastBatch?.id && (
                              <button type="button" onClick={() => setConfirmReverse(b.id)} disabled={busy}
                                className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-[13px] font-medium text-[#b93636] hover:bg-[#fcebeb] transition-colors disabled:opacity-60 whitespace-nowrap">
                                <RotateCcw size={15} /> {t("receivingReportDoc.reverseBtn")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {draft.batches.length > 0 && canReceive && (
              <p className="px-6 py-3 text-xs text-muted-foreground">{t("receivingReportDoc.historyHint")}</p>
            )}
          </section>
        </div>
      </div>

      {/* ใบพิมพ์อยู่ใน DOM ตลอด ซ่อนด้วย `hidden print:block` — กด Ctrl+P ต้องได้ใบเดียวกับปุ่มพิมพ์
          (บั๊กเดิมของหกโมดูลที่แก้ไปเมื่อ 2026-09-02: เรนเดอร์เฉพาะตอนกดปุ่ม แล้ว Ctrl+P ได้กระดาษเปล่า) */}
      <ReceivingReportPrintDocument doc={draft} companyHeader={companyHeader} printInfo={printInfo} batchId={printBatchId ?? undefined} printedByUserId={currentUserId} />

      <ProductPickerModal
        open={productPickerOpen}
        products={products}
        categories={categories}
        showStock
        onSelect={addProductLine}
        onClose={() => setProductPickerOpen(false)}
      />
      {addPoOpen && (
        <AddPurchaseOrderDialog receivingReportId={draft.id} vendorName={draft.vendorName} busy={busy}
          onPick={(poId) => void addPurchaseOrder(poId)} onCancel={() => setAddPoOpen(false)} />
      )}
      <ConfirmDialog
        open={confirmRemovePo !== null}
        title={t("receivingReportDoc.addPo.removeTitle")}
        message={t("receivingReportDoc.addPo.removeMessage").replace("{po}", confirmRemovePo?.number ?? "")}
        confirmLabel={t("receivingReportDoc.addPo.removeConfirm")}
        danger
        busy={busy}
        summary={confirmRemovePo ? (
          <SummaryLine
            title={confirmRemovePo.number}
            sub={[draft.vendorName, removeTargetLines.map((l) => l.description).join(", ")].filter(Boolean).join(" · ")}
            right={t("ui.itemCount").replace("{n}", String(removeTargetLines.length))}
          />
        ) : undefined}
        onConfirm={() => { if (confirmRemovePo) void removePurchaseOrder(confirmRemovePo.id); }}
        onCancel={() => setConfirmRemovePo(null)}
      />
      {receiveOpen && (
        <ReceiveBatchDialog doc={draft} busy={busy} onCancel={() => setReceiveOpen(false)} onSubmit={(b) => void runReceive(b)} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={t("receivingReportDoc.confirmDelete.title")}
        message={t("receivingReportDoc.confirmDelete.message")}
        confirmLabel={t("receivingReportDoc.delete")}
        danger
        busy={busy}
        summary={
          <SummaryLine
            title={docNumber}
            sub={[draft.vendorName, draft.purchaseOrderNumber].filter(Boolean).join(" · ")}
            right={`฿${fmt(totals.orderedValue)}`}
          />
        }
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmReverse !== null}
        title={t("receivingReportDoc.confirmReverse.title")}
        message={t("receivingReportDoc.confirmReverse.message")}
        confirmLabel={t("receivingReportDoc.reverseBtn")}
        danger
        busy={busy}
        summary={reverseTarget ? (
          <SummaryLine
            title={`${t("receivingReportDoc.batchSeq").replace("{seq}", String(reverseTarget.seq))} · ${reverseTarget.invoiceNumber}`}
            sub={[
              reverseTarget.invoiceDate ? formatDisplayDate(reverseTarget.invoiceDate) : "",
              (reverseTarget.receivedBy || reverseTarget.postedByName) ? `${t("receivingReportDoc.receive.receivedBy")} ${reverseTarget.receivedBy || reverseTarget.postedByName}` : "",
            ].filter(Boolean).join(" · ")}
            right={`฿${fmt(reverseTarget.total)}`}
          />
        ) : undefined}
        onConfirm={() => { if (confirmReverse) void runReverse(confirmReverse); }}
        onCancel={() => setConfirmReverse(null)}
      />
    </>
  );
}
