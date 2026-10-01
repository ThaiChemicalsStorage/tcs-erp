import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { type PurchaseRequestSummary, type PurchaseRequestScope, fetchAllPurchaseRequests, createPurchaseRequest, createPurchaseRequestFromProductionOrder, createStandalonePurchaseRequest, type PurchaseRequestCode } from "../../lib/purchaseRequest";
import { PurchaseRequestCodeDialog } from "./PurchaseRequestCodeDialog";
import { PurchaseRequestList } from "./PurchaseRequestList";
import { PurchaseRequestDocument } from "./PurchaseRequestDocument";
import { ProjectItemSourcePickerDialog, ProductionOrderSourcePickerDialog } from "../project/ProjectSourcePickers";
import { Toast } from "../../components/Toast";
import { btn } from "../../components/ui/styles";
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
  canIssueStock,
  canEditApproved,
  canCreatePurchaseOrder,
  onOpenPurchaseOrder,
  ownerDepartment = "project",
  storeStage,
  initialPurchaseRequestId,
  onPurchaseRequestIdConsumed,
}: {
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  /** `stock:adjust` — การ์ด "สโตร์เช็คของ / จ่ายของ" บนใบที่อนุมัติแล้ว (2026-09-09) */
  canIssueStock: boolean;
  /** `purchaseRequest:editApproved` — ฝ่ายจัดซื้อแก้ใบที่อนุมัติแล้วได้ (2026-09-09) */
  canEditApproved: boolean;
  /** `purchaseOrder:create` — การ์ด "ออกใบสั่งซื้อ" บนใบขอซื้อที่ผ่านจัดซื้อแล้ว (2026-09-21) */
  canCreatePurchaseOrder: boolean;
  /** พาไปเปิดใบสั่งซื้อที่เพิ่งสร้างจากใบขอซื้อ */
  onOpenPurchaseOrder?: (purchaseOrderId: string) => void;
  /**
   * กล่องงานเข้าตามขั้นของสโตร์ (2026-09-09) — `"pending"` คือกล่องของสโตร์ (อนุมัติแล้วรอเช็คของ)
   * `"forwarded"` คือกล่องของจัดซื้อ · ไม่ระบุ = เห็นทุกใบตามปกติ
   */
  storeStage?: "pending" | "forwarded";
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
  // เลือกรหัสฝ่ายก่อนสร้าง (2026-09-23) — รหัสอยู่หน้าเลขที่ใบ จึงต้องรู้ตั้งแต่ตอนสร้าง
  const [codePickerOpen, setCodePickerOpen] = useState(false);
  const handleCreateStandalone = async (code: PurchaseRequestCode) => {
    try {
      const created = await createStandalonePurchaseRequest(code);
      setCodePickerOpen(false);
      openPurchaseRequest(created.id);
    } catch (err) {
      setCodePickerOpen(false);
      toast.show(err instanceof ApiError ? err.message : t("purchaseRequest.loadError"));
    }
  };

  const handleCreate = async (projectId: string, itemIds: string[]) => {
    try {
      const created = await createPurchaseRequest(projectId, itemIds);
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
    fetchAllPurchaseRequests(ownerDepartment, storeStage)
      .then((list) => { setPurchaseRequests(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllPurchaseRequests(ownerDepartment, storeStage)
      .then((list) => { if (!cancelled) { setPurchaseRequests(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ownerDepartment, storeStage]);

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
          canIssueStock={canIssueStock}
          canEditApproved={canEditApproved}
          canCreatePurchaseOrder={canCreatePurchaseOrder}
          onOpenPurchaseOrder={onOpenPurchaseOrder}
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
      <div className="flex-1 px-4 md:px-8 py-6" role="status" aria-live="polite">
        <div className="space-y-3 w-full">
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
        <button type="button" onClick={loadList} className={btn.secondary}>
          {t("purchaseRequest.retry")}
        </button>
      </div>
    );
  }

  // มีแค่สองแผนกที่ต้องเลือกเอกสารต้นทางก่อน — ที่เหลือเปิดใบเปล่า
  const needsSourcePicker = ownerDepartment === "project" || ownerDepartment === "production";
  // ชื่อกลุ่มเมนูเหนือชื่อหน้า — หน้านี้ถูกเมาต์หลายที่ (โครงการ / ผลิต / สโตร์เปิดเอง / กล่องงานเข้าของจัดซื้อและสโตร์)
  const moduleLabel = ownerDepartment === "all" ? t("nav.group.purchasing")
    : ownerDepartment === "production" ? t("nav.group.production")
    : ownerDepartment === "general" ? t("nav.group.inventory")
    : t("nav.group.project");

  return (
    <>
      <PurchaseRequestList
        purchaseRequests={purchaseRequests}
        currentUserId={currentUserId}
        onOpen={openPurchaseRequest}
        moduleLabel={moduleLabel}
        heading={storeStage === "pending" ? t("nav.storeRequestInbox") : ownerDepartment === "all" ? t("nav.purchasingRequestInbox") : undefined}
        showDepartment={ownerDepartment === "all"}
        // กล่องงานเข้าของจัดซื้อ = แท็บขั้นของใบ · กล่องของสโตร์กรองมาจากเซิร์ฟเวอร์แล้ว (storeStage="pending") จึงไม่มีแท็บ
        tabs={ownerDepartment !== "all" ? "status" : storeStage === undefined ? "stage" : "none"}
        headerAction={canCreate ? (
          <button
            type="button"
            onClick={() => (needsSourcePicker ? setPickerOpen(true) : setCodePickerOpen(true))}
            data-tour="pr-create"
            className={btn.primary}
          >
            <Plus size={16} /> {t("purchaseRequest.createBtn")}
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
          onSelect={(projectId, itemIds) => void handleCreate(projectId, itemIds)}
          multiSelect
          // โครงการที่ออกเอกสารครบทุกรายการแล้วต้องยังเปิดใบขอซื้อใหม่ได้ (2026-09-21) — ดูคอมเมนต์
          // ใน handleCreate() ของ purchaseRequestHandler.ts สำหรับเหตุผลเต็ม
          allowNoItems
        />
      ))}
      {codePickerOpen && (
        <PurchaseRequestCodeDialog onCreate={handleCreateStandalone} onCancel={() => setCodePickerOpen(false)} />
      )}
      <Toast message={toast.message} />
    </>
  );
}
