import { ChevronRight, Pencil, Star, Building2, Stamp } from "lucide-react";
import type { CompanyProfile } from "../../../lib/companyProfiles";
import type { User } from "../../../lib/users";
import { useI18n } from "../../../lib/i18n";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-border/40 last:border-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground col-span-2 break-words">{value || "—"}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-1">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-2" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{title}</h2>
      {children}
    </div>
  );
}

export function CompanyProfileDetail({
  profile,
  users,
  canEdit,
  onEdit,
  onBack,
}: {
  profile: CompanyProfile;
  users: User[];
  canEdit: boolean;
  onEdit: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  // 2026-07-13, Codex review (Medium): "the detail screen renders timestamps but not the stored
  // createdBy/updatedBy identities" — resolve the stored user IDs to display names. Falls back to
  // the raw ID if the user record is gone (deleted account) rather than hiding the field.
  const userName = (userId: string) => users.find((u) => u.id === userId)?.fullName || userId || "—";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> {t("companyProfiles.breadcrumb")}
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
          {profile.displayName || profile.companyNameTh}
        </span>
        {canEdit && (
          <button onClick={onEdit} className="ml-auto flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Pencil size={13} /> {t("common.edit")}
          </button>
        )}
      </div>

      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-4">
          <div className="w-24 h-16 flex items-center justify-center bg-secondary border border-border rounded-lg overflow-hidden flex-shrink-0">
            {profile.logoDataUrl ? <img src={profile.logoDataUrl} alt={`${t("companyProfiles.form.logoLabel")} — ${profile.companyNameTh}`} className="w-full h-full object-contain" /> : <Building2 size={22} className="text-muted-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-foreground truncate" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{profile.companyNameTh}</p>
            {profile.companyNameEn && <p className="text-sm text-muted-foreground truncate">{profile.companyNameEn}</p>}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs font-mono text-[#c9a84c]">{profile.companyCode}</span>
              {profile.isDefault && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20">
                  <Star size={9} className="fill-[#c9a84c]" /> {t("companyProfiles.badge.default")}
                </span>
              )}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                profile.isDeleted ? "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20"
                : profile.isActive ? "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20" : "bg-[#e08a3c]/10 text-[#e08a3c] border border-[#e08a3c]/20"
              }`}>
                {profile.isDeleted ? t("common.status.archived") : profile.isActive ? t("common.status.active") : t("companyProfiles.status.inactive")}
              </span>
            </div>
          </div>
        </div>

        <Section title={t("companyProfiles.form.section.basic")}>
          <Row label={t("companyProfiles.form.taxId")} value={profile.taxId} />
          <Row label={t("companyProfiles.form.branchName")} value={profile.branchName} />
          <Row label={t("companyProfiles.form.branchCode")} value={profile.branchCode} />
        </Section>

        <Section title={t("companyProfiles.form.section.contact")}>
          <Row label={t("companyProfiles.form.addressTh")} value={profile.addressTh} />
          <Row label={t("companyProfiles.form.addressEn")} value={profile.addressEn} />
          <Row label={t("companyProfiles.form.phone")} value={profile.phone} />
          <Row label={t("companyProfiles.form.fax")} value={profile.fax} />
          <Row label={t("companyProfiles.form.email")} value={profile.email} />
          <Row label={t("companyProfiles.form.website")} value={profile.website} />
        </Section>

        <Section title={t("companyProfiles.form.section.document")}>
          <Row label={t("companyProfiles.form.quotationPrefix")} value={profile.quotationPrefix} />
          <Row label={t("companyProfiles.form.quotationNumberFormat")} value={profile.quotationNumberFormat} />
          <Row label={t("companyProfiles.form.quotationTerms")} value={<span className="whitespace-pre-line">{profile.quotationTerms}</span>} />
          <Row label={t("companyProfiles.form.quotationFooter")} value={<span className="whitespace-pre-line">{profile.quotationFooter}</span>} />
          <Row label={t("companyProfiles.form.signatureLabel")} value={profile.signatureLabel} />
        </Section>

        <Section title={t("companyProfiles.form.section.bank")}>
          {profile.bankAccounts.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{t("companyProfiles.form.bankEmpty")}</p>
          ) : (
            <div className="space-y-3">
              {profile.bankAccounts.map((acc) => (
                <div key={acc.id} className="border border-border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">{acc.bankName || "—"}</p>
                    {acc.isDefault && <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20">{t("companyProfiles.form.bankDefault")}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{acc.accountName} · <span className="font-mono">{acc.accountNumber}</span> · {acc.branch}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title={t("companyProfiles.form.section.branding")}>
          <div className="grid sm:grid-cols-2 gap-4 pt-1">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">{t("companyProfiles.form.logoLabel")}</p>
              <div className="w-full h-20 flex items-center justify-center bg-secondary border border-border rounded-lg overflow-hidden">
                {profile.logoDataUrl ? <img src={profile.logoDataUrl} alt={`${t("companyProfiles.form.logoLabel")} — ${profile.companyNameTh}`} className="w-full h-full object-contain" /> : <p className="text-xs text-muted-foreground">{t("companyProfiles.detail.noLogo")}</p>}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">{t("companyProfiles.form.stampLabel")}</p>
              <div className="w-full h-20 flex items-center justify-center bg-secondary border border-border rounded-lg overflow-hidden">
                {profile.stampDataUrl ? <img src={profile.stampDataUrl} alt={`${t("companyProfiles.form.stampLabel")} — ${profile.companyNameTh}`} className="w-full h-full object-contain" /> : <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Stamp size={12} /> {t("companyProfiles.detail.noStamp")}</p>}
              </div>
            </div>
          </div>
        </Section>

        <Section title={t("companyProfiles.form.section.settings")}>
          <Row label={t("companyProfiles.detail.createdAt")} value={fmtDateTime(profile.createdAt)} />
          <Row label={t("companyProfiles.detail.createdBy")} value={userName(profile.createdBy)} />
          <Row label={t("companyProfiles.detail.updatedAt")} value={fmtDateTime(profile.updatedAt)} />
          <Row label={t("companyProfiles.detail.updatedBy")} value={userName(profile.updatedBy)} />
        </Section>
      </div>
    </div>
  );
}
