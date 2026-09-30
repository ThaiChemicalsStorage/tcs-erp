import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CornerDownRight, GitBranch, Heading, Loader2, Lock, Plus, Printer, RotateCw, Save, Send, Trash2, Undo2 } from "lucide-react";
import {
  fetchProductionOrder, updateProductionOrder, deleteProductionOrder, logProductionOrderPrinted,
  submitProductionOrderApproval, approveProductionOrder, rejectProductionOrder, withdrawProductionOrderApproval,
  blankProductionOrderLine, updateProductionOrderSignatories, refreshProductionOrderFromScope, rewriteProductionOrder,
  type ProductionOrder, type ProductionOrderLine, type ProductionOrderUpdateFields,
} from "../../lib/productionOrder";
import { ProductionOrderPrintDocument } from "./ProductionOrderPrintDocument";
import { RejectionNotice } from "../../components/DocumentApprovalActions";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ApiError } from "../../lib/apiClient";
import { newId } from "../../lib/products";
import { useI18n } from "../../lib/i18n";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { getRevisionNumber, getRevisionRoot } from "../../lib/revisionDiff";
import { formatQuoteDateThai } from "../../lib/quotes";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { DocumentHeader, DocumentStepper, DocumentColumns, RailCard } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { btn, field, surface, table } from "../../components/ui/styles";
import {
  ApprovalStatusPill, PersonRow, RailSummaryCard, StepHint, SummaryBox, rejectButtonClass,
} from "../purchaseRequest/docShared";
import { useApprovalFlow } from "../purchaseRequest/useApprovalFlow";

function toUpdateFields(d: ProductionOrder): ProductionOrderUpdateFields {
  return {
    documentNumber: d.documentNumber, revisionNote: d.revisionNote,
    productName: d.productName, supervisorName: d.supervisorName,
    startDate: d.startDate, dueDate: d.dueDate, lines: d.lines,
    orderedBy: d.orderedBy, deliveredBy: d.deliveredBy, receivedBy: d.receivedBy, costDeptBy: d.costDeptBy,
  };
}

/** คอลัมน์ของตารางรายการสั่งผลิต: # · รายการ · จำนวน · หน่วย · หมายเหตุ (· ปุ่มลบ เมื่อแก้ได้) */
const LINE_GRID_EDIT = "grid grid-cols-[28px_minmax(0,1fr)_96px_96px_240px_36px] gap-2";
const LINE_GRID_READ = "grid grid-cols-[28px_minmax(0,1fr)_96px_96px_240px] gap-2";

// หน้าแก้ไขใบสั่งผลิต (FM-PD-02) — แก้ได้เฉพาะฉบับร่าง อนุมัติแล้วล็อก เหมือนเอกสารอื่นในระบบ
// หน้าตาแบบใหม่ 2026-09-30: หัวเอกสาร + แถบขั้นตอน + การ์ดข้อมูล/คอลัมน์ขวา + ตารางรายการ + ผู้เกี่ยวข้อง
export function ProductionOrderDocument({
  productionOrderId, company, canEdit, canApprove, canPrint, canDelete, onBack, onDeleted, onOpenOther, showToast,
}: {
  productionOrderId: string;
  /** โปรไฟล์บริษัทสำหรับโลโก้บนใบพิมพ์ FM-PD-02 */
  company: Company;
  canEdit: boolean;
  canApprove: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onBack: () => void;
  onDeleted: () => void;
  /** เปิดเอกสารใบอื่นในโมดูลเดียวกัน — ใช้ตอน Rewrite เพื่อพาไปฉบับใหม่ที่เพิ่งสร้าง */
  onOpenOther: (id: string) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<ProductionOrder | null>(null);
  const [draft, setDraft] = useState<ProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) — ประกาศเหนือ effect โหลดข้อมูล เพื่อตั้งฐานเทียบใหม่ทุกครั้งที่ดึงเอกสาร
  // toUpdateFields ครอบคลุมช่องผู้ลงนามหลังอนุมัติอยู่แล้ว จึงใช้ payload เดียวกันได้ทั้งสองเฟส
  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  useEffect(() => {
    let cancelled = false;
    fetchProductionOrder(productionOrderId)
      .then((d) => { if (!cancelled) { setDoc(d); setDraft(d); setLoading(false); dirty.markSaved(toUpdateFields(d)); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productionOrderId, dirty]);

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  // ── บันทึกอัตโนมัติ (2026-08-25) — hook ต้องอยู่ก่อน early return ทุกอันด้านล่าง ────────────────
  // Auto-save, declared above the loading/error early returns because hooks may not run
  // conditionally. It sends the exact payload the Save button sends and only while the document is
  // an editable Draft; the local snapshot alongside it survives a closed tab or a click onto
  // another page. See src/hooks/useAutoSave.ts.
  const autoSaveEditable = !!draft && canEdit && draft.status === "Draft";
  // เลขที่ที่พิมพ์บนฟอร์มว่างไม่ได้ (เซิร์ฟเวอร์ตอบ 400 โดยตั้งใจ) แต่การบันทึกอัตโนมัติยิงระหว่างที่ผู้ใช้ยัง
  // พิมพ์อยู่ — คนที่ล้างช่องเพื่อพิมพ์เลขใหม่จึงเห็น error กลางคันทั้งที่ยังพิมพ์ไม่เสร็จ ระหว่างที่ช่องว่าง
  // ให้ส่งเลขเดิมไปแทน (เท่ากับ "ยังไม่เปลี่ยน") แล้วค่อยบันทึกจริงเมื่อพิมพ์ค่าใหม่เสร็จ
  const autoSavePayload: ProductionOrderUpdateFields | null = draft && autoSaveEditable
    ? { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }
    : null;
  const draftBackup = useDraftBackup({
    storageKey: draft ? `productionOrder:${draft.id}` : null,
    data: autoSavePayload,
    enabled: autoSaveEditable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: autoSaveEditable,
    onSave: async (fields) => {
      if (!draft) return;
      const saved = await updateProductionOrder(draft.id, fields, { autoSave: true });
      // อัปเดตเฉพาะ doc (สถานะ/เวลาแก้ไขล่าสุด) ไม่แตะ draft เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      // Only `doc` is refreshed — never `draft`, which the user may be typing into right now.
      setDoc(saved);
    },
  });

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updateProductionOrder(draft.id, toUpdateFields(draft));
      setDoc(updated); setDraft(updated);
      // ตั้งฐานเทียบของ auto-save ใหม่เป็น "สิ่งที่เซิร์ฟเวอร์ตอบกลับมา" ซึ่งคือสิ่งที่ฟอร์มถืออยู่หลังบรรทัดบน
      // ไม่ใช่ค่าบนจอตอนเรียก ซึ่งอาจเก่าหรือใหม่กว่าที่ส่งขึ้นไปจริง
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("productionOrderDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorSave"));
      return false;
    } finally { setSaving(false); }
  };

  // ดึงรายการจากงานต้นทางมาแทนที่ทั้งชุด — ยืนยันก่อนเสมอ เพราะเขียนทับสิ่งที่พิมพ์ไว้เอง
  const refreshFromScope = async () => {
    if (!doc) return;
    setRefreshing(true);
    try {
      const updated = await refreshProductionOrderFromScope(doc.id);
      setDoc(updated); setDraft(updated);
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("productionOrderDoc.refreshed"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorRefresh"));
    } finally { setRefreshing(false); setConfirmRefresh(false); }
  };

  // สร้างฉบับแก้ไข แล้วเปิดฉบับใหม่ทันที — ฉบับเดิมยังอยู่ ไม่ถูกแตะต้อง
  const handleRewrite = async () => {
    if (!doc) return;
    setRewriting(true);
    try {
      const created = await rewriteProductionOrder(doc.id);
      showToast(t("docRevision.rewritten"));
      onOpenOther(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("docRevision.errorRewrite"));
    } finally { setRewriting(false); setConfirmRewrite(false); }
  };

  const saveSignatories = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updateProductionOrderSignatories(draft.id, {
        deliveredBy: draft.deliveredBy, receivedBy: draft.receivedBy, costDeptBy: draft.costDeptBy,
      });
      setDoc(updated); setDraft(updated);
      dirty.markSaved(toUpdateFields(updated));
      showToast(t("productionOrderDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorSave"));
      return false;
    } finally { setSaving(false); }
  };

  // การ์ด "ยังไม่ได้บันทึก" — ยังทำงานหลังอนุมัติด้วย เพราะช่องผู้ลงนาม (ผู้ส่งมอบ/ผู้รับ/ฝ่ายต้นทุน) ยังแก้ได้
  // และตอนนั้น auto-save ปิดอยู่ ปุ่ม "บันทึก" ในกล่องจึงต้องเลือกให้ตรงเฟส
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
          save: draft.status === "Draft" ? save : saveSignatories,
          discard: draftBackup.clear,
        }
      : null,
  );

  const applyUpdated = (d: ProductionOrder) => { setDoc(d); setDraft(d); dirty.markSaved(toUpdateFields(d)); };

  /** กล่องสรุปเอกสารในกล่องยืนยัน: เลขที่ · สินค้า · ลูกค้า (+ ค่าชิดขวา) */
  const docSummary = (aside?: ReactNode) => doc
    ? <SummaryBox primary={doc.documentNumber || doc.id} secondary={[doc.productName, doc.customerCompanyName].filter(Boolean).join(" · ") || undefined} aside={aside} />
    : undefined;

  // ขั้นอนุมัติ — hook จึงต้องอยู่เหนือ early return · เรียก route ด้วย id ของหน้า เพราะ doc อาจยังโหลดไม่เสร็จ
  const approvalFlow = useApprovalFlow<ProductionOrder>({
    status: doc?.status ?? "Draft",
    canEdit: !!doc && canEdit,
    canApprove: !!doc && canApprove,
    onSubmit: () => submitProductionOrderApproval(productionOrderId),
    onApprove: () => approveProductionOrder(productionOrderId),
    onReject: (c) => rejectProductionOrder(productionOrderId, c),
    onWithdraw: () => withdrawProductionOrderApproval(productionOrderId),
    onUpdated: applyUpdated,
    showToast,
    summary: docSummary(doc?.orderedBy.name ? `${t("productionOrderDoc.field.orderedBy")} ${doc.orderedBy.name}` : undefined),
  });

  const backLink = (
    <button type="button" onClick={() => requestLeave(onBack)} className="self-start text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
      <ArrowLeft size={14} /> {t("productionOrderDoc.backToAll")}
    </button>
  );

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="bg-card border-b border-border px-4 md:px-8 py-3.5 flex">{backLink}</div>
        <div className="flex items-center justify-center p-6" role="status" aria-live="polite">
          <Loader2 className="animate-spin text-muted-foreground" size={20} />
          <span className="sr-only">{t("productionOrder.loading")}</span>
        </div>
      </div>
    );
  }
  if (!doc || !draft) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="bg-card border-b border-border px-4 md:px-8 py-3.5 flex">{backLink}</div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">{t("productionOrder.loadError")}</p>
          <button type="button" onClick={() => requestLeave(onBack)} className={btn.secondary}>{t("productionOrderDoc.backToList")}</button>
        </div>
      </div>
    );
  }

  const editable = canEdit && doc.status === "Draft";
  const isFinal = doc.status === "Final";
  const isRevision = getRevisionNumber(doc.id) > 0;
  // หัวจดหมายของใบพิมพ์ — FM-PD-02 ใช้แค่โลโก้ ที่เหลือส่งไปเพื่อให้ชนิดครบเท่านั้น
  // สร้าง inline แบบเดียวกับใบเบิกพัสดุ/ใบส่งมอบสินค้า (ยังไม่มีตัวช่วยกลางสำหรับเรื่องนี้)
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  const setLines = (fn: (lines: ProductionOrderLine[]) => ProductionOrderLine[]) =>
    setDraft((prev) => prev && { ...prev, lines: fn(prev.lines) });
  const updateLine = (id: string, patch: Partial<ProductionOrderLine>) =>
    setLines((lines) => lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const handlePrint = async () => {
    setPrinting(true);
    try { await logProductionOrderPrinted(doc.id); setShowPrint(true); }
    catch (err) { showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorPrint")); }
    finally { setPrinting(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await deleteProductionOrder(doc.id); setConfirmDelete(false); onDeleted(); }
    catch (err) { showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorDelete")); setDeleting(false); }
  };

  const dateText = (iso: string) => (iso ? formatQuoteDateThai(iso) : "");
  const itemCount = draft.lines.filter((l) => !l.isSectionHeader && !l.isContinuation).length;
  const continuationCount = draft.lines.filter((l) => l.isContinuation).length;
  const headerCount = draft.lines.filter((l) => l.isSectionHeader).length;

  const headerMeta = autoSaveEditable
    ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />
    : doc.status === "PendingApproval"
      ? <><Lock size={14} /> {t("purchaseRequest.shared.lockedPending")}</>
      : undefined;

  const stepCurrent = doc.status === "Draft" ? 0 : doc.status === "PendingApproval" ? 1 : 3;
  const approverName = doc.approver.name.trim();
  const nextStep: { tone: "info" | "waiting"; text: string } =
    doc.status === "Draft"
      ? { tone: "info", text: t((doc.rejectionComment ?? "").trim() ? "approval.step.hint.draftRejected" : "approval.step.hint.draft") }
      : doc.status === "PendingApproval"
        ? { tone: "waiting", text: t("approval.step.hint.pending").replace("{approver}", t("productionOrderDoc.approverLabel")) }
        : {
          tone: "info",
          text: t("approval.step.hint.final")
            .replace("{by}", approverName ? t("approval.step.by").replace("{name}", approverName) : "")
            .replace("{at}", doc.approver.date ? t("approval.step.at").replace("{date}", formatQuoteDateThai(doc.approver.date)) : ""),
        };

  // ผู้ส่งมอบงาน/ผู้ตรวจรับงาน/แผนกต้นทุน เซ็นกันหลังอนุมัติและทำงานเสร็จ จึงกรอกได้แม้เอกสาร Final แล้ว
  // (บันทึกผ่าน route แยก /signatories ที่ไม่ติดล็อก Final — ดู handleSignatories() ฝั่งเซิร์ฟเวอร์)
  const postApprovalKeys = ["deliveredBy", "receivedBy", "costDeptBy"] as const;
  const signerBlock = (label: string, key: "orderedBy" | "deliveredBy" | "receivedBy" | "costDeptBy") => {
    const alwaysEditable = (postApprovalKeys as readonly string[]).includes(key) && canEdit;
    const enabled = editable || alwaysEditable;
    if (!enabled) {
      return (
        <div key={key} className="grid grid-cols-[minmax(0,1fr)_150px] gap-2.5">
          <ReadonlyField label={label} value={draft[key].name} />
          <ReadonlyField label={t("productionOrderDoc.field.date")} value={dateText(draft[key].date)} />
        </div>
      );
    }
    return (
      <div key={key} className="grid grid-cols-[minmax(0,1fr)_150px] gap-2.5">
        <Field label={label} htmlFor={`po-${key}`}>
          <input id={`po-${key}`} value={draft[key].name} onChange={(e) => setDraft({ ...draft, [key]: { ...draft[key], name: e.target.value } })} className={`${field.input} w-full min-w-0`} />
        </Field>
        <Field label={t("productionOrderDoc.field.date")} htmlFor={`po-${key}-date`}>
          <input id={`po-${key}-date`} type="date" value={draft[key].date} onChange={(e) => setDraft({ ...draft, [key]: { ...draft[key], date: e.target.value } })} className={`${field.input} w-full min-w-0 px-2`} />
        </Field>
      </div>
    );
  };

  const lineGrid = editable ? LINE_GRID_EDIT : LINE_GRID_READ;
  const removeButton = (onClick: () => void, label: string) => (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
      <Trash2 size={16} />
    </button>
  );

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-20 print:hidden">
        <DocumentHeader
          backLabel={t("productionOrderDoc.backToAll")}
          onBack={() => requestLeave(onBack)}
          number={doc.documentNumber || doc.id}
          status={<ApprovalStatusPill status={doc.status} />}
          meta={headerMeta}
          actions={
            <>
              {canPrint && (
                <button type="button" onClick={handlePrint} disabled={printing} className={btn.secondary}>
                  {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} {t("productionOrderDoc.print")}
                </button>
              )}
              {/* ปุ่ม "บันทึกฉบับร่าง" คงไว้ตามเจ้าของสั่ง (2026-09-30) แม้บอร์ดจะไม่มี — บันทึกอัตโนมัติยังทำงานอยู่ด้วย */}
              {editable && (
                <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("productionOrderDoc.saveDraft")}
                </button>
              )}
              {approvalFlow.canDecide && (
                <button type="button" onClick={approvalFlow.reject} disabled={approvalFlow.busy !== null} className={rejectButtonClass}>
                  {t("approval.reject")}
                </button>
              )}
              <MoreMenu
                items={[
                  editable && { key: "refresh", label: t("productionOrderDoc.refreshFromScope"), icon: RotateCw, hint: t("productionOrderDoc.refreshHint"), disabled: refreshing, onSelect: () => setConfirmRefresh(true) },
                  canEdit && isFinal && { key: "rewrite", label: t("docRevision.rewrite"), icon: GitBranch, hint: t("productionOrderDoc.rewriteHint"), disabled: rewriting, onSelect: () => setConfirmRewrite(true) },
                  approvalFlow.canWithdraw && { key: "withdraw", label: t("approval.withdraw"), icon: Undo2, hint: t("purchaseRequest.shared.withdrawHint"), disabled: approvalFlow.busy !== null, onSelect: approvalFlow.withdraw },
                  canDelete && { key: "delete", label: t("productionOrderDoc.confirmDelete.title"), icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
              {approvalFlow.canSubmit && (
                <button type="button" onClick={approvalFlow.submit} disabled={approvalFlow.busy !== null} className={btn.primary}>
                  {approvalFlow.busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("approval.submit")}
                </button>
              )}
              {approvalFlow.canDecide && (
                <button type="button" onClick={approvalFlow.approve} disabled={approvalFlow.busy !== null} className={btn.primary}>
                  <CheckCircle2 size={16} /> {t("approval.approve")}
                </button>
              )}
            </>
          }
        />
      </div>

      <div className="px-4 md:px-8 py-6 flex flex-col gap-5 print:hidden">
        {draftBackup.recovered && draftBackup.recoveredAt !== null && (
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

        <DocumentStepper
          steps={[{ label: t("approval.step.draft") }, { label: t("approval.step.pending") }, { label: t("approval.step.final") }]}
          current={stepCurrent}
          ariaLabel={t("purchaseRequest.shared.stepsAria")}
        />
        <RejectionNotice comment={doc.rejectionComment ?? ""} />

        <DocumentColumns
          main={
            <>
              <SectionCard title={t("productionOrderDoc.infoTitle")}>
                {editable ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px] items-start">
                    {/* เลขที่ที่พิมพ์บนฟอร์ม — แก้ได้ตอนเป็นร่าง แต่ id จริงของเอกสารไม่เปลี่ยน ตัวนับจึงเดินต่อตามปกติ */}
                    <Field label={t("productionOrderDoc.field.documentNumber")} htmlFor="po-documentNumber" help={t("productionOrderDoc.field.documentNumberHint")}>
                      <input id="po-documentNumber" value={draft.documentNumber} onChange={(e) => setDraft({ ...draft, documentNumber: e.target.value })} className={`${field.input} w-full font-mono`} />
                    </Field>
                    <Field label={t("productionOrderDoc.field.supervisorName")} htmlFor="po-supervisorName">
                      <input id="po-supervisorName" value={draft.supervisorName} onChange={(e) => setDraft({ ...draft, supervisorName: e.target.value })} className={`${field.input} w-full`} />
                    </Field>
                    <Field label={t("productionOrderDoc.field.productName")} htmlFor="po-productName" className="sm:col-span-2">
                      <input id="po-productName" value={draft.productName} onChange={(e) => setDraft({ ...draft, productName: e.target.value })} className={`${field.input} w-full`} />
                    </Field>
                    <Field label={t("productionOrderDoc.field.startDate")} htmlFor="po-startDate">
                      <input id="po-startDate" type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} className={`${field.input} w-full`} />
                    </Field>
                    <Field label={t("productionOrderDoc.field.dueDate")} htmlFor="po-dueDate">
                      <input id="po-dueDate" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} className={`${field.input} w-full`} />
                    </Field>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4 items-start">
                    <ReadonlyField label={t("productionOrderDoc.field.productName")} value={doc.productName} />
                    <ReadonlyField label={t("productionOrderDoc.field.supervisorName")} value={doc.supervisorName} />
                    <ReadonlyField label={t("productionOrderDoc.field.documentNumber")} value={doc.documentNumber || doc.id} mono />
                    <ReadonlyField label={t("productionOrderDoc.field.startDate")} value={dateText(doc.startDate)} />
                    <ReadonlyField label={t("productionOrderDoc.field.dueDate")} value={dateText(doc.dueDate)} />
                  </div>
                )}
              </SectionCard>

              {/* หมายเหตุการแก้ไข — โผล่เฉพาะเอกสารที่เป็นฉบับแก้ไข (มี -R{n} ต่อท้าย) เท่านั้น
                  ต่างจาก Scope of Work ตรงที่ข้อความนี้ถูกพิมพ์ลงบนเอกสารจริงด้วย */}
              {isRevision && (
                <SectionCard title={<span id="po-revisionNote-heading">{t("docRevision.noteTitle")}</span>} subtitle={t("docRevision.noteHelp")}>
                  <textarea
                    rows={4}
                    disabled={!editable}
                    aria-labelledby="po-revisionNote-heading"
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
              <RailSummaryCard
                label={t("productionOrderDoc.source.title")}
                value={doc.jobCode || "—"}
                mono
                subValue={doc.customerCompanyName || undefined}
                rows={[
                  { label: t("productionOrderDoc.linesHeading"), value: t("productionOrderDoc.source.linesValue").replace("{n}", String(itemCount)).replace("{c}", String(continuationCount)) },
                  { label: t("productionOrderDoc.source.headers"), value: String(headerCount) },
                  ...(doc.status === "Draft" ? [{ label: t("productionOrderDoc.field.orderedBy"), value: draft.orderedBy.name.trim() || "—" }] : []),
                ]}
              />
              {doc.status !== "Draft" && (
                <RailCard title={t("productionOrderDoc.approvalTitle")}>
                  <PersonRow role={t("productionOrderDoc.field.orderedBy")} name={doc.orderedBy.name} date={dateText(doc.orderedBy.date)} />
                  {/* ผู้อนุมัติแก้เองไม่ได้ — ระบบเติมให้ตอนกดอนุมัติ กันการปลอมลายเซ็น */}
                  {approverName ? (
                    <PersonRow role={t("productionOrderDoc.field.approver")} name={approverName} date={dateText(doc.approver.date)} />
                  ) : (
                    <ReadonlyField label={t("productionOrderDoc.field.approver")} value={<span className="text-[#8a97ad] font-normal">{t("productionOrderDoc.approverPending")}</span>} />
                  )}
                </RailCard>
              )}
              <StepHint tone={nextStep.tone} title={t("purchaseRequest.shared.nextStep")}>{nextStep.text}</StepHint>
            </>
          }
        />

        <section className={`${surface.card} overflow-hidden`}>
          <div className={surface.cardHead}>
            <h2 className={surface.cardTitle}>{t("productionOrderDoc.linesHeading")}</h2>
            <span className="flex-1 text-[13px] text-muted-foreground">
              {t("productionOrderDoc.lines.summary").replace("{n}", String(itemCount)).replace("{c}", String(continuationCount)).replace("{h}", String(headerCount))}
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`${lineGrid} items-center px-6 ${table.head}`}>
                <span>#</span>
                <span>{t("productionOrderDoc.line.descriptionPlaceholder")}</span>
                <span className="text-right">{t("productionOrderDoc.line.qty")}</span>
                <span>{t("productionOrderDoc.line.unit")}</span>
                <span>{t("productionOrderDoc.line.remark")}</span>
                {editable && <span />}
              </div>
              {draft.lines.length === 0 && (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">{t("productionOrderDoc.noLines")}</p>
              )}
              {draft.lines.map((l, idx) => {
                // บรรทัดต่อไม่กินเลขลำดับเหมือนบรรทัดหัวข้อ แต่ยังมีจำนวน/หน่วยของตัวเอง
                // ("3 หน้าแปลน 20A | 2 ตัว" แล้ว "หน้าแปลน 50A | 3 ตัว" บนฟอร์ม FM-PD-02 ตัวจริง)
                const number = draft.lines.slice(0, idx + 1).filter((x) => !x.isSectionHeader && !x.isContinuation).length;
                const rowBg = l.isSectionHeader ? "bg-[#fbf7ea]" : l.isContinuation ? "bg-[#fafbfd]" : "bg-white";
                const marker = l.isSectionHeader
                  ? <span className="text-xs font-bold text-[#7d6420]" aria-hidden="true">§</span>
                  : l.isContinuation
                    ? <span title={t("productionOrderDoc.line.continuationHint")} className="text-[#1a5fb4] flex"><CornerDownRight size={16} /></span>
                    : <span className="text-[13px] text-muted-foreground tabular-nums">{number}</span>;
                return (
                  <div key={l.id} className={`px-6 ${editable ? "pt-2 pb-1.5" : "py-3"} flex flex-col gap-1.5 border-b border-[#eef1f6] ${rowBg}`}>
                    {editable ? (
                      <div className={`${lineGrid} items-center`}>
                        {marker}
                        <input
                          value={l.description}
                          onChange={(e) => updateLine(l.id, { description: e.target.value })}
                          placeholder={l.isSectionHeader ? t("productionOrderDoc.line.headerPlaceholder") : t("productionOrderDoc.line.descriptionPlaceholder")}
                          aria-label={l.isSectionHeader ? t("productionOrderDoc.line.headerPlaceholder") : t("productionOrderDoc.line.descriptionPlaceholder")}
                          className={`${field.cell} min-w-0 ${l.isSectionHeader ? "col-span-3 font-semibold" : !l.isContinuation ? "font-medium" : ""}`}
                        />
                        {/* บรรทัดหัวข้อไม่มีจำนวน/หน่วย ตามฟอร์มจริง — ช่องนั้นจึงไม่มีเลย */}
                        {!l.isSectionHeader && (
                          <>
                            <input
                              type="number" value={l.qty ?? ""}
                              onChange={(e) => updateLine(l.id, { qty: e.target.value === "" ? null : Number(e.target.value) })}
                              placeholder={t("productionOrderDoc.line.qty")} aria-label={t("productionOrderDoc.line.qty")}
                              className={`${field.cell} min-w-0 text-right tabular-nums`}
                            />
                            <input
                              value={l.unit}
                              onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                              placeholder={t("productionOrderDoc.line.unit")} aria-label={t("productionOrderDoc.line.unit")}
                              className={`${field.cell} min-w-0`}
                            />
                          </>
                        )}
                        <input
                          value={l.remark}
                          onChange={(e) => updateLine(l.id, { remark: e.target.value })}
                          placeholder={t("productionOrderDoc.line.remark")} aria-label={t("productionOrderDoc.line.remark")}
                          className={`${field.cell} min-w-0`}
                        />
                        {removeButton(() => setLines((lines) => lines.filter((x) => x.id !== l.id)), t("productionOrderDoc.line.remove"))}
                      </div>
                    ) : (
                      <div className={`${lineGrid} items-start`}>
                        <span className="pt-0.5">{marker}</span>
                        <span className={`flex flex-col gap-1 min-w-0 ${l.isSectionHeader ? "col-span-3" : ""}`}>
                          <span className={`text-sm text-foreground break-words ${l.isSectionHeader ? "font-semibold" : !l.isContinuation ? "font-medium" : ""}`}>{l.description || "—"}</span>
                          {l.subDetails.map((sd, i) => (
                            <span key={i} className="text-[13px] text-[#3d5173] flex gap-1.5"><span aria-hidden="true" className="text-[#a3aec2]">↳</span>{sd}</span>
                          ))}
                        </span>
                        {!l.isSectionHeader && (
                          <>
                            <span className="text-sm text-right tabular-nums font-semibold">{l.qty ?? ""}</span>
                            <span className="text-sm text-[#3d5173]">{l.unit}</span>
                          </>
                        )}
                        <span className="text-sm text-[#3d5173] break-words">{l.remark}</span>
                      </div>
                    )}

                    {editable && l.subDetails.map((sd, i) => (
                      <div key={i} className="grid grid-cols-[28px_20px_minmax(0,1fr)_36px] gap-2 items-center">
                        <span />
                        <CornerDownRight size={16} className="text-[#a3aec2]" />
                        <input
                          value={sd}
                          onChange={(e) => updateLine(l.id, { subDetails: l.subDetails.map((x, j) => (j === i ? e.target.value : x)) })}
                          placeholder={t("productionOrderDoc.line.subDetailPlaceholder")}
                          aria-label={t("productionOrderDoc.line.subDetailPlaceholder")}
                          className={`${field.cell} min-w-0 text-[13.5px] text-[#3d5173]`}
                        />
                        {removeButton(() => updateLine(l.id, { subDetails: l.subDetails.filter((_, j) => j !== i) }), t("productionOrderDoc.line.remove"))}
                      </div>
                    ))}
                    {editable && (
                      <div className="pl-[30px]">
                        <button type="button" onClick={() => updateLine(l.id, { subDetails: [...l.subDetails, ""] })} className={`${btn.text} h-8 text-[13px] mx-0`}>
                          <Plus size={14} /> {t("productionOrderDoc.line.addSubDetail")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {editable && (
            <div className="px-6 pt-3 pb-4 flex items-center gap-4 flex-wrap">
              <button type="button" onClick={() => setLines((lines) => [...lines, blankProductionOrderLine(newId("poline"))])} className={btn.text}>
                <Plus size={16} /> {t("productionOrderDoc.line.add")}
              </button>
              <button type="button" onClick={() => setLines((lines) => [...lines, blankProductionOrderLine(newId("poline"), true)])} className={btn.text}>
                <Heading size={16} /> {t("productionOrderDoc.line.addHeader")}
              </button>
              <button type="button" onClick={() => setLines((lines) => [...lines, blankProductionOrderLine(newId("poline"), false, true)])} title={t("productionOrderDoc.line.continuationHint")} className={btn.text}>
                <CornerDownRight size={16} /> {t("productionOrderDoc.line.addContinuation")}
              </button>
              <span className="text-xs text-muted-foreground">{t("productionOrderDoc.line.continuationHint")}</span>
            </div>
          )}
        </section>

        {/* หลังอนุมัติแล้วปุ่ม "บันทึกฉบับร่าง" บนหัวหายไป สามช่องล่างจึงมีปุ่มบันทึกของตัวเองที่หัวการ์ด */}
        <SectionCard
          title={t("productionOrderDoc.signHeading")}
          subtitle={!editable && canEdit ? t("productionOrderDoc.saveSignatoriesHint") : undefined}
          actions={!editable && canEdit ? (
            <button type="button" onClick={() => { void saveSignatories(); }} disabled={saving} className={btn.secondarySm}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {t("productionOrderDoc.saveSignatories")}
            </button>
          ) : undefined}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-x-7 gap-y-5">
            {signerBlock(t("productionOrderDoc.field.orderedBy"), "orderedBy")}
            {/* ผู้อนุมัติแก้เองไม่ได้ — ระบบเติมให้ตอนกดอนุมัติ กันการปลอมลายเซ็น */}
            <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2.5">
              <ReadonlyField label={t("productionOrderDoc.field.approver")} value={approverName || <span className="text-[#8a97ad] font-normal">{t("productionOrderDoc.approverPending")}</span>} />
              <ReadonlyField label={t("productionOrderDoc.field.date")} value={dateText(doc.approver.date)} />
            </div>
            {signerBlock(t("productionOrderDoc.field.deliveredBy"), "deliveredBy")}
            {signerBlock(t("productionOrderDoc.field.receivedBy"), "receivedBy")}
            {signerBlock(t("productionOrderDoc.field.costDeptBy"), "costDeptBy")}
          </div>
        </SectionCard>
      </div>

      <ProductionOrderPrintDocument doc={doc} companyHeader={companyHeader} />

      {approvalFlow.dialogs}

      <ConfirmDialog
        open={confirmDelete}
        title={t("productionOrderDoc.confirmDelete.title")}
        message={t("productionOrderDoc.confirmDelete.message")}
        confirmLabel={deleting ? t("productionOrderDoc.deleting") : t("productionOrderDoc.confirmDelete.title")}
        danger
        summary={docSummary(doc.jobCode ? <span className="font-mono">{doc.jobCode}</span> : undefined)}
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmRefresh}
        title={t("productionOrderDoc.refreshConfirmTitle")}
        message={t("productionOrderDoc.refreshConfirmBody")}
        confirmLabel={t("productionOrderDoc.refreshFromScope")}
        tone="warning"
        summary={
          <SummaryBox
            primary={doc.jobCode || "—"}
            secondary={[t("productionOrderDoc.refresh.sourceOf").replace("{id}", doc.documentNumber || doc.id), doc.customerCompanyName].filter(Boolean).join(" · ")}
            aside={t("productionOrderDoc.refresh.currentLines").replace("{n}", String(draft.lines.length))}
          />
        }
        busy={refreshing}
        onConfirm={() => void refreshFromScope()}
        onCancel={() => setConfirmRefresh(false)}
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
              <span className="font-mono text-[13px] font-medium text-foreground">{doc.documentNumber || doc.id}</span>
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

