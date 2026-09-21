import { useId, useMemo, useState } from "react";
import { Plus, Search, X, Store, Pencil, Archive, RotateCcw, Send, Check, Ban, Loader2 } from "lucide-react";
import { type Vendor, type VendorDraft, emptyVendorDraft, createVendor, updateVendor, setVendorArchived, vendorApprovalStatusOf, submitVendorApproval, approveVendor, rejectVendor } from "../../lib/vendors";
import { EmptyState } from "../../components/EmptyState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

/**
 * ทะเบียนผู้ขาย (2026-08-31) — เจ้าของขอไว้ 2026-08-28:
 * *"มีหน้าเพิ่มผู้ขายสำหรับจัดซื้อเพราะมันจะมีรหัสผู้ขายด้วย"*
 *
 * ลอกโครงจาก `pages/customers/CustomersPage.tsx` ซึ่งเป็นแม่แบบข้อมูลหลักที่ครบที่สุดในแอปนี้
 * (props สิทธิ์จริงส่งมาจาก App.tsx ไม่เรียก `hasPermission` เอง · i18n ทุกข้อความรวม aria-label ·
 * `EmptyState` แยกจาก "ค้นแล้วไม่เจอ" · `ConfirmDialog` ก่อนทุกการกระทำที่ย้อนยาก · `useDialogA11y`)
 *
 * ต่างจากลูกค้าตรงที่มี **รหัสผู้ขาย** ซึ่งห้ามซ้ำ — ความซ้ำถูกตัดสินที่เซิร์ฟเวอร์ (409) ไม่ใช่ที่นี่
 * เพราะต้องถามฐานข้อมูล หน้าจอแค่เอา error ขึ้นให้อ่านในฟอร์ม
 */

type StatusFilter = "all" | "active" | "inactive";

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [formTarget, setFormTarget] = useState<Vendor | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Vendor | null>(null);
  const [archiving, setArchiving] = useState(false);
  /** ขั้นอนุมัติของบัญชี (2026-09-21) — ปุ่มบนแถว + กล่องกรอกเหตุผลตอนไม่อนุมัติ */
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Vendor | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (!showArchived && v.isDeleted) return false;
      if (statusFilter === "active" && !v.isActive) return false;
      if (statusFilter === "inactive" && v.isActive) return false;
      if (!q) return true;
      return [v.name, v.code, v.contactName, v.phone, v.taxId].some((field) => field.toLowerCase().includes(q));
    });
  }, [vendors, search, statusFilter, showArchived]);

  const replaceVendor = (next: Vendor) => {
    onVendorsChange(vendors.some((v) => v.id === next.id) ? vendors.map((v) => (v.id === next.id ? next : v)) : [...vendors, next]);
  };

  const handleSave = async (draft: VendorDraft): Promise<string | null> => {
    try {
      const saved = formTarget === "new" || formTarget === null
        ? await createVendor(draft)
        : await updateVendor(formTarget.id, draft);
      replaceVendor(saved);
      setFormTarget(null);
      toast.show(t(formTarget === "new" ? "vendors.toast.created" : "vendors.toast.updated"));
      return null;
    } catch (err) {
      // 409 (รหัสซ้ำ) มาถึงตรงนี้พร้อมข้อความไทยจากเซิร์ฟเวอร์แล้ว แสดงตรง ๆ ในฟอร์ม
      return err instanceof ApiError ? err.message : t("common.errorGeneric");
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
      onVendorsChange(vendors.map((x) => (x.id === next.id ? next : x)));
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
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setArchiving(false);
    }
  };

  const th = "px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t("vendors.pageTitle")}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("vendors.pageSubtitle")}</p>
        </div>
        {canCreate && (
          <button onClick={() => setFormTarget("new")} className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Plus size={15} /> {t("vendors.addNew")}
          </button>
        )}
      </div>

      {vendors.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-secondary border border-border rounded-lg px-3 py-2 w-72 focus-within:border-[#c9a84c]/40 transition-colors">
            <Search size={14} className="text-muted-foreground flex-shrink-0" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("vendors.searchPlaceholder")}
              aria-label={t("vendors.searchPlaceholder")}
              className="bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label={t("vendors.col.status")}
            className="text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none"
          >
            <option value="all">{t("vendors.filter.all")}</option>
            <option value="active">{t("vendors.filter.active")}</option>
            <option value="inactive">{t("vendors.filter.inactive")}</option>
          </select>
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground ml-auto">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("vendors.showArchived")}
          </label>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {vendors.length === 0 ? (
          <EmptyState
            icon={Store}
            title={t("empty.vendors.title")}
            description={t("empty.vendors.sub")}
            actionLabel={canCreate ? t("empty.vendors.action") : undefined}
            onAction={canCreate ? () => setFormTarget("new") : undefined}
            compact
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Store size={20} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{t("vendors.noFilterResults")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className={th}>{t("vendors.col.code")}</th>
                  <th className={th}>{t("vendors.col.name")}</th>
                  <th className={th}>{t("vendors.col.contact")}</th>
                  <th className={th}>{t("vendors.col.phone")}</th>
                  <th className={th}>{t("vendors.col.taxId")}</th>
                  <th className={th}>{t("vendors.col.status")}</th>
                  <th className={th}>{t("vendors.approval.col")}</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className={`border-b border-border/50 ${v.isDeleted ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{v.code || "—"}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{v.name}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{v.contactName || "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{v.phone || "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{v.taxId || "—"}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge
                        status={v.isDeleted ? "archived" : v.isActive ? "active" : "inactive"}
                        label={t(v.isDeleted ? "vendors.status.archived" : v.isActive ? "vendors.status.active" : "vendors.status.inactive")}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {/* ขั้นอนุมัติของบัญชี (2026-09-21) — ป้าย + ปุ่มของขั้นถัดไปในช่องเดียว
                          ผู้ขายที่ถูกเก็บถาวรไม่ต้องเดินขั้นนี้ ไม่มีใครเอาไปใช้บนใบสั่งซื้อได้อยู่แล้ว */}
                      {v.isDeleted ? <span className="text-xs text-muted-foreground">—</span> : (() => {
                        const stage = vendorApprovalStatusOf(v);
                        const busy = approvalBusyId === v.id;
                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            <StatusBadge
                              status={stage === "approved" ? "active" : stage === "rejected" ? "archived" : "inactive"}
                              label={t(stage === "approved" ? "vendors.approval.approved"
                                : stage === "pendingApproval" ? "vendors.approval.pending"
                                : stage === "rejected" ? "vendors.approval.rejected" : "vendors.approval.draft")}
                            />
                            {busy && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                            {!busy && canEdit && (stage === "draft" || stage === "rejected") && (
                              <button
                                onClick={() => void runApproval(v, "submit")}
                                className="flex items-center gap-1 text-xs text-[#a7841a] hover:underline"
                              >
                                <Send size={11} /> {t("vendors.approval.submit")}
                              </button>
                            )}
                            {!busy && canApprove && stage === "pendingApproval" && (
                              <>
                                <button onClick={() => void runApproval(v, "approve")} className="flex items-center gap-1 text-xs text-[#1c7a4e] hover:underline">
                                  <Check size={11} /> {t("vendors.approval.approve")}
                                </button>
                                <button onClick={() => { setRejectTarget(v); setRejectComment(""); }} className="flex items-center gap-1 text-xs text-[#e05252] hover:underline">
                                  <Ban size={11} /> {t("vendors.approval.reject")}
                                </button>
                              </>
                            )}
                            {stage === "rejected" && (v.rejectionComment ?? "").trim() && (
                              <span className="text-xs text-[#e05252] w-full">{v.rejectionComment}</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && !v.isDeleted && (
                          <button
                            onClick={() => setFormTarget(v)}
                            title={t("vendors.form.editTitle")}
                            aria-label={`${t("vendors.form.editTitle")} — ${v.name}`}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {canArchive && (
                          <button
                            onClick={() => setArchiveTarget(v)}
                            title={t(v.isDeleted ? "vendors.confirmRestore.title" : "vendors.confirmArchive.title")}
                            aria-label={`${t(v.isDeleted ? "vendors.confirmRestore.title" : "vendors.confirmArchive.title")} — ${v.name}`}
                            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {v.isDeleted ? <RotateCcw size={13} /> : <Archive size={13} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formTarget !== null && (
        <VendorFormModal
          initial={formTarget === "new" ? emptyVendorDraft() : {
            name: formTarget.name, code: formTarget.code, contactName: formTarget.contactName,
            phone: formTarget.phone, taxId: formTarget.taxId, address: formTarget.address,
            note: formTarget.note, isActive: formTarget.isActive,
          }}
          isNew={formTarget === "new"}
          onSave={handleSave}
          onCancel={() => setFormTarget(null)}
        />
      )}

      {/* กล่องเหตุผลตอนไม่อนุมัติ — เซิร์ฟเวอร์บังคับว่าต้องมีเหตุผลเสมอ ปุ่มจึงปิดไว้จนกว่าจะพิมพ์ */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={() => setRejectTarget(null)} />
          <div role="dialog" aria-modal="true" className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">{t("vendors.approval.rejectTitle")}</h2>
            <p className="text-xs text-muted-foreground">{rejectTarget.name}</p>
            <textarea
              autoFocus
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder={t("vendors.approval.rejectPlaceholder")}
              rows={3}
              className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setRejectTarget(null)} className="px-3.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={() => void runApproval(rejectTarget, "reject")}
                disabled={!rejectComment.trim() || approvalBusyId === rejectTarget.id}
                className="px-3.5 py-1.5 text-xs rounded-lg font-semibold bg-[#e05252] text-white hover:bg-[#c94545] transition-colors disabled:opacity-50"
              >
                {t("vendors.approval.reject")}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={archiveTarget !== null}
        title={t(archiveTarget?.isDeleted ? "vendors.confirmRestore.title" : "vendors.confirmArchive.title")}
        message={t(archiveTarget?.isDeleted ? "vendors.confirmRestore.message" : "vendors.confirmArchive.message")}
        danger={!archiveTarget?.isDeleted}
        busy={archiving}
        onConfirm={handleArchiveToggle}
        onCancel={() => setArchiveTarget(null)}
      />

      <Toast message={toast.message} />
    </div>
  );
}

function VendorFormModal({
  initial,
  isNew,
  onSave,
  onCancel,
}: {
  initial: VendorDraft;
  isNew: boolean;
  onSave: (draft: VendorDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<VendorDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const panelRef = useDialogA11y(onCancel);
  const titleId = useId();

  const field = (key: "name" | "code" | "contactName" | "phone" | "taxId") => ({
    id: `vendor-${key}`,
    value: draft[key],
    disabled: saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value })),
    className: "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60",
  });

  const handleSubmit = async () => {
    if (!draft.name.trim()) { setError(t("vendors.form.nameRequired")); return; }
    setSaving(true);
    const err = await onSave(draft);
    setSaving(false);
    if (err) setError(err);
  };

  const label = "text-xs text-muted-foreground block mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1d3a]/40" onClick={onCancel} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t(isNew ? "vendors.form.createTitle" : "vendors.form.editTitle")}
          </h2>
          <button onClick={onCancel} disabled={saving} aria-label={t("common.cancel")} className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60">
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor="vendor-name" className={label}>{t("vendors.form.name")}</label>
            <input {...field("name")} />
          </div>
          <div>
            <label htmlFor="vendor-code" className={label}>{t("vendors.form.code")}</label>
            <input {...field("code")} />
            <p className="text-xs text-muted-foreground mt-1">{t("vendors.form.codeHint")}</p>
          </div>
          <div>
            <label htmlFor="vendor-contactName" className={label}>{t("vendors.form.contactName")}</label>
            <input {...field("contactName")} />
          </div>
          <div>
            <label htmlFor="vendor-phone" className={label}>{t("vendors.form.phone")}</label>
            <input {...field("phone")} />
          </div>
          <div>
            <label htmlFor="vendor-taxId" className={label}>{t("vendors.form.taxId")}</label>
            <input {...field("taxId")} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="vendor-address" className={label}>{t("vendors.form.address")}</label>
            <textarea
              id="vendor-address" rows={2} disabled={saving} value={draft.address}
              onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
              className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y disabled:opacity-60"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="vendor-note" className={label}>{t("vendors.form.note")}</label>
            <textarea
              id="vendor-note" rows={2} disabled={saving} value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors resize-y disabled:opacity-60"
            />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 cursor-pointer select-none text-sm text-foreground">
            <input
              type="checkbox" disabled={saving} checked={draft.isActive}
              onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-border accent-[#c9a84c]"
            />
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
