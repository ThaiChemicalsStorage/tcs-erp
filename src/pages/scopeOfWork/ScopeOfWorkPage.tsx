import { useEffect, useState } from "react";
import type { Company } from "../../lib/storage";
import type { User } from "../../lib/users";
import { type ScopeOfWorkListItem, fetchAllScopeOfWorks } from "../../lib/scopeOfWork";
import { ScopeOfWorkList } from "./ScopeOfWorkList";
import { ScopeOfWorkDocument } from "../quotation/ScopeOfWorkDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการ Scope of Work แบบแยกต่างหาก แสดงรายการและรายละเอียดของเอกสารที่มีอยู่แล้ว
// Standalone Scope of Work page managing list/detail view state for existing records.
export function ScopeOfWorkPage({
  company,
  users,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canCreate,
  canChasePo,
  canViewDeliveryOrder,
  canCreateDeliveryOrder,
  onOpenDeliveryOrder,
  canViewProject,
  canCreateProject,
  onOpenProject,
  initialScopeOfWorkId,
  onScopeOfWorkIdConsumed,
}: {
  company: Company;
  users: User[];
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  canChasePo: boolean;
  canViewDeliveryOrder: boolean;
  canCreateDeliveryOrder: boolean;
  onOpenDeliveryOrder: (deliveryOrderId: string) => void;
  canViewProject: boolean;
  canCreateProject: boolean;
  onOpenProject: (projectId: string) => void;
  initialScopeOfWorkId?: string | null;
  onScopeOfWorkIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scopeOfWorks, setScopeOfWorks] = useState<ScopeOfWorkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  // โหลดรายการ Scope of Work ใหม่จากเซิร์ฟเวอร์ (ใช้ตอนกลับมาจากหน้ารายละเอียดด้วย)
  // Reloads the Scope of Work list from the server, also used when returning from detail view.
  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllScopeOfWorks()
      .then((list) => { setScopeOfWorks(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllScopeOfWorks()
      .then((list) => { if (!cancelled) { setScopeOfWorks(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  // เปิดหน้ารายละเอียดของ Scope of Work ตาม id ที่ระบุ
  // Opens the detail view for the given Scope of Work id.
  const openScopeOfWork = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  // กลับไปหน้ารายการและโหลดข้อมูลใหม่
  // Returns to the list view and reloads the data.
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedScopeOfWorkId, setAppliedScopeOfWorkId] = useState<string | null>(null);
  if (initialScopeOfWorkId && initialScopeOfWorkId !== appliedScopeOfWorkId) {
    setAppliedScopeOfWorkId(initialScopeOfWorkId);
    setSelectedId(initialScopeOfWorkId);
    setView("detail");
  }
  useEffect(() => {
    if (initialScopeOfWorkId) onScopeOfWorkIdConsumed?.();
  }, [initialScopeOfWorkId, onScopeOfWorkIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <ScopeOfWorkDocument
          key={selectedId}
          scopeOfWorkId={selectedId}
          company={company}
          users={users}
          currentUserId={currentUserId}
          canEdit={canEdit}
          canFinalize={canFinalize}
          canPrint={canPrint}
          canDelete={canDelete}
          canCreate={canCreate}
          canChasePo={canChasePo}
          canViewDeliveryOrder={canViewDeliveryOrder}
          canCreateDeliveryOrder={canCreateDeliveryOrder}
          onOpenDeliveryOrder={onOpenDeliveryOrder}
          canViewProject={canViewProject}
          canCreateProject={canCreateProject}
          onOpenProject={onOpenProject}
          onBack={backToList}
          backLabel={t("scopeOfWorkDoc.backToList")}
          onDuplicated={(newId) => setSelectedId(newId)}
          onRewritten={(newId) => setSelectedId(newId)}
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
          <span className="sr-only">{t("scopeOfWork.loading")}</span>
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
        <p className="text-sm text-muted-foreground">{t("scopeOfWork.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("scopeOfWork.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <ScopeOfWorkList scopeOfWorks={scopeOfWorks} currentUserId={currentUserId} onOpen={openScopeOfWork} />
      <Toast message={toast.message} />
    </>
  );
}
