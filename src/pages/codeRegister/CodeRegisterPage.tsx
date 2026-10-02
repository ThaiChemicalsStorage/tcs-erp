import { useMemo, useState, type KeyboardEvent } from "react";
import { Plus, Upload, Loader2, ChevronRight } from "lucide-react";
import {
  type CodeEntry, type CodeEntryDraft, type CodeKind,
  createCodeEntry, updateCodeEntry, setCodeEntryArchived, importCodeEntries,
  parseGlChartRows, approveCodeEntry, rejectCodeEntry, codeApprovalStatusOf, codeNeedsApproval,
} from "../../lib/codeRegister";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { DialogSummary, ReasonDialog, TonePill } from "../purchaseOrder/purchasingUi";
import { CodeRegisterDrawer } from "./CodeRegisterDrawer";
import { codeApprovalLabelKey, codeKindCounts, codeKindLabelKey, codePendingCounts, filterCodeEntries } from "./codeRegisterDisplay";

/**
 * ทะเบียนรหัสแผนก/บัญชี (2026-08-31) — เจ้าของขอไว้ 2026-08-28
 * *"เพิ่มหน้าสร้างรหัสแผนก เพื่อเอาไว้ใช้สำหรับใบ PR กับ PO"*
 *
 * **สามแท็บในหน้าเดียว** เพราะเป็นรหัสคนละชุดจริง ๆ (ยืนยันกับเจ้าของ) แต่ใช้หน้าตา สิทธิ์ และ
 * การตรวจรหัสซ้ำชุดเดียวกันหมด — ฝั่งบัญชีมีคอลัมน์เสริม (หมวด/บัญชีคุม) และปุ่มนำเข้าไฟล์ (เฉพาะแท็บรหัสบัญชี)
 *
 * ดีไซน์ใหม่ 2026-09-30: แท็บชุดรหัสพร้อมจำนวนในการ์ดเดียว · ทั้งแถวกดเปิด**แผงด้านขวา** (สร้าง/แก้ไข/ดู)
 * แทนปุ่มดินสอ/เก็บถาวรท้ายแถว · ปิดใช้งานและเก็บถาวรอยู่ในเมนูเพิ่มเติมของแผง
 *
 * ⚠️ **แสดงทีละหน้า** ต่างจาก `CustomersPage.tsx` ที่เรนเดอร์ทุกแถวเสมอ — ผังบัญชีจริงมี 479 แถว
 */

const PAGE_SIZE = 50;
const KINDS: CodeKind[] = ["department", "account", "workType"];

export function CodeRegisterPage({
  codes,
  onCodesChange,
  canCreate,
  canEdit,
  canArchive,
  canApprove,
  currentUserId,
}: {
  codes: CodeEntry[];
  onCodesChange: (next: CodeEntry[]) => void;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  /** `codeRegister:approve` — ฝ่ายบัญชีอนุมัติรหัสแผนก/รหัสบัญชี (2026-10-02) */
  canApprove: boolean;
  currentUserId: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  // ปุ่มนำเข้ามีเฉพาะแท็บรหัสบัญชี และปุ่มสร้างเฉพาะคนที่มีสิทธิ์ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  const tourSteps: TourStep[] = [
    { element: '[data-tour="codes-create"]', manual: "ch19-2", popover: { title: t("tour.codes.create.title"), description: t("tour.codes.create.desc"), side: "bottom" } },
    { element: '[data-tour="codes-import"]', manual: "ch19-2", popover: { title: t("tour.codes.import.title"), description: t("tour.codes.import.desc"), side: "bottom" } },
    { element: '[data-tour="codes-tabs"]', manual: "ch19-2", popover: { title: t("tour.codes.tabs.title"), description: t("tour.codes.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="codes-filters"]', manual: "ch19-2", popover: { title: t("tour.codes.filters.title"), description: t("tour.codes.filters.desc"), side: "bottom" } },
    { element: '[data-tour="codes-table"]', manual: "ch19-2", popover: { title: t("tour.codes.table.title"), description: t("tour.codes.table.desc"), side: "top" } },
  ];
  const tour = useModuleTour("codeRegister", currentUserId, tourSteps);
  const [kind, setKind] = useState<CodeKind>("department");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  /** id ของรหัสที่เปิดในแผง หรือ "new" — เก็บเป็น id เพื่อให้แผงเห็นสถานะล่าสุดหลังกดคำสั่งจากเมนู */
  const [formTarget, setFormTarget] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CodeEntry | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<CodeEntry | null>(null);
  const [importing, setImporting] = useState(false);
  /** ขั้นอนุมัติของบัญชี (2026-10-02) — ตัวกรอง "เฉพาะรออนุมัติ" + ปุ่มในแผง + กล่องเหตุผลตอนไม่อนุมัติ */
  const [pendingOnly, setPendingOnly] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<CodeEntry | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const ofKindCount = useMemo(() => codes.filter((c) => c.kind === kind).length, [codes, kind]);
  const counts = useMemo(() => codeKindCounts(codes), [codes]);
  const pendingCounts = useMemo(() => codePendingCounts(codes), [codes]);
  // ตัวกรองค้างไว้ตอนสลับไปแท็บประเภทงาน (ไม่มีขั้นอนุมัติ) จะทำให้ตารางว่างเปล่า — ใช้เฉพาะชุดที่ต้องอนุมัติ
  const pendingFilter = pendingOnly && codeNeedsApproval(kind);
  const filtered = useMemo(() => filterCodeEntries(codes, { kind, search, showArchived, pendingOnly: pendingFilter }), [codes, kind, search, showArchived, pendingFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // หน้าปัจจุบันบีบตอนเรนเดอร์ ไม่ใช่ใน effect — พิมพ์ค้นจนรายการสั้นลงแล้วหน้าต้องไม่ค้างเกินขอบ
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const replace = (next: CodeEntry) =>
    onCodesChange(codes.some((c) => c.id === next.id) ? codes.map((c) => (c.id === next.id ? next : c)) : [...codes, next]);

  const drawerEntry = formTarget && formTarget !== "new" ? codes.find((c) => c.id === formTarget) ?? null : null;
  const drawerOpen = formTarget === "new" ? canCreate : drawerEntry !== null;

  const handleSave = async (draft: CodeEntryDraft): Promise<string | null> => {
    const isNew = formTarget === "new" || drawerEntry === null;
    try {
      const saved = isNew ? await createCodeEntry(draft) : await updateCodeEntry(drawerEntry.id, draft);
      replace(saved);
      setFormTarget(null);
      toast.show(t(isNew ? "codeRegister.toast.created" : "codeRegister.toast.updated"));
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : t("common.errorGeneric");
    }
  };

  /** ปิด/เปิดใช้งาน — เดิมเป็นช่องติ๊กในฟอร์ม ตอนนี้เป็นคำสั่งในเมนูของแผง บันทึกเฉพาะช่องนี้ */
  const handleToggleActive = async (c: CodeEntry) => {
    try {
      const next = await updateCodeEntry(c.id, { isActive: !c.isActive });
      replace(next);
      toast.show(t(next.isActive ? "codeRegister.toast.activated" : "codeRegister.toast.deactivated"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  /** บัญชีอนุมัติ / ไม่อนุมัติ — คืนรหัสที่อัปเดตแล้วเหมือนกัน จึงเขียนกลับที่เดียว (แนวเดียวกับทะเบียนผู้ขาย) */
  const runApproval = async (c: CodeEntry, stage: "approve" | "reject") => {
    setApprovalBusyId(c.id);
    try {
      const next = stage === "approve" ? await approveCodeEntry(c.id) : await rejectCodeEntry(c.id, rejectComment.trim());
      replace(next);
      setRejectTarget(null);
      setRejectComment("");
      toast.show(t(stage === "approve" ? "codeRegister.toast.approved" : "codeRegister.toast.rejected"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally { setApprovalBusyId(null); }
  };

  const handleArchiveToggle = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const next = await setCodeEntryArchived(archiveTarget.id, !archiveTarget.isDeleted);
      replace(next);
      toast.show(t(next.isDeleted ? "codeRegister.toast.archived" : "codeRegister.toast.restored"));
      setArchiveTarget(null);
      if (next.isDeleted && !showArchived) setFormTarget(null);
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

  const isAccount = kind === "account";
  const openOnKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFormTarget(id); }
  };
  const tabs = KINDS.map((k) => ({ key: k, label: t(codeKindLabelKey[k]), count: counts[k] }));
  const showPendingToggle = codeNeedsApproval(kind) && (pendingCounts[kind] > 0 || pendingOnly);
  const columns = [
    t("codeRegister.col.code"), t("codeRegister.col.name"),
    ...(isAccount ? [t("codeRegister.col.category"), t("codeRegister.col.parent")] : []),
    t("codeRegister.col.status"), "",
  ];
  const dash = <span className="text-[#8a97ad]">—</span>;
  const entrySummary = (c: CodeEntry) => (
    <DialogSummary
      title={<span className="inline-flex items-baseline gap-2"><span className="font-mono text-[13px]">{c.code}</span>{c.name}</span>}
      aside={<span className="text-[13px] font-medium text-muted-foreground">{t(codeKindLabelKey[c.kind])}</span>}
    />
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        title={t("codeRegister.pageTitle")}
        description={t("codeRegister.pageSubtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={canCreate ? (
          <>
            {/* นำเข้าไฟล์มีเฉพาะแท็บรหัสบัญชี — เหมือนเดิม */}
            {isAccount && (
              <label data-tour="codes-import" className={`${btn.secondary} ${importing ? "opacity-60 pointer-events-none" : "cursor-pointer"} focus-within:ring-2 focus-within:ring-[#1a5fb4]/40`}>
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {t("codeRegister.importAccounts")}
                <input
                  type="file" accept=".xlsx,.xls" className="sr-only" disabled={importing}
                  aria-label={t("codeRegister.importAccounts")}
                  onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void handleImportFile(file); }}
                />
              </label>
            )}
            <button type="button" data-tour="codes-create" onClick={() => setFormTarget("new")} className={btn.primary}>
              <Plus size={16} /> {t("codeRegister.addNew")}
            </button>
          </>
        ) : undefined}
      />

      <ListCard>
        {/* สามแท็บ — รหัสคนละชุดกัน รหัสซ้ำข้ามชุดได้ (ประเภทงานเพิ่ม 2026-09-03 สำหรับ "ตัดเข้างาน" บนใบเบิก) */}
        <div data-tour="codes-tabs">
          <ListTabs tabs={tabs} active={kind} onChange={(k) => { setKind(k); setPage(1); }} ariaLabel={t("codeRegister.tabsAria")} />
        </div>
        <div data-tour="codes-filters">
          <ListToolbar
            search={search}
            onSearch={(v) => { setSearch(v); setPage(1); }}
            searchPlaceholder={t("codeRegister.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          >
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[#3d5173] ml-1">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
                className="w-4 h-4 rounded border-[#c3ccda] accent-[#0b1d3a]"
              />
              {t("codeRegister.showArchived")}
            </label>
            {showPendingToggle && (
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[#3d5173] ml-1">
                <input
                  type="checkbox"
                  checked={pendingOnly}
                  onChange={(e) => { setPendingOnly(e.target.checked); setPage(1); }}
                  className="w-4 h-4 rounded border-[#c3ccda] accent-[#0b1d3a]"
                />
                {t("codeRegister.pendingOnly").replace("{n}", String(pendingCounts[kind]))}
              </label>
            )}
          </ListToolbar>
        </div>

        <div data-tour="codes-table" className="min-w-0">
          {ofKindCount === 0 ? (
            <ListEmpty
              title={t(isAccount ? "empty.codeRegister.account.title" : "empty.codeRegister.department.title")}
              hint={t(isAccount ? "empty.codeRegister.account.sub" : "empty.codeRegister.department.sub")}
              action={canCreate ? <button type="button" onClick={() => setFormTarget("new")} className={btn.primary}><Plus size={16} /> {t("codeRegister.addNew")}</button> : undefined}
            />
          ) : filtered.length === 0 ? (
            <ListEmpty title={t("codeRegister.noFilterResults")} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className={table.head}>
                    {columns.map((h, i) => <th key={i} className={table.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr
                      key={c.id}
                      tabIndex={0}
                      aria-label={`${t("codeRegister.openRow")} ${c.code}`}
                      onClick={() => setFormTarget(c.id)}
                      onKeyDown={(e) => openOnKey(e, c.id)}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:bg-[#f8f9fc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 ${c.isDeleted ? "opacity-60" : ""}`}
                    >
                      <td className={`${table.td} whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-2">
                          <span className={table.code}>{c.code}</span>
                          {c.isControl && (
                            <span className="h-5 px-1.5 rounded bg-[#eef1f6] text-[#3d5173] text-xs font-semibold inline-flex items-center">{t("codeRegister.controlAccount")}</span>
                          )}
                        </span>
                      </td>
                      <td className={`${table.td} text-sm text-foreground ${c.isControl ? "font-semibold" : "font-medium"}`}>{c.name}</td>
                      {isAccount && <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{c.category || dash}</td>}
                      {isAccount && <td className={`${table.td} font-mono text-[13px] text-[#3d5173] whitespace-nowrap`}>{c.parentCode || dash}</td>}
                      <td className={table.td}>
                        <span className="inline-flex items-center gap-2 flex-wrap">
                          <StatusBadge
                            status={c.isDeleted ? "archived" : c.isActive ? "active" : "inactive"}
                            label={t(c.isDeleted ? "vendors.status.archived" : c.isActive ? "vendors.status.active" : "vendors.status.inactive")}
                          />
                          {/* อนุมัติแล้วไม่ต้องมีป้าย — ผังบัญชี 479 แถวจะเต็มไปด้วยป้ายเขียวที่ไม่บอกอะไร */}
                          {codeApprovalStatusOf(c) !== "approved" && (
                            <TonePill tone={codeApprovalStatusOf(c) === "pending" ? "warning" : "danger"} label={t(codeApprovalLabelKey[codeApprovalStatusOf(c)])} />
                          )}
                        </span>
                      </td>
                      <td className={`${table.td} w-10`}>
                        <ChevronRight size={18} className="text-[#a3aec2] group-hover:text-foreground transition-colors" aria-hidden="true" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {filtered.length > 0 && (
          <ListPagination
            page={currentPage}
            pageCount={pageCount}
            from={(currentPage - 1) * PAGE_SIZE + 1}
            to={Math.min(currentPage * PAGE_SIZE, filtered.length)}
            total={filtered.length}
            onPage={setPage}
          />
        )}
      </ListCard>

      {drawerOpen && (
        <CodeRegisterDrawer
          key={formTarget ?? "none"}
          entry={drawerEntry}
          kind={kind}
          canEdit={canEdit}
          canArchive={canArchive}
          canApprove={canApprove}
          approvalBusy={drawerEntry !== null && approvalBusyId === drawerEntry.id}
          locked={archiveTarget !== null || deactivateTarget !== null || rejectTarget !== null}
          onSave={handleSave}
          onClose={() => setFormTarget(null)}
          onToggleActive={(c) => (c.isActive ? setDeactivateTarget(c) : void handleToggleActive(c))}
          onArchiveToggle={(c) => setArchiveTarget(c)}
          onApprove={(c) => void runApproval(c, "approve")}
          onReject={(c) => { setRejectTarget(c); setRejectComment(""); }}
        />
      )}

      {/* กล่องเหตุผลตอนไม่อนุมัติ — เซิร์ฟเวอร์บังคับว่าต้องมีเหตุผลเสมอ ปุ่มจึงปิดไว้จนกว่าจะพิมพ์ */}
      <ReasonDialog
        open={rejectTarget !== null}
        tone="danger"
        danger
        title={t("codeRegister.approval.rejectTitle")}
        message={t("codeRegister.approval.rejectMessage")}
        summary={rejectTarget ? entrySummary(rejectTarget) : undefined}
        confirmLabel={t("codeRegister.approval.reject")}
        confirmDisabled={!rejectComment.trim()}
        busy={rejectTarget !== null && approvalBusyId === rejectTarget.id}
        onCancel={() => setRejectTarget(null)}
        onConfirm={() => { if (rejectTarget) void runApproval(rejectTarget, "reject"); }}
      >
        <Field label={t("codeRegister.approval.rejectLabel")} htmlFor="code-reject-comment" required help={!rejectComment.trim() ? t("codeRegister.approval.rejectRequiredHint") : undefined}>
          <textarea
            id="code-reject-comment"
            autoFocus
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            rows={3}
            className={`${field.textarea} w-full resize-y`}
          />
        </Field>
      </ReasonDialog>

      <ConfirmDialog
        open={deactivateTarget !== null}
        tone="warning"
        title={t("codeRegister.confirmDeactivate.title")}
        message={t("codeRegister.confirmDeactivate.message")}
        confirmLabel={t("vendors.action.deactivate")}
        summary={deactivateTarget ? entrySummary(deactivateTarget) : undefined}
        onConfirm={() => { if (deactivateTarget) void handleToggleActive(deactivateTarget); setDeactivateTarget(null); }}
        onCancel={() => setDeactivateTarget(null)}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        title={t(archiveTarget?.isDeleted ? "codeRegister.confirmRestore.title" : "codeRegister.confirmArchive.title")}
        message={t(archiveTarget?.isDeleted ? "codeRegister.confirmRestore.message" : "codeRegister.confirmArchive.message")}
        confirmLabel={t(archiveTarget?.isDeleted ? "vendors.action.restore" : "common.archive")}
        danger={!archiveTarget?.isDeleted}
        summary={archiveTarget ? entrySummary(archiveTarget) : undefined}
        busy={archiving}
        onConfirm={handleArchiveToggle}
        onCancel={() => setArchiveTarget(null)}
      />

      <Toast message={toast.message} />
    </div>
  );
}
