import { Building2, AlertTriangle, ArrowUpRight } from "lucide-react";
import type { CompanyProfile, IssuerCompanyDisplay } from "../../lib/companyProfiles";
import { useI18n } from "../../lib/i18n";

/**
 * "ออกใบเสนอราคาในนามบริษัท" — lets the user pick which saved Company Profile a quotation is
 * issued under, added 2026-07-13 (Quotation integration pass) so company information is entered
 * once (Company Profiles) and reused, never retyped per quote. Purely presentational — all
 * resolution logic (which profile is selected, what to preview, the Draft-only lock) lives in
 * `QuoteDocument.tsx`, which computes `issuerDisplay` from either the live selection, a saved
 * quote's frozen `issuerCompanySnapshot`, or the legacy single-company fallback.
 */
export function IssuerCompanySelector({
  activeProfiles,
  value,
  onChange,
  disabled,
  lockedMessage,
  issuerDisplay,
  hasIssuerProfile,
  canViewCompanyProfiles,
  onNavigateToCompanyProfiles,
}: {
  activeProfiles: CompanyProfile[];
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  /** Shown next to the selector when it's disabled specifically because the quote has left Draft — distinct from the general `disabled` (no edit permission at all) case. */
  lockedMessage?: string;
  /** What to render in the preview card — may resolve to the legacy single-company fallback even
   * when no real Company Profile is selected, so the preview never looks broken. */
  issuerDisplay?: IssuerCompanyDisplay;
  /** Whether `issuerDisplay` actually came from a real Company Profile (live selection or a saved
   * quote's snapshot) — false when it's just the legacy fallback, or nothing at all. Drives the
   * "no issuer company selected" warning independently of whether the preview has something to
   * show, since the warning is about adopting Company Profiles, not about the screen looking empty. */
  hasIssuerProfile: boolean;
  canViewCompanyProfiles: boolean;
  onNavigateToCompanyProfiles?: () => void;
}) {
  const { t } = useI18n();

  if (activeProfiles.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-5 print:hidden">
        <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
          <Building2 size={13} /> {t("quotation.issuer.title")}
        </p>
        <div className="flex flex-col items-center text-center gap-2 py-4">
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
            <Building2 size={18} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">{t("quotation.issuer.emptyTitle")}</p>
          <p className="text-xs text-muted-foreground max-w-xs">{t("quotation.issuer.emptySub")}</p>
          {canViewCompanyProfiles && onNavigateToCompanyProfiles && (
            <button
              onClick={onNavigateToCompanyProfiles}
              className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
            >
              {t("quotation.issuer.goToCompanyProfiles")} <ArrowUpRight size={12} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5 print:hidden">
      <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
        <Building2 size={13} /> {t("quotation.issuer.title")}
      </p>

      <div className="max-w-sm">
        <label className="text-xs text-muted-foreground block mb-1">{t("quotation.issuer.selectLabel")}</label>
        <select
          disabled={disabled}
          title={disabled ? lockedMessage : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none disabled:opacity-60"
        >
          <option value="" disabled>{t("quotation.issuer.selectPrompt")}</option>
          {activeProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {(p.displayName || p.companyNameTh)}{p.isDefault ? ` — ${t("companyProfiles.badge.default")}` : ""}
            </option>
          ))}
        </select>
        {disabled && lockedMessage && <p className="text-[10px] text-muted-foreground mt-1">{lockedMessage}</p>}
      </div>

      {issuerDisplay && (
        <div className="mt-4 pt-4 border-t border-border flex items-start gap-3">
          <div className="w-14 h-14 flex-shrink-0 flex items-center justify-center bg-secondary border border-border rounded-lg overflow-hidden">
            {issuerDisplay.logoDataUrl ? (
              <img src={issuerDisplay.logoDataUrl} alt={issuerDisplay.name} className="w-full h-full object-contain" />
            ) : (
              <Building2 size={18} className="text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 text-xs text-muted-foreground leading-relaxed">
            <p className="text-sm font-semibold text-foreground">{issuerDisplay.name}</p>
            {issuerDisplay.nameEn && <p>{issuerDisplay.nameEn}</p>}
            {issuerDisplay.address && <p>{issuerDisplay.address}</p>}
            {(issuerDisplay.phone || issuerDisplay.fax || issuerDisplay.email) && (
              <p>
                {issuerDisplay.phone && <>{t("quotation.field.contactPhone")}: {issuerDisplay.phone}</>}
                {issuerDisplay.phone && issuerDisplay.fax && "  ·  "}
                {issuerDisplay.fax && <>{t("companyProfiles.form.fax")}: {issuerDisplay.fax}</>}
                {(issuerDisplay.phone || issuerDisplay.fax) && issuerDisplay.email && "  ·  "}
                {issuerDisplay.email && <>{t("settings.company.emailLabel")}: {issuerDisplay.email}</>}
              </p>
            )}
            {issuerDisplay.website && <p>{issuerDisplay.website}</p>}
            {issuerDisplay.taxId && <p className="font-mono">{t("companyProfiles.form.taxId")}: {issuerDisplay.taxId}</p>}
            {(issuerDisplay.branchName || issuerDisplay.branchCode) && (
              <p>
                {issuerDisplay.branchName}
                {issuerDisplay.branchName && issuerDisplay.branchCode && " · "}
                {issuerDisplay.branchCode}
              </p>
            )}
          </div>
        </div>
      )}
      {!hasIssuerProfile && (
        <div className={`flex items-center gap-2 text-xs text-[#e08a3c] ${issuerDisplay ? "mt-3" : "mt-4 pt-4 border-t border-border"}`}>
          <AlertTriangle size={13} className="flex-shrink-0" />
          {t("quotation.issuer.warningNoIssuer")}
        </div>
      )}
    </div>
  );
}
