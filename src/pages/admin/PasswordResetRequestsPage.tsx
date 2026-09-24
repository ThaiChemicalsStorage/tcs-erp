import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, X } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { formatQuoteDateThai } from "../../lib/quotes";
import {
  fetchPasswordResetRequests, issueTemporaryPassword, dismissPasswordResetRequest, type PasswordResetRequest,
} from "../../lib/passwordResets";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useDialogA11y } from "../../hooks/useDialogA11y";

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

/**
 * หน้า "คำขอกู้รหัสผ่าน" ของ Super Admin (2026-09-24) — เจ้าของสั่ง *"ทำหน้าเพิ่มขึ้นมาด้วยนะเผื่อมีคนขอ"*
 *
 * คำขอที่ค้างอยู่บนสุด → กด "ออกรหัสผ่านชั่วคราว" → รหัสขึ้นให้เห็น**ครั้งเดียว** (ปิดกล่องแล้วเรียกดูอีกไม่ได้ ระบบไม่ได้เก็บไว้)
 * แจ้งรหัสให้ผู้ใช้ด้วยตัวเอง ผู้ใช้ต้องตั้งรหัสใหม่ตอนเข้าสู่ระบบ · ประวัติคำขอที่จบแล้วอยู่ด้านล่าง
 * เซิร์ฟเวอร์ตรวจ `isSuperAdmin` ทุกคำสั่ง (`api/_lib/passwordResetHandler.ts`)
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
  const who = (r: PasswordResetRequest) => (
    <>
      <span className="block text-sm font-medium text-foreground">{r.fullName}</span>
      <span className="block text-xs text-muted-foreground font-mono">{r.username}{r.employeeId ? ` · ${r.employeeId}` : ""}{r.department ? ` · ${r.department}` : ""}</span>
    </>
  );
  const th = "px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("nav.passwordResets")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("passwordResets.subtitle")}</p>
      </div>

      {status === "loading" ? (
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">{t("passwordResets.loading")}</span>
          {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" aria-hidden="true" />)}
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <p className="text-sm text-muted-foreground">{t("passwordResets.loadError")}</p>
          <button onClick={() => { setStatus("loading"); setReload((n) => n + 1); }} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40">{t("passwordResets.retry")}</button>
        </div>
      ) : (
        <>
          <section className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
              <KeyRound size={15} className="text-[#a75d1a]" />
              <h2 className="text-sm font-semibold text-foreground">{t("passwordResets.pendingTitle")}</h2>
              <span className="text-xs text-muted-foreground font-mono">({pending.length})</span>
            </div>
            {pending.length === 0 ? (
              <EmptyState icon={KeyRound} title={t("passwordResets.emptyTitle")} description={t("passwordResets.emptyDescription")} compact />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {[t("passwordResets.col.user"), t("passwordResets.col.requestedAt"), t("passwordResets.col.note"), ""].map((h, i) => <th key={`${i}-${h}`} className={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0 align-top">
                        <td className="px-4 py-3.5">{who(r)}</td>
                        <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                          <span className="font-mono">{formatQuoteDateThai(r.lastRequestedAt)} {timeOf(r.lastRequestedAt)}</span>
                          {r.requestCount > 1 && <span className="block text-[#a75d1a]">{t("passwordResets.requestedTimes").replace("{n}", String(r.requestCount))}</span>}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-foreground max-w-[320px]">
                          {r.note || <span className="text-muted-foreground">—</span>}
                          <span className="block text-muted-foreground mt-0.5">{t("passwordResets.typed").replace("{value}", r.identifier)}</span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setConfirmDismiss(r)} disabled={busy}
                              className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                              {t("passwordResets.dismiss")}
                            </button>
                            <button onClick={() => setConfirmIssue(r)} disabled={busy}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-50">
                              <KeyRound size={13} /> {t("passwordResets.issue")}
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
            <section className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">{t("passwordResets.historyTitle")}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {[t("passwordResets.col.user"), t("passwordResets.col.requestedAt"), t("passwordResets.col.result"), t("passwordResets.col.by")].map((h) => <th key={h} className={th}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 last:border-0 align-top">
                        <td className="px-4 py-3">{who(r)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(r.requestedAt)} {timeOf(r.requestedAt)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${r.status === "resolved" ? "bg-[#2aa36b]/10 text-[#207e52] border-[#2aa36b]/20" : "bg-[#5a7299]/10 text-[#576f94] border-[#5a7299]/20"}`}>
                            {r.status === "resolved" ? t("passwordResets.status.resolved") : t("passwordResets.status.dismissed")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {r.resolvedByName || "—"}
                          {r.resolvedAt && <span className="block font-mono">{formatQuoteDateThai(r.resolvedAt)} {timeOf(r.resolvedAt)}</span>}
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
        busy={busy}
        onConfirm={() => { if (confirmIssue) void runIssue(confirmIssue); }}
        onCancel={() => setConfirmIssue(null)}
      />
      <ConfirmDialog
        open={confirmDismiss !== null}
        title={t("passwordResets.confirmDismiss.title")}
        message={confirmDismiss ? t("passwordResets.confirmDismiss.message").replace("{name}", confirmDismiss.fullName) : ""}
        confirmLabel={t("passwordResets.dismiss")}
        busy={busy}
        onConfirm={() => { if (confirmDismiss) void runDismiss(confirmDismiss); }}
        onCancel={() => setConfirmDismiss(null)}
      />
      {issued && <IssuedPasswordDialog request={issued.request} password={issued.password} onClose={() => setIssued(null)} />}
      <Toast message={toast.message} />
    </div>
  );
}

/** รหัสชั่วคราวแสดงครั้งเดียว — ปิดกล่องแล้วเรียกดูอีกไม่ได้ (ระบบเก็บแค่ hash) */
function IssuedPasswordDialog({ request, password, onClose }: { request: PasswordResetRequest; password: string; onClose: () => void }) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onClose);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // http ธรรมดา (ไม่ใช่ https/localhost) ไม่มี clipboard API — ผู้ใช้เลือกข้อความคัดลอกเองได้ รหัสแสดงอยู่แล้ว
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t("passwordResets.issued.title")}
        className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <h2 className="flex-1 text-base font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("passwordResets.issued.title")}</h2>
          <button onClick={onClose} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-foreground">{t("passwordResets.issued.for").replace("{name}", request.fullName).replace("{username}", request.username)}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-center text-xl tracking-widest font-mono font-semibold text-[#0b1d3a] bg-[#c9a84c]/15 border border-[#c9a84c]/40 rounded-lg px-3 py-3 select-all">{password}</code>
            <button onClick={() => void copy()} aria-label={t("passwordResets.issued.copy")} title={t("passwordResets.issued.copy")}
              className="flex items-center justify-center w-11 h-11 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-colors">
              {copied ? <Check size={16} className="text-[#207e52]" /> : <Copy size={16} />}
            </button>
          </div>
          <p className="text-xs text-[#a75d1a] bg-[#e08a3c]/10 border border-[#e08a3c]/20 rounded-lg px-3 py-2.5">{t("passwordResets.issued.warning")}</p>
        </div>
        <div className="flex justify-end px-5 py-3 border-t border-border">
          <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            {t("passwordResets.issued.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

