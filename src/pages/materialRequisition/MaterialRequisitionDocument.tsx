import { useEffect, useState } from "react";
import { ChevronRight, Printer, Save, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X, Undo2, GitBranch, LayoutTemplate, PackageCheck, CheckCircle2, History } from "lucide-react";
import type { DriveStep } from "driver.js";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import {
  type MaterialRequisition, type MaterialRequisitionLine, type MaterialRequisitionUpdateFields, type MaterialIssueBatch,
  fetchMaterialRequisition, updateMaterialRequisition, recordMaterialRequisitionReturn,
  postMaterialIssueBatch, cancelMaterialIssueBatch,
  logMaterialRequisitionPrinted, deleteMaterialRequisition,
  blankMaterialRequisitionLine, MATERIAL_CATEGORY_NAMES, returnUnitCostOf, type ProductCostBasis,
  submitMaterialRequisitionApproval, approveMaterialRequisition, rejectMaterialRequisition, withdrawMaterialRequisitionApproval,
  rewriteMaterialRequisition, issuedQtyOf, outstandingQtyOf, issueBatchesOf,
  fetchStoreIssueSources, type StoreIssueSourceCandidate,
} from "../../lib/materialRequisition";
import { fetchDepartments, type Department } from "../../lib/departments";
import { fetchTeams, type Team } from "../../lib/teams";
import { type CodeEntry, fetchCodeEntries, codeComboboxOptions } from "../../lib/codeRegister";
import { Combobox } from "../../components/Combobox";
import { DocumentApprovalActions, RejectionNotice } from "../../components/DocumentApprovalActions";
import { DocumentStatusStepper } from "../../components/DocumentStatusStepper";
import { ApiError } from "../../lib/apiClient";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { createProductRequest } from "../../lib/productRequest";
import {
  type MaterialRequisitionTemplate, fetchMaterialRequisitionTemplates, templateLinesToRequisitionLines,
} from "../../lib/materialRequisitionTemplate";
import { MaterialRequisitionPrintDocument } from "./MaterialRequisitionPrintDocument";
import { StoreIssuePrintDocument } from "../storeDocuments/StoreIssuePrintDocument";
import { useI18n } from "../../lib/i18n";
import { getRevisionNumber } from "../../lib/revisionDiff";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { storeIssueCodeInfo } from "../../lib/storeCodes";

/**
 * payload ที่ปุ่ม "บันทึกฉบับร่าง" ส่ง — เบิกครั้งที่ 1/2 และคืนของ**ไม่อยู่ในนี้** ตั้งแต่ 2026-09-03
 * (server ไม่รับจาก PATCH อยู่แล้ว เป็นของสโตร์ผ่าน /issues และ /return) จึงตัดออกจาก lines ก่อนส่ง
 * ไม่งั้นการเทียบ "ยังไม่ได้บันทึก" จะเห็นค่าที่สโตร์เพิ่งกรอกในการ์ดจ่ายของเป็นงานค้างของฉบับร่าง
 */
function toUpdateFields(m: MaterialRequisition): MaterialRequisitionUpdateFields {
  return {
    // ใบเบิกของสโตร์ (2026-09-23) พิมพ์รหัสงานและเลขอ้างอิงเองได้ — ใบของฝ่ายอื่นไม่ส่งสองช่องนี้เลย
    ...(m.ownerDepartment === "store" ? { jobCode: m.jobCode, storeReference: m.storeReference ?? "" } : {}),
    lines: m.lines.map((l) => ({ ...l, withdrawal1Qty: null, withdrawal2Qty: null, returnQty: null })),
    revisionNote: m.revisionNote,
    documentNumber: m.documentNumber ?? "",
    chargeDepartmentId: m.chargeDepartmentId ?? "",
    chargeTeamId: m.chargeTeamId ?? "",
    chargeWorkTypeCode: m.chargeWorkTypeCode ?? "",
    chargeWorkTypeName: m.chargeWorkTypeName ?? "",
    customerName: m.customerName,
    productName: m.productName,
    responsibleEmployee: m.responsibleEmployee,
    productionStartDate: m.productionStartDate,
    preparedBy: m.preparedBy,
    preparedAt: m.preparedAt,
    approvedBy: m.approvedBy,
    approvedAt: m.approvedAt,
    storeDeptBy: m.storeDeptBy,
    storeDeptAt: m.storeDeptAt,
    costDeptBy: m.costDeptBy,
    costDeptAt: m.costDeptAt,
  };
}

/**
 * ทุกช่องที่ผู้ใช้แก้ได้จริงบนหน้านี้ — รวมช่องคืนของที่ toUpdateFields ตัดทิ้ง
 *
 * ยอดจ่ายไม่อยู่ในนี้ตั้งแต่ 2026-09-07 — การจ่ายเป็นรอบที่กด "บันทึก" ทีเดียวจบ ไม่ใช่ช่องที่ค้าง
 * แก้ไว้บนหน้าจอ จึงไม่มีอะไรให้เตือนว่ายังไม่ได้บันทึก
 */
function toGuardPayload(m: MaterialRequisition) {
  return {
    ...toUpdateFields(m),
    returns: m.lines.map((l) => [l.id, l.returnQty]),
    returnedBy: m.returnedBy, returnReceivedBy: m.returnReceivedBy,
  };
}

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70";
const cellInputCls = "w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70";

// หน้าแก้ไขใบเบิกและใบคืนวัสดุ: ข้อมูลหัวเรื่อง ตารางรายการจากแคตตาล็อก การจ่ายของโดยสโตร์ และการคืนวัสดุ
// Material Requisition editor: header fields, catalog line table, the Store issue card, and the return section.
export function MaterialRequisitionDocument({
  materialRequisitionId,
  company,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canIssueStock,
  canRequestProductCode,
  onBack,
  onDeleted,
  onOpenOther,
  showToast,
}: {
  materialRequisitionId: string;
  company: Company;
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  /** `stock:adjust` — การ์ด "จ่ายของ (สโตร์)" และการรับคืน (2026-09-03) */
  canIssueStock: boolean;
  /** `productRequest:create` — ปุ่ม "ขอรหัสสินค้าใหม่" ในตัวเลือกสินค้า (2026-09-09) */
  canRequestProductCode: boolean;
  onBack: () => void;
  onDeleted: () => void;
  /** เปิดเอกสารใบอื่นในโมดูลเดียวกัน — ใช้ตอน Rewrite เพื่อพาไปฉบับใหม่ที่เพิ่งสร้าง */
  onOpenOther: (id: string) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<MaterialRequisition | null>(null);
  const [draft, setDraft] = useState<MaterialRequisition | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  /** ยอดคงเหลือปัจจุบันต่อสินค้า — server ส่งมาพร้อมใบ และอัปเดตทุกครั้งที่จ่าย/คืน */
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  /** ต้นทุนต่อหน่วยต่อสินค้า — ใช้โชว์ "ราคาล่าสุด" ที่ของจะกลับเข้าคลังด้วย (2026-09-09) */
  const [costByProduct, setCostByProduct] = useState<Record<string, ProductCostBasis>>({});
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [codeEntries, setCodeEntries] = useState<CodeEntry[]>([]);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [, setSavingReturn] = useState(false);
  // ใบเบิกของแผนกอื่นที่ใบจ่ายของสโตร์อ้างได้ (2026-09-23)
  const [storeSources, setStoreSources] = useState<StoreIssueSourceCandidate[]>([]);
  const [savingIssue, setSavingIssue] = useState(false);
  /** ช่อง "จ่ายรอบนี้" ต่อบรรทัด — state แยกจากเอกสาร เพราะเป็นรอบที่ยังไม่ได้บันทึก ไม่ใช่ค่าในใบ */
  const [issueQty, setIssueQty] = useState<Record<string, string>>({});
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [issueRemark, setIssueRemark] = useState("");
  const [confirmCancelBatch, setConfirmCancelBatch] = useState<MaterialIssueBatch | null>(null);
  const [cancellingBatch, setCancellingBatch] = useState(false);
  const [printing, setPrinting] = useState(false);
  // ต้นทุนต่อหน่วยสำหรับใบจ่ายของสโตร์ (ช่อง หน่วยละ/รวม) — มากับการกดพิมพ์ทุกครั้งจึงสดเสมอ
  const [printCosts, setPrintCosts] = useState<Record<string, number>>({});
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  /** null = ยังไม่เคยโหลด — โหลดครั้งเดียวตอนกดปุ่มครั้งแรก ไม่ดึงทุกครั้งที่เปิดใบเบิก */
  const [templates, setTemplates] = useState<MaterialRequisitionTemplate[] | null>(null);
  const [showPrint, setShowPrint] = useState(false);

  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) — ประกาศเหนือ effect โหลดข้อมูล เพื่อตั้งฐานเทียบใหม่ทุกครั้งที่ดึงเอกสาร
  const dirty = useDirtyTracker(draft && (canEdit || canIssueStock) ? toGuardPayload(draft) : null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMaterialRequisition(materialRequisitionId), fetchProducts(), fetchCategories()])
      .then(([m, p, c]) => {
        if (cancelled) return;
        setDoc(m.materialRequisition); setDraft(m.materialRequisition); setStockByProduct(m.stockByProduct); setCostByProduct(m.costByProduct);
        setProducts(p); setCategories(c);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("materialRequisitionDoc.loadError"));
      });
    return () => { cancelled = true; };
  }, [materialRequisitionId, reloadKey, t, dirty]);

  // แผนก/ทีม/ประเภทงาน สำหรับ dropdown "ตัดของให้…" — GET เหล่านี้เปิดให้ทุกคนที่ล็อกอิน โหลดครั้งเดียว
  // best-effort: โหลดไม่ได้ก็ยังใช้หน้าได้ (ค่าที่บันทึกไว้แล้วยังแสดงชื่อจาก snapshot)
  useEffect(() => {
    let cancelled = false;
    fetchDepartments().then((list) => { if (!cancelled) setDepartments(list); }).catch(() => {});
    fetchTeams().then((list) => { if (!cancelled) setTeams(list); }).catch(() => {});
    fetchCodeEntries().then((list) => { if (!cancelled) setCodeEntries(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="mrdoc-actions"]', popover: { title: t("tour.mrdoc.actions.title"), description: t("tour.mrdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="mrdoc-addline"]', popover: { title: t("tour.mrdoc.addline.title"), description: t("tour.mrdoc.addline.desc"), side: "bottom" } },
    { element: '[data-tour="mrdoc-lines"]', popover: { title: t("tour.mrdoc.lines.title"), description: t("tour.mrdoc.lines.desc"), side: "top" } },
    { element: '[data-tour="mrdoc-issueCard"]', popover: { title: t("tour.mrdoc.issueCard.title"), description: t("tour.mrdoc.issueCard.desc"), side: "top" } },
    { element: '[data-tour="mrdoc-returnCard"]', popover: { title: t("tour.mrdoc.returnCard.title"), description: t("tour.mrdoc.returnCard.desc"), side: "top" } },
  ];

  // ── บันทึกอัตโนมัติ (2026-08-25) — hook ต้องอยู่ก่อน early return ทุกอันด้านล่าง ────────────────
  // Auto-save, declared above the loading/error early returns because hooks may not run
  // conditionally. It sends the exact payload the Save button sends and only while the document is
  // an editable Draft; the local snapshot alongside it survives a closed tab or a click onto
  // another page. See src/hooks/useAutoSave.ts.
  const autoSaveEditable = !!draft && canEdit && draft.status === "Draft";
  const autoSavePayload = draft && autoSaveEditable ? toUpdateFields(draft) : null;
  const draftBackup = useDraftBackup({
    storageKey: draft ? `materialRequisition:${draft.id}` : null,
    data: autoSavePayload,
    enabled: autoSaveEditable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: autoSaveEditable,
    onSave: async (fields) => {
      if (!draft) return;
      const saved = await updateMaterialRequisition(draft.id, fields, { autoSave: true });
      // อัปเดตเฉพาะ doc (สถานะ/เวลาแก้ไขล่าสุด) ไม่แตะ draft เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      // Only `doc` is refreshed — never `draft`, which the user may be typing into right now.
      setDoc(saved);
    },
  });

  const storeSlipEditable = !!doc && doc.ownerDepartment === "store" && canEdit && doc.status === "Draft";
  useEffect(() => {
    if (!storeSlipEditable) return;
    let cancelled = false;
    fetchStoreIssueSources().then((list) => { if (!cancelled) setStoreSources(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [storeSlipEditable]);

  const applySaved = (updated: MaterialRequisition, stock?: Record<string, number>, cost?: Record<string, ProductCostBasis>) => {
    setDoc(updated);
    setDraft(updated);
    if (stock) setStockByProduct(stock);
    if (cost) setCostByProduct(cost);
    dirty.markSaved(toGuardPayload(updated));
  };

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updateMaterialRequisition(draft.id, toUpdateFields(draft));
      applySaved(updated);
      // ตั้งฐานเทียบของ auto-save ใหม่เป็น "สิ่งที่เซิร์ฟเวอร์ตอบกลับมา" ซึ่งคือสิ่งที่ฟอร์มถืออยู่หลังบรรทัดบน
      // ไม่ใช่ค่าบนจอตอนเรียก ซึ่งอาจเก่าหรือใหม่กว่าที่ส่งขึ้นไปจริง
      autoSave.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("materialRequisitionDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorSave"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const chargeFieldsOf = (m: MaterialRequisition) => ({
    chargeDepartmentId: m.chargeDepartmentId ?? "",
    chargeTeamId: m.chargeTeamId ?? "",
    chargeWorkTypeCode: m.chargeWorkTypeCode ?? "",
    chargeWorkTypeName: m.chargeWorkTypeName ?? "",
  });

  /**
   * เลือกใบเบิกของแผนกที่ใบจ่ายนี้จ่ายให้ = บันทึกทันที — เซิร์ฟเวอร์ตั้งหัวใบ รายการที่ยังค้างเบิก และเลขที่ใบตามใบเบิกนั้น
   * (`lines: undefined` = ไม่ส่งรายการเดิมไปทับ)
   */
  const chooseStoreSource = async (sourceRequisitionId: string) => {
    if (!draft) return;
    try {
      const updated = await updateMaterialRequisition(draft.id, { ...toUpdateFields(draft), lines: undefined, sourceRequisitionId });
      applySaved(updated);
      autoSave.markSaved(toUpdateFields(updated));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorSave"));
    }
  };

  const saveReturn = async (): Promise<boolean> => {
    if (!draft) return false;
    setSavingReturn(true);
    try {
      const updated = await recordMaterialRequisitionReturn(draft.id, {
        lines: draft.lines.map((l) => ({ id: l.id, returnQty: l.returnQty })),
        returnedBy: draft.returnedBy,
        returnReceivedBy: draft.returnReceivedBy,
        ...chargeFieldsOf(draft),
      });
      // route คืนของส่ง stockByProduct มาด้วย แต่ wrapper ฝั่ง client คืนเฉพาะเอกสาร — โหลดยอดใหม่ผ่าน fetch สั้น ๆ
      const fresh = await fetchMaterialRequisition(draft.id).catch(() => null);
      applySaved(updated, fresh?.stockByProduct, fresh?.costByProduct);
      showToast(t("materialRequisitionDoc.returnSaved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorSaveReturn"));
      return false;
    } finally {
      setSavingReturn(false);
    }
  };

  /**
   * สโตร์จ่ายของหนึ่งรอบ — ส่งเฉพาะบรรทัดที่กรอกจำนวนมา ยอดของรอบก่อนหน้าไม่ถูกแตะเลย
   * เซิร์ฟเวอร์ต่อท้ายรอบใหม่ ตัดสต๊อกตามจำนวนของรอบนั้น แล้วคิดช่อง "เบิกครั้งที่ 1/2" ใหม่ให้เอง
   */
  const saveIssue = async (): Promise<boolean> => {
    if (!draft) return false;
    const lines = draft.lines
      .map((l) => ({ lineId: l.id, qty: Number(issueQty[l.id] ?? "") }))
      .filter((l) => Number.isFinite(l.qty) && l.qty > 0);
    if (lines.length === 0) {
      showToast(t("materialRequisitionDoc.issueEmpty"));
      return false;
    }
    setSavingIssue(true);
    try {
      const { materialRequisition, stockByProduct: fresh, costByProduct: freshCost } = await postMaterialIssueBatch(draft.id, {
        lines,
        issuedDate: issueDate,
        issuedBy: draft.storeDeptBy,
        remark: issueRemark,
        ...chargeFieldsOf(draft),
      });
      applySaved(materialRequisition, fresh, freshCost);
      setIssueQty({});
      setIssueRemark("");
      showToast(t("materialRequisitionDoc.issueSaved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorSaveIssue"));
      return false;
    } finally {
      setSavingIssue(false);
    }
  };

  /** ยกเลิกรอบล่าสุด — ของทั้งรอบกลับเข้าคลัง */
  const cancelBatch = async (batch: MaterialIssueBatch) => {
    if (!draft) return;
    setCancellingBatch(true);
    try {
      const { materialRequisition, stockByProduct: fresh, costByProduct: freshCost } = await cancelMaterialIssueBatch(draft.id, batch.id);
      applySaved(materialRequisition, fresh, freshCost);
      setConfirmCancelBatch(null);
      showToast(t("materialRequisitionDoc.batchCancelled"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorCancelBatch"));
    } finally {
      setCancellingBatch(false);
    }
  };

  // การ์ด "ยังไม่ได้บันทึก" — ยังทำงานหลังอนุมัติด้วย เพราะช่องคืนวัสดุยังแก้ได้ และตอนนั้น auto-save ปิดอยู่
  // ปุ่ม "บันทึก" ในกล่องเลือกตามเฟส: ฉบับร่างใช้ save() หลังอนุมัติใช้ saveReturn()
  // (การจ่ายของเป็นรอบที่กดบันทึกทีเดียวจบ ไม่มีสถานะค้างให้กู้)
  const { requestLeave } = useUnsavedChangesGuard(
    draft && (canEdit || canIssueStock)
      ? {
          getRisk: () => assessUnsavedRisk({
            isDirty: dirty.isDirtyNow(),
            hasServerRecord: true,
            autoSaveEnabled: autoSaveEditable,
            autoSaveState: autoSave.state,
          }),
          documentLabel: draft.documentNumber || draft.id,
          save: draft.status === "Draft" ? save : saveReturn,
          discard: draftBackup.clear,
        }
      : null,
  );

  const docTour = useModuleTour("materialRequisitionDoc", currentUserId, docTourSteps, { autoStart: !!doc });

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
            <ChevronRight size={14} className="rotate-180" /> {t("materialRequisitionDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle size={20} className="text-[#e05252]" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <RotateCw size={12} /> {t("materialRequisition.retry")}
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
            <ChevronRight size={14} className="rotate-180" /> {t("materialRequisitionDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-2.5 p-6">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">{t("materialRequisitionDoc.loadingDocument")}</p>
        </div>
      </div>
    );
  }

  const isDraftStatus = doc.status === "Draft";
  const isFinal = doc.status === "Final";
  /** ใบเบิกของสโตร์ (2026-09-23) — มีรหัสการจ่าย, พิมพ์รหัสงาน/เลขอ้างอิงเอง และคืนของผ่านใบรับคืนแทนการ์ดคืนของ */
  const isStoreDoc = doc.ownerDepartment === "store";
  const storeGroup = isStoreDoc && doc.issueCode ? storeIssueCodeInfo(doc.issueCode).group : null;
  const storeReferenceLabel = storeGroup === "production" ? t("storeDocs.field.productionOrder")
    : storeGroup === "sale" ? t("storeDocs.field.salesDocument")
    : storeGroup === "project" ? t("storeDocs.field.jobOrder")
    : t("storeDocs.field.reason");
  const editable = canEdit && isDraftStatus;
  /**
   * สโตร์จ่ายของได้เฉพาะใบที่อนุมัติแล้ว และ**เฉพาะใบจ่ายของสโตร์** (2026-09-23 — เจ้าของ: สโตร์จ่ายของ/คืนของในหน้า
   * "ใบเบิก-คืนวัสดุ (สโตร์)" แทน) · ใบเบิกของแผนกเห็นยอดจ่าย/คืนที่สโตร์บันทึกให้ แต่ไม่มีปุ่มจ่าย/คืนในใบตัวเอง
   */
  const canIssue = canIssueStock && isFinal && isStoreDoc;
  const outstandingLines = doc.lines.filter((l) => outstandingQtyOf(l) > 0).length;
  /** รอบการจ่ายที่บันทึกแล้ว — ใบที่จ่ายไปก่อน 2026-09-07 ถูกแปลงยอดเดิมมาเป็นรอบให้อัตโนมัติ */
  const issueBatches = issueBatchesOf(doc);
  const nextIssueSeq = issueBatches.length > 0 ? Math.max(...issueBatches.map((b) => b.seq)) + 1 : 1;
  /**
   * ใบที่จ่ายไปก่อน 2026-09-07 ไม่มีรายการรอบจริง — ที่เห็นคือยอดสองช่องเดิมที่ถูกแปลงเป็นรอบตอนอ่าน
   * (`legacyIssueBatchesOf`) วันที่กับผู้จ่ายของทุกรอบจึงเป็นค่าเดียวกันจากช่องเซ็นของสโตร์ ไม่ใช่เวลาจริง
   * ของแต่ละรอบ · บอกไว้ใต้หัวการ์ด เพราะปุ่มยกเลิกรอบทำงานกับรอบพวกนี้ได้ด้วย (ซึ่งถูกต้อง — เท่ากับการ
   * แก้ยอดลงแบบที่หน้าจอเดิมทำได้) แต่ถ้าไม่บอก คนใช้จะงงว่ารอบที่ตัวเองไม่เคยกดมาจากไหน
   */
  const issueBatchesAreLegacy = (doc.issues?.length ?? 0) === 0 && issueBatches.length > 0;
  const formNumber = doc.documentNumber || doc.id;

  // แบบเดียวกับที่ใบส่งมอบสินค้าทำ (DeliveryOrderDocument.tsx) — โมดูลนี้ไม่เคยโหลดโปรไฟล์บริษัท
  // มาก่อนเลย จึงพิมพ์หัวจดหมายไม่ได้ จนกระทั่งฝ่ายผลิตขอเมื่อ 2026-08-27
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  const updateLine = (id: string, patch: Partial<MaterialRequisitionLine>) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };
  const removeLine = (id: string) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.filter((l) => l.id !== id) });
  };
  const numberOrNull = (v: string) => (v === "" ? null : Number(v));
  /**
   * "ใช้เทมเพลต" — เติมรายการทั้งชุดจากเทมเพลตที่ตั้งไว้ (เจ้าของสั่ง 2026-09-02)
   *
   * **ต่อท้าย ไม่ทับของเดิม** — ใบหนึ่งอาจต้องใช้หลายชุด (ชุดเคมี + ชุดน็อต) และการทับจะทำให้ของที่
   * พิมพ์เองไว้ก่อนหายเงียบ ๆ · id ของทุกบรรทัดถูกสร้างใหม่ใน `templateLinesToRequisitionLines()`
   * เทมเพลตเดียวกันจึงกดซ้ำได้โดยไม่ชน key
   */
  const applyTemplate = (template: MaterialRequisitionTemplate) => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, ...templateLinesToRequisitionLines(template.lines)] });
    setTemplatePickerOpen(false);
    showToast(t("materialRequisitionDoc.useTemplateApplied"));
  };

  const openTemplatePicker = () => {
    setTemplatePickerOpen(true);
    if (templates !== null) return;
    fetchMaterialRequisitionTemplates()
      .then(setTemplates)
      .catch(() => { setTemplates([]); showToast(t("materialRequisitionDoc.useTemplateError")); });
  };

  /**
   * เปิดตัวเลือกสินค้า แล้ว**ดึงรายการสินค้าใหม่ทุกครั้ง** — เดิมโหลดครั้งเดียวตอน mount สินค้าที่สโตร์
   * เพิ่งตั้งรหัสให้จึงไม่ขึ้นจนกว่าจะออกจากเอกสารแล้วเข้ามาใหม่ (เจ้าของรายงาน 2026-09-09)
   * best-effort: ดึงไม่สำเร็จก็ยังใช้รายการที่โหลดไว้เลือกได้ตามปกติ
   */
  const openProductPicker = () => {
    setPickerOpen(true);
    Promise.all([fetchProducts(), fetchCategories()])
      .then(([p, c]) => { setProducts(p); setCategories(c); })
      .catch(() => { /* ใช้รายการเดิมต่อไป */ });
  };

  /** ขอรหัสสินค้าใหม่จากในตัวเลือกสินค้า — บรรทัดใบเบิกบังคับต้องอ้างสินค้าในคลัง ของที่ยังไม่มีรหัสจึงตีบตัน */
  const requestProductCode = async (name: string) => {
    try {
      await createProductRequest({
        name,
        unit: "",
        categoryId: "",
        specifications: "",
        reason: `ใช้กับใบเบิก ${draft.documentNumber || doc.id}`,
      });
      showToast(t("productRequest.created"));
      setPickerOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("productRequest.error"));
    }
  };

  const addProduct = (product: Product) => {
    const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? "";
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankMaterialRequisitionLine(product, categoryName)] });
    // สินค้าที่เพิ่งเพิ่มยังไม่มียอดคงเหลือใน map ที่ server ส่งมา — ใช้ค่าจากรายการสินค้าที่โหลดไว้ไปก่อน
    setStockByProduct((prev) => (product.id in prev ? prev : { ...prev, [product.id]: product.stockQty }));
  };

  // สร้างฉบับแก้ไข แล้วเปิดฉบับใหม่ทันที — ฉบับเดิมยังอยู่ และลิงก์ในโครงการถูกย้ายมาชี้ฉบับใหม่ให้แล้ว
  const handleRewrite = async () => {
    if (!doc) return;
    setRewriting(true);
    try {
      const created = await rewriteMaterialRequisition(doc.id);
      showToast(t("docRevision.rewritten"));
      onOpenOther(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("docRevision.errorRewrite"));
    } finally { setRewriting(false); setConfirmRewrite(false); }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      setPrintCosts(await logMaterialRequisitionPrinted(doc.id));
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMaterialRequisition(doc.id);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorDelete"));
      setDeleting(false);
    }
  };


  // dropdown แผนก/ทีม/ประเภทงาน — ใช้ทั้งหัวใบ (ตอนร่าง) และการ์ดจ่ายของ (สโตร์แก้ได้ตอนจ่าย)
  const activeDepartments = departments.filter((d) => d.isActive);
  const teamsOfDepartment = teams.filter((tm) => tm.isActive && (!draft.chargeDepartmentId || tm.departmentId === draft.chargeDepartmentId));
  const setChargeDepartment = (id: string) => setDraft((prev) => prev && {
    ...prev,
    chargeDepartmentId: id,
    chargeDepartmentName: departments.find((d) => d.id === id)?.name ?? "",
    // เปลี่ยนแผนกแล้วทีมเดิมไม่อยู่ในแผนกนั้น — ล้างทิ้ง ไม่งั้นจะได้ทีมของแผนกอื่นติดไป
    ...(prev.chargeTeamId && teams.find((tm) => tm.id === prev.chargeTeamId)?.departmentId !== id ? { chargeTeamId: "", chargeTeamName: "" } : {}),
  });
  const setChargeTeam = (id: string) => setDraft((prev) => prev && {
    ...prev, chargeTeamId: id, chargeTeamName: teams.find((tm) => tm.id === id)?.name ?? "",
  });
  /** ราคาที่ของจะกลับเข้าคลังด้วยเมื่อคืน — ตรงกับที่เซิร์ฟเวอร์ใช้ (`returnUnitCostOf`) */
  const returnCost = (productId: string) => returnUnitCostOf(costByProduct[productId]);
  const workTypeOptions = codeComboboxOptions(codeEntries, "workType");
  const setChargeWorkType = (code: string) => setDraft((prev) => prev && {
    ...prev, chargeWorkTypeCode: code,
    chargeWorkTypeName: codeEntries.find((c) => c.kind === "workType" && c.code === code.toUpperCase())?.name ?? prev.chargeWorkTypeName ?? "",
  });
  // ฟังก์ชันคืน JSX ไม่ใช่คอมโพเนนต์ — ถ้าประกาศเป็นคอมโพเนนต์ในตัว render ทุกครั้งที่พิมพ์ช่องจะถูก remount และโฟกัสหลุด
  const renderChargeSelectors = (disabled: boolean, idPrefix: string) => (
    <>
      <div>
        <label htmlFor={`${idPrefix}-chargeDepartment`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.chargeDepartment")}</label>
        <select id={`${idPrefix}-chargeDepartment`} disabled={disabled} value={draft.chargeDepartmentId ?? ""}
          onChange={(e) => setChargeDepartment(e.target.value)} className={inputCls}>
          <option value="">{t("materialRequisitionDoc.field.noDepartment")}</option>
          {activeDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          {draft.chargeDepartmentId && !activeDepartments.some((d) => d.id === draft.chargeDepartmentId) && (
            <option value={draft.chargeDepartmentId}>{draft.chargeDepartmentName || draft.chargeDepartmentId}</option>
          )}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-chargeTeam`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.chargeTeam")}</label>
        <select id={`${idPrefix}-chargeTeam`} disabled={disabled} value={draft.chargeTeamId ?? ""}
          onChange={(e) => setChargeTeam(e.target.value)} className={inputCls}>
          <option value="">{t("materialRequisitionDoc.field.noTeam")}</option>
          {teamsOfDepartment.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          {draft.chargeTeamId && !teamsOfDepartment.some((tm) => tm.id === draft.chargeTeamId) && (
            <option value={draft.chargeTeamId}>{draft.chargeTeamName || draft.chargeTeamId}</option>
          )}
        </select>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-chargeWorkType`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.chargeWorkType")}</label>
        <Combobox
          id={`${idPrefix}-chargeWorkType`}
          disabled={disabled}
          value={draft.chargeWorkTypeCode ?? ""}
          onChange={setChargeWorkType}
          onPick={(opt) => setDraft((prev) => prev && { ...prev, chargeWorkTypeCode: opt.value, chargeWorkTypeName: opt.hint ?? opt.label ?? opt.value })}
          options={workTypeOptions}
          placeholder={t("materialRequisitionDoc.field.chargeWorkTypePlaceholder")}
          ariaLabel={t("materialRequisitionDoc.field.chargeWorkType")}
          className={inputCls}
        />
        {draft.chargeWorkTypeName && draft.chargeWorkTypeName !== draft.chargeWorkTypeCode && (
          <p className="text-xs text-muted-foreground mt-1">{draft.chargeWorkTypeName}</p>
        )}
      </div>
    </>
  );

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("materialRequisitionDoc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#866d28] font-mono font-semibold">{formNumber}</span>
        {formNumber !== doc.id && <span className="text-xs font-mono text-muted-foreground">({doc.id})</span>}
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${doc.status === "Draft" ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20" : doc.status === "PendingApproval" ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"}`}>
          {doc.status === "Draft" ? t("materialRequisition.status.draft") : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final")}
        </span>
        {isFinal && outstandingLines > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20">
            {t("materialRequisition.outstandingBadge")} {outstandingLines}
          </span>
        )}

        <div data-tour="mrdoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
          {autoSaveEditable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
          {canEdit && doc.status === "Final" && (
            <button onClick={() => setConfirmRewrite(true)} disabled={rewriting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {rewriting ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />} {t("docRevision.rewrite")}
            </button>
          )}
          {canPrint && (
            <button onClick={handlePrint} disabled={printing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("materialRequisitionDoc.print")}
            </button>
          )}
          {editable && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("materialRequisitionDoc.saveDraft")}
            </button>
          )}
          <DocumentApprovalActions
            status={doc.status}
            canEdit={canEdit}
            canApprove={canFinalize}
            onSubmit={() => submitMaterialRequisitionApproval(doc.id)}
            onApprove={() => approveMaterialRequisition(doc.id)}
            onReject={(c) => rejectMaterialRequisition(doc.id, c)}
            onWithdraw={() => withdrawMaterialRequisitionApproval(doc.id)}
            onUpdated={(updated) => applySaved(updated)}
            showToast={showToast}
          />
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("materialRequisitionDoc.delete")}
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

        <DocumentStatusStepper
          status={doc.status}
          rejectionComment={doc.rejectionComment ?? ""}
          approverLabel={t("materialRequisitionDoc.approverLabel")}
          approvedByUserId={doc.approvedByUserId}
          approvedByName={doc.approvedBy}
          approvedAt={doc.approvedAt}
          finalHint={isFinal && outstandingLines > 0 ? t("materialRequisitionDoc.finalHintOutstanding").replace("{n}", String(outstandingLines)) : undefined}
        />
        <RejectionNotice comment={doc.rejectionComment ?? ""} />
        {/* สรุปสถานะการจ่ายของ — เฉพาะใบที่อนุมัติแล้ว (ใบร่างยังไม่มีอะไรให้จ่าย) */}
        {isFinal && (
          outstandingLines > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-[#e08a3c]/30 bg-[#e08a3c]/5 px-4 py-3 text-sm text-[#a75d1a]">
              <AlertTriangle size={15} /> {t("materialRequisitionDoc.outstandingBanner").replace("{n}", String(outstandingLines))}
            </div>
          ) : doc.lines.length > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-[#2aa36b]/30 bg-[#2aa36b]/5 px-4 py-3 text-sm text-[#207e52]">
              <CheckCircle2 size={15} /> {t("materialRequisitionDoc.issuedAllBanner")}
            </div>
          ) : null
        )}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
            <h1 className="text-[#c9a84c] text-xl font-bold">{isStoreDoc ? t("storeDocs.issueTitle") : t("materialRequisitionDoc.title")}</h1>
            {isStoreDoc && doc.issueCode && (
              <p className="text-[#a8bed8] text-xs mt-1">
                {t("storeDocs.issueCodeLabel")} <span className="font-mono font-semibold text-[#c9a84c]">{doc.issueCode}</span> · {t(storeIssueCodeInfo(doc.issueCode).nameKey)}
              </p>
            )}
            {/* สายที่มาของใบนี้ทั้งเส้น: มาจากใบสั่งผลิตใบไหน และใบสั่งผลิตนั้นมาจากงาน PQ ตัวไหน
                (เจ้าของขอ 2026-09-02) — เลขใบสั่งผลิตขึ้นเฉพาะใบของฝ่ายผลิต ฝั่งโครงการไม่มีต้นทางนี้ */}
            <p className="text-[#a8bed8] text-xs mt-1">
              {t("materialRequisitionDoc.jobCodePrefix")} {doc.jobCode || "—"}
              {doc.productionOrderId ? ` · ${t("materialRequisitionDoc.productionOrderPrefix")} ${doc.productionOrderId}` : ""}
              {doc.jobOrderCode ? ` · ${t("materialRequisitionDoc.jobOrderPrefix")} ${doc.jobOrderCode}` : ""}
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mr-documentNumber" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.documentNumber")}</label>
              <input id="mr-documentNumber" disabled={!editable} value={draft.documentNumber ?? ""}
                onChange={(e) => setDraft({ ...draft, documentNumber: e.target.value })}
                className={`${inputCls} font-mono`} />
              <p className="text-xs text-muted-foreground mt-1">{t("materialRequisitionDoc.field.documentNumberHint").replace("{id}", doc.id)}</p>
            </div>
            <div>
              <label htmlFor="mr-customerName" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.customerName")}</label>
              <input id="mr-customerName" disabled={!editable} value={draft.customerName}
                onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label htmlFor="mr-productName" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.productName")}</label>
              <input id="mr-productName" disabled={!editable} value={draft.productName}
                onChange={(e) => setDraft({ ...draft, productName: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label htmlFor="mr-responsibleEmployee" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.responsibleEmployee")}</label>
              <input id="mr-responsibleEmployee" disabled={!editable} value={draft.responsibleEmployee}
                onChange={(e) => setDraft({ ...draft, responsibleEmployee: e.target.value })}
                className={inputCls} />
            </div>
            <div>
              <label htmlFor="mr-productionStartDate" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.productionStartDate")}</label>
              <input id="mr-productionStartDate" type="date" disabled={!editable} value={draft.productionStartDate}
                onChange={(e) => setDraft({ ...draft, productionStartDate: e.target.value })}
                className={`${inputCls} font-mono`} />
            </div>
            {isStoreDoc && (
              <>
                <div className="sm:col-span-2">
                  <label htmlFor="mr-store-source" className="text-xs text-muted-foreground block mb-1">{t("storeDocs.field.sourceRequisition")}</label>
                  <select id="mr-store-source" disabled={!editable} value={draft.sourceRequisitionId ?? ""}
                    onChange={(e) => void chooseStoreSource(e.target.value)} className={inputCls}>
                    <option value="">{t("storeDocs.sourceNone")}</option>
                    {draft.sourceRequisitionId && !storeSources.some((c) => c.id === draft.sourceRequisitionId) && (
                      <option value={draft.sourceRequisitionId}>{draft.sourceRequisitionNumber}</option>
                    )}
                    {storeSources.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.documentNumber} · {c.ownerDepartment === "production" ? t("storeIssue.dept.production") : t("storeIssue.dept.project")}
                        {c.jobCode ? ` · ${c.jobCode}` : ""}{c.chargeDepartmentName ? ` · ${c.chargeDepartmentName}` : ""} · {t("storeDocs.sourceOutstanding").replace("{n}", String(c.outstandingLineCount))}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">{t("storeDocs.sourceHint")}</p>
                </div>
                <div>
                  <label htmlFor="mr-store-jobCode" className="text-xs text-muted-foreground block mb-1">{t("storeDocs.field.jobCode")}</label>
                  <input id="mr-store-jobCode" disabled={!editable} value={draft.jobCode}
                    onChange={(e) => setDraft({ ...draft, jobCode: e.target.value })}
                    className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label htmlFor="mr-store-reference" className="text-xs text-muted-foreground block mb-1">{storeReferenceLabel}</label>
                  <input id="mr-store-reference" disabled={!editable} value={draft.storeReference ?? ""}
                    onChange={(e) => setDraft({ ...draft, storeReference: e.target.value })}
                    className={inputCls} />
                </div>
              </>
            )}
            {/* ตัดของให้แผนก/ทีม/ประเภทงาน — ตั้งได้ตอนร่าง สโตร์แก้ได้อีกครั้งตอนจ่ายของ (การ์ดด้านล่าง) */}
            {renderChargeSelectors(!editable, "mr")}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div data-tour="mrdoc-addline" className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("materialRequisitionDoc.linesTitle")}</h2>
            {editable && (
              <div className="flex items-center gap-2">
                <button onClick={openTemplatePicker} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <LayoutTemplate size={13} /> {t("materialRequisitionDoc.useTemplate")}
                </button>
                <button onClick={() => openProductPicker()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("materialRequisitionDoc.addLine")}
                </button>
              </div>
            )}
          </div>
          <div data-tour="mrdoc-lines">
          {draft.lines.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("materialRequisitionDoc.linesEmpty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[
                      t("materialRequisitionDoc.col.productCode"), t("materialRequisitionDoc.col.item"), t("materialRequisitionDoc.col.unit"),
                      t("materialRequisitionDoc.col.stockQty"), t("materialRequisitionDoc.col.plannedQty"),
                      t("materialRequisitionDoc.col.issued"), t("materialRequisitionDoc.col.outstanding"),
                      t("materialRequisitionDoc.col.returnQty"), t("materialRequisitionDoc.col.lastCost"),
                      t("materialRequisitionDoc.col.actualUsed"), "",
                    ].map((h, i) => (
                      <th key={`${i}-${h}`} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => {
                    const stock = stockByProduct[line.productId];
                    const outstanding = outstandingQtyOf(line);
                    // "ของไม่พอ" เทียบกับที่ยังต้องจ่าย ไม่ใช่ที่ขอทั้งหมด — ส่วนที่จ่ายไปแล้วออกจากคลังไปแล้ว
                    const shortBy = stock !== undefined && outstanding > stock ? outstanding - stock : 0;
                    return (
                    <tr key={line.id} className="border-b border-border/50">
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{line.productCode}</td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        {line.productName}
                        {shortBy > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20 whitespace-nowrap">
                            <AlertTriangle size={10} /> {t("materialRequisitionDoc.shortBy").replace("{n}", shortBy.toLocaleString())}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{line.unit}</td>
                      <td className={`px-3 py-2 text-xs font-mono whitespace-nowrap ${shortBy > 0 ? "text-[#a75d1a]" : "text-muted-foreground"}`}>{stock === undefined ? "—" : stock.toLocaleString()}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" disabled={!editable}
                          value={line.plannedQty ?? ""}
                          onChange={(e) => updateLine(line.id, { plannedQty: numberOrNull(e.target.value) })}
                          className={cellInputCls}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-foreground whitespace-nowrap">{issuedQtyOf(line).toLocaleString()}</td>
                      <td className={`px-3 py-2 text-xs font-mono whitespace-nowrap ${isFinal && outstanding > 0 ? "text-[#a75d1a] font-semibold" : "text-muted-foreground"}`}>{outstanding.toLocaleString()}</td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" disabled
                          title={t("materialRequisitionDoc.returnQtyHint")}
                          value={line.returnQty ?? ""}
                          onChange={(e) => updateLine(line.id, { returnQty: numberOrNull(e.target.value) })}
                          className="w-20 text-xs font-mono text-foreground bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded px-1.5 py-1 outline-none disabled:opacity-70"
                        />
                      </td>
                      {/* ราคาที่ของจะกลับเข้าคลังด้วย — ราคาซื้อล่าสุด (ถ้ายังไม่เคยรับเข้าพร้อมราคา ใช้ถัวเฉลี่ย)
                          โชว์เฉย ๆ เพื่อให้สโตร์เห็นก่อนกดบันทึก เซิร์ฟเวอร์คิดเองอีกรอบตอนเขียนบัญชีเดินสะพัด */}
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap" title={t("materialRequisitionDoc.col.lastCostHint")}>
                        {returnCost(line.productId) > 0 ? returnCost(line.productId).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" disabled={!editable}
                          value={line.actualUsedQty ?? ""}
                          onChange={(e) => updateLine(line.id, { actualUsedQty: numberOrNull(e.target.value) })}
                          className={cellInputCls}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {editable && (
                          <button onClick={() => removeLine(line.id)} title={t("materialRequisitionDoc.removeLine")} className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-[#e05252] transition-opacity">
                            <X size={13} />
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
          </div>
        </div>

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

        {/* การ์ด "จ่ายของ (สโตร์)" — ขึ้นให้คนที่มี stock:adjust เห็นเสมอ (ล็อกจนกว่าใบจะอนุมัติ) เพื่อให้รู้ว่ามีขั้นนี้อยู่ */}
        {canIssueStock && isStoreDoc && (
          <div data-tour="mrdoc-issueCard" className="bg-card border border-[#2aa36b]/30 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <PackageCheck size={15} className="text-[#207e52]" />
              <h2 className="text-sm font-semibold text-foreground">
                {t("materialRequisitionDoc.issueRoundTitle").replace("{n}", String(nextIssueSeq))}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">{canIssue ? t("materialRequisitionDoc.issueHint") : t("materialRequisitionDoc.issueLocked")}</p>
            {canIssue && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {renderChargeSelectors(!canIssue, "mr-issue")}
                  <div>
                    <label htmlFor="mr-issue-storeDeptBy" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.issuedBy")}</label>
                    <input id="mr-issue-storeDeptBy" value={draft.storeDeptBy}
                      onChange={(e) => setDraft({ ...draft, storeDeptBy: e.target.value })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="mr-issue-date" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.issuedDate")}</label>
                    <input id="mr-issue-date" type="date" value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="mr-issue-remark" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.issueRemark")}</label>
                    <input id="mr-issue-remark" value={issueRemark}
                      onChange={(e) => setIssueRemark(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {[
                          t("materialRequisitionDoc.col.item"), t("materialRequisitionDoc.col.plannedQty"), t("materialRequisitionDoc.col.issued"),
                          t("materialRequisitionDoc.col.outstanding"), t("materialRequisitionDoc.col.stockQty"), t("materialRequisitionDoc.col.issueNow"),
                        ].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((line) => {
                        const stock = stockByProduct[line.productId];
                        const outstanding = outstandingQtyOf(line);
                        const typed = Number(issueQty[line.id] ?? "");
                        // เตือนตรงช่องที่พิมพ์ ก่อนจะไปโดนเซิร์ฟเวอร์ปฏิเสธ — เกินค้างเบิก หรือของในคลังไม่พอ
                        const bad = Number.isFinite(typed) && typed > 0 && (typed > outstanding || (stock !== undefined && typed > stock));
                        return (
                          <tr key={line.id} className="border-b border-border/50">
                            <td className="px-3 py-2 text-xs text-foreground"><span className="font-mono text-muted-foreground mr-2">{line.productCode}</span>{line.productName}</td>
                            <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{(line.plannedQty ?? 0).toLocaleString()} {line.unit}</td>
                            <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{issuedQtyOf(line).toLocaleString()}</td>
                            <td className={`px-3 py-2 text-xs font-mono ${outstanding > 0 ? "text-[#a75d1a] font-semibold" : "text-muted-foreground"}`}>{outstanding.toLocaleString()}</td>
                            <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{stock === undefined ? "—" : stock.toLocaleString()}</td>
                            <td className="px-2 py-1.5">
                              <input type="number" min={0} max={outstanding} value={issueQty[line.id] ?? ""}
                                disabled={outstanding <= 0}
                                onChange={(e) => setIssueQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                className={`w-24 text-xs font-mono text-foreground bg-[#2aa36b]/5 border rounded px-1.5 py-1 outline-none disabled:opacity-40 ${bad ? "border-[#e05252]" : "border-[#2aa36b]/20"}`} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button onClick={saveIssue} disabled={savingIssue} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2aa36b]/40 text-[#207e52] rounded-lg font-medium hover:bg-[#2aa36b]/10 transition-colors disabled:opacity-60">
                  {savingIssue ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {t("materialRequisitionDoc.saveIssueRound").replace("{n}", String(nextIssueSeq))}
                </button>
              </>
            )}
          </div>
        )}

        {/* ประวัติรอบการจ่าย — ทุกคนที่เปิดใบได้เห็น เพราะเป็นตัวตอบว่าของออกไปเมื่อไหร่ให้ใคร */}
        {issueBatches.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <History size={15} className="text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">{t("materialRequisitionDoc.batchesTitle")}</h2>
            </div>
            {issueBatchesAreLegacy && <p className="text-xs text-muted-foreground">{t("materialRequisitionDoc.batchesLegacyNote")}</p>}
            <div className="space-y-2">
              {issueBatches.map((batch, idx) => {
                const isLast = idx === issueBatches.length - 1;
                return (
                  <div key={batch.id} className="border border-border rounded-lg px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-foreground">
                        <span className="font-semibold">{t("materialRequisitionDoc.batchLabel").replace("{n}", String(batch.seq))}</span>
                        <span className="text-muted-foreground"> · {batch.issuedDate || "—"}</span>
                        {batch.issuedBy ? <span className="text-muted-foreground"> · {batch.issuedBy}</span> : null}
                        {batch.chargeTeamName ? <span className="text-muted-foreground"> · {batch.chargeTeamName}</span> : null}
                      </div>
                      {canIssue && isLast && (
                        <button onClick={() => setConfirmCancelBatch(batch)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
                          <Undo2 size={12} /> {t("materialRequisitionDoc.cancelBatch")}
                        </button>
                      )}
                    </div>
                    <ul className="mt-1.5 space-y-0.5">
                      {batch.lines.map((bl) => {
                        const line = draft.lines.find((l) => l.id === bl.lineId);
                        return (
                          <li key={bl.lineId} className="text-xs text-muted-foreground">
                            <span className="font-mono mr-2">{line?.productCode ?? "—"}</span>
                            {line?.productName ?? t("materialRequisitionDoc.batchDeletedLine")}
                            <span className="font-mono text-foreground ml-2">{bl.qty.toLocaleString()} {line?.unit ?? ""}</span>
                          </li>
                        );
                      })}
                    </ul>
                    {batch.remark ? <p className="mt-1.5 text-xs text-muted-foreground">{batch.remark}</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* คืนของทำที่สโตร์เท่านั้น (2026-09-23) — ใบเบิกของแผนกและใบจ่ายของสโตร์ต่างก็ไม่มีการ์ดคืนของในตัว */}
        <div className="flex items-start gap-2 rounded-xl border border-[#c9a84c]/30 bg-[#c9a84c]/5 px-4 py-3 text-sm text-[#866d28]">
          <Undo2 size={15} className="mt-0.5 flex-shrink-0" /> {isStoreDoc ? t("storeDocs.returnViaReceipt") : t("storeDocs.deptViaStore")}
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("materialRequisitionDoc.signatoriesTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {([
              ["preparedBy", "preparedAt", t("materialRequisitionDoc.field.preparedBy")],
              ["approvedBy", "approvedAt", t("materialRequisitionDoc.field.approvedBy")],
              ["storeDeptBy", "storeDeptAt", t("materialRequisitionDoc.field.storeDeptBy")],
              ["costDeptBy", "costDeptAt", t("materialRequisitionDoc.field.costDeptBy")],
            ] as const).map(([nameField, dateField, label]) => (
              <div key={nameField} className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`mr-${nameField}`} className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input id={`mr-${nameField}`} disabled={!editable} value={draft[nameField]}
                    onChange={(e) => setDraft({ ...draft, [nameField]: e.target.value })}
                    className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                </div>
                <div>
                  <label htmlFor={`mr-${dateField}`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.date")}</label>
                  <input id={`mr-${dateField}`} type="date" disabled={!editable} value={draft[dateField]}
                    onChange={(e) => setDraft({ ...draft, [dateField]: e.target.value })}
                    className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ใบเบิกของสโตร์พิมพ์เป็นฟอร์ม "ใบจ่ายวัสดุ" ของโปรแกรมบัญชีเดิม (2026-09-23) — ฝ่ายอื่นยังเป็น FM-ST-04 */}
      {isStoreDoc
        ? <StoreIssuePrintDocument materialRequisition={doc} unitCostByProduct={printCosts} companyHeader={companyHeader} />
        : <MaterialRequisitionPrintDocument materialRequisition={doc} companyHeader={companyHeader} />}

      <ProductPickerModal
        open={pickerOpen}
        products={products}
        categories={categories}
        preferCategoryNames={MATERIAL_CATEGORY_NAMES}
        showStock
        onRequestProductCode={canRequestProductCode ? requestProductCode : undefined}
        onSelect={addProduct}
        onClose={() => setPickerOpen(false)}
      />

      {templatePickerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col p-5 gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
                {t("materialRequisitionDoc.useTemplateTitle")}
              </h2>
              <button onClick={() => setTemplatePickerOpen(false)} aria-label={t("mrTemplate.close")} title={t("mrTemplate.close")}
                className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {templates === null ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">{t("materialRequisitionDoc.useTemplateEmpty")}</p>
              ) : (
                <div className="space-y-1.5">
                  {templates.map((tpl) => (
                    <button key={tpl.id} onClick={() => applyTemplate(tpl)}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-border/60 hover:bg-secondary/40 hover:border-[#c9a84c]/40 transition-colors">
                      <p className="text-sm font-medium text-foreground truncate">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t("mrTemplate.lineCount").replace("{n}", String(tpl.lines.length))}
                        {tpl.description.trim() !== "" && ` · ${tpl.description}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("materialRequisitionDoc.deleteConfirmTitle")}
        message={t("materialRequisitionDoc.deleteConfirmMessage")}
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
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
      <ConfirmDialog
        open={!!confirmCancelBatch}
        title={t("materialRequisitionDoc.cancelBatchConfirmTitle")}
        message={t("materialRequisitionDoc.cancelBatchConfirmBody").replace("{n}", String(confirmCancelBatch?.seq ?? ""))}
        confirmLabel={t("materialRequisitionDoc.cancelBatch")}
        danger
        busy={cancellingBatch}
        onConfirm={() => { if (confirmCancelBatch) void cancelBatch(confirmCancelBatch); }}
        onCancel={() => setConfirmCancelBatch(null)}
      />
    </div>
  );
}
