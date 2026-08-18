import { useEffect, useState } from "react";
import { type MaterialRequisitionSummary, fetchAllMaterialRequisitions } from "../../lib/materialRequisition";
import { MaterialRequisitionList } from "./MaterialRequisitionList";
import { MaterialRequisitionDocument } from "./MaterialRequisitionDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการใบเบิกและใบคืนวัสดุแบบแยกอิสระ (ไม่ผูกกับหน้าโครงการ — พนักงานสโตร์เข้าถึงได้โดยตรง)
// Standalone Material Requisition management page — not nested under Project, so Store staff have
// their own entry point.
export function MaterialRequisitionPage({
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  initialMaterialRequisitionId,
  onMaterialRequisitionIdConsumed,
}: {
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  initialMaterialRequisitionId?: string | null;
  onMaterialRequisitionIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [materialRequisitions, setMaterialRequisitions] = useState<MaterialRequisitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllMaterialRequisitions()
      .then((list) => { setMaterialRequisitions(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllMaterialRequisitions()
      .then((list) => { if (!cancelled) { setMaterialRequisitions(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openMaterialRequisition = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialMaterialRequisitionId && initialMaterialRequisitionId !== appliedId) {
    setAppliedId(initialMaterialRequisitionId);
    setSelectedId(initialMaterialRequisitionId);
    setView("detail");
  }
  useEffect(() => {
    if (initialMaterialRequisitionId) onMaterialRequisitionIdConsumed?.();
  }, [initialMaterialRequisitionId, onMaterialRequisitionIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <MaterialRequisitionDocument
          key={selectedId}
          materialRequisitionId={selectedId}
          canEdit={canEdit}
          canFinalize={canFinalize}
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
          <span className="sr-only">{t("materialRequisition.loading")}</span>
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
        <p className="text-sm text-muted-foreground">{t("materialRequisition.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("materialRequisition.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <MaterialRequisitionList materialRequisitions={materialRequisitions} onOpen={openMaterialRequisition} />
      <Toast message={toast.message} />
    </>
  );
}
