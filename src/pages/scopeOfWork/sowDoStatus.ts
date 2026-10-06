import { useI18n } from "../../lib/i18n";
import { formatDisplayDate } from "../../lib/displayDate";

/** สถานะอนุมัติชุดเดียวกันของ Scope of Work และใบส่งมอบสินค้า — Draft → PendingApproval → Final */
export type ApprovalStatus = "Draft" | "PendingApproval" | "Final";

// คำว่า Draft / Final คงเป็นภาษาอังกฤษตามที่แอปใช้มาตลอด (PRODUCT.md) — แปลเฉพาะ "รออนุมัติ"
export function useApprovalStatusLabel() {
  const { t } = useI18n();
  return (status: ApprovalStatus) => (status === "PendingApproval" ? t("approval.step.pending") : status);
}

/** ขั้นตอนสามขั้นของ DocumentStepper — Final = ครบทุกขั้น */
export function useApprovalSteps(status: ApprovalStatus) {
  const { t } = useI18n();
  const steps = [
    { label: t("approval.step.draft") },
    { label: t("approval.step.pending") },
    { label: t("approval.step.final") },
  ];
  const current = status === "Draft" ? 0 : status === "PendingApproval" ? 1 : steps.length;
  return { steps, current };
}

/** ข้อความ "ขั้นต่อไป" — ใช้ข้อความชุดเดียวกับ DocumentStatusStepper เดิม */
export function useApprovalHint({ status, approverLabel, approvedByName = "", approvedAt = "" }: {
  status: ApprovalStatus;
  approverLabel: string;
  approvedByName?: string;
  approvedAt?: string;
}) {
  const { t } = useI18n();
  if (status === "Final") {
    return t("approval.step.hint.final")
      .replace("{by}", approvedByName.trim() ? t("approval.step.by").replace("{name}", approvedByName.trim()) : "")
      .replace("{at}", approvedAt ? t("approval.step.at").replace("{date}", formatDisplayDate(approvedAt)) : "");
  }
  if (status === "PendingApproval") return t("approval.step.hint.pending").replace("{approver}", approverLabel);
  return t("approval.step.hint.draft");
}

