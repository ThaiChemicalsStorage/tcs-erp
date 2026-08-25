import { useEffect, useMemo, useState } from "react";
import type { DriveStep } from "driver.js";
import { ArrowLeft, Save, CheckCircle2, RotateCcw, Ban, Trash2, ChevronDown, ChevronRight, Wrench, Printer, Plus, Send } from "lucide-react";
import {
  type ServiceReport, type ServiceReportDraft, type ServiceChecklistSectionValue, type ServiceChecklistItemValue,
  type ServiceReportStatus,
  fetchServiceReport, createServiceReport, updateServiceReport, changeServiceReportStatus, deleteServiceReport,
  uploadServiceReportPhoto, deleteServiceReportPhoto, printServiceReport, mergeServerPhotosIntoChecklist,
  sendServiceReportCustomerApproval,
} from "../../lib/serviceReports";
import { type ServiceTemplateSummary, type ServiceTemplate, type ServiceChecklistSectionDef, type ServiceChecklistItemKind, fetchServiceTemplates, fetchServiceTemplate } from "../../lib/serviceTemplates";
import { type Customer, fetchCustomers, createLinePairingCode } from "../../lib/customers";
import { type User, fetchUsers } from "../../lib/users";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { CustomerSelector } from "../quotation/CustomerSelector";
import { ServiceChecklistItemControl } from "../../components/ServiceChecklistItemControl";
import { SignaturePad } from "../../components/SignaturePad";
import { InlineEditableLabel } from "../../components/InlineEditableLabel";
import { useModuleTour } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { MAX_CHECKLIST_GROUP_TITLE_LENGTH } from "../../lib/validation/serviceReportValidation";
import { ServiceReportPrintDocument } from "./ServiceReportPrintDocument";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
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

const statusStyle: Record<ServiceReportStatus, string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  Completed: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
  Cancelled: "bg-[#e05252]/10 text-[#c23f3f] border border-[#e05252]/20",
};

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

  const selectedCustomer = customers.find((c) => c.id === form.customerId);
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
        else showToast("คัดลอกไม่สำเร็จ กรุณาคัดลอกลิงก์ด้วยตนเอง");
      } catch {
        showToast("คัดลอกไม่สำเร็จ กรุณาคัดลอกลิงก์ด้วยตนเอง");
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
      applyApiError(err, "ส่งให้ลูกค้าอนุมัติไม่สำเร็จ");
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
      applyApiError(err, "ออกรหัสจับคู่ LINE ไม่สำเร็จ");
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
        <button onClick={() => requestLeave(onBack)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">
          <ArrowLeft size={13} /> {t("scopeOfWorkDoc.backToList")}
        </button>
      </div>
    );
  }

  const inputClass = "h-9 w-full px-3 text-sm bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60";
  const labelClass = "text-xs font-medium text-muted-foreground mb-1 block";
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  let answeredCount = 0;
  let applicableCount = 0;
  for (const sectionDef of displaySections) {
    const sectionValue = previewChecklist.find((s) => s.key === sectionDef.key);
    if (sectionDef.isOptionalAddon && !(sectionValue?.included ?? false)) continue;
    for (const groupDef of sectionDef.groups) {
      const groupValue = sectionValue?.groups.find((g) => g.key === groupDef.key);
      for (const itemDef of groupDef.items) {
        applicableCount += 1;
        const itemValue = groupValue?.items.find((it) => it.key === itemDef.key);
        if (itemDef.kind === "measurement") { if (itemValue?.measurementValue.trim()) answeredCount += 1; }
        else if (itemValue?.status && itemValue.status !== "not_selected") answeredCount += 1;
      }
    }
  }

  return (
    <>
    <div className="flex-1 overflow-y-auto p-6 space-y-5 print:hidden">
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction === "delete" ? t("service.confirm.deleteTitle") : t("service.confirm.cancelTitle")}
        message={confirmAction === "delete" ? t("service.confirm.deleteMessage") : t("service.confirm.cancelMessage")}
        confirmLabel={confirmAction === "delete" ? t("service.confirm.deleteConfirm") : t("service.confirm.cancelConfirm")}
        danger
        busy={actionBusy}
        onConfirm={confirmAction === "delete" ? handleDelete : handleCancel}
        onCancel={() => setConfirmAction(null)}
      />
      <PromptDialog
        open={addItemTarget !== null}
        title={t("service.checklist.addItemTitle")}
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
        label={t("service.checklist.addGroupLabel")}
        confirmLabel={t("service.checklist.addConfirm")}
        requiredMessage={t("service.checklist.addGroupRequired")}
        onConfirm={(title) => {
          if (addGroupTarget) addChecklistGroup(addGroupTarget, title);
          setAddGroupTarget(null);
        }}
        onCancel={() => setAddGroupTarget(null)}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        title={removeTarget?.type === "group" ? t("service.checklist.removeGroupTitle") : t("service.checklist.removeItemTitle")}
        message={removeTarget?.type === "group" ? t("service.checklist.removeGroupMessage") : t("service.checklist.removeItemMessage")}
        confirmLabel={t("service.checklist.removeConfirm")}
        danger
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => requestLeave(onBack)} className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all">
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-foreground leading-tight flex items-center gap-2" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
              {isNew ? t("service.newReport") : report?.id}
              {!isNew && report && (
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[report.status]}`}>
                  {t(`service.status.${report.status.toLowerCase()}` as "service.status.draft")}
                </span>
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{t("service.pageSubtitle")}</p>
          </div>
        </div>
        <div data-tour="servicedoc-actions" className="flex items-center gap-2 flex-wrap print:hidden">
          {/* Unconditional, and first in the toolbar — every other button here is gated by status
              or permission, so anchoring the tour to one of those could leave a user with no way
              to replay it. */}
          <TourReplayButton onClick={docTour.start} />
          {isEditable && (
            isNew
              ? <AutoSaveIndicator state="idle" lastSavedAt={null} localOnly />
              : <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />
          )}
          {!isNew && report && canPrint && (
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Printer size={14} /> {t("service.print")}
            </button>
          )}
          {isNew && (
            <button onClick={handleCreate} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60">
              <Save size={14} /> {saving ? t("service.saving") : t("service.createDraft")}
            </button>
          )}
          {!isNew && report && isEditable && (
            <button onClick={handleSaveDraft} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <Save size={14} /> {saving ? t("service.saving") : t("service.saveDraft")}
            </button>
          )}
          {!isNew && report && report.status === "Draft" && canComplete && (
            <button onClick={handleComplete} disabled={completing} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors disabled:opacity-60">
              <CheckCircle2 size={14} /> {completing ? t("service.saving") : t("service.complete")}
            </button>
          )}
          {!isNew && report && report.status === "Completed" && canEdit && (
            <button onClick={handleReopen} disabled={actionBusy} className="flex items-center gap-1.5 px-4 py-2 text-sm border border-border rounded-lg text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <RotateCcw size={14} /> {t("service.reopen")}
            </button>
          )}
          {!isNew && report && report.status !== "Cancelled" && canComplete && (
            <button onClick={() => setConfirmAction("cancel")} className="flex items-center gap-1.5 px-3.5 py-2 text-sm border border-[#e05252]/30 rounded-lg text-[#c23f3f] hover:bg-[#e05252]/5 transition-all">
              <Ban size={14} /> {t("service.cancelReport")}
            </button>
          )}
          {!isNew && report && canDelete && (isEditable) && (
            <button onClick={() => setConfirmAction("delete")} className="flex items-center justify-center w-9 h-9 text-[#e05252] border border-[#e05252]/25 rounded-lg hover:bg-[#e05252]/5 transition-all">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

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

      {isNew && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <label className={labelClass}>{t("service.form.template")}</label>
          <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className={inputClass}>
            <option value="">{t("service.form.selectTemplate")}</option>
            <option value={NO_TEMPLATE_VALUE}>{t("service.form.noTemplate")}</option>
            {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.templateName}</option>)}
          </select>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className={labelClass}>{t("service.form.customer")}</label>
          <CustomerSelector
            customers={customers}
            selectedId={form.customerId}
            disabled={!isEditable}
            onSelect={(c: Customer) => setForm((f) => ({
              ...f, customerId: c.id,
              customerSnapshot: { companyName: c.companyName, contactName: c.contactName, address: c.address, taxId: c.taxId, phone: c.phone, email: c.email, projectName: c.projectName },
            }))}
            onClear={() => setForm((f) => ({ ...f, customerId: "", customerSnapshot: emptyCustomerSnapshot }))}
          />
          {!selectedCustomer && form.customerId === "" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <input placeholder={t("service.form.companyName")} value={form.customerSnapshot.companyName} disabled={!isEditable}
                onChange={(e) => setForm((f) => ({ ...f, customerSnapshot: { ...f.customerSnapshot, companyName: e.target.value } }))} className={inputClass} />
              <input placeholder={t("service.form.contactName")} value={form.customerSnapshot.contactName} disabled={!isEditable}
                onChange={(e) => setForm((f) => ({ ...f, customerSnapshot: { ...f.customerSnapshot, contactName: e.target.value } }))} className={inputClass} />
              <input placeholder={t("service.form.phone")} value={form.customerSnapshot.phone} disabled={!isEditable}
                onChange={(e) => setForm((f) => ({ ...f, customerSnapshot: { ...f.customerSnapshot, phone: e.target.value } }))} className={inputClass} />
              <input placeholder={t("service.form.address")} value={form.customerSnapshot.address} disabled={!isEditable}
                onChange={(e) => setForm((f) => ({ ...f, customerSnapshot: { ...f.customerSnapshot, address: e.target.value } }))} className={inputClass} />
            </div>
          )}
          {fieldErrors["customerSnapshot.companyName"] && <p className="text-[11px] text-[#e05252] mt-1">{fieldErrors["customerSnapshot.companyName"]}</p>}
        </div>

        <div><label className={labelClass}>{t("service.form.serviceLocation")}</label>
          <input value={form.serviceLocation} disabled={!isEditable} onChange={(e) => setField("serviceLocation", e.target.value)} className={inputClass} />
          {fieldErrors.serviceLocation && <p className="text-[11px] text-[#e05252] mt-1">{fieldErrors.serviceLocation}</p>}
        </div>
        <div><label className={labelClass}>{t("service.form.projectOrJobCode")}</label>
          <input value={form.projectOrJobCode} disabled={!isEditable} onChange={(e) => setField("projectOrJobCode", e.target.value)} className={inputClass} />
        </div>
        <div><label className={labelClass}>{t("service.form.serviceSystemName")}</label>
          <input value={form.serviceSystemName} disabled={!isEditable} onChange={(e) => setField("serviceSystemName", e.target.value)} className={inputClass} />
          {fieldErrors.serviceSystemName && <p className="text-[11px] text-[#e05252] mt-1">{fieldErrors.serviceSystemName}</p>}
        </div>
        <div><label className={labelClass}>{t("service.form.serviceType")}</label>
          <input value={form.serviceType} disabled={!isEditable} onChange={(e) => setField("serviceType", e.target.value)} className={inputClass} />
        </div>
        <div><label className={labelClass}>{t("service.form.inspectionDate")}</label>
          <input type="date" value={form.inspectionDate} disabled={!isEditable} onChange={(e) => setField("inspectionDate", e.target.value)} className={inputClass} />
          {fieldErrors.inspectionDate && <p className="text-[11px] text-[#e05252] mt-1">{fieldErrors.inspectionDate}</p>}
        </div>
        <div><label className={labelClass}>{t("service.form.reportDate")}</label>
          <input type="date" value={form.reportDate} disabled={!isEditable} onChange={(e) => setField("reportDate", e.target.value)} className={inputClass} />
          {fieldErrors.reportDate && <p className="text-[11px] text-[#e05252] mt-1">{fieldErrors.reportDate}</p>}
        </div>
        <div><label className={labelClass}>{t("service.form.nextPmDate")}</label>
          <input type="date" value={form.nextPmDate} disabled={!isEditable} onChange={(e) => setField("nextPmDate", e.target.value)} className={inputClass} />
        </div>
        <div><label className={labelClass}>{t("service.form.assignedEngineer")}</label>
          <select value={form.assignedServiceEngineerId} disabled={!isEditable} onChange={(e) => setField("assignedServiceEngineerId", e.target.value)} className={inputClass}>
            <option value="">{t("service.form.selectEngineer")}</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
          {fieldErrors.assignedServiceEngineerId && <p className="text-[11px] text-[#e05252] mt-1">{fieldErrors.assignedServiceEngineerId}</p>}
        </div>
        <div className="md:col-span-2"><label className={labelClass}>{t("service.form.additionalInspectors")}</label>
          <input value={form.additionalInspectorNamesText} disabled={!isEditable} onChange={(e) => setField("additionalInspectorNamesText", e.target.value)} placeholder={t("service.form.additionalInspectorsPlaceholder")} className={inputClass} />
        </div>
        <div><label className={labelClass}>{t("service.form.onSiteContactName")}</label>
          <input value={form.onSiteContactName} disabled={!isEditable} onChange={(e) => setField("onSiteContactName", e.target.value)} className={inputClass} />
        </div>
        <div><label className={labelClass}>{t("service.form.onSiteContactPhone")}</label>
          <input value={form.onSiteContactPhone} disabled={!isEditable} onChange={(e) => setField("onSiteContactPhone", e.target.value)} className={inputClass} />
        </div>
        <div className="md:col-span-2"><label className={labelClass}>{t("service.form.overallCustomerSummary")}</label>
          <textarea value={form.overallCustomerSummary} disabled={!isEditable} onChange={(e) => setField("overallCustomerSummary", e.target.value)} rows={3} className="w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60 resize-y" />
        </div>
        <div className="md:col-span-2"><label className={labelClass}>{t("service.form.overallRemark")}</label>
          <textarea value={form.overallRemark} disabled={!isEditable} onChange={(e) => setField("overallRemark", e.target.value)} rows={3} className="w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60 resize-y" />
        </div>
      </div>

      {displaySections.length > 0 && (
        <div data-tour="servicedoc-checklist" className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Wrench size={14} className="text-[#c9a84c]" />
              <h2 className="text-sm font-semibold text-foreground">{t("service.checklist.title")}</h2>
            </span>
            {!isNew && applicableCount > 0 && (
              <span className={`text-xs font-mono px-2.5 py-1 rounded-full ${answeredCount === applicableCount ? "bg-[#2aa36b]/10 text-[#207e52]" : "bg-muted text-muted-foreground"}`}>
                {answeredCount} / {applicableCount} {t("service.checklist.completedCount")}
              </span>
            )}
          </div>
          {isNew && (
            <p className="px-5 py-3 text-xs text-muted-foreground">{t("service.checklist.previewNote")}</p>
          )}
          {/* Renaming has no icon of its own by design (the row already carries ✕, and a second
              control per row would crowd it), so the gesture is stated once here — otherwise it's
              undiscoverable. Text, not a button: it competes with nothing. */}
          {structureEditable && (
            <p className="px-5 pt-3 text-[11px] text-muted-foreground">{t("service.checklist.renameHint")}</p>
          )}
          {displaySections.map((sectionDef) => {
            const sectionValue = previewChecklist.find((s) => s.key === sectionDef.key);
            const collapsed = collapsedSections.has(sectionDef.key);
            return (
              <div key={sectionDef.key} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleSection(sectionDef.key)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    {sectionDef.title}
                    {sectionDef.isOptionalAddon && (
                      <span className="text-[10px] font-normal text-muted-foreground">({t("service.checklist.optionalAddon")})</span>
                    )}
                  </span>
                  {sectionDef.isOptionalAddon && !isNew && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={sectionValue?.included ?? false}
                        disabled={!isEditable}
                        onChange={(e) => setChecklist((prev) => prev.map((s) => (s.key === sectionDef.key ? { ...s, included: e.target.checked } : s)))}
                      />
                      {t("service.checklist.included")}
                    </label>
                  )}
                </button>
                {!collapsed && (!sectionDef.isOptionalAddon || sectionValue?.included) && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="text-left pl-5 pr-3 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
                            {t("service.checklist.col.item")}
                          </th>
                          <th className="text-center px-2 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider w-20">
                            {t("service.checklist.normal")}
                          </th>
                          <th className={`text-center px-2 ${structureEditable ? "" : "pr-5"} py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider w-20`}>
                            {t("service.checklist.abnormal")}
                          </th>
                          {structureEditable && <th className="w-10 pr-4" />}
                        </tr>
                      </thead>
                      {sectionDef.groups.map((groupDef) => {
                        const groupValue = sectionValue?.groups.find((g) => g.key === groupDef.key);
                        return (
                          <tbody key={groupDef.key}>
                            <tr className="bg-secondary/30">
                              <td colSpan={structureEditable ? 4 : 3} className="pl-5 pr-4 py-1.5">
                                <span className="flex items-center justify-between gap-2">
                                  {structureEditable ? (
                                    <InlineEditableLabel
                                      value={groupDef.title}
                                      onCommit={(title) => renameChecklistGroup(sectionDef.key, groupDef.key, title)}
                                      maxLength={MAX_CHECKLIST_GROUP_TITLE_LENGTH}
                                      editHint={t("service.checklist.renameGroup")}
                                      className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                                      inputClassName="text-xs font-semibold uppercase tracking-wide w-full max-w-sm"
                                    />
                                  ) : (
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{groupDef.title}</span>
                                  )}
                                  {structureEditable && (
                                    <button
                                      type="button"
                                      title={t("service.checklist.removeGroup")}
                                      aria-label={t("service.checklist.removeGroup")}
                                      onClick={() => requestRemoveGroup(sectionDef.key, groupDef.key)}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded text-muted-foreground/50 hover:text-[#e05252] hover:bg-[#e05252]/10 transition-colors"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </span>
                              </td>
                            </tr>
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
                              <tr>
                                <td colSpan={4} className="pl-5 pr-5 py-1.5 border-b border-border/40">
                                  <button
                                    type="button"
                                    onClick={() => setAddItemTarget({ sectionKey: sectionDef.key, groupKey: groupDef.key })}
                                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#c9a84c] transition-colors"
                                  >
                                    <Plus size={12} /> {t("service.checklist.addItem")}
                                  </button>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        );
                      })}
                      {structureEditable && (
                        <tbody>
                          <tr>
                            <td colSpan={4} className="pl-5 pr-5 py-2">
                              <button
                                type="button"
                                onClick={() => setAddGroupTarget(sectionDef.key)}
                                className="flex items-center gap-1 text-xs font-medium text-[#c9a84c] hover:text-[#f0c040] transition-colors"
                              >
                                <Plus size={13} /> {t("service.checklist.addGroup")}
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      )}
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isNew && report && (
        <div data-tour="servicedoc-signature" className="bg-card border border-border rounded-xl p-6 print:hidden">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            {t("service.signature.sectionTitle")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <span className={labelClass}>{t("service.signature.engineer")}</span>
              {/* Read-only by design: the engineer's signature is their saved profile image, so it
                  can't be drawn on someone else's behalf here. */}
              <div className="border border-border rounded-lg bg-secondary/40 p-3">
                <div className="bg-white border border-border rounded-lg h-[110px] flex items-center justify-center overflow-hidden">
                  {engineerUser?.signatureDataUrl ? (
                    <img src={engineerUser.signatureDataUrl} alt="" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <p className="text-[11px] text-muted-foreground px-3 text-center">
                      {engineerUser ? t("service.signature.noProfileSignature") : t("service.signature.noEngineerAssigned")}
                    </p>
                  )}
                </div>
                <div className="mt-2.5">
                  <p className="text-sm text-foreground truncate">{engineerUser?.fullName || t("common.dash")}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {engineerUser && !engineerUser.signatureDataUrl
                      ? t("service.signature.goToSettings")
                      : t("service.signature.engineerFromProfile")}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <span className={labelClass}>{t("service.signature.customer")}</span>
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
                <p className="text-[10px] text-muted-foreground mt-1.5">{t("service.signature.saveHint")}</p>
              )}
            </div>
          </div>

          {/* การอนุมัติจากลูกค้าทางไกล (2026-08-10) — แทนที่ปุ่ม placeholder เดิมของเฟส LINE:
              ส่งลิงก์อนุมัติอายุ 7 วัน (เข้า LINE ลูกค้าอัตโนมัติถ้าผูกบัญชีแล้ว) ลูกค้าเปิดดู
              รายงาน เซ็นชื่อ และกดอนุมัติ/ไม่อนุมัติจากมือถือได้เอง */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t border-border">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">{t("service.signature.optionalNote")}</p>
              {report?.customerApproval?.status === "pending" && (
                <p className="text-[11px] text-[#866d28] mt-0.5">
                  ส่งให้ลูกค้าอนุมัติแล้ว{report.customerApproval.sentViaLine ? " (ผ่าน LINE)" : ""} — รอคำตอบ ลิงก์หมดอายุ {report.customerApproval.expiresAt.slice(0, 10)}
                </p>
              )}
              {report?.customerApproval?.status === "approved" && (
                <p className="text-[11px] text-[#207e52] mt-0.5">
                  ลูกค้าอนุมัติแล้ว{report.customerApproval.signedName ? ` โดย ${report.customerApproval.signedName}` : ""} ({(report.customerApproval.respondedAt ?? "").slice(0, 10)})
                </p>
              )}
              {report?.customerApproval?.status === "rejected" && (
                <p className="text-[11px] text-[#d22626] mt-0.5">
                  ลูกค้าไม่อนุมัติ — เหตุผล: {report.customerApproval.rejectReason || "-"}
                </p>
              )}
            </div>
            {!isNew && report && report.customerApproval?.status !== "approved" && (
              <button
                type="button"
                onClick={handleSendApproval}
                disabled={sendingApproval || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={12} /> {sendingApproval ? "กำลังส่ง..." : report.customerApproval ? "ส่งให้ลูกค้าอนุมัติอีกครั้ง" : "ส่งให้ลูกค้าอนุมัติ (ลิงก์/LINE)"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
    {/* ผลการส่งให้ลูกค้าอนุมัติ: ลิงก์สำหรับคัดลอก + สถานะ LINE + รหัสจับคู่ (2026-08-10) */}
    {approvalResult && (
      <div className="fixed inset-0 z-50 bg-[#0b1d3a]/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ส่งให้ลูกค้าอนุมัติแล้ว">
        <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 size={18} className="text-[#207e52] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">สร้างลิงก์อนุมัติแล้ว (ใช้ได้ 7 วัน)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {approvalResult.sentViaLine
                  ? "ส่งเข้า LINE ของลูกค้าเรียบร้อยแล้ว — คัดลอกลิงก์ด้านล่างส่งช่องทางอื่นเพิ่มได้"
                  : "ลูกค้ายังไม่ได้ผูก LINE — คัดลอกลิงก์ด้านล่างส่งให้ลูกค้าทางช่องทางที่สะดวก"}
              </p>
              {approvalResult.lineError && <p className="text-xs text-[#a75d1a] mt-1">{approvalResult.lineError}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input readOnly value={approvalResult.url} onFocus={(e) => e.target.select()} aria-label="ลิงก์อนุมัติ"
              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground min-w-0" />
            <button
              type="button"
              onClick={() => { void copyApprovalLink(approvalResult.url); }}
              className="px-3 py-2 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors whitespace-nowrap"
            >
              {approvalLinkCopied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
            </button>
          </div>

          {!approvalResult.sentViaLine && (report?.customerId || form.customerId) && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                อยากให้ครั้งหน้าส่งเข้า LINE ลูกค้าอัตโนมัติ? ออกรหัสจับคู่ แล้วให้ลูกค้าแอด LINE บริษัทและพิมพ์รหัสนี้ในแชท (ทำครั้งเดียว)
              </p>
              {pairing ? (
                <p className="text-sm">
                  รหัสจับคู่: <span className="font-mono font-bold text-[#0b1d3a] bg-[#c9a84c]/15 border border-[#c9a84c]/25 rounded px-2 py-0.5">{pairing.code}</span>
                  <span className="text-xs text-muted-foreground"> (ใช้ได้ถึง {pairing.expiresAt.slice(0, 10)})</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handleCreatePairing}
                  disabled={pairingBusy}
                  className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-50"
                >
                  {pairingBusy ? "กำลังออกรหัส..." : "ออกรหัสจับคู่ LINE"}
                </button>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={() => setApprovalResult(null)}
              className="px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              ปิด
            </button>
          </div>
        </div>
      </div>
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
