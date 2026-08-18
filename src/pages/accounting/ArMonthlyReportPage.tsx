import { useEffect, useState } from "react";
import { CalendarDays, Printer } from "lucide-react";
import { fetchArDocuments, DOC_TYPE_LABEL_KEY, type ArDocument, type ArDocumentType } from "../../lib/accounting";
import { formatQuoteDateThai } from "../../lib/quotes";
import { EmptyState } from "../../components/EmptyState";
import { useI18n } from "../../lib/i18n";

// หน้าสรุปเอกสารบัญชีประจำเดือน — ตอบโจทย์ที่บัญชีขอไว้ (2026-08-18) ว่าต้อง "ดึงข้อมูลได้ว่าเดือนนี้
// เราออกเอกสารเลขที่อะไรไปแล้วบ้าง บริษัทอะไร วันที่เท่าไหร่ รวมทั้งหมดเท่าไหร่ ยอดรวมเท่าไหร่
// เพื่อในการตรวจเช็คเวลาส่งยื่นภาษี" — จัดกลุ่มตามประเภทเอกสาร พร้อมยอดรวมต่อประเภทและยอดรวมใบกำกับภาษี
// Monthly accounting-document summary for tax-filing checks — grouped per document type with
// per-type counts/totals and a tax-invoice (AR+IV) grand total for the VAT return.
const SECTION_ORDER: ArDocumentType[] = ["AR", "IV", "BI", "RE"];

function currentMonthLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function thaiMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

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

  const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
  const active = (docs: ArDocument[]) => docs.filter((d) => d.status === "issued");

  // ยอดรวมใบกำกับภาษี (AR + IV) สำหรับกระทบยอดยื่น ภ.พ.30 — ไม่รวมเอกสารที่ยกเลิก
  const taxInvoices = active(documents.filter((d) => d.docType === "AR" || d.docType === "IV"));
  const taxValueTotal = taxInvoices.reduce((s, d) => s + d.valueAmount, 0);
  const taxVatTotal = taxInvoices.reduce((s, d) => s + d.vatAmount, 0);
  const taxNetTotal = taxInvoices.reduce((s, d) => s + d.netTotal, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 print:overflow-visible print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("accounting.monthly.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("accounting.monthly.subtitle")}</p>
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

      <p className="hidden print:block text-lg font-semibold">{t("accounting.monthly.printHeadingPrefix")} {thaiMonthLabel(month)}</p>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-muted-foreground">{t("accounting.monthly.error.loadFailed")}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
          >
            {t("accounting.monthly.retry")}
          </button>
        </div>
      ) : documents.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t("accounting.monthly.empty.title")} description={`${t("accounting.monthly.empty.descriptionPrefix")} ${thaiMonthLabel(month)}`} />
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl p-4 print:border-black">
            <h2 className="text-sm font-semibold text-foreground mb-2">{t("accounting.monthly.taxSummary.headingPrefix")} {thaiMonthLabel(month)} {t("accounting.monthly.taxSummary.headingSuffix")}</h2>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">{t("accounting.monthly.kpi.count")}</p><p className="font-mono font-bold text-foreground mt-0.5">{taxInvoices.length}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("accounting.monthly.valueBeforeVat")}</p><p className="font-mono font-bold text-foreground mt-0.5">{money(taxValueTotal)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("accounting.monthly.kpi.vat7")}</p><p className="font-mono font-bold text-foreground mt-0.5">{money(taxVatTotal)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("accounting.monthly.kpi.netTotal")}</p><p className="font-mono font-bold text-[#207e52] mt-0.5">{money(taxNetTotal)}</p></div>
            </div>
          </div>

          {SECTION_ORDER.map((docType) => {
            const sectionDocs = documents.filter((d) => d.docType === docType).sort((a, b) => a.docNo.localeCompare(b.docNo));
            if (sectionDocs.length === 0) return null;
            const sectionActive = active(sectionDocs);
            const sectionTotal = sectionActive.reduce((s, d) => s + d.netTotal, 0);
            return (
              <div key={docType} className="bg-card border border-border rounded-xl overflow-hidden print:border-black" style={{ breakInside: "avoid" }}>
                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">{t(DOC_TYPE_LABEL_KEY[docType])} ({docType})</h2>
                  <p className="text-xs text-muted-foreground font-mono">{sectionActive.length} {t("accounting.monthly.unit.copies")} · {t("accounting.monthly.totalPrefix")} {money(sectionTotal)} {t("accounting.monthly.currency.baht")}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {[t("accounting.monthly.col.docNo"), t("accounting.monthly.col.date"), t("accounting.monthly.col.company"), t("accounting.monthly.valueBeforeVat"), "VAT", t("accounting.monthly.col.netTotal"), t("accounting.monthly.col.status")].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sectionDocs.map((d) => (
                        <tr key={d.id} className={`border-b border-border/50 ${d.status === "cancelled" ? "opacity-50" : ""}`}>
                          <td className={`px-4 py-2.5 text-xs font-mono font-semibold whitespace-nowrap ${d.status === "cancelled" ? "line-through text-muted-foreground" : "text-[#c9a84c]"}`}>{d.docNo}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(d.docDate)}</td>
                          <td className="px-4 py-2.5 text-sm text-foreground max-w-[280px] truncate" title={d.customerSnapshot.companyName}>{d.customerSnapshot.companyName}</td>
                          <td className="px-4 py-2.5 text-xs text-foreground font-mono whitespace-nowrap">{money(d.valueAmount)}</td>
                          <td className="px-4 py-2.5 text-xs text-foreground font-mono whitespace-nowrap">{money(d.vatAmount)}</td>
                          <td className="px-4 py-2.5 text-xs text-foreground font-mono whitespace-nowrap">{money(d.netTotal)}</td>
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                            {d.status === "cancelled" ? <span className="text-[#c23f3f]">{t("accounting.monthly.status.cancelled")}</span> : <span className="text-[#207e52]">{t("accounting.monthly.status.active")}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30">
                        <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-foreground">{t("accounting.monthly.totalPrefix")} {sectionActive.length} {t("accounting.monthly.footer.suffix")}</td>
                        <td className="px-4 py-2.5 text-xs font-mono font-bold text-foreground whitespace-nowrap">{money(sectionActive.reduce((s, d) => s + d.valueAmount, 0))}</td>
                        <td className="px-4 py-2.5 text-xs font-mono font-bold text-foreground whitespace-nowrap">{money(sectionActive.reduce((s, d) => s + d.vatAmount, 0))}</td>
                        <td className="px-4 py-2.5 text-xs font-mono font-bold text-foreground whitespace-nowrap">{money(sectionTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
