import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Printer, Save, Trash2, Plus, CornerDownRight, Heading, RotateCw, GitBranch } from "lucide-react";
import {
  fetchProductionOrder, updateProductionOrder, deleteProductionOrder, logProductionOrderPrinted,
  submitProductionOrderApproval, approveProductionOrder, rejectProductionOrder, withdrawProductionOrderApproval,
  blankProductionOrderLine, updateProductionOrderSignatories, refreshProductionOrderFromScope, rewriteProductionOrder,
  type ProductionOrder, type ProductionOrderLine, type ProductionOrderUpdateFields,
} from "../../lib/productionOrder";
import { ProductionOrderPrintDocument } from "./ProductionOrderPrintDocument";
import { DocumentApprovalActions, RejectionNotice } from "../../components/DocumentApprovalActions";
import { DocumentStatusStepper } from "../../components/DocumentStatusStepper";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ApiError } from "../../lib/apiClient";
import { newId } from "../../lib/products";
import { useI18n } from "../../lib/i18n";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { getRevisionNumber } from "../../lib/revisionDiff";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-70";

function toUpdateFields(d: ProductionOrder): ProductionOrderUpdateFields {
  return {
    documentNumber: d.documentNumber, revisionNote: d.revisionNote,
    productName: d.productName, supervisorName: d.supervisorName,
    startDate: d.startDate, dueDate: d.dueDate, lines: d.lines,
    orderedBy: d.orderedBy, deliveredBy: d.deliveredBy, receivedBy: d.receivedBy, costDeptBy: d.costDeptBy,
  };
}

// หน้าแก้ไขใบสั่งผลิต (FM-PD-02) — แก้ได้เฉพาะฉบับร่าง อนุมัติแล้วล็อก เหมือนเอกสารอื่นในระบบ
export function ProductionOrderDocument({
  productionOrderId, company, canEdit, canApprove, canPrint, canDelete, onBack, onDeleted, onOpenOther, showToast,
}: {
  productionOrderId: string;
  /** โปรไฟล์บริษัทสำหรับโลโก้บนใบพิมพ์ FM-PD-02 */
  company: Company;
  canEdit: boolean;
  canApprove: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onBack: () => void;
  onDeleted: () => void;
  /** เปิดเอกสารใบอื่นในโมดูลเดียวกัน — ใช้ตอน Rewrite เพื่อพาไปฉบับใหม่ที่เพิ่งสร้าง */
  onOpenOther: (id: string) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<ProductionOrder | null>(null);
  const [draft, setDraft] = useState<ProductionOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPrint, setShowPrint] = useState(false);

  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) — ประกาศเหนือ effect โหลดข้อมูล เพื่อตั้งฐานเทียบใหม่ทุกครั้งที่ดึงเอกสาร
  // toUpdateFields ครอบคลุมช่องผู้ลงนามหลังอนุมัติอยู่แล้ว จึงใช้ payload เดียวกันได้ทั้งสองเฟส
  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  useEffect(() => {
    let cancelled = false;
    fetchProductionOrder(productionOrderId)
      .then((d) => { if (!cancelled) { setDoc(d); setDraft(d); setLoading(false); dirty.markSaved(toUpdateFields(d)); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productionOrderId, dirty]);

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  // ── บันทึกอัตโนมัติ (2026-08-25) — hook ต้องอยู่ก่อน early return ทุกอันด้านล่าง ────────────────
  // Auto-save, declared above the loading/error early returns because hooks may not run
  // conditionally. It sends the exact payload the Save button sends and only while the document is
  // an editable Draft; the local snapshot alongside it survives a closed tab or a click onto
  // another page. See src/hooks/useAutoSave.ts.
  const autoSaveEditable = !!draft && canEdit && draft.status === "Draft";
  // เลขที่ที่พิมพ์บนฟอร์มว่างไม่ได้ (เซิร์ฟเวอร์ตอบ 400 โดยตั้งใจ) แต่การบันทึกอัตโนมัติยิงระหว่างที่ผู้ใช้ยัง
  // พิมพ์อยู่ — คนที่ล้างช่องเพื่อพิมพ์เลขใหม่จึงเห็น error กลางคันทั้งที่ยังพิมพ์ไม่เสร็จ ระหว่างที่ช่องว่าง
  // ให้ส่งเลขเดิมไปแทน (เท่ากับ "ยังไม่เปลี่ยน") แล้วค่อยบันทึกจริงเมื่อพิมพ์ค่าใหม่เสร็จ
  const autoSavePayload: ProductionOrderUpdateFields | null = draft && autoSaveEditable
    ? { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }
    : null;
  const draftBackup = useDraftBackup({
    storageKey: draft ? `productionOrder:${draft.id}` : null,
    data: autoSavePayload,
    enabled: autoSaveEditable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: autoSaveEditable,
    onSave: async (fields) => {
      if (!draft) return;
      const saved = await updateProductionOrder(draft.id, fields, { autoSave: true });
      // อัปเดตเฉพาะ doc (สถานะ/เวลาแก้ไขล่าสุด) ไม่แตะ draft เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      // Only `doc` is refreshed — never `draft`, which the user may be typing into right now.
      setDoc(saved);
    },
  });

  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updateProductionOrder(draft.id, toUpdateFields(draft));
      setDoc(updated); setDraft(updated);
      // ตั้งฐานเทียบของ auto-save ใหม่เป็น "สิ่งที่เซิร์ฟเวอร์ตอบกลับมา" ซึ่งคือสิ่งที่ฟอร์มถืออยู่หลังบรรทัดบน
      // ไม่ใช่ค่าบนจอตอนเรียก ซึ่งอาจเก่าหรือใหม่กว่าที่ส่งขึ้นไปจริง
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("productionOrderDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorSave"));
      return false;
    } finally { setSaving(false); }
  };

  // ดึงรายการจากงานต้นทางมาแทนที่ทั้งชุด — ยืนยันก่อนเสมอ เพราะเขียนทับสิ่งที่พิมพ์ไว้เอง
  const refreshFromScope = async () => {
    if (!doc) return;
    setRefreshing(true);
    try {
      const updated = await refreshProductionOrderFromScope(doc.id);
      setDoc(updated); setDraft(updated);
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("productionOrderDoc.refreshed"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorRefresh"));
    } finally { setRefreshing(false); setConfirmRefresh(false); }
  };

  // สร้างฉบับแก้ไข แล้วเปิดฉบับใหม่ทันที — ฉบับเดิมยังอยู่ ไม่ถูกแตะต้อง
  const handleRewrite = async () => {
    if (!doc) return;
    setRewriting(true);
    try {
      const created = await rewriteProductionOrder(doc.id);
      showToast(t("docRevision.rewritten"));
      onOpenOther(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("docRevision.errorRewrite"));
    } finally { setRewriting(false); setConfirmRewrite(false); }
  };

  const saveSignatories = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updateProductionOrderSignatories(draft.id, {
        deliveredBy: draft.deliveredBy, receivedBy: draft.receivedBy, costDeptBy: draft.costDeptBy,
      });
      setDoc(updated); setDraft(updated);
      dirty.markSaved(toUpdateFields(updated));
      showToast(t("productionOrderDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorSave"));
      return false;
    } finally { setSaving(false); }
  };

  // การ์ด "ยังไม่ได้บันทึก" — ยังทำงานหลังอนุมัติด้วย เพราะช่องผู้ลงนาม (ผู้ส่งมอบ/ผู้รับ/ฝ่ายต้นทุน) ยังแก้ได้
  // และตอนนั้น auto-save ปิดอยู่ ปุ่ม "บันทึก" ในกล่องจึงต้องเลือกให้ตรงเฟส
  const { requestLeave } = useUnsavedChangesGuard(
    draft && canEdit
      ? {
          getRisk: () => assessUnsavedRisk({
            isDirty: dirty.isDirtyNow(),
            hasServerRecord: true,
            autoSaveEnabled: autoSaveEditable,
            autoSaveState: autoSave.state,
          }),
          documentLabel: draft.id,
          save: draft.status === "Draft" ? save : saveSignatories,
          discard: draftBackup.clear,
        }
      : null,
  );

  if (loading) {
    return <div className="flex-1 flex items-center justify-center p-6"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>;
  }
  if (!doc || !draft) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-muted-foreground">{t("productionOrder.loadError")}</p>
        <button onClick={() => requestLeave(onBack)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">{t("productionOrderDoc.backToList")}</button>
      </div>
    );
  }

  const editable = canEdit && doc.status === "Draft";
  // หัวจดหมายของใบพิมพ์ — FM-PD-02 ใช้แค่โลโก้ ที่เหลือส่งไปเพื่อให้ชนิดครบเท่านั้น
  // สร้าง inline แบบเดียวกับใบเบิกพัสดุ/ใบส่งมอบสินค้า (ยังไม่มีตัวช่วยกลางสำหรับเรื่องนี้)
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  const setLines = (fn: (lines: ProductionOrderLine[]) => ProductionOrderLine[]) =>
    setDraft((prev) => prev && { ...prev, lines: fn(prev.lines) });
  const updateLine = (id: string, patch: Partial<ProductionOrderLine>) =>
    setLines((lines) => lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const handlePrint = async () => {
    setPrinting(true);
    try { await logProductionOrderPrinted(doc.id); setShowPrint(true); }
    catch (err) { showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorPrint")); }
    finally { setPrinting(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await deleteProductionOrder(doc.id); setConfirmDelete(false); onDeleted(); }
    catch (err) { showToast(err instanceof ApiError ? err.message : t("productionOrderDoc.errorDelete")); setDeleting(false); }
  };

  const applyUpdated = (d: ProductionOrder) => { setDoc(d); setDraft(d); dirty.markSaved(toUpdateFields(d)); };

  const statusPill = doc.status === "Draft"
    ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20"
    : doc.status === "PendingApproval"
    ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20"
    : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20";
  const statusText = doc.status === "Draft"
    ? t("materialRequisition.status.draft")
    : doc.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final");

  const field = (label: string, value: string, onChange: (v: string) => void, type = "text") => (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input type={type} disabled={!editable} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </div>
  );

  // ผู้ส่งมอบงาน/ผู้ตรวจรับงาน/แผนกต้นทุน เซ็นกันหลังอนุมัติและทำงานเสร็จ จึงกรอกได้แม้เอกสาร Final แล้ว
  // (บันทึกผ่าน route แยก /signatories ที่ไม่ติดล็อก Final — ดู handleSignatories() ฝั่งเซิร์ฟเวอร์)
  const postApprovalKeys = ["deliveredBy", "receivedBy", "costDeptBy"] as const;
  const signatoryRow = (label: string, key: "orderedBy" | "deliveredBy" | "receivedBy" | "costDeptBy") => {
    const alwaysEditable = (postApprovalKeys as readonly string[]).includes(key) && canEdit;
    const enabled = editable || alwaysEditable;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{label}</label>
          <input disabled={!enabled} value={draft[key].name} onChange={(e) => setDraft({ ...draft, [key]: { ...draft[key], name: e.target.value } })} className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">{t("productionOrderDoc.field.date")}</label>
          <input type="date" disabled={!enabled} value={draft[key].date} onChange={(e) => setDraft({ ...draft, [key]: { ...draft[key], date: e.target.value } })} className={inputCls} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("productionOrderDoc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#866d28] font-mono font-semibold">{doc.documentNumber || doc.id}</span>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusPill}`}>{statusText}</span>

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {autoSaveEditable && <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />}
          {canEdit && doc.status === "Final" && (
            <button onClick={() => setConfirmRewrite(true)} disabled={rewriting} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {rewriting ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />} {t("docRevision.rewrite")}
            </button>
          )}
          {canPrint && (
            <button onClick={handlePrint} disabled={printing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {printing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {t("productionOrderDoc.print")}
            </button>
          )}
          {editable && (
            <button onClick={() => setConfirmRefresh(true)} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />} {t("productionOrderDoc.refreshFromScope")}
            </button>
          )}
          {editable && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("productionOrderDoc.saveDraft")}
            </button>
          )}
          <DocumentApprovalActions
            status={doc.status}
            canEdit={canEdit}
            canApprove={canApprove}
            onSubmit={() => submitProductionOrderApproval(doc.id)}
            onApprove={() => approveProductionOrder(doc.id)}
            onReject={(c) => rejectProductionOrder(doc.id, c)}
            onWithdraw={() => withdrawProductionOrderApproval(doc.id)}
            onUpdated={applyUpdated}
            showToast={showToast}
          />
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("productionOrderDoc.delete")}
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

        <DocumentStatusStepper
          status={doc.status}
          rejectionComment={doc.rejectionComment ?? ""}
          approverLabel={t("productionOrderDoc.approverLabel")}
          approvedByUserId={doc.approvedByUserId}
          approvedByName={doc.approver.name}
          approvedAt={doc.approver.date}
        />
        <RejectionNotice comment={doc.rejectionComment ?? ""} />

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
            <h1 className="text-[#c9a84c] text-xl font-bold">{t("productionOrderDoc.title")}</h1>
            <p className="text-[#a8bed8] text-xs mt-1">{t("productionOrderDoc.jobCodePrefix")} {doc.jobCode} · {doc.customerCompanyName}</p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* เลขที่ที่พิมพ์บนฟอร์ม — แก้ได้ตอนเป็นร่าง แต่ id จริงของเอกสารไม่เปลี่ยน ตัวนับจึงเดินต่อตามปกติ */}
            <div>
              {field(t("productionOrderDoc.field.documentNumber"), draft.documentNumber, (v) => setDraft({ ...draft, documentNumber: v }))}
              <p className="text-xs text-muted-foreground mt-1">{t("productionOrderDoc.field.documentNumberHint")}</p>
            </div>
            {field(t("productionOrderDoc.field.productName"), draft.productName, (v) => setDraft({ ...draft, productName: v }))}
            {field(t("productionOrderDoc.field.supervisorName"), draft.supervisorName, (v) => setDraft({ ...draft, supervisorName: v }))}
            {field(t("productionOrderDoc.field.startDate"), draft.startDate, (v) => setDraft({ ...draft, startDate: v }), "date")}
            {field(t("productionOrderDoc.field.dueDate"), draft.dueDate, (v) => setDraft({ ...draft, dueDate: v }), "date")}
          </div>
        </div>

{/* หมายเหตุการแก้ไข — โผล่เฉพาะเอกสารที่เป็นฉบับแก้ไข (มี -R{n} ต่อท้าย) เท่านั้น
            ต่างจาก Scope of Work ตรงที่ข้อความนี้ถูกพิมพ์ลงบนเอกสารจริงด้วย */}
        {getRevisionNumber(doc.id) > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold text-foreground mb-1">{t("docRevision.noteTitle")}</h2>
            <p className="text-xs text-muted-foreground mb-2">{t("docRevision.noteHelp")}</p>
            <textarea
              rows={4}
              disabled={!editable}
              value={draft.revisionNote}
              onChange={(e) => setDraft({ ...draft, revisionNote: e.target.value })}
              placeholder={t("docRevision.notePlaceholder")}
              className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y leading-relaxed disabled:opacity-60"
            />
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-foreground mb-1">{t("productionOrderDoc.linesHeading")}</h2>
          {draft.lines.length === 0 && <p className="text-xs text-muted-foreground">{t("productionOrderDoc.noLines")}</p>}

          {draft.lines.map((l, idx) => (
            <div key={l.id} className={`rounded-lg border p-2 space-y-1.5 ${l.isSectionHeader ? "border-[#c9a84c]/40 bg-[#c9a84c]/5" : "border-border/60"} ${l.isContinuation ? "ml-6" : ""}`}>
              <div className="flex items-center gap-2">
                {/* บรรทัดต่อไม่กินเลขลำดับเหมือนบรรทัดหัวข้อ แต่ยังมีจำนวน/หน่วยของตัวเอง
                    ("3 หน้าแปลน 20A | 2 ตัว" แล้ว "หน้าแปลน 50A | 3 ตัว" บนฟอร์ม FM-PD-02 ตัวจริง) */}
                <span className="text-xs font-mono text-muted-foreground w-6 flex-shrink-0 text-center">
                  {l.isSectionHeader || l.isContinuation ? "—" : draft.lines.slice(0, idx + 1).filter((x) => !x.isSectionHeader && !x.isContinuation).length}
                </span>
                <input
                  disabled={!editable} value={l.description}
                  onChange={(e) => updateLine(l.id, { description: e.target.value })}
                  placeholder={l.isSectionHeader ? t("productionOrderDoc.line.headerPlaceholder") : t("productionOrderDoc.line.descriptionPlaceholder")}
                  className={`flex-1 h-9 px-2 text-xs bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 disabled:opacity-70 ${l.isSectionHeader ? "font-semibold" : ""}`}
                />
                {/* บรรทัดหัวข้อไม่มีจำนวน/หน่วย ตามฟอร์มจริง — ซ่อนช่องไปเลยจะได้ไม่สับสน */}
                {!l.isSectionHeader && (
                  <>
                    <input
                      type="number" disabled={!editable} value={l.qty ?? ""}
                      onChange={(e) => updateLine(l.id, { qty: e.target.value === "" ? null : Number(e.target.value) })}
                      placeholder={t("productionOrderDoc.line.qty")}
                      className="w-20 h-9 px-2 text-xs bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 disabled:opacity-70"
                    />
                    <input
                      disabled={!editable} value={l.unit}
                      onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                      placeholder={t("productionOrderDoc.line.unit")}
                      className="w-20 h-9 px-2 text-xs bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 disabled:opacity-70"
                    />
                  </>
                )}
                <input
                  disabled={!editable} value={l.remark}
                  onChange={(e) => updateLine(l.id, { remark: e.target.value })}
                  placeholder={t("productionOrderDoc.line.remark")}
                  className="w-32 h-9 px-2 text-xs bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 disabled:opacity-70"
                />
                {editable && (
                  <button onClick={() => setLines((lines) => lines.filter((x) => x.id !== l.id))} className="text-muted-foreground hover:text-[#e05252] transition-colors" title={t("productionOrderDoc.line.remove")}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {l.subDetails.map((sd, i) => (
                <div key={i} className="flex items-center gap-2 pl-8">
                  <CornerDownRight size={12} className="text-muted-foreground flex-shrink-0" />
                  <input
                    disabled={!editable} value={sd}
                    onChange={(e) => updateLine(l.id, { subDetails: l.subDetails.map((x, j) => (j === i ? e.target.value : x)) })}
                    placeholder={t("productionOrderDoc.line.subDetailPlaceholder")}
                    className="flex-1 h-8 px-2 text-xs bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 disabled:opacity-70"
                  />
                  {editable && (
                    <button onClick={() => updateLine(l.id, { subDetails: l.subDetails.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-[#e05252] transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              {editable && (
                <button onClick={() => updateLine(l.id, { subDetails: [...l.subDetails, ""] })} className="flex items-center gap-1.5 pl-8 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Plus size={12} /> {t("productionOrderDoc.line.addSubDetail")}
                </button>
              )}
            </div>
          ))}

          {editable && (
            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => setLines((lines) => [...lines, blankProductionOrderLine(newId("poline"))])} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Plus size={13} /> {t("productionOrderDoc.line.add")}
              </button>
              <button onClick={() => setLines((lines) => [...lines, blankProductionOrderLine(newId("poline"), true)])} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Heading size={13} /> {t("productionOrderDoc.line.addHeader")}
              </button>
              <button onClick={() => setLines((lines) => [...lines, blankProductionOrderLine(newId("poline"), false, true)])} title={t("productionOrderDoc.line.continuationHint")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <CornerDownRight size={13} /> {t("productionOrderDoc.line.addContinuation")}
              </button>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">{t("productionOrderDoc.signHeading")}</h2>
          {signatoryRow(t("productionOrderDoc.field.orderedBy"), "orderedBy")}
          {/* ผู้อนุมัติแก้เองไม่ได้ — ระบบเติมให้ตอนกดอนุมัติ กันการปลอมลายเซ็น */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("productionOrderDoc.field.approver")}</label>
              <input disabled value={draft.approver.name || t("productionOrderDoc.approverPending")} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("productionOrderDoc.field.date")}</label>
              <input disabled value={draft.approver.date} className={inputCls} />
            </div>
          </div>
          {signatoryRow(t("productionOrderDoc.field.deliveredBy"), "deliveredBy")}
          {signatoryRow(t("productionOrderDoc.field.receivedBy"), "receivedBy")}
          {signatoryRow(t("productionOrderDoc.field.costDeptBy"), "costDeptBy")}

          {/* หลังอนุมัติแล้วปุ่ม "บันทึกฉบับร่าง" ด้านบนหายไป สามช่องล่างจึงต้องมีปุ่มบันทึกของตัวเอง */}
          {!editable && canEdit && (
            <div className="pt-1">
              <button onClick={() => { void saveSignatories(); }} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {t("productionOrderDoc.saveSignatories")}
              </button>
              <p className="text-xs text-muted-foreground mt-1.5">{t("productionOrderDoc.saveSignatoriesHint")}</p>
            </div>
          )}
        </div>
      </div>

      <ProductionOrderPrintDocument doc={doc} companyHeader={companyHeader} />

      <ConfirmDialog
        open={confirmDelete}
        title={t("productionOrderDoc.confirmDelete.title")}
        message={t("productionOrderDoc.confirmDelete.message")}
        confirmLabel={deleting ? t("productionOrderDoc.deleting") : t("productionOrderDoc.delete")}
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmRefresh}
        title={t("productionOrderDoc.refreshConfirmTitle")}
        message={t("productionOrderDoc.refreshConfirmBody")}
        confirmLabel={t("productionOrderDoc.refreshFromScope")}
        onConfirm={() => void refreshFromScope()}
        onCancel={() => setConfirmRefresh(false)}
      />
      <ConfirmDialog
        open={confirmRewrite}
        title={t("docRevision.rewriteConfirmTitle")}
        message={t("docRevision.rewriteConfirmBody")}
        confirmLabel={t("docRevision.rewrite")}
        busy={rewriting}
        onConfirm={() => void handleRewrite()}
        onCancel={() => setConfirmRewrite(false)}
      />
    </div>
  );
}
