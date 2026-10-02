import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, Ban, Check, CheckCircle2, Clock, FilePen, Loader2, Lock, Power, Send, XCircle } from "lucide-react";
import {
  type Vendor, type VendorDraft, emptyVendorDraft, vendorApprovalStatusOf, vendorBranchText,
  VENDOR_ACCOUNTING_FIELDS, VENDOR_PURCHASING_FIELDS, VENDOR_PAYMENT_TERM_OPTIONS, VENDOR_WHT_CATEGORY_OPTIONS, VENDOR_WHT_CONDITION_OPTIONS,
} from "../../lib/vendors";
import { type CodeEntry, fetchCodeEntries, codeComboboxOptions } from "../../lib/codeRegister";
import { RECEIVING_PRICE_TYPES, RECEIVING_PRICE_TYPE_LABEL_KEY } from "../../lib/receivingReport";
import { formatQuoteDateThai } from "../../lib/quotes";
import { Drawer } from "../../components/ui/Overlays";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field } from "../../components/ui/styles";
import { Combobox } from "../../components/Combobox";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n, type TranslationKey } from "../../lib/i18n";
import { TonePill } from "../purchaseOrder/purchasingUi";
import { vendorApprovalTone, vendorApprovalLabelKey } from "./vendorDisplay";

function toDraft(v: Vendor | null): VendorDraft {
  if (!v) return emptyVendorDraft();
  const out: Record<string, unknown> = { isActive: v.isActive };
  for (const f of [...VENDOR_PURCHASING_FIELDS, ...VENDOR_ACCOUNTING_FIELDS]) out[f] = v[f];
  return out as VendorDraft;
}

type TextKey = "name" | "nameEn" | "code" | "contactName" | "phone" | "taxId" | "postalCode"
  | "whtIncomeType" | "vendorType" | "shippingMethod" | "currency" | "discount";
type NumberKey = "branch" | "whtRate" | "vatRate" | "creditDays" | "creditLimit" | "openingBalance" | "advanceCheque";

const fmtMoney = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/**
 * แผงข้อมูลผู้ขาย (ดีไซน์ใหม่ 2026-09-30) แทนกล่องฟอร์มกลางจอเดิม — สร้าง/แก้ไข/ดู ในแผงเดียว
 *
 * - **การอนุมัติของบัญชี** (ส่งให้บัญชีอนุมัติ / อนุมัติ / ไม่อนุมัติ) ย้ายจากแถวในตารางมาเป็นแถบบนสุดของแผง
 *   ปุ่มยังผูกสิทธิ์เดิม: ส่ง = `vendor:edit` ของจัดซื้อ · อนุมัติ/ไม่อนุมัติ = `vendor:approve` ของบัญชี
 * - ช่องติ๊ก "ใช้งานอยู่" เดิม → "ปิดใช้งาน / เปิดใช้งาน" ในเมนูเพิ่มเติมท้ายแผง (บันทึกทันที ไม่ต้องกดบันทึก)
 * - เก็บถาวร/กู้คืน อยู่ในเมนูเดียวกัน
 * - **แบ่งสองส่วนตามฝ่าย (2026-10-02)** ตามหน้าจอโปรแกรมบัญชีเดิมที่เจ้าของส่งมา — ไม่ทำแท็บแบบโปรแกรมเดิม (เจ้าของตอบ):
 *   "ข้อมูลผู้ขาย" จัดซื้อกรอก (`vendor:edit`) · "ข้อมูลบัญชี" บัญชีกรอก (`vendor:approve`) จัดซื้อเห็นแต่แก้ไม่ได้ ·
 *   เซิร์ฟเวอร์กันซ้ำอีกชั้นจากช่องที่ค่าเปลี่ยนจริง · ยอดคงเหลือ/วันที่บิลล่าสุดคำนวณจากทะเบียนเจ้าหนี้ อ่านอย่างเดียว
 */
export function VendorDrawer({
  vendor, canEdit, canArchive, canApprove, locked, approvalBusy,
  onSave, onClose, onToggleActive, onArchiveToggle, onSubmitApproval, onApprove, onReject,
}: {
  /** null = ผู้ขายใหม่ */
  vendor: Vendor | null;
  canEdit: boolean;
  canArchive: boolean;
  /** `vendor:approve` — ฝ่ายบัญชี: อนุมัติผู้ขาย + กรอกส่วน "ข้อมูลบัญชี" */
  canApprove: boolean;
  /** มีกล่องยืนยันซ้อนอยู่ด้านบน — กัน Escape/คลิกพื้นหลังปิดแผงไปพร้อมกัน */
  locked: boolean;
  approvalBusy: boolean;
  onSave: (draft: VendorDraft) => Promise<string | null>;
  onClose: () => void;
  onToggleActive: (v: Vendor) => void;
  onArchiveToggle: (v: Vendor) => void;
  onSubmitApproval: (v: Vendor) => void;
  onApprove: (v: Vendor) => void;
  onReject: (v: Vendor) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<VendorDraft>(() => toDraft(vendor));
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [codes, setCodes] = useState<CodeEntry[]>([]);
  const formId = useId();
  // ผู้ขายที่ถูกเก็บถาวรแก้ไม่ได้ (เหมือนเดิมที่ปุ่มแก้ไขซ่อนสำหรับแถวที่เก็บถาวร) — กู้คืนก่อนแล้วค่อยแก้
  const archived = vendor?.isDeleted ?? false;
  const editPurchasing = canEdit && !archived;
  const editAccounting = canApprove && !archived;
  const editable = editPurchasing || editAccounting;

  // เลขที่บัญชีเลือกจากทะเบียนรหัสบัญชี (เจ้าของตอบ 2026-10-02) — โหลดเฉพาะคนที่แก้ส่วนบัญชีได้ · โหลดไม่ได้ก็พิมพ์เองได้
  useEffect(() => {
    if (!editAccounting) return;
    let cancelled = false;
    fetchCodeEntries().then((list) => { if (!cancelled) setCodes(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, [editAccounting]);

  const setText = (key: TextKey | "address" | "note" | "paymentTerms" | "whtCategory" | "whtCondition" | "accountCode", value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setNumber = (key: NumberKey, raw: string) =>
    setDraft((d) => ({ ...d, [key]: raw === "" ? (key === "branch" ? -1 : null) : Number(raw) }));

  /** ช่องข้อความ — แก้ได้ = input · แก้ไม่ได้ = ค่าแบบอ่านอย่างเดียว */
  const text = (key: TextKey, label: TranslationKey, canWrite: boolean, opts: { mono?: boolean; required?: boolean; help?: string; className?: string; error?: string | null } = {}) =>
    canWrite ? (
      <Field label={t(label)} htmlFor={`vendor-${key}`} required={opts.required} help={opts.help} error={opts.error} className={opts.className}>
        <input id={`vendor-${key}`} value={(draft[key] as string | undefined) ?? ""} disabled={saving} aria-invalid={!!opts.error}
          autoFocus={key === "name" && !vendor}
          onChange={(e) => setText(key, e.target.value)}
          className={`${field.input} w-full ${opts.mono ? "font-mono" : ""} aria-invalid:border-[#b93636]`} />
      </Field>
    ) : (
      <ReadonlyField label={t(label)} value={(draft[key] as string | undefined) ?? ""} mono={opts.mono} className={opts.className} />
    );
  const number = (key: NumberKey, label: TranslationKey, canWrite: boolean, opts: { money?: boolean; help?: string; step?: string } = {}) => {
    const value = draft[key] as number | null | undefined;
    const shown = key === "branch" && (value === -1 || value === undefined) ? null : value;
    return canWrite ? (
      <Field label={t(label)} htmlFor={`vendor-${key}`} help={opts.help}>
        <input id={`vendor-${key}`} type="number" step={opts.step ?? "any"} value={fmtNum(shown)} disabled={saving}
          onChange={(e) => setNumber(key, e.target.value)}
          className={`${field.input} w-full text-right tabular-nums`} />
      </Field>
    ) : (
      <ReadonlyField label={t(label)} value={key === "branch" ? vendorBranchText(value) : opts.money ? fmtMoney(shown) : fmtNum(shown)} />
    );
  };
  const combo = (key: "paymentTerms" | "whtCategory" | "whtCondition" | "accountCode", label: TranslationKey, canWrite: boolean,
    options: { value: string; label: string; hint?: string }[], opts: { mono?: boolean; help?: string } = {}) =>
    canWrite ? (
      <Field label={t(label)} htmlFor={`vendor-${key}`} help={opts.help}>
        <Combobox id={`vendor-${key}`} value={(draft[key] as string | undefined) ?? ""} onChange={(next) => setText(key, next)}
          options={options} disabled={saving} ariaLabel={t(label)}
          className={`${field.input} w-full ${opts.mono ? "font-mono" : ""}`} />
      </Field>
    ) : (
      <ReadonlyField label={t(label)} value={(draft[key] as string | undefined) ?? ""} mono={opts.mono} />
    );
  const asOptions = (xs: readonly string[]) => xs.map((x) => ({ value: x, label: x }));

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (editPurchasing && !draft.name.trim()) { setNameError(t("vendors.form.nameRequired")); return; }
    setNameError(null);
    setError(null);
    setSaving(true);
    // สถานะเปิด/ปิดใช้งานเปลี่ยนจากเมนูเท่านั้น — ส่งค่าปัจจุบันของผู้ขายไป ไม่ให้ฟอร์มเก่าทับ
    // ส่งทั้งชุด: เซิร์ฟเวอร์ตัดสินสิทธิ์จากช่องที่ค่าเปลี่ยนจริง ช่องที่แก้ไม่ได้ส่งค่าเดิมกลับไปจึงไม่ติด
    const err = await onSave(vendor ? { ...draft, isActive: vendor.isActive } : draft);
    setSaving(false);
    if (err) setError(err);
  };

  const subtitle = vendor ? (
    <span className="inline-flex items-center gap-2 flex-wrap mt-1">
      {vendor.code && <span className="font-mono text-[13px] text-[#3d5173]">{vendor.code}</span>}
      <StatusBadge
        status={vendor.isDeleted ? "archived" : vendor.isActive ? "active" : "inactive"}
        label={t(vendor.isDeleted ? "vendors.status.archived" : vendor.isActive ? "vendors.status.active" : "vendors.status.inactive")}
      />
      {!vendor.isActive && vendor.inactiveAt && (
        <span className="text-xs text-muted-foreground">{t("vendors.form.inactiveSince").replace("{date}", formatQuoteDateThai(vendor.inactiveAt))}</span>
      )}
      {!vendor.isDeleted && (
        <TonePill tone={vendorApprovalTone[vendorApprovalStatusOf(vendor)]} label={t(vendorApprovalLabelKey[vendorApprovalStatusOf(vendor)])} />
      )}
    </span>
  ) : undefined;

  const footerLeft = vendor ? (
    <MoreMenu
      align="left"
      items={[
        editPurchasing && {
          key: "active",
          label: vendor.isActive ? t("vendors.action.deactivate") : t("vendors.action.activate"),
          hint: vendor.isActive ? t("vendors.menu.deactivateHint") : undefined,
          icon: Power,
          onSelect: () => onToggleActive(vendor),
        },
        canArchive && {
          key: "archive",
          label: vendor.isDeleted ? t("vendors.confirmRestore.title") : t("vendors.confirmArchive.title"),
          hint: vendor.isDeleted ? undefined : t("vendors.menu.archiveHint"),
          icon: vendor.isDeleted ? ArchiveRestore : Archive,
          danger: !vendor.isDeleted,
          onSelect: () => onArchiveToggle(vendor),
        },
      ]}
    />
  ) : undefined;

  const footerRight = editable ? (
    <>
      <button type="button" onClick={onClose} disabled={saving} className={btn.secondary}>{t("common.cancel")}</button>
      <button type="submit" form={formId} disabled={saving} className={`${btn.primary} min-w-[88px]`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : t("common.save")}
      </button>
    </>
  ) : (
    <button type="button" onClick={onClose} className={btn.secondary}>{t("common.close")}</button>
  );

  const sub = (title: TranslationKey) => <h4 className="text-[13px] font-semibold text-[#3d5173] mt-1">{t(title)}</h4>;
  const grid = "grid grid-cols-1 sm:grid-cols-2 gap-4 items-start";
  const priceTypeValue = draft.priceType ?? "";

  const body = (
    <>
      {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}

      {/* ── ส่วนของจัดซื้อ ── */}
      <section className="flex flex-col gap-4" aria-labelledby="vendor-section-info">
        <div className="flex flex-col gap-0.5">
          <h3 id="vendor-section-info" className="text-[15px] font-semibold text-foreground">{t("vendors.section.info")}</h3>
          <p className={field.help}>{t("vendors.section.infoHint")}</p>
        </div>
        {text("name", "vendors.form.name", editPurchasing, { required: true, error: nameError })}
        {text("nameEn", "vendors.form.nameEn", editPurchasing)}
        <div className={grid}>
          {text("code", "vendors.form.code", editPurchasing, { mono: true, help: editPurchasing ? t("vendors.form.codeHint") : undefined })}
          {text("taxId", "vendors.form.taxId", editPurchasing, { mono: true })}
        </div>
        <div className={grid}>
          {number("branch", "vendors.form.branch", editPurchasing, { step: "1", help: t("vendors.form.branchHint") })}
          {text("postalCode", "vendors.form.postalCode", editPurchasing, { mono: true })}
        </div>
        {editPurchasing ? (
          <Field label={t("vendors.form.address")} htmlFor="vendor-address" help={t("vendors.form.addressHint")}>
            <textarea id="vendor-address" rows={3} disabled={saving} value={draft.address}
              onChange={(e) => setText("address", e.target.value)} className={`${field.textarea} w-full resize-y`} />
          </Field>
        ) : (
          <ReadonlyField label={t("vendors.form.address")} value={draft.address ? <span className="whitespace-pre-line">{draft.address}</span> : ""} />
        )}
        <div className={grid}>
          {text("contactName", "vendors.form.contactName", editPurchasing)}
          {text("phone", "vendors.form.phone", editPurchasing)}
        </div>
        {combo("paymentTerms", "vendors.form.paymentTerms", editPurchasing, asOptions(VENDOR_PAYMENT_TERM_OPTIONS), { help: editPurchasing ? t("vendors.form.paymentTermsHint") : undefined })}
        {editPurchasing ? (
          <Field label={t("vendors.form.note")} htmlFor="vendor-note">
            <textarea id="vendor-note" rows={2} disabled={saving} value={draft.note}
              onChange={(e) => setText("note", e.target.value)} className={`${field.textarea} w-full resize-y`} />
          </Field>
        ) : (
          <ReadonlyField label={t("vendors.form.note")} value={draft.note ? <span className="whitespace-pre-line">{draft.note}</span> : ""} />
        )}
      </section>

      <div className="h-px bg-[#eef1f6]" />

      {/* ── ส่วนของบัญชี — จัดซื้อเห็นแต่แก้ไม่ได้ ── */}
      <section className="flex flex-col gap-4" aria-labelledby="vendor-section-accounting">
        <div className="flex flex-col gap-0.5">
          <h3 id="vendor-section-accounting" className="text-[15px] font-semibold text-foreground inline-flex items-center gap-2">
            {t("vendors.section.accounting")}
            {!editAccounting && <Lock size={14} className="text-muted-foreground" aria-hidden="true" />}
          </h3>
          <p className={field.help}>{t(editAccounting ? "vendors.section.accountingHint" : "vendors.section.accountingLockedHint")}</p>
        </div>

        {sub("vendors.sub.wht")}
        <div className={grid}>
          {text("whtIncomeType", "vendors.form.whtIncomeType", editAccounting)}
          {number("whtRate", "vendors.form.whtRate", editAccounting)}
          {combo("whtCategory", "vendors.form.whtCategory", editAccounting, asOptions(VENDOR_WHT_CATEGORY_OPTIONS))}
          {combo("whtCondition", "vendors.form.whtCondition", editAccounting, asOptions(VENDOR_WHT_CONDITION_OPTIONS))}
        </div>

        {sub("vendors.sub.purchase")}
        <div className={grid}>
          {text("vendorType", "vendors.form.vendorType", editAccounting, { help: editAccounting ? t("vendors.form.vendorTypeHint") : undefined })}
          {combo("accountCode", "vendors.form.accountCode", editAccounting, codeComboboxOptions(codes, "account"), { mono: true })}
          {editAccounting ? (
            <Field label={t("vendors.form.priceType")} htmlFor="vendor-priceType">
              <select id="vendor-priceType" value={priceTypeValue} disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, priceType: e.target.value as VendorDraft["priceType"] }))}
                className={`${field.input} w-full`}>
                <option value="">{t("vendors.form.notSet")}</option>
                {RECEIVING_PRICE_TYPES.map((p) => <option key={p} value={p}>{t(RECEIVING_PRICE_TYPE_LABEL_KEY[p])}</option>)}
              </select>
            </Field>
          ) : (
            <ReadonlyField label={t("vendors.form.priceType")} value={priceTypeValue ? t(RECEIVING_PRICE_TYPE_LABEL_KEY[priceTypeValue]) : ""} />
          )}
          {number("vatRate", "vendors.form.vatRate", editAccounting)}
          {text("shippingMethod", "vendors.form.shippingMethod", editAccounting)}
          {number("creditDays", "vendors.form.creditDays", editAccounting, { step: "1" })}
          {text("currency", "vendors.form.currency", editAccounting, { mono: true })}
          {text("discount", "vendors.form.discount", editAccounting)}
        </div>

        {sub("vendors.sub.balance")}
        <div className={grid}>
          {number("creditLimit", "vendors.form.creditLimit", editAccounting, { money: true })}
          {number("openingBalance", "vendors.form.openingBalance", editAccounting, { money: true })}
          {number("advanceCheque", "vendors.form.advanceCheque", editAccounting, { money: true })}
        </div>
        {vendor && (
          <div className="rounded-xl bg-[#f8f9fc] border border-border px-4 py-3 flex flex-col gap-3">
            <div className={grid}>
              <ReadonlyField label={t("vendors.form.balance")} value={vendor.balance === null || vendor.balance === undefined ? "" : `฿${fmtMoney(vendor.balance)}`} />
              <ReadonlyField label={t("vendors.form.lastBillDate")} value={vendor.lastBillDate ? formatQuoteDateThai(vendor.lastBillDate) : ""} />
            </div>
            <p className="text-xs text-muted-foreground">{t(vendor.balance === null || vendor.balance === undefined ? "vendors.form.balanceNoAccess" : "vendors.form.balanceHint")}</p>
          </div>
        )}
      </section>
    </>
  );

  return (
    <Drawer
      open
      wide
      title={vendor ? vendor.name : t("vendors.form.createTitle")}
      subtitle={subtitle}
      onClose={onClose}
      busy={saving || locked}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      <div className="flex flex-col gap-5">
        {/* ขั้นอนุมัติของบัญชี (2026-09-21) — ผู้ขายที่ถูกเก็บถาวรไม่ต้องเดินขั้นนี้ ไม่มีใครเอาไปใช้บนใบสั่งซื้อได้อยู่แล้ว */}
        {vendor && !vendor.isDeleted && (
          <ApprovalBanner
            vendor={vendor}
            canEdit={canEdit}
            canApprove={canApprove}
            busy={approvalBusy}
            onSubmit={() => onSubmitApproval(vendor)}
            onApprove={() => onApprove(vendor)}
            onReject={() => onReject(vendor)}
          />
        )}

        {editable ? (
          <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-5">{body}</form>
        ) : vendor ? (
          <div className="flex flex-col gap-5">{body}</div>
        ) : null}
      </div>
    </Drawer>
  );
}

const BANNER_TONE = {
  draft: { box: "bg-[#f8f9fc] border-border text-[#3d5173]", icon: FilePen },
  pendingApproval: { box: "bg-[#fdf3e0] border-[#efd3a0] text-[#8a5a00]", icon: Clock },
  approved: { box: "bg-[#e6f4ec] border-[#bfe0cc] text-[#1b7f4f]", icon: CheckCircle2 },
  rejected: { box: "bg-[#fcebeb] border-[#f1c9c9] text-[#b93636]", icon: XCircle },
} as const;

/**
 * แถบ "การอนุมัติของบัญชี" บนสุดของแผง — ป้ายสถานะ + ปุ่มของขั้นถัดไปในแถบเดียว (แทนปุ่มเล็กในแถวตารางเดิม)
 * ส่ง = จัดซื้อ (ร่าง/ถูกตีกลับ) · อนุมัติ/ไม่อนุมัติ = บัญชี (รออนุมัติ)
 */
function ApprovalBanner({ vendor, canEdit, canApprove, busy, onSubmit, onApprove, onReject }: {
  vendor: Vendor;
  canEdit: boolean;
  canApprove: boolean;
  busy: boolean;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useI18n();
  const stage = vendorApprovalStatusOf(vendor);
  const tone = BANNER_TONE[stage];
  const Icon = tone.icon;
  const smallBtn = "h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-[#c3ccda] bg-white text-[13px] transition-colors disabled:opacity-60 whitespace-nowrap";
  let actions: ReactNode = null;
  if (busy) {
    actions = <Loader2 size={16} className="animate-spin" aria-label={t("common.loading")} />;
  } else if (canApprove && stage === "pendingApproval") {
    actions = (
      <>
        <button type="button" onClick={onReject} className={`${smallBtn} font-medium text-[#b93636] hover:bg-[#fcebeb]`}>
          <Ban size={14} /> {t("vendors.approval.reject")}
        </button>
        <button type="button" onClick={onApprove} className={`${smallBtn} font-semibold text-[#1b7f4f] hover:bg-[#e6f4ec]`}>
          <Check size={14} /> {t("vendors.approval.approve")}
        </button>
      </>
    );
  } else if (canEdit && (stage === "draft" || stage === "rejected")) {
    actions = (
      <button type="button" onClick={onSubmit} className={`${smallBtn} font-semibold text-foreground hover:bg-[#f4f6fa]`}>
        <Send size={14} /> {t("vendors.approval.submit")}
      </button>
    );
  }
  return (
    <section aria-labelledby="vendor-approval-title" className={`px-4 py-3.5 border rounded-xl flex flex-col gap-1.5 ${tone.box}`}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Icon size={16} className="flex-shrink-0" aria-hidden="true" />
        <h3 id="vendor-approval-title" className="flex-1 min-w-0 text-sm font-semibold">
          {t("vendors.approval.col")}: {t(vendorApprovalLabelKey[stage])}
        </h3>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {stage === "rejected" && (vendor.rejectionComment ?? "").trim() && (
        <p className="pl-[26px] text-[13px] leading-relaxed font-medium">{vendor.rejectionComment}</p>
      )}
      {stage !== "approved" && <p className="pl-[26px] text-[13px] leading-relaxed">{t("vendors.approval.hint")}</p>}
    </section>
  );
}
