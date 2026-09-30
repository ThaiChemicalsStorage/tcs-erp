import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { type ProductionOrderSummary, fetchAllProductionOrders, createProductionOrderFromScope } from "../../lib/productionOrder";
import { ProductionOrderList } from "./ProductionOrderList";
import { ProductionOrderDocument } from "./ProductionOrderDocument";
import { ScopeOfWorkSourcePickerDialog } from "../project/ProjectSourcePickers";
import { Toast } from "../../components/Toast";
import { btn } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import type { Company } from "../../lib/storage";

// หน้าจัดการใบสั่งผลิตแบบแยกอิสระ — สร้างจาก Scope of Work ที่อนุมัติแล้วโดยตรง (ไม่ผ่านโครงการ)
export function ProductionOrderPage({
  company, canEdit, canApprove, canPrint, canDelete, canCreate,
  initialProductionOrderId, onProductionOrderIdConsumed,
}: {
  /** ส่งต่อให้ใบพิมพ์ FM-PD-02 ใช้วางโลโก้บนหัวเอกสาร */
  company: Company;
  canEdit: boolean;
  canApprove: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  initialProductionOrderId?: string | null;
  onProductionOrderIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<ProductionOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllProductionOrders()
      .then((list) => { setItems(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllProductionOrders()
      .then((list) => { if (!cancelled) { setItems(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const open = (id: string) => { setSelectedId(id); setView("detail"); };
  const backToList = () => { setView("list"); loadList(); };

  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialProductionOrderId && initialProductionOrderId !== appliedId) {
    setAppliedId(initialProductionOrderId);
    setSelectedId(initialProductionOrderId);
    setView("detail");
  }
  useEffect(() => {
    if (initialProductionOrderId) onProductionOrderIdConsumed?.();
  }, [initialProductionOrderId, onProductionOrderIdConsumed]);

  const createFromScope = async (scopeOfWorkId: string, itemIds?: string[]) => {
    try {
      const created = await createProductionOrderFromScope(scopeOfWorkId, itemIds);
      setPickerOpen(false);
      open(created.id);
    } catch (err) {
      setPickerOpen(false);
      toast.show(err instanceof ApiError ? err.message : t("productionOrder.loadError"));
    }
  };

  if (view === "detail" && selectedId) {
    return (
      <>
        <ProductionOrderDocument
          key={selectedId}
          productionOrderId={selectedId}
          company={company}
          canEdit={canEdit}
          canApprove={canApprove}
          canPrint={canPrint}
          canDelete={canDelete}
          onBack={backToList}
          onDeleted={backToList}
          onOpenOther={open}
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
          <span className="sr-only">{t("productionOrder.loading")}</span>
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" aria-hidden="true" />)}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">{t("productionOrder.loadError")}</p>
        <button type="button" onClick={loadList} className={btn.secondary}>
          {t("productionOrder.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <ProductionOrderList
        productionOrders={items}
        onOpen={open}
        headerAction={canCreate ? (
          <button type="button" onClick={() => setPickerOpen(true)} className={btn.primary}>
            <Plus size={16} /> {t("productionOrder.createBtn")}
          </button>
        ) : undefined}
      />
      {pickerOpen && (
        <ScopeOfWorkSourcePickerDialog
          onClose={() => setPickerOpen(false)}
          onSelect={(scopeOfWorkId, itemIds) => void createFromScope(scopeOfWorkId, itemIds)}
          allowMultiplePerScope
          requireFinalScope={false}
          pickItems
          purpose="productionOrder"
        />
      )}
      <Toast message={toast.message} />
    </>
  );
}
