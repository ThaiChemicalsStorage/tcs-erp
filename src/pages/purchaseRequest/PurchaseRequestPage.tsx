import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { type PurchaseRequestSummary, type PurchaseRequestScope, fetchAllPurchaseRequests, createPurchaseRequest, createPurchaseRequestFromProductionOrder, createStandalonePurchaseRequest } from "../../lib/purchaseRequest";
import { PurchaseRequestList } from "./PurchaseRequestList";
import { PurchaseRequestDocument } from "./PurchaseRequestDocument";
import { ProjectItemSourcePickerDialog, ProductionOrderSourcePickerDialog } from "../project/ProjectSourcePickers";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import type { Company } from "../../lib/storage";

// หน้าจัดการใบขอซื้อแบบแยกอิสระ (ไม่ผูกกับหน้าโครงการ — เข้าถึงได้โดยตรง)
// Standalone Purchase Request management page — not nested under Project, same reasoning as
// Material Requisition's own standalone page.
export function PurchaseRequestPage({
  company,
  canRequestProductCode,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canCreate,
  ownerDepartment = "project",
  initialPurchaseRequestId,
  onPurchaseRequestIdConsumed,
}: {
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  /** สิทธิ์ productRequest:create — คุมปุ่ม "ขอรหัสสินค้า" บนบรรทัดที่พิมพ์เอง */
  /** ส่งต่อให้ใบพิมพ์ FM-PU-05 ใช้ทำหัวจดหมายไทย */
  company: Company;
  canRequestProductCode: boolean;
  /** แผนกเจ้าของ — หน้านี้ถูกเมาต์ 3 ครั้ง (โครงการ/ผลิต/จัดซื้อ) และเห็นคนละชุดข้อมูล (2026-08-20, 2026-08-28).
   *  ฝั่งผลิตออกเอกสารจากใบสั่งผลิต ฝั่งโครงการออกจากรายการในโครงการ ส่วน `"all"` คือกล่องงานเข้า
   *  ของฝ่ายจัดซื้อ เห็นใบของทุกฝ่ายและเปิดใบเปล่าเองได้ */
  ownerDepartment?: PurchaseRequestScope;
  initialPurchaseRequestId?: string | null;
  onPurchaseRequestIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const toast = useToast();

  // สร้างใบขอซื้อจากหน้านี้ได้เลย โดยเลือกโครงการและรายการต้นทางเอง (เดิมสร้างได้จากในหน้าโครงการเท่านั้น)
  // ตามคำขอ 2026-08-20; API ยังต้องการทั้ง projectId และ itemId เหมือนเดิมทุกประการ
  // ฝ่ายผลิตออกจากใบสั่งผลิต — ไม่มีรายการในโครงการให้เลือก
  const handleCreateFromProductionOrder = async (productionOrderId: string) => {
    try {
      const created = await createPurchaseRequestFromProductionOrder(productionOrderId);
      setPickerOpen(false);
      openPurchaseRequest(created.id);
    } catch (err) {
      setPickerOpen(false);
      toast.show(err instanceof ApiError ? err.message : t("purchaseRequest.loadError"));
    }
  };

  // ฝ่ายที่ไม่มีเอกสารต้นทาง (และกล่องงานเข้าของจัดซื้อ) เปิดใบเปล่าได้ทันที ไม่ต้องเลือกต้นทาง
  const handleCreateStandalone = async () => {
    try {
      const created = await createStandalonePurchaseRequest();
      openPurchaseRequest(created.id);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("purchaseRequest.loadError"));
    }
  };

  const handleCreate = async (projectId: string, itemId: string) => {
    try {
      const created = await createPurchaseRequest(projectId, itemId);
      setPickerOpen(false);
      openPurchaseRequest(created.id);
    } catch (err) {
      setPickerOpen(false);
      toast.show(err instanceof ApiError ? err.message : t("purchaseRequest.loadError"));
    }
  };

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllPurchaseRequests(ownerDepartment)
      .then((list) => { setPurchaseRequests(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllPurchaseRequests(ownerDepartment)
      .then((list) => { if (!cancelled) { setPurchaseRequests(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ownerDepartment]);

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
          company={company}
          canRequestProductCode={canRequestProductCode}
          currentUserId={currentUserId}
          canEdit={canEdit}
          canFinalize={canFinalize}
          canPrint={canPrint}
          canDelete={canDelete}
          onBack={backToList}
          onDeleted={backToList}
          onOpenOther={openPurchaseRequest}
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

  // มีแค่สองแผนกที่ต้องเลือกเอกสารต้นทางก่อน — ที่เหลือเปิดใบเปล่า
  const needsSourcePicker = ownerDepartment === "project" || ownerDepartment === "production";

  return (
    <>
      <PurchaseRequestList
        purchaseRequests={purchaseRequests}
        currentUserId={currentUserId}
        onOpen={openPurchaseRequest}
        heading={ownerDepartment === "all" ? t("nav.purchasingRequestInbox") : undefined}
        showDepartment={ownerDepartment === "all"}
        headerAction={canCreate ? (
          <button
            onClick={() => (needsSourcePicker ? setPickerOpen(true) : void handleCreateStandalone())}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
          >
            <Plus size={15} /> {t("purchaseRequest.createBtn")}
          </button>
        ) : undefined}
      />
      {pickerOpen && needsSourcePicker && (ownerDepartment === "production" ? (
        <ProductionOrderSourcePickerDialog
          title={t("purchaseRequest.createBtn")}
          onClose={() => setPickerOpen(false)}
          onSelect={(productionOrderId) => void handleCreateFromProductionOrder(productionOrderId)}
        />
      ) : (
        <ProjectItemSourcePickerDialog
          title={t("purchaseRequest.createBtn")}
          description={t("project.picker.project.description")}
          onClose={() => setPickerOpen(false)}
          onSelect={(projectId, itemIds) => void handleCreate(projectId, itemIds[0])}
        />
      ))}
      <Toast message={toast.message} />
    </>
  );
}
