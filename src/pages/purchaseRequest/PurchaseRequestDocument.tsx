import { useEffect, useState } from "react";
import { ChevronRight, Printer, Save, RotateCw, Trash2, Loader2, AlertTriangle, Plus, X } from "lucide-react";
import type { DriveStep } from "driver.js";
import { type Product, type ProductCategory, fetchProducts, fetchCategories } from "../../lib/products";
import {
  type PurchaseRequest, type PurchaseRequestLine, type PurchaseRequestUpdateFields,
  fetchPurchaseRequest, updatePurchaseRequest, finalizePurchaseRequest, logPurchaseRequestPrinted,
  deletePurchaseRequest, blankPurchaseRequestLine,
  submitPurchaseRequestApproval, approvePurchaseRequest, rejectPurchaseRequest, withdrawPurchaseRequestApproval,
} from "../../lib/purchaseRequest";
import { MATERIAL_CATEGORY_NAMES } from "../../lib/materialRequisition";
import { DocumentApprovalActions, RejectionNotice } from "../../components/DocumentApprovalActions";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { PurchaseRequestPrintDocument } from "./PurchaseRequestPrintDocument";
import { useI18n } from "../../lib/i18n";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";

function toUpdateFields(p: PurchaseRequest): PurchaseRequestUpdateFields {
  return {
    lines: p.lines,
    vendorName: p.vendorName,
    neededByDate: p.neededByDate,
    creditDays: p.creditDays,
    shippingMethod: p.shippingMethod,
    deliveryLocation: p.deliveryLocation,
    requestedBy: p.requestedBy,
    requestedAt: p.requestedAt,
    approvedBy: p.approvedBy,
    approvedAt: p.approvedAt,
    purchasingDeptBy: p.purchasingDeptBy,
    purchasingDeptAt: p.purchasingDeptAt,
  };
}

// หน้าแก้ไขใบขอซื้อ: ข้อมูลหัวเรื่อง ตารางรายการ (เลือกจากแคตตาล็อกหรือพิมพ์เอง) และผู้เกี่ยวข้อง
// Purchase Request editor: header fields, a line table (catalog-linked or free-typed), and signatories.
export function PurchaseRequestDocument({
  purchaseRequestId,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  onBack,
  onDeleted,
  showToast,
}: {
  purchaseRequestId: string;
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
  const [doc, setDoc] = useState<PurchaseRequest | null>(null);
  const [draft, setDraft] = useState<PurchaseRequest | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPurchaseRequest(purchaseRequestId), fetchProducts(), fetchCategories()])
      .then(([p, prod, cat]) => { if (!cancelled) { setDoc(p); setDraft(p); setProducts(prod); setCategories(cat); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("purchaseRequestDoc.loadError"));
      });
    return () => { cancelled = true; };
  }, [purchaseRequestId, reloadKey, t]);

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="prdoc-actions"]', popover: { title: t("tour.prdoc.actions.title"), description: t("tour.prdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="prdoc-addline"]', popover: { title: t("tour.prdoc.addline.title"), description: t("tour.prdoc.addline.desc"), side: "bottom" } },
    { element: '[data-tour="prdoc-lines"]', popover: { title: t("tour.prdoc.lines.title"), description: t("tour.prdoc.lines.desc"), side: "top" } },
  ];

  // ── บันทึกอัตโนมัติ (2026-08-25) — hook ต้องอยู่ก่อน early return ทุกอันด้านล่าง ────────────────
  // Auto-save, declared above the loading/error early returns because hooks may not run
  // conditionally. It sends the exact payload the Save button sends and only while the document is
  // an editable Draft; the local snapshot alongside it survives a closed tab or a click onto
  // another page. See src/hooks/useAutoSave.ts.
  const autoSaveEditable = !!draft && canEdit && draft.status === "Draft";
  const autoSavePayload = draft && autoSaveEditable ? toUpdateFields(draft) : null;
  const draftBackup = useDraftBackup({
    storageKey: draft ? `purchaseRequest:${draft.id}` : null,
    data: autoSavePayload,
    enabled: autoSaveEditable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: autoSaveEditable,
    onSave: async (fields) => {
      if (!draft) return;
      const saved = await updatePurchaseRequest(draft.id, fields, { autoSave: true });
      // อัปเดตเฉพาะ doc (สถานะ/เวลาแก้ไขล่าสุด) ไม่แตะ draft เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      // Only `doc` is refreshed — never `draft`, which the user may be typing into right now.
      setDoc(saved);
    },
  });

  const docTour = useModuleTour("purchaseRequestDoc", currentUserId, docTourSteps, { autoStart: !!doc });

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
            <ChevronRight size={14} className="rotate-180" /> {t("purchaseRequestDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle size={20} className="text-[#e05252]" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <RotateCw size={12} /> {t("purchaseRequest.retry")}
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
            <ChevronRight size={14} className="rotate-180" /> {t("purchaseRequestDoc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-2.5 p-6">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">{t("purchaseRequestDoc.loadingDocument")}</p>
        </div>
      </div>
    );
  }

  const isDraftStatus = doc.status === "Draft";
  const editable = canEdit && isDraftStatus;

  const updateLine = (id: string, patch: Partial<PurchaseRequestLine>) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };
  const removeLine = (id: string) => {
    setDraft((prev) => prev && { ...prev, lines: prev.lines.filter((l) => l.id !== id) });
  };
  const addProduct = (product: Product) => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankPurchaseRequestLine({ id: product.id, code: product.code, name: product.name, unit: product.unit })] });
  };
  const addFreeLine = () => {
    setDraft((prev) => prev && { ...prev, lines: [...prev.lines, blankPurchaseRequestLine()] });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await updatePurchaseRequest(draft.id, toUpdateFields(draft));
      setDoc(updated);
      setDraft(updated);
      // ตั้งฐานเทียบของ auto-save ใหม่เป็น "สิ่งที่เซิร์ฟเวอร์ตอบกลับมา" ซึ่งคือสิ่งที่ฟอร์มถืออยู่หลังบรรทัดบน
      // ไม่ใช่ค่าบนจอตอนเรียก ซึ่งอาจเก่าหรือใหม่กว่าที่ส่งขึ้นไปจริง
      autoSave.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("purchaseRequestDoc.saved"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const finalize = async () => {
    setFinalizing(true);
    try {
      const updated = await finalizePurchaseRequest(doc.id);
      setDoc(updated);
      setDraft(updated);
      setConfirmFinalize(false);
      showToast(t("purchaseRequestDoc.finalized"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorFinalize"));
    } finally {
      setFinalizing(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await logPurchaseRequestPrinted(doc.id);
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePurchaseRequest(doc.id);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseRequestDoc.errorDelete"));
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
          <ChevronRight size={14} className="rotate-180" /> {t("purchaseRequestDoc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-mono font-medium tracking-wide">{doc.id}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${doc.status === "Draft" ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20" : doc.status === "PendingApproval" ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"}`}>
          {doc.status === "Draft" ? t("materialRequisition.status.draft") : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final")}
        </span>

        <div data-tour="prdoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
          {autoSaveEditable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
          {canPrint && (
            <button onClick={handlePrint} disabled={printing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("purchaseRequestDoc.print")}
            </button>
          )}
          {editable && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("purchaseRequestDoc.saveDraft")}
            </button>
          )}
          <DocumentApprovalActions
            status={doc.status}
            canEdit={canEdit}
            canApprove={canFinalize}
            onSubmit={() => submitPurchaseRequestApproval(doc.id)}
            onApprove={() => approvePurchaseRequest(doc.id)}
            onReject={(c) => rejectPurchaseRequest(doc.id, c)}
            onWithdraw={() => withdrawPurchaseRequestApproval(doc.id)}
            onUpdated={(updated) => { setDoc(updated); setDraft(updated); }}
            showToast={showToast}
          />
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("purchaseRequestDoc.delete")}
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
            <h1 className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">{t("purchaseRequestDoc.title")}</h1>
            <p className="text-[#a8bed8] text-xs mt-1">{t("purchaseRequestDoc.jobCodePrefix")} {doc.jobCode}</p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pr-vendorName" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.vendorName")}</label>
              <input id="pr-vendorName" disabled={!editable} value={draft.vendorName}
                onChange={(e) => setDraft({ ...draft, vendorName: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="pr-neededByDate" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.neededByDate")}</label>
              <input id="pr-neededByDate" type="date" disabled={!editable} value={draft.neededByDate}
                onChange={(e) => setDraft({ ...draft, neededByDate: e.target.value })}
                className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="pr-creditDays" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.creditDays")}</label>
              <input id="pr-creditDays" type="number" disabled={!editable} value={draft.creditDays ?? ""}
                onChange={(e) => setDraft({ ...draft, creditDays: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div>
              <label htmlFor="pr-shippingMethod" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.shippingMethod")}</label>
              <input id="pr-shippingMethod" disabled={!editable} value={draft.shippingMethod}
                onChange={(e) => setDraft({ ...draft, shippingMethod: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="pr-deliveryLocation" className="text-xs text-muted-foreground block mb-1">{t("purchaseRequestDoc.field.deliveryLocation")}</label>
              <input id="pr-deliveryLocation" disabled={!editable} value={draft.deliveryLocation}
                onChange={(e) => setDraft({ ...draft, deliveryLocation: e.target.value })}
                className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div data-tour="prdoc-addline" className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseRequestDoc.linesTitle")}</h2>
            {editable && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("purchaseRequestDoc.addFromCatalog")}
                </button>
                <button onClick={addFreeLine} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("purchaseRequestDoc.addFreeLine")}
                </button>
              </div>
            )}
          </div>
          <div data-tour="prdoc-lines">
          {draft.lines.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("purchaseRequestDoc.linesEmpty")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[
                      t("purchaseRequestDoc.col.productCode"), t("purchaseRequestDoc.col.description"), t("purchaseRequestDoc.col.unit"),
                      t("purchaseRequestDoc.col.warehouseRemaining"), t("purchaseRequestDoc.col.qtyRequested"), t("purchaseRequestDoc.col.neededByDate"),
                      t("purchaseRequestDoc.col.department"), t("purchaseRequestDoc.col.estimatedCost"), "",
                    ].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => {
                    const isCatalogLine = !!line.productId;
                    return (
                      <tr key={line.id} className="border-b border-border/50">
                        <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{line.productCode}</td>
                        <td className="px-3 py-2 min-w-[200px]">
                          {isCatalogLine ? (
                            <span className="text-xs text-foreground">{line.description}</span>
                          ) : (
                            <input disabled={!editable} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })}
                              placeholder={t("purchaseRequestDoc.freeDescriptionPlaceholder")}
                              className="w-full text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {isCatalogLine ? (
                            <span className="text-xs text-muted-foreground">{line.unit}</span>
                          ) : (
                            <input disabled={!editable} value={line.unit} onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                              className="w-16 text-xs text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <input disabled={!editable} value={line.warehouseRemainingQty} onChange={(e) => updateLine(line.id, { warehouseRemainingQty: e.target.value })}
                            className="w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" disabled={!editable} value={line.qtyRequested ?? ""} onChange={(e) => updateLine(line.id, { qtyRequested: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="date" disabled={!editable} value={line.neededByDate} onChange={(e) => updateLine(line.id, { neededByDate: e.target.value })}
                            className="w-32 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input disabled={!editable} value={line.departmentCode} onChange={(e) => updateLine(line.id, { departmentCode: e.target.value })}
                            className="w-20 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" disabled={!editable} value={line.estimatedCost ?? ""} onChange={(e) => updateLine(line.id, { estimatedCost: e.target.value === "" ? null : Number(e.target.value) })}
                            className="w-24 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70" />
                        </td>
                        <td className="px-2 py-1.5">
                          {editable && (
                            <button onClick={() => removeLine(line.id)} title={t("purchaseRequestDoc.removeLine")} className="text-muted-foreground opacity-50 hover:opacity-100 hover:text-[#e05252] transition-opacity">
                              <X size={13} />
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
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseRequestDoc.signatoriesTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {([
              ["requestedBy", "requestedAt", t("purchaseRequestDoc.field.requestedBy")],
              ["approvedBy", "approvedAt", t("purchaseRequestDoc.field.approvedBy")],
              ["purchasingDeptBy", "purchasingDeptAt", t("purchaseRequestDoc.field.purchasingDeptBy")],
            ] as const).map(([nameField, dateField, label]) => (
              <div key={nameField} className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`pr-${nameField}`} className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input id={`pr-${nameField}`} disabled={!editable} value={draft[nameField]}
                    onChange={(e) => setDraft({ ...draft, [nameField]: e.target.value })}
                    className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                </div>
                <div>
                  <label htmlFor={`pr-${dateField}`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.date")}</label>
                  <input id={`pr-${dateField}`} type="date" disabled={!editable} value={draft[dateField]}
                    onChange={(e) => setDraft({ ...draft, [dateField]: e.target.value })}
                    className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showPrint && <PurchaseRequestPrintDocument purchaseRequest={doc} />}

      <ProductPickerModal open={pickerOpen} products={filteredProducts} categories={categories} onSelect={addProduct} onClose={() => setPickerOpen(false)} />

      <ConfirmDialog
        open={confirmDelete}
        title={t("purchaseRequestDoc.deleteConfirmTitle")}
        message={t("purchaseRequestDoc.deleteConfirmMessage")}
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmFinalize}
        title={t("purchaseRequestDoc.finalizeConfirmTitle")}
        message={t("purchaseRequestDoc.finalizeConfirmMessage")}
        busy={finalizing}
        onConfirm={finalize}
        onCancel={() => setConfirmFinalize(false)}
      />
    </div>
  );
}
