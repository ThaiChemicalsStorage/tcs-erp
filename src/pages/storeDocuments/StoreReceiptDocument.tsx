import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, Loader2, Lock, PackageCheck, Plus, Printer, Save, Send, Trash2, Undo2, UserCheck, X,
} from "lucide-react";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { fmt } from "../../lib/quotes";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import type { CompanyHeaderInfo } from "../../lib/storage";
import {
  type StoreReceipt, type StoreReceiptLine, type StoreReceiptUpdateFields, type StoreReceiptBundle,
  type StoreReceiptSourceLine, type StoreReceiptSourceCandidate,
  fetchStoreReceipt, updateStoreReceipt, deleteStoreReceipt, fetchStoreReceiptSourceCandidates,
  submitStoreReceiptApproval, approveStoreReceipt, rejectStoreReceipt, withdrawStoreReceiptApproval,
  postStoreReceipt, logStoreReceiptPrinted, blankStoreReceiptLine,
} from "../../lib/storeReceipt";
import { storeReceiptCodeInfo, type StoreReceiptCode } from "../../lib/storeCodes";
import { useUserDirectory } from "../../lib/userDirectory";
import { RejectionNotice } from "../../components/DocumentApprovalActions";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { DocumentColumns, DocumentHeader, DocumentStepper, NextStepHint, RailCard } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { StoreReceiptPrintDocument } from "./StoreReceiptPrintDocument";
import { IssueReturnSummaryPrint } from "./IssueReturnSummaryPrint";
import { fetchIssueReturnSummary, type IssueReturnSummary } from "../../lib/materialRequisition";
import { RequisitionSourcePicker } from "./RequisitionSourcePicker";
import { KitBreakdown } from "../../components/KitBreakdown";
import { useKitRecipes } from "../../hooks/useKitRecipes";
import { useApprovalFlow } from "../purchaseRequest/useApprovalFlow";
import { rejectButtonClass } from "../purchaseRequest/docShared";
import { useApprovalHint } from "../project/projectUi";
import { Pill, RailSummaryCard, SummaryLine, Tag, type PillTone } from "../receivingReport/receivingUi";
import { countReturningLines, storeReceiptStepIndex } from "./storeDocsFormat";
import { formatDisplayDate } from "../../lib/displayDate";
import { DateInput } from "../../components/DateInput";

/** payload เดียวของปุ่มบันทึกและบันทึกอัตโนมัติ — ช่องที่เซิร์ฟเวอร์เขียนเอง (สถานะ/รับเข้าคลัง) ไม่อยู่ในนี้ */
function toUpdateFields(d: StoreReceipt): StoreReceiptUpdateFields {
  return {
    documentNumber: d.documentNumber, jobCode: d.jobCode, customerName: d.customerName, reference: d.reference,
    reason: d.reason, receivedDate: d.receivedDate, returnedBy: d.returnedBy, receivedBy: d.receivedBy,
    preparedBy: d.preparedBy, preparedAt: d.preparedAt, approvedBy: d.approvedBy, approvedAt: d.approvedAt,
    storeDeptBy: d.storeDeptBy, storeDeptAt: d.storeDeptAt, costDeptBy: d.costDeptBy, costDeptAt: d.costDeptAt,
    lines: d.lines.map((l) => ({ id: l.id, productId: l.productId, qty: l.qty, unitCost: l.unitCost, sourceLineId: l.sourceLineId })),
  };
}

const REFERENCE_LABEL_KEY = {
  FG: "storeReceipt.field.referenceFG", FP: "storeReceipt.field.referenceFP",
  GC: "storeReceipt.field.referenceGC", JN: "storeReceipt.field.referenceJN",
} as const;

const STATUS_TONE: Record<StoreReceipt["status"], PillTone> = { Draft: "grey", PendingApproval: "amber", Final: "blue" };

/** ช่องในตาราง: กรอกได้ = กล่อง 36px ชิดขวา · ขอบแดงเมื่อเกินยอด (คงคลาส e05252 ไว้ให้กฎช่องกรอกของหน้าเอกสารไม่ทับ) */
const cellInput = (bad = false) =>
  `${field.cell} w-full max-w-[140px] ml-auto block text-right tabular-nums ${bad ? "border-[#e05252] focus:border-[#e05252]" : ""}`;

/**
 * หน้าใบรับคืน / รับเข้าคลังของสโตร์ (2026-09-23) — หัวใบและตารางรายการเปลี่ยนไปตามพฤติกรรมของรหัส
 * (คืน / รับเข้า / ปรับยอด) ดู `src/lib/storeReceipt.ts`
 *
 * ดีไซน์ใหม่ 2026-09-30 (แบบหน้าใบเบิกของสโตร์): หัวเอกสารสีขาวมีปุ่มทั้งหมด (ปุ่มหลักมุมขวาเปลี่ยนตามขั้น — ส่งขออนุมัติ /
 * อนุมัติ / **บันทึกรับเข้าคลัง** เมื่ออนุมัติแล้ว) · แถบ 4 ขั้น (เพิ่มขั้น "รับเข้าคลังแล้ว") · ข้อมูลเอกสารซ้าย การ์ดสรุปรหัส
 * การอนุมัติ การ์ดรับเข้าคลัง และ "ขั้นต่อไป" ขวา · รายการเต็มความกว้างด้านล่าง
 */
export function StoreReceiptDocument({
  storeReceiptId, currentUserId, canEdit, canApprove, canPost, canPrint, canDelete, companyHeader, onBack, showToast,
}: {
  storeReceiptId: string;
  currentUserId: string;
  canEdit: boolean;
  canApprove: boolean;
  /** `stock:adjust` — ปุ่มรับเข้าคลัง */
  canPost: boolean;
  canPrint: boolean;
  canDelete: boolean;
  companyHeader: CompanyHeaderInfo;
  onBack: () => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const { byId } = useUserDirectory();
  // สินค้าชุด (2026-09-29) — คืนชุด = คืนชิ้นส่วน · รับเข้า/ปรับยอดเป็นชุดไม่ได้ (เซิร์ฟเวอร์ปฏิเสธ) จึงเตือนตั้งแต่บรรทัด
  const kits = useKitRecipes();
  const [doc, setDoc] = useState<StoreReceipt | null>(null);
  const [draft, setDraft] = useState<StoreReceipt | null>(null);
  const [stockByProduct, setStockByProduct] = useState<Record<string, number>>({});
  const [sourceLines, setSourceLines] = useState<StoreReceiptSourceLine[]>([]);
  const [candidates, setCandidates] = useState<StoreReceiptSourceCandidate[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [printing, setPrinting] = useState(false);
  // ต้นทุนต่อหน่วยสำหรับช่อง หน่วยละ/รวม ของใบพิมพ์ — มากับการกดพิมพ์ทุกครั้งจึงสดเสมอ
  const [printCosts, setPrintCosts] = useState<Record<string, number>>({});
  /** ใบสรุปจ่าย-คืนของใบเบิกต้นทาง (2026-10-06 เจ้าของ: "แล้วใบที่รับเสร็จแล้วละ") — มีค่า = พิมพ์ใบสรุปแทนใบรับคืน · ล้างหลังพิมพ์ */
  const [summaryPrint, setSummaryPrint] = useState<IssueReturnSummary | null>(null);

  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  const applyBundle = (b: StoreReceiptBundle) => {
    setDoc(b.storeReceipt);
    setDraft(b.storeReceipt);
    setStockByProduct(b.stockByProduct);
    setSourceLines(b.sourceLines);
    dirty.markSaved(toUpdateFields(b.storeReceipt));
  };

  useEffect(() => {
    let cancelled = false;
    fetchStoreReceipt(storeReceiptId)
      .then((b) => {
        if (cancelled) return;
        setDoc(b.storeReceipt); setDraft(b.storeReceipt); setStockByProduct(b.stockByProduct); setSourceLines(b.sourceLines);
      })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("storeReceipt.loadError")); });
    return () => { cancelled = true; };
  }, [storeReceiptId, t]);

  const code: StoreReceiptCode | null = doc?.receiptCode ?? null;
  const info = code ? storeReceiptCodeInfo(code) : null;
  const kind = info?.kind ?? "receive";

  // ตัวเลือกใบเบิกต้นทาง (เฉพาะใบคืน) และแคตตาล็อก (ใบรับเข้า/ปรับยอด) — โหลดตามพฤติกรรมของรหัส
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    if (storeReceiptCodeInfo(code).kind === "return") {
      fetchStoreReceiptSourceCandidates(code).then((list) => { if (!cancelled) setCandidates(list); }).catch(() => {});
    } else if (canEdit) {
      Promise.all([fetchProducts(), fetchCategories()]).then(([p, c]) => { if (!cancelled) { setProducts(p); setCategories(c); } }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [code, canEdit]);

  const editable = !!draft && canEdit && draft.status === "Draft";
  const autoSavePayload = draft && editable ? toUpdateFields(draft) : null;
  const draftBackup = useDraftBackup({ storageKey: draft ? `storeReceipt:${draft.id}` : null, data: autoSavePayload, enabled: editable });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: editable,
    onSave: async (fields) => {
      if (!draft) return;
      const b = await updateStoreReceipt(draft.id, fields, { autoSave: true });
      setDoc(b.storeReceipt);
      setStockByProduct(b.stockByProduct);
    },
  });

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const b = await updateStoreReceipt(draft.id, toUpdateFields(draft));
      applyBundle(b);
      autoSave.markSaved(toUpdateFields(b.storeReceipt));
      draftBackup.clear();
      showToast(t("storeReceipt.savedToast"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("storeReceipt.errorSave"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const { requestLeave } = useUnsavedChangesGuard(
    draft && canEdit
      ? {
        getRisk: () => assessUnsavedRisk({ isDirty: dirty.isDirtyNow(), hasServerRecord: true, autoSaveEnabled: editable, autoSaveState: autoSave.state }),
        documentLabel: draft.documentNumber || draft.id,
        save,
        discard: draftBackup.clear,
      }
      : null,
  );

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => { setShowPrint(false); setSummaryPrint(null); };
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  const onStatusChanged = (updated: StoreReceipt) => {
    setDoc(updated);
    setDraft(updated);
    dirty.markSaved(toUpdateFields(updated));
  };

  // ── ขั้นอนุมัติ / ข้อความ "ขั้นต่อไป" — เป็น hook จึงต้องอยู่เหนือ early return ─────────────────────
  // ตรรกะเดียวกับ DocumentApprovalActions เดิมทุกประการ แค่ปุ่มถูกวางตามดีไซน์ใหม่ (ปุ่มหลักมุมขวา)
  const posted = !!doc?.postedAt;
  const codeName = info ? t(info.nameKey) : "";
  const docNumber = draft ? draft.documentNumber || draft.id : "";
  const chargeText = draft ? [draft.chargeDepartmentName, draft.chargeTeamName].filter(Boolean).join(" / ") : "";
  const itemCountText = t("ui.itemCount").replace("{n}", String(draft?.lines.length ?? 0));
  const approval = useApprovalFlow<StoreReceipt>({
    status: doc?.status ?? "Draft",
    canEdit,
    canApprove,
    onSubmit: async () => { if (dirty.isDirtyNow()) await save(); return submitStoreReceiptApproval(doc?.id ?? ""); },
    onApprove: () => approveStoreReceipt(doc?.id ?? ""),
    onReject: (c) => rejectStoreReceipt(doc?.id ?? "", c),
    onWithdraw: () => withdrawStoreReceiptApproval(doc?.id ?? ""),
    onUpdated: onStatusChanged,
    showToast,
    summary: <SummaryLine title={docNumber} sub={[codeName, chargeText].filter(Boolean).join(" · ")} right={itemCountText} />,
  });
  const approvalHint = useApprovalHint({
    status: doc?.status ?? "Draft",
    approverLabel: t("storeReceipt.approverLabel"),
    rejectionComment: doc?.rejectionComment ?? "",
    approvedByUserId: doc?.approvedByUserId,
    approvedByName: doc?.approvedBy ?? "",
    approvedAt: doc?.approvedAt ?? "",
    // ใบรับคืนไม่มีฉบับแก้ไข — ข้อความของขั้นอนุมัติแล้วจึงบอกเรื่องรับเข้าคลังแทน
    finalHint: posted ? t("storeReceipt.finalHintPosted") : canPost ? t("storeReceipt.finalHintAwaiting") : t("storeReceipt.finalHintAwaitingNoPerm"),
  });

  // ปุ่มหลัก (ส่งขออนุมัติ / อนุมัติ / รับเข้าคลัง) ขึ้นตามขั้นและสิทธิ์ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  const docTourSteps: TourStep[] = [
    { element: '[data-tour="srdoc-primary"]', manual: "ch24-5", popover: { title: t("tour.storeReceipt.primary.title"), description: t("tour.storeReceipt.primary.desc"), side: "bottom" } },
    { element: '[data-tour="srdoc-steps"]', manual: "ch24-5", popover: { title: t("tour.storeReceipt.steps.title"), description: t("tour.storeReceipt.steps.desc"), side: "bottom" } },
    { element: '[data-tour="srdoc-info"]', manual: "ch24-4", popover: { title: t("tour.storeReceipt.info.title"), description: t("tour.storeReceipt.info.desc"), side: "bottom" } },
    { element: '[data-tour="srdoc-lines"]', manual: "ch24-4", popover: { title: t("tour.storeReceipt.lines.title"), description: t("tour.storeReceipt.lines.desc"), side: "top" } },
    { element: '[data-tour="srdoc-post"]', manual: "ch24-5", popover: { title: t("tour.storeReceipt.post.title"), description: t("tour.storeReceipt.post.desc"), side: "left" } },
  ];
  const docTour = useModuleTour("storeReceiptDoc", currentUserId, docTourSteps, { autoStart: !!doc });

  if (loadError || !doc || !draft || !info) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20">
          <DocumentHeader backLabel={t("storeReceipt.backToList")} onBack={onBack} number={t("storeReceipt.title")} mono={false} />
        </div>
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertTriangle size={20} className="text-[#b93636]" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <button type="button" onClick={onBack} className={btn.secondary}>{t("storeReceipt.backToList")}</button>
          </div>
        ) : (
          <div className="px-4 md:px-8 py-6 flex flex-col gap-5" role="status" aria-live="polite">
            <span className="sr-only">{t("storeReceipt.loading")}</span>
            <div className="h-14 bg-muted rounded-xl animate-pulse" />
            <div className="h-64 bg-muted rounded-xl animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  const set = (patch: Partial<StoreReceipt>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setLine = (id: string, patch: Partial<StoreReceiptLine>) =>
    setDraft((d) => (d ? { ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : d));
  const num = (v: string): number | null => (v === "" ? null : Number(v));
  const sourceByLine = new Map(sourceLines.map((s) => [s.lineId, s]));

  // เลือกใบเบิกต้นทาง = บันทึกทันที เพราะเซิร์ฟเวอร์เป็นคนตั้งหัวใบและรายการตามใบเบิกนั้น
  const chooseSource = async (mrId: string) => {
    try {
      const b = await updateStoreReceipt(draft.id, { ...toUpdateFields(draft), lines: undefined, sourceRequisitionId: mrId });
      applyBundle(b);
      autoSave.markSaved(toUpdateFields(b.storeReceipt));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("storeReceipt.errorSave"));
    }
  };

  const runPost = async () => {
    setPosting(true);
    try {
      applyBundle(await postStoreReceipt(draft.id));
      showToast(t("storeReceipt.postedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("storeReceipt.errorSave"));
    } finally {
      setPosting(false);
      setConfirmPost(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      setPrintCosts(await logStoreReceiptPrinted(draft.id));
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("storeReceipt.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  // ใบสรุปของใบเบิกที่ใบรับคืนนี้อ้าง — ตัวเลขคืนนับเฉพาะใบรับคืนที่รับเข้าคลังแล้ว (รวมใบนี้ถ้ารับเข้าคลังแล้ว)
  const handlePrintSummary = async () => {
    if (!draft.sourceRequisitionId) return;
    setPrinting(true);
    try {
      setSummaryPrint(await fetchIssueReturnSummary(draft.sourceRequisitionId));
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("storeReceipt.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteStoreReceipt(draft.id);
      draftBackup.clear();
      showToast(t("storeReceipt.deletedToast"));
      onBack();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("storeReceipt.errorSave"));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const addProducts = (picked: Product[]) => {
    if (picked.length === 0) return;
    setDraft((d) => (d ? {
      ...d,
      lines: [...d.lines, ...picked.map((p) => ({ ...blankStoreReceiptLine(), productId: p.id, productCode: p.code, productName: p.name, unit: p.unit }))],
    } : d));
    setStockByProduct((s) => ({ ...s, ...Object.fromEntries(picked.map((p) => [p.id, p.stockQty])) }));
  };

  const statusText = doc.status === "Draft" ? t("materialRequisition.status.draft") : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final");
  const linesTitle = kind === "return" ? t("storeReceipt.lines.return") : kind === "adjust" ? t("storeReceipt.lines.adjust") : t("storeReceipt.lines.receive");
  const targetLabel = code === "TK" ? t("storeReceipt.col.targetTK") : t("storeReceipt.col.targetJU");
  const canPostNow = doc.status === "Final" && !posted && canPost;
  const returning = countReturningLines(draft.lines);
  const sourceCandidate = candidates.find((c) => c.id === draft.sourceRequisitionId);
  const deptLabel = (d: StoreReceiptSourceCandidate["ownerDepartment"]) =>
    d === "production" ? t("storeIssue.dept.production") : d === "store" ? t("storeIssue.dept.store") : t("storeIssue.dept.project");
  const sourceHint = (c: StoreReceiptSourceCandidate) =>
    [deptLabel(c.ownerDepartment), c.jobCode, c.storeReference, [c.chargeDepartmentName, c.chargeTeamName].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
  const approverName = doc.approvedBy.trim() || byId(doc.approvedByUserId)?.fullName || "";

  /** ช่องข้อความ: กรอกได้ = กล่อง · กรอกไม่ได้ = ข้อความธรรมดา (วันที่เป็นแบบไทย) */
  const textField = (id: string, label: string, value: string, onChange: (v: string) => void, opts: {
    type?: "date"; mono?: boolean; className?: string; help?: ReactNode; readonlyHelp?: ReactNode; required?: boolean; placeholder?: string;
  } = {}) => (editable ? (
    <Field label={label} htmlFor={id} required={opts.required} help={opts.help} className={opts.className}>
      <input id={id} type={opts.type ?? "text"} value={value} placeholder={opts.placeholder} onChange={(e) => onChange(e.target.value)}
        className={`${field.input} w-full ${opts.mono ? "font-mono" : ""}`} />
    </Field>
  ) : (
    <div className={`flex flex-col gap-0.5 min-w-0 ${opts.className ?? ""}`}>
      <ReadonlyField label={label} value={opts.type === "date" && value ? formatDisplayDate(value) : value} mono={opts.mono} />
      {opts.readonlyHelp && <span className="text-xs text-muted-foreground">{opts.readonlyHelp}</span>}
    </div>
  ));

  const documentNumberField = textField("sr-documentNumber", t("storeReceipt.field.documentNumber"), draft.documentNumber, (v) => set({ documentNumber: v }), {
    mono: true,
    help: t("storeReceipt.field.documentNumberHint").replace("{id}", doc.id),
    readonlyHelp: draft.documentNumber && draft.documentNumber !== doc.id ? `${t("materialRequisitionDoc.systemNumber")} ${doc.id}` : undefined,
  });
  const receivedDateField = textField("sr-receivedDate", t("storeReceipt.field.receivedDate"), draft.receivedDate, (v) => set({ receivedDate: v }), { type: "date" });
  const receivedByField = textField("sr-receivedBy", t("storeReceipt.field.receivedBy"), draft.receivedBy, (v) => set({ receivedBy: v }));

  const signers = ([
    ["preparedBy", "preparedAt", t("materialRequisitionDoc.field.preparedBy")],
    ["approvedBy", "approvedAt", t("materialRequisitionDoc.field.approvedBy")],
    ["storeDeptBy", "storeDeptAt", t("materialRequisitionDoc.field.storeDeptBy")],
    ["costDeptBy", "costDeptAt", t("materialRequisitionDoc.field.costDeptBy")],
  ] as const);
  const signatories = editable ? (
    <SectionCard title={t("storeReceipt.signatories")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {signers.map(([nameField, dateField, label]) => (
          <div key={nameField} className="flex flex-col gap-3 min-w-0">
            <Field label={label} htmlFor={`sr-${nameField}`}>
              <input id={`sr-${nameField}`} value={draft[nameField]} onChange={(e) => set({ [nameField]: e.target.value })} className={`${field.input} w-full`} />
            </Field>
            <Field label={t("materialRequisitionDoc.field.date")} htmlFor={`sr-${dateField}`}>
              <DateInput id={`sr-${dateField}`} value={draft[dateField]} onChange={(v) => set({ [dateField]: v })} className={`${field.input} w-full`} />
            </Field>
          </div>
        ))}
      </div>
    </SectionCard>
  ) : (
    <SectionCard title={t("storeReceipt.signatories")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
        {signers.map(([nameField, dateField, label]) => (
          <div key={nameField} className="flex flex-col gap-0.5 min-w-0">
            <ReadonlyField label={label} value={draft[nameField]} />
            {draft[dateField] && <span className="text-xs text-muted-foreground">{formatDisplayDate(draft[dateField])}</span>}
          </div>
        ))}
      </div>
    </SectionCard>
  );

  const numTd = `${table.td} py-2.5 text-right tabular-nums text-sm whitespace-nowrap`;
  const lineHeads: { label: string; right?: boolean }[] = kind === "return"
    ? [{ label: t("storeReceipt.col.issued"), right: true }, { label: t("storeReceipt.col.returned"), right: true }, { label: t("storeReceipt.col.returnNow"), right: true }]
    : kind === "receive"
    ? [{ label: t("storeReceipt.col.inStock"), right: true }, { label: t("storeReceipt.col.qty"), right: true }, { label: t("storeReceipt.col.unitCost"), right: true }]
    : [{ label: t("storeReceipt.col.inStock"), right: true }, { label: targetLabel, right: true }, { label: t("storeReceipt.col.diff"), right: true }];
  const showRemove = editable && kind !== "return";

  return (
    <>
      <div className="doc-form flex-1 overflow-y-auto print:hidden">
        <div className="sticky top-0 z-20">
          <DocumentHeader
            backLabel={t("storeReceipt.backToList")}
            onBack={() => requestLeave(onBack)}
            number={docNumber}
            status={
              <span className="flex items-center gap-2 flex-wrap">
                {docNumber !== doc.id && <span className="font-mono text-[13px] text-muted-foreground" title={t("materialRequisitionDoc.systemNumber")}>{doc.id}</span>}
                <Pill tone={STATUS_TONE[doc.status]} label={statusText} />
                {doc.status === "Final" && <Tag tone={posted ? "green" : "amber"}>{posted ? t("storeDocs.posted") : t("storeDocs.awaitingPost")}</Tag>}
              </span>
            }
            meta={editable
              ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />
              : doc.status !== "Draft" ? <><Lock size={14} aria-hidden="true" /> {t("storeReceipt.lockedMeta")}</> : undefined}
            actions={
              <>
                <TourReplayButton variant="title" onClick={docTour.start} />
                {canPrint && (
                  <button type="button" onClick={() => void handlePrint()} disabled={printing} className={btn.secondary}>
                    {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} {t("storeReceipt.print")}
                  </button>
                )}
                <MoreMenu
                  items={[
                    canPrint && kind === "return" && !!draft.sourceRequisitionId && {
                      key: "issueReturnSummary", label: t("materialRequisitionDoc.printIssueReturnSummary"), icon: Printer,
                      disabled: printing, onSelect: () => void handlePrintSummary(),
                    },
                    approval.canWithdraw && approval.canDecide && {
                      key: "withdraw", label: t("approval.withdraw"), icon: Undo2, disabled: approval.busy !== null, onSelect: approval.withdraw,
                    },
                    canDelete && !posted && { key: "delete", label: t("storeReceipt.deleteConfirm.title"), icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
                  ]}
                />
                {/* ปุ่มบันทึกร่างคงไว้ตามที่เจ้าของสั่ง (2026-09-30) แม้มีบันทึกอัตโนมัติ */}
                {editable && (
                  <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("storeReceipt.save")}
                  </button>
                )}
                {approval.canWithdraw && !approval.canDecide && (
                  <button type="button" onClick={approval.withdraw} disabled={approval.busy !== null} className={btn.secondary}>
                    {approval.busy === "withdraw" ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />} {t("approval.withdraw")}
                  </button>
                )}
                {approval.canDecide && (
                  <>
                    <button type="button" onClick={approval.reject} disabled={approval.busy !== null} className={rejectButtonClass}>{t("approval.reject")}</button>
                    <button type="button" data-tour="srdoc-primary" onClick={approval.approve} disabled={approval.busy !== null} className={btn.primary}>
                      <CheckCircle2 size={16} /> {t("approval.approve")}
                    </button>
                  </>
                )}
                {approval.canSubmit && (
                  <button type="button" data-tour="srdoc-primary" onClick={approval.submit} disabled={approval.busy !== null} className={btn.primary}>
                    {approval.busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("approval.submit")}
                  </button>
                )}
                {canPostNow && (
                  <button type="button" data-tour="srdoc-primary" onClick={() => setConfirmPost(true)} disabled={posting} className={btn.primary}>
                    {posting ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />} {t("storeReceipt.postBtn")}
                  </button>
                )}
              </>
            }
          />
        </div>

        <div className="px-4 md:px-8 py-6 flex flex-col gap-5">
          {editable && draftBackup.recovered && draftBackup.recoveredAt !== null && (
            <DraftRecoveryBanner
              savedAt={draftBackup.recoveredAt}
              onRestore={() => {
                const recovered = draftBackup.recovered!;
                setDraft((prev) => (prev ? {
                  ...prev, ...recovered,
                  lines: (recovered.lines ?? prev.lines).map((l) => ({ ...(prev.lines.find((p) => p.id === l.id) ?? blankStoreReceiptLine()), ...l })),
                } : prev));
                draftBackup.clear();
                showToast(t("common.draftRecovery.restoredToast"));
              }}
              onDiscard={draftBackup.dismiss}
            />
          )}

          <div data-tour="srdoc-steps">
            <DocumentStepper
              steps={[
                { label: t("approval.step.draft") },
                { label: t("approval.step.pending") },
                { label: t("approval.step.final") },
                { label: t("storeDocs.posted") },
              ]}
              current={storeReceiptStepIndex(doc.status, posted)}
              ariaLabel={t("storeReceipt.stepsAria")}
            />
          </div>
          <RejectionNotice comment={doc.rejectionComment ?? ""} />

          <DocumentColumns
            main={
              <>
                <div data-tour="srdoc-info">
                <SectionCard title={t("storeReceipt.infoTitle")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px] items-start">
                    {kind === "return" && (
                      editable ? (
                        <Field className="sm:col-span-2" label={t("storeReceipt.field.source").replace("{code}", info.pair ?? "")} htmlFor="sr-source"
                          help={t("storeReceipt.field.sourceHint").replace("{code}", info.pair ?? "")}>
                          <RequisitionSourcePicker
                            key={draft.sourceRequisitionId}
                            inputId="sr-source"
                            selectedId={draft.sourceRequisitionId}
                            selectedNumber={draft.sourceRequisitionNumber}
                            disabled={false}
                            placeholder={t("storeDocs.sourceSearch")}
                            onSelect={(id) => void chooseSource(id)}
                            options={candidates.map((c) => ({ id: c.id, number: c.documentNumber, hint: sourceHint(c) }))}
                          />
                        </Field>
                      ) : (
                        <div className="sm:col-span-2 flex items-center gap-3 min-w-0">
                          <span aria-hidden="true" className="w-9 h-9 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0">
                            <ClipboardList size={18} />
                          </span>
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-xs text-muted-foreground">{t("storeReceipt.field.source").replace("{code}", info.pair ?? "")}</span>
                            <span className="text-sm font-medium text-foreground truncate">
                              {draft.sourceRequisitionNumber
                                ? <span className="font-mono">{draft.sourceRequisitionNumber}</span>
                                : <span className="text-[#8a97ad]">—</span>}
                              {sourceCandidate && <span className="text-muted-foreground font-normal"> · {sourceHint(sourceCandidate)}</span>}
                            </span>
                          </div>
                        </div>
                      )
                    )}

                    {documentNumberField}
                    {receivedDateField}

                    {kind === "return" && (
                      <>
                        {/* ค่าจากใบเบิกต้นทาง แก้ที่นี่ไม่ได้ — ข้อความธรรมดาไม่มีกรอบ ตามกฎช่องกรอกของหน้าเอกสาร (2026-09-24) */}
                        <ReadonlyField label={t("storeReceipt.field.jobCode")} value={draft.jobCode} mono />
                        <ReadonlyField label={t("storeDocs.col.charge")} value={chargeText} />
                        {textField("sr-returnedBy", t("storeReceipt.field.returnedBy"), draft.returnedBy, (v) => set({ returnedBy: v }))}
                        {receivedByField}
                      </>
                    )}

                    {kind === "receive" && code && code in REFERENCE_LABEL_KEY && (
                      <>
                        {textField("sr-reference", t(REFERENCE_LABEL_KEY[code as keyof typeof REFERENCE_LABEL_KEY]), draft.reference, (v) => set({ reference: v }))}
                        {code === "GC"
                          ? textField("sr-customer", t("storeReceipt.field.customerName"), draft.customerName, (v) => set({ customerName: v }))
                          : textField("sr-jobCode", t("storeReceipt.field.jobCode"), draft.jobCode, (v) => set({ jobCode: v }), { mono: true })}
                        {textField("sr-deliveredBy", t("storeReceipt.field.deliveredBy"), draft.returnedBy, (v) => set({ returnedBy: v }))}
                        {receivedByField}
                      </>
                    )}

                    {kind === "adjust" && textField("sr-reason", t("storeReceipt.field.reason"), draft.reason, (v) => set({ reason: v }), {
                      className: "sm:col-span-2", required: true,
                      placeholder: code === "TK" ? t("storeReceipt.field.reasonPlaceholderTK") : t("storeReceipt.field.reasonPlaceholderJU"),
                    })}
                  </div>
                </SectionCard>
                </div>

                {code === "GC" && (
                  <div className="rounded-xl border border-[#f0d9a8] bg-[#fdf3e0] px-4 py-3 text-sm text-[#8a5a00]">{t("storeReceipt.gcNote")}</div>
                )}

                {!editable && signatories}
              </>
            }
            rail={
              <>
                <RailSummaryCard
                  label={`${t("storeReceipt.title")} · ${t("storeReceipt.codeLabel")}`}
                  value={info.code}
                  mono
                  aside={codeName}
                  rows={[
                    ...(info.pair ? [{ label: t("storeReceipt.rail.pairLabel"), value: info.pair, mono: true }] : []),
                    ...(kind === "return" ? [
                      { label: t("storeReceipt.field.source").replace("{code}", info.pair ?? ""), value: draft.sourceRequisitionNumber || "—", mono: true },
                      {
                        label: t("storeReceipt.col.returnNow"),
                        value: t("storeReceipt.rail.returningValue").replace("{n}", String(returning.returning)).replace("{total}", String(returning.total)),
                      },
                    ] : [{ label: linesTitle, value: itemCountText }]),
                  ]}
                />

                {doc.status !== "Draft" && (
                  <RailCard title={t("storeReceipt.approval.title")}>
                    {doc.status === "PendingApproval" ? (
                      <div className="flex items-center gap-2.5">
                        <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-[#fdf3e0] text-[#8a5a00] flex items-center justify-center flex-shrink-0"><Clock size={16} /></span>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs text-muted-foreground">{t("storeReceipt.approval.waiting")}</span>
                          <span className="text-sm font-medium text-foreground leading-snug">{t("storeReceipt.approverLabel")}</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2.5">
                          <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><UserCheck size={16} /></span>
                          <ReadonlyField label={t("storeReceipt.approval.approver")} value={approverName} />
                        </div>
                        <ReadonlyField label={t("storeReceipt.approval.approvedAt")} value={doc.approvedAt ? formatDisplayDate(doc.approvedAt) : ""} />
                      </>
                    )}
                  </RailCard>
                )}

                <section data-tour="srdoc-post" className="bg-card border border-border rounded-xl p-5 flex flex-col gap-2.5">
                  <div className="flex items-center gap-2">
                    <PackageCheck size={16} aria-hidden="true" className={posted ? "text-[#1b7f4f]" : doc.status === "Final" ? "text-[#8a5a00]" : "text-[#8a97ad]"} />
                    <h2 className="flex-1 text-[15px] font-semibold text-foreground">{t("storeReceipt.postCard.title")}</h2>
                    {doc.status === "Final" && <Tag tone={posted ? "green" : "amber"}>{posted ? t("storeDocs.posted") : t("storeDocs.awaitingPost")}</Tag>}
                  </div>
                  <p className="text-[13px] text-[#3d5173] leading-relaxed">
                    {posted
                      ? t("storeReceipt.postCard.done").replace("{name}", doc.postedByName || "—").replace("{date}", formatDisplayDate(doc.postedAt))
                      : doc.status !== "Final" ? t("storeReceipt.postCard.locked")
                      : canPost ? t("storeReceipt.postCard.ready") : t("storeReceipt.postCard.noPermission")}
                  </p>
                </section>

                <NextStepHint title={t("project.doc.nextStep")}>{approvalHint}</NextStepHint>
              </>
            }
          />

          <div data-tour="srdoc-lines">
          <SectionCard
            title={
              <span className="flex items-baseline gap-2.5 flex-wrap">
                {linesTitle}
                <span className="text-[13px] font-normal text-muted-foreground">{itemCountText}</span>
              </span>
            }
            actions={editable && kind !== "return" ? (
              <button type="button" onClick={() => setPickerOpen(true)} className={btn.secondarySm}>
                <Plus size={14} /> {t("storeReceipt.addFromCatalog")}
              </button>
            ) : undefined}
            bodyClassName=""
          >
            {draft.lines.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{kind === "return" ? t("storeReceipt.linesEmptyReturn") : t("storeReceipt.linesEmpty")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className={table.head}>
                      <th className={`${table.th} w-10`}>#</th>
                      <th className={table.th}>{t("storeReceipt.col.productCode")}</th>
                      <th className={table.th}>{t("storeReceipt.col.item")}</th>
                      <th className={table.th}>{t("storeReceipt.col.unit")}</th>
                      {lineHeads.map((h) => <th key={h.label} className={`${table.th} ${h.right ? "text-right" : ""}`}>{h.label}</th>)}
                      {showRemove && <th className={`${table.th} w-12`}><span className="sr-only">{t("storeReceipt.removeLine")}</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((l, i) => {
                      const inStock = stockByProduct[l.productId];
                      const src = l.sourceLineId ? sourceByLine.get(l.sourceLineId) : undefined;
                      const room = src ? Math.max(0, src.issued - src.returned) : 0;
                      const over = kind === "return" && (l.qty ?? 0) > room && !posted;
                      const diff = kind === "adjust" && l.qty !== null && inStock !== undefined ? l.qty - inStock : null;
                      const qtyText = l.qty === null ? "—" : fmt(l.qty);
                      return (
                        <tr key={l.id} className="border-b border-[#eef1f6] align-top">
                          <td className={`${table.td} py-2.5 text-[13px] text-muted-foreground`}>{i + 1}</td>
                          <td className={`${table.td} py-2.5 font-mono text-[13px] whitespace-nowrap`}>{l.productCode}</td>
                          <td className={`${table.td} py-2.5 text-sm text-foreground`}>
                            {l.productName}
                            <KitBreakdown productId={l.productId} qty={l.qty} kits={kits} />
                            {kind !== "return" && kits.has(l.productId) && (
                              <span className="block text-xs text-[#b93636] mt-0.5">{t("kit.receiveBlocked")}</span>
                            )}
                          </td>
                          <td className={`${table.td} py-2.5 text-sm text-[#3d5173] whitespace-nowrap`}>{l.unit}</td>
                          {kind === "return" ? (
                            <>
                              <td className={numTd}>{src ? fmt(src.issued) : "—"}</td>
                              <td className={`${numTd} ${src && src.returned > 0 ? "" : "text-[#8a97ad]"}`}>{src ? fmt(src.returned) : "—"}</td>
                              <td className={`${table.td} py-1.5 text-right`}>
                                {editable ? (
                                  <>
                                    <input type="number" min={0} max={room} value={l.qty ?? ""} placeholder="0" aria-label={t("storeReceipt.col.returnNow")}
                                      onChange={(e) => setLine(l.id, { qty: num(e.target.value) })} className={cellInput(over)} />
                                    {over && <p className="text-xs text-[#b93636] mt-1">{t("storeReceipt.overReturn").replace("{n}", fmt(room))}</p>}
                                  </>
                                ) : (
                                  <span className="block py-1 text-sm font-semibold tabular-nums">{qtyText}</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className={numTd}>{inStock === undefined ? "—" : fmt(inStock)}</td>
                              <td className={`${table.td} py-1.5 text-right`}>
                                {editable ? (
                                  <input type="number" min={0} value={l.qty ?? ""} aria-label={kind === "adjust" ? targetLabel : t("storeReceipt.col.qty")}
                                    onChange={(e) => setLine(l.id, { qty: num(e.target.value) })} className={cellInput()} />
                                ) : (
                                  <span className="block py-1 text-sm font-semibold tabular-nums">{qtyText}</span>
                                )}
                              </td>
                              <td className={`${table.td} py-1.5 text-right`}>
                                {kind === "receive" ? (
                                  editable && code !== "GC" ? (
                                    <input type="number" min={0} value={l.unitCost ?? ""} aria-label={t("storeReceipt.col.unitCost")}
                                      onChange={(e) => setLine(l.id, { unitCost: num(e.target.value) })} className={cellInput()} />
                                  ) : (
                                    <span className="block py-1 text-sm tabular-nums">{code === "GC" || l.unitCost === null ? "—" : fmt(l.unitCost)}</span>
                                  )
                                ) : (
                                  <span className={`block py-1 text-sm font-semibold tabular-nums ${diff === null || diff === 0 ? "text-muted-foreground" : diff > 0 ? "text-[#1b7f4f]" : "text-[#b93636]"}`}>
                                    {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                                  </span>
                                )}
                              </td>
                              {showRemove && (
                                <td className={`${table.td} py-1.5`}>
                                  <button type="button" onClick={() => setDraft((d) => (d ? { ...d, lines: d.lines.filter((x) => x.id !== l.id) } : d))}
                                    aria-label={t("storeReceipt.removeLine")} title={t("storeReceipt.removeLine")}
                                    className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                                    <X size={16} />
                                  </button>
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
          </div>

          {editable && signatories}
        </div>
      </div>

      {summaryPrint
        ? <IssueReturnSummaryPrint summary={summaryPrint} companyName={companyHeader.name} printedAt={new Date().toISOString().slice(0, 10)} />
        : <StoreReceiptPrintDocument doc={draft} unitCostByProduct={printCosts} companyHeader={companyHeader} />}

      <ProductPickerModal
        open={pickerOpen}
        products={products}
        categories={categories}
        showStock
        multiSelect
        subtitle={t("storeReceipt.pickerHint").replace("{number}", docNumber)}
        onSelect={(p) => addProducts([p])}
        onSelectMany={addProducts}
        onClose={() => setPickerOpen(false)}
      />
      <ConfirmDialog
        open={confirmPost}
        title={t("storeReceipt.postConfirm.title")}
        message={t("storeReceipt.postConfirm.message")}
        confirmLabel={t("storeReceipt.postBtn")}
        tone="warning"
        summary={
          <SummaryLine
            title={docNumber}
            sub={[codeName, draft.sourceRequisitionNumber ? `${t("storeReceipt.field.source").replace("{code}", "")} ${draft.sourceRequisitionNumber}` : ""].filter(Boolean).join(" · ")}
            right={itemCountText}
          />
        }
        busy={posting}
        onConfirm={() => void runPost()}
        onCancel={() => setConfirmPost(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t("storeReceipt.deleteConfirm.title")}
        message={t("storeReceipt.deleteConfirm.message")}
        confirmLabel={t("storeReceipt.delete")}
        danger
        summary={
          <SummaryLine
            title={docNumber}
            sub={[codeName, draft.sourceRequisitionNumber].filter(Boolean).join(" · ")}
            right={<Pill tone={STATUS_TONE[doc.status]} label={statusText} />}
          />
        }
        busy={deleting}
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
      {approval.dialogs}
    </>
  );
}
