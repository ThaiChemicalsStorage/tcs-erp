import { Fragment, useEffect, useState } from "react";
import { Printer, Save, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X, CornerDownRight, GitBranch, Send, CheckCircle2, Undo2 } from "lucide-react";
import type { DriveStep } from "driver.js";
import {
  type JobOrder, type JobOrderLine, type JobOrderUpdateFields,
  fetchJobOrder, updateJobOrder, logJobOrderPrinted, deleteJobOrder, blankJobOrderLine,
  submitJobOrderApproval, approveJobOrder, rejectJobOrder, withdrawJobOrderApproval,
  uploadJobOrderAttachment, deleteJobOrderAttachment,
  rewriteJobOrder,
} from "../../lib/jobOrder";
import { RejectionNotice } from "../../components/DocumentApprovalActions";
import { DocumentHeader, DocumentStepper, DocumentColumns, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field, ReadonlyField, SelectBox } from "../../components/ui/Field";
import { btn, field } from "../../components/ui/styles";
import {
  ApprovalPill, RailSummaryCard, rejectBtn, rowRemoveBtn, useApprovalFlow, useApprovalHint, useApprovalSteps,
} from "../project/projectUi";
import { formatQuoteDateThai } from "../../lib/quotes";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ChecklistGroupCard } from "../quotation/ChecklistGroupCard";
import { JobOrderPrintDocument } from "./JobOrderPrintDocument";
import { useI18n } from "../../lib/i18n";
import { getRevisionNumber } from "../../lib/revisionDiff";
import { DocumentAttachmentsCard } from "../../components/DocumentAttachmentsCard";
import { fetchDepartments, type Department } from "../../lib/departments";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";

function toUpdateFields(j: JobOrder): JobOrderUpdateFields {
  return {
    lines: j.lines,
    revisionNote: j.revisionNote,
    scopeChecklist: j.scopeChecklist,
    outOfScope: j.outOfScope,
    customerName: j.customerName,
    fromSite: j.fromSite,
    toSite: j.toSite,
    startDate: j.startDate,
    finishDate: j.finishDate,
    requestedBy: j.requestedBy,
    requestedAt: j.requestedAt,
    approvedBy: j.approvedBy,
    approvedAt: j.approvedAt,
    documentRecipientBy: j.documentRecipientBy,
    documentRecipientAt: j.documentRecipientAt,
  };
}

// หน้าแก้ไขใบสั่งงาน: ข้อมูลหัวเรื่อง ตารางรายการดำเนินงานแบบพิมพ์เอง ขอบเขตงาน และผู้เกี่ยวข้อง
// Job Order editor: header fields, free-typed line table, scope-of-work checklist, and signatories.
export function JobOrderDocument({
  jobOrderId,
  company,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  onBack,
  onDeleted,
  onOpenOther,
  showToast,
}: {
  jobOrderId: string;
  /** โปรไฟล์บริษัทสำหรับหัวจดหมายบนใบพิมพ์ — FM-PJ-01 ตัวจริงมีโลโก้กับชื่อบริษัทอยู่หัวกระดาษ */
  company: Company;
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onBack: () => void;
  onDeleted: () => void;
  /** เปิดเอกสารใบอื่นในโมดูลเดียวกัน — ใช้ตอน Rewrite เพื่อพาไปฉบับใหม่ที่เพิ่งสร้าง */
  onOpenOther: (id: string) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<JobOrder | null>(null);
  // รายชื่อแผนกจริงสำหรับช่อง "ถึงหน่วยงาน" — GET /departments เปิดให้ทุกคนที่ล็อกอินแล้ว จึงไม่ต้องมีสิทธิ์เพิ่ม
  const [departments, setDepartments] = useState<Department[]>([]);
  const [draft, setDraft] = useState<JobOrder | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) ─────────────────────────────────────────────────────
  // ประกาศเหนือ effect โหลดข้อมูล เพราะทุกครั้งที่ดึงเอกสารจากเซิร์ฟเวอร์ต้องตั้งฐานเทียบใหม่ ไม่งั้นเอกสารจะ
  // ค้างสถานะ "ยังไม่บันทึก" ตลอดไปแล้วเด้งถามทุกครั้งที่เปลี่ยนหน้า
  const dirty = useDirtyTracker(draft && canEdit && draft.status === "Draft" ? toUpdateFields(draft) : null);
  useEffect(() => {
    let cancelled = false;
    // โหลดไม่สำเร็จก็ปล่อยเงียบ — ช่องจะเหลือแค่ค่าที่บันทึกไว้เดิม ดีกว่าพังทั้งหน้า
    fetchDepartments().then((list) => { if (!cancelled) setDepartments(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);


  useEffect(() => {
    let cancelled = false;
    fetchJobOrder(jobOrderId)
      .then((j) => { if (!cancelled) { setDoc(j); setDraft(j); dirty.markSaved(toUpdateFields(j)); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("jobOrderDoc.loadError"));
      });
    return () => { cancelled = true; };
  }, [jobOrderId, reloadKey, t, dirty]);

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="jodoc-actions"]', popover: { title: t("tour.jodoc.actions.title"), description: t("tour.jodoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="jodoc-lines"]', popover: { title: t("tour.jodoc.lines.title"), description: t("tour.jodoc.lines.desc"), side: "top" } },
    { element: '[data-tour="jodoc-checklist"]', popover: { title: t("tour.jodoc.checklist.title"), description: t("tour.jodoc.checklist.desc"), side: "top" } },
  ];

  // ── บันทึกอัตโนมัติ (2026-08-25) — hook ต้องอยู่ก่อน early return ทุกอันด้านล่าง ────────────────
  // Auto-save, declared above the loading/error early returns because hooks may not run
  // conditionally. It sends the exact payload the Save button sends and only while the document is
  // an editable Draft; the local snapshot alongside it survives a closed tab or a click onto
  // another page. See src/hooks/useAutoSave.ts.
  const autoSaveEditable = !!draft && canEdit && draft.status === "Draft";
  const autoSavePayload = draft && autoSaveEditable ? toUpdateFields(draft) : null;
  const draftBackup = useDraftBackup({
    storageKey: draft ? `jobOrder:${draft.id}` : null,
    data: autoSavePayload,
    enabled: autoSaveEditable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: autoSaveEditable,
    onSave: async (fields) => {
      if (!draft) return;
      const saved = await updateJobOrder(draft.id, fields, { autoSave: true });
      // อัปเดตเฉพาะ doc (สถานะ/เวลาแก้ไขล่าสุด) ไม่แตะ draft เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      // Only `doc` is refreshed — never `draft`, which the user may be typing into right now.
      setDoc(saved);
    },
  });

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updateJobOrder(draft.id, toUpdateFields(draft));
      setDoc(updated);
      setDraft(updated);
      // ตั้งฐานเทียบของ auto-save ใหม่เป็น "สิ่งที่เซิร์ฟเวอร์ตอบกลับมา" ซึ่งคือสิ่งที่ฟอร์มถืออยู่หลังบรรทัดบน
      // ไม่ใช่ค่าบนจอตอนเรียก ซึ่งอาจเก่าหรือใหม่กว่าที่ส่งขึ้นไปจริง
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("jobOrderDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("jobOrderDoc.errorSave"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // การ์ด "ยังไม่ได้บันทึก" — ปุ่ม "บันทึก" ในกล่องคือ save() ตัวจริงของหน้านี้ ผ่าน validation และรายงาน
  // ข้อผิดพลาดเหมือนกดปุ่มบันทึกเอง; save จึงต้องประกาศเหนือ early return เพราะ hook เรียกแบบมีเงื่อนไขไม่ได้
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

  const docTour = useModuleTour("jobOrderDoc", currentUserId, docTourSteps, { autoStart: !!doc });

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  // ── ขั้นตอนอนุมัติ / ขั้นตอนเอกสาร / ข้อความ "ขั้นต่อไป" — เป็น hook จึงต้องอยู่เหนือ early return ─────
  // ตรรกะอนุมัติเดียวกับ DocumentApprovalActions เดิมทุกประการ แค่ปุ่มถูกวางตามดีไซน์ใหม่ (ปุ่มหลักมุมขวา)
  const approval = useApprovalFlow<JobOrder>({
    status: doc?.status ?? "Draft",
    canEdit,
    canApprove: canFinalize,
    onSubmit: () => submitJobOrderApproval(doc?.id ?? ""),
    onApprove: () => approveJobOrder(doc?.id ?? ""),
    onReject: (c) => rejectJobOrder(doc?.id ?? "", c),
    onWithdraw: () => withdrawJobOrderApproval(doc?.id ?? ""),
    onUpdated: (updated) => { setDoc(updated); setDraft(updated); dirty.markSaved(toUpdateFields(updated)); },
    showToast,
  });
  const approvalSteps = useApprovalSteps(doc?.status ?? "Draft");
  const approvalHint = useApprovalHint({
    status: doc?.status ?? "Draft",
    approverLabel: t("jobOrderDoc.approverLabel"),
    rejectionComment: doc?.rejectionComment ?? "",
    approvedByUserId: doc?.approvedByUserId,
    approvedByName: doc?.approvedBy ?? "",
    approvedAt: doc?.approvedAt ?? "",
  });

  if (loadError || !doc || !draft) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20">
          <DocumentHeader backLabel={t("jobOrderDoc.backToAll")} onBack={() => requestLeave(onBack)} number={t("jobOrderDoc.title")} mono={false} />
        </div>
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertTriangle size={20} className="text-[#b93636]" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <button type="button" onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className={btn.secondary}>
              <RotateCw size={16} /> {t("jobOrder.retry")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 p-10" role="status">
            <Loader2 size={20} className="text-muted-foreground animate-spin" />
            <p className="text-[13px] text-muted-foreground">{t("jobOrderDoc.loadingDocument")}</p>
          </div>
        )}
      </div>
    );
  }

  const isDraftStatus = doc.status === "Draft";
  const editable = canEdit && isDraftStatus;

  // หัวจดหมายของใบพิมพ์ — ใบสั่งงานใช้แค่โลโก้กับชื่อบริษัท ที่เหลือถูกส่งไปเพื่อให้ชนิดครบเท่านั้น
  // สร้าง inline แบบเดียวกับที่ใบเบิกพัสดุและใบส่งมอบสินค้าทำ (ยังไม่มีตัวช่วยกลางสำหรับเรื่องนี้)
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  const updateLine = (id: string, patch: Partial<JobOrderLine>) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };
  const removeLine = (id: string) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.filter((l) => l.id !== id) });
  };
  const addLine = (isContinuation = false) => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankJobOrderLine(isContinuation)] });
  };

  // สร้างฉบับแก้ไข แล้วเปิดฉบับใหม่ทันที — ฉบับเดิมยังอยู่ครบ ไม่ถูกแตะต้อง
  const handleRewrite = async () => {
    if (!doc) return;
    setRewriting(true);
    try {
      const created = await rewriteJobOrder(doc.id);
      showToast(t("docRevision.rewritten"));
      onOpenOther(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("docRevision.errorRewrite"));
    } finally { setRewriting(false); setConfirmRewrite(false); }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await logJobOrderPrinted(doc.id);
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("jobOrderDoc.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteJobOrder(doc.id);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("jobOrderDoc.errorDelete"));
      setDeleting(false);
    }
  };

  const inputCls = `${field.input} w-full`;
  const cellCls = `${field.cell} w-full min-w-0`;
  /** ช่องข้อความของหัวใบ — แก้ได้ตอนร่าง · ล็อกแล้วแสดงเป็นค่าอ่านอย่างเดียว */
  const textField = (id: string, label: string, value: string, onChange: (v: string) => void, opts: { type?: "text" | "date"; className?: string } = {}) =>
    editable ? (
      <Field label={label} htmlFor={id} className={opts.className}>
        <input id={id} type={opts.type ?? "text"} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      </Field>
    ) : (
      <ReadonlyField label={label} value={opts.type === "date" && value ? formatQuoteDateThai(value) : value} className={opts.className} />
    );

  const mainLineCount = draft.lines.filter((l) => !l.isContinuation).length;
  const continuationCount = draft.lines.length - mainLineCount;
  const lineCountText = continuationCount > 0
    ? t("jobOrderDoc.lineCountWithCont").replace("{n}", String(mainLineCount)).replace("{c}", String(continuationCount))
    : t("ui.itemCount").replace("{n}", String(mainLineCount));
  const scopeTotal = draft.scopeChecklist.reduce((n, g) => n + g.options.length, 0);
  const scopeChecked = draft.scopeChecklist.reduce((n, g) => n + g.options.filter((o) => o.checked).length, 0);
  // เลขลำดับของบรรทัดหลัก — บรรทัดต่อไม่กินเลข (ตรงกับใบพิมพ์ FM-PJ-01)
  let runningNo = 0;
  const lineNumbers = draft.lines.map((l) => (l.isContinuation ? null : ++runningNo));

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-20 print:hidden">
        <DocumentHeader
          backLabel={t("jobOrderDoc.backToAll")}
          onBack={() => requestLeave(onBack)}
          number={doc.id}
          status={<ApprovalPill status={doc.status} />}
          meta={autoSaveEditable ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} /> : undefined}
          actions={
            <div data-tour="jodoc-actions" className="flex items-center gap-2.5 flex-wrap">
              <TourReplayButton variant="title" onClick={docTour.start} />
              {canPrint && (
                <button type="button" onClick={() => void handlePrint()} disabled={printing} className={btn.secondary}>
                  {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} {t("jobOrderDoc.print")}
                </button>
              )}
              <MoreMenu
                items={[
                  canEdit && {
                    key: "rewrite", label: t("docRevision.rewrite"), icon: GitBranch,
                    disabled: doc.status !== "Final" || rewriting, hint: doc.status === "Final" ? undefined : t("materialRequisitionDoc.rewriteAfterFinal"),
                    onSelect: () => setConfirmRewrite(true),
                  },
                  approval.canWithdraw && approval.canDecide && {
                    key: "withdraw", label: t("approval.withdraw"), icon: Undo2, disabled: approval.busy !== null, onSelect: approval.withdraw,
                  },
                  canDelete && { key: "delete", label: t("jobOrderDoc.deleteConfirmTitle"), icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
              {editable && (
                <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("jobOrderDoc.saveDraft")}
                </button>
              )}
              {approval.canWithdraw && !approval.canDecide && (
                <button type="button" onClick={approval.withdraw} disabled={approval.busy !== null} className={btn.secondary}>
                  {approval.busy === "withdraw" ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />} {t("approval.withdraw")}
                </button>
              )}
              {approval.canDecide && (
                <>
                  <button type="button" onClick={approval.requestReject} disabled={approval.busy !== null} className={rejectBtn}>{t("approval.reject")}</button>
                  <button type="button" onClick={approval.requestApprove} disabled={approval.busy !== null} className={btn.primary}>
                    <CheckCircle2 size={16} /> {t("approval.approve")}
                  </button>
                </>
              )}
              {approval.canSubmit && (
                <button type="button" onClick={approval.submit} disabled={approval.busy !== null} className={btn.primary}>
                  {approval.busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("approval.submit")}
                </button>
              )}
            </div>
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

        <DocumentStepper steps={approvalSteps.steps} current={approvalSteps.current} ariaLabel={t("materialRequisitionDoc.stepsAria")} />
        <RejectionNotice comment={doc.rejectionComment ?? ""} />

        <DocumentColumns
          main={
            <>
              <SectionCard title={t("jobOrderDoc.infoTitle")}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 items-start">
                  {textField("jo-customerName", t("jobOrderDoc.field.customerName"), draft.customerName,
                    (v) => setDraft({ ...draft, customerName: v }), { className: "sm:col-span-2" })}
                  {textField("jo-fromSite", t("jobOrderDoc.field.fromSite"), draft.fromSite, (v) => setDraft({ ...draft, fromSite: v }))}
                  {editable ? (
                    <Field label={t("jobOrderDoc.field.toSite")} htmlFor="jo-toSite">
                      {/* ดึงจากตาราง departments จริง — เก็บเป็น "ชื่อ" ไม่ใช่ id เพราะใบพิมพ์ต้องแสดงชื่อ
                          และมี option สำรองสำหรับค่าเก่าที่พิมพ์ไว้ก่อนมี dropdown แบบเดียวกับหน้าจัดการผู้ใช้ จะได้ไม่หายเงียบ */}
                      <SelectBox id="jo-toSite" value={draft.toSite} onChange={(e) => setDraft({ ...draft, toSite: e.target.value })}>
                        <option value="">{t("jobOrderDoc.field.toSitePlaceholder")}</option>
                        {departments.filter((d) => d.isActive).map((d) => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                        {draft.toSite && !departments.some((d) => d.name === draft.toSite) && (
                          <option value={draft.toSite}>{draft.toSite} ({t("users.field.department.legacy")})</option>
                        )}
                      </SelectBox>
                    </Field>
                  ) : (
                    <ReadonlyField label={t("jobOrderDoc.field.toSite")} value={draft.toSite} />
                  )}
                  {textField("jo-startDate", t("jobOrderDoc.field.startDate"), draft.startDate, (v) => setDraft({ ...draft, startDate: v }), { type: "date" })}
                  {textField("jo-finishDate", t("jobOrderDoc.field.finishDate"), draft.finishDate, (v) => setDraft({ ...draft, finishDate: v }), { type: "date" })}
                </div>
              </SectionCard>

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

              <SectionCard title={t("jobOrderDoc.outOfScopeTitle")}>
                {editable ? (
                  <textarea id="jo-outOfScope" aria-label={t("jobOrderDoc.outOfScopeTitle")} rows={3} value={draft.outOfScope}
                    onChange={(e) => setDraft({ ...draft, outOfScope: e.target.value })}
                    className={`${field.textarea} w-full resize-y`} />
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{draft.outOfScope || "—"}</p>
                )}
              </SectionCard>
            </>
          }
          rail={
            <>
              <RailSummaryCard
                label={t("jobOrderDoc.jobCodePrefix")}
                value={doc.jobCode || "—"}
                mono
                rows={[
                  { label: t("jobOrderDoc.field.toSite"), value: draft.toSite || "—" },
                  { label: t("jobOrderDoc.linesTitle"), value: lineCountText },
                  { label: t("jobOrderDoc.scopeShort"), value: t("jobOrderDoc.scopeCount").replace("{n}", String(scopeChecked)) },
                  { label: t("jobOrderDoc.attachmentsShort"), value: t("jobOrderDoc.attachmentCount").replace("{n}", String((doc.attachments ?? []).length)) },
                ]}
              />
              {/* ไฟล์แนบ — ไม่ล็อคตามสถานะเอกสาร แต่ล็อคตามสิทธิ์แก้ เพราะแบบ/PO มักมาหลังอนุมัติ */}
              <DocumentAttachmentsCard
                attachments={doc.attachments ?? []}
                disabled={!canEdit}
                onUpload={async (file) => { const updated = await uploadJobOrderAttachment(doc.id, file); setDoc(updated); }}
                onDelete={async (attachmentId) => { const updated = await deleteJobOrderAttachment(doc.id, attachmentId); setDoc(updated); }}
              />
              <NextStepHint title={t("project.doc.nextStep")}>{approvalHint}</NextStepHint>
            </>
          }
        />

        <div data-tour="jodoc-lines">
          <SectionCard
            title={
              <span className="flex items-baseline gap-2.5 flex-wrap">
                {t("jobOrderDoc.linesTitle")}
                <span className="text-[13px] font-normal text-muted-foreground">{lineCountText}</span>
              </span>
            }
            bodyClassName=""
          >
            {draft.lines.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{t("jobOrderDoc.linesEmpty")}</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[860px]">
                  <div className="grid grid-cols-[28px_36px_minmax(0,1fr)_96px_96px_240px_36px] gap-2 items-center px-6 h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]">
                    <span>#</span><span /><span>{t("jobOrderDoc.col.description")}</span><span className="text-right">{t("jobOrderDoc.col.quantity")}</span>
                    <span>{t("jobOrderDoc.col.unit")}</span><span>{t("jobOrderDoc.col.remark")}</span><span />
                  </div>
                  {draft.lines.map((line, idx) => (
                    <Fragment key={line.id}>
                      <div className={`px-6 pt-2 pb-1.5 flex flex-col gap-1.5 ${idx > 0 ? (line.isContinuation ? "border-t border-dashed border-border" : "border-t border-[#eef1f6]") : ""} ${line.isContinuation ? "bg-[#fafbfd]" : ""}`}>
                        <div className="grid grid-cols-[28px_36px_minmax(0,1fr)_96px_96px_240px_36px] gap-2 items-center">
                          <span className={`text-[13px] ${line.isContinuation ? "text-[#a3aec2]" : "text-muted-foreground"}`}>{lineNumbers[idx] ?? "—"}</span>
                          {/* ปุ่มสลับชนิดบรรทัด — ไอคอนบอกสถานะ ไม่ใช่แค่ตกแต่ง */}
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => updateLine(line.id, { isContinuation: !line.isContinuation })}
                            title={t("jobOrderDoc.continuationHint")}
                            aria-pressed={line.isContinuation === true}
                            aria-label={t("jobOrderDoc.addContinuationLine")}
                            className={`w-9 h-9 rounded-lg inline-flex items-center justify-center transition-colors disabled:opacity-40 ${line.isContinuation ? "bg-[#e8f0fb] text-[#1a5fb4]" : "text-[#8a97ad] hover:bg-[#f4f6fa] hover:text-foreground"}`}
                          >
                            <CornerDownRight size={16} />
                          </button>
                          {editable ? (
                            <>
                              <input aria-label={t("jobOrderDoc.col.description")} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })}
                                className={`${cellCls} ${line.isContinuation ? "" : "font-medium"}`} />
                              <input type="number" aria-label={t("jobOrderDoc.col.quantity")} value={line.quantity ?? ""}
                                onChange={(e) => updateLine(line.id, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                                className={`${cellCls} text-right tabular-nums`} />
                              <input aria-label={t("jobOrderDoc.col.unit")} value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })} className={cellCls} />
                              <input aria-label={t("jobOrderDoc.col.remark")} value={line.remark} onChange={(e) => updateLine(line.id, { remark: e.target.value })} className={cellCls} />
                              <button type="button" onClick={() => removeLine(line.id)} title={t("jobOrderDoc.removeLine")} aria-label={t("jobOrderDoc.removeLine")} className={rowRemoveBtn}>
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className={`text-sm text-foreground ${line.isContinuation ? "" : "font-medium"}`}>{line.description || "—"}</span>
                              <span className="text-sm text-right tabular-nums">{line.quantity ?? "—"}</span>
                              <span className="text-sm text-[#3d5173]">{line.unit}</span>
                              <span className="text-sm text-[#3d5173]">{line.remark}</span>
                              <span />
                            </>
                          )}
                        </div>
                        {/* บรรทัดรายละเอียดย่อย — ใต้รายการหลัก ซ่อนเมื่อเอกสารล็อกแล้วและไม่มีบรรทัดย่อย */}
                        {(line.subDetails ?? []).map((sd, i) => (
                          <div key={i} className="grid grid-cols-[72px_20px_minmax(0,1fr)_36px] gap-2 items-center">
                            <span />
                            <CornerDownRight size={14} className="text-[#a3aec2]" />
                            {editable ? (
                              <input
                                value={sd}
                                aria-label={t("jobOrderDoc.subDetailPlaceholder")}
                                onChange={(e) => updateLine(line.id, { subDetails: (line.subDetails ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
                                placeholder={t("jobOrderDoc.subDetailPlaceholder")}
                                className={`${cellCls} text-[#3d5173]`}
                              />
                            ) : <span className="text-sm text-[#3d5173]">{sd}</span>}
                            {editable ? (
                              <button type="button" onClick={() => updateLine(line.id, { subDetails: (line.subDetails ?? []).filter((_, j) => j !== i) })}
                                aria-label={t("jobOrderDoc.removeSubDetail")} title={t("jobOrderDoc.removeSubDetail")} className={rowRemoveBtn}>
                                <X size={14} />
                              </button>
                            ) : <span />}
                          </div>
                        ))}
                        {editable && (
                          <div className="pl-[72px]">
                            <button type="button" onClick={() => updateLine(line.id, { subDetails: [...(line.subDetails ?? []), ""] })}
                              className="h-8 px-2 rounded-md text-[13px] font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] inline-flex items-center gap-1.5 transition-colors">
                              <Plus size={14} /> {t("jobOrderDoc.addSubDetail")}
                            </button>
                          </div>
                        )}
                      </div>
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
            {editable && (
              <div className="px-6 py-3 border-t border-[#eef1f6] flex items-center gap-4 flex-wrap">
                <button type="button" onClick={() => addLine()} className={btn.text}>
                  <Plus size={16} /> {t("jobOrderDoc.addLine")}
                </button>
                {/* บรรทัดต่อ — ฟอร์ม FM-PJ-01 ตัวจริงมีแถวที่ไม่มีเลขลำดับแต่มีจำนวน/หน่วยของตัวเอง
                    เช่น "1 Flexible Joint" แล้วตามด้วย "Ø 650 | 15 | PCS" (ยืนยันจากตัวอย่างจริง 2026-08-31) */}
                <button type="button" onClick={() => addLine(true)} title={t("jobOrderDoc.continuationHint")} className={btn.text}>
                  <CornerDownRight size={16} /> {t("jobOrderDoc.addContinuationLine")}
                </button>
                <span className="text-xs text-muted-foreground">{t("jobOrderDoc.continuationHint")}</span>
              </div>
            )}
          </SectionCard>
        </div>

        <div data-tour="jodoc-checklist">
          <SectionCard
            title={
              <span className="flex items-baseline gap-2.5 flex-wrap">
                {t("jobOrderDoc.scopeChecklistTitle")}
                <span className="text-[13px] font-normal text-muted-foreground">
                  {t("jobOrderDoc.scopeSelected").replace("{n}", String(scopeChecked)).replace("{total}", String(scopeTotal))}
                </span>
              </span>
            }
          >
            <div className="flex flex-col gap-3">
              {draft.scopeChecklist.map((group) => (
                <ChecklistGroupCard
                  key={group.key}
                  group={group}
                  disabled={!editable}
                  onChange={(next) => setDraft((prev) => prev && { ...prev, scopeChecklist: prev.scopeChecklist.map((g) => (g.key === next.key ? next : g)) })}
                />
              ))}
            </div>
          </SectionCard>
        </div>

        <SectionCard title={t("jobOrderDoc.signatoriesTitle")}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-7 gap-y-5">
            {([
              ["requestedBy", "requestedAt", t("jobOrderDoc.field.requestedBy")],
              ["approvedBy", "approvedAt", t("jobOrderDoc.field.approvedBy")],
              ["documentRecipientBy", "documentRecipientAt", t("jobOrderDoc.field.documentRecipientBy")],
            ] as const).map(([nameField, dateField, label]) => (
              <div key={nameField} className="grid grid-cols-[minmax(0,1fr)_150px] gap-2.5 items-start">
                {textField(`jo-${nameField}`, label, draft[nameField], (v) => setDraft({ ...draft, [nameField]: v }))}
                {textField(`jo-${dateField}`, t("materialRequisitionDoc.field.date"), draft[dateField], (v) => setDraft({ ...draft, [dateField]: v }), { type: "date" })}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <JobOrderPrintDocument jobOrder={doc} companyHeader={companyHeader} />

      <ConfirmDialog
        open={confirmDelete}
        title={t("jobOrderDoc.deleteConfirmTitle")}
        message={t("jobOrderDoc.deleteConfirmMessage")}
        confirmLabel={t("jobOrderDoc.deleteConfirmTitle")}
        danger
        busy={deleting}
        summary={
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-mono text-[13px] font-medium text-foreground">{doc.id}</span>
              <span className="text-[13px] text-[#3d5173] truncate">{doc.customerName || "—"}</span>
            </div>
            {doc.jobCode && <span className="font-mono text-[12.5px] text-[#3d5173] whitespace-nowrap">{doc.jobCode}</span>}
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
      {approval.dialogs}
    </div>
  );
}
