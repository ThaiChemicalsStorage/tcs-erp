import { useEffect, useState } from "react";
import { type ServiceReportListItem, fetchAllServiceReports } from "../../lib/serviceReports";
import type { Company } from "../../lib/storage";
import { ServiceList } from "./ServiceList";
import { ServiceReportEditor } from "./ServiceReportEditor";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการรายงานบริการ — แสดงรายการและรายละเอียด/ฟอร์มสร้าง-แก้ไข
// Service Report management page — list/detail(create-or-edit) view state.
export function ServicePage({
  currentUserId,
  company,
  canCreate,
  canEdit,
  canComplete,
  canDelete,
  canPrint,
  initialServiceReportId,
  onServiceReportIdConsumed,
}: {
  currentUserId: string;
  company: Company;
  canCreate: boolean;
  canEdit: boolean;
  canComplete: boolean;
  canDelete: boolean;
  canPrint: boolean;
  initialServiceReportId?: string | null;
  onServiceReportIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "editor">("list");
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [serviceReports, setServiceReports] = useState<ServiceReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllServiceReports()
      .then((list) => { setServiceReports(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllServiceReports()
      .then((list) => { if (!cancelled) { setServiceReports(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openReport = (id: string) => { setSelectedId(id); setView("editor"); };
  const createNew = () => { setSelectedId("new"); setView("editor"); };
  const backToList = () => { setView("list"); setSelectedId(null); loadList(); };

  const [appliedDeepLinkId, setAppliedDeepLinkId] = useState<string | null>(null);
  if (initialServiceReportId && initialServiceReportId !== appliedDeepLinkId) {
    setAppliedDeepLinkId(initialServiceReportId);
    setSelectedId(initialServiceReportId);
    setView("editor");
  }
  useEffect(() => {
    if (initialServiceReportId) onServiceReportIdConsumed?.();
  }, [initialServiceReportId, onServiceReportIdConsumed]);

  if (view === "editor" && selectedId) {
    return (
      <>
        <ServiceReportEditor
          key={selectedId}
          serviceReportId={selectedId}
          currentUserId={currentUserId}
          company={company}
          canEdit={canEdit}
          canComplete={canComplete}
          canDelete={canDelete}
          canPrint={canPrint}
          onBack={backToList}
          onCreated={(newId) => setSelectedId(newId)}
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
          <span className="sr-only">{t("service.loading")}</span>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <p className="text-sm text-muted-foreground">{t("service.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("service.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <ServiceList serviceReports={serviceReports} currentUserId={currentUserId} canCreate={canCreate} onOpen={openReport} onCreate={createNew} />
      <Toast message={toast.message} />
    </>
  );
}
