import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { formatQuoteDateThai } from "../../lib/quotes";
import { fetchApEntries, type ApEntry } from "../../lib/apEntries";
import { ListPageHeader, ListEmpty } from "../../components/ui/ListPage";
import { btn, surface } from "../../components/ui/styles";
import { MonthField, TotalsStrip } from "./accountingUi";
import { currentMonthLocal, money, thaiMonthLabel } from "./accountingFormat";
import { REPORT } from "./reportTable";
import { PurchaseTaxRegisterPrint } from "./legacyReportPrint";

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
 *
 * ดีไซน์ใหม่ 2026-09-30: บนจอรวมชื่อผู้ขายกับเลขประจำตัวผู้เสียภาษีไว้ในช่องเดียว (สองบรรทัด)
 * **ใบพิมพ์ไม่ได้พิมพ์หน้าจอนี้แล้ว** — เจ้าของสั่งให้กระดาษคงแบบเดิม จึงพิมพ์จาก `PurchaseTaxRegisterPrint`
 * (legacyReportPrint.tsx) ส่วนเนื้อหาบนจอห่อด้วย `print:hidden`
 */
export function PurchaseTaxRegisterPage({ currentUserId }: { currentUserId: string }) {
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

  // คำแนะนำประจำหน้า — เล่นเองหลังโหลดเสร็จ (แถบยอดรวม/ตารางยังไม่อยู่บนจอระหว่างโหลด · เดือนที่ไม่มีรายการ ขั้นนั้นถูกข้าม)
  const tourSteps: TourStep[] = [
    { element: '[data-tour="ptax-month"]', manual: "ch14-1", popover: { title: t("tour.ptax.month.title"), description: t("tour.ptax.month.desc"), side: "bottom" } },
    { element: '[data-tour="ptax-print"]', manual: "ch14-1", popover: { title: t("tour.ptax.print.title"), description: t("tour.ptax.print.desc"), side: "bottom" } },
    { element: '[data-tour="ptax-totals"]', manual: "ch14-1", popover: { title: t("tour.ptax.totals.title"), description: t("tour.ptax.totals.desc"), side: "bottom" } },
    { element: '[data-tour="ptax-table"]', manual: "ch14-1", popover: { title: t("tour.ptax.table.title"), description: t("tour.ptax.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("purchaseTaxRegister", currentUserId, tourSteps, { autoStart: !loading });

  const subtotal = entries.reduce((s, e) => s + e.subtotal, 0);
  const vatAmt = entries.reduce((s, e) => s + e.vatAmt, 0);
  const total = entries.reduce((s, e) => s + e.total, 0);

  return (
    <div className={REPORT.page}>
      <div className="print:hidden">
        <ListPageHeader
          module={t("nav.group.accounting")}
          title={t("purchaseTaxRegister.title")}
          description={t("purchaseTaxRegister.subtitle")}
          help={<TourReplayButton variant="title" onClick={tour.start} />}
          actions={<>
            <div data-tour="ptax-month"><MonthField value={month} onChange={setMonth} label={t("accounting.monthly.monthLabel")} /></div>
            <button type="button" data-tour="ptax-print" onClick={() => window.print()} className={btn.secondary}>
              <Printer size={16} /> {t("accounting.monthly.printBtn")}
            </button>
          </>}
        />
      </div>

      {/* กระดาษพิมพ์แบบเดิม (ก่อนเฟส 3) — ดู legacyReportPrint.tsx · เนื้อหาบนจอด้านล่างไม่ขึ้นบนกระดาษ */}
      {!loading && !loadError && <PurchaseTaxRegisterPrint month={month} entries={entries} />}

      <div className="space-y-5 print:hidden">
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : loadError ? (
        <div className={surface.card}>
          <ListEmpty
            title={t("purchaseTaxRegister.loadError")}
            action={<button type="button" onClick={() => setAttempt((a) => a + 1)} className={btn.secondary}>{t("accounting.monthly.retry")}</button>}
          />
        </div>
      ) : entries.length === 0 ? (
        <div className={surface.card}>
          <ListEmpty title={t("purchaseTaxRegister.empty.title")} hint={`${t("purchaseTaxRegister.empty.descriptionPrefix")} ${thaiMonthLabel(month)}`} />
        </div>
      ) : (
        <>
          <div data-tour="ptax-totals">
          <TotalsStrip
            title={`${t("purchaseTaxRegister.summaryHeading")} ${thaiMonthLabel(month)}`}
            items={[
              { label: t("accounting.monthly.kpi.count"), value: entries.length, unit: t("accounting.monthly.unit.copies") },
              { label: t("accounting.monthly.valueBeforeVat"), value: money(subtotal), alignEnd: true },
              { label: t("purchaseTaxRegister.kpi.vat"), value: money(vatAmt), alignEnd: true },
              { label: t("accounting.monthly.kpi.netTotal"), value: money(total), alignEnd: true, strong: true },
            ]}
          />
          </div>

          <section data-tour="ptax-table" className={REPORT.card}>
            <div className={`${REPORT.cardHead} print:hidden`}>
              <h2 className="flex-1 text-base font-semibold text-foreground">{t("purchaseTaxRegister.listHeading")}</h2>
              <span className="text-[13px] text-muted-foreground">{t("ui.itemCount").replace("{n}", String(entries.length))} · {t("accounting.report.amountsInBaht")}</span>
            </div>
            {/* `print:overflow-visible` + คอลัมน์ที่ยอมขึ้นบรรทัดใหม่ — บนกระดาษ A4 ตั้ง (กว้างพิมพ์ได้
                186 มม.) ตารางเก้าคอลัมน์นี้กว้างเกิน `overflow-x-auto` จึงตัดสามคอลัมน์เงินทิ้ง
                (มูลค่าสินค้า/ภาษี/รวม) แล้ววาดแถบเลื่อนของหน้าจอลงบนกระดาษแทน — คือคอลัมน์ที่รายงานนี้
                มีไว้เพื่อพิมพ์โดยเฉพาะ (พบ 2026-09-04 ตอนตรวจใบพิมพ์เป็น PDF จริง) */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className={REPORT.table}>
                <thead>
                  <tr className={REPORT.headRow}>
                    <th className={`${REPORT.thNum} print:text-left`}>{t("purchaseTaxRegister.col.seq")}</th>
                    <th className={REPORT.th}>{t("purchaseTaxRegister.col.invoiceDate")}</th>
                    <th className={REPORT.th}>{t("purchaseTaxRegister.col.invoiceNumber")}</th>
                    <th className={REPORT.th}>
                      {t("purchaseTaxRegister.col.vendor")}
                      <span className="print:hidden"> · {t("purchaseTaxRegister.col.taxId")}</span>
                    </th>
                    <th className={`${REPORT.th} hidden print:table-cell`}>{t("purchaseTaxRegister.col.taxId")}</th>
                    <th className={REPORT.th}>{t("purchaseTaxRegister.col.reference")}</th>
                    <th className={`${REPORT.thNum}`}>{t("purchaseTaxRegister.col.value")}</th>
                    <th className={`${REPORT.thNum}`}>{t("purchaseTaxRegister.col.vat")}</th>
                    <th className={`${REPORT.thNum}`}>{t("purchaseTaxRegister.col.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={e.id} className={REPORT.row}>
                      <td className={`${REPORT.td} ${REPORT.num} text-muted-foreground print:text-left`}>{i + 1}</td>
                      <td className={`${REPORT.td} text-[#3d5173]`}>{e.invoiceDate ? formatQuoteDateThai(e.invoiceDate) : "—"}</td>
                      <td className={`${REPORT.td} font-mono text-[13px] text-foreground`}>{e.invoiceNumber}</td>
                      <td className={`${REPORT.td} max-w-[280px] print:max-w-none`}>
                        <span className="flex flex-col leading-snug min-w-0">
                          <span className="font-medium text-foreground truncate print:overflow-visible print:whitespace-normal print:text-clip" title={e.vendorName}>{e.vendorName || "—"}</span>
                          <span className="font-mono text-xs text-muted-foreground print:hidden">{e.vendorTaxId || "—"}</span>
                        </span>
                      </td>
                      <td className={`${REPORT.td} hidden print:table-cell font-mono text-muted-foreground`}>{e.vendorTaxId || "—"}</td>
                      <td className={`${REPORT.td} font-mono text-[13px] text-[#3d5173]`}>{e.receivingReportNumber}</td>
                      <td className={`${REPORT.td} ${REPORT.num} text-foreground`}>{money(e.subtotal)}</td>
                      <td className={`${REPORT.td} ${REPORT.num} text-foreground`}>{money(e.vatAmt)}</td>
                      <td className={`${REPORT.td} ${REPORT.num} font-semibold text-foreground`}>{money(e.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={REPORT.footRow}>
                    <td className={`${REPORT.td} text-foreground`} colSpan={5}>{t("purchaseTaxRegister.grandTotal")}</td>
                    {/* คอลัมน์เลขผู้เสียภาษีที่ซ่อนบนจอ — บนกระดาษช่องรวมต้องกินเพิ่มอีกหนึ่งช่อง */}
                    <td className={`${REPORT.td} hidden print:table-cell`} />
                    <td className={`${REPORT.td} ${REPORT.num} text-foreground`}>{money(subtotal)}</td>
                    <td className={`${REPORT.td} ${REPORT.num} text-foreground`}>{money(vatAmt)}</td>
                    <td className={`${REPORT.td} ${REPORT.num} text-foreground`}>{money(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
      </div>
    </div>
  );
}
