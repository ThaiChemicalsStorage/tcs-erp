import { useEffect, useState } from "react";
import type { Company } from "../../lib/storage";
import { type DeliveryOrderListItem, fetchAllDeliveryOrders } from "../../lib/deliveryOrder";
import { DeliveryOrderList } from "./DeliveryOrderList";
import { DeliveryOrderDocument } from "../quotation/DeliveryOrderDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการใบส่งมอบสินค้าแบบแยกอิสระ สลับระหว่างมุมมองรายการและรายละเอียดของแต่ละใบ
// Standalone delivery order management page, switching between the list view and a per-order detail view
export function DeliveryOrderPage({
  company,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canCreate,
  initialDeliveryOrderId,
  onDeliveryOrderIdConsumed,
}: {
  company: Company;
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  initialDeliveryOrderId?: string | null;
  onDeliveryOrderIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllDeliveryOrders()
      .then((list) => { setDeliveryOrders(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllDeliveryOrders()
      .then((list) => { if (!cancelled) { setDeliveryOrders(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openDeliveryOrder = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedDeliveryOrderId, setAppliedDeliveryOrderId] = useState<string | null>(null);
  if (initialDeliveryOrderId && initialDeliveryOrderId !== appliedDeliveryOrderId) {
    setAppliedDeliveryOrderId(initialDeliveryOrderId);
    setSelectedId(initialDeliveryOrderId);
    setView("detail");
  }
  useEffect(() => {
    if (initialDeliveryOrderId) onDeliveryOrderIdConsumed?.();
  }, [initialDeliveryOrderId, onDeliveryOrderIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <DeliveryOrderDocument
          key={selectedId}
          deliveryOrderId={selectedId}
          company={company}
          currentUserId={currentUserId}
          canEdit={canEdit}
          canFinalize={canFinalize}
          canPrint={canPrint}
          canDelete={canDelete}
          canCreate={canCreate}
          onBack={backToList}
          onRewritten={openDeliveryOrder}
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
          <span className="sr-only">{t("deliveryOrder.loading")}</span>
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
        <p className="text-sm text-muted-foreground">{t("deliveryOrder.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("deliveryOrder.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <DeliveryOrderList deliveryOrders={deliveryOrders} currentUserId={currentUserId} onOpen={openDeliveryOrder} />
      <Toast message={toast.message} />
    </>
  );
}
