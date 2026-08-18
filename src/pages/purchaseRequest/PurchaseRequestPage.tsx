import { useEffect, useState } from "react";
import { type PurchaseRequestSummary, fetchAllPurchaseRequests } from "../../lib/purchaseRequest";
import { PurchaseRequestList } from "./PurchaseRequestList";
import { PurchaseRequestDocument } from "./PurchaseRequestDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการใบขอซื้อแบบแยกอิสระ (ไม่ผูกกับหน้าโครงการ — เข้าถึงได้โดยตรง)
// Standalone Purchase Request management page — not nested under Project, same reasoning as
// Material Requisition's own standalone page.
export function PurchaseRequestPage({
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  initialPurchaseRequestId,
  onPurchaseRequestIdConsumed,
}: {
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  initialPurchaseRequestId?: string | null;
  onPurchaseRequestIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllPurchaseRequests()
      .then((list) => { setPurchaseRequests(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllPurchaseRequests()
      .then((list) => { if (!cancelled) { setPurchaseRequests(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openPurchaseRequest = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialPurchaseRequestId && initialPurchaseRequestId !== appliedId) {
    setAppliedId(initialPurchaseRequestId);
    setSelectedId(initialPurchaseRequestId);
    setView("detail");
  }
  useEffect(() => {
    if (initialPurchaseRequestId) onPurchaseRequestIdConsumed?.();
  }, [initialPurchaseRequestId, onPurchaseRequestIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <PurchaseRequestDocument
          key={selectedId}
          purchaseRequestId={selectedId}
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
          <span className="sr-only">{t("purchaseRequest.loading")}</span>
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
        <p className="text-sm text-muted-foreground">{t("purchaseRequest.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("purchaseRequest.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <PurchaseRequestList purchaseRequests={purchaseRequests} onOpen={openPurchaseRequest} />
      <Toast message={toast.message} />
    </>
  );
}
