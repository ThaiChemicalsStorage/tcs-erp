import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { type ProjectListItem, fetchAllProjects, createProjectFromScope } from "../../lib/project";
import { ProjectList } from "./ProjectList";
import { ProjectDocument } from "./ProjectDocument";
import { ScopeOfWorkSourcePickerDialog } from "./ProjectSourcePickers";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการโครงการแบบแยกอิสระ สลับระหว่างมุมมองรายการและรายละเอียดของแต่ละโครงการ
// Standalone Project management page, switching between the list view and a per-project detail view.
export function ProjectPage({
  currentUserId,
  canEdit,
  canDelete,
  canCreate,
  canCreateMaterialRequisition,
  canCreateJobOrder,
  canCreatePurchaseRequest,
  onOpenMaterialRequisition,
  onOpenJobOrder,
  onOpenPurchaseRequest,
  initialProjectId,
  onProjectIdConsumed,
}: {
  currentUserId: string;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const toast = useToast();

  // สร้างโครงการจากหน้านี้ได้เลย โดยเลือก Scope of Work ต้นทางเอง (เดิมสร้างได้จากหน้า Scope of Work
  // เท่านั้น) — ตามคำขอ 2026-08-20 "กดสร้างในหน้าของตัวเองได้เลย ตอนกดสร้างก็ขึ้นมาให้เลือกว่าจะมาจากใบไหน"
  const handleCreateFromScope = async (scopeOfWorkId: string) => {
    try {
      const project = await createProjectFromScope(scopeOfWorkId);
      setPickerOpen(false);
      openProject(project.id);
    } catch (err) {
      setPickerOpen(false);
      toast.show(err instanceof ApiError ? err.message : t("project.loadError"));
    }
  };

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
          currentUserId={currentUserId}
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
      <ProjectList
        projects={projects}
        currentUserId={currentUserId}
        onOpen={openProject}
        headerAction={canCreate ? (
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
          >
            <Plus size={15} /> {t("project.createBtn")}
          </button>
        ) : undefined}
      />
      {pickerOpen && (
        <ScopeOfWorkSourcePickerDialog
          onClose={() => setPickerOpen(false)}
          onSelect={(scopeOfWorkId) => void handleCreateFromScope(scopeOfWorkId)}
        />
      )}
      <Toast message={toast.message} />
    </>
  );
}
