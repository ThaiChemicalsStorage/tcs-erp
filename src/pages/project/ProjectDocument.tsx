import { useEffect, useState } from "react";
import { RotateCw, Trash2, Loader2, AlertTriangle, Building2, Info, CheckCircle2, Undo2, ArrowRight } from "lucide-react";
import {
  type Project, type ProjectStatus,
  fetchProject, updateProjectStatus, refreshProjectFromScope, deleteProject,
} from "../../lib/project";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { DocumentHeader, DocumentStepper, DocumentColumns, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn } from "../../components/ui/styles";
import { ProjectItemsEditor } from "./ProjectItemsEditor";
import { NoteBox, ProjectStatusPill, RailSummaryCard, useProjectStatusLabel } from "./projectUi";
import { projectStatusMoves, summarizeProjectItems } from "./projectSummary";
import { useI18n } from "../../lib/i18n";

const STATUS_ORDER: ProjectStatus[] = ["Planning", "InProgress", "Completed"];

// หน้ารายละเอียดโครงการ (ดีไซน์ใหม่ 2026-09-30): หัวเอกสาร + ขั้นตอนสถานะ · ข้อมูลโครงการและสรุปการจัดหา ·
// ตารางแบ่งสาขาการจัดหาเต็มความกว้าง
// Project detail view: document header + status stepper, project info with sourcing tiles, rail summary,
// and the full-width 3-branch sourcing item table.
export function ProjectDocument({
  projectId,
  currentUserId,
  canEdit,
  canDelete,
  canCreateMaterialRequisition,
  canCreateJobOrder,
  canCreatePurchaseRequest,
  onOpenMaterialRequisition,
  onOpenJobOrder,
  onOpenPurchaseRequest,
  onBack,
  backLabel,
  onDeleted,
  showToast,
}: {
  projectId: string;
  currentUserId: string;
  canEdit: boolean;
  canDelete: boolean;
  canCreateMaterialRequisition: boolean;
  canCreateJobOrder: boolean;
  canCreatePurchaseRequest: boolean;
  onBack: () => void;
  backLabel?: string;
  onOpenMaterialRequisition: (id: string) => void;
  onOpenJobOrder: (id: string) => void;
  onOpenPurchaseRequest: (id: string) => void;
  onDeleted: () => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const statusLabel = useProjectStatusLabel();
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchProject(projectId)
      .then((p) => { if (!cancelled) setProject(p); })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("project.doc.loadError"));
      });
    return () => { cancelled = true; };
  }, [projectId, reloadKey, t]);

  const docTourSteps: TourStep[] = [
    { element: '[data-tour="projectdoc-actions"]', manual: "ch15-2", popover: { title: t("tour.projectdoc.actions.title"), description: t("tour.projectdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="projectdoc-steps"]', manual: "ch15-2", popover: { title: t("tour.projectdoc.steps.title"), description: t("tour.projectdoc.steps.desc"), side: "bottom" } },
    { element: '[data-tour="projectdoc-header"]', manual: "ch15-1", popover: { title: t("tour.projectdoc.header.title"), description: t("tour.projectdoc.header.desc"), side: "bottom" } },
    { element: '[data-tour="projectdoc-progress"]', manual: "ch15-2", popover: { title: t("tour.projectdoc.progress.title"), description: t("tour.projectdoc.progress.desc"), side: "left" } },
    { element: '[data-tour="projectdoc-items"]', manual: "ch15-2", popover: { title: t("tour.projectdoc.items.title"), description: t("tour.projectdoc.items.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("projectDoc", currentUserId, docTourSteps, { autoStart: !!project });

  const handleStatusChange = async (status: ProjectStatus) => {
    if (!project) return;
    setStatusSaving(true);
    try {
      const updated = await updateProjectStatus(project.id, status);
      setProject(updated);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("project.doc.errorStatus"));
    } finally {
      setStatusSaving(false);
    }
  };

  const handleRefresh = async () => {
    if (!project) return;
    setRefreshing(true);
    try {
      const updated = await refreshProjectFromScope(project.id);
      setProject(updated);
      showToast(t("project.doc.refreshed"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("project.doc.errorRefresh"));
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setDeleting(true);
    try {
      await deleteProject(project.id);
      setConfirmDelete(false);
      onDeleted();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("project.doc.errorDelete"));
      setDeleting(false);
    }
  };

  const back = backLabel ?? t("project.doc.backToAll");

  if (loadError || !project) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20">
          <DocumentHeader backLabel={back} onBack={onBack} number={t("project.doc.title")} mono={false} />
        </div>
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <AlertTriangle size={20} className="text-[#b93636]" />
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <button type="button" onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className={btn.secondary}>
              <RotateCw size={16} /> {t("project.retry")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 p-10" role="status">
            <Loader2 size={20} className="text-muted-foreground animate-spin" />
            <p className="text-[13px] text-muted-foreground">{t("project.doc.loadingDocument")}</p>
          </div>
        )}
      </div>
    );
  }

  const summary = summarizeProjectItems(project.items);
  const moves = projectStatusMoves(project.status);
  const currentIndex = STATUS_ORDER.indexOf(project.status);
  const moveLabel = (to: ProjectStatus) => STATUS_ORDER.indexOf(to) < currentIndex
    ? t("project.doc.moveBack").replace("{status}", statusLabel(to))
    : t("project.doc.moveTo").replace("{status}", statusLabel(to));
  const stepperCurrent = project.status === "Completed" ? STATUS_ORDER.length : currentIndex;

  const tiles: { key: "unassigned" | "requisition" | "jobOrder" | "purchaseRequest"; label: string }[] = [
    { key: "unassigned", label: t("project.sourcing.unassigned") },
    { key: "requisition", label: t("project.sourcing.requisition") },
    { key: "jobOrder", label: t("project.sourcing.jobOrder") },
    { key: "purchaseRequest", label: t("project.sourcing.purchaseRequest") },
  ];
  const itemsUnit = t("project.picker.project.itemsUnit");

  return (
    <div className="doc-form flex-1 overflow-y-auto">
      <div className="sticky top-0 z-20">
        <DocumentHeader
          backLabel={back}
          onBack={onBack}
          number={project.scopeNumber}
          status={<ProjectStatusPill status={project.status} />}
          meta={
            <>
              <span className="truncate max-w-[360px]" title={project.customerCompanyName}>{project.customerCompanyName}</span>
              {refreshing && <Loader2 size={14} className="animate-spin" aria-label={t("project.doc.refresh")} />}
            </>
          }
          actions={
            <div data-tour="projectdoc-actions" className="flex items-center gap-2.5 flex-wrap">
              <TourReplayButton variant="title" onClick={docTour.start} />
              <MoreMenu
                items={[
                  canEdit && {
                    key: "refresh", label: t("project.doc.refresh"), hint: t("project.doc.refreshHint"), icon: RotateCw,
                    disabled: refreshing, onSelect: () => void handleRefresh(),
                  },
                  ...moves.others.map((to) => canEdit && {
                    key: `status-${to}`, label: moveLabel(to), icon: STATUS_ORDER.indexOf(to) < currentIndex ? Undo2 : ArrowRight,
                    disabled: statusSaving, onSelect: () => void handleStatusChange(to),
                  }),
                  canDelete && { key: "delete", label: t("project.doc.deleteConfirmTitle"), icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
                ]}
              />
              {canEdit && moves.next && (
                <button type="button" onClick={() => void handleStatusChange(moves.next!)} disabled={statusSaving} className={btn.primary}>
                  {statusSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {moveLabel(moves.next)}
                </button>
              )}
            </div>
          }
        />
      </div>

      <div className="px-4 md:px-8 py-6 flex flex-col gap-5">
        <div data-tour="projectdoc-steps">
          <DocumentStepper
            steps={STATUS_ORDER.map((s) => ({ label: statusLabel(s) }))}
            current={stepperCurrent}
            ariaLabel={t("project.doc.stepsAria")}
          />
        </div>

        <DocumentColumns
          main={
            <div data-tour="projectdoc-header">
              <SectionCard title={t("project.doc.infoTitle")}>
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
                    <div className="sm:col-span-2 flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0">
                        <Building2 size={18} />
                      </span>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs text-muted-foreground">{t("project.doc.customerLabel")}</span>
                        <span className="text-sm font-medium text-foreground break-words">{project.customerCompanyName || "—"}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs text-muted-foreground">{t("project.doc.scopeOfWorkPrefix")}</span>
                      <span className="font-mono text-sm font-medium text-foreground break-all">{project.scopeNumber}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <span className="text-[13px] font-medium text-[#26395a]">{t("project.doc.sourcingBreakdown")}</span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {tiles.map((tile) => (
                        <div key={tile.key} className={`px-3.5 py-3 rounded-[10px] flex flex-col gap-0.5 ${tile.key === "unassigned" ? "border border-dashed border-[#c3ccda]" : "border border-border"}`}>
                          <span className="text-[22px] font-semibold leading-tight tabular-nums text-foreground">{summary.bySourcing[tile.key]}</span>
                          <span className="text-xs text-muted-foreground">{tile.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <NoteBox icon={<Info size={16} />}>{t("project.doc.snapshotNoteMenu")}</NoteBox>
                </div>
              </SectionCard>
            </div>
          }
          rail={
            <>
              <RailSummaryCard
                dataTour="projectdoc-progress"
                label={t("project.itemStatus.fulfilled")}
                value={`${summary.byStatus.fulfilled} / ${summary.total}`}
                unit={itemsUnit}
                progress={summary.progress}
                rows={[
                  { label: t("project.itemStatus.documentCreated"), value: `${summary.byStatus.documentCreated} ${itemsUnit}` },
                  { label: t("project.itemStatus.pending"), value: `${summary.byStatus.pending} ${itemsUnit}` },
                  { label: t("project.itemStatus.fulfilled"), value: `${summary.byStatus.fulfilled} ${itemsUnit}` },
                  ...(summary.byStatus.cancelled > 0 ? [{ label: t("project.itemStatus.cancelled"), value: `${summary.byStatus.cancelled} ${itemsUnit}` }] : []),
                ]}
              />
              {summary.byStatus.pending > 0 ? (
                <NextStepHint title={t("project.doc.nextStep")}>{t("project.doc.nextStepPending")}</NextStepHint>
              ) : summary.total > 0 && summary.byStatus.fulfilled === summary.total && project.status !== "Completed" ? (
                <NextStepHint title={t("project.doc.nextStep")}>{t("project.doc.nextStepComplete")}</NextStepHint>
              ) : null}
            </>
          }
        />

        <div data-tour="projectdoc-items">
          <ProjectItemsEditor
            project={project}
            canCreateMaterialRequisition={canCreateMaterialRequisition}
            canCreateJobOrder={canCreateJobOrder}
            canCreatePurchaseRequest={canCreatePurchaseRequest}
            onOpenMaterialRequisition={onOpenMaterialRequisition}
            onOpenJobOrder={onOpenJobOrder}
            onOpenPurchaseRequest={onOpenPurchaseRequest}
            showToast={showToast}
          />
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("project.doc.deleteConfirmTitle")}
        message={t("project.doc.deleteConfirmMessage")}
        confirmLabel={t("project.doc.deleteConfirmTitle")}
        danger
        busy={deleting}
        summary={
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="font-mono text-[13px] font-medium text-foreground">{project.scopeNumber}</span>
              <span className="text-[13px] text-[#3d5173] truncate">{project.customerCompanyName}</span>
            </div>
            <span className="text-[13px] text-[#3d5173] whitespace-nowrap">
              {t("project.doc.deleteSummary").replace("{n}", String(project.items.length)).replace("{docs}", String(summary.subDocumentCount))}
            </span>
          </div>
        }
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
