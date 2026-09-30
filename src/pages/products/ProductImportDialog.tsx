import { useCallback, useState } from "react";
import { Upload, Loader2, AlertTriangle, Download, CheckCircle2, Info } from "lucide-react";
import {
  parseProductRows, buildProductImportPreview,
  PRODUCT_IMPORT_TEMPLATE_HEADERS, PRODUCT_IMPORT_TEMPLATE_SAMPLE, PRODUCT_IMPORT_MAX_ROWS,
  type ProductImportProblem, type ProductImportPreview,
} from "../../lib/productImport";
import { importProducts } from "../../lib/products";
import type { Product, ProductCategory } from "../../lib/products";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { btn } from "../../components/ui/styles";
import { ImportDialogShell, ImportFileDrop, ImportStat, NoticeBox, WarningBox, BoldCount } from "../stock/inventoryUi";

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
  const skipped = preview ? preview.duplicates.length + problems.length : 0;
  const summary = preview && !done ? (
    <>
      <BoldCount template={t("products.import.footerCreate")} value={preview.toCreate.length.toLocaleString("th-TH")} />
      {skipped > 0 && ` · ${t("products.import.footerSkip").replace("{n}", skipped.toLocaleString("th-TH"))}`}
    </>
  ) : undefined;

  return (
    <ImportDialogShell
      title={t("products.import.title")}
      subtitle={t("products.import.subtitle")}
      busy={busy}
      onClose={onClose}
      footerSummary={summary}
      footerActions={(
        <>
          <button onClick={onClose} disabled={busy} className={btn.secondary}>
            {done ? t("common.close") : t("common.cancel")}
          </button>
          {!done && (
            <button
              onClick={() => void confirmImport()}
              disabled={busy || !preview || preview.toCreate.length === 0}
              className={btn.primary}
            >
              {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {preview ? t("products.import.confirm").replace("{n}", String(preview.toCreate.length)) : t("products.import.confirmEmpty")}
            </button>
          )}
        </>
      )}
    >
      <div className="flex items-center gap-3 flex-wrap">
        {!done && (
          <ImportFileDrop
            fileName={fileName}
            placeholder={t("products.import.dropzone")}
            hint={t("products.import.dropzoneHint").replace("{max}", String(PRODUCT_IMPORT_MAX_ROWS))}
            reading={reading}
            disabled={busy}
            dragging={dragging}
            onDragging={setDragging}
            onFile={(file) => void readFile(file)}
          />
        )}
        <button type="button" onClick={() => void downloadTemplate()} className={btn.text}>
          <Download size={16} /> {t("products.import.downloadTemplate")}
        </button>
      </div>

      {error && <NoticeBox tone="error" icon={AlertTriangle}>{error}</NoticeBox>}

      {done && (
        <NoticeBox tone="success" icon={CheckCircle2}>
          <p>{t("products.import.doneCreated").replace("{n}", String(done.created))}</p>
          {done.skipped > 0 && <p>{t("products.import.doneSkipped").replace("{n}", String(done.skipped))}</p>}
          {done.categoriesCreated.length > 0 && (
            <p>{t("products.import.doneCategories").replace("{n}", String(done.categoriesCreated.length))} — {done.categoriesCreated.join(", ")}</p>
          )}
        </NoticeBox>
      )}

      {preview && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <ImportStat label={t("products.import.stat.create")} value={preview.toCreate.length.toLocaleString("th-TH")} tone="green" />
            <ImportStat label={t("products.import.stat.skip")} value={preview.duplicates.length.toLocaleString("th-TH")} />
            <ImportStat label={t("products.import.stat.newCategories")} value={preview.newCategories.length.toLocaleString("th-TH")} />
          </div>

          {preview.newCategories.length > 0 && (
            <p className="text-[13px] text-[#3d5173] flex items-center gap-2 -mt-1">
              <Info size={16} className="text-[#1a5fb4] flex-shrink-0" aria-hidden="true" />
              <span>{t("products.import.newCategoriesNote")} <strong className="font-semibold">{preview.newCategories.join(", ")}</strong></span>
            </p>
          )}

          {unmapped.length > 0 && (
            <p className="text-[13px] text-muted-foreground">
              {t("products.import.unmappedNote")} {unmapped.join(", ")}
            </p>
          )}

          {preview.toCreate.length > 0 && (
            <div className="border border-border rounded-[10px] overflow-hidden flex-shrink-0">
              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="sticky top-0 bg-[#f8f9fc]">
                    <tr className="h-9 border-b border-border text-[12.5px] font-semibold text-[#3d5173]">
                      {[t("products.col.code"), t("products.col.name"), t("products.col.category"), t("products.col.unit"), t("products.col.price")].map((h, i) => (
                        <th key={h} className={`px-3 first:pl-4 last:pr-4 font-semibold whitespace-nowrap ${i === 4 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.toCreate.slice(0, 50).map((r) => (
                      <tr key={r.rowNumber} className="h-[34px] border-b border-[#eef1f6] text-sm">
                        <td className="px-3 first:pl-4 font-mono text-[13px] text-[#3d5173] whitespace-nowrap">{r.code}</td>
                        <td className="px-3 text-foreground">{r.name}</td>
                        <td className="px-3 text-[#3d5173] whitespace-nowrap">{r.categoryName || "—"}</td>
                        <td className="px-3 text-[#3d5173] whitespace-nowrap">{r.unit || "—"}</td>
                        <td className="px-3 last:pr-4 text-right tabular-nums whitespace-nowrap">{r.defaultPrice.toLocaleString("th-TH")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.toCreate.length > 50 && (
                <p className="px-4 py-2 text-xs text-muted-foreground">
                  {t("products.import.previewTruncated").replace("{n}", String(preview.toCreate.length - 50))}
                </p>
              )}
            </div>
          )}

          {problems.length > 0 && (
            <WarningBox title={t("products.import.problemsTitle").replace("{n}", String(problems.length))}>
              {problems.slice(0, 20).map((p) => (
                <span key={`${p.rowNumber}-${p.message}`}>
                  {t("products.import.problemRow").replace("{row}", String(p.rowNumber))} {p.message}
                </span>
              ))}
              {problems.length > 20 && (
                <span>{t("products.import.problemsTruncated").replace("{n}", String(problems.length - 20))}</span>
              )}
            </WarningBox>
          )}
        </>
      )}
    </ImportDialogShell>
  );
}
