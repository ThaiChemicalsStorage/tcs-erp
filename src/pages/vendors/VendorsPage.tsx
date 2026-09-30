import { useMemo, useState, type KeyboardEvent } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { type Vendor, type VendorDraft, createVendor, updateVendor, setVendorArchived, vendorApprovalStatusOf, submitVendorApproval, approveVendor, rejectVendor } from "../../lib/vendors";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListPagination, ListEmpty } from "../../components/ui/ListPage";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { DialogSummary, ReasonDialog, TonePill } from "../purchaseOrder/purchasingUi";
import { VendorDrawer } from "./VendorDrawer";
import { filterVendors, vendorApprovalLabelKey, vendorApprovalTone, type VendorStatusTab } from "./vendorDisplay";

const PAGE_SIZE = 20;

/**
 * ทะเบียนผู้ขาย (2026-08-31) — เจ้าของขอไว้ 2026-08-28:
 * *"มีหน้าเพิ่มผู้ขายสำหรับจัดซื้อเพราะมันจะมีรหัสผู้ขายด้วย"*
 *
 * ดีไซน์ใหม่ 2026-09-30 (แบบ CustomersPage): แท็บสถานะพร้อมจำนวน → ค้นหา + แสดงที่เก็บถาวร → ตาราง
 * ที่ทั้งแถวกดเปิด**แผงด้านขวา** (สร้าง/แก้ไข/ดู) · ปุ่มอนุมัติของบัญชีย้ายจากแถวไปอยู่ในแผง
 * props สิทธิ์จริงส่งมาจาก App.tsx ไม่เรียก `hasPermission` เอง · i18n ทุกข้อความรวม aria-label
 *
 * ต่างจากลูกค้าตรงที่มี **รหัสผู้ขาย** ซึ่งห้ามซ้ำ — ความซ้ำถูกตัดสินที่เซิร์ฟเวอร์ (409) ไม่ใช่ที่นี่
 * เพราะต้องถามฐานข้อมูล หน้าจอแค่เอา error ขึ้นให้อ่านในแผง
 */
export function VendorsPage({
  vendors,
  onVendorsChange,
  canCreate,
  canEdit,
  canArchive,
  canApprove,
}: {
  vendors: Vendor[];
  onVendorsChange: (next: Vendor[]) => void;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  /** `vendor:approve` — สิทธิ์ของ**ฝ่ายบัญชี** (2026-09-21) แยกจาก `vendor:edit` ของจัดซื้อ */
  canApprove: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<VendorStatusTab>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  /** id ของผู้ขายที่เปิดในแผง หรือ "new" — เก็บเป็น id เพื่อให้แผงเห็นสถานะล่าสุดหลังกดคำสั่งจากแผง */
  const [formTarget, setFormTarget] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Vendor | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Vendor | null>(null);
  /** ขั้นอนุมัติของบัญชี (2026-09-21) — ปุ่มในแผง + กล่องกรอกเหตุผลตอนไม่อนุมัติ */
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Vendor | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const visible = useMemo(() => vendors.filter((v) => showArchived || !v.isDeleted), [vendors, showArchived]);
  const counts = useMemo(() => ({
    all: visible.length,
    active: visible.filter((v) => v.isActive).length,
    inactive: visible.filter((v) => !v.isActive).length,
  }), [visible]);
  const filtered = useMemo(() => filterVendors(vendors, { tab, search, showArchived }), [vendors, tab, search, showArchived]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const withReset = <V,>(set: (v: V) => void) => (v: V) => { set(v); setPage(1); };

  const replaceVendor = (next: Vendor) => {
    onVendorsChange(vendors.some((v) => v.id === next.id) ? vendors.map((v) => (v.id === next.id ? next : v)) : [...vendors, next]);
  };

  const drawerVendor = formTarget && formTarget !== "new" ? vendors.find((v) => v.id === formTarget) ?? null : null;
  const drawerOpen = formTarget === "new" ? canCreate : drawerVendor !== null;

  const handleSave = async (draft: VendorDraft): Promise<string | null> => {
    const isNew = formTarget === "new" || drawerVendor === null;
    try {
      const saved = isNew ? await createVendor(draft) : await updateVendor(drawerVendor.id, draft);
      replaceVendor(saved);
      setFormTarget(null);
      toast.show(t(isNew ? "vendors.toast.created" : "vendors.toast.updated"));
      return null;
    } catch (err) {
      // 409 (รหัสซ้ำ) มาถึงตรงนี้พร้อมข้อความไทยจากเซิร์ฟเวอร์แล้ว แสดงตรง ๆ ในแผง
      return err instanceof ApiError ? err.message : t("common.errorGeneric");
    }
  };

  /** ปิด/เปิดใช้งาน — เดิมเป็นช่องติ๊กในฟอร์ม ตอนนี้เป็นคำสั่งในเมนูของแผง บันทึกเฉพาะช่องนี้ช่องเดียว
   *  (เซิร์ฟเวอร์ไม่ถือว่าเป็นการแก้ข้อมูลระบุตัวผู้ขาย ขั้นอนุมัติของบัญชีจึงไม่ตก) */
  const handleToggleActive = async (v: Vendor) => {
    try {
      const next = await updateVendor(v.id, { isActive: !v.isActive });
      replaceVendor(next);
      toast.show(t(next.isActive ? "vendors.toast.activated" : "vendors.toast.deactivated"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  /**
   * เดินขั้นอนุมัติของบัญชี — ทั้งสามปุ่มคืนผู้ขายที่อัปเดตแล้วมาเหมือนกัน จึงเขียนกลับที่เดียว
   *
   * ปุ่ม "ส่งให้บัญชีอนุมัติ" เป็นของ**จัดซื้อ** (ใช้สิทธิ์ `vendor:edit` ที่มีอยู่แล้ว) ส่วน "อนุมัติ"
   * กับ "ไม่อนุมัติ" เป็นของ**บัญชี** (`vendor:approve`) — สองกลุ่มนี้ไม่ใช่คนเดียวกันโดยตั้งใจ
   */
  const runApproval = async (v: Vendor, stage: "submit" | "approve" | "reject") => {
    setApprovalBusyId(v.id);
    try {
      const next = stage === "submit" ? await submitVendorApproval(v.id)
        : stage === "approve" ? await approveVendor(v.id)
        : await rejectVendor(v.id, rejectComment.trim());
      replaceVendor(next);
      setRejectTarget(null);
      setRejectComment("");
      toast.show(t(stage === "submit" ? "vendors.approval.submittedToast"
        : stage === "approve" ? "vendors.approval.approvedToast" : "vendors.approval.rejectedToast"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally { setApprovalBusyId(null); }
  };
  const handleArchiveToggle = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const next = await setVendorArchived(archiveTarget.id, !archiveTarget.isDeleted);
      replaceVendor(next);
      toast.show(t(next.isDeleted ? "vendors.toast.archived" : "vendors.toast.restored"));
      setArchiveTarget(null);
      // เก็บถาวรแล้วปิดแผงไปด้วย — แถวหายจากรายการหลัก (ถ้าไม่ได้ติ๊กแสดงที่เก็บถาวร)
      if (next.isDeleted && !showArchived) setFormTarget(null);
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setArchiving(false);
    }
  };

  const openOnKey = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setFormTarget(id); }
  };

  const tabs = ([
    { key: "all", label: t("vendors.filter.all"), count: counts.all },
    { key: "active", label: t("vendors.filter.active"), count: counts.active },
    { key: "inactive", label: t("vendors.filter.inactive"), count: counts.inactive },
  ] as { key: VendorStatusTab; label: string; count: number }[]);

  const columns = [
    t("vendors.col.code"), t("vendors.col.name"), t("vendors.col.contact"), t("vendors.col.phone"),
    t("vendors.col.status"), t("vendors.approval.col"), "",
  ];
  const dash = <span className="text-[#8a97ad]">—</span>;
  const vendorSummary = (v: Vendor) => (
    <DialogSummary
      title={v.name}
      sub={[v.contactName && `${t("vendors.col.contact")} ${v.contactName}`, v.phone].filter(Boolean).join(" · ") || undefined}
      aside={v.code ? <span className="font-mono text-[13px]">{v.code}</span> : undefined}
    />
  );

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        title={t("vendors.pageTitle")}
        description={t("vendors.pageSubtitle")}
        actions={canCreate ? (
          <button type="button" onClick={() => setFormTarget("new")} className={btn.primary}>
            <Plus size={16} /> {t("vendors.addNew")}
          </button>
        ) : undefined}
      />

      <ListCard>
        <ListTabs tabs={tabs} active={tab} onChange={withReset(setTab)} ariaLabel={t("vendors.col.status")} />
        <ListToolbar
          search={search}
          onSearch={withReset(setSearch)}
          searchPlaceholder={t("vendors.searchPlaceholder")}
          count={t("ui.itemCount").replace("{n}", String(filtered.length))}
        >
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-[#3d5173] ml-1">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
              className="w-4 h-4 rounded border-[#c3ccda] accent-[#0b1d3a]"
            />
            {t("vendors.showArchived")}
          </label>
        </ListToolbar>

        {vendors.length === 0 ? (
          <ListEmpty
            title={t("empty.vendors.title")}
            hint={t("empty.vendors.sub")}
            action={canCreate ? <button type="button" onClick={() => setFormTarget("new")} className={btn.primary}><Plus size={16} /> {t("empty.vendors.action")}</button> : undefined}
          />
        ) : filtered.length === 0 ? (
          <ListEmpty title={t("vendors.noFilterResults")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className={table.head}>
                  {columns.map((h, i) => <th key={i} className={table.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((v) => {
                  const stage = vendorApprovalStatusOf(v);
                  return (
                    <tr
                      key={v.id}
                      tabIndex={0}
                      aria-label={`${t("vendors.openRow")} ${v.name}`}
                      onClick={() => setFormTarget(v.id)}
                      onKeyDown={(e) => openOnKey(e, v.id)}
                      className={`${table.row} group cursor-pointer outline-none focus-visible:bg-[#f8f9fc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 ${v.isDeleted ? "opacity-60" : ""}`}
                    >
                      <td className={`${table.td} font-mono text-[13px] text-[#3d5173] whitespace-nowrap`}>{v.code || dash}</td>
                      <td className={`${table.td} max-w-[320px]`}>
                        <div className="flex flex-col min-w-0 leading-snug">
                          <span className="text-sm font-medium text-foreground truncate" title={v.name}>{v.name}</span>
                          {v.taxId && (
                            <span className="text-xs text-muted-foreground truncate">
                              {t("vendors.col.taxId")} <span className="font-mono">{v.taxId}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`${table.td} text-sm text-foreground`}>{v.contactName || dash}</td>
                      <td className={`${table.td} text-sm text-[#3d5173] whitespace-nowrap`}>{v.phone || dash}</td>
                      <td className={table.td}>
                        <StatusBadge
                          status={v.isDeleted ? "archived" : v.isActive ? "active" : "inactive"}
                          label={t(v.isDeleted ? "vendors.status.archived" : v.isActive ? "vendors.status.active" : "vendors.status.inactive")}
                        />
                      </td>
                      <td className={`${table.td} py-2.5`}>
                        {v.isDeleted ? dash : (
                          <div className="flex flex-col items-start gap-1 max-w-[260px]">
                            <TonePill tone={vendorApprovalTone[stage]} label={t(vendorApprovalLabelKey[stage])} />
                            {stage === "rejected" && (v.rejectionComment ?? "").trim() && (
                              <span className="text-xs text-[#b93636] line-clamp-2" title={v.rejectionComment}>{v.rejectionComment}</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={`${table.td} w-10`}>
                        <ChevronRight size={18} className="text-[#a3aec2] group-hover:text-foreground transition-colors" aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
        <VendorDrawer
          key={formTarget ?? "none"}
          vendor={drawerVendor}
          canEdit={canEdit}
          canArchive={canArchive}
          canApprove={canApprove}
          locked={archiveTarget !== null || deactivateTarget !== null || rejectTarget !== null}
          approvalBusy={drawerVendor !== null && approvalBusyId === drawerVendor.id}
          onSave={handleSave}
          onClose={() => setFormTarget(null)}
          onToggleActive={(v) => (v.isActive ? setDeactivateTarget(v) : void handleToggleActive(v))}
          onArchiveToggle={(v) => setArchiveTarget(v)}
          onSubmitApproval={(v) => void runApproval(v, "submit")}
          onApprove={(v) => void runApproval(v, "approve")}
          onReject={(v) => { setRejectTarget(v); setRejectComment(""); }}
        />
      )}

      {/* กล่องเหตุผลตอนไม่อนุมัติ — เซิร์ฟเวอร์บังคับว่าต้องมีเหตุผลเสมอ ปุ่มจึงปิดไว้จนกว่าจะพิมพ์ */}
      <ReasonDialog
        open={rejectTarget !== null}
        tone="danger"
        danger
        title={t("vendors.approval.rejectTitle")}
        message={t("vendors.approval.rejectMessage")}
        summary={rejectTarget ? (
          <DialogSummary
            title={rejectTarget.name}
            sub={rejectTarget.taxId ? <>{t("vendors.col.taxId")} <span className="font-mono">{rejectTarget.taxId}</span></> : undefined}
            aside={rejectTarget.code ? <span className="font-mono text-[13px]">{rejectTarget.code}</span> : undefined}
          />
        ) : undefined}
        confirmLabel={t("vendors.approval.reject")}
        confirmDisabled={!rejectComment.trim()}
        busy={rejectTarget !== null && approvalBusyId === rejectTarget.id}
        onCancel={() => setRejectTarget(null)}
        onConfirm={() => { if (rejectTarget) void runApproval(rejectTarget, "reject"); }}
      >
        <Field label={t("vendors.approval.rejectLabel")} htmlFor="vendor-reject-comment" required help={!rejectComment.trim() ? t("vendors.approval.rejectRequiredHint") : undefined}>
          <textarea
            id="vendor-reject-comment"
            autoFocus
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            placeholder={t("vendors.approval.rejectPlaceholder")}
            rows={3}
            className={`${field.textarea} w-full resize-y`}
          />
        </Field>
      </ReasonDialog>
      <ConfirmDialog
        open={deactivateTarget !== null}
        tone="warning"
        title={t("vendors.confirmDeactivate.title")}
        message={t("vendors.confirmDeactivate.message")}
        confirmLabel={t("vendors.action.deactivate")}
        summary={deactivateTarget ? vendorSummary(deactivateTarget) : undefined}
        onConfirm={() => { if (deactivateTarget) void handleToggleActive(deactivateTarget); setDeactivateTarget(null); }}
        onCancel={() => setDeactivateTarget(null)}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        title={t(archiveTarget?.isDeleted ? "vendors.confirmRestore.title" : "vendors.confirmArchive.title")}
        message={t(archiveTarget?.isDeleted ? "vendors.confirmRestore.message" : "vendors.confirmArchive.message")}
        confirmLabel={t(archiveTarget?.isDeleted ? "vendors.action.restore" : "common.archive")}
        danger={!archiveTarget?.isDeleted}
        summary={archiveTarget ? vendorSummary(archiveTarget) : undefined}
        busy={archiving}
        onConfirm={handleArchiveToggle}
        onCancel={() => setArchiveTarget(null)}
      />

      <Toast message={toast.message} />
    </div>
  );
}
