import { useEffect, useState } from "react";
import { ChevronRight, Printer, Save, CheckCircle2, Trash2, Loader2, AlertTriangle, Plus, X, RotateCw } from "lucide-react";
import type { DriveStep } from "driver.js";
import {
  type WorkHandoverNote, type WorkHandoverLine, type WorkHandoverUpdateFields,
  fetchWorkHandover, updateWorkHandover, signWorkHandover, logWorkHandoverPrinted, deleteWorkHandover,
  blankWorkHandoverLine,
} from "../../lib/workHandover";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { SignaturePad } from "../../components/SignaturePad";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { WorkHandoverPrintDocument } from "./WorkHandoverPrintDocument";
import { useI18n } from "../../lib/i18n";

function toUpdateFields(w: WorkHandoverNote): WorkHandoverUpdateFields {
  return {
    lines: w.lines,
    customerName: w.customerName,
    siteDescription: w.siteDescription,
    workCompletedDate: w.workCompletedDate,
    preparedByName: w.preparedByName,
    preparedBySignatureDataUrl: w.preparedBySignatureDataUrl,
    preparedAt: w.preparedAt,
    customerSignedName: w.customerSignedName,
    customerSignatureDataUrl: w.customerSignatureDataUrl,
    customerSignedAt: w.customerSignedAt,
  };
}

// หน้าแก้ไขใบส่งมอบงาน: ข้อมูลหัวเรื่อง ตารางรายการงานที่ส่งมอบแบบพิมพ์เอง และลายเซ็นผู้จัดทำ/ลูกค้า
// Work Handover Note editor: header fields, free-typed work-delivered line table, and preparer/customer signatures.
//
// ⚠️ First-draft structure — no reference PDF exists for this document. See
// src/lib/workHandover.ts and docs/MODULES/Project.md for the explicit caveat.
export function WorkHandoverDocument({
  workHandoverId,
  currentUserId,
  canEdit,
  canSign,
  canPrint,
  canDelete,
  onBack,
  onDeleted,
  showToast,
}: {
  workHandoverId: string;
  currentUserId: string;
  canEdit: boolean;
  canSign: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onBack: () => void;
  onDeleted: () => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<WorkHandoverNote | null>(null);
  const [draft, setDraft] = useState<WorkHandoverNote | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [signing, setSigning] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSign, setConfirmSign] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWorkHandover(workHandoverId)
      .then((w) => { if (!cancelled) { setDoc(w); setDraft(w); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("workHandoverDoc.loadError"));
      });
    return () => { cancelled = true; };
  }, [workHandoverId, reloadKey, t]);

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="whdoc-actions"]', popover: { title: t("tour.whdoc.actions.title"), description: t("tour.whdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="whdoc-lines"]', popover: { title: t("tour.whdoc.lines.title"), description: t("tour.whdoc.lines.desc"), side: "top" } },
    { element: '[data-tour="whdoc-signatures"]', popover: { title: t("tour.whdoc.signatures.title"), description: t("tour.whdoc.signatures.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("workHandoverDoc", currentUserId, docTourSteps, { autoStart: !!doc });

  if (loadError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {t("workHandoverDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle size={20} className="text-[#e05252]" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <RotateCw size={12} /> {t("workHandover.retry")}
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
            <ChevronRight size={14} className="rotate-180" /> {t("workHandoverDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-2.5 p-6">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">{t("workHandoverDoc.loadingDocument")}</p>
        </div>
      </div>
    );
  }

  const editable = canEdit && !doc.isSigned;

  const updateLine = (id: string, patch: Partial<WorkHandoverLine>) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };
  const removeLine = (id: string) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.filter((l) => l.id !== id) });
  };
  const addLine = () => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankWorkHandoverLine()] });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await updateWorkHandover(draft.id, toUpdateFields(draft));
      setDoc(updated);
      setDraft(updated);
      showToast(t("workHandoverDoc.saved"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("workHandoverDoc.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const confirmSignAction = async () => {
    setSigning(true);
    try {
      const updated = await signWorkHandover(doc.id);
      setDoc(updated);
      setDraft(updated);
      setConfirmSign(false);
      showToast(t("workHandoverDoc.signed"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("workHandoverDoc.errorSign"));
    } finally {
      setSigning(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await logWorkHandoverPrinted(doc.id);
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("workHandoverDoc.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWorkHandover(doc.id);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("workHandoverDoc.errorDelete"));
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("workHandoverDoc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-mono font-medium tracking-wide">{doc.id}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${doc.isSigned ? "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20" : "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20"}`}>
          {doc.isSigned ? t("workHandover.status.signed") : t("workHandover.status.draft")}
        </span>

        <div data-tour="whdoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
          {canPrint && (
            <button onClick={handlePrint} disabled={printing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("workHandoverDoc.print")}
            </button>
          )}
          {editable && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("workHandoverDoc.saveDraft")}
            </button>
          )}
          {!doc.isSigned && canSign && (
            <button onClick={() => setConfirmSign(true)} disabled={!doc.customerSignatureDataUrl} title={!doc.customerSignatureDataUrl ? t("workHandoverDoc.customerAcceptanceHint") : undefined} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              <CheckCircle2 size={13} /> {t("workHandoverDoc.sign")}
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("workHandoverDoc.delete")}
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto print:hidden">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
            <h1 className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">{t("workHandoverDoc.title")}</h1>
            <p className="text-[#a8bed8] text-xs mt-1">{t("workHandoverDoc.jobCodePrefix")} {doc.jobCode}</p>
            <p className="text-[#a8bed8]/70 text-[10px] mt-1.5">{t("workHandoverDoc.documentCodeNote")}</p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="wh-customerName" className="text-xs text-muted-foreground block mb-1">{t("workHandoverDoc.field.customerName")}</label>
              <input id="wh-customerName" disabled={!editable} value={draft.customerName}
                onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="wh-workCompletedDate" className="text-xs text-muted-foreground block mb-1">{t("workHandoverDoc.field.workCompletedDate")}</label>
              <input id="wh-workCompletedDate" type="date" disabled={!editable} value={draft.workCompletedDate}
                onChange={(e) => setDraft({ ...draft, workCompletedDate: e.target.value })}
                className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="wh-siteDescription" className="text-xs text-muted-foreground block mb-1">{t("workHandoverDoc.field.siteDescription")}</label>
              <textarea id="wh-siteDescription" disabled={!editable} rows={2} value={draft.siteDescription}
                onChange={(e) => setDraft({ ...draft, siteDescription: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none disabled:opacity-70" />
            </div>
          </div>
        </div>

        <div data-tour="whdoc-lines" className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("workHandoverDoc.linesTitle")}</h2>
            {editable && (
              <button onClick={addLine} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                <Plus size={13} /> {t("workHandoverDoc.addLine")}
              </button>
            )}
          </div>
          {draft.lines.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("workHandoverDoc.linesEmpty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[t("workHandoverDoc.col.description"), t("workHandoverDoc.col.quantity"), t("workHandoverDoc.col.unit"), t("workHandoverDoc.col.remark"), ""].map((h) => (
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
                          <button onClick={() => removeLine(line.id)} title={t("workHandoverDoc.removeLine")} className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-[#e05252] transition-opacity">
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

        <div data-tour="whdoc-signatures" className="bg-card border border-border rounded-xl p-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">{t("workHandoverDoc.signaturesTitle")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <span className="text-xs text-muted-foreground block mb-1.5">{t("workHandoverDoc.preparerTitle")}</span>
              <SignaturePad
                dataUrl={draft.preparedBySignatureDataUrl}
                signerName={draft.preparedByName}
                signedAt={draft.preparedAt ? new Date(draft.preparedAt).toISOString() : null}
                disabled={!editable}
                onConfirm={({ dataUrl, name }) => setDraft((d) => d && {
                  ...d, preparedBySignatureDataUrl: dataUrl, preparedByName: name, preparedAt: new Date().toISOString().slice(0, 10),
                })}
                onClear={() => setDraft((d) => d && { ...d, preparedBySignatureDataUrl: "", preparedAt: null })}
              />
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1.5">{t("workHandoverDoc.customerAcceptanceTitle")}</span>
              <SignaturePad
                dataUrl={draft.customerSignatureDataUrl}
                signerName={draft.customerSignedName}
                signedAt={draft.customerSignedAt ? new Date(draft.customerSignedAt).toISOString() : null}
                disabled={!editable}
                allowUpload={false}
                onConfirm={({ dataUrl, name }) => setDraft((d) => d && {
                  ...d, customerSignatureDataUrl: dataUrl, customerSignedName: name, customerSignedAt: new Date().toISOString().slice(0, 10),
                })}
                onClear={() => setDraft((d) => d && { ...d, customerSignatureDataUrl: "", customerSignedName: "", customerSignedAt: null })}
              />
              {editable && draft.customerSignatureDataUrl && (
                <p className="text-[10px] text-muted-foreground mt-1.5">{t("workHandoverDoc.customerAcceptanceHint")}</p>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-5 pt-4 border-t border-border">{t("workHandoverDoc.billingNote")}</p>
        </div>
      </div>

      {showPrint && <WorkHandoverPrintDocument workHandover={doc} />}

      <ConfirmDialog
        open={confirmDelete}
        title={t("workHandoverDoc.deleteConfirmTitle")}
        message={t("workHandoverDoc.deleteConfirmMessage")}
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmSign}
        title={t("workHandoverDoc.signConfirmTitle")}
        message={t("workHandoverDoc.signConfirmMessage")}
        busy={signing}
        onConfirm={confirmSignAction}
        onCancel={() => setConfirmSign(false)}
      />
    </div>
  );
}
