import { useState } from "react";
import { CheckCircle2, Send, Undo2, XCircle, Loader2 } from "lucide-react";
import { PromptDialog } from "./PromptDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { ApiError } from "../lib/apiClient";
import { useI18n } from "../lib/i18n";

/**
 * ปุ่มขั้นตอนอนุมัติที่ใช้ร่วมกันทั้ง 4 เอกสาร (ใบเบิก-คืนวัสดุ / ใบขอซื้อ / ใบสั่งงาน / ใบสั่งผลิต)
 * — เพิ่ม 2026-08-20 ตามคำสั่งเจ้าของ "ใบที่ต้องมีการอนุมัติต้องมีปุ่มอนุมัติด้วย"
 *
 * คู่กับ helper ฝั่งเซิร์ฟเวอร์ใน api/_lib/documentApproval.ts ซึ่งบังคับ state machine เดียวกันนี้จริง
 * ปุ่มตรงนี้เป็นแค่การแสดงผล ไม่ใช่ตัวคุมสิทธิ์
 *
 *   ร่าง          → [ส่งขออนุมัติ]
 *   รออนุมัติ      → [อนุมัติ] [ไม่อนุมัติ]   (ต้องมีสิทธิ์ :finalize)
 *                  → [ถอนกลับมาแก้]          (คนที่แก้เอกสารได้)
 *   อนุมัติแล้ว    → ไม่มีปุ่ม
 *
 * Generic over the document type so each page passes its own lib functions — nothing here knows
 * which document it is beyond the labels it renders.
 */
export function DocumentApprovalActions<T>({
  status, canEdit, canApprove, onSubmit, onApprove, onReject, onWithdraw, onUpdated, showToast,
}: {
  status: "Draft" | "PendingApproval" | "Final";
  /** ผู้ที่แก้เอกสารได้ = ผู้ที่ส่งขออนุมัติ/ถอนได้ */
  canEdit: boolean;
  /** ต้องมีสิทธิ์ :finalize จึงจะอนุมัติ/ไม่อนุมัติได้ */
  canApprove: boolean;
  onSubmit: () => Promise<T>;
  onApprove: () => Promise<T>;
  onReject: (comment: string) => Promise<T>;
  onWithdraw: () => Promise<T>;
  onUpdated: (doc: T) => void;
  showToast: (message: string) => void;
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

  return (
    <>
      {status === "Draft" && canEdit && (
        <button
          onClick={() => void run("submit", onSubmit, t("approval.submitted"), t("approval.errorSubmit"))}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-4 py-1.5 text-xs border border-[#c9a84c]/40 text-[#a5813a] rounded-lg font-semibold hover:bg-[#c9a84c]/10 transition-colors disabled:opacity-60"
        >
          {busy === "submit" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} {t("approval.submit")}
        </button>
      )}

      {status === "PendingApproval" && canApprove && (
        <>
          <button
            onClick={() => setConfirmApprove(true)}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors disabled:opacity-60"
          >
            {busy === "approve" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} {t("approval.approve")}
          </button>
          <button
            onClick={() => setRejectOpen(true)}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors disabled:opacity-60"
          >
            <XCircle size={13} /> {t("approval.reject")}
          </button>
        </>
      )}

      {status === "PendingApproval" && canEdit && (
        <button
          onClick={() => void run("withdraw", onWithdraw, t("approval.withdrawn"), t("approval.errorWithdraw"))}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60"
        >
          {busy === "withdraw" ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} {t("approval.withdraw")}
        </button>
      )}

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
}

/** แถบแจ้งเหตุผลที่ถูกตีกลับ — แสดงบนเอกสารที่กลับมาเป็นฉบับร่างพร้อมเหตุผล */
export function RejectionNotice({ comment }: { comment: string }) {
  const { t } = useI18n();
  if (!comment.trim()) return null;
  return (
    <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-[#e05252]/10 border border-[#e05252]/20 text-sm text-[#c23f3f] print:hidden">
      <XCircle size={15} className="flex-shrink-0 mt-0.5" />
      <span><span className="font-semibold">{t("approval.rejectedNotice")}</span> {comment}</span>
    </div>
  );
}
