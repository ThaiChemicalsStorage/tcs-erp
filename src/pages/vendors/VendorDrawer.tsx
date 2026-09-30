import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, Ban, Check, CheckCircle2, Clock, FilePen, Loader2, Power, Send, XCircle } from "lucide-react";
import { type Vendor, type VendorDraft, emptyVendorDraft, vendorApprovalStatusOf } from "../../lib/vendors";
import { Drawer } from "../../components/ui/Overlays";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field } from "../../components/ui/styles";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";
import { TonePill } from "../purchaseOrder/purchasingUi";
import { vendorApprovalTone, vendorApprovalLabelKey } from "./vendorDisplay";

function toDraft(v: Vendor | null): VendorDraft {
  if (!v) return emptyVendorDraft();
  const { name, code, contactName, phone, taxId, address, note, isActive } = v;
  return { name, code, contactName, phone, taxId, address, note, isActive };
}

/**
 * แผงข้อมูลผู้ขาย (ดีไซน์ใหม่ 2026-09-30) แทนกล่องฟอร์มกลางจอเดิม — สร้าง/แก้ไข/ดู ในแผงเดียว
 *
 * - **การอนุมัติของบัญชี** (ส่งให้บัญชีอนุมัติ / อนุมัติ / ไม่อนุมัติ) ย้ายจากแถวในตารางมาเป็นแถบบนสุดของแผง
 *   ปุ่มยังผูกสิทธิ์เดิม: ส่ง = `vendor:edit` ของจัดซื้อ · อนุมัติ/ไม่อนุมัติ = `vendor:approve` ของบัญชี
 * - ช่องติ๊ก "ใช้งานอยู่" เดิม → "ปิดใช้งาน / เปิดใช้งาน" ในเมนูเพิ่มเติมท้ายแผง (บันทึกทันที ไม่ต้องกดบันทึก)
 * - เก็บถาวร/กู้คืน อยู่ในเมนูเดียวกัน · ผู้ที่ไม่มีสิทธิ์แก้ไข (เช่นบัญชี) เห็นข้อมูลแบบอ่านอย่างเดียว
 */
export function VendorDrawer({
  vendor, canEdit, canArchive, canApprove, locked, approvalBusy,
  onSave, onClose, onToggleActive, onArchiveToggle, onSubmitApproval, onApprove, onReject,
}: {
  /** null = ผู้ขายใหม่ */
  vendor: Vendor | null;
  canEdit: boolean;
  canArchive: boolean;
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
  const formId = useId();
  // ผู้ขายที่ถูกเก็บถาวรแก้ไม่ได้ (เหมือนเดิมที่ปุ่มแก้ไขซ่อนสำหรับแถวที่เก็บถาวร) — กู้คืนก่อนแล้วค่อยแก้
  const editable = canEdit && !(vendor?.isDeleted ?? false);

  const input = (key: "name" | "code" | "contactName" | "phone" | "taxId") => ({
    id: `vendor-${key}`,
    value: draft[key],
    disabled: saving,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value })),
  });

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.name.trim()) { setNameError(t("vendors.form.nameRequired")); return; }
    setNameError(null);
    setError(null);
    setSaving(true);
    // สถานะเปิด/ปิดใช้งานเปลี่ยนจากเมนูเท่านั้น — ส่งค่าปัจจุบันของผู้ขายไป ไม่ให้ฟอร์มเก่าทับ
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
      {!vendor.isDeleted && (
        <TonePill tone={vendorApprovalTone[vendorApprovalStatusOf(vendor)]} label={t(vendorApprovalLabelKey[vendorApprovalStatusOf(vendor)])} />
      )}
    </span>
  ) : undefined;

  const footerLeft = vendor ? (
    <MoreMenu
      align="left"
      items={[
        editable && {
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

  return (
    <Drawer
      open
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
          <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-4">
            {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}
            <h3 className="text-[15px] font-semibold text-foreground">{t("vendors.section.info")}</h3>
            <Field label={t("vendors.form.name")} htmlFor="vendor-name" required error={nameError}>
              <input {...input("name")} autoFocus={!vendor} aria-invalid={!!nameError} className={`${field.input} w-full aria-invalid:border-[#b93636]`} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <Field label={t("vendors.form.code")} htmlFor="vendor-code" help={t("vendors.form.codeHint")}>
                <input {...input("code")} className={`${field.input} w-full font-mono`} />
              </Field>
              <Field label={t("vendors.form.taxId")} htmlFor="vendor-taxId">
                <input {...input("taxId")} className={`${field.input} w-full font-mono`} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <Field label={t("vendors.form.contactName")} htmlFor="vendor-contactName">
                <input {...input("contactName")} className={`${field.input} w-full`} />
              </Field>
              <Field label={t("vendors.form.phone")} htmlFor="vendor-phone">
                <input {...input("phone")} className={`${field.input} w-full`} />
              </Field>
            </div>
            <Field label={t("vendors.form.address")} htmlFor="vendor-address">
              <textarea
                id="vendor-address" rows={2} disabled={saving} value={draft.address}
                onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                className={`${field.textarea} w-full resize-y`}
              />
            </Field>
            <Field label={t("vendors.form.note")} htmlFor="vendor-note">
              <textarea
                id="vendor-note" rows={2} disabled={saving} value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                className={`${field.textarea} w-full resize-y`}
              />
            </Field>
          </form>
        ) : vendor ? (
          <section className="flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold text-foreground">{t("vendors.section.info")}</h3>
            <ReadonlyField label={t("vendors.form.name")} value={vendor.name} />
            <div className="grid grid-cols-2 gap-4">
              <ReadonlyField label={t("vendors.form.code")} value={vendor.code} mono />
              <ReadonlyField label={t("vendors.form.taxId")} value={vendor.taxId} mono />
              <ReadonlyField label={t("vendors.form.contactName")} value={vendor.contactName} />
              <ReadonlyField label={t("vendors.form.phone")} value={vendor.phone} />
            </div>
            <ReadonlyField label={t("vendors.form.address")} value={vendor.address} />
            <ReadonlyField label={t("vendors.form.note")} value={vendor.note ? <span className="whitespace-pre-line">{vendor.note}</span> : ""} />
          </section>
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
