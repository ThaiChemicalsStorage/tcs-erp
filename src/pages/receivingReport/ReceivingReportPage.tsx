import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import {
  fetchAllReceivingReports, createReceivingReport, createBlankReceivingReport, fetchReceivingReportsByPurchaseOrder,
  type ReceivingReportSummary, type ReceivingReportCode,
} from "../../lib/receivingReport";
import { ReceivingReportList } from "./ReceivingReportList";
import { ReceivingReportDocument } from "./ReceivingReportDocument";
import { ReceivingReportCreateDialog } from "./ReceivingReportCreateDialog";

/**
 * หน้าใบรับสินค้า (แผนกสโตร์) — สลับระหว่างรายการกับเอกสาร ตามแพตเทิร์นเดียวกับใบสั่งซื้อ
 * รับ deep link จากผลค้นหา/ปุ่ม "รับสินค้า" บนใบสั่งซื้อ ผ่าน `initialReceivingReportId`
 */
export function ReceivingReportPage({
  canCreate, canEdit, canReceive, canPrint, canDelete, company,
  initialReceivingReportId, onReceivingReportIdConsumed,
}: {
  canCreate: boolean;
  canEdit: boolean;
  canReceive: boolean;
  canPrint: boolean;
  canDelete: boolean;
  company: Company;
  initialReceivingReportId?: string | null;
  onReceivingReportIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  // หัวจดหมายของใบพิมพ์ — ประกอบจากโปรไฟล์บริษัทที่ App โหลดไว้แล้ว แบบเดียวกับหน้าเครื่องมือ
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReceivingReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetchAllReceivingReports()
      .then((r) => { setRows(r); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAllReceivingReports()
      .then((r) => { if (!cancelled) { setRows(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const open = (id: string) => { setSelectedId(id); setView("detail"); };
  const backToList = () => { setView("list"); loadList(); };

  // deep link — อัปเดต state ตอน render ไม่ใช่ใน effect เพื่อไม่ให้เห็นหน้ารายการแวบหนึ่งก่อน
  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialReceivingReportId && initialReceivingReportId !== appliedId) {
    setAppliedId(initialReceivingReportId);
    setSelectedId(initialReceivingReportId);
    setView("detail");
  }
  useEffect(() => {
    if (initialReceivingReportId) onReceivingReportIdConsumed?.();
  }, [initialReceivingReportId, onReceivingReportIdConsumed]);

  const createFrom = async (receiveCode: ReceivingReportCode, purchaseOrderId: string | null) => {
    try {
      const created = purchaseOrderId
        ? await createReceivingReport(purchaseOrderId, receiveCode)
        : await createBlankReceivingReport(receiveCode);
      setPickerOpen(false);
      loadList();
      open(created.id);
      toast.show(t("receivingReport.createdToast"));
    } catch (err) {
      // 409 = ใบสั่งซื้อนี้มีใบรับสินค้าอยู่แล้ว (เพื่อนเพิ่งเปิดไปหนึ่งจังหวะก่อน) — พาไปเปิดใบเดิม
      // แทนที่จะเป็นทางตัน กติกา 1 ใบสั่งซื้อ = 1 ใบรับสินค้า บังคับที่ฐานข้อมูล ไม่ใช่ที่รายการในกล่องเลือก
      if (purchaseOrderId && err instanceof ApiError && err.status === 409) {
        const existing = await fetchReceivingReportsByPurchaseOrder(purchaseOrderId).catch(() => []);
        if (existing[0]) {
          setPickerOpen(false);
          open(existing[0].id);
          toast.show(t("receivingReport.existingOpenedToast"));
          return;
        }
      }
      toast.show(err instanceof ApiError ? err.message : t("receivingReportDoc.errorSave"));
    }
  };

  if (view === "detail" && selectedId) {
    return (
      <>
        <ReceivingReportDocument
          key={selectedId}
          receivingReportId={selectedId}
          canEdit={canEdit}
          canReceive={canReceive}
          canPrint={canPrint}
          canDelete={canDelete}
          companyHeader={companyHeader}
          onBack={backToList}
          onDeleted={backToList}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 p-6" role="status" aria-live="polite">
        <span className="sr-only">{t("receivingReport.loading")}</span>
        <div className="h-8 w-56 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("receivingReport.loadError")}</p>
        <button onClick={loadList} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
          {t("receivingReport.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <ReceivingReportList
        receivingReports={rows}
        onOpen={open}
        headerAction={canCreate ? (
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors"
          >
            <Plus size={14} /> {t("receivingReport.createBtn")}
          </button>
        ) : undefined}
      />
      {pickerOpen && (
        <ReceivingReportCreateDialog
          onCancel={() => setPickerOpen(false)}
          onCreate={createFrom}
        />
      )}
      <Toast message={toast.message} />
    </>
  );
}
