import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { type ProductionOrderSummary, fetchAllProductionOrders, createProductionOrderFromScope } from "../../lib/productionOrder";
import { ProductionOrderList } from "./ProductionOrderList";
import { ProductionOrderDocument } from "./ProductionOrderDocument";
import { ScopeOfWorkSourcePickerDialog } from "../project/ProjectSourcePickers";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการใบสั่งผลิตแบบแยกอิสระ — สร้างจาก Scope of Work ที่อนุมัติแล้วโดยตรง (ไม่ผ่านโครงการ)
export function ProductionOrderPage({
  canEdit, canApprove, canPrint, canDelete, canCreate,
  initialProductionOrderId, onProductionOrderIdConsumed,
}: {
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
      <div className="flex-1 flex items-center justify-center p-6" role="status" aria-live="polite">
        <div className="space-y-3 w-full max-w-3xl">
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
        <button onClick={loadList} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
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
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
          >
            <Plus size={15} /> {t("productionOrder.createBtn")}
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
        />
      )}
      <Toast message={toast.message} />
    </>
  );
}
