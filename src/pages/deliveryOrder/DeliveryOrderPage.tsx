import { useEffect, useState } from "react";
import type { Company } from "../../lib/storage";
import { type DeliveryOrderListItem, fetchAllDeliveryOrders } from "../../lib/deliveryOrder";
import { DeliveryOrderList } from "./DeliveryOrderList";
import { DeliveryOrderDocument } from "../quotation/DeliveryOrderDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

/**
 * Standalone Delivery Order management page (added 2026-07-23, per direct user request "ให้ทำหน้า
 * แยกตรง side bar ออกมาด้วยเหมือนกับพวก scope of work กับ ใบเสนอราคา") — same "list page owns list↔
 * detail view state, detail component is keyed by id" pattern ScopeOfWorkPage.tsx already uses. A
 * Delivery Order is still only ever *created* from the "สร้างใบส่งมอบสินค้า" button on
 * ScopeOfWorkDocument.tsx's toolbar — this page is purely for browsing/opening ones that already
 * exist, plus editing/printing/finalizing/deleting them.
 */
export function DeliveryOrderPage({
  company,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  initialDeliveryOrderId,
  onDeliveryOrderIdConsumed,
}: {
  company: Company;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  /** Set when navigated here from ScopeOfWorkDocument.tsx's "สร้าง/เปิดใบส่งมอบสินค้า" button — same
   * "adjust state during rendering" pattern as ScopeOfWorkPage.tsx's `initialScopeOfWorkId`. */
  initialDeliveryOrderId?: string | null;
  onDeliveryOrderIdConsumed?: () => void;
}) {
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
          canEdit={canEdit}
          canFinalize={canFinalize}
          canPrint={canPrint}
          canDelete={canDelete}
          onBack={backToList}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="space-y-3 w-full max-w-3xl">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">ไม่สามารถโหลดข้อมูลใบส่งมอบสินค้าได้</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <>
      <DeliveryOrderList deliveryOrders={deliveryOrders} onOpen={openDeliveryOrder} />
      <Toast message={toast.message} />
    </>
  );
}
