import { useEffect, useId, useMemo, useState } from "react";
import {
  Plus, Search, Pencil, Power, Archive, ArchiveRestore, Copy, Eye, FileStack, X, Loader2, Upload, FileText, HelpCircle,
} from "lucide-react";
import type { DriveStep } from "driver.js";
import { useModuleTour } from "../../components/GuidedTour";
import {
  type QuotationTemplateSummary, type QuotationTemplate,
  fetchQuotationTemplates, fetchQuotationTemplate, setQuotationTemplateActive, setQuotationTemplateArchived,
  duplicateQuotationTemplate, importQuotationTemplates,
} from "../../lib/quotationTemplates";
import type { JobType } from "../../lib/jobTypes";
import type { Product, ProductCategory } from "../../lib/products";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { TemplatePreview } from "../../components/TemplatePreview";
import { useI18n } from "../../lib/i18n";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { TemplateEditorView } from "./TemplateEditorView";

type StatusFilter = "all" | "active" | "inactive";
type SourceFilter = "all" | "excel_import" | "manual";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

// หน้าต่างแสดงตัวอย่าง Template แบบ modal พร้อมการจัดการโฟกัส/ปุ่ม Escape
// Modal dialog for previewing a template, with focus trap and Escape handling.
function TemplatePreviewModal({ target, full, onClose }: {
  target: QuotationTemplateSummary;
  full: QuotationTemplate | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onClose);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 id={titleId} className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("templates.action.preview")}: {target.templateName}</h2>
          <button onClick={onClose} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors"><X size={16} /></button>
        </div>
        {full ? <TemplatePreview template={full} /> : (
          <div role="status" aria-live="polite" className="flex items-center justify-center py-10 gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> {t("common.loading")}</div>
        )}
      </div>
    </div>
  );
}

// หน้าต่าง modal สำหรับทำสำเนา Template พร้อมตั้งรหัสใหม่
// Modal dialog for duplicating a template with a new code.
function TemplateDuplicateModal({ target, code, onCodeChange, duplicating, onConfirm, onCancel }: {
  target: QuotationTemplateSummary;
  code: string;
  onCodeChange: (next: string) => void;
  duplicating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  const codeInputId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h2 id={titleId} className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("templates.action.duplicate")}</h2>
        <p className="text-xs text-muted-foreground mb-3">{t("templates.duplicate.prompt").replace("{name}", target.templateName)}</p>
        <label htmlFor={codeInputId} className="text-xs text-muted-foreground block mb-1">{t("templates.col.code")}</label>
        <input id={codeInputId} autoFocus value={code} onChange={(e) => onCodeChange(e.target.value)} className="w-full text-sm font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors mb-4" />
        <div className="flex items-center justify-end gap-2">
          <button onClick={onCancel} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">{t("common.cancel")}</button>
          <button onClick={onConfirm} disabled={duplicating || !code.trim()} className="px-3.5 py-1.5 text-xs rounded-lg font-semibold bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] transition-colors disabled:opacity-60">
            {t("templates.action.duplicate")}
          </button>
        </div>
      </div>
    </div>
  );
}

// หน้าจัดการ Template ใบเสนอราคา แสดงรายการและฟอร์มสร้าง/แก้ไข/ทำสำเนา/เปิดใช้งาน/เก็บถาวร
// Template management page: list plus create/edit/duplicate/activate/archive actions.
export function TemplateManagementPage({
  jobTypes,
  products,
  categories,
  currentUserId,
  canCreate,
  canEdit,
  canDuplicate,
  canActivate,
  canArchive,
  canImport,
  initialCreateForJobType,
  onCreateForJobTypeConsumed,
  onCreateQuotationFromTemplate,
}: {
  jobTypes: JobType[];
  products: Product[];
  categories: ProductCategory[];
  currentUserId: string;
  canCreate: boolean;
  canEdit: boolean;
  canDuplicate: boolean;
  canActivate: boolean;
  canArchive: boolean;
  canImport: boolean;
  initialCreateForJobType?: { jobTypeCode: string; jobTypeName: string; seq: number } | null;
  onCreateForJobTypeConsumed?: () => void;
  onCreateQuotationFromTemplate?: (jobTypeCode: string, templateId: string) => void;
}) {
  const { t } = useI18n();

  const tourSteps: DriveStep[] = [
    { element: '[data-tour="templates-import"]', popover: { title: t("tour.templates.import.title"), description: t("tour.templates.import.desc"), side: "bottom" } },
    { element: '[data-tour="templates-create"]', popover: { title: t("tour.templates.create.title"), description: t("tour.templates.create.desc"), side: "bottom" } },
    { element: '[data-tour="templates-toolbar"]', popover: { title: t("tour.templates.toolbar.title"), description: t("tour.templates.toolbar.desc"), side: "bottom" } },
    { element: '[data-tour="templates-list"]', popover: { title: t("tour.templates.list.title"), description: t("tour.templates.list.desc"), side: "top" } },
  ];
  const tour = useModuleTour("templates", currentUserId, tourSteps);
  const { message, show } = useToast();
  const [templates, setTemplates] = useState<QuotationTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [jobTypeFilter, setJobTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [importing, setImporting] = useState(false);

  const [view, setView] = useState<"list" | "create" | { editId: string }>("list");
  const [previewTarget, setPreviewTarget] = useState<QuotationTemplateSummary | null>(null);
  const [previewFull, setPreviewFull] = useState<QuotationTemplate | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<QuotationTemplateSummary | null>(null);
  const [duplicateCode, setDuplicateCode] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<QuotationTemplateSummary | null>(null);

  // โหลดรายการ Template จากเซิร์ฟเวอร์ (รวมที่เก็บถาวรแล้ว)
  // Fetches the template list from the server, including archived ones.
  const fetchList = () => fetchQuotationTemplates({ includeArchived: true })
    .then((list) => { setTemplates(list); setLoadError(false); })
    .catch(() => setLoadError(true))
    .finally(() => setLoading(false));
  const load = () => { setLoading(true); setLoadError(false); void fetchList(); };
  useEffect(() => { void fetchList(); }, []);

  const [appliedCreateSeq, setAppliedCreateSeq] = useState<number | null>(null);
  if (initialCreateForJobType && initialCreateForJobType.seq !== appliedCreateSeq && canCreate) {
    setAppliedCreateSeq(initialCreateForJobType.seq);
    setView("create");
  }
  useEffect(() => {
    if (initialCreateForJobType) onCreateForJobTypeConsumed?.();
  }, [initialCreateForJobType, onCreateForJobTypeConsumed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter((tpl) => (showArchived ? true : !tpl.isDeleted))
      .filter((tpl) => (jobTypeFilter === "all" ? true : tpl.jobTypeCode === jobTypeFilter))
      .filter((tpl) => (statusFilter === "all" ? true : statusFilter === "active" ? tpl.isActive : !tpl.isActive))
      .filter((tpl) => (sourceFilter === "all" ? true : tpl.sourceType === sourceFilter))
      .filter((tpl) => (q ? [tpl.templateCode, tpl.templateName, tpl.jobTypeCode, tpl.jobTypeName].some((f) => f.toLowerCase().includes(q)) : true));
  }, [templates, search, jobTypeFilter, statusFilter, sourceFilter, showArchived]);

  // สลับสถานะเปิด/ปิดใช้งานของ Template
  // Toggles a template's active/inactive status.
  const handleToggleActive = async (tpl: QuotationTemplateSummary) => {
    try {
      const updated = await setQuotationTemplateActive(tpl.id, !tpl.isActive);
      setTemplates((prev) => prev.map((p) => (p.id === tpl.id ? updated : p)));
      show(updated.isActive ? t("templates.toast.activated") : t("templates.toast.deactivated"));
    } catch (err) {
      show(err instanceof Error ? err.message : t("templates.saveError"));
    }
  };

  // สลับสถานะเก็บถาวร/เรียกคืนของ Template ที่เลือก
  // Toggles archive/unarchive status for the selected template.
  const handleArchiveToggle = async () => {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setArchiveTarget(null);
    try {
      const updated = await setQuotationTemplateArchived(target.id, !target.isDeleted);
      setTemplates((prev) => prev.map((p) => (p.id === target.id ? updated : p)));
      show(updated.isDeleted ? t("templates.toast.archived") : t("templates.toast.unarchived"));
    } catch (err) {
      show(err instanceof Error ? err.message : t("templates.saveError"));
    }
  };

  // เปิด modal แสดงตัวอย่าง Template และโหลดข้อมูลฉบับเต็ม
  // Opens the preview modal and loads the full template data.
  const openPreview = async (tpl: QuotationTemplateSummary) => {
    setPreviewTarget(tpl);
    setPreviewFull(null);
    try {
      setPreviewFull(await fetchQuotationTemplate(tpl.id));
    } catch {
      show(t("templates.previewError"));
      setPreviewTarget(null);
    }
  };

  const openDuplicate = (tpl: QuotationTemplateSummary) => {
    setDuplicateTarget(tpl);
    setDuplicateCode(`${tpl.templateCode}-COPY`);
  };
  // ยืนยันการทำสำเนา Template ด้วยรหัสใหม่ที่ระบุ
  // Confirms duplicating the template with the entered code.
  const handleDuplicateConfirm = async () => {
    if (!duplicateTarget) return;
    setDuplicating(true);
    try {
      const created = await duplicateQuotationTemplate(duplicateTarget.id, duplicateCode.trim());
      setDuplicateTarget(null);
      load();
      show(t("templates.toast.duplicated"));
      setView({ editId: created.id });
    } catch (err) {
      show(err instanceof Error ? err.message : t("templates.saveError"));
    } finally {
      setDuplicating(false);
    }
  };

  // นำเข้า Template จากไฟล์ Excel และแสดงผลสรุป
  // Imports templates from Excel and shows a summary toast.
  const handleImport = async () => {
    setImporting(true);
    try {
      const report = await importQuotationTemplates();
      load();
      const base = t("templates.toast.imported").replace("{created}", String(report.created.length)).replace("{updated}", String(report.updated.length)).replace("{skipped}", String(report.skipped.length));
      const warningNote = report.warnings.length > 0 ? ` — ${t("templates.toast.importWarnings").replace("{n}", String(report.warnings.length))}` : "";
      show(base + warningNote);
    } catch (err) {
      show(err instanceof Error ? err.message : t("templates.saveError"));
    } finally {
      setImporting(false);
    }
  };

  if (view === "create" || (typeof view === "object" && "editId" in view)) {
    return (
      <TemplateEditorView
        templateId={typeof view === "object" ? view.editId : null}
        jobTypes={jobTypes}
        products={products}
        categories={categories}
        canActivate={canActivate}
        initialJobTypeCode={view === "create" ? initialCreateForJobType?.jobTypeCode ?? null : null}
        onSaved={() => { setView("list"); load(); show(t("templates.toast.saved")); }}
        onCancel={() => setView("list")}
      />
    );
  }

  const uniqueJobTypeCodes = Array.from(new Set(templates.map((tpl) => tpl.jobTypeCode))).sort();

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("templates.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("templates.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={tour.start}
            title={t("tour.replay")}
            aria-label={t("tour.replay")}
            className="flex items-center justify-center w-9 h-9 text-muted-foreground border border-border rounded-lg hover:border-[#c9a84c]/40 hover:text-foreground transition-all"
          >
            <HelpCircle size={15} />
          </button>
          {canImport && (
            <button data-tour="templates-import" onClick={handleImport} disabled={importing} title={t("templates.importFromExcelHint")} className="flex items-center gap-2 px-3.5 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {t("templates.importFromExcel")}
            </button>
          )}
          {canCreate && (
            <button data-tour="templates-create" onClick={() => setView("create")} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              <Plus size={15} /> {t("templates.addNew")}
            </button>
          )}
        </div>
      </div>

      {templates.length > 0 && (
        <div data-tour="templates-toolbar" className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-64 focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("templates.searchPlaceholder")} className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full" />
          </div>
          <select value={jobTypeFilter} onChange={(e) => setJobTypeFilter(e.target.value)} className="text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none">
            <option value="all">{t("templates.filter.allJobTypes")}</option>
            {uniqueJobTypeCodes.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none">
            <option value="all">{t("customers.filter.all")}</option>
            <option value="active">{t("customers.filter.active")}</option>
            <option value="inactive">{t("customers.filter.inactive")}</option>
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as SourceFilter)} className="text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none">
            <option value="all">{t("templates.filter.allSources")}</option>
            <option value="excel_import">{t("templates.source.excelImport")}</option>
            <option value="manual">{t("templates.source.manual")}</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground ml-auto">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("customers.showArchived")}
          </label>
        </div>
      )}

      <div data-tour="templates-list" className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div role="status" aria-live="polite" className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">{t("templates.loadError")}</p>
            <button onClick={load} className="px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">{t("quotation.wizard.retry")}</button>
          </div>
        ) : templates.length === 0 ? (
          <EmptyState icon={FileStack} title={t("templates.empty.title")} description={t("templates.empty.sub")} actionLabel={canCreate ? t("templates.addNew") : undefined} onAction={canCreate ? () => setView("create") : undefined} compact />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center"><FileStack size={20} className="text-muted-foreground" /></div>
            <p className="text-sm text-muted-foreground">{t("templates.noFilterResults")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.code")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.name")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.jobType")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.version")}</th>
                  <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.sections")}</th>
                  <th className="px-4 py-3 text-center text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.items")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.status")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.source")}</th>
                  <th className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{t("templates.col.updatedAt")}</th>
                  <th className="px-4 py-3 w-40" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((tpl) => (
                  <tr key={tpl.id} className={`border-b border-border/50 hover:bg-secondary/30 transition-colors group ${tpl.isDeleted ? "opacity-60" : ""}`}>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{tpl.templateCode}</td>
                    <td className="px-4 py-3 text-sm text-foreground font-medium max-w-[200px] truncate" title={tpl.templateName}>{tpl.templateName}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{tpl.jobTypeCode}</td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{tpl.version}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground text-center whitespace-nowrap">{tpl.sectionCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground text-center whitespace-nowrap">{tpl.itemCount}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={tpl.isDeleted ? "archived" : tpl.isActive ? "active" : "inactive"}
                        label={tpl.isDeleted ? t("common.status.archived") : tpl.isActive ? t("common.status.active") : t("customers.status.inactive")}
                      />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{tpl.sourceType === "excel_import" ? t("templates.source.excelImport") : t("templates.source.manual")}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">{fmtDate(tpl.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-50 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                        <button onClick={() => void openPreview(tpl)} title={t("templates.action.preview")} aria-label={`${t("templates.action.preview")} ${tpl.templateName}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"><Eye size={14} /></button>
                        {canEdit && <button onClick={() => setView({ editId: tpl.id })} title={t("common.edit")} aria-label={`${t("common.edit")} ${tpl.templateName}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"><Pencil size={14} /></button>}
                        {canDuplicate && <button onClick={() => openDuplicate(tpl)} title={t("templates.action.duplicate")} aria-label={`${t("templates.action.duplicate")} ${tpl.templateName}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"><Copy size={14} /></button>}
                        {canActivate && !tpl.isDeleted && (
                          <button onClick={() => void handleToggleActive(tpl)} title={tpl.isActive ? t("templates.action.deactivate") : t("templates.action.activate")} aria-label={`${tpl.isActive ? t("templates.action.deactivate") : t("templates.action.activate")} ${tpl.templateName}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"><Power size={14} /></button>
                        )}
                        {canArchive && (
                          <button onClick={() => setArchiveTarget(tpl)} title={tpl.isDeleted ? t("common.unarchive") : t("common.archive")} aria-label={`${tpl.isDeleted ? t("common.unarchive") : t("common.archive")} ${tpl.templateName}`} className="p-1.5 text-muted-foreground hover:text-[#e05252] transition-colors">
                            {tpl.isDeleted ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                          </button>
                        )}
                        {!tpl.isDeleted && tpl.isActive && onCreateQuotationFromTemplate && (
                          <button onClick={() => onCreateQuotationFromTemplate(tpl.jobTypeCode, tpl.id)} title={t("templates.action.createQuotation")} aria-label={`${t("templates.action.createQuotation")} ${tpl.templateName}`} className="p-1.5 text-muted-foreground hover:text-[#c9a84c] transition-colors"><FileText size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {previewTarget && (
        <TemplatePreviewModal target={previewTarget} full={previewFull} onClose={() => setPreviewTarget(null)} />
      )}

      {duplicateTarget && (
        <TemplateDuplicateModal
          target={duplicateTarget}
          code={duplicateCode}
          onCodeChange={setDuplicateCode}
          duplicating={duplicating}
          onConfirm={() => void handleDuplicateConfirm()}
          onCancel={() => setDuplicateTarget(null)}
        />
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        title={archiveTarget?.isDeleted ? t("customers.unarchiveConfirmTitle") : t("customers.archiveConfirmTitle")}
        message={archiveTarget?.isDeleted ? t("customers.unarchiveConfirmMessage") : t("customers.archiveConfirmMessage")}
        confirmLabel={archiveTarget?.isDeleted ? t("common.unarchive") : t("common.archive")}
        danger={!archiveTarget?.isDeleted}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void handleArchiveToggle()}
      />

      <Toast message={message} />
    </div>
  );
}
