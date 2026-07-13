import { useState } from "react";
import { ChevronRight, Save, X, Plus, Trash2, Image as ImageIcon, Stamp, Landmark } from "lucide-react";
import type { CompanyProfile, CompanyProfileDraft, BankAccount } from "../../../lib/companyProfiles";
import { emptyCompanyProfileDraft, newBankAccountId } from "../../../lib/companyProfiles";
import { ImageUploadField } from "../../../components/ImageUploadField";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { useI18n } from "../../../lib/i18n";

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors";
const labelCls = "text-xs text-muted-foreground block mb-1.5";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_PATTERN = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const TAX_ID_PATTERN = /^\d{13}$/;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
      {children}
    </div>
  );
}

function draftFromProfile(p: CompanyProfile): CompanyProfileDraft {
  return {
    companyCode: p.companyCode, companyNameTh: p.companyNameTh, companyNameEn: p.companyNameEn, displayName: p.displayName,
    logoDataUrl: p.logoDataUrl, addressTh: p.addressTh, addressEn: p.addressEn, taxId: p.taxId,
    branchName: p.branchName, branchCode: p.branchCode, phone: p.phone, fax: p.fax, email: p.email, website: p.website,
    bankAccounts: p.bankAccounts, quotationPrefix: p.quotationPrefix, quotationNumberFormat: p.quotationNumberFormat,
    quotationTerms: p.quotationTerms, quotationFooter: p.quotationFooter, stampDataUrl: p.stampDataUrl,
    signatureLabel: p.signatureLabel, isActive: p.isActive,
  };
}

export function CompanyProfileForm({
  mode,
  initial,
  existingCodes,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: CompanyProfile;
  existingCodes: string[];
  onSave: (draft: CompanyProfileDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const startingDraft = initial ? draftFromProfile(initial) : emptyCompanyProfileDraft;
  const [draft, setDraft] = useState<CompanyProfileDraft>(startingDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(startingDraft);
  const set = <K extends keyof CompanyProfileDraft>(key: K, value: CompanyProfileDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const addBankAccount = () => {
    const account: BankAccount = { id: newBankAccountId(), bankName: "", accountName: "", accountNumber: "", branch: "", isDefault: draft.bankAccounts.length === 0 };
    set("bankAccounts", [...draft.bankAccounts, account]);
  };
  const updateBankAccount = (id: string, patch: Partial<BankAccount>) => {
    set("bankAccounts", draft.bankAccounts.map((a) => {
      if (a.id !== id) return patch.isDefault ? { ...a, isDefault: false } : a;
      return { ...a, ...patch };
    }));
  };
  const removeBankAccount = (id: string) => set("bankAccounts", draft.bankAccounts.filter((a) => a.id !== id));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!draft.companyNameTh.trim()) e.companyNameTh = t("companyProfiles.form.error.companyNameTh");
    if (!draft.companyCode.trim()) e.companyCode = t("companyProfiles.form.error.companyCode");
    else if (existingCodes.includes(draft.companyCode.trim().toUpperCase())) e.companyCode = t("companyProfiles.form.error.companyCodeTaken");
    if (draft.taxId.trim() && !TAX_ID_PATTERN.test(draft.taxId.trim())) e.taxId = t("companyProfiles.form.error.taxId");
    if (draft.email.trim() && !EMAIL_PATTERN.test(draft.email.trim())) e.email = t("companyProfiles.form.error.email");
    if (draft.website.trim() && !WEBSITE_PATTERN.test(draft.website.trim())) e.website = t("companyProfiles.form.error.website");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    const error = await onSave({ ...draft, companyCode: draft.companyCode.trim().toUpperCase(), companyNameTh: draft.companyNameTh.trim() });
    setSaving(false);
    if (error) setErrors((prev) => ({ ...prev, companyCode: error }));
  };

  const handleCancel = () => {
    if (isDirty) { setConfirmDiscard(true); return; }
    onCancel();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <button onClick={handleCancel} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("companyProfiles.breadcrumb")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
          {mode === "create" ? t("companyProfiles.addNew") : t("companyProfiles.form.editTitle")}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <X size={13} /> {t("common.cancel")}
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60">
            <Save size={13} /> {t("companyProfiles.form.save")}
          </button>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <Section title={t("companyProfiles.form.section.basic")}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("companyProfiles.form.companyCode")} <span className="text-[#e05252]">*</span></label>
              <input className={`${inputCls} font-mono`} value={draft.companyCode} onChange={(e) => set("companyCode", e.target.value)} placeholder={t("companyProfiles.form.companyCodePlaceholder")} />
              {errors.companyCode && <p className="text-xs text-[#e05252] mt-1">{errors.companyCode}</p>}
            </div>
            <div>
              <label className={labelCls}>{t("companyProfiles.form.taxId")}</label>
              <input className={`${inputCls} font-mono`} value={draft.taxId} onChange={(e) => set("taxId", e.target.value)} placeholder={t("companyProfiles.form.taxIdPlaceholder")} maxLength={13} />
              {errors.taxId && <p className="text-xs text-[#e05252] mt-1">{errors.taxId}</p>}
            </div>
          </div>
          <div>
            <label className={labelCls}>{t("companyProfiles.form.companyNameTh")} <span className="text-[#e05252]">*</span></label>
            <input className={inputCls} value={draft.companyNameTh} onChange={(e) => set("companyNameTh", e.target.value)} placeholder={t("companyProfiles.form.companyNameThPlaceholder")} />
            {errors.companyNameTh && <p className="text-xs text-[#e05252] mt-1">{errors.companyNameTh}</p>}
          </div>
          <div>
            <label className={labelCls}>{t("companyProfiles.form.companyNameEn")}</label>
            <input className={inputCls} value={draft.companyNameEn} onChange={(e) => set("companyNameEn", e.target.value)} placeholder={t("companyProfiles.form.companyNameEnPlaceholder")} />
          </div>
          <div>
            <label className={labelCls}>{t("companyProfiles.form.displayName")}</label>
            <input className={inputCls} value={draft.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder={t("companyProfiles.form.displayNamePlaceholder")} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("companyProfiles.form.branchName")}</label>
              <input className={inputCls} value={draft.branchName} onChange={(e) => set("branchName", e.target.value)} placeholder={t("companyProfiles.form.branchNamePlaceholder")} />
            </div>
            <div>
              <label className={labelCls}>{t("companyProfiles.form.branchCode")}</label>
              <input className={`${inputCls} font-mono`} value={draft.branchCode} onChange={(e) => set("branchCode", e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-foreground pt-1">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
            {t("companyProfiles.form.active")}
          </label>
        </Section>

        <Section title={t("companyProfiles.form.section.contact")}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("companyProfiles.form.addressTh")}</label>
              <textarea rows={3} className={`${inputCls} resize-none leading-relaxed`} value={draft.addressTh} onChange={(e) => set("addressTh", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{t("companyProfiles.form.addressEn")}</label>
              <textarea rows={3} className={`${inputCls} resize-none leading-relaxed`} value={draft.addressEn} onChange={(e) => set("addressEn", e.target.value)} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("companyProfiles.form.phone")}</label>
              <input className={inputCls} value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{t("companyProfiles.form.fax")}</label>
              <input className={inputCls} value={draft.fax} onChange={(e) => set("fax", e.target.value)} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("companyProfiles.form.email")}</label>
              <input type="email" className={inputCls} value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="info@company.co.th" />
              {errors.email && <p className="text-xs text-[#e05252] mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className={labelCls}>{t("companyProfiles.form.website")}</label>
              <input className={inputCls} value={draft.website} onChange={(e) => set("website", e.target.value)} placeholder="https://www.company.co.th" />
              {errors.website && <p className="text-xs text-[#e05252] mt-1">{errors.website}</p>}
            </div>
          </div>
        </Section>

        <Section title={t("companyProfiles.form.section.document")}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("companyProfiles.form.quotationPrefix")}</label>
              <input className={`${inputCls} font-mono`} value={draft.quotationPrefix} onChange={(e) => set("quotationPrefix", e.target.value)} placeholder="QT-" />
            </div>
            <div>
              <label className={labelCls}>{t("companyProfiles.form.quotationNumberFormat")}</label>
              <input className={`${inputCls} font-mono`} value={draft.quotationNumberFormat} onChange={(e) => set("quotationNumberFormat", e.target.value)} placeholder="{prefix}{year}-{seq}" />
            </div>
          </div>
          <div>
            <label className={labelCls}>{t("companyProfiles.form.quotationTerms")}</label>
            <textarea rows={3} className={`${inputCls} resize-none leading-relaxed`} value={draft.quotationTerms} onChange={(e) => set("quotationTerms", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{t("companyProfiles.form.quotationFooter")}</label>
            <textarea rows={2} className={`${inputCls} resize-none leading-relaxed`} value={draft.quotationFooter} onChange={(e) => set("quotationFooter", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{t("companyProfiles.form.signatureLabel")}</label>
            <input className={inputCls} value={draft.signatureLabel} onChange={(e) => set("signatureLabel", e.target.value)} placeholder={t("companyProfiles.form.signatureLabelPlaceholder")} />
          </div>
        </Section>

        <Section title={t("companyProfiles.form.section.branding")}>
          <div className="grid sm:grid-cols-2 gap-4">
            <ImageUploadField label={t("companyProfiles.form.logoLabel")} icon={ImageIcon} value={draft.logoDataUrl} onChange={(v) => set("logoDataUrl", v)} aspect="wide" />
            <ImageUploadField label={t("companyProfiles.form.stampLabel")} icon={Stamp} value={draft.stampDataUrl} onChange={(v) => set("stampDataUrl", v)} />
          </div>
        </Section>

        <Section title={t("companyProfiles.form.section.bank")}>
          {draft.bankAccounts.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t("companyProfiles.form.bankEmpty")}</p>
          ) : (
            <div className="space-y-3">
              {draft.bankAccounts.map((acc) => (
                <div key={acc.id} className="border border-border rounded-lg p-3 space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t("companyProfiles.form.bankName")}</label>
                      <input className={inputCls} value={acc.bankName} onChange={(e) => updateBankAccount(acc.id, { bankName: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("companyProfiles.form.bankAccountName")}</label>
                      <input className={inputCls} value={acc.accountName} onChange={(e) => updateBankAccount(acc.id, { accountName: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>{t("companyProfiles.form.bankAccountNumber")}</label>
                      <input className={`${inputCls} font-mono`} value={acc.accountNumber} onChange={(e) => updateBankAccount(acc.id, { accountNumber: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelCls}>{t("companyProfiles.form.bankBranch")}</label>
                      <input className={inputCls} value={acc.branch} onChange={(e) => updateBankAccount(acc.id, { branch: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted-foreground">
                      <input type="checkbox" checked={acc.isDefault} onChange={(e) => updateBankAccount(acc.id, { isDefault: e.target.checked })} className="w-4 h-4 rounded border-border accent-[#c9a84c]" />
                      {t("companyProfiles.form.bankDefault")}
                    </label>
                    <button type="button" onClick={() => removeBankAccount(acc.id)} className="flex items-center gap-1 text-xs text-[#e05252] hover:underline">
                      <Trash2 size={12} /> {t("companyProfiles.form.bankRemove")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addBankAccount} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <Plus size={13} /> {t("companyProfiles.form.bankAdd")}
          </button>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border">
            <Landmark size={11} /> {t("companyProfiles.form.bankHint")}
          </p>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title={t("companyProfiles.form.discardTitle")}
        message={t("companyProfiles.form.discardMessage")}
        confirmLabel={t("companyProfiles.form.discardConfirm")}
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); onCancel(); }}
      />
    </div>
  );
}
