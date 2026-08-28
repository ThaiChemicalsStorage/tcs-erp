import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Printer, Save, Trash2, X, GitBranch, Loader2 } from "lucide-react";
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
import {
  type PurchaseOrder, type PurchaseOrderUpdateFields, blankPurchaseOrderLine, purchaseOrderSubtotal,
  fetchPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, rewritePurchaseOrder, logPurchaseOrderPrinted,
  submitPurchaseOrderApproval, approvePurchaseOrder, rejectPurchaseOrder, withdrawPurchaseOrderApproval,
} from "../../lib/purchaseOrder";
import { PurchaseOrderPrintDocument } from "./PurchaseOrderPrintDocument";

const inputCls = "w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const cellCls = "px-2 py-1.5 text-sm bg-transparent border border-transparent rounded focus:bg-secondary focus:border-[#c9a84c]/50 outline-none w-full transition-colors disabled:opacity-60";

/** payload เดียวที่ใช้ทั้งกดบันทึกเอง บันทึกอัตโนมัติ ตรวจงานค้าง และเก็บร่างในเครื่อง */
function toUpdateFields(d: PurchaseOrder): PurchaseOrderUpdateFields {
  return {
    documentNumber: d.documentNumber,
    jobCode: d.jobCode,
    vendorName: d.vendorName,
    vendorContact: d.vendorContact,
    vendorPhone: d.vendorPhone,
    vendorTaxId: d.vendorTaxId,
    vendorAddress: d.vendorAddress,
    vendorQuotationRef: d.vendorQuotationRef,
    orderDate: d.orderDate,
    neededByDate: d.neededByDate,
    creditDays: d.creditDays,
    shippingMethod: d.shippingMethod,
    deliveryLocation: d.deliveryLocation,
    lines: d.lines,
    vatRate: d.vatRate,
    remarks: d.remarks,
    orderedBy: d.orderedBy,
    approvedBy: d.approvedBy,
    revisionNote: d.revisionNote,
  };
}

export function PurchaseOrderDocument({
  purchaseOrderId, canEdit, canApprove, canPrint, canDelete, onBack, onDeleted, onOpenOther, showToast,
}: {
  purchaseOrderId: string;
  canEdit: boolean;
  canApprove: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onBack: () => void;
  onDeleted: () => void;
  onOpenOther: (id: string) => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<PurchaseOrder | null>(null);
  const [draft, setDraft] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);

  // hooks ทุกตัวต้องประกาศเหนือ early return — กฎของ React
  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  // ไม่ต้อง setLoading(true) ตรงนี้ — `loading` เริ่มเป็น true อยู่แล้ว และหน้านี้ถูก remount ด้วย
  // `key={selectedId}` ทุกครั้งที่เปลี่ยนเอกสาร การเรียก setState ตรง ๆ ใน effect จะทำให้ render ซ้อน
  useEffect(() => {
    let cancelled = false;
    fetchPurchaseOrder(purchaseOrderId)
      .then((d) => {
        if (cancelled) return;
        setDoc(d); setDraft(d); setLoading(false);
        dirty.markSaved(toUpdateFields(d));
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [purchaseOrderId, dirty]);

  const editable = !!draft && canEdit && draft.status === "Draft";
  // เลขที่เป็นฟิลด์บังคับ — ระหว่างที่ผู้ใช้ลบทิ้งเพื่อพิมพ์ใหม่ บันทึกอัตโนมัติจะยิงพอดีแล้วโดน 400
  // เติมกลับเป็น id เสมอ (แบบเดียวกับใบสั่งผลิต) ผู้ใช้ยังพิมพ์ต่อได้โดยไม่เห็นสถานะแดงกะพริบ
  const autoSavePayload: PurchaseOrderUpdateFields | null = draft && editable
    ? { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }
    : null;

  const draftBackup = useDraftBackup({
    storageKey: draft ? `purchaseOrder:${draft.id}` : null,
    data: autoSavePayload,
    enabled: editable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: editable,
    onSave: async (fields) => {
      if (!draft) return;
      // อัปเดตแค่ `doc` ไม่แตะ `draft` เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      setDoc(await updatePurchaseOrder(draft.id, fields, { autoSave: true }));
    },
  });

  /** คืน true เมื่อบันทึกสำเร็จ — กล่อง "ยังไม่ได้บันทึก" ใช้ค่านี้ตัดสินว่าจะออกจากหน้าได้ไหม
   *  ถ้าบันทึกไม่ผ่าน ต้องค้างอยู่หน้าเดิมให้ผู้ใช้แก้ ไม่ใช่ออกไปแล้วงานหาย */
  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updatePurchaseOrder(draft.id, { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id });
      setDoc(updated); setDraft(updated);
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("purchaseOrderDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
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
        <span className="sr-only">{t("purchaseOrder.loading")}</span>
        <div className="h-8 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }
  if (loadError || !draft || !doc) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("purchaseOrder.loadError")}</p>
        <button onClick={onBack} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">{t("purchaseOrderDoc.backToList")}</button>
      </div>
    );
  }

  const set = <K extends keyof PurchaseOrder>(key: K, value: PurchaseOrder[K]) => setDraft((p) => (p ? { ...p, [key]: value } : p));
  const setLine = (id: string, patch: Partial<PurchaseOrder["lines"][number]>) =>
    setDraft((p) => (p ? { ...p, lines: p.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : p));

  const subtotal = purchaseOrderSubtotal(draft.lines);
  const vat = draft.vatRate !== null ? (subtotal * draft.vatRate) / 100 : 0;

  return (
    <>
      <div className="flex-1 overflow-y-auto print:hidden">
        {/* แถบเครื่องมือ */}
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-card sticky top-0 z-10">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={15} /> {t("purchaseOrderDoc.backToList")}
          </button>
          <span className="text-sm font-mono font-semibold text-[#c9a84c] ml-2">{draft.documentNumber || draft.id}</span>

          <div className="ml-auto flex items-center gap-2">
            {editable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}

            <DocumentApprovalActions
              status={draft.status}
              canEdit={canEdit}
              canApprove={canApprove}
              onSubmit={() => submitPurchaseOrderApproval(draft.id)}
              onApprove={() => approvePurchaseOrder(draft.id)}
              onReject={(comment) => rejectPurchaseOrder(draft.id, comment)}
              onWithdraw={() => withdrawPurchaseOrderApproval(draft.id)}
              // ต้อง markSaved ด้วย ไม่งั้นการอนุมัติ (ซึ่งเปลี่ยนเอกสารฝั่งเซิร์ฟเวอร์) จะทำให้ตัวจับ
              // การแก้ไขค้างว่า "ยังไม่บันทึก" แล้วเด้งกล่องเตือนตอนออกจากหน้า ทั้งที่ไม่มีอะไรค้าง
              onUpdated={(d) => { setDoc(d); setDraft(d); dirty.markSaved(toUpdateFields(d)); }}
              showToast={showToast}
            />

            {editable && (
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("purchaseOrderDoc.saveDraft")}
              </button>
            )}
            {draft.status === "Final" && canEdit && (
              <button onClick={() => setConfirmRewrite(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                <GitBranch size={13} /> {t("purchaseOrderDoc.rewrite")}
              </button>
            )}
            {canPrint && (
              <button onClick={() => { void logPurchaseOrderPrinted(draft.id).catch(() => {}); setShowPrint(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                <Printer size={13} /> {t("purchaseOrderDoc.print")}
              </button>
            )}
            {canDelete && draft.status !== "Final" && (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-[#e05252] hover:bg-[#e05252]/10 transition-all">
                <Trash2 size={13} /> {t("purchaseOrderDoc.delete")}
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 max-w-5xl">
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

          {/* หัวเอกสาร */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseOrderDoc.sectionHeader")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("purchaseOrderDoc.documentNumber")}>
                <input className={inputCls} disabled={!editable} value={draft.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.orderDate")}>
                <input type="date" className={inputCls} disabled={!editable} value={draft.orderDate} onChange={(e) => set("orderDate", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.neededByDate")}>
                <input type="date" className={inputCls} disabled={!editable} value={draft.neededByDate} onChange={(e) => set("neededByDate", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.jobCode")}>
                <input className={inputCls} disabled={!editable} value={draft.jobCode} onChange={(e) => set("jobCode", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.purchaseRequest")}>
                {/* อ้างอิงต้นทาง — อ่านอย่างเดียวเสมอ เปลี่ยนที่มาของเอกสารทีหลังไม่ได้ */}
                <input className={inputCls} disabled value={draft.purchaseRequestId || "—"} />
              </Field>
              <Field label={t("purchaseOrderDoc.creditDays")}>
                <input type="number" className={inputCls} disabled={!editable} value={draft.creditDays ?? ""}
                  onChange={(e) => set("creditDays", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
            </div>
          </section>

          {/* ผู้ขาย */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseOrderDoc.sectionVendor")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("purchaseOrderDoc.vendorName")}>
                <input className={inputCls} disabled={!editable} value={draft.vendorName} onChange={(e) => set("vendorName", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.vendorContact")}>
                <input className={inputCls} disabled={!editable} value={draft.vendorContact} onChange={(e) => set("vendorContact", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.vendorPhone")}>
                <input className={inputCls} disabled={!editable} value={draft.vendorPhone} onChange={(e) => set("vendorPhone", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.vendorTaxId")}>
                <input className={inputCls} disabled={!editable} value={draft.vendorTaxId} onChange={(e) => set("vendorTaxId", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.vendorQuotationRef")}>
                <input className={inputCls} disabled={!editable} value={draft.vendorQuotationRef} onChange={(e) => set("vendorQuotationRef", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.shippingMethod")}>
                <input className={inputCls} disabled={!editable} value={draft.shippingMethod} onChange={(e) => set("shippingMethod", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("purchaseOrderDoc.vendorAddress")}>
                  <textarea rows={2} className={inputCls} disabled={!editable} value={draft.vendorAddress} onChange={(e) => set("vendorAddress", e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label={t("purchaseOrderDoc.deliveryLocation")}>
                  <input className={inputCls} disabled={!editable} value={draft.deliveryLocation} onChange={(e) => set("deliveryLocation", e.target.value)} />
                </Field>
              </div>
            </div>
          </section>

          {/* รายการ */}
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseOrderDoc.sectionLines")}</h2>
              {editable && (
                <button onClick={() => set("lines", [...draft.lines, blankPurchaseOrderLine(newId("poline"))])}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("purchaseOrderDoc.addLine")}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-y border-border bg-muted/40">
                    {["#", t("purchaseOrderDoc.col.code"), t("purchaseOrderDoc.col.description"), t("purchaseOrderDoc.col.unit"),
                      t("purchaseOrderDoc.col.qty"), t("purchaseOrderDoc.col.unitPrice"), t("purchaseOrderDoc.col.amount"), ""].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.length === 0 ? (
                    <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-muted-foreground">{t("purchaseOrderDoc.noLines")}</td></tr>
                  ) : draft.lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-border/50">
                      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-1 py-1"><input className={cellCls} disabled={!editable} value={l.productCode} onChange={(e) => setLine(l.id, { productCode: e.target.value })} /></td>
                      <td className="px-1 py-1"><input className={cellCls} disabled={!editable} value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} /></td>
                      <td className="px-1 py-1 w-24"><input className={cellCls} disabled={!editable} value={l.unit} onChange={(e) => setLine(l.id, { unit: e.target.value })} /></td>
                      <td className="px-1 py-1 w-24"><input type="number" className={`${cellCls} text-right font-mono`} disabled={!editable} value={l.qty ?? ""} onChange={(e) => setLine(l.id, { qty: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                      <td className="px-1 py-1 w-28"><input type="number" className={`${cellCls} text-right font-mono`} disabled={!editable} value={l.unitPrice ?? ""} onChange={(e) => setLine(l.id, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                      <td className="px-3 py-2 text-right text-xs font-mono text-foreground whitespace-nowrap">{fmt((l.qty ?? 0) * (l.unitPrice ?? 0))}</td>
                      <td className="px-2 py-1 w-8">
                        {editable && (
                          <button onClick={() => set("lines", draft.lines.filter((x) => x.id !== l.id))}
                            aria-label={t("purchaseOrderDoc.removeLine")}
                            className="opacity-50 hover:opacity-100 focus-visible:opacity-100 text-[#e05252] transition-opacity">
                            <X size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-end gap-1 px-5 py-4 border-t border-border">
              <Total label={t("purchaseOrderDoc.subtotal")} value={fmt(subtotal)} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("purchaseOrderDoc.vatRate")}</span>
                <input type="number" className="w-20 px-2 py-1 text-xs text-right font-mono bg-secondary border border-border rounded outline-none focus:border-[#c9a84c]/50 disabled:opacity-60"
                  disabled={!editable} value={draft.vatRate ?? ""} onChange={(e) => set("vatRate", e.target.value === "" ? null : Number(e.target.value))} />
                <span className="text-xs font-mono text-muted-foreground w-28 text-right">{fmt(vat)}</span>
              </div>
              <Total label={t("purchaseOrderDoc.grandTotal")} value={fmt(subtotal + vat)} strong />
            </div>
          </section>

          {/* หมายเหตุ + ลงนาม */}
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("purchaseOrderDoc.orderedBy")}>
                <input className={inputCls} disabled={!editable} value={draft.orderedBy} onChange={(e) => set("orderedBy", e.target.value)} />
              </Field>
              <Field label={t("purchaseOrderDoc.approvedBy")}>
                {/* ระบบเติมชื่อให้ตอนกดอนุมัติถ้ายังว่าง แต่ไม่ทับค่าที่พิมพ์เอง */}
                <input className={inputCls} disabled={!editable} value={draft.approvedBy ?? ""} onChange={(e) => set("approvedBy", e.target.value)} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t("purchaseOrderDoc.remarks")}>
                  <textarea rows={2} className={inputCls} disabled={!editable} value={draft.remarks} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label={t("purchaseOrderDoc.revisionNote")} hint={t("purchaseOrderDoc.revisionNoteHint")}>
                  <textarea rows={2} className={inputCls} disabled={!editable} value={draft.revisionNote} onChange={(e) => set("revisionNote", e.target.value)} />
                </Field>
              </div>
            </div>
          </section>
        </div>
      </div>

      {showPrint && <PurchaseOrderPrintDocument doc={draft} />}

      <ConfirmDialog
        open={confirmDelete}
        title={t("purchaseOrderDoc.confirmDelete.title")}
        message={t("purchaseOrderDoc.confirmDelete.message")}
        confirmLabel={t("purchaseOrderDoc.delete")}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deletePurchaseOrder(draft.id);
            setConfirmDelete(false);
            onDeleted();
          } catch (err) {
            showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
          }
        }}
      />
      <ConfirmDialog
        open={confirmRewrite}
        title={t("purchaseOrderDoc.confirmRewrite.title")}
        message={t("purchaseOrderDoc.confirmRewrite.message")}
        confirmLabel={t("purchaseOrderDoc.rewrite")}
        onCancel={() => setConfirmRewrite(false)}
        onConfirm={async () => {
          try {
            const next = await rewritePurchaseOrder(draft.id);
            setConfirmRewrite(false);
            onOpenOther(next.id);
            showToast(t("purchaseOrderDoc.rewritten"));
          } catch (err) {
            showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
          }
        }}
      />
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground mt-1">{hint}</span>}
    </label>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <span className={`w-28 text-right font-mono ${strong ? "text-sm font-semibold text-foreground" : "text-xs text-muted-foreground"}`}>{value}</span>
    </div>
  );
}
