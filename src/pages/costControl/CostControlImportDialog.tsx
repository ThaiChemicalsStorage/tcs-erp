import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { fmt } from "../../lib/quotes";
import { type CostControl, type CostControlLine, createCostControl, lineTotalCost } from "../../lib/costControl";
import {
  classifySheet, mergeCostControlImports, parseCostControlSheet, stripImportedPrices,
  type CostControlImportResult, type SheetFills, type SheetKind,
} from "../../lib/costControlImport";

interface ReadableSheet {
  name: string;
  kind: SheetKind;
  rows: string[][];
  fills: SheetFills;
  /** จำนวนบรรทัดที่แกะได้ — คำนวณตอนอ่านไฟล์ เพื่อให้คนเลือกชีตได้โดยไม่ต้องลองทีละอัน */
  lineCount: number;
}

/**
 * โยนไฟล์ Excel ของงานเข้ามา → แกะ → **ให้คนตรวจและแก้** → ค่อยสร้างเอกสาร
 *
 * ขั้น preview ไม่ใช่ของประดับ — `costControlImport.ts` อธิบายไว้ว่าการแปลงจากใบประเมินราคาเป็น
 * Cost Control ไม่ใช่ 1:1 คนที่ทำใบจริงทั้งแตกและยุบบรรทัดตามดุลพินิจ การสร้างให้อัตโนมัติเงียบ ๆ
 * จึงได้เอกสารที่ดูน่าเชื่อแต่ผิด
 *
 * **ไฟล์ไม่เคยถูกอัปโหลดขึ้นเซิร์ฟเวอร์** — เบราว์เซอร์อ่านเอง แล้วส่งเฉพาะแถวที่คนตรวจแล้วขึ้นไปเป็น
 * JSON ธรรมดา ไม่ต้องมี multipart ไม่ต้อง base64 ไม่ชนเพดานขนาด body และ preview ไม่ต้องรอ network
 * `xlsx` โหลดแบบ dynamic import (~400 KB) จึงไม่ติดไปกับ chunk หลักของแอป
 */
export function CostControlImportDialog({ onCreated, onClose }: {
  onCreated: (doc: CostControl) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const panelRef = useDialogA11y(onClose);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [reading, setReading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  /** ชีตที่อ่านได้ในไฟล์ — เลือกได้หลายชีต ไฟล์งานจริงบางไฟล์แยกงานย่อยไว้คนละชีต */
  const [sheets, setSheets] = useState<ReadableSheet[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<CostControlImportResult | null>(null);
  const [lines, setLines] = useState<CostControlLine[]>([]);

  /** แกะชีตที่เลือกไว้ทั้งหมดใหม่ทุกครั้ง — ถูกกว่าการเก็บผลลัพธ์ไว้แล้วต้องคอยรวมทีหลัง */
  const applyPicked = (all: ReadableSheet[], names: string[]) => {
    const parts = all
      .filter((s) => names.includes(s.name))
      .map((s) => ({ sheetName: s.name, result: parseCostControlSheet(s.rows, s.kind, s.fills) }));
    if (parts.length === 0) {
      setResult(null);
      setLines([]);
      return;
    }
    // ตัดราคาออกตรงนี้จุดเดียว — preview, บล็อกสรุป และ payload ตอนกดสร้าง อ่านจาก `result`/`lines` หมด
    const merged = stripImportedPrices(mergeCostControlImports(parts));
    setResult(merged);
    setLines(merged.lines);
  };

  const toggleSheet = (name: string) => {
    const next = picked.includes(name) ? picked.filter((n) => n !== name) : [...picked, name];
    setPicked(next);
    applyPicked(sheets, next);
  };

  const readFile = async (file: File) => {
    setError("");
    setReading(true);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      // cellStyles: true — ชีตจริงแยก "หัวกลุ่ม" ออกจาก "บรรทัดบรรยาย" ด้วยสีพื้นหลังเท่านั้น
      // ตัวหนังสือของสองแบบนี้หน้าตาเหมือนกันทุกประการ (ดู SHEET_FILL ใน costControlImport.ts)
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellStyles: true });

      const readable: ReadableSheet[] = [];
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
        // ชนิดของชีตดูจากเนื้อใน ไม่ใช่ชื่อ — ไฟล์งานจริงตั้งชื่อชีตตามใจ ("Rev.01", "ลองๆ", "3mm.")
        const kind = classifySheet(name, grid);
        if (!kind) continue;

        const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
        const fillGrid: SheetFills = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
          const row: (string | null)[] = [];
          for (let cIdx = range.s.c; cIdx <= range.e.c; cIdx++) {
            const cellRef = ws[XLSX.utils.encode_cell({ r, c: cIdx })] as { s?: { fgColor?: { rgb?: string } } } | undefined;
            const rgb = cellRef?.s?.fgColor?.rgb;
            row.push(rgb ? rgb.toUpperCase().slice(-6) : null);
          }
          fillGrid.push(row);
        }
        readable.push({
          name, kind, rows: grid, fills: fillGrid,
          lineCount: parseCostControlSheet(grid, kind, fillGrid).lines.length,
        });
      }

      if (readable.length === 0) {
        setError(t("costControlImport.errorNoSheet"));
        setResult(null);
        setSheets([]);
        setPicked([]);
        return;
      }

      setSheets(readable);
      // ตั้งต้นด้วยชีตเดียวเสมอ: ใบ Cost Control ที่ทำไว้แล้วแม่นกว่าใบประเมินราคา และในบรรดาชีตแบบ
      // เดียวกันเอา**อันซ้ายสุดที่แกะได้จริง** — ไม่ใช่อันที่บรรทัดเยอะสุด เพราะไฟล์งานจริงมีชีตทดลอง
      // ปนอยู่ (ไฟล์น้ำมันพืชไทยมีชีตชื่อ "ลองๆ" ที่บรรทัดเยอะที่สุดในไฟล์) เดาให้ฉลาดกว่านี้ไม่ได้
      // คนเป็นคนเลือกเอง ซึ่งคือสิ่งที่หน้านี้มีให้อยู่แล้ว
      const withLines = readable.filter((s) => s.lineCount > 0);
      const pool = withLines.length > 0 ? withLines : readable;
      const best = pool.find((s) => s.kind === "costControl") ?? pool[0];
      setPicked([best.name]);
      applyPicked(readable, [best.name]);
    } catch {
      setError(t("costControlImport.errorRead"));
      setResult(null);
    } finally {
      setReading(false);
    }
  };

  const handleCreate = async () => {
    if (!result || lines.length === 0) return;
    setCreating(true);
    setError("");
    try {
      const doc = await createCostControl({
        jobName: result.header.jobName,
        workType: result.header.workType,
        jobOrder: result.header.jobOrder,
        docDate: result.header.docDate,
        lines,
        // บันทึกชีตที่ใช้ไว้ด้วย — ไฟล์เดียวมีได้หลายชีตและเลือกได้หลายอัน "ชื่อไฟล์" อย่างเดียวจึงไม่พอ
        // ที่จะย้อนกลับไปดูว่าใบนี้มาจากไหน
        sourceFileName: `${fileName} — ${picked.join(", ")}`,
        // ไม่ส่งบล็อกสรุป (ค่าดำเนินการ/Bubble/Entertainment/ราคาขาย) ขึ้นไปเลย — เซิร์ฟเวอร์ตั้งเป็น
        // null ให้เองเมื่อไม่ได้ส่งมา เท่ากับใบที่เปิดเปล่า แล้วให้คนกรอกเองในเอกสาร
        // (`stripImportedPrices()` ล้าง `result.markups` ไว้แล้ว บรรทัดนี้แค่ไม่ส่งซ้ำอีกทาง)
      });
      onCreated(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("costControlImport.errorCreate"));
    } finally {
      setCreating(false);
    }
  };

  const titleId = "cost-control-import-title";
  const inputCls = "w-full px-2 py-1 text-xs bg-secondary border border-border rounded outline-none focus:border-[#c9a84c]/50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-5xl max-h-[88vh] flex flex-col">

        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <h2 id={titleId} className="text-base font-semibold text-foreground">{t("costControlImport.title")}</h2>
          <button onClick={onClose} aria-label={t("costControlImport.cancel")}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!result && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void readFile(file);
              }}
              className={`w-full rounded-xl border-2 border-dashed px-6 py-12 flex flex-col items-center gap-3 transition-colors
                ${dragOver ? "border-[#c9a84c] bg-[#c9a84c]/5" : "border-border hover:border-[#c9a84c]/40"}`}
            >
              {reading ? <Loader2 size={28} className="text-[#c9a84c] animate-spin" /> : <Upload size={28} className="text-muted-foreground" />}
              <span className="text-sm text-foreground">{reading ? t("costControlImport.reading") : t("costControlImport.dropHere")}</span>
              <span className="text-xs text-muted-foreground">{t("costControlImport.dropHint")}</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readFile(file);
              e.target.value = "";
            }}
          />

          {error && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[#d22626]/10 border border-[#d22626]/25 text-xs text-[#a81f1f]">
              <TriangleAlert size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileSpreadsheet size={14} /> {fileName}
              </div>

              {sheets.length > 1 && (
                <fieldset className="border border-border rounded-lg px-3 py-2.5">
                  <legend className="px-1 text-xs text-muted-foreground">{t("costControlImport.chooseSheet")}</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {sheets.map((s) => (
                      <label key={s.name} className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-[#c9a84c]"
                          checked={picked.includes(s.name)}
                          onChange={() => toggleSheet(s.name)}
                        />
                        <span>{s.name}</span>
                        <span className="text-muted-foreground">
                          ({s.kind === "costControl" ? t("costControlImport.sheetCostControl") : t("costControlImport.sheetSc")}
                          {" · "}
                          {t("costControlImport.sheetLineCount").replace("{count}", String(s.lineCount))})
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">{t("costControlImport.chooseSheetHint")}</p>
                </fieldset>
              )}

              {result.warnings.length > 0 && (
                <div className="px-3 py-2.5 rounded-lg bg-[#e08a3c]/10 border border-[#e08a3c]/25 space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[#a75d1a]">
                    <TriangleAlert size={13} /> {t("costControlImport.warningsTitle")}
                  </p>
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-[#a75d1a] leading-relaxed">{w}</p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-xs text-muted-foreground">
                  {t("costControlDoc.field.jobName")}
                  <input className={inputCls} value={result.header.jobName}
                    onChange={(e) => setResult({ ...result, header: { ...result.header, jobName: e.target.value } })} />
                </label>
                <label className="text-xs text-muted-foreground">
                  {t("costControlDoc.field.workType")}
                  <input className={inputCls} value={result.header.workType}
                    onChange={(e) => setResult({ ...result, header: { ...result.header, workType: e.target.value } })} />
                </label>
                <label className="text-xs text-muted-foreground">
                  {t("costControlDoc.field.jobOrder")}
                  <input className={inputCls} value={result.header.jobOrder}
                    onChange={(e) => setResult({ ...result, header: { ...result.header, jobOrder: e.target.value } })} />
                </label>
                <label className="text-xs text-muted-foreground">
                  {t("costControlDoc.field.docDate")}
                  <input type="date" className={inputCls} value={result.header.docDate}
                    onChange={(e) => setResult({ ...result, header: { ...result.header, docDate: e.target.value } })} />
                </label>
              </div>

              {/* ราคาในไฟล์ไม่ถูกนำเข้าเลย — บอกไว้ตรง ๆ ไม่งั้นคนจะนึกว่าระบบอ่านราคาไม่ออก */}
              <p className="text-xs text-muted-foreground">{t("costControlImport.pricesNotImported")}</p>

              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[38vh]">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-muted/95">
                      <tr className="border-b border-border">
                        {[t("costControlDoc.line.kind"), t("costControlDoc.line.seq"), t("costControlDoc.line.description"),
                          t("costControlDoc.line.qty"), t("costControlDoc.line.unit"), t("costControlDoc.line.unitCost"),
                          t("costControlDoc.line.total"), ""].map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, idx) => (
                        <tr key={l.id} className={`border-b border-border/50 ${l.kind === "group" ? "bg-muted/40" : ""}`}>
                          <td className="px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                            {l.kind === "group" ? t("costControlDoc.line.kind.group")
                              : l.kind === "sub" ? t("costControlDoc.line.kind.sub") : t("costControlDoc.line.kind.item")}
                          </td>
                          <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground">{l.seq || "—"}</td>
                          <td className="px-3 py-1.5">
                            <input className={inputCls} value={l.description}
                              onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                          </td>
                          <td className="px-3 py-1.5 w-24">
                            <input type="number" className={`${inputCls} text-right`} value={l.qty ?? ""}
                              onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, qty: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                          </td>
                          <td className="px-3 py-1.5 w-20">
                            <input className={inputCls} value={l.unit}
                              onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))} />
                          </td>
                          <td className="px-3 py-1.5 w-32">
                            <input type="number" className={`${inputCls} text-right`} value={l.unitCost ?? ""}
                              onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, unitCost: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                          </td>
                          <td className="px-3 py-1.5 text-xs font-mono text-right text-foreground whitespace-nowrap">
                            {/* ยังไม่กรอกต้นทุน = ยังไม่มียอดรวม ปล่อยว่าง ไม่โชว์ 0.00 ทั้งคอลัมน์
                                ตั้งแต่ไม่นำราคาจากไฟล์เข้ามาแล้ว (ใบพิมพ์ใช้กติกาเดียวกัน) */}
                            {l.kind === "group" ? "—" : l.unitCost === null ? "" : fmt(lineTotalCost(l))}
                          </td>
                          <td className="px-3 py-1.5">
                            <button onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                              aria-label={t("costControlImport.removeLine")}
                              className="text-muted-foreground hover:text-[#d22626] transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
          {result && (
            <span className="text-xs text-muted-foreground">
              {t("costControlImport.previewCount").replace("{count}", String(lines.length))}
            </span>
          )}
          <button onClick={onClose}
            className="ml-auto px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            {t("costControlImport.cancel")}
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!result || lines.length === 0 || creating}
            title={result && lines.length === 0 ? t("costControlImport.noLines") : undefined}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors disabled:opacity-50"
          >
            {creating && <Loader2 size={13} className="animate-spin" />}
            {creating ? t("costControlImport.creating") : t("costControlImport.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
