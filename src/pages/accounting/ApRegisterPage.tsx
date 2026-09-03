import { useEffect, useState } from "react";
import { BadgeCheck, CalendarDays, Printer, RotateCcw } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { PromptDialog } from "../../components/PromptDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { formatQuoteDateThai } from "../../lib/quotes";
import { fetchApEntries, updateApEntry, type ApEntry } from "../../lib/apEntries";

/**
 * ทะเบียนเจ้าหนี้ (2026-09-03) — จัดกลุ่มตามผู้ขาย ตอบคำถามเดียวที่บัญชีจ่ายถามทุกวัน:
 * *เดือนนี้ค้างจ่ายใครอยู่เท่าไหร่ และใบไหนจ่ายไปแล้ว*
 *
 * แก้ได้อย่างเดียวคือสถานะจ่าย/ยังไม่จ่าย พร้อมเลขที่เช็ค/อ้างอิง — ยอดเงินแก้ที่นี่ไม่ได้เลย
 * ยอดผิดต้องไปยกเลิกรอบการรับที่ใบรับสินค้า ซึ่งย้อนทั้งสต๊อกและหนี้พร้อมกัน ถ้าเปิดให้แก้ยอด
 * ตรงนี้ ทะเบียนกับคลังจะเดินคนละทางทันทีโดยไม่มีอะไรฟ้อง
 */
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function currentMonthLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function thaiMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export function ApRegisterPage({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonthLocal);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; entries?: ApEntry[]; error?: boolean } | null>(null);
  const [payTarget, setPayTarget] = useState<ApEntry | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const key = `${month}#${attempt}`;
    fetchApEntries({ month })
      .then((entries) => { if (!cancelled) setResult({ key, entries }); })
      .catch(() => { if (!cancelled) setResult({ key, error: true }); });
    return () => { cancelled = true; };
  }, [month, attempt]);

  const current = result?.key === `${month}#${attempt}` ? result : null;
  const loading = current === null;
  const loadError = current?.error === true;
  const entries = current?.entries ?? [];

  const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const unpaidTotal = entries.filter((e) => e.status !== "Paid").reduce((s, e) => s + e.total, 0);
  const paidTotal = entries.filter((e) => e.status === "Paid").reduce((s, e) => s + e.total, 0);

  const byVendor = new Map<string, ApEntry[]>();
  for (const e of entries) {
    const key = e.vendorName || t("apRegister.unknownVendor");
    byVendor.set(key, [...(byVendor.get(key) ?? []), e]);
  }
  const vendors = [...byVendor.entries()].sort((a, b) => {
    const unpaid = (rows: ApEntry[]) => rows.filter((r) => r.status !== "Paid").reduce((s, r) => s + r.total, 0);
    return unpaid(b[1]) - unpaid(a[1]);
  });

  const applyStatus = async (entry: ApEntry, status: "Paid" | "Unpaid", paymentRef?: string) => {
    setBusy(true);
    try {
      const updated = await updateApEntry(entry.id, { status, paymentRef });
      setResult((prev) => (prev ? { ...prev, entries: (prev.entries ?? []).map((e) => (e.id === updated.id ? updated : e)) } : prev));
      toast.show(status === "Paid" ? t("apRegister.markedPaidToast") : t("apRegister.clearedPaidToast"));
      setPayTarget(null);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("apRegister.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 print:overflow-visible print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("apRegister.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("apRegister.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("accounting.monthly.monthLabel")}
            <input
              type="month"
              value={month}
              onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
              className="h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
          </label>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 h-9 px-3 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
          >
            <Printer size={13} /> {t("accounting.monthly.printBtn")}
          </button>
        </div>
      </div>

      <p className="hidden print:block text-lg font-semibold">{t("apRegister.printHeadingPrefix")} {thaiMonthLabel(month)}</p>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-muted-foreground">{t("apRegister.loadError")}</p>
          <button onClick={() => setAttempt((a) => a + 1)}
            className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            {t("accounting.monthly.retry")}
          </button>
        </div>
      ) : entries.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t("apRegister.empty.title")} description={`${t("apRegister.empty.descriptionPrefix")} ${thaiMonthLabel(month)}`} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: t("apRegister.kpi.entries"), value: String(entries.length), tone: "text-foreground" },
              { label: t("apRegister.kpi.unpaid"), value: money(unpaidTotal), tone: "text-[#a75d1a]" },
              { label: t("apRegister.kpi.paid"), value: money(paidTotal), tone: "text-[#207e52]" },
            ].map((k) => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-4 print:border-black">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-xl font-semibold font-mono mt-1 ${k.tone}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {vendors.map(([vendorName, rows]) => {
            const vendorUnpaid = rows.filter((r) => r.status !== "Paid").reduce((s, r) => s + r.total, 0);
            return (
              <section key={vendorName} className="bg-card border border-border rounded-xl overflow-hidden print:border-black">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">{vendorName}</h2>
                  <span className="text-xs text-muted-foreground font-mono">{rows[0].vendorTaxId || "—"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {t("apRegister.vendorUnpaid")} <span className={`font-mono font-semibold ${vendorUnpaid > 0 ? "text-[#a75d1a]" : "text-muted-foreground"}`}>{money(vendorUnpaid)}</span>
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {[
                          t("apRegister.col.invoiceDate"), t("apRegister.col.invoiceNumber"), t("apRegister.col.reference"),
                          t("apRegister.col.jobCode"), t("apRegister.col.total"), t("apRegister.col.status"), "",
                        ].map((h, i) => (
                          <th key={h || `spacer-${i}`} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((e) => (
                        <tr key={e.id} className="border-b border-border/50 last:border-0">
                          <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{e.invoiceDate ? formatQuoteDateThai(e.invoiceDate) : "—"}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-foreground whitespace-nowrap">{e.invoiceNumber}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{e.receivingReportNumber}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{e.jobCode || "—"}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-right text-foreground whitespace-nowrap">{money(e.total)}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${e.status === "Paid" ? "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20" : "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20"}`}>
                              {e.status === "Paid" ? t("apRegister.status.paid") : t("apRegister.status.unpaid")}
                            </span>
                            {e.status === "Paid" && e.paymentRef ? <span className="ml-2 text-xs font-mono text-muted-foreground">{e.paymentRef}</span> : null}
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap print:hidden">
                            {canManage && (e.status === "Paid" ? (
                              <button onClick={() => void applyStatus(e, "Unpaid")} disabled={busy}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-all disabled:opacity-60">
                                <RotateCcw size={12} /> {t("apRegister.clearPaidBtn")}
                              </button>
                            ) : (
                              <button onClick={() => setPayTarget(e)} disabled={busy}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-[#207e52] hover:bg-[#2aa36b]/10 transition-all disabled:opacity-60">
                                <BadgeCheck size={12} /> {t("apRegister.markPaidBtn")}
                              </button>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}

      <PromptDialog
        open={payTarget !== null}
        title={t("apRegister.payDialog.title")}
        message={payTarget ? `${payTarget.vendorName} · ${payTarget.invoiceNumber} · ${money(payTarget.total)}` : ""}
        label={t("apRegister.payDialog.label")}
        placeholder={t("apRegister.payDialog.placeholder")}
        confirmLabel={t("apRegister.markPaidBtn")}
        mono
        busy={busy}
        onConfirm={(ref) => { if (payTarget) void applyStatus(payTarget, "Paid", ref); }}
        onCancel={() => setPayTarget(null)}
      />
      <Toast message={toast.message} />
    </div>
  );
}
