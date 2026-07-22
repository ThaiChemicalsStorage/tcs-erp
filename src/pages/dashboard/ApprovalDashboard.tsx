import { useState } from "react";
import { ClipboardCheck, ThumbsUp, ThumbsDown } from "lucide-react";
import type { ApprovalDashboard as ApprovalDashboardData, PendingApprovalItem } from "../../lib/dashboard";
import { performWorkflowAction } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { useToast } from "../../hooks/useToast";
import { Toast } from "../../components/Toast";
import { fmtDaysOrDash, fmtShort } from "./format";

function PendingRow({ item, canReject, onDone }: { item: PendingApprovalItem; canReject: boolean; onDone: (message: string) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const approve = async () => {
    setBusy(true);
    try {
      await performWorkflowAction(item.id, "approved", "", {});
      onDone(t("dashboard.approval.actionSuccess.approved"));
    } catch {
      setError(t("dashboard.approval.actionError"));
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async () => {
    if (!comment.trim()) { setError(t("dashboard.approval.rejectRequired")); return; }
    setBusy(true);
    try {
      await performWorkflowAction(item.id, "rejected", comment.trim(), {});
      onDone(t("dashboard.approval.actionSuccess.rejected"));
    } catch {
      setError(t("dashboard.approval.actionError"));
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors align-top">
      <td className="px-3 py-2.5 text-xs font-mono text-[#c9a84c] font-medium whitespace-nowrap">{item.id}</td>
      <td className="px-3 py-2.5 text-xs text-foreground">{item.client}</td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{item.salesperson}</td>
      <td className="px-3 py-2.5 text-xs font-mono text-foreground font-semibold whitespace-nowrap">{fmtShort(item.amount)}</td>
      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{item.submittedDate ? item.submittedDate.slice(0, 10) : "—"}</td>
      <td className="px-3 py-2.5">
        {rejecting ? (
          <div className="flex flex-col gap-1.5 min-w-[220px]">
            <textarea
              value={comment}
              onChange={(e) => { setComment(e.target.value); setError(""); }}
              placeholder={t("dashboard.approval.rejectPlaceholder")}
              rows={2}
              className="text-xs text-foreground bg-secondary border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-[#e05252]/50 transition-colors w-full resize-none"
            />
            {error && <p className="text-[10px] text-[#e05252]">{error}</p>}
            <div className="flex items-center gap-1.5">
              <button disabled={busy} onClick={confirmReject} className="px-2.5 py-1 text-[11px] bg-[#e05252] text-white rounded-lg font-semibold hover:bg-[#c94444] transition-colors disabled:opacity-50">
                {t("dashboard.approval.rejectConfirm")}
              </button>
              <button disabled={busy} onClick={() => { setRejecting(false); setComment(""); setError(""); }} className="px-2.5 py-1 text-[11px] border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button disabled={busy} onClick={approve} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors disabled:opacity-50">
              <ThumbsUp size={11} /> {t("quotation.action.approved")}
            </button>
            {canReject && (
              <button disabled={busy} onClick={() => setRejecting(true)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-[#e05252] text-white rounded-lg font-semibold hover:bg-[#c94444] transition-colors disabled:opacity-50">
                <ThumbsDown size={11} /> {t("quotation.action.rejectBtn")}
              </button>
            )}
            {error && <p className="text-[10px] text-[#e05252]">{error}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}

export function ApprovalDashboard({ data, onRefresh }: { data: ApprovalDashboardData; onRefresh: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const items = [
    { label: t("dashboard.approval.pending"), value: data.pendingApprovals.toLocaleString("th-TH"), accent: "#c9a84c" },
    { label: t("dashboard.approval.approvedToday"), value: data.approvedToday.toLocaleString("th-TH"), accent: "#2aa36b" },
    { label: t("dashboard.approval.rejectedToday"), value: data.rejectedToday.toLocaleString("th-TH"), accent: "#e05252" },
    { label: t("dashboard.kpi.averageApprovalTime"), value: fmtDaysOrDash(data.averageApprovalTime, t("dashboard.unit.days")), accent: "#5a7299" },
  ];

  const handleDone = (message: string) => {
    toast.show(message);
    onRefresh();
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
        <ClipboardCheck size={15} /> {t("dashboard.approval.title")}
      </h2>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg bg-secondary/40 p-3">
            <p className="text-lg font-bold font-mono" style={{ color: it.accent }}>{it.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{it.label}</p>
          </div>
        ))}
      </div>

      <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">{t("dashboard.approval.list.title")}</h3>
      {data.pendingList.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">{t("dashboard.approval.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.approval.col.id")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.approval.col.client")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.approval.col.salesperson")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.approval.col.amount")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.approval.col.submittedDate")}</th>
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody>
              {data.pendingList.map((item) => (
                <PendingRow key={item.id} item={item} canReject={data.canReject} onDone={handleDone} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Toast message={toast.message} />
    </div>
  );
}
