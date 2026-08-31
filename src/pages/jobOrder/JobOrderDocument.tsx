import { Fragment, useEffect, useState } from "react";
import { ChevronRight, Printer, Save, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X , CornerDownRight , GitBranch } from "lucide-react";
import type { DriveStep } from "driver.js";
import {
  type JobOrder, type JobOrderLine, type JobOrderUpdateFields,
  fetchJobOrder, updateJobOrder, finalizeJobOrder, logJobOrderPrinted, deleteJobOrder, blankJobOrderLine,
  submitJobOrderApproval, approveJobOrder, rejectJobOrder, withdrawJobOrderApproval,
  uploadJobOrderAttachment, deleteJobOrderAttachment,
  rewriteJobOrder,
} from "../../lib/jobOrder";
import { DocumentApprovalActions, RejectionNotice } from "../../components/DocumentApprovalActions";
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
  const [finalizing, setFinalizing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
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

  if (loadError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {t("jobOrderDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle size={20} className="text-[#e05252]" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <RotateCw size={12} /> {t("jobOrder.retry")}
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
            <ChevronRight size={14} className="rotate-180" /> {t("jobOrderDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-2.5 p-6">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">{t("jobOrderDoc.loadingDocument")}</p>
        </div>
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

  const finalize = async () => {
    setFinalizing(true);
    try {
      const updated = await finalizeJobOrder(doc.id);
      setDoc(updated);
      setDraft(updated);
      dirty.markSaved(toUpdateFields(updated));
      setConfirmFinalize(false);
      showToast(t("jobOrderDoc.finalized"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("jobOrderDoc.errorFinalize"));
    } finally {
      setFinalizing(false);
    }
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

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("jobOrderDoc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-mono font-medium tracking-wide">{doc.id}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${doc.status === "Draft" ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20" : doc.status === "PendingApproval" ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"}`}>
          {doc.status === "Draft" ? t("materialRequisition.status.draft") : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final")}
        </span>

        <div data-tour="jodoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
          {autoSaveEditable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
          {canEdit && doc.status === "Final" && (
            <button onClick={() => setConfirmRewrite(true)} disabled={rewriting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {rewriting ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />} {t("docRevision.rewrite")}
            </button>
          )}
          {canPrint && (
            <button onClick={handlePrint} disabled={printing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("jobOrderDoc.print")}
            </button>
          )}
          {editable && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("jobOrderDoc.saveDraft")}
            </button>
          )}
          <DocumentApprovalActions
            status={doc.status}
            canEdit={canEdit}
            canApprove={canFinalize}
            onSubmit={() => submitJobOrderApproval(doc.id)}
            onApprove={() => approveJobOrder(doc.id)}
            onReject={(c) => rejectJobOrder(doc.id, c)}
            onWithdraw={() => withdrawJobOrderApproval(doc.id)}
            onUpdated={(updated) => { setDoc(updated); setDraft(updated); dirty.markSaved(toUpdateFields(updated)); }}
            showToast={showToast}
          />
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("jobOrderDoc.delete")}
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto print:hidden">
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

        <RejectionNotice comment={doc.rejectionComment ?? ""} />
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
            <h1 className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">{t("jobOrderDoc.title")}</h1>
            <p className="text-[#a8bed8] text-xs mt-1">{t("jobOrderDoc.jobCodePrefix")} {doc.jobCode}</p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="jo-customerName" className="text-xs text-muted-foreground block mb-1">{t("jobOrderDoc.field.customerName")}</label>
              <input id="jo-customerName" disabled={!editable} value={draft.customerName}
                onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div />
            <div>
              <label htmlFor="jo-fromSite" className="text-xs text-muted-foreground block mb-1">{t("jobOrderDoc.field.fromSite")}</label>
              <input id="jo-fromSite" disabled={!editable} value={draft.fromSite}
                onChange={(e) => setDraft({ ...draft, fromSite: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="jo-toSite" className="text-xs text-muted-foreground block mb-1">{t("jobOrderDoc.field.toSite")}</label>
              {/* ดึงจากตาราง departments จริง — เก็บเป็น "ชื่อ" ไม่ใช่ id เพราะใบพิมพ์ต้องแสดงชื่อ
                  และมี option สำรองสำหรับค่าเก่าที่พิมพ์ไว้ก่อนมี dropdown แบบเดียวกับหน้าจัดการผู้ใช้ จะได้ไม่หายเงียบ */}
              <select id="jo-toSite" disabled={!editable} value={draft.toSite}
                onChange={(e) => setDraft({ ...draft, toSite: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70">
                <option value="">{t("jobOrderDoc.field.toSitePlaceholder")}</option>
                {departments.filter((d) => d.isActive).map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
                {draft.toSite && !departments.some((d) => d.name === draft.toSite) && (
                  <option value={draft.toSite}>{draft.toSite} ({t("users.field.department.legacy")})</option>
                )}
              </select>
            </div>
            <div>
              <label htmlFor="jo-startDate" className="text-xs text-muted-foreground block mb-1">{t("jobOrderDoc.field.startDate")}</label>
              <input id="jo-startDate" type="date" disabled={!editable} value={draft.startDate}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="jo-finishDate" className="text-xs text-muted-foreground block mb-1">{t("jobOrderDoc.field.finishDate")}</label>
              <input id="jo-finishDate" type="date" disabled={!editable} value={draft.finishDate}
                onChange={(e) => setDraft({ ...draft, finishDate: e.target.value })}
                className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
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

        <div data-tour="jodoc-lines" className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("jobOrderDoc.linesTitle")}</h2>
            {editable && (
              <div className="flex items-center gap-2">
                <button onClick={() => addLine()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("jobOrderDoc.addLine")}
                </button>
                {/* บรรทัดต่อ — ฟอร์ม FM-PJ-01 ตัวจริงมีแถวที่ไม่มีเลขลำดับแต่มีจำนวน/หน่วยของตัวเอง
                    เช่น "1 Flexible Joint" แล้วตามด้วย "Ø 650 | 15 | PCS" (ยืนยันจากตัวอย่างจริง 2026-08-31) */}
                <button onClick={() => addLine(true)} title={t("jobOrderDoc.continuationHint")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <CornerDownRight size={13} /> {t("jobOrderDoc.addContinuationLine")}
                </button>
              </div>
            )}
          </div>
          {draft.lines.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("jobOrderDoc.linesEmpty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[t("jobOrderDoc.col.description"), t("jobOrderDoc.col.quantity"), t("jobOrderDoc.col.unit"), t("jobOrderDoc.col.remark"), ""].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => (
                    <Fragment key={line.id}>
                    <tr className="border-b border-border/50">
                      <td className="px-3 py-2 min-w-[200px]">
                        <div className="flex items-center gap-1.5">
                          {/* ปุ่มสลับชนิดบรรทัด — ไอคอนบอกสถานะ ไม่ใช่แค่ตกแต่ง */}
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => updateLine(line.id, { isContinuation: !line.isContinuation })}
                            title={t("jobOrderDoc.continuationHint")}
                            aria-pressed={line.isContinuation === true}
                            aria-label={t("jobOrderDoc.addContinuationLine")}
                            className={`flex-shrink-0 transition-colors disabled:opacity-40 ${line.isContinuation ? "text-[#c9a84c]" : "text-muted-foreground opacity-40 hover:opacity-100"}`}
                          >
                            <CornerDownRight size={13} />
                          </button>
                          <input disabled={!editable} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })}
                            className={`w-full text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70 ${line.isContinuation ? "ml-3" : ""}`} />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" disabled={!editable} value={line.quantity ?? ""} onChange={(e) => updateLine(line.id, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input disabled={!editable} value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                          className="w-20 text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                      </td>
                      <td className="px-3 py-2">
                        <input disabled={!editable} value={line.remark} onChange={(e) => updateLine(line.id, { remark: e.target.value })}
                          className="w-full text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                      </td>
                      <td className="px-2 py-1.5">
                        {editable && (
                          <button onClick={() => removeLine(line.id)} title={t("jobOrderDoc.removeLine")} className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-[#e05252] transition-opacity">
                            <X size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* บรรทัดรายละเอียดย่อย — แถวของตัวเองใต้รายการหลัก ซ่อนทั้งแถวเมื่อเอกสารล็อกแล้วและไม่มีบรรทัดย่อย */}
                    {((line.subDetails ?? []).length > 0 || editable) && (
                      <tr className="border-b border-border/50">
                        <td colSpan={5} className="px-3 pb-2 space-y-1">
                          {(line.subDetails ?? []).map((sd, i) => (
                            <div key={i} className="flex items-center gap-2 pl-4">
                              <CornerDownRight size={12} className="text-muted-foreground flex-shrink-0" />
                              <input
                                disabled={!editable} value={sd}
                                onChange={(e) => updateLine(line.id, { subDetails: (line.subDetails ?? []).map((x, j) => (j === i ? e.target.value : x)) })}
                                placeholder={t("jobOrderDoc.subDetailPlaceholder")}
                                className="flex-1 min-w-[160px] text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70"
                              />
                              {editable && (
                                <button onClick={() => updateLine(line.id, { subDetails: (line.subDetails ?? []).filter((_, j) => j !== i) })}
                                  className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-[#e05252] transition-opacity">
                                  <X size={11} />
                                </button>
                              )}
                            </div>
                          ))}
                          {editable && (
                            <button onClick={() => updateLine(line.id, { subDetails: [...(line.subDetails ?? []), ""] })}
                              className="flex items-center gap-1.5 pl-4 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Plus size={11} /> {t("jobOrderDoc.addSubDetail")}
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div data-tour="jodoc-checklist" className="bg-card border border-border rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("jobOrderDoc.scopeChecklistTitle")}</h2>
          {draft.scopeChecklist.map((group) => (
            <ChecklistGroupCard
              key={group.key}
              group={group}
              disabled={!editable}
              onChange={(next) => setDraft((prev) => prev && { ...prev, scopeChecklist: prev.scopeChecklist.map((g) => (g.key === next.key ? next : g)) })}
            />
          ))}
        </div>

        {/* ไฟล์แนบ — การ์ดของตัวเอง ไม่ใช่ซ้อนอยู่ในการ์ด "รายละเอียดอื่นๆ" (DocumentAttachmentsCard
            เรนเดอร์ `bg-card border rounded-xl` ของมันเองอยู่แล้ว การซ้อนจึงได้กรอบซ้อนกรอบและอ่านเหมือน
            ว่าไฟล์แนบเป็นส่วนหนึ่งของ Out of Scope)
            ไม่ล็อคตามสถานะเอกสาร แต่ล็อคตามสิทธิ์แก้ เพราะแบบ/PO มักมาหลังอนุมัติ */}
        <DocumentAttachmentsCard
          attachments={doc.attachments ?? []}
          disabled={!canEdit}
          onUpload={async (file) => { const updated = await uploadJobOrderAttachment(doc.id, file); setDoc(updated); }}
          onDelete={async (attachmentId) => { const updated = await deleteJobOrderAttachment(doc.id, attachmentId); setDoc(updated); }}
        />

        <div className="bg-card border border-border rounded-xl p-5">
          <label htmlFor="jo-outOfScope" className="text-sm font-semibold text-foreground block mb-2" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("jobOrderDoc.outOfScopeTitle")}</label>
          <textarea id="jo-outOfScope" disabled={!editable} rows={3} value={draft.outOfScope}
            onChange={(e) => setDraft({ ...draft, outOfScope: e.target.value })}
            className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("jobOrderDoc.signatoriesTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {([
              ["requestedBy", "requestedAt", t("jobOrderDoc.field.requestedBy")],
              ["approvedBy", "approvedAt", t("jobOrderDoc.field.approvedBy")],
              ["documentRecipientBy", "documentRecipientAt", t("jobOrderDoc.field.documentRecipientBy")],
            ] as const).map(([nameField, dateField, label]) => (
              <div key={nameField} className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`jo-${nameField}`} className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input id={`jo-${nameField}`} disabled={!editable} value={draft[nameField]}
                    onChange={(e) => setDraft({ ...draft, [nameField]: e.target.value })}
                    className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                </div>
                <div>
                  <label htmlFor={`jo-${dateField}`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.date")}</label>
                  <input id={`jo-${dateField}`} type="date" disabled={!editable} value={draft[dateField]}
                    onChange={(e) => setDraft({ ...draft, [dateField]: e.target.value })}
                    className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showPrint && <JobOrderPrintDocument jobOrder={doc} companyHeader={companyHeader} />}

      <ConfirmDialog
        open={confirmDelete}
        title={t("jobOrderDoc.deleteConfirmTitle")}
        message={t("jobOrderDoc.deleteConfirmMessage")}
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
        open={confirmFinalize}
        title={t("jobOrderDoc.finalizeConfirmTitle")}
        message={t("jobOrderDoc.finalizeConfirmMessage")}
        busy={finalizing}
        onConfirm={finalize}
        onCancel={() => setConfirmFinalize(false)}
      />
    </div>
  );
}
