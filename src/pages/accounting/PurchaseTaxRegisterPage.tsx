import { useEffect, useState } from "react";
import { CalendarDays, Printer } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { useI18n } from "../../lib/i18n";
import { formatQuoteDateThai } from "../../lib/quotes";
import { fetchApEntries, type ApEntry } from "../../lib/apEntries";

/**
 * ทะเบียนภาษีซื้อ (2026-09-03) — เจ้าของสั่งไว้ท้ายรายการงานสโตร์ว่าการรับของต้อง *"ได้ทะเบียน
 * รายงานภาษีซื้อ"* ออกมาด้วย
 *
 * เป็นคู่ตรงข้ามของทะเบียนภาษีขาย (`ArMonthlyReportPage`) และลอกโครงมาจากที่นั่นทั้งหมด รวมถึง
 * วิธีพิมพ์แบบ Pattern B (พิมพ์หน้าจอตัวเองด้วย `print:hidden` / `hidden print:block` ไม่มีไฟล์
 * ใบพิมพ์แยก) เพราะรายงานหน้านี้**คือตารางเดียวกับที่เห็นบนจอ** ไม่ใช่ฟอร์มกระดาษคนละใบ
 *
 * ทุกแถวมาจากการรับของในใบรับสินค้า — บัญชีไม่ได้คีย์เอง ตัวเลขจึงกระทบยอดกับสต๊อกได้เสมอ
 * เดือนที่กรองคือเดือนของ **ใบกำกับภาษี** ไม่ใช่วันที่บันทึก (ดู `monthRange()` ใน apHandler.ts)
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

export function PurchaseTaxRegisterPage() {
  const { t } = useI18n();
  const [month, setMonth] = useState(currentMonthLocal);
  const [attempt, setAttempt] = useState(0);
  // เก็บผลลัพธ์พร้อม key ของรอบที่ fetch — loading/error คำนวณจากการเทียบ key เพื่อไม่ต้อง
  // setState แบบ synchronous ใน effect (แนวเดียวกับ ArMonthlyReportPage)
  const [result, setResult] = useState<{ key: string; entries?: ApEntry[]; error?: boolean } | null>(null);

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
  const subtotal = entries.reduce((s, e) => s + e.subtotal, 0);
  const vatAmt = entries.reduce((s, e) => s + e.vatAmt, 0);
  const total = entries.reduce((s, e) => s + e.total, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 print:overflow-visible print:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("purchaseTaxRegister.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("purchaseTaxRegister.subtitle")}</p>
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

      <p className="hidden print:block text-lg font-semibold">{t("purchaseTaxRegister.printHeadingPrefix")} {thaiMonthLabel(month)}</p>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-muted-foreground">{t("purchaseTaxRegister.loadError")}</p>
          <button onClick={() => setAttempt((a) => a + 1)}
            className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            {t("accounting.monthly.retry")}
          </button>
        </div>
      ) : entries.length === 0 ? (
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
            {/* `print:overflow-visible` + คอลัมน์ที่ยอมขึ้นบรรทัดใหม่ — บนกระดาษ A4 ตั้ง (กว้างพิมพ์ได้
                186 มม.) ตารางเก้าคอลัมน์นี้กว้างเกิน `overflow-x-auto` จึงตัดสามคอลัมน์เงินทิ้ง
                (มูลค่าสินค้า/ภาษี/รวม) แล้ววาดแถบเลื่อนของหน้าจอลงบนกระดาษแทน — คือคอลัมน์ที่รายงานนี้
                มีไว้เพื่อพิมพ์โดยเฉพาะ (พบ 2026-09-04 ตอนตรวจใบพิมพ์เป็น PDF จริง) */}
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
