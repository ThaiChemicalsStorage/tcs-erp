import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Trash2, TriangleAlert, Upload, X } from "lucide-react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { fmt } from "../../lib/quotes";
import { type CostControl, type CostControlLine, createCostControl, lineTotalCost } from "../../lib/costControl";
import {
  classifySheetName, parseCostControlSheet,
  type CostControlImportResult, type SheetFills,
} from "../../lib/costControlImport";

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
  /** ชีตที่อ่านได้ในไฟล์ — ถ้ามีมากกว่าหนึ่ง ให้คนเลือกเอง */
  const [sheets, setSheets] = useState<{ name: string; kind: "costControl" | "sc" }[]>([]);
  const [result, setResult] = useState<CostControlImportResult | null>(null);
  const [lines, setLines] = useState<CostControlLine[]>([]);
  const [rows, setRows] = useState<Record<string, string[][]>>({});
  const [fills, setFills] = useState<Record<string, SheetFills>>({});

  const applySheet = (grid: string[][], kind: "costControl" | "sc", fill?: SheetFills) => {
    const parsed = parseCostControlSheet(grid, kind, fill);
    setResult(parsed);
    setLines(parsed.lines);
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
      const readable = wb.SheetNames
        .map((name) => ({ name, kind: classifySheetName(name) }))
        .filter((s): s is { name: string; kind: "costControl" | "sc" } => s.kind !== null);

      if (readable.length === 0) {
        setError(t("costControlImport.errorNoSheet"));
        setResult(null);
        setSheets([]);
        return;
      }

      const grids: Record<string, string[][]> = {};
      const fillGrids: Record<string, SheetFills> = {};
      for (const s of readable) {
        const ws = wb.Sheets[s.name];
        grids[s.name] = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
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
        fillGrids[s.name] = fillGrid;
      }
      setRows(grids);
      setFills(fillGrids);
      setSheets(readable);
      // ชีต Cost Control ที่ทำไว้แล้วแม่นกว่า จึงเป็นค่าตั้งต้นเมื่อมีทั้งสองแบบ
      const preferred = readable.find((s) => s.kind === "costControl") ?? readable[0];
      applySheet(grids[preferred.name], preferred.kind, fillGrids[preferred.name]);
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
        sourceFileName: fileName,
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
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileSpreadsheet size={14} /> {fileName}
                </span>
                {sheets.length > 1 && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    {t("costControlImport.chooseSheet")}
                    <select
                      className="px-2 py-1 text-xs bg-secondary border border-border rounded outline-none focus:border-[#c9a84c]/50"
                      onChange={(e) => {
                        const picked = sheets.find((s) => s.name === e.target.value);
                        if (picked) applySheet(rows[picked.name], picked.kind, fills[picked.name]);
                      }}
                      defaultValue={sheets.find((s) => s.kind === "costControl")?.name ?? sheets[0].name}
                    >
                      {sheets.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name} — {s.kind === "costControl" ? t("costControlImport.sheetCostControl") : t("costControlImport.sheetSc")}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

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
                            {l.kind === "group" ? "—" : fmt(lineTotalCost(l))}
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
