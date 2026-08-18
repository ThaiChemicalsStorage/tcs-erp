import { useEffect, useState } from "react";
import { ChevronRight, RotateCw, Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  type Project, type ProjectStatus,
  fetchProject, updateProjectStatus, refreshProjectFromScope, deleteProject,
} from "../../lib/project";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ProjectItemsEditor } from "./ProjectItemsEditor";
import { useI18n } from "../../lib/i18n";

const statusStyle: Record<ProjectStatus, string> = {
  Planning: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  InProgress: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Completed: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};
const STATUS_OPTIONS: ProjectStatus[] = ["Planning", "InProgress", "Completed"];

// หน้ารายละเอียดโครงการ: ข้อมูลหัวเรื่อง (ลูกค้า/รหัสงาน) และตารางแบ่งสาขาการจัดหารายการ
// Project detail view: header info (customer/job code) and the 3-branch sourcing item table.
export function ProjectDocument({
  projectId,
  canEdit,
  canDelete,
  canCreateMaterialRequisition,
  canCreateJobOrder,
  canCreatePurchaseRequest,
  onBack,
  backLabel,
  onOpenMaterialRequisition,
  onOpenJobOrder,
  onOpenPurchaseRequest,
  onDeleted,
  showToast,
}: {
  projectId: string;
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
  const statusLabel: Record<ProjectStatus, string> = {
    Planning: t("project.status.planning"),
    InProgress: t("project.status.inProgress"),
    Completed: t("project.status.completed"),
  };
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

  if (loadError) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {backLabel ?? t("project.doc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle size={20} className="text-[#e05252]" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button onClick={() => { setLoadError(""); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <RotateCw size={12} /> {t("project.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight size={14} className="rotate-180" /> {backLabel ?? t("project.doc.backToList")}
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-2.5 p-6">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
          <p className="text-xs text-muted-foreground">{t("project.doc.loadingDocument")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {backLabel ?? t("project.doc.backToList")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-mono font-medium tracking-wide">{project.scopeNumber}</span>
        {canEdit ? (
          <select
            value={project.status}
            onChange={(e) => handleStatusChange(e.target.value as ProjectStatus)}
            disabled={statusSaving}
            className={`text-xs font-medium rounded-full px-2.5 py-1 outline-none disabled:opacity-60 ${statusStyle[project.status]}`}
          >
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
          </select>
        ) : (
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusStyle[project.status]}`}>
            {statusLabel[project.status]}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {canEdit && (
            <button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />} {t("project.doc.refresh")}
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> {t("project.doc.delete")}
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
            <h1 className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">{t("project.doc.title")}</h1>
            <p className="text-[#a8bed8] text-xs mt-1">{t("project.doc.scopeOfWorkPrefix")} {project.scopeNumber}</p>
          </div>
          <div className="p-6 space-y-2.5">
            <div>
              <label htmlFor="project-customer" className="text-xs text-muted-foreground block mb-1">{t("project.doc.customerLabel")}</label>
              <input id="project-customer" readOnly className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none opacity-80" value={project.customerCompanyName} />
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed pt-2">{t("project.doc.snapshotNote")}</p>
          </div>
        </div>

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

      <ConfirmDialog
        open={confirmDelete}
        title={t("project.doc.deleteConfirmTitle")}
        message={t("project.doc.deleteConfirmMessage")}
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
