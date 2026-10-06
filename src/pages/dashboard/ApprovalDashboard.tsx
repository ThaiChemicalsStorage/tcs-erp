import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import type { ApprovalDashboard as ApprovalDashboardData, PendingApprovalItem, DashboardVatMode } from "../../lib/dashboard";
import { performWorkflowAction } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { useToast } from "../../hooks/useToast";
import { Toast } from "../../components/Toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { btn, field } from "../../components/ui/styles";
import { ChartCard } from "./ChartCard";
import { fmtDateShort, fmtDaysOrDash } from "./format";
import { CountPill, StatCells } from "./tabs/DepartmentWidgets";
import { TD, TH } from "./tabs/dashboardTokens";
import { fmtCount } from "./tabs/countFormat";

/** ปุ่มเล็กขอบเทาตัวสี (บอร์ด: "✕ ปฏิเสธ" แดง · "✓ อนุมัติ" เขียว) — สีตัวอักษรแยกจาก btn.secondarySm เพื่อไม่ให้คลาสสีชนกัน */
const ROW_BTN = "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#c3ccda] bg-white text-[13px] font-medium hover:bg-[#f4f6fa] transition-colors disabled:opacity-60 whitespace-nowrap";

/** ปุ่มยืนยันปฏิเสธขนาดเล็ก (สูตรเดียวกับ btn.danger แต่สูง 36px) */
const REJECT_CONFIRM_BTN = "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#b93636] text-white text-[13px] font-semibold hover:bg-[#9e2c2c] transition-colors disabled:opacity-60 whitespace-nowrap";

const fmtAmount = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// แถวรายการรออนุมัติหนึ่งรายการ พร้อมปุ่มอนุมัติ (ต้องยืนยันก่อน) และปฏิเสธ (กรอกเหตุผลในแถวถัดไป)
// A single pending-approval row with confirm-gated approve and reject actions
function PendingRow({ item, canReject, vatSuffix, onDone }: { item: PendingApprovalItem; canReject: boolean; vatSuffix: string; onDone: (message: string) => void }) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const submitted = item.submittedDate ? fmtDateShort(item.submittedDate.slice(0, 10), lang) : "—";

  // ยืนยันและอนุมัติใบเสนอราคานี้
  // Confirms and approves this quotation
  const approve = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      await performWorkflowAction(item.id, "approved", "", {});
      onDone(t("dashboard.approval.actionSuccess.approved").replace("{id}", item.id));
    } catch {
      setError(t("dashboard.approval.actionError"));
    } finally {
      setBusy(false);
    }
  };

  // ปฏิเสธใบเสนอราคานี้พร้อมเหตุผลที่กรอก
  // Rejects this quotation with the entered comment
  const confirmReject = async () => {
    if (!comment.trim()) { setError(t("dashboard.approval.rejectRequired")); return; }
    setBusy(true);
    try {
      await performWorkflowAction(item.id, "rejected", comment.trim(), {});
      onDone(t("dashboard.approval.actionSuccess.rejected").replace("{id}", item.id));
    } catch {
      setError(t("dashboard.approval.actionError"));
    } finally {
      // แบบเดียวกับปุ่มอนุมัติ — ถ้าแถวยังอยู่หลังรีเฟรช (เช่นรีเฟรชล้มเหลว) ปุ่มต้องไม่ค้างเป็นกดไม่ได้
      setBusy(false);
    }
  };

  return (
    <Fragment>
      <tr className={rejecting ? "" : "border-b border-[#eef1f6] last:border-0"}>
        <td className={`${TD} font-mono text-[13px] font-medium whitespace-nowrap`}>{item.id}</td>
        <td className={`${TD} max-w-[320px]`}>
          <span className="flex flex-col leading-snug min-w-0">
            <span className="font-medium truncate" title={item.client}>{item.client}</span>
            <span className="text-xs text-muted-foreground truncate">{item.salesperson} · {t("dashboard.approval.submittedOn").replace("{date}", submitted)}</span>
          </span>
        </td>
        <td className={`${TD} text-right font-semibold tabular-nums whitespace-nowrap`}>{fmtAmount(item.amount)}</td>
        <td className={`${TD} text-right`}>
          {!rejecting && (
            <span className="inline-flex flex-col items-end gap-1">
              <span className="inline-flex items-center gap-2">
                {canReject && (
                  <button type="button" disabled={busy} onClick={() => { setRejecting(true); setError(""); }} className={`${ROW_BTN} text-[#b93636]`}>
                    <X size={16} /> {t("quotation.action.rejectBtn")}
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => setConfirmOpen(true)} className={`${ROW_BTN} text-[#1b7f4f]`}>
                  <Check size={16} /> {t("quotation.action.approved")}
                </button>
              </span>
              {error && <span className={field.error}>{error}</span>}
            </span>
          )}
        </td>
        {createPortal(
          <ConfirmDialog
            open={confirmOpen}
            title={t("dashboard.approval.confirmApprove.title")}
            message={t("dashboard.approval.confirmApprove.message").replace("{id}", item.id).replace("{client}", item.client)}
            summary={(
              <span className="flex items-center gap-3">
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="font-mono text-[13px] font-medium">{item.id}</span>
                  <span className="text-[13px] text-[#3d5173] truncate">{item.client}</span>
                  <span className="text-xs text-muted-foreground">{item.salesperson} · {t("dashboard.approval.submittedOn").replace("{date}", submitted)}</span>
                </span>
                <span className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="font-semibold tabular-nums">{fmtAmount(item.amount)}</span>
                  <span className="text-xs text-muted-foreground">{vatSuffix}</span>
                </span>
              </span>
            )}
            confirmLabel={t("quotation.action.approved")}
            onConfirm={approve}
            onCancel={() => setConfirmOpen(false)}
          />,
          document.body,
        )}
      </tr>
      {rejecting && (
        <tr className="border-b border-[#eef1f6] last:border-0">
          <td colSpan={4} className="px-5 sm:px-6 pb-4 pt-1">
            <div className="flex flex-col gap-2 max-w-xl ml-auto">
              <textarea
                value={comment}
                onChange={(e) => { setComment(e.target.value); setError(""); }}
                placeholder={t("dashboard.approval.rejectPlaceholder")}
                aria-label={t("dashboard.approval.rejectPlaceholder")}
                rows={2}
                className={`${field.textarea} w-full resize-none`}
              />
              {error && <p className={field.error}>{error}</p>}
              <div className="flex items-center justify-end gap-2">
                <button type="button" disabled={busy} onClick={() => { setRejecting(false); setComment(""); setError(""); }} className={btn.secondarySm}>
                  {t("common.cancel")}
                </button>
                <button type="button" disabled={busy} onClick={confirmReject} className={REJECT_CONFIRM_BTN}>
                  {t("dashboard.approval.rejectConfirm")}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// การ์ดรายการรออนุมัติ (บอร์ด Dashboard-Sales): ตัวเลขรอบนหัว · แถบสรุป 4 ช่อง · ตารางพร้อมปุ่มปฏิเสธ/อนุมัติ
// Approval card — summary strip plus the list of pending approvals with approve/reject actions
export function ApprovalDashboard({ data, onRefresh, vatMode }: { data: ApprovalDashboardData; onRefresh: () => void; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const toast = useToast();

  const handleDone = (message: string) => {
    toast.show(message);
    onRefresh();
  };

  return (
    <ChartCard
      flush className="h-full" bodyClassName="flex-1 flex flex-col"
      title={t("dashboard.approval.list.title")} sub={t("dashboard.sales.approval.sub")}
      actions={<CountPill count={data.pendingApprovals} />}
    >
      <div className="border-b border-[#eef1f6]">
        <StatCells
          cells={[
            { key: "pending", label: t("dashboard.approval.pending"), value: fmtCount(data.pendingApprovals) },
            { key: "approvedToday", label: t("dashboard.approval.approvedToday"), value: fmtCount(data.approvedToday) },
            { key: "rejectedToday", label: t("dashboard.approval.rejectedToday"), value: fmtCount(data.rejectedToday) },
            { key: "avg", label: t("dashboard.kpi.averageApprovalTime"), value: fmtDaysOrDash(data.averageApprovalTime, t("dashboard.unit.days")) },
          ]}
        />
      </div>
      {data.pendingList.length === 0 ? (
        <p className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground text-center py-10">{t("dashboard.approval.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f8f9fc] border-b border-border text-left">
                <th className={TH}>{t("dashboard.approval.col.id")}</th>
                <th className={TH}>{t("dashboard.approval.col.clientSales")}</th>
                <th className={`${TH} text-right`}>{`${t("dashboard.approval.col.amount")} ${vatSuffix}`}</th>
                <th className={TH}><span className="sr-only">{t("dashboard.approval.list.title")}</span></th>
              </tr>
            </thead>
            <tbody>
              {data.pendingList.map((item) => (
                <PendingRow key={item.id} item={item} canReject={data.canReject} vatSuffix={vatSuffix} onDone={handleDone} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toast message={toast.message} />
    </ChartCard>
  );
}
