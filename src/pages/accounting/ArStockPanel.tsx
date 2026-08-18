import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Printer, FileText } from "lucide-react";
import type { ArDocument } from "../../lib/accounting";
import { deductArDocumentStock, formatArDocDate } from "../../lib/accounting";
import type { Product } from "../../lib/products";
import { fetchProducts } from "../../lib/products";
import { fetchStockMovements, type StockMovement } from "../../lib/stock";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";

interface DraftLine {
  key: number;
  productId: string;
  qty: string;
}

// มุมมองแบบ 2 ฝั่งของใบกำกับภาษี/ใบส่งสินค้า (IV) เพิ่ม 2026-08-18 ตามคำขอโดยตรง — ฝั่งซ้ายไว้ดูใบ
// ฝั่งขวาไว้ตัดสต๊อก เหตุผลที่ต้องเลือกสินค้าเองต่อรายการ (ไม่ auto-map จากบรรทัดใบกำกับภาษี) คือ
// QuoteLine ไม่มี productId เชื่อมกับ Product Library เลย (ดูหมายเหตุใน handleStockDeduction,
// api/_lib/arHandler.ts) — ให้พนักงานเลือกเองว่าอะไรออกจากคลังจริง และตัดได้หลายรอบตามที่ของจริงทยอยออก
// A dual-pane view of an IV document — left: read-only summary, right: manual stock cutting.
export function ArStockPanel({ doc, canAdjust, onBack, onDocumentUpdated, onPrint, onNcrPrint }: {
  doc: ArDocument;
  canAdjust: boolean;
  onBack: () => void;
  onDocumentUpdated: (updated: ArDocument) => void;
  /** ปุ่มพิมพ์ในหน้านี้เรียก state เดียวกับหน้ารายการ (ดู ArDocumentListPage.tsx) — ป้ายกำกับ
   * "ตัดสต๊อกแล้ว"/"ยังไม่ตัดสต๊อก" บนเอกสารพิมพ์จึงตรงกับสถานะ doc.stockDeducted ปัจจุบันเสมอ ไม่ใช่
   * ตัวเลือกแยกสองแบบที่พิมพ์ผลต่างจากความจริง (จะผิดหลักการตรวจสอบบัญชี) */
  onPrint: () => void;
  onNcrPrint: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([{ key: 1, productId: "", qty: "" }]);
  const [nextKey, setNextKey] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetchProducts().then((p) => { if (!cancelled) setProducts(p); }).catch(() => { if (!cancelled) toast.show("โหลดรายการสินค้าไม่สำเร็จ"); });
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
    fetchStockMovements({ sourceId: doc.id }).then((movements) => { if (!cancelled) setMovementsResult({ key, movements }); });
    return () => { cancelled = true; };
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
    const payload = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => ({ productId: l.productId, qty: Number(l.qty) }));
    if (payload.length === 0) { setError("กรุณาเลือกสินค้าและระบุจำนวนอย่างน้อย 1 รายการ"); return; }

    setBusy(true);
    setError("");
    try {
      const { document } = await deductArDocumentStock(doc.id, payload);
      onDocumentUpdated(document);
      setLines([{ key: nextKey, productId: "", qty: "" }]);
      setNextKey((n) => n + 1);
      setMovementsRetryToken((n) => n + 1);
      toast.show("ตัดสต๊อกแล้ว");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ตัดสต๊อกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2 });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={14} /> กลับไปหน้ารายการ
        </button>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${doc.stockDeducted ? "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20" : "bg-muted text-muted-foreground border border-border"}`}>
          {doc.stockDeducted ? "ตัดสต๊อกแล้ว" : "ยังไม่ตัดสต๊อก"}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={onPrint} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors" title="พิมพ์ (กระดาษเปล่า — เอกสารเต็มรูปแบบ) — สถานะตัดสต๊อกปัจจุบันจะแสดงบนเอกสารพิมพ์ด้วย">
            <Printer size={13} /> พิมพ์
          </button>
          <button onClick={onNcrPrint} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors" title="พิมพ์ลงฟอร์มกระดาษเคมี (NCR)">
            <FileText size={13} /> NCR
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ฝั่งซ้าย: ดูใบ (read-only) */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{doc.docNo}</h2>
            <span className="text-xs font-mono text-muted-foreground">{formatArDocDate(doc.docDate)}</span>
          </div>
          <div className="text-sm text-foreground font-medium">{doc.customerSnapshot.companyName}</div>
          <div className="text-xs text-muted-foreground">{doc.customerSnapshot.address}</div>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2">รายการ</th>
                  <th className="text-right font-medium px-3 py-2">จำนวน</th>
                  <th className="text-right font-medium px-3 py-2">จำนวนเงิน</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((l) => (
                  <tr key={l.seq} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 text-foreground">{l.description}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground whitespace-nowrap">{l.qty} {l.unit}</td>
                    <td className="px-3 py-2 text-right font-mono text-foreground whitespace-nowrap">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end text-sm font-semibold text-foreground font-mono">ยอดสุทธิ {money(doc.netTotal)} บาท</div>
        </div>

        {/* ฝั่งขวา: ตัดสต๊อก */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>ตัดสต๊อกสินค้า</h2>

          {canAdjust && doc.status === "issued" && (
            <div className="space-y-2">
              {lines.map((l) => {
                const product = productById(l.productId);
                return (
                  <div key={l.key} className="flex items-center gap-2">
                    <select
                      value={l.productId}
                      onChange={(e) => updateLine(l.key, { productId: e.target.value })}
                      className="h-9 flex-1 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                    >
                      <option value="">— เลือกสินค้า —</option>
                      {products.filter((p) => !p.archived).map((p) => (
                        <option key={p.id} value={p.id}>{p.code} — {p.name} (คงเหลือ {p.stockQty})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={l.qty}
                      onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                      placeholder="จำนวน"
                      className="h-9 w-24 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                    />
                    <span className="text-xs text-muted-foreground w-10 whitespace-nowrap">{product?.unit ?? ""}</span>
                    <button onClick={() => removeLine(l.key)} className="text-muted-foreground hover:text-[#e05252] transition-colors" title="ลบรายการนี้">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              <button onClick={addLine} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Plus size={13} /> เพิ่มรายการ
              </button>
              {error && <p className="text-xs text-[#c23f3f]">{error}</p>}
              <button
                onClick={() => void handleDeduct()}
                disabled={busy}
                className="w-full h-9 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-medium hover:brightness-95 transition-all disabled:opacity-50"
              >
                {busy ? "กำลังบันทึก..." : "ตัดสต๊อก"}
              </button>
            </div>
          )}
          {!canAdjust && <p className="text-xs text-muted-foreground">ไม่มีสิทธิ์ตัดสต๊อก — ดูได้เฉพาะประวัติด้านล่าง</p>}
          {doc.status !== "issued" && <p className="text-xs text-muted-foreground">เอกสารนี้ถูกยกเลิกแล้ว ตัดสต๊อกเพิ่มไม่ได้</p>}

          <div className="pt-2 border-t border-border">
            <h3 className="text-xs font-semibold text-muted-foreground mb-2">ประวัติการตัดสต๊อกของใบนี้</h3>
            {loadingMovements ? (
              <p className="text-xs text-muted-foreground">กำลังโหลด...</p>
            ) : movements.length === 0 ? (
              <p className="text-xs text-muted-foreground">ยังไม่มีการตัดสต๊อกสำหรับเอกสารนี้</p>
            ) : (
              <div className="space-y-1.5">
                {movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{m.productCode} — {m.productName}</span>
                    <span className="font-mono text-[#c23f3f]">{m.delta}</span>
                    <span className="font-mono text-muted-foreground whitespace-nowrap">{new Date(m.createdAt).toLocaleDateString("th-TH")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <Toast message={toast.message} />
    </div>
  );
}
