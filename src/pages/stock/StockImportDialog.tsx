import { useCallback, useId, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { fmt } from "../../lib/quotes";
import type { Product } from "../../lib/products";
import {
  parseStockRows, buildStockImportPreview, importStock,
  STOCK_IMPORT_MAX_ROWS, STOCK_IMPORT_TEMPLATE_HEADERS,
  type StockImportPreviewRow, type StockImportProblem, type StockImportResult,
} from "../../lib/stockImport";

/**
 * นำเข้ายอดสต๊อกจาก Excel (2026-09-23) — แกะไฟล์ในเบราว์เซอร์ ดูตัวอย่างว่าแต่ละสินค้าจะเปลี่ยนเท่าไร แล้วค่อยกดนำเข้า
 * ไฟล์ไม่ถูกส่งขึ้นเซิร์ฟเวอร์ ส่งแค่ รหัส/ยอด/ต้นทุน · ดูกติกาเต็มที่ `src/lib/stockImport.ts`
 */
export function StockImportDialog({ products, onClose, onImported }: {
  products: Product[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const inputId = useId();
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<StockImportPreviewRow[] | null>(null);
  const [problems, setProblems] = useState<StockImportProblem[]>([]);
  const [note, setNote] = useState("");
  const [done, setDone] = useState<StockImportResult | null>(null);

  const readFile = useCallback(async (file: File) => {
    setReading(true);
    setError("");
    setPreview(null);
    setProblems([]);
    setDone(null);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) { setError(t("stock.import.noSheet")); return; }
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
      const parsed = parseStockRows(rows.map((r) => (r ?? []).map((c) => String(c ?? ""))));
      if (!parsed.headerFound) { setError(t("stock.import.noHeader")); return; }
      setProblems(parsed.problems);
      setPreview(buildStockImportPreview(parsed.rows, products));
    } catch {
      setError(t("stock.import.readError"));
    } finally {
      setReading(false);
    }
  }, [products, t]);

  const changes = preview?.filter((r) => r.status === "change") ?? [];
  const same = preview?.filter((r) => r.status === "same") ?? [];
  const notFound = preview?.filter((r) => r.status === "notFound") ?? [];

  const confirmImport = async () => {
    if (!preview || changes.length === 0 || notFound.length > 0) return;
    setImporting(true);
    setError("");
    try {
      const result = await importStock(preview.filter((r) => r.status !== "notFound").map((r) => ({ code: r.code, qty: r.qty, unitCost: r.unitCost })), note);
      setDone(result);
      setPreview(null);
      await onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("stock.import.saveError"));
    } finally {
      setImporting(false);
    }
  };

  /** ไฟล์ตั้งต้น = สินค้าทุกตัวพร้อมยอดปัจจุบัน — แก้เฉพาะคอลัมน์ยอดแล้วโยนกลับมาได้เลย */
  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const rows = products.filter((p) => !p.archived).map((p) => [p.code, p.name, p.unit, p.stockQty, p.avgCost ?? ""]);
    const ws = XLSX.utils.aoa_to_sheet([STOCK_IMPORT_TEMPLATE_HEADERS, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "stock");
    XLSX.writeFile(wb, `tcs-erp-stock-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const busy = reading || importing;
  const panelRef = useDialogA11y(useCallback(() => { if (!busy) onClose(); }, [busy, onClose]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={busy ? undefined : onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("stock.import.title")}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("stock.import.subtitle")}</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label={t("common.close")}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-60">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pb-5 overflow-y-auto space-y-4">
          {!done && (
            <label
              htmlFor={inputId}
              onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (busy) return;
                const file = e.dataTransfer.files?.[0];
                if (file) void readFile(file);
              }}
              className={`flex flex-col items-center justify-center gap-2 py-8 px-4 border-2 border-dashed rounded-xl text-center transition-colors ${busy ? "opacity-60 cursor-wait" : "cursor-pointer"} ${dragging ? "border-[#c9a84c] bg-[#c9a84c]/5" : "border-border hover:border-[#c9a84c]/50"}`}
            >
              {reading ? <Loader2 size={22} className="animate-spin text-muted-foreground" /> : <Upload size={22} className="text-muted-foreground" />}
              <span className="text-sm text-foreground">{fileName || t("stock.import.dropzone")}</span>
              <span className="text-xs text-muted-foreground">{t("stock.import.dropzoneHint").replace("{max}", fmt(STOCK_IMPORT_MAX_ROWS))}</span>
              <input id={inputId} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy}
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void readFile(file); }} />
            </label>
          )}

          <button onClick={() => void downloadTemplate()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Download size={13} /> {t("stock.import.downloadTemplate")}
          </button>

          {error && (
            <p className="flex items-start gap-2 text-xs text-[#c23f3f] bg-[#e05252]/10 border border-[#e05252]/20 rounded-lg p-3">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {error}
            </p>
          )}

          {done && (
            <p className="flex items-start gap-2 text-xs text-[#207e52] bg-[#2aa36b]/10 border border-[#2aa36b]/20 rounded-lg p-3">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              {t("stock.import.done").replace("{changed}", fmt(done.changed)).replace("{unchanged}", fmt(done.unchanged)).replace("{label}", done.batchLabel)}
            </p>
          )}

          {preview && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: t("stock.import.stat.change"), value: changes.length, cls: "text-[#207e52]" },
                  { label: t("stock.import.stat.same"), value: same.length, cls: "text-foreground" },
                  { label: t("stock.import.stat.notFound"), value: notFound.length, cls: notFound.length ? "text-[#c23f3f]" : "text-foreground" },
                ].map((s) => (
                  <div key={s.label} className="bg-secondary border border-border rounded-lg px-3 py-2">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-lg font-mono font-bold ${s.cls}`}>{fmt(s.value)}</p>
                  </div>
                ))}
              </div>

              {notFound.length > 0 && (
                <p className="text-xs text-[#c23f3f] bg-[#e05252]/10 border border-[#e05252]/20 rounded-lg p-3">
                  {t("stock.import.notFoundNote")} <span className="font-mono">{notFound.slice(0, 30).map((r) => r.code).join(", ")}{notFound.length > 30 ? " …" : ""}</span>
                </p>
              )}

              {changes.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                        <tr>
                          {[t("stock.import.col.code"), t("stock.import.col.name"), t("stock.import.col.current"), t("stock.import.col.new"), t("stock.import.col.delta"), t("stock.import.col.cost")].map((h, i) => (
                            <th key={h} className={`px-3 py-2 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {changes.slice(0, 100).map((r) => (
                          <tr key={r.rowNumber} className="border-t border-border/50 text-xs">
                            <td className="px-3 py-1.5 font-mono text-foreground whitespace-nowrap">{r.code}</td>
                            <td className="px-3 py-1.5 text-foreground">{r.productName}</td>
                            <td className="px-3 py-1.5 font-mono text-right text-muted-foreground">{fmt(r.currentQty)}</td>
                            <td className="px-3 py-1.5 font-mono text-right text-foreground">{fmt(r.qty)}</td>
                            <td className={`px-3 py-1.5 font-mono text-right font-semibold ${r.delta > 0 ? "text-[#207e52]" : "text-[#c23f3f]"}`}>{r.delta > 0 ? "+" : ""}{fmt(r.delta)}</td>
                            <td className="px-3 py-1.5 font-mono text-right text-muted-foreground">{r.unitCost !== null ? fmt(r.unitCost) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {changes.length > 100 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border/50">{t("stock.import.previewTruncated").replace("{n}", fmt(changes.length - 100))}</p>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("stock.import.costNote")}</p>

              {problems.length > 0 && (
                <div className="border border-[#e08a3c]/30 bg-[#e08a3c]/5 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-[#a75d1a]">{t("stock.import.problemsTitle").replace("{n}", fmt(problems.length))}</p>
                  {problems.slice(0, 20).map((p) => (
                    <p key={`${p.rowNumber}-${p.message}`} className="text-xs text-[#a75d1a]">{t("stock.import.problemRow").replace("{row}", String(p.rowNumber))} {p.message}</p>
                  ))}
                </div>
              )}

              <label className="block">
                <span className="text-xs text-muted-foreground block mb-1">{t("stock.import.note")}</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
                  className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" />
              </label>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} disabled={busy}
            className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
            {done ? t("common.close") : t("common.cancel")}
          </button>
          {!done && (
            <button onClick={() => void confirmImport()} disabled={busy || changes.length === 0 || notFound.length > 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-semibold bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] transition-colors disabled:opacity-50">
              {importing ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
              {preview ? t("stock.import.confirm").replace("{n}", fmt(changes.length)) : t("stock.import.confirmEmpty")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
