import { useEffect, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { SectionCard } from "../../components/ui/SectionCard";
import { btn } from "../../components/ui/styles";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { formatDisplayDate, formatDisplayDateTime } from "../../lib/displayDate";
import { fetchStaffLineStatus, requestStaffLinePairing, unlinkStaffLine, type StaffLineStatus } from "../../lib/staffLine";

/**
 * ตั้งค่า → การแจ้งเตือน → แจ้งเตือนทาง LINE (2026-10-08, Tuhmo #50)
 *
 * ผู้ใช้เชื่อม LINE ของตัวเองได้เอง: กด "เชื่อม LINE" → ได้รหัส → เพิ่ม OA เป็นเพื่อน → พิมพ์รหัสในแชต
 * ระหว่างแสดงรหัส หน้าจอเช็คสถานะทุก 4 วินาที พอเว็บฮุคจับคู่สำเร็จก็เปลี่ยนเป็น "เชื่อมแล้ว" เอง ไม่ต้องรีเฟรช
 */
export function LineNotifySection() {
  const { t } = useI18n();
  const [status, setStatus] = useState<StaffLineStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStaffLineStatus()
      .then((s) => { if (!cancelled) setStatus(s); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, []);

  const waiting = !!status && !status.linked && !!status.pairing;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => {
      fetchStaffLineStatus().then(setStatus).catch(() => {});
    }, 4000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  const run = async (action: () => Promise<StaffLineStatus>) => {
    setBusy(true);
    setError("");
    try {
      setStatus(await action());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.line.error"));
    } finally {
      setBusy(false);
    }
  };

  const copyCode = (code: string) => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <SectionCard title={t("settings.line.title")} subtitle={t("settings.line.subtitle")}>
      {loadError ? (
        <p className="text-sm text-[#b93636]">{t("settings.line.error")}</p>
      ) : !status ? (
        <p className="text-sm text-muted-foreground inline-flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> {t("common.loading")}</p>
      ) : !status.configured ? (
        <p className="text-sm text-muted-foreground">{t("settings.line.notConfigured")}</p>
      ) : status.linked ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="text-[#1b7f4f] flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                {t("settings.line.linked").replace("{oa}", status.oaName || "LINE")}
              </span>
              {status.linkedAt && (
                <span className="text-[13px] text-muted-foreground">
                  {t("settings.line.linkedSince").replace("{date}", formatDisplayDate(status.linkedAt))}
                </span>
              )}
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("settings.line.whatIsSent")}</p>
          <div>
            <button type="button" onClick={() => void run(unlinkStaffLine)} disabled={busy} className={btn.secondary}>
              {busy && <Loader2 size={15} className="animate-spin" />} {t("settings.line.unlink")}
            </button>
          </div>
        </div>
      ) : status.pairing ? (
        <div className="flex flex-col gap-5">
          <ol className="flex flex-col gap-4 text-sm text-foreground">
            <li className="flex flex-col gap-2">
              <span><span className="font-semibold">1.</span> {t("settings.line.step1").replace("{oa}", status.oaName || "LINE")}</span>
              {status.addFriendUrl && (
                <div className="flex flex-wrap items-center gap-3">
                  <a href={status.addFriendUrl} target="_blank" rel="noopener noreferrer" className={btn.secondary}>
                    <ExternalLink size={15} aria-hidden="true" /> {t("settings.line.addFriend")}
                  </a>
                  <span className="text-[13px] text-muted-foreground font-mono">{status.oaBasicId}</span>
                </div>
              )}
            </li>
            <li className="flex flex-col gap-2">
              <span><span className="font-semibold">2.</span> {t("settings.line.step2")}</span>
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-4 h-11 inline-flex items-center rounded-lg bg-[#f4f6fa] border border-border font-mono text-lg font-semibold tracking-wider text-foreground select-all">
                  {status.pairing.code}
                </span>
                <button type="button" onClick={() => copyCode(status.pairing!.code)} className={btn.secondarySm}>
                  <Copy size={14} aria-hidden="true" /> {copied ? t("settings.line.copied") : t("settings.line.copy")}
                </button>
              </div>
              <span className="text-[13px] text-muted-foreground">
                {t("settings.line.expires").replace("{at}", formatDisplayDateTime(status.pairing.expiresAt))}
              </span>
            </li>
          </ol>
          <p className="text-[13px] text-muted-foreground inline-flex items-center gap-2" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {t("settings.line.waiting")}
          </p>
          <div>
            <button type="button" onClick={() => void run(requestStaffLinePairing)} disabled={busy} className={btn.text}>
              {t("settings.line.newCode")}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">{t("settings.line.intro")}</p>
          <p className="text-[13px] text-muted-foreground">{t("settings.line.whatIsSent")}</p>
          <div>
            <button type="button" onClick={() => void run(requestStaffLinePairing)} disabled={busy} className={btn.primary}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <MessageCircle size={16} aria-hidden="true" />} {t("settings.line.connect")}
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-[13px] text-[#b93636]">{error}</p>}
    </SectionCard>
  );
}
