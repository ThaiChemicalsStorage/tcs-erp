import { useEffect, useState, type ReactNode } from "react";
import {
  Plus, PackageCheck, Printer, Save, Trash2, X, GitBranch, Loader2, Undo2, Ban, Send, CheckCircle2, XCircle, Lock,
  Info, Store, ArrowRight, ChevronDown, AlertTriangle,
} from "lucide-react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AutoSaveIndicator } from "../../components/AutoSaveIndicator";
import { DraftRecoveryBanner } from "../../components/DraftRecoveryBanner";
import { DocumentHeader, DocumentStepper, DocumentColumns, RailTotalCard, RailCard, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { Field, ReadonlyField, SelectBox } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field, table } from "../../components/ui/styles";
import { useAutoSave, useDraftBackup } from "../../hooks/useAutoSave";
import { useDirtyTracker } from "../../hooks/useDirtyTracker";
import { useUnsavedChangesGuard } from "../../hooks/useNavigationGuard";
import { assessUnsavedRisk } from "../../lib/unsavedChanges";
import { ApiError } from "../../lib/apiClient";
import { newId } from "../../lib/products";
import { fmt, formatQuoteDateThai } from "../../lib/quotes";
import { getRevisionRoot } from "../../lib/revisionDiff";
import { type CodeEntry, fetchCodeEntries, codeComboboxOptions } from "../../lib/codeRegister";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { useUserDirectory } from "../../lib/userDirectory";
import { Combobox } from "../../components/Combobox";
import { type Vendor, fetchVendors, vendorComboboxOptions } from "../../lib/vendors";
import { purchaseOrderTotals, purchaseOrderLineTotal } from "../../lib/purchaseOrder";
import {
  type PurchaseOrder, type PurchaseOrderLine, type PurchaseOrderUpdateFields, blankPurchaseOrderLine,
  fetchPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, rewritePurchaseOrder, revertPurchaseOrderApproval, logPurchaseOrderPrinted,
  submitPurchaseOrderApproval, approvePurchaseOrder, rejectPurchaseOrder, withdrawPurchaseOrderApproval,
} from "../../lib/purchaseOrder";
import type { DiscountMode } from "../../lib/purchaseOrder";
import { PurchaseOrderPrintDocument } from "./PurchaseOrderPrintDocument";
import { createReceivingReport, fetchReceivingReportsByPurchaseOrder, type ReceivingReportCode } from "../../lib/receivingReport";
import { ReceiveCodeDialog } from "../receivingReport/ReceivingReportCreateDialog";
import { useKitRecipes } from "../../hooks/useKitRecipes";
import { DialogSummary, PurchaseOrderStatusPill, ReasonDialog } from "./purchasingUi";
import { useApprovalCommands } from "./purchasingHooks";

/** payload เดียวที่ใช้ทั้งกดบันทึกเอง บันทึกอัตโนมัติ ตรวจงานค้าง และเก็บร่างในเครื่อง */
function toUpdateFields(d: PurchaseOrder): PurchaseOrderUpdateFields {
  return {
    documentNumber: d.documentNumber,
    jobCode: d.jobCode,
    // ผูกกับทะเบียนผู้ขาย (2026-09-21) — เซิร์ฟเวอร์ตรวจว่ามีจริง และใช้เป็นด่านตอนอนุมัติ
    vendorId: d.vendorId,
    intendedApproverUserId: d.intendedApproverUserId,
    vendorName: d.vendorName,
    vendorContact: d.vendorContact,
    vendorPhone: d.vendorPhone,
    vendorTaxId: d.vendorTaxId,
    vendorAddress: d.vendorAddress,
    vendorQuotationRef: d.vendorQuotationRef,
    orderDate: d.orderDate,
    neededByDate: d.neededByDate,
    creditDays: d.creditDays,
    shippingMethod: d.shippingMethod,
    deliveryLocation: d.deliveryLocation,
    lines: d.lines,
    vatRate: d.vatRate,
    discount: d.discount,
    discountMode: d.discountMode,
    remarks: d.remarks,
    orderedBy: d.orderedBy,
    approvedBy: d.approvedBy,
    revisionNote: d.revisionNote,
  };
}

/**
 * หน้าเอกสารใบสั่งซื้อ — ดีไซน์ใหม่ 2026-09-30 (แบบ QuoteDocument)
 *
 * แถบหัวสีขาว: "← ใบสั่งซื้อทั้งหมด" · เลขที่ + ป้ายสถานะ + สถานะบันทึก · ขวา [พิมพ์][เพิ่มเติม ▾][บันทึก][ปุ่มหลัก]
 * ปุ่มหลักเปลี่ยนตามขั้น: ร่าง = ส่งขออนุมัติ · รออนุมัติ = อนุมัติ (คนที่อนุมัติได้) · อนุมัติแล้ว = รับสินค้า
 * คำสั่งที่ใช้ไม่บ่อย (ถอนการอนุมัติ / แก้ไข (Rewrite) / ลบ) อยู่ในเมนู "เพิ่มเติม"
 * ใบที่ไม่ใช่ร่าง (หรือผู้ใช้ไม่มีสิทธิ์แก้) แสดงแบบอ่านอย่างเดียว ไม่มีกล่องช่องกรอก
 */
export function PurchaseOrderDocument({
  purchaseOrderId, currentUserId, canEdit, canApprove, canPrint, canDelete, canReceiveGoods, onBack, onDeleted, onOpenOther,
  onOpenReceivingReport, showToast,
}: {
  purchaseOrderId: string;
  currentUserId: string;
  canEdit: boolean;
  canApprove: boolean;
  canPrint: boolean;
  canDelete: boolean;
  /** เปิด/สร้างใบรับสินค้าจากใบนี้ได้ — ต้องมีสิทธิ์ทั้งสร้างใบรับสินค้าและมีที่ให้ไปเปิด */
  canReceiveGoods: boolean;
  onBack: () => void;
  onDeleted: () => void;
  onOpenOther: (id: string) => void;
  onOpenReceivingReport: (receivingReportId: string) => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  // สินค้าชุด (2026-09-29) รับเข้าเป็นชุดไม่ได้ — เตือนตั้งแต่บรรทัด ให้สั่งซื้อ/รับเข้าเป็นชิ้นส่วน
  const kits = useKitRecipes();
  /**
   * รายชื่อผู้อนุมัติที่เลือกได้ (2026-09-21) — เอาผู้ใช้ที่ยัง active ทั้งหมด **ไม่กรองด้วยสิทธิ์**
   * ฝั่งหน้าจอ เพราะหน้านี้ไม่มีตารางบทบาทอยู่ในมือ และเจ้าของเลือกไว้แล้วว่าการเลือกคนไม่ใช่การ
   * ล็อกสิทธิ์ — เซิร์ฟเวอร์ตรวจอีกชั้นว่าเป็นผู้ใช้จริงและยังไม่ถูกปิดบัญชี
   */
  const { users: directoryUsers, byId } = useUserDirectory();
  const approverOptions = directoryUsers.filter((u) => u.status === "active");
  const [doc, setDoc] = useState<PurchaseOrder | null>(null);
  const [draft, setDraft] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmRewrite, setConfirmRewrite] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  /** ถอนการอนุมัติ (2026-09-21) — ใบกลับเป็นร่าง เลขที่เดิม */
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [reverting, setReverting] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveCodeOpen, setReceiveCodeOpen] = useState(false);
  // ทะเบียนผู้ขาย — ดึงในหน้านี้เอง แบบเดียวกับที่ใบสั่งงานดึงรายชื่อแผนก (fetchDepartments)
  // GET /vendors เปิดให้คนที่มี purchaseOrder:view อ่านได้ ไม่ต้องมีสิทธิ์ดูแลทะเบียน
  const [vendors, setVendors] = useState<Vendor[]>([]);
  // ทะเบียนรหัสแผนก/บัญชี — ตัวช่วยเติมเหมือนกัน โหลดล้มก็ยังพิมพ์รหัสเองได้
  const [codeEntries, setCodeEntries] = useState<CodeEntry[]>([]);

  // hooks ทุกตัวต้องประกาศเหนือ early return — กฎของ React
  const dirty = useDirtyTracker(draft && canEdit ? toUpdateFields(draft) : null);

  // ไม่ต้อง setLoading(true) ตรงนี้ — `loading` เริ่มเป็น true อยู่แล้ว และหน้านี้ถูก remount ด้วย
  // `key={selectedId}` ทุกครั้งที่เปลี่ยนเอกสาร การเรียก setState ตรง ๆ ใน effect จะทำให้ render ซ้อน
  useEffect(() => {
    let cancelled = false;
    fetchPurchaseOrder(purchaseOrderId)
      .then((d) => {
        if (cancelled) return;
        setDoc(d); setDraft(d); setLoading(false);
        dirty.markSaved(toUpdateFields(d));
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [purchaseOrderId, dirty]);

  // ทะเบียนผู้ขายเป็นแค่ตัวช่วยเติมข้อมูล — โหลดล้มก็ปล่อยว่าง ผู้ใช้ยังพิมพ์ชื่อผู้ขายเองได้ตามปกติ
  useEffect(() => {
    let cancelled = false;
    fetchVendors()
      .then((list) => { if (!cancelled) setVendors(list); })
      .catch(() => { if (!cancelled) setVendors([]); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCodeEntries().then((codes) => { if (!cancelled) setCodeEntries(codes); }).catch(() => { /* เติมรหัสให้ไม่ได้ ก็พิมพ์เองได้ */ });
    return () => { cancelled = true; };
  }, []);

  const editable = !!draft && canEdit && draft.status === "Draft";
  // เลขที่เป็นฟิลด์บังคับ — ระหว่างที่ผู้ใช้ลบทิ้งเพื่อพิมพ์ใหม่ บันทึกอัตโนมัติจะยิงพอดีแล้วโดน 400
  // เติมกลับเป็น id เสมอ (แบบเดียวกับใบสั่งผลิต) ผู้ใช้ยังพิมพ์ต่อได้โดยไม่เห็นสถานะแดงกะพริบ
  const autoSavePayload: PurchaseOrderUpdateFields | null = draft && editable
    ? { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id }
    : null;

  const draftBackup = useDraftBackup({
    storageKey: draft ? `purchaseOrder:${draft.id}` : null,
    data: autoSavePayload,
    enabled: editable,
  });
  const autoSave = useAutoSave({
    data: autoSavePayload,
    enabled: editable,
    onSave: async (fields) => {
      if (!draft) return;
      // อัปเดตแค่ `doc` ไม่แตะ `draft` เพราะผู้ใช้อาจกำลังพิมพ์อยู่
      const updated = await updatePurchaseOrder(draft.id, fields, { autoSave: true });
      setDoc(updated);
      /**
       * ข้อยกเว้นเดียวของกฎ "ไม่แตะ draft": `vendorId` เป็นค่าที่**เซิร์ฟเวอร์จับคู่ให้เอง**จากชื่อที่พิมพ์
       * (ดู `resolveVendorLink()`) ไม่ใช่ช่องที่ผู้ใช้พิมพ์อยู่ จึงไม่มีอะไรให้ทับ · ถ้าไม่ซิงก์กลับ
       * คำเตือน "ชื่อนี้ยังไม่ตรงกับผู้ขายในทะเบียน" จะค้างอยู่บนจอทั้งที่ผูกให้เรียบร้อยแล้ว
       * และผู้ใช้จะไปเลือกซ้ำโดยไม่จำเป็น
       */
      if (updated.vendorId !== draft.vendorId) {
        const synced = { ...draft, vendorId: updated.vendorId };
        setDraft(synced);
        // ตั้ง baseline ของตัวติดตาม "ยังไม่ได้บันทึก" ใหม่ ไม่งั้นการซิงก์ครั้งนี้จะถูกนับเป็น
        // "ผู้ใช้แก้เอง" แล้วกล่องเตือนจะเด้งตอนออกจากหน้าทั้งที่ไม่มีอะไรค้างจริง
        //
        // ตัว auto-save เองจะยิงอีกหนึ่งรอบ (payload เปลี่ยน) แล้วจบ เพราะรอบนั้นเซิร์ฟเวอร์คืนค่าเดิม
        // ปล่อยให้เป็นแบบนั้นดีกว่าอ้างถึง `autoSave` ในคอนฟิกของตัวมันเอง ซึ่งเป็นความฉลาดที่พังทีหลังง่าย
        dirty.markSaved(toUpdateFields(synced));
      }
    },
  });

  /**
   * ขั้นอนุมัติ — ตรรกะเดียวกับ `DocumentApprovalActions` เดิม แต่ปุ่มวางเองบนแถบหัว (ดู `useApprovalCommands`)
   * ต้อง markSaved ด้วย ไม่งั้นการอนุมัติ (ซึ่งเปลี่ยนเอกสารฝั่งเซิร์ฟเวอร์) จะทำให้ตัวจับการแก้ไขค้างว่า
   * "ยังไม่บันทึก" แล้วเด้งกล่องเตือนตอนออกจากหน้า ทั้งที่ไม่มีอะไรค้าง
   */
  const approval = useApprovalCommands<PurchaseOrder>({
    onSubmit: () => submitPurchaseOrderApproval(purchaseOrderId),
    onApprove: () => approvePurchaseOrder(purchaseOrderId),
    onReject: (comment) => rejectPurchaseOrder(purchaseOrderId, comment),
    onWithdraw: () => withdrawPurchaseOrderApproval(purchaseOrderId),
    onUpdated: (d) => { setDoc(d); setDraft(d); dirty.markSaved(toUpdateFields(d)); },
    showToast,
  });

  /** ถอนการอนุมัติ — ใบกลับเป็นร่าง เลขที่เดิม (ต่างจาก Rewrite ที่ออกเลขใหม่) */
  const handleRevert = async () => {
    if (!doc) return;
    setReverting(true);
    try {
      const next = await revertPurchaseOrderApproval(doc.id, revertReason.trim());
      setDoc(next);
      setDraft(next);
      dirty.markSaved(toUpdateFields(next));
      setConfirmRevert(false);
      showToast(t("purchaseOrderDoc.revertedToast"));
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
    } finally { setReverting(false); }
  };

  /** คืน true เมื่อบันทึกสำเร็จ — กล่อง "ยังไม่ได้บันทึก" ใช้ค่านี้ตัดสินว่าจะออกจากหน้าได้ไหม
   *  ถ้าบันทึกไม่ผ่าน ต้องค้างอยู่หน้าเดิมให้ผู้ใช้แก้ ไม่ใช่ออกไปแล้วงานหาย */
  const save = async (): Promise<boolean> => {
    if (!draft) return false;
    setSaving(true);
    try {
      const updated = await updatePurchaseOrder(draft.id, { ...toUpdateFields(draft), documentNumber: draft.documentNumber.trim() || draft.id });
      setDoc(updated); setDraft(updated);
      autoSave.markSaved(toUpdateFields(updated));
      dirty.markSaved(toUpdateFields(updated));
      draftBackup.clear();
      showToast(t("purchaseOrderDoc.saved"));
      return true;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * เปิดใบรับสินค้าของใบสั่งซื้อนี้ — มีอยู่แล้วก็เปิดใบเดิม ยังไม่มีก็สร้างใหม่
   *
   * เช็คก่อนสร้างเพราะกติกาคือ 1 ใบสั่งซื้อ = 1 ใบรับสินค้า (บังคับที่ฐานข้อมูล) ถ้ายิงสร้างเลย
   * ทุกครั้ง ครั้งที่สองจะได้ 409 ซึ่งผู้ใช้อ่านแล้วไม่รู้จะทำอะไรต่อ
   */
  const openReceivingReport = async () => {
    if (!draft) return;
    setReceiving(true);
    try {
      const existing = await fetchReceivingReportsByPurchaseOrder(draft.id);
      // มีใบอยู่แล้วเปิดเลย ยังไม่มีต้องเลือกรหัสรับเข้าก่อน (2026-09-23) เพราะรหัสอยู่หน้าเลขที่ใบ
      if (existing[0]) onOpenReceivingReport(existing[0].id);
      else setReceiveCodeOpen(true);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
    } finally {
      setReceiving(false);
    }
  };
  const createReceivingReportWithCode = async (code: ReceivingReportCode) => {
    if (!draft) return;
    try {
      const created = await createReceivingReport(draft.id, code);
      setReceiveCodeOpen(false);
      onOpenReceivingReport(created.id);
    } catch (err) {
      setReceiveCodeOpen(false);
      showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
    }
  };
  useUnsavedChangesGuard(
    draft && canEdit
      ? {
        getRisk: () => assessUnsavedRisk({
          isDirty: dirty.isDirtyNow(), hasServerRecord: true,
          autoSaveEnabled: editable, autoSaveState: autoSave.state,
        }),
        documentLabel: draft.documentNumber || draft.id,
        save,
        discard: draftBackup.clear,
      }
      : null,
  );

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  // ช่อง "ส่งให้ใครอนุมัติ" มีเฉพาะใบร่าง และเมนูเพิ่มเติมว่างได้ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง · hook อยู่เหนือ early return
  const docTourSteps: TourStep[] = [
    { element: '[data-tour="purdoc-actions"]', manual: "ch18-11", popover: { title: t("tour.purdoc.actions.title"), description: t("tour.purdoc.actions.desc"), side: "bottom" } },
    { element: '[data-tour="purdoc-more"]', manual: "ch18-7", popover: { title: t("tour.purdoc.more.title"), description: t("tour.purdoc.more.desc"), side: "bottom" } },
    { element: '[data-tour="purdoc-vendor"]', manual: "ch18-6", popover: { title: t("tour.purdoc.vendor.title"), description: t("tour.purdoc.vendor.desc"), side: "top" } },
    { element: '[data-tour="purdoc-approver"]', manual: "ch18-7", popover: { title: t("tour.purdoc.approver.title"), description: t("tour.purdoc.approver.desc"), side: "left" } },
    { element: '[data-tour="purdoc-lines"]', manual: "ch18-8", popover: { title: t("tour.purdoc.lines.title"), description: t("tour.purdoc.lines.desc"), side: "top" } },
  ];
  const docTour = useModuleTour("purchaseOrderDoc", currentUserId, docTourSteps, { autoStart: !!doc });

  if (loading) {
    return (
      <div className="flex-1 px-4 md:px-8 py-6" role="status" aria-live="polite">
        <span className="sr-only">{t("purchaseOrder.loading")}</span>
        <div className="h-8 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }
  if (loadError || !draft || !doc) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{t("purchaseOrder.loadError")}</p>
        <button type="button" onClick={onBack} className={btn.secondary}>{t("purchaseOrderDoc.backToList")}</button>
      </div>
    );
  }

  const set = <K extends keyof PurchaseOrder>(key: K, value: PurchaseOrder[K]) => setDraft((p) => (p ? { ...p, [key]: value } : p));
  const setLine = (id: string, patch: Partial<PurchaseOrderLine>) =>
    setDraft((p) => (p ? { ...p, lines: p.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : p));

  // ยอดทั้งใบคิดที่เดียว แล้วใบพิมพ์เรียกตัวเดียวกัน — เดิมสูตรถูกเขียนซ้ำสองที่ ทั้งที่นี่และในใบพิมพ์
  const totals = purchaseOrderTotals(draft);
  const status = draft.status;
  const docLabel = draft.documentNumber || draft.id;
  const cancelledCount = draft.lines.filter((l) => l.cancelled).length;
  const activeCount = draft.lines.length - cancelledCount;
  const lineCountLabel = (n: number) => cancelledCount > 0
    ? t("purchaseOrderDoc.lineCountCancelled").replace("{n}", String(n)).replace("{c}", String(cancelledCount))
    : t("ui.itemCount").replace("{n}", String(n));
  const linkedVendor = draft.vendorId ? vendors.find((v) => v.id === draft.vendorId) : undefined;
  const approverName = (draft.approvedBy ?? "").trim() || byId(draft.approvedByUserId)?.fullName || "";
  const intendedName = draft.intendedApproverUserId
    ? byId(draft.intendedApproverUserId)?.fullName || draft.intendedApproverName || draft.intendedApproverUserId
    : t("purchaseOrderDoc.intendedApproverAny");
  const busyApproval = approval.busy !== null;

  // ── แถบหัว ────────────────────────────────────────────────────────────────
  const moreItems = [
    // ถอนกลับมาแก้ — คนที่อนุมัติได้เห็นปุ่มอนุมัติ/ไม่อนุมัติอยู่แล้ว จึงเก็บคำสั่งนี้ไว้ในเมนู
    status === "PendingApproval" && canEdit && canApprove && {
      key: "withdraw", label: t("approval.withdraw"), icon: Undo2, onSelect: approval.withdraw, disabled: busyApproval,
    },
    // ถอนการอนุมัติ (2026-09-21) — คนที่อนุมัติได้คือคนที่ถอนได้ จึงผูกกับ canApprove ไม่ใช่ canEdit
    // ต่างจาก Rewrite ตรงที่ไม่ได้ออกเลขที่เอกสารใหม่
    canApprove && {
      key: "revert", label: t("purchaseOrderDoc.revert"), icon: Undo2,
      disabled: status !== "Final", hint: status !== "Final" ? t("purchaseOrderDoc.menu.afterApproval") : t("purchaseOrderDoc.menu.revertHint"),
      onSelect: () => { setRevertReason(""); setConfirmRevert(true); },
    },
    canEdit && {
      key: "rewrite", label: t("purchaseOrderDoc.rewrite"), icon: GitBranch,
      disabled: status !== "Final", hint: status !== "Final" ? t("purchaseOrderDoc.menu.afterApproval") : undefined,
      onSelect: () => setConfirmRewrite(true),
    },
    canDelete && {
      key: "delete", label: t("purchaseOrderDoc.confirmDelete.title"), icon: Trash2, danger: true,
      disabled: status === "Final", hint: status === "Final" ? t("purchaseOrderDoc.menu.deleteDraftOnly") : undefined,
      onSelect: () => setConfirmDelete(true),
    },
  ];

  const headerActions = (
    <div data-tour="purdoc-actions" className="flex items-center gap-2.5 flex-wrap">
      <TourReplayButton variant="title" onClick={docTour.start} />
      {canPrint && (
        <button type="button" onClick={() => { void logPurchaseOrderPrinted(draft.id).catch(() => {}); setShowPrint(true); }} className={btn.secondary}>
          <Printer size={16} /> {t("purchaseOrderDoc.print")}
        </button>
      )}
      {moreItems.some(Boolean) && <div data-tour="purdoc-more"><MoreMenu items={moreItems} /></div>}
      {editable && (
        <button type="button" onClick={() => void save()} disabled={saving} className={btn.secondary}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {t("purchaseOrderDoc.saveDraft")}
        </button>
      )}
      {status === "PendingApproval" && canEdit && !canApprove && (
        <button type="button" onClick={approval.withdraw} disabled={busyApproval} className={btn.secondary}>
          {approval.busy === "withdraw" ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />} {t("approval.withdraw")}
        </button>
      )}
      {status === "PendingApproval" && canApprove && (
        <button type="button" onClick={approval.openReject} disabled={busyApproval} className={`${btn.secondary} text-[#b93636]`}>
          <XCircle size={16} /> {t("approval.reject")}
        </button>
      )}
      {status === "Draft" && canEdit && (
        <button type="button" onClick={approval.submit} disabled={busyApproval} className={btn.primary}>
          {approval.busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("approval.submit")}
        </button>
      )}
      {status === "PendingApproval" && canApprove && (
        <button type="button" onClick={approval.openApprove} disabled={busyApproval} className={btn.primary}>
          {approval.busy === "approve" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} {t("approval.approve")}
        </button>
      )}
      {/* รับสินค้า (2026-09-03) — 1 ใบสั่งซื้อ = 1 ใบรับสินค้า จึงเปิดใบเดิมถ้ามีอยู่แล้ว
          แทนที่จะสร้างใบที่สองแล้วไปชน 409 ที่ฐานข้อมูล */}
      {status === "Final" && canReceiveGoods && (
        <button type="button" onClick={() => void openReceivingReport()} disabled={receiving} className={btn.primary}>
          {receiving ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />} {t("purchaseOrderDoc.receiveGoods")}
        </button>
      )}
    </div>
  );

  const headerMeta = editable ? (
    <AutoSaveIndicator state={autoSave.state} lastSavedAt={autoSave.lastSavedAt} />
  ) : (
    <span className="inline-flex items-center gap-1.5">
      <Lock size={14} />
      {status === "Final" ? t("purchaseOrderDoc.lockedReadonly") : t("purchaseOrderDoc.readonly")}
    </span>
  );

  // ── ขั้นตอน + คำแนะนำขั้นต่อไป ───────────────────────────────────────────
  const stepIndex = status === "Draft" ? 0 : status === "PendingApproval" ? 1 : 2;
  const steps = [
    { label: t("approval.step.draft") },
    { label: t("approval.step.pending") },
    { label: t("approval.step.final") },
  ];
  const nextHint: { title: string; body: ReactNode } = status === "Final"
    ? {
      title: t("purchaseOrderDoc.hint.finalTitle"),
      body: [
        canReceiveGoods ? t("purchaseOrderDoc.hint.finalReceive") : "",
        canEdit || canApprove ? t("purchaseOrderDoc.hint.finalRevise") : "",
      ].filter(Boolean).join(" · ") || t("approval.step.hint.final")
        .replace("{by}", approverName ? t("approval.step.by").replace("{name}", approverName) : "")
        .replace("{at}", draft.approvedAt ? t("approval.step.at").replace("{date}", formatQuoteDateThai(draft.approvedAt)) : ""),
    }
    : status === "PendingApproval"
    ? { title: t("quotation.hint.nextTitle"), body: t("approval.step.hint.pending").replace("{approver}", t("purchaseOrderDoc.approverLabel")) }
    : draft.rejectionComment
    ? { title: t("quotation.hint.nextTitle"), body: t("approval.step.hint.draftRejected") }
    : { title: t("quotation.hint.nextTitle"), body: editable ? t("purchaseOrderDoc.hint.draft") : t("approval.step.hint.draft") };

  // ── คอลัมน์ขวา ───────────────────────────────────────────────────────────
  const discountLabel = totals.discountAmt > 0
    ? `${t("purchaseOrderDoc.docDiscount")}${draft.discountMode !== "amount" && draft.discount ? ` ${draft.discount}%` : ""}`
    : "";
  const rail = (
    <>
      <RailTotalCard
        label={t("purchaseOrderDoc.grandTotal")}
        amount={`฿${fmt(totals.total)}`}
        rows={[
          ...(totals.discountAmt > 0 ? [{ label: discountLabel, value: `−฿${fmt(totals.discountAmt)}` }] : []),
          { label: t("purchaseOrderDoc.railVat").replace("{rate}", String(draft.vatRate ?? 0)), value: `฿${fmt(totals.vatAmt)}` },
          { label: t("purchaseOrderDoc.railItems"), value: lineCountLabel(activeCount) },
        ]}
      />
      <RailCard title={t("purchaseOrderDoc.approvalCard")}>
        {editable ? (
          <>
            {/* ผู้อนุมัติที่ตั้งใจไว้ (2026-09-21) — เจ้าของข้อ 2 "ใบ PO สามารถเลือกคนอนุมัติได้"
                รายชื่อมาจาก `useUserDirectory()` ซึ่ง App.tsx โหลดไว้ให้อยู่แล้ว ไม่ต้องส่ง prop
                ลงมาอีกสี่ชั้น (เหตุผลเดียวกับที่ช่องลายเซ็นบนใบพิมพ์ใช้ context ตัวนี้) */}
            <div data-tour="purdoc-approver">
              <Field label={t("purchaseOrderDoc.intendedApprover")} htmlFor="po-intended-approver" help={t("purchaseOrderDoc.intendedApproverHint")}>
                <SelectBox
                  id="po-intended-approver"
                  value={draft.intendedApproverUserId ?? ""}
                  onChange={(e) => {
                    const picked = approverOptions.find((u) => u.id === e.target.value);
                    setDraft((d) => d && {
                      ...d,
                      intendedApproverUserId: e.target.value,
                      intendedApproverName: picked?.fullName ?? "",
                    });
                  }}
                >
                  <option value="">{t("purchaseOrderDoc.intendedApproverAny")}</option>
                  {approverOptions.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                  {/* คนที่เคยถูกเลือกไว้แล้วถูกปิดบัญชี — ยังต้องเห็นชื่อ ไม่ใช่ช่องว่างที่อธิบายไม่ได้ */}
                  {draft.intendedApproverUserId && !approverOptions.some((u) => u.id === draft.intendedApproverUserId) && (
                    <option value={draft.intendedApproverUserId}>{draft.intendedApproverName || draft.intendedApproverUserId}</option>
                  )}
                </SelectBox>
              </Field>
            </div>
            <Field label={t("purchaseOrderDoc.orderedBy")} htmlFor="po-ordered-by">
              <input id="po-ordered-by" className={`${field.input} w-full`} value={draft.orderedBy} onChange={(e) => set("orderedBy", e.target.value)} />
            </Field>
            <Field label={t("purchaseOrderDoc.approvedBy")} htmlFor="po-approved-by">
              {/* ระบบเติมชื่อให้ตอนกดอนุมัติถ้ายังว่าง แต่ไม่ทับค่าที่พิมพ์เอง */}
              <input id="po-approved-by" className={`${field.input} w-full`} placeholder={t("purchaseOrderDoc.approvedByPlaceholder")}
                value={draft.approvedBy ?? ""} onChange={(e) => set("approvedBy", e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            {status === "Final" && (
              <div className="grid grid-cols-2 gap-3">
                <ReadonlyField label={t("purchaseOrderDoc.approvedBy")} value={approverName} />
                <ReadonlyField label={t("purchaseOrderDoc.approvedAt")} value={draft.approvedAt ? formatQuoteDateThai(draft.approvedAt) : ""} />
              </div>
            )}
            <ReadonlyField label={t("purchaseOrderDoc.intendedApprover")} value={intendedName} />
            {status !== "Final" && (draft.approvedBy ?? "").trim() && <ReadonlyField label={t("purchaseOrderDoc.approvedBy")} value={draft.approvedBy} />}
            <div className="h-px bg-[#eef1f6]" />
            <ReadonlyField
              label={t("purchaseOrderDoc.orderedBy")}
              value={[draft.orderedBy, draft.orderDate ? formatQuoteDateThai(draft.orderDate) : ""].filter(Boolean).join(" · ")}
            />
          </>
        )}
      </RailCard>
      <NextStepHint title={nextHint.title}>{nextHint.body}</NextStepHint>
    </>
  );

  // ── การ์ดผู้ขาย ─────────────────────────────────────────────────────────
  const vendorCard = (
    <SectionCard title={t("purchaseOrderDoc.sectionVendor")}>
      {editable ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px] items-start">
          <Field
            className="sm:col-span-3"
            label={t("purchaseOrderDoc.vendorName")}
            htmlFor="po-vendor-name"
            required
            // ใบจะอนุมัติไม่ได้ถ้าไม่ได้ผูกกับทะเบียน — บอกตั้งแต่ตอนกรอก ดีกว่าให้ไปเจอตอนกดอนุมัติ
            help={!draft.vendorId && draft.vendorName.trim() !== "" ? undefined : t("purchaseOrderDoc.vendorPickHelp")}
          >
            <div className="h-12 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2.5 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
              <span aria-hidden="true" className="w-[30px] h-[30px] rounded-md bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0">
                <Store size={16} />
              </span>
              <Combobox
                id="po-vendor-name"
                className="flex-1 min-w-0 h-full bg-transparent text-sm font-medium text-foreground placeholder:text-[#8a97ad] outline-none"
                value={draft.vendorName}
                // พิมพ์ชื่อเองได้อยู่ แต่ต้องล้างการผูกทิ้ง ไม่งั้นใบจะอ้างผู้ขายรายเดิมทั้งที่ชื่อเปลี่ยนไปแล้ว
                // (เซิร์ฟเวอร์พยายามจับคู่ชื่อให้อีกชั้นตอนบันทึก ถ้าตรงรายเดียวเป๊ะ)
                onChange={(next) => setDraft((d) => d && { ...d, vendorName: next, vendorId: "" })}
                options={vendorComboboxOptions(vendors)}
                ariaLabel={t("purchaseOrderDoc.vendorName")}
                placeholder={t("purchaseOrderDoc.vendorSearchPlaceholder")}
                // เลือกจากทะเบียนแล้วเติมช่องที่เหลือให้ — นั่นคือเหตุผลที่มีทะเบียน
                // ทับของเดิมโดยตั้งใจ: การกดเลือกผู้ขายคือการบอกว่า "เอารายนี้" ทั้งราย
                onPick={(opt) => {
                  const v = vendors.find((x) => x.name === opt.value);
                  if (!v) return;
                  setDraft((d) => d && {
                    ...d,
                    vendorId: v.id,
                    vendorName: v.name,
                    vendorContact: v.contactName,
                    vendorPhone: v.phone,
                    vendorTaxId: v.taxId,
                    vendorAddress: v.address,
                  });
                }}
              />
              {linkedVendor?.code && <CodeChip code={linkedVendor.code} />}
              {draft.vendorId && <span className="hidden sm:inline text-xs text-muted-foreground whitespace-nowrap">{t("purchaseOrderDoc.vendorSearchOther")}</span>}
              <ChevronDown size={16} aria-hidden="true" className="text-muted-foreground flex-shrink-0" />
            </div>
            {!draft.vendorId && draft.vendorName.trim() !== "" && (
              <p className="text-xs text-[#8a5a00] flex items-start gap-1.5">
                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />{t("purchaseOrderDoc.vendorNotLinked")}
              </p>
            )}
          </Field>
          <Field className="sm:col-span-2" label={t("purchaseOrderDoc.vendorAddress")} htmlFor="po-vendor-address">
            <textarea id="po-vendor-address" rows={2} className={`${field.textarea} w-full resize-y`} value={draft.vendorAddress} onChange={(e) => set("vendorAddress", e.target.value)} />
          </Field>
          <Field label={t("purchaseOrderDoc.vendorTaxId")} htmlFor="po-vendor-tax">
            <input id="po-vendor-tax" className={`${field.input} w-full font-mono`} value={draft.vendorTaxId} onChange={(e) => set("vendorTaxId", e.target.value)} />
          </Field>
          <Field label={t("purchaseOrderDoc.vendorContact")} htmlFor="po-vendor-contact">
            <input id="po-vendor-contact" className={`${field.input} w-full`} value={draft.vendorContact} onChange={(e) => set("vendorContact", e.target.value)} />
          </Field>
          <Field label={t("purchaseOrderDoc.vendorPhone")} htmlFor="po-vendor-phone">
            <input id="po-vendor-phone" className={`${field.input} w-full`} value={draft.vendorPhone} onChange={(e) => set("vendorPhone", e.target.value)} />
          </Field>
          <Field label={t("purchaseOrderDoc.vendorQuotationRef")} htmlFor="po-vendor-qref">
            <input id="po-vendor-qref" className={`${field.input} w-full font-mono`} value={draft.vendorQuotationRef} onChange={(e) => set("vendorQuotationRef", e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4 items-start">
          <div className="sm:col-span-2 flex items-start gap-3 min-w-0">
            <span aria-hidden="true" className="w-9 h-9 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0">
              <Store size={18} />
            </span>
            <ReadonlyField
              label={t("purchaseOrderDoc.vendorName")}
              value={draft.vendorName ? <span className="inline-flex items-center gap-2 flex-wrap">{draft.vendorName}{linkedVendor?.code && <CodeChip code={linkedVendor.code} />}</span> : ""}
            />
          </div>
          <ReadonlyField label={t("purchaseOrderDoc.vendorTaxId")} value={draft.vendorTaxId} mono />
          <ReadonlyField className="sm:col-span-3" label={t("purchaseOrderDoc.vendorAddress")} value={draft.vendorAddress} />
          <ReadonlyField label={t("purchaseOrderDoc.vendorContact")} value={draft.vendorContact} />
          <ReadonlyField label={t("purchaseOrderDoc.vendorPhone")} value={draft.vendorPhone} />
          <ReadonlyField label={t("purchaseOrderDoc.vendorQuotationRef")} value={draft.vendorQuotationRef} mono />
        </div>
      )}
    </SectionCard>
  );

  // ── การ์ดข้อมูลใบสั่งซื้อ ────────────────────────────────────────────────
  const infoCard = (
    <SectionCard title={t("purchaseOrderDoc.sectionHeader")}>
      {editable ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-[18px] items-start">
          <Field label={t("purchaseOrderDoc.documentNumber")} htmlFor="po-number">
            <input id="po-number" className={`${field.input} w-full font-mono`} value={draft.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} />
          </Field>
          <Field label={t("purchaseOrderDoc.orderDate")} htmlFor="po-order-date">
            <input id="po-order-date" type="date" className={`${field.input} w-full`} value={draft.orderDate} onChange={(e) => set("orderDate", e.target.value)} />
          </Field>
          <Field label={t("purchaseOrderDoc.neededByDate")} htmlFor="po-needed-by">
            <input id="po-needed-by" type="date" className={`${field.input} w-full`} value={draft.neededByDate} onChange={(e) => set("neededByDate", e.target.value)} />
          </Field>
          <Field label={t("purchaseOrderDoc.jobCode")} htmlFor="po-job-code">
            <input id="po-job-code" className={`${field.input} w-full font-mono`} value={draft.jobCode} onChange={(e) => set("jobCode", e.target.value)} />
          </Field>
          {/* อ้างอิงต้นทาง — อ่านอย่างเดียวเสมอ เปลี่ยนที่มาของเอกสารทีหลังไม่ได้ */}
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className={field.label}>{t("purchaseOrderDoc.purchaseRequest")}</span>
            <span className={`h-10 flex items-center font-mono text-sm font-medium ${draft.purchaseRequestId ? "text-foreground" : "text-[#8a97ad]"}`}>{draft.purchaseRequestId || "—"}</span>
          </div>
          <Field label={t("purchaseOrderDoc.creditDays")} htmlFor="po-credit-days">
            <input id="po-credit-days" type="number" className={`${field.input} w-full text-right tabular-nums`} value={draft.creditDays ?? ""}
              onChange={(e) => set("creditDays", e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
          <Field label={t("purchaseOrderDoc.shippingMethod")} htmlFor="po-shipping">
            <input id="po-shipping" className={`${field.input} w-full`} value={draft.shippingMethod} onChange={(e) => set("shippingMethod", e.target.value)} />
          </Field>
          <Field className="sm:col-span-2" label={t("purchaseOrderDoc.deliveryLocation")} htmlFor="po-delivery">
            <input id="po-delivery" className={`${field.input} w-full`} value={draft.deliveryLocation} onChange={(e) => set("deliveryLocation", e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-4 items-start">
          <ReadonlyField label={t("purchaseOrderDoc.documentNumber")} value={draft.documentNumber} mono />
          <ReadonlyField label={t("purchaseOrderDoc.orderDate")} value={draft.orderDate ? formatQuoteDateThai(draft.orderDate) : ""} />
          <ReadonlyField label={t("purchaseOrderDoc.neededByDate")} value={draft.neededByDate ? formatQuoteDateThai(draft.neededByDate) : ""} />
          <ReadonlyField label={t("purchaseOrderDoc.jobCode")} value={draft.jobCode} mono />
          <ReadonlyField label={t("purchaseOrderDoc.purchaseRequest")} value={draft.purchaseRequestId} mono />
          <ReadonlyField label={t("purchaseOrderDoc.creditDays")} value={draft.creditDays !== null ? t("purchaseOrderDoc.creditDaysValue").replace("{n}", String(draft.creditDays)) : ""} />
          <ReadonlyField label={t("purchaseOrderDoc.shippingMethod")} value={draft.shippingMethod} />
          <ReadonlyField className="sm:col-span-2" label={t("purchaseOrderDoc.deliveryLocation")} value={draft.deliveryLocation} />
        </div>
      )}
    </SectionCard>
  );

  // ── ตารางรายการ ─────────────────────────────────────────────────────────
  const numCell = `${field.cell} w-full min-w-0 text-right tabular-nums`;
  const headCols: { label: string; right?: boolean; w?: string }[] = [
    { label: "#", w: "w-8" },
    { label: t("purchaseOrderDoc.col.code"), w: "w-[110px]" },
    { label: t("purchaseOrderDoc.col.description") },
    { label: t("purchaseOrderDoc.col.unit"), w: "w-[84px]" },
    { label: t("purchaseOrderDoc.col.department"), w: "w-[96px]" },
    { label: t("purchaseOrderDoc.col.costCode"), w: "w-[110px]" },
    { label: t("purchaseOrderDoc.col.qty"), right: true, w: "w-[84px]" },
    { label: t("purchaseOrderDoc.col.unitPriceBaht"), right: true, w: "w-[120px]" },
    { label: t("purchaseOrderDoc.col.discount"), w: "w-[140px]" },
    { label: t("purchaseOrderDoc.col.amountBaht"), right: true, w: "w-[120px]" },
  ];

  const linesEditable = (
    <>
      <div className="overflow-x-auto">
        {/* หัวคอลัมน์ตัวเลขชิดขวาตามตัวเลขในแถว (เจ้าของแจ้ง 2026-09-24) */}
        <table className="w-full min-w-[1120px]">
          <thead>
            <tr className={table.head}>
              {headCols.map((c, i) => (
                <th key={i} className={`${table.th} ${c.right ? "text-right" : ""} ${c.w ?? ""}`}>{c.label}</th>
              ))}
              {/* สองคอลัมน์ท้ายไม่มีหัว: ปุ่มยกเลิกรายการ กับปุ่มลบรายการ (คนละเรื่องกัน) */}
              <th className="w-9" aria-hidden="true" />
              <th className="w-9 pr-5" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {draft.lines.length === 0 ? (
              <tr><td colSpan={12} className="px-5 py-10 text-center text-sm text-muted-foreground">{t("purchaseOrderDoc.noLines")}</td></tr>
            ) : draft.lines.map((l, i) => {
              const dim = l.cancelled ? "opacity-60" : "";
              return (
                <tr key={l.id} className="border-b border-[#eef1f6] align-top">
                  <td className="pl-5 pr-2 py-2"><span className="h-9 flex items-center text-[13px] text-muted-foreground">{i + 1}</span></td>
                  <td className="px-1.5 py-2">
                    <input className={`${field.cell} w-full min-w-0 font-mono text-[13px] ${dim}`} aria-label={t("purchaseOrderDoc.col.code")} placeholder="—" value={l.productCode} onChange={(e) => setLine(l.id, { productCode: e.target.value })} />
                  </td>
                  <td className="px-1.5 py-2 min-w-[220px]">
                    <div className="flex flex-col gap-1.5">
                      <input
                        className={`${field.cell} w-full min-w-0 ${l.cancelled ? "line-through text-muted-foreground" : ""}`}
                        aria-label={t("purchaseOrderDoc.col.description")}
                        value={l.description}
                        onChange={(e) => setLine(l.id, { description: e.target.value })}
                      />
                      {kits.has(l.productId ?? "") && <span className="text-xs text-[#b93636]">{t("kit.receiveBlocked")}</span>}
                      {/* ช่องเหตุผลโผล่เฉพาะตอนติ๊กยกเลิก — เซิร์ฟเวอร์ตอบ 400 ถ้าเว้นว่าง */}
                      {l.cancelled && (
                        <label className="h-9 px-2.5 rounded-lg border border-[#efd3a0] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20">
                          <Ban size={14} className="text-[#8a5a00] flex-shrink-0" aria-hidden="true" />
                          <input
                            className="flex-1 min-w-0 bg-transparent text-[13px] text-[#8a5a00] placeholder:text-[#b58a3c] outline-none"
                            value={l.cancelRemark ?? ""}
                            placeholder={t("purchaseOrderDoc.cancelRemarkPlaceholder")}
                            aria-label={t("purchaseOrderDoc.cancelRemark")}
                            onChange={(e) => setLine(l.id, { cancelRemark: e.target.value })}
                          />
                        </label>
                      )}
                    </div>
                  </td>
                  <td className="px-1.5 py-2">
                    <input className={`${field.cell} w-full min-w-0 ${dim}`} aria-label={t("purchaseOrderDoc.col.unit")} value={l.unit} onChange={(e) => setLine(l.id, { unit: e.target.value })} />
                  </td>
                  {/* รหัสแผนก/บัญชีที่ดึงมาจากใบขอซื้อ — ก่อนหน้านี้คัดลอกมาแล้วแต่ไม่มีที่ให้เห็นหรือแก้
                      จัดซื้อมักต้องแก้รหัสบัญชีที่ผู้ขอกรอกมาผิดหมวด จึงต้องแก้ได้บนใบสั่งซื้อด้วย */}
                  <td className="px-1.5 py-2">
                    <Combobox value={l.departmentCode ?? ""} onChange={(next) => setLine(l.id, { departmentCode: next })}
                      options={codeComboboxOptions(codeEntries, "department")} ariaLabel={t("purchaseOrderDoc.col.department")}
                      className={`${field.cell} w-full min-w-0 font-mono text-[13px] ${dim}`} />
                  </td>
                  <td className="px-1.5 py-2">
                    <Combobox value={l.costCode ?? ""} onChange={(next) => setLine(l.id, { costCode: next })}
                      options={codeComboboxOptions(codeEntries, "account")} ariaLabel={t("purchaseOrderDoc.col.costCode")}
                      className={`${field.cell} w-full min-w-0 font-mono text-[13px] ${dim}`} />
                  </td>
                  <td className="px-1.5 py-2">
                    <input type="number" className={`${numCell} ${dim}`} aria-label={t("purchaseOrderDoc.col.qty")} value={l.qty ?? ""} onChange={(e) => setLine(l.id, { qty: e.target.value === "" ? null : Number(e.target.value) })} />
                  </td>
                  <td className="px-1.5 py-2">
                    <input type="number" className={`${numCell} ${dim}`} aria-label={t("purchaseOrderDoc.col.unitPrice")} value={l.unitPrice ?? ""} onChange={(e) => setLine(l.id, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })} />
                  </td>
                  {/* ส่วนลดรายบรรทัด: ตัวเลข + ปุ่มสลับ %/บาท — แนวเดียวกับใบเสนอราคา */}
                  <td className="px-1.5 py-2">
                    <DiscountInput
                      className={dim}
                      value={l.discount ?? null}
                      mode={l.discountMode}
                      label={t("purchaseOrderDoc.col.discount")}
                      toggleLabel={t("purchaseOrderDoc.discountModeToggle")}
                      onValue={(v) => setLine(l.id, { discount: v })}
                      onMode={(m) => setLine(l.id, { discountMode: m })}
                    />
                  </td>
                  <td className="px-1.5 py-2">
                    <span className={`h-9 flex items-center justify-end text-sm font-semibold tabular-nums whitespace-nowrap ${l.cancelled ? "line-through text-[#8a97ad]" : "text-foreground"}`}>
                      {fmt(purchaseOrderLineTotal(l))}
                    </span>
                  </td>
                  {/* ยกเลิกรายการ (2026-09-21) — **คนละเรื่องกับปุ่มลบ** ลบ = บรรทัดที่ไม่เคยสั่ง
                      (พิมพ์ผิด) · ยกเลิก = สั่งไปแล้วแต่ถอน ซึ่งยังต้องพิมพ์บนใบให้ผู้ขายเห็น
                      จึงเก็บปุ่มลบไว้ด้วย ไม่ได้แทนที่กัน */}
                  <td className="px-0.5 py-2">
                    <button
                      type="button"
                      onClick={() => setLine(l.id, { cancelled: !l.cancelled, ...(l.cancelled ? { cancelRemark: "" } : {}) })}
                      aria-label={t(l.cancelled ? "purchaseOrderDoc.uncancelLine" : "purchaseOrderDoc.cancelLine")}
                      aria-pressed={!!l.cancelled}
                      title={t(l.cancelled ? "purchaseOrderDoc.uncancelLine" : "purchaseOrderDoc.cancelLine")}
                      className={`w-8 h-9 rounded-lg flex items-center justify-center transition-colors ${l.cancelled ? "bg-[#fdf3e0] text-[#8a5a00]" : "text-[#8a97ad] hover:bg-[#f4f6fa] hover:text-foreground"}`}
                    >
                      <Ban size={16} />
                    </button>
                  </td>
                  <td className="pl-0.5 pr-5 py-2">
                    <button
                      type="button"
                      onClick={() => set("lines", draft.lines.filter((x) => x.id !== l.id))}
                      aria-label={t("purchaseOrderDoc.removeLine")}
                      title={t("purchaseOrderDoc.removeLine")}
                      className="w-8 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 px-6 pt-3 pb-6">
        <div className="flex flex-col gap-1">
          <button type="button" onClick={() => set("lines", [...draft.lines, blankPurchaseOrderLine(newId("poline"))])} className={`${btn.text} self-start`}>
            <Plus size={16} /> {t("purchaseOrderDoc.addLine")}
          </button>
          <span className="text-xs text-muted-foreground inline-flex items-start gap-1.5">
            <Info size={13} className="flex-shrink-0 mt-0.5" /> {t("purchaseOrderDoc.cancelVsDelete")}
          </span>
        </div>
        <div className="w-full lg:w-[440px] flex-shrink-0 flex flex-col gap-2.5 pt-2 text-sm">
          <div className="flex justify-between text-[#3d5173]">
            <span>{t("purchaseOrderDoc.subtotal")}</span>
            <span className="tabular-nums text-foreground">{fmt(totals.subtotal)}</span>
          </div>
          {/* ส่วนลดท้ายใบ — คิดจากยอดหลังหักส่วนลดรายบรรทัดแล้ว และคิดก่อน VAT */}
          <div className="flex items-center gap-3 text-[#3d5173]">
            <span className="flex-1">{t("purchaseOrderDoc.docDiscount")}</span>
            <DiscountInput
              className="w-[170px]"
              value={draft.discount ?? null}
              mode={draft.discountMode}
              label={t("purchaseOrderDoc.docDiscount")}
              toggleLabel={t("purchaseOrderDoc.discountModeToggle")}
              onValue={(v) => set("discount", v)}
              onMode={(m) => set("discountMode", m)}
            />
            <span className="w-[110px] text-right tabular-nums text-[#b93636]">−{fmt(totals.discountAmt)}</span>
          </div>
          <div className="flex items-center gap-3 text-[#3d5173]">
            <span className="flex-1">{t("purchaseOrderDoc.vatLabel")}</span>
            <span className="w-[170px] h-9 rounded-lg border border-[#c3ccda] bg-white flex items-stretch overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20">
              <input
                type="number"
                className="flex-1 min-w-0 px-2.5 bg-transparent text-sm text-right tabular-nums text-foreground outline-none"
                value={draft.vatRate ?? ""}
                aria-label={t("purchaseOrderDoc.vatRate")}
                onChange={(e) => set("vatRate", e.target.value === "" ? null : Number(e.target.value))}
              />
              <span className="px-3 flex items-center bg-[#f4f6fa] border-l border-border text-[13px] text-[#3d5173]">%</span>
            </span>
            <span className="w-[110px] text-right tabular-nums text-foreground">{fmt(totals.vatAmt)}</span>
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex justify-between items-baseline">
            <span className="font-semibold text-foreground">{t("purchaseOrderDoc.grandTotal")}</span>
            <span className="text-[22px] font-bold tabular-nums text-foreground">฿{fmt(totals.total)}</span>
          </div>
        </div>
      </div>
    </>
  );

  const discountText = (l: PurchaseOrderLine) =>
    !l.discount ? "" : l.discountMode === "amount" ? `฿${fmt(l.discount)}` : `${l.discount}%`;
  const linesReadonly = (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px]">
          <thead>
            <tr className={table.head}>
              {headCols.map((c, i) => (
                <th key={i} className={`${table.th} ${c.right ? "text-right" : ""} ${c.w ?? ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.lines.length === 0 ? (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-muted-foreground">{t("purchaseOrderDoc.noLines")}</td></tr>
            ) : draft.lines.map((l, i) => {
              const fg = l.cancelled ? "text-muted-foreground" : "text-foreground";
              const empty = <span className="text-[#8a97ad]">—</span>;
              return (
                <tr key={l.id} className="border-b border-[#eef1f6] align-top text-sm">
                  <td className={`${table.td} py-3 text-[13px] text-muted-foreground`}>{i + 1}</td>
                  <td className={`${table.td} py-3 font-mono text-[13px] ${fg}`}>{l.productCode || empty}</td>
                  <td className={`${table.td} py-3`}>
                    <span className={`block ${l.cancelled ? "line-through text-muted-foreground" : "text-foreground"}`}>{l.description || empty}</span>
                    {kits.has(l.productId ?? "") && <span className="block text-xs text-[#b93636] mt-0.5">{t("kit.receiveBlocked")}</span>}
                    {l.cancelled && (
                      <span className="mt-1 text-[12.5px] text-[#8a5a00] inline-flex items-center gap-1.5">
                        <Ban size={13} className="flex-shrink-0" />
                        {t("purchaseOrderDoc.cancelledLine")}{(l.cancelRemark ?? "").trim() ? ` — ${l.cancelRemark}` : ""}
                      </span>
                    )}
                  </td>
                  <td className={`${table.td} py-3 ${fg}`}>{l.unit || empty}</td>
                  <td className={`${table.td} py-3 font-mono text-[13px] ${fg}`}>{l.departmentCode || empty}</td>
                  <td className={`${table.td} py-3 font-mono text-[13px] ${fg}`}>{l.costCode || empty}</td>
                  <td className={`${table.td} py-3 text-right tabular-nums ${fg}`}>{l.qty ?? empty}</td>
                  <td className={`${table.td} py-3 text-right tabular-nums ${fg}`}>{l.unitPrice !== null ? fmt(l.unitPrice) : empty}</td>
                  <td className={`${table.td} py-3 tabular-nums ${fg}`}>{discountText(l) || empty}</td>
                  <td className={`${table.td} py-3 text-right tabular-nums font-semibold whitespace-nowrap ${l.cancelled ? "line-through text-[#8a97ad]" : "text-foreground"}`}>
                    {fmt(purchaseOrderLineTotal(l))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end px-6 pt-3 pb-6">
        <div className="w-full sm:w-[360px] flex flex-col gap-2.5 pt-2 text-sm">
          <div className="flex justify-between text-[#3d5173]">
            <span>{t("purchaseOrderDoc.subtotal")}</span>
            <span className="tabular-nums text-foreground">{fmt(totals.subtotal)}</span>
          </div>
          {totals.discountAmt > 0 && (
            <div className="flex justify-between text-[#3d5173]">
              <span>{t("purchaseOrderDoc.docDiscount")}{draft.discountMode !== "amount" && draft.discount ? ` (${draft.discount}%)` : ""}</span>
              <span className="tabular-nums text-[#b93636]">−{fmt(totals.discountAmt)}</span>
            </div>
          )}
          <div className="flex justify-between text-[#3d5173]">
            <span>{t("purchaseOrderDoc.vatLabel")}{draft.vatRate !== null ? ` (${draft.vatRate}%)` : ""}</span>
            <span className="tabular-nums text-foreground">{fmt(totals.vatAmt)}</span>
          </div>
          <div className="h-px bg-border my-1" />
          <div className="flex justify-between items-baseline">
            <span className="font-semibold text-foreground">{t("purchaseOrderDoc.grandTotal")}</span>
            <span className="text-[22px] font-bold tabular-nums text-foreground">฿{fmt(totals.total)}</span>
          </div>
        </div>
      </div>
    </>
  );

  const summary = (
    <DialogSummary
      mono
      title={docLabel}
      sub={[draft.vendorName, draft.purchaseRequestId ? `${t("purchaseOrderDoc.purchaseRequest")} ${draft.purchaseRequestId}` : ""].filter(Boolean).join(" · ") || undefined}
      aside={`฿${fmt(totals.total)}`}
    />
  );

  return (
    <>
      <div className="doc-form flex-1 overflow-y-auto print:hidden">
        <div className="sticky top-0 z-20">
          <DocumentHeader
            backLabel={t("purchaseOrderDoc.backToAll")}
            onBack={onBack}
            number={docLabel}
            status={<PurchaseOrderStatusPill status={status} />}
            meta={headerMeta}
            actions={headerActions}
          />
        </div>

        <div className="px-4 md:px-8 py-6 flex flex-col gap-5">
          {draftBackup.recovered && draftBackup.recoveredAt !== null && (
            <DraftRecoveryBanner
              savedAt={draftBackup.recoveredAt}
              onRestore={() => {
                const recovered = draftBackup.recovered!;
                setDraft((prev) => (prev ? { ...prev, ...recovered } : prev));
                draftBackup.clear();
                showToast(t("common.draftRecovery.restoredToast"));
              }}
              onDiscard={draftBackup.dismiss}
            />
          )}
          {(draft.rejectionComment ?? "").trim() && (
            <div role="status" className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[#fcebeb] border border-[#f1c9c9] text-sm text-[#b93636]">
              <XCircle size={18} className="flex-shrink-0 mt-px" />
              <span><span className="font-semibold">{t("approval.rejectedNotice")}</span> {draft.rejectionComment}</span>
            </div>
          )}
          <DocumentStepper ariaLabel={t("purchaseOrderDoc.stepperAria")} steps={steps} current={stepIndex} />
          <DocumentColumns main={<><div data-tour="purdoc-vendor">{vendorCard}</div>{infoCard}</>} rail={rail} />

          <div data-tour="purdoc-lines">
            <SectionCard
              title={
                <span className="flex items-baseline gap-2.5 flex-wrap">
                  {t("purchaseOrderDoc.sectionLines")}
                  <span className="text-[13px] font-normal text-muted-foreground">{lineCountLabel(draft.lines.length)}</span>
                </span>
              }
              bodyClassName=""
            >
              {editable ? linesEditable : linesReadonly}
            </SectionCard>
          </div>

          <SectionCard title={t("purchaseOrderDoc.remarks")}>
            {editable ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-[18px] items-start">
                <Field label={t("purchaseOrderDoc.remarks")} htmlFor="po-remarks">
                  <textarea id="po-remarks" rows={2} className={`${field.textarea} w-full resize-y`} value={draft.remarks} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
                <Field label={t("purchaseOrderDoc.revisionNote")} htmlFor="po-revision-note" help={t("purchaseOrderDoc.revisionNoteHint")}>
                  <textarea id="po-revision-note" rows={2} className={`${field.textarea} w-full resize-y`} value={draft.revisionNote} onChange={(e) => set("revisionNote", e.target.value)} />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 items-start">
                <ReadonlyField label={t("purchaseOrderDoc.remarks")} value={draft.remarks ? <span className="whitespace-pre-line">{draft.remarks}</span> : ""} />
                <ReadonlyField label={t("purchaseOrderDoc.revisionNote")} value={draft.revisionNote ? <span className="whitespace-pre-line">{draft.revisionNote}</span> : ""} />
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <PurchaseOrderPrintDocument doc={draft} />

      {approval.dialogs}
      {receiveCodeOpen && (
        <ReceiveCodeDialog
          purchaseOrder={{ number: draft.documentNumber.trim() || draft.id, vendorName: draft.vendorName, amount: totals.total }}
          onCreate={createReceivingReportWithCode}
          onCancel={() => setReceiveCodeOpen(false)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={t("purchaseOrderDoc.confirmDelete.title")}
        message={t("purchaseOrderDoc.confirmDelete.message")}
        confirmLabel={t("purchaseOrderDoc.confirmDelete.title")}
        danger
        busy={deleting}
        summary={summary}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await deletePurchaseOrder(draft.id);
            setConfirmDelete(false);
            onDeleted();
          } catch (err) {
            showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
          } finally {
            setDeleting(false);
          }
        }}
      />
      {/* กล่องยืนยันการถอน — มีช่องเหตุผลจึงใช้ ReasonDialog แทน ConfirmDialog ที่รับได้แค่ข้อความ */}
      <ReasonDialog
        open={confirmRevert}
        tone="warning"
        title={t("purchaseOrderDoc.revertConfirmTitle")}
        message={t("purchaseOrderDoc.revertConfirmMessage")}
        summary={<DialogSummary mono title={docLabel} sub={draft.vendorName || undefined} aside={`฿${fmt(totals.total)}`} />}
        confirmLabel={<>{reverting ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />} {t("purchaseOrderDoc.revert")}</>}
        busy={reverting}
        onCancel={() => setConfirmRevert(false)}
        onConfirm={() => void handleRevert()}
      >
        <ul className="flex flex-col gap-1.5 text-[13px] text-[#3d5173]">
          <li className="flex items-start gap-2"><AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-[#d89614]" />{t("purchaseOrderDoc.revertEffectSignature")}</li>
          <li className="flex items-start gap-2"><AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-[#d89614]" />{t("purchaseOrderDoc.revertEffectVendorCheck")}</li>
        </ul>
        <Field
          label={<>{t("purchaseOrderDoc.revertReasonLabel")} <span className="font-normal text-muted-foreground">{t("purchaseOrderDoc.optional")}</span></>}
          htmlFor="po-revert-reason"
          help={t("purchaseOrderDoc.revertReasonHelp")}
        >
          <textarea
            id="po-revert-reason"
            autoFocus
            rows={3}
            value={revertReason}
            onChange={(e) => setRevertReason(e.target.value)}
            className={`${field.textarea} w-full resize-y`}
          />
        </Field>
      </ReasonDialog>
      <ConfirmDialog
        open={confirmRewrite}
        title={t("purchaseOrderDoc.confirmRewrite.title")}
        message={t("purchaseOrderDoc.confirmRewrite.message")}
        confirmLabel={t("purchaseOrderDoc.rewrite")}
        busy={rewriting}
        summary={
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("purchaseOrderDoc.rewriteFrom")}</span>
              <span className="font-mono text-[13px] font-medium text-foreground">{docLabel}</span>
            </span>
            <ArrowRight size={16} className="text-muted-foreground" aria-hidden="true" />
            <span className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{t("purchaseOrderDoc.rewriteTo")}</span>
              <span className="font-mono text-[13px] font-medium text-foreground">{t("purchaseOrderDoc.rewriteNextNumber").replace("{root}", getRevisionRoot(draft.id))}</span>
            </span>
          </div>
        }
        onCancel={() => setConfirmRewrite(false)}
        onConfirm={async () => {
          setRewriting(true);
          try {
            const next = await rewritePurchaseOrder(draft.id);
            setConfirmRewrite(false);
            onOpenOther(next.id);
            showToast(t("purchaseOrderDoc.rewritten"));
          } catch (err) {
            showToast(err instanceof ApiError ? err.message : t("purchaseOrderDoc.errorSave"));
          } finally {
            setRewriting(false);
          }
        }}
      />
    </>
  );
}

/** ป้ายรหัสผู้ขายเล็ก ๆ ข้างชื่อ (VD-018) */
function CodeChip({ code }: { code: string }) {
  return (
    <span className="h-[22px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold font-mono inline-flex items-center flex-shrink-0">{code}</span>
  );
}

/**
 * ช่องส่วนลด + ปุ่มสลับ %/฿ แบบ segmented ในกล่องเดียว — ใช้ทั้งส่วนลดรายบรรทัดและส่วนลดท้ายใบ
 * ค่าว่าง/undefined ของ mode = เปอร์เซ็นต์ (ค่าเริ่มต้นเดิมของบรรทัดใหม่)
 */
function DiscountInput({ value, mode, label, toggleLabel, onValue, onMode, className = "" }: {
  value: number | null;
  mode: DiscountMode | undefined;
  label: string;
  toggleLabel: string;
  onValue: (v: number | null) => void;
  onMode: (m: DiscountMode) => void;
  className?: string;
}) {
  const isAmount = mode === "amount";
  const seg = (on: boolean) =>
    `h-[26px] min-w-6 px-1 rounded-[5px] text-xs flex items-center justify-center transition-colors ${on ? "bg-white text-foreground font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)]" : "text-muted-foreground hover:text-foreground"}`;
  return (
    <span className={`h-9 rounded-lg border border-[#c3ccda] bg-white flex items-center pr-[3px] overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors ${className}`}>
      <input
        type="number"
        className="flex-1 min-w-0 px-2 bg-transparent text-sm text-right tabular-nums text-foreground outline-none"
        value={value ?? ""}
        aria-label={label}
        onChange={(e) => onValue(e.target.value === "" ? null : Number(e.target.value))}
      />
      <span role="group" aria-label={toggleLabel} title={toggleLabel} className="flex bg-[#eef1f6] rounded-md p-0.5 flex-shrink-0">
        <button type="button" aria-pressed={!isAmount} onClick={() => onMode("percent")} className={seg(!isAmount)}>%</button>
        <button type="button" aria-pressed={isAmount} onClick={() => onMode("amount")} className={seg(isAmount)}>฿</button>
      </span>
    </span>
  );
}
