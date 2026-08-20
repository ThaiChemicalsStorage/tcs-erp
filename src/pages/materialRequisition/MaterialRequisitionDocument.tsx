import { useEffect, useState } from "react";
import { ChevronRight, Printer, Save, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X, Undo2 } from "lucide-react";
import type { DriveStep } from "driver.js";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import {
  type MaterialRequisition, type MaterialRequisitionLine, type MaterialRequisitionUpdateFields,
  fetchMaterialRequisition, updateMaterialRequisition, recordMaterialRequisitionReturn,
  finalizeMaterialRequisition, logMaterialRequisitionPrinted, deleteMaterialRequisition,
  blankMaterialRequisitionLine, MATERIAL_CATEGORY_NAMES,
  submitMaterialRequisitionApproval, approveMaterialRequisition, rejectMaterialRequisition, withdrawMaterialRequisitionApproval,
} from "../../lib/materialRequisition";
import { DocumentApprovalActions, RejectionNotice } from "../../components/DocumentApprovalActions";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { MaterialRequisitionPrintDocument } from "./MaterialRequisitionPrintDocument";
import { useI18n } from "../../lib/i18n";

function toUpdateFields(m: MaterialRequisition): MaterialRequisitionUpdateFields {
  return {
    lines: m.lines,
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

// หน้าแก้ไขใบเบิกและใบคืนวัสดุ: ข้อมูลหัวเรื่อง ตารางรายการจากแคตตาล็อก และการคืนวัสดุ
// Material Requisition editor: header fields, catalog line table, and the material-return section.
export function MaterialRequisitionDocument({
  materialRequisitionId,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  onBack,
  onDeleted,
  showToast,
}: {
  materialRequisitionId: string;
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
  const [doc, setDoc] = useState<MaterialRequisition | null>(null);
  const [draft, setDraft] = useState<MaterialRequisition | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savingReturn, setSavingReturn] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMaterialRequisition(materialRequisitionId), fetchProducts(), fetchCategories()])
      .then(([m, p, c]) => { if (!cancelled) { setDoc(m); setDraft(m); setProducts(p); setCategories(c); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("materialRequisitionDoc.loadError"));
      });
    return () => { cancelled = true; };
  }, [materialRequisitionId, reloadKey, t]);

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="mrdoc-actions"]', popover: { title: t("tour.mrdoc.actions.title"), description: t("tour.mrdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="mrdoc-addline"]', popover: { title: t("tour.mrdoc.addline.title"), description: t("tour.mrdoc.addline.desc"), side: "bottom" } },
    { element: '[data-tour="mrdoc-lines"]', popover: { title: t("tour.mrdoc.lines.title"), description: t("tour.mrdoc.lines.desc"), side: "top" } },
    { element: '[data-tour="mrdoc-returnCard"]', popover: { title: t("tour.mrdoc.returnCard.title"), description: t("tour.mrdoc.returnCard.desc"), side: "top" } },
  ];
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
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
  const editable = canEdit && isDraftStatus;

  const updateLine = (id: string, patch: Partial<MaterialRequisitionLine>) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };
  const removeLine = (id: string) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.filter((l) => l.id !== id) });
  };
  const addProduct = (product: Product) => {
    const categoryName = categories.find((c) => c.id === product.categoryId)?.name ?? "";
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankMaterialRequisitionLine(product, categoryName)] });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await updateMaterialRequisition(draft.id, toUpdateFields(draft));
      setDoc(updated);
      setDraft(updated);
      showToast(t("materialRequisitionDoc.saved"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const saveReturn = async () => {
    if (!draft) return;
    setSavingReturn(true);
    try {
      const updated = await recordMaterialRequisitionReturn(draft.id, {
        lines: draft.lines.map((l) => ({ id: l.id, returnQty: l.returnQty })),
        returnedBy: draft.returnedBy,
        returnReceivedBy: draft.returnReceivedBy,
      });
      setDoc(updated);
      setDraft(updated);
      showToast(t("materialRequisitionDoc.returnSaved"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorSaveReturn"));
    } finally {
      setSavingReturn(false);
    }
  };

  const finalize = async () => {
    setFinalizing(true);
    try {
      const updated = await finalizeMaterialRequisition(doc.id);
      setDoc(updated);
      setDraft(updated);
      setConfirmFinalize(false);
      showToast(t("materialRequisitionDoc.finalized"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorFinalize"));
    } finally {
      setFinalizing(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await logMaterialRequisitionPrinted(doc.id);
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

  const filteredProducts = products.filter((p) => {
    const name = categories.find((c) => c.id === p.categoryId)?.name ?? "";
    return MATERIAL_CATEGORY_NAMES.includes(name);
  });

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("materialRequisitionDoc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-mono font-medium tracking-wide">{doc.id}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${doc.status === "Draft" ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20" : doc.status === "PendingApproval" ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"}`}>
          {doc.status === "Draft" ? t("materialRequisition.status.draft") : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final")}
        </span>

        <div data-tour="mrdoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
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
            onUpdated={(updated) => { setDoc(updated); setDraft(updated); }}
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
        <RejectionNotice comment={doc.rejectionComment ?? ""} />
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
            <h1 className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">{t("materialRequisitionDoc.title")}</h1>
            <p className="text-[#a8bed8] text-xs mt-1">{t("materialRequisitionDoc.jobCodePrefix")} {doc.jobCode}{doc.jobOrderCode ? ` · ${t("materialRequisitionDoc.jobOrderPrefix")} ${doc.jobOrderCode}` : ""}</p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mr-customerName" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.customerName")}</label>
              <input id="mr-customerName" disabled={!editable} value={draft.customerName}
                onChange={(e) => setDraft({ ...draft, customerName: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="mr-productName" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.productName")}</label>
              <input id="mr-productName" disabled={!editable} value={draft.productName}
                onChange={(e) => setDraft({ ...draft, productName: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="mr-responsibleEmployee" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.responsibleEmployee")}</label>
              <input id="mr-responsibleEmployee" disabled={!editable} value={draft.responsibleEmployee}
                onChange={(e) => setDraft({ ...draft, responsibleEmployee: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="mr-productionStartDate" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.productionStartDate")}</label>
              <input id="mr-productionStartDate" type="date" disabled={!editable} value={draft.productionStartDate}
                onChange={(e) => setDraft({ ...draft, productionStartDate: e.target.value })}
                className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div data-tour="mrdoc-addline" className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("materialRequisitionDoc.linesTitle")}</h2>
            {editable && (
              <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                <Plus size={13} /> {t("materialRequisitionDoc.addLine")}
              </button>
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
                      t("materialRequisitionDoc.col.plannedQty"), t("materialRequisitionDoc.col.withdrawal1"), t("materialRequisitionDoc.col.withdrawal2"),
                      t("materialRequisitionDoc.col.returnQty"), t("materialRequisitionDoc.col.actualUsed"), "",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => (
                    <tr key={line.id} className="border-b border-border/50">
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{line.productCode}</td>
                      <td className="px-3 py-2 text-xs text-foreground">{line.productName}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{line.unit}</td>
                      {(["plannedQty", "withdrawal1Qty", "withdrawal2Qty"] as const).map((field) => (
                        <td key={field} className="px-2 py-1.5">
                          <input
                            type="number" disabled={!editable}
                            value={line[field] ?? ""}
                            onChange={(e) => updateLine(line.id, { [field]: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <input
                          type="number" disabled={!canEdit}
                          title={t("materialRequisitionDoc.returnQtyHint")}
                          value={line.returnQty ?? ""}
                          onChange={(e) => updateLine(line.id, { returnQty: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-20 text-xs font-mono text-foreground bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded px-1.5 py-1 outline-none disabled:opacity-70"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number" disabled={!editable}
                          value={line.actualUsedQty ?? ""}
                          onChange={(e) => updateLine(line.id, { actualUsedQty: e.target.value === "" ? null : Number(e.target.value) })}
                          className="w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70"
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
        </div>

        <div data-tour="mrdoc-returnCard" className="bg-card border border-[#c9a84c]/30 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Undo2 size={15} className="text-[#c9a84c]" />
            <h2 className="text-sm font-semibold text-foreground">{t("materialRequisitionDoc.returnTitle")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{t("materialRequisitionDoc.returnHint")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="mr-returnedBy" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.returnedBy")}</label>
              <input id="mr-returnedBy" disabled={!canEdit} value={draft.returnedBy}
                onChange={(e) => setDraft({ ...draft, returnedBy: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="mr-returnReceivedBy" className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.returnReceivedBy")}</label>
              <input id="mr-returnReceivedBy" disabled={!canEdit} value={draft.returnReceivedBy}
                onChange={(e) => setDraft({ ...draft, returnReceivedBy: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
          </div>
          {canEdit && (
            <button onClick={saveReturn} disabled={savingReturn} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#c9a84c]/40 text-[#a5822f] rounded-lg font-medium hover:bg-[#c9a84c]/10 transition-colors disabled:opacity-60">
              {savingReturn ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("materialRequisitionDoc.saveReturn")}
            </button>
          )}
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

      {showPrint && <MaterialRequisitionPrintDocument materialRequisition={doc} />}

      <ProductPickerModal open={pickerOpen} products={filteredProducts} categories={categories} onSelect={addProduct} onClose={() => setPickerOpen(false)} />

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
        open={confirmFinalize}
        title={t("materialRequisitionDoc.finalizeConfirmTitle")}
        message={t("materialRequisitionDoc.finalizeConfirmMessage")}
        busy={finalizing}
        onConfirm={finalize}
        onCancel={() => setConfirmFinalize(false)}
      />
    </div>
  );
}
