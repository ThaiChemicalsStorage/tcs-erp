import { Fragment, useEffect, useState } from "react";
import { ChevronRight, Printer, Save, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X, CornerDownRight, PackagePlus, GitBranch, PackageCheck, CheckCircle2, History, Undo2, Lock, ShoppingCart, PackageMinus, ShoppingBag } from "lucide-react";
import type { DriveStep } from "driver.js";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import {
  type PurchaseRequest, type PurchaseRequestLine, type PurchaseRequestUpdateFields,
  type PurchaseRequestIssueBatch,
  fetchPurchaseRequestWithStock, updatePurchaseRequest, logPurchaseRequestPrinted,
  deletePurchaseRequest, blankPurchaseRequestLine,
  submitPurchaseRequestApproval, approvePurchaseRequest, rejectPurchaseRequest, withdrawPurchaseRequestApproval,
  rewritePurchaseRequest,
  uploadPurchaseRequestAttachment, deletePurchaseRequestAttachment,
  reviewPurchaseRequestStock, postPurchaseRequestIssue, cancelPurchaseRequestIssue,
  purchasingApprovePurchaseRequest, purchasingReopenPurchaseRequest, pullPurchaseRequestToPurchasing,
  storeIssueBatchesOf, storeIssuedQtyOf, storeOutstandingQtyOf,
  purchaseRequestCodeOf, PURCHASE_REQUEST_CODE_LABEL_KEY,
} from "../../lib/purchaseRequest";
import { createPurchaseOrder } from "../../lib/purchaseOrder";
import { MATERIAL_CATEGORY_NAMES } from "../../lib/materialRequisition";
import { createProductRequest } from "../../lib/productRequest";
import { DocumentApprovalActions, RejectionNotice } from "../../components/DocumentApprovalActions";
import { DocumentStatusStepper } from "../../components/DocumentStatusStepper";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { PurchaseRequestPrintDocument } from "./PurchaseRequestPrintDocument";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { Combobox } from "../../components/Combobox";
import { type CodeEntry, fetchCodeEntries, codeComboboxOptions } from "../../lib/codeRegister";
import { useI18n } from "../../lib/i18n";
import { getRevisionNumber } from "../../lib/revisionDiff";
import { formatQuoteDateThai } from "../../lib/quotes";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { DocumentAttachmentsCard } from "../../components/DocumentAttachmentsCard";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";

function toUpdateFields(p: PurchaseRequest): PurchaseRequestUpdateFields {
  return {
    lines: p.lines,
    revisionNote: p.revisionNote,
    issueDate: p.issueDate,
    neededByDate: p.neededByDate,
    deliveryLocation: p.deliveryLocation,
    deliveryContact: p.deliveryContact,
    deliveryPhone: p.deliveryPhone,
    headerRemark: p.headerRemark,
    requestedBy: p.requestedBy,
    requestedAt: p.requestedAt,
    approvedBy: p.approvedBy,
    approvedAt: p.approvedAt,
    purchasingDeptBy: p.purchasingDeptBy,
    purchasingDeptAt: p.purchasingDeptAt,
  };
}

// หน้าแก้ไขใบขอซื้อ: ข้อมูลหัวเรื่อง ตารางรายการ (เลือกจากแคตตาล็อกหรือพิมพ์เอง) และผู้เกี่ยวข้อง
// Purchase Request editor: header fields, a line table (catalog-linked or free-typed), and signatories.
export function PurchaseRequestDocument({
  purchaseRequestId,
  company,
  currentUserId,
  canEdit,
  canRequestProductCode,
  canFinalize,
  canPrint,
  canDelete,
  canIssueStock,
  canEditApproved,
  canCreatePurchaseOrder,
  onOpenPurchaseOrder,
  onBack,
  onDeleted,
  onOpenOther,
  showToast,
}: {
  purchaseRequestId: string;
  /** โปรไฟล์บริษัทสำหรับหัวจดหมายไทยบนใบพิมพ์ FM-PU-05 (ชื่อ/ที่อยู่/โทร./เลขผู้เสียภาษี) */
  company: Company;
  currentUserId: string;
  canEdit: boolean;
  canRequestProductCode: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  /** `stock:adjust` — การ์ด "สโตร์เช็คของ / จ่ายของ" บนใบที่อนุมัติแล้ว (2026-09-09) */
  canIssueStock: boolean;
  /** `purchaseRequest:editApproved` — ฝ่ายจัดซื้อแก้ใบที่อนุมัติแล้วได้ (2026-09-09) */
  canEditApproved: boolean;
  /** `purchaseOrder:create` — การ์ด "ออกใบสั่งซื้อ" บนใบที่ผ่านจัดซื้อแล้ว (2026-09-21) */
  canCreatePurchaseOrder: boolean;
  /** พาไปเปิดใบสั่งซื้อที่เพิ่งสร้าง — ไม่มีก็ยังสร้างได้ แค่ไม่กระโดดไปให้ */
  onOpenPurchaseOrder?: (purchaseOrderId: string) => void;
  onBack: () => void;
  onDeleted: () => void;
  /** เปิดเอกสารใบอื่นในโมดูลเดียวกัน — ใช้ตอน Rewrite เพื่อพาไปฉบับใหม่ที่เพิ่งสร้าง */
  onOpenOther: (id: string) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<PurchaseRequest | null>(null);
  const [draft, setDraft] = useState<PurchaseRequest | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // ทะเบียนรหัสแผนก/บัญชี — เป็นแค่ตัวช่วยเติม โหลดล้มก็ยังพิมพ์รหัสเองได้ตามปกติ
  const [codeEntries, setCodeEntries] = useState<CodeEntry[]>([]);
  const [showPrint, setShowPrint] = useState(false);
  const [requestingCodeFor, setRequestingCodeFor] = useState<string | null>(null);
  /** ยอดคงเหลือปัจจุบันต่อสินค้า — server ส่งมาพร้อมใบ และอัปเดตทุกครั้งที่เช็ค/จ่าย/ยกเลิก */
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  /** ผลการเช็คของที่สโตร์กำลังกรอก (ยังไม่บันทึก) — key = lineId */
  const [storeDecisions, setStoreDecisions] = useState<Record<string, "stock" | "purchase">>({});
  const [storeRemark, setStoreRemark] = useState("");
  const [savingReview, setSavingReview] = useState(false);
  /** จำนวนที่สโตร์กำลังจะจ่ายรอบนี้ — key = lineId, เก็บเป็น string เพราะเป็นช่องกรอก */
  const [issueQty, setIssueQty] = useState<Record<string, string>>({});
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [issueRemark, setIssueRemark] = useState("");
  const [savingIssue, setSavingIssue] = useState(false);
  const [cancelBatchTarget, setCancelBatchTarget] = useState<PurchaseRequestIssueBatch | null>(null);
  const [cancellingBatch, setCancellingBatch] = useState(false);
  /** ขั้นของฝ่ายจัดซื้อ (2026-09-21) — อนุมัติ / ถอนการอนุมัติ */
  const [confirmPurchasingApprove, setConfirmPurchasingApprove] = useState(false);
  const [confirmPurchasingReopen, setConfirmPurchasingReopen] = useState(false);
  const [confirmPurchasingPull, setConfirmPurchasingPull] = useState(false);
  /** บรรทัดไหนออกใบสั่งซื้อไปแล้วในใบไหน — เซิร์ฟเวอร์คำนวณจากใบสั่งซื้อจริง (2026-09-21) */
  const [purchasedLines, setPurchasedLines] = useState<Record<string, string[]>>({});
  /** บรรทัดที่ติ๊กไว้รอเปิดใบสั่งซื้อ — เป็น state ของหน้าจอล้วน ไม่เคยถูกบันทึก */
  const [buySelection, setBuySelection] = useState<string[]>([]);
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [creatingPo, setCreatingPo] = useState(false);
  const [purchasingBusy, setPurchasingBusy] = useState(false);
  /** หมายเหตุของฝ่ายจัดซื้อตอนแก้ใบที่อนุมัติแล้ว — ส่งไปกับการกดบันทึก ไม่ใช่ฟิลด์ที่เก็บบนใบ */
  const [purchasingEditNote, setPurchasingEditNote] = useState("");

  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) ─────────────────────────────────────────────────────
  // ประกาศเหนือ effect โหลดข้อมูล เพราะทุกครั้งที่ดึงเอกสารจากเซิร์ฟเวอร์ต้องตั้งฐานเทียบใหม่ ไม่งั้นเอกสารจะ
  // ค้างสถานะ "ยังไม่บันทึก" ตลอดไปแล้วเด้งถามทุกครั้งที่เปลี่ยนหน้า
  //
  // Declared above the loading effect because every fetch has to re-seed the baseline; miss that
  // and the document looks permanently dirty and nags on every navigation.
  const dirty = useDirtyTracker(draft && canEdit && draft.status === "Draft" ? toUpdateFields(draft) : null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPurchaseRequestWithStock(purchaseRequestId), fetchProducts(), fetchCategories()])
      .then(([res, prod, cat]) => {
        if (cancelled) return;
        setDoc(res.purchaseRequest); setDraft(res.purchaseRequest); setStockByProduct(res.stockByProduct);
        setPurchasedLines(res.purchasedLines);
        setProducts(prod); setCategories(cat); dirty.markSaved(toUpdateFields(res.purchaseRequest));
        setStoreRemark(res.purchaseRequest.storeRemark ?? "");
        // ตั้งค่าเริ่มต้นของตัวเลือกให้ตรงกับที่บันทึกไว้ สโตร์จะได้เห็นผลการเช็คครั้งก่อนไม่ใช่ช่องว่าง
        setStoreDecisions(Object.fromEntries(
          (res.purchaseRequest.lines ?? [])
            .filter((l) => l.storeDecision === "stock" || l.storeDecision === "purchase")
            .map((l) => [l.id, l.storeDecision as "stock" | "purchase"]),
        ));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("purchaseRequestDoc.loadError"));
      });
    return () => { cancelled = true; };
  }, [purchaseRequestId, reloadKey, t, dirty]);

  // ทะเบียนรหัสโหลดแยกจากตัวเอกสาร — ถ้าทะเบียนล่มก็ยังเปิดใบขอซื้อและพิมพ์รหัสเองได้
  useEffect(() => {
    let cancelled = false;
    fetchCodeEntries().then((codes) => { if (!cancelled) setCodeEntries(codes); }).catch(() => { /* เติมรหัสให้ไม่ได้ ก็พิมพ์เองได้ */ });
    return () => { cancelled = true; };
  }, []);

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="prdoc-actions"]', popover: { title: t("tour.prdoc.actions.title"), description: t("tour.prdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="prdoc-addline"]', popover: { title: t("tour.prdoc.addline.title"), description: t("tour.prdoc.addline.desc"), side: "bottom" } },
    { element: '[data-tour="prdoc-lines"]', popover: { title: t("tour.prdoc.lines.title"), description: t("tour.prdoc.lines.desc"), side: "top" } },
  ];

  // ── บันทึกอัตโนมัติ (2026-08-25) — hook ต้องอยู่ก่อน early return ทุกอันด้านล่าง ────────────────
  // Auto-save, declared above the loading/error early returns because hooks may not run
  // conditionally. It sends the exact payload the Save button sends and only while the document is
  // an editable Draft; the local snapshot alongside it survives a closed tab or a click onto
  // another page. See src/hooks/useAutoSave.ts.
  const autoSaveEditable = !!draft && canEdit && draft.status === "Draft";
  const autoSavePayload = draft && autoSaveEditable ? toUpdateFields(draft) : null;
  const draftBackup = useDraftBackup({
    storageKey: draft ? `purchaseRequest:${draft.id}` : null,
    data: autoSavePayload,
    enabled: autoSaveEditable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: autoSaveEditable,
    onSave: async (fields) => {
      if (!draft) return;
      const saved = await updatePurchaseRequest(draft.id, fields, { autoSave: true });
      // อัปเดตเฉพาะ doc (สถานะ/เวลาแก้ไขล่าสุด) ไม่แตะ draft เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      // Only `doc` is refreshed — never `draft`, which the user may be typing into right now.
      setDoc(saved);
    },
  });

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updatePurchaseRequest(draft.id, {
        ...toUpdateFields(draft),
        // โหมดจัดซื้อแก้ใบที่อนุมัติแล้ว — หมายเหตุนี้ไม่ใช่ฟิลด์บนใบ เซิร์ฟเวอร์เอาไปต่อท้ายประวัติการแก้
        ...(draft.status === "Final" && canEditApproved ? { purchasingEditNote } : {}),
      });
      setDoc(updated);
      setDraft(updated);
      setPurchasingEditNote("");
      // ตั้งฐานเทียบของ auto-save ใหม่เป็น "สิ่งที่เซิร์ฟเวอร์ตอบกลับมา" ซึ่งคือสิ่งที่ฟอร์มถืออยู่หลังบรรทัดบน
      // ไม่ใช่ค่าบนจอตอนเรียก ซึ่งอาจเก่าหรือใหม่กว่าที่ส่งขึ้นไปจริง
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("purchaseRequestDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorSave"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // การ์ด "ยังไม่ได้บันทึก" — ปุ่ม "บันทึก" ในกล่องต้องเป็น save() ตัวจริงของหน้านี้ ผ่าน validation และรายงาน
  // ข้อผิดพลาดเหมือนกดปุ่มบันทึกเอง ไม่ใช่ทางบันทึกอัตโนมัติ
  //
  // `save` is declared just above rather than with the other handlers because a hook cannot be
  // called conditionally, and the guard has to register before this component's early returns.
  const { requestLeave } = useUnsavedChangesGuard(
    draft && canEdit
      ? {
          getRisk: () => assessUnsavedRisk({
            isDirty: dirty.isDirtyNow(),
            hasServerRecord: true,
            autoSaveEnabled: autoSaveEditable,
            autoSaveState: autoSave.state,
          }),
          documentLabel: draft.id,
          save,
          // ทิ้งสำเนาในเครื่องด้วย ไม่งั้นเปิดเอกสารนี้อีกครั้งจะถูกเสนอให้กู้คืนงานที่เพิ่งสั่งไม่บันทึกไป
          discard: draftBackup.clear,
        }
      : null,
  );

  const docTour = useModuleTour("purchaseRequestDoc", currentUserId, docTourSteps, { autoStart: !!doc });

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  if (loadError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {t("purchaseRequestDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle size={20} className="text-[#e05252]" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <RotateCw size={12} /> {t("purchaseRequest.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!doc || !draft) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {t("purchaseRequestDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-2.5 p-6">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">{t("purchaseRequestDoc.loadingDocument")}</p>
        </div>
      </div>
    );
  }

  const isDraftStatus = doc.status === "Draft";
  const isFinal = doc.status === "Final";
  /**
   * ฝ่ายจัดซื้อแก้ใบที่อนุมัติแล้วได้ (2026-09-09) — เจ้าของเลือกให้แก้ได้**ทุกช่องเหมือนใบร่าง**
   * เพราะชื่อ/ยี่ห้อที่ซื้อได้จริงมักไม่ตรงกับที่ผู้ขอพิมพ์ไว้ · ทุกครั้งที่บันทึกจะถูกจดไว้ในประวัติ
   * `PendingApproval` ยังล็อกทุกคน — ห้ามแก้ใบที่ผู้อนุมัติกำลังอ่าน (กติกาเดิมของทั้งระบบ)
   */
  const purchasingEditMode = canEditApproved && isFinal && doc.purchasingStage !== "approved";
  /** การ์ดของฝ่ายจัดซื้อ — เห็นตลอดหลังหัวหน้าอนุมัติ ไม่ว่าจะยังแก้ได้หรือถูกล็อกไปแล้ว */
  const purchasingCardVisible = canEditApproved && isFinal;
  const editable = (canEdit && isDraftStatus) || purchasingEditMode;
  /** การ์ด "ออกใบสั่งซื้อ" (2026-09-21) — บรรทัดที่สโตร์จ่ายจากสต๊อกแล้วไม่ต้องซื้อ จึงไม่นับ
      ชุดเดียวกับที่ `handleCreate()` ของใบสั่งซื้อจะลอกไป ตัวเลขบนการ์ดจึงตรงกับของจริงเสมอ */
  const buyableLines = (doc.lines ?? []).filter((l) => l.storeDecision !== "stock");
  const orderedCount = buyableLines.filter((l) => (purchasedLines[l.id] ?? []).length > 0).length;
  const remainingLines = buyableLines.filter((l) => (purchasedLines[l.id] ?? []).length === 0);
  const selectedRemaining = buySelection.filter((id) => remainingLines.some((l) => l.id === id));
  const isRevision = getRevisionNumber(doc.id) > 0;
  const buyCardVisible = canCreatePurchaseOrder && isFinal
    && doc.storeStage !== "pending" && doc.storeStage !== "closed" && buyableLines.length > 0;
  /** การ์ดของสโตร์ — ใบที่อนุมัติแล้วเท่านั้น และต้องมีสิทธิ์ขยับสต๊อก */
  const storeCardVisible = isFinal && canIssueStock;
  const issueBatches = storeIssueBatchesOf(doc);
  const lastBatch = issueBatches[issueBatches.length - 1];

  // หัวจดหมายของใบพิมพ์ — สร้าง inline แบบเดียวกับใบเบิกพัสดุ/ใบส่งมอบสินค้า
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  const updateLine = (id: string, patch: Partial<PurchaseRequestLine>) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };
  const removeLine = (id: string) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.filter((l) => l.id !== id) });
  };
  /**
   * เปิดตัวเลือกสินค้า แล้วดึงรายการสินค้าใหม่ทุกครั้ง — เดิมโหลดครั้งเดียวตอน mount สินค้าที่สโตร์เพิ่ง
   * ตั้งรหัสให้จึงไม่ขึ้นจนกว่าจะออกจากเอกสารแล้วเข้ามาใหม่ (เจ้าของรายงาน 2026-09-09)
   */
  const openProductPicker = () => {
    setPickerOpen(true);
    Promise.all([fetchProducts(), fetchCategories()])
      .then(([prod, cat]) => { setProducts(prod); setCategories(cat); })
      .catch(() => { /* ใช้รายการเดิมต่อไป */ });
  };

  const addProduct = (product: Product) => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankPurchaseRequestLine({ id: product.id, code: product.code, name: product.name, unit: product.unit })] });
  };
  const addFreeLine = () => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankPurchaseRequestLine()] });
  };

  /**
   * ขอรหัสสินค้าให้บรรทัดที่พิมพ์เอง (ฝ่ายโครงการขอไว้ 2026-08-27: "ใบขอซื้อมีปุ่มแจ้งเตือนหาสโตร์เอาไว้
   * ตั้งรหัสสินค้าที่ไม่มีในคลัง") — สร้างคำขอพร้อมผูกเลขที่ใบขอซื้อไว้ แล้วสโตร์จะได้แจ้งเตือนทันที
   *
   * **2026-09-09 — สโตร์ตั้งรหัสแล้วบรรทัดนี้ถูกเติมรหัสให้เอง** (เจ้าของสั่ง: "พอเค้าตั้งเสร็จแล้วอยากให้
   * มันขึ้นมาเลยไม่ต้องมากดลบแล้วเพิ่มใหม่") เซิร์ฟเวอร์เขียนให้ตอนอนุมัติคำขอ ดู
   * `api/_lib/productRequestHandler.ts` `backfillSourcePurchaseRequestLine()` — เขียนเฉพาะ
   * `productId`/`productCode`/`unit` ของบรรทัดนั้น ไม่แตะเนื้อหาอื่นของใบที่อนุมัติแล้ว
   */
  const requestProductCode = async (line: PurchaseRequestLine) => {
    if (!doc) return;
    setRequestingCodeFor(line.id);
    try {
      await createProductRequest({
        name: line.description.trim(),
        unit: line.unit,
        categoryId: "",
        specifications: (line.subDetails ?? []).join(" / "),
        reason: `ใช้กับใบขอซื้อ ${doc.id}`,
        sourcePurchaseRequestId: doc.id,
      });
      showToast(t("productRequest.created"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("productRequest.error"));
    } finally { setRequestingCodeFor(null); }
  };

  /** ผลลัพธ์ของทุก route ฝั่งสโตร์คืนเอกสาร + ยอดคงเหลือใหม่มาให้ — เขียนกลับเข้าหน้าจอที่เดียว */
  const applyStoreResult = (updated: PurchaseRequest, stock: Record<string, number>) => {
    setDoc(updated);
    setDraft(updated);
    setStockByProduct(stock);
    dirty.markSaved(toUpdateFields(updated));
    setStoreRemark(updated.storeRemark ?? "");
  };

  /** บันทึกผลการเช็คของ — ต้องเลือกให้ครบทุกบรรทัดก่อน ไม่งั้นใบจะค้างที่ "รอสโตร์" แบบอธิบายไม่ได้ */
  const saveStoreReview = async () => {
    if (!draft) return;
    const lines = draft.lines.map((l) => ({ lineId: l.id, decision: storeDecisions[l.id], availableQty: stockByProduct[l.productId] ?? null }));
    if (lines.some((l) => !l.decision)) {
      showToast(t("purchaseRequestDoc.store.reviewIncomplete"));
      return;
    }
    setSavingReview(true);
    try {
      const res = await reviewPurchaseRequestStock(draft.id, {
        lines: lines as { lineId: string; decision: "stock" | "purchase"; availableQty: number | null }[],
        remark: storeRemark,
      });
      applyStoreResult(res.purchaseRequest, res.stockByProduct);
      showToast(t("purchaseRequestDoc.store.reviewSaved"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.store.reviewError"));
    } finally { setSavingReview(false); }
  };

  /** จ่ายของหนึ่งรอบ — ส่งเฉพาะบรรทัดที่กรอกจำนวนมา ยอดของรอบก่อนไม่ถูกแตะ */
  const saveStoreIssue = async () => {
    if (!draft) return;
    const lines = draft.lines
      .map((l) => ({ lineId: l.id, qty: Number(issueQty[l.id] ?? "") }))
      .filter((l) => Number.isFinite(l.qty) && l.qty > 0);
    if (lines.length === 0) {
      showToast(t("purchaseRequestDoc.store.issueEmpty"));
      return;
    }
    setSavingIssue(true);
    try {
      const res = await postPurchaseRequestIssue(draft.id, { lines, issuedDate: issueDate, remark: issueRemark });
      applyStoreResult(res.purchaseRequest, res.stockByProduct);
      setIssueQty({});
      setIssueRemark("");
      showToast(t("purchaseRequestDoc.store.issueSaved"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.store.issueError"));
    } finally { setSavingIssue(false); }
  };

  /** ยกเลิกรอบล่าสุด — ของทั้งรอบกลับเข้าคลัง */
  const cancelStoreIssue = async (batch: PurchaseRequestIssueBatch) => {
    if (!draft) return;
    setCancellingBatch(true);
    try {
      const res = await cancelPurchaseRequestIssue(draft.id, batch.id);
      applyStoreResult(res.purchaseRequest, res.stockByProduct);
      setCancelBatchTarget(null);
      showToast(t("purchaseRequestDoc.store.batchCancelled"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.store.cancelError"));
    } finally { setCancellingBatch(false); }
  };

  // สร้างฉบับแก้ไข แล้วเปิดฉบับใหม่ทันที — ฉบับเดิมยังอยู่ครบ ไม่ถูกแตะต้อง
  const handleRewrite = async () => {
    if (!doc) return;
    setRewriting(true);
    try {
      const created = await rewritePurchaseRequest(doc.id);
      showToast(t("docRevision.rewritten"));
      onOpenOther(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("docRevision.errorRewrite"));
    } finally { setRewriting(false); setConfirmRewrite(false); }
  };

  /**
   * ฝ่ายจัดซื้ออนุมัติ / ถอนการอนุมัติ (2026-09-21)
   *
   * บันทึกที่ค้างอยู่ต้องถูกกดบันทึกเองก่อน — ปุ่มนี้ไม่บันทึกร่างให้ เพราะการอนุมัติกับการบันทึก
   * เป็นคนละเจตนา และใบจะถูกล็อกทันทีหลังอนุมัติ การเซฟให้เงียบ ๆ จะกลายเป็นการยัดค่าที่ยังไม่ตั้งใจ
   */
  const runPurchasingStage = async (action: "approve" | "reopen" | "pull") => {
    setPurchasingBusy(true);
    try {
      const updated = action === "approve" ? await purchasingApprovePurchaseRequest(doc.id)
        : action === "reopen" ? await purchasingReopenPurchaseRequest(doc.id)
        : (await pullPurchaseRequestToPurchasing(doc.id)).purchaseRequest;
      setDoc(updated);
      setDraft(updated);
      dirty.markSaved(toUpdateFields(updated));
      showToast(t(action === "approve" ? "purchaseRequestDoc.purchasing.approvedToast"
        : action === "reopen" ? "purchaseRequestDoc.purchasing.reopenedToast"
        : "purchaseRequestDoc.purchasing.pulledToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorSave"));
    } finally {
      setPurchasingBusy(false);
      setConfirmPurchasingApprove(false);
      setConfirmPurchasingReopen(false);
      setConfirmPurchasingPull(false);
    }
  };

  /**
   * ออกใบสั่งซื้อจากใบขอซื้อใบนี้ (2026-09-21) — `lineIds === null` แปลว่าทุกบรรทัดที่ยังไม่ได้ซื้อ
   *
   * โหลดใบใหม่หลังสร้างเสร็จ เพื่อให้ `purchasedLines` ตรงกับความจริงทันที — ค่านั้นคำนวณฝั่ง
   * เซิร์ฟเวอร์จากใบสั่งซื้อจริง หน้าจอเดาเองไม่ได้
   */
  const createPurchaseOrderFromRequest = async (lineIds: string[] | null) => {
    setCreatingPo(true);
    try {
      const po = await createPurchaseOrder(doc.id, lineIds ?? undefined);
      setBuySelection([]);
      setBuyDialogOpen(false);
      showToast(t("purchaseRequestDoc.buy.createdToast").replace("{id}", po.documentNumber || po.id));
      const refreshed = await fetchPurchaseRequestWithStock(doc.id);
      setPurchasedLines(refreshed.purchasedLines);
      onOpenPurchaseOrder?.(po.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorSave"));
    } finally { setCreatingPo(false); }
  };
  const handlePrint = async () => {
    setPrinting(true);
    try {
      await logPurchaseRequestPrinted(doc.id);
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePurchaseRequest(doc.id);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorDelete"));
      setDeleting(false);
    }
  };

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("purchaseRequestDoc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#866d28] font-mono font-semibold">{doc.id}</span>
        <span className="text-xs text-muted-foreground">{t(PURCHASE_REQUEST_CODE_LABEL_KEY[purchaseRequestCodeOf(doc)])}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${doc.status === "Draft" ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20" : doc.status === "PendingApproval" ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"}`}>
          {doc.status === "Draft" ? t("materialRequisition.status.draft") : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final")}
        </span>

        <div data-tour="prdoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
          {autoSaveEditable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
          {canEdit && doc.status === "Final" && (
            <button onClick={() => setConfirmRewrite(true)} disabled={rewriting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {rewriting ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />} {t("docRevision.rewrite")}
            </button>
          )}
          {canPrint && (
            <button onClick={handlePrint} disabled={printing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("purchaseRequestDoc.print")}
            </button>
          )}
          {editable && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("purchaseRequestDoc.saveDraft")}
            </button>
          )}
          <DocumentApprovalActions
            status={doc.status}
            canEdit={canEdit}
            canApprove={canFinalize}
            onSubmit={() => submitPurchaseRequestApproval(doc.id)}
            onApprove={() => approvePurchaseRequest(doc.id)}
            onReject={(c) => rejectPurchaseRequest(doc.id, c)}
            onWithdraw={() => withdrawPurchaseRequestApproval(doc.id)}
            onUpdated={(updated) => { setDoc(updated); setDraft(updated); dirty.markSaved(toUpdateFields(updated)); }}
            showToast={showToast}
          />
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("purchaseRequestDoc.delete")}
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto print:hidden">
        {isDraftStatus && draftBackup.recovered && draftBackup.recoveredAt !== null && (
          <DraftRecoveryBanner
            savedAt={draftBackup.recoveredAt}
            onRestore={() => {
              const recovered = draftBackup.recovered!;
              setDraft((prev) => (prev ? { ...prev, ...recovered } : prev));
              draftBackup.clear();
              showToast(t("common.draftRecovery.restoredToast"));
            }}
            onDiscard={draftBackup.dismiss}
          />
        )}

        {/* ขั้น Final ของใบขอซื้อไม่ได้จบที่ "อนุมัติแล้ว" อีกแล้วตั้งแต่ 2026-09-09 — ยังต้องผ่านสโตร์
            แล้วถึงจัดซื้อ · ใช้ช่อง finalHint ที่แถบมีอยู่แล้ว ไม่เพิ่มสถานะที่ 4 ให้ทั้งระบบ */}
        <DocumentStatusStepper
          status={doc.status}
          rejectionComment={doc.rejectionComment ?? ""}
          approverLabel={t("purchaseRequestDoc.approverLabel")}
          approvedByUserId={doc.approvedByUserId}
          approvedByName={doc.approvedBy}
          approvedAt={doc.approvedAt}
          finalHint={
            doc.storeStage === "pending" ? t("purchaseRequestDoc.store.hintPending")
            : doc.storeStage === "forwarded" ? t("purchaseRequestDoc.store.hintForwarded")
            : doc.storeStage === "closed" ? t("purchaseRequestDoc.store.hintClosed")
            : undefined
          }
        />
        {/* ออกใบสั่งซื้อจากใบขอซื้อ (2026-09-21) — เจ้าของข้อ 7: ใบขอซื้อใบเดียว "อาจจะเปิดซื้อจาก
            หลายบริษัทก็ได้ คือที่ติ้กไปแล้วก็เวลาจะเปิด PO ก็จะมีให้เลือกว่าจะเอาทั้งหมดหรือเอาแค่ที่ติ๊ก"

            การติ๊กเป็นแค่ state ของหน้าจอ ไม่ใช่สถานะอนุมัติรายบรรทัดที่เก็บลงฐานข้อมูล (เจ้าของยืนยัน)
            ส่วน "ซื้อไปแล้วหรือยัง" มาจาก purchasedLines ที่เซิร์ฟเวอร์คำนวณจากใบสั่งซื้อจริง ไม่ใช่ธงบนใบนี้
            ลบใบสั่งซื้อทิ้งแล้วบรรทัดจึงกลับมาซื้อได้เอง */}
        {buyCardVisible && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <ShoppingBag size={15} className="text-[#c9a84c]" /> {t("purchaseRequestDoc.buy.create")}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {orderedCount >= buyableLines.length
                    ? t("purchaseRequestDoc.buy.summaryAll").replace("{total}", String(buyableLines.length))
                    : t("purchaseRequestDoc.buy.summary")
                        .replace("{done}", String(orderedCount))
                        .replace("{total}", String(buyableLines.length))}
                </p>
              </div>
              <button
                onClick={() => setBuyDialogOpen(true)}
                disabled={creatingPo || remainingLines.length === 0 || doc.purchasingStage === "review"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#d8ba62] transition-colors disabled:opacity-50"
              >
                {creatingPo ? <Loader2 size={13} className="animate-spin" /> : <ShoppingBag size={13} />}
                {t("purchaseRequestDoc.buy.create")}
              </button>
            </div>

            {doc.purchasingStage === "review" && (
              <p className="text-xs text-[#a75d1a]">{t("purchaseRequestDoc.buy.needApproval")}</p>
            )}
            {/* ฉบับแก้ไขเริ่มนับรายการที่ซื้อแล้วใหม่ (บรรทัดคง id เดิม แต่ใบสั่งซื้อยังชี้ฉบับก่อน) —
                เลือกยอมรับตามความหมายของ Rewrite ทั้งระบบ แต่ต้องเตือนไม่ให้ซื้อซ้ำโดยไม่รู้ตัว */}
            {isRevision && orderedCount === 0 && (
              <p className="text-xs text-[#a75d1a] flex items-start gap-1.5">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {t("purchaseRequestDoc.buy.rewriteWarning")}
              </p>
            )}

            <ul className="space-y-1">
              {buyableLines.map((line) => {
                const orderedIn = purchasedLines[line.id] ?? [];
                const ordered = orderedIn.length > 0;
                return (
                  <li key={line.id} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!ordered && buySelection.includes(line.id)}
                      disabled={ordered}
                      onChange={(e) => setBuySelection((prev) => (e.target.checked ? [...prev, line.id] : prev.filter((x) => x !== line.id)))}
                      aria-label={line.description}
                      className="mt-0.5 accent-[#c9a84c] disabled:opacity-40"
                    />
                    <span className={ordered ? "line-through text-muted-foreground" : "text-foreground"}>
                      {line.description} · {(line.qtyRequested ?? 0).toLocaleString()} {line.unit}
                    </span>
                    {ordered && (
                      <span className="text-muted-foreground whitespace-nowrap">
                        — {t("purchaseRequestDoc.buy.alreadyOrdered")}: {orderedIn.join(", ")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {/* การ์ดของฝ่ายจัดซื้อ (2026-09-21) — ขั้นสุดท้ายของใบก่อนออกใบสั่งซื้อ
            อยู่เหนือกล่องแก้ไขสีส้ม เพราะเป็นปุ่มที่จบงานของการแก้ ไม่ใช่ส่วนหนึ่งของการแก้ */}
        {purchasingCardVisible && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <ShoppingCart size={15} className="text-[#c9a84c]" /> {t("purchaseRequestDoc.purchasing.title")}
            </h2>
            {doc.purchasingStage === "approved" ? (
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-start gap-2">
                  <Lock size={15} className="text-[#3f8f5f] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-[#3f8f5f]">{t("purchaseRequestDoc.purchasing.approvedBanner")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("purchaseRequestDoc.purchasing.approvedBy")
                        .replace("{name}", doc.purchasingDeptBy || "")
                        .replace("{date}", doc.purchasingDeptAt ? formatQuoteDateThai(doc.purchasingDeptAt) : "")}
                    </p>
                  </div>
                </div>
                {/* ปุ่มถอนโชว์เสมอ — เซิร์ฟเวอร์เป็นคนบอกว่าถอนไม่ได้เพราะออกใบสั่งซื้อไปแล้วกี่ใบ
                    หน้านี้ไม่ได้โหลดรายการใบสั่งซื้อมา การเดาเองแล้วซ่อนปุ่มจะผิดได้ง่ายกว่า */}
                <button
                  onClick={() => setConfirmPurchasingReopen(true)}
                  disabled={purchasingBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border text-muted-foreground rounded-lg font-medium hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
                >
                  <Undo2 size={13} /> {t("purchaseRequestDoc.purchasing.reopen")}
                </button>
              </div>
            ) : doc.storeStage === "pending" ? (
              /* ยังรอสโตร์ — เซิร์ฟเวอร์ปฏิเสธการอนุมัติในขั้นนี้ ปุ่มที่ถูกต้องคือ "ดึงมาที่จัดซื้อ" */
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground flex-1 min-w-[16rem]">{t("purchaseRequestDoc.purchasing.pullHelp")}</p>
                <button
                  onClick={() => setConfirmPurchasingPull(true)}
                  disabled={purchasingBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#c9a84c]/50 text-[#a7841a] rounded-lg font-medium hover:bg-[#c9a84c]/10 transition-colors disabled:opacity-50"
                >
                  {purchasingBusy ? <Loader2 size={13} className="animate-spin" /> : <PackageMinus size={13} />}
                  {t("purchaseRequestDoc.purchasing.pull")}
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground flex-1 min-w-[16rem]">{t("purchaseRequestDoc.purchasing.help")}</p>
                <button
                  onClick={() => setConfirmPurchasingApprove(true)}
                  disabled={purchasingBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#d8ba62] transition-colors disabled:opacity-50"
                >
                  {purchasingBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {t("purchaseRequestDoc.purchasing.approve")}
                </button>
              </div>
            )}
          </div>
        )}
        {/* จัดซื้อกำลังแก้ใบที่หัวหน้าเซ็นไปแล้ว — ต้องเห็นชัดว่าไม่ใช่การแก้ใบร่างธรรมดา */}
        {purchasingEditMode && (
          <div className="bg-[#e08a3c]/8 border border-[#e08a3c]/30 rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="text-[#a75d1a] mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#a75d1a]">{t("purchaseRequestDoc.purchasingEdit.title")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("purchaseRequestDoc.purchasingEdit.help")}</p>
              </div>
            </div>
            <input
              value={purchasingEditNote}
              onChange={(e) => setPurchasingEditNote(e.target.value)}
              placeholder={t("purchaseRequestDoc.purchasingEdit.notePlaceholder")}
              className="w-full text-xs text-foreground bg-card border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            {(doc.purchasingEdits ?? []).length > 0 && (
              <ul className="space-y-1 pt-1">
                {(doc.purchasingEdits ?? []).map((e, i) => (
                  <li key={`${e.at}-${i}`} className="text-xs text-muted-foreground">
                    <span className="font-mono">{formatQuoteDateThai(e.at.slice(0, 10))}</span> · {e.byName}
                    {e.note.trim() ? ` — ${e.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <RejectionNotice comment={doc.rejectionComment ?? ""} />
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
            <h1 className="text-[#c9a84c] text-xl font-bold">{t("purchaseRequestDoc.title")}</h1>
            <p className="text-[#a8bed8] text-xs mt-1">{t("purchaseRequestDoc.jobCodePrefix")} {doc.jobCode}</p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* ผู้จำหน่าย / โทร.ผู้จำหน่าย / เครดิต / ขนส่งโดย ถูกถอดออก 2026-08-31 ตามที่เจ้าของสั่ง
                — คนขอซื้อไม่ใช่คนกรอกช่องพวกนี้ ฝ่ายจัดซื้อกรอกตอนออกใบสั่งซื้อจากทะเบียนผู้ขาย */}
            <div>
              <label htmlFor="pr-issueDate" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.issueDate")}</label>
              <input id="pr-issueDate" type="date" disabled={!editable} value={draft.issueDate}
                onChange={(e) => setDraft({ ...draft, issueDate: e.target.value })}
                className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="pr-neededByDate" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.neededByDate")}</label>
              <input id="pr-neededByDate" type="date" disabled={!editable} value={draft.neededByDate}
                onChange={(e) => setDraft({ ...draft, neededByDate: e.target.value })}
                className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="pr-deliveryLocation" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.deliveryLocation")}</label>
              <input id="pr-deliveryLocation" disabled={!editable} value={draft.deliveryLocation}
                onChange={(e) => setDraft({ ...draft, deliveryLocation: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="pr-deliveryContact" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.deliveryContact")}</label>
              <input id="pr-deliveryContact" disabled={!editable} value={draft.deliveryContact}
                onChange={(e) => setDraft({ ...draft, deliveryContact: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="pr-deliveryPhone" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.deliveryPhone")}</label>
              <input id="pr-deliveryPhone" disabled={!editable} value={draft.deliveryPhone}
                onChange={(e) => setDraft({ ...draft, deliveryPhone: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pr-headerRemark" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.headerRemark")}</label>
              <textarea id="pr-headerRemark" rows={3} disabled={!editable} value={draft.headerRemark}
                onChange={(e) => setDraft({ ...draft, headerRemark: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y leading-relaxed disabled:opacity-70" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div data-tour="prdoc-addline" className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseRequestDoc.linesTitle")}</h2>
            {editable && (
              <div className="flex items-center gap-2">
                <button onClick={() => openProductPicker()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("purchaseRequestDoc.addFromCatalog")}
                </button>
                <button onClick={addFreeLine} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("purchaseRequestDoc.addFreeLine")}
                </button>
              </div>
            )}
          </div>
          <div data-tour="prdoc-lines">
          {draft.lines.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("purchaseRequestDoc.linesEmpty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[
                      t("purchaseRequestDoc.col.productCode"), t("purchaseRequestDoc.col.description"), t("purchaseRequestDoc.col.unit"),
                      t("purchaseRequestDoc.col.warehouseRemaining"), t("purchaseRequestDoc.col.qtyRequested"), t("purchaseRequestDoc.col.neededByDate"),
                      t("purchaseRequestDoc.col.department"), t("purchaseRequestDoc.col.costCode"), "",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => {
                    const isCatalogLine = !!line.productId;
                    return (
                      <Fragment key={line.id}>
                      <tr className="border-b border-border/50">
                        <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{line.productCode}</td>
                        <td className="px-3 py-2 min-w-[200px]">
                          {isCatalogLine ? (
                            <span className="text-xs text-foreground">{line.description}</span>
                          ) : (
                            <input disabled={!editable} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })}
                              placeholder={t("purchaseRequestDoc.freeDescriptionPlaceholder")}
                              className="w-full text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {isCatalogLine ? (
                            <span className="text-xs text-muted-foreground">{line.unit}</span>
                          ) : (
                            <input disabled={!editable} value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                              className="w-16 text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <input disabled={!editable} value={line.warehouseRemainingQty} onChange={(e) => updateLine(line.id, { warehouseRemainingQty: e.target.value })}
                            className="w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" disabled={!editable} value={line.qtyRequested ?? ""} onChange={(e) => updateLine(line.id, { qtyRequested: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="date" disabled={!editable} value={line.neededByDate} onChange={(e) => updateLine(line.id, { neededByDate: e.target.value })}
                            className="w-32 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                        </td>
                        <td className="px-2 py-1.5">
                          {/* พิมพ์รหัสเองได้เหมือนเดิม แต่พิมพ์ไม่กี่ตัวก็ขึ้นรายการจากทะเบียนให้เลือก */}
                          <Combobox
                            disabled={!editable}
                            value={line.departmentCode}
                            onChange={(next) => updateLine(line.id, { departmentCode: next })}
                            options={codeComboboxOptions(codeEntries, "department")}
                            ariaLabel={t("purchaseRequestDoc.col.department")}
                            className="w-24 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70"
                          />
                        </td>
                        {/* รหัสบัญชี — เก็บและ sanitize มาตั้งแต่ 2026-08-27 แต่ไม่เคยมีช่องกรอก
                            จนกระทั่งมีทะเบียนรหัสให้เลือก (ฟิลด์ตายที่เพิ่งได้ใช้จริง) */}
                        <td className="px-2 py-1.5">
                          <Combobox
                            disabled={!editable}
                            value={line.costCode}
                            onChange={(next) => updateLine(line.id, { costCode: next })}
                            options={codeComboboxOptions(codeEntries, "account")}
                            ariaLabel={t("purchaseRequestDoc.col.costCode")}
                            className="w-28 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {editable && (
                            <button onClick={() => removeLine(line.id)} title={t("purchaseRequestDoc.removeLine")} className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-[#e05252] transition-opacity">
                              <X size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {/* บรรทัดรายละเอียดย่อย — แถวของตัวเองใต้รายการหลัก เยื้องเข้ามาเหมือนใบสั่งผลิต
                          ซ่อนทั้งแถวเมื่อเอกสารล็อกแล้วและไม่มีบรรทัดย่อย จะได้ไม่มีแถวว่างเปล่าคั่นตาราง */}
                      {((line.subDetails ?? []).length > 0 || editable) && (
                        <tr className="border-b border-border/50">
                          <td />
                          <td colSpan={7} className="px-3 pb-2 space-y-1">
                            {(line.subDetails ?? []).map((sd, i) => (
                              <div key={i} className="flex items-center gap-2 pl-4">
                                <CornerDownRight size={12} className="text-muted-foreground flex-shrink-0" />
                                <input
                                  disabled={!editable} value={sd}
                                  onChange={(e) => updateLine(line.id, { subDetails: (line.subDetails ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
                                  placeholder={t("purchaseRequestDoc.subDetailPlaceholder")}
                                  className="flex-1 min-w-[160px] text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70"
                                />
                                {editable && (
                                  <button onClick={() => updateLine(line.id, { subDetails: (line.subDetails ?? []).filter((_, j) => j !== i) })}
                                    title={t("purchaseRequestDoc.removeSubDetail")}
                                    className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-[#e05252] transition-opacity">
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                            ))}
                            {editable && (
                              <button onClick={() => updateLine(line.id, { subDetails: [...(line.subDetails ?? []), ""] })}
                                className="flex items-center gap-1.5 pl-4 text-xs text-muted-foreground hover:text-foreground transition-colors">
                                <Plus size={11} /> {t("purchaseRequestDoc.addSubDetail")}
                              </button>
                            )}
                            {/* บรรทัดที่พิมพ์เอง (ไม่มี productId) = สินค้าที่ยังไม่มีในคลัง — ให้ขอรหัสจากสโตร์ได้ตรงนี้
                                ปุ่มไม่ขึ้นกับสถานะเอกสาร เพราะการขอรหัสไม่ได้แก้เนื้อหาใบขอซื้อ */}
                            {canRequestProductCode && !line.productId && line.description.trim() !== "" && (
                              <button
                                onClick={() => void requestProductCode(line)}
                                disabled={requestingCodeFor === line.id}
                                title={t("purchaseRequestDoc.requestCodeHint")}
                                className="flex items-center gap-1.5 pl-4 text-xs text-[#c9a84c] hover:text-[#b8973f] transition-colors disabled:opacity-60">
                                {requestingCodeFor === line.id ? <Loader2 size={11} className="animate-spin" /> : <PackagePlus size={11} />}
                                {t("purchaseRequestDoc.requestCode")}
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>

        {/*
          การ์ดของสโตร์ (2026-09-09) — ไหลงานที่เจ้าของสั่ง: อนุมัติ → สโตร์เช็คของ → มีของ = จ่ายจบ /
          ไม่มี = ส่งต่อจัดซื้อ · ลอกโครงมาจากการ์ด "จ่ายของ (สโตร์)" ของใบเบิก ไม่ได้ออกแบบใหม่
          ไม่ถูกพิมพ์ลงกระดาษ เพราะฟอร์ม FM-PU-05 ไม่มีส่วนนี้
        */}
        {storeCardVisible && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <PackageCheck size={15} className="text-[#c9a84c]" /> {t("purchaseRequestDoc.store.title")}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t("purchaseRequestDoc.store.help")}</p>
              </div>
              {doc.storeReviewedAt && (
                <p className="text-xs text-muted-foreground">
                  {t("purchaseRequestDoc.store.reviewedBy")
                    .replace("{name}", doc.storeReviewedByName ?? "")
                    .replace("{date}", formatQuoteDateThai(doc.storeReviewedAt))}
                </p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[
                      t("purchaseRequestDoc.col.description"), t("purchaseRequestDoc.col.qtyRequested"),
                      t("purchaseRequestDoc.store.col.onHand"), t("purchaseRequestDoc.store.col.decision"),
                      t("purchaseRequestDoc.store.col.issued"), t("purchaseRequestDoc.store.col.issueNow"),
                    ].map((h, i) => (
                      <th key={`${i}-${h}`} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((line) => {
                    const stock = line.productId ? stockByProduct[line.productId] : undefined;
                    const issued = storeIssuedQtyOf(doc, line.id);
                    const outstanding = storeOutstandingQtyOf(doc, line);
                    const decision = storeDecisions[line.id];
                    const short = decision === "stock" && stock !== undefined && outstanding > stock;
                    return (
                      <tr key={line.id} className="border-b border-border/50">
                        <td className="px-3 py-2 text-xs text-foreground">
                          {line.description}
                          {!line.productId && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20 whitespace-nowrap">
                              {t("purchaseRequestDoc.store.noProductCode")}
                            </span>
                          )}
                          {short && (
                            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20 whitespace-nowrap">
                              <AlertTriangle size={10} /> {t("purchaseRequestDoc.store.shortBy").replace("{n}", (outstanding - (stock ?? 0)).toLocaleString())}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{(line.qtyRequested ?? 0).toLocaleString()} {line.unit}</td>
                        <td className={`px-3 py-2 text-xs font-mono whitespace-nowrap ${short ? "text-[#a75d1a]" : "text-muted-foreground"}`}>
                          {stock === undefined ? "—" : stock.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-1" role="group" aria-label={t("purchaseRequestDoc.store.col.decision")}>
                            {(["stock", "purchase"] as const).map((value) => (
                              <button
                                key={value}
                                onClick={() => setStoreDecisions((prev) => ({ ...prev, [line.id]: value }))}
                                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${decision === value
                                  ? "bg-[#c9a84c] text-[#0b1d3a] border-[#c9a84c] font-semibold"
                                  : "border-border text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40"}`}
                              >
                                {value === "stock" ? t("purchaseRequestDoc.store.decisionStock") : t("purchaseRequestDoc.store.decisionPurchase")}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-foreground whitespace-nowrap">{issued.toLocaleString()}</td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            disabled={decision !== "stock" || !line.productId || outstanding <= 0}
                            value={issueQty[line.id] ?? ""}
                            onChange={(e) => setIssueQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                            placeholder={outstanding > 0 ? String(outstanding) : ""}
                            className="w-20 text-xs font-mono text-foreground bg-secondary border border-border rounded px-1.5 py-1 outline-none focus:border-[#c9a84c]/50 disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="pr-store-remark" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.store.remark")}</label>
                <input id="pr-store-remark" value={storeRemark} onChange={(e) => setStoreRemark(e.target.value)}
                  className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
              <div>
                <label htmlFor="pr-store-issuedate" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.store.issuedDate")}</label>
                <input id="pr-store-issuedate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
                  className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </div>
            </div>
            <div>
              <label htmlFor="pr-store-issueremark" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.store.issueRemark")}</label>
              <input id="pr-store-issueremark" value={issueRemark} onChange={(e) => setIssueRemark(e.target.value)}
                className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors" />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => void saveStoreReview()} disabled={savingReview}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs border border-border rounded-lg text-foreground hover:border-[#c9a84c]/40 transition-colors disabled:opacity-60">
                {savingReview ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} {t("purchaseRequestDoc.store.saveReview")}
              </button>
              <button onClick={() => void saveStoreIssue()} disabled={savingIssue}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
                {savingIssue ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />} {t("purchaseRequestDoc.store.saveIssue")}
              </button>
            </div>

            {issueBatches.length > 0 && (
              <div className="border-t border-border pt-3 space-y-2">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <History size={13} /> {t("purchaseRequestDoc.store.historyTitle")}
                </h3>
                {issueBatches.map((batch) => (
                  <div key={batch.id} className="flex items-start justify-between gap-3 bg-secondary/40 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs text-foreground">
                        {t("purchaseRequestDoc.store.batchLabel").replace("{seq}", String(batch.seq))}
                        <span className="text-muted-foreground font-mono ml-2">{formatQuoteDateThai(batch.issuedDate)}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {batch.lines.map((bl) => {
                          const line = doc.lines.find((l) => l.id === bl.lineId);
                          return `${line?.description ?? bl.lineId} ${bl.qty.toLocaleString()} ${line?.unit ?? ""}`;
                        }).join(" · ")}
                        {batch.remark.trim() ? ` — ${batch.remark}` : ""}
                      </p>
                    </div>
                    {batch.id === lastBatch?.id && (
                      <button onClick={() => setCancelBatchTarget(batch)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors whitespace-nowrap">
                        <Undo2 size={11} /> {t("purchaseRequestDoc.store.cancelBatch")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ไฟล์แนบ — เจ้าของสั่งไว้ 2026-09-02 ("ใบขอซื้อสามารถทำให้แนบไฟล์ได้ด้วย")
            ใช้ระบบแนบไฟล์กลางตัวเดียวกับใบสั่งงาน · ไม่ล็อคตามสถานะเอกสาร แต่ล็อคตามสิทธิ์แก้
            เพราะใบเสนอราคาผู้ขาย/แคตตาล็อกมักตามมาหลังใบอนุมัติแล้ว */}
        <DocumentAttachmentsCard
          attachments={doc.attachments ?? []}
          disabled={!canEdit}
          onUpload={async (file) => { const updated = await uploadPurchaseRequestAttachment(doc.id, file); setDoc(updated); }}
          onDelete={async (attachmentId) => { const updated = await deletePurchaseRequestAttachment(doc.id, attachmentId); setDoc(updated); }}
        />

        {/* หมายเหตุการแก้ไข — โผล่เฉพาะเอกสารที่เป็นฉบับแก้ไข (มี -R{n} ต่อท้าย)
            ต่างจาก Scope of Work ตรงที่ข้อความนี้ถูกพิมพ์ลงบนเอกสารจริงด้วย */}
        {getRevisionNumber(doc.id) > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">{t("docRevision.noteTitle")}</h2>
            <p className="text-xs text-muted-foreground mb-2">{t("docRevision.noteHelp")}</p>
            <textarea
              rows={4}
              disabled={!editable}
              value={draft.revisionNote}
              onChange={(e) => setDraft({ ...draft, revisionNote: e.target.value })}
              placeholder={t("docRevision.notePlaceholder")}
              className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y leading-relaxed disabled:opacity-60"
            />
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseRequestDoc.signatoriesTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {([
              ["requestedBy", "requestedAt", t("purchaseRequestDoc.field.requestedBy")],
              ["approvedBy", "approvedAt", t("purchaseRequestDoc.field.approvedBy")],
              ["purchasingDeptBy", "purchasingDeptAt", t("purchaseRequestDoc.field.purchasingDeptBy")],
            ] as const).map(([nameField, dateField, label]) => (
              <div key={nameField} className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`pr-${nameField}`} className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input id={`pr-${nameField}`} disabled={!editable} value={draft[nameField]}
                    onChange={(e) => setDraft({ ...draft, [nameField]: e.target.value })}
                    className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                </div>
                <div>
                  <label htmlFor={`pr-${dateField}`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.date")}</label>
                  <input id={`pr-${dateField}`} type="date" disabled={!editable} value={draft[dateField]}
                    onChange={(e) => setDraft({ ...draft, [dateField]: e.target.value })}
                    className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <PurchaseRequestPrintDocument purchaseRequest={doc} companyHeader={companyHeader} />

      <ProductPickerModal
        open={pickerOpen}
        products={products}
        categories={categories}
        preferCategoryNames={MATERIAL_CATEGORY_NAMES}
        showStock
        onSelect={addProduct}
        onClose={() => setPickerOpen(false)}
      />

      <ConfirmDialog
        open={cancelBatchTarget !== null}
        title={t("purchaseRequestDoc.store.cancelConfirmTitle")}
        message={t("purchaseRequestDoc.store.cancelConfirmBody")}
        danger
        busy={cancellingBatch}
        confirmLabel={t("purchaseRequestDoc.store.cancelBatch")}
        onConfirm={() => { if (cancelBatchTarget) void cancelStoreIssue(cancelBatchTarget); }}
        onCancel={() => setCancelBatchTarget(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t("purchaseRequestDoc.deleteConfirmTitle")}
        message={t("purchaseRequestDoc.deleteConfirmMessage")}
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmPurchasingApprove}
        title={t("purchaseRequestDoc.purchasing.approveConfirmTitle")}
        message={t("purchaseRequestDoc.purchasing.approveConfirmBody")}
        confirmLabel={t("purchaseRequestDoc.purchasing.approve")}
        busy={purchasingBusy}
        onConfirm={() => void runPurchasingStage("approve")}
        onCancel={() => setConfirmPurchasingApprove(false)}
      />
      {/* เลือกว่ารอบนี้จะเอารายการไหน — ทำเป็นกล่องเฉพาะกิจเพราะ ConfirmDialog รับปุ่มยืนยันได้แค่ปุ่มเดียว */}
      {buyDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={() => setBuyDialogOpen(false)} />
          <div role="dialog" aria-modal="true" className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">{t("purchaseRequestDoc.buy.dialogTitle")}</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{t("purchaseRequestDoc.buy.dialogBody")}</p>
            <div className="space-y-2 pt-1">
              <button
                onClick={() => void createPurchaseOrderFromRequest(null)}
                disabled={creatingPo || remainingLines.length === 0}
                className="w-full text-left px-3 py-2 text-xs border border-border rounded-lg hover:border-[#c9a84c]/50 transition-colors disabled:opacity-50"
              >
                {t("purchaseRequestDoc.buy.optionRemaining").replace("{n}", String(remainingLines.length))}
              </button>
              <button
                onClick={() => void createPurchaseOrderFromRequest(selectedRemaining)}
                disabled={creatingPo || selectedRemaining.length === 0}
                className="w-full text-left px-3 py-2 text-xs border border-border rounded-lg hover:border-[#c9a84c]/50 transition-colors disabled:opacity-50"
              >
                {t("purchaseRequestDoc.buy.optionSelected").replace("{n}", String(selectedRemaining.length))}
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button onClick={() => setBuyDialogOpen(false)} disabled={creatingPo} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60">
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmPurchasingPull}
        title={t("purchaseRequestDoc.purchasing.pullConfirmTitle")}
        message={t("purchaseRequestDoc.purchasing.pullConfirmBody")}
        confirmLabel={t("purchaseRequestDoc.purchasing.pull")}
        busy={purchasingBusy}
        onConfirm={() => void runPurchasingStage("pull")}
        onCancel={() => setConfirmPurchasingPull(false)}
      />
      <ConfirmDialog
        open={confirmPurchasingReopen}
        title={t("purchaseRequestDoc.purchasing.reopenConfirmTitle")}
        message={t("purchaseRequestDoc.purchasing.reopenConfirmBody")}
        confirmLabel={t("purchaseRequestDoc.purchasing.reopen")}
        busy={purchasingBusy}
        onConfirm={() => void runPurchasingStage("reopen")}
        onCancel={() => setConfirmPurchasingReopen(false)}
      />
      <ConfirmDialog
        open={confirmRewrite}
        title={t("docRevision.rewriteConfirmTitle")}
        message={t("docRevision.rewriteConfirmBody")}
        confirmLabel={t("docRevision.rewrite")}
        busy={rewriting}
        onConfirm={() => void handleRewrite()}
        onCancel={() => setConfirmRewrite(false)}
      />
    </div>
  );
}
