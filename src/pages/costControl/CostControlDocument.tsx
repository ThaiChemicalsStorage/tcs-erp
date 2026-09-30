import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, CornerDownRight, FileSpreadsheet, Loader2, PenLine, Plus, Printer, Save, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { RejectionNotice } from "../../components/DocumentApprovalActions";
import { DocumentHeader, DocumentStepper, DocumentColumns, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { useUserDirectory } from "../../lib/userDirectory";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { ApiError } from "../../lib/apiClient";
import { Combobox } from "../../components/Combobox";
import { type ScopeOfWorkListItem, fetchAllScopeOfWorks } from "../../lib/scopeOfWork";
import { newId } from "../../lib/products";
import { fmt, formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import type { Company } from "../../lib/storage";
import {
  type CostControl, type CostControlUpdateFields, type CostControlLineKind,
  blankCostControlLine, lineTotalCost,
  fetchCostControl, updateCostControl, deleteCostControl, rewriteCostControl, logCostControlPrinted,
  submitCostControlApproval, approveCostControl, rejectCostControl, withdrawCostControlApproval,
} from "../../lib/costControl";
import { CostControlPrintDocument } from "./CostControlPrintDocument";
import { CostControlStatusPill } from "./costControlUi";
import { useCostControlApproval } from "./costControlHooks";

/** payload ที่ทั้งปุ่มบันทึกและ auto-save ส่ง — ต้องเป็นชุดเดียวกันเป๊ะ ไม่งั้นตัวจับการแก้ไขเพี้ยน */
function toUpdateFields(d: CostControl): CostControlUpdateFields {
  return {
    documentNumber: d.documentNumber,
    jobName: d.jobName, workType: d.workType, jobOrder: d.jobOrder, docDate: d.docDate,
    scopeOfWorkId: d.scopeOfWorkId,
    lines: d.lines,
    remarks: d.remarks, submittedBy: d.submittedBy, approvedBy: d.approvedBy,
    revisionNote: d.revisionNote,
  };
}

export function CostControlDocument({
  costControlId, canEdit, canApprove, canPrint, canDelete, canCreate, canViewScopeOfWork, company,
  onBack, onDeleted, onOpenOther, showToast,
}: {
  costControlId: string;
  canEdit: boolean;
  canViewScopeOfWork: boolean;
  canApprove: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  company: Company;
  onBack: () => void;
  onDeleted: () => void;
  onOpenOther: (id: string) => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<CostControl | null>(null);
  const [draft, setDraft] = useState<CostControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);

  /**
   * รายการ Scope of Work สำหรับช่อง "ผูกกับ Scope of Work" (2026-08-31)
   *
   * การผูกนี้ไม่ใช่แค่ทางลัดสำหรับเปิดเอกสาร — มันคือสิ่งที่ทำให้คนที่ถูกเลือกเป็น **ผู้รับเอกสาร**
   * ของ Scope ใบนั้นมองเห็นใบต้นทุนใบนี้ในรายการของตัวเองและเปิดอ่านได้ ตามที่เจ้าของสั่งไว้ว่า
   * *"Scope of work เวลาที่จะส่งไปให้คนอื่น มันจะมาพร้อมกับ Cost control ด้วย"*
   * ล้างช่องนี้ = ตัดสิทธิ์นั้นทันที
   */
  const [scopes, setScopes] = useState<ScopeOfWorkListItem[]>([]);
  // ช่องนี้ให้คน "พิมพ์เลข Scope" แต่สิ่งที่เก็บจริงคือ id — จับคู่ด้วยเลข Scope แบบไม่สนตัวพิมพ์
  // พิมพ์อะไรที่ไม่ตรงกับ Scope ใบไหนเลย = ไม่ผูก (`""`) ไม่มีการเดาให้
  const scopeOptions = useMemo(
    () => scopes.map((s) => ({ value: s.scopeNumber, label: s.scopeNumber, hint: s.customerName })),
    [scopes],
  );
  const scopeIdByNumber = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of scopes) map.set(s.scopeNumber.trim().toLowerCase(), s.id);
    return map;
  }, [scopes]);
  // `null` = ยังไม่มีใครพิมพ์ ให้แสดงเลข Scope ที่ได้จาก id ที่บันทึกไว้ · พอพิมพ์แล้วสิ่งที่พิมพ์ชนะ
  // (คำนวณตอนเรนเดอร์ ไม่ใช่ setState ใน effect ซึ่งทำให้เกิดการเรนเดอร์ซ้อน)
  const [scopeTyped, setScopeTyped] = useState<string | null>(null);
  useEffect(() => {
    if (!canViewScopeOfWork) return;
    let cancelled = false;
    fetchAllScopeOfWorks()
      .then((list) => { if (!cancelled) setScopes(list); })
      .catch(() => { if (!cancelled) setScopes([]); });
    return () => { cancelled = true; };
  }, [canViewScopeOfWork]);

  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);
  const scopeQuery = scopeTyped ?? (draft?.scopeOfWorkId
    ? scopes.find((s) => s.id === draft.scopeOfWorkId)?.scopeNumber ?? ""
    : "");

  useEffect(() => {
    let cancelled = false;
    fetchCostControl(costControlId)
      .then((d) => {
        if (cancelled) return;
        setDoc(d); setDraft(d); setLoading(false); setScopeTyped(null);
        dirty.markSaved(toUpdateFields(d));
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [costControlId, dirty]);

  const editable = !!draft && canEdit && draft.status === "Draft";
  // เลขที่เป็นฟิลด์บังคับ — ระหว่างที่ผู้ใช้ลบทิ้งเพื่อพิมพ์ใหม่ auto-save จะยิงพอดีแล้วโดน 400
  // เติมกลับเป็น id เสมอ (แบบเดียวกับใบสั่งซื้อ/ใบสั่งผลิต)
  const autoSavePayload: CostControlUpdateFields | null = draft && editable
    ? { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }
    : null;

  const draftBackup = useDraftBackup({
    storageKey: draft ? `costControl:${draft.id}` : null,
    data: autoSavePayload,
    enabled: editable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: editable,
    onSave: async (fields) => {
      if (!draft) return;
      setDoc(await updateCostControl(draft.id, fields, { autoSave: true }));
    },
  });

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updateCostControl(draft.id, { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id });
      setDoc(updated); setDraft(updated);
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("costControlDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("costControlDoc.errorSave"));
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
          autoSaveEnabled: editable, autoSaveState: autoSave.state,
        }),
        documentLabel: draft.documentNumber || draft.id,
        save,
        discard: draftBackup.clear,
      }
      : null,
  );

  const { byId } = useUserDirectory();
  // ขั้นตอนอนุมัติ — hook อยู่เหนือ early return · id ของเอกสารคือ costControlId เสมอ (โหลดด้วย id นี้)
  const approval = useCostControlApproval<CostControl>({
    onSubmit: () => submitCostControlApproval(costControlId),
    onApprove: () => approveCostControl(costControlId),
    onReject: (comment) => rejectCostControl(costControlId, comment),
    onWithdraw: () => withdrawCostControlApproval(costControlId),
    // markSaved ด้วยเสมอ — การอนุมัติเปลี่ยนเอกสารฝั่งเซิร์ฟเวอร์ ถ้าไม่รีเซ็ตฐาน ตัวจับการแก้ไข
    // จะค้างว่า "ยังไม่บันทึก" แล้วเด้งกล่องเตือนตอนออกจากหน้าทั้งที่ไม่มีอะไรค้าง
    onUpdated: (d) => { setDoc(d); setDraft(d); dirty.markSaved(toUpdateFields(d)); },
    showToast,
  });

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  if (loading) {
    return (
      <div className="flex-1 px-4 md:px-8 py-6" role="status" aria-live="polite">
        <span className="sr-only">{t("costControl.loading")}</span>
        <div className="h-8 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }
  if (loadError || !draft || !doc) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("costControl.loadError")}</p>
        <button type="button" onClick={onBack} className={btn.secondary}>{t("costControlDoc.backToList")}</button>
      </div>
    );
  }

  const set = <K extends keyof CostControl>(key: K, value: CostControl[K]) => setDraft((p) => (p ? { ...p, [key]: value } : p));
  const setLine = (id: string, patch: Partial<CostControl["lines"][number]>) =>
    setDraft((p) => (p ? { ...p, lines: p.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : p));
  const addLine = (kind: CostControlLineKind) =>
    setDraft((p) => (p ? { ...p, lines: [...p.lines, blankCostControlLine(newId("ccline"), kind)] } : p));
  const removeLine = (id: string) =>
    setDraft((p) => (p ? { ...p, lines: p.lines.filter((l) => l.id !== id) } : p));

  const documentLabel = draft.documentNumber || draft.id;
  const kindCount = (kind: CostControlLineKind) => draft.lines.filter((l) => l.kind === kind).length;
  const kindLabel: Record<CostControlLineKind, string> = {
    group: t("costControlDoc.line.kind.group"),
    item: t("costControlDoc.line.kind.item"),
    sub: t("costControlDoc.line.kind.sub"),
  };

  const steps = [
    { label: t("approval.step.draft") },
    { label: t("approval.step.pending") },
    { label: t("approval.step.final") },
  ];
  const currentStep = draft.status === "Draft" ? 0 : draft.status === "PendingApproval" ? 1 : steps.length;
  // ข้อความ "ขั้นต่อไป" ชุดเดียวกับ DocumentStatusStepper เดิม (ชื่อผู้อนุมัติ: ช่องบนฟอร์มก่อน แล้วค่อยทะเบียนผู้ใช้)
  const approverName = draft.approvedBy.trim() || byId(draft.approvedByUserId)?.fullName || "";
  const nextStepHint =
    draft.status === "Final"
      ? t("approval.step.hint.final")
          .replace("{by}", approverName ? t("approval.step.by").replace("{name}", approverName) : "")
          .replace("{at}", draft.approvedAt ? t("approval.step.at").replace("{date}", formatQuoteDateThai(draft.approvedAt)) : "")
      : draft.status === "PendingApproval"
      ? t("approval.step.hint.pending").replace("{approver}", t("costControlDoc.approverLabel"))
      : draft.rejectionComment?.trim()
      ? t("approval.step.hint.draftRejected")
      : t("approval.step.hint.draft");

  const approvalBusy = approval.busy !== null;
  const cellCls = `${field.cell} w-full min-w-0`;
  const numCellCls = `${cellCls} text-right tabular-nums`;
  const td = "px-[3px] py-2 first:pl-6 last:pr-6 align-middle";
  const th = "px-[3px] first:pl-6 last:pr-6 text-left font-semibold whitespace-nowrap";

  /** ช่องข้อความบนหัวใบ — แก้ได้ = กล่องกรอก · อ่านอย่างเดียว = ค่าเปล่า ๆ ไม่มีกรอบ */
  const textField = (label: string, key: "documentNumber" | "jobName" | "workType" | "jobOrder" | "submittedBy" | "approvedBy", opts: { mono?: boolean; className?: string } = {}) =>
    editable ? (
      <Field label={label} htmlFor={`cc-${key}`} className={opts.className}>
        <input id={`cc-${key}`} className={`${field.input} w-full ${opts.mono ? "font-mono" : ""}`} value={draft[key]}
          onChange={(e) => set(key, e.target.value)} />
      </Field>
    ) : (
      <ReadonlyField label={label} value={draft[key]} mono={opts.mono} className={opts.className} />
    );

  return (
    <>
      <div className="doc-form flex-1 overflow-y-auto print:hidden">
        <div className="sticky top-0 z-20">
          <DocumentHeader
            backLabel={t("costControlDoc.backToList")}
            onBack={onBack}
            number={documentLabel}
            status={<CostControlStatusPill status={draft.status} />}
            meta={editable ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} /> : undefined}
            actions={
              <>
                {canPrint && (
                  <button type="button" onClick={() => { void logCostControlPrinted(draft.id).catch(() => {}); setShowPrint(true); }} className={btn.secondary}>
                    <Printer size={16} /> {t("costControlDoc.print")}
                  </button>
                )}
                {/* ปุ่มบันทึกคงไว้ตามที่เจ้าของสั่ง (2026-09-30) แม้มีบันทึกอัตโนมัติ */}
                {editable && (
                  <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("costControlDoc.saveDraft")}
                  </button>
                )}
                <MoreMenu
                  items={[
                    canCreate && {
                      key: "rewrite", label: t("costControlDoc.rewrite"), icon: PenLine,
                      disabled: draft.status !== "Final",
                      hint: draft.status !== "Final" ? t("costControlDoc.rewriteHint") : undefined,
                      onSelect: () => setConfirmRewrite(true),
                    },
                    draft.status === "PendingApproval" && canEdit && {
                      key: "withdraw", label: t("approval.withdraw"), icon: Undo2, disabled: approvalBusy, onSelect: approval.withdraw,
                    },
                    canDelete && { key: "delete", label: t("costControlDoc.confirmDelete.title"), icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
                  ]}
                />
                {draft.status === "PendingApproval" && canApprove && (
                  <>
                    <button type="button" onClick={approval.openReject} disabled={approvalBusy}
                      className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5b8b8] bg-white text-[#b93636] text-sm font-medium hover:bg-[#fcebeb] transition-colors whitespace-nowrap disabled:opacity-60">
                      <XCircle size={16} /> {t("approval.reject")}
                    </button>
                    <button type="button" onClick={approval.openApprove} disabled={approvalBusy} className={btn.primary}>
                      <CheckCircle2 size={16} /> {t("approval.approve")}
                    </button>
                  </>
                )}
                {draft.status === "Draft" && canEdit && (
                  <button type="button" onClick={approval.submit} disabled={approvalBusy} className={btn.primary}>
                    {approval.busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("approval.submit")}
                  </button>
                )}
              </>
            }
          />
        </div>

        <div className="px-4 md:px-8 py-6 flex flex-col gap-5">
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
          <DocumentStepper steps={steps} current={currentStep} ariaLabel={t("costControlDoc.stepsAria")} />
          {draft.rejectionComment ? <RejectionNotice comment={draft.rejectionComment} /> : null}

          <DocumentColumns
            main={
              <SectionCard title={t("costControlDoc.section.header")}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px] items-start">
                  {textField(t("costControlDoc.field.jobName"), "jobName", { className: "sm:col-span-3" })}
                  {textField(t("costControlDoc.field.documentNumber"), "documentNumber", { mono: true })}
                  {editable ? (
                    <Field label={t("costControlDoc.field.docDate")} htmlFor="cc-docDate">
                      <input id="cc-docDate" type="date" className={`${field.input} w-full`} value={draft.docDate}
                        onChange={(e) => set("docDate", e.target.value)} />
                    </Field>
                  ) : (
                    <ReadonlyField label={t("costControlDoc.field.docDate")} value={draft.docDate ? formatQuoteDateThai(draft.docDate) : ""} />
                  )}
                  {textField(t("costControlDoc.field.workType"), "workType")}
                  {textField(t("costControlDoc.field.jobOrder"), "jobOrder", { mono: true })}
                  {canViewScopeOfWork && (
                    editable ? (
                      <Field
                        label={t("costControlDoc.field.scopeOfWork")}
                        className="sm:col-span-2"
                        help={draft.scopeOfWorkId ? t("costControlDoc.field.scopeOfWorkLinked") : t("costControlDoc.field.scopeOfWorkHint")}
                      >
                        <Combobox
                          className={`${field.input} w-full font-mono`}
                          value={scopeQuery}
                          options={scopeOptions}
                          placeholder={t("costControlDoc.field.scopeOfWorkPlaceholder")}
                          ariaLabel={t("costControlDoc.field.scopeOfWork")}
                          onChange={(next) => {
                            setScopeTyped(next);
                            set("scopeOfWorkId", scopeIdByNumber.get(next.trim().toLowerCase()) ?? "");
                          }}
                        />
                      </Field>
                    ) : (
                      <div className="sm:col-span-2 flex flex-col gap-1">
                        <ReadonlyField label={t("costControlDoc.field.scopeOfWork")} value={scopeQuery} mono />
                        <p className={field.help}>
                          {draft.scopeOfWorkId ? t("costControlDoc.field.scopeOfWorkLinked") : t("costControlDoc.field.scopeOfWorkHint")}
                        </p>
                      </div>
                    )
                  )}
                  {draft.sourceFileName && (
                    <p className="sm:col-span-3 px-3 py-2.5 rounded-lg bg-[#f8f9fc] border border-[#eef1f6] text-[13px] text-[#3d5173] flex items-center gap-2 min-w-0">
                      <FileSpreadsheet size={16} className="text-[#1b7f4f] flex-shrink-0" />
                      <span className="text-muted-foreground flex-shrink-0">{t("costControlDoc.field.sourceFile")}:</span>
                      <span className="font-medium text-foreground truncate" title={draft.sourceFileName}>{draft.sourceFileName}</span>
                    </p>
                  )}
                </div>
              </SectionCard>
            }
            rail={
              <>
                {/* ไม่มียอดต้นทุนรวมทั้งใบ — เจ้าของสั่งเอาออก 2026-08-31 และยืนยันอีกครั้ง 2026-09-30 ("เอาตามระบบเดิม") */}
                <RailCard title={t("costControlDoc.section.lines")}>
                  {(["group", "item", "sub"] as const).map((kind) => (
                    <div key={kind} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-muted-foreground">{kindLabel[kind]}</span>
                      <span className="tabular-nums font-medium text-foreground">{kindCount(kind)}</span>
                    </div>
                  ))}
                </RailCard>
                <RailCard title={t("costControlDoc.signersTitle")}>
                  {textField(t("costControlDoc.field.submittedBy"), "submittedBy")}
                  {textField(t("costControlDoc.field.approvedBy"), "approvedBy")}
                </RailCard>
                <NextStepHint title={t("costControlDoc.nextStep")}>{nextStepHint}</NextStepHint>
              </>
            }
          />

          <SectionCard
            title={
              <span className="flex items-baseline gap-2.5">
                {t("costControlDoc.section.lines")}
                <span className="text-[13px] font-normal text-muted-foreground">
                  {t("costControlDoc.lineCount").replace("{n}", String(draft.lines.length))}
                </span>
              </span>
            }
            bodyClassName=""
          >
            {draft.lines.length === 0 ? (
              <p className="px-6 py-6 text-sm text-muted-foreground">{t("costControlDoc.noLines")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] table-fixed">
                  <colgroup>
                    <col className="w-[148px]" />
                    <col className="w-[62px]" />
                    <col />
                    <col className="w-[100px]" />
                    <col className="w-[150px]" />
                    <col className="w-[84px]" />
                    <col className="w-[76px]" />
                    <col className="w-[112px]" />
                    <col className="w-[124px]" />
                    <col className="w-[62px]" />
                  </colgroup>
                  <thead>
                    <tr className={table.head}>
                      {/* หัวคอลัมน์ชิดตามข้อมูลในแถว (เจ้าของแจ้ง 2026-09-24 ว่าหัวไม่ตรงกับช่อง) — ลำดับที่อยู่กลาง ·
                          จำนวน / ต้นทุน / ต้นทุนรวม เป็นตัวเลขชิดขวา */}
                      <th className={th}>{t("costControlDoc.line.kind")}</th>
                      <th className={`${th} text-center`}>{t("costControlDoc.line.seq")}</th>
                      <th className={th}>{t("costControlDoc.line.description")}</th>
                      <th className={th}>{t("costControlDoc.line.model")}</th>
                      <th className={th}>{t("costControlDoc.line.supplier")}</th>
                      <th className={`${th} text-right`}>{t("costControlDoc.line.qty")}</th>
                      <th className={th}>{t("costControlDoc.line.unit")}</th>
                      <th className={`${th} text-right`}>{t("costControlDoc.line.unitCost")}</th>
                      <th className={`${th} text-right`}>{t("costControlDoc.line.total")}</th>
                      <th className={th} aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((l) => {
                      const isGroup = l.kind === "group";
                      const isSub = l.kind === "sub";
                      const hasTotal = !isGroup && l.unitCost !== null;
                      return (
                        <tr key={l.id} className={`border-b border-[#eef1f6] ${isGroup ? "bg-[#f8f9fc]" : "bg-white"}`}>
                          <td className={td}>
                            {editable ? (
                              // แก้ชนิดแถวได้ — ตัวแกะไฟล์เดาจากสีพื้นหลังในชีต ซึ่งไฟล์บางไฟล์อาจไม่ได้ทาสีไว้
                              <span className="relative block">
                                <select className={`${cellCls} pr-7 appearance-none cursor-pointer text-[13px]`} value={l.kind}
                                  aria-label={t("costControlDoc.line.kind")}
                                  onChange={(e) => setLine(l.id, { kind: e.target.value as CostControlLineKind })}>
                                  <option value="group">{kindLabel.group}</option>
                                  <option value="item">{kindLabel.item}</option>
                                  <option value="sub">{kindLabel.sub}</option>
                                </select>
                                <ChevronDown size={14} aria-hidden="true" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                              </span>
                            ) : (
                              <span className="text-[13px] text-[#3d5173]">{kindLabel[l.kind]}</span>
                            )}
                          </td>
                          <td className={`${td} text-center`}>
                            {l.kind === "item" && (editable ? (
                              <input className={`${cellCls} text-center tabular-nums px-1.5`} value={l.seq} aria-label={t("costControlDoc.line.seq")}
                                onChange={(e) => setLine(l.id, { seq: e.target.value })} />
                            ) : (
                              <span className="text-sm tabular-nums">{l.seq}</span>
                            ))}
                          </td>
                          {isGroup ? (
                            <td className={td} colSpan={7}>
                              {editable ? (
                                <input className={`${cellCls} font-semibold`} value={l.description} aria-label={t("costControlDoc.line.groupName")}
                                  onChange={(e) => setLine(l.id, { description: e.target.value })} />
                              ) : (
                                <span className="text-sm font-semibold text-foreground">{l.description}</span>
                              )}
                            </td>
                          ) : (
                            <>
                              <td className={td}>
                                <span className={`flex items-center gap-1.5 min-w-0 ${isSub ? "pl-2.5" : ""}`}>
                                  {isSub && <CornerDownRight size={14} aria-hidden="true" className="text-[#8a97ad] flex-shrink-0" />}
                                  {editable ? (
                                    <input className={`${cellCls} ${isSub ? "text-[#3d5173]" : ""}`} value={l.description} aria-label={t("costControlDoc.line.description")}
                                      onChange={(e) => setLine(l.id, { description: e.target.value })} />
                                  ) : (
                                    <span className={`text-sm break-words min-w-0 ${isSub ? "text-[#3d5173]" : "text-foreground"}`}>{l.description}</span>
                                  )}
                                </span>
                              </td>
                              <td className={td}>
                                {editable ? (
                                  <input className={`${cellCls} font-mono text-[13px]`} value={l.model} aria-label={t("costControlDoc.line.model")}
                                    onChange={(e) => setLine(l.id, { model: e.target.value })} />
                                ) : <span className="font-mono text-[13px] break-words">{l.model}</span>}
                              </td>
                              <td className={td}>
                                {editable ? (
                                  <input className={`${cellCls} text-[13px]`} value={l.supplierName} aria-label={t("costControlDoc.line.supplier")}
                                    onChange={(e) => setLine(l.id, { supplierName: e.target.value })} />
                                ) : <span className="text-[13px] break-words">{l.supplierName}</span>}
                              </td>
                              <td className={`${td} text-right`}>
                                {editable ? (
                                  <input type="number" className={numCellCls} value={l.qty ?? ""} aria-label={t("costControlDoc.line.qty")}
                                    onChange={(e) => setLine(l.id, { qty: e.target.value === "" ? null : Number(e.target.value) })} />
                                ) : <span className="text-sm tabular-nums">{l.qty ?? ""}</span>}
                              </td>
                              <td className={td}>
                                {editable ? (
                                  <input className={cellCls} value={l.unit} aria-label={t("costControlDoc.line.unit")}
                                    onChange={(e) => setLine(l.id, { unit: e.target.value })} />
                                ) : <span className="text-sm">{l.unit}</span>}
                              </td>
                              <td className={`${td} text-right`}>
                                {editable ? (
                                  <input type="number" className={numCellCls} value={l.unitCost ?? ""} aria-label={t("costControlDoc.line.unitCost")}
                                    onChange={(e) => setLine(l.id, { unitCost: e.target.value === "" ? null : Number(e.target.value) })} />
                                ) : <span className="text-sm tabular-nums">{l.unitCost === null ? "" : fmt(l.unitCost)}</span>}
                              </td>
                              {/* ยังไม่กรอกต้นทุน = ยังไม่มียอด แสดง — แทน 0.00 (กติกาเดียวกับหน้าตรวจก่อนสร้างและใบพิมพ์) */}
                              <td className={`${td} text-right text-sm tabular-nums whitespace-nowrap ${hasTotal ? "font-semibold text-foreground" : "text-[#8a97ad]"}`}>
                                {hasTotal ? fmt(lineTotalCost(l)) : "—"}
                              </td>
                            </>
                          )}
                          <td className={`${td} text-right`}>
                            {editable && (
                              <button type="button" onClick={() => removeLine(l.id)} aria-label={t("costControlImport.removeLine")} title={t("costControlImport.removeLine")}
                                className="w-8 h-9 inline-flex items-center justify-center rounded-lg text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] transition-colors">
                                <Trash2 size={15} />
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

            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 pt-3 pb-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 ml-2.5">
                {editable && (
                  <>
                    <button type="button" onClick={() => addLine("group")} className={btn.text}>
                      <Plus size={16} /> {t("costControlDoc.addGroup")}
                    </button>
                    <button type="button" onClick={() => addLine("item")} className={btn.text}>
                      <Plus size={16} /> {t("costControlDoc.addItem")}
                    </button>
                    <button type="button" onClick={() => addLine("sub")} className={btn.text}>
                      <Plus size={16} /> {t("costControlDoc.addSub")}
                    </button>
                  </>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t("costControlDoc.section.remarks")}>
            {editable ? (
              <textarea rows={3} className={`${field.textarea} w-full resize-y`} value={draft.remarks}
                aria-label={t("costControlDoc.field.remarks")}
                onChange={(e) => set("remarks", e.target.value)} />
            ) : (
              <p className={`text-sm whitespace-pre-wrap ${draft.remarks.trim() ? "text-foreground" : "text-[#8a97ad]"}`}>{draft.remarks.trim() || "—"}</p>
            )}
          </SectionCard>
        </div>
      </div>

      <CostControlPrintDocument costControl={draft} company={company} />

      {approval.dialogs}
      <ConfirmDialog
        open={confirmDelete}
        title={t("costControlDoc.confirmDelete.title")}
        message={t("costControlDoc.confirmDelete.message")}
        confirmLabel={t("costControlDoc.delete")}
        danger
        summary={
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-mono text-[13px] font-medium text-foreground">{documentLabel}</span>
              {draft.jobName && <span className="text-[13px] text-[#3d5173] truncate" title={draft.jobName}>{draft.jobName}</span>}
            </div>
          </div>
        }
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try { await deleteCostControl(draft.id); onDeleted(); }
          catch (err) { showToast(err instanceof ApiError ? err.message : t("costControlDoc.errorSave")); }
          finally { setConfirmDelete(false); }
        }}
      />
      <ConfirmDialog
        open={confirmRewrite}
        title={t("costControlDoc.confirmRewrite.title")}
        message={t("costControlDoc.confirmRewrite.message")}
        onCancel={() => setConfirmRewrite(false)}
        onConfirm={async () => {
          try { const next = await rewriteCostControl(draft.id); onOpenOther(next.id); }
          catch (err) { showToast(err instanceof ApiError ? err.message : t("costControlDoc.errorSave")); }
          finally { setConfirmRewrite(false); }
        }}
      />
    </>
  );
}
