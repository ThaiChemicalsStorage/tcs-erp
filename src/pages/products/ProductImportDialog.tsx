import { useCallback, useId, useState } from "react";
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, X, Download, CheckCircle2 } from "lucide-react";
import {
  parseProductRows, buildProductImportPreview,
  PRODUCT_IMPORT_TEMPLATE_HEADERS, PRODUCT_IMPORT_TEMPLATE_SAMPLE, PRODUCT_IMPORT_MAX_ROWS,
  type ProductImportProblem, type ProductImportPreview,
} from "../../lib/productImport";
import { importProducts } from "../../lib/products";
import type { Product, ProductCategory } from "../../lib/products";
import { ApiError } from "../../lib/apiClient";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";

/**
 * นำเข้าสินค้าจากไฟล์ Excel (2026-09-04) — เจ้าของสั่งว่าเวลาย้ายสินค้าจากอีกระบบเข้ามาต้อง
 * *"โยนไฟล์ exel เข้าไปแล้วสินค้าเข้ามาเลย"*
 *
 * ลากไฟล์วางหรือกดเลือกก็ได้ · **มีขั้นดูก่อนยืนยันหนึ่งจังหวะ** ไม่ได้เขียนลงฐานข้อมูลทันทีที่วางไฟล์
 * เพราะการนำเข้าหลายร้อยแถวเข้าระบบจริงโดยไม่เห็นว่าจะได้อะไรคือความเสียหายที่ย้อนยาก — ยังเป็น
 * "วางไฟล์แล้วกดหนึ่งครั้ง" อยู่ ไม่ได้เพิ่มขั้นตอนกรอกอะไรอีก
 *
 * `xlsx` โหลดแบบ dynamic เหมือน Cost Control และทะเบียนรหัส เพื่อไม่ให้ติดไปกับ bundle หลัก
 */
export function ProductImportDialog({
  products,
  categories,
  onClose,
  onImported,
}: {
  products: Product[];
  categories: ProductCategory[];
  onClose: () => void;
  onImported: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const inputId = useId();

  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [problems, setProblems] = useState<ProductImportProblem[]>([]);
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [done, setDone] = useState<{ created: number; skipped: number; categoriesCreated: string[] } | null>(null);

  const readFile = useCallback(async (file: File) => {
    setReading(true);
    setError("");
    setPreview(null);
    setProblems([]);
    setUnmapped([]);
    setDone(null);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) { setError(t("products.import.noSheet")); return; }
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
      const parsed = parseProductRows(rows.map((r) => (r ?? []).map((c) => String(c ?? ""))));
      if (!parsed.headerFound) { setError(t("products.import.noHeader")); return; }
      setProblems(parsed.problems);
      setUnmapped(parsed.unmappedHeaders);
      setPreview(buildProductImportPreview(parsed.rows, products.map((p) => p.code), categories.map((c) => c.name)));
    } catch {
      setError(t("products.import.readError"));
    } finally {
      setReading(false);
    }
  }, [categories, products, t]);

  const confirmImport = async () => {
    if (!preview || preview.toCreate.length === 0) return;
    setImporting(true);
    setError("");
    try {
      const result = await importProducts(preview.toCreate.map((r) => ({
        code: r.code, name: r.name, categoryName: r.categoryName, unit: r.unit,
        defaultPrice: r.defaultPrice, description: r.description, specifications: r.specifications,
        isTool: r.isTool, reorderPoint: r.reorderPoint,
      })));
      setDone(result);
      setPreview(null);
      await onImported();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("products.import.saveError"));
    } finally {
      setImporting(false);
    }
  };

  /** ไฟล์ตัวอย่างสร้างจากหัวคอลัมน์ชุดเดียวกับที่ตัวแกะรับ — แก้ที่เดียวไม่มีทางหลุดจากกัน */
  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([PRODUCT_IMPORT_TEMPLATE_HEADERS, PRODUCT_IMPORT_TEMPLATE_SAMPLE]);
    XLSX.utils.book_append_sheet(wb, ws, "products");
    XLSX.writeFile(wb, "tcs-erp-product-import-template.xlsx");
  };

  const busy = reading || importing;
  // Escape ต้องไม่ปิดกล่องระหว่างที่คำขอนำเข้ายังค้างอยู่ — ปุ่มและฉากหลังถูกปิดตอน busy อยู่แล้ว
  // แต่ Escape ไม่ได้ถูกกัน ถ้าปิดกลางคัน สินค้าเข้าไปจริงแต่ผู้ใช้ไม่เห็นสรุปว่าสร้าง/ข้ามไปกี่รายการ
  // แล้วมักลากไฟล์เดิมเข้าไปซ้ำ
  const panelRef = useDialogA11y(useCallback(() => { if (!busy) onClose(); }, [busy, onClose]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={busy ? undefined : onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
              {t("products.import.title")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("products.import.subtitle")}</p>
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
              className={`flex flex-col items-center justify-center gap-2 py-8 px-4 border-2 border-dashed rounded-xl text-center transition-colors ${
                busy ? "opacity-60 cursor-wait" : "cursor-pointer"
              } ${dragging ? "border-[#c9a84c] bg-[#c9a84c]/5" : "border-border hover:border-[#c9a84c]/50"}`}
            >
              {reading ? <Loader2 size={22} className="animate-spin text-muted-foreground" /> : <Upload size={22} className="text-muted-foreground" />}
              <span className="text-sm text-foreground">{fileName || t("products.import.dropzone")}</span>
              <span className="text-xs text-muted-foreground">{t("products.import.dropzoneHint").replace("{max}", String(PRODUCT_IMPORT_MAX_ROWS))}</span>
              <input
                id={inputId} type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy}
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void readFile(file); }}
              />
            </label>
          )}

          <button onClick={() => void downloadTemplate()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Download size={13} /> {t("products.import.downloadTemplate")}
          </button>

          {error && (
            <p className="flex items-start gap-2 text-xs text-[#c23f3f] bg-[#e05252]/10 border border-[#e05252]/20 rounded-lg p-3">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {error}
            </p>
          )}

          {done && (
            <div className="flex items-start gap-2 text-xs text-[#207e52] bg-[#2aa36b]/10 border border-[#2aa36b]/20 rounded-lg p-3">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p>{t("products.import.doneCreated").replace("{n}", String(done.created))}</p>
                {done.skipped > 0 && <p>{t("products.import.doneSkipped").replace("{n}", String(done.skipped))}</p>}
                {done.categoriesCreated.length > 0 && (
                  <p>{t("products.import.doneCategories").replace("{n}", String(done.categoriesCreated.length))} — {done.categoriesCreated.join(", ")}</p>
                )}
              </div>
            </div>
          )}

          {preview && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat label={t("products.import.stat.create")} value={preview.toCreate.length} accent />
                <Stat label={t("products.import.stat.skip")} value={preview.duplicates.length} />
                <Stat label={t("products.import.stat.newCategories")} value={preview.newCategories.length} />
              </div>

              {preview.newCategories.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("products.import.newCategoriesNote")} {preview.newCategories.join(", ")}
                </p>
              )}

              {unmapped.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("products.import.unmappedNote")} {unmapped.join(", ")}
                </p>
              )}

              {preview.toCreate.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-56 overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                        <tr>
                          {[t("products.col.code"), t("products.col.name"), t("products.col.category"), t("products.col.unit"), t("products.col.price")].map((h) => (
                            <th key={h} className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.toCreate.slice(0, 50).map((r) => (
                          <tr key={r.rowNumber} className="border-t border-border/50">
                            <td className="px-3 py-1.5 text-xs font-mono text-foreground whitespace-nowrap">{r.code}</td>
                            <td className="px-3 py-1.5 text-xs text-foreground">{r.name}</td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{r.categoryName || "—"}</td>
                            <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">{r.unit || "—"}</td>
                            <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground text-right whitespace-nowrap">{r.defaultPrice.toLocaleString("th-TH")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.toCreate.length > 50 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border/50">
                      {t("products.import.previewTruncated").replace("{n}", String(preview.toCreate.length - 50))}
                    </p>
                  )}
                </div>
              )}

              {problems.length > 0 && (
                <div className="border border-[#e08a3c]/30 bg-[#e08a3c]/5 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-xs font-semibold text-[#a75d1a]">{t("products.import.problemsTitle").replace("{n}", String(problems.length))}</p>
                  {problems.slice(0, 20).map((p) => (
                    <p key={`${p.rowNumber}-${p.message}`} className="text-xs text-[#a75d1a]">
                      {t("products.import.problemRow").replace("{row}", String(p.rowNumber))} {p.message}
                    </p>
                  ))}
                  {problems.length > 20 && (
                    <p className="text-xs text-[#a75d1a]">{t("products.import.problemsTruncated").replace("{n}", String(problems.length - 20))}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border p-4">
          <button onClick={onClose} disabled={busy}
            className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-60">
            {done ? t("common.close") : t("common.cancel")}
          </button>
          {!done && (
            <button
              onClick={() => void confirmImport()}
              disabled={busy || !preview || preview.toCreate.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-semibold bg-[#c9a84c] text-[#0b1d3a] hover:bg-[#f0c040] transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
              {preview ? t("products.import.confirm").replace("{n}", String(preview.toCreate.length)) : t("products.import.confirmEmpty")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-secondary border border-border rounded-lg px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-mono font-bold ${accent ? "text-[#207e52]" : "text-foreground"}`}>{value.toLocaleString("th-TH")}</p>
    </div>
  );
}
