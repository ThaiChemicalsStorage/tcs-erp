import { useEffect, useState } from "react";
import type { Company } from "../../lib/storage";
import { Plus } from "lucide-react";
import { type MaterialRequisitionSummary, fetchAllMaterialRequisitions, createMaterialRequisition, createMaterialRequisitionFromProductionOrder, createBlankMaterialRequisition } from "../../lib/materialRequisition";
import { MaterialRequisitionList } from "./MaterialRequisitionList";
import { MaterialRequisitionDocument } from "./MaterialRequisitionDocument";
import { ProjectItemSourcePickerDialog, ProductionOrderSourcePickerDialog } from "../project/ProjectSourcePickers";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

// หน้าจัดการใบเบิกและใบคืนวัสดุแบบแยกอิสระ (ไม่ผูกกับหน้าโครงการ — พนักงานสโตร์เข้าถึงได้โดยตรง)
// Standalone Material Requisition management page — not nested under Project, so Store staff have
// their own entry point.
export function MaterialRequisitionPage({
  company,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canCreate,
  canIssueStock,
  canRequestProductCode,
  ownerDepartment = "project",
  initialMaterialRequisitionId,
  onMaterialRequisitionIdConsumed,
}: {
  company: Company;
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  /** `stock:adjust` — สโตร์จ่ายของ/รับคืนบนใบที่อนุมัติแล้ว (2026-09-03) แยกจากสิทธิ์แก้ใบ */
  canIssueStock: boolean;
  /** `productRequest:create` — ขอรหัสสินค้าใหม่จากในตัวเลือกสินค้าได้ (2026-09-09) */
  canRequestProductCode: boolean;
  /** แผนกเจ้าของ — หน้านี้ถูกเมาต์ 2 ครั้ง (โครงการ/ผลิต) และเห็นคนละชุดข้อมูล (2026-08-20).
   *  ฝั่งผลิตออกเอกสารจากใบสั่งผลิต ส่วนฝั่งโครงการออกจากรายการในโครงการ */
  ownerDepartment?: "project" | "production";
  initialMaterialRequisitionId?: string | null;
  onMaterialRequisitionIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [materialRequisitions, setMaterialRequisitions] = useState<MaterialRequisitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const toast = useToast();

  /**
   * เปิดใบเปล่า (2026-09-10) — ของที่เบิกไปใช้กับงานซ่อมบำรุงหรืองานภายในไม่มีโครงการและไม่มีใบสั่งผลิต
   * ให้อ้าง กล่องเลือกต้นทางจึงไม่มีอะไรให้เลือก · ใบที่ได้อยู่ในแผนกของเมนูนี้ตามเดิม
   */
  const handleCreateBlank = async () => {
    setCreatingBlank(true);
    try {
      const created = await createBlankMaterialRequisition(ownerDepartment);
      openMaterialRequisition(created.id);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("materialRequisition.loadError"));
    } finally {
      setCreatingBlank(false);
    }
  };

  // สร้างใบเบิก-คืนวัสดุจากหน้านี้ได้เลย โดยเลือกโครงการและรายการต้นทางเอง (เดิมสร้างได้จากในหน้าโครงการ
  // เท่านั้น) — ตามคำขอ 2026-08-20; API ยังต้องการทั้ง projectId และ itemId เหมือนเดิมทุกประการ
  // ฝ่ายผลิตออกจากใบสั่งผลิต — ไม่มีรายการในโครงการให้เลือก
  const handleCreateFromProductionOrder = async (productionOrderId: string) => {
    try {
      const created = await createMaterialRequisitionFromProductionOrder(productionOrderId);
      setPickerOpen(false);
      openMaterialRequisition(created.id);
    } catch (err) {
      setPickerOpen(false);
      toast.show(err instanceof ApiError ? err.message : t("materialRequisition.loadError"));
    }
  };

  const handleCreate = async (projectId: string, itemIds: string[]) => {
    try {
      const created = await createMaterialRequisition(projectId, itemIds);
      setPickerOpen(false);
      openMaterialRequisition(created.id);
    } catch (err) {
      setPickerOpen(false);
      toast.show(err instanceof ApiError ? err.message : t("materialRequisition.loadError"));
    }
  };

  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllMaterialRequisitions(ownerDepartment)
      .then((list) => { setMaterialRequisitions(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllMaterialRequisitions(ownerDepartment)
      .then((list) => { if (!cancelled) { setMaterialRequisitions(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [ownerDepartment]);

  const openMaterialRequisition = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialMaterialRequisitionId && initialMaterialRequisitionId !== appliedId) {
    setAppliedId(initialMaterialRequisitionId);
    setSelectedId(initialMaterialRequisitionId);
    setView("detail");
  }
  useEffect(() => {
    if (initialMaterialRequisitionId) onMaterialRequisitionIdConsumed?.();
  }, [initialMaterialRequisitionId, onMaterialRequisitionIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <MaterialRequisitionDocument
          key={selectedId}
          materialRequisitionId={selectedId}
          company={company}
          currentUserId={currentUserId}
          canEdit={canEdit}
          canFinalize={canFinalize}
          canPrint={canPrint}
          canDelete={canDelete}
          canIssueStock={canIssueStock}
          canRequestProductCode={canRequestProductCode}
          onBack={backToList}
          onDeleted={backToList}
          onOpenOther={openMaterialRequisition}
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
          <span className="sr-only">{t("materialRequisition.loading")}</span>
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
        <p className="text-sm text-muted-foreground">{t("materialRequisition.loadError")}</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          {t("materialRequisition.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <MaterialRequisitionList
        materialRequisitions={materialRequisitions}
        currentUserId={currentUserId}
        onOpen={openMaterialRequisition}
        headerAction={canCreate ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => void handleCreateBlank()}
              disabled={creatingBlank}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60"
            >
              <Plus size={15} /> {t("materialRequisition.createBlankBtn")}
            </button>
            <button
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
            >
              <Plus size={15} /> {t("materialRequisition.createBtn")}
            </button>
          </div>
        ) : undefined}
      />
      {pickerOpen && (ownerDepartment === "production" ? (
        <ProductionOrderSourcePickerDialog
          title={t("materialRequisition.createBtn")}
          onClose={() => setPickerOpen(false)}
          onSelect={(productionOrderId) => void handleCreateFromProductionOrder(productionOrderId)}
        />
      ) : (
        <ProjectItemSourcePickerDialog
          title={t("materialRequisition.createBtn")}
          description={t("project.picker.project.description")}
          onClose={() => setPickerOpen(false)}
          onSelect={(projectId, itemIds) => void handleCreate(projectId, itemIds)}
          multiSelect
        />
      ))}
      <Toast message={toast.message} />
    </>
  );
}
