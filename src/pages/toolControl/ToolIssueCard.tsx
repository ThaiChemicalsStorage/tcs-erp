import { useEffect, useMemo, useState } from "react";
import { Hammer, Loader2, PackageMinus, Plus, Search, Undo2 } from "lucide-react";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { fetchProducts, type Product } from "../../lib/products";
import type { Department } from "../../lib/departments";
import type { Team } from "../../lib/teams";
import type { CodeEntry } from "../../lib/codeRegister";
import { fetchToolHoldings, issueTools, type ToolHoldingRow } from "../../lib/toolHoldings";
import { Field, SelectBox } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { BoldCount, Tag } from "../stock/inventoryUi";
import { AddCommonToolDrawer, CommonToolStockDialog } from "./CommonToolDialogs";

/** ช่องจำนวนเกินเพดาน — กรอบแดงแทนกรอบเทา */
const qtyErrorCls = field.cell.replace("border-[#c3ccda]", "border-[#b93636]");

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
 *
 * ดีไซน์ใหม่ 2026-09-30: อยู่ในการ์ดเดียวกับแท็บ — ส่วนบน (จ่าย/รับคืน + แผนก/ทีม/งาน) · แถบค้นหา ·
 * ตาราง (แถวที่ใส่จำนวนแล้วพื้นฟ้าอ่อน) · หมายเหตุ · แถบท้าย (เลือกไว้ N รายการ + ปุ่มบันทึก)
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
  /** เครื่องมือกองกลาง (2026-09-29) — เพิ่มจากหน้านี้ได้เลย · กดรหัส/ชื่อของตัวที่เพิ่มจากหน้านี้เพื่ออัปเดตยอดสต๊อก */
  const [addingTool, setAddingTool] = useState(false);
  const [stockTool, setStockTool] = useState<Product | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProducts()
      // ล้าง error ของรอบก่อนด้วย — ไม่งั้นโหลดพลาดครั้งเดียวแล้วแถบแดงค้างอยู่ตลอด แม้รอบถัดไป
      // (เช่น รอบที่ยิงใหม่หลังบันทึกสำเร็จ) จะโหลดผ่านแล้วก็ตาม
      .then((list) => { if (!cancelled) { setTools(list.filter((p) => p.isTool && !p.archived)); setError(""); } })
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

  const toolName = (p: Product) => (
    <>
      <span className="font-mono text-[12.5px] font-medium text-[#3d5173] flex-shrink-0">{p.code}</span>
      <span className="truncate">{p.name}</span>
    </>
  );

  return (
    <div className="print:hidden flex flex-col">
      {/* จ่ายให้ใคร */}
      <div className="px-5 py-5 border-b border-[#eef1f6] flex flex-col gap-4">
        <div role="radiogroup" aria-label={t("toolControl.col.kind")} className="self-start w-full sm:w-[380px] grid grid-cols-2 gap-0.5 p-[3px] bg-[#eef1f6] rounded-lg">
          {(["issue", "return"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setQty({}); setError(""); }}
              className={`h-[34px] rounded-md flex items-center justify-center gap-2 text-sm transition-colors ${mode === m ? "bg-white text-foreground font-semibold shadow-[0_1px_2px_rgba(11,29,58,0.12)]" : "text-muted-foreground font-medium hover:text-foreground"}`}>
              {m === "issue" ? <PackageMinus size={16} /> : <Undo2 size={16} />}
              {t(m === "issue" ? "toolControl.issue.modeIssue" : "toolControl.issue.modeReturn")}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 max-w-[900px]">
          <Field label={t("toolControl.issue.department")} htmlFor="tool-issue-dept" required>
            <SelectBox id="tool-issue-dept" value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setTeamId(""); }}>
              <option value="">{t("toolControl.issue.choose")}</option>
              {departments.filter((d) => d.isActive).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectBox>
          </Field>
          <Field label={t("toolControl.issue.team")} htmlFor="tool-issue-team" required>
            <SelectBox id="tool-issue-team" value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!departmentId}>
              <option value="">{t("toolControl.issue.choose")}</option>
              {teamsOfDepartment.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </SelectBox>
          </Field>
          <Field label={t("toolControl.issue.workType")} htmlFor="tool-issue-worktype">
            <SelectBox id="tool-issue-worktype" value={workTypeCode} onChange={(e) => setWorkTypeCode(e.target.value)}>
              <option value="">{t("toolControl.issue.none")}</option>
              {workTypes.map((w) => <option key={w.id} value={w.code}>{w.code} — {w.name}</option>)}
            </SelectBox>
          </Field>
        </div>
      </div>

      {/* รายการเครื่องมือ */}
      <div className="flex items-center gap-2.5 flex-wrap px-5 py-3.5 border-b border-[#eef1f6]">
        <label className={`${field.box} w-full sm:w-[340px]`}>
          <Search size={16} className="text-muted-foreground flex-shrink-0" aria-hidden="true" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("toolControl.issue.searchPlaceholder")}
            aria-label={t("toolControl.issue.searchPlaceholder")}
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none" />
        </label>
        <span className="flex-1" />
        <button type="button" onClick={() => setAddingTool(true)} className={btn.secondarySm}>
          <Plus size={15} /> {t("toolControl.commonTool.add")}
        </button>
      </div>

      <div className="overflow-x-auto max-h-[26rem] overflow-y-auto">
        <table className="w-full min-w-[620px] table-fixed">
          <thead className="sticky top-0 z-[1]">
            <tr className={table.head}>
              <th className={table.th}>{t("toolControl.col.product")}</th>
              <th className={`${table.th} w-[100px]`}>{t("toolControl.col.unit")}</th>
              <th className={`${table.th} w-[110px] text-right`}>{mode === "issue" ? t("toolControl.issue.onHand") : t("toolControl.col.held")}</th>
              <th className={`${table.th} w-[140px] text-right`}>{t("toolControl.issue.qty")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-10 text-center text-sm text-muted-foreground">
                {mode === "return" && !teamId ? t("toolControl.issue.pickTeamFirst") : t("toolControl.issue.noTools")}
              </td></tr>
            )}
            {rows.map((p) => {
              const cap = mode === "issue" ? (p.stockQty ?? 0) : (heldByProduct.get(p.id) ?? 0);
              const raw = qty[p.id] ?? "";
              const typed = Number(raw);
              const picked = raw !== "" && Number.isFinite(typed) && typed > 0;
              const over = Number.isFinite(typed) && typed > cap;
              return (
                <tr key={p.id} className={`h-[52px] border-b border-[#eef1f6] text-sm transition-colors ${picked ? "bg-[#eef4fc]" : "bg-white hover:bg-[#f8f9fc]"}`}>
                  <td className={table.td}>
                    <span className="flex items-center gap-2.5 min-w-0">
                      {p.commonTool ? (
                        // เครื่องมือกองกลาง: กดรหัสหรือชื่อ = อัปเดตยอดสต๊อก (ทั้งปุ่มเป็นเป้าเดียว)
                        <button type="button" onClick={() => setStockTool(p)} title={t("toolControl.commonTool.stockTitle")}
                          className="flex items-center gap-2.5 min-w-0 text-left hover:text-[#1a5fb4] hover:underline underline-offset-2">
                          {toolName(p)}
                        </button>
                      ) : toolName(p)}
                      {p.commonTool && <Tag tone="gold">{t("toolControl.commonTool.badge")}</Tag>}
                    </span>
                  </td>
                  <td className={`${table.td} text-[#3d5173] truncate`}>{p.unit || "—"}</td>
                  <td className={`${table.td} text-right font-medium tabular-nums ${cap <= 0 ? "text-[#b93636]" : "text-foreground"}`}>{cap.toLocaleString("th-TH")}</td>
                  <td className={`${table.td} text-right`}>
                    <input type="number" min={0} max={cap} value={raw} placeholder="0"
                      aria-label={`${t("toolControl.issue.qty")} ${p.name}`}
                      aria-invalid={over || undefined}
                      onChange={(e) => setQty((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      className={`${over ? qtyErrorCls : field.cell} w-24 text-right tabular-nums`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-4">
        <Field label={t("toolControl.issue.note")} htmlFor="tool-issue-note" className="max-w-[600px]">
          <input id="tool-issue-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("toolControl.issue.notePlaceholder")}
            className={`${field.input} w-full`} />
        </Field>
        {error && <p className={`${field.error} mt-3`} role="alert">{error}</p>}
      </div>

      <div className="flex items-center gap-2.5 px-5 py-3.5 border-t border-border">
        <span className="flex-1 text-sm text-[#3d5173]">
          <BoldCount template={t("toolControl.issue.selected")} value={lines.length} />
        </span>
        <button type="button" onClick={() => void submit()} disabled={busy || lines.length === 0} className={btn.primary}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Hammer size={16} />}
          {t(mode === "issue" ? "toolControl.issue.submitIssue" : "toolControl.issue.submitReturn")}
        </button>
      </div>

      <AddCommonToolDrawer
        open={addingTool}
        onCancel={() => setAddingTool(false)}
        onSaved={(product) => {
          setAddingTool(false);
          showToast(t("toolControl.commonTool.addedToast").replace("{code}", product.code));
          setReloadToken((n) => n + 1);
        }}
      />
      {stockTool && (
        <CommonToolStockDialog
          product={stockTool}
          onCancel={() => setStockTool(null)}
          onSaved={(product) => {
            setStockTool(null);
            showToast(t("toolControl.commonTool.stockToast").replace("{code}", product.code).replace("{n}", (product.stockQty ?? 0).toLocaleString("th-TH")));
            setReloadToken((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
