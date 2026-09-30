import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { RejectDialog, type ApprovableStatus } from "./docShared";

/**
 * ขั้นอนุมัติของเอกสาร (ส่งขออนุมัติ / อนุมัติ / ไม่อนุมัติ / ถอนกลับมาแก้) สำหรับหัวเอกสารแบบใหม่
 *
 * ตรรกะเดียวกับ `DocumentApprovalActions` ทุกบรรทัด (ใครเห็นปุ่มไหน ข้อความแจ้งผล การยืนยันก่อนอนุมัติ
 * เหตุผลบังคับตอนไม่อนุมัติ) — แยกเป็น hook เพราะหัวแบบใหม่วางปุ่มคนละที่: ปุ่มหลักอยู่ขวาสุด
 * "ไม่อนุมัติ" เป็นปุ่มรอง และ "ถอนกลับมาแก้" ย้ายเข้าเมนู "เพิ่มเติม" · เซิร์ฟเวอร์ยังเป็นผู้คุมสิทธิ์จริง
 */
export function useApprovalFlow<T>({ status, canEdit, canApprove, onSubmit, onApprove, onReject, onWithdraw, onUpdated, showToast, summary }: {
  status: ApprovableStatus;
  canEdit: boolean;
  canApprove: boolean;
  onSubmit: () => Promise<T>;
  onApprove: () => Promise<T>;
  onReject: (comment: string) => Promise<T>;
  onWithdraw: () => Promise<T>;
  onUpdated: (doc: T) => void;
  showToast: (message: string) => void;
  summary?: ReactNode;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<null | "submit" | "approve" | "reject" | "withdraw">(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const run = async (kind: "submit" | "approve" | "reject" | "withdraw", fn: () => Promise<T>, successMsg: string, failMsg: string) => {
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

  const pending = status === "PendingApproval";
  return {
    busy,
    canSubmit: status === "Draft" && canEdit,
    canDecide: pending && canApprove,
    canWithdraw: pending && canEdit,
    submit: () => void run("submit", onSubmit, t("approval.submitted"), t("approval.errorSubmit")),
    approve: () => setConfirmApprove(true),
    reject: () => setRejectOpen(true),
    withdraw: () => void run("withdraw", onWithdraw, t("approval.withdrawn"), t("approval.errorWithdraw")),
    dialogs: (
      <>
        <ConfirmDialog
          open={confirmApprove}
          title={t("approval.confirmApprove.title")}
          message={t("approval.confirmApprove.message")}
          confirmLabel={busy === "approve" ? t("approval.approving") : t("approval.approve")}
          summary={summary}
          busy={busy === "approve"}
          onConfirm={() => void run("approve", onApprove, t("approval.approved"), t("approval.errorApprove"))}
          onCancel={() => setConfirmApprove(false)}
        />
        {rejectOpen && (
          <RejectDialog
            summary={summary}
            busy={busy === "reject"}
            onConfirm={(comment) => void run("reject", () => onReject(comment), t("approval.rejected"), t("approval.errorReject"))}
            onCancel={() => setRejectOpen(false)}
          />
        )}
      </>
    ),
  };
}
