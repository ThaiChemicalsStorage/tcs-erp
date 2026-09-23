import { useEffect, useState } from "react";
import { ChevronRight, Loader2, PackageCheck, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { fmt, formatQuoteDateThai } from "../../lib/quotes";
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
import { DocumentApprovalActions, RejectionNotice } from "../../components/DocumentApprovalActions";
import { DocumentStatusStepper } from "../../components/DocumentStatusStepper";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { ProductPickerModal } from "../products/ProductPickerModal";
import { StoreReceiptPrintDocument } from "./StoreReceiptPrintDocument";

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70";
const cellInputCls = "w-24 text-xs font-mono text-foreground bg-transparent border-0 outline-none focus:bg-secondary rounded px-1.5 py-1 disabled:opacity-70";
const thCls = "px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";

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

/**
 * หน้าใบรับคืน / รับเข้าคลังของสโตร์ (2026-09-23) — โครงเดียวกับหน้าใบเบิก (แถบเครื่องมือ · ขั้นสถานะ ·
 * การ์ดหัวใบแถบกรมท่า · รายการ · การ์ดสโตร์ขอบเขียว · ผู้เกี่ยวข้อง) ต่างกันที่หัวใบและตารางรายการ
 * เปลี่ยนไปตามพฤติกรรมของรหัส (คืน / รับเข้า / ปรับยอด) ดู `src/lib/storeReceipt.ts`
 */
export function StoreReceiptDocument({
  storeReceiptId, canEdit, canApprove, canPost, canPrint, canDelete, companyHeader, onBack, showToast,
}: {
  storeReceiptId: string;
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
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  if (loadError) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <button onClick={onBack} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">{t("storeReceipt.backToList")}</button>
      </div>
    );
  }
  if (!doc || !draft || !info) {
    return (
      <div className="flex-1 p-6" role="status" aria-live="polite">
        <span className="sr-only">{t("storeReceipt.loading")}</span>
        <div className="h-8 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  const posted = !!doc.postedAt;
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

  const onStatusChanged = (updated: StoreReceipt) => {
    setDoc(updated);
    setDraft(updated);
    dirty.markSaved(toUpdateFields(updated));
  };

  const statusPill = doc.status === "Draft"
    ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20"
    : doc.status === "PendingApproval" ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20";
  const linesTitle = kind === "return" ? t("storeReceipt.lines.return") : kind === "adjust" ? t("storeReceipt.lines.adjust") : t("storeReceipt.lines.receive");
  const targetLabel = code === "TK" ? t("storeReceipt.col.targetTK") : t("storeReceipt.col.targetJU");
  const currentSourceMissing = !!draft.sourceRequisitionId && !candidates.some((c) => c.id === draft.sourceRequisitionId);

  return (
    <>
      <div className="flex-1 overflow-y-auto print:hidden">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {t("storeReceipt.backToList")}
          </button>
          <ChevronRight size={13} className="text-muted-foreground" />
          <span className="text-sm text-[#866d28] font-mono font-semibold">{draft.documentNumber || draft.id}</span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusPill}`}>
            {doc.status === "Draft" ? t("materialRequisition.status.draft") : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final")}
          </span>
          {doc.status === "Final" && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${posted ? "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20" : "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20"}`}>
              {posted ? t("storeDocs.posted") : t("storeDocs.awaitingPost")}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            {editable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
            {canPrint && (
              <button onClick={() => void handlePrint()} disabled={printing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
                {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("storeReceipt.print")}
              </button>
            )}
            {editable && (
              <button onClick={() => void save()} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("storeReceipt.save")}
              </button>
            )}
            <DocumentApprovalActions
              status={doc.status}
              canEdit={canEdit}
              canApprove={canApprove}
              onSubmit={async () => { if (dirty.isDirtyNow()) await save(); return submitStoreReceiptApproval(doc.id); }}
              onApprove={() => approveStoreReceipt(doc.id)}
              onReject={(c) => rejectStoreReceipt(doc.id, c)}
              onWithdraw={() => withdrawStoreReceiptApproval(doc.id)}
              onUpdated={onStatusChanged}
              showToast={showToast}
            />
            {canDelete && !posted && (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
                <Trash2 size={13} /> {t("storeReceipt.delete")}
              </button>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto">
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
          <DocumentStatusStepper
            status={doc.status}
            rejectionComment={doc.rejectionComment ?? ""}
            approverLabel={t("storeReceipt.approverLabel")}
            approvedByUserId={doc.approvedByUserId}
            approvedByName={doc.approvedBy}
            approvedAt={doc.approvedAt}
          />
          <RejectionNotice comment={doc.rejectionComment ?? ""} />

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
              <h1 className="text-[#c9a84c] text-xl font-bold">{t("storeReceipt.title")}</h1>
              <p className="text-[#a8bed8] text-xs mt-1">
                {t("storeReceipt.codeLabel")} <span className="font-mono font-semibold text-[#c9a84c]">{info.code}</span> · {t(info.nameKey)}
                {info.pair && ` · ${t("storeReceipt.pairHint").replace("{code}", info.pair)}`}
              </p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="sr-documentNumber" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.documentNumber")}</label>
                <input id="sr-documentNumber" disabled={!editable} value={draft.documentNumber} onChange={(e) => set({ documentNumber: e.target.value })} className={`${inputCls} font-mono`} />
                <p className="text-xs text-muted-foreground mt-1">{t("storeReceipt.field.documentNumberHint").replace("{id}", doc.id)}</p>
              </div>
              <div>
                <label htmlFor="sr-receivedDate" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.receivedDate")}</label>
                <input id="sr-receivedDate" type="date" disabled={!editable} value={draft.receivedDate} onChange={(e) => set({ receivedDate: e.target.value })} className={`${inputCls} font-mono`} />
              </div>

              {kind === "return" && (
                <>
                  <div className="sm:col-span-2">
                    <label htmlFor="sr-source" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.source").replace("{code}", info.pair ?? "")}</label>
                    <select id="sr-source" disabled={!editable} value={draft.sourceRequisitionId}
                      onChange={(e) => void chooseSource(e.target.value)} className={`${inputCls} font-mono`}>
                      <option value="">{t("storeReceipt.field.sourcePlaceholder")}</option>
                      {currentSourceMissing && <option value={draft.sourceRequisitionId}>{draft.sourceRequisitionNumber}</option>}
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {[c.documentNumber, c.jobCode, c.storeReference, [c.chargeDepartmentName, c.chargeTeamName].filter(Boolean).join(" / ")].filter(Boolean).join(" · ")}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground mt-1">{t("storeReceipt.field.sourceHint").replace("{code}", info.pair ?? "")}</p>
                  </div>
                  <div>
                    <label htmlFor="sr-returnedBy" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.returnedBy")}</label>
                    <input id="sr-returnedBy" disabled={!editable} value={draft.returnedBy} onChange={(e) => set({ returnedBy: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="sr-receivedBy" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.receivedBy")}</label>
                    <input id="sr-receivedBy" disabled={!editable} value={draft.receivedBy} onChange={(e) => set({ receivedBy: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.jobCode")}</span>
                    <p className="text-sm font-mono text-foreground px-3 py-2 bg-secondary/50 border border-border rounded-lg">{draft.jobCode || "—"}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block mb-1">{t("storeDocs.col.charge")}</span>
                    <p className="text-sm text-foreground px-3 py-2 bg-secondary/50 border border-border rounded-lg">{[draft.chargeDepartmentName, draft.chargeTeamName].filter(Boolean).join(" / ") || "—"}</p>
                  </div>
                </>
              )}

              {kind === "receive" && code && code in REFERENCE_LABEL_KEY && (
                <>
                  <div>
                    <label htmlFor="sr-reference" className="text-xs text-muted-foreground block mb-1">{t(REFERENCE_LABEL_KEY[code as keyof typeof REFERENCE_LABEL_KEY])}</label>
                    <input id="sr-reference" disabled={!editable} value={draft.reference} onChange={(e) => set({ reference: e.target.value })} className={inputCls} />
                  </div>
                  {code === "GC" ? (
                    <div>
                      <label htmlFor="sr-customer" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.customerName")}</label>
                      <input id="sr-customer" disabled={!editable} value={draft.customerName} onChange={(e) => set({ customerName: e.target.value })} className={inputCls} />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="sr-jobCode" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.jobCode")}</label>
                      <input id="sr-jobCode" disabled={!editable} value={draft.jobCode} onChange={(e) => set({ jobCode: e.target.value })} className={`${inputCls} font-mono`} />
                    </div>
                  )}
                  <div>
                    <label htmlFor="sr-deliveredBy" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.deliveredBy")}</label>
                    <input id="sr-deliveredBy" disabled={!editable} value={draft.returnedBy} onChange={(e) => set({ returnedBy: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="sr-receivedBy2" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.receivedBy")}</label>
                    <input id="sr-receivedBy2" disabled={!editable} value={draft.receivedBy} onChange={(e) => set({ receivedBy: e.target.value })} className={inputCls} />
                  </div>
                </>
              )}

              {kind === "adjust" && (
                <div className="sm:col-span-2">
                  <label htmlFor="sr-reason" className="text-xs text-muted-foreground block mb-1">{t("storeReceipt.field.reason")} <span className="text-[#e05252]">*</span></label>
                  <input id="sr-reason" disabled={!editable} value={draft.reason} onChange={(e) => set({ reason: e.target.value })}
                    placeholder={code === "TK" ? t("storeReceipt.field.reasonPlaceholderTK") : t("storeReceipt.field.reasonPlaceholderJU")} className={inputCls} />
                </div>
              )}
            </div>
          </div>

          {code === "GC" && (
            <div className="rounded-xl border border-[#e08a3c]/30 bg-[#e08a3c]/5 px-4 py-3 text-sm text-[#a75d1a]">{t("storeReceipt.gcNote")}</div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{linesTitle}</h2>
              {editable && kind !== "return" && (
                <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("storeReceipt.addFromCatalog")}
                </button>
              )}
            </div>
            {draft.lines.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">{kind === "return" ? t("storeReceipt.linesEmptyReturn") : t("storeReceipt.linesEmpty")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {(kind === "return"
                        ? [t("storeReceipt.col.productCode"), t("storeReceipt.col.item"), t("storeReceipt.col.unit"), t("storeReceipt.col.issued"), t("storeReceipt.col.returned"), t("storeReceipt.col.returnNow")]
                        : kind === "receive"
                        ? [t("storeReceipt.col.productCode"), t("storeReceipt.col.item"), t("storeReceipt.col.unit"), t("storeReceipt.col.inStock"), t("storeReceipt.col.qty"), t("storeReceipt.col.unitCost"), ""]
                        : [t("storeReceipt.col.productCode"), t("storeReceipt.col.item"), t("storeReceipt.col.unit"), t("storeReceipt.col.inStock"), targetLabel, t("storeReceipt.col.diff"), ""]
                      ).map((h, i) => <th key={`${i}-${h}`} className={thCls}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {draft.lines.map((l) => {
                      const inStock = stockByProduct[l.productId];
                      const src = l.sourceLineId ? sourceByLine.get(l.sourceLineId) : undefined;
                      const room = src ? Math.max(0, src.issued - src.returned) : 0;
                      const over = kind === "return" && (l.qty ?? 0) > room && !posted;
                      const diff = kind === "adjust" && l.qty !== null && inStock !== undefined ? l.qty - inStock : null;
                      return (
                        <tr key={l.id} className="border-b border-border/50">
                          <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{l.productCode}</td>
                          <td className="px-3 py-2 text-xs text-foreground">{l.productName}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{l.unit}</td>
                          {kind === "return" ? (
                            <>
                              <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{src ? fmt(src.issued) : "—"}</td>
                              <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{src ? fmt(src.returned) : "—"}</td>
                              <td className="px-2 py-1.5">
                                <input type="number" min={0} max={room} disabled={!editable} value={l.qty ?? ""} aria-label={t("storeReceipt.col.returnNow")}
                                  onChange={(e) => setLine(l.id, { qty: num(e.target.value) })}
                                  className={`w-24 text-xs font-mono text-foreground bg-[#2aa36b]/5 border rounded px-1.5 py-1 outline-none disabled:opacity-70 ${over ? "border-[#e05252]" : "border-[#2aa36b]/20"}`} />
                                {over && <p className="text-xs text-[#c23f3f] mt-0.5">{t("storeReceipt.overReturn").replace("{n}", fmt(room))}</p>}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{inStock === undefined ? "—" : fmt(inStock)}</td>
                              <td className="px-2 py-1.5">
                                <input type="number" min={0} disabled={!editable} value={l.qty ?? ""} aria-label={kind === "adjust" ? targetLabel : t("storeReceipt.col.qty")}
                                  onChange={(e) => setLine(l.id, { qty: num(e.target.value) })} className={cellInputCls} />
                              </td>
                              <td className="px-2 py-1.5">
                                {kind === "receive" ? (
                                  <input type="number" min={0} disabled={!editable || code === "GC"} value={code === "GC" ? "" : l.unitCost ?? ""} aria-label={t("storeReceipt.col.unitCost")}
                                    onChange={(e) => setLine(l.id, { unitCost: num(e.target.value) })} className={cellInputCls} />
                                ) : (
                                  <span className={`text-xs font-mono font-semibold ${diff === null || diff === 0 ? "text-muted-foreground" : diff > 0 ? "text-[#207e52]" : "text-[#c23f3f]"}`}>
                                    {diff === null ? "—" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                {editable && (
                                  <button onClick={() => setDraft((d) => (d ? { ...d, lines: d.lines.filter((x) => x.id !== l.id) } : d))} aria-label={t("storeReceipt.removeLine")} title={t("storeReceipt.removeLine")}
                                    className="text-muted-foreground opacity-50 hover:opacity-100 focus-visible:opacity-100 hover:text-[#e05252] transition-opacity">
                                    <X size={13} />
                                  </button>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-card border border-[#2aa36b]/30 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <PackageCheck size={15} className="text-[#207e52]" />
              <h2 className="text-sm font-semibold text-foreground">{t("storeReceipt.postCard.title")}</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {posted
                ? t("storeReceipt.postCard.done").replace("{name}", doc.postedByName || "—").replace("{date}", formatQuoteDateThai(doc.postedAt))
                : doc.status !== "Final" ? t("storeReceipt.postCard.locked")
                : canPost ? t("storeReceipt.postCard.ready") : t("storeReceipt.postCard.noPermission")}
            </p>
            {doc.status === "Final" && !posted && canPost && (
              <button onClick={() => setConfirmPost(true)} disabled={posting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2aa36b]/40 text-[#207e52] rounded-lg font-medium hover:bg-[#2aa36b]/10 transition-colors disabled:opacity-60">
                {posting ? <Loader2 size={13} className="animate-spin" /> : <PackageCheck size={13} />} {t("storeReceipt.postBtn")}
              </button>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("storeReceipt.signatories")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
              {([
                ["preparedBy", "preparedAt", t("materialRequisitionDoc.field.preparedBy")],
                ["approvedBy", "approvedAt", t("materialRequisitionDoc.field.approvedBy")],
                ["storeDeptBy", "storeDeptAt", t("materialRequisitionDoc.field.storeDeptBy")],
                ["costDeptBy", "costDeptAt", t("materialRequisitionDoc.field.costDeptBy")],
              ] as const).map(([nameField, dateField, label]) => (
                <div key={nameField} className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`sr-${nameField}`} className="text-xs text-muted-foreground block mb-1">{label}</label>
                    <input id={`sr-${nameField}`} disabled={!editable} value={draft[nameField]} onChange={(e) => set({ [nameField]: e.target.value })}
                      className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                  </div>
                  <div>
                    <label htmlFor={`sr-${dateField}`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.date")}</label>
                    <input id={`sr-${dateField}`} type="date" disabled={!editable} value={draft[dateField]} onChange={(e) => set({ [dateField]: e.target.value })}
                      className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <StoreReceiptPrintDocument doc={draft} unitCostByProduct={printCosts} companyHeader={companyHeader} />

      <ProductPickerModal
        open={pickerOpen}
        products={products}
        categories={categories}
        showStock
        onSelect={(p) => {
          setDraft((d) => (d ? { ...d, lines: [...d.lines, { ...blankStoreReceiptLine(), productId: p.id, productCode: p.code, productName: p.name, unit: p.unit }] } : d));
          setStockByProduct((s) => ({ ...s, [p.id]: p.stockQty }));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
      <ConfirmDialog
        open={confirmPost}
        title={t("storeReceipt.postConfirm.title")}
        message={t("storeReceipt.postConfirm.message")}
        confirmLabel={t("storeReceipt.postBtn")}
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
        busy={deleting}
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
