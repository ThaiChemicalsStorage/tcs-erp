import { useEffect, useState } from "react";
import { ChevronRight, Printer, Save, CheckCircle2, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X } from "lucide-react";
import type { DriveStep } from "driver.js";
import {
  type JobOrder, type JobOrderLine, type JobOrderUpdateFields,
  fetchJobOrder, updateJobOrder, finalizeJobOrder, logJobOrderPrinted, deleteJobOrder, blankJobOrderLine,
} from "../../lib/jobOrder";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ChecklistGroupCard } from "../quotation/ChecklistGroupCard";
import { JobOrderPrintDocument } from "./JobOrderPrintDocument";
import { useI18n } from "../../lib/i18n";

function toUpdateFields(j: JobOrder): JobOrderUpdateFields {
  return {
    lines: j.lines,
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
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  onBack,
  onDeleted,
  showToast,
}: {
  jobOrderId: string;
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onBack: () => void;
  onDeleted: () => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<JobOrder | null>(null);
  const [draft, setDraft] = useState<JobOrder | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchJobOrder(jobOrderId)
      .then((j) => { if (!cancelled) { setDoc(j); setDraft(j); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("jobOrderDoc.loadError"));
      });
    return () => { cancelled = true; };
  }, [jobOrderId, reloadKey, t]);

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="jodoc-actions"]', popover: { title: t("tour.jodoc.actions.title"), description: t("tour.jodoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="jodoc-lines"]', popover: { title: t("tour.jodoc.lines.title"), description: t("tour.jodoc.lines.desc"), side: "top" } },
    { element: '[data-tour="jodoc-checklist"]', popover: { title: t("tour.jodoc.checklist.title"), description: t("tour.jodoc.checklist.desc"), side: "top" } },
  ];
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
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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

  const updateLine = (id: string, patch: Partial<JobOrderLine>) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };
  const removeLine = (id: string) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.filter((l) => l.id !== id) });
  };
  const addLine = () => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankJobOrderLine()] });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await updateJobOrder(draft.id, toUpdateFields(draft));
      setDoc(updated);
      setDraft(updated);
      showToast(t("jobOrderDoc.saved"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("jobOrderDoc.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    setFinalizing(true);
    try {
      const updated = await finalizeJobOrder(doc.id);
      setDoc(updated);
      setDraft(updated);
      setConfirmFinalize(false);
      showToast(t("jobOrderDoc.finalized"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("jobOrderDoc.errorFinalize"));
    } finally {
      setFinalizing(false);
    }
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
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("jobOrderDoc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-mono font-medium tracking-wide">{doc.id}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isDraftStatus ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"}`}>
          {isDraftStatus ? t("materialRequisition.status.draft") : t("materialRequisition.status.final")}
        </span>

        <div data-tour="jodoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
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
          {isDraftStatus && canFinalize && (
            <button onClick={() => setConfirmFinalize(true)} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors">
              <CheckCircle2 size={13} /> {t("jobOrderDoc.finalize")}
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("jobOrderDoc.delete")}
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto print:hidden">
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
              <input id="jo-toSite" disabled={!editable} value={draft.toSite}
                onChange={(e) => setDraft({ ...draft, toSite: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
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

        <div data-tour="jodoc-lines" className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("jobOrderDoc.linesTitle")}</h2>
            {editable && (
              <button onClick={addLine} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                <Plus size={13} /> {t("jobOrderDoc.addLine")}
              </button>
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
                    <tr key={line.id} className="border-b border-border/50">
                      <td className="px-3 py-2 min-w-[200px]">
                        <input disabled={!editable} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          className="w-full text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
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

      {showPrint && <JobOrderPrintDocument jobOrder={doc} />}

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
