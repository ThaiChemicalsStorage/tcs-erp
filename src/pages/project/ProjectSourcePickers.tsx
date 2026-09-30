import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search, X, ChevronLeft, ChevronRight, Check, Minus, Loader2, Building2, Info, Plus } from "lucide-react";
import { fetchScopeOfWork, fetchAllScopeOfWorks, type ScopeOfWorkListItem } from "../../lib/scopeOfWork";
import {
  fetchAllProjects, fetchProject, fetchProjectsByScope,
  type ProjectListItem, type ProjectItem, type ProjectItemSourcingMethod,
} from "../../lib/project";
import { fetchAllProductionOrders, type ProductionOrderSummary } from "../../lib/productionOrder";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { btn } from "../../components/ui/styles";
import { Tag } from "./projectUi";
import { useI18n } from "../../lib/i18n";

// กล่องเลือก "ต้นทาง" สำหรับปุ่มกดสร้างในหน้าของแต่ละเอกสารฝ่ายโครงการ (เพิ่ม 2026-08-20 ตามคำขอตรง
// "อยากให้มันสามารถกดสร้างในหน้าของตัวเองได้เลย ตอนกดสร้างก็ขึ้นมาให้เลือกว่าจะมาจากใบไหน") — เดิมสร้าง
// เอกสารทั้ง 3 ประเภทได้จากในหน้าโครงการเท่านั้น หน้ารายการของแต่ละเอกสารมีแต่รายการ ไม่มีปุ่มสร้าง
//
// ดีไซน์ใหม่ 2026-09-30: กล่องกว้าง 880 แบบตาราง · **เลือกแล้วต้องกดยืนยัน** (เดิมคลิกแถวแล้วสร้างทันที) ·
// กล่องสองขั้นมีแถบขั้นตอน 1 → 2 · API ของสามคอมโพเนนต์นี้เหมือนเดิมทุกประการ — หน้าโครงการ ใบเบิก ใบสั่งงาน
// ใบขอซื้อ และใบสั่งผลิตเรียกใช้อยู่

/** โครงกล่องเลือกกว้าง 880 (หัว · แถบขั้นตอน · แถบเครื่องมือ · ตารางเลื่อนได้ · ท้ายกล่อง) */
function PickerShell({ title, subtitle, onClose, busy, steps, toolbar, info, head, minWidth = 640, children, footer }: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  busy: boolean;
  steps?: ReactNode;
  toolbar?: ReactNode;
  info?: ReactNode;
  head?: ReactNode;
  minWidth?: number;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useI18n();
  const close = () => { if (!busy) onClose(); };
  const panelRef = useDialogA11y(close);
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-[#0b1d3a]/45" onClick={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-[880px] h-[640px] max-h-[88vh] bg-card rounded-xl shadow-[0_24px_48px_-12px_rgba(11,29,58,0.35)] flex flex-col overflow-hidden">
        <div className={`px-6 pt-5 flex flex-col gap-3.5 border-b border-[#eef1f6] pb-4`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-foreground leading-snug">{title}</h2>
              {subtitle && <p className="text-[13px] text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" onClick={close} aria-label={t("project.picker.close")} className="w-9 h-9 -mr-2 -mt-1 rounded-lg text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground flex items-center justify-center flex-shrink-0">
              <X size={18} />
            </button>
          </div>
          {steps}
        </div>
        {toolbar && <div className="px-6 py-3.5 flex items-center gap-2.5 flex-wrap border-b border-[#eef1f6]">{toolbar}</div>}
        {info && <div className="px-6 py-3 flex items-center gap-3 bg-[#f8f9fc] border-b border-[#eef1f6] text-[13px] text-[#3d5173]">{info}</div>}
        <div className="flex-1 min-h-0 overflow-auto">
          <div style={{ minWidth }}>
            {head && <div className="sticky top-0 z-[1] h-10 px-6 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]">{head}</div>}
            {children}
          </div>
        </div>
        <div className="px-6 py-3.5 border-t border-border flex items-center gap-2.5 flex-wrap">{footer}</div>
      </div>
    </div>
  );
}

/** แถบขั้นตอนของกล่องสองขั้น — ขั้นที่ผ่านแล้วเป็นวงเขียวมีเครื่องหมายถูก พร้อมป้ายสิ่งที่เลือกไว้ */
function PickerSteps({ labels, current, picked }: { labels: [string, string]; current: 0 | 1; picked?: ReactNode }) {
  const { t } = useI18n();
  return (
    <ol aria-label={t("project.picker.stepOf").replace("{n}", String(current + 1)).replace("{total}", "2")} className="m-0 p-0 list-none flex items-center gap-3 text-[13px]">
      <li aria-current={current === 0 ? "step" : undefined} className={`flex items-center gap-2 flex-shrink-0 min-w-0 ${current === 0 ? "font-semibold text-foreground" : "text-[#3d5173]"}`}>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${current === 0 ? "bg-[#0b1d3a] text-white" : "bg-[#e6f4ec] text-[#1b7f4f]"}`}>
          {current === 0 ? "1" : <Check size={13} strokeWidth={3} />}
        </span>
        {labels[0]}
        {current === 1 && picked && (
          <span className="h-6 px-2 rounded-md bg-[#eef1f6] text-foreground font-mono text-[12.5px] font-medium inline-flex items-center truncate max-w-[220px]">{picked}</span>
        )}
      </li>
      <li aria-hidden="true" className={`flex-1 min-w-6 ${current === 1 ? "h-0.5 rounded bg-[#1b7f4f]" : "h-px bg-[#d6dce6]"}`} />
      <li aria-current={current === 1 ? "step" : undefined} className={`flex items-center gap-2 flex-shrink-0 ${current === 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${current === 1 ? "bg-[#0b1d3a] text-white" : "border border-[#c3ccda]"}`}>2</span>
        {labels[1]}
      </li>
    </ol>
  );
}

/** ช่องค้นหาในแถบเครื่องมือของกล่อง */
function PickerSearch({ value, onChange, placeholder, wide = false }: { value: string; onChange: (v: string) => void; placeholder: string; wide?: boolean }) {
  return (
    <label className={`w-full ${wide ? "sm:w-[400px]" : "sm:w-[340px]"} h-10 px-3 rounded-lg border border-[#c3ccda] bg-white flex items-center gap-2 focus-within:border-[#1a5fb4] focus-within:ring-2 focus-within:ring-[#1a5fb4]/20 transition-colors`}>
      <Search size={16} className="text-muted-foreground flex-shrink-0" />
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-[#8a97ad] outline-none" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label={placeholder} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
      )}
    </label>
  );
}

/** วงกลมเลือก (radio) */
function RadioMark({ on, off = false }: { on: boolean; off?: boolean }) {
  return (
    <span aria-hidden="true" className={`w-[18px] h-[18px] rounded-full border-[1.5px] bg-white flex items-center justify-center flex-shrink-0 ${on ? "border-[#0b1d3a]" : off ? "border-[#d6dce6]" : "border-[#a3aec2]"}`}>
      {on && <span className="w-2 h-2 rounded-full bg-[#0b1d3a]" />}
    </span>
  );
}

/** กล่องติ๊ก (checkbox) — mixed = เลือกบางส่วน */
function CheckMark({ state }: { state: boolean | "mixed" }) {
  const on = state !== false;
  return (
    <span aria-hidden="true" className={`w-[18px] h-[18px] rounded border-[1.5px] flex items-center justify-center flex-shrink-0 text-white ${on ? "bg-[#0b1d3a] border-[#0b1d3a]" : "bg-white border-[#a3aec2]"}`}>
      {state === "mixed" ? <Minus size={12} strokeWidth={3} /> : state ? <Check size={12} strokeWidth={3} /> : null}
    </span>
  );
}

const keyActivate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
};

/** แถวที่เลือกได้ในกล่อง — radio หรือ checkbox · ดับเบิลคลิกแถว radio = เลือกแล้วยืนยันเลย (ทางลัด) */
function PickRow({ kind, checked, disabled = false, cols, onPick, onConfirm, children }: {
  kind: "radio" | "checkbox";
  checked: boolean;
  disabled?: boolean;
  cols: string;
  onPick: () => void;
  onConfirm?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role={kind}
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onPick}
      onDoubleClick={disabled || !onConfirm ? undefined : onConfirm}
      onKeyDown={disabled ? undefined : keyActivate(onPick)}
      className={`grid gap-3.5 items-center px-6 min-h-14 py-2 border-b border-[#eef1f6] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 transition-colors ${cols} ${
        disabled ? "cursor-not-allowed text-[#8a97ad] bg-white" : checked ? "cursor-pointer bg-[#eef4fc]" : "cursor-pointer bg-white hover:bg-[#f8f9fc]"
      }`}
    >
      {kind === "radio" ? <RadioMark on={checked} off={disabled} /> : <CheckMark state={checked} />}
      {children}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="px-6 py-4 space-y-2" aria-hidden="true">
      {[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
    </div>
  );
}

function PickerMessage({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-14 px-6 flex flex-col items-center gap-2 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-[13px] text-muted-foreground max-w-md">{hint}</p>}
    </div>
  );
}

/** "เลือกแล้ว XXX" ซ้ายท้ายกล่อง */
function SelectedNote({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <span className="flex-1 min-w-0 text-sm text-[#3d5173] truncate">
      {t("project.picker.selectedLabel")} <strong className="font-semibold text-foreground font-mono">{children}</strong>
    </span>
  );
}

/**
 * เลือก Scope of Work เพื่อสร้างโครงการใหม่ — ใช้บนหน้า "โครงการ"
 * Scope of Work already carrying a project is shown disabled rather than hidden, so the user can see
 * *why* it isn't selectable instead of wondering where their job went (the API refuses nothing here —
 * `POST /api/projects` allows several projects per scope — but creating a second one by accident is
 * far more likely to be a mistake than intent, so the UI steers away from it while staying honest).
 */
export function ScopeOfWorkSourcePickerDialog({ onClose, onSelect, allowMultiplePerScope = false, requireFinalScope = true, pickItems = false, purpose = "project" }: {
  onClose: () => void;
  /**
   * ใช้เปิดอะไร — ข้อความหัวกล่อง/คำอธิบาย/ปุ่มย้อนกลับเปลี่ยนตามนี้ (2026-09-29: ใบสั่งผลิตเคยขึ้น "เลือกงานที่จะสร้างโครงการ"
   * เพราะใช้ข้อความของโครงการทั้งกล่อง)
   */
  purpose?: "project" | "productionOrder";
  /** `itemIds` มีค่าเฉพาะเมื่อเปิด `pickItems` — ไม่งั้นเป็น undefined แปลว่า "เอาทุกรายการ" */
  onSelect: (scopeOfWorkId: string, itemIds?: string[]) => void;
  /**
   * ปิดการเช็ค "มีโครงการแล้ว" — ใช้กับใบสั่งผลิต ซึ่งงานหนึ่งออกได้หลายใบตามจำนวนสินค้าที่ต้องผลิต
   * (ต่างจากโครงการที่ปกติมีใบเดียวต่อหนึ่งงาน) ตัวเช็คนั้นยิง API ต่อ 1 งาน จึงข้ามไปเลยเมื่อไม่ใช้
   */
  allowMultiplePerScope?: boolean;
  /**
   * เพิ่มขั้นที่สอง: เลือกงานแล้วติ๊กว่าจะเอารายการไหนบ้าง (ฝ่ายผลิตขอไว้ 2026-08-27 "อยากให้พวกนี้
   * มันติ๊กเลือกได้ เพราะแต่ละอันไม่เหมือนกัน") — หนึ่งงานออกใบสั่งผลิตได้หลายใบ ใบละสินค้า
   * ไม่เปิดโหมดนี้ = เลือกงานแล้วกดสร้าง
   */
  pickItems?: boolean;
  /**
   * บังคับว่า Scope of Work ต้องอนุมัติแล้ว (Final) — จริงๆ ตัวบังคับคือเซิร์ฟเวอร์ ตรงนี้แค่สะท้อนให้
   * โครงการยังคงบังคับ (projectHandler.ts) ส่วนใบสั่งผลิตส่ง false มา เพราะปลดด่านไปแล้ว
   * ตามที่ฝ่ายผลิตขอไว้เมื่อ 2026-08-27
   */
  requireFinalScope?: boolean;
}) {
  const { t } = useI18n();
  const forProduction = purpose === "productionOrder";
  const [scopes, setScopes] = useState<ScopeOfWorkListItem[]>([]);
  const [existingByScope, setExistingByScope] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  /** งานที่เลือกไว้ในขั้นแรก (ยังไม่ยืนยัน) */
  const [selected, setSelected] = useState<ScopeOfWorkListItem | null>(null);
  // ขั้นที่สอง (เฉพาะโหมด pickItems)
  const [pickedScope, setPickedScope] = useState<ScopeOfWorkListItem | null>(null);
  const [scopeItems, setScopeItems] = useState<{ id: string; name: string; quantity: number | null; unit: string }[] | null>(null);
  const [scopeItemsError, setScopeItemsError] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchAllScopeOfWorks()
      .then(async (list) => {
        if (cancelled) return;
        setScopes(list);
        setLoading(false);
        // แต่ละงานมีโครงการอยู่แล้วหรือยัง — ยิงทีละใบ (ไม่มี endpoint รวม) จึงโหลดหลังแสดงรายการแล้ว
        // เพื่อไม่ให้หน่วงการเปิดกล่อง; ระหว่างรอ แถวยังเลือกได้ตามปกติ
        if (allowMultiplePerScope) return;
        const pairs = await Promise.all(list.map(async (s) => {
          try {
            const projects = await fetchProjectsByScope(s.id);
            return [s.id, projects[0]?.id ?? ""] as const;
          } catch { return [s.id, ""] as const; }
        }));
        if (!cancelled) setExistingByScope(Object.fromEntries(pairs.filter(([, v]) => v)));
      })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [allowMultiplePerScope]);

  const q = search.trim().toLowerCase();
  const filtered = scopes.filter((s) => !q
    || s.scopeNumber.toLowerCase().includes(q)
    || s.customerName.toLowerCase().includes(q)
    || s.quotationNumber.toLowerCase().includes(q));
  const blockReason = (s: ScopeOfWorkListItem): "notApproved" | "taken" | null => {
    // โครงการยังต้องใช้งานที่อนุมัติแล้ว — ตรงกับด่านฝั่งเซิร์ฟเวอร์ใน handleCreate() (api/_lib/projectHandler.ts)
    // ส่วนใบสั่งผลิตปลดด่านไปแล้ว จึงส่ง requireFinalScope=false มา
    if (requireFinalScope && s.status !== "Final") return "notApproved";
    if (!allowMultiplePerScope && existingByScope[s.id]) return "taken";
    return null;
  };
  const openable = scopes.filter((s) => !blockReason(s)).length;
  // งานที่เลือกไว้กลายเป็นเลือกไม่ได้ (ผลเช็ค "มีโครงการแล้ว" มาถึงทีหลัง) — ไม่ให้ยืนยันงานนั้น
  const selectedOk = selected && !blockReason(selected) ? selected : null;

  const confirmScope = (s: ScopeOfWorkListItem | null = selectedOk) => {
    if (!s || busy) return;
    if (!pickItems) { setBusy(true); onSelect(s.id); return; }
    // โหมดติ๊กรายการ: โหลดรายการของงานนี้ก่อน แล้วค่อยให้เลือก
    setPickedScope(s);
    setScopeItems(null);
    setScopeItemsError(false);
    setCheckedItems(new Set());
    fetchScopeOfWork(s.id)
      .then((full) => setScopeItems(full.items.filter((it) => !it.isSectionHeader).map((it) => ({ id: it.id, name: it.name, quantity: it.quantity, unit: it.unit }))))
      .catch(() => setScopeItemsError(true));
  };

  const title = t(forProduction ? "productionOrder.picker.scope.title" : "project.picker.scope.title");
  const stepLabels: [string, string] = [t("project.picker.step.scope"), t("project.picker.step.items")];

  if (pickedScope) {
    const items = scopeItems ?? [];
    const allState: boolean | "mixed" = checkedItems.size === 0 ? false : checkedItems.size === items.length ? true : "mixed";
    const toggleAll = () => setCheckedItems(allState === true ? new Set() : new Set(items.map((i) => i.id)));
    const cols = "grid-cols-[18px_minmax(0,1fr)_140px]";
    return (
      <PickerShell
        title={title}
        subtitle={t("project.picker.item.description")}
        onClose={onClose}
        busy={busy}
        steps={<PickerSteps labels={stepLabels} current={1} picked={pickedScope.scopeNumber} />}
        info={
          <>
            <span className="w-8 h-8 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={16} /></span>
            <span className="flex-1 min-w-0 truncate">
              <span className="font-mono">{pickedScope.scopeNumber}</span>
              <span className="text-[#c3ccda]"> · </span>{pickedScope.customerName}
              {pickedScope.quotationNumber && <><span className="text-[#c3ccda]"> · </span><span className="font-mono">{pickedScope.quotationNumber}</span></>}
            </span>
          </>
        }
        head={items.length > 0 ? (
          <div className={`h-full grid gap-3.5 items-center ${cols}`}>
            <span role="checkbox" aria-checked={allState} aria-label={t("project.picker.selectAll")} tabIndex={0} onClick={toggleAll} onKeyDown={keyActivate(toggleAll)} className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 rounded">
              <CheckMark state={allState} />
            </span>
            <span>{t("project.picker.col.item")}</span>
            <span className="text-right">{t("project.items.col.quantity")}</span>
          </div>
        ) : undefined}
        footer={
          <>
            <button type="button" onClick={() => { setPickedScope(null); setScopeItems(null); setScopeItemsError(false); setCheckedItems(new Set()); }} disabled={busy} className={btn.secondary}>
              <ChevronLeft size={16} /> {t(forProduction ? "productionOrder.picker.back" : "project.picker.back")}
            </button>
            <span className="flex-1 min-w-0 pl-1.5 text-sm text-[#3d5173]">
              {t("project.picker.item.selectedCount").replace("{n}", String(checkedItems.size))}
            </span>
            {/* ยืนยันได้แม้ไม่มีรายการให้ติ๊กเลย — งานที่ไม่มีรายการ (หรือมีแต่หัวข้อคั่น) ต้องยังเปิดใบสั่งผลิตเปล่าได้
                ไม่งั้นผู้ใช้จะเจอทางตัน กดอะไรต่อไม่ได้นอกจากย้อนกลับ */}
            <button
              type="button"
              onClick={() => { setBusy(true); onSelect(pickedScope.id, [...checkedItems]); }}
              disabled={busy || scopeItems === null || (items.length > 0 && checkedItems.size === 0)}
              className={btn.primary}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("project.picker.item.confirm")}
            </button>
          </>
        }
      >
        {scopeItemsError ? <PickerMessage title={t("project.picker.loadError")} />
          : scopeItems === null ? <SkeletonRows />
          : items.length === 0 ? (
            <PickerMessage title={t("project.picker.item.emptyTitle")} hint={t(forProduction ? "productionOrder.picker.item.emptyDescription" : "project.picker.item.emptyDescription")} />
          ) : items.map((item) => (
            <PickRow
              key={item.id}
              kind="checkbox"
              checked={checkedItems.has(item.id)}
              disabled={busy}
              cols={cols}
              onPick={() => setCheckedItems((prev) => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                return next;
              })}
            >
              <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
              <span className="text-sm text-right tabular-nums text-[#3d5173] whitespace-nowrap">{item.quantity ?? "-"} {item.unit}</span>
            </PickRow>
          ))}
      </PickerShell>
    );
  }

  const cols = "grid-cols-[18px_200px_minmax(0,1fr)_140px_130px]";
  return (
    <PickerShell
      title={title}
      subtitle={t(forProduction ? "productionOrder.picker.scope.description" : "project.picker.scope.description")}
      onClose={onClose}
      busy={busy}
      steps={pickItems ? <PickerSteps labels={stepLabels} current={0} /> : undefined}
      toolbar={
        <>
          <PickerSearch value={search} onChange={setSearch} placeholder={t("project.picker.scope.searchPlaceholder")} wide />
          <span className="flex-1" />
          {!loading && !loadError && (
            <span className="text-[13px] text-muted-foreground whitespace-nowrap">
              {openable === scopes.length
                ? t("project.picker.scope.count").replace("{n}", String(scopes.length))
                : t("project.picker.scope.openableCount").replace("{n}", String(openable)).replace("{total}", String(scopes.length))}
            </span>
          )}
        </>
      }
      head={
        <div className={`h-full grid gap-3.5 items-center ${cols}`}>
          <span /><span>{t("project.picker.col.scopeNumber")}</span><span>{t("project.col.customer")}</span><span>{t("project.picker.col.quotation")}</span><span />
        </div>
      }
      minWidth={720}
      footer={
        <>
          {selectedOk ? <SelectedNote>{selectedOk.scopeNumber}</SelectedNote> : <span className="flex-1 text-sm text-muted-foreground">{t("project.picker.nothingSelected")}</span>}
          <button type="button" onClick={onClose} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={() => confirmScope()} disabled={!selectedOk || busy} className={btn.primary}>
            {pickItems ? <>{t("project.picker.next").replace("{step}", stepLabels[1])} <ChevronRight size={16} /></>
              : <>{busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t(forProduction ? "productionOrder.createBtn" : "project.createBtn")}</>}
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label={t("project.doc.scopeOfWorkPrefix")}>
        {loading ? <SkeletonRows />
          : loadError ? <PickerMessage title={t("project.picker.loadError")} />
          : filtered.length === 0 ? (
            <PickerMessage title={t("project.picker.scope.emptyTitle")} hint={t("project.picker.scope.emptyDescription")} />
          ) : filtered.map((s) => {
            const reason = blockReason(s);
            return (
              <PickRow
                key={s.id}
                kind="radio"
                checked={selected?.id === s.id && !reason}
                disabled={!!reason || busy}
                cols={cols}
                onPick={() => setSelected(s)}
                onConfirm={() => { setSelected(s); confirmScope(s); }}
              >
                <span className="font-mono text-[13px] font-medium truncate">{s.scopeNumber}</span>
                <span className="text-sm font-medium truncate">{s.customerName}</span>
                <span className={`font-mono text-[13px] truncate ${reason ? "" : "text-[#3d5173]"}`}>{s.quotationNumber}</span>
                <span className="flex justify-end">
                  {reason === "notApproved" ? <Tag tone="amber">{t("project.picker.scope.notApproved")}</Tag>
                    : reason === "taken" ? <Tag>{t("project.picker.scope.alreadyHasProject")}</Tag> : null}
                </span>
              </PickRow>
            );
          })}
      </div>
    </PickerShell>
  );
}

/**
 * เลือกโครงการ แล้วเลือกรายการที่ยังไม่ได้ออกเอกสาร — ใช้บนหน้าใบเบิก-คืนวัสดุ / ใบสั่งงาน / ใบขอซื้อ
 * Two steps in one dialog because the create API needs both ids (`POST /api/X {projectId, itemId}`).
 * Only `itemStatus === "pending"` items are selectable — the same rule the server enforces in
 * `loadPendingProjectItemOrThrow()`, mirrored here so the user never picks a row that will 400.
 * An item pre-assigned to a *different* sourcing branch still shows (the server allows it — creating
 * overwrites `sourcingMethod`), but its current assignment is labelled so the choice is informed.
 */
export function ProjectItemSourcePickerDialog({ title, description, onClose, onSelect, multiSelect = false, allowNoItems = false }: {
  title: string;
  description: string;
  onClose: () => void;
  /** ส่งกลับเป็นลิสต์เสมอ — โหมดเลือกเดี่ยวก็คือลิสต์ที่มีสมาชิกตัวเดียว ผู้เรียกจึงเขียนทางเดียวกันได้ */
  onSelect: (projectId: string, itemIds: string[]) => void;
  /**
   * ติ๊กเลือกได้หลายรายการแล้วกดยืนยันครั้งเดียว (ฝ่ายโครงการขอไว้สำหรับใบสั่งงาน 2026-08-27
   * "ติ๊กเลือกได้ว่าจะเอาตัวไหน") — ตั้งแต่ 2026-09-02 ใบเบิกและใบขอซื้อของฝ่ายโครงการก็เปิดโหมดนี้
   * ด้วย ตามคำสั่ง "แก้ใบเบิกและคืนวัสดุ / ใบขอซื้อ ของโครงการให้เหมือนกับผลิต" (ฝ่ายผลิตออกใบเดียว
   * ต่อหนึ่งใบสั่งผลิตมาตลอด) เหลือแต่ปุ่มรายแถวในหน้าโครงการที่ยังสร้างทีละรายการโดยธรรมชาติ
   */
  multiSelect?: boolean;
  /**
   * เปิดเอกสารโดย**ไม่ผูกรายการ**ได้ (2026-09-21) — เจ้าของแจ้งว่าใบขอซื้อของโครงการ "สร้างไม่ได้
   * เหมือนของแผนกผลิต" · โครงการที่ออกเอกสารครบทุกรายการแล้วจะไม่มีรายการ `pending` เหลือเลย
   * และเดิมนั่นแปลว่าเปิดใบใหม่ไม่ได้ ขณะที่ฝ่ายผลิตออกกี่ใบก็ได้จากใบสั่งผลิตใบเดิม
   */
  allowNoItems?: boolean;
}) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  /** โครงการที่เลือกไว้ในขั้นแรก (ยังไม่กดถัดไป) */
  const [selected, setSelected] = useState<ProjectListItem | null>(null);
  const [picked, setPicked] = useState<ProjectListItem | null>(null);
  const [items, setItems] = useState<ProjectItem[] | null>(null);
  const [itemsError, setItemsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const sourcingLabel: Record<ProjectItemSourcingMethod, string> = {
    unassigned: t("project.sourcing.unassigned"),
    requisition: t("project.sourcing.requisition"),
    jobOrder: t("project.sourcing.jobOrder"),
    purchaseRequest: t("project.sourcing.purchaseRequest"),
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllProjects()
      .then((list) => { if (!cancelled) { setProjects(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openProject = (p: ProjectListItem | null = selected) => {
    if (!p) return;
    setPicked(p);
    setItems(null);
    setItemsError(false);
    // ล้างการติ๊กเสมอเมื่อสลับโครงการ ไม่งั้น id ของโครงการเก่าจะติดไปกับการสร้างเอกสารของโครงการใหม่
    setChecked(new Set());
    fetchProject(p.id)
      .then((full) => setItems(full.items))
      .catch(() => setItemsError(true));
  };

  const q = search.trim().toLowerCase();
  const filteredProjects = projects.filter((p) => !q
    || p.scopeNumber.toLowerCase().includes(q)
    || p.customerCompanyName.toLowerCase().includes(q));
  const pendingItems = (items ?? []).filter((i) => i.itemStatus === "pending");
  const stepLabels: [string, string] = [t("project.picker.step.project"), t("project.picker.step.items")];
  const itemsUnit = t("project.picker.project.itemsUnit");

  if (picked) {
    const allState: boolean | "mixed" = checked.size === 0 ? false : checked.size === pendingItems.length ? true : "mixed";
    const toggleAll = () => setChecked(allState === true ? new Set() : new Set(pendingItems.map((i) => i.id)));
    const toggle = (id: string) => setChecked((prev) => {
      if (!multiSelect) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    const cols = "grid-cols-[18px_minmax(0,1fr)_120px_200px]";
    const hiddenCount = (items ?? []).length - pendingItems.length;
    return (
      <PickerShell
        title={title}
        subtitle={t("project.picker.item.description")}
        onClose={onClose}
        busy={busy}
        steps={<PickerSteps labels={stepLabels} current={1} picked={picked.scopeNumber} />}
        info={
          <>
            <span className="w-8 h-8 rounded-lg bg-[#e8edf7] text-[#1a3a6b] flex items-center justify-center flex-shrink-0"><Building2 size={16} /></span>
            <span className="flex-1 min-w-0 truncate">{picked.customerCompanyName}</span>
            {items !== null && (
              <span className="text-muted-foreground whitespace-nowrap">
                {t("project.picker.item.availableCount").replace("{n}", String(pendingItems.length)).replace("{total}", String(items.length))}
              </span>
            )}
          </>
        }
        head={pendingItems.length > 0 ? (
          <div className={`h-full grid gap-3.5 items-center ${cols}`}>
            {multiSelect ? (
              <span role="checkbox" aria-checked={allState} aria-label={t("project.picker.selectAll")} tabIndex={0} onClick={toggleAll} onKeyDown={keyActivate(toggleAll)} className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40 rounded">
                <CheckMark state={allState} />
              </span>
            ) : <span />}
            <span>{t("project.picker.col.item")}</span>
            <span className="text-right">{t("project.items.col.quantity")}</span>
            <span>{t("project.picker.item.preassigned")}</span>
          </div>
        ) : undefined}
        footer={
          <>
            <button type="button" onClick={() => { setPicked(null); setItems(null); setItemsError(false); setChecked(new Set()); }} disabled={busy} className={btn.secondary}>
              <ChevronLeft size={16} /> {t("project.picker.back")}
            </button>
            {/* ตัวนับ "เลือกไว้ n รายการ" ต้องไม่หายไปเมื่อมีปุ่มเปิดใบเปล่า ไม่งั้นคนติ๊กหลายรายการจะไม่เห็นว่า
                ติ๊กไปกี่อัน (เป็นข้อมูลเดียวที่บอกได้ เพราะรายการยาวเกินหน้าจอ) */}
            <span className="flex-1 min-w-0 pl-1.5 text-sm text-[#3d5173]">
              {pendingItems.length > 0 && t("project.picker.item.selectedCount").replace("{n}", String(checked.size))}
            </span>
            {/* "เปิดใบโดยไม่ผูกรายการ" คือทางออกของโครงการที่ไม่มีรายการค้างเหลือแล้ว — ใบยังผูกกับโครงการและ
                รหัสงานครบ แค่ไม่มี ProjectItem ให้ขยับสถานะ เหมือนใบของฝ่ายผลิตทุกประการ */}
            {allowNoItems && (
              <button type="button" onClick={() => { setBusy(true); onSelect(picked.id, []); }} disabled={busy || items === null} className={btn.secondary}>
                {t("project.picker.item.createWithoutItems")}
              </button>
            )}
            {pendingItems.length > 0 && (
              <button type="button" onClick={() => { setBusy(true); onSelect(picked.id, [...checked]); }} disabled={busy || checked.size === 0} className={btn.primary}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("project.picker.item.confirm")}
              </button>
            )}
          </>
        }
      >
        <div role={multiSelect ? "group" : "radiogroup"} aria-label={t("project.picker.col.item")}>
          {itemsError ? <PickerMessage title={t("project.picker.loadError")} />
            : items === null ? <SkeletonRows />
            : pendingItems.length === 0 ? (
              <PickerMessage title={t("project.picker.item.emptyTitle")} hint={allowNoItems ? t("project.picker.item.emptyButCanCreate") : t("project.picker.item.emptyDescription")} />
            ) : (
              <>
                {pendingItems.map((item) => (
                  <PickRow
                    key={item.id}
                    kind={multiSelect ? "checkbox" : "radio"}
                    checked={checked.has(item.id)}
                    disabled={busy}
                    cols={cols}
                    onPick={() => toggle(item.id)}
                    onConfirm={multiSelect ? undefined : () => { setBusy(true); onSelect(picked.id, [item.id]); }}
                  >
                    <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                    <span className="text-sm text-right tabular-nums text-[#3d5173] whitespace-nowrap">{item.quantity ?? "-"} {item.unit}</span>
                    <span>
                      {item.sourcingMethod !== "unassigned"
                        ? <Tag tone="blue">{sourcingLabel[item.sourcingMethod]}</Tag>
                        : <span className="text-[13px] text-[#8a97ad]">{sourcingLabel.unassigned}</span>}
                    </span>
                  </PickRow>
                ))}
                {hiddenCount > 0 && (
                  <p className="m-0 px-6 py-3.5 text-xs text-muted-foreground flex items-center gap-1.5"><Info size={13} /> {t("project.picker.item.hiddenNote")}</p>
                )}
              </>
            )}
        </div>
      </PickerShell>
    );
  }

  const cols = "grid-cols-[18px_210px_minmax(0,1fr)_120px]";
  return (
    <PickerShell
      title={title}
      subtitle={description}
      onClose={onClose}
      busy={busy}
      steps={<PickerSteps labels={stepLabels} current={0} />}
      toolbar={
        <>
          <PickerSearch value={search} onChange={setSearch} placeholder={t("project.picker.project.searchPlaceholder")} />
          <span className="flex-1" />
          {!loading && !loadError && (
            <span className="text-[13px] text-muted-foreground whitespace-nowrap">{t("project.picker.project.count").replace("{n}", String(filteredProjects.length))}</span>
          )}
        </>
      }
      head={
        <div className={`h-full grid gap-3.5 items-center ${cols}`}>
          <span /><span>{t("project.col.jobCode")}</span><span>{t("project.col.customer")}</span><span className="text-right">{t("project.picker.col.items")}</span>
        </div>
      }
      footer={
        <>
          {selected ? <SelectedNote>{selected.scopeNumber}</SelectedNote> : <span className="flex-1 text-sm text-muted-foreground">{t("project.picker.nothingSelected")}</span>}
          <button type="button" onClick={onClose} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={() => openProject()} disabled={!selected} className={btn.primary}>
            {t("project.picker.next").replace("{step}", stepLabels[1])} <ChevronRight size={16} />
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label={t("project.picker.step.project")}>
        {loading ? <SkeletonRows />
          : loadError ? <PickerMessage title={t("project.picker.loadError")} />
          : filteredProjects.length === 0 ? (
            <PickerMessage title={t("project.picker.project.emptyTitle")} hint={t("project.picker.project.emptyDescription")} />
          ) : filteredProjects.map((p) => (
            <PickRow
              key={p.id}
              kind="radio"
              checked={selected?.id === p.id}
              cols={cols}
              onPick={() => setSelected(p)}
              onConfirm={() => { setSelected(p); openProject(p); }}
            >
              <span className="font-mono text-[13px] font-medium truncate">{p.scopeNumber}</span>
              <span className="text-sm font-medium truncate">{p.customerCompanyName}</span>
              <span className="text-sm text-right tabular-nums text-[#3d5173] whitespace-nowrap">{p.itemCount} {itemsUnit}</span>
            </PickRow>
          ))}
      </div>
    </PickerShell>
  );
}

/**
 * เลือกใบสั่งผลิตต้นทาง — ใช้บนหน้าใบเบิก-คืนวัสดุ/ใบขอซื้อ "ของฝ่ายผลิต"
 *
 * ฝ่ายผลิตออกเอกสารจากใบสั่งผลิต ไม่ใช่จากรายการในโครงการ จึงเลือกแค่ขั้นเดียว (ไม่มีขั้นเลือกรายการ)
 * — ดู handleCreate() ใน materialRequisitionHandler.ts/purchaseRequestHandler.ts ที่รับ
 * `{ productionOrderId }` เป็นต้นทางทางเลือกแทน `{ projectId, itemId }`
 */
export function ProductionOrderSourcePickerDialog({ title, onClose, onSelect }: {
  title: string;
  onClose: () => void;
  onSelect: (productionOrderId: string) => void;
}) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<ProductionOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ProductionOrderSummary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllProductionOrders()
      .then((list) => { if (!cancelled) { setOrders(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = orders.filter((o) => !q
    || o.id.toLowerCase().includes(q)
    || o.jobCode.toLowerCase().includes(q)
    || o.customerCompanyName.toLowerCase().includes(q)
    || o.productName.toLowerCase().includes(q));
  const confirm = (o: ProductionOrderSummary | null = selected) => {
    if (!o || busy) return;
    setBusy(true);
    onSelect(o.id);
  };
  const cols = "grid-cols-[18px_190px_190px_minmax(0,1fr)]";

  return (
    <PickerShell
      title={title}
      subtitle={t("project.picker.productionOrder.description")}
      onClose={onClose}
      busy={busy}
      toolbar={
        <>
          <PickerSearch value={search} onChange={setSearch} placeholder={t("productionOrder.searchPlaceholder")} />
          <span className="flex-1" />
          {!loading && !loadError && <span className="text-[13px] text-muted-foreground whitespace-nowrap">{t("ui.itemCount").replace("{n}", String(filtered.length))}</span>}
        </>
      }
      head={
        <div className={`h-full grid gap-3.5 items-center ${cols}`}>
          <span /><span>{t("project.picker.col.productionOrder")}</span><span>{t("project.col.jobCode")}</span><span>{t("project.picker.col.customerProduct")}</span>
        </div>
      }
      footer={
        <>
          {selected ? <SelectedNote>{selected.documentNumber || selected.id}</SelectedNote> : <span className="flex-1 text-sm text-muted-foreground">{t("project.picker.nothingSelected")}</span>}
          <button type="button" onClick={onClose} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
          <button type="button" onClick={() => confirm()} disabled={!selected || busy} className={btn.primary}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("project.picker.item.confirm")}
          </button>
        </>
      }
    >
      <div role="radiogroup" aria-label={t("project.picker.col.productionOrder")}>
        {loading ? <SkeletonRows />
          : loadError ? <PickerMessage title={t("project.picker.loadError")} />
          : filtered.length === 0 ? (
            <PickerMessage title={t("project.picker.productionOrder.emptyTitle")} hint={t("project.picker.productionOrder.emptyDescription")} />
          ) : filtered.map((o) => (
            <PickRow
              key={o.id}
              kind="radio"
              checked={selected?.id === o.id}
              disabled={busy}
              cols={cols}
              onPick={() => setSelected(o)}
              onConfirm={() => { setSelected(o); confirm(o); }}
            >
              <span className="font-mono text-[13px] font-medium truncate">{o.documentNumber || o.id}</span>
              <span className="font-mono text-[13px] text-[#3d5173] truncate">{o.jobCode || "—"}</span>
              <span className="min-w-0 flex flex-col leading-snug">
                <span className="text-sm font-medium truncate">{o.customerCompanyName || "—"}</span>
                {o.productName && <span className="text-xs text-muted-foreground truncate">{o.productName}</span>}
              </span>
            </PickRow>
          ))}
      </div>
    </PickerShell>
  );
}
