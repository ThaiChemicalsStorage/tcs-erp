import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Loader2, LockOpen, PackageCheck, PackagePlus, Printer, RotateCcw, Save, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DocumentAttachmentsCard } from "../../components/DocumentAttachmentsCard";
import { useAutoSave } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { ApiError } from "../../lib/apiClient";
import { fmt, formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import type { CompanyHeaderInfo } from "../../lib/storage";
import {
  type ReceivingReport, type ReceivingReportUpdateFields, type ReceivingReportLine, type ReceiveBatchInput,
  fetchReceivingReport, updateReceivingReport, deleteReceivingReport, postReceivingBatch, deleteReceivingBatch,
  logReceivingReportPrinted, uploadReceivingReportAttachment, deleteReceivingReportAttachment,
  receivingReportTotals, receivedQtyOf, receivedAmountOf, outstandingQtyOf,
} from "../../lib/receivingReport";
import { ReceiveBatchDialog } from "./ReceiveBatchDialog";
import { ReceivingReportPrintDocument } from "./ReceivingReportPrintDocument";

const inputCls = "w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

/** payload เดียวที่ใช้ทั้งกดบันทึกเองและบันทึกอัตโนมัติ — บรรทัดกับรอบการรับไม่เคยอยู่ในนี้ */
function toUpdateFields(d: ReceivingReport): ReceivingReportUpdateFields {
  return { documentNumber: d.documentNumber, remarks: d.remarks };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/**
 * หน้าใบรับสินค้า — "ทั้งหมดนี้คือใบเดียวกัน" ตามที่เจ้าของสั่ง
 *
 * โครงหน้า: การ์ดสรุป สั่งซื้อ/รับแล้ว/ค้างรับ → ตาราง **รายการค้างรับ** → ตาราง **รับครบแล้ว**
 * (บรรทัดย้ายข้ามมาเองเมื่อค้างรับเหลือศูนย์) → ประวัติการรับทีละรอบ → ไฟล์แนบ
 *
 * บันทึกอัตโนมัติเฉพาะเลขที่บนฟอร์มกับหมายเหตุ — ทุกอย่างที่เหลือเป็นผลของการกดรับของ ซึ่งเป็น
 * การกระทำที่ตั้งใจ ไม่ใช่การพิมพ์ทิ้งไว้
 */
export function ReceivingReportDocument({
  receivingReportId, canEdit, canReceive, canPrint, canDelete, companyHeader, onBack, onDeleted, showToast,
}: {
  receivingReportId: string;
  canEdit: boolean;
  canReceive: boolean;
  canPrint: boolean;
  canDelete: boolean;
  companyHeader: CompanyHeaderInfo;
  onBack: () => void;
  onDeleted: () => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<ReceivingReport | null>(null);
  const [draft, setDraft] = useState<ReceivingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReverse, setConfirmReverse] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);

  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  useEffect(() => {
    let cancelled = false;
    fetchReceivingReport(receivingReportId)
      .then((d) => { if (!cancelled) { setDoc(d); setDraft(d); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [receivingReportId]);

  // เลขที่เป็นฟิลด์บังคับ — ระหว่างที่ผู้ใช้ลบทิ้งเพื่อพิมพ์ใหม่ บันทึกอัตโนมัติจะยิงพอดีแล้วโดน 400
  // เติมกลับเป็น id เสมอ แบบเดียวกับใบสั่งซื้อ/ใบสั่งผลิต
  const autoSavePayload: ReceivingReportUpdateFields | null = draft && canEdit
    ? { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }
    : null;
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: !!draft && canEdit,
    onSave: async (fields) => {
      if (!draft) return;
      // อัปเดตแค่ `doc` ไม่แตะ `draft` เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      setDoc(await updateReceivingReport(draft.id, fields, { autoSave: true }));
    },
  });

  const applyServerDoc = (updated: ReceivingReport) => {
    setDoc(updated);
    setDraft(updated);
    dirty.markSaved(toUpdateFields(updated));
  };

  /** คืน true เมื่อบันทึกสำเร็จ — กล่อง "ยังไม่ได้บันทึก" ใช้ค่านี้ตัดสินว่าจะออกจากหน้าได้ไหม
   *  ถ้าบันทึกไม่ผ่าน ต้องค้างอยู่หน้าเดิมให้ผู้ใช้แก้ ไม่ใช่ออกไปแล้วงานหาย */
  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      applyServerDoc(await updateReceivingReport(draft.id, { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }));
      autoSave.markSaved(toUpdateFields(draft));
      showToast(t("receivingReportDoc.savedToast"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
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
          autoSaveEnabled: canEdit, autoSaveState: autoSave.state,
        }),
        documentLabel: draft.documentNumber || draft.id,
        save,
        // ไม่มีร่างเก็บในเครื่องให้ทิ้ง — หน้านี้แก้แค่เลขที่กับหมายเหตุ ไม่ได้ใช้ useDraftBackup
        discard: () => {},
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
        <span className="sr-only">{t("receivingReport.loading")}</span>
        <div className="h-8 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }
  if (loadError || !draft || !doc) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("receivingReport.loadError")}</p>
        <button onClick={onBack} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">{t("receivingReportDoc.backToList")}</button>
      </div>
    );
  }

  const totals = receivingReportTotals(draft);
  const pendingLines = draft.lines.filter((l) => outstandingQtyOf(draft, l) > 0);
  const doneLines = draft.lines.filter((l) => outstandingQtyOf(draft, l) <= 0);
  const isOpen = draft.status === "Open";


  const runReceive = async (batch: ReceiveBatchInput) => {
    setBusy(true);
    try {
      const updated = await postReceivingBatch(draft.id, batch);
      applyServerDoc(updated);
      setReceiveOpen(false);
      showToast(updated.status === "Closed" ? t("receivingReportDoc.receivedAllToast") : t("receivingReportDoc.receivedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorReceive"));
    } finally {
      setBusy(false);
    }
  };

  const runReverse = async (batchId: string) => {
    setBusy(true);
    try {
      applyServerDoc(await deleteReceivingBatch(draft.id, batchId));
      showToast(t("receivingReportDoc.reversedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorReverse"));
    } finally {
      setBusy(false);
      setConfirmReverse(null);
    }
  };

  const toggleStatus = async () => {
    setBusy(true);
    try {
      applyServerDoc(await updateReceivingReport(draft.id, { status: isOpen ? "Closed" : "Open" }));
      showToast(isOpen ? t("receivingReportDoc.closedToast") : t("receivingReportDoc.reopenedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      await deleteReceivingReport(draft.id);
      showToast(t("receivingReportDoc.deletedToast"));
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const lineRow = (line: ReceivingReportLine, done: boolean) => {
    const received = receivedQtyOf(draft, line.id);
    const outstanding = outstandingQtyOf(draft, line);
    return (
      <tr key={line.id} className="border-b border-border/50 last:border-0">
        <td className="px-3 py-2.5 text-sm text-foreground">
          <span className="font-mono text-xs text-muted-foreground mr-2">{line.productCode || "—"}</span>
          {line.description}
          {line.subDetails.length > 0 && (
            <span className="block text-xs text-muted-foreground mt-0.5">{line.subDetails.join(" · ")}</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{line.unit || "—"}</td>
        <td className="px-3 py-2.5 text-xs font-mono text-right text-muted-foreground whitespace-nowrap">{fmt(line.qtyOrdered)}</td>
        <td className="px-3 py-2.5 text-xs font-mono text-right text-foreground whitespace-nowrap">{fmt(received)}</td>
        <td className={`px-3 py-2.5 text-xs font-mono text-right whitespace-nowrap ${done ? "text-muted-foreground" : "text-[#a75d1a] font-semibold"}`}>{fmt(outstanding)}</td>
        <td className="px-3 py-2.5 text-xs font-mono text-right text-muted-foreground whitespace-nowrap">{fmt(line.unitPriceOrdered)}</td>
        <td className="px-3 py-2.5 text-xs font-mono text-right text-foreground whitespace-nowrap">{fmt(receivedAmountOf(draft, line.id))}</td>
      </tr>
    );
  };

  const lineTable = (lines: ReceivingReportLine[], done: boolean) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {[
              t("receivingReportDoc.col.item"), t("receivingReportDoc.col.unit"), t("receivingReportDoc.col.ordered"),
              t("receivingReportDoc.col.received"), t("receivingReportDoc.col.outstanding"),
              t("receivingReportDoc.col.poPrice"), t("receivingReportDoc.col.receivedAmount"),
            ].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{lines.map((l) => lineRow(l, done))}</tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="flex-1 overflow-y-auto print:hidden">
        <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-border bg-card sticky top-0 z-10">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={15} /> {t("receivingReportDoc.backToList")}
          </button>
          <span className="text-sm font-mono font-semibold text-[#c9a84c] ml-2">{draft.documentNumber || draft.id}</span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${isOpen ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20" : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"}`}>
            {isOpen ? t("receivingReport.status.open") : t("receivingReport.status.closed")}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {canEdit && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
            {canReceive && isOpen && (
              <button onClick={() => setReceiveOpen(true)} disabled={busy || pendingLines.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors disabled:opacity-60">
                <PackagePlus size={13} /> {t("receivingReportDoc.receiveBtn")}
              </button>
            )}
            {canEdit && (
              <button onClick={save} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("receivingReportDoc.save")}
              </button>
            )}
            {canReceive && (
              <button onClick={() => void toggleStatus()} disabled={busy || (!isOpen && pendingLines.length === 0)}
                title={!isOpen && pendingLines.length === 0 ? t("receivingReportDoc.reopenBlocked") : undefined}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
                {isOpen ? <><CheckCircle2 size={13} /> {t("receivingReportDoc.closeBtn")}</> : <><LockOpen size={13} /> {t("receivingReportDoc.reopenBtn")}</>}
              </button>
            )}
            {canPrint && (
              <button onClick={() => { void logReceivingReportPrinted(draft.id).catch(() => {}); setShowPrint(true); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                <Printer size={13} /> {t("receivingReportDoc.print")}
              </button>
            )}
            {canDelete && draft.batches.length === 0 && (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-border rounded-lg text-[#e05252] hover:bg-[#e05252]/10 transition-all">
                <Trash2 size={13} /> {t("receivingReportDoc.delete")}
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5 max-w-5xl">
          {/* สามตัวเลขที่เจ้าของขอไว้ข้อแรก: ซื้อมาเท่าไหร่ รับมาเท่าไหร่ ค้างรับเท่าไหร่ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: t("receivingReportDoc.kpi.ordered"), value: totals.orderedValue, tone: "text-foreground" },
              { label: t("receivingReportDoc.kpi.received"), value: totals.receivedValue, tone: "text-[#207e52]" },
              { label: t("receivingReportDoc.kpi.outstanding"), value: totals.outstandingValue, tone: totals.outstandingValue > 0 ? "text-[#a75d1a]" : "text-muted-foreground" },
            ].map((k) => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-xl font-semibold font-mono mt-1 ${k.tone}`}>{fmt(k.value)}</p>
              </div>
            ))}
          </div>

          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("receivingReportDoc.sectionHeader")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label={t("receivingReportDoc.documentNumber")}>
                <input className={inputCls} disabled={!canEdit} value={draft.documentNumber}
                  onChange={(e) => setDraft({ ...draft, documentNumber: e.target.value })} />
              </Field>
              <Field label={t("receivingReportDoc.purchaseOrder")}>
                <input className={inputCls} disabled value={draft.purchaseOrderNumber} />
              </Field>
              <Field label={t("receivingReportDoc.jobCode")}>
                <input className={inputCls} disabled value={draft.jobCode || "—"} />
              </Field>
              <Field label={t("receivingReportDoc.vendor")}>
                <input className={inputCls} disabled value={draft.vendorName || "—"} />
              </Field>
              <Field label={t("receivingReportDoc.vendorTaxId")}>
                <input className={inputCls} disabled value={draft.vendorTaxId || "—"} />
              </Field>
              <Field label={t("receivingReportDoc.vatRate")}>
                <input className={inputCls} disabled value={draft.orderVatRate !== null && draft.orderVatRate !== undefined ? `${draft.orderVatRate}%` : "—"} />
              </Field>
            </div>
            <Field label={t("receivingReportDoc.remarks")}>
              <textarea rows={2} className={inputCls} disabled={!canEdit} value={draft.remarks}
                onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} />
            </Field>
            <p className="text-xs text-muted-foreground">{t("receivingReportDoc.headerHint")}</p>
          </section>

          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
              <PackagePlus size={15} className="text-[#a75d1a]" />
              <h2 className="text-sm font-semibold text-foreground">{t("receivingReportDoc.pendingTitle")}</h2>
              <span className="text-xs text-muted-foreground font-mono">({pendingLines.length})</span>
            </div>
            {pendingLines.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">{t("receivingReportDoc.pendingEmpty")}</p>
            ) : lineTable(pendingLines, false)}
          </section>

          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
              <PackageCheck size={15} className="text-[#207e52]" />
              <h2 className="text-sm font-semibold text-foreground">{t("receivingReportDoc.doneTitle")}</h2>
              <span className="text-xs text-muted-foreground font-mono">({doneLines.length})</span>
            </div>
            {doneLines.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground text-center">{t("receivingReportDoc.doneEmpty")}</p>
            ) : lineTable(doneLines, true)}
          </section>

          <section className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">{t("receivingReportDoc.historyTitle")}</h2>
            {draft.batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("receivingReportDoc.historyEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {draft.batches.map((b, idx) => (
                  <li key={b.id} className="border border-border rounded-lg p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("receivingReportDoc.batchSeq").replace("{seq}", String(b.seq))}</p>
                      <p className="text-sm font-mono text-foreground">{b.invoiceNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("receivingReportDoc.receive.invoiceDate")}</p>
                      <p className="text-sm font-mono text-foreground">{b.invoiceDate ? formatQuoteDateThai(b.invoiceDate) : "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{t("receivingReportDoc.receive.receivedBy")}</p>
                      <p className="text-sm text-foreground">{b.receivedBy || b.postedByName || "—"}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs text-muted-foreground">{t("receivingReportDoc.receive.total")}</p>
                      <p className="text-sm font-mono font-semibold text-[#c9a84c]">{fmt(b.total)}</p>
                    </div>
                    {/* ยกเลิกได้เฉพาะรอบล่าสุด — ต้นทุนถัวเฉลี่ยเดินไปตามลำดับการรับ ถอนรอบกลางย้อนไม่ได้ */}
                    {canReceive && idx === draft.batches.length - 1 && (
                      <button onClick={() => setConfirmReverse(b.id)} disabled={busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-[#e05252] hover:bg-[#e05252]/10 transition-all disabled:opacity-60">
                        <RotateCcw size={12} /> {t("receivingReportDoc.reverseBtn")}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DocumentAttachmentsCard
            attachments={draft.attachments ?? []}
            disabled={!canEdit}
            onUpload={async (file) => {
              const updated = await uploadReceivingReportAttachment(draft.id, file);
              setDraft((p) => (p ? { ...p, attachments: updated.attachments } : updated));
              setDoc((p) => (p ? { ...p, attachments: updated.attachments } : updated));
            }}
            onDelete={async (attachmentId) => {
              const updated = await deleteReceivingReportAttachment(draft.id, attachmentId);
              setDraft((p) => (p ? { ...p, attachments: updated.attachments } : updated));
              setDoc((p) => (p ? { ...p, attachments: updated.attachments } : updated));
            }}
          />
        </div>
      </div>

      {/* ใบพิมพ์อยู่ใน DOM ตลอด ซ่อนด้วย `hidden print:block` — กด Ctrl+P ต้องได้ใบเดียวกับปุ่มพิมพ์
          (บั๊กเดิมของหกโมดูลที่แก้ไปเมื่อ 2026-09-02: เรนเดอร์เฉพาะตอนกดปุ่ม แล้ว Ctrl+P ได้กระดาษเปล่า) */}
      <ReceivingReportPrintDocument doc={draft} companyHeader={companyHeader} />

      {receiveOpen && (
        <ReceiveBatchDialog doc={draft} busy={busy} onCancel={() => setReceiveOpen(false)} onSubmit={(b) => void runReceive(b)} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={t("receivingReportDoc.confirmDelete.title")}
        message={t("receivingReportDoc.confirmDelete.message")}
        confirmLabel={t("receivingReportDoc.delete")}
        busy={busy}
        onConfirm={() => void runDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmReverse !== null}
        title={t("receivingReportDoc.confirmReverse.title")}
        message={t("receivingReportDoc.confirmReverse.message")}
        confirmLabel={t("receivingReportDoc.reverseBtn")}
        busy={busy}
        onConfirm={() => { if (confirmReverse) void runReverse(confirmReverse); }}
        onCancel={() => setConfirmReverse(null)}
      />
    </>
  );
}
