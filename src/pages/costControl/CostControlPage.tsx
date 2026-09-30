import { useEffect, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { type CostControlSummary, fetchAllCostControls, createBlankCostControl } from "../../lib/costControl";
import type { Company } from "../../lib/storage";
import { CostControlList } from "./CostControlList";
import { CostControlDocument } from "./CostControlDocument";
import { CostControlImportDialog } from "./CostControlImportDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";
import { btn } from "../../components/ui/styles";

/**
 * Cost Control (แผนก BD) — list/detail container.
 *
 * สร้างได้ 2 ทาง: **โยนไฟล์ Excel ของงานเข้ามา** (ทางหลัก — ต้นทุนทั้งใบมาจากใบประเมินราคาที่ทำไว้แล้ว)
 * หรือ **เปิดใบเปล่าแล้วกรอกเอง** เพิ่มตามที่เจ้าของสั่งระหว่างทำ 2026-08-28
 * ("cost control ไม่ต้องโยนไฟล์ก็สร้างเองได้ด้วยดิ") เผื่องานที่ยังไม่มีไฟล์ประเมินราคา
 */
export function CostControlPage({
  canCreate, canEdit, canApprove, canPrint, canDelete, canViewScopeOfWork, company,
  initialCostControlId, onCostControlIdConsumed,
}: {
  canCreate: boolean;
  /** เห็นรายการ Scope of Work ได้ไหม — ตัดสินว่าช่อง "ผูกกับ Scope of Work" จะเลือกได้หรือแค่แสดงผล */
  canViewScopeOfWork: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canPrint: boolean;
  canDelete: boolean;
  company: Company;
  initialCostControlId?: string | null;
  onCostControlIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [costControls, setCostControls] = useState<CostControlSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllCostControls()
      .then((list) => { setCostControls(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllCostControls()
      .then((list) => { if (!cancelled) { setCostControls(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openCostControl = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };

  const handleCreateBlank = async () => {
    setCreating(true);
    try {
      const created = await createBlankCostControl();
      openCostControl(created.id);
    } catch {
      toast.show(t("costControl.loadError"));
    } finally {
      setCreating(false);
    }
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialCostControlId && initialCostControlId !== appliedId) {
    setAppliedId(initialCostControlId);
    setSelectedId(initialCostControlId);
    setView("detail");
  }
  useEffect(() => {
    if (initialCostControlId) onCostControlIdConsumed?.();
  }, [initialCostControlId, onCostControlIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <CostControlDocument
          key={selectedId}
          costControlId={selectedId}
          canEdit={canEdit}
          canApprove={canApprove}
          canPrint={canPrint}
          canDelete={canDelete}
          canCreate={canCreate}
          canViewScopeOfWork={canViewScopeOfWork}
          company={company}
          onBack={backToList}
          onDeleted={backToList}
          onOpenOther={openCostControl}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 px-4 md:px-8 py-6" role="status" aria-live="polite">
        <div className="space-y-3 w-full">
          <span className="sr-only">{t("costControl.loading")}</span>
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
        <p className="text-sm text-muted-foreground">{t("costControl.loadError")}</p>
        <button type="button" onClick={loadList} className={btn.secondary}>
          {t("costControl.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <CostControlList
        costControls={costControls}
        onOpen={openCostControl}
        // "สร้างจากไฟล์ Excel" เป็นปุ่มหลัก — ทางหลักของการสร้างใบนี้ (ดีไซน์ใหม่ 2026-09-30) · ใบเปล่าเป็นปุ่มรอง
        headerAction={canCreate ? (
          <>
            <button type="button" onClick={() => void handleCreateBlank()} disabled={creating} className={btn.secondary}>
              <Plus size={16} /> {t("costControl.createBlankBtn")}
            </button>
            <button type="button" onClick={() => setImportOpen(true)} className={btn.primary}>
              <Upload size={16} /> {t("costControl.createBtn")}
            </button>
          </>
        ) : undefined}
      />
      {importOpen && (
        <CostControlImportDialog
          onClose={() => setImportOpen(false)}
          onCreated={(doc) => { setImportOpen(false); openCostControl(doc.id); }}
        />
      )}
      <Toast message={toast.message} />
    </>
  );
}
