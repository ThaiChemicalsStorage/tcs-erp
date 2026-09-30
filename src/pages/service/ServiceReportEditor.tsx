import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import type { DriveStep } from "driver.js";
import { ArrowLeft, Save, CheckCircle2, RotateCcw, Ban, Trash2, ChevronDown, Printer, Plus, Send, HelpCircle, Copy, Check, Link2, X, Info } from "lucide-react";
import {
  type ServiceReport, type ServiceReportDraft, type ServiceChecklistSectionValue, type ServiceChecklistItemValue,
  fetchServiceReport, createServiceReport, updateServiceReport, changeServiceReportStatus, deleteServiceReport,
  uploadServiceReportPhoto, deleteServiceReportPhoto, printServiceReport, mergeServerPhotosIntoChecklist,
  sendServiceReportCustomerApproval,
} from "../../lib/serviceReports";
import { type ServiceTemplateSummary, type ServiceTemplate, type ServiceChecklistSectionDef, type ServiceChecklistItemKind, fetchServiceTemplates, fetchServiceTemplate } from "../../lib/serviceTemplates";
import { type Customer, fetchCustomers, createLinePairingCode } from "../../lib/customers";
import { type User, fetchUsers } from "../../lib/users";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { ServiceChecklistItemControl } from "../../components/ServiceChecklistItemControl";
import { SignaturePad } from "../../components/SignaturePad";
import { InlineEditableLabel } from "../../components/InlineEditableLabel";
import { useModuleTour } from "../../components/GuidedTour";
import { MAX_CHECKLIST_GROUP_TITLE_LENGTH } from "../../lib/validation/serviceReportValidation";
import { ServiceReportPrintDocument } from "./ServiceReportPrintDocument";
import { PromptDialog } from "../../components/PromptDialog";
import { DocumentHeader, DocumentStepper, DocumentColumns, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field } from "../../components/ui/styles";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { formatQuoteDateThai } from "../../lib/quotes";
import { ServiceCustomerSearch } from "./ServiceCustomerSearch";
import { ServiceConfirmDialog, ServiceStatusBadge } from "./serviceUi";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";

const emptyCustomerSnapshot = { companyName: "", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" };

// ค่าพิเศษใน dropdown เลือก Template แทน "ไม่ใช้ Template" — คนละความหมายกับค่าว่าง "" ซึ่งแปลว่า
// ยังไม่ได้เลือกอะไรเลย (ปุ่มสร้างรายงานยังกดไม่ได้) ส่วนค่านี้คือการเลือกอย่างตั้งใจว่าจะเริ่มจากว่าง
// A sentinel option value for "no template" in the dropdown — distinct from "" (nothing chosen
// yet, Create stays blocked). Choosing this is an intentional decision to start blank, not an
// unselected placeholder. Never collides with a real MongoDB ObjectId string.
const NO_TEMPLATE_VALUE = "__no_template__";

interface FormState {
  customerId: string;
  customerSnapshot: typeof emptyCustomerSnapshot;
  serviceLocation: string;
  projectOrJobCode: string;
  serviceSystemName: string;
  serviceType: string;
  inspectionDate: string;
  reportDate: string;
  nextPmDate: string;
  assignedServiceEngineerId: string;
  additionalInspectorNamesText: string;
  onSiteContactName: string;
  onSiteContactPhone: string;
  overallCustomerSummary: string;
  overallRemark: string;
  customerSignatureDataUrl: string;
  customerSignedName: string;
  // Optimistic only, for the locked preview between confirming a signature and saving — the server
  // stamps the authoritative value and sends it back, so this is never part of the payload.
  customerSignedAt: string | null;
}

function emptyForm(currentUserId: string): FormState {
  return {
    customerId: "", customerSnapshot: emptyCustomerSnapshot,
    serviceLocation: "", projectOrJobCode: "", serviceSystemName: "", serviceType: "",
    inspectionDate: new Date().toISOString().slice(0, 10), reportDate: new Date().toISOString().slice(0, 10), nextPmDate: "",
    assignedServiceEngineerId: currentUserId, additionalInspectorNamesText: "",
    onSiteContactName: "", onSiteContactPhone: "", overallCustomerSummary: "", overallRemark: "",
    customerSignatureDataUrl: "", customerSignedName: "", customerSignedAt: null,
  };
}

function formFromReport(report: ServiceReport): FormState {
  return {
    customerId: report.customerId, customerSnapshot: report.customerSnapshot,
    serviceLocation: report.serviceLocation, projectOrJobCode: report.projectOrJobCode,
    serviceSystemName: report.serviceSystemName, serviceType: report.serviceType,
    inspectionDate: report.inspectionDate, reportDate: report.reportDate, nextPmDate: report.nextPmDate,
    assignedServiceEngineerId: report.assignedServiceEngineerId,
    additionalInspectorNamesText: report.additionalInspectorNames.join(", "),
    onSiteContactName: report.onSiteContactName, onSiteContactPhone: report.onSiteContactPhone,
    overallCustomerSummary: report.overallCustomerSummary, overallRemark: report.overallRemark,
    // ?? "" for reports created before sign-off existed (2026-08-07) — the server normalizes these
    // too, this is belt-and-braces so a stale cached response can't render a broken <img>.
    customerSignatureDataUrl: report.customerSignatureDataUrl ?? "",
    customerSignedName: report.customerSignedName ?? "",
    customerSignedAt: report.customerSignedAt ?? null,
  };
}

// นับความคืบหน้าของหนึ่งหมวด — ใช้ทั้งตัวเลขบนหัวหมวดและการ์ดสรุปบนคอลัมน์ขวา
// (รายการ "ค่าที่วัดได้" นับว่าตรวจแล้วเมื่อกรอกค่า · รายการ ปกติ/ผิดปกติ นับเมื่อเลือกอย่างใดอย่างหนึ่ง)
function sectionProgress(sectionDef: ServiceChecklistSectionDef, sectionValue: ServiceChecklistSectionValue | undefined) {
  let answered = 0, total = 0, normal = 0, abnormal = 0, measured = 0;
  for (const groupDef of sectionDef.groups) {
    const groupValue = sectionValue?.groups.find((g) => g.key === groupDef.key);
    for (const itemDef of groupDef.items) {
      total += 1;
      const itemValue = groupValue?.items.find((it) => it.key === itemDef.key);
      if (itemDef.kind === "measurement") {
        if (itemValue?.measurementValue.trim()) { answered += 1; measured += 1; }
      } else if (itemValue?.status && itemValue.status !== "not_selected") {
        answered += 1;
        if (itemValue.status === "normal") normal += 1; else abnormal += 1;
      }
    }
  }
  return { answered, total, normal, abnormal, measured };
}

// ฟอร์มสร้าง/แก้ไขรายงานบริการ รวมข้อมูลรายงานและเช็คลิสต์ตรวจเช็ค
// Create/edit form for a Service Report, combining report info and the inspection checklist.
export function ServiceReportEditor({
  serviceReportId,
  currentUserId,
  company,
  canEdit,
  canComplete,
  canDelete,
  canPrint,
  onBack,
  onCreated,
  onDeleted,
  showToast,
}: {
  serviceReportId: string | "new";
  currentUserId: string;
  company: Company;
  canEdit: boolean;
  canComplete: boolean;
  canDelete: boolean;
  canPrint: boolean;
  onBack: () => void;
  onCreated: (newId: string) => void;
  onDeleted: () => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const isNew = serviceReportId === "new";

  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [report, setReport] = useState<ServiceReport | null>(null);
  const [templates, setTemplates] = useState<ServiceTemplateSummary[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedTemplateFull, setSelectedTemplateFull] = useState<ServiceTemplate | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(currentUserId));
  // This report's own checklist structure — starts as the frozen templateSnapshot.sections and is
  // per-report customizable (each job differs): groups/items can be added or removed while Draft,
  // saved back via PATCH `templateSections`. The master template is never touched. Only meaningful
  // for an existing report; the new-report preview derives read-only from selectedTemplateFull.
  const [sections, setSections] = useState<ServiceChecklistSectionDef[]>([]);
  const [checklist, setChecklist] = useState<ServiceChecklistSectionValue[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [checklistErrors, setChecklistErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "delete" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [addItemTarget, setAddItemTarget] = useState<{ sectionKey: string; groupKey: string } | null>(null);
  const [addGroupTarget, setAddGroupTarget] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<
    | { type: "item"; sectionKey: string; groupKey: string; itemKey: string }
    | { type: "group"; sectionKey: string; groupKey: string }
    | null
  >(null);
  // การส่งให้ลูกค้าอนุมัติผ่านลิงก์/LINE (2026-08-10)
  const [sendingApproval, setSendingApproval] = useState(false);
  const [approvalResult, setApprovalResult] = useState<{ url: string; sentViaLine: boolean; lineError?: string } | null>(null);
  const [approvalLinkCopied, setApprovalLinkCopied] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchServiceTemplates(), fetchCustomers(), fetchUsers(),
      isNew ? Promise.resolve(null) : fetchServiceReport(serviceReportId),
    ])
      .then(([tpls, custs, usrs, rpt]) => {
        if (cancelled) return;
        setTemplates(tpls.filter((tp) => tp.isActive && !tp.isDeleted));
        setCustomers(custs);
        setUsers(usrs);
        if (rpt) {
          setReport(rpt);
          setForm(formFromReport(rpt));
          setChecklist(rpt.checklist);
          setSections(rpt.templateSnapshot.sections);
        }
        setPhase("ready");
      })
      .catch(() => { if (!cancelled) setPhase("error"); });
    return () => { cancelled = true; };
  }, [serviceReportId, isNew]);

  useEffect(() => {
    if (!isNew || !selectedTemplateId || selectedTemplateId === NO_TEMPLATE_VALUE) return;
    let cancelled = false;
    fetchServiceTemplate(selectedTemplateId).then((tpl) => { if (!cancelled) setSelectedTemplateFull(tpl); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isNew, selectedTemplateId]);

  // Follows the form, not the saved report, so reassigning the engineer updates the sign-off panel
  // immediately rather than only after a save.
  const engineerUser = users.find((u) => u.id === form.assignedServiceEngineerId);
  const isEditable = isNew || (canEdit && report?.status === "Draft");

  const docTourSteps: DriveStep[] = [
    { element: '[data-tour="servicedoc-actions"]', popover: { title: t("tour.servicedoc.actions.title"), description: t("tour.servicedoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="servicedoc-checklist"]', popover: { title: t("tour.servicedoc.checklist.title"), description: t("tour.servicedoc.checklist.desc"), side: "top" } },
    { element: '[data-tour="servicedoc-signature"]', popover: { title: t("tour.servicedoc.signature.title"), description: t("tour.servicedoc.signature.desc"), side: "top" } },
  ];
  // Waits for the record: the steps describe controls that only exist once the report is loaded
  // (and the sign-off card renders only for a saved report) — same autoStart gating as
  // ScopeOfWorkDocument/DeliveryOrderDocument, which had this exact race.
  const docTour = useModuleTour("serviceDoc", currentUserId, docTourSteps, { autoStart: !isNew && !!report });

  // ── บันทึกอัตโนมัติ (2026-08-25) ───────────────────────────────────────
  // รายงานที่ยังไม่ได้สร้าง (isNew) เก็บได้แค่ในเครื่อง เพราะยังไม่มีเรคอร์ดบนเซิร์ฟเวอร์
  // A brand-new report has no server record yet, so it gets the local snapshot only — the same
  // split as a brand-new quotation. Its snapshot carries `selectedTemplateId` too: without the
  // template choice, restored answers would have no checklist structure to belong to.
  // An existing Draft additionally auto-saves for real. See src/hooks/useAutoSave.ts.
  // ทุกอย่างที่ผู้ใช้กรอกได้บนหน้านี้ — ใช้ทั้งเป็นสำเนาในเครื่องและเป็นตัวเทียบ "การแก้ไขที่ยังไม่ได้บันทึก"
  // รับ checklist เข้ามาเป็นพารามิเตอร์ เพราะหลังบันทึกต้องตั้งฐานเทียบด้วย checklist ที่เซิร์ฟเวอร์ตอบกลับมา
  // ไม่ใช่ค่าที่ยังอยู่ใน state (ซึ่งยังไม่ commit ตอนที่เรียก)
  //
  // Takes the checklist as a parameter because after a save the baseline must be seeded from the
  // server's version, not the state value — which has not committed yet at the point of the call.
  const toGuardPayload = (checklistValue: typeof checklist) => ({ form, checklist: checklistValue, selectedTemplateId });
  const autoSaveBackupData = toGuardPayload(checklist);
  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) — รายงานใหม่คือเคสที่งานหายจริง เพราะยังไม่มีเรคอร์ดบนเซิร์ฟเวอร์
  const dirty = useDirtyTracker(phase === "ready" && isEditable ? autoSaveBackupData : null);
  const draftBackup = useDraftBackup<typeof autoSaveBackupData>({
    storageKey: isNew ? "serviceReport:new" : `serviceReport:${serviceReportId}`,
    data: phase === "ready" ? autoSaveBackupData : null,
    enabled: isEditable,
  });

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const draftBody = (): Omit<ServiceReportDraft, "templateId"> & { templateId?: string } => ({
    customerId: form.customerId,
    customerSnapshot: form.customerSnapshot,
    serviceLocation: form.serviceLocation,
    projectOrJobCode: form.projectOrJobCode,
    serviceSystemName: form.serviceSystemName,
    serviceType: form.serviceType,
    inspectionDate: form.inspectionDate,
    reportDate: form.reportDate,
    nextPmDate: form.nextPmDate,
    assignedServiceEngineerId: form.assignedServiceEngineerId,
    additionalInspectorNames: form.additionalInspectorNamesText.split(",").map((n) => n.trim()).filter(Boolean),
    onSiteContactName: form.onSiteContactName,
    onSiteContactPhone: form.onSiteContactPhone,
    overallCustomerSummary: form.overallCustomerSummary,
    overallRemark: form.overallRemark,
    customerSignatureDataUrl: form.customerSignatureDataUrl,
    customerSignedName: form.customerSignedName,
    checklist,
  });

  // ต้องประกาศหลัง draftBody() เพราะใช้ผลลัพธ์ของมันเป็น payload ที่ส่งขึ้นเซิร์ฟเวอร์
  // Declared after `draftBody()` because it sends exactly what that function builds — the same
  // payload the Save button sends, so the two can never diverge.
  const autoSave = useAutoSave({
    data: !isNew && report && isEditable ? { ...draftBody(), templateSections: sections } : null,
    enabled: !isNew && !!report && isEditable,
    onSave: async (fields) => {
      if (!report) return;
      // ไม่เขียนผลลัพธ์กลับลง form/checklist เพราะผู้ใช้อาจกำลังกรอกอยู่ — ต่างจากการกดบันทึกเอง
      // The response is deliberately not applied back into `form`/`checklist` the way a manual save
      // does: the user may be mid-entry, and `applyServerReport()` would replace what they typed.
      await updateServiceReport(report.id, fields, { autoSave: true });
    },
  });

  const copyApprovalLink = async (url: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setApprovalLinkCopied(true);
        return;
      }
      throw new Error("clipboard API unavailable");
    } catch {
      // Fallback for non-secure origins (plain HTTP on LAN) or browsers that block
      // navigator.clipboard — navigator.clipboard is undefined there, and calling
      // .writeText on it throws synchronously instead of rejecting into .catch().
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        const ok = document.execCommand("copy");
        if (ok) setApprovalLinkCopied(true);
        else showToast(t("service.approval.copyFailed"));
      } catch {
        showToast(t("service.approval.copyFailed"));
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const applyApiError = (err: unknown, fallback: string) => {
    if (err instanceof ApiError) {
      if (err.fieldErrors) setFieldErrors(err.fieldErrors);
      // Keyed by "sectionKey.groupKey.itemKey" so each failing control highlights individually —
      // see validateServiceChecklist() (src/lib/validation/serviceReportValidation.ts).
      if (err.checklistItemErrors) setChecklistErrors(err.checklistItemErrors);
      showToast(err.message || fallback);
    } else {
      showToast(fallback);
    }
  };

  const handleCreate = async (): Promise<boolean> => {
    if (!selectedTemplateId) { showToast(t("service.form.selectTemplateFirst")); return false; }
    setSaving(true);
    setFieldErrors({});
    try {
      const templateId = selectedTemplateId === NO_TEMPLATE_VALUE ? "" : selectedTemplateId;
      const created = await createServiceReport({ ...draftBody(), templateId } as ServiceReportDraft);
      // ลบสำเนา "serviceReport:new" ทิ้ง ไม่งั้นการสร้างรายงานใหม่ครั้งหน้าจะถูกเสนอให้กู้คืนงานที่บันทึกไปแล้ว
      // Drops the "serviceReport:new" snapshot: the record exists now, so leaving it behind would
      // greet the next brand-new report with a recovery offer for work that is already saved.
      draftBackup.clear();
      dirty.markSaved(toGuardPayload(created.checklist));
      showToast(t("service.toast.created"));
      onCreated(created.id);
      return true;
    } catch (err) {
      applyApiError(err, t("service.toast.createFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Every server response carries the authoritative report — resync all three local mirrors
  // (report, checklist values, checklist structure) so they can never drift from what was saved.
  const applyServerReport = (updated: ServiceReport) => {
    setReport(updated);
    setChecklist(updated.checklist);
    setSections(updated.templateSnapshot.sections);
    // ทุกคำตอบจากเซิร์ฟเวอร์ผ่านตรงนี้ จึงเป็นที่เดียวที่ต้องตั้งฐานเทียบใหม่ — พลาดที่ไหนที่หนึ่ง เอกสารจะค้าง
    // สถานะ "ยังไม่บันทึก" แล้วเด้งถามทุกครั้งที่เปลี่ยนหน้า
    dirty.markSaved(toGuardPayload(updated.checklist));
  };

  const handleSaveDraft = async (): Promise<boolean> => {
    if (!report) return false;
    setSaving(true);
    setFieldErrors({});
    try {
      const saved = { ...draftBody(), templateSections: sections };
      const updated = await updateServiceReport(report.id, saved);
      applyServerReport(updated);
      // ตั้งฐานเทียบของ auto-save ใหม่ ไม่งั้นจะยิงบันทึกซ้ำด้วยข้อมูลเดิมอีกรอบ — ใช้ payload ที่ส่งไปจริง
      // เพื่อไม่ให้สิ่งที่ผู้ใช้พิมพ์เพิ่มระหว่างรอผลบันทึกถูกนับว่า "บันทึกแล้ว" ทั้งที่ยังไม่ได้ส่ง
      autoSave.markSaved(saved);
      draftBackup.clear();
      showToast(t("service.toast.saved"));
      return true;
    } catch (err) {
      applyApiError(err, t("service.toast.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // การ์ด "ยังไม่ได้บันทึก" — ปุ่ม "บันทึก" ในกล่องต้องตรงเฟส: รายงานใหม่คือการ "สร้าง" (createServiceReport)
  // ส่วนฉบับร่างที่มีอยู่แล้วคือการบันทึกทับ ทั้งคู่ผ่าน validation เดิมและรายงานข้อผิดพลาดเหมือนกดปุ่มเอง
  const { requestLeave } = useUnsavedChangesGuard(
    isEditable
      ? {
          getRisk: () => assessUnsavedRisk({
            isDirty: dirty.isDirtyNow(),
            hasServerRecord: !isNew,
            autoSaveEnabled: !isNew && !!report && isEditable,
            autoSaveState: autoSave.state,
          }),
          documentLabel: report?.id ?? form.serviceSystemName,
          save: isNew ? handleCreate : handleSaveDraft,
          discard: draftBackup.clear,
        }
      : null,
  );

  // บันทึกก่อนเสมอ (ถ้ายังแก้ได้) แล้วสร้างลิงก์อนุมัติอายุ 7 วัน — ส่งเข้า LINE ลูกค้าอัตโนมัติถ้าผูกไว้
  // Saves first (when still editable), then creates the 7-day approval link, LINE-pushing it when linked
  const handleSendApproval = async () => {
    if (!report || sendingApproval) return;
    setSendingApproval(true);
    try {
      if (isEditable) {
        const saved = await updateServiceReport(report.id, { ...draftBody(), templateSections: sections });
        applyServerReport(saved);
      }
      const result = await sendServiceReportCustomerApproval(report.id);
      applyServerReport(result.serviceReport);
      setApprovalLinkCopied(false);
      setPairing(null);
      setApprovalResult({ url: result.approvalUrl, sentViaLine: result.sentViaLine, lineError: result.lineError });
    } catch (err) {
      applyApiError(err, t("service.approval.sendFailed"));
    } finally {
      setSendingApproval(false);
    }
  };

  // ออกรหัสจับคู่ LINE ของลูกค้ารายนี้ (อายุ 24 ชม.) เพื่อให้ลูกค้าพิมพ์ในแชท LINE OA ของบริษัท
  // Issues this customer's 24-hour LINE pairing code, typed by the customer into the company OA chat
  const handleCreatePairing = async () => {
    const customerId = report?.customerId || form.customerId;
    if (!customerId || pairingBusy) return;
    setPairingBusy(true);
    try {
      setPairing(await createLinePairingCode(customerId));
    } catch (err) {
      applyApiError(err, t("service.approval.pairingFailed"));
    } finally {
      setPairingBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!report) return;
    setCompleting(true);
    setFieldErrors({});
    setChecklistErrors({});
    try {
      const saved = await updateServiceReport(report.id, { ...draftBody(), templateSections: sections });
      const updated = await changeServiceReportStatus(saved.id, "complete");
      applyServerReport(updated);
      showToast(t("service.toast.completed"));
    } catch (err) {
      applyApiError(err, t("service.toast.completeFailed"));
      // Expand every section so a failing item (possibly inside a collapsed one) is visible
      // immediately, rather than making the user hunt for which section hides the problem.
      setCollapsedSections(new Set());
    } finally {
      setCompleting(false);
    }
  };

  const handleReopen = async () => {
    if (!report) return;
    setActionBusy(true);
    try {
      const updated = await changeServiceReportStatus(report.id, "reopen");
      applyServerReport(updated);
      showToast(t("service.toast.reopened"));
    } catch (err) {
      applyApiError(err, t("service.toast.actionFailed"));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!report) return;
    setActionBusy(true);
    try {
      const updated = await changeServiceReportStatus(report.id, "cancel");
      setReport(updated);
      showToast(t("service.toast.cancelled"));
    } catch (err) {
      applyApiError(err, t("service.toast.actionFailed"));
    } finally {
      setActionBusy(false);
      setConfirmAction(null);
    }
  };

  const handleDelete = async () => {
    if (!report) return;
    setActionBusy(true);
    try {
      await deleteServiceReport(report.id);
      showToast(t("service.toast.deleted"));
      onDeleted();
    } catch (err) {
      applyApiError(err, t("service.toast.actionFailed"));
      setActionBusy(false);
      setConfirmAction(null);
    }
  };

  // นำเข้าเฉพาะข้อมูลรูปภาพจากเซิร์ฟเวอร์ โดยไม่แตะการแก้ไขที่ยังไม่ได้บันทึก
  /**
   * Photo upload/delete responses are applied **photos-only** — never through applyServerReport(),
   * which is what this used to do (fixed 2026-08-07): replacing the whole checklist with the
   * last-saved state silently reverted every unsaved edit, so an item just flipped to Abnormal
   * snapped back to Normal the moment its photo finished uploading. `sections` is left alone for
   * the same reason — the server's templateSnapshot is the last-saved structure, so resyncing it
   * would drop locally-added groups/items. See mergeServerPhotosIntoChecklist().
   */
  const applyServerPhotos = (updated: ServiceReport) => {
    setReport(updated);
    setChecklist((prev) => mergeServerPhotosIntoChecklist(prev, updated.checklist));
  };

  // บันทึกร่างให้อัตโนมัติก่อนอัปโหลดเสมอ แล้วค่อยแนบรูป
  /**
   * Saves the draft first, then uploads — the same save-then-act shape handleSendApproval uses.
   *
   * Why it has to: a checklist item added on screen (or a group added around it) exists only in
   * this component's state until the draft is saved. The upload route resolves its target with
   * `findChecklistItemPath(doc.checklist, …)` against the **saved** document, so attaching a photo
   * to a just-added item used to 404 with "ไม่พบรายการตรวจเช็ค" — an error that looked like
   * breakage and gave no hint that pressing "บันทึกร่าง" would fix it. Saving first means the item
   * is always on the server before the photo needs it.
   *
   * Saving here is safe precisely because it happens BEFORE the upload: the 2026-08-07 rule that a
   * photo *response* must never go through applyServerReport() still holds — that response is
   * applied photos-only, below, so unsaved edits can't be clobbered by the upload itself.
   */
  const handleUploadPhoto = async (sectionKey: string, groupKey: string, itemKey: string, file: File) => {
    if (!report) return;
    setSaving(true);
    try {
      if (isEditable) {
        const saved = await updateServiceReport(report.id, { ...draftBody(), templateSections: sections });
        applyServerReport(saved);
      }
      const updated = await uploadServiceReportPhoto(report.id, { sectionKey, groupKey, itemKey }, file);
      applyServerPhotos(updated);
    } catch (err) {
      applyApiError(err, t("service.toast.photoUploadFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!report) return;
    try {
      const updated = await deleteServiceReportPhoto(report.id, photoId);
      applyServerPhotos(updated);
    } catch (err) {
      applyApiError(err, t("service.toast.photoDeleteFailed"));
    }
  };

  const handlePrint = async () => {
    if (!report) return;
    try {
      await printServiceReport(report.id);
    } catch {
      // Printing still proceeds even if the audit-log call fails — matches Delivery Order's
      // simpler "100% client-side print" convention rather than hard-blocking on a log write.
    }
    window.print();
  };

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ── Per-report checklist structure editing (add/remove items and headings) ──────────────────
  // Only after the report exists (isNew previews the master template read-only, same rule as
  // photos) and only while an editable Draft. Changes are local until Save, like item toggles.
  const structureEditable = !isNew && isEditable;

  const newStructureKey = () =>
    `c-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;

  const addChecklistItem = (sectionKey: string, groupKey: string, label: string) => {
    const key = newStructureKey();
    setSections((prev) => prev.map((s) => (s.key !== sectionKey ? s : {
      ...s,
      groups: s.groups.map((g) => (g.key !== groupKey ? g : {
        ...g, items: [...g.items, { key, label, kind: "normalAbnormal" as const, sortOrder: g.items.length }],
      })),
    })));
    setChecklist((prev) => prev.map((s) => (s.key !== sectionKey ? s : {
      ...s,
      groups: s.groups.map((g) => (g.key !== groupKey ? g : {
        ...g, items: [...g.items, { key, status: "not_selected" as const, abnormalDetail: "", measurementValue: "", photos: [] }],
      })),
    })));
  };

  const addChecklistGroup = (sectionKey: string, title: string) => {
    const key = newStructureKey();
    setSections((prev) => prev.map((s) => (s.key !== sectionKey ? s : {
      ...s, groups: [...s.groups, { key, title, items: [], sortOrder: s.groups.length }],
    })));
    setChecklist((prev) => prev.map((s) => (s.key !== sectionKey ? s : { ...s, groups: [...s.groups, { key, items: [] }] })));
  };

  // เปลี่ยนชื่อรายการ/หัวข้อโดยคง key เดิม ข้อมูลที่บันทึกไว้แล้วจึงไม่หาย
  /**
   * Rename is an edit, not a replace: the key stays, so `checklist` (which is keyed) keeps this
   * item's recorded status/abnormalDetail/photos untouched — no `setChecklist` needed here at all.
   * Delete-and-re-add, the only way to reword an item before this, lost all of that.
   *
   * Edits this report's own frozen `templateSnapshot.sections` only; the master `service_templates`
   * document is never touched, so other reports on the same template are unaffected. Saved via the
   * existing PATCH `templateSections` path and re-validated by `sanitizeServiceTemplateSections()`.
   */
  const renameChecklistItem = (sectionKey: string, groupKey: string, itemKey: string, label: string) => {
    setSections((prev) => prev.map((s) => (s.key !== sectionKey ? s : {
      ...s,
      groups: s.groups.map((g) => (g.key !== groupKey ? g : {
        ...g, items: g.items.map((it) => (it.key === itemKey ? { ...it, label } : it)),
      })),
    })));
  };

  // เปลี่ยนประเภทรายการ (ปกติ/ผิดปกติ ↔ ช่องกรอกค่าที่วัดได้) โดยคง key เดิม ข้อมูลที่บันทึกไว้แล้วไม่หาย
  /**
   * Per-report kind switch — same pattern/scope as `renameChecklistItem` above (edits this
   * report's own frozen `templateSnapshot.sections` only, never the master template). Never
   * touches `checklist`/`value` — status/abnormalDetail/measurementValue/photos already coexist
   * on every item regardless of kind (see `ServiceChecklistItemValue`), so switching back and
   * forth never loses whatever was already recorded under the other kind.
   */
  const changeChecklistItemKind = (sectionKey: string, groupKey: string, itemKey: string, kind: ServiceChecklistItemKind) => {
    setSections((prev) => prev.map((s) => (s.key !== sectionKey ? s : {
      ...s,
      groups: s.groups.map((g) => (g.key !== groupKey ? g : {
        ...g, items: g.items.map((it) => (it.key === itemKey ? { ...it, kind } : it)),
      })),
    })));
  };

  const renameChecklistGroup = (sectionKey: string, groupKey: string, title: string) => {
    setSections((prev) => prev.map((s) => (s.key !== sectionKey ? s : {
      ...s, groups: s.groups.map((g) => (g.key === groupKey ? { ...g, title } : g)),
    })));
  };

  const removeChecklistItem = (sectionKey: string, groupKey: string, itemKey: string) => {
    setSections((prev) => prev.map((s) => (s.key !== sectionKey ? s : {
      ...s, groups: s.groups.map((g) => (g.key !== groupKey ? g : { ...g, items: g.items.filter((it) => it.key !== itemKey) })),
    })));
    setChecklist((prev) => prev.map((s) => (s.key !== sectionKey ? s : {
      ...s, groups: s.groups.map((g) => (g.key !== groupKey ? g : { ...g, items: g.items.filter((it) => it.key !== itemKey) })),
    })));
  };

  const removeChecklistGroup = (sectionKey: string, groupKey: string) => {
    setSections((prev) => prev.map((s) => (s.key !== sectionKey ? s : { ...s, groups: s.groups.filter((g) => g.key !== groupKey) })));
    setChecklist((prev) => prev.map((s) => (s.key !== sectionKey ? s : { ...s, groups: s.groups.filter((g) => g.key !== groupKey) })));
  };

  const itemHasRecordedData = (v: ServiceChecklistItemValue | undefined): boolean =>
    !!v && (v.status !== "not_selected" || v.abnormalDetail.trim() !== "" || v.measurementValue.trim() !== "" || (v.photos ?? []).length > 0);

  // Deletes silently when the target holds no recorded data; asks first when data would be lost.
  const requestRemoveItem = (sectionKey: string, groupKey: string, itemKey: string) => {
    const value = checklist.find((s) => s.key === sectionKey)?.groups.find((g) => g.key === groupKey)?.items.find((it) => it.key === itemKey);
    if (itemHasRecordedData(value)) setRemoveTarget({ type: "item", sectionKey, groupKey, itemKey });
    else removeChecklistItem(sectionKey, groupKey, itemKey);
  };

  const requestRemoveGroup = (sectionKey: string, groupKey: string) => {
    const groupValue = checklist.find((s) => s.key === sectionKey)?.groups.find((g) => g.key === groupKey);
    const groupDef = sections.find((s) => s.key === sectionKey)?.groups.find((g) => g.key === groupKey);
    const hasAnything = (groupDef?.items.length ?? 0) > 0 || (groupValue?.items ?? []).some(itemHasRecordedData);
    if (hasAnything) setRemoveTarget({ type: "group", sectionKey, groupKey });
    else removeChecklistGroup(sectionKey, groupKey);
  };

  const confirmRemove = () => {
    if (!removeTarget) return;
    if (removeTarget.type === "item") removeChecklistItem(removeTarget.sectionKey, removeTarget.groupKey, removeTarget.itemKey);
    else removeChecklistGroup(removeTarget.sectionKey, removeTarget.groupKey);
    setRemoveTarget(null);
  };

  // What the checklist area actually renders: the editable per-report structure for an existing
  // report, or a read-only preview of the selected master template for a not-yet-created one.
  const displaySections = useMemo<ServiceChecklistSectionDef[]>(
    () => (isNew
      ? (selectedTemplateFull && selectedTemplateFull.id === selectedTemplateId ? selectedTemplateFull.sections : [])
      : sections),
    [isNew, selectedTemplateFull, selectedTemplateId, sections],
  );
  const previewChecklist = useMemo(() => {
    if (!isNew) return checklist;
    return displaySections.map((s) => ({
      key: s.key, included: !s.isOptionalAddon,
      groups: s.groups.map((g) => ({ key: g.key, items: g.items.map((it) => ({ key: it.key, status: "not_selected" as const, abnormalDetail: "", measurementValue: "", photos: [] })) })),
    }));
  }, [isNew, displaySections, checklist]);

  if (phase === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center p-6" role="status" aria-live="polite">
        <div className="space-y-3 w-full max-w-3xl">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <p className="text-sm text-muted-foreground">{t("service.loadError")}</p>
        <button type="button" onClick={() => requestLeave(onBack)} className={btn.secondary}>
          <ArrowLeft size={16} /> {t("scopeOfWorkDoc.backToList")}
        </button>
      </div>
    );
  }

  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  // ความคืบหน้ารวม (นับเฉพาะหมวดที่รวมในรายงาน) — การ์ดกรมท่าบนคอลัมน์ขวา + ตัวเลขบนหัวการ์ดรายการตรวจเช็ค
  let answeredCount = 0, applicableCount = 0, normalCount = 0, abnormalCount = 0, measuredCount = 0;
  for (const sectionDef of displaySections) {
    const sectionValue = previewChecklist.find((s) => s.key === sectionDef.key);
    if (sectionDef.isOptionalAddon && !(sectionValue?.included ?? false)) continue;
    const p = sectionProgress(sectionDef, sectionValue);
    answeredCount += p.answered; applicableCount += p.total;
    normalCount += p.normal; abnormalCount += p.abnormal; measuredCount += p.measured;
  }

  const status = report?.status;
  const itemsLabel = (n: number) => t("ui.itemCount").replace("{n}", String(n));
  const photoCountLabel = (n: number) => t("service.confirm.photoCount").replace("{n}", String(n));
  const reportSummaryLine = report ? [report.customerSnapshot.companyName, report.serviceSystemName].filter(Boolean).join(" · ") : "";

  // สรุปในกล่องยืนยันการลบรายการ/หัวข้อ (บอร์ด Dlg-ServiceChecklistRemove*)
  const removeSummary = (() => {
    if (!removeTarget) return null;
    const groupDef = sections.find((s) => s.key === removeTarget.sectionKey)?.groups.find((g) => g.key === removeTarget.groupKey);
    const groupValue = checklist.find((s) => s.key === removeTarget.sectionKey)?.groups.find((g) => g.key === removeTarget.groupKey);
    if (removeTarget.type === "item") {
      const itemDef = groupDef?.items.find((it) => it.key === removeTarget.itemKey);
      const photos = groupValue?.items.find((it) => it.key === removeTarget.itemKey)?.photos?.length ?? 0;
      return {
        secondary: itemDef?.label,
        meta: [groupDef ? t("service.confirm.groupName").replace("{name}", groupDef.title) : "", photos > 0 ? photoCountLabel(photos) : ""].filter(Boolean).join(" · "),
      };
    }
    const values = groupValue?.items ?? [];
    const recorded = values.filter(itemHasRecordedData).length;
    const photos = values.reduce((sum, v) => sum + (v.photos?.length ?? 0), 0);
    return {
      secondary: groupDef?.title,
      meta: [itemsLabel(groupDef?.items.length ?? 0), recorded > 0 ? t("service.confirm.recordedCount").replace("{n}", String(recorded)) : "", photos > 0 ? photoCountLabel(photos) : ""].filter(Boolean).join(" · "),
    };
  })();

  const sectionTitleOf = (key: string | null) => (key ? sections.find((s) => s.key === key)?.title ?? "" : "");
  const groupTitleOf = (target: { sectionKey: string; groupKey: string } | null) =>
    (target ? sections.find((s) => s.key === target.sectionKey)?.groups.find((g) => g.key === target.groupKey)?.title ?? "" : "");

  const creator = report ? users.find((u) => u.id === report.createdBy) : undefined;
  const templateSnapshot = report?.templateSnapshot;

  const statusLine = (() => {
    const approval = report?.customerApproval;
    if (!approval) return null;
    if (approval.status === "pending") {
      return (
        <p className="text-[13px] text-[#8a5a00]">
          {t("service.approval.pending")
            .replace("{via}", approval.sentViaLine ? t("service.approval.viaLine") : "")
            .replace("{date}", formatQuoteDateThai(approval.expiresAt))}
        </p>
      );
    }
    if (approval.status === "approved") {
      return (
        <p className="text-[13px] text-[#1b7f4f]">
          {t("service.approval.approved")
            .replace("{by}", approval.signedName ? t("service.approval.by").replace("{name}", approval.signedName) : "")
            .replace("{date}", formatQuoteDateThai(approval.respondedAt ?? ""))}
        </p>
      );
    }
    if (approval.status === "rejected") {
      return <p className="text-[13px] text-[#b93636]">{t("service.approval.rejected").replace("{reason}", approval.rejectReason || "-")}</p>;
    }
    return null;
  })();

  const headerActions = (
    <div data-tour="servicedoc-actions" className="flex items-center gap-2.5 flex-wrap">
      {!isNew && report && isEditable && (
        <button type="button" onClick={handleSaveDraft} disabled={saving} className={btn.secondary}>
          <Save size={16} /> {saving ? t("service.saving") : t("service.saveDraft")}
        </button>
      )}
      {!isNew && report && canPrint && (
        <button type="button" onClick={handlePrint} className={btn.secondary}>
          <Printer size={16} /> {t("service.print")}
        </button>
      )}
      {!isNew && report && status === "Completed" && canEdit && (
        <button type="button" onClick={handleReopen} disabled={actionBusy} className={btn.secondary}>
          <RotateCcw size={16} /> {t("service.reopen")}
        </button>
      )}
      {/* "ดูคำแนะนำหน้านี้" อยู่ในเมนูเสมอ (ไม่ขึ้นกับสถานะ/สิทธิ์) — เมนูจึงไม่มีวันว่างและทัวร์เล่นซ้ำได้ทุกคน */}
      <MoreMenu
        items={[
          { key: "tour", label: t("tour.replay"), icon: HelpCircle, onSelect: docTour.start },
          !isNew && report && status !== "Cancelled" && canComplete && { key: "cancel", label: t("service.cancelReport"), icon: Ban, danger: true, onSelect: () => setConfirmAction("cancel") },
          !isNew && report && canDelete && isEditable && { key: "delete", label: t("service.confirm.deleteConfirm"), icon: Trash2, danger: true, onSelect: () => setConfirmAction("delete") },
        ]}
      />
      {isNew && (
        <button type="button" onClick={handleCreate} disabled={saving} className={btn.primary}>
          <Save size={16} /> {saving ? t("service.saving") : t("service.createDraft")}
        </button>
      )}
      {!isNew && report && status === "Draft" && canComplete && (
        <button type="button" onClick={handleComplete} disabled={completing} className={btn.primary}>
          <CheckCircle2 size={16} /> {completing ? t("service.saving") : t("service.complete")}
        </button>
      )}
    </div>
  );

  const fieldInput = `${field.input} w-full`;
  const errorOf = (key: string) => fieldErrors[key];

  return (
    <>
    <div className="doc-form flex-1 overflow-y-auto print:hidden">
      <ServiceConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "delete" ? t("service.confirm.deleteTitle") : t("service.confirm.cancelTitle")}
        message={confirmAction === "delete" ? t("service.confirm.deleteMessage") : t("service.confirm.cancelMessageLong")}
        summary={report ? { primary: report.id, secondary: reportSummaryLine } : null}
        confirmLabel={confirmAction === "delete" ? t("service.confirm.deleteConfirm") : t("service.confirm.cancelConfirm")}
        busy={actionBusy}
        onConfirm={confirmAction === "delete" ? handleDelete : handleCancel}
        onCancel={() => setConfirmAction(null)}
      />
      <PromptDialog
        open={addItemTarget !== null}
        title={t("service.checklist.addItemTitle")}
        message={t("service.checklist.addItemMessage").replace("{group}", groupTitleOf(addItemTarget))}
        label={t("service.checklist.addItemLabel")}
        confirmLabel={t("service.checklist.addConfirm")}
        requiredMessage={t("service.checklist.addItemRequired")}
        onConfirm={(label) => {
          if (addItemTarget) addChecklistItem(addItemTarget.sectionKey, addItemTarget.groupKey, label);
          setAddItemTarget(null);
        }}
        onCancel={() => setAddItemTarget(null)}
      />
      <PromptDialog
        open={addGroupTarget !== null}
        title={t("service.checklist.addGroupTitle")}
        message={t("service.checklist.addGroupMessage").replace("{section}", sectionTitleOf(addGroupTarget))}
        label={t("service.checklist.addGroupLabel")}
        confirmLabel={t("service.checklist.addConfirm")}
        requiredMessage={t("service.checklist.addGroupRequired")}
        onConfirm={(title) => {
          if (addGroupTarget) addChecklistGroup(addGroupTarget, title);
          setAddGroupTarget(null);
        }}
        onCancel={() => setAddGroupTarget(null)}
      />
      <ServiceConfirmDialog
        open={removeTarget !== null}
        title={removeTarget?.type === "group" ? t("service.checklist.removeGroupTitle") : t("service.checklist.removeItemTitle")}
        message={removeTarget?.type === "group" ? t("service.checklist.removeGroupMessage") : t("service.checklist.removeItemMessage")}
        summary={removeSummary}
        confirmLabel={t("service.checklist.removeConfirm")}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      <div className="sticky top-0 z-20">
        <DocumentHeader
          backLabel={t("service.backToList")}
          onBack={() => requestLeave(onBack)}
          number={isNew ? <span className="font-sans font-semibold">{t("service.newReport")}</span> : report?.id}
          status={!isNew && report ? <ServiceStatusBadge status={report.status} /> : undefined}
          meta={isEditable ? (
            isNew
              ? <AutoSaveIndicator state="idle" lastSavedAt={null} localOnly />
              : <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />
          ) : undefined}
          actions={headerActions}
        />
      </div>

      <div className="px-4 md:px-8 pt-6 pb-10 flex flex-col gap-5">
        {draftBackup.recovered && draftBackup.recoveredAt !== null && (
          <DraftRecoveryBanner
            savedAt={draftBackup.recoveredAt}
            onRestore={() => {
              const recovered = draftBackup.recovered!;
              setForm(recovered.form);
              setChecklist(recovered.checklist);
              if (isNew) setSelectedTemplateId(recovered.selectedTemplateId);
              draftBackup.clear();
              showToast(t("common.draftRecovery.restoredToast"));
            }}
            onDiscard={draftBackup.dismiss}
          />
        )}

        {status !== "Cancelled" && (
          <DocumentStepper
            ariaLabel={t("service.stepperAria")}
            current={status === "Completed" ? 2 : 0}
            steps={[
              { label: t("service.status.draft"), hint: t("service.step.draftHint") },
              { label: t("service.status.completed") },
            ]}
          />
        )}

        {isNew && (
          <SectionCard title={t("service.form.template")} subtitle={t("service.new.templateHelp")} bodyClassName="">
            <TemplatePicker templates={templates} value={selectedTemplateId} onChange={setSelectedTemplateId} />
          </SectionCard>
        )}

        <DocumentColumns
          main={(
            <>
              <SectionCard title={t("service.section.customer")}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-[18px]">
                  <Field label={t("service.form.customer")} required className="md:col-span-3" error={form.customerId ? errorOf("customerSnapshot.companyName") : undefined}>
                    <ServiceCustomerSearch
                      customers={customers}
                      selectedId={form.customerId}
                      selectedName={form.customerSnapshot.companyName}
                      disabled={!isEditable}
                      onSelect={(c: Customer) => setForm((f) => ({
                        ...f, customerId: c.id,
                        customerSnapshot: { companyName: c.companyName, contactName: c.contactName, address: c.address, taxId: c.taxId, phone: c.phone, email: c.email, projectName: c.projectName },
                      }))}
                      onClear={() => setForm((f) => ({ ...f, customerId: "", customerSnapshot: emptyCustomerSnapshot }))}
                    />
                  </Field>
                  {form.customerId ? (
                    <>
                      <ReadonlyField label={t("service.form.contactName")} value={form.customerSnapshot.contactName} />
                      <ReadonlyField label={t("service.form.phone")} value={form.customerSnapshot.phone} />
                      <ReadonlyField label={t("service.form.taxId")} value={form.customerSnapshot.taxId} mono />
                      <ReadonlyField label={t("service.form.address")} value={form.customerSnapshot.address} className="md:col-span-3" />
                    </>
                  ) : (
                    <>
                      <Field label={t("service.form.companyName")} required className="md:col-span-3" error={errorOf("customerSnapshot.companyName")}>
                        <input value={form.customerSnapshot.companyName} disabled={!isEditable}
                          onChange={(e) => setForm((f) => ({ ...f, customerSnapshot: { ...f.customerSnapshot, companyName: e.target.value } }))} className={fieldInput} />
                      </Field>
                      <Field label={t("service.form.contactName")} required error={errorOf("customerSnapshot.contactName")}>
                        <input value={form.customerSnapshot.contactName} disabled={!isEditable}
                          onChange={(e) => setForm((f) => ({ ...f, customerSnapshot: { ...f.customerSnapshot, contactName: e.target.value } }))} className={fieldInput} />
                      </Field>
                      <Field label={t("service.form.phone")} required error={errorOf("customerSnapshot.phone")}>
                        <input value={form.customerSnapshot.phone} disabled={!isEditable}
                          onChange={(e) => setForm((f) => ({ ...f, customerSnapshot: { ...f.customerSnapshot, phone: e.target.value } }))} className={fieldInput} />
                      </Field>
                      <Field label={t("service.form.address")}>
                        <input value={form.customerSnapshot.address} disabled={!isEditable}
                          onChange={(e) => setForm((f) => ({ ...f, customerSnapshot: { ...f.customerSnapshot, address: e.target.value } }))} className={fieldInput} />
                      </Field>
                    </>
                  )}
                </div>
              </SectionCard>

              <SectionCard title={t("service.section.visit")}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-[18px]">
                  <Field label={t("service.form.serviceLocation")} required className="md:col-span-2" error={errorOf("serviceLocation")}>
                    <input value={form.serviceLocation} disabled={!isEditable} onChange={(e) => setField("serviceLocation", e.target.value)} className={fieldInput} />
                  </Field>
                  <Field label={t("service.form.projectOrJobCode")}>
                    <input value={form.projectOrJobCode} disabled={!isEditable} onChange={(e) => setField("projectOrJobCode", e.target.value)} className={`${fieldInput} font-mono`} />
                  </Field>
                  <Field label={t("service.form.serviceSystemName")} required className="md:col-span-2" error={errorOf("serviceSystemName")}>
                    <input value={form.serviceSystemName} disabled={!isEditable} onChange={(e) => setField("serviceSystemName", e.target.value)} className={fieldInput} />
                  </Field>
                  <Field label={t("service.form.serviceType")}>
                    <input value={form.serviceType} disabled={!isEditable} onChange={(e) => setField("serviceType", e.target.value)} className={fieldInput} />
                  </Field>
                  <Field label={t("service.form.inspectionDate")} required error={errorOf("inspectionDate")}>
                    <input type="date" value={form.inspectionDate} disabled={!isEditable} onChange={(e) => setField("inspectionDate", e.target.value)} className={fieldInput} />
                  </Field>
                  <Field label={t("service.form.reportDate")} required error={errorOf("reportDate")}>
                    <input type="date" value={form.reportDate} disabled={!isEditable} onChange={(e) => setField("reportDate", e.target.value)} className={fieldInput} />
                  </Field>
                  <Field label={t("service.form.nextPmDate")}>
                    <input type="date" value={form.nextPmDate} disabled={!isEditable} onChange={(e) => setField("nextPmDate", e.target.value)} className={fieldInput} />
                  </Field>
                  <Field label={t("service.form.onSiteContactName")}>
                    <input value={form.onSiteContactName} disabled={!isEditable} onChange={(e) => setField("onSiteContactName", e.target.value)} className={fieldInput} />
                  </Field>
                  <Field label={t("service.form.onSiteContactPhone")}>
                    <input value={form.onSiteContactPhone} disabled={!isEditable} onChange={(e) => setField("onSiteContactPhone", e.target.value)} className={fieldInput} />
                  </Field>
                </div>
              </SectionCard>
            </>
          )}
          rail={(
            <>
              {!isNew && applicableCount > 0 && (
                <ChecklistProgressCard
                  answered={answeredCount}
                  applicable={applicableCount}
                  rows={[
                    { label: t("service.checklist.normal"), value: itemsLabel(normalCount) },
                    { label: t("service.checklist.abnormal"), value: itemsLabel(abnormalCount) },
                    { label: t("service.rail.measured"), value: itemsLabel(measuredCount) },
                    { label: t("service.rail.left"), value: itemsLabel(applicableCount - answeredCount) },
                  ]}
                />
              )}
              <RailCard title={t("service.rail.inspectors")}>
                <Field label={t("service.form.assignedEngineer")} required help={t("service.rail.engineerHelp")} error={errorOf("assignedServiceEngineerId")}>
                  <select value={form.assignedServiceEngineerId} disabled={!isEditable} onChange={(e) => setField("assignedServiceEngineerId", e.target.value)} className={fieldInput}>
                    <option value="">{t("service.form.selectEngineer")}</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  </select>
                </Field>
                <Field label={t("service.form.additionalInspectors")} help={isEditable ? t("service.rail.additionalHelp") : undefined}>
                  <input value={form.additionalInspectorNamesText} disabled={!isEditable} onChange={(e) => setField("additionalInspectorNamesText", e.target.value)} placeholder={t("service.form.additionalInspectorsPlaceholder")} className={fieldInput} />
                </Field>
              </RailCard>
              {!isNew && report && templateSnapshot && (
                <RailCard title={t("service.rail.other")}>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-muted-foreground">{t("service.form.template")}</span>
                    <span className="text-sm font-medium text-foreground break-words">{templateSnapshot.templateName || t("service.form.noTemplate")}</span>
                    {templateSnapshot.templateCode && (
                      <span className="text-xs text-muted-foreground font-mono">{templateSnapshot.templateCode}{templateSnapshot.version ? ` · v${templateSnapshot.version}` : ""}</span>
                    )}
                  </div>
                  <ReadonlyField
                    label={t("service.rail.createdBy")}
                    value={[creator?.fullName, formatQuoteDateThai(report.createdAt)].filter(Boolean).join(" · ")}
                  />
                </RailCard>
              )}
              {isNew && <NextStepHint title={t("service.nextStep.title")}>{t("service.nextStep.new")}</NextStepHint>}
              {!isNew && status === "Draft" && canComplete && <NextStepHint title={t("service.nextStep.title")}>{t("service.nextStep.draft")}</NextStepHint>}
            </>
          )}
        />

        {displaySections.length > 0 && (
          <section data-tour="servicedoc-checklist" className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#eef1f6] flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-semibold text-foreground">{t("service.checklist.title")}</h2>
              {!isNew && applicableCount > 0 && (
                <span className={`text-[13px] tabular-nums ${answeredCount === applicableCount ? "text-[#1b7f4f] font-medium" : "text-muted-foreground"}`}>
                  {answeredCount} / {itemsLabel(applicableCount)}
                </span>
              )}
              <span className="flex-1" />
              {/* Renaming has no icon of its own by design (the row already carries ✕, and a second
                  control per row would crowd it), so the gesture is stated once here — otherwise it's
                  undiscoverable. Text, not a button: it competes with nothing. */}
              {structureEditable && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <Info size={14} className="flex-shrink-0" />
                  {t("service.checklist.renameHint")}
                </span>
              )}
            </div>
            {isNew && (
              <p className="px-6 py-3 text-[13px] text-muted-foreground border-b border-[#eef1f6]">{t("service.checklist.previewNote")}</p>
            )}
            {displaySections.map((sectionDef) => {
              const sectionValue = previewChecklist.find((s) => s.key === sectionDef.key);
              const collapsed = collapsedSections.has(sectionDef.key);
              const included = !sectionDef.isOptionalAddon || !!sectionValue?.included;
              const showBody = !collapsed && included;
              const progress = sectionProgress(sectionDef, sectionValue);
              const countLabel = included
                ? `${progress.answered} / ${itemsLabel(progress.total)}`
                : t("service.checklist.notIncludedCount").replace("{n}", String(progress.total));
              return (
                <div key={sectionDef.key} className="border-b border-border last:border-b-0">
                  <div className="min-h-14 px-6 flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleSection(sectionDef.key)}
                      aria-expanded={showBody}
                      className="flex-1 min-w-0 min-h-14 flex items-center gap-2.5 text-left flex-wrap"
                    >
                      <ChevronDown size={18} className={`text-muted-foreground flex-shrink-0 transition-transform ${showBody ? "" : "-rotate-90"}`} />
                      <span className="text-[15px] font-semibold text-foreground">{sectionDef.title}</span>
                      {sectionDef.isOptionalAddon && (
                        <span className="h-[22px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-medium inline-flex items-center">{t("service.checklist.optionalAddon")}</span>
                      )}
                      <span className="text-[13px] text-muted-foreground tabular-nums">{countLabel}</span>
                    </button>
                    {sectionDef.isOptionalAddon && !isNew && (
                      <label className="flex items-center gap-2.5 text-[13px] text-[#3d5173] cursor-pointer">
                        {t("service.checklist.included")}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!!sectionValue?.included}
                          aria-label={`${t("service.checklist.included")} ${sectionDef.title}`}
                          disabled={!isEditable}
                          onClick={() => {
                            const next = !sectionValue?.included;
                            setChecklist((prev) => prev.map((s) => (s.key === sectionDef.key ? { ...s, included: next } : s)));
                            // เปิดรวม = กางหมวดให้กรอกต่อทันที (บอร์ด) · ปิดรวม = พับ
                            setCollapsedSections((prev) => {
                              const set = new Set(prev);
                              if (next) set.delete(sectionDef.key); else set.add(sectionDef.key);
                              return set;
                            });
                          }}
                          className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 disabled:cursor-default ${sectionValue?.included ? "bg-[#0b1d3a]" : "bg-[#c3ccda]"}`}
                        >
                          <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-all ${sectionValue?.included ? "left-[21px]" : "left-[3px]"}`} />
                        </button>
                      </label>
                    )}
                  </div>
                  {showBody && (
                    <div>
                      <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_240px_80px] gap-3 items-center h-10 px-6 bg-[#f8f9fc] border-y border-[#eef1f6] text-[12.5px] font-semibold text-[#3d5173]">
                        <span>{t("service.checklist.col.item")}</span>
                        <span>{t("service.checklist.col.result")}</span>
                        <span />
                      </div>
                      {sectionDef.groups.map((groupDef) => {
                        const groupValue = sectionValue?.groups.find((g) => g.key === groupDef.key);
                        return (
                          <div key={groupDef.key}>
                            <div className="min-h-11 px-6 flex items-center gap-2.5 bg-[#fbfcfd] border-b border-[#eef1f6]">
                              <span className="flex-1 min-w-0">
                                {structureEditable ? (
                                  <InlineEditableLabel
                                    value={groupDef.title}
                                    onCommit={(title) => renameChecklistGroup(sectionDef.key, groupDef.key, title)}
                                    maxLength={MAX_CHECKLIST_GROUP_TITLE_LENGTH}
                                    editHint={t("service.checklist.renameGroup")}
                                    className="text-[13px] font-semibold text-[#3d5173]"
                                    inputClassName="text-[13px] font-semibold w-full max-w-sm"
                                  />
                                ) : (
                                  <span className="text-[13px] font-semibold text-[#3d5173]">{groupDef.title}</span>
                                )}
                              </span>
                              {structureEditable && (
                                <button
                                  type="button"
                                  title={t("service.checklist.removeGroup")}
                                  aria-label={`${t("service.checklist.removeGroup")} ${groupDef.title}`}
                                  onClick={() => requestRemoveGroup(sectionDef.key, groupDef.key)}
                                  className="w-8 h-8 rounded-lg text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] flex items-center justify-center transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                            {groupDef.items.map((itemDef) => {
                              const itemValue = groupValue?.items.find((it) => it.key === itemDef.key) ?? { key: itemDef.key, status: "not_selected" as const, abnormalDetail: "", measurementValue: "", photos: [] };
                              return (
                                <ServiceChecklistItemControl
                                  key={itemDef.key}
                                  itemDef={itemDef}
                                  value={itemValue}
                                  disabled={!isEditable || isNew}
                                  error={checklistErrors[`${sectionDef.key}.${groupDef.key}.${itemDef.key}`]}
                                  photoUploadDisabledReason={isNew ? t("service.checklist.photosAfterCreate") : undefined}
                                  onChange={(next) => setChecklist((prev) => prev.map((s) => (s.key !== sectionDef.key ? s : {
                                    ...s,
                                    groups: s.groups.map((g) => (g.key !== groupDef.key ? g : { ...g, items: g.items.map((it) => (it.key === itemDef.key ? next : it)) })),
                                  })))}
                                  onUploadPhoto={isNew ? undefined : (file) => handleUploadPhoto(sectionDef.key, groupDef.key, itemDef.key, file)}
                                  onDeletePhoto={isNew ? undefined : (photoId) => handleDeletePhoto(photoId)}
                                  onRemove={structureEditable ? () => requestRemoveItem(sectionDef.key, groupDef.key, itemDef.key) : undefined}
                                  onRename={structureEditable ? (label) => renameChecklistItem(sectionDef.key, groupDef.key, itemDef.key, label) : undefined}
                                  onChangeKind={structureEditable ? (kind) => changeChecklistItemKind(sectionDef.key, groupDef.key, itemDef.key, kind) : undefined}
                                />
                              );
                            })}
                            {structureEditable && (
                              <div className="pl-[30px] pr-6 py-1.5 border-b border-[#eef1f6]">
                                <button
                                  type="button"
                                  onClick={() => setAddItemTarget({ sectionKey: sectionDef.key, groupKey: groupDef.key })}
                                  className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] transition-colors"
                                >
                                  <Plus size={15} /> {t("service.checklist.addItem")}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {structureEditable && (
                        <div className="pl-3.5 pr-6 pt-2.5 pb-3">
                          <button
                            type="button"
                            onClick={() => setAddGroupTarget(sectionDef.key)}
                            className="h-9 px-2.5 rounded-lg inline-flex items-center gap-2 text-sm font-medium text-[#1a5fb4] hover:bg-[#e8f0fb] transition-colors"
                          >
                            <Plus size={16} /> {t("service.checklist.addGroup")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        <SectionCard title={t("service.section.summary")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-[18px]">
            <Field label={t("service.form.overallCustomerSummary")} help={isEditable ? t("service.form.overallCustomerSummaryHelp") : undefined}>
              <textarea value={form.overallCustomerSummary} disabled={!isEditable} onChange={(e) => setField("overallCustomerSummary", e.target.value)} rows={4} className={`${field.textarea} w-full resize-y`} />
            </Field>
            <Field label={t("service.form.overallRemark")}>
              <textarea value={form.overallRemark} disabled={!isEditable} onChange={(e) => setField("overallRemark", e.target.value)} rows={4} className={`${field.textarea} w-full resize-y`} />
            </Field>
          </div>
        </SectionCard>

        {!isNew && report && (
          <section data-tour="servicedoc-signature" className="bg-card border border-border rounded-xl print:hidden">
            <div className="px-6 py-4 border-b border-[#eef1f6] flex items-center gap-2.5 flex-wrap">
              <h2 className="flex-1 text-base font-semibold text-foreground">{t("service.signature.sectionTitle")}</h2>
              <span className="text-xs text-muted-foreground">{t("service.signature.optionalNote")}</span>
            </div>
            <div className="px-6 pt-5 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <span className={field.label}>{t("service.signature.engineer")}</span>
                {/* Read-only by design: the engineer's signature is their saved profile image, so it
                    can't be drawn on someone else's behalf here. */}
                <div className="h-[140px] border border-border rounded-lg bg-white flex items-center justify-center overflow-hidden">
                  {engineerUser?.signatureDataUrl ? (
                    <img src={engineerUser.signatureDataUrl} alt={engineerUser.fullName} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <p className="text-[13px] text-muted-foreground px-3 text-center">
                      {engineerUser ? t("service.signature.noProfileSignature") : t("service.signature.noEngineerAssigned")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground truncate">{engineerUser?.fullName || t("common.dash")}</span>
                  <span className={field.help}>
                    {engineerUser && !engineerUser.signatureDataUrl
                      ? t("service.signature.goToSettings")
                      : t("service.signature.engineerFromProfile")}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className={field.label}>{t("service.signature.customer")}</span>
                <SignaturePad
                  dataUrl={form.customerSignatureDataUrl}
                  signerName={form.customerSignedName}
                  signedAt={form.customerSignedAt}
                  disabled={!isEditable}
                  allowUpload={false}
                  onConfirm={({ dataUrl, name }) => setForm((f) => ({
                    ...f,
                    customerSignatureDataUrl: dataUrl,
                    customerSignedName: name,
                    customerSignedAt: new Date().toISOString(),
                  }))}
                  onClear={() => setForm((f) => ({
                    ...f, customerSignatureDataUrl: "", customerSignedName: "", customerSignedAt: null,
                  }))}
                />
                {isEditable && form.customerSignatureDataUrl && (
                  <p className={field.help}>{t("service.signature.saveHint")}</p>
                )}
              </div>
            </div>

            {/* การอนุมัติจากลูกค้าทางไกล (2026-08-10) — แทนที่ปุ่ม placeholder เดิมของเฟส LINE:
                ส่งลิงก์อนุมัติอายุ 7 วัน (เข้า LINE ลูกค้าอัตโนมัติถ้าผูกบัญชีแล้ว) ลูกค้าเปิดดู
                รายงาน เซ็นชื่อ และกดอนุมัติ/ไม่อนุมัติจากมือถือได้เอง */}
            <div className="px-6 py-4 border-t border-[#eef1f6] flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[240px] flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{t("service.approval.remoteTitle")}</span>
                <span className="text-[13px] text-muted-foreground">{t("service.approval.remoteDesc")}</span>
                {statusLine}
              </div>
              {report.customerApproval?.status !== "approved" && (
                <button type="button" onClick={handleSendApproval} disabled={sendingApproval || saving} className={btn.secondarySm}>
                  <Send size={15} />
                  {sendingApproval ? t("service.approval.sending") : report.customerApproval ? t("service.approval.resend") : t("service.approval.send")}
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
    {/* ผลการส่งให้ลูกค้าอนุมัติ: ลิงก์สำหรับคัดลอก + สถานะ LINE + รหัสจับคู่ (2026-08-10) */}
    {approvalResult && (
      <ApprovalLinkDialog
        url={approvalResult.url}
        sentViaLine={approvalResult.sentViaLine}
        lineError={approvalResult.lineError}
        expiresAt={report?.customerApproval?.expiresAt ?? ""}
        copied={approvalLinkCopied}
        onCopy={() => { void copyApprovalLink(approvalResult.url); }}
        canPair={!approvalResult.sentViaLine && !!(report?.customerId || form.customerId)}
        pairing={pairing}
        pairingBusy={pairingBusy}
        onCreatePairing={handleCreatePairing}
        onClose={() => setApprovalResult(null)}
      />
    )}
    {!isNew && report && (
      <ServiceReportPrintDocument
        serviceReport={report}
        companyHeader={companyHeader}
        engineerUser={users.find((u) => u.id === report.assignedServiceEngineerId)}
      />
    )}
    </>
  );
}

// การ์ดกรมท่าบนคอลัมน์ขวา: ตรวจเช็คแล้ว N / M รายการ + แถบความคืบหน้า + แยกตามผล (บอร์ด ServiceReportEditor)
function ChecklistProgressCard({ answered, applicable, rows }: {
  answered: number;
  applicable: number;
  rows: { label: string; value: string }[];
}) {
  const { t } = useI18n();
  const pct = applicable ? Math.round((answered * 100) / applicable) : 0;
  return (
    <section className="rounded-xl bg-[#0b1d3a] text-white p-5 flex flex-col gap-3">
      <span className="text-[13px] text-[#c5d3e8]">{t("service.rail.checked")}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-[26px] leading-tight font-semibold tabular-nums">{answered} / {applicable}</span>
        <span className="text-sm text-[#c5d3e8]">{t("service.checklist.completedCount")}</span>
      </div>
      <div
        role="progressbar"
        aria-label={t("service.rail.progressAria")}
        aria-valuemin={0}
        aria-valuemax={applicable}
        aria-valuenow={answered}
        className="h-1.5 rounded-full bg-white/15 overflow-hidden"
      >
        <div className="h-1.5 rounded-full bg-white transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="h-px bg-white/10" />
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-[#c5d3e8]">{r.label}</span>
          <span className="tabular-nums text-white">{r.value}</span>
        </div>
      ))}
    </section>
  );
}

// ตารางเลือก Template ของรายงานใหม่ (แบบบอร์ด ServiceReportNew) — ปุ่มวิทยุทั้งแถว · ↑/↓ เลื่อนตัวเลือก
// เก็บเป็นการ์ดบนหน้าสร้างรายงาน ไม่ใช่กล่องโต้ตอบ: เซิร์ฟเวอร์บังคับชื่อลูกค้า/ผู้ติดต่อ/เบอร์โทรตั้งแต่สร้าง
// (sanitizeCustomerSnapshotManual) จึงยังสร้างรายงานร่างจาก Template อย่างเดียวไม่ได้
function TemplatePicker({ templates, value, onChange }: {
  templates: ServiceTemplateSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useI18n();
  const labelId = useId();
  const options = [
    ...templates.map((tp) => ({ id: tp.id, name: tp.templateName, sub: tp.version ? `v${tp.version}` : "", code: tp.templateCode, sections: String(tp.sectionCount), items: String(tp.itemCount) })),
    { id: NO_TEMPLATE_VALUE, name: t("service.form.noTemplate"), sub: t("service.new.noTemplateSub"), code: t("common.dash"), sections: t("common.dash"), items: t("common.dash") },
  ];
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = options[(i + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length];
    onChange(next.id);
    const el = e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-option="${CSS.escape(next.id)}"]`);
    el?.focus();
  };
  const grid = "grid grid-cols-[20px_minmax(0,1fr)_56px_64px] md:grid-cols-[20px_minmax(0,1fr)_210px_56px_64px] gap-3.5 items-center";
  const focusIndex = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div>
      <div className={`${grid} h-10 px-6 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]`}>
        <span />
        <span id={labelId}>{t("service.form.template")}</span>
        <span className="hidden md:block">{t("serviceTemplates.col.code")}</span>
        <span className="text-right">{t("serviceTemplates.col.sections")}</span>
        <span className="text-right">{t("serviceTemplates.col.items")}</span>
      </div>
      <div role="radiogroup" aria-labelledby={labelId}>
        {options.map((o, i) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-option={o.id}
              tabIndex={i === focusIndex ? 0 : -1}
              onClick={() => onChange(o.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`${grid} w-full min-h-16 px-6 py-3 text-left border-b border-[#eef1f6] last:border-b-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 ${on ? "bg-[#eef4fc]" : "bg-white hover:bg-[#f8f9fc]"}`}
            >
              <span className={`w-[18px] h-[18px] rounded-full border-[1.5px] bg-white flex items-center justify-center ${on ? "border-[#0b1d3a]" : "border-[#a3aec2]"}`}>
                {on && <span className="w-2 h-2 rounded-full bg-[#0b1d3a]" />}
              </span>
              <span className="flex flex-col min-w-0 leading-snug">
                <span className="text-sm font-medium text-foreground">{o.name}</span>
                {o.sub && <span className="text-xs text-muted-foreground truncate">{o.sub}</span>}
              </span>
              <span className="hidden md:block font-mono text-[12.5px] text-[#3d5173] truncate">{o.code}</span>
              <span className="text-right text-sm text-[#3d5173] tabular-nums">{o.sections}</span>
              <span className="text-right text-sm text-[#3d5173] tabular-nums">{o.items}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// กล่อง "สร้างลิงก์อนุมัติแล้ว" (บอร์ด Dlg-ServiceApprovalLink) — ลิงก์อายุ 7 วัน · ปุ่มคัดลอกเป็นปุ่มหลัก
// · ลูกค้ายังไม่ผูก LINE → ออกรหัสจับคู่ได้จากกล่องนี้
function ApprovalLinkDialog({ url, sentViaLine, lineError, expiresAt, copied, onCopy, canPair, pairing, pairingBusy, onCreatePairing, onClose }: {
  url: string;
  sentViaLine: boolean;
  lineError?: string;
  expiresAt: string;
  copied: boolean;
  onCopy: () => void;
  canPair: boolean;
  pairing: { code: string; expiresAt: string } | null;
  pairingBusy: boolean;
  onCreatePairing: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onClose);
  const titleId = useId();
  const descId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[480px] flex flex-col">
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className="w-11 h-11 rounded-full bg-[#e6f4ec] text-[#1b7f4f] flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={20} />
          </span>
          <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{t("service.approval.dialogTitle")}</h2>
            <p id={descId} className="text-sm text-[#3d5173]">
              {sentViaLine ? t("service.approval.sentViaLineDesc") : t("service.approval.notLinkedDesc")}
            </p>
            {lineError && <p className="text-[13px] text-[#8a5a00]">{lineError}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pt-5 pb-6 flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {expiresAt ? t("service.approval.linkExpires").replace("{date}", formatQuoteDateThai(expiresAt)) : t("service.approval.linkLabel")}
            </span>
            <p aria-label={t("service.approval.linkLabel")} className="font-mono text-[13px] font-medium text-foreground break-all select-all">{url}</p>
          </div>

          {canPair && (
            <div className="p-3.5 bg-[#f8f9fc] border border-border rounded-lg flex flex-col gap-2.5">
              <span className="text-[13px] text-[#3d5173]">{t("service.approval.pairingHint")}</span>
              {pairing ? (
                <span className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-[13px] text-[#3d5173]">{t("service.approval.pairingCode")}</span>
                  <span className="h-8 px-3 border border-[#c3ccda] rounded-lg bg-white font-mono text-[15px] font-medium tracking-[0.08em] inline-flex items-center">{pairing.code}</span>
                  <span className="text-xs text-muted-foreground">{t("service.approval.pairingValid").replace("{date}", formatQuoteDateThai(pairing.expiresAt))}</span>
                </span>
              ) : (
                <button type="button" onClick={onCreatePairing} disabled={pairingBusy} className={`${btn.text} self-start`}>
                  <Link2 size={16} /> {pairingBusy ? t("service.approval.issuing") : t("service.approval.issuePairing")}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
          <button type="button" onClick={onClose} className={btn.secondary}>{t("common.close")}</button>
          <button type="button" onClick={onCopy} className={btn.primary}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? t("service.approval.copied") : t("service.approval.copy")}
          </button>
        </div>
      </div>
    </div>
  );
}
