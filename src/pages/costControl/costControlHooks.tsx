import { useState } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
import { ApiError } from "../../lib/apiClient";
import type { CostControlStatus } from "../../lib/costControl";
import { useI18n } from "../../lib/i18n";

// คำว่า Draft / Final คงเป็นภาษาอังกฤษตามที่แอปใช้มาตลอด — ใช้คีย์ชุดเดิมของหน้ารายการ Cost Control
export function useCostControlStatusLabel() {
  const { t } = useI18n();
  const labels: Record<CostControlStatus, string> = {
    Draft: t("materialRequisition.status.draft"),
    PendingApproval: t("materialRequisition.status.pendingApproval"),
    Final: t("materialRequisition.status.final"),
  };
  return (status: CostControlStatus) => labels[status] ?? status;
}

type ApprovalBusy = null | "submit" | "approve" | "reject" | "withdraw";

/**
 * ขั้นตอนอนุมัติของ Cost Control — ตรรกะเดียวกับ `DocumentApprovalActions` เป๊ะ (ข้อความ toast, กล่องยืนยัน
 * อนุมัติ, กล่องกรอกเหตุผลไม่อนุมัติ, ส่งเอกสารที่อัปเดตกลับผ่าน `onUpdated`) แต่แยกเป็นคำสั่งให้หน้าเอกสาร
 * วางปุ่มเองตามดีไซน์ใหม่: ส่งขออนุมัติ/อนุมัติ = ปุ่มหลัก, ไม่อนุมัติ = ปุ่มขอบแดง, ถอนกลับมาแก้ = ในเมนูเพิ่มเติม
 * (คอมโพเนนต์กลางยังเป็นหน้าตาเก่าและใช้ร่วมกับเอกสารอื่นอีกหลายชนิด จึงไม่แก้ที่นั่น)
 * ปุ่มเป็นแค่การแสดงผล — เซิร์ฟเวอร์ (`api/_lib/documentApproval.ts`) เป็นตัวคุมสิทธิ์และลำดับสถานะจริง
 */
export function useCostControlApproval<T>({ onSubmit, onApprove, onReject, onWithdraw, onUpdated, showToast }: {
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
