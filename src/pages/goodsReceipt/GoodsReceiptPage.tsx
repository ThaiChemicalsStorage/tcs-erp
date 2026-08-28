import { useCallback, useEffect, useState } from "react";
import { PackageCheck, Plus, Search, X, ArrowLeft, Save, Printer, Trash2, CheckCircle2, Undo2, Loader2 } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { ApiError } from "../../lib/apiClient";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import {
  type GoodsReceipt, type GoodsReceiptSummary, type GoodsReceiptStatus, type GoodsReceiptUpdateFields,
  type GoodsReceiptLineResult, isFullyReceived,
  fetchAllGoodsReceipts, fetchGoodsReceipt, updateGoodsReceipt, deleteGoodsReceipt,
  completeGoodsReceipt, reopenGoodsReceipt, logGoodsReceiptPrinted, createGoodsReceipt,
} from "../../lib/goodsReceipt";
import { PurchaseOrderPickerDialog } from "../purchaseOrder/PurchaseOrderPickerDialog";
import { GoodsReceiptPrintDocument } from "./GoodsReceiptPrintDocument";

/**
 * ใบตรวจรับสินค้า — หน้ารายการ + ตัวแก้ไข อยู่ไฟล์เดียวกัน
 *
 * ใบนี้สั้นกว่าใบสั่งซื้อมาก (ไม่มีขั้นตอนอนุมัติ ไม่มีบล็อกผู้ขาย/เงื่อนไข) จึงรวมไว้ไฟล์เดียว
 * ตามแบบที่หน้า "คำขอเพิ่มสินค้า" ทำ แทนที่จะแตกเป็น 3 ไฟล์แบบใบสั่งซื้อ
 */

const FILTER_ALL = "all";
const statusStyle: Record<GoodsReceiptStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  Received: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};
const resultStyle: Record<GoodsReceiptLineResult, string> = {
  Pending: "text-muted-foreground",
  Passed: "text-[#207e52]",
  Rejected: "text-[#d22626]",
};
const inputCls = "w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60";
const cellCls = "px-2 py-1.5 text-sm bg-transparent border border-transparent rounded focus:bg-secondary focus:border-[#c9a84c]/50 outline-none w-full transition-colors disabled:opacity-60";

function toUpdateFields(d: GoodsReceipt): GoodsReceiptUpdateFields {
  return {
    documentNumber: d.documentNumber, jobCode: d.jobCode, vendorName: d.vendorName,
    receivedDate: d.receivedDate, deliveryNoteRef: d.deliveryNoteRef, receivedLocation: d.receivedLocation,
    lines: d.lines, remarks: d.remarks, receivedBy: d.receivedBy, inspectedBy: d.inspectedBy,
    revisionNote: d.revisionNote,
  };
}

export function GoodsReceiptPage({
  canCreate, canEdit, canComplete, canPrint, canDelete, canViewPurchaseOrder,
  initialGoodsReceiptId, onGoodsReceiptIdConsumed,
}: {
  canCreate: boolean; canEdit: boolean; canComplete: boolean; canPrint: boolean; canDelete: boolean;
  canViewPurchaseOrder: boolean;
  initialGoodsReceiptId?: string | null;
  onGoodsReceiptIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<GoodsReceiptSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>(FILTER_ALL);
  const [q, setQ] = useState("");

  const loadList = useCallback(() => {
    setLoading(true); setLoadError(false);
    fetchAllGoodsReceipts().then((r) => { setRows(r); setLoading(false); }).catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAllGoodsReceipts()
      .then((r) => { if (!cancelled) { setRows(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const open = (id: string) => { setSelectedId(id); setView("detail"); };
  const backToList = () => { setView("list"); loadList(); };

  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialGoodsReceiptId && initialGoodsReceiptId !== appliedId) {
    setAppliedId(initialGoodsReceiptId); setSelectedId(initialGoodsReceiptId); setView("detail");
  }
  useEffect(() => {
    if (initialGoodsReceiptId) onGoodsReceiptIdConsumed?.();
  }, [initialGoodsReceiptId, onGoodsReceiptIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <GoodsReceiptDetail
          key={selectedId} id={selectedId}
          canEdit={canEdit} canComplete={canComplete} canPrint={canPrint} canDelete={canDelete}
          onBack={backToList} onDeleted={backToList} showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 p-6" role="status" aria-live="polite">
        <span className="sr-only">{t("goodsReceipt.loading")}</span>
        <div className="h-8 w-56 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("goodsReceipt.loadError")}</p>
        <button onClick={loadList} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">{t("goodsReceipt.retry")}</button>
      </div>
    );
  }

  const query = q.trim().toLowerCase();
  const filtered = rows
    .filter((r) => filterStatus === FILTER_ALL || r.status === filterStatus)
    .filter((r) => !query || [r.id, r.documentNumber, r.vendorName, r.jobCode, r.purchaseOrderId].some((v) => (v ?? "").toLowerCase().includes(query)));

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("goodsReceipt.pageTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("goodsReceipt.pageSubtitle")}</p>
          </div>
          {canCreate && canViewPurchaseOrder && (
            <button onClick={() => setPickerOpen(true)} className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors">
              <Plus size={14} /> {t("goodsReceipt.createBtn")}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative h-9 w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("goodsReceipt.searchPlaceholder")}
              className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
            {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={13} /></button>}
          </div>
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit">
            {([FILTER_ALL, "Draft", "Received"] as const).map((s) => (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
                {s === FILTER_ALL ? t("quotation.filterAll") : t(s === "Draft" ? "goodsReceipt.status.draft" : "goodsReceipt.status.received")}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon={PackageCheck} title={t("goodsReceipt.empty.title")} description={t("goodsReceipt.empty.description")} compact />
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-16">{t("goodsReceipt.noFilterResults")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[t("goodsReceipt.col.id"), t("goodsReceipt.col.purchaseOrder"), t("goodsReceipt.col.vendor"), t("goodsReceipt.col.receivedDate"), t("goodsReceipt.col.status"), t("goodsReceipt.col.updatedAt")].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} tabIndex={0} role="button" aria-label={`${t("goodsReceipt.openRow")} ${r.documentNumber || r.id}`}
                      onClick={() => open(r.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(r.id); } }}
                      className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50">
                      <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{r.documentNumber || r.id}</td>
                      <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.purchaseOrderId}</td>
                      <td className="px-4 py-3.5 text-sm text-foreground max-w-[220px] truncate" title={r.vendorName}>{r.vendorName || "—"}</td>
                      <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.receivedDate ? formatQuoteDateThai(r.receivedDate) : "—"}</td>
                      <td className="px-4 py-3.5"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[r.status]}`}>{t(r.status === "Draft" ? "goodsReceipt.status.draft" : "goodsReceipt.status.received")}</span></td>
                      <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(r.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {pickerOpen && (
        <PurchaseOrderPickerDialog
          onCancel={() => setPickerOpen(false)}
          onPick={async (poId) => {
            try {
              const created = await createGoodsReceipt(poId);
              setPickerOpen(false); loadList(); open(created.id);
              toast.show(t("goodsReceipt.createdToast"));
            } catch (err) {
              toast.show(err instanceof ApiError ? err.message : t("goodsReceiptDoc.errorSave"));
            }
          }}
        />
      )}
      <Toast message={toast.message} />
    </>
  );
}

function GoodsReceiptDetail({
  id, canEdit, canComplete, canPrint, canDelete, onBack, onDeleted, showToast,
}: {
  id: string; canEdit: boolean; canComplete: boolean; canPrint: boolean; canDelete: boolean;
  onBack: () => void; onDeleted: () => void; showToast: (m: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<GoodsReceipt | null>(null);
  const [draft, setDraft] = useState<GoodsReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  useEffect(() => {
    let cancelled = false;
    fetchGoodsReceipt(id)
      .then((d) => { if (cancelled) return; setDoc(d); setDraft(d); setLoading(false); dirty.markSaved(toUpdateFields(d)); })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [id, dirty]);

  const editable = !!draft && canEdit && draft.status === "Draft";
  const payload: GoodsReceiptUpdateFields | null = draft && editable
    ? { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }
    : null;
  const draftBackup = useDraftBackup({ storageKey: draft ? `goodsReceipt:${draft.id}` : null, data: payload, enabled: editable });
  const autoSave = useAutoSave({
    data: payload, enabled: editable,
    onSave: async (fields) => { if (draft) setDoc(await updateGoodsReceipt(draft.id, fields, { autoSave: true })); },
  });

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updateGoodsReceipt(draft.id, { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id });
      setDoc(updated); setDraft(updated);
      autoSave.markSaved(toUpdateFields(updated)); dirty.markSaved(toUpdateFields(updated)); draftBackup.clear();
      showToast(t("goodsReceiptDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("goodsReceiptDoc.errorSave"));
      return false;
    } finally { setSaving(false); }
  };

  useUnsavedChangesGuard(draft && canEdit ? {
    getRisk: () => assessUnsavedRisk({ isDirty: dirty.isDirtyNow(), hasServerRecord: true, autoSaveEnabled: editable, autoSaveState: autoSave.state }),
    documentLabel: draft.documentNumber || draft.id, save, discard: draftBackup.clear,
  } : null);

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  if (loading) return <div className="flex-1 p-6" role="status" aria-live="polite"><span className="sr-only">{t("goodsReceipt.loading")}</span><div className="h-64 bg-muted rounded-xl animate-pulse" /></div>;
  if (loadError || !draft || !doc) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("goodsReceipt.loadError")}</p>
        <button onClick={onBack} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">{t("goodsReceiptDoc.backToList")}</button>
      </div>
    );
  }

  const set = <K extends keyof GoodsReceipt>(k: K, v: GoodsReceipt[K]) => setDraft((p) => (p ? { ...p, [k]: v } : p));
  const setLine = (lineId: string, patch: Partial<GoodsReceipt["lines"][number]>) =>
    setDraft((p) => (p ? { ...p, lines: p.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) } : p));

  const runStatus = async (fn: () => Promise<GoodsReceipt>, msg: string) => {
    // markSaved ด้วยเสมอ — การกดตรวจรับ/รับวางบิลเปลี่ยนเอกสารฝั่งเซิร์ฟเวอร์ ถ้าไม่รีเซ็ตฐาน
    // ตัวจับการแก้ไขจะค้างว่า "ยังไม่บันทึก" แล้วเด้งกล่องเตือนตอนออกจากหน้า ทั้งที่ไม่มีอะไรค้าง
    try { const d = await fn(); setDoc(d); setDraft(d); dirty.markSaved(toUpdateFields(d)); showToast(msg); }
    catch (err) { showToast(err instanceof ApiError ? err.message : t("goodsReceiptDoc.errorSave")); }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto print:hidden">
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-card sticky top-0 z-10">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={15} /> {t("goodsReceiptDoc.backToList")}
          </button>
          <span className="text-sm font-mono font-semibold text-[#c9a84c] ml-2">{draft.documentNumber || draft.id}</span>
          <div className="ml-auto flex items-center gap-2">
            {editable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
            {canComplete && draft.status === "Draft" && (
              <button onClick={() => void runStatus(() => completeGoodsReceipt(draft.id), t("goodsReceiptDoc.completedToast"))}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-[#2aa36b]/40 rounded-lg text-[#207e52] hover:bg-[#2aa36b]/10 transition-all">
                <CheckCircle2 size={13} /> {t("goodsReceiptDoc.complete")}
              </button>
            )}
            {canComplete && draft.status === "Received" && (
              <button onClick={() => void runStatus(() => reopenGoodsReceipt(draft.id), t("goodsReceiptDoc.reopenedToast"))}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all">
                <Undo2 size={13} /> {t("goodsReceiptDoc.reopen")}
              </button>
            )}
            {editable && (
              <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("goodsReceiptDoc.saveDraft")}
              </button>
            )}
            {canPrint && (
              <button onClick={() => { void logGoodsReceiptPrinted(draft.id).catch(() => {}); setShowPrint(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all">
                <Printer size={13} /> {t("goodsReceiptDoc.print")}
              </button>
            )}
            {canDelete && draft.status === "Draft" && (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-[#e05252] hover:bg-[#e05252]/10 transition-all">
                <Trash2 size={13} /> {t("goodsReceiptDoc.delete")}
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 max-w-5xl">
          {draftBackup.recovered && draftBackup.recoveredAt !== null && (
            <DraftRecoveryBanner savedAt={draftBackup.recoveredAt}
              onRestore={() => { const r = draftBackup.recovered!; setDraft((p) => (p ? { ...p, ...r } : p)); draftBackup.clear(); showToast(t("common.draftRecovery.restoredToast")); }}
              onDiscard={draftBackup.dismiss} />
          )}

          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("goodsReceiptDoc.sectionHeader")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <L label={t("goodsReceiptDoc.documentNumber")}><input className={inputCls} disabled={!editable} value={draft.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} /></L>
              <L label={t("goodsReceiptDoc.purchaseOrder")}><input className={inputCls} disabled value={draft.purchaseOrderId} /></L>
              <L label={t("goodsReceiptDoc.receivedDate")}><input type="date" className={inputCls} disabled={!editable} value={draft.receivedDate} onChange={(e) => set("receivedDate", e.target.value)} /></L>
              <L label={t("goodsReceiptDoc.vendorName")}><input className={inputCls} disabled={!editable} value={draft.vendorName} onChange={(e) => set("vendorName", e.target.value)} /></L>
              <L label={t("goodsReceiptDoc.deliveryNoteRef")}><input className={inputCls} disabled={!editable} value={draft.deliveryNoteRef} onChange={(e) => set("deliveryNoteRef", e.target.value)} /></L>
              <L label={t("goodsReceiptDoc.receivedLocation")}><input className={inputCls} disabled={!editable} value={draft.receivedLocation} onChange={(e) => set("receivedLocation", e.target.value)} /></L>
            </div>
            {!isFullyReceived(draft.lines) && draft.lines.length > 0 && (
              <p className="text-xs text-[#a75d1a]">{t("goodsReceiptDoc.partialWarning")}</p>
            )}
          </section>

          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <h2 className="text-base font-semibold text-foreground px-5 py-4" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("goodsReceiptDoc.sectionLines")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-y border-border bg-muted/40">
                    {["#", t("goodsReceiptDoc.col.code"), t("goodsReceiptDoc.col.description"), t("goodsReceiptDoc.col.unit"),
                      t("goodsReceiptDoc.col.qtyOrdered"), t("goodsReceiptDoc.col.qtyReceived"), t("goodsReceiptDoc.col.result"), t("goodsReceiptDoc.col.remark")].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">{t("goodsReceiptDoc.noLines")}</td></tr>
                  ) : draft.lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-border/50">
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{l.productCode || "—"}</td>
                      <td className="px-3 py-2 text-sm text-foreground">{l.description}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{l.unit}</td>
                      <td className="px-3 py-2 text-right text-xs font-mono text-muted-foreground">{l.qtyOrdered ?? "—"}</td>
                      <td className="px-1 py-1 w-24">
                        <input type="number" className={`${cellCls} text-right font-mono`} disabled={!editable} value={l.qtyReceived ?? ""}
                          onChange={(e) => setLine(l.id, { qtyReceived: e.target.value === "" ? null : Number(e.target.value) })} />
                      </td>
                      <td className="px-1 py-1 w-32">
                        <select className={`${cellCls} ${resultStyle[l.result]}`} disabled={!editable} value={l.result}
                          onChange={(e) => setLine(l.id, { result: e.target.value as GoodsReceiptLineResult })}>
                          <option value="Pending">{t("goodsReceiptDoc.result.pending")}</option>
                          <option value="Passed">{t("goodsReceiptDoc.result.passed")}</option>
                          <option value="Rejected">{t("goodsReceiptDoc.result.rejected")}</option>
                        </select>
                      </td>
                      <td className="px-1 py-1"><input className={cellCls} disabled={!editable} value={l.remark} onChange={(e) => setLine(l.id, { remark: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-card border border-border rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <L label={t("goodsReceiptDoc.receivedBy")}><input className={inputCls} disabled={!editable} value={draft.receivedBy} onChange={(e) => set("receivedBy", e.target.value)} /></L>
            <L label={t("goodsReceiptDoc.inspectedBy")}><input className={inputCls} disabled={!editable} value={draft.inspectedBy} onChange={(e) => set("inspectedBy", e.target.value)} /></L>
            <div className="sm:col-span-2"><L label={t("goodsReceiptDoc.remarks")}><textarea rows={2} className={inputCls} disabled={!editable} value={draft.remarks} onChange={(e) => set("remarks", e.target.value)} /></L></div>
          </section>
        </div>
      </div>

      {showPrint && <GoodsReceiptPrintDocument doc={draft} />}

      <ConfirmDialog open={confirmDelete} title={t("goodsReceiptDoc.confirmDelete.title")} message={t("goodsReceiptDoc.confirmDelete.message")}
        confirmLabel={t("goodsReceiptDoc.delete")} danger onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try { await deleteGoodsReceipt(draft.id); setConfirmDelete(false); onDeleted(); }
          catch (err) { showToast(err instanceof ApiError ? err.message : t("goodsReceiptDoc.errorSave")); }
        }} />
    </>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>{children}</label>;
}
