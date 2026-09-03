import { useEffect, useMemo, useState } from "react";
import { Hammer, Loader2, PackageMinus, Search, Undo2 } from "lucide-react";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { fetchProducts, type Product } from "../../lib/products";
import type { Department } from "../../lib/departments";
import type { Team } from "../../lib/teams";
import type { CodeEntry } from "../../lib/codeRegister";
import { fetchToolHoldings, issueTools, type ToolHoldingRow } from "../../lib/toolHoldings";

const selectCls = "h-9 w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 outline-none focus:border-[#c9a84c]/50 transition-colors";
const qtyCls = "w-24 px-2 py-1.5 text-sm text-right bg-secondary border border-border rounded outline-none focus:border-[#c9a84c]/50 transition-colors";

/**
 * จ่าย / รับคืนเครื่องมือให้ทีมโดยตรง — เจ้าของสั่ง *"หน้าตัดเบิกเครื่องมือ มีแผนกในการเบิกโครงการ
 * หรือผลิต"*
 *
 * **ไม่ใช่บัญชีชุดที่สอง** ทุกบรรทัดที่กดที่นี่เขียนลง `stock_movements` เหมือนการจ่ายของบนใบเบิก
 * ต่างแค่ `sourceType` และได้เลขที่ `TL-YYYYMM-NNNN` ของตัวเอง ยอดในแท็บ "ในครอบครอง" จึงรวม
 * ของที่จ่ายจากทั้งสองทางเสมอ
 *
 * โหมดรับคืนอ่านยอดที่ทีมถืออยู่จริงมาแสดงเป็นเพดาน — คืนได้เฉพาะของที่เบิกไปจริง เซิร์ฟเวอร์
 * ตรวจซ้ำอีกชั้น (ตรงนี้แค่ช่วยให้รู้เร็ว)
 */
export function ToolIssueCard({
  departments, teams, workTypes, onDone, showToast,
}: {
  departments: Department[];
  teams: Team[];
  workTypes: CodeEntry[];
  onDone: () => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"issue" | "return">("issue");
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [workTypeCode, setWorkTypeCode] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [tools, setTools] = useState<Product[]>([]);
  // ผลผูกกับทีมที่ขอไป แล้วค่อยเทียบตอนอ่าน — นอกจากเลี่ยง setState ตรง ๆ ในเอฟเฟกต์แล้ว
  // ยังกันไม่ให้ยอดของทีมก่อนหน้าค้างอยู่บนจอระหว่างที่คำขอของทีมใหม่ยังไม่กลับมา
  const [heldResult, setHeldResult] = useState<{ teamId: string; rows: ToolHoldingRow[] }>({ teamId: "", rows: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** เพิ่มค่าหลังบันทึกสำเร็จ เพื่อดึงยอดคงเหลือและยอดถือครองใหม่ — ไม่งั้นช่อง "คงเหลือ" ในตาราง
   *  ยังโชว์ยอดก่อนจ่าย ซึ่งอ่านแล้วเหมือนกดไม่ติด (เจอตอนไล่กดทดสอบ 2026-09-03b) */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      .then((list) => { if (!cancelled) setTools(list.filter((p) => p.isTool && !p.archived)); })
      .catch(() => { if (!cancelled) setError(t("toolControl.issue.errorLoadTools")); });
    return () => { cancelled = true; };
  }, [t, reloadToken]);

  // ยอดที่ทีมถืออยู่ — โหลดใหม่ทุกครั้งที่เปลี่ยนทีม ใช้เป็นเพดานของโหมดรับคืน
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    fetchToolHoldings({ teamId })
      .then((rows) => { if (!cancelled) setHeldResult({ teamId, rows }); })
      .catch(() => { if (!cancelled) setHeldResult({ teamId, rows: [] }); });
    return () => { cancelled = true; };
  }, [teamId, reloadToken]);

  const teamsOfDepartment = teams.filter((tm) => tm.isActive && (!departmentId || tm.departmentId === departmentId));
  const heldByProduct = useMemo(
    () => new Map(heldResult.teamId === teamId ? heldResult.rows.map((h) => [h.productId, h.held] as const) : []),
    [heldResult, teamId],
  );

  const q = search.trim().toLowerCase();
  const rows = (mode === "issue"
    ? tools
    : tools.filter((p) => (heldByProduct.get(p.id) ?? 0) > 0)
  ).filter((p) => !q || [p.code, p.name].some((v) => (v ?? "").toLowerCase().includes(q)));

  const lines = Object.entries(qty)
    .map(([productId, v]) => ({ productId, qty: Number(v) }))
    .filter((l) => Number.isFinite(l.qty) && l.qty > 0);

  const reset = () => { setQty({}); setNote(""); setSearch(""); };

  const submit = async () => {
    if (!departmentId) { setError(t("toolControl.issue.errorDepartment")); return; }
    if (!teamId) { setError(t("toolControl.issue.errorTeam")); return; }
    if (lines.length === 0) { setError(t("toolControl.issue.errorNoLines")); return; }
    if (mode === "return") {
      const over = lines.find((l) => l.qty > (heldByProduct.get(l.productId) ?? 0));
      if (over) {
        const p = tools.find((x) => x.id === over.productId);
        setError(t("toolControl.issue.errorOverReturn").replace("{item}", `${p?.code ?? ""} ${p?.name ?? ""}`.trim()));
        return;
      }
    }
    setError("");
    setBusy(true);
    try {
      const result = await issueTools({ mode, departmentId, teamId, workTypeCode, note, lines });
      showToast(t(mode === "issue" ? "toolControl.issue.issuedToast" : "toolControl.issue.returnedToast").replace("{no}", result.slipNumber));
      reset();
      setReloadToken((n) => n + 1);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("toolControl.issue.errorSave"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5 print:hidden">
      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit">
        {(["issue", "return"] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setQty({}); setError(""); }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-lg font-medium transition-all ${mode === m ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
            {m === "issue" ? <PackageMinus size={13} /> : <Undo2 size={13} />}
            {t(m === "issue" ? "toolControl.issue.modeIssue" : "toolControl.issue.modeReturn")}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="text-xs text-muted-foreground space-y-1.5">
          <span className="block">{t("toolControl.issue.department")} *</span>
          <select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setTeamId(""); }} className={selectCls}>
            <option value="">{t("toolControl.issue.choose")}</option>
            {departments.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground space-y-1.5">
          <span className="block">{t("toolControl.issue.team")} *</span>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={selectCls} disabled={!departmentId}>
            <option value="">{t("toolControl.issue.choose")}</option>
            {teamsOfDepartment.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground space-y-1.5">
          <span className="block">{t("toolControl.issue.workType")}</span>
          <select value={workTypeCode} onChange={(e) => setWorkTypeCode(e.target.value)} className={selectCls}>
            <option value="">{t("toolControl.issue.none")}</option>
            {workTypes.map((w) => <option key={w.id} value={w.code}>{w.code} — {w.name}</option>)}
          </select>
        </label>
      </div>

      <div className="relative h-9 w-72">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("toolControl.issue.searchPlaceholder")}
          className="h-9 w-full pl-9 pr-3 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
      </div>

      <div className="border border-border rounded-lg overflow-x-auto max-h-[22rem] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-muted/90 backdrop-blur">
            <tr className="border-b border-border">
              {[t("toolControl.col.product"), t("toolControl.col.unit"), t("toolControl.issue.onHand"), t("toolControl.issue.qty")].map((h, i) => (
                <th key={h} className={`px-3 py-2.5 text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {mode === "return" && !teamId ? t("toolControl.issue.pickTeamFirst") : t("toolControl.issue.noTools")}
              </td></tr>
            )}
            {rows.map((p) => {
              const cap = mode === "issue" ? (p.stockQty ?? 0) : (heldByProduct.get(p.id) ?? 0);
              const typed = Number(qty[p.id] ?? "");
              return (
                <tr key={p.id} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-2 text-sm text-foreground"><span className="font-mono text-xs text-[#c9a84c] mr-2">{p.code}</span>{p.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.unit || "—"}</td>
                  <td className={`px-3 py-2 text-xs font-mono text-right ${cap <= 0 ? "text-[#a75d1a]" : "text-muted-foreground"}`}>{cap.toLocaleString("th-TH")}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min={0} max={cap} value={qty[p.id] ?? ""}
                      aria-label={`${t("toolControl.issue.qty")} ${p.name}`}
                      onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className={`${qtyCls} ${Number.isFinite(typed) && typed > cap ? "border-[#e05252]" : ""}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label className="text-xs text-muted-foreground space-y-1.5 block">
        <span className="block">{t("toolControl.issue.note")}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("toolControl.issue.notePlaceholder")}
          className="h-9 w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 outline-none focus:border-[#c9a84c]/50 transition-colors" />
      </label>

      {error && <p className="text-xs text-[#e05252]" role="alert">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={() => void submit()} disabled={busy || lines.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#c9a84c] text-[#0b1d3a] rounded-lg hover:bg-[#f0c040] transition-colors disabled:opacity-60">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Hammer size={13} />}
          {t(mode === "issue" ? "toolControl.issue.submitIssue" : "toolControl.issue.submitReturn")}
        </button>
        <span className="text-xs text-muted-foreground">{t("toolControl.issue.selected").replace("{n}", String(lines.length))}</span>
      </div>
    </div>
  );
}
