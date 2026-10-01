import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Printer, Copy, Save, CheckCircle2, RotateCw, Trash2, Loader2, AlertTriangle, GitBranch, Plus, Send, Wand2,
  Truck, BellRing, Briefcase, Calculator, FileText, Building2, Undo2, ChevronDown,
} from "lucide-react";
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
  chaseScopeOfWorkPo, scopePoNumbers,
} from "../../lib/scopeOfWork";
import { type DeliveryOrderSummary, fetchDeliveryOrdersByScope, createDeliveryOrderFromScope } from "../../lib/deliveryOrder";
import { type CostControlSummary, fetchCostControlsByScope, createCostControlFromScope } from "../../lib/costControl";
import { type ProjectSummary, type ProjectStatus, fetchProjectsByScope, createProjectFromScope } from "../../lib/project";
import { getRevisionPredecessorId, getRevisionNumber, generateScopeOfWorkRevisionSummary, appendRevisionNoteEntry } from "../../lib/revisionDiff";
import { compressImageFile, isCompressibleImage } from "../../lib/imageCompression";
import { formatQuoteDateThai } from "../../lib/quotes";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
import { Combobox, type ComboboxOption } from "../../components/Combobox";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { ChecklistGroupCard } from "./ChecklistGroupCard";
import { DocumentRecipientsPicker } from "./DocumentRecipientsPicker";
import { ScopeOfWorkItemsEditor } from "./ScopeOfWorkItemsEditor";
import { ScopeOfWorkPrintDocument } from "./ScopeOfWorkPrintDocument";
import { FieldError } from "../../components/FieldError";
import { ValidationSummary } from "../../components/ValidationSummary";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { DocumentHeader, DocumentStepper, DocumentColumns, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { btn, field } from "../../components/ui/styles";
import {
  ApprovalStatusPill, SourceTag, SourceDocRow, SourceNote, RailSummaryCard, RelatedDocRow, railLink, railTextBtn,
} from "../scopeOfWork/sowDoShared";
import { useApprovalStatusLabel, useApprovalSteps, useApprovalHint } from "../scopeOfWork/sowDoStatus";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
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
    additionalPoNumbers: s.additionalPoNumbers,
    additionalQuotationNumbers: s.additionalQuotationNumbers,
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
    // เลข PO ใบที่สองขึ้นไปก็มาช้าพอ ๆ กับใบแรก จึงอยู่ในกลุ่มติดตามผลด้วย (ฝั่งเซิร์ฟเวอร์มี
    // `FOLLOW_UP_FIELDS` ชุดเดียวกัน) · เลขใบเสนอราคาเพิ่มเติมไม่อยู่ในนี้ เพราะรู้ตั้งแต่ตอนร่าง
    additionalPoNumbers: s.additionalPoNumbers,
    documentRecipients: s.documentRecipients,
    documentRecipientMessage: s.documentRecipientMessage,
  };
}

const PROJECT_STATUS_KEY: Record<ProjectStatus, TranslationKey> = {
  Planning: "project.status.planning",
  InProgress: "project.status.inProgress",
  Completed: "project.status.completed",
};

/**
 * ผู้ลงนามหนึ่งคน (ผู้ขาย / ผู้อนุมัติ) — ดีไซน์ใหม่ 2026-09-30 รวม "เลือกผู้ใช้" กับ "พิมพ์ชื่อเอง" เป็นช่องเดียว
 * (Combobox) · เลือกจากรายการ = ผูกผู้ใช้ (ลายเซ็นบนใบพิมพ์ดึงจากผู้ใช้คนนั้น) · พิมพ์เอง = ผูกเฉพาะเมื่อ
 * ชื่อที่พิมพ์ตรงกับชื่อผู้ใช้คนใดคนหนึ่งพอดี ไม่งั้นเป็นชื่ออิสระ ไม่ผูกใคร
 */
function SignatoryField({ label, value, onChange, users, disabled, required, error }: {
  label: string;
  value: ScopeOfWorkSignatory;
  onChange: (next: ScopeOfWorkSignatory) => void;
  users: User[];
  disabled: boolean;
  required?: boolean;
  error?: string;
}) {
  const { t } = useI18n();
  const options: ComboboxOption[] = users.map((u) => ({ value: u.fullName, hint: u.department.trim() || undefined }));
  return (
    <div className="flex flex-col gap-1.5">
      <span className={field.label}>
        {label}
        {required && <span className="text-[#b93636]"> *</span>}
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-2">
        <div className="relative min-w-0">
          <Combobox
            value={value.name}
            onChange={(name) => onChange({ ...value, name, userId: users.find((u) => u.fullName === name.trim())?.id ?? "" })}
            onPick={(option) => {
              const user = users[options.indexOf(option)];
              if (user) onChange({ ...value, userId: user.id, name: user.fullName });
            }}
            options={options}
            disabled={disabled}
            ariaLabel={label}
            placeholder={t("scopeOfWorkDoc.signatoryPlaceholder")}
            className={`${field.input.replace("px-3", "pl-3 pr-8")} w-full`}
          />
          {!disabled && <ChevronDown size={16} className="absolute right-2.5 top-3 text-muted-foreground pointer-events-none" aria-hidden="true" />}
        </div>
        <input
          disabled={disabled}
          type="date"
          aria-label={t("scopeOfWorkDoc.signDateAria").replace("{label}", label)}
          className={`${field.input} w-full min-w-0`}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}

/**
 * ช่องกรอกเลข PO ของลูกค้าแบบหลายเลข พร้อมปุ่ม "+ เพิ่มเลข PO"
 *
 * เจ้าของสั่งไว้ 2026-08-31: *"ใส่ตัวเลขของใบเสนอราคา 2 อันกับใบ PO 2 อันอยู่ใน Scope อันเดียว
 * ช่วยทำปุ่มเพิ่มมาให้หน่อย"* — ลูกค้าออก PO มาหลายใบได้
 *
 * **ในหน้าจอเป็นลิสต์เดียว แต่ข้างหลังเก็บเป็น "เลขหลัก + รายการเพิ่มเติม"** ผู้เรียกเป็นคนแปลงกลับ
 * (ดู `scopePoNumbers()` ใน `lib/scopeOfWork.ts`) ที่นี่คืนอย่างน้อยหนึ่งช่องเสมอ เพื่อให้ "เลขหลัก" มีที่อยู่ตลอด
 */
function PoNumberListEditor({ values, onChange, disabled, idPrefix, addLabel, removeLabel, placeholder }: {
  values: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  idPrefix: string;
  addLabel: string;
  removeLabel: string;
  placeholder?: string;
}) {
  const rows = values.length > 0 ? values : [""];
  const setRow = (index: number, next: string) => onChange(rows.map((v, i) => (i === index ? next : v)));
  // ลบแถวสุดท้ายทิ้งไม่ได้ ต้องเหลือช่องว่างไว้หนึ่งช่องเสมอ ไม่งั้น "เลขหลัก" จะหายไปจากเอกสาร
  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [""]);
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.map((value, index) => (
        <div key={index} className="flex items-center gap-2 flex-wrap">
          <input
            id={index === 0 ? idPrefix : `${idPrefix}-${index}`}
            disabled={disabled}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setRow(index, e.target.value)}
            className={`${field.input} w-full sm:w-80 font-mono`}
          />
          {!disabled && rows.length > 1 && (
            <button type="button" onClick={() => removeRow(index)} title={removeLabel} aria-label={removeLabel} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors"><Trash2 size={15} /></button>
          )}
          {!disabled && index === rows.length - 1 && (
            <span className="pl-3">
              <button type="button" onClick={() => onChange([...rows, ""])} className={btn.text}>
                <Plus size={16} /> {addLabel}
              </button>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * เลขใบเสนอราคาใบอื่นของงานเดียวกัน (ใบต้นทางที่ผูกกันอยู่แสดงแยกเป็นแถวเอกสารต้นทาง แก้ไม่ได้)
 * พิมพ์เอง เพิ่มได้เฉพาะตอนเป็นร่าง · ว่างได้ ต่างจากเลข PO ที่ต้องมีเลขหลักหนึ่งช่องเสมอ
 */
function ExtraQuotationNumbers({ values, onChange, disabled }: { values: string[]; onChange: (next: string[]) => void; disabled: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <input
            id={`sow-quotationNumber-${index + 1}`}
            disabled={disabled}
            value={value}
            aria-label={t("scopeOfWorkDoc.field.quotationNumber")}
            placeholder={t("scopeOfWorkDoc.quotationNumberPlaceholder")}
            onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
            className={`${field.input} flex-1 min-w-0 font-mono`}
          />
          {!disabled && (
            <button type="button" onClick={() => onChange(values.filter((_, i) => i !== index))} title={t("scopeOfWorkDoc.removeQuotationNumber")} aria-label={t("scopeOfWorkDoc.removeQuotationNumber")} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors flex-shrink-0"><Trash2 size={15} /></button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={() => onChange([...values, ""])} className={`${btn.text} self-start`}>
          <Plus size={16} /> {t("scopeOfWorkDoc.addQuotationNumber")}
        </button>
      )}
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
  const cols = "grid grid-cols-[28px_minmax(0,1fr)_110px_140px_120px_36px] gap-2.5 items-center";
  const suffixBox = "h-9 rounded-lg border border-[#c3ccda] bg-white flex items-stretch overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors";
  const suffix = "px-2.5 flex items-center bg-[#f4f6fa] border-l border-border text-[13px] text-[#3d5173]";
  const bare = "flex-1 min-w-0 px-2.5 bg-transparent text-sm text-right tabular-nums outline-none";

  return (
    <div className="flex flex-col gap-3.5">
      <div className={`flex flex-col gap-1.5 ${disabled && installments.length === 0 ? "hidden" : ""}`}>
        <span className={field.label}>{t("scopeOfWorkDoc.installmentsLabel")}</span>
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            {PAYMENT_TERM_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                className="h-8 px-2.5 rounded-lg border border-[#c3ccda] bg-white text-[13px] text-[#3d5173] hover:bg-[#f4f6fa] transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {(installments.length > 0 || !disabled) && (
        <div className="border border-border rounded-[10px] overflow-x-auto">
          <div className="min-w-[620px]">
            <div className={`${cols} px-3 h-9 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]`}>
              <span>#</span>
              <span>{t("scopeOfWorkDoc.col.installmentLabel")}</span>
              <span className="text-right">{t("scopeOfWorkDoc.col.pct")}</span>
              <span>{t("scopeOfWorkDoc.col.paymentType")}</span>
              <span className="text-right">{t("scopeOfWorkDoc.col.days")}</span>
              <span />
            </div>
            {installments.map((row, i) => (
              <div key={row.id} className={`${cols} px-3 py-1.5 border-b border-[#eef1f6]`}>
                <span className="text-[13px] text-muted-foreground tabular-nums">{i + 1}</span>
                <input
                  disabled={disabled}
                  value={row.label}
                  aria-label={t("scopeOfWorkDoc.col.installmentLabel")}
                  onChange={(e) => updateRow(row.id, { label: e.target.value })}
                  placeholder={t("scopeOfWorkDoc.installmentLabelPlaceholder")}
                  className={`${field.cell} w-full min-w-0`}
                />
                <span data-field-box className={suffixBox}>
                  <input
                    disabled={disabled}
                    type="number"
                    min={0}
                    max={100}
                    aria-label={t("scopeOfWorkDoc.pctAria")}
                    value={row.pct ?? ""}
                    onChange={(e) => updateRow(row.id, { pct: e.target.value === "" ? null : parseFloat(e.target.value) || 0 })}
                    className={bare}
                  />
                  <span className={suffix}>%</span>
                </span>
                <select
                  disabled={disabled}
                  value={row.paymentType}
                  aria-label={t("scopeOfWorkDoc.col.paymentType")}
                  onChange={(e) => updateRow(row.id, { paymentType: e.target.value as ScopeOfWorkPaymentType })}
                  className={`${field.cell} w-full min-w-0`}
                >
                  <option value="">{t("scopeOfWorkDoc.paymentTypePlaceholder")}</option>
                  <option value="Cash">Cash</option>
                  <option value="Credit">Credit</option>
                </select>
                <span data-field-box className={suffixBox} title={t("scopeOfWorkDoc.daysTitle")}>
                  <input
                    disabled={disabled}
                    type="number"
                    min={0}
                    aria-label={t("scopeOfWorkDoc.daysTitle")}
                    value={row.days ?? ""}
                    onChange={(e) => updateRow(row.id, { days: e.target.value === "" ? null : parseInt(e.target.value, 10) || 0 })}
                    placeholder="—"
                    className={bare}
                  />
                  <span className={suffix}>{t("scopeOfWorkDoc.daysUnit")}</span>
                </span>
                {!disabled ? (
                  <button type="button" onClick={() => removeRow(row.id)} title={t("scopeOfWorkDoc.removeInstallment")} aria-label={t("scopeOfWorkDoc.removeInstallment")} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors"><Trash2 size={15} /></button>
                ) : <span />}
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 px-3 py-1 min-h-11">
              {!disabled ? (
                <button type="button" onClick={addRow} className={btn.text}>
                  <Plus size={16} /> {t("scopeOfWorkDoc.addInstallment")}
                </button>
              ) : <span />}
              {installments.length > 0 && (
                <span className={`text-[13px] font-semibold inline-flex items-center gap-1.5 pr-12 ${total === 100 ? "text-[#1b7f4f]" : "text-muted-foreground"}`}>
                  {total === 100 && <CheckCircle2 size={15} />}
                  {t("scopeOfWorkDoc.installmentsTotal")} {total}%
                </span>
              )}
            </div>
          </div>
        </div>
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
  canViewProject,
  canCreateProject,
  onOpenProject,
  canViewCostControl,
  canCreateCostControl,
  onOpenCostControl,
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
  canViewProject: boolean;
  canCreateProject: boolean;
  onOpenProject: (projectId: string) => void;
  canViewCostControl: boolean;
  canCreateCostControl: boolean;
  onOpenCostControl: (costControlId: string) => void;
  onBack: () => void;
  backLabel?: string;
  onDuplicated: (newId: string) => void;
  onRewritten: (newId: string) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const statusLabel = useApprovalStatusLabel();
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

  const [existingProject, setExistingProject] = useState<ProjectSummary | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  useEffect(() => {
    if (!canViewProject) return;
    let cancelled = false;
    fetchProjectsByScope(scopeOfWorkId)
      .then((list) => { if (!cancelled) setExistingProject(list[0] ?? null); })
      .catch(() => { if (!cancelled) setExistingProject(null); });
    return () => { cancelled = true; };
  }, [scopeOfWorkId, canViewProject]);

  // Cost Control ที่ผูกกับ Scope ใบนี้ (2026-08-31) — เจ้าของขอให้ใบต้นทุน "ไปพร้อมกัน" ตอนส่ง
  // เอกสารให้คนอื่น ปุ่มนี้จึงเป็นทั้งทางสร้างและทางเปิด และผลของมันไปโผล่ในการ์ดผู้รับเอกสารด้วย
  // เรียกได้แม้ Scope ยังเป็นร่าง — เจ้าของยืนยันว่า "สถานะไหนก็สร้างได้"
  const [existingCostControl, setExistingCostControl] = useState<CostControlSummary | null>(null);
  const [costControlBusy, setCostControlBusy] = useState(false);
  useEffect(() => {
    if (!canViewCostControl) return;
    let cancelled = false;
    fetchCostControlsByScope(scopeOfWorkId)
      .then((list) => { if (!cancelled) setExistingCostControl(list[0] ?? null); })
      .catch(() => { if (!cancelled) setExistingCostControl(null); });
    return () => { cancelled = true; };
  }, [scopeOfWorkId, canViewCostControl]);

  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) ─────────────────────────────────────────────────────
  // toFollowUpFields เป็นสับเซ็ตของ toUpdateFields จึงใช้ payload เดียวครอบคลุมได้ทั้งเฟสร่างและเฟสติดตามผล
  //
  // `toFollowUpFields` is a subset of `toUpdateFields`, so one payload covers both phases — including
  // the PO number and document recipients, which stay editable after approval with auto-save off.
  const dirty = useDirtyTracker(scope && canEdit ? toUpdateFields(scope) : null);

  useEffect(() => {
    let cancelled = false;
    fetchScopeOfWork(scopeOfWorkId)
      .then((s) => { if (!cancelled) { setScope(s); dirty.markSaved(toUpdateFields(s)); } })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [scopeOfWorkId, reloadKey, dirty]);

  const docTourSteps: TourStep[] = [
    { element: '[data-tour="sowdoc-submit"]', manual: "ch7-3", popover: { title: t("tour.sowdoc.submit.title"), description: t("tour.sowdoc.submit.desc"), side: "bottom" } },
    { element: '[data-tour="sowdoc-po"]', manual: "ch7-4", popover: { title: t("tour.sowdoc.po.title"), description: t("tour.sowdoc.po.desc"), side: "top" } },
    { element: '[data-tour="sowdoc-completion"]', manual: "ch7-3", popover: { title: t("tour.sowdoc.completion.title"), description: t("tour.sowdoc.completion.desc"), side: "left" } },
    { element: '[data-tour="sowdoc-checklist"]', manual: "ch7-2", popover: { title: t("tour.sowdoc.checklist.title"), description: t("tour.sowdoc.checklist.desc"), side: "top" } },
    { element: '[data-tour="sowdoc-recipients"]', manual: "ch8-1", popover: { title: t("tour.sowdoc.recipients.title"), description: t("tour.sowdoc.recipients.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("scopeOfWorkDoc", currentUserId, docTourSteps, { autoStart: !!scope });

  // ── บันทึกอัตโนมัติ (2026-08-25) — ต้องเรียก hook ก่อน early return ด้านล่างเสมอ ──────────────
  // Auto-save. Declared here, above the loading/error early returns, because hooks may not run
  // conditionally. Both layers key off the same payload the Save button sends (`toUpdateFields`),
  // and both are Draft-only: the follow-up fields still editable after approval keep requiring a
  // deliberate Save so an approved document never changes without an audit entry.
  const scopeEditable = !!scope && canEdit && scope.status === "Draft";
  const autoSavePayload = scope && scopeEditable ? toUpdateFields(scope) : null;
  const draftBackup = useDraftBackup<ScopeOfWorkUpdateFields>({
    storageKey: `scopeOfWork:${scopeOfWorkId}`,
    data: autoSavePayload,
    enabled: scopeEditable,
  });
  const autoSave = useAutoSave<ScopeOfWorkUpdateFields>({
    data: autoSavePayload,
    enabled: scopeEditable,
    onSave: async (fields) => { await updateScopeOfWork(scopeOfWorkId, fields, { autoSave: true }); },
  });

  // ข้อความ "ขั้นต่อไป" และขั้นตอนของเอกสาร — เป็น hook จึงต้องอยู่เหนือ early return เช่นกัน
  const steps = useApprovalSteps(scope?.status ?? "Draft");
  const nextStepHint = useApprovalHint({
    status: scope?.status ?? "Draft",
    approverLabel: t("scopeOfWorkDoc.stepApprover"),
    approvedByName: scope?.approver.name || users.find((u) => u.id === scope?.approver.userId)?.fullName || "",
    approvedAt: scope?.approver.date,
  });

  // บันทึกฉบับร่างเต็มรูปแบบ หรือเฉพาะฟิลด์ติดตามผลถ้าเอกสารผ่านการอนุมัติแล้ว
  // Saves the full draft, or just the follow-up fields once the record is no longer a Draft
  const save = async (): Promise<boolean> => {
    if (!scope) return false;
    const draftPhase = scope.status === "Draft";
    try {
      setSaving(true);
      const updated = await updateScopeOfWork(scope.id, draftPhase ? toUpdateFields(scope) : toFollowUpFields(scope));
      setScope(updated);
      // ตั้งฐานเทียบของ auto-save ใหม่เป็น "สิ่งที่เซิร์ฟเวอร์ตอบกลับมา" ซึ่งคือสิ่งที่ฟอร์มถืออยู่หลังบรรทัดบน
      // ไม่ใช่ค่าบนจอตอนเรียก ซึ่งอาจเก่าหรือใหม่กว่าที่ส่งขึ้นไปจริง
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(draftPhase ? t("sowdo.toast.savedDraft") : t("scopeOfWorkDoc.toast.savedFollowUp"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("sowdo.toast.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // การ์ด "ยังไม่ได้บันทึก" — ครอบคลุมทั้งสองเฟส เพราะเลข PO และรายชื่อผู้รับเอกสารยังแก้ได้หลังอนุมัติ
  // ซึ่งเป็นช่วงที่ auto-save ปิดอยู่ save() จึงต้องประกาศเหนือ early return (hook เรียกแบบมีเงื่อนไขไม่ได้)
  const { requestLeave } = useUnsavedChangesGuard(
    scope && canEdit
      ? {
          getRisk: () => assessUnsavedRisk({
            isDirty: dirty.isDirtyNow(),
            hasServerRecord: true,
            autoSaveEnabled: scopeEditable,
            autoSaveState: autoSave.state,
          }),
          documentLabel: scope.scopeNumber || scope.id,
          save,
          discard: draftBackup.clear,
        }
      : null,
  );

  if (loadError || !scope) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="bg-card border-b border-border px-4 md:px-8 py-3.5">
          <button type="button" onClick={() => requestLeave(onBack)} className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <ArrowLeft size={14} /> {resolvedBackLabel}
          </button>
        </div>
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center" role="alert">
            <AlertTriangle size={20} className="text-[#b93636]" />
            <p className="text-sm text-muted-foreground">{t("scopeOfWork.loadError")}</p>
            <button type="button" onClick={() => { setLoadError(false); setReloadKey((k) => k + 1); }} className={btn.secondary}>
              <RotateCw size={15} /> {t("scopeOfWork.retry")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 p-10" role="status">
            <Loader2 size={20} className="text-muted-foreground animate-spin" />
            <p className="text-[13px] text-muted-foreground">{t("scopeOfWork.loading")}</p>
          </div>
        )}
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
  const completedChecks = Math.max(0, totalRequiredChecks - finalizeValidation.missingCount);
  const completionPct = totalRequiredChecks > 0 ? Math.round((completedChecks / totalRequiredChecks) * 100) : 100;
  const itemCount = scope.items.filter((it) => !it.isSectionHeader).length;
  const sectionCount = scope.items.length - itemCount;
  const installmentPctTotal = scope.paymentConditions.installments.reduce((sum, row) => sum + (row.pct ?? 0), 0);
  const hasPo = scopePoNumbers(scope).length > 0;

  // ส่งการแจ้งเตือนทวงเลข PO ไปยังพนักงานขายของเอกสารนี้
  // Sends a chase-for-PO-number notification to this record's salesperson
  const handleChasePo = async () => {
    if (!scope || chasingPo) return;
    setChasingPo(true);
    try {
      const { notifiedUserName } = await chaseScopeOfWorkPo(scope.id);
      showToast(t("scopeOfWorkDoc.toast.chasePoSent").replace("{name}", notifiedUserName));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.toast.notifyFailed"));
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
      dirty.markSaved(toUpdateFields(saved));
      const result = await sendScopeOfWorkDocumentNotifications(scope.id);
      showToast(t("scopeOfWorkDoc.toast.docsSent").replace("{n}", String(result.sentCount)));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.toast.notifyFailed"));
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
        showToast(t("scopeOfWorkDoc.toast.fileTooLarge").replace("{mb}", String(Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024))));
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
      showToast(t("scopeOfWorkDoc.toast.attached").replace("{name}", file.name));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.toast.attachFailed"));
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
      showToast(t("scopeOfWorkDoc.toast.attachmentDeleted"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.toast.attachmentDeleteFailed"));
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
        showToast(t("scopeOfWorkDoc.toast.noPredecessor"));
        return;
      }
      const predecessor = await fetchScopeOfWork(predecessorSummary.id);
      setScope((prev) => {
        if (!prev) return prev;
        const summary = generateScopeOfWorkRevisionSummary(predecessor, prev, users);
        const revisionNote = appendRevisionNoteEntry(predecessor.revisionNote, getRevisionNumber(prev.scopeNumber), summary);
        return { ...prev, revisionNote };
      });
      showToast(t("scopeOfWorkDoc.toast.revisionGenerated"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.toast.revisionFailed"));
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
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.toast.createDoFailed"));
    } finally {
      setDeliveryOrderBusy(false);
    }
  };

  // เปิดโครงการที่มีอยู่แล้ว หรือสร้างใหม่จาก Scope of Work นี้แล้วเปิดขึ้นมา
  // Opens the existing Project, or creates a new one from this Scope of Work and opens it
  const handleProjectClick = async () => {
    if (!scope || projectBusy) return;
    if (existingProject) {
      onOpenProject(existingProject.id);
      return;
    }
    setProjectBusy(true);
    try {
      const created = await createProjectFromScope(scope.id);
      onOpenProject(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.createProjectFailed"));
    } finally {
      setProjectBusy(false);
    }
  };

  // เปิด Cost Control ที่ผูกอยู่แล้ว หรือสร้างใบใหม่ที่ผูกกับ Scope นี้แล้วเปิดขึ้นมา
  // Opens the linked Cost Control, or creates one bound to this Scope of Work and opens it
  const handleCostControlClick = async () => {
    if (!scope || costControlBusy) return;
    if (existingCostControl) {
      onOpenCostControl(existingCostControl.id);
      return;
    }
    setCostControlBusy(true);
    try {
      const created = await createCostControlFromScope(scope.id);
      onOpenCostControl(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.createCostControlFailed"));
    } finally {
      setCostControlBusy(false);
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
      dirty.markSaved(toUpdateFields(updated));
      showToast(t("sowdo.toast.rejected"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("sowdo.toast.rejectFailed"));
    }
  };

  // ทำสำเนา Scope of Work ด้วยเลขที่เอกสารที่กรอกเอง แล้วเปิดฉบับสำเนาขึ้นมา
  // Duplicates the Scope of Work with a manually entered document number, then opens the copy
  const confirmDuplicate = async (scopeNumber: string) => {
    if (!scope) return;
    setPromptOpen(null);
    try {
      const created = await duplicateScopeOfWork(scope.id, scopeNumber);
      showToast(t("scopeOfWorkDoc.toast.duplicated").replace("{number}", created.scopeNumber));
      onDuplicated(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.toast.duplicateFailed"));
    }
  };

  // เขียน Scope of Work ใหม่เป็นฉบับแก้ไข แล้วเปิดฉบับที่สร้างขึ้นมา
  // Rewrites the Scope of Work into a new revision, then opens it
  const handleRewrite = async () => {
    if (!scope || rewriteBusy) return;
    setRewriteBusy(true);
    try {
      const created = await rewriteScopeOfWork(scope.id);
      showToast(t("scopeOfWorkDoc.toast.rewritten").replace("{number}", created.scopeNumber));
      onRewritten(created.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("scopeOfWorkDoc.toast.rewriteFailed"));
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
        dirty.markSaved(toUpdateFields(updated));
        showToast(t("sowdo.toast.submitted"));
      } else if (confirmAction === "finalize") {
        const updated = await finalizeScopeOfWork(scope.id);
        setScope(updated);
        dirty.markSaved(toUpdateFields(updated));
        showToast(t("sowdo.toast.finalized"));
      } else if (confirmAction === "withdraw") {
        const updated = await withdrawScopeOfWorkApproval(scope.id);
        setScope(updated);
        dirty.markSaved(toUpdateFields(updated));
        showToast(t("sowdo.toast.withdrawn"));
      } else if (confirmAction === "refresh") {
        const updated = await refreshScopeOfWorkFromQuotation(scope.id);
        setScope(updated);
        dirty.markSaved(toUpdateFields(updated));
        showToast(t("scopeOfWorkDoc.toast.refreshed"));
      } else if (confirmAction === "delete") {
        await deleteScopeOfWork(scope.id);
        showToast(t("scopeOfWorkDoc.toast.deleted"));
        onBack();
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("sowdo.toast.actionFailed"));
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
  const fe = finalizeValidation.fieldErrors;
  const pendingApproval = scope.status === "PendingApproval";
  const showRelated = canViewDeliveryOrder || canViewCostControl || canViewProject;

  const busyIcon = (busy: boolean) => (busy ? <Loader2 size={13} className="inline animate-spin mr-1" /> : null);

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-20 print:hidden">
        <DocumentHeader
          backLabel={resolvedBackLabel}
          onBack={() => requestLeave(onBack)}
          number={scope.scopeNumber || "—"}
          status={<ApprovalStatusPill status={scope.status} />}
          meta={scopeEditable ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} /> : undefined}
          actions={
            <div data-tour="sowdoc-actions" className="flex items-center gap-2.5 flex-wrap">
              <TourReplayButton variant="title" onClick={docTour.start} />
              {canPrint && (
                <button type="button" onClick={handlePrint} disabled={!printValidation.valid} title={!printValidation.valid ? BLOCKED_TOOLTIP : undefined} className={btn.secondary}>
                  <Printer size={16} /> {t("scopeOfWorkDoc.print")}
                </button>
              )}
              {canEdit && (
                <button type="button" onClick={save} disabled={saving} className={btn.secondary}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {isDraft ? t("scopeOfWorkDoc.saveDraft") : t("scopeOfWorkDoc.saveFollowUp")}
                </button>
              )}
              <MoreMenu
                items={[
                  editable && { key: "refresh", label: t("scopeOfWorkDoc.refreshFromQuotation"), icon: RotateCw, hint: t("scopeOfWorkDoc.refreshMenuHint").replace("{number}", scope.quotationNumber), onSelect: () => setConfirmAction("refresh") },
                  canChasePo && !hasPo && { key: "chasePo", label: t("scopeOfWorkDoc.chasePo"), icon: BellRing, hint: t("scopeOfWorkDoc.chasePoTitle"), disabled: chasingPo, onSelect: () => void handleChasePo() },
                  canCreate && { key: "duplicate", label: t("scopeOfWorkDoc.duplicate"), icon: Copy, onSelect: () => setPromptOpen("duplicate") },
                  canCreate && { key: "rewrite", label: t("scopeOfWorkDoc.rewrite"), icon: GitBranch, hint: t("scopeOfWorkDoc.rewriteMenuHint"), disabled: rewriteBusy, onSelect: () => void handleRewrite() },
                  pendingApproval && canEdit && { key: "withdraw", label: t("scopeOfWorkDoc.withdraw"), icon: Undo2, onSelect: () => setConfirmAction("withdraw") },
                  canDelete && { key: "delete", label: t("scopeOfWorkDoc.confirmDelete.title"), icon: Trash2, danger: true, onSelect: () => setConfirmAction("delete") },
                ]}
              />
              {pendingApproval && canFinalize && (
                <>
                  <button type="button" onClick={() => setPromptOpen("reject")} className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5b8b8] bg-white text-[#b93636] text-sm font-medium hover:bg-[#fcebeb] transition-colors whitespace-nowrap">
                    {t("scopeOfWorkDoc.reject")}
                  </button>
                  <button type="button" onClick={() => setConfirmAction("finalize")} className={btn.primary}>
                    <CheckCircle2 size={16} /> {t("scopeOfWorkDoc.approve")}
                  </button>
                </>
              )}
              {canEdit && isDraft && (
                <button type="button" data-tour="sowdoc-submit" onClick={handleSubmitClick} disabled={!printValidation.valid} title={!printValidation.valid ? BLOCKED_TOOLTIP : undefined} className={btn.primary}>
                  <Send size={16} /> {t("scopeOfWorkDoc.submit")}
                </button>
              )}
            </div>
          }
        />
      </div>

      <div className="px-4 md:px-8 py-6 print:p-0">
        <div className="flex flex-col gap-5 print:hidden">
          {draftBackup.recovered && draftBackup.recoveredAt !== null && (
            <DraftRecoveryBanner
              savedAt={draftBackup.recoveredAt}
              onRestore={() => {
                const recovered = draftBackup.recovered!;
                setScope((prev) => (prev ? { ...prev, ...recovered } : prev));
                draftBackup.clear();
                showToast(t("common.draftRecovery.restoredToast"));
              }}
              onDiscard={draftBackup.dismiss}
            />
          )}

          <DocumentStepper steps={steps.steps} current={steps.current} ariaLabel={t("sowdo.stepsAria")} />

          <div ref={summaryRef} className="empty:hidden">
            <ValidationSummary missingCount={finalizeValidation.missingCount} messages={summaryMessages} />
          </div>

          {noSourceItems && (
            <div className="rounded-xl bg-[#fdf3e0] border border-[#f1d8a3] px-4 py-3.5 flex items-start gap-3">
              <AlertTriangle size={18} className="text-[#8a5a00] flex-shrink-0 mt-0.5" />
              <div className="flex-1 flex flex-col gap-2.5">
                <p className="text-sm font-medium text-foreground">{t("scopeOfWorkDoc.noSourceItems.message")}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => requestLeave(onBack)} className={btn.secondarySm}>{t("scopeOfWorkDoc.noSourceItems.backToQuotation")}</button>
                  {editable && (
                    <button type="button" onClick={() => updateField("items", [blankScopeOfWorkItem()])} className={btn.secondarySm}>
                      <Plus size={15} /> {t("scopeOfWorkDoc.noSourceItems.addManually")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <DocumentColumns
            main={
              <>
                <SectionCard title={t("scopeOfWorkDoc.customerTitle")} actions={<SourceTag icon={FileText}>{t("sowdo.fromQuotation")}</SourceTag>}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={18} /></span>
                      <div className="min-w-0">
                        <ReadonlyField label={t("scopeOfWorkDoc.field.customerName")} value={scope.customerSnapshot.companyName} />
                        <FieldError message={fe["customerSnapshot.companyName"]} />
                      </div>
                    </div>
                    <div className="self-center">
                      <ReadonlyField label={t("scopeOfWorkDoc.field.contactName")} value={scope.customerSnapshot.contactName} />
                      <FieldError message={fe["customerSnapshot.contactName"]} />
                    </div>
                    <ReadonlyField label={t("scopeOfWorkDoc.subtitleJobType")} value={scope.jobTypeCode ? `${scope.jobTypeCode}${scope.jobTypeName ? ` — ${scope.jobTypeName}` : ""}` : scope.jobTypeName} />
                    <ReadonlyField label={t("scopeOfWorkDoc.subtitleSalesperson")} value={scope.quotationSalesperson} />
                  </div>
                </SectionCard>

                <div data-tour="sowdoc-header">
                  <SectionCard title={t("scopeOfWorkDoc.documentInfoTitle")}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-[18px] items-start">
                      <Field className="md:col-span-2" label={t("scopeOfWorkDoc.field.scopeNumber")} htmlFor="sow-scopeNumber" required help={editable ? t("scopeOfWorkDoc.field.scopeNumberHelp") : undefined} error={fe.scopeNumber}>
                        <input id="sow-scopeNumber" disabled={!editable} className={`${field.input} w-full font-mono`} value={scope.scopeNumber} onChange={(e) => updateField("scopeNumber", e.target.value)} placeholder={t("scopeOfWorkDoc.field.scopeNumberPlaceholder")} />
                      </Field>
                      <Field
                        label={<>{t("scopeOfWorkDoc.field.secondaryCodeShort")} <span className="font-normal text-muted-foreground">{t("sowdo.optionalParen")}</span></>}
                        htmlFor="sow-secondaryCode"
                        help={t("scopeOfWorkDoc.field.secondaryCodeHelp")}
                        error={fe.secondaryCode}
                      >
                        <input id="sow-secondaryCode" disabled={!editable} className={`${field.input} w-full font-mono`} value={scope.secondaryCode} onChange={(e) => updateField("secondaryCode", e.target.value)} placeholder={t("scopeOfWorkDoc.field.secondaryCodePlaceholder")} />
                      </Field>
                      <Field label={t("scopeOfWorkDoc.field.drawingCode")} htmlFor="sow-drawingCode" required error={fe.drawingCode}>
                        <input id="sow-drawingCode" disabled={!editable} className={`${field.input} w-full`} value={scope.drawingCode} onChange={(e) => updateField("drawingCode", e.target.value)} />
                      </Field>
                      <Field label={t("scopeOfWorkDoc.field.issueDate")} htmlFor="sow-issueDate" required error={fe.issueDate}>
                        <input id="sow-issueDate" disabled={!editable} type="date" className={`${field.input} w-full`} value={scope.issueDate} onChange={(e) => updateField("issueDate", e.target.value)} />
                      </Field>
                      <Field label={t("scopeOfWorkDoc.field.deliveryDate")} htmlFor="sow-deliveryDate" required error={fe.deliveryDate}>
                        <input id="sow-deliveryDate" disabled={!editable} type="date" className={`${field.input} w-full`} value={scope.deliveryDate} onChange={(e) => updateField("deliveryDate", e.target.value)} />
                      </Field>
                      {/* ลูกค้าออก PO มาได้หลายใบต่อหนึ่งงาน — เก็บเลขแรกไว้ที่ `customerPoNumber` (ตัวที่
                          แท็บ "ยังไม่มี PO" กับคำสั่งทวง PO ใช้) ที่เหลือลง `additionalPoNumbers` ·
                          แก้ได้แม้เอกสารอนุมัติแล้ว (PO มักมาทีหลัง) จึงผูกกับ canEdit ไม่ใช่ editable */}
                      <div data-tour="sowdoc-po" className="md:col-span-3 min-w-0">
                      <Field label={t("scopeOfWorkDoc.field.customerPoNumber")} htmlFor="sow-customerPoNumber" help={canEdit && !isDraft ? t("scopeOfWorkDoc.field.poHelp") : undefined}>
                        <PoNumberListEditor
                          idPrefix="sow-customerPoNumber"
                          disabled={!canEdit}
                          values={[scope.customerPoNumber, ...scope.additionalPoNumbers]}
                          onChange={(next) => setScope((prev) => (prev ? { ...prev, customerPoNumber: next[0] ?? "", additionalPoNumbers: next.slice(1) } : prev))}
                          addLabel={t("scopeOfWorkDoc.addPoNumber")}
                          removeLabel={t("scopeOfWorkDoc.removePoNumber")}
                          placeholder={t("scopeOfWorkDoc.poPlaceholder")}
                        />
                      </Field>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <SectionCard title={t("scopeOfWorkDoc.shippingTitle")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px]">
                    <Field className="sm:col-span-2" label={t("scopeOfWorkDoc.field.deliveryLocation")} htmlFor="sow-deliveryLocation" required error={fe.deliveryLocation}>
                      <input id="sow-deliveryLocation" disabled={!editable} className={`${field.input} w-full`} value={scope.deliveryLocation} onChange={(e) => updateField("deliveryLocation", e.target.value)} />
                    </Field>
                    <Field label={t("scopeOfWorkDoc.field.shippingContact")} htmlFor="sow-shippingContact" required error={fe.shippingContact}>
                      <input id="sow-shippingContact" disabled={!editable} className={`${field.input} w-full`} value={scope.shippingContact} onChange={(e) => updateField("shippingContact", e.target.value)} />
                    </Field>
                    <Field label={t("scopeOfWorkDoc.field.shippingPhone")} htmlFor="sow-shippingPhone" required error={fe.shippingPhone}>
                      <input id="sow-shippingPhone" disabled={!editable} className={`${field.input} w-full`} value={scope.shippingPhone} onChange={(e) => updateField("shippingPhone", e.target.value)} />
                    </Field>
                    <Field label={t("scopeOfWorkDoc.field.billingContact")} htmlFor="sow-billingContact" required error={fe.billingContact}>
                      <input id="sow-billingContact" disabled={!editable} className={`${field.input} w-full`} value={scope.billingContact} onChange={(e) => updateField("billingContact", e.target.value)} />
                    </Field>
                    <Field label={t("scopeOfWorkDoc.field.billingPhone")} htmlFor="sow-billingPhone" required error={fe.billingPhone}>
                      <input id="sow-billingPhone" disabled={!editable} className={`${field.input} w-full`} value={scope.billingPhone} onChange={(e) => updateField("billingPhone", e.target.value)} />
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard title={<span id="sow-remarks-heading">{t("scopeOfWorkDoc.remarksTitle")}</span>}>
                  <textarea disabled={!editable} rows={4} aria-labelledby="sow-remarks-heading" className={`${field.textarea} w-full resize-y`} value={scope.remarks} onChange={(e) => updateField("remarks", e.target.value)} />
                </SectionCard>
              </>
            }
            rail={
              <>
                <RailSummaryCard
                  dataTour="sowdoc-completion"
                  label={t("scopeOfWorkDoc.completionTitle")}
                  value={`${completionPct}%`}
                  valueNote={t("scopeOfWorkDoc.completionCount").replace("{done}", String(completedChecks)).replace("{total}", String(totalRequiredChecks))}
                  progress={completionPct}
                  rows={[
                    { label: t("scopeOfWorkItems.title"), value: t("scopeOfWorkItems.count").replace("{items}", String(itemCount)).replace("{sections}", String(sectionCount)) },
                    { label: t("scopeOfWorkDoc.installmentsLabel"), value: t("scopeOfWorkDoc.railInstallmentsValue").replace("{n}", String(scope.paymentConditions.installments.length)).replace("{pct}", String(installmentPctTotal)) },
                    { label: t("scopeOfWorkDoc.field.deliveryDate"), value: scope.deliveryDate ? formatQuoteDateThai(scope.deliveryDate) : "—" },
                  ]}
                />

                <RailCard title={t("sowdo.sourceTitle")}>
                  <SourceDocRow icon={FileText} kind={t("scopeOfWorkDoc.field.quotationNumber")} number={scope.quotationNumber || "—"} />
                  <ExtraQuotationNumbers
                    values={scope.additionalQuotationNumbers}
                    onChange={(next) => updateField("additionalQuotationNumbers", next)}
                    disabled={!editable}
                  />
                  <SourceNote
                    action={editable ? (
                      <button type="button" onClick={() => setConfirmAction("refresh")} className={railTextBtn}>
                        <RotateCw size={14} /> {t("scopeOfWorkDoc.refreshFromQuotation")}
                      </button>
                    ) : undefined}
                  >
                    {t("scopeOfWorkDoc.sourceNote")}
                  </SourceNote>
                </RailCard>

                {showRelated && (
                  <RailCard title={t("sowdo.relatedTitle")}>
                    {canViewDeliveryOrder && (
                      <RelatedDocRow
                        icon={Truck}
                        kind={t("deliveryOrder.pageTitle")}
                        value={existingDeliveryOrder ? statusLabel(existingDeliveryOrder.status) : "—"}
                        action={(existingDeliveryOrder || canCreateDeliveryOrder) && (
                          <button type="button" onClick={() => void handleDeliveryOrderClick()} disabled={deliveryOrderBusy} className={railLink}>
                            {busyIcon(deliveryOrderBusy)}
                            {existingDeliveryOrder ? t("scopeOfWorkDoc.openDeliveryOrder") : t("scopeOfWorkDoc.createDeliveryOrder")}
                          </button>
                        )}
                      />
                    )}
                    {canViewDeliveryOrder && (canViewCostControl || canViewProject) && <div className="h-px bg-[#eef1f6]" />}
                    {canViewCostControl && (
                      <RelatedDocRow
                        icon={Calculator}
                        kind={t("scopeOfWorkDoc.costControlLabel")}
                        value={existingCostControl ? <span className="font-mono text-[13px]">{existingCostControl.documentNumber}</span> : "—"}
                        action={(existingCostControl || canCreateCostControl) && (
                          <button type="button" onClick={() => void handleCostControlClick()} disabled={costControlBusy} className={railLink}>
                            {busyIcon(costControlBusy)}
                            {existingCostControl ? t("scopeOfWorkDoc.openCostControl") : t("scopeOfWorkDoc.createCostControl")}
                          </button>
                        )}
                      />
                    )}
                    {canViewCostControl && canViewProject && <div className="h-px bg-[#eef1f6]" />}
                    {canViewProject && (
                      <RelatedDocRow
                        icon={Briefcase}
                        kind={t("scopeOfWorkDoc.projectLabel")}
                        value={existingProject ? t(PROJECT_STATUS_KEY[existingProject.status]) : "—"}
                        // เปิดโครงการใหม่ได้เฉพาะงานที่อนุมัติแล้ว (Final) — ตรงกับด่านฝั่งเซิร์ฟเวอร์ใน handleCreate()
                        // ถ้ามีโครงการอยู่แล้ว ปุ่มนี้เป็นแค่ทางลัด "เปิดโครงการ" จึงกดได้เสมอไม่ว่าสถานะใด
                        note={!existingProject && canCreateProject && scope.status !== "Final" ? t("scopeOfWorkDoc.createProjectNeedsFinal") : undefined}
                        action={(existingProject || canCreateProject) && (
                          <button
                            type="button"
                            onClick={() => void handleProjectClick()}
                            disabled={projectBusy || (!existingProject && scope.status !== "Final")}
                            title={!existingProject && scope.status !== "Final" ? t("scopeOfWorkDoc.createProjectNeedsFinal") : undefined}
                            className={railLink}
                          >
                            {busyIcon(projectBusy)}
                            {existingProject ? t("scopeOfWorkDoc.openProject") : t("scopeOfWorkDoc.createProject")}
                          </button>
                        )}
                      />
                    )}
                  </RailCard>
                )}

                <RailCard title={t("scopeOfWorkDoc.signatoriesTitle")}>
                  <div className="flex flex-col gap-4">
                    <SignatoryField label={t("scopeOfWorkDoc.sellerLabel")} value={scope.seller} onChange={(v) => updateField("seller", v)} users={users} disabled={!editable} required error={fe["seller.name"]} />
                    <SignatoryField label={t("scopeOfWorkDoc.approverLabel")} value={scope.approver} onChange={(v) => updateField("approver", v)} users={users} disabled={!editable} required error={fe["approver.name"]} />
                    {editable && <span className={field.help}>{t("scopeOfWorkDoc.signatoriesHelp")}</span>}
                  </div>
                </RailCard>

                <NextStepHint title={t("sowdo.nextStep")}>{nextStepHint}</NextStepHint>
              </>
            }
          />

          <ScopeOfWorkItemsEditor
            items={scope.items}
            onChange={(items) => updateField("items", items)}
            disabled={!editable}
            itemErrors={itemErrors}
            noItemsError={fe.items}
          />

          <SectionCard title={t("scopeOfWorkDoc.paymentTitle")}>
            <div className="flex flex-col gap-4">
              <PaymentInstallmentsEditor
                installments={scope.paymentConditions.installments}
                onChange={(installments) => updateField("paymentConditions", { ...scope.paymentConditions, installments })}
                disabled={!editable}
              />
              <FieldError message={fe["paymentConditions.percentTotal"]} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Field label={t("scopeOfWorkDoc.paymentDescription")} htmlFor="sow-paymentDescription" required error={fe["paymentConditions.description"]}>
                  <textarea id="sow-paymentDescription" disabled={!editable} rows={3} className={`${field.textarea} w-full resize-y`} value={scope.paymentConditions.description} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, description: e.target.value })} />
                </Field>
                <Field label={t("scopeOfWorkDoc.paymentNotes")} htmlFor="sow-paymentNotes">
                  <textarea id="sow-paymentNotes" disabled={!editable} rows={3} className={`${field.textarea} w-full resize-y`} value={scope.paymentConditions.notes} onChange={(e) => updateField("paymentConditions", { ...scope.paymentConditions, notes: e.target.value })} />
                </Field>
              </div>
            </div>
          </SectionCard>

          {revisionPredecessorScopeNumber && (
            <SectionCard
              title={<span id="sow-revisionNote-heading">{t("scopeOfWorkDoc.revisionNoteTitle")}</span>}
              subtitle={t("scopeOfWorkDoc.revisionNoteHelp").replace("{predecessor}", revisionPredecessorScopeNumber)}
              actions={
                <button type="button" onClick={handleGenerateRevisionNote} disabled={!editable || generatingRevisionNote} className={btn.secondarySm}>
                  {generatingRevisionNote ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} {t("scopeOfWorkDoc.generateRevisionNote")}
                </button>
              }
            >
              <textarea
                rows={6}
                disabled={!editable}
                aria-labelledby="sow-revisionNote-heading"
                className={`${field.textarea} w-full resize-y font-mono`}
                value={scope.revisionNote ?? ""}
                onChange={(e) => updateField("revisionNote", e.target.value)}
                placeholder={t("scopeOfWorkDoc.revisionNotePlaceholder")}
              />
            </SectionCard>
          )}

          <div data-tour="sowdoc-checklist">
            <SectionCard
              title={t("scopeOfWorkDoc.checklistTitle")}
              actions={<span className="text-[13px] text-muted-foreground">{t("scopeOfWorkDoc.checklistRequiredNote")}</span>}
              bodyClassName="px-6 py-1.5"
            >
              {scope.checklistGroups.map((group, idx) => (
                <ChecklistGroupCard
                  key={group.key}
                  variant="row"
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
            </SectionCard>
          </div>

          {/* ไม่มีกลุ่ม "เอกสารส่งถึง" = การ์ดไม่แสดง — ไม่ใส่จุดยึด คำแนะนำจะข้ามขั้นนี้ */}
          <div data-tour={documentsToSendGroup ? "sowdoc-recipients" : undefined}>
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
            footer={canEdit ? (
              <>
                {/* บอกให้เห็นก่อนกดส่งว่ามีใบต้นทุนไปด้วยไหม — ผู้รับเห็นใบนี้ในรายการของตัวเองทันที
                    ที่ถูกเลือกเป็นผู้รับ ไม่ได้รอปุ่มส่ง แต่คนกดควรรู้ว่ากำลังแจกอะไรออกไปบ้าง */}
                {canViewCostControl && existingCostControl ? (
                  <button type="button" onClick={() => onOpenCostControl(existingCostControl.id)} className="flex-1 min-w-0 text-left text-[13px] text-[#3d5173] hover:underline inline-flex items-center gap-2">
                    <Calculator size={15} className="text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{t("scopeOfWorkDoc.costControlGoesAlong")}: <span className="font-mono font-medium">{existingCostControl.documentNumber}</span></span>
                  </button>
                ) : <span className="flex-1" />}
                <button
                  type="button"
                  onClick={handleSendDocuments}
                  disabled={!hasDocumentRecipientsToSend || sendingDocs}
                  title={!hasDocumentRecipientsToSend ? t("scopeOfWorkDoc.sendDocumentsNeedRecipient") : undefined}
                  className={btn.secondary}
                >
                  {sendingDocs ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("scopeOfWorkDoc.sendDocuments")}
                </button>
              </>
            ) : undefined}
          />
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
