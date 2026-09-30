import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { fetchArDocuments, DOC_TYPE_LABEL_KEY, type ArDocument, type ArDocumentType } from "../../lib/accounting";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ListPageHeader, ListEmpty } from "../../components/ui/ListPage";
import { btn, surface } from "../../components/ui/styles";
import { MonthField, Pill, TotalsStrip } from "./accountingUi";
import { currentMonthLocal, money, thaiMonthLabel } from "./accountingFormat";
import { REPORT } from "./reportTable";
import { MonthlyReportPrint } from "./legacyReportPrint";

// หน้าสรุปเอกสารบัญชีประจำเดือน — ตอบโจทย์ที่บัญชีขอไว้ (2026-08-18) ว่าต้อง "ดึงข้อมูลได้ว่าเดือนนี้
// เราออกเอกสารเลขที่อะไรไปแล้วบ้าง บริษัทอะไร วันที่เท่าไหร่ รวมทั้งหมดเท่าไหร่ ยอดรวมเท่าไหร่
// เพื่อในการตรวจเช็คเวลาส่งยื่นภาษี" — จัดกลุ่มตามประเภทเอกสาร พร้อมยอดรวมต่อประเภทและยอดรวมใบกำกับภาษี
// Monthly accounting-document summary for tax-filing checks — grouped per document type with
// per-type counts/totals and a tax-invoice (AR+IV) grand total for the VAT return.
// ใบพิมพ์ไม่ได้พิมพ์หน้าจอนี้แล้ว — เจ้าของสั่งให้กระดาษคงแบบเดิม (2026-09-30) จึงพิมพ์จาก
// `MonthlyReportPrint` (legacyReportPrint.tsx) ส่วนเนื้อหาบนจอห่อด้วย `print:hidden` แต่งได้อิสระ
const SECTION_ORDER: ArDocumentType[] = ["AR", "IV", "BI", "RE"];

export function ArMonthlyReportPage() {
  const { t } = useI18n();
  const [month, setMonth] = useState(currentMonthLocal);
  const [attempt, setAttempt] = useState(0);
  // เก็บผลลัพธ์พร้อม key ของรอบที่ fetch — สถานะ loading/error คำนวณจากการเทียบ key แทนการ
  // setState แบบ synchronous ใน effect (ต้องห้ามตาม react-hooks/set-state-in-effect)
  // Result keyed by its fetch round; loading/error are derived by key comparison instead of
  // synchronous setState inside the effect.
  const [result, setResult] = useState<{ key: string; documents?: ArDocument[]; error?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = `${month}#${attempt}`;
    fetchArDocuments({ month })
      .then((docs) => { if (!cancelled) setResult({ key, documents: docs }); })
      .catch(() => { if (!cancelled) setResult({ key, error: true }); });
    return () => { cancelled = true; };
  }, [month, attempt]);

  const current = result?.key === `${month}#${attempt}` ? result : null;
  const loading = current === null;
  const loadError = current?.error === true;
  const documents = current?.documents ?? [];

  const active = (docs: ArDocument[]) => docs.filter((d) => d.status === "issued");

  // ยอดรวมใบกำกับภาษี (AR + IV) สำหรับกระทบยอดยื่น ภ.พ.30 — ไม่รวมเอกสารที่ยกเลิก
  const taxInvoices = active(documents.filter((d) => d.docType === "AR" || d.docType === "IV"));
  const taxValueTotal = taxInvoices.reduce((s, d) => s + d.valueAmount, 0);
  const taxVatTotal = taxInvoices.reduce((s, d) => s + d.vatAmount, 0);
  const taxNetTotal = taxInvoices.reduce((s, d) => s + d.netTotal, 0);
  const copies = t("accounting.monthly.unit.copies");

  return (
    <div className={REPORT.page}>
      <div className="print:hidden">
        <ListPageHeader
          module={t("nav.group.accounting")}
          title={t("accounting.monthly.title")}
          description={t("accounting.monthly.subtitle")}
          actions={<>
            <MonthField value={month} onChange={setMonth} label={t("accounting.monthly.monthLabel")} />
            <button type="button" onClick={() => window.print()} className={btn.secondary}>
              <Printer size={16} /> {t("accounting.monthly.printBtn")}
            </button>
          </>}
        />
      </div>

      {/* กระดาษพิมพ์แบบเดิม (ก่อนเฟส 3) — ดู legacyReportPrint.tsx · เนื้อหาบนจอด้านล่างไม่ขึ้นบนกระดาษ */}
      {!loading && !loadError && <MonthlyReportPrint month={month} documents={documents} />}

      <div className="space-y-5 print:hidden">
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : loadError ? (
        <div className={surface.card}>
          <ListEmpty
            title={t("accounting.monthly.error.loadFailed")}
            action={<button type="button" onClick={() => setAttempt((a) => a + 1)} className={btn.secondary}>{t("accounting.monthly.retry")}</button>}
          />
        </div>
      ) : documents.length === 0 ? (
        <div className={surface.card}>
          <ListEmpty title={t("accounting.monthly.empty.title")} hint={`${t("accounting.monthly.empty.descriptionPrefix")} ${thaiMonthLabel(month)}`} />
        </div>
      ) : (
        <>
          <TotalsStrip
            title={`${t("accounting.monthly.taxSummary.headingPrefix")} ${thaiMonthLabel(month)}`}
            sub={t("accounting.monthly.taxSummary.headingSuffix")}
            items={[
              { label: t("accounting.monthly.kpi.count"), value: taxInvoices.length, unit: copies },
              { label: t("accounting.monthly.valueBeforeVat"), value: money(taxValueTotal), alignEnd: true },
              { label: t("accounting.monthly.kpi.vat7"), value: money(taxVatTotal), alignEnd: true },
              { label: t("accounting.monthly.kpi.netTotal"), value: money(taxNetTotal), alignEnd: true, strong: true },
            ]}
          />

          {SECTION_ORDER.map((docType) => {
            const sectionDocs = documents.filter((d) => d.docType === docType).sort((a, b) => a.docNo.localeCompare(b.docNo));
            if (sectionDocs.length === 0) return null;
            const sectionActive = active(sectionDocs);
            const sectionTotal = sectionActive.reduce((s, d) => s + d.netTotal, 0);
            return (
              <section key={docType} className={REPORT.card} style={{ breakInside: "avoid" }}>
                <div className={REPORT.cardHead}>
                  <span className="h-[22px] px-2 rounded-md bg-[#eef1f6] text-[#3d5173] text-xs font-semibold font-mono inline-flex items-center print:hidden">{docType}</span>
                  <h2 className="flex-1 text-base font-semibold text-foreground print:text-sm">{t(DOC_TYPE_LABEL_KEY[docType])} ({docType})</h2>
                  <p className="text-[13px] text-muted-foreground print:text-xs">
                    {sectionActive.length} {copies} · {t("accounting.monthly.totalPrefix")} <span className="font-semibold tabular-nums text-foreground">{money(sectionTotal)}</span> {t("accounting.monthly.currency.baht")}
                  </p>
                </div>
                <div className="overflow-x-auto print:overflow-visible">
                  <table className={REPORT.table}>
                    <thead>
                      <tr className={REPORT.headRow}>
                        <th className={REPORT.th}>{t("accounting.monthly.col.docNo")}</th>
                        <th className={REPORT.th}>{t("accounting.monthly.col.date")}</th>
                        <th className={REPORT.th}>{t("accounting.monthly.col.company")}</th>
                        <th className={`${REPORT.thNum}`}>{t("accounting.monthly.valueBeforeVat")}</th>
                        <th className={`${REPORT.thNum}`}>VAT</th>
                        <th className={`${REPORT.thNum}`}>{t("accounting.monthly.col.netTotal")}</th>
                        <th className={REPORT.th}>{t("accounting.monthly.col.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionDocs.map((d) => {
                        const cancelled = d.status === "cancelled";
                        const strike = cancelled ? "line-through text-[#8a97ad]" : "text-foreground";
                        return (
                          <tr key={d.id} className={`${REPORT.row} ${cancelled ? "print:opacity-50" : ""}`}>
                            <td className={`${REPORT.td} font-mono text-[13px] font-medium ${strike}`}>{d.docNo}</td>
                            <td className={`${REPORT.td} ${cancelled ? "text-[#8a97ad]" : "text-[#3d5173]"}`}>{formatQuoteDateThai(d.docDate)}</td>
                            <td className={`${REPORT.td} font-medium max-w-[280px] truncate print:max-w-none print:overflow-visible print:text-clip ${cancelled ? "text-[#8a97ad]" : "text-foreground"}`} title={d.customerSnapshot.companyName}>{d.customerSnapshot.companyName}</td>
                            <td className={`${REPORT.td} ${REPORT.num} ${strike}`}>{money(d.valueAmount)}</td>
                            <td className={`${REPORT.td} ${REPORT.num} ${strike}`}>{money(d.vatAmount)}</td>
                            <td className={`${REPORT.td} ${REPORT.num} font-semibold ${strike}`}>{money(d.netTotal)}</td>
                            <td className={REPORT.td}>
                              {cancelled
                                ? <Pill tone="grey" label={t("accounting.monthly.status.cancelled")} struck />
                                : <Pill tone="blue" label={t("accounting.monthly.status.active")} />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className={REPORT.footRow}>
                        <td colSpan={3} className={REPORT.td}>{t("accounting.monthly.totalPrefix")} {sectionActive.length} {t("accounting.monthly.footer.suffix")}</td>
                        <td className={`${REPORT.td} ${REPORT.num}`}>{money(sectionActive.reduce((s, d) => s + d.valueAmount, 0))}</td>
                        <td className={`${REPORT.td} ${REPORT.num}`}>{money(sectionActive.reduce((s, d) => s + d.vatAmount, 0))}</td>
                        <td className={`${REPORT.td} ${REPORT.num}`}>{money(sectionTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            );
          })}
        </>
      )}
      </div>
    </div>
  );
}
