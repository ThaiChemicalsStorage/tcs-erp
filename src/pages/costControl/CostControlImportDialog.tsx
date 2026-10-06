import { useRef, useState } from "react";
import { FilePlus2, FileSpreadsheet, Loader2, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { fmt } from "../../lib/quotes";
import { type CostControl, type CostControlLine, createCostControl, lineTotalCost } from "../../lib/costControl";
import {
  classifySheet, mergeCostControlImports, parseCostControlSheet, stripImportedPrices,
  type CostControlImportResult, type SheetFills, type SheetKind,
} from "../../lib/costControlImport";
import { UnitCombobox } from "../../components/UnitCombobox";

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
  const cellCls = `${field.cell} w-full min-w-0`;
  const [countBefore, countAfter = ""] = t("costControlImport.previewCount").split("{count}");
  const setHeader = (key: keyof CostControlImportResult["header"], value: string) =>
    { if (result) setResult({ ...result, header: { ...result.header, [key]: value } }); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="relative bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] w-full max-w-[880px] max-h-[88vh] flex flex-col overflow-hidden">

        <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-[#eef1f6] flex-shrink-0">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h2 id={titleId} className="text-lg font-semibold leading-snug text-foreground">{t("costControlImport.title")}</h2>
            {fileName && (
              <span className="text-[13px] text-[#3d5173] flex items-center gap-1.5 min-w-0">
                <FileSpreadsheet size={15} className="text-[#1b7f4f] flex-shrink-0" />
                <span className="truncate">{fileName}</span>
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={t("costControlImport.cancel")}
            className="w-9 h-9 -mt-1 -mr-2 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 flex flex-col gap-4">
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
              className={`w-full rounded-xl border-2 border-dashed px-6 py-12 flex flex-col items-center gap-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40
                ${dragOver ? "border-[#1a5fb4] bg-[#eef4fc]" : "border-[#c3ccda] hover:border-[#1a5fb4]/60 hover:bg-[#f8f9fc]"}`}
            >
              {reading ? <Loader2 size={28} className="text-[#1a5fb4] animate-spin" /> : <Upload size={28} className="text-muted-foreground" />}
              <span className="text-sm font-medium text-foreground">{reading ? t("costControlImport.reading") : t("costControlImport.dropHere")}</span>
              <span className="text-[13px] text-muted-foreground max-w-md text-center">{t("costControlImport.dropHint")}</span>
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
            <div role="alert" className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-[#fcebeb] border border-[#efc2c2] text-[13px] text-[#b93636]">
              <TriangleAlert size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <>
              {sheets.length > 1 && (
                <fieldset className="m-0 p-0 border-0 flex flex-col gap-2 flex-shrink-0">
                  <legend className={`${field.label} p-0 mb-2`}>{t("costControlImport.chooseSheet")}</legend>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {sheets.map((s) => {
                      const on = picked.includes(s.name);
                      return (
                        <label key={s.name}
                          className={`min-h-[52px] px-3 py-2 rounded-lg border flex items-center gap-2.5 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[#1a5fb4]/30 ${
                            on ? "border-[#1a5fb4] bg-[#eef4fc]" : "border-[#c3ccda] bg-white hover:bg-[#f8f9fc]"
                          }`}>
                          <input
                            type="checkbox"
                            className="w-[18px] h-[18px] accent-[#0b1d3a] flex-shrink-0 cursor-pointer"
                            checked={on}
                            onChange={() => toggleSheet(s.name)}
                          />
                          <span className="flex flex-col min-w-0 leading-snug">
                            <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                            <span className="text-xs text-muted-foreground truncate">
                              {s.kind === "costControl" ? t("costControlImport.sheetCostControl") : t("costControlImport.sheetSc")}
                              {" · "}
                              {t("costControlImport.sheetLineCount").replace("{count}", String(s.lineCount))}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className={field.help}>{t("costControlImport.chooseSheetHint")}</p>
                </fieldset>
              )}

              {result.warnings.length > 0 && (
                <div role="alert" className="flex-shrink-0 px-3.5 py-3 rounded-lg bg-[#fdf3e0] border border-[#efd3a0] text-[#8a5a00] flex gap-2.5">
                  <TriangleAlert size={16} className="flex-shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5 text-[13px] leading-relaxed min-w-0">
                    <strong className="font-semibold">{t("costControlImport.warningsTitle")}</strong>
                    {result.warnings.map((w, i) => <span key={i}>{w}</span>)}
                  </div>
                </div>
              )}

              <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_150px] gap-3">
                <Field label={t("costControlDoc.field.jobName")} htmlFor="cci-jobName">
                  <input id="cci-jobName" className={`${field.input} w-full min-w-0`} value={result.header.jobName}
                    onChange={(e) => setHeader("jobName", e.target.value)} />
                </Field>
                <Field label={t("costControlDoc.field.workType")} htmlFor="cci-workType">
                  <input id="cci-workType" className={`${field.input} w-full min-w-0`} value={result.header.workType}
                    onChange={(e) => setHeader("workType", e.target.value)} />
                </Field>
                <Field label={t("costControlDoc.field.jobOrder")} htmlFor="cci-jobOrder">
                  <input id="cci-jobOrder" className={`${field.input} w-full min-w-0 font-mono text-[13px]`} value={result.header.jobOrder}
                    onChange={(e) => setHeader("jobOrder", e.target.value)} />
                </Field>
                <Field label={t("costControlDoc.field.docDate")} htmlFor="cci-docDate">
                  <input id="cci-docDate" type="date" className={`${field.input} w-full min-w-0`} value={result.header.docDate}
                    onChange={(e) => setHeader("docDate", e.target.value)} />
                </Field>
              </div>

              <div className="flex flex-col gap-2 min-h-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h3 className="text-[15px] font-semibold text-foreground">{t("costControlImport.preview")}</h3>
                  {/* ราคาในไฟล์ไม่ถูกนำเข้าเลย — บอกไว้ตรง ๆ ไม่งั้นคนจะนึกว่าระบบอ่านราคาไม่ออก */}
                  <span className="text-xs text-muted-foreground">{t("costControlImport.pricesNotImported")}</span>
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="overflow-auto max-h-[38vh]">
                    <table className="w-full min-w-[720px] table-fixed">
                      <colgroup>
                        <col className="w-[122px]" />
                        <col className="w-[66px]" />
                        <col />
                        <col className="w-[84px]" />
                        <col className="w-[84px]" />
                        <col className="w-[108px]" />
                        <col className="w-[108px]" />
                        <col className="w-[50px]" />
                      </colgroup>
                      <thead className="sticky top-0 z-[1]">
                        <tr className={table.head}>
                          {[t("costControlDoc.line.kind"), t("costControlDoc.line.seq"), t("costControlDoc.line.description"),
                            t("costControlDoc.line.qty"), t("costControlDoc.line.unit"), t("costControlDoc.line.unitCost"),
                            t("costControlDoc.line.total"), ""].map((h, i) => (
                            <th key={i} className={`px-[3px] first:pl-3 last:pr-3 font-semibold whitespace-nowrap ${i === 3 || i === 5 || i === 6 ? "text-right" : "text-left"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, idx) => (
                          <tr key={l.id} className={`border-b border-[#eef1f6] ${l.kind === "group" ? "bg-[#f8f9fc]" : "bg-white"}`}>
                            <td className="px-[3px] py-1.5 first:pl-3 text-[13px] text-[#3d5173] whitespace-nowrap">
                              {l.kind === "group" ? t("costControlDoc.line.kind.group")
                                : l.kind === "sub" ? t("costControlDoc.line.kind.sub") : t("costControlDoc.line.kind.item")}
                            </td>
                            <td className={`px-[3px] py-1.5 text-[13px] tabular-nums ${l.seq ? "text-foreground" : "text-[#8a97ad]"}`}>{l.seq || "—"}</td>
                            <td className="px-[3px] py-1.5">
                              <input className={`${cellCls} ${l.kind === "group" ? "font-semibold" : ""}`} value={l.description}
                                aria-label={t("costControlDoc.line.description")}
                                onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} />
                            </td>
                            <td className="px-[3px] py-1.5">
                              <input type="number" className={`${cellCls} text-right tabular-nums`} value={l.qty ?? ""}
                                aria-label={t("costControlDoc.line.qty")}
                                onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, qty: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                            </td>
                            <td className="px-[3px] py-1.5">
                              <UnitCombobox className={cellCls} value={l.unit}
                                ariaLabel={t("costControlDoc.line.unit")}
                                onChange={(next) => setLines(lines.map((x, i) => i === idx ? { ...x, unit: next } : x))} />
                            </td>
                            <td className="px-[3px] py-1.5">
                              <input type="number" className={`${cellCls} text-right tabular-nums`} value={l.unitCost ?? ""}
                                aria-label={t("costControlDoc.line.unitCost")}
                                onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, unitCost: e.target.value === "" ? null : Number(e.target.value) } : x))} />
                            </td>
                            {/* ยังไม่กรอกต้นทุน = ยังไม่มียอดรวม แสดง — ไม่โชว์ 0.00 ทั้งคอลัมน์
                                ตั้งแต่ไม่นำราคาจากไฟล์เข้ามาแล้ว (ใบพิมพ์ใช้กติกาเดียวกัน) */}
                            <td className={`px-[3px] py-1.5 text-sm text-right tabular-nums whitespace-nowrap ${l.kind === "group" || l.unitCost === null ? "text-[#8a97ad]" : "font-semibold text-foreground"}`}>
                              {l.kind === "group" || l.unitCost === null ? "—" : fmt(lineTotalCost(l))}
                            </td>
                            <td className="px-[3px] py-1.5 last:pr-3 text-right">
                              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                                aria-label={t("costControlImport.removeLine")} title={t("costControlImport.removeLine")}
                                className="w-8 h-9 inline-flex items-center justify-center rounded-lg text-[#8a97ad] hover:text-[#b93636] hover:bg-[#fcebeb] transition-colors">
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2.5 px-6 py-3.5 border-t border-border flex-shrink-0">
          <span className="flex-1 text-sm text-[#3d5173]">
            {result && (
              <>
                {countBefore}<strong className="font-semibold text-foreground">{lines.length}</strong>{countAfter}
              </>
            )}
          </span>
          <button type="button" onClick={onClose} className={btn.secondary}>
            {t("costControlImport.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!result || lines.length === 0 || creating}
            title={result && lines.length === 0 ? t("costControlImport.noLines") : undefined}
            className={btn.primary}
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
            {creating ? t("costControlImport.creating") : t("costControlImport.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
