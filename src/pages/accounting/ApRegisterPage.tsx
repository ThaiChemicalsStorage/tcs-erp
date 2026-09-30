import { useEffect, useState } from "react";
import { BadgeCheck, Building2, Printer, RotateCcw } from "lucide-react";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { formatQuoteDateThai } from "../../lib/quotes";
import { fetchApEntries, updateApEntry, type ApEntry } from "../../lib/apEntries";
import { ListPageHeader, ListEmpty } from "../../components/ui/ListPage";
import { Field } from "../../components/ui/Field";
import { btn, field, surface } from "../../components/ui/styles";
import { AccountingDialog, MonthField, Pill, SummaryBox, TotalsStrip } from "./accountingUi";
import { currentMonthLocal, groupApEntriesByVendor, money, thaiMonthLabel } from "./accountingFormat";
import { REPORT } from "./reportTable";
import { ApRegisterPrint } from "./legacyReportPrint";

/**
 * ทะเบียนเจ้าหนี้ (2026-09-03) — จัดกลุ่มตามผู้ขาย ตอบคำถามเดียวที่บัญชีจ่ายถามทุกวัน:
 * *เดือนนี้ค้างจ่ายใครอยู่เท่าไหร่ และใบไหนจ่ายไปแล้ว*
 *
 * แก้ได้อย่างเดียวคือสถานะจ่าย/ยังไม่จ่าย พร้อมเลขที่เช็ค/อ้างอิง — ยอดเงินแก้ที่นี่ไม่ได้เลย
 * ยอดผิดต้องไปยกเลิกรอบการรับที่ใบรับสินค้า ซึ่งย้อนทั้งสต๊อกและหนี้พร้อมกัน ถ้าเปิดให้แก้ยอด
 * ตรงนี้ ทะเบียนกับคลังจะเดินคนละทางทันทีโดยไม่มีอะไรฟ้อง
 *
 * ดีไซน์ใหม่ 2026-09-30 (เจ้าของอนุมัติ): จากตารางแยกใบละผู้ขาย เป็นตารางเดียวที่มีแถวหัวกลุ่มผู้ขาย
 * (ชื่อ · เลขผู้เสียภาษี · ค้างจ่าย) คั่นก่อนรายการของผู้ขายนั้น — ลำดับผู้ขายเหมือนเดิม (ค้างมากสุดก่อน)
 * **เฉพาะบนจอ** — ใบพิมพ์ยังเป็นตารางแยกใบละผู้ขายแบบเดิมตามที่เจ้าของสั่ง (`ApRegisterPrint` ใน legacyReportPrint.tsx)
 */
const COLS = 7;

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

  const unpaidTotal = entries.filter((e) => e.status !== "Paid").reduce((s, e) => s + e.total, 0);
  const paidTotal = entries.filter((e) => e.status === "Paid").reduce((s, e) => s + e.total, 0);
  const vendors = groupApEntriesByVendor(entries, t("apRegister.unknownVendor"));

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
    <div className={REPORT.page}>
      <div className="print:hidden">
        <ListPageHeader
          module={t("nav.group.accounting")}
          title={t("apRegister.title")}
          description={t("apRegister.subtitle")}
          actions={<>
            <MonthField value={month} onChange={setMonth} label={t("accounting.monthly.monthLabel")} />
            <button type="button" onClick={() => window.print()} className={btn.secondary}>
              <Printer size={16} /> {t("accounting.monthly.printBtn")}
            </button>
          </>}
        />
      </div>

      {/* กระดาษพิมพ์แบบเดิม (ก่อนเฟส 3) — ดู legacyReportPrint.tsx · เนื้อหาบนจอด้านล่างไม่ขึ้นบนกระดาษ */}
      {!loading && !loadError && <ApRegisterPrint month={month} entries={entries} />}

      <div className="space-y-5 print:hidden">
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : loadError ? (
        <div className={surface.card}>
          <ListEmpty
            title={t("apRegister.loadError")}
            action={<button type="button" onClick={() => setAttempt((a) => a + 1)} className={btn.secondary}>{t("accounting.monthly.retry")}</button>}
          />
        </div>
      ) : entries.length === 0 ? (
        <div className={surface.card}>
          <ListEmpty title={t("apRegister.empty.title")} hint={`${t("apRegister.empty.descriptionPrefix")} ${thaiMonthLabel(month)}`} />
        </div>
      ) : (
        <>
          <TotalsStrip
            items={[
              { label: t("apRegister.kpi.entries"), value: entries.length },
              { label: t("apRegister.kpi.unpaid"), value: money(unpaidTotal), dot: "#d89614", alignEnd: true, bold: true },
              { label: t("apRegister.kpi.paid"), value: money(paidTotal), dot: "#1b7f4f", alignEnd: true },
            ]}
          />

          <section className={REPORT.card}>
            <div className={`${REPORT.cardHead} print:hidden`}>
              <h2 className="flex-1 text-base font-semibold text-foreground">{t("apRegister.listHeading")}</h2>
              <span className="text-[13px] text-muted-foreground">{t("apRegister.vendorCount").replace("{n}", String(vendors.length))} · {t("accounting.report.amountsInBaht")}</span>
            </div>
            <div className="overflow-x-auto print:overflow-visible">
              <table className={REPORT.table}>
                <thead>
                  <tr className={REPORT.headRow}>
                    <th className={REPORT.th}>{t("apRegister.col.invoiceDate")}</th>
                    <th className={REPORT.th}>{t("apRegister.col.invoiceNumber")}</th>
                    <th className={REPORT.th}>{t("apRegister.col.reference")}</th>
                    <th className={REPORT.th}>{t("apRegister.col.jobCode")}</th>
                    <th className={REPORT.thNum}>{t("apRegister.col.total")}</th>
                    <th className={REPORT.th}>{t("apRegister.col.status")}</th>
                    {/* คอลัมน์ปุ่มจัดการซ่อนตอนพิมพ์ — หัวต้องหายไปด้วย ไม่งั้นบนกระดาษยังกินความกว้างเป็นคอลัมน์เปล่า */}
                    <th className={`${REPORT.th} print:hidden`}><span className="sr-only">{t("accounting.list.col.actions")}</span></th>
                  </tr>
                </thead>
                {vendors.map((g) => (
                  <tbody key={g.vendorName} style={{ breakInside: "avoid" }}>
                    <tr className="bg-[#fbfcfe] border-b border-border">
                      <td colSpan={COLS} className="px-6 h-12 print:h-auto print:px-1 print:py-1">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span aria-hidden="true" className="w-7 h-7 rounded-md bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0 print:hidden"><Building2 size={15} /></span>
                          <span className="font-semibold text-sm text-foreground print:text-xs">{g.vendorName}</span>
                          <span className="font-mono text-xs text-muted-foreground">{g.vendorTaxId || "—"}</span>
                          <span className="flex-1" />
                          <span className="text-[13px] text-muted-foreground print:text-xs">{t("apRegister.vendorUnpaid")}</span>
                          <span className={`min-w-[110px] text-right font-bold tabular-nums text-sm print:text-xs ${g.unpaid > 0 ? "text-foreground" : "text-[#8a97ad]"}`}>{money(g.unpaid)}</span>
                        </span>
                      </td>
                    </tr>
                    {g.rows.map((e) => {
                      const paid = e.status === "Paid";
                      return (
                        <tr key={e.id} className={REPORT.row}>
                          <td className={`${REPORT.td} text-[#3d5173]`}>{e.invoiceDate ? formatQuoteDateThai(e.invoiceDate) : "—"}</td>
                          <td className={`${REPORT.td} font-mono text-[13px] font-medium text-foreground`}>{e.invoiceNumber}</td>
                          <td className={`${REPORT.td} font-mono text-[13px] text-[#3d5173]`}>{e.receivingReportNumber}</td>
                          <td className={`${REPORT.td} font-mono text-[13px] ${e.jobCode ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{e.jobCode || "—"}</td>
                          <td className={`${REPORT.td} ${REPORT.num} font-semibold text-foreground`}>{money(e.total)}</td>
                          <td className={REPORT.td}>
                            <span className="flex flex-col items-start gap-0.5">
                              {paid ? <Pill tone="green" label={t("apRegister.status.paid")} /> : <Pill tone="amber" label={t("apRegister.status.unpaid")} />}
                              {paid && e.paymentRef ? <span className="font-mono text-xs text-muted-foreground">{e.paymentRef}</span> : null}
                            </span>
                          </td>
                          <td className={`${REPORT.td} text-right print:hidden`}>
                            {canManage && (paid ? (
                              <button type="button" onClick={() => void applyStatus(e, "Unpaid")} disabled={busy}
                                className="h-8 px-2.5 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground transition-colors disabled:opacity-60">
                                <RotateCcw size={14} /> {t("apRegister.clearPaidBtn")}
                              </button>
                            ) : (
                              <button type="button" onClick={() => setPayTarget(e)} disabled={busy} className={btn.secondarySm.replace("h-9", "h-8")}>
                                <BadgeCheck size={14} /> {t("apRegister.markPaidBtn")}
                              </button>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>
          </section>
        </>
      )}
      </div>

      {payTarget && (
        <MarkPaidDialog
          entry={payTarget}
          busy={busy}
          onConfirm={(ref) => void applyStatus(payTarget, "Paid", ref)}
          onCancel={() => setPayTarget(null)}
        />
      )}
      <Toast message={toast.message} />
    </div>
  );
}

// บันทึกการจ่ายเงิน — เลขที่เช็ค/อ้างอิงไม่บังคับ (เหมือนเดิม) · มีกล่องสรุปให้เห็นว่ากำลังปิดหนี้ใบไหน
function MarkPaidDialog({ entry, busy, onConfirm, onCancel }: {
  entry: ApEntry;
  busy: boolean;
  onConfirm: (paymentRef: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [ref, setRef] = useState("");
  const submit = () => { if (!busy) onConfirm(ref.trim()); };
  return (
    <AccountingDialog
      open
      tone="success"
      icon={BadgeCheck}
      title={t("apRegister.payDialog.title")}
      message={t("apRegister.payDialog.message")}
      confirmLabel={t("apRegister.markPaidBtn")}
      confirmIcon={BadgeCheck}
      busy={busy}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <SummaryBox
        primary={entry.vendorName || t("apRegister.unknownVendor")}
        secondary={<>{t("apRegister.payDialog.invoicePrefix")} <span className="font-mono">{entry.invoiceNumber}</span> · <span className="font-mono">{entry.receivingReportNumber}</span></>}
        amountLabel={t("apRegister.col.total")}
        amount={`฿${money(entry.total)}`}
      />
      <Field label={t("apRegister.payDialog.label")} htmlFor="ap-payment-ref">
        <input
          id="ap-payment-ref"
          autoFocus
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder={t("apRegister.payDialog.placeholder")}
          className={`${field.input} w-full font-mono`}
        />
      </Field>
    </AccountingDialog>
  );
}
