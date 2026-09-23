import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { fetchVendorBills, createVendorBill, type VendorBillSummary } from "../../lib/vendorBill";
import { VendorBillList } from "./VendorBillList";
import { VendorBillDocument } from "./VendorBillDocument";
import { VendorBillCreateDialog } from "./VendorBillCreateDialog";

/**
 * หน้าใบรับวางบิลของสโตร์ (2026-09-23) — สลับรายการ/เอกสาร แบบเดียวกับหน้าใบรับสินค้า
 * สิทธิ์ใช้ชุด `receivingReport:*` (ดู `api/_lib/vendorBillHandler.ts`)
 */
export function VendorBillPage({ canCreate, canEdit, canPrint, canDelete, company, initialVendorBillId, onVendorBillIdConsumed }: {
  canCreate: boolean;
  canEdit: boolean;
  canPrint: boolean;
  canDelete: boolean;
  company: Company;
  initialVendorBillId?: string | null;
  onVendorBillIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<VendorBillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetchVendorBills()
      .then((r) => { setRows(r); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchVendorBills()
      .then((r) => { if (!cancelled) { setRows(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const open = (id: string) => { setSelectedId(id); setView("detail"); };
  const backToList = () => { setView("list"); loadList(); };

  // deep link (ผลค้นหา) — ตั้ง state ตอน render เพื่อไม่ให้เห็นหน้ารายการแวบหนึ่ง
  const [appliedId, setAppliedId] = useState<string | null>(null);
  if (initialVendorBillId && initialVendorBillId !== appliedId) {
    setAppliedId(initialVendorBillId);
    setSelectedId(initialVendorBillId);
    setView("detail");
  }
  useEffect(() => {
    if (initialVendorBillId) onVendorBillIdConsumed?.();
  }, [initialVendorBillId, onVendorBillIdConsumed]);

  const create = async (vendorName: string) => {
    try {
      const created = await createVendorBill(vendorName);
      setCreating(false);
      loadList();
      open(created.vendorBill.id);
      toast.show(t("vendorBill.createdToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("vendorBill.errorSave"));
    }
  };

  if (view === "detail" && selectedId) {
    return (
      <>
        <VendorBillDocument
          key={selectedId}
          vendorBillId={selectedId}
          canEdit={canEdit}
          canPrint={canPrint}
          canDelete={canDelete}
          companyHeader={companyHeader}
          onBack={backToList}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 p-6" role="status" aria-live="polite">
        <span className="sr-only">{t("vendorBill.loading")}</span>
        <div className="h-8 w-56 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("vendorBill.loadError")}</p>
        <button onClick={loadList} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
          {t("vendorBill.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <VendorBillList
        vendorBills={rows}
        onOpen={open}
        headerAction={canCreate ? (
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors">
            <Plus size={14} /> {t("vendorBill.createBtn")}
          </button>
        ) : undefined}
      />
      {creating && <VendorBillCreateDialog onCreate={create} onCancel={() => setCreating(false)} />}
      <Toast message={toast.message} />
    </>
  );
}
