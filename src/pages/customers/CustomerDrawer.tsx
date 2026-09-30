import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, Loader2, Power } from "lucide-react";
import { type Customer, type CustomerDraft, emptyCustomerDraft } from "../../lib/customers";
import { Drawer } from "../../components/ui/Overlays";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field } from "../../components/ui/styles";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";
import { customerStatus, fmtCustomerDate } from "./customerDisplay";

// MoreMenu เปิดลงล่างเสมอ — ท้ายแผงติดขอบล่างจอ เมนูจึงต้องเปิดขึ้นบน

function toDraft(c: Customer | null): CustomerDraft {
  if (!c) return emptyCustomerDraft;
  const { companyName, contactName, phone, email, address, taxId, deliveryMethod, projectName, deliveryAddress, isActive,
    code, apContactName, apContactPhone, apContactEmail, billingConditions, requiresReport } = c;
  return { companyName, contactName, phone, email, address, taxId, deliveryMethod, projectName, deliveryAddress, isActive,
    code, apContactName, apContactPhone, apContactEmail, billingConditions, requiresReport };
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        {hint && <p className={field.help}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const Divider = () => <div className="h-px bg-[#eef1f6] flex-shrink-0" />;

// ที่อยู่ในใบเสนอราคาเป็นช่องบรรทัดเดียว — กล่องนี้ขึ้นหลายบรรทัดให้อ่านง่ายแต่ไม่รับการขึ้นบรรทัดใหม่
const blockEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Enter") e.preventDefault(); };
const oneLine = (v: string) => v.replace(/\r?\n/g, " ");

/**
 * แผงข้อมูลลูกค้า (ดีไซน์ใหม่ 2026-09-30) แทนกล่องฟอร์มกลางจอเดิม — สร้าง/แก้ไข/ดู ในแผงเดียว
 * ปิด/เปิดใช้งาน และเก็บถาวร อยู่ในเมนู "เพิ่มเติม" ท้ายแผง · ผู้ที่ไม่มีสิทธิ์แก้ไขเห็นแบบอ่านอย่างเดียว
 */
export function CustomerDrawer({ customer, canEdit, canArchive, locked, onSave, onClose, onToggleActive, onArchiveToggle }: {
  /** null = ลูกค้าใหม่ */
  customer: Customer | null;
  canEdit: boolean;
  canArchive: boolean;
  /** มีกล่องยืนยันซ้อนอยู่ด้านบน — กัน Escape/คลิกพื้นหลังปิดแผงไปพร้อมกัน */
  locked: boolean;
  onSave: (draft: CustomerDraft) => Promise<string | null>;
  onClose: () => void;
  onToggleActive: (c: Customer) => void;
  onArchiveToggle: (c: Customer) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CustomerDraft>(() => toDraft(customer));
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formId = useId();

  const set = <K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const input = (key: "companyName" | "contactName" | "phone" | "email" | "taxId" | "deliveryMethod" | "projectName") => ({
    id: `customer-${key}`,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.companyName.trim()) { setNameError(t("customers.form.error.companyName")); return; }
    setNameError(null);
    setError(null);
    setSaving(true);
    const err = await onSave(customer ? { ...draft, isActive: customer.isActive } : draft);
    setSaving(false);
    if (err) setError(err);
  };

  const st = customer ? customerStatus(customer, t) : null;
  const subtitle = customer && st ? (
    <span className="inline-flex items-center gap-2.5 flex-wrap">
      <StatusBadge status={st.status} label={st.label} />
      {t("customers.drawer.updated").replace("{date}", fmtCustomerDate(customer.updatedAt))}
    </span>
  ) : undefined;

  const footerLeft = customer ? (
    <div>
      <MoreMenu
        align="left"
        items={[
          canEdit && !customer.isDeleted && {
            key: "active",
            label: customer.isActive ? t("customers.action.deactivate") : t("customers.action.activate"),
            hint: customer.isActive ? t("customers.menu.deactivateHint") : undefined,
            icon: Power,
            onSelect: () => onToggleActive(customer),
          },
          canArchive && {
            key: "archive",
            label: customer.isDeleted ? t("common.unarchive") : t("common.archive"),
            hint: customer.isDeleted ? undefined : t("customers.menu.archiveHint"),
            icon: customer.isDeleted ? ArchiveRestore : Archive,
            danger: !customer.isDeleted,
            onSelect: () => onArchiveToggle(customer),
          },
        ]}
      />
    </div>
  ) : undefined;

  const footerRight = canEdit ? (
    <>
      <button type="button" onClick={onClose} disabled={saving} className={btn.secondary}>{t("common.cancel")}</button>
      <button type="submit" form={formId} disabled={saving} className={`${btn.primary} min-w-[88px]`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : t("customers.form.save")}
      </button>
    </>
  ) : (
    <button type="button" onClick={onClose} className={btn.secondary}>{t("common.close")}</button>
  );

  return (
    <Drawer
      open
      title={customer ? customer.companyName : t("customers.addNew")}
      subtitle={subtitle}
      onClose={onClose}
      busy={saving || locked}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      {canEdit ? (
        <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-6">
          {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}
          <Group title={t("customers.section.company")}>
            <Field label={t("quotation.field.clientName")} htmlFor="customer-companyName" required error={nameError}>
              <input {...input("companyName")} autoFocus={!customer} aria-invalid={!!nameError} className={`${field.input} w-full aria-invalid:border-[#b93636]`} />
            </Field>
            <Field label={t("quotation.field.taxId")} htmlFor="customer-taxId">
              <input {...input("taxId")} placeholder={t("quotation.field.taxIdPlaceholder")} className={`${field.input} w-full sm:w-60 font-mono`} />
            </Field>
            <Field label={t("quotation.field.address")} htmlFor="customer-address">
              <textarea
                id="customer-address"
                rows={2}
                value={draft.address}
                onKeyDown={blockEnter}
                onChange={(e) => set("address", oneLine(e.target.value))}
                placeholder={t("quotation.field.addressPlaceholder")}
                className={`${field.textarea} w-full resize-y`}
              />
            </Field>
          </Group>
          <Divider />
          <Group title={t("customers.section.contact")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("quotation.field.contactName")} htmlFor="customer-contactName">
                <input {...input("contactName")} placeholder={t("quotation.field.contactNamePlaceholder")} className={`${field.input} w-full`} />
              </Field>
              <Field label={t("quotation.field.contactPhone")} htmlFor="customer-phone">
                <input {...input("phone")} className={`${field.input} w-full`} />
              </Field>
            </div>
            <Field label={t("quotation.field.contactEmail")} htmlFor="customer-email">
              <input {...input("email")} className={`${field.input} w-full`} />
            </Field>
          </Group>
          <Divider />
          <Group title={t("customers.section.quoteDefaults")} hint={t("customers.section.quoteDefaultsHint")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("quotation.field.deliveryMethod")} htmlFor="customer-deliveryMethod">
                <input {...input("deliveryMethod")} placeholder={t("quotation.field.deliveryMethodPlaceholder")} className={`${field.input} w-full`} />
              </Field>
              <Field label={t("quotation.field.project")} htmlFor="customer-projectName">
                <input {...input("projectName")} className={`${field.input} w-full`} />
              </Field>
            </div>
            <Field label={t("quotation.field.deliveryAddress")} htmlFor="customer-deliveryAddress" help={t("customers.deliveryAddressHelp")}>
              <textarea
                id="customer-deliveryAddress"
                rows={2}
                value={draft.deliveryAddress}
                onKeyDown={blockEnter}
                onChange={(e) => set("deliveryAddress", oneLine(e.target.value))}
                placeholder={t("quotation.field.deliveryAddressPlaceholder")}
                className={`${field.textarea} w-full resize-y`}
              />
            </Field>
          </Group>
        </form>
      ) : customer ? (
        <div className="flex flex-col gap-6">
          <Group title={t("customers.section.company")}>
            <ReadonlyField label={t("quotation.field.clientName")} value={customer.companyName} />
            <ReadonlyField label={t("quotation.field.taxId")} value={customer.taxId} mono />
            <ReadonlyField label={t("quotation.field.address")} value={customer.address} />
          </Group>
          <Divider />
          <Group title={t("customers.section.contact")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ReadonlyField label={t("quotation.field.contactName")} value={customer.contactName} />
              <ReadonlyField label={t("quotation.field.contactPhone")} value={customer.phone} />
            </div>
            <ReadonlyField label={t("quotation.field.contactEmail")} value={customer.email} />
          </Group>
          <Divider />
          <Group title={t("customers.section.quoteDefaults")} hint={t("customers.section.quoteDefaultsHint")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ReadonlyField label={t("quotation.field.deliveryMethod")} value={customer.deliveryMethod} />
              <ReadonlyField label={t("quotation.field.project")} value={customer.projectName} />
            </div>
            <ReadonlyField label={t("quotation.field.deliveryAddress")} value={customer.deliveryAddress} />
          </Group>
        </div>
      ) : null}
    </Drawer>
  );
}
