import { useEffect, useState } from "react";
import { ArrowLeft, FileSpreadsheet, Loader2, Plus, Printer, Save, Trash2, PenLine } from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { DocumentApprovalActions, RejectionNotice } from "../../components/DocumentApprovalActions";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { ApiError } from "../../lib/apiClient";
import { newId } from "../../lib/products";
import { fmt } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import type { Company } from "../../lib/storage";
import {
  type CostControl, type CostControlUpdateFields, type CostControlLineKind,
  blankCostControlLine, costControlTotalCost, lineTotalCost,
  fetchCostControl, updateCostControl, deleteCostControl, rewriteCostControl, logCostControlPrinted,
  submitCostControlApproval, approveCostControl, rejectCostControl, withdrawCostControlApproval,
} from "../../lib/costControl";
import { CostControlPrintDocument } from "./CostControlPrintDocument";

/** payload ที่ทั้งปุ่มบันทึกและ auto-save ส่ง — ต้องเป็นชุดเดียวกันเป๊ะ ไม่งั้นตัวจับการแก้ไขเพี้ยน */
function toUpdateFields(d: CostControl): CostControlUpdateFields {
  return {
    documentNumber: d.documentNumber,
    jobName: d.jobName, workType: d.workType, jobOrder: d.jobOrder, docDate: d.docDate,
    lines: d.lines,
    remarks: d.remarks, submittedBy: d.submittedBy, approvedBy: d.approvedBy,
    revisionNote: d.revisionNote,
  };
}

export function CostControlDocument({
  costControlId, canEdit, canApprove, canPrint, canDelete, canCreate, company, onBack, onDeleted, onOpenOther, showToast,
}: {
  costControlId: string;
  canEdit: boolean;
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

  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  useEffect(() => {
    let cancelled = false;
    fetchCostControl(costControlId)
      .then((d) => {
        if (cancelled) return;
        setDoc(d); setDraft(d); setLoading(false);
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

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  if (loading) {
    return (
      <div className="flex-1 p-6" role="status" aria-live="polite">
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
        <button onClick={onBack} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">{t("costControlDoc.backToList")}</button>
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
  const totalCost = costControlTotalCost(draft.lines);
  const inputCls = "w-full px-2.5 py-1.5 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70";
  const numCls = `${inputCls} text-right font-mono`;

  return (
    <>
      <div className="flex-1 overflow-y-auto print:hidden">
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-card sticky top-0 z-10">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={15} /> {t("costControlDoc.backToList")}
          </button>
          <span className="font-mono text-sm text-[#c9a84c] font-semibold">{draft.documentNumber || draft.id}</span>

          <div className="ml-auto flex items-center gap-2">
            {editable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}

            <DocumentApprovalActions
              status={draft.status}
              canEdit={canEdit}
              canApprove={canApprove}
              onSubmit={() => submitCostControlApproval(draft.id)}
              onApprove={() => approveCostControl(draft.id)}
              onReject={(comment) => rejectCostControl(draft.id, comment)}
              onWithdraw={() => withdrawCostControlApproval(draft.id)}
              // markSaved ด้วยเสมอ — การอนุมัติเปลี่ยนเอกสารฝั่งเซิร์ฟเวอร์ ถ้าไม่รีเซ็ตฐาน ตัวจับการแก้ไข
              // จะค้างว่า "ยังไม่บันทึก" แล้วเด้งกล่องเตือนตอนออกจากหน้าทั้งที่ไม่มีอะไรค้าง
              onUpdated={(d) => { setDoc(d); setDraft(d); dirty.markSaved(toUpdateFields(d)); }}
              showToast={showToast}
            />

            {editable && (
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("costControlDoc.saveDraft")}
              </button>
            )}
            {canCreate && draft.status === "Final" && (
              <button onClick={() => setConfirmRewrite(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all">
                <PenLine size={13} /> {t("costControlDoc.rewrite")}
              </button>
            )}
            {canPrint && (
              <button onClick={() => { void logCostControlPrinted(draft.id).catch(() => {}); setShowPrint(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all">
                <Printer size={13} /> {t("costControlDoc.print")}
              </button>
            )}
            {canDelete && (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-[#d22626]/30 rounded-lg text-[#d22626] hover:bg-[#d22626]/10 transition-all">
                <Trash2 size={13} /> {t("costControlDoc.delete")}
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 max-w-6xl">
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
          {draft.rejectionComment ? <RejectionNotice comment={draft.rejectionComment} /> : null}

          <section className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">{t("costControlDoc.section.header")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="text-xs text-muted-foreground space-y-1 block">
                <span>{t("costControlDoc.field.documentNumber")}</span>
                <input className={inputCls} disabled={!editable} value={draft.documentNumber}
                  onChange={(e) => set("documentNumber", e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground space-y-1 block">
                <span>{t("costControlDoc.field.docDate")}</span>
                <input type="date" className={inputCls} disabled={!editable} value={draft.docDate}
                  onChange={(e) => set("docDate", e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground space-y-1 block">
                <span>{t("costControlDoc.field.jobOrder")}</span>
                <input className={inputCls} disabled={!editable} value={draft.jobOrder}
                  onChange={(e) => set("jobOrder", e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground space-y-1 block sm:col-span-2">
                <span>{t("costControlDoc.field.jobName")}</span>
                <input className={inputCls} disabled={!editable} value={draft.jobName}
                  onChange={(e) => set("jobName", e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground space-y-1 block">
                <span>{t("costControlDoc.field.workType")}</span>
                <input className={inputCls} disabled={!editable} value={draft.workType}
                  onChange={(e) => set("workType", e.target.value)} />
              </label>
            </div>
            {draft.sourceFileName && (
              <p className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground">
                <FileSpreadsheet size={13} /> {t("costControlDoc.field.sourceFile")}: {draft.sourceFileName}
              </p>
            )}
          </section>

          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">{t("costControlDoc.section.lines")}</h2>
              {editable && (
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => addLine("group")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all">
                    <Plus size={12} /> {t("costControlDoc.addGroup")}
                  </button>
                  <button onClick={() => addLine("item")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all">
                    <Plus size={12} /> {t("costControlDoc.addItem")}
                  </button>
                  <button onClick={() => addLine("sub")}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all">
                    <Plus size={12} /> {t("costControlDoc.addSub")}
                  </button>
                </div>
              )}
            </div>
            {draft.lines.length === 0 ? (
              <p className="px-5 pb-6 text-xs text-muted-foreground">{t("costControlDoc.noLines")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-y border-border bg-muted/40">
                      {[t("costControlDoc.line.kind"), t("costControlDoc.line.seq"), t("costControlDoc.line.description"), t("costControlDoc.line.model"),
                        t("costControlDoc.line.supplier"), t("costControlDoc.line.qty"), t("costControlDoc.line.unit"),
                        t("costControlDoc.line.unitCost"), t("costControlDoc.line.total"), ""].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((l) => (
                      <tr key={l.id} className={`border-b border-border/50 ${l.kind === "group" ? "bg-muted/30" : ""}`}>
                        <td className="px-3 py-1.5 w-28">
                          {/* แก้ชนิดแถวได้ — ตัวแกะไฟล์เดาจากสีพื้นหลังในชีต ซึ่งไฟล์บางไฟล์อาจไม่ได้ทาสีไว้ */}
                          <select className={inputCls} disabled={!editable} value={l.kind}
                            onChange={(e) => setLine(l.id, { kind: e.target.value as CostControlLineKind })}>
                            <option value="group">{t("costControlDoc.line.kind.group")}</option>
                            <option value="item">{t("costControlDoc.line.kind.item")}</option>
                            <option value="sub">{t("costControlDoc.line.kind.sub")}</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5 w-16">
                          <input className={`${inputCls} text-center`} disabled={!editable || l.kind !== "item"} value={l.seq}
                            onChange={(e) => setLine(l.id, { seq: e.target.value })} />
                        </td>
                        <td className="px-3 py-1.5 min-w-[240px]">
                          <input className={`${inputCls} ${l.kind === "group" ? "font-semibold" : ""} ${l.kind === "sub" ? "ml-3 w-[calc(100%-0.75rem)]" : ""}`}
                            disabled={!editable} value={l.description}
                            onChange={(e) => setLine(l.id, { description: e.target.value })} />
                        </td>
                        <td className="px-3 py-1.5 w-24">
                          <input className={inputCls} disabled={!editable || l.kind === "group"} value={l.model}
                            onChange={(e) => setLine(l.id, { model: e.target.value })} />
                        </td>
                        <td className="px-3 py-1.5 w-28">
                          <input className={inputCls} disabled={!editable || l.kind === "group"} value={l.supplierName}
                            onChange={(e) => setLine(l.id, { supplierName: e.target.value })} />
                        </td>
                        <td className="px-3 py-1.5 w-24">
                          <input type="number" className={numCls} disabled={!editable || l.kind === "group"} value={l.qty ?? ""}
                            onChange={(e) => setLine(l.id, { qty: e.target.value === "" ? null : Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-1.5 w-20">
                          <input className={inputCls} disabled={!editable || l.kind === "group"} value={l.unit}
                            onChange={(e) => setLine(l.id, { unit: e.target.value })} />
                        </td>
                        <td className="px-3 py-1.5 w-32">
                          <input type="number" className={numCls} disabled={!editable || l.kind === "group"} value={l.unitCost ?? ""}
                            onChange={(e) => setLine(l.id, { unitCost: e.target.value === "" ? null : Number(e.target.value) })} />
                        </td>
                        <td className="px-3 py-1.5 text-xs font-mono text-right text-foreground whitespace-nowrap">
                          {l.kind === "group" ? "—" : fmt(lineTotalCost(l))}
                        </td>
                        <td className="px-3 py-1.5">
                          {editable && (
                            <button onClick={() => removeLine(l.id)} aria-label={t("costControlImport.removeLine")}
                              className="text-muted-foreground hover:text-[#d22626] transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">{t("costControlDoc.section.summary")}</h2>
            <div className="space-y-2 max-w-xl ml-auto">
              <div className="flex items-center gap-3 text-xs">
                <span className="flex-1 text-muted-foreground">{t("costControlDoc.summary.totalCost")}</span>
                <span className="w-36 text-right font-mono text-foreground">{fmt(totalCost)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-5 border-t border-border">
              <label className="text-xs text-muted-foreground space-y-1 block sm:col-span-2">
                <span>{t("costControlDoc.field.remarks")}</span>
                <textarea rows={2} className={inputCls} disabled={!editable} value={draft.remarks}
                  onChange={(e) => set("remarks", e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground space-y-1 block">
                <span>{t("costControlDoc.field.submittedBy")}</span>
                <input className={inputCls} disabled={!editable} value={draft.submittedBy}
                  onChange={(e) => set("submittedBy", e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground space-y-1 block">
                <span>{t("costControlDoc.field.approvedBy")}</span>
                <input className={inputCls} disabled={!editable} value={draft.approvedBy}
                  onChange={(e) => set("approvedBy", e.target.value)} />
              </label>
            </div>
          </section>
        </div>
      </div>

      {showPrint && <CostControlPrintDocument costControl={draft} company={company} />}

      <ConfirmDialog
        open={confirmDelete}
        title={t("costControlDoc.confirmDelete.title")}
        message={t("costControlDoc.confirmDelete.message")}
        danger
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
