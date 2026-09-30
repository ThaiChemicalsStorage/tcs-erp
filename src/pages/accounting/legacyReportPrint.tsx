import { CalendarDays } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { DOC_TYPE_LABEL_KEY, type ArDocument, type ArDocumentType } from "../../lib/accounting";
import type { ApEntry } from "../../lib/apEntries";
import { useI18n } from "../../lib/i18n";
import { formatQuoteDateThai } from "../../lib/quotes";
import { groupApEntriesByVendor, money, thaiMonthLabel } from "./accountingFormat";

/**
 * ใบพิมพ์ของสามหน้ารายงานบัญชีที่ "พิมพ์หน้าจอตัวเอง" (Pattern B) — สรุปเอกสารประจำเดือน · ทะเบียนภาษีซื้อ · ทะเบียนเจ้าหนี้
 *
 * REDESIGN เฟส 3 (2026-09-30) เปลี่ยนหน้าจอสามหน้านี้ และเพราะหน้าพิมพ์คือหน้าจอ ใบพิมพ์จึงเปลี่ยนตามไปด้วย
 * เจ้าของดูแล้วตอบว่า *"เอาตามระบบเดิมเลย"* — **บนกระดาษต้องออกมาเหมือนก่อนเฟส 3 ทุกอย่าง**
 * จึงแยกตัวพิมพ์ไว้ที่นี่: markup ด้านล่างลอกจากหน้าเดิม (commit 9e123f5) ตรงตัว เฉพาะส่วนที่เคยขึ้นบนกระดาษ
 * (ตัดของที่เป็น `print:hidden` อยู่แล้วออก) · แต่ละหน้าห่อเนื้อหาบนจอด้วย `print:hidden` แล้ววาง component
 * ที่นี่ไว้ใน `hidden print:block` — แต่งหน้าจอต่อได้อิสระโดยไม่กระทบใบพิมพ์ **ห้ามแต่งไฟล์นี้ให้ตามดีไซน์ใหม่**
 * (class ที่ไม่มี `print:` นำหน้าก็มีผลบนกระดาษ — เป็นหน้าตาที่ตรวจเป็น PDF จริงไว้แล้ว 2026-09-04)
 */

const MONTHLY_SECTION_ORDER: ArDocumentType[] = ["AR", "IV", "BI", "RE"];

/** สรุปเอกสารบัญชีประจำเดือน — ใบพิมพ์แบบเดิม */
export function MonthlyReportPrint({ month, documents }: { month: string; documents: ArDocument[] }) {
  const { t } = useI18n();
  const active = (docs: ArDocument[]) => docs.filter((d) => d.status === "issued");
  const taxInvoices = active(documents.filter((d) => d.docType === "AR" || d.docType === "IV"));
  const taxValueTotal = taxInvoices.reduce((s, d) => s + d.valueAmount, 0);
  const taxVatTotal = taxInvoices.reduce((s, d) => s + d.vatAmount, 0);
  const taxNetTotal = taxInvoices.reduce((s, d) => s + d.netTotal, 0);

  return (
    <div className="hidden print:block space-y-5">
      <p className="text-lg font-semibold">{t("accounting.monthly.printHeadingPrefix")} {thaiMonthLabel(month)}</p>
      {documents.length === 0 ? (
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

          {MONTHLY_SECTION_ORDER.map((docType) => {
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
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="w-full print:text-[9px]">
                    <thead>
                      <tr className="border-b border-border">
                        {[t("accounting.monthly.col.docNo"), t("accounting.monthly.col.date"), t("accounting.monthly.col.company"), t("accounting.monthly.valueBeforeVat"), "VAT", t("accounting.monthly.col.netTotal"), t("accounting.monthly.col.status")].map((h) => (
                          <th key={h} className="px-4 py-2.5 print:px-1 print:py-1 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap print:whitespace-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sectionDocs.map((d) => (
                        <tr key={d.id} className={`border-b border-border/50 ${d.status === "cancelled" ? "opacity-50" : ""}`}>
                          <td className={`px-4 py-2.5 print:px-1 print:py-1 text-xs font-mono font-semibold whitespace-nowrap print:whitespace-normal ${d.status === "cancelled" ? "line-through text-muted-foreground" : "text-[#c9a84c]"}`}>{d.docNo}</td>
                          <td className="px-4 py-2.5 print:px-1 print:py-1 text-xs text-muted-foreground font-mono whitespace-nowrap print:whitespace-normal">{formatQuoteDateThai(d.docDate)}</td>
                          <td className="px-4 py-2.5 print:px-1 print:py-1 text-sm text-foreground max-w-[280px] truncate print:max-w-none print:overflow-visible print:whitespace-normal print:text-clip" title={d.customerSnapshot.companyName}>{d.customerSnapshot.companyName}</td>
                          <td className="px-4 py-2.5 print:px-1 print:py-1 text-xs text-foreground font-mono whitespace-nowrap print:whitespace-normal">{money(d.valueAmount)}</td>
                          <td className="px-4 py-2.5 print:px-1 print:py-1 text-xs text-foreground font-mono whitespace-nowrap print:whitespace-normal">{money(d.vatAmount)}</td>
                          <td className="px-4 py-2.5 print:px-1 print:py-1 text-xs text-foreground font-mono whitespace-nowrap print:whitespace-normal">{money(d.netTotal)}</td>
                          <td className="px-4 py-2.5 print:px-1 print:py-1 text-xs whitespace-nowrap print:whitespace-normal">
                            {d.status === "cancelled" ? <span className="text-[#c23f3f]">{t("accounting.monthly.status.cancelled")}</span> : <span className="text-[#207e52]">{t("accounting.monthly.status.active")}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/30">
                        <td colSpan={3} className="px-4 py-2.5 print:px-1 print:py-1 text-xs font-semibold text-foreground">{t("accounting.monthly.totalPrefix")} {sectionActive.length} {t("accounting.monthly.footer.suffix")}</td>
                        <td className="px-4 py-2.5 print:px-1 print:py-1 text-xs font-mono font-bold text-foreground whitespace-nowrap print:whitespace-normal">{money(sectionActive.reduce((s, d) => s + d.valueAmount, 0))}</td>
                        <td className="px-4 py-2.5 print:px-1 print:py-1 text-xs font-mono font-bold text-foreground whitespace-nowrap print:whitespace-normal">{money(sectionActive.reduce((s, d) => s + d.vatAmount, 0))}</td>
                        <td className="px-4 py-2.5 print:px-1 print:py-1 text-xs font-mono font-bold text-foreground whitespace-nowrap print:whitespace-normal">{money(sectionTotal)}</td>
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

/** ทะเบียนภาษีซื้อ — ใบพิมพ์แบบเดิม */
export function PurchaseTaxRegisterPrint({ month, entries }: { month: string; entries: ApEntry[] }) {
  const { t } = useI18n();
  const subtotal = entries.reduce((s, e) => s + e.subtotal, 0);
  const vatAmt = entries.reduce((s, e) => s + e.vatAmt, 0);
  const total = entries.reduce((s, e) => s + e.total, 0);

  return (
    <div className="hidden print:block space-y-5">
      <p className="text-lg font-semibold">{t("purchaseTaxRegister.printHeadingPrefix")} {thaiMonthLabel(month)}</p>
      {entries.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t("purchaseTaxRegister.empty.title")} description={`${t("purchaseTaxRegister.empty.descriptionPrefix")} ${thaiMonthLabel(month)}`} />
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl p-4 print:border-black">
            <h2 className="text-sm font-semibold text-foreground mb-2">{t("purchaseTaxRegister.summaryHeading")} {thaiMonthLabel(month)}</h2>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-muted-foreground">{t("accounting.monthly.kpi.count")}</p><p className="font-mono font-bold text-foreground mt-0.5">{entries.length}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("accounting.monthly.valueBeforeVat")}</p><p className="font-mono font-bold text-foreground mt-0.5">{money(subtotal)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("purchaseTaxRegister.kpi.vat")}</p><p className="font-mono font-bold text-foreground mt-0.5">{money(vatAmt)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("accounting.monthly.kpi.netTotal")}</p><p className="font-mono font-bold text-[#207e52] mt-0.5">{money(total)}</p></div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden print:border-black">
            {/* `print:overflow-visible` + คอลัมน์ที่ยอมขึ้นบรรทัดใหม่ — ตารางเก้าคอลัมน์นี้กว้างเกิน A4 ตั้ง
                ถ้าตัดด้วย `overflow-x-auto` สามคอลัมน์เงินจะหายจากกระดาษ (พบ 2026-09-04 ตอนตรวจใบพิมพ์เป็น PDF จริง) */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full print:text-[9px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {[
                      t("purchaseTaxRegister.col.seq"), t("purchaseTaxRegister.col.invoiceDate"), t("purchaseTaxRegister.col.invoiceNumber"),
                      t("purchaseTaxRegister.col.vendor"), t("purchaseTaxRegister.col.taxId"), t("purchaseTaxRegister.col.reference"),
                      t("purchaseTaxRegister.col.value"), t("purchaseTaxRegister.col.vat"), t("purchaseTaxRegister.col.total"),
                    ].map((h) => (
                      <th key={h} className="px-3 py-2.5 print:px-1 print:py-1 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap print:whitespace-normal print:tracking-normal">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id} className="border-b border-border/50">
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-muted-foreground whitespace-nowrap print:whitespace-normal">{e.invoiceDate ? formatQuoteDateThai(e.invoiceDate) : "—"}</td>
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-foreground whitespace-nowrap print:whitespace-normal">{e.invoiceNumber}</td>
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-sm text-foreground max-w-[240px] truncate print:max-w-none print:overflow-visible print:whitespace-normal print:text-clip" title={e.vendorName}>{e.vendorName || "—"}</td>
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-muted-foreground whitespace-nowrap print:whitespace-normal">{e.vendorTaxId || "—"}</td>
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-muted-foreground whitespace-nowrap print:whitespace-normal">{e.receivingReportNumber}</td>
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-right text-foreground whitespace-nowrap print:whitespace-normal">{money(e.subtotal)}</td>
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-right text-foreground whitespace-nowrap print:whitespace-normal">{money(e.vatAmt)}</td>
                      <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-right font-semibold text-foreground whitespace-nowrap print:whitespace-normal">{money(e.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40">
                    <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-semibold text-foreground" colSpan={6}>{t("purchaseTaxRegister.grandTotal")}</td>
                    <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-right font-semibold text-foreground">{money(subtotal)}</td>
                    <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-right font-semibold text-foreground">{money(vatAmt)}</td>
                    <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-right font-semibold text-[#207e52]">{money(total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** ทะเบียนเจ้าหนี้ — ใบพิมพ์แบบเดิม (ตารางแยกใบละผู้ขาย · ไม่มีคอลัมน์ปุ่มจัดการ ซึ่งเดิมก็ซ่อนตอนพิมพ์) */
export function ApRegisterPrint({ month, entries }: { month: string; entries: ApEntry[] }) {
  const { t } = useI18n();
  const unpaidTotal = entries.filter((e) => e.status !== "Paid").reduce((s, e) => s + e.total, 0);
  const paidTotal = entries.filter((e) => e.status === "Paid").reduce((s, e) => s + e.total, 0);
  const vendors = groupApEntriesByVendor(entries, t("apRegister.unknownVendor"));

  return (
    <div className="hidden print:block space-y-5">
      <p className="text-lg font-semibold">{t("apRegister.printHeadingPrefix")} {thaiMonthLabel(month)}</p>
      {entries.length === 0 ? (
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

          {vendors.map(({ vendorName, rows, unpaid }) => (
            <section key={vendorName} className="bg-card border border-border rounded-xl overflow-hidden print:border-black">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">{vendorName}</h2>
                <span className="text-xs text-muted-foreground font-mono">{rows[0].vendorTaxId || "—"}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {t("apRegister.vendorUnpaid")} <span className={`font-mono font-semibold ${unpaid > 0 ? "text-[#a75d1a]" : "text-muted-foreground"}`}>{money(unpaid)}</span>
                </span>
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {[
                        t("apRegister.col.invoiceDate"), t("apRegister.col.invoiceNumber"), t("apRegister.col.reference"),
                        t("apRegister.col.jobCode"), t("apRegister.col.total"), t("apRegister.col.status"),
                      ].map((h) => (
                        <th key={h} className="px-3 py-2.5 print:px-1 print:py-1 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id} className="border-b border-border/50 last:border-0">
                        <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-muted-foreground whitespace-nowrap">{e.invoiceDate ? formatQuoteDateThai(e.invoiceDate) : "—"}</td>
                        <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-foreground whitespace-nowrap">{e.invoiceNumber}</td>
                        <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-muted-foreground whitespace-nowrap">{e.receivingReportNumber}</td>
                        <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-muted-foreground whitespace-nowrap">{e.jobCode || "—"}</td>
                        <td className="px-3 py-2.5 print:px-1 print:py-1 text-xs font-mono text-right text-foreground whitespace-nowrap">{money(e.total)}</td>
                        <td className="px-3 py-2.5 print:px-1 print:py-1 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${e.status === "Paid" ? "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20" : "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20"}`}>
                            {e.status === "Paid" ? t("apRegister.status.paid") : t("apRegister.status.unpaid")}
                          </span>
                          {e.status === "Paid" && e.paymentRef ? <span className="ml-2 text-xs font-mono text-muted-foreground">{e.paymentRef}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
