import { useEffect, useState } from "react";
import { Building2, Loader2, Plus, Printer, Save, Trash2, X } from "lucide-react";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
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
import { DocumentHeader, DocumentColumns, NextStepHint } from "../../components/ui/DocumentLayout";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { btn, field, surface } from "../../components/ui/styles";
import { CheckDot, CodeChip, RailSummaryCard, SuffixInput, SummaryLine } from "../receivingReport/receivingUi";
import { pickRowClass } from "../receivingReport/receivingFormat";
import { WidePickerShell } from "../receivingReport/ReceivingReportCreateDialog";


function toUpdateFields(d: VendorBill): VendorBillUpdateFields {
  return { billDate: d.billDate, creditDays: d.creditDays, paymentDate: d.paymentDate, remarks: d.remarks, apEntryIds: d.apEntryIds };
}

/**
 * หน้าใบรับวางบิลของสโตร์ (2026-09-23) — ไม่มีขั้นอนุมัติ แก้ได้ตลอด บันทึกอัตโนมัติ
 * หัวใบ (วันที่รับวางบิล · เครดิต · วันที่จ่ายชำระ · หมายเหตุ) + ใบรับสินค้าของผู้ขายรายนี้ที่อยู่ในใบ
 * ยอด/จ่ายแล้ว/คงค้าง มาจากทะเบียนเจ้าหนี้ทุกครั้งที่เปิด (ดู `src/lib/vendorBill.ts`)
 */
export function VendorBillDocument({ vendorBillId, currentUserId, canEdit, canPrint, canDelete, companyHeader, onBack, showToast }: {
  vendorBillId: string;
  currentUserId: string;
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

  // ปุ่มพิมพ์/เมนูลบมีเฉพาะผู้มีสิทธิ์ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  const docTourSteps: TourStep[] = [
    { element: '[data-tour="vbdoc-print"]', manual: "ch14-4", popover: { title: t("tour.vbdoc.print.title"), description: t("tour.vbdoc.print.desc"), side: "bottom" } },
    { element: '[data-tour="vbdoc-more"]', manual: "ch14-5", popover: { title: t("tour.vbdoc.more.title"), description: t("tour.vbdoc.more.desc"), side: "bottom" } },
    { element: '[data-tour="vbdoc-info"]', manual: "ch14-4", popover: { title: t("tour.vbdoc.info.title"), description: t("tour.vbdoc.info.desc"), side: "bottom" } },
    { element: '[data-tour="vbdoc-outstanding"]', manual: "ch14-6", popover: { title: t("tour.vbdoc.outstanding.title"), description: t("tour.vbdoc.outstanding.desc"), side: "left" } },
    { element: '[data-tour="vbdoc-rows"]', manual: "ch14-5", popover: { title: t("tour.vbdoc.rows.title"), description: t("tour.vbdoc.rows.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("vendorBillDoc", currentUserId, docTourSteps, { autoStart: !!doc });

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
        <button type="button" onClick={onBack} className={btn.secondary}>{t("vendorBill.backToList")}</button>
      </div>
    );
  }
  if (!doc || !draft) {
    return (
      <div className="flex-1 px-4 md:px-8 py-6 flex flex-col gap-5" role="status" aria-live="polite">
        <span className="sr-only">{t("vendorBill.loading")}</span>
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
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


  const grid = "grid grid-cols-[36px_170px_150px_120px_120px_minmax(0,1fr)_120px_132px_40px] gap-3 items-center px-6";
  const toggle = (id: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <>
      <div className="doc-form flex-1 overflow-y-auto print:hidden">
        <div className="sticky top-0 z-20">
          <DocumentHeader
            backLabel={t("vendorBill.backToAll")}
            onBack={() => requestLeave(onBack)}
            number={draft.documentNumber}
            meta={editable ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} /> : undefined}
            actions={
              <>
                <TourReplayButton variant="title" onClick={docTour.start} />
                {/* ปุ่มบันทึกคงไว้ตามที่เจ้าของสั่ง (2026-09-30) แม้มีบันทึกอัตโนมัติ */}
                {editable && (
                  <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("vendorBill.save")}
                  </button>
                )}
                {canDelete && <div data-tour="vbdoc-more"><MoreMenu
                  items={[
                    canDelete && { key: "delete", label: t("vendorBill.deleteMenu"), icon: Trash2, danger: true, hint: t("vendorBill.deleteMenuHint"), onSelect: () => setConfirmDelete(true) },
                  ]}
                /></div>}
                {canPrint && (
                  <button type="button" data-tour="vbdoc-print" onClick={() => void handlePrint()} disabled={printing} className={btn.primary}>
                    {printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />} {t("vendorBill.print")}
                  </button>
                )}
              </>
            }
          />
        </div>

        <div className="px-4 md:px-8 py-6 flex flex-col gap-5">
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

          <DocumentColumns
            main={
              <>
                <SectionCard title={t("vendorBill.field.vendor")}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4">
                    <div className="sm:col-span-2 flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={18} /></span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs text-muted-foreground">{t("vendorBill.field.vendorName")}</span>
                        <span className="text-sm font-medium text-foreground flex items-center gap-2 flex-wrap">
                          {draft.vendorName}
                          {draft.vendorCode && <CodeChip>{draft.vendorCode}</CodeChip>}
                        </span>
                      </div>
                    </div>
                    <ReadonlyField label={t("vendorBill.field.taxId")} value={draft.vendorTaxId} mono />
                    <ReadonlyField label={t("vendorBill.field.address")} value={draft.vendorAddress} className="sm:col-span-3 whitespace-pre-line" />
                  </div>
                </SectionCard>

                <div data-tour="vbdoc-info">
                <SectionCard title={t("vendorBill.infoTitle")}>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px] items-start">
                    {editable ? (
                      <>
                        <Field label={t("vendorBill.field.billDate")} htmlFor="vb-billDate">
                          <input id="vb-billDate" type="date" value={draft.billDate} onChange={(e) => set({ billDate: e.target.value })} className={`${field.input} w-full`} />
                        </Field>
                        <Field label={t("vendorBill.field.creditDays")} htmlFor="vb-credit">
                          <SuffixInput id="vb-credit" min={0} integer suffix={t("receivingReportDoc.daysUnit")} value={draft.creditDays ?? ""}
                            onChange={(v) => set({ creditDays: v === "" ? null : Math.max(0, Math.round(Number(v))) })} />
                        </Field>
                        <Field label={t("vendorBill.field.paymentDate")} htmlFor="vb-payDate">
                          <input id="vb-payDate" type="date" value={draft.paymentDate} onChange={(e) => set({ paymentDate: e.target.value })} className={`${field.input} w-full`} />
                        </Field>
                        <Field label={t("vendorBill.field.remarks")} htmlFor="vb-remarks" className="sm:col-span-3">
                          <textarea id="vb-remarks" rows={2} value={draft.remarks} onChange={(e) => set({ remarks: e.target.value })} className={`${field.textarea} w-full`} />
                        </Field>
                      </>
                    ) : (
                      <>
                        <ReadonlyField label={t("vendorBill.field.billDate")} value={draft.billDate ? formatQuoteDateThai(draft.billDate) : ""} />
                        <ReadonlyField label={t("vendorBill.field.creditDays")} value={draft.creditDays ?? ""} />
                        <ReadonlyField label={t("vendorBill.field.paymentDate")} value={draft.paymentDate ? formatQuoteDateThai(draft.paymentDate) : ""} />
                        <ReadonlyField label={t("vendorBill.field.remarks")} value={draft.remarks} className="sm:col-span-3" />
                      </>
                    )}
                  </div>
                </SectionCard>
                </div>
              </>
            }
            rail={
              <>
                <div data-tour="vbdoc-outstanding">
                <RailSummaryCard
                  label={t("vendorBill.col.outstanding")}
                  value={`฿${fmt(totals.outstanding)}`}
                  rows={[
                    { label: t("vendorBill.col.amount"), value: `฿${fmt(totals.amount)}` },
                    { label: t("vendorBill.col.paid"), value: `฿${fmt(totals.paid)}` },
                    { label: t("vendorBill.col.rows"), value: t("vendorBill.create.count").replace("{n}", String(shownRows.length)) },
                  ]}
                />
                </div>
                <NextStepHint title={t("receivingReportDoc.nextStep")}>
                  <span className="block">{t("vendorBill.nextStepBody")}</span>
                  <span className="block mt-1 text-muted-foreground">{t("vendorBill.subtitle")}</span>
                </NextStepHint>
              </>
            }
          />

          <section data-tour="vbdoc-rows" className={surface.card}>
            <div className={`${surface.cardHead} min-h-[60px] py-3`}>
              <h2 className={surface.cardTitle}>{t("vendorBill.rowsTitle")}</h2>
              <span className="flex-1 text-[13px] text-muted-foreground">{t("vendorBill.rowsCount").replace("{n}", String(shownRows.length))}</span>
              {editable && (
                <button type="button" onClick={() => void openAdd()} className={btn.secondarySm}>
                  <Plus size={15} /> {t("vendorBill.addRows")}
                </button>
              )}
            </div>
            {shownRows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("vendorBill.rowsEmpty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[1000px]">
                  <div className={`${grid} h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]`}>
                    <span>No.</span>
                    <span>{t("vendorBill.col.receivingReport")}</span>
                    <span>{t("vendorBill.col.invoice")}</span>
                    <span>{t("vendorBill.col.date")}</span>
                    <span>{t("vendorBill.col.dueDate")}</span>
                    <span className="text-right">{t("vendorBill.col.amount")}</span>
                    <span className="text-right">{t("vendorBill.col.paid")}</span>
                    <span className="text-right">{t("vendorBill.col.outstanding")}</span>
                    <span />
                  </div>
                  {shownRows.map((r, i) => (
                    <div key={r.apEntryId} className={`${grid} h-14 border-b border-[#eef1f6]`}>
                      <span className="text-[13px] text-muted-foreground">{i + 1}</span>
                      <span className="font-mono text-[13px] font-medium text-foreground truncate">
                        {r.missing ? <span className="text-[#b93636] font-sans">{t("vendorBill.rowMissing")}</span> : r.receivingReportNumber}
                      </span>
                      <span className="font-mono text-[13px] text-[#3d5173] truncate">{r.invoiceNumber || "—"}</span>
                      <span className="text-sm text-[#3d5173]">{r.invoiceDate ? formatQuoteDateThai(r.invoiceDate) : "—"}</span>
                      <span className="text-sm text-[#3d5173]">{r.dueDate ? formatQuoteDateThai(r.dueDate) : "—"}</span>
                      <span className="text-sm text-right tabular-nums text-foreground">{fmt(r.amount)}</span>
                      <span className={`text-sm text-right tabular-nums ${r.paid > 0 ? "text-[#1b7f4f]" : "text-[#8a97ad]"}`}>{r.paid > 0 ? fmt(r.paid) : "—"}</span>
                      <span className={`text-sm text-right tabular-nums ${r.outstanding > 0 ? "font-semibold text-[#8a5a00]" : "text-[#8a97ad]"}`}>{fmt(r.outstanding)}</span>
                      <span className="flex justify-end">
                        {editable && (
                          <button type="button" onClick={() => removeRow(r.apEntryId)} aria-label={t("vendorBill.removeRow")} title={t("vendorBill.removeRow")}
                            className="w-8 h-9 inline-flex items-center justify-center rounded-lg text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                            <X size={16} />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  <div className={`${grid} h-14 bg-[#f8f9fc] rounded-b-xl`}>
                    <span className="col-span-5 text-sm font-semibold text-foreground">{t("vendorBill.total")}</span>
                    <span className="text-sm text-right font-semibold tabular-nums text-foreground">{fmt(totals.amount)}</span>
                    <span className="text-sm text-right font-semibold tabular-nums text-foreground">{fmt(totals.paid)}</span>
                    <span className="text-base text-right font-bold tabular-nums text-foreground">{fmt(totals.outstanding)}</span>
                    <span />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {adding && (
        <WidePickerShell
          title={t("vendorBill.addRows")}
          subtitle={t("vendorBill.addRowsHint").replace("{vendor}", draft.vendorName)}
          onClose={() => setAdding(false)}
          footer={
            <>
              <p className="flex-1 min-w-0 text-sm text-[#3d5173]">{t("ui.selectedCount").replace("{n}", String(picked.size))}</p>
              <button type="button" onClick={() => setAdding(false)} className={btn.secondary}>{t("common.cancel")}</button>
              <button type="button" onClick={confirmAdd} disabled={picked.size === 0} className={btn.primary}>
                <Plus size={16} /> {t("vendorBill.addSelected").replace("{n}", String(picked.size))}
              </button>
            </>
          }
        >
          <div className="flex-1 min-h-[8rem] overflow-auto">
            {candidates === null ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status"><Loader2 size={16} className="animate-spin" /> {t("vendorBill.loading")}</div>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">{t("vendorBill.addNone")}</p>
            ) : (
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[20px_190px_170px_minmax(0,1fr)_150px] gap-3.5 items-center px-6 h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173] sticky top-0">
                  <span /><span>{t("vendorBill.col.receivingReport")}</span><span>{t("vendorBill.col.invoice")}</span>
                  <span>{t("vendorBill.col.date")}</span><span className="text-right">{t("vendorBill.col.amount")}</span>
                </div>
                {candidates.map((c) => {
                  const on = picked.has(c.apEntryId);
                  return (
                    <button key={c.apEntryId} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(c.apEntryId)}
                      className={`${pickRowClass(on)} grid grid-cols-[20px_190px_170px_minmax(0,1fr)_150px] gap-3.5 items-center px-6 h-[52px]`}>
                      <CheckDot on={on} />
                      <span className="font-mono text-[13px] font-medium text-foreground truncate">{c.receivingReportNumber}</span>
                      <span className="font-mono text-[13px] text-[#3d5173] truncate">{c.invoiceNumber || "—"}</span>
                      <span className="text-sm text-[#3d5173]">{c.invoiceDate ? formatQuoteDateThai(c.invoiceDate) : "—"}</span>
                      <span className="text-sm text-right font-semibold tabular-nums text-foreground">{fmt(c.amount)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </WidePickerShell>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t("vendorBill.deleteTitle")}
        message={t("vendorBill.deleteDescription")}
        confirmLabel={t("vendorBill.delete")}
        cancelLabel={t("common.cancel")}
        danger
        busy={deleting}
        summary={
          <SummaryLine
            title={draft.documentNumber}
            sub={`${draft.vendorName} · ${t("vendorBill.create.count").replace("{n}", String(shownRows.length))}`}
            right={`฿${fmt(totals.amount)}`}
          />
        }
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      <VendorBillPrintDocument doc={draft} rows={shownRows} companyHeader={companyHeader} />
    </>
  );
}
