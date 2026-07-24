import { useEffect, useState } from "react";
import { ChevronRight, Printer, Save, CheckCircle2, RotateCw, Trash2, Loader2, AlertTriangle } from "lucide-react";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import {
  type DeliveryOrder, type DeliveryOrderUpdateFields, type DeliveryOrderInstallment,
  fetchDeliveryOrder, updateDeliveryOrder, finalizeDeliveryOrder, refreshDeliveryOrderFromScope, deleteDeliveryOrder,
} from "../../lib/deliveryOrder";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DeliveryOrderPrintDocument } from "./DeliveryOrderPrintDocument";

function toUpdateFields(d: DeliveryOrder): DeliveryOrderUpdateFields {
  return { installments: d.installments };
}

function installmentTitle(inst: DeliveryOrderInstallment): string {
  const pctPart = inst.pct !== null ? `${inst.pct}% ` : "";
  const methodPart = inst.paymentType ? ` (${inst.paymentType}${inst.days !== null ? ` ${inst.days} Days` : ""})` : "";
  return `${pctPart}${inst.label || "งวดชำระเงิน"}${methodPart}`;
}

function InstallmentEditor({ installment, items, onChange, disabled, onPrint }: {
  installment: DeliveryOrderInstallment;
  items: DeliveryOrder["items"];
  onChange: (next: DeliveryOrderInstallment) => void;
  disabled: boolean;
  onPrint: (() => void) | null;
}) {
  const toggleItem = (itemId: string) => {
    if (disabled) return;
    const itemIds = installment.itemIds.includes(itemId)
      ? installment.itemIds.filter((id) => id !== itemId)
      : [...installment.itemIds, itemId];
    onChange({ ...installment, itemIds });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 print:hidden">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
          {installmentTitle(installment)}
        </p>
        {onPrint && (
          <button onClick={onPrint} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all flex-shrink-0">
            <Printer size={13} /> พิมพ์ใบส่งมอบงวดนี้
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">เลขที่</label>
          <input
            disabled={disabled}
            value={installment.documentNumber}
            onChange={(e) => onChange({ ...installment, documentNumber: e.target.value })}
            className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">วันที่</label>
          <input
            disabled={disabled}
            type="date"
            value={installment.issueDate}
            onChange={(e) => onChange({ ...installment, issueDate: e.target.value })}
            className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
          />
        </div>
      </div>

      <label className="text-xs text-muted-foreground block mb-1.5">รายการที่ส่งมอบในงวดนี้</label>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic mb-3">Scope of Work นี้ยังไม่มีรายการสินค้า</p>
      ) : (
        <div className="border border-border/70 rounded-lg divide-y divide-border/60 mb-3">
          {items.map((item) => {
            const checked = installment.itemIds.includes(item.id);
            return (
              <label
                key={item.id}
                className={`flex items-start gap-2.5 px-3 py-2 text-xs ${disabled ? "" : "cursor-pointer hover:bg-secondary/40"} transition-colors`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleItem(item.id)}
                  className="w-3.5 h-3.5 mt-0.5 rounded border-border accent-[#c9a84c] disabled:opacity-60 flex-shrink-0"
                />
                <span className="flex-1">
                  <span className={checked ? "font-medium text-foreground" : "text-muted-foreground"}>{item.name || "(ไม่มีชื่อ)"}</span>
                  <span className="text-muted-foreground font-mono ml-2">{item.quantity ?? "-"} {item.unit}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      <label className="text-xs text-muted-foreground block mb-1">Remark</label>
      <textarea
        disabled={disabled}
        rows={2}
        value={installment.remark}
        onChange={(e) => onChange({ ...installment, remark: e.target.value })}
        className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed disabled:opacity-60"
      />
    </div>
  );
}

export function DeliveryOrderDocument({
  deliveryOrderId,
  company,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  onBack,
  backLabel = "กลับไปรายการใบส่งมอบสินค้า",
  showToast,
}: {
  deliveryOrderId: string;
  company: Company;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  onBack: () => void;
  backLabel?: string;
  showToast: (msg: string) => void;
}) {
  const [deliveryOrder, setDeliveryOrder] = useState<DeliveryOrder | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"finalize" | "refresh" | "delete" | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [printInstallmentId, setPrintInstallmentId] = useState<string | null>(null);

  // Print fires from an effect so the just-set `printInstallmentId` has already committed to the
  // DOM (scoping DeliveryOrderPrintDocument to that one milestone's page) before the dialog opens;
  // the browser's own afterprint event resets it once the dialog closes.
  useEffect(() => {
    if (!printInstallmentId) return;
    const reset = () => setPrintInstallmentId(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [printInstallmentId]);

  useEffect(() => {
    let cancelled = false;
    fetchDeliveryOrder(deliveryOrderId)
      .then((d) => { if (!cancelled) setDeliveryOrder(d); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [deliveryOrderId, reloadKey]);

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={20} className="text-[#e05252]" />
        <p className="text-sm text-muted-foreground">ไม่สามารถโหลดข้อมูลใบส่งมอบสินค้าได้</p>
        <button onClick={() => { setLoadError(false); setReloadKey((k) => k + 1); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
          <RotateCw size={12} /> ลองใหม่
        </button>
      </div>
    );
  }
  if (!deliveryOrder) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-6">
        <Loader2 size={20} className="text-muted-foreground animate-spin" />
        <p className="text-xs text-muted-foreground">กำลังโหลดใบส่งมอบสินค้า...</p>
      </div>
    );
  }

  const isDraft = deliveryOrder.status === "Draft";
  const editable = canEdit && isDraft;

  const updateInstallment = (id: string, next: DeliveryOrderInstallment) => {
    setDeliveryOrder((prev) => (prev ? { ...prev, installments: prev.installments.map((i) => (i.id === id ? next : i)) } : prev));
  };

  const save = async () => {
    if (!deliveryOrder) return;
    try {
      setSaving(true);
      const updated = await updateDeliveryOrder(deliveryOrder.id, toUpdateFields(deliveryOrder));
      setDeliveryOrder(updated);
      showToast("บันทึกร่างแล้ว");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  // Each payment milestone prints as its own independent Delivery Note — only the clicked
  // installment's items/เลขที่/วันที่/Remark ever reach the printed document, never a sibling's.
  const handlePrintInstallment = (installment: DeliveryOrderInstallment) => {
    if (installment.itemIds.length === 0) {
      showToast("กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการในงวดนี้ก่อนพิมพ์");
      return;
    }
    setPrintInstallmentId(installment.id);
  };

  const runConfirmedAction = async () => {
    if (!deliveryOrder || !confirmAction) return;
    try {
      if (confirmAction === "finalize") {
        const updated = await finalizeDeliveryOrder(deliveryOrder.id);
        setDeliveryOrder(updated);
        showToast("ยืนยันสถานะ Final แล้ว");
      } else if (confirmAction === "refresh") {
        setRefreshing(true);
        const updated = await refreshDeliveryOrderFromScope(deliveryOrder.id);
        setDeliveryOrder(updated);
        showToast("อัปเดตข้อมูลจาก Scope of Work แล้ว");
      } else if (confirmAction === "delete") {
        await deleteDeliveryOrder(deliveryOrder.id);
        showToast("ลบใบส่งมอบสินค้าแล้ว");
        onBack();
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setRefreshing(false);
      setConfirmAction(null);
    }
  };

  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: "", taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {backLabel}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-mono font-medium tracking-wide">{deliveryOrder.scopeNumber}</span>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${isDraft ? "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20" : "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20"}`}>
          {isDraft ? "Draft" : "Final"}
        </span>

        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          {editable && (
            <button onClick={() => setConfirmAction("refresh")} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <RotateCw size={13} /> อัปเดตข้อมูลจาก Scope of Work
            </button>
          )}
          {editable && (
            <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
              <Save size={13} /> บันทึกร่าง
            </button>
          )}
          {canFinalize && isDraft && (
            <button onClick={() => setConfirmAction("finalize")} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors">
              <CheckCircle2 size={13} /> ยืนยัน Final
            </button>
          )}
          {canDelete && (
            <button onClick={() => setConfirmAction("delete")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
              <Trash2 size={13} /> ลบ
            </button>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-5 max-w-5xl mx-auto print:p-0 print:max-w-none">
        {/* Header card */}
        <div className="bg-card border border-border rounded-xl overflow-hidden print:hidden">
          <div className="bg-[#0b1d3a] px-4 sm:px-7 py-5">
            <p className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">ใบส่งมอบสินค้าและบริการ</p>
            <p className="text-[#a8bed8] text-xs mt-1">Scope of Work {deliveryOrder.scopeNumber}</p>
          </div>
          <div className="p-6 space-y-2.5">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">เรียน (จากใบเสนอราคา)</label>
              <input readOnly className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none opacity-80" value={deliveryOrder.customerCompanyName} />
            </div>
            {deliveryOrder.customerAddress.trim() && (
              <p className="text-xs text-muted-foreground whitespace-pre-line pl-1">{deliveryOrder.customerAddress}</p>
            )}
            <p className="text-[10px] text-muted-foreground leading-relaxed pt-2">
              ข้อมูลลูกค้าและรายการสินค้าถูกดึงมาจาก Scope of Work นี้โดยอัตโนมัติเมื่อสร้างครั้งแรก
              หาก Scope of Work มีการแก้ไขภายหลัง ใช้ปุ่ม "อัปเดตข้อมูลจาก Scope of Work" เพื่อดึงข้อมูลล่าสุดมาแทนที่
            </p>
          </div>
        </div>

        {deliveryOrder.installments.length === 0 ? (
          <div className="bg-[#e08a3c]/10 border border-[#e08a3c]/30 rounded-xl p-4 flex items-start gap-3 print:hidden">
            <AlertTriangle size={16} className="text-[#e08a3c] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground font-medium">
              Scope of Work นี้ยังไม่มีงวดชำระเงิน — เพิ่มงวดชำระเงินในหน้า Scope of Work ก่อน แล้วกด "อัปเดตข้อมูลจาก Scope of Work"
            </p>
          </div>
        ) : (
          deliveryOrder.installments.map((installment) => (
            <InstallmentEditor
              key={installment.id}
              installment={installment}
              items={deliveryOrder.items}
              onChange={(next) => updateInstallment(installment.id, next)}
              disabled={!editable}
              onPrint={canPrint ? () => handlePrintInstallment(installment) : null}
            />
          ))
        )}

        <DeliveryOrderPrintDocument deliveryOrder={deliveryOrder} companyHeader={companyHeader} onlyInstallmentId={printInstallmentId} />
      </div>

      <ConfirmDialog
        open={confirmAction === "finalize"}
        title="ยืนยันสถานะ Final"
        message="เมื่อยืนยันแล้วใบส่งมอบสินค้านี้จะไม่สามารถแก้ไขได้อีก ยืนยันหรือไม่?"
        confirmLabel="ยืนยัน Final"
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "refresh"}
        title="อัปเดตข้อมูลจาก Scope of Work"
        message="การอัปเดตจะเขียนทับข้อมูลลูกค้าและรายการสินค้าด้วยข้อมูลล่าสุดจาก Scope of Work — รายการที่เลือกไว้ในแต่ละงวด, เลขที่, วันที่ และ Remark จะยังคงอยู่ (ยกเว้นรายการที่ถูกลบไปแล้ว) ยืนยันหรือไม่?"
        confirmLabel="อัปเดตข้อมูล"
        danger
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        title="ลบใบส่งมอบสินค้า"
        message="ยืนยันการลบใบส่งมอบสินค้านี้? รายการนี้จะถูกซ่อนจากหน้ารายการ ปัจจุบันยังไม่มีช่องทางกู้คืนผ่านหน้าจอ"
        confirmLabel="ลบ"
        danger
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
