import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Search, Loader2, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import {
  type ProductRequest, type ProductRequestStatus,
  fetchProductRequests, createProductRequest, approveProductRequest, rejectProductRequest, deleteProductRequest,
} from "../../lib/productRequest";
import { type ProductCategory, fetchCategories } from "../../lib/products";
import { ApiError } from "../../lib/apiClient";
import { EmptyState } from "../../components/EmptyState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";

/**
 * หน้าคำขอเพิ่มสินค้า — เพิ่ม 2026-08-27 ตามคำขอของฝ่ายโครงการ
 *
 * จุดสำคัญของหน้านี้: **ฟอร์มขอไม่มีช่องรหัสสินค้าเลย** และช่องรหัสจะโผล่เฉพาะในกล่องอนุมัติของสโตร์
 * (สิทธิ์ `productRequest:review`) เท่านั้น การซ่อนช่องบน UI เป็นแค่ครึ่งเดียว — เซิร์ฟเวอร์ก็ไม่รับ
 * ฟิลด์ `code` จากเส้นทางสร้าง/แก้คำขอด้วย ดู api/_lib/productRequestHandler.ts
 */

const STATUS_STYLE: Record<ProductRequestStatus, string> = {
  Pending: "bg-[#e08a3c]/15 text-[#a75d1a]",
  Approved: "bg-[#2aa36b]/15 text-[#1c7a4e]",
  Rejected: "bg-[#e05252]/15 text-[#a33]",
};

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors";

export function ProductRequestPage({
  currentUserId, canCreate, canReview, onProductsChanged, initialProductRequestId, onProductRequestIdConsumed,
}: {
  /** ใช้ซ่อนปุ่มลบบนคำขอของคนอื่น — เซิร์ฟเวอร์ก็ปฏิเสธอยู่แล้ว แต่ปุ่มที่กดแล้วได้ 403 เสมอไม่ควรมีให้เห็น */
  currentUserId: string;
  canCreate: boolean;
  canReview: boolean;
  /**
   * เรียกหลังอนุมัติคำขอสำเร็จ เพื่อให้แอปโหลดรายการสินค้าใหม่ (2026-09-09)
   *
   * `App.tsx` โหลดรายการสินค้าครั้งเดียวตอนเข้าระบบ และส่งต่อให้ตัวเลือกสินค้าของใบเสนอราคา/เทมเพลต
   * ใบเสนอราคา — ถ้าไม่บอกให้โหลดใหม่ สินค้าที่สโตร์เพิ่งตั้งรหัสจะไม่ขึ้นจนกว่าจะรีเฟรชหน้าทั้งหน้า
   */
  onProductsChanged?: () => void;
  initialProductRequestId?: string | null;
  onProductRequestIdConsumed?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", unit: "", categoryId: "", specifications: "", reason: "" });

  const [reviewing, setReviewing] = useState<ProductRequest | null>(null);
  const [reviewCode, setReviewCode] = useState("");
  const [reviewCategoryId, setReviewCategoryId] = useState("");
  const [rejectTarget, setRejectTarget] = useState<ProductRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRequest | null>(null);

  const reload = async () => {
    const list = await fetchProductRequests();
    setRequests(list);
    return list;
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchProductRequests(), fetchCategories()])
      .then(([list, cats]) => {
        if (cancelled) return;
        setRequests(list);
        setCategories(cats);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // เปิดจากกระดิ่งแจ้งเตือน — เลื่อนไปที่แถวนั้นแล้วไฮไลต์ให้เห็น
  useEffect(() => {
    if (!initialProductRequestId || loading) return;
    const row = document.getElementById(`pr-row-${initialProductRequestId}`);
    row?.scrollIntoView({ block: "center" });
    row?.classList.add("ring-2", "ring-[#c9a84c]/60");
    onProductRequestIdConsumed?.();
  }, [initialProductRequestId, loading, onProductRequestIdConsumed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) => [r.name, r.requestedByName, r.assignedProductCode, r.requestedByDepartment]
      .some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [requests, search]);

  const statusLabel = (s: ProductRequestStatus) =>
    s === "Pending" ? t("productRequest.status.pending")
      : s === "Approved" ? t("productRequest.status.approved")
        : t("productRequest.status.rejected");

  const submitCreate = async () => {
    setBusy(true);
    try {
      await createProductRequest(draft);
      await reload();
      setCreateOpen(false);
      setDraft({ name: "", unit: "", categoryId: "", specifications: "", reason: "" });
      toast.show(t("productRequest.created"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("productRequest.error"));
    } finally { setBusy(false); }
  };

  const submitApprove = async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      await approveProductRequest(reviewing.id, reviewCode, reviewCategoryId);
      await reload();
      setReviewing(null);
      // สินค้าเกิดขึ้นจริงแล้ว — บอกแอปให้โหลดแคตตาล็อกใหม่ ไม่งั้นตัวเลือกสินค้าของใบเสนอราคายังเป็นชุดเดิม
      onProductsChanged?.();
      toast.show(t("productRequest.approved"));
    } catch (err) {
      // รหัสซ้ำ (409) ต้องไม่ปิดกล่อง — ผู้ใช้จะได้แก้รหัสแล้วกดใหม่ได้ทันที
      toast.show(err instanceof ApiError ? err.message : t("productRequest.error"));
    } finally { setBusy(false); }
  };

  const submitReject = async (comment: string) => {
    if (!rejectTarget) return;
    try {
      await rejectProductRequest(rejectTarget.id, comment);
      await reload();
      toast.show(t("productRequest.rejected"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("productRequest.error"));
    } finally { setRejectTarget(null); }
  };

  // ลบเป็นการกระทำที่ย้อนกลับไม่ได้ จึงถามยืนยันก่อนเสมอ เหมือนทุกปุ่มลบในแอปนี้ (ConfirmDialog)
  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await deleteProductRequest(deleteTarget.id);
      await reload();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("productRequest.error"));
    } finally { setBusy(false); setDeleteTarget(null); }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6" role="status" aria-live="polite">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-3 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
              {t("productRequest.title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{t("productRequest.subtitle")}</p>
          </div>
          {canCreate && (
            <button onClick={() => setCreateOpen(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors">
              <PackagePlus size={15} /> {t("productRequest.createBtn")}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
          <Search size={14} className="text-muted-foreground flex-shrink-0" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("productRequest.searchPlaceholder")}
            className="flex-1 bg-transparent text-sm text-foreground outline-none" />
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={PackagePlus} title={t("productRequest.empty")} description={t("productRequest.emptyHint")} />
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-secondary/50">
                  <tr>
                    {[t("productRequest.col.name"), t("productRequest.col.code"), t("productRequest.col.requestedBy"),
                      t("productRequest.col.department"), t("productRequest.col.status"), t("productRequest.col.requestedAt"), ""].map((h, i) => (
                      <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} id={`pr-row-${r.id}`} className="border-b border-border/50">
                      <td className="px-4 py-3 text-sm text-foreground">
                        {r.name}
                        {r.specifications.trim() && <p className="text-xs text-muted-foreground">{r.specifications}</p>}
                        {r.sourcePurchaseRequestId && (
                          <p className="text-xs text-muted-foreground font-mono">{t("productRequest.sourcePr")} {r.sourcePurchaseRequestId}</p>
                        )}
                        {r.status === "Rejected" && r.rejectionComment && (
                          <p className="text-xs text-[#a33]">{r.rejectionComment}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{r.assignedProductCode || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.requestedByName}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{r.requestedByDepartment || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>{statusLabel(r.status)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.requestedAt}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 justify-end">
                          {canReview && r.status === "Pending" && (
                            <>
                              <button
                                onClick={() => { setReviewing(r); setReviewCode(""); setReviewCategoryId(r.categoryId || ""); }}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-[#2aa36b] text-white rounded-lg font-medium hover:bg-[#238f5c] transition-colors">
                                <CheckCircle2 size={12} /> {t("productRequest.approve")}
                              </button>
                              <button onClick={() => setRejectTarget(r)}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs border border-[#e05252]/40 text-[#e05252] rounded-lg font-medium hover:bg-[#e05252]/10 transition-colors">
                                <XCircle size={12} /> {t("productRequest.reject")}
                              </button>
                            </>
                          )}
                          {r.status === "Pending" && (r.requestedBy === currentUserId || canReview) && (
                            <button onClick={() => setDeleteTarget(r)} title={t("productRequest.delete")} className="text-muted-foreground hover:text-[#e05252] transition-colors p-1">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ฟอร์มขอ — ไม่มีช่องรหัสสินค้าโดยตั้งใจ */}
      {createOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-foreground">{t("productRequest.createTitle")}</h2>
            <p className="text-xs text-muted-foreground bg-secondary/60 border border-border rounded-lg px-3 py-2">
              {t("productRequest.noCodeHint")}
            </p>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("productRequest.field.name")}</label>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t("productRequest.field.unit")}</label>
                <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">{t("productRequest.field.category")}</label>
                <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("productRequest.field.specifications")}</label>
              <textarea rows={2} value={draft.specifications} onChange={(e) => setDraft({ ...draft, specifications: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("productRequest.field.reason")}</label>
              <textarea rows={2} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreateOpen(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                {t("common.cancel")}
              </button>
              <button onClick={() => void submitCreate()} disabled={busy || !draft.name.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#b8973f] transition-colors disabled:opacity-60">
                {busy && <Loader2 size={12} className="animate-spin" />} {t("productRequest.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* กล่องอนุมัติของสโตร์ — ช่องรหัสสินค้าอยู่ที่นี่ที่เดียว */}
      {reviewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-3">
            <h2 className="text-sm font-semibold text-foreground">{t("productRequest.reviewTitle")}</h2>
            <p className="text-xs text-muted-foreground">{reviewing.name}{reviewing.unit ? ` · ${reviewing.unit}` : ""}</p>
            {reviewing.specifications.trim() && <p className="text-xs text-muted-foreground">{reviewing.specifications}</p>}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("productRequest.field.code")}</label>
              <input value={reviewCode} onChange={(e) => setReviewCode(e.target.value)} className={`${inputCls} font-mono`} autoFocus />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">{t("productRequest.field.category")}</label>
              <select value={reviewCategoryId} onChange={(e) => setReviewCategoryId(e.target.value)} className={inputCls}>
                <option value="">{t("productRequest.field.categoryPlaceholder")}</option>
                {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-1">{t("productRequest.field.categoryHint")}</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setReviewing(null)} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                {t("common.cancel")}
              </button>
              <button onClick={() => void submitApprove()} disabled={busy || !reviewCode.trim() || !reviewCategoryId}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#2aa36b] text-white rounded-lg font-semibold hover:bg-[#238f5c] transition-colors disabled:opacity-60">
                {busy && <Loader2 size={12} className="animate-spin" />} {t("productRequest.approve")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("productRequest.deleteConfirmTitle")}
        message={t("productRequest.deleteConfirmBody")}
        confirmLabel={t("productRequest.delete")}
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
      />
      <PromptDialog
        open={rejectTarget !== null}
        title={t("productRequest.reject")}
        label={t("productRequest.rejectPrompt")}
        confirmLabel={t("productRequest.reject")}
        onConfirm={(value) => void submitReject(value)}
        onCancel={() => setRejectTarget(null)}
      />
      <Toast message={toast.message} />
    </div>
  );
}
