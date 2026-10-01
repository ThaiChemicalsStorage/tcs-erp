import type { ReactNode } from "react";
import { Boxes, ShieldCheck, TrendingUp } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { useI18n, type TranslationKey } from "../lib/i18n";

const features: { icon: typeof Boxes; key: TranslationKey }[] = [
  { icon: Boxes, key: "auth.brand.feature1" },
  { icon: TrendingUp, key: "auth.brand.feature2" },
  { icon: ShieldCheck, key: "auth.brand.feature3" },
];

// เลย์เอาต์หน้าล็อกอิน/ตั้งค่าครั้งแรก: แผงแบรนด์สีกรมท่าด้านซ้าย (จอกว้าง) + การ์ดฟอร์มตรงกลางด้านขวา
// Auth pages layout — navy brand panel on the left (wide screens), the page's own card centred on the right.
// width "wide" = 540px (SetupWizard board), default 440px (SignIn boards).
export function AuthLayout({ children, width = "default" }: { children: ReactNode; width?: "default" | "wide" }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex bg-background font-sans text-foreground">
      <aside className="hidden lg:flex lg:w-[460px] xl:w-[560px] flex-shrink-0 bg-[#0b1d3a] text-white flex-col justify-between px-10 xl:px-14 py-12 relative overflow-hidden">
        <div aria-hidden="true" className="absolute -right-[200px] -bottom-[200px] w-[560px] h-[560px] rounded-full border border-[#c9a84c]/[0.16] pointer-events-none" />
        <div aria-hidden="true" className="absolute -right-[110px] -bottom-[110px] w-[380px] h-[380px] rounded-full border border-[#c9a84c]/[0.12] pointer-events-none" />

        <div className="relative">
          <BrandMark size={44} variant="full" appearance="sidebar" />
        </div>

        <div className="relative flex flex-col gap-5">
          <span aria-hidden="true" className="w-10 h-[3px] rounded-full bg-[#c9a84c]" />
          <p className="text-[34px] leading-[1.35] font-bold">
            <span className="block">{t("auth.brand.headline1")}</span>
            <span className="block">{t("auth.brand.headline2")}</span>
          </p>
          <p className="text-[15px] leading-relaxed text-[#c5d3e8] max-w-[400px]">{t("auth.brand.description")}</p>
          <ul className="mt-2 flex flex-col gap-3.5">
            {features.map((f) => (
              <li key={f.key} className="flex items-center gap-3 text-sm text-[#e8edf5]">
                <span className="w-9 h-9 rounded-lg bg-[#c9a84c]/[0.14] border border-[#c9a84c]/30 text-[#e3c56f] flex items-center justify-center flex-shrink-0">
                  <f.icon size={18} aria-hidden="true" />
                </span>
                {t(f.key)}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-[#8fa6c8]">{t("auth.brand.copyright")}</p>
      </aside>

      <main className="flex-1 min-w-0 flex items-center justify-center px-4 py-8 sm:p-10">
        <div className={`w-full ${width === "wide" ? "max-w-[540px]" : "max-w-[440px]"}`}>
          <div className="flex lg:hidden mb-8 justify-center">
            <BrandMark size={36} variant="full" theme="light" appearance="sidebar" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

/** การ์ดขาวของหน้าล็อกอิน (บอร์ด SignIn*) — ระยะในตามบอร์ด จอแคบลดลงเหลือ 24px */
export function AuthCard({ children, className = "", role }: { children: ReactNode; className?: string; role?: "status" }) {
  return (
    <section role={role} className={`bg-white border border-border rounded-xl shadow-[0_1px_2px_rgba(11,29,58,0.04)] flex flex-col ${className}`}>
      {children}
    </section>
  );
}
