import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Info, Loader2, XCircle } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { fmt } from "../../lib/quotes";
import type { Product } from "../../lib/products";
import {
  parseStockRows, buildStockImportPreview, importStock,
  STOCK_IMPORT_MAX_ROWS, STOCK_IMPORT_TEMPLATE_HEADERS,
  type StockImportPreviewRow, type StockImportProblem, type StockImportResult,
} from "../../lib/stockImport";
import { btn, field } from "../../components/ui/styles";
import { BoldCount, ImportDialogShell, ImportFileDrop, ImportStat, NoticeBox, WarningBox } from "./inventoryUi";

/**
 * นำเข้ายอดสต๊อกจาก Excel (2026-09-23) — แกะไฟล์ในเบราว์เซอร์ ดูตัวอย่างว่าแต่ละสินค้าจะเปลี่ยนเท่าไร แล้วค่อยกดนำเข้า
 * ไฟล์ไม่ถูกส่งขึ้นเซิร์ฟเวอร์ ส่งแค่ รหัส/ยอด/ต้นทุน · ดูกติกาเต็มที่ `src/lib/stockImport.ts`
 * ดีไซน์ใหม่ 2026-09-30: กล่อง 880 แบบเดียวกับนำเข้าสินค้า (แถบเลือกไฟล์ + การ์ดตัวเลข + ตาราง + สรุปท้ายกล่อง)
 */
export function StockImportDialog({ products, onClose, onImported }: {
  products: Product[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const { t } = useI18n();
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
  const heads = [t("stock.import.col.code"), t("stock.import.col.name"), t("stock.import.col.current"), t("stock.import.col.new"), t("stock.import.col.delta"), t("stock.import.col.cost")];

  return (
    <ImportDialogShell
      title={t("stock.import.title")}
      subtitle={t("stock.import.subtitle")}
      busy={busy}
      onClose={onClose}
      footerSummary={preview && !done ? <BoldCount template={t("stock.import.footerChange")} value={fmt(changes.length)} /> : undefined}
      footerActions={(
        <>
          <button type="button" onClick={onClose} disabled={busy} className={btn.secondary}>
            {done ? t("common.close") : t("common.cancel")}
          </button>
          {!done && (
            <button type="button" onClick={() => void confirmImport()} disabled={busy || changes.length === 0 || notFound.length > 0} className={btn.primary}>
              {importing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              {preview ? t("stock.import.confirm").replace("{n}", fmt(changes.length)) : t("stock.import.confirmEmpty")}
            </button>
          )}
        </>
      )}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {!done && (
          <ImportFileDrop
            fileName={fileName}
            placeholder={t("stock.import.dropzone")}
            hint={t("stock.import.dropzoneHint").replace("{max}", fmt(STOCK_IMPORT_MAX_ROWS))}
            reading={reading}
            disabled={busy}
            dragging={dragging}
            onDragging={setDragging}
            onFile={(file) => void readFile(file)}
          />
        )}
        <button type="button" onClick={() => void downloadTemplate()} className={btn.text}>
          <Download size={16} /> {t("stock.import.downloadTemplate")}
        </button>
      </div>

      {error && <NoticeBox tone="error" icon={AlertTriangle}>{error}</NoticeBox>}

      {done && (
        <NoticeBox tone="success" icon={CheckCircle2}>
          {t("stock.import.done").replace("{changed}", fmt(done.changed)).replace("{unchanged}", fmt(done.unchanged)).replace("{label}", done.batchLabel)}
        </NoticeBox>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ImportStat label={t("stock.import.stat.change")} value={fmt(changes.length)} tone="green" />
            <ImportStat label={t("stock.import.stat.same")} value={fmt(same.length)} />
            <ImportStat label={t("stock.import.stat.notFound")} value={fmt(notFound.length)} tone={notFound.length ? "red" : "default"} />
          </div>

          {notFound.length > 0 && (
            <NoticeBox tone="error" icon={XCircle}>
              <span>
                {t("stock.import.notFoundNote")}{" "}
                <span className="font-mono">{notFound.slice(0, 30).map((r) => r.code).join(", ")}{notFound.length > 30 ? " …" : ""}</span>
              </span>
            </NoticeBox>
          )}

          {changes.length > 0 && (
            <div className="border border-border rounded-[10px] overflow-hidden flex-shrink-0">
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="sticky top-0 bg-[#f8f9fc]">
                    <tr className="h-9 border-b border-border text-[12.5px] font-semibold text-[#3d5173]">
                      {heads.map((h, i) => (
                        <th key={h} className={`px-3 first:pl-4 last:pr-4 font-semibold whitespace-nowrap ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {changes.slice(0, 100).map((r) => (
                      <tr key={r.rowNumber} className="h-[34px] border-b border-[#eef1f6] text-sm">
                        <td className="px-3 first:pl-4 font-mono text-[13px] text-[#3d5173] whitespace-nowrap">{r.code}</td>
                        <td className="px-3 text-foreground">{r.productName}</td>
                        <td className="px-3 text-right tabular-nums text-[#3d5173]">{fmt(r.currentQty)}</td>
                        <td className="px-3 text-right tabular-nums text-foreground">{fmt(r.qty)}</td>
                        <td className={`px-3 text-right tabular-nums font-semibold ${r.delta > 0 ? "text-[#1b7f4f]" : "text-[#b93636]"}`}>{r.delta > 0 ? "+" : ""}{fmt(r.delta)}</td>
                        <td className={`px-3 last:pr-4 text-right tabular-nums ${r.unitCost !== null ? "text-[#3d5173]" : "text-[#8a97ad]"}`}>{r.unitCost !== null ? fmt(r.unitCost) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {changes.length > 100 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">{t("stock.import.previewTruncated").replace("{n}", fmt(changes.length - 100))}</p>
              )}
            </div>
          )}
          <p className="text-[13px] text-[#3d5173] flex items-center gap-2 -mt-1">
            <Info size={16} className="text-[#1a5fb4] flex-shrink-0" aria-hidden="true" />
            {t("stock.import.costNote")}
          </p>

          {problems.length > 0 && (
            <WarningBox title={t("stock.import.problemsTitle").replace("{n}", fmt(problems.length))}>
              {problems.slice(0, 20).map((p) => (
                <span key={`${p.rowNumber}-${p.message}`}>{t("stock.import.problemRow").replace("{row}", String(p.rowNumber))} {p.message}</span>
              ))}
            </WarningBox>
          )}

          <label className="flex flex-col gap-1.5">
            <span className={field.label}>{t("stock.import.note")}</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className={`${field.input} w-full`} />
          </label>
        </>
      )}
    </ImportDialogShell>
  );
}
