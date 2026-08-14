import { useEffect, useRef, useState } from "react";
import { ChevronRight, Printer, Copy, Save, CheckCircle2, RotateCw, Trash2, Loader2, AlertTriangle, GitBranch, Plus, Send, Wand2, Truck, BellRing } from "lucide-react";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import type { User } from "../../lib/users";
import {
  type ScopeOfWork, type ScopeOfWorkUpdateFields, type ScopeOfWorkSignatory, type ScopeOfWorkPaymentInstallment,
  type ScopeOfWorkPaymentType,
  fetchScopeOfWork, updateScopeOfWork, finalizeScopeOfWork, duplicateScopeOfWork, rewriteScopeOfWork,
  submitScopeOfWorkApproval, rejectScopeOfWork, withdrawScopeOfWorkApproval,
  refreshScopeOfWorkFromQuotation, deleteScopeOfWork, logScopeOfWorkPrinted, blankScopeOfWorkItem,
  blankPaymentInstallment, newPaymentInstallmentId, PAYMENT_TERM_PRESETS, sendScopeOfWorkDocumentNotifications,
  fetchScopeOfWorksByQuotation, uploadScopeOfWorkAttachment, deleteScopeOfWorkAttachment, MAX_ATTACHMENT_BYTES,
  chaseScopeOfWorkPo,
} from "../../lib/scopeOfWork";
import { type DeliveryOrderSummary, fetchDeliveryOrdersByScope, createDeliveryOrderFromScope } from "../../lib/deliveryOrder";
import { getRevisionPredecessorId, getRevisionNumber, generateScopeOfWorkRevisionSummary, appendRevisionNoteEntry } from "../../lib/revisionDiff";
import { compressImageFile, isCompressibleImage } from "../../lib/imageCompression";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import type { DriveStep } from "driver.js";
import { useI18n } from "../../lib/i18n";
import { ChecklistGroupCard } from "./ChecklistGroupCard";
import { DocumentRecipientsPicker } from "./DocumentRecipientsPicker";
import { ScopeOfWorkItemsEditor } from "./ScopeOfWorkItemsEditor";
import { ScopeOfWorkPrintDocument } from "./ScopeOfWorkPrintDocument";
import { RequiredFieldLabel } from "../../components/RequiredFieldLabel";
import { FieldError } from "../../components/FieldError";
import { ValidationSummary } from "../../components/ValidationSummary";
import { DocumentCompletionIndicator } from "../../components/DocumentCompletionIndicator";
import { validateChecklistGroups, MANDATORY_CHECKLIST_GROUP_KEYS, ADDITIONAL_RECIPIENT_KEY } from "../../lib/documentRequirements";
import { validateScopeOfWorkForFinalization, validateScopeOfWorkForPrint, scopeOfWorkRequiredFields } from "../../lib/validation/scopeOfWorkValidation";
import { mergeServerValidationErrors } from "../../lib/validation/types";

// แปลงข้อมูล Scope of Work เต็มรูปแบบให้เหลือเฉพาะฟิลด์ที่ใช้บันทึกอัปเดตได้ (สำหรับฉบับร่าง)
// Converts a full Scope of Work record into just the fields allowed for a Draft update
function toUpdateFields(s: ScopeOfWork): ScopeOfWorkUpdateFields {
  return {
    scopeNumber: s.scopeNumber,
    issueDate: s.issueDate,
    deliveryDate: s.deliveryDate,
    drawingCode: s.drawingCode,
    customerPoNumber: s.customerPoNumber,
    secondaryCode: s.secondaryCode,
    deliveryLocation: s.deliveryLocation,
    shippingContact: s.shippingContact,
    shippingPhone: s.shippingPhone,
    billingContact: s.billingContact,
    billingPhone: s.billingPhone,
    checklistGroups: s.checklistGroups,
    items: s.items,
    paymentConditions: s.paymentConditions,
    documentRecipients: s.documentRecipients,
    documentRecipientMessage: s.documentRecipientMessage,
    revisionNote: s.revisionNote,
    remarks: s.remarks,
    seller: s.seller,
    approver: s.approver,
  };
}

// แปลงข้อมูลให้เหลือเฉพาะฟิลด์ติดตามผลที่แก้ไขได้แม้เอกสารผ่านการอนุมัติแล้ว (เช่น เลข PO)
// Converts a record into just the follow-up fields editable even after approval (e.g. PO number)
function toFollowUpFields(s: ScopeOfWork): ScopeOfWorkUpdateFields {
  return {
    customerPoNumber: s.customerPoNumber,
    documentRecipients: s.documentRecipients,
    documentRecipientMessage: s.documentRecipientMessage,
  };
}

// ช่องแก้ไขข้อมูลผู้ลงนามคนหนึ่ง (เลือกพนักงานหรือกรอกชื่อเอง พร้อมวันที่)
// Editor for one signatory: pick an employee or type a free-text name, plus a date
function SignatoryEditor({ label, value, onChange, users, disabled, required, error }: {
  label: string;
  value: ScopeOfWorkSignatory;
  onChange: (next: ScopeOfWorkSignatory) => void;
  users: User[];
  disabled: boolean;
  required?: boolean;
  error?: string;
}) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-[10px] text-muted-foreground font-mono mb-1.5">{label} {required && <span className="text-[#e05252]">*</span>}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
        <select
          disabled={disabled}
          className="text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none disabled:opacity-60"
          value={value.userId}
          onChange={(e) => {
            const user = users.find((u) => u.id === e.target.value);
            onChange({ ...value, userId: e.target.value, name: user ? user.fullName : value.name });
          }}
        >
          <option value="">{t("scopeOfWorkDoc.selectUserPlaceholder")}</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
        <input
          disabled={disabled}
          className="text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder={t("scopeOfWorkDoc.nameFreeTextPlaceholder")}
        />
      </div>
      <input
        disabled={disabled}
        type="date"
        className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
        value={value.date}
        onChange={(e) => onChange({ ...value, date: e.target.value })}
      />
      <FieldError message={error} />
    </div>
  );
}

// ตารางแก้ไขงวดการชำระเงิน เพิ่ม/ลบ/แก้ไขงวดได้อิสระ พร้อมปุ่มเลือกรูปแบบสำเร็จรูป
// Editable payment installment table, freely addable/removable, with quick-apply preset buttons
function PaymentInstallmentsEditor({ installments, onChange, disabled }: {
  installments: ScopeOfWorkPaymentInstallment[];
  onChange: (next: ScopeOfWorkPaymentInstallment[]) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const updateRow = (id: string, patch: Partial<ScopeOfWorkPaymentInstallment>) =>
    onChange(installments.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const removeRow = (id: string) => onChange(installments.filter((row) => row.id !== id));
  const addRow = () => onChange([...installments, blankPaymentInstallment()]);
  const applyPreset = (preset: (typeof PAYMENT_TERM_PRESETS)[number]) =>
    onChange(preset.installments.map((row) => ({ ...row, id: newPaymentInstallmentId() })));
  const total = installments.reduce((sum, row) => sum + (row.pct ?? 0), 0);

  return (
    <div className="sm:col-span-2 space-y-2.5">
      <label className="text-xs text-muted-foreground block">{t("scopeOfWorkDoc.installmentsLabel")}</label>
      {!disabled && (
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_TERM_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="px-2.5 py-1 text-[11px] border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {installments.length > 0 && (
        <div className="space-y-1.5">
          {installments.map((row) => (
            <div key={row.id} className="flex items-center gap-1.5 flex-wrap">
              <input
                disabled={disabled}
                value={row.label}
                onChange={(e) => updateRow(row.id, { label: e.target.value })}
                placeholder={t("scopeOfWorkDoc.installmentLabelPlaceholder")}
                className="flex-1 min-w-[120px] text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
              />
              <input
                disabled={disabled}
                type="number"
                min={0}
                max={100}
                value={row.pct ?? ""}
                onChange={(e) => updateRow(row.id, { pct: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })}
                placeholder="%"
                className="w-16 text-xs text-right text-foreground bg-secondary border border-border rounded-lg px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
              />
              <select
                disabled={disabled}
                value={row.paymentType}
                onChange={(e) => updateRow(row.id, { paymentType: e.target.value as ScopeOfWorkPaymentType })}
                className="text-xs text-foreground bg-secondary border border-border rounded-lg px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none disabled:opacity-60"
              >
                <option value="">{t("scopeOfWorkDoc.paymentTypePlaceholder")}</option>
                <option value="Cash">Cash</option>
                <option value="Credit">Credit</option>
              </select>
              <input
                disabled={disabled}
                type="number"
                min={0}
                value={row.days ?? ""}
                onChange={(e) => updateRow(row.id, { days: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 })}
                placeholder={t("scopeOfWorkDoc.daysPlaceholder")}
                title={t("scopeOfWorkDoc.daysTitle")}
                className="w-24 text-xs text-right text-foreground bg-secondary border border-border rounded-lg px-2 py-1.5 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
              />
              {!disabled && (
                <button onClick={() => removeRow(row.id)} title={t("scopeOfWorkDoc.removeInstallment")} aria-label={t("scopeOfWorkDoc.removeInstallment")} className="text-muted-foreground hover:text-[#e05252] transition-colors flex-shrink-0 p-1"><Trash2 size={13} /></button>
              )}
            </div>
          ))}
          <p className={`text-[10px] font-mono ${total === 100 ? "text-[#2aa36b]" : "text-muted-foreground"}`}>{t("scopeOfWorkDoc.installmentsTotal")} {total}%</p>
        </div>
      )}
      {!disabled && (
        <button onClick={addRow} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
          <Plus size={11} /> {t("scopeOfWorkDoc.addInstallment")}
        </button>
      )}
    </div>
  );
}

// แบบฟอร์มเอกสาร Scope of Work แบบเต็ม รวมข้อมูลลูกค้า รายการงาน เงื่อนไขชำระเงิน ขั้นตอนอนุมัติ และมุมมองพิมพ์
// Full Scope of Work document form, covering customer info, work items, payment terms, approval workflow, and print view
export function ScopeOfWorkDocument({
  scopeOfWorkId,
  company,
  users,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canCreate,
  canChasePo,
  canViewDeliveryOrder,
  canCreateDeliveryOrder,
  onOpenDeliveryOrder,
  onBack,
  backLabel,
  onDuplicated,
  onRewritten,
  showToast,
}: {
  scopeOfWorkId: string;
  company: Company;
  users: User[];
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  canChasePo: boolean;
  canViewDeliveryOrder: boolean;
  canCreateDeliveryOrder: boolean;
  onOpenDeliveryOrder: (deliveryOrderId: string) => void;
  onBack: () => void;
  backLabel?: string;
  onDuplicated: (newId: string) => void;
  onRewritten: (newId: string) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const resolvedBackLabel = backLabel ?? t("scopeOfWorkDoc.backToQuotation");
  const BLOCKED_TOOLTIP = t("scopeOfWorkDoc.blockedTooltip");
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const [scope, setScope] = useState<ScopeOfWork | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"submit" | "finalize" | "withdraw" | "refresh" | "delete" | null>(null);
  const [actionRunning, setActionRunning] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [serverValidationErrors, setServerValidationErrors] = useState<{ fieldErrors: Record<string, string>; groupErrors: Record<string, string[]> } | null>(null);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [sendingDocs, setSendingDocs] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [generatingRevisionNote, setGeneratingRevisionNote] = useState(false);
  const [chasingPo, setChasingPo] = useState(false);
  const [promptOpen, setPromptOpen] = useState<"reject" | "duplicate" | null>(null);
  const [existingDeliveryOrder, setExistingDeliveryOrder] = useState<DeliveryOrderSummary | null>(null);
  const [deliveryOrderBusy, setDeliveryOrderBusy] = useState(false);
  useEffect(() => {
    if (!canViewDeliveryOrder) return;
    let cancelled = false;
    fetchDeliveryOrdersByScope(scopeOfWorkId)
      .then((list) => { if (!cancelled) setExistingDeliveryOrder(list[0] ?? null); })
      .catch(() => { if (!cancelled) setExistingDeliveryOrder(null); });
    return () => { cancelled = true; };
  }, [scopeOfWorkId, canViewDeliveryOrder]);

  useEffect(() => {
    let cancelled = false;
    fetchScopeOfWork(scopeOfWorkId)
      .then((s) => { if (!cancelled) setScope(s); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [scopeOfWorkId, reloadKey]);

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="sowdoc-actions"]', popover: { title: t("tour.sowdoc.actions.title"), description: t("tour.sowdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="sowdoc-completion"]', popover: { title: t("tour.sowdoc.completion.title"), description: t("tour.sowdoc.completion.desc"), side: "bottom" } },
    { element: '[data-tour="sowdoc-header"]', popover: { title: t("tour.sowdoc.header.title"), description: t("tour.sowdoc.header.desc"), side: "top" } },
    { element: '[data-tour="sowdoc-checklist"]', popover: { title: t("tour.sowdoc.checklist.title"), description: t("tour.sowdoc.checklist.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("scopeOfWorkDoc", currentUserId, docTourSteps, { autoStart: !!scope });

  if (loadError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {resolvedBackLabel}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle size={20} className="text-[#e05252]" />
          <p className="text-sm text-muted-foreground">{t("scopeOfWork.loadError")}</p>
          <button onClick={() => { setLoadError(false); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <RotateCw size={12} /> {t("scopeOfWork.retry")}
          </button>
        </div>
      </div>
    );
  }
  if (!scope) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {resolvedBackLabel}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-2.5 p-6">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">{t("scopeOfWork.loading")}</p>
        </div>
      </div>
    );
  }

  const isDraft = scope.status === "Draft";
  const editable = canEdit && isDraft;
  const updateField = <K extends keyof ScopeOfWork>(field: K, value: ScopeOfWork[K]) => setScope((prev) => (prev ? { ...prev, [field]: value } : prev));

  const clientPrintValidation = validateScopeOfWorkForPrint(scope);
  const clientFinalizeValidation = validateScopeOfWorkForFinalization(scope);
  const printValidation = mergeServerValidationErrors(clientPrintValidation, serverValidationErrors);
  const finalizeValidation = mergeServerValidationErrors(clientFinalizeValidation, serverValidationErrors);
  const checklistValidation = validateChecklistGroups(scope.checklistGroups);
  const itemErrors: Record<string, string> = {};
  for (const [key, message] of Object.entries(finalizeValidation.fieldErrors)) {
    if (key.startsWith("items.")) itemErrors[key.slice(6)] = message;
  }
  const summaryMessages = [...Object.values(finalizeValidation.fieldErrors), ...Object.values(finalizeValidation.groupErrors).flat()];
  const totalRequiredChecks = Object.values(scopeOfWorkRequiredFields).filter((f) => f.required).length + MANDATORY_CHECKLIST_GROUP_KEYS.length + 1 + 1;

  // บันทึกฉบับร่างเต็มรูปแบบ หรือเฉพาะฟิลด์ติดตามผลถ้าเอกสารผ่านการอนุมัติแล้ว
  // Saves the full draft, or just the follow-up fields once the record is no longer a Draft
  const save = async () => {
    if (!scope) return;
    try {
      setSaving(true);
      const updated = await updateScopeOfWork(scope.id, isDraft ? toUpdateFields(scope) : toFollowUpFields(scope));
      setScope(updated);
      showToast(isDraft ? "บันทึกร่างแล้ว" : "บันทึกเลข PO / ผู้รับเอกสารแล้ว");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // ส่งการแจ้งเตือนทวงเลข PO ไปยังพนักงานขายของเอกสารนี้
  // Sends a chase-for-PO-number notification to this record's salesperson
  const handleChasePo = async () => {
    if (!scope || chasingPo) return;
    setChasingPo(true);
    try {
      const { notifiedUserName } = await chaseScopeOfWorkPo(scope.id);
      showToast(`ส่งการแจ้งเตือนทวงเลข PO ถึง ${notifiedUserName} แล้ว`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ส่งการแจ้งเตือนไม่สำเร็จ");
    } finally {
      setChasingPo(false);
    }
  };

  // บันทึกข้อมูลก่อน แล้วจึงส่งแจ้งเตือนในระบบถึงผู้รับเอกสารที่เลือกไว้ (ไม่มีอีเมลแล้ว — 2026-08-07)
  // Saves first, then sends the in-app notifications to the selected recipients (email removed 2026-08-07)
  const handleSendDocuments = async () => {
    if (!scope || sendingDocs) return;
    setSendingDocs(true);
    try {
      const saved = await updateScopeOfWork(scope.id, isDraft ? toUpdateFields(scope) : toFollowUpFields(scope));
      setScope(saved);
      const result = await sendScopeOfWorkDocumentNotifications(scope.id);
      showToast(`ส่งแจ้งเตือนผู้รับเอกสารแล้ว (${result.sentCount} คน)`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ส่งแจ้งเตือนไม่สำเร็จ");
    } finally {
      setSendingDocs(false);
    }
  };

  // อัปโหลดไฟล์แนบทันที (ไม่ต้องรอกดบันทึก) — ถ้าเป็นรูปภาพจะบีบอัดเป็น WebP ก่อน (ไฟล์อื่น เช่น PDF ผ่านเส้นทางเดิม)
  // แล้วแปลงเป็น base64 ก่อนส่งขึ้นเซิร์ฟเวอร์ ตรวจขนาดไฟล์หลังบีบอัดแล้ว (ไม่ใช่ก่อนบีบอัด) เพื่อให้รูปที่เคยเกิน
  // ขนาดมีโอกาสผ่านได้ง่ายขึ้น
  // Uploads an attachment immediately (not part of the unsaved draft) — images are compressed to
  // WebP first (non-images, e.g. PDFs, keep the original raw path unchanged), then converted to
  // base64. The size cap is checked against the *compressed* output, not the original file, so
  // compression can only help a file fit under the cap, never hurt it.
  const handleUploadAttachment = async (file: File) => {
    if (!scope || uploadingAttachment) return;
    setUploadingAttachment(true);
    try {
      const isImage = isCompressibleImage(file);
      const payloadBlob: Blob = isImage ? (await compressImageFile(file)).blob : file;
      if (payloadBlob.size > MAX_ATTACHMENT_BYTES) {
        showToast(`ไฟล์ต้องมีขนาดไม่เกิน ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB`);
        return;
      }
      const buffer = await payloadBlob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const updated = await uploadScopeOfWorkAttachment(scope.id, {
        fileName: file.name,
        contentType: isImage ? "image/webp" : (file.type || "application/octet-stream"),
        dataBase64: btoa(binary),
      });
      setScope((prev) => (prev ? { ...prev, attachments: updated.attachments ?? [] } : prev));
      showToast(`แนบไฟล์ "${file.name}" แล้ว`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "แนบไฟล์ไม่สำเร็จ");
    } finally {
      setUploadingAttachment(false);
    }
  };
  // ลบไฟล์แนบทันทีจากเซิร์ฟเวอร์
  // Deletes an attachment immediately on the server
  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!scope || uploadingAttachment) return;
    setUploadingAttachment(true);
    try {
      const updated = await deleteScopeOfWorkAttachment(scope.id, attachmentId);
      setScope((prev) => (prev ? { ...prev, attachments: updated.attachments ?? [] } : prev));
      showToast("ลบไฟล์แนบแล้ว");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ลบไฟล์แนบไม่สำเร็จ");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const revisionPredecessorScopeNumber = getRevisionPredecessorId(scope.scopeNumber);
  // สร้างสรุปการแก้ไขอัตโนมัติโดยดึงข้อมูลต้นฉบับมาเทียบกับฉบับปัจจุบัน
  // Auto-generates a revision-note summary by fetching the predecessor and diffing it against the current record
  const handleGenerateRevisionNote = async () => {
    if (!revisionPredecessorScopeNumber || generatingRevisionNote) return;
    setGeneratingRevisionNote(true);
    try {
      const siblings = await fetchScopeOfWorksByQuotation(scope.quotationId);
      const predecessorSummary = siblings.find((s) => s.scopeNumber === revisionPredecessorScopeNumber);
      if (!predecessorSummary) {
        showToast("ไม่พบข้อมูลต้นฉบับสำหรับเปรียบเทียบ");
        return;
      }
      const predecessor = await fetchScopeOfWork(predecessorSummary.id);
      setScope((prev) => {
        if (!prev) return prev;
        const summary = generateScopeOfWorkRevisionSummary(predecessor, prev, users);
        const revisionNote = appendRevisionNoteEntry(predecessor.revisionNote, getRevisionNumber(prev.scopeNumber), summary);
        return { ...prev, revisionNote };
      });
      showToast("สร้างสรุปการแก้ไขอัตโนมัติแล้ว — ตรวจสอบและแก้ไขเพิ่มเติมได้ตามต้องการ");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "สร้างสรุปไม่สำเร็จ");
    } finally {
      setGeneratingRevisionNote(false);
    }
  };

  // เปิดใบส่งมอบสินค้าที่มีอยู่แล้ว หรือสร้างใหม่จาก Scope of Work นี้แล้วเปิดขึ้นมา
  // Opens the existing Delivery Order, or creates a new one from this Scope of Work and opens it
  const handleDeliveryOrderClick = async () => {
    if (!scope || deliveryOrderBusy) return;
    if (existingDeliveryOrder) {
      onOpenDeliveryOrder(existingDeliveryOrder.id);
      return;
    }
    setDeliveryOrderBusy(true);
    try {
      const created = await createDeliveryOrderFromScope(scope.id);
      onOpenDeliveryOrder(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ไม่สามารถสร้างใบส่งมอบสินค้าได้");
    } finally {
      setDeliveryOrderBusy(false);
    }
  };

  // ตรวจสอบความครบถ้วน บันทึกการพิมพ์ที่เซิร์ฟเวอร์ แล้วเปิดหน้าต่างพิมพ์ของเบราว์เซอร์
  // Validates completeness, logs the print on the server, then opens the browser print dialog
  const handlePrint = async () => {
    if (!scope) return;
    if (!printValidation.valid) {
      showToast(BLOCKED_TOOLTIP);
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setServerValidationErrors(null);
    try {
      await logScopeOfWorkPrinted(scope.id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        showToast(err.message);
        if (err.code === "DOCUMENT_INCOMPLETE") {
          setServerValidationErrors({ fieldErrors: err.fieldErrors ?? {}, groupErrors: err.groupErrors ?? {} });
          summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
    }
    window.print();
  };

  // ส่งขออนุมัติ โดยตรวจสอบเฉพาะระดับความครบถ้วนสำหรับพิมพ์ ไม่บังคับลายเซ็นผู้อนุมัติ
  // Submits for approval, checking only print-level completeness (approver signature not required yet)
  const handleSubmitClick = () => {
    if (!printValidation.valid) {
      showToast(BLOCKED_TOOLTIP);
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setConfirmAction("submit");
  };

  // ปฏิเสธเอกสารพร้อมเหตุผลที่กรอกไว้ ตีกลับเป็นฉบับร่าง
  // Rejects the document with the given comment, sending it back to Draft
  const confirmReject = async (comment: string) => {
    if (!scope) return;
    setPromptOpen(null);
    try {
      const updated = await rejectScopeOfWork(scope.id, comment);
      setScope(updated);
      showToast("ตีกลับเป็นฉบับร่างแล้ว");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ปฏิเสธไม่สำเร็จ");
    }
  };

  // ทำสำเนา Scope of Work ด้วยเลขที่เอกสารที่กรอกเอง แล้วเปิดฉบับสำเนาขึ้นมา
  // Duplicates the Scope of Work with a manually entered document number, then opens the copy
  const confirmDuplicate = async (scopeNumber: string) => {
    if (!scope) return;
    setPromptOpen(null);
    try {
      const created = await duplicateScopeOfWork(scope.id, scopeNumber);
      showToast(`ทำสำเนาเป็น ${created.scopeNumber} แล้ว`);
      onDuplicated(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ทำสำเนาไม่สำเร็จ");
    }
  };

  // เขียน Scope of Work ใหม่เป็นฉบับแก้ไข แล้วเปิดฉบับที่สร้างขึ้นมา
  // Rewrites the Scope of Work into a new revision, then opens it
  const handleRewrite = async () => {
    if (!scope || rewriteBusy) return;
    setRewriteBusy(true);
    try {
      const created = await rewriteScopeOfWork(scope.id);
      showToast(`สร้าง Scope of Work แก้ไข ${created.scopeNumber} แล้ว`);
      onRewritten(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "สร้าง Scope of Work แก้ไขไม่สำเร็จ");
    } finally {
      setRewriteBusy(false);
    }
  };

  // ดำเนินการตาม action ที่รอยืนยันอยู่ (ส่งอนุมัติ/อนุมัติ/ถอนคำขอ/รีเฟรช/ลบ) ตามที่เลือกไว้
  // Runs the currently pending confirmed action (submit/finalize/withdraw/refresh/delete)
  const runConfirmedAction = async () => {
    if (!scope || !confirmAction || actionRunning) return;
    if (confirmAction === "finalize" || confirmAction === "submit") setServerValidationErrors(null);
    setActionRunning(true);
    try {
      if (confirmAction === "submit") {
        const updated = await submitScopeOfWorkApproval(scope.id);
        setScope(updated);
        showToast("ส่งขออนุมัติแล้ว");
      } else if (confirmAction === "finalize") {
        const updated = await finalizeScopeOfWork(scope.id);
        setScope(updated);
        showToast("อนุมัติแล้ว (Final)");
      } else if (confirmAction === "withdraw") {
        const updated = await withdrawScopeOfWorkApproval(scope.id);
        setScope(updated);
        showToast("ถอนคำขออนุมัติแล้ว กลับเป็นฉบับร่าง");
      } else if (confirmAction === "refresh") {
        const updated = await refreshScopeOfWorkFromQuotation(scope.id);
        setScope(updated);
        showToast("อัปเดตข้อมูลจากใบเสนอราคาแล้ว");
      } else if (confirmAction === "delete") {
        await deleteScopeOfWork(scope.id);
        showToast("ลบ Scope of Work แล้ว");
        onBack();
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ดำเนินการไม่สำเร็จ");
      if ((confirmAction === "finalize" || confirmAction === "submit") && err instanceof ApiError && err.code === "DOCUMENT_INCOMPLETE") {
        setServerValidationErrors({ fieldErrors: err.fieldErrors ?? {}, groupErrors: err.groupErrors ?? {} });
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } finally {
      setConfirmAction(null);
      setActionRunning(false);
    }
  };

  const noSourceItems = scope.items.length === 0;
  const documentsToSendGroup = scope.checklistGroups.find((g) => g.key === "documentsToSend");
  const checkedDocumentsToSendKeys = new Set((documentsToSendGroup?.options ?? []).filter((o) => o.checked).map((o) => o.key));
  // "ผู้รับเพิ่มเติม" นับเป็นผู้รับเสมอ ไม่ต้องรอติ๊กแผนกใน "เอกสารส่งถึง" (2026-08-07)
  const hasDocumentRecipientsToSend = Object.entries(scope.documentRecipients).some(
    ([key, ids]) => (checkedDocumentsToSendKeys.has(key) || key === ADDITIONAL_RECIPIENT_KEY) && ids.length > 0,
  );

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {resolvedBackLabel}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-mono font-medium tracking-wide">{scope.scopeNumber}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
          isDraft ? "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20"
          : scope.status === "PendingApproval" ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20"
          : "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20"
        }`}>
          {isDraft ? "Draft" : scope.status === "PendingApproval" ? "รออนุมัติ" : "Final"}
        </span>

        <div data-tour="sowdoc-actions" className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <TourReplayButton onClick={docTour.start} />
          <div data-tour="sowdoc-completion">
            <DocumentCompletionIndicator totalCount={totalRequiredChecks} missingCount={finalizeValidation.missingCount} />
          </div>
          {canPrint && (
            <button
              onClick={handlePrint}
              disabled={!printValidation.valid}
              title={!printValidation.valid ? BLOCKED_TOOLTIP : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all ${!printValidation.valid ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Printer size={13} /> {t("scopeOfWorkDoc.print")}
            </button>
          )}
          {canCreate && (
            <button onClick={() => setPromptOpen("duplicate")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Copy size={13} /> {t("scopeOfWorkDoc.duplicate")}
            </button>
          )}
          {canCreate && (
            <button onClick={handleRewrite} disabled={rewriteBusy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <GitBranch size={13} /> {t("scopeOfWorkDoc.rewrite")}
            </button>
          )}
          {canViewDeliveryOrder && canCreateDeliveryOrder && (
            <button onClick={handleDeliveryOrderClick} disabled={deliveryOrderBusy} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <Truck size={13} /> {existingDeliveryOrder ? t("scopeOfWorkDoc.openDeliveryOrder") : t("scopeOfWorkDoc.createDeliveryOrder")}
            </button>
          )}
          {editable && (
            <button onClick={() => setConfirmAction("refresh")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <RotateCw size={13} /> {t("scopeOfWorkDoc.refreshFromQuotation")}
            </button>
          )}
          {canEdit && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <Save size={13} /> {isDraft ? t("scopeOfWorkDoc.saveDraft") : t("scopeOfWorkDoc.saveFollowUp")}
            </button>
          )}
          {canChasePo && !scope.customerPoNumber.trim() && (
            <button
              onClick={handleChasePo}
              disabled={chasingPo}
              title={t("scopeOfWorkDoc.chasePoTitle")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e08a3c]/40 text-[#e08a3c] rounded-lg font-medium hover:bg-[#e08a3c]/10 transition-colors disabled:opacity-60"
            >
              {chasingPo ? <Loader2 size={13} className="animate-spin" /> : <BellRing size={13} />} {t("scopeOfWorkDoc.chasePo")}
            </button>
          )}
          {canEdit && isDraft && (
            <button
              onClick={handleSubmitClick}
              disabled={!printValidation.valid}
              title={!printValidation.valid ? BLOCKED_TOOLTIP : undefined}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors ${!printValidation.valid ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <Send size={13} /> {t("scopeOfWorkDoc.submit")}
            </button>
          )}
          {scope.status === "PendingApproval" && canFinalize && (
            <>
              <button
                onClick={() => setConfirmAction("finalize")}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors"
              >
                <CheckCircle2 size={13} /> {t("scopeOfWorkDoc.approve")}
              </button>
              <button
                onClick={() => setPromptOpen("reject")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors"
              >
                {t("scopeOfWorkDoc.reject")}
              </button>
            </>
          )}
          {scope.status === "PendingApproval" && canEdit && (
            <button
              onClick={() => setConfirmAction("withdraw")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("scopeOfWorkDoc.withdraw")}
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmAction("delete")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("scopeOfWorkDoc.delete")}
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto print:p-0 print:max-w-none">
        <div ref={summaryRef}>
          <ValidationSummary missingCount={finalizeValidation.missingCount} messages={summaryMessages} />
        </div>

        <div data-tour="sowdoc-header" className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5 print:hidden">
            <h1 className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">SCOPE OF WORK</h1>
            <p className="text-[#a8bed8] text-xs mt-1">
              {t("scopeOfWorkDoc.subtitleFrom")} {scope.quotationNumber} — {t("scopeOfWorkDoc.subtitleJobType")} {scope.jobTypeCode || "-"} {scope.jobTypeName}
              {scope.quotationSalesperson && ` — ${t("scopeOfWorkDoc.subtitleSalesperson")} ${scope.quotationSalesperson}`}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-b border-border">
            <div className="p-6 border-b sm:border-b-0 sm:border-r border-border space-y-2.5">
              <div>
                <RequiredFieldLabel htmlFor="sow-customerName">{t("scopeOfWorkDoc.field.customerName")}</RequiredFieldLabel>
                <input id="sow-customerName" readOnly className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none opacity-80" value={scope.customerSnapshot.companyName} />
                <FieldError message={finalizeValidation.fieldErrors["customerSnapshot.companyName"]} />
              </div>
              <div>
                <RequiredFieldLabel htmlFor="sow-contactName">{t("scopeOfWorkDoc.field.contactName")}</RequiredFieldLabel>
                <input id="sow-contactName" readOnly className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none opacity-80" value={scope.customerSnapshot.contactName} />
                <FieldError message={finalizeValidation.fieldErrors["customerSnapshot.contactName"]} />
              </div>
              <div>
                <RequiredFieldLabel htmlFor="sow-scopeNumber">{t("scopeOfWorkDoc.field.scopeNumber")}</RequiredFieldLabel>
                <input id="sow-scopeNumber" disabled={!editable} className="w-full text-xs font-mono text-[#c9a84c] font-medium bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.scopeNumber} onChange={(e) => updateField("scopeNumber", e.target.value)} placeholder={t("scopeOfWorkDoc.field.scopeNumberPlaceholder")} />
                {editable && <p className="text-[10px] text-muted-foreground mt-1">{t("scopeOfWorkDoc.field.scopeNumberHelp")}</p>}
                <FieldError message={finalizeValidation.fieldErrors.scopeNumber} />
              </div>
              <div>
                <label htmlFor="sow-secondaryCode" className="text-xs text-muted-foreground block mb-1">{t("scopeOfWorkDoc.field.secondaryCode")}</label>
                <input id="sow-secondaryCode" disabled={!editable} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.secondaryCode} onChange={(e) => updateField("secondaryCode", e.target.value)} placeholder={t("scopeOfWorkDoc.field.secondaryCodePlaceholder")} />
                <FieldError message={finalizeValidation.fieldErrors.secondaryCode} />
              </div>
              <div>
                <RequiredFieldLabel htmlFor="sow-drawingCode">{t("scopeOfWorkDoc.field.drawingCode")}</RequiredFieldLabel>
                <input id="sow-drawingCode" disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.drawingCode} onChange={(e) => updateField("drawingCode", e.target.value)} />
                <FieldError message={finalizeValidation.fieldErrors.drawingCode} />
              </div>
              <div>
                <RequiredFieldLabel htmlFor="sow-deliveryLocation">{t("scopeOfWorkDoc.field.deliveryLocation")}</RequiredFieldLabel>
                <input id="sow-deliveryLocation" disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.deliveryLocation} onChange={(e) => updateField("deliveryLocation", e.target.value)} />
                <FieldError message={finalizeValidation.fieldErrors.deliveryLocation} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <RequiredFieldLabel htmlFor="sow-shippingContact">{t("scopeOfWorkDoc.field.shippingContact")}</RequiredFieldLabel>
                  <input id="sow-shippingContact" disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.shippingContact} onChange={(e) => updateField("shippingContact", e.target.value)} />
                  <FieldError message={finalizeValidation.fieldErrors.shippingContact} />
                </div>
                <div>
                  <RequiredFieldLabel htmlFor="sow-shippingPhone">{t("scopeOfWorkDoc.field.shippingPhone")}</RequiredFieldLabel>
                  <input id="sow-shippingPhone" disabled={!editable} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.shippingPhone} onChange={(e) => updateField("shippingPhone", e.target.value)} />
                  <FieldError message={finalizeValidation.fieldErrors.shippingPhone} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <RequiredFieldLabel htmlFor="sow-billingContact">{t("scopeOfWorkDoc.field.billingContact")}</RequiredFieldLabel>
                  <input id="sow-billingContact" disabled={!editable} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.billingContact} onChange={(e) => updateField("billingContact", e.target.value)} />
                  <FieldError message={finalizeValidation.fieldErrors.billingContact} />
                </div>
                <div>
                  <RequiredFieldLabel htmlFor="sow-billingPhone">{t("scopeOfWorkDoc.field.billingPhone")}</RequiredFieldLabel>
                  <input id="sow-billingPhone" disabled={!editable} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.billingPhone} onChange={(e) => updateField("billingPhone", e.target.value)} />
                  <FieldError message={finalizeValidation.fieldErrors.billingPhone} />
                </div>
              </div>
            </div>
            <div className="p-6 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <RequiredFieldLabel htmlFor="sow-issueDate">{t("scopeOfWorkDoc.field.issueDate")}</RequiredFieldLabel>
                  <input id="sow-issueDate" disabled={!editable} type="date" className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.issueDate} onChange={(e) => updateField("issueDate", e.target.value)} />
                  <FieldError message={finalizeValidation.fieldErrors.issueDate} />
                </div>
                <div>
                  <RequiredFieldLabel htmlFor="sow-deliveryDate">{t("scopeOfWorkDoc.field.deliveryDate")}</RequiredFieldLabel>
                  <input id="sow-deliveryDate" disabled={!editable} type="date" className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.deliveryDate} onChange={(e) => updateField("deliveryDate", e.target.value)} />
                  <FieldError message={finalizeValidation.fieldErrors.deliveryDate} />
                </div>
              </div>
              <div>
                <RequiredFieldLabel required={false} htmlFor="sow-customerPoNumber">{t("scopeOfWorkDoc.field.customerPoNumber")}</RequiredFieldLabel>
                <input id="sow-customerPoNumber" disabled={!canEdit} className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60" value={scope.customerPoNumber} onChange={(e) => updateField("customerPoNumber", e.target.value)} />
                {canEdit && !isDraft && <p className="text-[10px] text-muted-foreground mt-1">{t("scopeOfWorkDoc.field.poHelp")}</p>}
              </div>
              <div>
                <label htmlFor="sow-quotationNumber" className="text-xs text-muted-foreground block mb-1">{t("scopeOfWorkDoc.field.quotationNumber")}</label>
                <input id="sow-quotationNumber" readOnly className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none opacity-80" value={scope.quotationNumber} />
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed pt-2">
                {t("scopeOfWorkDoc.field.autoFillNote")}
              </p>
            </div>
          </div>
        </div>

        <div data-tour="sowdoc-checklist" className="bg-card border border-border rounded-xl p-5 print:hidden">
          <h2 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("scopeOfWorkDoc.checklistTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {scope.checklistGroups.map((group, idx) => (
              <ChecklistGroupCard
                key={group.key}
                group={group}
                disabled={!editable}
                required={(MANDATORY_CHECKLIST_GROUP_KEYS as readonly string[]).includes(group.key)}
                error={checklistValidation.groupErrors[group.key]}
                onChange={(next) => {
                  const groups = [...scope.checklistGroups];
                  groups[idx] = next;
                  updateField("checklistGroups", groups);
                }}
              />
            ))}
          </div>
        </div>

        <DocumentRecipientsPicker
          documentsToSendGroup={documentsToSendGroup}
          users={users}
          value={scope.documentRecipients}
          onChange={(next) => updateField("documentRecipients", next)}
          message={scope.documentRecipientMessage ?? ""}
          onMessageChange={(next) => updateField("documentRecipientMessage", next)}
          disabled={!canEdit}
          attachments={scope.attachments ?? []}
          uploading={uploadingAttachment}
          onUploadAttachment={handleUploadAttachment}
          onDeleteAttachment={handleDeleteAttachment}
        />
        {canEdit && documentsToSendGroup && (
          <div className="flex flex-col items-end gap-1.5 print:hidden -mt-2">
            <button
              onClick={handleSendDocuments}
              disabled={!hasDocumentRecipientsToSend || sendingDocs}
              title={!hasDocumentRecipientsToSend ? t("scopeOfWorkDoc.sendDocumentsNeedRecipient") : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all ${!hasDocumentRecipientsToSend || sendingDocs ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              {sendingDocs ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {t("scopeOfWorkDoc.sendDocuments")}
            </button>
          </div>
        )}

        {noSourceItems && (
          <div className="bg-[#e08a3c]/10 border border-[#e08a3c]/30 rounded-xl p-4 flex items-start gap-3 print:hidden">
            <AlertTriangle size={16} className="text-[#e08a3c] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-foreground font-medium">{t("scopeOfWorkDoc.noSourceItems.message")}</p>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={onBack} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">{t("scopeOfWorkDoc.noSourceItems.backToQuotation")}</button>
                {editable && (
                  <button onClick={() => updateField("items", [blankScopeOfWorkItem()])} className="px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium">
                    {t("scopeOfWorkDoc.noSourceItems.addManually")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <ScopeOfWorkItemsEditor
          items={scope.items}
          onChange={(items) => updateField("items", items)}
          disabled={!editable}
          itemErrors={itemErrors}
          noItemsError={finalizeValidation.fieldErrors.items}
        />

        <div className="bg-card border border-border rounded-xl p-5 print:hidden">
          <h2 className="text-sm font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("scopeOfWorkDoc.paymentTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PaymentInstallmentsEditor
              installments={scope.paymentConditions.installments}
              onChange={(installments) => updateField("paymentConditions", { ...scope.paymentConditions, installments })}
              disabled={!editable}
            />
            <div className="sm:col-span-2">
              <RequiredFieldLabel htmlFor="sow-paymentDescription">{t("scopeOfWorkDoc.paymentDescription")}</RequiredFieldLabel>
              <textarea id="sow-paymentDescription" disabled={!editable} rows={3} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60" value={scope.paymentConditions.description} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, description: e.target.value })} />
              <FieldError message={finalizeValidation.fieldErrors["paymentConditions.description"]} />
            </div>
            {finalizeValidation.fieldErrors["paymentConditions.percentTotal"] && (
              <div className="sm:col-span-2">
                <FieldError message={finalizeValidation.fieldErrors["paymentConditions.percentTotal"]} />
              </div>
            )}
            <div className="sm:col-span-2">
              <label htmlFor="sow-paymentNotes" className="text-xs text-muted-foreground block mb-1">{t("scopeOfWorkDoc.paymentNotes")}</label>
              <textarea id="sow-paymentNotes" disabled={!editable} rows={2} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60" value={scope.paymentConditions.notes} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, notes: e.target.value })} />
            </div>
          </div>
        </div>

        {revisionPredecessorScopeNumber && (
          <div className="bg-card border border-border rounded-xl p-5 print:hidden">
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <h2 id="sow-revisionNote-heading" className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
                {t("scopeOfWorkDoc.revisionNoteTitle")}
              </h2>
              <button
                type="button"
                onClick={handleGenerateRevisionNote}
                disabled={!editable || generatingRevisionNote}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/25 rounded-lg hover:bg-[#c9a84c]/20 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generatingRevisionNote ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {t("scopeOfWorkDoc.generateRevisionNote")}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              {t("scopeOfWorkDoc.revisionNoteHelp").replace("{predecessor}", revisionPredecessorScopeNumber)}
            </p>
            <textarea
              rows={6}
              disabled={!editable}
              aria-labelledby="sow-revisionNote-heading"
              className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y leading-relaxed disabled:opacity-60 font-mono"
              value={scope.revisionNote ?? ""}
              onChange={(e) => updateField("revisionNote", e.target.value)}
              placeholder="เช่น • วันที่ส่งของ: &quot;2026-07-20&quot; → &quot;2026-07-25&quot;"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:hidden">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 id="sow-remarks-heading" className="text-xs font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("scopeOfWorkDoc.remarksTitle")}</h2>
            <textarea disabled={!editable} rows={5} aria-labelledby="sow-remarks-heading" className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60" value={scope.remarks} onChange={(e) => updateField("remarks", e.target.value)} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h2 className="text-xs font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("scopeOfWorkDoc.signatoriesTitle")}</h2>
            <SignatoryEditor label={t("scopeOfWorkDoc.sellerLabel")} value={scope.seller} onChange={(v) => updateField("seller", v)} users={users} disabled={!editable} required error={finalizeValidation.fieldErrors["seller.name"]} />
            <SignatoryEditor label={t("scopeOfWorkDoc.approverLabel")} value={scope.approver} onChange={(v) => updateField("approver", v)} users={users} disabled={!editable} required error={finalizeValidation.fieldErrors["approver.name"]} />
          </div>
        </div>

        <ScopeOfWorkPrintDocument
          scopeOfWork={scope}
          companyHeader={companyHeader}
          sellerUser={users.find((u) => u.id === scope.seller.userId)}
          approverUser={users.find((u) => u.id === scope.approver.userId)}
        />
      </div>

      <ConfirmDialog
        open={confirmAction === "submit"}
        title={t("scopeOfWorkDoc.confirmSubmit.title")}
        message={t("scopeOfWorkDoc.confirmSubmit.message")}
        confirmLabel={t("scopeOfWorkDoc.submit")}
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "finalize"}
        title={t("scopeOfWorkDoc.confirmFinalize.title")}
        message={t("scopeOfWorkDoc.confirmFinalize.message")}
        confirmLabel={t("scopeOfWorkDoc.approve")}
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "withdraw"}
        title={t("scopeOfWorkDoc.confirmWithdraw.title")}
        message={t("scopeOfWorkDoc.confirmWithdraw.message")}
        confirmLabel={t("scopeOfWorkDoc.withdraw")}
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "refresh"}
        title={t("scopeOfWorkDoc.confirmRefresh.title")}
        message={t("scopeOfWorkDoc.confirmRefresh.message")}
        confirmLabel={t("scopeOfWorkDoc.confirmRefresh.confirmLabel")}
        danger
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        title={t("scopeOfWorkDoc.confirmDelete.title")}
        message={t("scopeOfWorkDoc.confirmDelete.message").replace("{scopeNumber}", scope.scopeNumber)}
        confirmLabel={t("scopeOfWorkDoc.delete")}
        danger
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <PromptDialog
        open={promptOpen === "reject"}
        title={t("scopeOfWorkDoc.promptReject.title")}
        message={t("scopeOfWorkDoc.promptReject.message").replace("{scopeNumber}", scope.scopeNumber)}
        label={t("scopeOfWorkDoc.promptReject.label")}
        placeholder={t("scopeOfWorkDoc.promptReject.placeholder")}
        confirmLabel={t("scopeOfWorkDoc.promptReject.confirmLabel")}
        requiredMessage={t("scopeOfWorkDoc.promptReject.requiredMessage")}
        multiline
        onConfirm={confirmReject}
        onCancel={() => setPromptOpen(null)}
      />
      <PromptDialog
        open={promptOpen === "duplicate"}
        title={t("scopeOfWorkDoc.promptDuplicate.title")}
        message={t("scopeOfWorkDoc.promptDuplicate.message")}
        label={t("scopeOfWorkDoc.promptDuplicate.label")}
        placeholder={t("scopeOfWorkDoc.promptDuplicate.placeholder")}
        confirmLabel={t("scopeOfWorkDoc.promptDuplicate.confirmLabel")}
        requiredMessage={t("scopeOfWorkDoc.promptDuplicate.requiredMessage")}
        mono
        onConfirm={confirmDuplicate}
        onCancel={() => setPromptOpen(null)}
      />
    </div>
  );
}
