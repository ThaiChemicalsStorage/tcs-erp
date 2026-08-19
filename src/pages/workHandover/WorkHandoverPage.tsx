import { useEffect, useState } from "react";
import { type WorkHandoverSummary, fetchAllWorkHandovers } from "../../lib/workHandover";
import { WorkHandoverList } from "./WorkHandoverList";
import { WorkHandoverDocument } from "./WorkHandoverDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการใบส่งมอบงานแบบแยกอิสระ (ไม่ผูกกับหน้าโครงการ — เข้าถึงได้โดยตรง)
// Standalone Work Handover Note management page — not nested under Project, same reasoning as
// Material Requisition/Job Order/Purchase Request's own standalone pages.
export function WorkHandoverPage({
  currentUserId,
  canEdit,
  canSign,
  canPrint,
  canDelete,
  initialWorkHandoverId,
  onWorkHandoverIdConsumed,
}: {
  currentUserId: string;
  canEdit: boolean;
  canSign: boolean;
  canPrint: boolean;
  canDelete: boolean;
  initialWorkHandoverId?: string | null;
  onWorkHandoverIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workHandovers, setWorkHandovers] = useState<WorkHandoverSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllWorkHandovers()
      .then((list) => { setWorkHandovers(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllWorkHandovers()
      .then((list) => { if (!cancelled) { setWorkHandovers(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openWorkHandover = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialWorkHandoverId && initialWorkHandoverId !== appliedId) {
    setAppliedId(initialWorkHandoverId);
    setSelectedId(initialWorkHandoverId);
    setView("detail");
  }
  useEffect(() => {
    if (initialWorkHandoverId) onWorkHandoverIdConsumed?.();
  }, [initialWorkHandoverId, onWorkHandoverIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <WorkHandoverDocument
          key={selectedId}
          workHandoverId={selectedId}
          currentUserId={currentUserId}
          canEdit={canEdit}
          canSign={canSign}
          canPrint={canPrint}
          canDelete={canDelete}
          onBack={backToList}
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
          <span className="sr-only">{t("workHandover.loading")}</span>
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
        <p className="text-sm text-muted-foreground">{t("workHandover.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("workHandover.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <WorkHandoverList workHandovers={workHandovers} currentUserId={currentUserId} onOpen={openWorkHandover} />
      <Toast message={toast.message} />
    </>
  );
}
