import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Loader2, PackagePlus } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { fmt } from "../../lib/quotes";
import type { DiscountMode } from "../../lib/quoteMath";
import {
  type ReceivingReport, type ReceiveBatchInput, type ReceivingPriceType,
  outstandingQtyOf, batchTotals, priceTypeOf, dueDateOf, billerOf, RECEIVING_PRICE_TYPES, RECEIVING_PRICE_TYPE_LABEL_KEY,
  batchLineDiscountAmt, defaultBatchLineDiscount,
} from "../../lib/receivingReport";
import { useKitRecipes } from "../../hooks/useKitRecipes";
import { Drawer } from "../../components/ui/Overlays";
import { Field, ReadonlyField, SelectBox } from "../../components/ui/Field";
import { btn, field } from "../../components/ui/styles";
import { DiscountInput, SuffixInput } from "./receivingUi";
import { formatDisplayDate } from "../../lib/displayDate";
import { DateInput } from "../../components/DateInput";

/**
 * แผง "บันทึกรับของ" — หนึ่งรอบการรับ ตามที่เจ้าของสั่ง: *"มีช่องให้กรอกแบบราคาต่อหน่วยเท่าไหร่
 * จำนวนเท่าไหร่ กี่บาท"* · ดีไซน์ใหม่ (2026-09-30) เป็นแผงกว้าง 880 จากขวา แทนหน้าต่างกลางจอ
 *
 * ตั้งต้นให้ทุกบรรทัด = ยอดค้างรับเต็ม ที่ราคาตามใบสั่งซื้อ (กรณีที่พบบ่อยที่สุดคือของมาครบตามที่สั่ง)
 * ผู้ใช้แก้ลงได้ทีละบรรทัด · บรรทัดที่รับครบแล้วไม่แสดงในแผงนี้เลย
 */
export function ReceiveBatchDialog({
  doc, busy, onCancel, onSubmit,
}: {
  doc: ReceivingReport;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (batch: ReceiveBatchInput) => void;
}) {
  const { t } = useI18n();
  // สินค้าชุด (2026-09-29) รับเข้าเป็นชุดไม่ได้ — เตือนตั้งแต่บรรทัด ให้สั่งซื้อ/รับเข้าเป็นชิ้นส่วน
  const kits = useKitRecipes();
  const today = new Date().toISOString().slice(0, 10);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const pending = useMemo(
    () => doc.lines.filter((l) => outstandingQtyOf(doc, l) > 0),
    [doc],
  );

  const [receivedDate, setReceivedDate] = useState(today);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [vatRate, setVatRate] = useState<string>(doc.orderVatRate !== null && doc.orderVatRate !== undefined ? String(doc.orderVatRate) : "7");
  // เงื่อนไขบิล (2026-09-24) ตั้งต้นจากหัวใบ แก้ได้เฉพาะรอบนี้ถ้าบิลจริงต่างไป
  const [priceType, setPriceType] = useState<ReceivingPriceType>(priceTypeOf({ priceType: doc.priceType, vatRate: doc.orderVatRate }));
  // ส่วนลดแบบบาทคือส่วนลดของทั้งบิล — รับหลายรอบต้องตั้งต้นเฉพาะส่วนที่ยังไม่ได้หักในรอบก่อน ๆ
  // ไม่งั้นทุกรอบหักเต็มจำนวนซ้ำ ยอดหนี้รวมต่ำกว่าบิลจริง (แบบ % หักตามสัดส่วนของรอบอยู่แล้ว ใช้ค่าเดิมได้)
  const [discount, setDiscount] = useState<string>(() => {
    if (!doc.orderDiscount) return "";
    if ((doc.orderDiscountMode ?? "percent") !== "amount") return String(doc.orderDiscount);
    const used = doc.batches.reduce((sum, b) => sum + (b.discountAmt ?? 0), 0);
    const remaining = Math.round(Math.max(0, doc.orderDiscount - used) * 100) / 100;
    return remaining > 0 ? String(remaining) : "";
  });
  const [discountMode, setDiscountMode] = useState<DiscountMode>(doc.orderDiscountMode ?? "percent");
  const [creditDays, setCreditDays] = useState<string>(doc.creditDays !== null && doc.creditDays !== undefined ? String(doc.creditDays) : "");
  const [receivedBy, setReceivedBy] = useState("");
  const [remark, setRemark] = useState("");
  // ส่วนลดรายบรรทัด (2026-09-29) ตั้งต้นจากบรรทัดของใบ (แบบบาท = ส่วนที่ยังไม่ได้หักในรอบก่อน)
  const [rows, setRows] = useState<Record<string, { qty: string; unitPrice: string; discount: string; discountMode: DiscountMode }>>(() =>
    Object.fromEntries(pending.map((l) => {
      const d = defaultBatchLineDiscount(doc, l);
      return [l.id, {
        qty: String(outstandingQtyOf(doc, l)),
        unitPrice: String(l.unitPriceOrdered ?? 0),
        discount: d.discount === null ? "" : String(d.discount),
        discountMode: d.discountMode,
      }];
    })),
  );
  const [error, setError] = useState("");

  // แผงวาดอยู่ใต้คอมโพเนนต์นี้ effect ของแผงจึงรันก่อน — โฟกัสช่องเลขที่ใบกำกับที่นี่ชนะเสมอ
  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const vatParsed = vatRate.trim() === "" ? null : Number(vatRate);
  const vat = priceType === "none" || !Number.isFinite(vatParsed as number) ? null : vatParsed;
  const discountNum = discount.trim() === "" ? null : Math.max(0, Number(discount) || 0);
  const credit = creditDays.trim() === "" ? null : Math.max(0, Math.floor(Number(creditDays) || 0));
  const dueDate = dueDateOf(invoiceDate, credit);
  const biller = billerOf(doc);
  const activeLines = pending
    .map((l) => {
      const row = rows[l.id];
      const qty = num(row?.qty ?? "");
      const unitPrice = Math.max(0, Number(row?.unitPrice ?? 0) || 0);
      const discount = !row || row.discount.trim() === "" ? null : Math.max(0, Number(row.discount) || 0);
      const discountMode = row?.discountMode ?? "percent";
      return { lineId: l.id, qty, unitPrice, discount, discountMode, discountAmt: batchLineDiscountAmt(qty, unitPrice, discount, discountMode) };
    })
    .filter((r) => r.qty > 0);
  const totals = batchTotals(activeLines, vat, { priceType, discount: discountNum, discountMode });

  const submit = () => {
    if (!invoiceNumber.trim()) { setError(t("receivingReportDoc.receive.errorInvoice")); return; }
    if (activeLines.length === 0) { setError(t("receivingReportDoc.receive.errorNoLines")); return; }
    const over = pending.find((l) => num(rows[l.id]?.qty ?? "") > outstandingQtyOf(doc, l));
    if (over) { setError(t("receivingReportDoc.receive.errorOverReceive").replace("{item}", over.productCode || over.description)); return; }
    setError("");
    if (discountMode === "percent" && (discountNum ?? 0) > 100) { setError(t("receivingReportDoc.receive.errorDiscount")); return; }
    if (activeLines.some((l) => l.discountMode === "percent" && (l.discount ?? 0) > 100)) { setError(t("receivingReportDoc.receive.errorDiscount")); return; }
    if (doc.billerCustom && !(doc.billerName ?? "").trim()) { setError(t("receivingReportDoc.receive.errorBiller")); return; }
    onSubmit({
      receivedDate, invoiceNumber: invoiceNumber.trim(), invoiceDate,
      vatRate: vat, priceType, discount: discountNum, discountMode, creditDays: credit,
      receivedBy: receivedBy.trim(), remark: remark.trim(),
      lines: activeLines.map(({ lineId, qty, unitPrice, discount, discountMode }) => ({ lineId, qty, unitPrice, discount, discountMode })),
    });
  };

  const setRow = (id: string, patch: Partial<{ qty: string; unitPrice: string; discount: string; discountMode: DiscountMode }>) =>
    setRows((p) => ({ ...p, [id]: { ...(p[id] ?? { qty: "", unitPrice: "", discount: "", discountMode: "percent" as DiscountMode }), ...patch } }));

  const vatLabel = priceType === "none" ? t("receivingReportDoc.summary.noVat") : t("receivingReportDoc.summary.vat").replace("{rate}", String(totals.vatRate ?? 0));
  const breakdown = [
    totals.discountAmt > 0 ? `${t("receivingReportDoc.summary.discount")} ${fmt(totals.discountAmt)}` : "",
    `${t("receivingReportDoc.receive.subtotal")} ${fmt(totals.subtotal)}`,
    `${vatLabel} ${fmt(totals.vatAmt)}`,
  ].filter(Boolean).join(" · ");
  const grid = "grid grid-cols-[minmax(0,1fr)_48px_64px_92px_104px_124px_96px] gap-2.5 items-center px-3.5";

  return (
    <Drawer
      open
      wide
      busy={busy}
      onClose={onCancel}
      title={t("receivingReportDoc.receive.title").replace("{seq}", String(doc.batches.length + 1))}
      subtitle={[
        doc.documentNumber || doc.id,
        doc.vendorName,
        t("receivingReportDoc.receive.pendingCount").replace("{n}", String(pending.length)),
      ].filter(Boolean).join(" · ")}
      footerLeft={
        <div className="flex flex-col leading-tight">
          <span className="text-xs text-muted-foreground">{t("receivingReportDoc.receive.totalThisRound")}</span>
          <span className="text-xl font-bold tabular-nums text-foreground">฿{fmt(totals.total)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{t("receivingReportDoc.summary.gross")} {fmt(totals.gross)} · {breakdown}</span>
          {/* ข้อผิดพลาดอยู่ท้ายแผงที่มองเห็นเสมอ — รายการยาวแล้วข้อความในเนื้อหาจะหลุดจอตอนกดปุ่มบันทึก */}
          {error && <span className={`${field.error} mt-1`} role="alert">{error}</span>}
        </div>
      }
      footerRight={
        <>
          <button type="button" onClick={onCancel} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={submit} disabled={busy} className={btn.primary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />} {t("receivingReportDoc.receive.submit")}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[15px] font-semibold text-foreground">{t("receivingReportDoc.receive.billSection")}</h3>
            <span className="text-xs text-muted-foreground">{t("receivingReportDoc.receive.billHint")}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-start">
            <Field label={t("receivingReportDoc.receive.invoiceNumber")} htmlFor="rb-invoice" required className="sm:col-span-2">
              <input id="rb-invoice" ref={firstFieldRef} className={`${field.input} w-full font-mono`} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </Field>
            <Field label={t("receivingReportDoc.receive.invoiceDate")} htmlFor="rb-invoice-date">
              <DateInput id="rb-invoice-date" className={`${field.input} w-full`} value={invoiceDate} onChange={(v) => setInvoiceDate(v)} />
            </Field>
            <Field label={t("receivingReportDoc.receive.receivedDate")} htmlFor="rb-received-date">
              <DateInput id="rb-received-date" className={`${field.input} w-full`} value={receivedDate} onChange={(v) => setReceivedDate(v)} />
            </Field>
            <Field label={t("receivingReportDoc.priceType")} htmlFor="rb-price-type">
              <SelectBox id="rb-price-type" value={priceType} onChange={(e) => setPriceType(e.target.value as ReceivingPriceType)}>
                {RECEIVING_PRICE_TYPES.map((p) => <option key={p} value={p}>{t(RECEIVING_PRICE_TYPE_LABEL_KEY[p])}</option>)}
              </SelectBox>
            </Field>
            {priceType === "none" ? (
              <ReadonlyField label={t("receivingReportDoc.receive.vatRate")} value="" className="pt-1" />
            ) : (
              <Field label={t("receivingReportDoc.receive.vatRate")} htmlFor="rb-vat">
                <SuffixInput id="rb-vat" min={0} max={100} value={vatRate} onChange={setVatRate} suffix="%" />
              </Field>
            )}
            {/* ความกว้างอยู่ที่กรอบ ช่องข้างในไม่มี w-* ของตัวเอง (บทเรียนช่องส่วนลดล้นทับ "ผู้ออกบิล" 2026-09-24/29) */}
            <Field label={t("receivingReportDoc.discount")}>
              <DiscountInput value={discount} mode={discountMode} onValue={setDiscount} onMode={setDiscountMode} ariaLabel={t("receivingReportDoc.discount")} />
            </Field>
            <Field
              label={t("receivingReportDoc.creditDays")}
              htmlFor="rb-credit"
              help={<>{t("receivingReportDoc.dueDate")} <span className="font-mono">{dueDate ? formatDisplayDate(dueDate) : "—"}</span></>}
            >
              <SuffixInput id="rb-credit" min={0} integer value={creditDays} onChange={setCreditDays} suffix={t("receivingReportDoc.daysUnit")} />
            </Field>
            <ReadonlyField label={t("receivingReportDoc.biller")} value={biller.name} className="sm:col-span-2 pt-1" />
            <Field label={t("receivingReportDoc.receive.receivedBy")} htmlFor="rb-received-by" className="sm:col-span-2">
              <input id="rb-received-by" className={`${field.input} w-full`} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder={t("receivingReportDoc.receive.receivedByPlaceholder")} />
            </Field>
          </div>
        </section>

        <div className="h-px bg-[#eef1f6]" />

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="flex-1 text-[15px] font-semibold text-foreground">{t("receivingReportDoc.receive.linesSection")}</h3>
            <span className="text-xs text-muted-foreground">{t("receivingReportDoc.receive.linesHint")}</span>
          </div>
          <div className="border border-border rounded-[10px] overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`${grid} h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]`}>
                <span>{t("receivingReportDoc.col.item")}</span>
                <span>{t("receivingReportDoc.col.unit")}</span>
                <span className="text-right">{t("receivingReportDoc.col.outstanding")}</span>
                <span className="text-right">{t("receivingReportDoc.receive.qty")}</span>
                <span className="text-right">{t("receivingReportDoc.receive.unitPrice")}</span>
                <span>{t("receivingReportDoc.col.discount")}</span>
                <span className="text-right">{t("receivingReportDoc.receive.amount")}</span>
              </div>
              {pending.map((line) => {
                const row = rows[line.id] ?? { qty: "", unitPrice: "", discount: "", discountMode: "percent" as DiscountMode };
                const qty = num(row.qty);
                const price = Math.max(0, Number(row.unitPrice) || 0);
                const lineDiscountAmt = batchLineDiscountAmt(qty, price, row.discount.trim() === "" ? null : Math.max(0, Number(row.discount) || 0), row.discountMode);
                const outstanding = outstandingQtyOf(doc, line);
                return (
                  <div key={line.id} className={`${grid} py-2 border-b border-[#eef1f6] last:border-b-0`}>
                    <span className="flex flex-col min-w-0 leading-snug">
                      <span className="text-sm font-medium text-foreground truncate" title={line.description}>{line.description}</span>
                      <span className="text-xs font-mono text-muted-foreground">{line.productCode || "—"}</span>
                      {kits.has(line.productId ?? "") && <span className="text-xs text-[#b93636]">{t("kit.receiveBlocked")}</span>}
                    </span>
                    <span className="text-sm text-[#3d5173]">{line.unit || "—"}</span>
                    <span className="text-sm text-right tabular-nums text-muted-foreground">{fmt(outstanding)}</span>
                    <input
                      type="number" min={0} max={outstanding}
                      className={`${qty > outstanding ? field.cell.replace("border-[#c3ccda]", "border-[#b93636]") : field.cell} w-full min-w-0 text-right tabular-nums`}
                      aria-label={`${t("receivingReportDoc.receive.qty")} ${line.description}`}
                      value={row.qty}
                      onChange={(e) => setRow(line.id, { qty: e.target.value })}
                    />
                    <input
                      type="number" min={0}
                      className={`${field.cell} w-full min-w-0 text-right tabular-nums`}
                      aria-label={`${t("receivingReportDoc.receive.unitPrice")} ${line.description}`}
                      value={row.unitPrice}
                      onChange={(e) => setRow(line.id, { unitPrice: e.target.value })}
                    />
                    <DiscountInput small value={row.discount} mode={row.discountMode}
                      onValue={(v) => setRow(line.id, { discount: v })} onMode={(m) => setRow(line.id, { discountMode: m })}
                      ariaLabel={`${t("receivingReportDoc.col.discount")} ${line.description}`} />
                    <span className="text-sm font-semibold text-right tabular-nums text-foreground">{fmt(qty * price - lineDiscountAmt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <Field label={t("receivingReportDoc.receive.remark")} htmlFor="rb-remark">
          <textarea id="rb-remark" rows={2} className={`${field.textarea} w-full`} value={remark} onChange={(e) => setRemark(e.target.value)} />
        </Field>

        <div className="rounded-[10px] bg-[#e8f0fb] border border-[#b9d0f0] px-3.5 py-3 flex gap-2.5 text-[#16407a]">
          <Info size={16} className="flex-shrink-0 mt-0.5" />
          <span className="text-[13px] leading-relaxed">{t("receivingReportDoc.receive.hint")}</span>
        </div>
      </div>
    </Drawer>
  );
}
