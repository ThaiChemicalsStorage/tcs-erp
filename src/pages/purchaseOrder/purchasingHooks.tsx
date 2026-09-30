import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import type { PurchaseOrderStatus } from "../../lib/purchaseOrder";

/** hooks ของกลุ่มจัดซื้อ — แยกจาก purchasingUi.tsx เพื่อให้ไฟล์นั้นส่งออกเฉพาะคอมโพเนนต์ (fast refresh) */

/** ป้ายชื่อสถานะใบสั่งซื้อ — คำเดิมของแอป (Draft / รออนุมัติ / Final) ใช้คีย์ร่วมกับใบเบิกเหมือนเดิม */
export function usePurchaseOrderStatusLabel(): Record<PurchaseOrderStatus, string> {
  const { t } = useI18n();
  return {
    Draft: t("materialRequisition.status.draft"),
    PendingApproval: t("materialRequisition.status.pendingApproval"),
    Final: t("materialRequisition.status.final"),
  };
}

type ApprovalBusy = null | "submit" | "approve" | "reject" | "withdraw";

/**
 * ขั้นตอนอนุมัติของใบสั่งซื้อ — ตรรกะเดียวกับ `DocumentApprovalActions` เป๊ะ (ข้อความ toast, กล่องยืนยันอนุมัติ,
 * กล่องกรอกเหตุผลไม่อนุมัติ, ส่งเอกสารที่อัปเดตกลับผ่าน `onUpdated`) แต่แยกออกเป็นคำสั่ง ให้หน้าเอกสารวางปุ่มเอง
 * ตามดีไซน์ใหม่: ส่งขออนุมัติ/อนุมัติ = ปุ่มหลักขวาสุด · ไม่อนุมัติ = ปุ่มรอง · ถอนกลับมาแก้ = ปุ่มรองหรือเมนูเพิ่มเติม
 * (คอมโพเนนต์กลางยังเป็นหน้าตาเก่าและใช้ร่วมกับเอกสารอีกหลายชนิด จึงไม่แก้ที่นั่น)
 */
export function useApprovalCommands<T>({ onSubmit, onApprove, onReject, onWithdraw, onUpdated, showToast }: {
  onSubmit: () => Promise<T>;
  onApprove: () => Promise<T>;
  onReject: (comment: string) => Promise<T>;
  onWithdraw: () => Promise<T>;
  onUpdated: (doc: T) => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<ApprovalBusy>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const run = async (kind: Exclude<ApprovalBusy, null>, fn: () => Promise<T>, successMsg: string, failMsg: string) => {
    setBusy(kind);
    try {
      onUpdated(await fn());
      setConfirmApprove(false);
      setRejectOpen(false);
      showToast(successMsg);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : failMsg);
    } finally {
      setBusy(null);
    }
  };

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmApprove}
        title={t("approval.confirmApprove.title")}
        message={t("approval.confirmApprove.message")}
        confirmLabel={busy === "approve" ? t("approval.approving") : t("approval.approve")}
        busy={busy === "approve"}
        onConfirm={() => void run("approve", onApprove, t("approval.approved"), t("approval.errorApprove"))}
        onCancel={() => setConfirmApprove(false)}
      />
      <PromptDialog
        open={rejectOpen}
        title={t("approval.rejectDialog.title")}
        message={t("approval.rejectDialog.message")}
        label={t("approval.rejectDialog.label")}
        confirmLabel={busy === "reject" ? t("approval.rejecting") : t("approval.reject")}
        requiredMessage={t("approval.rejectDialog.required")}
        multiline
        busy={busy === "reject"}
        onConfirm={(comment) => void run("reject", () => onReject(comment), t("approval.rejected"), t("approval.errorReject"))}
        onCancel={() => setRejectOpen(false)}
      />
    </>
  );

  return {
    busy,
    submit: () => void run("submit", onSubmit, t("approval.submitted"), t("approval.errorSubmit")),
    withdraw: () => void run("withdraw", onWithdraw, t("approval.withdrawn"), t("approval.errorWithdraw")),
    openApprove: () => setConfirmApprove(true),
    openReject: () => setRejectOpen(true),
    dialogs,
  };
}
