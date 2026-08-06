import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, CheckCircle2, RotateCcw, Ban, Trash2, ChevronDown, ChevronRight, Wrench, Printer } from "lucide-react";
import {
  type ServiceReport, type ServiceReportDraft, type ServiceChecklistSectionValue, type ServiceReportStatus,
  fetchServiceReport, createServiceReport, updateServiceReport, changeServiceReportStatus, deleteServiceReport,
  uploadServiceReportPhoto, deleteServiceReportPhoto, printServiceReport,
} from "../../lib/serviceReports";
import { type ServiceTemplateSummary, type ServiceTemplate, fetchServiceTemplates, fetchServiceTemplate } from "../../lib/serviceTemplates";
import { type Customer, fetchCustomers } from "../../lib/customers";
import { type User, fetchUsers } from "../../lib/users";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { CustomerSelector } from "../quotation/CustomerSelector";
import { ServiceChecklistItemControl } from "../../components/ServiceChecklistItemControl";
import { ServiceReportPrintDocument } from "./ServiceReportPrintDocument";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

const emptyCustomerSnapshot = { companyName: "", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" };

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
}

function emptyForm(currentUserId: string): FormState {
  return {
    customerId: "", customerSnapshot: emptyCustomerSnapshot,
    serviceLocation: "", projectOrJobCode: "", serviceSystemName: "", serviceType: "",
    inspectionDate: new Date().toISOString().slice(0, 10), reportDate: new Date().toISOString().slice(0, 10), nextPmDate: "",
    assignedServiceEngineerId: currentUserId, additionalInspectorNamesText: "",
    onSiteContactName: "", onSiteContactPhone: "", overallCustomerSummary: "", overallRemark: "",
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
  const [checklist, setChecklist] = useState<ServiceChecklistSectionValue[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [checklistErrors, setChecklistErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "delete" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

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
        }
        setPhase("ready");
      })
      .catch(() => { if (!cancelled) setPhase("error"); });
    return () => { cancelled = true; };
  }, [serviceReportId, isNew]);

  useEffect(() => {
    if (!isNew || !selectedTemplateId) return;
    let cancelled = false;
    fetchServiceTemplate(selectedTemplateId).then((tpl) => { if (!cancelled) setSelectedTemplateFull(tpl); }).catch(() => {});
    return () => { cancelled = true; };
  }, [isNew, selectedTemplateId]);

  const selectedCustomer = customers.find((c) => c.id === form.customerId);
  const isEditable = isNew || (canEdit && report?.status === "Draft");

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
    checklist,
  });

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

  const handleCreate = async () => {
    if (!selectedTemplateId) { showToast(t("service.form.selectTemplateFirst")); return; }
    setSaving(true);
    setFieldErrors({});
    try {
      const created = await createServiceReport({ ...draftBody(), templateId: selectedTemplateId } as ServiceReportDraft);
      showToast(t("service.toast.created"));
      onCreated(created.id);
    } catch (err) {
      applyApiError(err, t("service.toast.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!report) return;
    setSaving(true);
    setFieldErrors({});
    try {
      const updated = await updateServiceReport(report.id, draftBody());
      setReport(updated);
      setChecklist(updated.checklist);
      showToast(t("service.toast.saved"));
    } catch (err) {
      applyApiError(err, t("service.toast.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!report) return;
    setCompleting(true);
    setFieldErrors({});
    setChecklistErrors({});
    try {
      const saved = await updateServiceReport(report.id, draftBody());
      const updated = await changeServiceReportStatus(saved.id, "complete");
      setReport(updated);
      setChecklist(updated.checklist);
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
      setReport(updated);
      setChecklist(updated.checklist);
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

  const handleUploadPhoto = async (sectionKey: string, groupKey: string, itemKey: string, file: File) => {
    if (!report) return;
    try {
      const updated = await uploadServiceReportPhoto(report.id, { sectionKey, groupKey, itemKey }, file);
      setReport(updated);
      setChecklist(updated.checklist);
    } catch (err) {
      applyApiError(err, t("service.toast.photoUploadFailed"));
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!report) return;
    try {
      const updated = await deleteServiceReportPhoto(report.id, photoId);
      setReport(updated);
      setChecklist(updated.checklist);
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

  const sections = useMemo(
    () => (isNew
      ? (selectedTemplateFull && selectedTemplateFull.id === selectedTemplateId ? selectedTemplateFull.sections : [])
      : (report?.templateSnapshot.sections ?? [])),
    [isNew, selectedTemplateFull, selectedTemplateId, report],
  );
  const previewChecklist = useMemo(() => {
    if (!isNew) return checklist;
    return sections.map((s) => ({
      key: s.key, included: !s.isOptionalAddon,
      groups: s.groups.map((g) => ({ key: g.key, items: g.items.map((it) => ({ key: it.key, status: "not_selected" as const, abnormalDetail: "", measurementValue: "", photos: [] })) })),
    }));
  }, [isNew, sections, checklist]);

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
        <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground">
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
  for (const sectionDef of sections) {
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all">
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
        <div className="flex items-center gap-2 flex-wrap print:hidden">
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

      {isNew && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <label className={labelClass}>{t("service.form.template")}</label>
          <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} className={inputClass}>
            <option value="">{t("service.form.selectTemplate")}</option>
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

      {sections.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
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
          {sections.map((sectionDef) => {
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
                          <th className="text-center px-2 pr-5 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider w-20">
                            {t("service.checklist.abnormal")}
                          </th>
                        </tr>
                      </thead>
                      {sectionDef.groups.map((groupDef) => {
                        const groupValue = sectionValue?.groups.find((g) => g.key === groupDef.key);
                        return (
                          <tbody key={groupDef.key}>
                            <tr className="bg-secondary/30">
                              <td colSpan={3} className="pl-5 pr-5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                {groupDef.title}
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
                                />
                              );
                            })}
                          </tbody>
                        );
                      })}
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
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
