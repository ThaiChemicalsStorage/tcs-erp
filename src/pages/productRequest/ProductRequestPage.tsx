import { useEffect, useMemo, useState } from "react";
import { PackagePlus, Loader2, CheckCircle2, Trash2, Plus, Info, Send } from "lucide-react";
import {
  type ProductRequest, type ProductRequestStatus,
  fetchProductRequests, createProductRequest, approveProductRequest, rejectProductRequest, deleteProductRequest,
} from "../../lib/productRequest";
import { type ProductCategory, fetchCategories } from "../../lib/products";
import { ApiError } from "../../lib/apiClient";
import { formatQuoteDateThai } from "../../lib/quotes";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useI18n } from "../../lib/i18n";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListEmpty } from "../../components/ui/ListPage";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { Drawer } from "../../components/ui/Overlays";
import { Field, SelectBox } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { FormDialog, Pill, type PillTone } from "../stock/inventoryUi";

/**
 * หน้าคำขอเพิ่มสินค้า — เพิ่ม 2026-08-27 ตามคำขอของฝ่ายโครงการ
 *
 * จุดสำคัญของหน้านี้: **ฟอร์มขอไม่มีช่องรหัสสินค้าเลย** และช่องรหัสจะโผล่เฉพาะในกล่องอนุมัติของสโตร์
 * (สิทธิ์ `productRequest:review`) เท่านั้น การซ่อนช่องบน UI เป็นแค่ครึ่งเดียว — เซิร์ฟเวอร์ก็ไม่รับ
 * ฟิลด์ `code` จากเส้นทางสร้าง/แก้คำขอด้วย ดู api/_lib/productRequestHandler.ts
 *
 * ดีไซน์ใหม่ 2026-09-30: แท็บสถานะพร้อมจำนวน (ตัวกรองใหม่) · ฟอร์มขอย้ายเป็นแผงด้านข้าง ·
 * กล่องอนุมัติ/ไม่อนุมัติ/ลบ เป็นกล่อง 480 แบบใหม่
 */

type StatusTab = "all" | ProductRequestStatus;

const STATUS_TONE: Record<ProductRequestStatus, PillTone> = {
  Pending: "amber",
  Approved: "green",
  Rejected: "red",
};

/** ปุ่มในแถว (36px) — ไม่อนุมัติ = ตัวแดงบนพื้นขาว · อนุมัติ = ขอบกรมท่า */
const rejectBtnCls = "h-9 px-3 inline-flex items-center rounded-lg border border-[#c3ccda] bg-white text-[#b93636] text-[13px] font-medium hover:bg-[#fcebeb] transition-colors whitespace-nowrap";
const approveBtnCls = "h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-[#0b1d3a] bg-white text-foreground text-[13px] font-semibold hover:bg-[#f4f6fa] transition-colors whitespace-nowrap";
const rowCls = "h-16 border-b border-[#eef1f6] bg-white hover:bg-[#f8f9fc] transition-colors text-sm";

const EMPTY_DRAFT = { name: "", unit: "", categoryId: "", specifications: "", reason: "" };

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
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);

  const [reviewing, setReviewing] = useState<ProductRequest | null>(null);
  const [reviewCode, setReviewCode] = useState("");
  const [reviewCategoryId, setReviewCategoryId] = useState("");
  /** พิมพ์ชื่อหมวดใหม่ตรงนี้แทนการเลือกจากรายการ — ว่าง = ใช้หมวดที่เลือกไว้ (2026-09-09) */
  const [reviewNewCategory, setReviewNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ProductRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRequest | null>(null);

  // เปิดจากกระดิ่งแจ้งเตือน — กลับไปแท็บ "ทั้งหมด" และล้างคำค้น ให้แถวนั้นอยู่บนจอแน่นอน
  const [appliedDeepLink, setAppliedDeepLink] = useState<string | null>(null);
  if (initialProductRequestId && initialProductRequestId !== appliedDeepLink) {
    setAppliedDeepLink(initialProductRequestId);
    setStatusTab("all");
    setSearch("");
  }

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
    row?.classList.add("ring-2", "ring-inset", "ring-[#c9a84c]/60");
    onProductRequestIdConsumed?.();
  }, [initialProductRequestId, loading, onProductRequestIdConsumed]);

  const counts = useMemo(() => ({
    all: requests.length,
    Pending: requests.filter((r) => r.status === "Pending").length,
    Approved: requests.filter((r) => r.status === "Approved").length,
    Rejected: requests.filter((r) => r.status === "Rejected").length,
  }), [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests
      .filter((r) => statusTab === "all" || r.status === statusTab)
      .filter((r) => !q || [r.name, r.requestedByName, r.assignedProductCode, r.requestedByDepartment]
        .some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [requests, search, statusTab]);

  const statusLabel = (s: ProductRequestStatus) =>
    s === "Pending" ? t("productRequest.status.pending")
      : s === "Approved" ? t("productRequest.status.approved")
        : t("productRequest.status.rejected");

  const tabs = [
    { key: "all" as const, label: t("productRequest.tab.all"), count: counts.all },
    { key: "Pending" as const, label: t("productRequest.status.pending"), count: counts.Pending },
    { key: "Approved" as const, label: t("productRequest.status.approved"), count: counts.Approved },
    { key: "Rejected" as const, label: t("productRequest.status.rejected"), count: counts.Rejected },
  ];

  const submitCreate = async () => {
    if (busy || !draft.name.trim()) return;
    setBusy(true);
    try {
      await createProductRequest(draft);
      await reload();
      setCreateOpen(false);
      setDraft(EMPTY_DRAFT);
      toast.show(t("productRequest.created"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("productRequest.error"));
    } finally { setBusy(false); }
  };

  const openReview = (r: ProductRequest) => {
    setReviewing(r);
    setReviewCode("");
    setReviewCategoryId(r.categoryId || "");
    setAddingCategory(false);
    setReviewNewCategory("");
  };

  const submitApprove = async () => {
    if (!reviewing) return;
    setBusy(true);
    try {
      await approveProductRequest(reviewing.id, reviewCode, reviewCategoryId, addingCategory ? reviewNewCategory.trim() : undefined);
      await reload();
      setReviewing(null);
      setAddingCategory(false);
      setReviewNewCategory("");
      // หมวดอาจเพิ่งถูกสร้างไปพร้อมกัน — โหลดรายการหมวดใหม่ให้กล่องอนุมัติครั้งถัดไปเห็น
      fetchCategories().then(setCategories).catch(() => { /* ใช้รายการเดิมต่อไป */ });
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

  /** บรรทัดรองใต้ชื่อ: เหตุผลไม่อนุมัติ (แดง) หรือ สเปก · จากใบขอซื้อ */
  const subLine = (r: ProductRequest) => {
    if (r.status === "Rejected" && r.rejectionComment) {
      return <span className="block text-xs text-[#b93636] truncate" title={r.rejectionComment}>{t("productRequest.status.rejected")}: {r.rejectionComment}</span>;
    }
    const parts = [r.specifications.trim(), r.sourcePurchaseRequestId ? `${t("productRequest.sourcePr")} ${r.sourcePurchaseRequestId}` : ""].filter(Boolean);
    if (parts.length === 0) return null;
    const text = parts.join(" · ");
    return <span className="block text-xs text-muted-foreground truncate" title={text}>{text}</span>;
  };

  const requesterLine = (r: ProductRequest) =>
    [r.requestedByName, r.requestedByDepartment, formatQuoteDateThai(r.requestedAt)].filter(Boolean).join(" · ");

  // ปุ่มขอเพิ่ม (สิทธิ์สร้าง) และปุ่มตั้งรหัส (สโตร์ · แถวแรกที่ยังรอ) ไม่มีเสมอ — ทัวร์ข้ามขั้นที่หาไม่เจอเอง
  // hook ต้องอยู่เหนือ early return ตอนโหลด
  const firstReviewableId = canReview ? filtered.find((r) => r.status === "Pending")?.id : undefined;
  const tourSteps: TourStep[] = [
    { element: '[data-tour="preq-create"]', manual: "ch26-1", popover: { title: t("tour.productRequest.create.title"), description: t("tour.productRequest.create.desc"), side: "bottom" } },
    { element: '[data-tour="preq-tabs"]', manual: "ch26-2", popover: { title: t("tour.productRequest.tabs.title"), description: t("tour.productRequest.tabs.desc"), side: "bottom" } },
    { element: '[data-tour="preq-search"]', manual: "ch2-6", popover: { title: t("tour.productRequest.search.title"), description: t("tour.productRequest.search.desc"), side: "bottom" } },
    { element: '[data-tour="preq-table"]', manual: "ch26-2", popover: { title: t("tour.productRequest.table.title"), description: t("tour.productRequest.table.desc"), side: "top" } },
    { element: '[data-tour="preq-review"]', manual: "ch26-4", popover: { title: t("tour.productRequest.review.title"), description: t("tour.productRequest.review.desc"), side: "left" } },
  ];
  const tour = useModuleTour("productRequest", currentUserId, tourSteps, { autoStart: !loading });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6" role="status" aria-live="polite">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-5">
      <ListPageHeader
        module={t("nav.group.inventory")}
        title={t("productRequest.title")}
        description={t("productRequest.subtitle")}
        help={<TourReplayButton variant="title" onClick={tour.start} />}
        actions={canCreate && (
          <button type="button" data-tour="preq-create" onClick={() => setCreateOpen(true)} className={btn.primary}>
            <PackagePlus size={16} /> {t("productRequest.createBtn")}
          </button>
        )}
      />

      <ListCard>
        <div data-tour="preq-tabs">
          <ListTabs tabs={tabs} active={statusTab} onChange={setStatusTab} ariaLabel={t("productRequest.col.status")} />
        </div>
        <div data-tour="preq-search">
          <ListToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder={t("productRequest.searchPlaceholder")}
            count={t("ui.itemCount").replace("{n}", String(filtered.length))}
          />
        </div>

        {requests.length === 0 ? (
          <ListEmpty title={t("productRequest.empty")} hint={t("productRequest.emptyHint")} />
        ) : filtered.length === 0 ? (
          <ListEmpty title={t("productRequest.noMatch")} />
        ) : (
          <div data-tour="preq-table" className="overflow-x-auto">
            <table className="w-full min-w-[960px] table-fixed">
              <thead>
                <tr className={table.head}>
                  <th className={table.th}>{t("productRequest.col.name")}</th>
                  <th className={`${table.th} w-[120px]`}>{t("productRequest.col.code")}</th>
                  <th className={`${table.th} w-[220px]`}>{t("productRequest.col.requestedByDate")}</th>
                  <th className={`${table.th} w-[160px]`}>{t("productRequest.col.status")}</th>
                  <th className={`${table.th} w-[300px]`}><span className="sr-only">{t("ui.more")}</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const pending = r.status === "Pending";
                  const canDelete = pending && (r.requestedBy === currentUserId || canReview);
                  return (
                    <tr key={r.id} id={`pr-row-${r.id}`} className={rowCls}>
                      <td className={table.td}>
                        <span className="block font-medium text-foreground truncate" title={r.name}>{r.name}</span>
                        {subLine(r)}
                      </td>
                      <td className={`${table.td} whitespace-nowrap ${r.assignedProductCode ? table.code : "font-mono text-[13px] text-[#8a97ad]"}`}>{r.assignedProductCode || "—"}</td>
                      <td className={table.td}>
                        <span className="block truncate" title={r.requestedByName}>{r.requestedByName}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {[r.requestedByDepartment || "—", formatQuoteDateThai(r.requestedAt)].join(" · ")}
                        </span>
                      </td>
                      <td className={table.td}><Pill tone={STATUS_TONE[r.status]}>{statusLabel(r.status)}</Pill></td>
                      <td className={table.td}>
                        <span className="flex items-center justify-end gap-2">
                          {canReview && pending && (
                            <span data-tour={r.id === firstReviewableId ? "preq-review" : undefined} className="flex items-center gap-2">
                              <button type="button" onClick={() => setRejectTarget(r)} className={rejectBtnCls}>
                                {t("productRequest.reject")}
                              </button>
                              <button type="button" onClick={() => openReview(r)} className={approveBtnCls}>
                                <CheckCircle2 size={15} /> {t("productRequest.approve")}
                              </button>
                            </span>
                          )}
                          {canDelete && (
                            <button type="button" onClick={() => setDeleteTarget(r)} title={t("productRequest.delete")}
                              aria-label={`${t("productRequest.delete")} ${r.name}`}
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ListCard>

      {/* แผงขอเพิ่มสินค้า — ไม่มีช่องรหัสสินค้าโดยตั้งใจ · ปิดแผงแล้วสิ่งที่กรอกค้างไว้ยังอยู่ (เหมือนกล่องเดิม) */}
      <Drawer
        open={createOpen}
        title={t("productRequest.createTitle")}
        onClose={() => setCreateOpen(false)}
        busy={busy}
        footerRight={(
          <>
            <button type="button" onClick={() => setCreateOpen(false)} disabled={busy} className={btn.secondary}>{t("common.cancel")}</button>
            <button type="submit" form="product-request-form" disabled={busy || !draft.name.trim()} className={btn.primary}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {t("productRequest.submit")}
            </button>
          </>
        )}
      >
        <form id="product-request-form" onSubmit={(e) => { e.preventDefault(); void submitCreate(); }} noValidate className="flex flex-col gap-6">
          <p className="px-3.5 py-3 bg-[#e8f0fb] border border-[#b9d0f0] rounded-[10px] flex gap-2.5 text-[13px] leading-relaxed text-[#16407a]">
            <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            {t("productRequest.noCodeHint")}
          </p>
          <section className="flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold text-foreground">{t("productRequest.group.product")}</h3>
            <Field label={t("productRequest.field.name")} htmlFor="pr-name" required>
              <input id="pr-name" autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field.input} w-full`} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-4">
              <Field label={t("productRequest.field.unit")} htmlFor="pr-unit">
                <input id="pr-unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={`${field.input} w-full`} />
              </Field>
              <Field label={t("productRequest.field.category")} htmlFor="pr-category">
                <SelectBox id="pr-category" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                  <option value="">—</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectBox>
              </Field>
            </div>
            <Field label={t("productRequest.field.specifications")} htmlFor="pr-spec">
              <textarea id="pr-spec" rows={3} value={draft.specifications} onChange={(e) => setDraft({ ...draft, specifications: e.target.value })} className={`${field.textarea} w-full resize-y`} />
            </Field>
          </section>
          <div className="h-px bg-[#eef1f6]" />
          <section className="flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold text-foreground">{t("productRequest.group.reason")}</h3>
            <Field label={t("productRequest.field.reason")} htmlFor="pr-reason">
              <textarea id="pr-reason" rows={3} value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} className={`${field.textarea} w-full resize-y`} />
            </Field>
          </section>
        </form>
      </Drawer>

      {/* กล่องอนุมัติของสโตร์ — ช่องรหัสสินค้าอยู่ที่นี่ที่เดียว */}
      {reviewing && (
        <FormDialog
          icon={CheckCircle2}
          tone="success"
          title={t("productRequest.reviewTitle")}
          description={t("productRequest.reviewHint")}
          busy={busy}
          confirmLabel={t("productRequest.approve")}
          confirmIcon={CheckCircle2}
          confirmDisabled={!reviewCode.trim() || (addingCategory ? !reviewNewCategory.trim() : !reviewCategoryId)}
          onConfirm={() => void submitApprove()}
          onCancel={() => setReviewing(null)}
        >
          <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg flex flex-col gap-0.5">
            <span className="font-semibold text-foreground">
              {reviewing.name}
              {reviewing.unit && <span className="font-normal text-muted-foreground"> · {reviewing.unit}</span>}
            </span>
            {reviewing.specifications.trim() && <span className="text-[13px] text-[#3d5173]">{reviewing.specifications}</span>}
            <span className="text-xs text-muted-foreground">
              {[requesterLine(reviewing), reviewing.sourcePurchaseRequestId ? `${t("productRequest.sourcePr")} ${reviewing.sourcePurchaseRequestId}` : ""].filter(Boolean).join(" · ")}
            </span>
          </div>
          <Field label={t("productRequest.field.code")} htmlFor="pr-review-code" required>
            <input id="pr-review-code" autoFocus value={reviewCode} onChange={(e) => setReviewCode(e.target.value)} className={`${field.input} w-[200px] font-mono`} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pr-review-category" className={field.label}>
              {t("productRequest.field.category")} <span className="text-[#b93636]">*</span>
            </label>
            {addingCategory ? (
              <input
                id="pr-review-category"
                autoFocus
                value={reviewNewCategory}
                onChange={(e) => setReviewNewCategory(e.target.value)}
                placeholder={t("products.categories.namePlaceholder")}
                className={`${field.input} w-full`}
              />
            ) : (
              <SelectBox id="pr-review-category" value={reviewCategoryId} onChange={(e) => setReviewCategoryId(e.target.value)}>
                <option value="">{t("productRequest.field.categoryPlaceholder")}</option>
                {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectBox>
            )}
            <p className={field.help}>{t("productRequest.field.categoryHint")}</p>
            {/* หมวดที่ต้องใช้ยังไม่มี — สร้างได้ตรงนี้เลย ไม่ต้องออกไปหน้าสินค้าแล้วกลับมาเริ่มใหม่ */}
            <button
              type="button"
              onClick={() => { setAddingCategory((v) => !v); setReviewNewCategory(""); }}
              className={`${btn.text} self-start`}
            >
              <Plus size={15} /> {addingCategory ? t("productRequest.field.categoryPickExisting") : t("productRequest.field.categoryAddNew")}
            </button>
          </div>
        </FormDialog>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("productRequest.deleteConfirmTitle")}
        message={t("productRequest.deleteConfirmBody")}
        confirmLabel={t("productRequest.delete")}
        danger
        busy={busy}
        summary={deleteTarget && (
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium text-foreground truncate">{deleteTarget.name}</span>
            <span className="text-[13px] text-[#3d5173] truncate">{requesterLine(deleteTarget)}</span>
          </span>
        )}
        onConfirm={() => void remove()}
        onCancel={() => setDeleteTarget(null)}
      />
      <PromptDialog
        open={rejectTarget !== null}
        title={t("productRequest.reject")}
        message={rejectTarget ? t("productRequest.rejectMessage").replace("{name}", rejectTarget.name).replace("{by}", rejectTarget.requestedByName) : undefined}
        label={t("productRequest.rejectPrompt")}
        confirmLabel={t("productRequest.reject")}
        multiline
        onConfirm={(value) => void submitReject(value)}
        onCancel={() => setRejectTarget(null)}
      />
      <Toast message={toast.message} />
    </div>
  );
}
