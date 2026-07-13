import { Boxes, ShieldCheck, TrendingUp } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { useI18n, type TranslationKey } from "../lib/i18n";

const features: { icon: typeof Boxes; key: TranslationKey }[] = [
  { icon: Boxes, key: "auth.brand.feature1" },
  { icon: TrendingUp, key: "auth.brand.feature2" },
  { icon: ShieldCheck, key: "auth.brand.feature3" },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex bg-background font-sans text-foreground">
      {/* Branding panel */}
      <div className="hidden lg:flex lg:w-[42%] bg-[#0b1d3a] flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #c9a84c 0%, transparent 45%), radial-gradient(circle at 80% 70%, #c9a84c 0%, transparent 40%)" }} />
        <div className="relative">
          <BrandMark size={40} variant="full" theme="dark" />
        </div>

        <div className="relative">
          <h1 className="text-white text-3xl font-semibold leading-snug mb-4" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
            {t("auth.brand.headline1")}<br />{t("auth.brand.headline2")}
          </h1>
          <p className="text-[#a8bed8] text-sm leading-relaxed mb-8 max-w-sm">
            {t("auth.brand.description")}
          </p>
          <div className="space-y-3.5">
            {features.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#c9a84c]/15 border border-[#c9a84c]/25 flex items-center justify-center flex-shrink-0">
                  <f.icon size={15} className="text-[#c9a84c]" />
                </div>
                <span className="text-[#e8edf5] text-sm">{t(f.key)}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[#5a7299] text-xs font-mono">{t("auth.brand.copyright")}</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand mark */}
          <div className="flex lg:hidden mb-8 justify-center">
            <BrandMark size={36} variant="full" theme="light" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
