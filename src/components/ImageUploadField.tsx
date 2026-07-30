import { useId, useRef, useState } from "react";
import { Upload, X, AlertTriangle, type LucideIcon } from "lucide-react";
import { useI18n } from "../lib/i18n";

const MAX_IMAGE_BYTES = 1_000_000;
const labelCls = "text-xs text-muted-foreground block mb-1.5";

/**
 * Shared logo/stamp/signature/profile-picture upload field — extracted 2026-07-13 (Company
 * Profiles module) from what was previously an `ImageUploadField` inlined only inside
 * `SettingsPage.tsx`. Client-side MIME/size checks only (mirrors, doesn't replace, the
 * authoritative server-side `validateImageDataUrl()` check in `api/_lib/uploadValidation.ts` —
 * this is UX/fail-fast, not the security boundary). Converts to a base64 data URL via
 * `FileReader`, same inline-on-document storage approach every other image field in this app uses
 * (see DATABASE.md's "still base64-in-document" note) — no separate upload endpoint exists yet.
 */
export function ImageUploadField({
  label,
  icon: Icon,
  value,
  onChange,
  aspect = "square",
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (dataUrl: string) => void;
  aspect?: "square" | "wide";
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const inputId = useId();

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("settings.image.onlyImages"));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t("settings.image.tooLarge"));
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.onerror = () => setError(t("settings.image.readError"));
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label htmlFor={inputId} className={labelCls}><span className="flex items-center gap-1"><Icon size={10} /> {label}</span></label>
      <div className="flex items-center gap-3">
        <div className={`flex-shrink-0 flex items-center justify-center bg-secondary border border-border rounded-lg overflow-hidden ${aspect === "square" ? "w-16 h-16" : "w-28 h-16"}`}>
          {value ? (
            <img src={value} alt={label} className="w-full h-full object-contain" />
          ) : (
            <Icon size={18} className="text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
            >
              <Upload size={12} /> {t("common.upload")}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-[#e05252] hover:border-[#e05252]/40 transition-all"
              >
                <X size={12} /> {t("common.remove")}
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{t("settings.image.sizeHint")}</p>
        </div>
        <input ref={inputRef} id={inputId} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {error && <p role="alert" className="text-xs text-[#e05252] mt-1.5 flex items-center gap-1"><AlertTriangle size={11} /> {error}</p>}
    </div>
  );
}
