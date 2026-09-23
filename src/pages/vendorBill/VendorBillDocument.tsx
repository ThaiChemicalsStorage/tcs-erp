import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { fmt, formatQuoteDateThai } from "../../lib/quotes";
import type { CompanyHeaderInfo } from "../../lib/storage";
import {
  type VendorBill, type VendorBillRow, type VendorBillCandidate, type VendorBillUpdateFields, type VendorBillBundle,
  fetchVendorBill, updateVendorBill, deleteVendorBill, fetchVendorBillCandidates, logVendorBillPrinted, vendorBillTotals,
} from "../../lib/vendorBill";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { VendorBillPrintDocument } from "./VendorBillPrintDocument";

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70";
const thCls = "px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";

function toUpdateFields(d: VendorBill): VendorBillUpdateFields {
  return { billDate: d.billDate, creditDays: d.creditDays, paymentDate: d.paymentDate, remarks: d.remarks, apEntryIds: d.apEntryIds };
}

/**
 * หน้าใบรับวางบิลของสโตร์ (2026-09-23) — ไม่มีขั้นอนุมัติ แก้ได้ตลอด บันทึกอัตโนมัติ
 * หัวใบ (วันที่รับวางบิล · เครดิต · วันที่จ่ายชำระ · หมายเหตุ) + ใบรับสินค้าของผู้ขายรายนี้ที่อยู่ในใบ
 * ยอด/จ่ายแล้ว/คงค้าง มาจากทะเบียนเจ้าหนี้ทุกครั้งที่เปิด (ดู `src/lib/vendorBill.ts`)
 */
export function VendorBillDocument({ vendorBillId, canEdit, canPrint, canDelete, companyHeader, onBack, showToast }: {
  vendorBillId: string;
  canEdit: boolean;
  canPrint: boolean;
  canDelete: boolean;
  companyHeader: CompanyHeaderInfo;
  onBack: () => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<VendorBill | null>(null);
  const [draft, setDraft] = useState<VendorBill | null>(null);
  const [rows, setRows] = useState<VendorBillRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<VendorBillCandidate[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  const applyBundle = (b: VendorBillBundle) => {
    setDoc(b.vendorBill);
    setDraft(b.vendorBill);
    setRows(b.rows);
    dirty.markSaved(toUpdateFields(b.vendorBill));
  };

  useEffect(() => {
    let cancelled = false;
    fetchVendorBill(vendorBillId)
      .then((b) => { if (!cancelled) { setDoc(b.vendorBill); setDraft(b.vendorBill); setRows(b.rows); } })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof ApiError ? err.message : t("vendorBill.loadError")); });
    return () => { cancelled = true; };
  }, [vendorBillId, t]);

  const editable = !!draft && canEdit;
  const autoSavePayload = draft && editable ? toUpdateFields(draft) : null;
  const draftBackup = useDraftBackup({ storageKey: draft ? `vendorBill:${draft.id}` : null, data: autoSavePayload, enabled: editable });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: editable,
    onSave: async (fields) => {
      if (!draft) return;
      const b = await updateVendorBill(draft.id, fields, { autoSave: true });
      setDoc(b.vendorBill);
      setRows(b.rows);
    },
  });

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const b = await updateVendorBill(draft.id, toUpdateFields(draft));
      applyBundle(b);
      autoSave.markSaved(toUpdateFields(b.vendorBill));
      draftBackup.clear();
      showToast(t("vendorBill.savedToast"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("vendorBill.errorSave"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const { requestLeave } = useUnsavedChangesGuard(
    draft && canEdit
      ? {
        getRisk: () => assessUnsavedRisk({ isDirty: dirty.isDirtyNow(), hasServerRecord: true, autoSaveEnabled: editable, autoSaveState: autoSave.state }),
        documentLabel: draft.documentNumber,
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
        <button onClick={onBack} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">{t("vendorBill.backToList")}</button>
      </div>
    );
  }
  if (!doc || !draft) {
    return (
      <div className="flex-1 p-6" role="status" aria-live="polite">
        <span className="sr-only">{t("vendorBill.loading")}</span>
        <div className="h-8 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  const set = (patch: Partial<VendorBill>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  // แถวที่แสดง = ตามลำดับใน draft (แถวใหม่ที่เพิ่งเลือกมีข้อมูลจากตัวเลือก ก่อนบันทึกอัตโนมัติจะเติมให้)
  const rowById = new Map(rows.map((r) => [r.apEntryId, r]));
  const shownRows = draft.apEntryIds.map((id) => rowById.get(id)).filter((r): r is VendorBillRow => !!r);
  const totals = vendorBillTotals(shownRows);

  const removeRow = (apEntryId: string) => set({ apEntryIds: draft.apEntryIds.filter((id) => id !== apEntryId) });

  const openAdd = async () => {
    setAdding(true);
    setPicked(new Set());
    setCandidates(null);
    try {
      const list = await fetchVendorBillCandidates(draft.vendorName);
      setCandidates(list.filter((c) => !draft.apEntryIds.includes(c.apEntryId)));
    } catch (err) {
      setAdding(false);
      showToast(err instanceof ApiError ? err.message : t("vendorBill.loadError"));
    }
  };
  const confirmAdd = () => {
    const chosen = (candidates ?? []).filter((c) => picked.has(c.apEntryId));
    setRows((prev) => [...prev.filter((r) => !picked.has(r.apEntryId)), ...chosen]);
    set({ apEntryIds: [...draft.apEntryIds, ...chosen.map((c) => c.apEntryId)] });
    setAdding(false);
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      if (editable && dirty.isDirtyNow() && !(await save())) return;
      await logVendorBillPrinted(draft.id);
      setShowPrint(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("vendorBill.errorPrint"));
    } finally {
      setPrinting(false);
    }
  };

  const runDelete = async () => {
    setDeleting(true);
    try {
      await deleteVendorBill(draft.id);
      draftBackup.clear();
      showToast(t("vendorBill.deletedToast"));
      onBack();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("vendorBill.errorSave"));
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto print:hidden">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
          <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {t("vendorBill.backToList")}
          </button>
          <ChevronRight size={13} className="text-muted-foreground" />
          <span className="text-sm text-[#866d28] font-mono font-semibold">{draft.documentNumber}</span>
          <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
            {editable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
            {canPrint && (
              <button onClick={() => void handlePrint()} disabled={printing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
                {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("vendorBill.print")}
              </button>
            )}
            {editable && (
              <button onClick={() => void save()} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("vendorBill.save")}
              </button>
            )}
            {canDelete && (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
                <Trash2 size={13} /> {t("vendorBill.delete")}
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
                setDraft((prev) => (prev ? { ...prev, ...recovered, apEntryIds: recovered.apEntryIds ?? prev.apEntryIds } : prev));
                draftBackup.clear();
                showToast(t("common.draftRecovery.restoredToast"));
              }}
              onDiscard={draftBackup.dismiss}
            />
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
              <h1 className="text-[#c9a84c] text-xl font-bold">{t("vendorBill.title")}</h1>
              <p className="text-[#a8bed8] text-xs mt-1">{t("vendorBill.subtitle")}</p>
            </div>
            <div className="p-4 sm:p-7 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{t("vendorBill.field.vendor")}</p>
                <p className="text-sm font-semibold text-foreground">{draft.vendorName}{draft.vendorCode && <span className="ml-2 font-mono text-xs text-[#866d28]">{draft.vendorCode}</span>}</p>
                {draft.vendorAddress && <p className="text-xs text-muted-foreground whitespace-pre-line">{draft.vendorAddress}</p>}
                {draft.vendorTaxId && <p className="text-xs text-muted-foreground font-mono">{t("vendorBill.field.taxId")} {draft.vendorTaxId}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="vb-billDate" className="text-xs text-muted-foreground block mb-1">{t("vendorBill.field.billDate")}</label>
                  <input id="vb-billDate" type="date" disabled={!editable} value={draft.billDate} onChange={(e) => set({ billDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="vb-credit" className="text-xs text-muted-foreground block mb-1">{t("vendorBill.field.creditDays")}</label>
                  <input id="vb-credit" type="number" min={0} disabled={!editable} value={draft.creditDays ?? ""}
                    onChange={(e) => set({ creditDays: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label htmlFor="vb-payDate" className="text-xs text-muted-foreground block mb-1">{t("vendorBill.field.paymentDate")}</label>
                  <input id="vb-payDate" type="date" disabled={!editable} value={draft.paymentDate} onChange={(e) => set({ paymentDate: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="md:col-span-2">
                <label htmlFor="vb-remarks" className="text-xs text-muted-foreground block mb-1">{t("vendorBill.field.remarks")}</label>
                <textarea id="vb-remarks" rows={2} disabled={!editable} value={draft.remarks} onChange={(e) => set({ remarks: e.target.value })} className={inputCls} />
              </div>
            </div>
          </div>

          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("vendorBill.rowsTitle")}</h2>
              {editable && (
                <button onClick={() => void openAdd()}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                  <Plus size={13} /> {t("vendorBill.addRows")}
                </button>
              )}
            </div>
            {shownRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("vendorBill.rowsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {["No.", t("vendorBill.col.receivingReport"), t("vendorBill.col.invoice"), t("vendorBill.col.date"), t("vendorBill.col.dueDate"),
                        t("vendorBill.col.amount"), t("vendorBill.col.paid"), t("vendorBill.col.outstanding"), ""].map((h, i) => (
                        <th key={i} className={thCls}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shownRows.map((r, i) => (
                      <tr key={r.apEntryId} className="border-b border-border/50">
                        <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{i + 1}</td>
                        <td className="px-3 py-2.5 text-xs font-mono font-semibold text-foreground whitespace-nowrap">{r.missing ? <span className="text-[#e05252]">{t("vendorBill.rowMissing")}</span> : r.receivingReportNumber}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.invoiceNumber || "—"}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.invoiceDate ? formatQuoteDateThai(r.invoiceDate) : "—"}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.dueDate ? formatQuoteDateThai(r.dueDate) : "—"}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-foreground text-right whitespace-nowrap">{fmt(r.amount)}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-[#207e52] text-right whitespace-nowrap">{r.paid > 0 ? fmt(r.paid) : ""}</td>
                        <td className={`px-3 py-2.5 text-xs font-mono text-right whitespace-nowrap ${r.outstanding > 0 ? "text-[#a75d1a] font-semibold" : "text-muted-foreground"}`}>{fmt(r.outstanding)}</td>
                        <td className="px-3 py-2.5 text-right">
                          {editable && (
                            <button onClick={() => removeRow(r.apEntryId)} aria-label={t("vendorBill.removeRow")} title={t("vendorBill.removeRow")}
                              className="p-1 rounded text-muted-foreground hover:text-[#e05252] hover:bg-[#e05252]/10 transition-colors">
                              <X size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30">
                      <td colSpan={5} className="px-3 py-3 text-xs font-semibold text-foreground text-right">{t("vendorBill.total")}</td>
                      <td className="px-3 py-3 text-sm font-mono font-semibold text-foreground text-right whitespace-nowrap">{fmt(totals.amount)}</td>
                      <td className="px-3 py-3 text-xs font-mono text-[#207e52] text-right whitespace-nowrap">{totals.paid > 0 ? fmt(totals.paid) : ""}</td>
                      <td className="px-3 py-3 text-sm font-mono font-semibold text-[#c9a84c] text-right whitespace-nowrap">{fmt(totals.outstanding)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
          <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={() => setAdding(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label={t("vendorBill.addRows")} className="relative w-full max-w-2xl bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <h2 className="flex-1 text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("vendorBill.addRows")}</h2>
              <button onClick={() => setAdding(false)} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {candidates === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> {t("vendorBill.loading")}</div>
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("vendorBill.addNone")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {candidates.map((c) => (
                    <li key={c.apEntryId}>
                      <label className="flex items-center gap-3 px-3 py-2.5 border border-border rounded-lg cursor-pointer hover:bg-secondary/40">
                        <input type="checkbox" checked={picked.has(c.apEntryId)}
                          onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(c.apEntryId); else next.delete(c.apEntryId); return next; })} />
                        <span className="text-xs font-mono font-semibold text-foreground w-40">{c.receivingReportNumber}</span>
                        <span className="text-xs font-mono text-muted-foreground flex-1">{c.invoiceNumber} · {c.invoiceDate ? formatQuoteDateThai(c.invoiceDate) : "—"}</span>
                        <span className="text-xs font-mono text-foreground">{fmt(c.amount)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
              <button onClick={() => setAdding(false)} className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground">{t("common.cancel")}</button>
              <button onClick={confirmAdd} disabled={picked.size === 0}
                className="px-4 py-2 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-50">
                {t("vendorBill.addSelected").replace("{n}", String(picked.size))}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("vendorBill.deleteTitle")}
        message={t("vendorBill.deleteDescription")}
        confirmLabel={t("vendorBill.delete")}
        cancelLabel={t("common.cancel")}
        danger
        busy={deleting}
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      <VendorBillPrintDocument doc={draft} rows={shownRows} companyHeader={companyHeader} />
    </>
  );
}
