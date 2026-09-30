import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  Plus, Power, Archive, ArchiveRestore, Copy, Eye, FileStack, X, Loader2, Upload, FileText, MoreVertical,
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
import { TourReplayButton } from "../../components/TourReplayButton";
import { TemplatePreview } from "../../components/TemplatePreview";
import { ListPageHeader, ListTabs, ListToolbar, FilterSelect, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field } from "../../components/ui/Field";
import { btn, field, surface, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { TemplateEditorView } from "./TemplateEditorView";

type StatusTab = "all" | "active" | "inactive" | "archived";
type SourceFilter = "all" | "excel_import" | "manual";
const PAGE_SIZE = 20;
// MoreMenu เปิดลงล่างเสมอ — แถวท้ายตารางให้เปิดขึ้นบนแทน ไม่งั้นเมนูล้นขอบล่าง

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function JobTypeChip({ code }: { code: string }) {
  return <span className="h-[22px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold font-mono inline-flex items-center">{code}</span>;
}

// กล่องสรุป Template ที่กำลังทำรายการ (ในกล่องทำสำเนา)
function TemplateSummaryBox({ tpl }: { tpl: QuotationTemplateSummary }) {
  const { t } = useI18n();
  const parts = [
    tpl.templateName, tpl.jobTypeCode, t("templates.summary.version").replace("{v}", tpl.version),
    t("templates.summary.counts").replace("{s}", String(tpl.sectionCount)).replace("{n}", String(tpl.itemCount)),
  ];
  return (
    <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg flex flex-col gap-0.5 min-w-0">
      <span className="font-mono text-[13px] font-medium text-foreground truncate">{tpl.templateCode}</span>
      <span className="text-[13px] text-[#3d5173] truncate">{parts.join(" · ")}</span>
    </div>
  );
}

// หน้าต่างแสดงตัวอย่าง Template (880px) — เนื้อหาเป็น TemplatePreview ตัวเดิมที่ใช้ในหน้าสร้างใบเสนอราคา
// Template preview dialog (880px) — body is the same TemplatePreview used by the quotation wizard.
function TemplatePreviewModal({ target, full, onClose }: {
  target: QuotationTemplateSummary;
  full: QuotationTemplate | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onClose);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-[880px] max-h-[85vh] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-[#eef1f6]">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{t("templates.action.preview")}: {target.templateName}</h2>
            <div className="flex items-center gap-2.5 flex-wrap text-[13px] text-[#3d5173]">
              <JobTypeChip code={target.jobTypeCode} />
              <span>{t("templates.summary.version").replace("{v}", target.version)}</span>
              <span className="text-[#c3ccda]">·</span>
              <span>{t("templates.summary.counts").replace("{s}", String(target.sectionCount)).replace("{n}", String(target.itemCount))}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="w-9 h-9 -mr-2 -mt-1 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {full ? <TemplatePreview template={full} /> : (
            <div role="status" aria-live="polite" className="flex items-center justify-center py-10 gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" /> {t("common.loading")}</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 border-t border-border">
          <button type="button" onClick={onClose} className={btn.secondary}>{t("common.close")}</button>
        </div>
      </div>
    </div>
  );
}

// หน้าต่างทำสำเนา Template พร้อมตั้งรหัสใหม่ (480px แบบกล่องยืนยัน)
// Duplicate dialog — asks for a new Template Code.
function TemplateDuplicateModal({ target, code, onCodeChange, duplicating, onConfirm, onCancel }: {
  target: QuotationTemplateSummary;
  code: string;
  onCodeChange: (next: string) => void;
  duplicating: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const close = () => { if (!duplicating) onCancel(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  const descId = useId();
  const codeInputId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!duplicating && code.trim()) onConfirm();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-[480px] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)]"
      >
        <form onSubmit={submit} className="flex flex-col">
          <div className="flex items-start gap-4 px-6 pt-6">
            <span className="w-11 h-11 rounded-full bg-[#e8f0fb] text-[#1a5fb4] flex items-center justify-center flex-shrink-0"><Copy size={20} /></span>
            <div className="flex-1 min-w-0 pt-0.5 flex flex-col gap-1">
              <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{t("templates.action.duplicate")}</h2>
              <p id={descId} className="text-sm text-[#3d5173] leading-relaxed">{t("templates.duplicate.prompt").replace("{name}", target.templateName)}</p>
            </div>
            <button type="button" onClick={close} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
              <X size={18} />
            </button>
          </div>
          <div className="px-6 pt-5 pb-6 flex flex-col gap-[18px]">
            <TemplateSummaryBox tpl={target} />
            <Field label={t("templates.col.code")} htmlFor={codeInputId} required help={t("templates.duplicate.codeHelp")}>
              <input id={codeInputId} autoFocus value={code} onChange={(e) => onCodeChange(e.target.value)} className={`${field.input} w-full font-mono`} />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#eef1f6]">
            <button type="button" onClick={close} disabled={duplicating} className={btn.secondary}>{t("common.cancel")}</button>
            <button type="submit" disabled={duplicating || !code.trim()} className={btn.primary}>
              {duplicating ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
              {t("templates.action.duplicate")}
            </button>
          </div>
        </form>
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
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [page, setPage] = useState(1);
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

  const counts = useMemo(() => ({
    all: templates.filter((tpl) => !tpl.isDeleted).length,
    active: templates.filter((tpl) => !tpl.isDeleted && tpl.isActive).length,
    inactive: templates.filter((tpl) => !tpl.isDeleted && !tpl.isActive).length,
    archived: templates.filter((tpl) => tpl.isDeleted).length,
  }), [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates
      .filter((tpl) => (statusTab === "archived" ? tpl.isDeleted : !tpl.isDeleted))
      .filter((tpl) => (statusTab === "active" ? tpl.isActive : statusTab === "inactive" ? !tpl.isActive : true))
      .filter((tpl) => (jobTypeFilter === "all" ? true : tpl.jobTypeCode === jobTypeFilter))
      .filter((tpl) => (sourceFilter === "all" ? true : tpl.sourceType === sourceFilter))
      .filter((tpl) => (q ? [tpl.templateCode, tpl.templateName, tpl.jobTypeCode, tpl.jobTypeName].some((f) => f.toLowerCase().includes(q)) : true));
  }, [templates, search, jobTypeFilter, statusTab, sourceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

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
  const openRow = (tpl: QuotationTemplateSummary) => { if (canEdit) setView({ editId: tpl.id }); else void openPreview(tpl); };
  const resetPage = () => setPage(1);

  const tabs = [
    { key: "all" as const, label: t("customers.filter.all"), count: counts.all },
    { key: "active" as const, label: t("common.status.active"), count: counts.active },
    { key: "inactive" as const, label: t("customers.status.inactive"), count: counts.inactive },
    { key: "archived" as const, label: t("common.status.archived"), count: counts.archived },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.sales")}
        title={t("templates.pageTitle")}
        description={t("templates.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={(canImport || canCreate) && (
          <>
            {canImport && (
              <button data-tour="templates-import" onClick={() => void handleImport()} disabled={importing} title={t("templates.importFromExcelHint")} className={btn.secondary}>
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {t("templates.importFromExcel")}
              </button>
            )}
            {canCreate && (
              <button data-tour="templates-create" onClick={() => setView("create")} className={btn.primary}>
                <Plus size={16} /> {t("templates.addNew")}
              </button>
            )}
          </>
        )}
      />

      {/* ไม่ใช้ ListCard เพราะ overflow-hidden ของมันตัดเมนู ⋮ ของแถวท้ายตาราง */}
      <section className={`${surface.card} flex flex-col min-w-0`}>
        {templates.length > 0 && (
          <div data-tour="templates-toolbar">
            <ListTabs tabs={tabs} active={statusTab} onChange={(k) => { setStatusTab(k); resetPage(); }} ariaLabel={t("templates.col.status")} />
            <ListToolbar
              search={search}
              onSearch={(v) => { setSearch(v); resetPage(); }}
              searchPlaceholder={t("templates.searchPlaceholder")}
              count={t("ui.itemCount").replace("{n}", String(filtered.length))}
            >
              <FilterSelect
                label={t("templates.col.jobType")}
                value={jobTypeFilter}
                options={[{ value: "all", label: t("customers.filter.all") }, ...uniqueJobTypeCodes.map((code) => ({ value: code, label: code }))]}
                onChange={(v) => { setJobTypeFilter(v); resetPage(); }}
              />
              <FilterSelect<SourceFilter>
                label={t("templates.col.source")}
                value={sourceFilter}
                options={[
                  { value: "all", label: t("customers.filter.all") },
                  { value: "excel_import", label: t("templates.source.excelImport") },
                  { value: "manual", label: t("templates.source.manual") },
                ]}
                onChange={(v) => { setSourceFilter(v); resetPage(); }}
              />
            </ListToolbar>
          </div>
        )}

        <div data-tour="templates-list">
          {loading ? (
            <div role="status" aria-live="polite" className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> {t("common.loading")}
            </div>
          ) : loadError ? (
            <div role="alert" className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-sm text-muted-foreground">{t("templates.loadError")}</p>
              <button onClick={load} className={btn.secondarySm}>{t("quotation.wizard.retry")}</button>
            </div>
          ) : templates.length === 0 ? (
            <EmptyState icon={FileStack} title={t("templates.empty.title")} description={t("templates.empty.sub")} actionLabel={canCreate ? t("templates.addNew") : undefined} onAction={canCreate ? () => setView("create") : undefined} compact />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("templates.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto xl:overflow-visible">
              <table className="w-full min-w-[900px] table-fixed text-sm">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("templates.col.nameCode")}</th>
                    <th className={`${table.th} w-[100px]`}>{t("templates.col.jobType")}</th>
                    <th className={`${table.th} w-[84px]`}>{t("templates.col.version")}</th>
                    <th className={`${table.th} w-[130px] text-right`}>{t("templates.col.sectionsItems")}</th>
                    <th className={`${table.th} w-[140px]`}>{t("templates.col.source")}</th>
                    <th className={`${table.th} w-[120px]`}>{t("templates.col.updatedAt")}</th>
                    <th className={`${table.th} w-[130px]`}>{t("templates.col.status")}</th>
                    <th className={`${table.th} w-[60px]`}><span className="sr-only">{t("ui.more")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((tpl) => {
                    return (
                      <tr key={tpl.id} onClick={() => openRow(tpl)} className={`${table.row} cursor-pointer ${tpl.isDeleted ? "opacity-60" : ""}`}>
                        <td className={table.td}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openRow(tpl); }}
                            title={tpl.templateName}
                            className="block max-w-full text-left font-medium text-foreground truncate rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40"
                          >
                            {tpl.templateName}
                          </button>
                          <span className="block font-mono text-xs text-muted-foreground truncate">{tpl.templateCode}</span>
                        </td>
                        <td className={table.td}><JobTypeChip code={tpl.jobTypeCode} /></td>
                        <td className={`${table.td} text-[#3d5173] tabular-nums`}>{tpl.version}</td>
                        <td className={`${table.td} text-right text-[#3d5173] tabular-nums whitespace-nowrap`}>{tpl.sectionCount} · {tpl.itemCount}</td>
                        <td className={`${table.td} text-[#3d5173] truncate`}>{tpl.sourceType === "excel_import" ? t("templates.source.excelImport") : t("templates.source.manual")}</td>
                        <td className={`${table.td} text-[#3d5173] whitespace-nowrap`}>{fmtDate(tpl.updatedAt)}</td>
                        <td className={table.td}>
                          <StatusBadge
                            status={tpl.isDeleted ? "archived" : tpl.isActive ? "active" : "inactive"}
                            label={tpl.isDeleted ? t("common.status.archived") : tpl.isActive ? t("common.status.active") : t("customers.status.inactive")}
                          />
                        </td>
                        <td className={table.td} onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <MoreMenu
                              trigger={({ open, toggle }) => (
                                <button
                                  type="button"
                                  onClick={toggle}
                                  aria-haspopup="menu"
                                  aria-expanded={open}
                                  aria-label={t("templates.rowMenu").replace("{name}", tpl.templateName)}
                                  title={t("ui.more")}
                                  className={`${btn.icon} ${open ? "bg-[#eef1f6]" : ""}`}
                                >
                                  <MoreVertical size={18} />
                                </button>
                              )}
                              items={[
                                { key: "preview", label: t("templates.action.preview"), icon: Eye, onSelect: () => void openPreview(tpl) },
                                !tpl.isDeleted && tpl.isActive && onCreateQuotationFromTemplate && {
                                  key: "quote", label: t("templates.action.createQuotation"), icon: FileText,
                                  onSelect: () => onCreateQuotationFromTemplate(tpl.jobTypeCode, tpl.id),
                                },
                                canDuplicate && { key: "duplicate", label: t("templates.action.duplicate"), icon: Copy, onSelect: () => openDuplicate(tpl) },
                                canActivate && !tpl.isDeleted && {
                                  key: "active", label: tpl.isActive ? t("templates.action.deactivate") : t("templates.action.activate"), icon: Power,
                                  onSelect: () => void handleToggleActive(tpl),
                                },
                                canArchive && {
                                  key: "archive", label: tpl.isDeleted ? t("common.unarchive") : t("common.archive"),
                                  icon: tpl.isDeleted ? ArchiveRestore : Archive, danger: !tpl.isDeleted,
                                  onSelect: () => setArchiveTarget(tpl),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {!loading && !loadError && filtered.length > 0 && (
          <ListPagination
            page={currentPage}
            pageCount={pageCount}
            from={(currentPage - 1) * PAGE_SIZE + 1}
            to={Math.min(currentPage * PAGE_SIZE, filtered.length)}
            total={filtered.length}
            onPage={setPage}
          />
        )}
      </section>

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
        title={archiveTarget?.isDeleted ? t("templates.unarchiveConfirmTitle") : t("templates.archiveConfirmTitle")}
        message={archiveTarget?.isDeleted ? t("templates.unarchiveConfirmMessage") : t("templates.archiveConfirmMessage")}
        confirmLabel={archiveTarget?.isDeleted ? t("common.unarchive") : t("common.archive")}
        danger={!archiveTarget?.isDeleted}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void handleArchiveToggle()}
      />

      <Toast message={message} />
    </div>
  );
}
