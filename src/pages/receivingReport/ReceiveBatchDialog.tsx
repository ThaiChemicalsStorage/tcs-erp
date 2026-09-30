import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PackagePlus, X } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { fmt } from "../../lib/quotes";
import { formatQuoteDateThai } from "../../lib/quotes";
import type { DiscountMode } from "../../lib/quoteMath";
import {
  type ReceivingReport, type ReceiveBatchInput, type ReceivingPriceType,
  outstandingQtyOf, batchTotals, priceTypeOf, dueDateOf, billerOf, RECEIVING_PRICE_TYPES, RECEIVING_PRICE_TYPE_LABEL_KEY,
  batchLineDiscountAmt, defaultBatchLineDiscount,
} from "../../lib/receivingReport";
import { useKitRecipes } from "../../hooks/useKitRecipes";

const inputCls = "w-full px-3 py-2 text-sm bg-white border border-[#c3ccda] rounded-lg text-foreground outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors";
const cellCls = "w-24 px-2 py-1.5 text-sm text-right bg-white border border-[#c3ccda] rounded outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors";
/** ช่องที่ความกว้างมาจากตัวห่อ — ไม่มี w-* ของตัวเอง (inputCls มี w-full ซึ่งชนะ w-20 แล้วช่องล้นทับช่องข้าง ๆ) */
const boxCls = "w-full px-2 py-1.5 text-sm bg-white border border-[#c3ccda] rounded outline-none focus:border-[#1a5fb4] focus:ring-2 focus:ring-[#1a5fb4]/20 transition-colors";

/**
 * กล่อง "บันทึกรับของ" — หนึ่งรอบการรับ ตามที่เจ้าของสั่ง: *"มีช่องให้กรอกแบบราคาต่อหน่วยเท่าไหร่
 * จำนวนเท่าไหร่ กี่บาท"*
 *
 * ตั้งต้นให้ทุกบรรทัด = ยอดค้างรับเต็ม ที่ราคาตามใบสั่งซื้อ (กรณีที่พบบ่อยที่สุดคือของมาครบตามที่สั่ง)
 * ผู้ใช้แก้ลงได้ทีละบรรทัด · บรรทัดที่รับครบแล้วไม่แสดงในกล่องนี้เลย
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

  useEffect(() => { firstFieldRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="receive-batch-title">
      <div className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 id="receive-batch-title" className="text-base font-semibold text-foreground">
            {t("receivingReportDoc.receive.title").replace("{seq}", String(doc.batches.length + 1))}
          </h2>
          <button onClick={onCancel} disabled={busy} className="text-muted-foreground hover:text-foreground disabled:opacity-50" aria-label={t("common.cancel")}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.receive.invoiceNumber")} *</span>
              <input ref={firstFieldRef} className={inputCls} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.receive.invoiceDate")}</span>
              <input type="date" className={inputCls} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.receive.receivedDate")}</span>
              <input type="date" className={inputCls} value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.creditDays")}</span>
              <input type="number" min={0} className={inputCls} value={creditDays} onChange={(e) => setCreditDays(e.target.value)} />
              <span className="text-xs text-muted-foreground block mt-1">
                {t("receivingReportDoc.dueDate")}: <span className="font-mono">{dueDate ? formatQuoteDateThai(dueDate) : "—"}</span>
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.priceType")}</span>
              <select className={inputCls} value={priceType} onChange={(e) => setPriceType(e.target.value as ReceivingPriceType)}>
                {RECEIVING_PRICE_TYPES.map((p) => <option key={p} value={p}>{t(RECEIVING_PRICE_TYPE_LABEL_KEY[p])}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.receive.vatRate")}</span>
              <input type="number" min={0} max={100} className={`${inputCls} disabled:opacity-60`} disabled={priceType === "none"}
                value={priceType === "none" ? "" : vatRate} onChange={(e) => setVatRate(e.target.value)} />
            </label>
            <div className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.discount")}</span>
              {/* ความกว้างอยู่ที่ตัวห่อ (บั๊ก 2026-09-29: inputCls มี w-full ซึ่งชนะ w-20 ช่อง %/บาทจึงกว้างเต็มคอลัมน์แล้วล้นทับ "ผู้ออกบิล")
                  — แก้แบบเดียวกับช่องส่วนลดหน้าใบรับสินค้าเมื่อ 2026-09-24 */}
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <input type="number" min={0} className={inputCls} value={discount} aria-label={t("receivingReportDoc.discount")} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div className="w-20 shrink-0">
                  <select className={inputCls} value={discountMode} aria-label={t("receivingReportDoc.discountMode")}
                    onChange={(e) => setDiscountMode(e.target.value === "amount" ? "amount" : "percent")}>
                    <option value="percent">%</option>
                    <option value="amount">{t("receivingReportDoc.discountBaht")}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="block">
              <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.biller")}</span>
              <p className="text-sm text-foreground py-2 truncate" title={biller.name}>{biller.name || "—"}</p>
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[
                    t("receivingReportDoc.col.item"), t("receivingReportDoc.col.unit"), t("receivingReportDoc.col.outstanding"),
                    t("receivingReportDoc.receive.qty"), t("receivingReportDoc.receive.unitPrice"), t("receivingReportDoc.col.discount"), t("receivingReportDoc.receive.amount"),
                  ].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map((line) => {
                  const row = rows[line.id] ?? { qty: "", unitPrice: "", discount: "", discountMode: "percent" as DiscountMode };
                  const qty = num(row.qty);
                  const price = Math.max(0, Number(row.unitPrice) || 0);
                  const lineDiscountAmt = batchLineDiscountAmt(qty, price, row.discount.trim() === "" ? null : Math.max(0, Number(row.discount) || 0), row.discountMode);
                  const outstanding = outstandingQtyOf(doc, line);
                  return (
                    <tr key={line.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 text-sm text-foreground">
                        <span className="font-mono text-xs text-muted-foreground mr-2">{line.productCode || "—"}</span>
                        {line.description}
                        {kits.has(line.productId ?? "") && <span className="block text-xs text-[#c23f3f] mt-0.5">{t("kit.receiveBlocked")}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{line.unit || "—"}</td>
                      <td className="px-3 py-2 text-xs font-mono text-right text-muted-foreground">{fmt(outstanding)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number" min={0} max={outstanding} className={`${cellCls} ${qty > outstanding ? "border-[#e05252]" : ""}`}
                          aria-label={`${t("receivingReportDoc.receive.qty")} ${line.description}`}
                          value={row.qty}
                          onChange={(e) => setRows((p) => ({ ...p, [line.id]: { ...row, qty: e.target.value } }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number" min={0} className={cellCls}
                          aria-label={`${t("receivingReportDoc.receive.unitPrice")} ${line.description}`}
                          value={row.unitPrice}
                          onChange={(e) => setRows((p) => ({ ...p, [line.id]: { ...row, unitPrice: e.target.value } }))}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <div className="w-20 shrink-0">
                            <input type="number" min={0} className={`${boxCls} text-right`} value={row.discount}
                              aria-label={`${t("receivingReportDoc.col.discount")} ${line.description}`}
                              onChange={(e) => setRows((p) => ({ ...p, [line.id]: { ...row, discount: e.target.value } }))} />
                          </div>
                          <div className="w-16 shrink-0">
                            <select className={boxCls} value={row.discountMode} aria-label={`${t("receivingReportDoc.discountMode")} ${line.description}`}
                              onChange={(e) => setRows((p) => ({ ...p, [line.id]: { ...row, discountMode: e.target.value === "amount" ? "amount" : "percent" } }))}>
                              <option value="percent">%</option>
                              <option value="amount">{t("receivingReportDoc.discountBaht")}</option>
                            </select>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm font-mono text-right text-foreground">{fmt(qty * price - lineDiscountAmt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.receive.receivedBy")}</span>
                <input className={inputCls} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder={t("receivingReportDoc.receive.receivedByPlaceholder")} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground block mb-1.5">{t("receivingReportDoc.receive.remark")}</span>
                <textarea rows={2} className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} />
              </label>
            </div>
            <dl className="bg-secondary/40 border border-border rounded-lg p-4 space-y-2 self-start">
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">{t("receivingReportDoc.summary.gross")}</dt>
                <dd className="font-mono text-foreground">{fmt(totals.gross)}</dd>
              </div>
              {totals.discountAmt > 0 && (
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">{t("receivingReportDoc.summary.discount")}</dt>
                  <dd className="font-mono text-foreground">{fmt(-totals.discountAmt)}</dd>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">{t("receivingReportDoc.receive.subtotal")}</dt>
                <dd className="font-mono text-foreground">{fmt(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-muted-foreground">
                  {priceType === "none" ? t("receivingReportDoc.summary.noVat") : t("receivingReportDoc.summary.vat").replace("{rate}", String(totals.vatRate ?? 0))}
                </dt>
                <dd className="font-mono text-foreground">{fmt(totals.vatAmt)}</dd>
              </div>
              <div className="flex justify-between text-base font-semibold border-t border-border pt-2">
                <dt className="text-foreground">{t("receivingReportDoc.receive.total")}</dt>
                <dd className="font-mono text-[#c9a84c]">{fmt(totals.total)}</dd>
              </div>
            </dl>
          </div>

          {error && <p className="text-xs text-[#e05252]" role="alert">{error}</p>}
          <p className="text-xs text-muted-foreground">{t("receivingReportDoc.receive.hint")}</p>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-border sticky bottom-0 bg-card">
          <button onClick={onCancel} disabled={busy} className="px-4 py-2 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
            {t("common.cancel")}
          </button>
          <button onClick={submit} disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#0b1d3a] text-white rounded-lg hover:bg-[#1a2f55] transition-colors disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <PackagePlus size={13} />} {t("receivingReportDoc.receive.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
