import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Paperclip, Printer, CheckCircle2, AlertTriangle, Plus, ChevronRight, ChevronDown, Check, ClipboardCheck, Receipt } from "lucide-react";
import { fetchAllScopeOfWorks, fetchScopeOfWork, type ScopeOfWorkListItem, type ScopeOfWork } from "../../lib/scopeOfWork";
import {
  openArMilestone, updateArMilestone, uploadArAttachment, issueArDocuments, issueArReceipt,
  fetchArDocuments, fetchArDocument, fetchArMilestones,
  DOC_TYPE_LABEL_KEY,
  receiptByInvoiceId as buildReceiptByInvoiceId, paidByInvoiceId as buildPaidByInvoiceId,
  type ArMilestone, type ArDocument, type ArChecklistKey, type ArWorkClassification,
} from "../../lib/accounting";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { ArDocumentPrintDocument, type ArPaidByInvoiceId } from "./ArDocumentPrintDocument";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { ACCEPT_ALL_UPLOADS, checkBeforeUpload } from "../../lib/uploadLimits";
import { ListPageHeader, ListEmpty } from "../../components/ui/ListPage";
import { DocumentHeader, DocumentColumns, RailTotalCard, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { ReadonlyField } from "../../components/ui/Field";
import { btn, field, surface, table } from "../../components/ui/styles";
import { AccountingDialog, BillingStatusPill, DocStatusPill, PAGE_CLASS, PickerRow, RowIconButton, RowPickerDialog, SummaryBox } from "./accountingUi";
import { money } from "./accountingFormat";

// i18n key lookups for the two enums that have no shared _LABEL_KEY map in lib/accounting.ts yet
// (see the task note that scoped src/lib/accounting.ts out of this pass) — built locally here.
const WORK_CLASSIFICATION_LABEL_KEY: Record<ArWorkClassification, TranslationKey> = {
  goods: "accounting.jobBilling.workClass.goods",
  service: "accounting.jobBilling.workClass.service",
  contract: "accounting.jobBilling.workClass.contract",
};
const CHECKLIST_LABEL_KEY: Record<ArChecklistKey, TranslationKey> = {
  poCopy: "accounting.jobBilling.checklist.poCopy",
  deliveryNote: "accounting.jobBilling.checklist.deliveryNote",
  report: "accounting.jobBilling.checklist.report",
  stampDuty: "accounting.jobBilling.checklist.stampDuty",
  bankGuarantee: "accounting.jobBilling.checklist.bankGuarantee",
  whtEnvelope: "accounting.jobBilling.checklist.whtEnvelope",
};

// หน้าบัญชีลูกหนี้ (Accounts Receivable) — งวดที่ 1: เลือกงาน (Scope of Work) แล้ววางบิลตามงวดงาน
// Accounts Receivable page — Phase 1: pick a job (Scope of Work), then bill it milestone by milestone.
// See docs/MODULES/Accounting.md for the full design writeup and the Phase 1/Phase 2 boundary.
export function AccountingPage({
  canCreate, canIssue,
}: {
  canCreate: boolean;
  canIssue: boolean;
}) {
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const toast = useToast();
  const { t } = useI18n();

  const openScope = (id: string) => { setSelectedId(id); setView("detail"); setPickerOpen(false); };
  const backToList = () => setView("list");

  if (view === "detail" && selectedId) {
    return (
      <>
        <ScopeBillingDetail scopeOfWorkId={selectedId} canCreate={canCreate} canIssue={canIssue} onBack={backToList} showToast={toast.show} />
        <Toast message={toast.message} />
      </>
    );
  }

  const openLabel = canCreate ? t("accounting.jobBilling.createBtn") : t("accounting.jobBilling.openBtn");
  const steps = [t("accounting.jobBilling.step.pickJob"), t("accounting.jobBilling.step.attach"), t("accounting.jobBilling.step.issue")];

  return (
    <div className={PAGE_CLASS}>
      {/* ปุ่มเดียวกัน แต่คนที่มีแค่สิทธิ์ดู (ar:view) ก็ต้องเข้าถึงงานได้ — เดิมหน้านี้แสดงตาราง SOW
          ทั้งหมดให้ทุกคนที่เปิดหน้าได้ พอเปลี่ยนเป็น dialog แล้วผูกปุ่มไว้กับ canCreate อย่างเดียว
          คนที่มีแค่สิทธิ์ดูจะเจอหน้าว่างที่กดอะไรไม่ได้เลย (การกดเลือกงานเป็นแค่การเปิดดู ไม่ใช่การแก้ไข
          — ปุ่มออกเอกสาร/เช็คลิสต์ข้างในยังคุมด้วย canCreate/canIssue เหมือนเดิมทุกประการ) */}
      <ListPageHeader
        module={t("nav.group.accounting")}
        title={t("accounting.jobBilling.title")}
        description={t("accounting.jobBilling.subtitle")}
        actions={<button type="button" onClick={() => setPickerOpen(true)} className={btn.primary}><Plus size={16} /> {openLabel}</button>}
      />

      <section className={`${surface.card} flex-1 min-h-[360px] flex flex-col items-center justify-center gap-3 px-6 py-10 text-center`}>
        <span className="w-14 h-14 rounded-full bg-[#eef1f6] text-[#3d5173] flex items-center justify-center"><FileText size={24} /></span>
        <h2 className="mt-1 text-lg font-semibold text-foreground">{t("accounting.jobBilling.landing.title")}</h2>
        <p className="max-w-[520px] text-sm text-[#3d5173]">
          {canCreate ? t("accounting.jobBilling.landing.description") : t("accounting.jobBilling.landing.descriptionReadOnly")}
        </p>
        <ol className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-[13px] text-muted-foreground">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2.5">
              {i > 0 && <ChevronRight size={14} aria-hidden="true" />}
              <span className="h-7 px-2.5 rounded-md bg-[#f4f6fa] inline-flex items-center">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      {pickerOpen && <ScopeOfWorkPickerDialog onClose={() => setPickerOpen(false)} onSelect={openScope} />}
    </div>
  );
}

const SCOPE_PICKER_GRID = "grid-cols-[130px_minmax(0,1fr)_150px_150px_20px]";

// Dialog เปิดจากปุ่ม "+ สร้างวางบิล" — ให้บัญชีค้นหา/เลือก Scope of Work เอง แทนการดึงรายการ SOW
// ทั้งหมดมาโชว์เป็นตารางอัตโนมัติเหมือนเดิม เพราะบางงานยังวางบิลไม่ได้ (รอ PO ลูกค้า/เอกสารลูกค้ายังไม่ครบ)
// ข้อมูล SOW+badge บิลมัดจำถูกดึงเฉพาะตอนเปิด dialog นี้เท่านั้น ไม่ดึงตอนโหลดหน้า
function ScopeOfWorkPickerDialog({ onClose, onSelect }: { onClose: () => void; onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const [scopeOfWorks, setScopeOfWorks] = useState<ScopeOfWorkListItem[]>([]);
  const [depositDocByScope, setDepositDocByScope] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllScopeOfWorks(), fetchArDocuments({ docType: "AR", status: "issued" })])
      .then(([list, depositDocs]) => {
        if (cancelled) return;
        setScopeOfWorks(list);
        setDepositDocByScope(Object.fromEntries(depositDocs.map((d) => [d.scopeOfWorkId, d.docNo])));
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = scopeOfWorks.filter((s) =>
    !q
    || s.scopeNumber.toLowerCase().includes(q)
    || s.customerName.toLowerCase().includes(q)
    || s.quotationNumber.toLowerCase().includes(q));

  return (
    <RowPickerDialog
      title={t("accounting.jobBilling.createDialog.title")}
      subtitle={t("accounting.jobBilling.createDialog.description")}
      search={search}
      onSearch={setSearch}
      searchPlaceholder={t("accounting.jobBilling.search.placeholder")}
      countLabel={loading || loadError ? undefined : t("accounting.jobBilling.picker.count").replace("{n}", String(filtered.length))}
      gridClass={SCOPE_PICKER_GRID}
      headers={<>
        <span>{t("accounting.list.col.scopeNumber")}</span>
        <span>{t("accounting.list.col.customer")}</span>
        <span>{t("accounting.jobBilling.picker.col.quotation")}</span>
        <span>{t("accounting.jobBilling.picker.col.deposit")}</span>
        <span />
      </>}
      footerNote={t("accounting.jobBilling.picker.footer")}
      onClose={onClose}
    >
      {loading ? (
        <div className="p-6 space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : loadError ? (
        <ListEmpty title={t("accounting.jobBilling.error.loadFailed")} />
      ) : filtered.length === 0 ? (
        <ListEmpty title={t("accounting.jobBilling.empty.title")} hint={t("accounting.jobBilling.empty.description")} />
      ) : (
        filtered.map((s) => (
          <PickerRow key={s.id} gridClass={SCOPE_PICKER_GRID} onClick={() => onSelect(s.id)}>
            <span className={table.code}>{s.scopeNumber}</span>
            <span className="font-medium text-sm text-foreground truncate">{s.customerName}</span>
            <span className="font-mono text-[13px] text-[#3d5173] truncate">{s.quotationNumber}</span>
            <span>
              {depositDocByScope[s.id] ? (
                <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#e6f4ec] text-[#1b7f4f] text-xs font-semibold font-mono">
                  <CheckCircle2 size={12} /> {depositDocByScope[s.id]}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-[#fdf3e0] text-[#8a5a00] text-xs font-semibold">
                  <AlertTriangle size={12} /> {t("accounting.jobBilling.depositNotIssued")}
                </span>
              )}
            </span>
          </PickerRow>
        ))
      )}
    </RowPickerDialog>
  );
}

const CHECKLIST_KEYS_FOR: Record<ArWorkClassification, ArChecklistKey[]> = {
  goods: ["poCopy", "deliveryNote"],
  service: ["poCopy", "deliveryNote", "report", "stampDuty", "whtEnvelope"],
  contract: ["poCopy", "deliveryNote", "stampDuty", "bankGuarantee"],
};

const ISSUED_DOCS_GRID = "grid-cols-[150px_minmax(0,1fr)_minmax(150px,210px)_150px_150px]";

function ScopeBillingDetail({
  scopeOfWorkId, canCreate, canIssue, onBack, showToast,
}: {
  scopeOfWorkId: string;
  canCreate: boolean;
  canIssue: boolean;
  onBack: () => void;
  showToast: (msg: string) => void;
}) {
  const [scope, setScope] = useState<ScopeOfWork | null>(null);
  const [documents, setDocuments] = useState<ArDocument[]>([]);
  // งวดที่เคยเปิดไว้แล้วของงานนี้ (GET อย่างเดียว ไม่สร้างใหม่) — ใช้แสดงสถานะบนหัวทุกงวดโดยไม่ต้องกดเปิด
  // งวดที่ยังไม่เคยเปิด = ยังไม่ได้วางบิล (แถวงวดถูกสร้างตอนกดเปิดครั้งแรกเท่านั้น)
  const [milestones, setMilestones] = useState<ArMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMilestoneId, setOpenMilestoneId] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<ArMilestone | null>(null);
  const [milestoneLoading, setMilestoneLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [printDoc, setPrintDoc] = useState<ArDocument | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<ArDocument | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const { t } = useI18n();

  // ใบเสร็จที่ยังไม่ถูกยกเลิก + ยอดชำระแล้ว ต่อใบกำกับภาษี — กติกาการจับคู่อยู่ที่ lib/accounting.ts
  // ที่เดียว (ใช้ร่วมกับหน้ารายการเอกสารและเอกสารพิมพ์ใบแจ้งหนี้/ใบวางบิล)
  const receiptByInvoiceId = useMemo(() => buildReceiptByInvoiceId(documents), [documents]);
  const paidByInvoiceId: ArPaidByInvoiceId = useMemo(() => buildPaidByInvoiceId(documents), [documents]);

  useEffect(() => {
    if (!printDoc) return;
    const reset = () => setPrintDoc(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [printDoc]);

  const handlePrint = async (id: string) => {
    try {
      const doc = await fetchArDocument(id);
      setPrintDoc(doc);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("accounting.jobBilling.toast.openDocFailed"));
    }
  };

  const fetchDetail = () => Promise.all([
    fetchScopeOfWork(scopeOfWorkId),
    fetchArDocuments({ scopeOfWorkId }),
    // สถานะงวดเป็นข้อมูลประกอบ — ถ้าโหลดไม่ได้ หน้ายังใช้งานได้ (หัวงวดแสดง "ยังไม่ได้วางบิล" จนกว่าจะเปิด)
    fetchArMilestones(scopeOfWorkId).catch(() => [] as ArMilestone[]),
  ] as const);

  // Reusable reload — used after issuing documents (see handleIssue). Not passed directly to
  // useEffect below: it calls setLoading(true) synchronously, which the mount effect avoids by
  // fetching inline instead (loading already starts true via useState) — same pattern
  // ScopeOfWorkPage.tsx's loadList()/mount-effect split already uses.
  const reload = () => {
    setLoading(true);
    fetchDetail()
      .then(([s, docs, ms]) => { setScope(s); setDocuments(docs); setMilestones(ms); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    fetchDetail()
      .then(([s, docs, ms]) => { if (!cancelled) { setScope(s); setDocuments(docs); setMilestones(ms); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeOfWorkId]);

  const rememberMilestone = (m: ArMilestone) => {
    setMilestone(m);
    setMilestones((prev) => (prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m]));
  };

  // หัวงวดเป็นแบบพับ/กาง — กดงวดที่เปิดอยู่ซ้ำ = พับเก็บ
  const toggleInstallment = async (installmentId: string) => {
    if (openMilestoneId === installmentId) {
      setOpenMilestoneId(null);
      setMilestone(null);
      return;
    }
    setOpenMilestoneId(installmentId);
    setMilestone(null);
    setMilestoneLoading(true);
    try {
      const m = await openArMilestone(scopeOfWorkId, installmentId);
      rememberMilestone(m);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("accounting.jobBilling.toast.openMilestoneFailed"));
      setOpenMilestoneId(null);
    } finally {
      setMilestoneLoading(false);
    }
  };

  const patchMilestone = async (fields: Partial<Pick<ArMilestone, "workClassification" | "retentionPct" | "checklistState">>) => {
    if (!milestone) return;
    try {
      const updated = await updateArMilestone(milestone.id, fields);
      rememberMilestone(updated);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("accounting.jobBilling.toast.saveFailed"));
    }
  };

  const toggleChecklist = (key: ArChecklistKey) => {
    if (!milestone) return;
    const next = { ...milestone.checklistState, [key]: !milestone.checklistState[key] };
    void patchMilestone({ checklistState: next });
  };

  const handleFileUpload = async (key: ArChecklistKey, file: File) => {
    if (!milestone) return;
    // เตือนตั้งแต่ก่อนอ่านไฟล์ ไม่ต้องรอให้ไฟล์ใหญ่วิ่งขึ้นไปให้เซิร์ฟเวอร์ปฏิเสธ (ขั้นที่ 5)
    const problem = checkBeforeUpload(file);
    if (problem) { showToast(problem); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const dataBase64 = dataUrl.split(",")[1] ?? "";
      try {
        const updated = await uploadArAttachment(milestone.id, key, { fileName: file.name, contentType: file.type, dataBase64 });
        rememberMilestone(updated);
        showToast(t("accounting.jobBilling.toast.fileAttached"));
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : t("accounting.jobBilling.toast.fileAttachFailed"));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleIssueReceipt = async () => {
    if (!receiptTarget || receiptBusy) return;
    setReceiptBusy(true);
    try {
      const re = await issueArReceipt(receiptTarget.id);
      showToast(`${t("accounting.jobBilling.toast.receiptIssuedPrefix")} ${re.docNo} ${t("accounting.jobBilling.toast.doneSuffix")}`);
      setReceiptTarget(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("accounting.jobBilling.toast.receiptIssueFailed"));
    } finally {
      setReceiptBusy(false);
    }
  };

  const handleIssue = async () => {
    if (!milestone || issuing) return;
    setIssuing(true);
    try {
      const docs = await issueArDocuments(milestone.id);
      showToast(`${t("accounting.jobBilling.toast.docsIssuedPrefix")} ${docs.map((d) => d.docNo).join(", ")} ${t("accounting.jobBilling.toast.doneSuffix")}`);
      setOpenMilestoneId(null);
      setMilestone(null);
      reload();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("accounting.jobBilling.toast.issueDocsFailed"));
    } finally {
      setIssuing(false);
    }
  };

  if (loading || !scope) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  const requiredKeys = milestone ? CHECKLIST_KEYS_FOR[milestone.workClassification] : [];
  // งวดมัดจำไม่ต้องแนบใบส่งมอบงาน — ยังไม่มีการส่งมอบให้ลูกค้าเซ็นรับ ตรงกับ checklistIsComplete()
  // ฝั่งเซิร์ฟเวอร์ (api/_lib/arHandler.ts) ที่ยกเว้นให้เหมือนกัน ต้องแก้คู่กันเสมอ
  const alwaysRequired: ArChecklistKey[] = milestone?.isDownPayment ? ["poCopy"] : ["poCopy", "deliveryNote"];
  const checklistOk = alwaysRequired.every((k) => milestone?.checklistState[k] === true);
  // ปุ่มหลักของหน้า = ออกเอกสารของงวดที่เปิดอยู่ · งวดมัดจำออก AR + BI งวดอื่นออก IV + BI (กติกาเดียวกับเซิร์ฟเวอร์)
  const issuable = canIssue && milestone !== null && milestone.billingStatus === "not_billed";
  const principalType = milestone?.isDownPayment ? "AR" : "IV";

  const depositDoc = documents.find((d) => d.docType === "AR" && d.status === "issued");
  const depositReceipt = depositDoc ? receiptByInvoiceId[depositDoc.id] : undefined;
  const installments = scope.paymentConditions.installments;
  const milestoneByInstallment = new Map(milestones.map((m) => [m.installmentId, m]));
  const cancelledCount = documents.filter((d) => d.status === "cancelled").length;

  const installmentsCard = (
    <section className={`${surface.card} overflow-hidden`}>
      <div className={surface.cardHead}>
        <h2 className={`${surface.cardTitle} flex-1`}>{t("accounting.jobBilling.installmentsHeading")}</h2>
        {installments.length > 0 && (
          <span className="text-[13px] text-muted-foreground">{t("accounting.jobBilling.installmentsCount").replace("{n}", String(installments.length))}</span>
        )}
      </div>
      {installments.length === 0 && (
        <p className="px-6 py-5 text-sm text-muted-foreground">{t("accounting.jobBilling.noInstallmentsNotice")}</p>
      )}
      {installments.map((inst, idx) => {
        const known = openMilestoneId === inst.id && milestone ? milestone : milestoneByInstallment.get(inst.id);
        const status = known?.billingStatus ?? "not_billed";
        const isOpen = openMilestoneId === inst.id;
        const issuedHere = known ? documents.filter((d) => d.milestoneId === known.id && d.status === "issued") : [];
        const panelId = `installment-panel-${inst.id}`;
        return (
          <div key={inst.id} className={`border-b border-[#eef1f6] last:border-b-0 ${isOpen ? "shadow-[inset_3px_0_0_#1a5fb4]" : ""}`}>
            <button
              type="button"
              onClick={() => void toggleInstallment(inst.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={`w-full min-h-[68px] px-6 py-3 flex items-center gap-3.5 text-left transition-colors ${isOpen ? "bg-[#f8f9fc]" : "bg-white hover:bg-[#f8f9fc]"}`}
            >
              {status !== "not_billed" ? (
                <span className="w-7 h-7 rounded-full bg-[#e6f4ec] text-[#1b7f4f] flex items-center justify-center flex-shrink-0"><Check size={15} strokeWidth={3} /></span>
              ) : (
                <span className={`w-7 h-7 rounded-full text-xs font-semibold flex items-center justify-center flex-shrink-0 ${isOpen ? "bg-[#0b1d3a] text-white" : "border border-[#c3ccda] text-muted-foreground"}`}>{idx + 1}</span>
              )}
              <span className="flex-1 min-w-0 flex flex-col leading-snug">
                <span className="text-sm font-semibold text-foreground">{inst.label} — {inst.pct ?? "-"}%</span>
                <span className="text-xs text-muted-foreground">
                  {inst.paymentType}{inst.days ? ` ${inst.days} ${t("accounting.jobBilling.daysUnit")}` : ""}
                  {issuedHere.length > 0 && <> · {t("accounting.jobBilling.issuedPrefix")} <span className="font-mono">{issuedHere.map((d) => d.docNo).join(" + ")}</span></>}
                </span>
              </span>
              {isOpen && milestoneLoading ? <Loader2 className="animate-spin text-muted-foreground" size={16} /> : <BillingStatusPill status={status} />}
              <ChevronDown size={18} className={`flex-shrink-0 transition-transform ${isOpen ? "rotate-180 text-foreground" : "text-[#a3aec2]"}`} />
            </button>

            {isOpen && milestone && (
              <div id={panelId} className="px-6 md:pl-[66px] pt-5 pb-6 flex flex-col gap-[18px]">
                {milestone.billingStatus === "not_billed" ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-[240px_minmax(0,1fr)] gap-x-5 gap-y-1.5 items-end">
                      <label className="flex flex-col gap-1.5">
                        <span className={field.label}>{t("accounting.jobBilling.workClassificationLabel")}</span>
                        <select
                          value={milestone.workClassification}
                          disabled={!canCreate}
                          onChange={(e) => void patchMilestone({ workClassification: e.target.value as ArWorkClassification })}
                          className={`${field.input} w-full`}
                        >
                          {(Object.keys(WORK_CLASSIFICATION_LABEL_KEY) as ArWorkClassification[]).map((k) => (
                            <option key={k} value={k}>{t(WORK_CLASSIFICATION_LABEL_KEY[k])}</option>
                          ))}
                        </select>
                      </label>
                      <span className={`${field.help} sm:pb-2.5`}>{t("accounting.jobBilling.workClassificationHelp")}</span>
                    </div>

                    <div className="border border-border rounded-[10px] overflow-hidden">
                      <div className="px-4 py-2.5 bg-[#f8f9fc] border-b border-border flex items-center gap-2.5">
                        <span className="flex-1 text-[13px] font-semibold text-[#26395a]">{t("accounting.jobBilling.checklistHeading")}</span>
                        {/* Phase 1: ไฟล์แนบนับรวมทั้งงวด ยังไม่ได้ผูกทีละหัวข้อ */}
                        {milestone.attachmentIds.length > 0 && (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                            <Paperclip size={13} />
                            {t("accounting.jobBilling.attachedCount").replace("{n}", String(milestone.attachmentIds.length))}
                          </span>
                        )}
                      </div>
                      {requiredKeys.map((key) => {
                        const checked = milestone.checklistState[key] === true;
                        return (
                          <div key={key} className="min-h-[52px] pl-4 pr-2 py-1.5 border-b border-[#eef1f6] flex items-center gap-3">
                            <label className={`flex-1 min-w-0 flex items-center gap-3 ${canCreate ? "cursor-pointer" : ""}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canCreate}
                                onChange={() => toggleChecklist(key)}
                                className="w-[18px] h-[18px] flex-shrink-0 accent-[#0b1d3a]"
                              />
                              <span className="text-sm text-foreground">
                                {t(CHECKLIST_LABEL_KEY[key])}
                                {alwaysRequired.includes(key) && <span className="text-[#b93636]"> *</span>}
                              </span>
                            </label>
                            {canCreate && (
                              <label className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[#1a5fb4]/30">
                                <Paperclip size={14} />
                                {t("accounting.jobBilling.attachFile")}
                                <input type="file" accept={ACCEPT_ALL_UPLOADS} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(key, f); }} />
                              </label>
                            )}
                          </div>
                        );
                      })}
                      <p className="px-4 py-2.5 text-xs text-muted-foreground">
                        <span className="text-[#b93636]">*</span> {t("accounting.jobBilling.checklistRequiredNotice")}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("accounting.jobBilling.installmentAlreadyIssuedNotice")}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );

  const rail = (
    <>
      {depositDoc ? (
        <RailTotalCard
          label={t("accounting.jobBilling.rail.depositIssued")}
          amount={`฿${money(depositDoc.netTotal)}`}
          rows={[
            { label: t(DOC_TYPE_LABEL_KEY.AR), value: <span className="font-mono">{depositDoc.docNo}</span> },
            { label: t(DOC_TYPE_LABEL_KEY.RE), value: depositReceipt ? <span className="font-mono">{depositReceipt.docNo}</span> : t("accounting.list.receiptNotIssued") },
          ]}
        />
      ) : (
        <div className="rounded-xl bg-[#fdf3e0] border border-[#f0d9a8] px-4 py-3.5 flex gap-3 text-[#8a5a00]">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <span className="text-sm font-medium">{t("accounting.jobBilling.depositNotIssuedNotice")}</span>
        </div>
      )}
      <RailCard title={t("accounting.jobBilling.rail.job")}>
        <ReadonlyField label={t("accounting.list.col.customer")} value={scope.customerSnapshot.companyName} />
        <div className="grid grid-cols-2 gap-3">
          <ReadonlyField label={t("accounting.list.col.scopeNumber")} value={scope.scopeNumber} mono />
          <ReadonlyField label={t("accounting.jobBilling.picker.col.quotation")} value={scope.quotationNumber} mono />
        </div>
      </RailCard>
      {(canCreate || canIssue) && (
        <NextStepHint title={t("accounting.jobBilling.nextStep.title")}>{t("accounting.jobBilling.nextStep.body")}</NextStepHint>
      )}
    </>
  );

  return (
    <>
    {/* ส่วนแสดงผลบนหน้าจอทั้งหมดต้องซ่อนตอนพิมพ์ — เอกสารพิมพ์ (ArDocumentPrintDocument ด้านล่าง)
        ต้องเป็นสิ่งเดียวที่ออกกระดาษ (pattern เดียวกับ DeliveryOrderDocument's print:hidden blocks) */}
    <div className="flex-1 flex flex-col overflow-y-auto print:hidden">
      <DocumentHeader
        backLabel={t("accounting.jobBilling.backToList")}
        onBack={onBack}
        number={scope.scopeNumber}
        status={<span className="text-sm text-[#3d5173] min-w-0 truncate">{scope.customerSnapshot.companyName} · <span className="font-mono text-[13px]">{scope.quotationNumber}</span></span>}
        meta={milestone ? <>{t("accounting.jobBilling.selectedInstallment")} {milestone.label} — {milestone.pct ?? "-"}%</> : undefined}
        actions={issuable ? (
          <button
            type="button"
            onClick={() => void handleIssue()}
            disabled={!checklistOk || issuing}
            title={!checklistOk ? t("accounting.jobBilling.checklistRequiredNotice") : undefined}
            className={btn.primary}
          >
            {issuing ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
            {t("accounting.jobBilling.issueDocsBtn")} ({principalType} + BI)
          </button>
        ) : undefined}
      />

      <div className="px-4 md:px-8 pt-6 pb-10 flex flex-col gap-5">
        <DocumentColumns main={installmentsCard} rail={rail} />

        <section className={surface.card}>
          <div className={surface.cardHead}>
            <h2 className={surface.cardTitle}>{t("accounting.jobBilling.issuedDocsHeading")}</h2>
            {documents.length > 0 && (
              <span className="text-[13px] text-muted-foreground">
                {t("accounting.jobBilling.issuedDocsCount").replace("{n}", String(documents.length)).replace("{c}", String(cancelledCount))}
              </span>
            )}
          </div>
          {documents.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted-foreground">{t("accounting.jobBilling.noIssuedDocsNotice")}</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className={`grid ${ISSUED_DOCS_GRID} items-center px-6 ${table.head}`}>
                  <span>{t("accounting.list.col.docNo")}</span>
                  <span>{t("accounting.jobBilling.col.type")}</span>
                  <span>{t("accounting.list.col.status")}</span>
                  <span className="text-right pr-6">{t("accounting.list.col.netTotal")}</span>
                  <span />
                </div>
                {documents.map((d) => {
                  // ใบเสร็จที่ยังใช้งานซึ่งอ้างถึงใบกำกับภาษีฉบับนี้ (ผูกผ่าน linkedArDocumentId ในบรรทัดรายการ)
                  const receipt = (d.docType === "AR" || d.docType === "IV") ? receiptByInvoiceId[d.id] : undefined;
                  const cancelled = d.status === "cancelled";
                  return (
                    <div key={d.id} className={`grid ${ISSUED_DOCS_GRID} items-center px-6 min-h-14 py-2 border-b border-[#eef1f6] last:border-b-0`}>
                      <span className={`font-mono text-[13px] font-medium ${cancelled ? "text-muted-foreground" : "text-foreground"}`}>{d.docNo}</span>
                      <span className="text-sm text-[#3d5173] truncate pr-3">{t(DOC_TYPE_LABEL_KEY[d.docType])}</span>
                      <span className="flex flex-col items-start gap-0.5">
                        <DocStatusPill status={d.status} />
                        {receipt && <span className="text-xs text-[#1b7f4f]">{t("accounting.jobBilling.paidLabel")} (<span className="font-mono">{receipt.docNo}</span>)</span>}
                      </span>
                      <span className={`text-right pr-6 tabular-nums font-semibold ${cancelled ? "text-[#8a97ad] line-through" : "text-foreground"}`}>{money(d.netTotal)}</span>
                      <span className="flex items-center justify-end gap-1">
                        {canIssue && d.status === "issued" && (d.docType === "AR" || d.docType === "IV") && !receipt && (
                          <button type="button" onClick={() => setReceiptTarget(d)} className={`${btn.secondarySm.replace("h-9", "h-8")} mr-1`}>
                            {t("accounting.jobBilling.issueReceiptBtn")}
                          </button>
                        )}
                        <RowIconButton icon={Printer} label={t("accounting.jobBilling.printTitle")} onClick={() => void handlePrint(d.id)} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <AccountingDialog
        open={receiptTarget !== null}
        tone="success"
        icon={Receipt}
        title={t("accounting.jobBilling.receiptDialog.title")}
        message={t("accounting.receiptDialog.message")}
        confirmLabel={receiptBusy ? t("accounting.jobBilling.receiptDialog.busy") : t("accounting.jobBilling.issueReceiptBtn")}
        confirmIcon={Receipt}
        busy={receiptBusy}
        onConfirm={() => void handleIssueReceipt()}
        onCancel={() => setReceiptTarget(null)}
      >
        {receiptTarget && (
          <SummaryBox
            mono
            primary={receiptTarget.docNo}
            secondary={`${receiptTarget.customerSnapshot.companyName} · ${scope.scopeNumber}`}
            amountLabel={t("accounting.summary.netTotal")}
            amount={`฿${money(receiptTarget.netTotal)}`}
          />
        )}
      </AccountingDialog>
    </div>
    {printDoc && <ArDocumentPrintDocument document={printDoc} paidByInvoiceId={paidByInvoiceId} />}
    </>
  );
}
