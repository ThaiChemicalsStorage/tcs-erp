import { useId, useMemo, useState } from "react";
import { Plus, Search, X, Hash, Pencil, Archive, RotateCcw, Upload, Loader2 } from "lucide-react";
import {
  type CodeEntry, type CodeEntryDraft, type CodeKind,
  emptyCodeEntryDraft, createCodeEntry, updateCodeEntry, setCodeEntryArchived, importCodeEntries,
  parseGlChartRows,
} from "../../lib/codeRegister";
import { EmptyState } from "../../components/EmptyState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

/**
 * ทะเบียนรหัสแผนก/บัญชี (2026-08-31) — เจ้าของขอไว้ 2026-08-28
 * *"เพิ่มหน้าสร้างรหัสแผนก เพื่อเอาไว้ใช้สำหรับใบ PR กับ PO"*
 *
 * **สองแท็บในหน้าเดียว** เพราะเป็นรหัสคนละชุดจริง ๆ (ยืนยันกับเจ้าของ) แต่ใช้หน้าตา สิทธิ์ และ
 * การตรวจรหัสซ้ำชุดเดียวกันหมด — ฝั่งบัญชีมีคอลัมน์เสริม (หมวด/ระดับ/บัญชีคุม) และปุ่มนำเข้าไฟล์
 *
 * ⚠️ **แสดงทีละหน้า** ต่างจาก `CustomersPage.tsx` ที่เรนเดอร์ทุกแถวเสมอ — ผังบัญชีจริงมี 479 แถว
 */

const PAGE_SIZE = 50;

export function CodeRegisterPage({
  codes,
  onCodesChange,
  canCreate,
  canEdit,
  canArchive,
}: {
  codes: CodeEntry[];
  onCodesChange: (next: CodeEntry[]) => void;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [kind, setKind] = useState<CodeKind>("department");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [formTarget, setFormTarget] = useState<CodeEntry | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CodeEntry | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [importing, setImporting] = useState(false);

  const ofKind = useMemo(() => codes.filter((c) => c.kind === kind), [codes, kind]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ofKind.filter((c) => {
      if (!showArchived && c.isDeleted) return false;
      if (!q) return true;
      return [c.code, c.name, c.category ?? "", c.parentCode ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [ofKind, search, showArchived]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // หน้าปัจจุบันบีบตอนเรนเดอร์ ไม่ใช่ใน effect — พิมพ์ค้นจนรายการสั้นลงแล้วหน้าต้องไม่ค้างเกินขอบ
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const replace = (next: CodeEntry) =>
    onCodesChange(codes.some((c) => c.id === next.id) ? codes.map((c) => (c.id === next.id ? next : c)) : [...codes, next]);

  const handleSave = async (draft: CodeEntryDraft): Promise<string | null> => {
    try {
      const saved = formTarget === "new" || formTarget === null
        ? await createCodeEntry(draft)
        : await updateCodeEntry(formTarget.id, draft);
      replace(saved);
      setFormTarget(null);
      toast.show(t(formTarget === "new" ? "codeRegister.toast.created" : "codeRegister.toast.updated"));
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : t("common.errorGeneric");
    }
  };

  const handleArchiveToggle = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const next = await setCodeEntryArchived(archiveTarget.id, !archiveTarget.isDeleted);
      replace(next);
      toast.show(t(next.isDeleted ? "codeRegister.toast.archived" : "codeRegister.toast.restored"));
      setArchiveTarget(null);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setArchiving(false);
    }
  };

  /** นำเข้าผังบัญชีจากไฟล์ — `xlsx` โหลดแบบ dynamic เหมือน Cost Control เพื่อไม่ให้ติดไปกับ bundle หลัก */
  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      // ไฟล์จริงมีชีตเดียวชื่อ GLCHART แต่รับชีตแรกไว้ด้วยเผื่อถูกบันทึกใหม่มาแล้วชื่อเปลี่ยน
      const sheet = wb.Sheets["GLCHART"] ?? wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" }).map((r) => String(r[0] ?? ""));
      const { accounts, warnings } = parseGlChartRows(rows);
      if (accounts.length === 0) {
        toast.show(warnings[0] ?? t("codeRegister.import.nothingFound"));
        return;
      }
      const result = await importCodeEntries("account", accounts.map((a) => ({
        kind: "account" as const, code: a.code, name: a.name, category: a.category,
        level: a.level, isControl: a.isControl, parentCode: a.parentCode, isActive: true,
      })));
      toast.show(t("codeRegister.import.done").replace("{created}", String(result.created)).replace("{skipped}", String(result.skipped)));
      // ดึงรายการใหม่ทั้งชุดง่ายกว่าเดารายการที่เพิ่งสร้าง — ผู้เรียกจัดการรีเฟรชเอง
      const { fetchCodeEntries } = await import("../../lib/codeRegister");
      onCodesChange(await fetchCodeEntries());
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setImporting(false);
    }
  };

  const th = "px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";
  const isAccount = kind === "account";

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t("codeRegister.pageTitle")}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("codeRegister.pageSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAccount && canCreate && (
            <label className={`flex items-center gap-2 px-3 py-2 text-xs border border-border rounded-lg transition-all ${importing ? "opacity-60" : "cursor-pointer text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40"}`}>
              {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {t("codeRegister.importAccounts")}
              <input
                type="file" accept=".xlsx,.xls" className="hidden" disabled={importing}
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void handleImportFile(file); }}
              />
            </label>
          )}
          {canCreate && (
            <button onClick={() => setFormTarget("new")} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              <Plus size={15} /> {t("codeRegister.addNew")}
            </button>
          )}
        </div>
      </div>

      {/* สามแท็บ — รหัสคนละชุดกัน รหัสซ้ำข้ามชุดได้ (ประเภทงานเพิ่ม 2026-09-03 สำหรับ "ตัดเข้างาน" บนใบเบิก) */}
      <div className="flex items-center gap-1 border-b border-border" role="tablist">
        {(["department", "account", "workType"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => { setKind(k); setPage(0); }}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${kind === k ? "border-[#c9a84c] text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t(k === "department" ? "codeRegister.tab.department" : k === "account" ? "codeRegister.tab.account" : "codeRegister.tab.workType")}
            <span className="ml-2 text-xs text-muted-foreground">{codes.filter((c) => c.kind === k && !c.isDeleted).length}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input
            type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={t("codeRegister.searchPlaceholder")}
            aria-label={t("codeRegister.searchPlaceholder")}
            className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground ml-auto">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
          {t("codeRegister.showArchived")}
        </label>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {ofKind.length === 0 ? (
          <EmptyState
            icon={Hash}
            title={t(isAccount ? "empty.codeRegister.account.title" : "empty.codeRegister.department.title")}
            description={t(isAccount ? "empty.codeRegister.account.sub" : "empty.codeRegister.department.sub")}
            actionLabel={canCreate ? t("codeRegister.addNew") : undefined}
            onAction={canCreate ? () => setFormTarget("new") : undefined}
            compact
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Hash size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("codeRegister.noFilterResults")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className={th}>{t("codeRegister.col.code")}</th>
                    <th className={th}>{t("codeRegister.col.name")}</th>
                    {isAccount && <th className={th}>{t("codeRegister.col.category")}</th>}
                    {isAccount && <th className={th}>{t("codeRegister.col.parent")}</th>}
                    <th className={th}>{t("codeRegister.col.status")}</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id} className={`border-b border-border/50 ${c.isDeleted ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2 text-xs font-mono text-foreground whitespace-nowrap">{c.code}</td>
                      <td className="px-4 py-2 text-sm text-foreground">
                        {c.name}
                        {c.isControl && <span className="ml-2 text-xs text-muted-foreground">({t("codeRegister.controlAccount")})</span>}
                      </td>
                      {isAccount && <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{c.category || "—"}</td>}
                      {isAccount && <td className="px-4 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{c.parentCode || "—"}</td>}
                      <td className="px-4 py-2">
                        <StatusBadge
                          status={c.isDeleted ? "archived" : c.isActive ? "active" : "inactive"}
                          label={t(c.isDeleted ? "vendors.status.archived" : c.isActive ? "vendors.status.active" : "vendors.status.inactive")}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && !c.isDeleted && (
                            <button onClick={() => setFormTarget(c)} title={t("codeRegister.form.editTitle")}
                              aria-label={`${t("codeRegister.form.editTitle")} — ${c.code}`}
                              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil size={13} />
                            </button>
                          )}
                          {canArchive && (
                            <button onClick={() => setArchiveTarget(c)}
                              title={t(c.isDeleted ? "codeRegister.confirmRestore.title" : "codeRegister.confirmArchive.title")}
                              aria-label={`${t(c.isDeleted ? "codeRegister.confirmRestore.title" : "codeRegister.confirmArchive.title")} — ${c.code}`}
                              className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                              {c.isDeleted ? <RotateCcw size={13} /> : <Archive size={13} />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {t("codeRegister.pageInfo").replace("{from}", String(safePage * PAGE_SIZE + 1))
                    .replace("{to}", String(Math.min((safePage + 1) * PAGE_SIZE, filtered.length)))
                    .replace("{total}", String(filtered.length))}
                </p>
                <div className="flex items-center gap-2">
                  <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
                    className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
                    {t("common.previous")}
                  </button>
                  <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}
                    className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors">
                    {t("common.next")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {formTarget !== null && (
        <CodeFormModal
          initial={formTarget === "new" ? emptyCodeEntryDraft(kind) : {
            kind: formTarget.kind, code: formTarget.code, name: formTarget.name, isActive: formTarget.isActive,
            category: formTarget.category, level: formTarget.level, isControl: formTarget.isControl, parentCode: formTarget.parentCode,
          }}
          isNew={formTarget === "new"}
          onSave={handleSave}
          onCancel={() => setFormTarget(null)}
        />
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        title={t(archiveTarget?.isDeleted ? "codeRegister.confirmRestore.title" : "codeRegister.confirmArchive.title")}
        message={t(archiveTarget?.isDeleted ? "codeRegister.confirmRestore.message" : "codeRegister.confirmArchive.message")}
        danger={!archiveTarget?.isDeleted}
        busy={archiving}
        onConfirm={handleArchiveToggle}
        onCancel={() => setArchiveTarget(null)}
      />

      <Toast message={toast.message} />
    </div>
  );
}

function CodeFormModal({
  initial,
  isNew,
  onSave,
  onCancel,
}: {
  initial: CodeEntryDraft;
  isNew: boolean;
  onSave: (draft: CodeEntryDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CodeEntryDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();
  const isAccount = draft.kind === "account";
  const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60";
  const label = "text-xs text-muted-foreground block mb-1";

  const handleSubmit = async () => {
    if (!draft.code.trim()) { setError(t("codeRegister.form.codeRequired")); return; }
    if (!draft.name.trim()) { setError(t("codeRegister.form.nameRequired")); return; }
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t(isNew ? "codeRegister.form.createTitle" : "codeRegister.form.editTitle")}
          </h2>
          <button onClick={onCancel} disabled={saving} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="code-code" className={label}>{t("codeRegister.col.code")}</label>
            <input id="code-code" className={`${inputCls} font-mono`} disabled={saving} value={draft.code}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="code-name" className={label}>{t("codeRegister.col.name")}</label>
            <input id="code-name" className={inputCls} disabled={saving} value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </div>
          {isAccount && (
            <>
              <div>
                <label htmlFor="code-category" className={label}>{t("codeRegister.col.category")}</label>
                <input id="code-category" className={inputCls} disabled={saving} value={draft.category ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="code-parent" className={label}>{t("codeRegister.col.parent")}</label>
                <input id="code-parent" className={`${inputCls} font-mono`} disabled={saving} value={draft.parentCode ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, parentCode: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-foreground">
                <input type="checkbox" disabled={saving} checked={draft.isControl ?? false}
                  onChange={(e) => setDraft((d) => ({ ...d, isControl: e.target.checked }))}
                  className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
                {t("codeRegister.form.isControl")}
              </label>
              <p className="text-xs text-muted-foreground -mt-1">{t("codeRegister.form.isControlHint")}</p>
            </>
          )}
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-foreground">
            <input type="checkbox" disabled={saving} checked={draft.isActive}
              onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("vendors.form.isActive")}
          </label>
        </div>

        {error && <p className="text-xs text-[#e05252] mt-3">{error}</p>}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground transition-colors disabled:opacity-60">
            {t("common.cancel")}
          </button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60">
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
