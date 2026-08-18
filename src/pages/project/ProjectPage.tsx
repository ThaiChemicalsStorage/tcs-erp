import { useEffect, useState } from "react";
import { type ProjectListItem, fetchAllProjects } from "../../lib/project";
import { ProjectList } from "./ProjectList";
import { ProjectDocument } from "./ProjectDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการโครงการแบบแยกอิสระ สลับระหว่างมุมมองรายการและรายละเอียดของแต่ละโครงการ
// Standalone Project management page, switching between the list view and a per-project detail view.
export function ProjectPage({
  canEdit,
  canDelete,
  canCreateMaterialRequisition,
  canCreateJobOrder,
  canCreatePurchaseRequest,
  onOpenMaterialRequisition,
  onOpenJobOrder,
  onOpenPurchaseRequest,
  initialProjectId,
  onProjectIdConsumed,
}: {
  canEdit: boolean;
  canDelete: boolean;
  canCreateMaterialRequisition: boolean;
  canCreateJobOrder: boolean;
  canCreatePurchaseRequest: boolean;
  onOpenMaterialRequisition: (id: string) => void;
  onOpenJobOrder: (id: string) => void;
  onOpenPurchaseRequest: (id: string) => void;
  initialProjectId?: string | null;
  onProjectIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllProjects()
      .then((list) => { setProjects(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllProjects()
      .then((list) => { if (!cancelled) { setProjects(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openProject = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedProjectId, setAppliedProjectId] = useState<string | null>(null);
  if (initialProjectId && initialProjectId !== appliedProjectId) {
    setAppliedProjectId(initialProjectId);
    setSelectedId(initialProjectId);
    setView("detail");
  }
  useEffect(() => {
    if (initialProjectId) onProjectIdConsumed?.();
  }, [initialProjectId, onProjectIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <ProjectDocument
          key={selectedId}
          projectId={selectedId}
          canEdit={canEdit}
          canDelete={canDelete}
          canCreateMaterialRequisition={canCreateMaterialRequisition}
          canCreateJobOrder={canCreateJobOrder}
          canCreatePurchaseRequest={canCreatePurchaseRequest}
          onBack={backToList}
          onOpenMaterialRequisition={onOpenMaterialRequisition}
          onOpenJobOrder={onOpenJobOrder}
          onOpenPurchaseRequest={onOpenPurchaseRequest}
          onDeleted={backToList}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6" role="status" aria-live="polite">
        <div className="space-y-3 w-full max-w-3xl">
          <span className="sr-only">{t("project.loading")}</span>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("project.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("project.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <ProjectList projects={projects} onOpen={openProject} />
      <Toast message={toast.message} />
    </>
  );
}
