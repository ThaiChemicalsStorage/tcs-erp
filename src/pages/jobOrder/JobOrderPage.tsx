import { useEffect, useState } from "react";
import { type JobOrderSummary, fetchAllJobOrders } from "../../lib/jobOrder";
import { JobOrderList } from "./JobOrderList";
import { JobOrderDocument } from "./JobOrderDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการใบสั่งงานแบบแยกอิสระ (ไม่ผูกกับหน้าโครงการ — เข้าถึงได้โดยตรง)
// Standalone Job Order management page — not nested under Project, same reasoning as Material
// Requisition's own standalone page.
export function JobOrderPage({
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  initialJobOrderId,
  onJobOrderIdConsumed,
}: {
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  initialJobOrderId?: string | null;
  onJobOrderIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jobOrders, setJobOrders] = useState<JobOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllJobOrders()
      .then((list) => { setJobOrders(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllJobOrders()
      .then((list) => { if (!cancelled) { setJobOrders(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openJobOrder = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialJobOrderId && initialJobOrderId !== appliedId) {
    setAppliedId(initialJobOrderId);
    setSelectedId(initialJobOrderId);
    setView("detail");
  }
  useEffect(() => {
    if (initialJobOrderId) onJobOrderIdConsumed?.();
  }, [initialJobOrderId, onJobOrderIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <JobOrderDocument
          key={selectedId}
          jobOrderId={selectedId}
          currentUserId={currentUserId}
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
          <span className="sr-only">{t("jobOrder.loading")}</span>
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
        <p className="text-sm text-muted-foreground">{t("jobOrder.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("jobOrder.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <JobOrderList jobOrders={jobOrders} currentUserId={currentUserId} onOpen={openJobOrder} />
      <Toast message={toast.message} />
    </>
  );
}
