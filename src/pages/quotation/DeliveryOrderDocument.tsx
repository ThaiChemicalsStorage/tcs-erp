import { useEffect, useState } from "react";
import { ArrowLeft, Printer, Save, CheckCircle2, RotateCw, Trash2, Loader2, AlertTriangle, Send, GitBranch, Undo2, ClipboardList, Building2 } from "lucide-react";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import {
  type DeliveryOrder, type DeliveryOrderUpdateFields, type DeliveryOrderInstallment,
  fetchDeliveryOrderForViewer, updateDeliveryOrder, finalizeDeliveryOrder, refreshDeliveryOrderFromScope, deleteDeliveryOrder,
  updateDeliveryOrderInstallmentNumbers,
  submitDeliveryOrderApproval, rejectDeliveryOrder, withdrawDeliveryOrderApproval, rewriteDeliveryOrder,
  uploadDeliveryOrderAttachment, deleteDeliveryOrderAttachment,
} from "../../lib/deliveryOrder";
import { MAX_ATTACHMENTS_PER_DOCUMENT } from "../../lib/documentAttachments";
import { DocumentAttachmentsCard } from "../../components/DocumentAttachmentsCard";
import { ApiError } from "../../lib/apiClient";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { useI18n } from "../../lib/i18n";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { DocumentHeader, DocumentStepper, DocumentColumns, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { btn, field, surface } from "../../components/ui/styles";
import { ApprovalStatusPill, SourceTag, SourceDocRow, SourceNote, RailSummaryCard, railTextBtn } from "../scopeOfWork/sowDoShared";
import { useApprovalSteps, useApprovalHint } from "../scopeOfWork/sowDoStatus";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { DeliveryOrderPrintDocument } from "./DeliveryOrderPrintDocument";
import { DeliveryOrderDepartmentRouting } from "./DeliveryOrderDepartmentRouting";

function toUpdateFields(d: DeliveryOrder): DeliveryOrderUpdateFields {
  return { installments: d.installments };
}

// การ์ดงวดชำระเงินหนึ่งงวด: เลขที่ วันที่ รายการสินค้าที่ส่งมอบ และ Remark (ดีไซน์ใหม่ 2026-09-30 — วางสองใบเคียงกัน)
// One payment-installment card: document number, date, delivered items, and remark (shown two per row).
function InstallmentCard({ installment, index, total, items, onChange, disabled, numbersDisabled, onPrint }: {
  installment: DeliveryOrderInstallment;
  index: number;
  total: number;
  items: DeliveryOrder["items"];
  onChange: (next: DeliveryOrderInstallment) => void;
  disabled: boolean;
  /**
   * ช่องเลขที่/วันที่ล็อคแยกจากช่องอื่น — สองช่องนี้แก้ได้แม้หลังอนุมัติ (ฝ่ายโครงการขอไว้ 2026-08-27)
   * ส่วนการติ๊กเลือกรายการยังล็อคเหมือนเดิม เพราะเป็นเนื้อหาของเอกสารที่อนุมัติไปแล้ว
   */
  numbersDisabled: boolean;
  onPrint: (() => void) | null;
}) {
  const { t } = useI18n();
  // สลับว่ารายการสินค้าใดถูกรวมอยู่ในงวดนี้
  // Toggles whether an item is included in this installment.
  const toggleItem = (itemId: string) => {
    if (disabled) return;
    const itemIds = installment.itemIds.includes(itemId)
      ? installment.itemIds.filter((id) => id !== itemId)
      : [...installment.itemIds, itemId];
    onChange({ ...installment, itemIds });
  };

  const pctPart = installment.pct !== null ? `${installment.pct}% ` : "";
  const methodPart = installment.paymentType ? ` (${installment.paymentType}${installment.days !== null ? ` ${installment.days} Days` : ""})` : "";
  const title = `${pctPart}${installment.label || t("deliveryOrderDoc.installmentFallback")}${methodPart}`;
  const pickedCount = items.filter((it) => installment.itemIds.includes(it.id)).length;

  const documentNumberId = `do-installment-${installment.id}-documentNumber`;
  const issueDateId = `do-installment-${installment.id}-issueDate`;
  const itemsHeadingId = `do-installment-${installment.id}-items`;
  const remarkId = `do-installment-${installment.id}-remark`;

  return (
    <section className={`${surface.card} min-w-0`}>
      <div className={surface.cardHead}>
        <div className="flex-1 min-w-0 flex flex-col leading-snug">
          <span className="text-xs text-muted-foreground">{t("deliveryOrderDoc.installmentOf").replace("{n}", String(index + 1)).replace("{total}", String(total))}</span>
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        </div>
        {onPrint && (
          <button type="button" data-tour={index === 0 ? "dodoc-print-installment" : undefined} onClick={onPrint} className={`${btn.secondarySm} flex-shrink-0`}>
            <Printer size={15} /> {t("deliveryOrderDoc.printInstallment")}
          </button>
        )}
      </div>
      <div className="px-6 pt-5 pb-6 flex flex-col gap-[18px]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("deliveryOrderDoc.documentNumber")} htmlFor={documentNumberId}>
            <input
              id={documentNumberId}
              disabled={numbersDisabled}
              value={installment.documentNumber}
              onChange={(e) => onChange({ ...installment, documentNumber: e.target.value })}
              className={`${field.input} w-full font-mono`}
            />
          </Field>
          <Field label={t("deliveryOrderDoc.issueDate")} htmlFor={issueDateId}>
            <input
              id={issueDateId}
              disabled={numbersDisabled}
              type="date"
              value={installment.issueDate}
              onChange={(e) => onChange({ ...installment, issueDate: e.target.value })}
              className={`${field.input} w-full`}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span id={itemsHeadingId} className={`${field.label} flex-1`}>{t("deliveryOrderDoc.itemsInInstallment")}</span>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground">{t("deliveryOrderDoc.pickedCount").replace("{n}", String(pickedCount)).replace("{total}", String(items.length))}</span>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("deliveryOrderDoc.noItems")}</p>
          ) : (
            <div role="group" aria-labelledby={itemsHeadingId} className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[28px_minmax(0,1fr)_96px] gap-2 items-center px-3 h-9 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]">
                <span />
                <span>{t("deliveryOrderDoc.colItem")}</span>
                <span className="text-right">{t("deliveryOrderDoc.colQty")}</span>
              </div>
              {items.map((item) => {
                const checked = installment.itemIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`grid grid-cols-[28px_minmax(0,1fr)_96px] gap-2 items-center px-3 min-h-11 py-1.5 border-b border-[#eef1f6] last:border-b-0 transition-colors ${disabled ? "" : "cursor-pointer hover:bg-[#f8f9fc]"}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleItem(item.id)}
                      className="w-4 h-4 m-0 accent-[#1a5fb4]"
                    />
                    <span className={`text-sm truncate ${checked ? "font-medium text-foreground" : "text-muted-foreground"}`} title={item.name}>{item.name || t("deliveryOrderDoc.unnamedItem")}</span>
                    <span className={`text-sm text-right tabular-nums ${checked ? "text-foreground" : "text-[#8a97ad]"}`}>{item.quantity ?? "-"} {item.unit}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <Field label={t("deliveryOrderDoc.remark")} htmlFor={remarkId}>
          <textarea
            id={remarkId}
            disabled={disabled}
            rows={2}
            value={installment.remark}
            onChange={(e) => onChange({ ...installment, remark: e.target.value })}
            className={`${field.textarea} w-full resize-y`}
          />
        </Field>
      </div>
    </section>
  );
}

// หน้าเอกสารใบส่งมอบสินค้า: ดู แก้ไข ส่งขออนุมัติ อนุมัติ ปฏิเสธ สร้างฉบับใหม่ และพิมพ์ตามงวดชำระเงิน
// Delivery order document page: view, edit, submit/approve/reject, rewrite, and print per installment.
export function DeliveryOrderDocument({
  deliveryOrderId,
  company,
  currentUserId,
  canEdit: canEditRole,
  canFinalize: canFinalizeRole,
  canPrint,
  canDelete: canDeleteRole,
  canCreate: canCreateRole,
  onBack,
  onRewritten,
  backLabel,
  showToast,
}: {
  deliveryOrderId: string;
  company: Company;
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  onBack: () => void;
  onRewritten: (newId: string) => void;
  backLabel?: string;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const resolvedBackLabel = backLabel ?? t("deliveryOrderDoc.backToList");
  const [deliveryOrder, setDeliveryOrder] = useState<DeliveryOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"submit" | "finalize" | "withdraw" | "rewrite" | "refresh" | "delete" | null>(null);
  const [actionRunning, setActionRunning] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [printInstallmentId, setPrintInstallmentId] = useState<string | null>(null);
  const [rejectPromptOpen, setRejectPromptOpen] = useState(false);

  useEffect(() => {
    if (!printInstallmentId) return;
    const reset = () => setPrintInstallmentId(null);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [printInstallmentId]);

  // ── การ์ด "ยังไม่ได้บันทึก" (2026-08-25) — ประกาศเหนือ effect โหลดข้อมูล เพื่อตั้งฐานเทียบใหม่ทุกครั้งที่ดึงเอกสาร
  // หน้านี้ใช้ state เดียวเป็นทั้งข้อมูลที่โหลดมาและบัฟเฟอร์แก้ไข ทุกจุดที่รับคำตอบจากเซิร์ฟเวอร์จึงต้องตั้งฐานเทียบใหม่
  // ตั้งแต่ 2026-08-27 ช่องเลขที่/วันที่ของงวดแก้ได้แม้เอกสารพ้นสถานะร่างไปแล้ว ตัวจับ "ยังไม่บันทึก" จึงต้อง
  // ทำงานทุกสถานะ ไม่ใช่เฉพาะร่าง — ไม่งั้นแก้เลขที่แล้วเปลี่ยนหน้า ข้อมูลหายเงียบ ๆ โดยไม่มีอะไรเตือน
  // ผู้รับจากการส่งถึงแผนกดู/พิมพ์ได้อย่างเดียว แม้บทบาทจะมีสิทธิ์แก้ (เซิร์ฟเวอร์กันอยู่แล้ว — ที่นี่ซ่อนปุ่ม, 2026-10-06)
  const [recipientOnly, setRecipientOnly] = useState(false);
  const canEdit = canEditRole && !recipientOnly;
  const canFinalize = canFinalizeRole && !recipientOnly;
  const canDelete = canDeleteRole && !recipientOnly;
  const canCreate = canCreateRole && !recipientOnly;
  const dirty = useDirtyTracker(deliveryOrder && canEdit ? toUpdateFields(deliveryOrder) : null);

  useEffect(() => {
    let cancelled = false;
    fetchDeliveryOrderForViewer(deliveryOrderId)
      .then(({ deliveryOrder: d, recipientOnly: ro }) => { if (!cancelled) { setRecipientOnly(ro); setDeliveryOrder(d); dirty.markSaved(toUpdateFields(d)); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "");
      });
    return () => { cancelled = true; };
  }, [deliveryOrderId, reloadKey, dirty]);

  const docTourSteps: TourStep[] = [
    { element: '[data-tour="dodoc-submit"]', manual: "ch9-4", popover: { title: t("tour.dodoc.submit.title"), description: t("tour.dodoc.submit.desc"), side: "bottom" } },
    { element: '[data-tour="dodoc-more"]', manual: "ch9-4", popover: { title: t("tour.dodoc.more.title"), description: t("tour.dodoc.more.desc"), side: "bottom" } },
    { element: '[data-tour="dodoc-routing"]', manual: "ch9-3", popover: { title: t("tour.dodoc.routing.title"), description: t("tour.dodoc.routing.desc"), side: "top" } },
    { element: '[data-tour="dodoc-installments"]', manual: "ch9-1", popover: { title: t("tour.dodoc.installments.title"), description: t("tour.dodoc.installments.desc"), side: "top" } },
    { element: '[data-tour="dodoc-print-installment"]', manual: "ch9-2", popover: { title: t("tour.dodoc.print.title"), description: t("tour.dodoc.print.desc"), side: "bottom" } },
  ];
  const docTour = useModuleTour("deliveryOrderDoc", currentUserId, docTourSteps, {
    autoStart: !!deliveryOrder && deliveryOrder.installments.length > 0,
  });

  // ── บันทึกอัตโนมัติ (2026-08-25) — hook ต้องอยู่ก่อน early return ทุกอันด้านล่าง ────────────────
  // Auto-save. Unlike the doc + draft editors, this screen keeps a single `deliveryOrder` state that
  // is both the loaded record and the edit buffer — so the background save deliberately does NOT
  // write the server's response back into it: doing so would overwrite whatever the user has typed
  // since the request went out. See src/hooks/useAutoSave.ts.
  const autoSaveEditable = !!deliveryOrder && canEdit && deliveryOrder.status === "Draft";
  const autoSavePayload = deliveryOrder && autoSaveEditable ? toUpdateFields(deliveryOrder) : null;
  const draftBackup = useDraftBackup({
    storageKey: `deliveryOrder:${deliveryOrderId}`,
    data: autoSavePayload,
    enabled: autoSaveEditable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: autoSaveEditable,
    onSave: async (fields) => { await updateDeliveryOrder(deliveryOrderId, fields, { autoSave: true }); },
  });

  const steps = useApprovalSteps(deliveryOrder?.status ?? "Draft");
  const nextStepHint = useApprovalHint({ status: deliveryOrder?.status ?? "Draft", approverLabel: t("deliveryOrderDoc.approverLabel") });

  // บันทึกใบส่งมอบสินค้าฉบับร่างไปยังเซิร์ฟเวอร์
  // Saves the draft delivery order to the server.
  const save = async (): Promise<boolean> => {
    if (!deliveryOrder) return false;
    try {
      setSaving(true);
      const updated = await updateDeliveryOrder(deliveryOrder.id, toUpdateFields(deliveryOrder));
      setDeliveryOrder(updated);
      // ตั้งฐานเทียบของ auto-save ใหม่เป็น "สิ่งที่เซิร์ฟเวอร์ตอบกลับมา" ซึ่งคือสิ่งที่ฟอร์มถืออยู่หลังบรรทัดบน
      // ไม่ใช่ค่าบนจอตอนเรียก ซึ่งอาจเก่าหรือใหม่กว่าที่ส่งขึ้นไปจริง
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("sowdo.toast.savedDraft"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("sowdo.toast.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * บันทึกเฉพาะเลขที่/วันที่ของทุกงวด — ใช้ตอนเอกสารพ้นสถานะร่างไปแล้ว ที่ `save()` ปกติใช้ไม่ได้
   * (`PATCH` ล็อคที่ Draft) — ยิงไปที่ route แยก ซึ่งเขียนเฉพาะสองช่องนี้และบันทึก audit ทุกครั้ง
   */
  const saveNumbers = async (): Promise<boolean> => {
    if (!deliveryOrder) return false;
    try {
      setSaving(true);
      const updated = await updateDeliveryOrderInstallmentNumbers(
        deliveryOrder.id,
        deliveryOrder.installments.map((i) => ({ id: i.id, documentNumber: i.documentNumber, issueDate: i.issueDate })),
      );
      setDeliveryOrder(updated);
      dirty.markSaved(toUpdateFields(updated));
      showToast(t("deliveryOrderDoc.toast.numbersSaved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("sowdo.toast.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  // การ์ด "ยังไม่ได้บันทึก" — save() ต้องประกาศเหนือ early return เพราะ hook เรียกแบบมีเงื่อนไขไม่ได้
  const { requestLeave } = useUnsavedChangesGuard(
    deliveryOrder && canEdit
      ? {
          getRisk: () => assessUnsavedRisk({
            isDirty: dirty.isDirtyNow(),
            hasServerRecord: true,
            autoSaveEnabled: autoSaveEditable,
            autoSaveState: autoSave.state,
          }),
          documentLabel: deliveryOrder.id,
          // เอกสารที่พ้นร่างแล้วบันทึกผ่าน route เลขที่/วันที่เท่านั้น — `save()` ปกติจะโดน 400 (PATCH ล็อคที่ Draft)
          save: deliveryOrder.status === "Draft" ? save : saveNumbers,
          discard: draftBackup.clear,
        }
      : null,
  );

  if (loadError !== null || !deliveryOrder) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="bg-card border-b border-border px-4 md:px-8 py-3.5">
          <button type="button" onClick={() => requestLeave(onBack)} className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <ArrowLeft size={14} /> {resolvedBackLabel}
          </button>
        </div>
        {loadError !== null ? (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-center" role="alert">
            <AlertTriangle size={20} className="text-[#b93636]" />
            <p className="text-sm text-muted-foreground">{loadError || t("deliveryOrder.loadError")}</p>
            <button type="button" onClick={() => { setLoadError(null); setReloadKey((k) => k + 1); }} className={btn.secondary}>
              <RotateCw size={15} /> {t("deliveryOrder.retry")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2.5 p-10" role="status">
            <Loader2 size={20} className="text-muted-foreground animate-spin" />
            <p className="text-[13px] text-muted-foreground">{t("deliveryOrder.loading")}</p>
          </div>
        )}
      </div>
    );
  }

  const isDraft = deliveryOrder.status === "Draft";
  const editable = canEdit && isDraft;
  const pendingApproval = deliveryOrder.status === "PendingApproval";

  // แทนที่ข้อมูลงวดชำระเงินหนึ่งงวดในรายการงวดทั้งหมด
  // Replaces one installment's data within the full installments list.
  const updateInstallment = (id: string, next: DeliveryOrderInstallment) => {
    setDeliveryOrder((prev) => (prev ? { ...prev, installments: prev.installments.map((i) => (i.id === id ? next : i)) } : prev));
  };

  // เตรียมพิมพ์ใบส่งมอบสินค้าเฉพาะงวดที่เลือก โดยต้องมีรายการสินค้าอย่างน้อย 1 รายการ
  // Prepares to print the delivery note for one installment; requires at least one selected item.
  const handlePrintInstallment = (installment: DeliveryOrderInstallment) => {
    if (installment.itemIds.length === 0) {
      showToast(t("deliveryOrderDoc.toast.printNeedsItem"));
      return;
    }
    setPrintInstallmentId(installment.id);
  };

  // ปฏิเสธการอนุมัติพร้อมเหตุผล แล้วตีกลับใบส่งมอบสินค้าเป็นฉบับร่าง
  // Rejects the approval with a comment, sending the delivery order back to draft.
  const confirmReject = async (comment: string) => {
    if (!deliveryOrder) return;
    setRejectPromptOpen(false);
    try {
      const updated = await rejectDeliveryOrder(deliveryOrder.id, comment);
      setDeliveryOrder(updated);
      dirty.markSaved(toUpdateFields(updated));
      showToast(t("sowdo.toast.rejected"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("sowdo.toast.rejectFailed"));
    }
  };

  // ดำเนินการตามคำสั่งที่ผู้ใช้ยืนยันในไดอะล็อก (ส่งขออนุมัติ, อนุมัติ, ถอนคำขอ, สร้างฉบับใหม่, อัปเดตข้อมูล, ลบ)
  // Runs the action the user confirmed in the dialog (submit, finalize, withdraw, rewrite, refresh, or delete).
  const runConfirmedAction = async () => {
    if (!deliveryOrder || !confirmAction || actionRunning) return;
    setActionRunning(true);
    try {
      if (confirmAction === "submit") {
        const updated = await submitDeliveryOrderApproval(deliveryOrder.id);
        setDeliveryOrder(updated);
        dirty.markSaved(toUpdateFields(updated));
        showToast(t("sowdo.toast.submitted"));
      } else if (confirmAction === "finalize") {
        const updated = await finalizeDeliveryOrder(deliveryOrder.id);
        setDeliveryOrder(updated);
        dirty.markSaved(toUpdateFields(updated));
        showToast(t("sowdo.toast.finalized"));
      } else if (confirmAction === "withdraw") {
        const updated = await withdrawDeliveryOrderApproval(deliveryOrder.id);
        setDeliveryOrder(updated);
        dirty.markSaved(toUpdateFields(updated));
        showToast(t("sowdo.toast.withdrawn"));
      } else if (confirmAction === "rewrite") {
        const created = await rewriteDeliveryOrder(deliveryOrder.id);
        showToast(t("deliveryOrderDoc.toast.rewritten"));
        onRewritten(created.id);
      } else if (confirmAction === "refresh") {
        setRefreshing(true);
        const updated = await refreshDeliveryOrderFromScope(deliveryOrder.id);
        setDeliveryOrder(updated);
        dirty.markSaved(toUpdateFields(updated));
        showToast(t("deliveryOrderDoc.toast.refreshed"));
      } else if (confirmAction === "delete") {
        await deleteDeliveryOrder(deliveryOrder.id);
        showToast(t("deliveryOrderDoc.toast.deleted"));
        onBack();
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("sowdo.toast.actionFailed"));
    } finally {
      setRefreshing(false);
      setConfirmAction(null);
      setActionRunning(false);
    }
  };

  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const installmentCount = deliveryOrder.installments.length;
  const attachmentCount = (deliveryOrder.attachments ?? []).length;

  return (
    <div className="doc-form flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      <div className="sticky top-0 z-20 print:hidden">
        <DocumentHeader
          backLabel={resolvedBackLabel}
          onBack={() => requestLeave(onBack)}
          number={deliveryOrder.scopeNumber || "—"}
          status={<ApprovalStatusPill status={deliveryOrder.status} />}
          meta={autoSaveEditable ? <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} /> : undefined}
          actions={
            <div data-tour="dodoc-actions" className="flex items-center gap-2.5 flex-wrap">
              <TourReplayButton variant="title" onClick={docTour.start} />
              {editable && (
                <button type="button" onClick={save} disabled={saving} className={btn.secondary}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("deliveryOrderDoc.saveDraft")}
                </button>
              )}
              {canEdit && !isDraft && (
                <button type="button" onClick={saveNumbers} disabled={saving} className={btn.secondary}>
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("deliveryOrderDoc.saveNumbers")}
                </button>
              )}
              {/* ห่อไว้ให้คำแนะนำชี้ปุ่ม "เพิ่มเติม" ได้ — แสดงเฉพาะเมื่อมีคำสั่งในเมนู (ไม่งั้น MoreMenu ไม่วาดปุ่มเลย) */}
              {(editable || canEdit || canCreate || canDelete) && (
              <span data-tour="dodoc-more" className="inline-flex">
              <MoreMenu
                items={[
                  editable && { key: "refresh", label: t("deliveryOrderDoc.refreshFromScope"), icon: RotateCw, hint: t("deliveryOrderDoc.refreshMenuHint").replace("{number}", deliveryOrder.scopeNumber), disabled: refreshing, onSelect: () => setConfirmAction("refresh") },
                  canEdit && { key: "withdraw", label: t("deliveryOrderDoc.withdraw"), icon: Undo2, disabled: !pendingApproval, hint: pendingApproval ? undefined : t("deliveryOrderDoc.withdrawHint"), onSelect: () => setConfirmAction("withdraw") },
                  canCreate && { key: "rewrite", label: t("deliveryOrderDoc.rewrite"), icon: GitBranch, disabled: deliveryOrder.status !== "Final", hint: deliveryOrder.status === "Final" ? undefined : t("deliveryOrderDoc.rewriteHint"), onSelect: () => setConfirmAction("rewrite") },
                  canDelete && { key: "delete", label: t("deliveryOrderDoc.confirmDelete.title"), icon: Trash2, danger: true, onSelect: () => setConfirmAction("delete") },
                ]}
              />
              </span>
              )}
              {pendingApproval && canFinalize && (
                <>
                  <button type="button" onClick={() => setRejectPromptOpen(true)} className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5b8b8] bg-white text-[#b93636] text-sm font-medium hover:bg-[#fcebeb] transition-colors whitespace-nowrap">
                    {t("deliveryOrderDoc.reject")}
                  </button>
                  <button type="button" onClick={() => setConfirmAction("finalize")} className={btn.primary}>
                    <CheckCircle2 size={16} /> {t("deliveryOrderDoc.approve")}
                  </button>
                </>
              )}
              {canEdit && isDraft && (
                <button type="button" data-tour="dodoc-submit" onClick={() => setConfirmAction("submit")} className={btn.primary}>
                  <Send size={16} /> {t("deliveryOrderDoc.submit")}
                </button>
              )}
            </div>
          }
        />
      </div>

      <div className="px-4 md:px-8 py-6 print:p-0">
        <div className="flex flex-col gap-5 print:hidden">
          {draftBackup.recovered && draftBackup.recoveredAt !== null && (
            <DraftRecoveryBanner
              savedAt={draftBackup.recoveredAt}
              onRestore={() => {
                const recovered = draftBackup.recovered!;
                setDeliveryOrder((prev) => (prev ? { ...prev, ...recovered } : prev));
                draftBackup.clear();
                showToast(t("common.draftRecovery.restoredToast"));
              }}
              onDiscard={draftBackup.dismiss}
            />
          )}

          <DocumentStepper steps={steps.steps} current={steps.current} ariaLabel={t("sowdo.stepsAria")} />

          <DocumentColumns
            main={
              <>
                <SectionCard title={t("deliveryOrderDoc.customerTitle")} actions={<SourceTag icon={ClipboardList}>{t("sowdo.fromScope")}</SourceTag>}>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={18} /></span>
                      <ReadonlyField label={t("deliveryOrderDoc.customerTo")} value={deliveryOrder.customerCompanyName} />
                    </div>
                    {deliveryOrder.customerAddress.trim() && (
                      <ReadonlyField label={t("deliveryOrderDoc.address")} value={<span className="whitespace-pre-line">{deliveryOrder.customerAddress}</span>} />
                    )}
                  </div>
                </SectionCard>

                {/* ส่งเอกสารถึงแผนก — ไม่ผูกกับล็อก Draft เพราะเซลล์มักส่งต่อหลังเอกสารอนุมัติแล้ว */}
                <div data-tour="dodoc-routing">
                  <DeliveryOrderDepartmentRouting
                    deliveryOrder={deliveryOrder}
                    canEdit={canEdit}
                    onUpdated={(updated) => { setDeliveryOrder(updated); dirty.markSaved(toUpdateFields(updated)); }}
                    showToast={showToast}
                  />
                </div>

                {/* ไฟล์แนบ — เจ้าของสั่ง 2026-09-03 ให้แนบใบส่งของที่ลูกค้าเซ็นกลับมาได้ "เหมือนกับ cost control"
                    ไม่ล็อคตามสถานะเอกสาร แต่ล็อคตามสิทธิ์แก้ เพราะใบเซ็นกลับมักมาหลังเอกสารอนุมัติแล้ว */}
                <DocumentAttachmentsCard
                  attachments={deliveryOrder.attachments ?? []}
                  disabled={!canEdit}
                  onUpload={async (file) => {
                    const updated = await uploadDeliveryOrderAttachment(deliveryOrder.id, file);
                    // รับกลับมาเฉพาะ `attachments` ไม่เขียนทับทั้งก้อน — งวดชำระเงินที่กำลังพิมพ์ค้างอยู่บนจอ
                    // (ยังไม่บันทึก) จะหายทันทีถ้าแทนที่ทั้งเอกสารด้วยฉบับจากเซิร์ฟเวอร์
                    setDeliveryOrder((prev) => (prev ? { ...prev, attachments: updated.attachments } : updated));
                  }}
                  onDelete={async (attachmentId) => {
                    const updated = await deleteDeliveryOrderAttachment(deliveryOrder.id, attachmentId);
                    setDeliveryOrder((prev) => (prev ? { ...prev, attachments: updated.attachments } : updated));
                  }}
                />
              </>
            }
            rail={
              <>
                <RailSummaryCard
                  label={t("deliveryOrderDoc.installmentCountLabel")}
                  value={t("deliveryOrderDoc.installmentCountValue").replace("{n}", String(installmentCount))}
                  rows={[
                    { label: t("deliveryOrderDoc.railItems"), value: t("ui.itemCount").replace("{n}", String(deliveryOrder.items.length)) },
                    { label: t("deliveryOrderDoc.railAttachments"), value: `${attachmentCount} / ${MAX_ATTACHMENTS_PER_DOCUMENT}` },
                  ]}
                />

                <RailCard title={t("sowdo.sourceTitle")}>
                  <SourceDocRow icon={ClipboardList} kind="Scope of Work" number={deliveryOrder.scopeNumber || "—"} />
                  <SourceNote
                    action={editable ? (
                      <button type="button" onClick={() => setConfirmAction("refresh")} disabled={refreshing} className={railTextBtn}>
                        <RotateCw size={14} /> {t("deliveryOrderDoc.refreshFromScope")}
                      </button>
                    ) : undefined}
                  >
                    {t("deliveryOrderDoc.sourceNote")}
                  </SourceNote>
                </RailCard>

                {recipientOnly && <NextStepHint title={t("doc.recipientOnly.title")}>{t("deliveryOrderDoc.recipientOnly")}</NextStepHint>}
                <NextStepHint title={t("sowdo.nextStep")}>{nextStepHint}</NextStepHint>
              </>
            }
          />

          <div data-tour={installmentCount > 0 ? "dodoc-installments" : undefined}>
            {installmentCount === 0 ? (
              <div className="rounded-xl bg-[#fdf3e0] border border-[#f1d8a3] px-4 py-3.5 flex items-start gap-3">
                <AlertTriangle size={18} className="text-[#8a5a00] flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-foreground">{t("deliveryOrderDoc.noInstallments")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {deliveryOrder.installments.map((installment, index) => (
                  <InstallmentCard
                    key={installment.id}
                    installment={installment}
                    index={index}
                    total={installmentCount}
                    items={deliveryOrder.items}
                    onChange={(next) => updateInstallment(installment.id, next)}
                    disabled={!editable}
                    numbersDisabled={!canEdit}
                    onPrint={canPrint ? () => handlePrintInstallment(installment) : null}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <DeliveryOrderPrintDocument deliveryOrder={deliveryOrder} companyHeader={companyHeader} onlyInstallmentId={printInstallmentId} />
      </div>

      <ConfirmDialog
        open={confirmAction === "submit"}
        title={t("deliveryOrderDoc.confirmSubmit.title")}
        message={t("deliveryOrderDoc.confirmSubmit.message")}
        confirmLabel={t("deliveryOrderDoc.submit")}
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "withdraw"}
        title={t("deliveryOrderDoc.confirmWithdraw.title")}
        message={t("deliveryOrderDoc.confirmWithdraw.message")}
        confirmLabel={t("deliveryOrderDoc.withdraw")}
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "rewrite"}
        title={t("deliveryOrderDoc.confirmRewrite.title")}
        message={t("deliveryOrderDoc.confirmRewrite.message")}
        confirmLabel={t("deliveryOrderDoc.confirmRewrite.title")}
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "finalize"}
        title={t("deliveryOrderDoc.confirmFinalize.title")}
        message={t("deliveryOrderDoc.confirmFinalize.message")}
        confirmLabel={t("deliveryOrderDoc.approve")}
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "refresh"}
        title={t("deliveryOrderDoc.refreshFromScope")}
        message={t("deliveryOrderDoc.confirmRefresh.message")}
        confirmLabel={t("deliveryOrderDoc.confirmRefresh.confirmLabel")}
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "delete"}
        title={t("deliveryOrderDoc.confirmDelete.title")}
        message={t("deliveryOrderDoc.confirmDelete.message")}
        confirmLabel={t("deliveryOrderDoc.delete")}
        danger
        busy={actionRunning}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
      <PromptDialog
        open={rejectPromptOpen}
        title={t("deliveryOrderDoc.promptReject.title")}
        message={t("deliveryOrderDoc.promptReject.message")}
        label={t("deliveryOrderDoc.promptReject.label")}
        placeholder={t("deliveryOrderDoc.promptReject.placeholder")}
        confirmLabel={t("deliveryOrderDoc.promptReject.confirmLabel")}
        requiredMessage={t("deliveryOrderDoc.promptReject.requiredMessage")}
        multiline
        onConfirm={confirmReject}
        onCancel={() => setRejectPromptOpen(false)}
      />
    </div>
  );
}
