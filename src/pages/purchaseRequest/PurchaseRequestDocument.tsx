import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer, Save, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X, CornerDownRight, PackagePlus, GitBranch, PackageCheck, CheckCircle2, History, Undo2, Lock, PackageMinus, ShoppingBag, Send, Info, ArrowRight, type LucideIcon } from "lucide-react";
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
import { RejectionNotice } from "../../components/DocumentApprovalActions";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { PurchaseRequestPrintDocument } from "./PurchaseRequestPrintDocument";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { Combobox } from "../../components/Combobox";
import { type CodeEntry, fetchCodeEntries, codeComboboxOptions } from "../../lib/codeRegister";
import { useI18n } from "../../lib/i18n";
import { getRevisionNumber, getRevisionRoot } from "../../lib/revisionDiff";
import { formatQuoteDateThai } from "../../lib/quotes";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { DocumentAttachmentsCard } from "../../components/DocumentAttachmentsCard";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { KitBreakdown } from "../../components/KitBreakdown";
import { useKitRecipes } from "../../hooks/useKitRecipes";
import { DocumentHeader, DocumentStepper, DocumentColumns, RailCard } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { btn, field, surface, table } from "../../components/ui/styles";
import {
  ApprovalStatusPill, ChoiceDialog, PersonRow, RailSummaryCard, StageTag, StepHint, SummaryBox,
  rejectButtonClass,
} from "./docShared";
import { useApprovalFlow } from "./useApprovalFlow";
import { purchaseRequestProgress, type PurchaseRequestStepKey } from "./purchaseRequestSteps";

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
  // สินค้าชุด (2026-09-29) — แตกชิ้นส่วนใต้ชื่อชุด (จ่ายจากคลังตัดที่ชิ้นส่วน)
  const kits = useKitRecipes();
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
  /** ตัวเลือกในกล่อง "ออกใบสั่งซื้อ" — เลือกแล้วต้องกดยืนยัน (ดีไซน์ใหม่ 2026-09-30 เดิมกดแล้วสร้างทันที) */
  const [buyChoice, setBuyChoice] = useState<"remaining" | "selected">("remaining");
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

  // ปุ่มเพิ่มรายการ (เฉพาะใบที่แก้ได้) และการ์ดสโตร์ (เฉพาะใบอนุมัติแล้ว + สิทธิ์จ่ายของ) ไม่มีเสมอ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  const docTourSteps: TourStep[] = [
    { element: '[data-tour="prdoc-actions"]', manual: "ch16-5", popover: { title: t("tour.prdoc.actions.title"), description: t("tour.prdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="prdoc-steps"]', manual: "ch18-1", popover: { title: t("tour.prdoc.steps.title"), description: t("tour.prdoc.steps.desc"), side: "bottom" } },
    { element: '[data-tour="prdoc-addline"]', popover: { title: t("tour.prdoc.addline.title"), description: t("tour.prdoc.addline.desc"), side: "bottom" } },
    { element: '[data-tour="prdoc-lines"]', manual: "ch18-5", popover: { title: t("tour.prdoc.lines.title"), description: t("tour.prdoc.lines.desc"), side: "top" } },
    { element: '[data-tour="prdoc-store"]', manual: "ch18-1", popover: { title: t("tour.prdoc.store.title"), description: t("tour.prdoc.store.desc"), side: "top" } },
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

  // ขั้นอนุมัติ (ส่งขออนุมัติ / อนุมัติ / ไม่อนุมัติ / ถอน) — hook จึงต้องอยู่เหนือ early return ด้านล่าง
  // เรียก route ด้วย `purchaseRequestId` ของหน้า ไม่ใช่ `doc.id` เพราะตอนนี้ doc อาจยังโหลดไม่เสร็จ
  const approvalFlow = useApprovalFlow<PurchaseRequest>({
    status: doc?.status ?? "Draft",
    canEdit: !!doc && canEdit,
    canApprove: !!doc && canFinalize,
    onSubmit: () => submitPurchaseRequestApproval(purchaseRequestId),
    onApprove: () => approvePurchaseRequest(purchaseRequestId),
    onReject: (c) => rejectPurchaseRequest(purchaseRequestId, c),
    onWithdraw: () => withdrawPurchaseRequestApproval(purchaseRequestId),
    onUpdated: (updated) => { setDoc(updated); setDraft(updated); dirty.markSaved(toUpdateFields(updated)); },
    showToast,
    summary: doc ? <SummaryBox primary={doc.id} secondary={doc.jobCode ? `${t("purchaseRequestDoc.jobCodePrefix")} ${doc.jobCode}` : undefined} aside={t("ui.itemCount").replace("{n}", String(doc.lines.length))} /> : undefined,
  });

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  // หน้าว่างระหว่างโหลด / โหลดไม่สำเร็จ — ยังมีลิงก์ "← ใบขอซื้อทั้งหมด" แบบเดียวกับหัวเอกสาร
  const backLink = (
    <button type="button" onClick={() => requestLeave(onBack)} className="self-start text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
      <ArrowLeft size={14} /> {t("purchaseRequestDoc.backToAll")}
    </button>
  );

  if (loadError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="bg-card border-b border-border px-4 md:px-8 py-3.5 flex">{backLink}</div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle size={20} className="text-[#b93636]" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button type="button" onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className={btn.secondary}>
            <RotateCw size={16} /> {t("purchaseRequest.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!doc || !draft) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="bg-card border-b border-border px-4 md:px-8 py-3.5 flex">{backLink}</div>
        <div className="flex flex-col items-center justify-center gap-2.5 p-6" role="status" aria-live="polite">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
          <p className="text-[13px] text-muted-foreground">{t("purchaseRequestDoc.loadingDocument")}</p>
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
  /** เลือกหลายรายการในกล่องเดียวแล้วกดยืนยัน (ดีไซน์ใหม่ 2026-09-30) — ต่อท้ายตามลำดับที่ติ๊ก */
  const addProducts = (list: Product[]) => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, ...list.map((product) => blankPurchaseRequestLine({ id: product.id, code: product.code, name: product.name, unit: product.unit }))] });
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

  // ── ค่าที่หน้าจอแบบใหม่ใช้ (ดีไซน์ใหม่ 2026-09-30) ─────────────────────────────────────────────
  const progress = purchaseRequestProgress(doc, purchasedLines);
  const stepLabel: Record<PurchaseRequestStepKey, string> = {
    draft: t("approval.step.draft"),
    pending: t("approval.step.pending"),
    approved: t("approval.step.final"),
    store: doc.storeStage === "closed" ? t("purchaseRequestDoc.step.storeClosed") : t("purchaseRequestDoc.step.store"),
    purchasing: t("purchaseRequestDoc.step.purchasing"),
    po: progress.toBuy > 0 ? `${t("purchaseRequestDoc.step.po")} ${progress.ordered} / ${progress.toBuy}` : t("purchaseRequestDoc.step.po"),
  };
  const deptLabel = t(PURCHASE_REQUEST_CODE_LABEL_KEY[purchaseRequestCodeOf(doc)]);
  const dateText = (iso: string) => (iso ? formatQuoteDateThai(iso) : "");
  const itemsText = (n: number) => t("ui.itemCount").replace("{n}", String(n));
  const summaryBox = (secondary?: ReactNode) => (
    <SummaryBox primary={doc.id} secondary={secondary ?? (doc.jobCode ? `${t("purchaseRequestDoc.jobCodePrefix")} ${doc.jobCode} · ${deptLabel}` : deptLabel)} aside={itemsText(doc.lines.length)} />
  );

  /**
   * ปุ่มขั้นถัดไปบนหัวเอกสาร — ตัวแรกที่ผู้ใช้คนนี้ทำได้เป็นปุ่มหลัก ที่เหลือเป็นปุ่มรอง
   * เงื่อนไขของแต่ละปุ่มลอกมาจากการ์ดเดิมทุกข้อ (การ์ดออกใบสั่งซื้อ / การ์ดฝ่ายจัดซื้อ) · เซิร์ฟเวอร์ยังคุมสิทธิ์จริง
   *
   * ออกใบสั่งซื้อ: ซ่อนระหว่างจัดซื้อยังไม่อนุมัติ (`review`) และเมื่อออกครบทุกบรรทัดแล้ว — เดิมเป็นปุ่มจาง
   * ตอนนี้กล่อง "ขั้นต่อไป" บอกเหตุผลแทน
   */
  const buyActionVisible = buyCardVisible && doc.purchasingStage !== "review" && remainingLines.length > 0;
  const purchasingApproveVisible = purchasingCardVisible && doc.purchasingStage !== "approved" && doc.storeStage !== "pending";
  const pullVisible = purchasingCardVisible && doc.purchasingStage !== "approved" && doc.storeStage === "pending";
  const openBuyDialog = () => {
    setBuyChoice(selectedRemaining.length > 0 ? "selected" : "remaining");
    setBuyDialogOpen(true);
  };
  type HeaderAction = { key: string; label: string; icon: LucideIcon; onClick: () => void; busy?: boolean };
  const headerActions = ([
    approvalFlow.canSubmit && { key: "submit", label: t("approval.submit"), icon: Send, onClick: approvalFlow.submit, busy: approvalFlow.busy === "submit" },
    approvalFlow.canDecide && { key: "approve", label: t("approval.approve"), icon: CheckCircle2, onClick: approvalFlow.approve, busy: approvalFlow.busy === "approve" },
    buyActionVisible && { key: "buy", label: t("purchaseRequestDoc.buy.create"), icon: ShoppingBag, onClick: openBuyDialog, busy: creatingPo },
    purchasingApproveVisible && { key: "purchasingApprove", label: t("purchaseRequestDoc.purchasing.approve"), icon: CheckCircle2, onClick: () => setConfirmPurchasingApprove(true), busy: purchasingBusy },
    pullVisible && { key: "pull", label: t("purchaseRequestDoc.purchasing.pull"), icon: PackageMinus, onClick: () => setConfirmPurchasingPull(true), busy: purchasingBusy },
  ] as (HeaderAction | false)[]).filter((a): a is HeaderAction => !!a);
  const [primaryAction, ...otherActions] = headerActions;
  const actionButton = (a: HeaderAction, primary: boolean) => {
    const Icon = a.icon;
    return (
      <button key={a.key} type="button" onClick={a.onClick} disabled={!!a.busy || approvalFlow.busy !== null} className={primary ? btn.primary : btn.secondary}>
        {a.busy ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />} {a.label}
      </button>
    );
  };

  /** ข้อความบนหัวข้างป้ายสถานะ: สถานะบันทึกอัตโนมัติขณะแก้ได้ · ใบที่ถูกล็อกบอกว่าล็อกเพราะอะไร */
  const headerMeta = autoSaveEditable
    ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />
    : doc.status === "PendingApproval"
      ? <><Lock size={14} /> {t("purchaseRequest.shared.lockedPending")}</>
      : doc.purchasingStage === "approved"
        ? <><Lock size={14} /> {t("purchaseRequestDoc.lockedPurchasing")}</>
        : undefined;

  /** กล่อง "ขั้นต่อไป" บนคอลัมน์ขวา — ข้อความเดิมของแถบสถานะ/การ์ดต่าง ๆ ย้ายมารวมที่นี่ */
  const nextStep: { tone: "info" | "waiting"; text: string } =
    doc.status === "Draft"
      ? { tone: "info", text: t((doc.rejectionComment ?? "").trim() ? "approval.step.hint.draftRejected" : "approval.step.hint.draft") }
      : doc.status === "PendingApproval"
        ? { tone: "waiting", text: t("approval.step.hint.pending").replace("{approver}", t("purchaseRequestDoc.approverLabel")) }
        : doc.storeStage === "pending"
          ? { tone: canIssueStock ? "info" : "waiting", text: pullVisible ? `${t("purchaseRequestDoc.store.hintPending")} · ${t("purchaseRequestDoc.purchasing.pullHelp")}` : t("purchaseRequestDoc.store.hintPending") }
          : doc.storeStage === "closed"
            ? { tone: "info", text: t("purchaseRequestDoc.store.hintClosed") }
            : doc.purchasingStage === "review"
              ? { tone: purchasingCardVisible ? "info" : "waiting", text: purchasingCardVisible ? t("purchaseRequestDoc.purchasing.help") : t("purchaseRequestDoc.buy.needApproval") }
              : progress.current >= progress.steps.length
                ? { tone: "info", text: t("purchaseRequestDoc.buy.summaryAll").replace("{total}", String(progress.toBuy)) }
                : buyCardVisible
                  ? { tone: "info", text: t("purchaseRequestDoc.hint.buy") }
                  : { tone: "waiting", text: t("purchaseRequestDoc.store.hintForwarded") };

  const signatories = [
    ["requestedBy", "requestedAt", t("purchaseRequestDoc.field.requestedBy")],
    ["approvedBy", "approvedAt", t("purchaseRequestDoc.field.approvedBy")],
    ["purchasingDeptBy", "purchasingDeptAt", t("purchaseRequestDoc.field.purchasingDeptBy")],
  ] as const;

  const lastBatchSummary = cancelBatchTarget
    ? cancelBatchTarget.lines.map((bl) => {
      const line = doc.lines.find((l) => l.id === bl.lineId);
      return `${line?.description ?? bl.lineId} ${bl.qty.toLocaleString()} ${line?.unit ?? ""}`.trim();
    }).join(" · ")
    : "";

  const buyMode = buyCardVisible;

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-20 print:hidden">
        <DocumentHeader
          backLabel={t("purchaseRequestDoc.backToAll")}
          onBack={() => requestLeave(onBack)}
          number={doc.id}
          status={<><ApprovalStatusPill status={doc.status} /><StageTag tone="grey">{deptLabel}</StageTag></>}
          meta={headerMeta}
          actions={
            <div data-tour="prdoc-actions" className="flex items-center gap-2.5 flex-wrap">
              <TourReplayButton variant="title" onClick={docTour.start} />
              {canPrint && (
                <button type="button" onClick={handlePrint} disabled={printing} className={btn.secondary}>
                  {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} {t("purchaseRequestDoc.print")}
                </button>
              )}
              {/* ปุ่ม "บันทึกร่าง" คงไว้ตามเจ้าของสั่ง (2026-09-30) แม้บอร์ดจะไม่มี — บันทึกอัตโนมัติยังทำงานอยู่ด้วย */}
              {editable && (
                <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("purchaseRequestDoc.saveDraft")}
                </button>
              )}
              {otherActions.map((a) => actionButton(a, false))}
              {approvalFlow.canDecide && (
                <button type="button" onClick={approvalFlow.reject} disabled={approvalFlow.busy !== null} className={rejectButtonClass}>
                  {t("approval.reject")}
                </button>
              )}
              <MoreMenu
                items={[
                  canEdit && isFinal && { key: "rewrite", label: t("docRevision.rewrite"), icon: GitBranch, hint: t("purchaseRequestDoc.rewriteHint"), disabled: rewriting, onSelect: () => setConfirmRewrite(true) },
                  purchasingCardVisible && doc.purchasingStage === "approved" && { key: "reopen", label: t("purchaseRequestDoc.purchasing.reopen"), icon: Undo2, hint: t("purchaseRequestDoc.reopenHint"), disabled: purchasingBusy, onSelect: () => setConfirmPurchasingReopen(true) },
                  approvalFlow.canWithdraw && { key: "withdraw", label: t("approval.withdraw"), icon: Undo2, hint: t("purchaseRequest.shared.withdrawHint"), disabled: approvalFlow.busy !== null, onSelect: approvalFlow.withdraw },
                  canDelete && { key: "delete", label: t("purchaseRequestDoc.deleteConfirmTitle"), icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
              {primaryAction && actionButton(primaryAction, true)}
            </div>
          }
        />
      </div>

      <div className="px-4 md:px-8 py-6 flex flex-col gap-5 print:hidden">
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

        {/* ขั้น Final ของใบขอซื้อไม่ได้จบที่ "อนุมัติแล้ว" ตั้งแต่ 2026-09-09 — ยังต้องผ่านสโตร์แล้วถึงจัดซื้อ
            แถบนี้แสดงครบ 6 ขั้น คำนวณจากฟิลด์ที่มีอยู่ (ดู purchaseRequestSteps.ts) ไม่เพิ่มสถานะใหม่ให้ทั้งระบบ */}
        <div data-tour="prdoc-steps">
          <DocumentStepper
            steps={progress.steps.map((k) => ({ label: stepLabel[k] }))}
            current={progress.current}
            ariaLabel={t("purchaseRequest.shared.stepsAria")}
          />
        </div>
        <RejectionNotice comment={doc.rejectionComment ?? ""} />

        {/* จัดซื้อกำลังแก้ใบที่หัวหน้าเซ็นไปแล้ว — ต้องเห็นชัดว่าไม่ใช่การแก้ใบร่างธรรมดา */}
        {purchasingEditMode && (
          <div className="rounded-xl bg-[#fdf3e0] border border-[#efd3a0] px-4 py-3.5 flex gap-3">
            <AlertTriangle size={18} className="text-[#8a5a00] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-[#6b4600]">{t("purchaseRequestDoc.purchasingEdit.title")}</p>
                <p className="text-[13px] text-[#6b4600] leading-relaxed">{t("purchaseRequestDoc.purchasingEdit.help")}</p>
              </div>
              <input
                value={purchasingEditNote}
                onChange={(e) => setPurchasingEditNote(e.target.value)}
                placeholder={t("purchaseRequestDoc.purchasingEdit.notePlaceholder")}
                aria-label={t("purchaseRequestDoc.purchasingEdit.notePlaceholder")}
                className={`${field.input} w-full`}
              />
              {(doc.purchasingEdits ?? []).length > 0 && (
                <ul className="flex flex-col gap-1">
                  {(doc.purchasingEdits ?? []).map((e, i) => (
                    <li key={`${e.at}-${i}`} className="text-xs text-[#6b4600]">
                      <span className="tabular-nums">{formatQuoteDateThai(e.at.slice(0, 10))}</span> · {e.byName}
                      {e.note.trim() ? ` — ${e.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <DocumentColumns
          main={
            <>
              <SectionCard title={t("purchaseRequestDoc.infoTitle")}>
                {/* ผู้จำหน่าย / โทร.ผู้จำหน่าย / เครดิต / ขนส่งโดย ถูกถอดออก 2026-08-31 ตามที่เจ้าของสั่ง
                    — คนขอซื้อไม่ใช่คนกรอกช่องพวกนี้ ฝ่ายจัดซื้อกรอกตอนออกใบสั่งซื้อจากทะเบียนผู้ขาย */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px] items-start">
                  <ReadonlyField label={t("purchaseRequest.col.jobCode")} value={doc.jobCode} mono />
                  <ReadonlyField label={t("purchaseRequest.code.label")} value={<><span className="font-mono">{purchaseRequestCodeOf(doc)}</span> — {deptLabel}</>} />
                  {editable ? (
                    <>
                      <Field label={t("purchaseRequestDoc.field.issueDate")} htmlFor="pr-issueDate">
                        <input id="pr-issueDate" type="date" value={draft.issueDate} onChange={(e) => setDraft({ ...draft, issueDate: e.target.value })} className={`${field.input} w-full`} />
                      </Field>
                      <Field label={t("purchaseRequestDoc.field.neededByDate")} htmlFor="pr-neededByDate">
                        <input id="pr-neededByDate" type="date" value={draft.neededByDate} onChange={(e) => setDraft({ ...draft, neededByDate: e.target.value })} className={`${field.input} w-full`} />
                      </Field>
                      <Field label={t("purchaseRequestDoc.field.deliveryContact")} htmlFor="pr-deliveryContact">
                        <input id="pr-deliveryContact" value={draft.deliveryContact} onChange={(e) => setDraft({ ...draft, deliveryContact: e.target.value })} className={`${field.input} w-full`} />
                      </Field>
                      <Field label={t("purchaseRequestDoc.field.deliveryPhone")} htmlFor="pr-deliveryPhone">
                        <input id="pr-deliveryPhone" value={draft.deliveryPhone} onChange={(e) => setDraft({ ...draft, deliveryPhone: e.target.value })} className={`${field.input} w-full`} />
                      </Field>
                      <Field label={t("purchaseRequestDoc.field.deliveryLocation")} htmlFor="pr-deliveryLocation" className="sm:col-span-3">
                        <input id="pr-deliveryLocation" value={draft.deliveryLocation} onChange={(e) => setDraft({ ...draft, deliveryLocation: e.target.value })} className={`${field.input} w-full`} />
                      </Field>
                      <Field label={t("purchaseRequestDoc.field.headerRemark")} htmlFor="pr-headerRemark" className="sm:col-span-3">
                        <textarea id="pr-headerRemark" rows={3} value={draft.headerRemark} onChange={(e) => setDraft({ ...draft, headerRemark: e.target.value })} className={`${field.textarea} w-full resize-y`} />
                      </Field>
                    </>
                  ) : (
                    <>
                      <ReadonlyField label={t("purchaseRequestDoc.field.issueDate")} value={dateText(doc.issueDate)} />
                      <ReadonlyField label={t("purchaseRequestDoc.field.neededByDate")} value={dateText(doc.neededByDate)} />
                      <ReadonlyField label={t("purchaseRequestDoc.field.deliveryContact")} value={doc.deliveryContact} />
                      <ReadonlyField label={t("purchaseRequestDoc.field.deliveryPhone")} value={doc.deliveryPhone} />
                      <ReadonlyField label={t("purchaseRequestDoc.field.deliveryLocation")} value={doc.deliveryLocation} className="sm:col-span-3" />
                      <ReadonlyField label={t("purchaseRequestDoc.field.headerRemark")} value={doc.headerRemark} className="sm:col-span-3 whitespace-pre-line" />
                    </>
                  )}
                </div>
              </SectionCard>

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
              {isRevision && (
                <SectionCard title={<span id="pr-revisionNote-heading">{t("docRevision.noteTitle")}</span>} subtitle={t("docRevision.noteHelp")}>
                  <textarea
                    rows={4}
                    disabled={!editable}
                    aria-labelledby="pr-revisionNote-heading"
                    value={draft.revisionNote}
                    onChange={(e) => setDraft({ ...draft, revisionNote: e.target.value })}
                    placeholder={t("docRevision.notePlaceholder")}
                    className={`${field.textarea} w-full resize-y`}
                  />
                </SectionCard>
              )}
            </>
          }
          rail={
            <>
              {isFinal && doc.storeStage !== "pending" && doc.storeStage !== "closed" && progress.toBuy > 0 ? (
                <RailSummaryCard
                  label={t("purchaseRequestDoc.summary.ordered")}
                  value={`${progress.ordered} / ${progress.toBuy}`}
                  valueNote={t("purchaseRequestDoc.summary.unit")}
                  progress={{ value: progress.ordered, max: progress.toBuy, label: t("purchaseRequestDoc.summary.ordered") }}
                  rows={[
                    { label: t("purchaseRequestDoc.summary.toBuy"), value: itemsText(progress.toBuy) },
                    { label: t("purchaseRequestDoc.summary.fromStock"), value: itemsText(progress.fromStock) },
                    { label: t("purchaseRequestDoc.summary.poList"), value: progress.purchaseOrders.length > 0 ? <span className="font-mono text-[12.5px]">{progress.purchaseOrders.join(", ")}</span> : "—" },
                  ]}
                />
              ) : (
                <RailSummaryCard
                  label={t("purchaseRequestDoc.summary.requestLines")}
                  value={String(draft.lines.length)}
                  valueNote={t("purchaseRequestDoc.summary.unit")}
                  rows={[
                    { label: t("purchaseRequest.col.jobCode"), value: doc.jobCode ? <span className="font-mono text-[12.5px]">{doc.jobCode}</span> : "—" },
                    { label: t("purchaseRequestDoc.field.neededByDate"), value: dateText(draft.neededByDate) || "—" },
                    ...(isFinal && doc.storeStage === "closed" ? [{ label: t("purchaseRequestDoc.summary.fromStock"), value: itemsText(progress.fromStock) }] : []),
                  ]}
                />
              )}

              <RailCard title={t("purchaseRequestDoc.signatoriesTitle")}>
                {editable ? (
                  signatories.map(([nameField, dateField, label]) => (
                    <div key={nameField} className="flex flex-col gap-1.5">
                      <label htmlFor={`pr-${nameField}`} className={field.label}>{label}</label>
                      <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                        <input id={`pr-${nameField}`} value={draft[nameField]} onChange={(e) => setDraft({ ...draft, [nameField]: e.target.value })} className={`${field.input} w-full min-w-0`} />
                        <input type="date" aria-label={`${t("materialRequisitionDoc.field.date")} — ${label}`} value={draft[dateField]} onChange={(e) => setDraft({ ...draft, [dateField]: e.target.value })} className={`${field.input} w-full min-w-0 px-2`} />
                      </div>
                    </div>
                  ))
                ) : (
                  signatories.map(([nameField, dateField, label]) => (
                    <PersonRow key={nameField} role={label} name={doc[nameField]} date={dateText(doc[dateField])} />
                  ))
                )}
                {doc.purchasingStage === "approved" && (
                  <div className="px-3 py-2.5 rounded-lg bg-[#e6f4ec] text-[#14603b] text-[13px] flex items-start gap-2">
                    <Lock size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      {t("purchaseRequestDoc.purchasing.approvedBanner")}
                      {(doc.purchasingDeptBy || doc.purchasingDeptAt) && (
                        <span className="block text-xs mt-0.5">
                          {t("purchaseRequestDoc.purchasing.approvedBy")
                            .replace("{name}", doc.purchasingDeptBy || "")
                            .replace("{date}", doc.purchasingDeptAt ? formatQuoteDateThai(doc.purchasingDeptAt) : "")}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </RailCard>

              <StepHint tone={nextStep.tone} title={t("purchaseRequest.shared.nextStep")}>{nextStep.text}</StepHint>
            </>
          }
        />

        {/* รายการ + ช่องติ๊กออกใบสั่งซื้อ (2026-09-30 รวมการ์ด "ออกใบสั่งซื้อ" เดิมเข้ามาในตารางนี้)
            เจ้าของข้อ 7 (2026-09-21): ใบขอซื้อใบเดียว "อาจจะเปิดซื้อจากหลายบริษัทก็ได้ คือที่ติ้กไปแล้วก็เวลาจะเปิด PO
            ก็จะมีให้เลือกว่าจะเอาทั้งหมดหรือเอาแค่ที่ติ๊ก" · การติ๊กเป็น state ของหน้าจอล้วน ไม่ได้บันทึก ·
            "ซื้อไปแล้วหรือยัง" มาจาก purchasedLines ที่เซิร์ฟเวอร์คำนวณจากใบสั่งซื้อจริง ลบใบสั่งซื้อทิ้งแล้วบรรทัดกลับมาซื้อได้เอง */}
        <section className={surface.card}>
          <div className={`${surface.cardHead} flex-wrap`}>
            <h2 className={surface.cardTitle}>{t("purchaseRequestDoc.linesTitle")}</h2>
            <span className="flex-1 text-[13px] text-muted-foreground">
              {buyMode
                ? t("purchaseRequestDoc.lines.summaryBuy").replace("{n}", String(doc.lines.length)).replace("{buy}", String(progress.toBuy)).replace("{done}", String(progress.ordered))
                : itemsText(draft.lines.length)}
            </span>
            {buyMode && remainingLines.length > 0 && (
              <span className="text-[13px] text-[#3d5173]" role="status" aria-live="polite">
                {t("purchaseRequestDoc.lines.selected").replace("{n}", String(selectedRemaining.length))}
              </span>
            )}
            {editable && (
              <div data-tour="prdoc-addline" className="flex items-center gap-2">
                <button type="button" onClick={() => openProductPicker()} className={btn.secondarySm}>
                  <Plus size={15} /> {t("purchaseRequestDoc.addFromCatalog")}
                </button>
                <button type="button" onClick={addFreeLine} className={btn.secondarySm}>
                  <Plus size={15} /> {t("purchaseRequestDoc.addFreeLine")}
                </button>
              </div>
            )}
          </div>
          <div data-tour="prdoc-lines">
            {draft.lines.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("purchaseRequestDoc.linesEmpty")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className={`w-full ${editable ? "min-w-[1080px]" : "min-w-[960px]"}`}>
                  <thead>
                    <tr className={table.head}>
                      {buyMode && <th className={`${table.th} w-10`}><span className="sr-only">{t("purchaseRequestDoc.buy.columnLabel")}</span></th>}
                      <th className={`${table.th} w-8`}>#</th>
                      <th className={table.th}>{t("purchaseRequestDoc.col.productCode")}</th>
                      <th className={table.th}>{t("purchaseRequestDoc.col.description")}</th>
                      <th className={table.th}>{t("purchaseRequestDoc.col.unit")}</th>
                      <th className={`${table.th} text-right`}>{t("purchaseRequestDoc.col.warehouseRemaining")}</th>
                      <th className={`${table.th} text-right`}>{t("purchaseRequestDoc.col.qtyRequested")}</th>
                      <th className={table.th}>{t("purchaseRequestDoc.col.neededByDate")}</th>
                      <th className={table.th}>{t("purchaseRequestDoc.col.department")}</th>
                      <th className={table.th}>{t("purchaseRequestDoc.col.costCode")}</th>
                      {buyMode && <th className={table.th}>{t("purchaseRequestDoc.buy.columnLabel")}</th>}
                      {editable && <th className={`${table.th} w-10`}><span className="sr-only">{t("purchaseRequestDoc.removeLine")}</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((line, idx) => {
                      const isCatalogLine = !!line.productId;
                      const fromStock = line.storeDecision === "stock";
                      const orderedIn = purchasedLines[line.id] ?? [];
                      const ordered = orderedIn.length > 0;
                      const ticked = !ordered && !fromStock && buySelection.includes(line.id);
                      const subDetails = line.subDetails ?? [];
                      return (
                        <tr key={line.id} className={`border-b border-[#eef1f6] align-top ${ticked ? "bg-[#f4f7fc]" : "bg-white"}`}>
                          {buyMode && (
                            <td className={`${table.td} py-3.5`}>
                              {!fromStock && (
                                <input
                                  type="checkbox"
                                  checked={ticked || ordered}
                                  disabled={ordered}
                                  onChange={(e) => setBuySelection((prev) => (e.target.checked ? [...prev, line.id] : prev.filter((x) => x !== line.id)))}
                                  aria-label={line.description}
                                  className="w-[18px] h-[18px] mt-0.5 accent-[#0b1d3a] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                />
                              )}
                            </td>
                          )}
                          <td className={`${table.td} py-3.5 text-[13px] text-muted-foreground tabular-nums`}>{idx + 1}</td>
                          <td className={`${table.td} py-3.5 font-mono text-[13px] whitespace-nowrap ${line.productCode ? "text-foreground" : "text-[#8a97ad]"}`}>{line.productCode || "—"}</td>
                          <td className={`${table.td} ${editable ? "py-2" : "py-3.5"} min-w-[240px]`}>
                            <div className="flex flex-col gap-1.5 min-w-0">
                              {isCatalogLine || !editable ? (
                                <span className="text-sm font-medium text-foreground">
                                  {line.description || <span className="text-[#8a97ad]">—</span>}
                                  <KitBreakdown productId={line.productId} qty={line.qtyRequested} kits={kits} />
                                </span>
                              ) : (
                                <input value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })}
                                  placeholder={t("purchaseRequestDoc.freeDescriptionPlaceholder")}
                                  aria-label={t("purchaseRequestDoc.col.description")}
                                  className={`${field.cell} w-full`} />
                              )}
                              {/* บรรทัดรายละเอียดย่อย — พิมพ์เยื้องใต้รายการหลัก · ใบที่ล็อกแล้วแสดงเป็นหัวข้อย่อย */}
                              {editable ? subDetails.map((sd, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <CornerDownRight size={14} className="text-[#a3aec2] flex-shrink-0" />
                                  <input
                                    value={sd}
                                    onChange={(e) => updateLine(line.id, { subDetails: subDetails.map((x, j) => (j === i ? e.target.value : x)) })}
                                    placeholder={t("purchaseRequestDoc.subDetailPlaceholder")}
                                    aria-label={t("purchaseRequestDoc.subDetailPlaceholder")}
                                    className={`${field.cell} flex-1 min-w-0 text-[13px]`}
                                  />
                                  <button type="button" onClick={() => updateLine(line.id, { subDetails: subDetails.filter((_, j) => j !== i) })}
                                    title={t("purchaseRequestDoc.removeSubDetail")} aria-label={t("purchaseRequestDoc.removeSubDetail")}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] flex-shrink-0">
                                    <X size={14} />
                                  </button>
                                </div>
                              )) : subDetails.map((sd, i) => (
                                <span key={i} className="text-[12.5px] text-muted-foreground flex gap-1.5"><span aria-hidden="true">•</span>{sd}</span>
                              ))}
                              {editable && (
                                <button type="button" onClick={() => updateLine(line.id, { subDetails: [...subDetails, ""] })} className={`${btn.text} self-start h-8 text-[13px]`}>
                                  <Plus size={14} /> {t("purchaseRequestDoc.addSubDetail")}
                                </button>
                              )}
                              {/* บรรทัดที่พิมพ์เอง (ไม่มี productId) = สินค้าที่ยังไม่มีในคลัง — ขอรหัสจากสโตร์ได้ตรงนี้
                                  ปุ่มไม่ขึ้นกับสถานะเอกสาร เพราะการขอรหัสไม่ได้แก้เนื้อหาใบขอซื้อ */}
                              {canRequestProductCode && !line.productId && line.description.trim() !== "" && (
                                <button type="button" onClick={() => void requestProductCode(line)} disabled={requestingCodeFor === line.id}
                                  title={t("purchaseRequestDoc.requestCodeHint")} className={`${btn.text} self-start h-8 text-[13px]`}>
                                  {requestingCodeFor === line.id ? <Loader2 size={14} className="animate-spin" /> : <PackagePlus size={14} />}
                                  {t("purchaseRequestDoc.requestCode")}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className={`${table.td} ${editable ? "py-2" : "py-3.5"} text-sm text-[#3d5173]`}>
                            {isCatalogLine || !editable ? line.unit : (
                              <input value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} aria-label={t("purchaseRequestDoc.col.unit")} className={`${field.cell} w-20`} />
                            )}
                          </td>
                          <td className={`${table.td} ${editable ? "py-2" : "py-3.5"} text-right tabular-nums text-sm text-[#3d5173]`}>
                            {editable ? (
                              <input value={line.warehouseRemainingQty} onChange={(e) => updateLine(line.id, { warehouseRemainingQty: e.target.value })} aria-label={t("purchaseRequestDoc.col.warehouseRemaining")} className={`${field.cell} w-20 text-right tabular-nums`} />
                            ) : (line.warehouseRemainingQty || <span className="text-[#8a97ad]">—</span>)}
                          </td>
                          <td className={`${table.td} ${editable ? "py-2" : "py-3.5"} text-right tabular-nums text-sm font-semibold`}>
                            {editable ? (
                              <input type="number" value={line.qtyRequested ?? ""} onChange={(e) => updateLine(line.id, { qtyRequested: e.target.value === "" ? null : Number(e.target.value) })} aria-label={t("purchaseRequestDoc.col.qtyRequested")} className={`${field.cell} w-24 text-right tabular-nums`} />
                            ) : (line.qtyRequested ?? 0).toLocaleString()}
                          </td>
                          <td className={`${table.td} ${editable ? "py-2" : "py-3.5"} text-sm text-[#3d5173] whitespace-nowrap`}>
                            {editable ? (
                              <input type="date" value={line.neededByDate} onChange={(e) => updateLine(line.id, { neededByDate: e.target.value })} aria-label={t("purchaseRequestDoc.col.neededByDate")} className={`${field.cell} w-[150px]`} />
                            ) : (dateText(line.neededByDate) || <span className="text-[#8a97ad]">—</span>)}
                          </td>
                          <td className={`${table.td} ${editable ? "py-2" : "py-3.5"} font-mono text-[13px] text-[#3d5173]`}>
                            {/* พิมพ์รหัสเองได้เหมือนเดิม แต่พิมพ์ไม่กี่ตัวก็ขึ้นรายการจากทะเบียนให้เลือก */}
                            {editable ? (
                              <Combobox
                                value={line.departmentCode}
                                onChange={(next) => updateLine(line.id, { departmentCode: next })}
                                options={codeComboboxOptions(codeEntries, "department")}
                                ariaLabel={t("purchaseRequestDoc.col.department")}
                                className={`${field.cell} w-24 font-mono`}
                              />
                            ) : (line.departmentCode || <span className="text-[#8a97ad]">—</span>)}
                          </td>
                          {/* รหัสบัญชี — เก็บและ sanitize มาตั้งแต่ 2026-08-27 แต่ไม่เคยมีช่องกรอก
                              จนกระทั่งมีทะเบียนรหัสให้เลือก (ฟิลด์ตายที่เพิ่งได้ใช้จริง) */}
                          <td className={`${table.td} ${editable ? "py-2" : "py-3.5"} font-mono text-[13px] text-[#3d5173]`}>
                            {editable ? (
                              <Combobox
                                value={line.costCode}
                                onChange={(next) => updateLine(line.id, { costCode: next })}
                                options={codeComboboxOptions(codeEntries, "account")}
                                ariaLabel={t("purchaseRequestDoc.col.costCode")}
                                className={`${field.cell} w-28 font-mono`}
                              />
                            ) : (line.costCode || <span className="text-[#8a97ad]">—</span>)}
                          </td>
                          {buyMode && (
                            <td className={`${table.td} py-3.5`}>
                              {fromStock ? (
                                <StageTag tone="green">{t("purchaseRequest.stage.closed")}</StageTag>
                              ) : ordered ? (
                                <span className="font-mono text-[13px] font-medium text-[#1a5fb4]" title={t("purchaseRequestDoc.buy.alreadyOrdered")}>{orderedIn.join(", ")}</span>
                              ) : (
                                <span className="text-[13px] text-[#8a97ad]">{t("purchaseRequestDoc.buy.notYet")}</span>
                              )}
                            </td>
                          )}
                          {editable && (
                            <td className={`${table.td} py-2`}>
                              <button type="button" onClick={() => removeLine(line.id)} title={t("purchaseRequestDoc.removeLine")} aria-label={t("purchaseRequestDoc.removeLine")}
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {buyMode && (
            <div className="px-6 pt-3 pb-4 flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info size={14} className="flex-shrink-0" /> {t("purchaseRequestDoc.lines.footer")}
              </p>
              {doc.purchasingStage === "review" && (
                <p className="text-xs text-[#8a5a00] flex items-center gap-1.5">
                  <AlertTriangle size={14} className="flex-shrink-0" /> {t("purchaseRequestDoc.buy.needApproval")}
                </p>
              )}
              {/* ฉบับแก้ไขเริ่มนับรายการที่ซื้อแล้วใหม่ (บรรทัดคง id เดิม แต่ใบสั่งซื้อยังชี้ฉบับก่อน) —
                  เลือกยอมรับตามความหมายของ Rewrite ทั้งระบบ แต่ต้องเตือนไม่ให้ซื้อซ้ำโดยไม่รู้ตัว */}
              {isRevision && orderedCount === 0 && (
                <p className="text-xs text-[#8a5a00] flex items-start gap-1.5">
                  <AlertTriangle size={14} className="mt-px flex-shrink-0" /> {t("purchaseRequestDoc.buy.rewriteWarning")}
                </p>
              )}
            </div>
          )}
        </section>

        {/*
          การ์ดของสโตร์ (2026-09-09) — ไหลงานที่เจ้าของสั่ง: อนุมัติ → สโตร์เช็คของ → มีของ = จ่ายจบ /
          ไม่มี = ส่งต่อจัดซื้อ · ไม่ถูกพิมพ์ลงกระดาษ เพราะฟอร์ม FM-PU-05 ไม่มีส่วนนี้
        */}
        {storeCardVisible && (
          <section className={surface.card}>
            <div data-tour="prdoc-store" className="px-6 py-4 border-b border-[#eef1f6] flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[16rem] flex flex-col gap-1">
                <h2 className={surface.cardTitle}>{t("purchaseRequestDoc.store.title")}</h2>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{t("purchaseRequestDoc.store.help")}</p>
              </div>
              {doc.storeReviewedAt && (
                <p className="text-[12.5px] text-[#1b7f4f] inline-flex items-center gap-1.5 pt-0.5">
                  <CheckCircle2 size={14} />
                  {t("purchaseRequestDoc.store.reviewedBy")
                    .replace("{name}", doc.storeReviewedByName ?? "")
                    .replace("{date}", formatQuoteDateThai(doc.storeReviewedAt))}
                </p>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("purchaseRequestDoc.col.description")}</th>
                    <th className={`${table.th} text-right`}>{t("purchaseRequestDoc.col.qtyRequested")}</th>
                    <th className={`${table.th} text-right`}>{t("purchaseRequestDoc.store.col.onHand")}</th>
                    <th className={table.th}>{t("purchaseRequestDoc.store.col.decision")}</th>
                    <th className={`${table.th} text-right`}>{t("purchaseRequestDoc.store.col.issued")}</th>
                    <th className={`${table.th} text-right`}>{t("purchaseRequestDoc.store.col.issueNow")}</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((line) => {
                    const stock = line.productId ? stockByProduct[line.productId] : undefined;
                    const issued = storeIssuedQtyOf(doc, line.id);
                    const outstanding = storeOutstandingQtyOf(doc, line);
                    const decision = storeDecisions[line.id];
                    const short = decision === "stock" && stock !== undefined && outstanding > stock;
                    const canIssueLine = decision === "stock" && !!line.productId && outstanding > 0;
                    const whyNot = outstanding <= 0 ? t("purchaseRequestDoc.store.whyDone")
                      : !line.productId ? t("purchaseRequestDoc.store.noProductCode")
                      : t("purchaseRequestDoc.store.whyNotStock");
                    return (
                      <tr key={line.id} className="border-b border-[#eef1f6] bg-white">
                        <td className={`${table.td} py-2.5`}>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-sm font-medium text-foreground">
                              {line.description}
                              <KitBreakdown productId={line.productId} qty={Number(issueQty[line.id] ?? "") || null} kits={kits} />
                            </span>
                            {!line.productId && <span className="text-xs text-[#8a5a00]">{t("purchaseRequestDoc.store.noProductCode")}</span>}
                            {short && (
                              <span className="text-xs text-[#8a5a00] inline-flex items-center gap-1">
                                <AlertTriangle size={12} /> {t("purchaseRequestDoc.store.shortBy").replace("{n}", (outstanding - (stock ?? 0)).toLocaleString())}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={`${table.td} text-right tabular-nums text-sm whitespace-nowrap`}>{(line.qtyRequested ?? 0).toLocaleString()} {line.unit}</td>
                        <td className={`${table.td} text-right tabular-nums text-sm whitespace-nowrap ${short ? "text-[#8a5a00] font-semibold" : stock === undefined ? "text-[#8a97ad]" : "text-foreground"}`}>
                          {stock === undefined ? "—" : stock.toLocaleString()}
                        </td>
                        <td className={`${table.td} whitespace-nowrap`}>
                          <span role="radiogroup" aria-label={`${t("purchaseRequestDoc.store.col.decision")} — ${line.description}`} className="inline-flex bg-[#eef1f6] rounded-lg p-[3px] gap-0.5">
                            {(["stock", "purchase"] as const).map((value) => {
                              const on = decision === value;
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  onClick={() => setStoreDecisions((prev) => ({ ...prev, [line.id]: value }))}
                                  className={`h-[30px] px-3 rounded-md text-[13px] transition-colors ${on
                                    ? `bg-white font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)] ${value === "stock" ? "text-[#1b7f4f]" : "text-[#8a5a00]"}`
                                    : "font-medium text-muted-foreground hover:text-foreground"}`}
                                >
                                  {value === "stock" ? t("purchaseRequestDoc.store.decisionStock") : t("purchaseRequestDoc.store.decisionPurchase")}
                                </button>
                              );
                            })}
                          </span>
                        </td>
                        <td className={`${table.td} text-right tabular-nums text-sm`}>{issued.toLocaleString()}</td>
                        <td className={`${table.td} py-2.5 text-right`}>
                          {canIssueLine ? (
                            <input
                              type="number"
                              inputMode="numeric"
                              value={issueQty[line.id] ?? ""}
                              onChange={(e) => setIssueQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                              placeholder={String(outstanding)}
                              aria-label={`${t("purchaseRequestDoc.store.col.issueNow")} — ${line.description}`}
                              className={`${field.cell} w-[100px] text-right tabular-nums`}
                            />
                          ) : (
                            <span className="text-[#8a97ad]" title={whyNot}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px] items-start border-b border-[#eef1f6]">
              <Field label={t("purchaseRequestDoc.store.remark")} htmlFor="pr-store-remark" className="sm:col-span-3">
                <input id="pr-store-remark" value={storeRemark} onChange={(e) => setStoreRemark(e.target.value)} className={`${field.input} w-full`} />
              </Field>
              <Field label={t("purchaseRequestDoc.store.issuedDate")} htmlFor="pr-store-issuedate">
                <input id="pr-store-issuedate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={`${field.input} w-full`} />
              </Field>
              <Field label={t("purchaseRequestDoc.store.issueRemark")} htmlFor="pr-store-issueremark" className="sm:col-span-2">
                <input id="pr-store-issueremark" value={issueRemark} onChange={(e) => setIssueRemark(e.target.value)} className={`${field.input} w-full`} />
              </Field>
              <div className="sm:col-span-3 flex items-center justify-end gap-2.5 flex-wrap">
                <button type="button" onClick={() => void saveStoreReview()} disabled={savingReview} className={btn.secondary}>
                  {savingReview ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {t("purchaseRequestDoc.store.saveReview")}
                </button>
                <button type="button" onClick={() => void saveStoreIssue()} disabled={savingIssue} className={btn.secondary}>
                  {savingIssue ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />} {t("purchaseRequestDoc.store.saveIssue")}
                </button>
              </div>
            </div>

            {issueBatches.length > 0 && (
              <div className="px-6 pt-4 pb-5 flex flex-col gap-2.5">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <History size={16} className="text-muted-foreground" /> {t("purchaseRequestDoc.store.historyTitle")}
                </h3>
                {issueBatches.map((batch) => (
                  <div key={batch.id} className="px-3.5 py-3 border border-border rounded-lg flex items-center gap-4">
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <span className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{t("purchaseRequestDoc.store.batchLabel").replace("{seq}", String(batch.seq))}</span>
                        <span className="text-[13px] text-muted-foreground">{formatQuoteDateThai(batch.issuedDate)}</span>
                      </span>
                      <span className="text-[13px] text-[#3d5173]">
                        {batch.lines.map((bl) => {
                          const line = doc.lines.find((l) => l.id === bl.lineId);
                          return `${line?.description ?? bl.lineId} ${bl.qty.toLocaleString()} ${line?.unit ?? ""}`;
                        }).join(" · ")}
                        {batch.remark.trim() ? ` — ${batch.remark}` : ""}
                      </span>
                    </div>
                    {batch.id === lastBatch?.id && (
                      <button type="button" onClick={() => setCancelBatchTarget(batch)}
                        className="h-9 px-2.5 rounded-lg text-[#b93636] text-[13px] font-medium inline-flex items-center gap-1.5 hover:bg-[#fcebeb] transition-colors whitespace-nowrap flex-shrink-0">
                        <Undo2 size={14} /> {t("purchaseRequestDoc.store.cancelBatch")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <PurchaseRequestPrintDocument purchaseRequest={doc} companyHeader={companyHeader} />

      <ProductPickerModal
        open={pickerOpen}
        products={products}
        categories={categories}
        preferCategoryNames={MATERIAL_CATEGORY_NAMES}
        showStock
        multiSelect
        onSelect={addProduct}
        onSelectMany={addProducts}
        onClose={() => setPickerOpen(false)}
      />

      {approvalFlow.dialogs}

      <ConfirmDialog
        open={cancelBatchTarget !== null}
        title={t("purchaseRequestDoc.store.cancelConfirmTitle")}
        message={t("purchaseRequestDoc.store.cancelConfirmBody")}
        danger
        summary={cancelBatchTarget ? (
          <SummaryBox
            monoPrimary={false}
            primary={`${t("purchaseRequestDoc.store.batchLabel").replace("{seq}", String(cancelBatchTarget.seq))} · ${formatQuoteDateThai(cancelBatchTarget.issuedDate)}`}
            secondary={lastBatchSummary}
          />
        ) : undefined}
        busy={cancellingBatch}
        confirmLabel={t("purchaseRequestDoc.store.cancelBatch")}
        onConfirm={() => { if (cancelBatchTarget) void cancelStoreIssue(cancelBatchTarget); }}
        onCancel={() => setCancelBatchTarget(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t("purchaseRequestDoc.deleteConfirmTitle")}
        message={t("purchaseRequestDoc.deleteConfirmMessage")}
        confirmLabel={t("purchaseRequestDoc.deleteConfirmTitle")}
        danger
        summary={summaryBox()}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmPurchasingApprove}
        title={t("purchaseRequestDoc.purchasing.approveConfirmTitle")}
        message={t("purchaseRequestDoc.purchasing.approveConfirmBody")}
        confirmLabel={t("purchaseRequestDoc.purchasing.approve")}
        summary={summaryBox()}
        busy={purchasingBusy}
        onConfirm={() => void runPurchasingStage("approve")}
        onCancel={() => setConfirmPurchasingApprove(false)}
      />
      {/* ออกใบสั่งซื้อ: เลือก "ทุกรายการที่ยังไม่ได้ซื้อ" หรือ "เฉพาะที่ติ๊กไว้" แล้วกดยืนยัน
          (ดีไซน์ใหม่ 2026-09-30 — เดิมกดตัวเลือกแล้วสร้างใบสั่งซื้อทันที) */}
      {buyDialogOpen && (
        <ChoiceDialog<"remaining" | "selected">
          title={t("purchaseRequestDoc.buy.dialogTitle")}
          description={t("purchaseRequestDoc.buy.dialogBody")}
          icon={ShoppingBag}
          options={[
            {
              key: "remaining",
              label: t("purchaseRequestDoc.buy.optionRemaining").replace("{n}", String(remainingLines.length)),
              items: remainingLines.map((l) => ({ label: l.description, qty: `${(l.qtyRequested ?? 0).toLocaleString()} ${l.unit}` })),
              disabled: remainingLines.length === 0,
            },
            {
              key: "selected",
              label: t("purchaseRequestDoc.buy.optionSelected").replace("{n}", String(selectedRemaining.length)),
              items: remainingLines.filter((l) => selectedRemaining.includes(l.id)).map((l) => ({ label: l.description, qty: `${(l.qtyRequested ?? 0).toLocaleString()} ${l.unit}` })),
              disabled: selectedRemaining.length === 0,
            },
          ]}
          value={buyChoice}
          onChange={setBuyChoice}
          confirmLabel={t("purchaseRequestDoc.buy.confirm").replace("{n}", String(buyChoice === "selected" ? selectedRemaining.length : remainingLines.length))}
          confirmIcon={ArrowRight}
          confirmDisabled={buyChoice === "selected" ? selectedRemaining.length === 0 : remainingLines.length === 0}
          busy={creatingPo}
          onConfirm={() => void createPurchaseOrderFromRequest(buyChoice === "selected" ? selectedRemaining : null)}
          onCancel={() => setBuyDialogOpen(false)}
        />
      )}
      <ConfirmDialog
        open={confirmPurchasingPull}
        title={t("purchaseRequestDoc.purchasing.pullConfirmTitle")}
        message={t("purchaseRequestDoc.purchasing.pullConfirmBody")}
        confirmLabel={t("purchaseRequestDoc.purchasing.pull")}
        summary={summaryBox()}
        busy={purchasingBusy}
        onConfirm={() => void runPurchasingStage("pull")}
        onCancel={() => setConfirmPurchasingPull(false)}
      />
      <ConfirmDialog
        open={confirmPurchasingReopen}
        title={t("purchaseRequestDoc.purchasing.reopenConfirmTitle")}
        message={t("purchaseRequestDoc.purchasing.reopenConfirmBody")}
        confirmLabel={t("purchaseRequestDoc.purchasing.reopen")}
        tone="warning"
        summary={summaryBox(
          doc.purchasingDeptBy || doc.purchasingDeptAt
            ? `${t("purchaseRequestDoc.purchasing.stageBadge")} ${t("purchaseRequestDoc.purchasing.approvedBy").replace("{name}", doc.purchasingDeptBy || "").replace("{date}", doc.purchasingDeptAt ? formatQuoteDateThai(doc.purchasingDeptAt) : "")}`
            : undefined,
        )}
        busy={purchasingBusy}
        onConfirm={() => void runPurchasingStage("reopen")}
        onCancel={() => setConfirmPurchasingReopen(false)}
      />
      <ConfirmDialog
        open={confirmRewrite}
        title={t("docRevision.rewriteConfirmTitle")}
        message={t("docRevision.rewriteConfirmBody")}
        confirmLabel={t("docRevision.rewrite")}
        summary={
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("purchaseRequest.shared.rewriteOriginal")}</span>
              <span className="font-mono text-[13px] font-medium text-foreground">{doc.id}</span>
            </span>
            <ArrowRight size={16} className="text-[#8a97ad] flex-shrink-0" />
            <span className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("purchaseRequest.shared.rewriteNext")}</span>
              <span className="font-mono text-[13px] font-semibold text-[#1a5fb4]">{getRevisionRoot(doc.id)}-R…</span>
            </span>
          </div>
        }
        busy={rewriting}
        onConfirm={() => void handleRewrite()}
        onCancel={() => setConfirmRewrite(false)}
      />
    </div>
  );
}
