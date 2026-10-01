import { useEffect, useId, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, KeyRound, X } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { formatQuoteDateThai } from "../../lib/quotes";
import {
  fetchPasswordResetRequests, issueTemporaryPassword, dismissPasswordResetRequest, type PasswordResetRequest,
} from "../../lib/passwordResets";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { ListPageHeader } from "../../components/ui/ListPage";
import { btn, surface, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { useDialogA11y } from "../../hooks/useDialogA11y";

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

const stamp = (iso: string) => `${formatQuoteDateThai(iso)} ${timeOf(iso)}`;

// บรรทัดรอง "username · รหัสพนักงาน · แผนก" ใต้ชื่อผู้ใช้
// The "username · employee id · department" line under a user's name
function UserMeta({ r }: { r: PasswordResetRequest }) {
  return (
    <>
      <span className="font-mono">{r.username}</span>
      {r.employeeId ? ` · ${r.employeeId}` : ""}
      {r.department ? ` · ${r.department}` : ""}
    </>
  );
}

/**
 * หน้า "คำขอกู้รหัสผ่าน" ของ Super Admin (2026-09-24) — เจ้าของสั่ง *"ทำหน้าเพิ่มขึ้นมาด้วยนะเผื่อมีคนขอ"*
 *
 * คำขอที่ค้างอยู่บนสุด → กด "ออกรหัสผ่านชั่วคราว" → รหัสขึ้นให้เห็น**ครั้งเดียว** (ปิดกล่องแล้วเรียกดูอีกไม่ได้ ระบบไม่ได้เก็บไว้)
 * แจ้งรหัสให้ผู้ใช้ด้วยตัวเอง ผู้ใช้ต้องตั้งรหัสใหม่ตอนเข้าสู่ระบบ · ประวัติคำขอที่จบแล้วอยู่ด้านล่าง
 * เซิร์ฟเวอร์ตรวจ `isSuperAdmin` ทุกคำสั่ง (`api/_lib/passwordResetHandler.ts`)
 * ดีไซน์ใหม่ 2026-09-30 (บอร์ด PasswordResets): ปุ่มในแถวเป็นปุ่มรอง/ปุ่มข้อความ · กล่องยืนยันมีกล่องสรุปผู้ใช้
 */
export function PasswordResetRequestsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [confirmIssue, setConfirmIssue] = useState<PasswordResetRequest | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<PasswordResetRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ request: PasswordResetRequest; password: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPasswordResetRequests()
      .then((r) => { if (!cancelled) { setRequests(r); setStatus("ok"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [reload]);

  const replace = (r: PasswordResetRequest) => setRequests((list) => list.map((x) => (x.id === r.id ? r : x)));

  const runIssue = async (r: PasswordResetRequest) => {
    setBusy(true);
    try {
      const result = await issueTemporaryPassword(r.id);
      replace(result.request);
      setIssued({ request: result.request, password: result.temporaryPassword });
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("passwordResets.errorAction"));
    } finally {
      setBusy(false);
      setConfirmIssue(null);
    }
  };
  const runDismiss = async (r: PasswordResetRequest) => {
    setBusy(true);
    try {
      replace(await dismissPasswordResetRequest(r.id));
      toast.show(t("passwordResets.dismissedToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("passwordResets.errorAction"));
    } finally {
      setBusy(false);
      setConfirmDismiss(null);
    }
  };

  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status !== "pending");
  const [typedPre, typedPost = ""] = t("passwordResets.typed").split("{value}");
  const who = (r: PasswordResetRequest) => (
    <span className="flex flex-col min-w-0 leading-snug">
      <span className="font-medium text-foreground truncate">{r.fullName}</span>
      <span className="text-xs text-muted-foreground truncate"><UserMeta r={r} /></span>
    </span>
  );
  const summary = (r: PasswordResetRequest, withTime: boolean) => (
    <div className="flex items-center gap-3">
      <span className="flex-1 min-w-0 flex flex-col gap-0.5 leading-snug">
        <span className="font-medium text-foreground truncate">{r.fullName}</span>
        <span className="text-[13px] text-[#3d5173] truncate"><UserMeta r={r} /></span>
      </span>
      {withTime && <span className="text-[13px] text-muted-foreground tabular-nums whitespace-nowrap flex-shrink-0">{stamp(r.lastRequestedAt)}</span>}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader module={t("nav.group.admin")} title={t("nav.passwordResets")} description={<span className="block max-w-[880px] text-[#3d5173]">{t("passwordResets.subtitle")}</span>} />

      {status === "loading" ? (
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">{t("passwordResets.loading")}</span>
          {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" aria-hidden="true" />)}
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-muted-foreground">{t("passwordResets.loadError")}</p>
          <button onClick={() => { setStatus("loading"); setReload((n) => n + 1); }} className={btn.secondarySm}>{t("passwordResets.retry")}</button>
        </div>
      ) : (
        <>
          <section className={`${surface.card} overflow-hidden`}>
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-[#eef1f6]">
              <h2 className={surface.cardTitle}>{t("passwordResets.pendingTitle")}</h2>
              <span className={`min-w-[22px] h-5 px-1.5 rounded-full text-xs font-semibold inline-flex items-center justify-center ${pending.length ? "bg-[#fdf3e0] text-[#8a5a00]" : "bg-[#eef1f6] text-[#3d5173]"}`}>{pending.length}</span>
            </div>
            {pending.length === 0 ? (
              <EmptyState icon={KeyRound} title={t("passwordResets.emptyTitle")} description={t("passwordResets.emptyDescription")} compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] table-fixed text-sm">
                  <thead>
                    <tr className={table.head}>
                      <th className={`${table.th} w-[280px]`}>{t("passwordResets.col.user")}</th>
                      <th className={`${table.th} w-[180px]`}>{t("passwordResets.col.requestedAt")}</th>
                      <th className={table.th}>{t("passwordResets.col.note")}</th>
                      <th className={`${table.th} w-[320px]`}><span className="sr-only">{t("users.col.actions")}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r.id} className="border-b border-[#eef1f6] last:border-b-0">
                        <td className={`${table.td} py-3`}>{who(r)}</td>
                        <td className={`${table.td} py-3`}>
                          <span className="block text-[#3d5173] tabular-nums">{stamp(r.lastRequestedAt)}</span>
                          {r.requestCount > 1 && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#8a5a00]">
                              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#d89614]" />
                              {t("passwordResets.requestedTimes").replace("{n}", String(r.requestCount))}
                            </span>
                          )}
                        </td>
                        <td className={`${table.td} py-3`}>
                          <span className={`block break-words ${r.note ? "text-foreground" : "text-[#8a97ad]"}`}>{r.note || t("common.dash")}</span>
                          <span className="block text-xs text-muted-foreground break-all">{typedPre}<span className="font-mono">{r.identifier}</span>{typedPost}</span>
                        </td>
                        <td className={`${table.td} py-3`}>
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setConfirmDismiss(r)} disabled={busy} className="h-9 px-2.5 inline-flex items-center rounded-lg text-[#1a5fb4] text-[13px] font-medium hover:bg-[#e8f0fb] transition-colors disabled:opacity-60 whitespace-nowrap">
                              {t("passwordResets.dismiss")}
                            </button>
                            <button onClick={() => setConfirmIssue(r)} disabled={busy} className={btn.secondarySm}>
                              <KeyRound size={15} /> {t("passwordResets.issue")}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {done.length > 0 && (
            <section className={`${surface.card} overflow-hidden`}>
              <div className="px-5 py-4 border-b border-[#eef1f6]">
                <h2 className={surface.cardTitle}>{t("passwordResets.historyTitle")}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] table-fixed text-sm">
                  <thead>
                    <tr className={table.head}>
                      <th className={`${table.th} w-[280px]`}>{t("passwordResets.col.user")}</th>
                      <th className={`${table.th} w-[180px]`}>{t("passwordResets.col.requestedAt")}</th>
                      <th className={`${table.th} w-[230px]`}>{t("passwordResets.col.result")}</th>
                      <th className={table.th}>{t("passwordResets.col.by")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((r) => (
                      <tr key={r.id} className="h-[60px] border-b border-[#eef1f6] last:border-b-0">
                        <td className={table.td}>{who(r)}</td>
                        <td className={`${table.td} text-[#3d5173] tabular-nums whitespace-nowrap`}>{stamp(r.requestedAt)}</td>
                        <td className={table.td}>
                          <StatusBadge
                            status={r.status === "resolved" ? "active" : "archived"}
                            label={r.status === "resolved" ? t("passwordResets.status.resolved") : t("passwordResets.status.dismissed")}
                          />
                        </td>
                        <td className={table.td}>
                          <span className="block text-foreground">{r.resolvedByName || t("common.dash")}</span>
                          {r.resolvedAt && <span className="block text-xs text-muted-foreground tabular-nums">{stamp(r.resolvedAt)}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmIssue !== null}
        title={t("passwordResets.confirmIssue.title")}
        message={confirmIssue ? t("passwordResets.confirmIssue.message").replace("{name}", confirmIssue.fullName) : ""}
        confirmLabel={t("passwordResets.issue")}
        tone="warning"
        summary={confirmIssue ? summary(confirmIssue, false) : undefined}
        busy={busy}
        onConfirm={() => { if (confirmIssue) void runIssue(confirmIssue); }}
        onCancel={() => setConfirmIssue(null)}
      />
      <ConfirmDialog
        open={confirmDismiss !== null}
        title={t("passwordResets.confirmDismiss.title")}
        message={confirmDismiss ? t("passwordResets.confirmDismiss.message").replace("{name}", confirmDismiss.fullName) : ""}
        confirmLabel={t("passwordResets.dismiss")}
        summary={confirmDismiss ? summary(confirmDismiss, true) : undefined}
        busy={busy}
        onConfirm={() => { if (confirmDismiss) void runDismiss(confirmDismiss); }}
        onCancel={() => setConfirmDismiss(null)}
      />
      {issued && <IssuedPasswordDialog request={issued.request} password={issued.password} onClose={() => setIssued(null)} />}
      <Toast message={toast.message} />
    </div>
  );
}

/**
 * รหัสชั่วคราวแสดงครั้งเดียว — ปิดกล่องแล้วเรียกดูอีกไม่ได้ (ระบบเก็บแค่ hash)
 * คลิกพื้นหลังจึง**ไม่**ปิดกล่อง (บอร์ด Dlg-PasswordResetIssued) — ต้องกด ✕ หรือ "แจ้งผู้ใช้แล้ว ปิด" เท่านั้น
 */
function IssuedPasswordDialog({ request, password, onClose }: { request: PasswordResetRequest; password: string; onClose: () => void }) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onClose);
  const titleId = useId();
  const descId = useId();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // http ธรรมดา (ไม่ใช่ https/localhost) ไม่มี clipboard API — ผู้ใช้เลือกข้อความคัดลอกเองได้ รหัสแสดงอยู่แล้ว
    }
  };
  const [forPre, forPost = ""] = t("passwordResets.issued.for").replace("{name}", request.fullName).split("{username}");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}
        className="relative w-full max-w-[480px] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col">
        <div className="flex items-start gap-4 px-6 pt-6">
          <span className="w-11 h-11 rounded-full bg-[#e6f4ec] text-[#1b7f4f] flex items-center justify-center flex-shrink-0"><CheckCircle2 size={20} /></span>
          <div className="flex-1 min-w-0 pt-0.5 space-y-1">
            <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{t("passwordResets.issued.title")}</h2>
            <p id={descId} className="text-sm text-[#3d5173] leading-relaxed">{forPre}<span className="font-mono">{request.username}</span>{forPost}</p>
          </div>
          <button onClick={onClose} aria-label={t("common.close")} className="w-9 h-9 -mt-1.5 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
          <div className="h-16 pl-[18px] pr-2 border border-[#c3ccda] rounded-[10px] bg-white flex items-center gap-3">
            <code aria-label={t("passwordResets.issued.title")} className="flex-1 min-w-0 font-mono text-2xl font-medium tracking-[0.08em] text-[#0b1d3a] select-all truncate">{password}</code>
            <button onClick={() => void copy()} title={t("passwordResets.issued.copy")} className={btn.secondarySm}>
              {copied ? <Check size={15} className="text-[#1b7f4f]" /> : <Copy size={15} />}
              {copied ? t("passwordResets.issued.copied") : t("passwordResets.issued.copy")}
            </button>
          </div>
          <p role="note" className="flex gap-2.5 px-3.5 py-3 bg-[#fdf3e0] border border-[#efd3a0] rounded-lg text-[13px] leading-normal text-[#6b4600]">
            <AlertTriangle size={16} className="text-[#8a5a00] flex-shrink-0 mt-0.5" />
            {t("passwordResets.issued.warning")}
          </p>
        </div>
        <div className="flex justify-end px-6 py-4 border-t border-[#eef1f6]">
          <button onClick={onClose} className={btn.primary}>{t("passwordResets.issued.done")}</button>
        </div>
      </div>
    </div>
  );
}
