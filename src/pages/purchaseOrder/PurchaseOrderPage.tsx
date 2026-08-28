import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { fetchAllPurchaseOrders, createPurchaseOrder, type PurchaseOrderSummary } from "../../lib/purchaseOrder";
import { PurchaseOrderList } from "./PurchaseOrderList";
import { PurchaseOrderDocument } from "./PurchaseOrderDocument";
import { PurchaseRequestPickerDialog } from "./PurchaseRequestPickerDialog";

/**
 * หน้าใบสั่งซื้อ (ฝ่ายจัดซื้อ) — สลับระหว่างรายการกับเอกสาร ตามแพตเทิร์นเดียวกับใบสั่งผลิต
 * รับ deep link จากผลค้นหา/กระดิ่งผ่าน `initialPurchaseOrderId` / `onPurchaseOrderIdConsumed`
 */
export function PurchaseOrderPage({
  canCreate, canEdit, canApprove, canPrint, canDelete, canViewPurchaseRequest,
  initialPurchaseOrderId, onPurchaseOrderIdConsumed,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canPrint: boolean;
  canDelete: boolean;
  /** ต้องมีสิทธิ์ดูใบขอซื้อจึงจะเลือกใบต้นทางได้ — เซิร์ฟเวอร์บังคับซ้ำอีกชั้น */
  canViewPurchaseRequest: boolean;
  initialPurchaseOrderId?: string | null;
  onPurchaseOrderIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<PurchaseOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetchAllPurchaseOrders()
      .then((r) => { setRows(r); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAllPurchaseOrders()
      .then((r) => { if (!cancelled) { setRows(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const open = (id: string) => { setSelectedId(id); setView("detail"); };
  const backToList = () => { setView("list"); loadList(); };

  // deep link — อัปเดต state ตอน render (ไม่ใช่ใน effect) เพื่อให้หน้าเอกสารขึ้นตั้งแต่เฟรมแรก
  // ไม่งั้นจะเห็นหน้ารายการแวบหนึ่งก่อน `applied` กันไม่ให้ดึงกลับเข้าเอกสารซ้ำหลังผู้ใช้กดย้อนกลับเอง
  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialPurchaseOrderId && initialPurchaseOrderId !== appliedId) {
    setAppliedId(initialPurchaseOrderId);
    setSelectedId(initialPurchaseOrderId);
    setView("detail");
  }
  useEffect(() => {
    if (initialPurchaseOrderId) onPurchaseOrderIdConsumed?.();
  }, [initialPurchaseOrderId, onPurchaseOrderIdConsumed]);

  const createFrom = async (purchaseRequestId?: string) => {
    try {
      const created = await createPurchaseOrder(purchaseRequestId);
      setPickerOpen(false);
      loadList();
      open(created.id);
      toast.show(t("purchaseOrder.createdToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
    }
  };

  if (view === "detail" && selectedId) {
    return (
      <>
        <PurchaseOrderDocument
          key={selectedId}
          purchaseOrderId={selectedId}
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
      <div className="flex-1 p-6" role="status" aria-live="polite">
        <span className="sr-only">{t("purchaseOrder.loading")}</span>
        <div className="h-8 w-56 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("purchaseOrder.loadError")}</p>
        <button onClick={loadList} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
          {t("purchaseOrder.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <PurchaseOrderList
        purchaseOrders={rows}
        onOpen={open}
        headerAction={canCreate ? (
          <button
            onClick={() => (canViewPurchaseRequest ? setPickerOpen(true) : void createFrom())}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors"
          >
            <Plus size={14} /> {t("purchaseOrder.createBtn")}
          </button>
        ) : undefined}
      />
      {pickerOpen && (
        <PurchaseRequestPickerDialog
          onCancel={() => setPickerOpen(false)}
          onPick={(prId) => void createFrom(prId)}
          onBlank={() => void createFrom()}
        />
      )}
      <Toast message={toast.message} />
    </>
  );
}
