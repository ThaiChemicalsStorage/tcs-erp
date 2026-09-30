import { useEffect, useState } from "react";
import { Plus, Trash2, Printer, FileText, PackageMinus, Loader2, AlertCircle } from "lucide-react";
import type { ArDocument } from "../../lib/accounting";
import { deductArDocumentStock, DOC_TYPE_LABEL_KEY } from "../../lib/accounting";
import type { Product } from "../../lib/products";
import { fetchProducts } from "../../lib/products";
import { fetchStockMovements, type StockMovement } from "../../lib/stock";
import { formatQuoteDateThai } from "../../lib/quotes";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { DocumentHeader, NextStepHint } from "../../components/ui/DocumentLayout";
import { SectionCard } from "../../components/ui/SectionCard";
import { ReadonlyField } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { Pill } from "./accountingUi";
import { money } from "./accountingFormat";

interface DraftLine {
  key: number;
  productId: string;
  qty: string;
}

const LINES_GRID = "grid-cols-[minmax(0,1fr)_100px_130px]";
const DEDUCT_GRID = "grid-cols-[minmax(0,1fr)_132px_36px]";
const HISTORY_GRID = "grid-cols-[minmax(0,1fr)_80px_110px]";

// มุมมองแบบ 2 ฝั่งของใบกำกับภาษี/ใบส่งสินค้า (IV) เพิ่ม 2026-08-18 ตามคำขอโดยตรง — ฝั่งซ้ายไว้ดูใบ
// ฝั่งขวาไว้ตัดสต๊อก เหตุผลที่ต้องเลือกสินค้าเองต่อรายการ (ไม่ auto-map จากบรรทัดใบกำกับภาษี) คือ
// QuoteLine ไม่มี productId เชื่อมกับ Product Library เลย (ดูหมายเหตุใน handleStockDeduction,
// api/_lib/arHandler.ts) — ให้พนักงานเลือกเองว่าอะไรออกจากคลังจริง และตัดได้หลายรอบตามที่ของจริงทยอยออก
// A dual-pane view of an IV document — left: read-only summary, right: manual stock cutting.
export function ArStockPanel({ doc, backLabel, receiptDocNo, canAdjust, onBack, onDocumentUpdated, onPrint, onNcrPrint }: {
  doc: ArDocument;
  backLabel: string;
  /** ใบเสร็จ (ยังใช้งาน) ที่ออกให้ใบนี้แล้ว — แสดงข้างเลขที่บนหัวหน้า */
  receiptDocNo?: string;
  canAdjust: boolean;
  onBack: () => void;
  onDocumentUpdated: (updated: ArDocument) => void;
  /** ปุ่มพิมพ์ในหน้านี้เรียก state เดียวกับหน้ารายการ (ดู ArDocumentListPage.tsx) — ป้ายกำกับ
   * "ตัดสต๊อกแล้ว"/"ยังไม่ตัดสต๊อก" บนเอกสารพิมพ์จึงตรงกับสถานะ doc.stockDeducted ปัจจุบันเสมอ ไม่ใช่
   * ตัวเลือกแยกสองแบบที่พิมพ์ผลต่างจากความจริง (จะผิดหลักการตรวจสอบบัญชี) */
  onPrint: () => void;
  onNcrPrint: () => void;
}) {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([{ key: 1, productId: "", qty: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchProducts().then((p) => { if (!cancelled) setProducts(p); }).catch(() => { if (!cancelled) toast.show(t("accounting.stockPanel.toast.loadProductsFailed")); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // เก็บผลลัพธ์พร้อม key ของรอบที่ fetch — loading คำนวณจากการเทียบ key แทนการ setState แบบ
  // synchronous ใน effect (ต้องห้ามตาม react-hooks/set-state-in-effect) — pattern เดียวกับ
  // AccountingDashboardPage.tsx
  const [movementsResult, setMovementsResult] = useState<{ key: string; movements: StockMovement[] } | null>(null);
  const [movementsRetryToken, setMovementsRetryToken] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const key = `${doc.id}#${movementsRetryToken}`;
    fetchStockMovements({ sourceId: doc.id })
      .then((movements) => { if (!cancelled) setMovementsResult({ key, movements }); })
      // ต้องมี catch เสมอ — ไม่งั้น request ที่พังจะกลายเป็น unhandled rejection และแผงประวัติค้างที่
      // "กำลังโหลด" ตลอดไป (ผลลัพธ์รอบนี้ไม่ถูก set สักที) — pattern เดียวกับ StockPage.tsx
      .catch(() => { if (!cancelled) { setMovementsResult({ key, movements: [] }); toast.show(t("accounting.stockPanel.toast.loadProductsFailed")); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, movementsRetryToken]);
  const movementsKey = `${doc.id}#${movementsRetryToken}`;
  const movements = movementsResult?.key === movementsKey ? movementsResult.movements : [];
  const loadingMovements = movementsResult?.key !== movementsKey;

  const productById = (id: string) => products.find((p) => p.id === id);

  const updateLine = (key: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const addLine = () => { setLines((prev) => [...prev, { key: nextKey, productId: "", qty: "" }]); setNextKey((n) => n + 1); };
  const removeLine = (key: number) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const handleDeduct = async () => {
    if (busy) return;
    const payload = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => ({ productId: l.productId, qty: Number(l.qty) }));
    if (payload.length === 0) { setError(t("accounting.stockPanel.error.selectRequired")); return; }

    setBusy(true);
    setError("");
    try {
      const { document } = await deductArDocumentStock(doc.id, payload);
      onDocumentUpdated(document);
      setLines([{ key: nextKey, productId: "", qty: "" }]);
      setNextKey((n) => n + 1);
      setMovementsRetryToken((n) => n + 1);
      toast.show(t("accounting.stockPanel.toast.deducted"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("accounting.stockPanel.error.deductFailed"));
    } finally {
      setBusy(false);
    }
  };

  const canDeduct = canAdjust && doc.status === "issued";

  return (
    // print:hidden — แผงนี้เป็นอีก view ของหน้ารายการ (ArDocumentListPage) ที่ไม่ early-return ทิ้ง
    // เอกสารพิมพ์ด้านล่าง ปุ่มพิมพ์ในแผงนี้จึงสั่ง window.print() ทั้งที่แผงยังอยู่บนจอ — ถ้าไม่ซ่อน
    // หน้าจอทั้งแผงจะออกกระดาษมาปนกับตัวเอกสาร (ดูหมายเหตุ print:hidden ใน ArDocumentListPage.tsx)
    <div className="flex-1 flex flex-col overflow-y-auto print:hidden">
      <DocumentHeader
        backLabel={backLabel}
        onBack={onBack}
        number={doc.docNo}
        status={doc.stockDeducted
          ? <Pill tone="green" label={t("accounting.stockPanel.status.deducted")} />
          : <Pill tone="grey" label={t("accounting.stockPanel.status.notDeducted")} />}
        meta={<>
          {t(DOC_TYPE_LABEL_KEY[doc.docType])}
          {receiptDocNo && <> · {t("accounting.stockPanel.receiptPrefix")} <span className="font-mono text-[#1b7f4f]">{receiptDocNo}</span></>}
        </>}
        actions={<>
          <button type="button" onClick={onPrint} className={btn.secondary} title={t("accounting.stockPanel.btn.printTitle")}>
            <Printer size={16} /> {t("accounting.stockPanel.btn.print")}
          </button>
          <button type="button" onClick={onNcrPrint} className={btn.secondary} title={t("accounting.stockPanel.btn.ncrTitle")}>
            <FileText size={16} /> {t("accounting.list.action.ncrPrint")}
          </button>
          {canDeduct && (
            <button type="button" onClick={() => void handleDeduct()} disabled={busy} className={btn.primary}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <PackageMinus size={16} />}
              {busy ? t("accounting.stockPanel.btn.savingBusy") : t("accounting.stockPanel.btn.deduct")}
            </button>
          )}
        </>}
      />

      <div className="px-4 md:px-8 pt-6 pb-8 grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* ฝั่งซ้าย: ดูใบ (read-only) */}
        <SectionCard
          title={t("accounting.stockPanel.linesHeading")}
          actions={<span className="text-[13px] text-muted-foreground">{t("accounting.stockPanel.readOnly")}</span>}
          bodyClassName=""
        >
          <div className="px-6 py-[18px] grid grid-cols-[minmax(0,1fr)_120px] gap-x-5 gap-y-3.5 border-b border-[#eef1f6]">
            <ReadonlyField label={t("accounting.list.col.customer")} value={doc.customerSnapshot.companyName} />
            <ReadonlyField label={t("accounting.list.col.date")} value={formatQuoteDateThai(doc.docDate)} />
            <ReadonlyField label={t("accounting.manual.field.address")} value={doc.customerSnapshot.address} className="col-span-2" />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              <div className={`grid ${LINES_GRID} gap-3 items-center px-6 ${table.head}`}>
                <span>{t("accounting.stockPanel.col.description")}</span>
                <span className="text-right">{t("accounting.stockPanel.col.qty")}</span>
                <span className="text-right">{t("accounting.stockPanel.col.amount")}</span>
              </div>
              {doc.lines.map((l) => (
                <div key={l.seq} className={`grid ${LINES_GRID} gap-3 items-center px-6 min-h-12 py-2 border-b border-[#eef1f6] text-sm`}>
                  <span className="text-foreground">{l.description}</span>
                  <span className="text-right text-[#3d5173] tabular-nums whitespace-nowrap">{l.qty} {l.unit}</span>
                  <span className="text-right tabular-nums text-foreground whitespace-nowrap">{money(l.amount)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between items-baseline px-6 pt-4 pb-5 bg-[#f8f9fc] rounded-b-xl">
            <span className="font-semibold text-foreground">{t("accounting.stockPanel.netTotalPrefix")}</span>
            <span className="text-xl font-bold tabular-nums text-foreground">฿{money(doc.netTotal)}</span>
          </div>
        </SectionCard>

        {/* ฝั่งขวา: ตัดสต๊อก + ประวัติ */}
        <div className="flex flex-col gap-5 min-w-0">
          <SectionCard title={t("accounting.stockPanel.deductHeading")} bodyClassName="px-6 pt-4 pb-5 flex flex-col gap-2">
            {canDeduct && (
              <>
                <div className={`grid ${DEDUCT_GRID} gap-2 ${field.label}`}>
                  <span>{t("accounting.stockPanel.col.product")}</span>
                  <span>{t("accounting.stockPanel.col.qty")}</span>
                  <span />
                </div>
                {lines.map((l) => {
                  const product = productById(l.productId);
                  return (
                    <div key={l.key} className={`grid ${DEDUCT_GRID} gap-2 items-center`}>
                      <select
                        aria-label={t("accounting.stockPanel.col.product")}
                        value={l.productId}
                        onChange={(e) => updateLine(l.key, { productId: e.target.value })}
                        className={`${field.input} w-full min-w-0`}
                      >
                        <option value="">{t("accounting.stockPanel.selectProduct")}</option>
                        {products.filter((p) => !p.archived).map((p) => (
                          <option key={p.id} value={p.id}>{p.code} — {p.name} ({t("accounting.stockPanel.stockRemainingPrefix")} {p.stockQty})</option>
                        ))}
                      </select>
                      <span className="h-10 rounded-lg border border-[#c3ccda] bg-white flex items-stretch overflow-hidden focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors">
                        <input
                          type="number"
                          inputMode="numeric"
                          aria-label={t("accounting.stockPanel.col.qty")}
                          value={l.qty}
                          onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                          placeholder={t("accounting.stockPanel.line.qtyPlaceholder")}
                          className="flex-1 min-w-0 h-full px-2.5 bg-transparent text-sm text-right tabular-nums text-foreground placeholder:text-[#8a97ad] outline-none"
                        />
                        {product?.unit && <span className="px-2.5 flex items-center bg-[#f4f6fa] border-l border-border text-[13px] text-[#3d5173]">{product.unit}</span>}
                      </span>
                      <button type="button" onClick={() => removeLine(l.key)} aria-label={t("accounting.stockPanel.line.remove")} title={t("accounting.stockPanel.line.remove")} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
                <button type="button" onClick={addLine} className={`${btn.text} self-start`}>
                  <Plus size={16} /> {t("accounting.stockPanel.line.add")}
                </button>
                {error && <p role="alert" className={`${field.error} flex items-center gap-1`}><AlertCircle size={13} className="flex-shrink-0" />{error}</p>}
                <div className="mt-2">
                  <NextStepHint title={t("accounting.jobBilling.nextStep.title")}>{t("accounting.stockPanel.hint")}</NextStepHint>
                </div>
              </>
            )}
            {!canAdjust && <p className="text-sm text-muted-foreground">{t("accounting.stockPanel.noPermission")}</p>}
            {doc.status !== "issued" && <p className="text-sm text-muted-foreground">{t("accounting.stockPanel.cancelledNotice")}</p>}
          </SectionCard>

          <SectionCard title={t("accounting.stockPanel.historyHeading")} bodyClassName="">
            {loadingMovements ? (
              <p className="px-6 py-5 text-sm text-muted-foreground">{t("accounting.stockPanel.loading")}</p>
            ) : movements.length === 0 ? (
              <p className="px-6 py-5 text-sm text-muted-foreground">{t("accounting.stockPanel.noHistory")}</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[360px]">
                  <div className={`grid ${HISTORY_GRID} gap-3 items-center px-6 ${table.head}`}>
                    <span>{t("accounting.stockPanel.col.product")}</span>
                    <span className="text-right">{t("accounting.stockPanel.col.qty")}</span>
                    <span className="text-right">{t("accounting.list.col.date")}</span>
                  </div>
                  {movements.map((m) => (
                    <div key={m.id} className={`grid ${HISTORY_GRID} gap-3 items-center px-6 h-12 border-b border-[#eef1f6] last:border-b-0 text-sm`}>
                      <span className="min-w-0 truncate"><span className="font-mono text-[13px] text-[#3d5173]">{m.productCode}</span> — {m.productName}</span>
                      <span className="text-right font-semibold tabular-nums text-[#b93636]">{m.delta}</span>
                      <span className="text-right text-[#3d5173] whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString("th-TH")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
      <Toast message={toast.message} />
    </div>
  );
}
