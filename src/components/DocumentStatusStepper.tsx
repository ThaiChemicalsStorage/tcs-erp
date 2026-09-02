import { Check, Clock, PenLine } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { useUserDirectory } from "../lib/userDirectory";
import { formatQuoteDateThai } from "../lib/quotes";

/**
 * แถบบอกว่า "ใบนี้เดินมาถึงขั้นไหนแล้ว และกำลังรออะไรอยู่" — เจ้าของสั่ง 2026-09-02:
 * *"ทำสถานะของใบว่าตอนนี้อยู่ใน Step ไหน รออะไรอนุมัติอะไรงี้"*
 *
 * ก่อนหน้านี้เอกสารบอกสถานะด้วย **ป้ายคำเดียว** บนแถบหัวหน้าจอ ("ร่าง" / "รออนุมัติ" / "อนุมัติแล้ว")
 * ซึ่งบอกว่าอยู่ตรงไหน แต่ไม่บอกว่ามาจากไหน จะไปไหนต่อ หรือใครเป็นคนที่ต้องลงมือคนถัดไป
 *
 * ใช้ได้กับทุกเอกสารในระบบ เพราะทั้งแปดชนิด (Scope of Work / ใบส่งมอบ / ใบเบิก / ใบสั่งงาน /
 * ใบขอซื้อ / ใบสั่งผลิต / ใบสั่งซื้อ / Cost Control) ใช้สถานะชุดเดียวกันคือ Draft → PendingApproval → Final
 *
 * ไม่พิมพ์ลงกระดาษ (`print:hidden`) — เป็นข้อมูลสถานะภายใน ไม่ใช่ส่วนหนึ่งของฟอร์ม
 */

type ApprovableStatus = "Draft" | "PendingApproval" | "Final";

const STEP_ORDER: ApprovableStatus[] = ["Draft", "PendingApproval", "Final"];

export function DocumentStatusStepper({
  status,
  rejectionComment = "",
  approverLabel,
  approvedByUserId,
  approvedByName = "",
  approvedAt = "",
}: {
  status: ApprovableStatus;
  /** มีค่า = ใบนี้เคยถูกตีกลับ ทำให้ขั้น "จัดทำร่าง" อ่านต่างออกไป (แก้ของเดิม ไม่ใช่เริ่มใหม่) */
  rejectionComment?: string;
  /** ใครคือคนที่ต้องกดอนุมัติใบชนิดนี้ เช่น "ผู้มีสิทธิ์อนุมัติใบเบิก" — ไม่ระบุ = ข้อความกลาง ๆ */
  approverLabel?: string;
  /** ผู้กดอนุมัติจริงในระบบ ใช้ดึงชื่อเต็มจากทะเบียนผู้ใช้ */
  approvedByUserId?: string;
  /** ชื่อในช่องผู้อนุมัติบนฟอร์ม — ใช้ก่อน เพราะเจ้าหน้าที่พิมพ์ทับได้ */
  approvedByName?: string;
  approvedAt?: string;
}) {
  const { t } = useI18n();
  const { byId } = useUserDirectory();

  const currentIndex = STEP_ORDER.indexOf(status);
  const stepLabels: Record<ApprovableStatus, string> = {
    Draft: t("approval.step.draft"),
    PendingApproval: t("approval.step.pending"),
    Final: t("approval.step.final"),
  };
  const stepIcons: Record<ApprovableStatus, typeof Check> = {
    Draft: PenLine,
    PendingApproval: Clock,
    Final: Check,
  };

  const approverName = approvedByName.trim() || byId(approvedByUserId)?.fullName || "";
  const hint =
    status === "Final"
      ? t("approval.step.hint.final")
          .replace("{by}", approverName ? t("approval.step.by").replace("{name}", approverName) : "")
          .replace("{at}", approvedAt ? t("approval.step.at").replace("{date}", formatQuoteDateThai(approvedAt)) : "")
      : status === "PendingApproval"
      ? t("approval.step.hint.pending").replace("{approver}", approverLabel || t("approval.step.defaultApprover"))
      : rejectionComment.trim()
      ? t("approval.step.hint.draftRejected")
      : t("approval.step.hint.draft");

  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 print:hidden">
      <ol className="flex items-center gap-2">
        {STEP_ORDER.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const Icon = stepIcons[step];
          return (
            <li key={step} className="flex items-center gap-2 min-w-0">
              <span
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${
                  active
                    ? step === "Final"
                      ? "bg-[#2aa36b]/10 text-[#207e52] border-[#2aa36b]/25"
                      : step === "PendingApproval"
                      ? "bg-[#e08a3c]/10 text-[#a75d1a] border-[#e08a3c]/25"
                      : "bg-[#5a7299]/10 text-[#576f94] border-[#5a7299]/25"
                    : done
                    ? "bg-[#2aa36b]/5 text-[#207e52]/70 border-[#2aa36b]/15"
                    : "bg-transparent text-muted-foreground border-border"
                }`}
              >
                {done ? <Check size={12} /> : <Icon size={12} />}
                {stepLabels[step]}
              </span>
              {i < STEP_ORDER.length - 1 && (
                <span aria-hidden className={`h-px w-6 flex-shrink-0 ${i < currentIndex ? "bg-[#2aa36b]/40" : "bg-border"}`} />
              )}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground mt-2">{hint}</p>
    </div>
  );
}
