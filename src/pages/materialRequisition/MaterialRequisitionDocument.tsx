import { useEffect, useState, type ReactNode } from "react";
import { Printer, Save, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X, Undo2, GitBranch, LayoutTemplate, PackageCheck, Send, CheckCircle2, Info } from "lucide-react";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import {
  type MaterialRequisition, type MaterialRequisitionLine, type MaterialRequisitionUpdateFields, type MaterialIssueBatch,
  fetchMaterialRequisition, updateMaterialRequisition,
  postMaterialIssueBatch, cancelMaterialIssueBatch,
  logMaterialRequisitionPrinted, deleteMaterialRequisition,
  blankMaterialRequisitionLine, blankFreeTypedMaterialRequisitionLine, isFreeTypedLine, MATERIAL_CATEGORY_NAMES, returnUnitCostOf, type ProductCostBasis,
  submitMaterialRequisitionApproval, approveMaterialRequisition, rejectMaterialRequisition, withdrawMaterialRequisitionApproval,
  rewriteMaterialRequisition, issuedQtyOf, outstandingQtyOf, issueBatchesOf, storeSlipSkipsApproval,
  fetchStoreIssueSources, type StoreIssueSourceCandidate, fetchIssueReturnSummary, type IssueReturnSummary,
} from "../../lib/materialRequisition";
import { fetchDepartments, type Department } from "../../lib/departments";
import { fetchTeams, type Team } from "../../lib/teams";
import { type CodeEntry, fetchCodeEntries, codeComboboxOptions } from "../../lib/codeRegister";
import { Combobox } from "../../components/Combobox";
import { RejectionNotice } from "../../components/DocumentApprovalActions";
import { DocumentHeader, DocumentStepper, DocumentColumns, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field, ReadonlyField, SelectBox } from "../../components/ui/Field";
import { PickerDialog } from "../../components/ui/Overlays";
import { btn, field, table } from "../../components/ui/styles";
import {
  ApprovalPill, NoteBox, RailSummaryCard, Tag, rejectBtn, rejectBtnSm, rowRemoveBtn,
  useApprovalFlow, useApprovalHint, useApprovalSteps,
} from "../project/projectUi";
import { summarizeRequisitionLines } from "./mrSummary";
import { ApiError } from "../../lib/apiClient";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { KitBreakdown } from "../../components/KitBreakdown";
import { useKitRecipes } from "../../hooks/useKitRecipes";
import { createProductRequest } from "../../lib/productRequest";
import {
  type MaterialRequisitionTemplate, fetchMaterialRequisitionTemplates, templateLinesToRequisitionLines,
} from "../../lib/materialRequisitionTemplate";
import { MaterialRequisitionPrintDocument } from "./MaterialRequisitionPrintDocument";
import { StoreIssuePrintDocument } from "../storeDocuments/StoreIssuePrintDocument";
import { IssueReturnSummaryPrint } from "../storeDocuments/IssueReturnSummaryPrint";
import { RequisitionSourcePicker } from "../storeDocuments/RequisitionSourcePicker";
import { useI18n } from "../../lib/i18n";
import { getRevisionNumber } from "../../lib/revisionDiff";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { storeIssueCodeInfo } from "../../lib/storeCodes";
import { formatDisplayDate } from "../../lib/displayDate";
import { UnitCombobox } from "../../components/UnitCombobox";
import { DateInput } from "../../components/DateInput";

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

const inputCls = `${field.input} w-full`;
/** ช่องตัวเลขในตาราง — ชิดขวา ตัวเลขเท่ากัน */
const cellNumCls = `${field.cell} w-24 text-right tabular-nums`;

// หน้าแก้ไขใบเบิกและใบคืนวัสดุ: ข้อมูลหัวเรื่อง ตารางรายการจากแคตตาล็อก การจ่ายของโดยสโตร์ และการคืนวัสดุ
// ดีไซน์ใหม่ 2026-09-30: หัวเอกสาร (ปุ่มอยู่ที่นี่ที่เดียว) · ขั้นตอน · ข้อมูลใบเบิก + ตัดของให้ | การ์ดนับรายการ +
// อ้างอิง + ขั้นต่อไป · ตารางรายการเต็มความกว้าง · การ์ดจ่ายของ/ประวัติรอบ (ใบของสโตร์) · ผู้เกี่ยวข้อง
// ใช้ทั้งใบเบิกของแผนก (โครงการ/ผลิต) และใบจ่ายของสโตร์ (`ownerDepartment: "store"` — เปิดจากหน้าเอกสารสโตร์)
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
  // สินค้าชุด (2026-09-29) — แตกชิ้นส่วนใต้ชื่อชุดทุกตาราง (เจ้าของเลือกโชว์ทั้งชุดและชิ้นส่วน)
  const kits = useKitRecipes();
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
  // ใบเบิกของแผนกอื่นที่ใบจ่ายของสโตร์อ้างได้ (2026-09-23)
  const [storeSources, setStoreSources] = useState<StoreIssueSourceCandidate[]>([]);
  const [savingIssue, setSavingIssue] = useState(false);
  /** ช่อง "จ่ายรอบนี้" ต่อบรรทัด — state แยกจากเอกสาร เพราะเป็นรอบที่ยังไม่ได้บันทึก ไม่ใช่ค่าในใบ */
  const [issueQty, setIssueQty] = useState<Record<string, string>>({});
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [issueRemark, setIssueRemark] = useState("");
  /**
   * รายการที่สโตร์เพิ่มเองในการ์ดจ่ายของ (2026-09-29) — ยังไม่อยู่ในใบจนกว่าจะกดบันทึกรอบ (เซิร์ฟเวอร์ต่อท้ายให้ตอนจ่าย)
   * จึงเพิ่มได้แม้ใบเป็น Final แล้ว · จำนวนจ่ายใช้ `issueQty` ตาม id ชั่วคราวของบรรทัด
   */
  const [extraIssueLines, setExtraIssueLines] = useState<MaterialRequisitionLine[]>([]);
  /** ตัวเลือกสินค้าเปิดจากไหน — "draft" = ตารางรายการของใบร่าง · "issue" = การ์ดจ่ายของ */
  const [pickerTarget, setPickerTarget] = useState<"draft" | "issue">("draft");
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
  /** เทมเพลตที่เลือกไว้ในกล่อง (ยังไม่กด "ใช้เทมเพลต") — ดีไซน์ใหม่: เลือกแล้วต้องยืนยัน ไม่เติมทันทีที่คลิก */
  const [templateChoice, setTemplateChoice] = useState<string | null>(null);
  /** null = ยังไม่เคยโหลด — โหลดครั้งเดียวตอนกดปุ่มครั้งแรก ไม่ดึงทุกครั้งที่เปิดใบเบิก */
  const [templates, setTemplates] = useState<MaterialRequisitionTemplate[] | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  /** ใบสรุปจ่าย-คืน (2026-10-06) — มีค่า = กำลังพิมพ์ใบสรุปแทนใบพิมพ์ปกติ · ล้างหลังพิมพ์ */
  const [summaryPrint, setSummaryPrint] = useState<IssueReturnSummary | null>(null);

  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) — ประกาศเหนือ effect โหลดข้อมูล เพื่อตั้งฐานเทียบใหม่ทุกครั้งที่ดึงเอกสาร
  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

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

  // หน้านี้ใช้ทั้งใบเบิกของโครงการ/ผลิต และใบจ่ายของสโตร์ (StoreDocumentsPage) — ปุ่มเพิ่มรายการขึ้นเฉพาะตอนแก้ได้
  // และการ์ดจ่ายของขึ้นเฉพาะใบของสโตร์ที่ผู้ใช้มีสิทธิ์จ่าย ขั้นที่ไม่มีบนหน้าถูกข้ามเอง
  const docTourSteps: TourStep[] = [
    { element: '[data-tour="mrdoc-actions"]', manual: "ch16-5", popover: { title: t("tour.mrdoc.actions.title"), description: t("tour.mrdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="mrdoc-steps"]', manual: "ch16-5", popover: { title: t("tour.mrdoc.steps.title"), description: t("tour.mrdoc.steps.desc"), side: "bottom" } },
    { element: '[data-tour="mrdoc-charge"]', manual: "ch16-4", popover: { title: t("tour.mrdoc.charge.title"), description: t("tour.mrdoc.charge.desc"), side: "top" } },
    { element: '[data-tour="mrdoc-addbuttons"]', manual: "ch16-2", popover: { title: t("tour.mrdoc.addline.title"), description: t("tour.mrdoc.addline.desc"), side: "bottom" } },
    { element: '[data-tour="mrdoc-lines"]', manual: "ch16-4", popover: { title: t("tour.mrdoc.lines.title"), description: t("tour.mrdoc.lines.desc"), side: "top" } },
    { element: '[data-tour="mrdoc-issueCard"]', manual: "ch24-1", popover: { title: t("tour.mrdoc.issueCard.title"), description: t("tour.mrdoc.issueCard.desc"), side: "top" } },
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
    dirty.markSaved(toUpdateFields(updated));
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

  /**
   * สโตร์จ่ายของหนึ่งรอบ — ส่งเฉพาะบรรทัดที่กรอกจำนวนมา ยอดของรอบก่อนหน้าไม่ถูกแตะเลย
   * เซิร์ฟเวอร์ต่อท้ายรอบใหม่ ตัดสต๊อกตามจำนวนของรอบนั้น แล้วคิดช่อง "เบิกครั้งที่ 1/2" ใหม่ให้เอง
   */
  const saveIssue = async (): Promise<boolean> => {
    if (!draft) return false;
    const lines = draft.lines
      .map((l) => ({ lineId: l.id, qty: Number(issueQty[l.id] ?? "") }))
      .filter((l) => Number.isFinite(l.qty) && l.qty > 0);
    // รายการที่เพิ่มเองต้องมีจำนวนจ่าย — ไม่งั้นบรรทัดจะหายเงียบ ๆ หลังบันทึก (ยังไม่เคยอยู่ในใบ)
    if (extraIssueLines.some((l) => !(Number(issueQty[l.id] ?? "") > 0))) {
      showToast(t("materialRequisitionDoc.extraLineNeedsQty"));
      return false;
    }
    const newLines = extraIssueLines.map((l) => ({ productId: l.productId, category: l.category, qty: Number(issueQty[l.id]) }));
    if (lines.length === 0 && newLines.length === 0) {
      showToast(t("materialRequisitionDoc.issueEmpty"));
      return false;
    }
    setSavingIssue(true);
    try {
      // ใบจ่ายที่ไม่ต้องอนุมัติจ่ายได้ตั้งแต่ร่าง — บันทึกหัวใบ/รายการที่ค้างก่อน เซิร์ฟเวอร์จ่ายตามใบที่บันทึกไว้เท่านั้น
      // (บรรทัดที่เพิ่งเพิ่มยังไม่มีในฐานข้อมูล) · การจ่ายรอบแรกเปลี่ยนใบเป็น Final ฟอร์มจึงแก้ต่อไม่ได้หลังจากนี้
      if (draft.status === "Draft" && canEdit) {
        const saved = await updateMaterialRequisition(draft.id, toUpdateFields(draft));
        autoSave.markSaved(toUpdateFields(saved));
        draftBackup.clear();
      }
      const { materialRequisition, stockByProduct: fresh, costByProduct: freshCost } = await postMaterialIssueBatch(draft.id, {
        lines,
        ...(newLines.length > 0 ? { newLines } : {}),
        issuedDate: issueDate,
        issuedBy: draft.storeDeptBy,
        remark: issueRemark,
        ...chargeFieldsOf(draft),
      });
      applySaved(materialRequisition, fresh, freshCost);
      setIssueQty({});
      setExtraIssueLines([]);
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

  // การ์ด "ยังไม่ได้บันทึก" — เฉพาะฉบับร่าง: การ์ดคืนของถูกถอดไปแล้ว (2026-09-23 คืนผ่านใบรับคืนของสโตร์)
  // หลังอนุมัติจึงไม่มีช่องไหนที่บันทึกค้างไว้ได้ — ช่องในการ์ดจ่ายของเป็นค่าของรอบที่ยังไม่กด ไม่ใช่งานค้าง
  // (เดิมหลังอนุมัติปุ่มบันทึกยิง /return ซึ่งเซิร์ฟเวอร์ปฏิเสธใบของสโตร์แล้ว ผู้ใช้จึงออกจากหน้าด้วยการบันทึกไม่ได้)
  const { requestLeave } = useUnsavedChangesGuard(
    draft && canEdit && draft.status === "Draft"
      ? {
          getRisk: () => assessUnsavedRisk({
            isDirty: dirty.isDirtyNow(),
            hasServerRecord: true,
            autoSaveEnabled: autoSaveEditable,
            autoSaveState: autoSave.state,
          }),
          documentLabel: draft.documentNumber || draft.id,
          save,
          discard: draftBackup.clear,
        }
      : null,
  );

  const docTour = useModuleTour("materialRequisitionDoc", currentUserId, docTourSteps, { autoStart: !!doc });

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => { setShowPrint(false); setSummaryPrint(null); };
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  // ── ขั้นตอนอนุมัติ / ขั้นตอนเอกสาร / ข้อความ "ขั้นต่อไป" — เป็น hook จึงต้องอยู่เหนือ early return ─────
  // ตรรกะอนุมัติเดียวกับ DocumentApprovalActions เดิมทุกประการ แค่ปุ่มถูกวางตามดีไซน์ใหม่ (ปุ่มหลักมุมขวา)
  const approval = useApprovalFlow<MaterialRequisition>({
    status: doc?.status ?? "Draft",
    canEdit,
    canApprove: canFinalize,
    onSubmit: () => submitMaterialRequisitionApproval(doc?.id ?? ""),
    onApprove: () => approveMaterialRequisition(doc?.id ?? ""),
    onReject: (c) => rejectMaterialRequisition(doc?.id ?? "", c),
    onWithdraw: () => withdrawMaterialRequisitionApproval(doc?.id ?? ""),
    onUpdated: (updated) => applySaved(updated),
    showToast,
  });
  const approvalSteps = useApprovalSteps(doc?.status ?? "Draft");
  const outstandingCount = doc ? doc.lines.filter((l) => outstandingQtyOf(l) > 0).length : 0;
  const approvalHint = useApprovalHint({
    status: doc?.status ?? "Draft",
    approverLabel: t("materialRequisitionDoc.approverLabel"),
    rejectionComment: doc?.rejectionComment ?? "",
    approvedByUserId: doc?.approvedByUserId,
    approvedByName: doc?.approvedBy ?? "",
    approvedAt: doc?.approvedAt ?? "",
    // ใบที่อนุมัติแล้วบอกต่อว่าสโตร์จ่ายครบหรือยัง (เดิมเป็นแถบสีส้ม/เขียวใต้ขั้นตอน — ย้ายมาอยู่ในกล่องขั้นต่อไป)
    finalHint: doc?.status === "Final"
      ? outstandingCount > 0
        ? t("materialRequisitionDoc.finalHintOutstanding").replace("{n}", String(outstandingCount))
        : doc.lines.length > 0 ? t("materialRequisitionDoc.issuedAllBanner") : undefined
      : undefined,
  });

  if (loadError || !doc || !draft) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20">
          <DocumentHeader backLabel={t("materialRequisitionDoc.backToAll")} onBack={() => requestLeave(onBack)} number={t("materialRequisitionDoc.title")} mono={false} />
        </div>
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertTriangle size={20} className="text-[#b93636]" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <button type="button" onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className={btn.secondary}>
              <RotateCw size={16} /> {t("materialRequisition.retry")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 p-10" role="status">
            <Loader2 size={20} className="text-muted-foreground animate-spin" />
            <p className="text-[13px] text-muted-foreground">{t("materialRequisitionDoc.loadingDocument")}</p>
          </div>
        )}
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
  const canIssue = canIssueStock && isStoreDoc && (isFinal || storeSlipSkipsApproval(doc));
  /** ใบจ่ายที่อ้างใบเบิกแผนกและยังไม่ได้จ่าย — ไม่มีขั้นอนุมัติ (2026-09-24) จึงซ่อนปุ่มส่งขออนุมัติกับแถบขั้นตอนอนุมัติ */
  const confirmsOnIssue = !isFinal && storeSlipSkipsApproval(doc);
  const outstandingLines = outstandingCount;
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
    setTemplateChoice(null);
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
  const openProductPicker = (target: "draft" | "issue" = "draft") => {
    setPickerTarget(target);
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
    if (pickerTarget === "issue") setExtraIssueLines((prev) => [...prev, blankMaterialRequisitionLine(product, categoryName)]);
    else setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankMaterialRequisitionLine(product, categoryName)] });
    // สินค้าที่เพิ่งเพิ่มยังไม่มียอดคงเหลือใน map ที่ server ส่งมา — ใช้ค่าจากรายการสินค้าที่โหลดไว้ไปก่อน
    setStockByProduct((prev) => (product.id in prev ? prev : { ...prev, [product.id]: product.stockQty }));
  };
  /** ตัวเลือกสินค้าติ๊กได้หลายรายการ (ดีไซน์ใหม่) — ต่อท้ายตามลำดับที่ติ๊ก */
  const addProducts = (picked: Product[]) => picked.forEach(addProduct);

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

  const handlePrintSummary = async () => {
    setPrinting(true);
    try {
      setSummaryPrint(await fetchIssueReturnSummary(doc.id));
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
  // ล็อกแล้ว (disabled) = แสดงเป็นค่าอ่านอย่างเดียวตามดีไซน์ใหม่ ไม่ใช่ช่องกรอกสีจาง
  const renderChargeSelectors = (disabled: boolean, idPrefix: string) => disabled ? (
    <>
      <ReadonlyField label={t("materialRequisitionDoc.field.chargeDepartment")} value={draft.chargeDepartmentName || ""} />
      <ReadonlyField label={t("materialRequisitionDoc.field.chargeTeam")} value={draft.chargeTeamName || ""} />
      <ReadonlyField
        label={t("materialRequisitionDoc.field.chargeWorkType")}
        value={draft.chargeWorkTypeCode ? (
          <>
            <span className="font-mono">{draft.chargeWorkTypeCode}</span>
            {draft.chargeWorkTypeName && draft.chargeWorkTypeName !== draft.chargeWorkTypeCode ? ` · ${draft.chargeWorkTypeName}` : ""}
          </>
        ) : ""}
      />
    </>
  ) : (
    <>
      <Field label={t("materialRequisitionDoc.field.chargeDepartment")} htmlFor={`${idPrefix}-chargeDepartment`}>
        <SelectBox id={`${idPrefix}-chargeDepartment`} value={draft.chargeDepartmentId ?? ""} onChange={(e) => setChargeDepartment(e.target.value)}>
          <option value="">{t("materialRequisitionDoc.field.noDepartment")}</option>
          {activeDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          {draft.chargeDepartmentId && !activeDepartments.some((d) => d.id === draft.chargeDepartmentId) && (
            <option value={draft.chargeDepartmentId}>{draft.chargeDepartmentName || draft.chargeDepartmentId}</option>
          )}
        </SelectBox>
      </Field>
      <Field label={t("materialRequisitionDoc.field.chargeTeam")} htmlFor={`${idPrefix}-chargeTeam`}>
        <SelectBox id={`${idPrefix}-chargeTeam`} value={draft.chargeTeamId ?? ""} onChange={(e) => setChargeTeam(e.target.value)}>
          <option value="">{t("materialRequisitionDoc.field.noTeam")}</option>
          {teamsOfDepartment.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          {draft.chargeTeamId && !teamsOfDepartment.some((tm) => tm.id === draft.chargeTeamId) && (
            <option value={draft.chargeTeamId}>{draft.chargeTeamName || draft.chargeTeamId}</option>
          )}
        </SelectBox>
      </Field>
      <Field
        label={t("materialRequisitionDoc.field.chargeWorkType")}
        htmlFor={`${idPrefix}-chargeWorkType`}
        help={draft.chargeWorkTypeName && draft.chargeWorkTypeName !== draft.chargeWorkTypeCode ? draft.chargeWorkTypeName : undefined}
      >
        <Combobox
          id={`${idPrefix}-chargeWorkType`}
          value={draft.chargeWorkTypeCode ?? ""}
          onChange={setChargeWorkType}
          onPick={(opt) => setDraft((prev) => prev && { ...prev, chargeWorkTypeCode: opt.value, chargeWorkTypeName: opt.hint ?? opt.label ?? opt.value })}
          options={workTypeOptions}
          placeholder={t("materialRequisitionDoc.field.chargeWorkTypePlaceholder")}
          ariaLabel={t("materialRequisitionDoc.field.chargeWorkType")}
          className={`${inputCls} font-mono`}
        />
      </Field>
    </>
  );

  /** ช่องข้อความของหัวใบ — แก้ได้ตอนร่าง · ล็อกแล้วแสดงเป็นค่าอ่านอย่างเดียว */
  const textField = (id: string, label: string, value: string, onChange: (v: string) => void, opts: { mono?: boolean; type?: "text" | "date"; help?: ReactNode; className?: string } = {}) =>
    editable ? (
      <Field label={label} htmlFor={id} help={opts.help} className={opts.className}>
        <input id={id} type={opts.type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${opts.mono ? "font-mono" : ""}`} />
      </Field>
    ) : (
      <ReadonlyField label={label} value={opts.type === "date" && value ? formatDisplayDate(value) : value} mono={opts.mono} className={opts.className} />
    );

  const showApproval = !(confirmsOnIssue && isDraftStatus);
  const itemsUnit = t("project.picker.project.itemsUnit");
  const lineSummary = summarizeRequisitionLines(draft.lines, stockByProduct);
  const lastBatch = issueBatches.length > 0 ? issueBatches[issueBatches.length - 1] : null;
  const skipsApprovalStep = storeSlipSkipsApproval(doc) && !doc.approvedByUserId;
  /**
   * ใบของสโตร์มี 4 ขั้น (จัดทำร่าง → อนุมัติแล้ว → จ่ายของ → จ่ายครบทุกรายการ) · ใบที่อ้างใบเบิกแผนกไม่มีขั้นอนุมัติของตัวเอง
   * ขั้นที่สองจึงเป็น "ใบเบิกต้นทางอนุมัติแล้ว" · ใบเบิกของแผนกใช้ 3 ขั้นอนุมัติตามเดิม
   */
  const steps = isStoreDoc
    ? {
        steps: [
          { label: t("approval.step.draft") },
          { label: skipsApprovalStep ? t("materialRequisitionDoc.step.sourceApproved") : t("approval.step.final") },
          { label: t("materialRequisitionDoc.step.issuing") },
          { label: t("materialRequisitionDoc.step.issuedAll") },
        ],
        current: confirmsOnIssue ? 2
          : doc.status === "Draft" ? 0
          : doc.status === "PendingApproval" ? 1
          : outstandingLines === 0 && doc.lines.length > 0 ? 4 : 2,
      }
    : approvalSteps;
  const statusText = doc.status === "Draft" ? t("materialRequisition.status.draft") : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final");
  const chosenTemplate = (templates ?? []).find((tpl) => tpl.id === templateChoice) ?? null;
  const issueRoundLabel = t("materialRequisitionDoc.saveIssueRound").replace("{n}", String(nextIssueSeq));

  const primaryAction = canIssue ? (
    <button type="button" onClick={() => void saveIssue()} disabled={savingIssue} className={btn.primary}>
      {savingIssue ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />} {issueRoundLabel}
    </button>
  ) : showApproval && approval.canSubmit ? (
    <button type="button" onClick={approval.submit} disabled={approval.busy !== null} className={btn.primary}>
      {approval.busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("approval.submit")}
    </button>
  ) : null;

  const numTd = `${table.td} py-2.5 text-right tabular-nums text-sm whitespace-nowrap`;

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-20 print:hidden">
        <DocumentHeader
          backLabel={isStoreDoc ? t("materialRequisitionDoc.backToStoreAll") : t("materialRequisitionDoc.backToAll")}
          onBack={() => requestLeave(onBack)}
          number={formNumber}
          status={
            <>
              {formNumber !== doc.id && <span className="font-mono text-[13px] text-muted-foreground" title={t("materialRequisitionDoc.systemNumber")}>{doc.id}</span>}
              <ApprovalPill status={doc.status} />
              {isFinal && outstandingLines > 0 && <Tag tone="amber">{t("materialRequisition.outstandingBadge")} {outstandingLines}</Tag>}
            </>
          }
          meta={autoSaveEditable ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} /> : undefined}
          actions={
            <div data-tour="mrdoc-actions" className="flex items-center gap-2.5 flex-wrap">
              <TourReplayButton variant="title" onClick={docTour.start} />
              {canPrint && (
                <button type="button" onClick={() => void handlePrint()} disabled={printing} className={btn.secondary}>
                  {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} {t("materialRequisitionDoc.print")}
                </button>
              )}
              <MoreMenu
                items={[
                  // ใบสรุปจ่าย-คืนในแผ่นเดียว (2026-10-06) — มีความหมายเมื่อจ่ายของไปแล้วอย่างน้อยหนึ่งรายการ
                  canPrint && {
                    key: "issueReturnSummary", label: t("materialRequisitionDoc.printIssueReturnSummary"), icon: Printer,
                    disabled: printing || !doc.lines.some((l) => issuedQtyOf(l) > 0),
                    hint: doc.lines.some((l) => issuedQtyOf(l) > 0) ? undefined : t("materialRequisitionDoc.printIssueReturnSummaryHint"),
                    onSelect: () => void handlePrintSummary(),
                  },
                  canEdit && {
                    key: "rewrite", label: t("docRevision.rewrite"), icon: GitBranch,
                    disabled: !isFinal || rewriting, hint: isFinal ? undefined : t("materialRequisitionDoc.rewriteAfterFinal"),
                    onSelect: () => setConfirmRewrite(true),
                  },
                  showApproval && approval.canWithdraw && approval.canDecide && {
                    key: "withdraw", label: t("approval.withdraw"), icon: Undo2, disabled: approval.busy !== null, onSelect: approval.withdraw,
                  },
                  canDelete && { key: "delete", label: t("materialRequisitionDoc.deleteConfirmTitle"), icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
              {editable && (
                <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("materialRequisitionDoc.saveDraft")}
                </button>
              )}
              {showApproval && approval.canWithdraw && !approval.canDecide && (
                <button type="button" onClick={approval.withdraw} disabled={approval.busy !== null} className={btn.secondary}>
                  {approval.busy === "withdraw" ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />} {t("approval.withdraw")}
                </button>
              )}
              {showApproval && approval.canDecide && (
                <>
                  <button type="button" onClick={approval.requestReject} disabled={approval.busy !== null} className={rejectBtn}>{t("approval.reject")}</button>
                  <button type="button" onClick={approval.requestApprove} disabled={approval.busy !== null} className={btn.primary}>
                    <CheckCircle2 size={16} /> {t("approval.approve")}
                  </button>
                </>
              )}
              {primaryAction}
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

        <div data-tour="mrdoc-steps">
          <DocumentStepper steps={steps.steps} current={steps.current} ariaLabel={t("materialRequisitionDoc.stepsAria")} />
        </div>
        <RejectionNotice comment={doc.rejectionComment ?? ""} />

        <DocumentColumns
          main={
            <>
              <SectionCard
                title={isStoreDoc ? t("storeDocs.issueTitle") : t("materialRequisitionDoc.infoTitle")}
                actions={!isDraftStatus ? (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Info size={14} /> {t("materialRequisitionDoc.lockedNote")}</span>
                ) : undefined}
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4 items-start">
                  {isStoreDoc && doc.issueCode && (
                    <ReadonlyField
                      className="sm:col-span-3"
                      label={t("storeDocs.issueCodeLabel")}
                      value={<span className="inline-flex items-center gap-2"><Tag>{doc.issueCode}</Tag>{t(storeIssueCodeInfo(doc.issueCode).nameKey)}</span>}
                    />
                  )}
                  {textField("mr-documentNumber", t("materialRequisitionDoc.field.documentNumber"), draft.documentNumber ?? "",
                    (v) => setDraft({ ...draft, documentNumber: v }),
                    { mono: true, help: t("materialRequisitionDoc.field.documentNumberHint").replace("{id}", doc.id) })}
                  {textField("mr-responsibleEmployee", t("materialRequisitionDoc.field.responsibleEmployee"), draft.responsibleEmployee,
                    (v) => setDraft({ ...draft, responsibleEmployee: v }))}
                  {textField("mr-productionStartDate", t("materialRequisitionDoc.field.productionStartDate"), draft.productionStartDate,
                    (v) => setDraft({ ...draft, productionStartDate: v }), { type: "date" })}
                  {textField("mr-customerName", t("materialRequisitionDoc.field.customerName"), draft.customerName,
                    (v) => setDraft({ ...draft, customerName: v }), { className: "sm:col-span-3" })}
                  {textField("mr-productName", t("materialRequisitionDoc.field.productName"), draft.productName,
                    (v) => setDraft({ ...draft, productName: v }), { className: "sm:col-span-3" })}
                  {isStoreDoc && (
                    <>
                      {editable ? (
                        <Field className="sm:col-span-3" label={t("storeDocs.field.sourceRequisition")} htmlFor="mr-store-source" help={t("storeDocs.sourceHint")}>
                          <RequisitionSourcePicker
                            key={draft.sourceRequisitionId ?? ""}
                            inputId="mr-store-source"
                            selectedId={draft.sourceRequisitionId ?? ""}
                            selectedNumber={draft.sourceRequisitionNumber ?? ""}
                            disabled={false}
                            placeholder={t("storeDocs.sourceSearch")}
                            onSelect={(id) => void chooseStoreSource(id)}
                            options={storeSources.map((c) => ({
                              id: c.id,
                              number: c.documentNumber,
                              hint: [
                                c.ownerDepartment === "production" ? t("storeIssue.dept.production") : t("storeIssue.dept.project"),
                                c.jobCode, c.customerName, c.chargeDepartmentName,
                                t("storeDocs.sourceOutstanding").replace("{n}", String(c.outstandingLineCount)),
                              ].filter(Boolean).join(" · "),
                            }))}
                          />
                        </Field>
                      ) : (
                        <ReadonlyField className="sm:col-span-3" label={t("storeDocs.field.sourceRequisition")} value={draft.sourceRequisitionNumber ?? ""} mono />
                      )}
                      {textField("mr-store-jobCode", t("storeDocs.field.jobCode"), draft.jobCode, (v) => setDraft({ ...draft, jobCode: v }), { mono: true })}
                      {textField("mr-store-reference", storeReferenceLabel, draft.storeReference ?? "", (v) => setDraft({ ...draft, storeReference: v }), { className: "sm:col-span-2" })}
                    </>
                  )}
                </div>
              </SectionCard>

              {/* ตัดของให้แผนก/ทีม/ประเภทงาน — ตั้งได้ตอนร่าง สโตร์แก้ได้อีกครั้งตอนจ่ายของ (การ์ดจ่ายของด้านล่าง) */}
              <div data-tour="mrdoc-charge">
                <SectionCard title={t("materialRequisitionDoc.chargeTitle")}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4 items-start">
                    {renderChargeSelectors(!editable, "mr")}
                  </div>
                </SectionCard>
              </div>

              {/* หมายเหตุการแก้ไข — โผล่เฉพาะเอกสารที่เป็นฉบับแก้ไข (มี -R{n} ต่อท้าย)
                  ต่างจาก Scope of Work ตรงที่ข้อความนี้ถูกพิมพ์ลงบนเอกสารจริงด้วย */}
              {getRevisionNumber(doc.id) > 0 && (
                <SectionCard title={t("docRevision.noteTitle")} subtitle={t("docRevision.noteHelp")}>
                  {editable ? (
                    <textarea
                      rows={4}
                      aria-label={t("docRevision.noteTitle")}
                      value={draft.revisionNote}
                      onChange={(e) => setDraft({ ...draft, revisionNote: e.target.value })}
                      placeholder={t("docRevision.notePlaceholder")}
                      className={`${field.textarea} w-full resize-y`}
                    />
                  ) : (
                    <p className="text-sm text-foreground whitespace-pre-wrap">{draft.revisionNote || "—"}</p>
                  )}
                </SectionCard>
              )}
            </>
          }
          rail={
            <>
              <RailSummaryCard
                label={t("materialRequisitionDoc.linesTitle")}
                value={lineSummary.total}
                unit={itemsUnit}
                rows={[
                  { label: t("materialRequisitionDoc.summary.fullyIssued"), value: `${lineSummary.fullyIssued} ${itemsUnit}` },
                  { label: t("materialRequisitionDoc.col.outstanding"), value: `${lineSummary.outstanding} ${itemsUnit}` },
                  { label: t("materialRequisitionDoc.summary.short"), value: `${lineSummary.short} ${itemsUnit}`, warn: lineSummary.short > 0 },
                  ...(lastBatch ? [{
                    label: t("materialRequisitionDoc.summary.batches"),
                    value: t("materialRequisitionDoc.summary.batchesValue")
                      .replace("{n}", String(issueBatches.length))
                      .replace("{date}", lastBatch.issuedDate ? formatDisplayDate(lastBatch.issuedDate) : "—"),
                  }] : []),
                ]}
              />
              <RailCard title={t("materialRequisitionDoc.refTitle")}>
                <ReadonlyField label={t("materialRequisitionDoc.jobCodePrefix")} value={doc.jobCode} mono />
                <ReadonlyField label={t("materialRequisitionDoc.jobOrderPrefix")} value={doc.jobOrderCode} mono />
                <ReadonlyField label={t("materialRequisitionDoc.productionOrderPrefix")} value={doc.productionOrderId ?? ""} mono />
              </RailCard>
              <NextStepHint title={t("project.doc.nextStep")}>{confirmsOnIssue ? t("materialRequisitionDoc.noApprovalNeeded") : approvalHint}</NextStepHint>
              {/* คืนของทำที่สโตร์เท่านั้น (2026-09-23) — ใบเบิกของแผนกและใบจ่ายของสโตร์ต่างก็ไม่มีการ์ดคืนของในตัว */}
              {isStoreDoc && <NoteBox icon={<Undo2 size={16} />}>{t("storeDocs.returnViaReceipt")}</NoteBox>}
            </>
          }
        />

        <div data-tour="mrdoc-addline">
          <SectionCard
            title={
              <span className="flex items-baseline gap-2.5 flex-wrap">
                {t("materialRequisitionDoc.linesTitle")}
                <span className="text-[13px] font-normal text-muted-foreground">{t("ui.itemCount").replace("{n}", String(draft.lines.length))}</span>
              </span>
            }
            actions={editable ? (
              <span data-tour="mrdoc-addbuttons" className="flex items-center gap-2">
                <button type="button" onClick={openTemplatePicker} className={btn.secondarySm}>
                  <LayoutTemplate size={14} /> {t("materialRequisitionDoc.useTemplate")}
                </button>
                <button type="button" onClick={() => openProductPicker()} className={btn.secondarySm}>
                  <Plus size={14} /> {t("materialRequisitionDoc.addLine")}
                </button>
                <button type="button" onClick={() => setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankFreeTypedMaterialRequisitionLine()] })}
                  title={t("materialRequisitionDoc.freeLine.noStockHint")} className={btn.secondarySm}>
                  <Plus size={14} /> {t("materialRequisitionDoc.addFreeLine")}
                </button>
              </span>
            ) : undefined}
            bodyClassName=""
          >
            <div data-tour="mrdoc-lines">
              {draft.lines.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{t("materialRequisitionDoc.linesEmpty")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px]">
                    <thead>
                      <tr className={table.head}>
                        <th className={table.th}>{t("materialRequisitionDoc.col.productCode")}</th>
                        <th className={table.th}>{t("materialRequisitionDoc.col.item")}</th>
                        <th className={table.th}>{t("materialRequisitionDoc.col.unit")}</th>
                        <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.stockQty")}</th>
                        <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.plannedQty")}</th>
                        <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.issued")}</th>
                        <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.outstanding")}</th>
                        <th className={`${table.th} text-right`} title={t("materialRequisitionDoc.returnQtyHint")}>{t("materialRequisitionDoc.col.returnQty")}</th>
                        <th className={`${table.th} text-right`} title={t("materialRequisitionDoc.col.lastCostHint")}>{t("materialRequisitionDoc.col.lastCost")}</th>
                        <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.actualUsed")}</th>
                        <th className={`${table.th} w-12`}><span className="sr-only">{t("materialRequisitionDoc.removeLine")}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((line) => {
                        const stock = stockByProduct[line.productId];
                        const outstanding = outstandingQtyOf(line);
                        // "ของไม่พอ" เทียบกับที่ยังต้องจ่าย ไม่ใช่ที่ขอทั้งหมด — ส่วนที่จ่ายไปแล้วออกจากคลังไปแล้ว
                        const shortBy = stock !== undefined && outstanding > stock ? outstanding - stock : 0;
                        return (
                          <tr key={line.id} className="border-b border-[#eef1f6] last:border-b-0 align-top">
                            {/* รายการพิมพ์เอง (2026-10-06) — รหัส/ชื่อ/หน่วยพิมพ์ได้ระหว่างร่าง · ไม่ตัดสต๊อก */}
                            {editable && isFreeTypedLine(line) ? (
                              <td className={`${table.td} py-1.5`}>
                                <input value={line.productCode} onChange={(e) => updateLine(line.id, { productCode: e.target.value })}
                                  placeholder={t("materialRequisitionDoc.freeLine.codePlaceholder")}
                                  aria-label={t("materialRequisitionDoc.col.productCode")} className={`${field.cell} w-28 font-mono text-[13px]`} />
                              </td>
                            ) : (
                              <td className={`${table.td} py-2.5 font-mono text-[13px] text-[#3d5173] whitespace-nowrap`}>{line.productCode || "—"}</td>
                            )}
                            <td className={`${table.td} py-2.5 min-w-[220px]`}>
                              {editable && isFreeTypedLine(line) ? (
                                <input value={line.productName} onChange={(e) => updateLine(line.id, { productName: e.target.value })}
                                  placeholder={t("materialRequisitionDoc.freeLine.namePlaceholder")}
                                  aria-label={t("materialRequisitionDoc.col.item")} className={`${field.cell} w-full`} />
                              ) : (
                                <span className="block text-sm font-medium text-foreground leading-snug">{line.productName}</span>
                              )}
                              {isFreeTypedLine(line) && (
                                <span className="mt-1 inline-flex" title={t("materialRequisitionDoc.freeLine.noStockHint")}>
                                  <Tag tone="grey">{t("materialRequisitionDoc.freeLine.noStock")}</Tag>
                                </span>
                              )}
                              {shortBy > 0 && (
                                <span className="mt-1 inline-flex">
                                  <Tag tone="amber"><AlertTriangle size={12} /> {t("materialRequisitionDoc.shortBy").replace("{n}", shortBy.toLocaleString())}</Tag>
                                </span>
                              )}
                              <KitBreakdown productId={line.productId} qty={line.plannedQty} kits={kits} />
                            </td>
                            {editable && isFreeTypedLine(line) ? (
                              <td className={`${table.td} py-1.5`}>
                                <UnitCombobox value={line.unit} onChange={(next) => updateLine(line.id, { unit: next })}
                                  ariaLabel={t("materialRequisitionDoc.col.unit")} className={`${field.cell} w-20`} />
                              </td>
                            ) : (
                              <td className={`${table.td} py-2.5 text-sm text-[#3d5173] whitespace-nowrap`}>{line.unit}</td>
                            )}
                            <td className={`${numTd} ${shortBy > 0 ? "text-[#8a5a00] font-semibold" : "text-[#3d5173]"}`}>{stock === undefined ? "—" : stock.toLocaleString()}</td>
                            <td className={`${table.td} py-1.5 text-right`}>
                              {editable ? (
                                <input
                                  type="number"
                                  aria-label={`${t("materialRequisitionDoc.col.plannedQty")} ${line.productName}`}
                                  value={line.plannedQty ?? ""}
                                  onChange={(e) => updateLine(line.id, { plannedQty: numberOrNull(e.target.value) })}
                                  className={cellNumCls}
                                />
                              ) : <span className="text-sm font-medium tabular-nums">{line.plannedQty === null ? "—" : line.plannedQty.toLocaleString()}</span>}
                            </td>
                            <td className={`${numTd} text-foreground`}>{issuedQtyOf(line).toLocaleString()}</td>
                            <td className={`${numTd} ${isFinal && outstanding > 0 ? "text-[#8a5a00] font-semibold" : "text-[#3d5173]"}`}>{outstanding.toLocaleString()}</td>
                            <td className={`${numTd} text-[#3d5173]`} title={t("materialRequisitionDoc.returnQtyHint")}>{line.returnQty === null || line.returnQty === undefined ? "—" : line.returnQty.toLocaleString()}</td>
                            {/* ราคาที่ของจะกลับเข้าคลังด้วย — ราคาซื้อล่าสุด (ถ้ายังไม่เคยรับเข้าพร้อมราคา ใช้ถัวเฉลี่ย)
                                โชว์เฉย ๆ เพื่อให้สโตร์เห็นก่อนกดบันทึก เซิร์ฟเวอร์คิดเองอีกรอบตอนเขียนบัญชีเดินสะพัด */}
                            <td className={`${numTd} text-[#3d5173]`} title={t("materialRequisitionDoc.col.lastCostHint")}>
                              {returnCost(line.productId) > 0 ? returnCost(line.productId).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                            </td>
                            <td className={`${table.td} py-1.5 text-right`}>
                              {editable ? (
                                <input
                                  type="number"
                                  aria-label={`${t("materialRequisitionDoc.col.actualUsed")} ${line.productName}`}
                                  value={line.actualUsedQty ?? ""}
                                  onChange={(e) => updateLine(line.id, { actualUsedQty: numberOrNull(e.target.value) })}
                                  className={cellNumCls}
                                />
                              ) : <span className="text-sm tabular-nums">{line.actualUsedQty === null || line.actualUsedQty === undefined ? "—" : line.actualUsedQty.toLocaleString()}</span>}
                            </td>
                            <td className={`${table.td} py-1.5`}>
                              {editable && (
                                <button type="button" onClick={() => removeLine(line.id)} title={t("materialRequisitionDoc.removeLine")} aria-label={`${t("materialRequisitionDoc.removeLine")} ${line.productName}`} className={rowRemoveBtn}>
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
            </div>
            {!isStoreDoc && (
              <div className="px-6 py-4 border-t border-[#eef1f6] flex items-start gap-2 text-[13px] text-muted-foreground">
                <Info size={15} className="flex-shrink-0 mt-0.5" /> {t("storeDocs.deptViaStore")}
              </div>
            )}
          </SectionCard>
        </div>

        {/* การ์ด "จ่ายของ (สโตร์)" — ขึ้นให้คนที่มี stock:adjust เห็นเสมอ (ล็อกจนกว่าใบจะอนุมัติ) เพื่อให้รู้ว่ามีขั้นนี้อยู่
            ปุ่มบันทึกรอบนี้ย้ายขึ้นไปเป็นปุ่มหลักบนหัวเอกสาร (ดีไซน์ใหม่) */}
        {canIssueStock && isStoreDoc && (
          <div data-tour="mrdoc-issueCard">
            <SectionCard
              title={
                <span className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-[#e8f0fb] text-[#1a5fb4] flex items-center justify-center flex-shrink-0"><PackageCheck size={16} /></span>
                  {t("materialRequisitionDoc.issueRoundTitle").replace("{n}", String(nextIssueSeq))}
                </span>
              }
              actions={canIssue ? (
                <button type="button" onClick={() => openProductPicker("issue")} disabled={savingIssue} className={btn.secondarySm}>
                  <Plus size={14} /> {t("materialRequisitionDoc.addIssueLine")}
                </button>
              ) : undefined}
              bodyClassName=""
            >
              <div className={`px-6 pt-4 pb-5 flex flex-col gap-4 ${canIssue ? "border-b border-[#eef1f6]" : ""}`}>
                <p className="text-[13px] text-[#3d5173] leading-relaxed">{canIssue ? t("materialRequisitionDoc.issueHint") : t("materialRequisitionDoc.issueLocked")}</p>
                {canIssue && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4 items-start">
                    {renderChargeSelectors(false, "mr-issue")}
                    <Field label={t("materialRequisitionDoc.field.issuedBy")} htmlFor="mr-issue-storeDeptBy">
                      <input id="mr-issue-storeDeptBy" value={draft.storeDeptBy} onChange={(e) => setDraft({ ...draft, storeDeptBy: e.target.value })} className={inputCls} />
                    </Field>
                    <Field label={t("materialRequisitionDoc.field.issuedDate")} htmlFor="mr-issue-date">
                      <DateInput id="mr-issue-date" value={issueDate} onChange={(v) => setIssueDate(v)} className={inputCls} />
                    </Field>
                    <Field label={t("materialRequisitionDoc.field.issueRemark")} htmlFor="mr-issue-remark">
                      <input id="mr-issue-remark" value={issueRemark} onChange={(e) => setIssueRemark(e.target.value)} className={inputCls} />
                    </Field>
                  </div>
                )}
              </div>
              {canIssue && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px]">
                      <thead>
                        <tr className={table.head}>
                          <th className={table.th}>{t("materialRequisitionDoc.col.item")}</th>
                          <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.plannedQty")}</th>
                          <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.issued")}</th>
                          <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.outstanding")}</th>
                          <th className={`${table.th} text-right`}>{t("materialRequisitionDoc.col.stockQty")}</th>
                          <th className={table.th}>{t("materialRequisitionDoc.col.issueNow")}</th>
                          <th className={`${table.th} w-12`}><span className="sr-only">{t("materialRequisitionDoc.removeLine")}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {draft.lines.map((line) => {
                          const stock = stockByProduct[line.productId];
                          const outstanding = outstandingQtyOf(line);
                          const typed = Number(issueQty[line.id] ?? "");
                          // เตือนตรงช่องที่พิมพ์ ก่อนจะไปโดนเซิร์ฟเวอร์ปฏิเสธ — ของในคลังไม่พอ (แดง)
                          // จ่ายเกินที่ขอได้ตั้งแต่ 2026-09-24 (คำสั่งเจ้าของ) — แค่บอกว่าเกินเท่าไหร่ (ส้ม) ไม่ห้าม
                          const bad = Number.isFinite(typed) && typed > 0 && stock !== undefined && typed > stock;
                          const overBy = Number.isFinite(typed) && typed > outstanding ? typed - outstanding : 0;
                          return (
                            <tr key={line.id} className="border-b border-[#eef1f6] align-top">
                              <td className={`${table.td} py-2.5 min-w-[220px]`}>
                                <span className="flex items-baseline gap-2 flex-wrap min-w-0">
                                  <span className="font-mono text-[12.5px] text-muted-foreground flex-shrink-0">{line.productCode}</span>
                                  <span className="text-sm font-medium text-foreground">{line.productName}</span>
                                  {isFreeTypedLine(line) && <Tag tone="grey">{t("materialRequisitionDoc.freeLine.noStock")}</Tag>}
                                </span>
                                <KitBreakdown productId={line.productId} qty={typed > 0 ? typed : null} kits={kits} />
                              </td>
                              <td className={`${numTd} text-[#3d5173]`}>{(line.plannedQty ?? 0).toLocaleString()} {line.unit}</td>
                              <td className={`${numTd} text-[#3d5173]`}>{issuedQtyOf(line).toLocaleString()}</td>
                              <td className={`${numTd} ${outstanding > 0 ? "text-[#8a5a00] font-semibold" : "text-[#3d5173]"}`}>{outstanding.toLocaleString()}</td>
                              <td className={`${numTd} text-[#3d5173]`}>{stock === undefined ? "—" : stock.toLocaleString()}</td>
                              <td className={`${table.td} py-1.5`}>
                                <IssueQtyInput
                                  value={issueQty[line.id] ?? ""}
                                  unit={line.unit}
                                  tone={bad ? "bad" : overBy > 0 ? "over" : "ok"}
                                  ariaLabel={`${t("materialRequisitionDoc.col.issueNow")} ${line.productName}`}
                                  onChange={(v) => setIssueQty((prev) => ({ ...prev, [line.id]: v }))}
                                />
                                {overBy > 0 && (
                                  <span className="block text-xs text-[#8a5a00] mt-1 whitespace-nowrap">
                                    {t("materialRequisitionDoc.overIssue").replace("{n}", overBy.toLocaleString()).replace("{unit}", line.unit)}
                                  </span>
                                )}
                              </td>
                              <td className={table.td} />
                            </tr>
                          );
                        })}
                        {/* รายการที่สโตร์เพิ่มเองรอบนี้ — ยังไม่อยู่ในใบ ขอ = จ่าย เซิร์ฟเวอร์ต่อท้ายให้ตอนบันทึกรอบ */}
                        {extraIssueLines.map((line) => {
                          const stock = stockByProduct[line.productId];
                          const typed = Number(issueQty[line.id] ?? "");
                          const bad = Number.isFinite(typed) && typed > 0 && stock !== undefined && typed > stock;
                          return (
                            <tr key={line.id} className="border-b border-[#eef1f6] align-top bg-[#f5faf7]">
                              <td className={`${table.td} py-2.5 min-w-[220px]`}>
                                <span className="flex items-baseline gap-2 flex-wrap min-w-0">
                                  <span className="font-mono text-[12.5px] text-muted-foreground flex-shrink-0">{line.productCode}</span>
                                  <span className="text-sm font-medium text-foreground">{line.productName}</span>
                                  <Tag tone="green">{t("materialRequisitionDoc.extraLineBadge")}</Tag>
                                </span>
                                <KitBreakdown productId={line.productId} qty={typed > 0 ? typed : null} kits={kits} />
                              </td>
                              <td className={`${numTd} text-[#8a97ad]`}>—</td>
                              <td className={`${numTd} text-[#8a97ad]`}>—</td>
                              <td className={`${numTd} text-[#8a97ad]`}>—</td>
                              <td className={`${numTd} text-[#3d5173]`}>{stock === undefined ? "—" : stock.toLocaleString()}</td>
                              <td className={`${table.td} py-1.5`}>
                                <IssueQtyInput
                                  value={issueQty[line.id] ?? ""}
                                  unit={line.unit}
                                  tone={bad ? "bad" : "ok"}
                                  ariaLabel={`${t("materialRequisitionDoc.col.issueNow")} ${line.productName}`}
                                  onChange={(v) => setIssueQty((prev) => ({ ...prev, [line.id]: v }))}
                                />
                              </td>
                              <td className={`${table.td} py-1.5`}>
                                <button type="button" onClick={() => setExtraIssueLines((prev) => prev.filter((l) => l.id !== line.id))}
                                  title={t("materialRequisitionDoc.removeLine")} aria-label={`${t("materialRequisitionDoc.removeLine")} ${line.productName}`}
                                  className={rowRemoveBtn}>
                                  <X size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-3.5 bg-[#f8f9fc] rounded-b-xl text-xs text-muted-foreground">
                    {t("materialRequisitionDoc.issueSaveNote").replace("{label}", issueRoundLabel)}
                  </div>
                </>
              )}
            </SectionCard>
          </div>
        )}

        {/* ประวัติรอบการจ่าย — ทุกคนที่เปิดใบได้เห็น เพราะเป็นตัวตอบว่าของออกไปเมื่อไหร่ให้ใคร */}
        {issueBatches.length > 0 && (
          <SectionCard
            title={t("materialRequisitionDoc.batchesTitle")}
            subtitle={issueBatchesAreLegacy ? t("materialRequisitionDoc.batchesLegacyNote") : undefined}
            actions={<span className="text-[13px] text-muted-foreground">{t("materialRequisitionDoc.batchCount").replace("{n}", String(issueBatches.length))}</span>}
          >
            <div className="flex flex-col gap-3">
              {issueBatches.map((batch, idx) => {
                const isLast = idx === issueBatches.length - 1;
                return (
                  <div key={batch.id} className="border border-border rounded-[10px] overflow-hidden">
                    <div className="px-4 py-3 bg-[#f8f9fc] border-b border-[#eef1f6] flex items-center gap-3 flex-wrap">
                      <span className="h-6 px-2.5 rounded-full bg-[#0b1d3a] text-white text-xs font-semibold inline-flex items-center">
                        {t("materialRequisitionDoc.batchLabel").replace("{n}", String(batch.seq))}
                      </span>
                      <span className="flex-1 min-w-0 text-[13px] text-[#3d5173]">
                        {[batch.issuedDate ? formatDisplayDate(batch.issuedDate) : "—", batch.issuedBy, batch.chargeTeamName].filter(Boolean).join(" · ")}
                      </span>
                      {canIssue && isLast && (
                        <button type="button" onClick={() => setConfirmCancelBatch(batch)} className={rejectBtnSm}>
                          <Undo2 size={14} /> {t("materialRequisitionDoc.cancelBatch")}
                        </button>
                      )}
                    </div>
                    {batch.lines.map((bl) => {
                      const line = draft.lines.find((l) => l.id === bl.lineId);
                      return (
                        <div key={bl.lineId} className="grid grid-cols-[90px_minmax(0,1fr)_140px] gap-3 items-baseline px-4 py-2.5 border-b border-[#eef1f6] last:border-b-0">
                          <span className="font-mono text-[12.5px] text-muted-foreground truncate">{line?.productCode ?? "—"}</span>
                          <span className="min-w-0 text-sm text-foreground">
                            {line?.productName ?? t("materialRequisitionDoc.batchDeletedLine")}
                            <KitBreakdown productId={line?.productId} qty={bl.qty} kits={kits} />
                          </span>
                          <span className="text-sm text-right font-semibold tabular-nums">{bl.qty.toLocaleString()} {line?.unit ?? ""}</span>
                        </div>
                      );
                    })}
                    {batch.remark ? <p className="px-4 py-2.5 border-t border-[#eef1f6] text-[13px] text-muted-foreground">{batch.remark}</p> : null}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        <SectionCard title={t("materialRequisitionDoc.signatoriesTitle")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-5">
            {([
              ["preparedBy", "preparedAt", t("materialRequisitionDoc.field.preparedBy")],
              ["approvedBy", "approvedAt", t("materialRequisitionDoc.field.approvedBy")],
              ["storeDeptBy", "storeDeptAt", t("materialRequisitionDoc.field.storeDeptBy")],
              ["costDeptBy", "costDeptAt", t("materialRequisitionDoc.field.costDeptBy")],
            ] as const).map(([nameField, dateField, label]) => (
              <div key={nameField} className="flex flex-col gap-3">
                {textField(`mr-${nameField}`, label, draft[nameField], (v) => setDraft({ ...draft, [nameField]: v }))}
                {textField(`mr-${dateField}`, t("materialRequisitionDoc.field.date"), draft[dateField], (v) => setDraft({ ...draft, [dateField]: v }), { type: "date" })}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* ใบเบิกของสโตร์พิมพ์เป็นฟอร์ม "ใบจ่ายวัสดุ" ของโปรแกรมบัญชีเดิม (2026-09-23) — ฝ่ายอื่นยังเป็น FM-ST-04 */}
      {/* ใบสรุปจ่าย-คืน (2026-10-06) แทนที่ใบพิมพ์ปกติเฉพาะตอนกดพิมพ์ใบสรุป — มีใบพิมพ์ในหน้าได้ทีละใบ */}
      {summaryPrint
        ? <IssueReturnSummaryPrint summary={summaryPrint} companyName={companyHeader.name} printedAt={new Date().toISOString().slice(0, 10)} />
        : isStoreDoc
          ? <StoreIssuePrintDocument materialRequisition={doc} unitCostByProduct={printCosts} companyHeader={companyHeader} />
          : <MaterialRequisitionPrintDocument materialRequisition={doc} companyHeader={companyHeader} />}

      <ProductPickerModal
        open={pickerOpen}
        products={products}
        categories={categories}
        preferCategoryNames={MATERIAL_CATEGORY_NAMES}
        showStock
        multiSelect
        subtitle={(pickerTarget === "issue" ? t("materialRequisitionDoc.pickerHintIssue") : t("materialRequisitionDoc.pickerHint")).replace("{number}", formNumber)}
        onRequestProductCode={canRequestProductCode ? requestProductCode : undefined}
        onSelect={addProduct}
        onSelectMany={addProducts}
        onClose={() => setPickerOpen(false)}
      />

      <PickerDialog
        open={templatePickerOpen}
        title={t("materialRequisitionDoc.useTemplateTitle")}
        onClose={() => { setTemplatePickerOpen(false); setTemplateChoice(null); }}
        confirmLabel={<><LayoutTemplate size={16} /> {t("materialRequisitionDoc.useTemplate")}</>}
        confirmDisabled={!chosenTemplate}
        onConfirm={() => { if (chosenTemplate) applyTemplate(chosenTemplate); }}
        footerNote={chosenTemplate
          ? <>{t("project.picker.selectedLabel")} <strong className="font-semibold text-foreground">{chosenTemplate.name}</strong></>
          : t("project.picker.nothingSelected")}
      >
        {templates === null ? (
          <div className="px-6 py-4 space-y-2" aria-hidden="true">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
          </div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10 px-6">{t("materialRequisitionDoc.useTemplateEmpty")}</p>
        ) : (
          <>
            <div className="sticky top-0 z-[1] h-10 px-6 grid grid-cols-[18px_minmax(0,1fr)_110px] gap-3.5 items-center bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]">
              <span /><span>{t("mrTemplate.col.name")}</span><span className="text-right">{t("mrTemplate.linesTitle")}</span>
            </div>
            <div role="radiogroup" aria-label={t("materialRequisitionDoc.useTemplateTitle")}>
              {templates.map((tpl) => {
                const on = tpl.id === templateChoice;
                return (
                  <div
                    key={tpl.id}
                    role="radio"
                    aria-checked={on}
                    tabIndex={0}
                    onClick={() => setTemplateChoice(tpl.id)}
                    onDoubleClick={() => applyTemplate(tpl)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTemplateChoice(tpl.id); } }}
                    className={`grid grid-cols-[18px_minmax(0,1fr)_110px] gap-3.5 items-center px-6 min-h-[60px] py-2 border-b border-[#eef1f6] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 ${on ? "bg-[#eef4fc]" : "bg-white hover:bg-[#f8f9fc]"}`}
                  >
                    <span aria-hidden="true" className={`w-[18px] h-[18px] rounded-full border-[1.5px] bg-white flex items-center justify-center ${on ? "border-[#0b1d3a]" : "border-[#a3aec2]"}`}>
                      {on && <span className="w-2 h-2 rounded-full bg-[#0b1d3a]" />}
                    </span>
                    <span className="flex flex-col min-w-0 leading-snug">
                      <span className="text-sm font-medium text-foreground truncate">{tpl.name}</span>
                      {tpl.description.trim() !== "" && <span className="text-xs text-muted-foreground truncate">{tpl.description}</span>}
                    </span>
                    <span className="text-sm text-right tabular-nums text-[#3d5173] whitespace-nowrap">{t("mrTemplate.lineCount").replace("{n}", String(tpl.lines.length))}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </PickerDialog>

      <ConfirmDialog
        open={confirmDelete}
        title={t("materialRequisitionDoc.deleteConfirmTitle")}
        message={t("materialRequisitionDoc.deleteConfirmMessage")}
        confirmLabel={t("materialRequisitionDoc.deleteConfirmTitle")}
        danger
        busy={deleting}
        summary={
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-mono text-[13px] font-medium text-foreground">{formNumber}</span>
              <span className="text-[13px] text-[#3d5173] truncate">
                {[doc.jobCode ? `${t("materialRequisitionDoc.jobCodePrefix")} ${doc.jobCode}` : "", doc.customerName].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
            <span className="text-[13px] text-[#3d5173] whitespace-nowrap">{t("ui.itemCount").replace("{n}", String(doc.lines.length))} · {statusText}</span>
          </div>
        }
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
      {approval.dialogs}
    </div>
  );
}

/** ช่อง "จ่ายรอบนี้" + หน่วยต่อท้าย · กรอบแดง = ของในคลังไม่พอ · กรอบส้ม = จ่ายเกินที่ขอ (ไม่ห้าม แค่เตือน) */
function IssueQtyInput({ value, unit, tone, ariaLabel, onChange }: {
  value: string;
  unit: string;
  tone: "ok" | "over" | "bad";
  ariaLabel: string;
  onChange: (v: string) => void;
}) {
  const border = tone === "bad" ? "border-[#b93636]" : tone === "over" ? "border-[#d89614]" : "border-[#c3ccda]";
  return (
    <span className={`h-9 w-40 rounded-lg border ${border} bg-white flex items-stretch overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors`}>
      <input
        type="number"
        min={0}
        value={value}
        placeholder="0"
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 px-2.5 bg-transparent text-sm font-semibold text-right tabular-nums text-foreground outline-none"
      />
      {unit && <span className="px-2.5 flex items-center bg-[#f4f6fa] border-l border-border text-[12.5px] text-[#3d5173] whitespace-nowrap">{unit}</span>}
    </span>
  );
}
